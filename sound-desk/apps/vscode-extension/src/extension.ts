/**
 * Extension entry point.
 *
 * What this file is responsible for:
 *  - configuring the engine host from settings,
 *  - registering the workbench panel, the audio custom editor and the commands,
 *  - owning the SoundDesk activity-bar view, its status bar item and the
 *    explorer context-menu commands that hand a real file to the workbench,
 *  - tying engine lifetime to the extension's, so a window reload does not leave
 *    a stray server or a locked SQLite file behind.
 */

import { homedir } from 'node:os';
import path from 'node:path';

import { Playlists, addToPlaylist } from '@sounddesk/engine';
import * as vscode from 'vscode';

import { AudioEditorProvider, AUDIO_EDITOR_VIEW_TYPE } from './audioEditor.ts';
import { EngineHost, type EngineHandle } from './engineHost.ts';
import { LibraryTreeProvider, collectSnapshot, type LibraryNode } from './libraryTree.ts';
import {
  emptySnapshot,
  formatStatusText,
  formatStatusTooltip,
  type EngineStatusState,
  type LibrarySnapshot,
} from './libraryTreeModel.ts';
import { baseName, topLevelFolder } from './paths.ts';
import { WorkbenchPanel } from './workbenchPanel.ts';

const CONFIG_SECTION = 'soundDesk';

/** View id from `contributes.views.soundDesk`. */
const LIBRARY_VIEW_ID = 'soundDesk.library';

/** Priority inside the left-hand status bar group — our own slot, next to git. */
const STATUS_BAR_PRIORITY = 100;

/** Sentinel for "create a new playlist" in the add-to-playlist quick pick. */
const NEW_PLAYLIST_ID = -1;

/**
 * Minimum gap between sidebar rebuilds while an index job runs.
 *
 * The indexer emits progress once per file; the tree is not cheap to rebuild, so
 * anything faster than this is wasted work. 750 ms still reads as live.
 */
const TREE_REFRESH_MS = 750;

