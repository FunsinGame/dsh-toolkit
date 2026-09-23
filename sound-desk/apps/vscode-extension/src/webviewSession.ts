/**
 * Shared webview plumbing for both hosts (the panel command and the audio
 * custom editor).
 *
 * Responsibilities:
 *  - build the HTML with the right CSP and bootstrap,
 *  - answer `engine.request` envelopes from the UI against the in-process
 *    engine, correlated by `id`,
 *  - forward indexer job progress to the UI so the progress indicator moves,
 *  - clean up listeners when the webview goes away.
 */

import * as vscode from 'vscode';

import type { App } from '@sounddesk/engine';

import type { EngineHost } from './engineHost.ts';
import { createHandler } from './engineBridge.ts';
import type { EngineBootstrap, WebviewToHost } from './protocol.ts';
import { buildWebviewHtml, localResourceRoots } from './webviewHtml.ts';

export interface SessionOptions {
  host: EngineHost;
  extensionUri: vscode.Uri;
  /** extra query for the UI, e.g. `{ play: 12 }` */
  deepLink?: Record<string, string | number>;
  title?: string;
  /** called with the engine app once it is up, for host-specific wiring */
  onReady?: (app: App, bootstrap: EngineBootstrap) => void;
}

/** One webview's worth of state: the HTML and the message bridge. */
export class WebviewSession implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private bootstrap: EngineBootstrap | null = null;
  private handler: ((method: string, params: unknown) => Promise<unknown>) | null = null;

  constructor(private readonly options: SessionOptions) {}

  /** Wire up a webview: resolve the engine, set the HTML, and bridge messages. */
  async attach(webview: vscode.Webview): Promise<void> {
    webview.options = {
      enableScripts: true,
      // The UI is served from `media/`; nothing else may be loaded.
      localResourceRoots: localResourceRoots(this.options.extensionUri),
    };

    // Render an immediate shell so the webview is not blank while the engine
    // boots. It is replaced as soon as the engine is ready.
    webview.html = shellHtml('正在启动本地引擎…');

    let engine;
    try {
      engine = await this.options.host.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      webview.html = shellHtml(`引擎启动失败：${message}`, true);
      return;
    }

    this.bootstrap = engine.bootstrap;
    this.handler = createHandler(engine.app);
    this.options.onReady?.(engine.app, engine.bootstrap);

    webview.html = buildWebviewHtml({
      webview,
      extensionUri: this.options.extensionUri,
      bootstrap: engine.bootstrap,
      ...(this.options.deepLink ? { deepLink: this.options.deepLink } : {}),
      ...(this.options.title ? { title: this.options.title } : {}),
    });

    // Job progress is pushed rather than polled, so the UI bar animates.
    const onJob = (job: unknown): void => {
      void webview.postMessage({ type: 'engine.event', job });
    };
    engine.app.indexer.on('job', onJob);
    this.disposables.push({ dispose: () => engine.app.indexer.off('job', onJob) });

    this.disposables.push(
      webview.onDidReceiveMessage((raw: unknown) => {
        void this.onMessage(webview, raw);
      }),
    );

    // Re-announce readiness, in case the UI's listener attached late.
    void webview.postMessage({ type: 'engine.ready', bootstrap: engine.bootstrap });
  }

  private async onMessage(webview: vscode.Webview, raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object') return;
    const message = raw as WebviewToHost;

    switch (message.type) {
      case 'webview.ready': {
        if (this.bootstrap) void webview.postMessage({ type: 'engine.ready', bootstrap: this.bootstrap });
        return;
      }
      case 'webview.openExternal': {
        void vscode.env.openExternal(vscode.Uri.parse(message.url));
        return;
      }
      case 'webview.reveal': {
        // Path came from the engine's own database, but never trust it blindly.
        void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(message.path));
        return;
      }
      case 'engine.request': {
        if (!this.handler) {
          void webview.postMessage({
            type: 'engine.response',
            id: message.id,
            error: 'engine is not ready yet',
          });
          return;
        }
        try {
          const result = await this.handler(message.method, message.params);
          void webview.postMessage({ type: 'engine.response', id: message.id, result });
        } catch (err) {
          void webview.postMessage({
            type: 'engine.response',
            id: message.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }
      default:
        return;
    }
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }
}

/** Minimal standalone document used before (or instead of) the real UI. */
export function shellHtml(message: string, isError = false): string {
  const nonce = Math.random().toString(36).slice(2).padEnd(32, '0');
  const color = isError ? '#f85149' : '#8b949e';
  return `<!DOCTYPE html>
<html lang="zh-Hans">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';" />
    <title>SoundDesk</title>
  </head>
  <body style="margin:0;background:#0d1117;color:#e6edf3;font:13px -apple-system,'Segoe UI','Microsoft YaHei',sans-serif;">
    <div style="display:flex;height:100vh;align-items:center;justify-content:center;color:${color};">${message.replace(/[<>&]/g, '')}</div>
  </body>
</html>`;
}
