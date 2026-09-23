/**
 * Audio file custom editor.
 *
 * Opening a `.wav` from the explorer should show the waveform, metadata and
 * classification — and be playable — without the user first importing anything.
 * So on open we:
 *
 *   1. look the file up in the catalogue by path,
 *   2. if it is unknown, register its **top-level folder** as a library and
 *      index that folder (which is what the user would have done manually), then
 *      re-resolve the id,
 *   3. host the workbench UI in the editor tab with `?play=<id>`.
 *
 * Note this is a binary custom editor, not a text one: an audio file has no
 * meaningful text document to share, so it uses the (non-text) provider API.
 */

import * as vscode from 'vscode';

import type { EngineHost } from './engineHost.ts';
import { baseName, topLevelFolder } from './paths.ts';
import { WebviewSession } from './webviewSession.ts';

export const AUDIO_EDITOR_VIEW_TYPE = 'soundDesk.audio';

/** Extensions we will attempt to open in the audio editor. */
export const AUDIO_GLOB = '{wav,bwf,wave,aif,aiff,aifc,flac,mp3,ogg,oga,opus,m4a,mp4,caf,w64,rf64}';

export class AudioEditorProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(
    private readonly host: EngineHost,
    private readonly extensionUri: vscode.Uri,
    private readonly log: (message: string) => void,
  ) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    // Read-only view: SoundDesk never edits the bytes of your audio here.
    return { uri, dispose: () => undefined };
  }

  async resolveCustomEditor(document: vscode.CustomDocument, panel: vscode.WebviewPanel): Promise<void> {
    panel.title = document.uri.path.split('/').pop() ?? 'SoundDesk 音频';

    const engine = await this.host.start();
    const filePath = document.uri.fsPath;

    const assetId = await this.resolveAssetId(engine, filePath);
    const session = new WebviewSession({
      host: this.host,
      extensionUri: this.extensionUri,
      title: panel.title,
      ...(assetId !== null ? { deepLink: { play: assetId } } : {}),
    });

    panel.onDidDispose(() => session.dispose());
    await session.attach(panel.webview);
  }

  /**
   * Find the asset id for a path, indexing its folder if this is the first time
   * we have seen it. Returns null when the file cannot be indexed (unsupported
   * or unreadable), in which case the UI opens without a selection.
   */
  private async resolveAssetId(
    engine: Awaited<ReturnType<EngineHost['start']>>,
    filePath: string,
  ): Promise<number | null> {
    const existing = engine.app.catalog.getAssetByPath(filePath);
    if (existing !== null) return existing;

    const libraryRoot = topLevelFolder(filePath);
    if (!libraryRoot) return null;

    this.log(`indexing ${libraryRoot} because ${filePath} is not in the catalogue`);
    try {
      const libraryId = engine.app.catalog.addLibrary(baseName(libraryRoot), libraryRoot, 'local');
      await engine.app.indexer.runFastPass(libraryId, libraryRoot);
    } catch (err) {
      this.log(`indexing failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
    return engine.app.catalog.getAssetByPath(filePath);
  }
}

export function isAudioUri(uri: vscode.Uri): boolean {
  const match = /\.([A-Za-z0-9]+)$/.exec(uri.fsPath);
  if (!match) return false;
  return AUDIO_GLOB.replace(/[{}]/g, '')
    .split(',')
    .includes(match[1]!.toLowerCase());
}