let host: EngineHost | null = null;
let output: vscode.OutputChannel | null = null;

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('SoundDesk');
  const log = (message: string): void => output?.appendLine(`[${new Date().toISOString()}] ${message}`);

  const extensionUri = context.extensionUri;

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, STATUS_BAR_PRIORITY);
  statusBar.command = 'soundDesk.open';
  statusBar.text = formatStatusText(null, 'starting');
  statusBar.tooltip = new vscode.MarkdownString(formatStatusTooltip(null, 'starting'));

  /** Why the last start attempt failed; cleared as soon as one succeeds. */
  let engineError: string | null = null;
  let jobListenerBound = false;
  /** throttle for tree rebuilds during a scan; see bindJobEvents */
  let lastTreeRefresh = 0;

  /**
   * Recompute the status bar from the engine's *actual* state.
   *
   * Deriving the state instead of tracking it means the item cannot drift out of
   * sync after a restart, a failed start or a finished index job.
   */
  const refreshStatusBar = async (): Promise<void> => {
    const handle = host?.current ?? null;
    const state: EngineStatusState = handle ? 'ready' : engineError !== null ? 'error' : 'starting';

    let snapshot: LibrarySnapshot | null = null;
    if (handle) {
      try {
        snapshot = await collectSnapshot(handle);
      } catch (err) {
        snapshot = emptySnapshot({ engineError: message(err) });
      }
    } else if (engineError !== null) {
      snapshot = emptySnapshot({ engineError });
    }

    // Nothing worth showing before a start attempt settles: reporting "0 条素材"
    // while the engine is still booting would just be wrong.
    if (state === 'starting' || !config().get<boolean>('showStatusBar', true)) {
      statusBar.hide();
      return;
    }

    statusBar.text = formatStatusText(snapshot, state);
    statusBar.tooltip = new vscode.MarkdownString(formatStatusTooltip(snapshot, state));
    statusBar.show();
  };

  /**
   * Follow index jobs so the status bar and the sidebar show progress.
   *
   * The status bar is updated on every event: its text is the only place the user
   * can see that a long index is moving, and `collectSnapshot` reads a few counters
   * rather than scanning the catalogue, so this is cheap.
   *
   * The tree is refreshed at most once every `TREE_REFRESH_MS`. It is a far more
   * expensive rebuild, and the indexer emits once per file, so refreshing it per
   * event would be a denial of service against our own extension host.
   */
  const bindJobEvents = (engine: EngineHandle): void => {
    if (jobListenerBound) return;
    jobListenerBound = true;
    engine.app.indexer.on('job', () => {
      void refreshStatusBar();

      const now = Date.now();
      if (now - lastTreeRefresh < TREE_REFRESH_MS) return;
      lastTreeRefresh = now;
      libraryTree.refresh();
    });
  };

  /** Start the engine for a user-invoked command, reporting a failure once. */
  const startEngine = async (): Promise<EngineHandle | null> => {
    try {
      return await host!.start();
    } catch (err) {
      const reason = message(err);
      log(`engine start failed: ${reason}`);
      void vscode.window.showErrorMessage(`SoundDesk 引擎启动失败：${reason}`);
      return null;
    }
  };

  host = new EngineHost({
    dataDir: resolveDataDir(),
    // The bundled UI lives in the extension's media/ folder.
    webRoot: null,
    loadModel: config().get<boolean>('loadModel', false),
    log,
    onStateChange: (state) => {
      if (state.ok) {
        engineError = null;
        const handle = host?.current ?? null;
        if (handle) bindJobEvents(handle);
      } else {
        engineError = state.error ?? '未知错误';
      }
      void refreshStatusBar();
    },
  });

  const libraryTree = new LibraryTreeProvider(host, log);

  context.subscriptions.push(
    output,
    statusBar,
    libraryTree,
    vscode.window.registerTreeDataProvider(LIBRARY_VIEW_ID, libraryTree),

    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${CONFIG_SECTION}.showStatusBar`)) void refreshStatusBar();
    }),

    vscode.window.registerCustomEditorProvider(
      AUDIO_EDITOR_VIEW_TYPE,
      new AudioEditorProvider(host, extensionUri, log),
      {
        // Keep the DOM (and therefore playback position and waveform) alive when
        // the user switches to another tab and back.
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),

    vscode.commands.registerCommand('soundDesk.open', (arg?: unknown) => {
      // The explorer and the editor title call this with a Uri; the 最近搜索
      // nodes call it with a query string. Only a string is a deep link, so a
      // resource argument can never leak into the webview's query.
      const deepLink = typeof arg === 'string' && arg.length > 0 ? { q: arg } : undefined;
      WorkbenchPanel.open(host!, extensionUri, deepLink);
    }),

    vscode.commands.registerCommand('soundDesk.searchSelection', () => {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.document.getText(editor.selection).trim();
      if (!selection) {
        void vscode.window.showInformationMessage('先选中一段文字，再用它去搜声音。');
        return;
      }
      // One-line queries are the common case; collapse newlines so a multi-line
      // selection still produces a usable query.
      const query = selection.replace(/\s*\n+\s*/g, ' ').slice(0, 200);
      WorkbenchPanel.open(host!, extensionUri, { q: query });
    }),

    vscode.commands.registerCommand('soundDesk.indexFolder', async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: '作为素材库索引',
      });
      const folder = picked?.[0];
      if (!folder) return;

      const engine = await host!.start();
      const name = baseName(folder.fsPath);
      const libraryId = engine.app.catalog.addLibrary(name, folder.fsPath, 'local');
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `SoundDesk 正在索引 ${name}`, cancellable: true },
        async (progress, token) => {
          // The indexer reports progress through events; surface it on the
          // notification so a large folder does not look frozen.
          const onJob = (job: { kind: string; done: number; total: number }): void => {
            if (job.kind !== 'scan' || job.total === 0) return;
            progress.report({ message: `${job.done}/${job.total}`, increment: (1 / Math.max(1, job.total)) * 100 });
          };
          engine.app.indexer.on('job', onJob);
          token.onCancellationRequested(() => {
            for (const job of engine.app.indexer.listJobs()) {
              if (job.state === 'running') engine.app.indexer.cancel(job.id);
            }
          });
          try {
            const job = await engine.app.indexer.runFastPass(libraryId, folder.fsPath);
            void vscode.window.showInformationMessage(
              `SoundDesk 已索引 ${job.done} 个文件${job.failed > 0 ? `（${job.failed} 个失败）` : ''}。`,
            );
          } finally {
            engine.app.indexer.off('job', onJob);
          }
        },
      );
    }),

    vscode.commands.registerCommand('soundDesk.playFile', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) return;
      await vscode.commands.executeCommand('vscode.openWith', target, AUDIO_EDITOR_VIEW_TYPE);
    }),

    vscode.commands.registerCommand('soundDesk.findSimilar', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) return;
      const engine = await host!.start();
      const assetId = await ensureIndexed(engine, target.fsPath, log);
      if (assetId === null) {
        void vscode.window.showWarningMessage('这个文件还没能进入索引，暂时无法以声搜声。');
        return;
      }
      // The workbench has no "similar" deep link yet, so search by the asset and
      // let the user hit 找相似 — honest, and avoids inventing a second code path.
      const asset = engine.app.catalog.getAssetRow(assetId);
      const filename = typeof asset?.filename === 'string' ? asset.filename : '';
      WorkbenchPanel.open(host!, extensionUri, { q: filename });
    }),

    vscode.commands.registerCommand('soundDesk.restartEngine', async () => {
      if (!host) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'SoundDesk 正在重启引擎' },
        () => host!.restart().then(() => undefined),
      );
      void vscode.window.showInformationMessage('SoundDesk 引擎已重启。');
    }),

    vscode.commands.registerCommand('soundDesk.showEngineInfo', async () => {
      if (!host) return;
      const engine = await host.start();
      output?.show(true);
      log(`engine url: ${engine.server.url}`);
      log(`token: ${engine.server.token.slice(0, 8)}…`);
      log(`data dir: ${engine.app.dataDir}`);
      log(`UCS CatIDs: ${engine.app.classifier.size}`);
      log(`embedder: ${engine.app.embedder.id} (ready=${engine.app.embedder.ready})`);
      if (engine.app.embedderError) log(`embedder error: ${engine.app.embedderError}`);
      const stats = engine.app.catalog.stats();
      log(`assets: ${stats.assets}, libraries: ${stats.libraries}, embedded: ${stats.embedded}, peaks: ${stats.peaks}`);
      void vscode.window.showInformationMessage(
        `SoundDesk：${stats.assets} 条素材，语义搜索${engine.app.embedder.ready ? '已启用' : '未启用'}。详见输出面板。`,
      );
    }),

    // -- sidebar + catalogue commands -------------------------------------

    vscode.commands.registerCommand('soundDesk.refreshLibrary', () => {
      libraryTree.refresh();
      void refreshStatusBar();
    }),

    vscode.commands.registerCommand('soundDesk.addToPlaylist', async (uri?: vscode.Uri) => {
      const target = uri ?? activeFileUri();
      if (!target) {
        void vscode.window.showInformationMessage('先在资源管理器里选一个音频文件，再执行这个命令。');
        return;
      }

      const engine = await startEngine();
      if (!engine) return;
      const assetId = await ensureIndexed(engine, target.fsPath, log);
      if (assetId === null) {
        void vscode.window.showWarningMessage('这个文件还没能进入索引，暂时无法加入播放列表。');
        return;
      }

      const playlists = new Playlists(engine.app.catalog);
      const picks: PlaylistPick[] = playlists.list().map((playlist) => ({
        label: playlist.name,
        description: `${playlist.itemCount} 条`,
        playlistId: playlist.id,
      }));
      picks.push({ label: '$(add) 新建播放列表…', playlistId: NEW_PLAYLIST_ID });

      const picked = await vscode.window.showQuickPick(picks, {
        placeHolder: `把「${baseName(target.fsPath)}」加入哪个播放列表？`,
      });
      if (!picked) return;

      let playlistId = picked.playlistId;
      let playlistName = picked.label;
      if (playlistId === NEW_PLAYLIST_ID) {
        const name = await vscode.window.showInputBox({
          prompt: '新播放列表名称',
          placeHolder: '例如：预告片低音',
        });
        if (!name || name.trim().length === 0) return;
        try {
          const created = playlists.create(name);
          playlistId = created.id;
          playlistName = created.name;
        } catch (err) {
          void vscode.window.showErrorMessage(`创建播放列表失败：${message(err)}`);
          return;
        }
      }

      try {
        addToPlaylist(playlists, playlistId, [assetId]);
      } catch (err) {
        void vscode.window.showErrorMessage(`加入播放列表失败：${message(err)}`);
        return;
      }

      // The sidebar renders playlist item counts, so it is stale the moment this
      // succeeds; the engine has no change event for playlists to listen to.
      libraryTree.refresh();
      void vscode.window.showInformationMessage(
        `已把「${baseName(target.fsPath)}」加入「${playlistName}」。`,
      );
    }),

    vscode.commands.registerCommand('soundDesk.setReferenceAudio', async (uri?: vscode.Uri) => {
      const target = uri ?? activeFileUri();
      if (!target) {
        void vscode.window.showInformationMessage('先在资源管理器里选一个音频文件，再执行这个命令。');
        return;
      }

      const engine = await startEngine();
      if (!engine) return;
      const assetId = await ensureIndexed(engine, target.fsPath, log);
      if (assetId === null) {
        void vscode.window.showWarningMessage('这个文件还没能进入索引，暂时无法作为参考音频。');
        return;
      }

      // The web bundle reads exactly two deep-link parameters — `q` and `play`
      // (packages/web/src/App.tsx) — and neither selects the probe reference, so
      // there is nothing to link to yet. Opening the workbench and saying so is
      // honest; inventing a `?reference=` parameter would look like it worked and
      // silently do nothing.
      WorkbenchPanel.open(host!, extensionUri);
      void vscode.window.showInformationMessage(
        `已找到「${baseName(target.fsPath)}」（素材 #${assetId}），但工作台暂不支持由外部命令设为参考音频（没有对应链接参数）；请在工作台里把该文件拖到「参考音频」区域。`,
      );
    }),

    vscode.commands.registerCommand('soundDesk.openPlaylist', async (node?: LibraryNode) => {
      const engine = await startEngine();
      if (!engine) return;
      const playlists = new Playlists(engine.app.catalog);

      let playlistId = typeof node?.playlistId === 'number' ? node.playlistId : null;
      if (playlistId === null) {
        // Invoked from the palette rather than from a sidebar node.
        const picks: PlaylistPick[] = playlists.list().map((playlist) => ({
          label: playlist.name,
          description: `${playlist.itemCount} 条`,
          playlistId: playlist.id,
        }));
        if (picks.length === 0) {
          void vscode.window.showInformationMessage('还没有播放列表。');
          return;
        }
        const picked = await vscode.window.showQuickPick(picks, { placeHolder: '打开哪个播放列表？' });
        if (!picked) return;
        playlistId = picked.playlistId;
      }

      const playlist = playlists.get(playlistId);
      const label = playlist ? `「${playlist.name}」（${playlist.itemCount} 条）` : `#${playlistId}`;
      WorkbenchPanel.open(host!, extensionUri);
      // Same limitation as 设为参考音频: the UI's deep links are `q` and `play`,
      // so a playlist cannot be preselected from outside. A transient status bar
      // note explains where to look instead of silently opening something else.
      void vscode.window.setStatusBarMessage(
        `SoundDesk：已打开工作台；播放列表 ${label} 暂不支持直接链接，请在工作台左侧查看。`,
        6000,
      );
    }),

    vscode.commands.registerCommand('soundDesk.copyAssetPath', async (uri?: vscode.Uri) => {
      const target = uri ?? activeFileUri();
      if (!target) {
        void vscode.window.showInformationMessage('先在资源管理器里选一个音频文件，再执行这个命令。');
        return;
      }
      await vscode.env.clipboard.writeText(target.fsPath);
      void vscode.window.showInformationMessage(`已复制路径：${target.fsPath}`);
    }),

    vscode.commands.registerCommand('soundDesk.revealAsset', async (uri?: vscode.Uri) => {
      const target = uri ?? activeFileUri();
      if (!target) {
        void vscode.window.showInformationMessage('先在资源管理器里选一个音频文件，再执行这个命令。');
        return;
      }
      await vscode.commands.executeCommand('revealFileInOS', target);
    }),
  );

  // Auto-start in the background when configured; failures are reported once and
  // the commands can retry.
  if (config().get<boolean>('autoStartEngine', true)) {
    void host
      .start()
      .then((engine) => {
        log(`auto-started engine on port ${engine.server.port}`);
        if (config().get<boolean>('openInBrowser', false)) {
          void vscode.env.openExternal(vscode.Uri.parse(`${engine.server.url}/?token=${engine.server.token}`));
        }
      })
      .catch((err: unknown) => {
        const text = message(err);
        log(`auto-start failed: ${text}`);
        void vscode.window.showErrorMessage(`SoundDesk 引擎启动失败：${text}`);
      });
  }
}

