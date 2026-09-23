/**
 * Extension entry point.
 *
 * What this file is responsible for:
 *  - configuring the engine host from settings,
 *  - registering the workbench panel, the audio custom editor and the commands,
 *  - tying engine lifetime to the extension's, so a window reload does not leave
 *    a stray server or a locked SQLite file behind.
 */

import { homedir } from 'node:os';
import path from 'node:path';

import * as vscode from 'vscode';

import { AudioEditorProvider, AUDIO_EDITOR_VIEW_TYPE } from './audioEditor.ts';
import { EngineHost, type EngineHandle } from './engineHost.ts';
import { baseName, topLevelFolder } from './paths.ts';
import { WorkbenchPanel } from './workbenchPanel.ts';

const CONFIG_SECTION = 'soundDesk';

let host: EngineHost | null = null;
let output: vscode.OutputChannel | null = null;

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('SoundDesk');
  const log = (message: string): void => output?.appendLine(`[${new Date().toISOString()}] ${message}`);

  host = new EngineHost({
    dataDir: resolveDataDir(),
    // The bundled UI lives in the extension's media/ folder.
    webRoot: null,
    loadModel: config().get<boolean>('loadModel', false),
    log,
  });

  const extensionUri = context.extensionUri;

  context.subscriptions.push(
    output,

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

    vscode.commands.registerCommand('soundDesk.open', () => {
      WorkbenchPanel.open(host!, extensionUri);
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
        const message = err instanceof Error ? err.message : String(err);
        log(`auto-start failed: ${message}`);
        void vscode.window.showErrorMessage(`SoundDesk 引擎启动失败：${message}`);
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

/** Index a file's top-level folder when it is not yet catalogued. */
async function ensureIndexed(
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
