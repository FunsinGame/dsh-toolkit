/**
 * Dragging a sound out of the workbench — plan P2-2, hosted in VSCode rather than
 * a Tauri shell.
 *
 * What a webview can actually do here is limited, and the limits are worth stating
 * because they shaped this module:
 *
 *  - A page **cannot** hand a real file to the OS file manager. Chromium removed
 *    `file://` from `DownloadURL` years ago, so a drop target that only understands
 *    files gets nothing. What does work is giving the drag a URL the target can
 *    fetch — which is exactly what a DAW's "import from URL", a browser download,
 *    or a text drop wants.
 *  - VSCode additionally strips drag data on some platforms, and its webview has no
 *    access to the filesystem. So the extension host exposes an explicit
 *    "reveal in OS / copy out" command instead of relying on drag alone.
 *
 * So this module sets every flavour that can plausibly work, and the UI pairs the
 * drag with a button for the cases where dragging cannot work at all. The drag is a
 * convenience; the buttons are the guarantee.
 */

export interface DragPayload {
  /** asset id, used as the fallback plain-text value */
  assetId: number;
  filename: string;
  /** MIME type of the file, for the `DownloadURL` flavour */
  mimeType: string;
  /** authenticated whole-file URL (carries the original name via Content-Disposition) */
  downloadUrl: string;
  /** local filesystem path, when the host knows it (extension host only) */
  filePath?: string | null;
}

/**
 * The MIME types set by {@link buildDragData}, in the order they are set.
 *
 * Exported so tests and the drop-test page can assert the same list, rather than
 * each keeping its own copy that can drift.
 */
export const DRAG_FLAVOURS = ['text/uri-list', 'text/plain', 'DownloadURL'] as const;

/**
 * Populate a `DataTransfer` for dragging a sound out.
 *
 * Set order matters in practice: `text/uri-list` first because that is what file
 * managers and DCC tools read for a URL drop, then `DownloadURL` for the
 * browsers that still honour Chromium's file flavour.
 */
export function buildDragData(dataTransfer: DataTransfer, payload: DragPayload): string[] {
  const set: string[] = [];

  dataTransfer.setData('text/uri-list', payload.downloadUrl);
  dataTransfer.setData('text/plain', payload.filePath ?? payload.downloadUrl);
  set.push('text/uri-list', 'text/plain');

  // Chromium's "drag this out as a downloaded file" flavour.
  try {
    dataTransfer.setData('DownloadURL', `${payload.filename}:${payload.downloadUrl}:${payload.mimeType}`);
    set.push('DownloadURL');
  } catch {
    // Some engines refuse unknown flavours. Not fatal: the URL is still set.
  }

  // A drag must be a copy, never a move — the library file is the source of truth.
  dataTransfer.effectAllowed = 'copy';
  return set;
}

/**
 * What the drag will be able to do in this host, so the UI can explain itself
 * instead of offering a gesture that silently does nothing.
 */
export interface DragCapability {
  /** a drag can carry a fetchable URL, so a drop target can import it */
  canDragUrl: boolean;
  /** the host can reveal/copy the real file, which is what a DAW import needs */
  canRevealFile: boolean;
  /** the host can open the file in an editor */
  canOpenInEditor: boolean;
}

export function describeDragCapability(host: 'browser' | 'vscode'): DragCapability {
  // In a browser the engine URL is reachable and a download lands in the download
  // folder; nothing can reveal a path because the page only ever sees asset ids.
  if (host === 'browser') {
    return { canDragUrl: true, canRevealFile: false, canOpenInEditor: false };
  }
  // In the webview the engine is still an HTTP server, so the URL drag works too,
  // and the extension host can additionally act on the real path.
  return { canDragUrl: true, canRevealFile: true, canOpenInEditor: true };
}

/** A one-line hint for the UI, so the affordance is honest about its limits. */
export function dragHint(capability: DragCapability): string {
  if (capability.canRevealFile) {
    return '拖到桌面 / DAW 会把素材作为 URL 拖出；需要真实文件时用「在系统中显示」或「导出到…」';
  }
  return '拖出会带上素材的可下载地址；浏览器不能把真实文件交给文件管理器，需要文件请点「下载」';
}