export async function deactivate(): Promise<void> {
  await host?.stop();
  host = null;
  output = null;
}

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

function resolveDataDir(): string {
  const configured = config().get<string>('dataDir', '').trim();
  if (configured) return configured;
  return path.join(homedir(), '.sounddesk');
}

/**
 * The file the user is currently looking at.
 *
 * `activeTextEditor` is undefined for a file opened in the audio custom editor,
 * and these commands are also reachable from the palette, so the active tab's
 * input is checked as a fallback — otherwise they would do nothing there.
 */
function activeFileUri(): vscode.Uri | undefined {
  const fromEditor = vscode.window.activeTextEditor?.document.uri;
  if (fromEditor) return fromEditor;

  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputText) return input.uri;
  if (input instanceof vscode.TabInputCustom) {
    // At runtime `TabInputWebview` also matches this instance check and carries
    // no uri, so the property is verified rather than assumed.
    const uri = (input as { uri?: vscode.Uri }).uri;
    if (uri) return uri;
  }
  return undefined;
}

/** Index a file's top-level folder when it is not yet catalogued. */
export async function ensureIndexed(
  engine: EngineHandle,
  filePath: string,
  log: (message: string) => void,
): Promise<number | null> {
  const existing = engine.app.catalog.getAssetByPath(filePath);
  if (existing !== null) return existing;

  const libraryRoot = topLevelFolder(filePath);
  if (!libraryRoot) return null;

  try {
    log(`indexing ${libraryRoot} to resolve ${filePath}`);
    const libraryId = engine.app.catalog.addLibrary(baseName(libraryRoot), libraryRoot, 'local');
    await engine.app.indexer.runFastPass(libraryId, libraryRoot);
    return engine.app.catalog.getAssetByPath(filePath);
  } catch (err) {
    log(`indexing failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Quick pick entry for a playlist, carrying the id the action needs. */
interface PlaylistPick extends vscode.QuickPickItem {
  playlistId: number;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
