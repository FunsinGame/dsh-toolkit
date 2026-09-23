/**
 * Builds the webview document.
 *
 * Two things here are load-bearing and easy to get subtly wrong:
 *
 * 1. **CSP must allow the engine origin for `media-src` and `connect-src`.**
 *    A too-strict policy still renders the UI and even draws waveforms from
 *    inline data, but `<audio>` and `fetch` fail with only a console warning —
 *    the symptom is "no sound and no waveform", which reads like a backend bug.
 *
 * 2. **The bootstrap must be injected before the bundle runs.** The UI's
 *    `resolveBoot()` reads `window.__SOUNDDESK_BOOTSTRAP__` synchronously at
 *    import time, so it has to be a plain inline script that precedes the module.
 *
 * `base: './'` in the Vite config is what makes the relative asset URLs below
 * resolve through the `vscode-webview://` origin.
 */

import * as vscode from 'vscode';

import type { EngineBootstrap } from './protocol.ts';

export interface WebviewHtmlOptions {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  bootstrap: EngineBootstrap;
  /** extra query for the UI, e.g. `play=12` to start an asset */
  deepLink?: Record<string, string | number>;
  title?: string;
}

export function buildWebviewHtml(options: WebviewHtmlOptions): string {
  const { webview, extensionUri, bootstrap } = options;
  const nonce = createNonce();

  const mediaRoot = vscode.Uri.joinPath(extensionUri, 'media');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'assets', 'index.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'assets', 'index.css'));

  const engineOrigin = new URL(bootstrap.url).origin;
  const engineWs = engineOrigin.replace(/^http/, 'ws');

  const csp = [
    `default-src 'none'`,
    // the CSS is a file, but React sets a few inline styles
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data: blob:`,
    // <audio src="http://127.0.0.1:PORT/..."> — without this: silence
    `media-src ${engineOrigin} blob: data:`,
    // fetch() for peaks / API, and the WebSocket that streams job progress
    `connect-src ${engineOrigin} ${engineWs}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  const deepLinkQuery = options.deepLink
    ? `?${Object.entries(options.deepLink)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&')}`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-Hans">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>${escapeHtml(options.title ?? 'SoundDesk')}</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">
      // Injected synchronously, before the UI module evaluates.
      window.__SOUNDDESK_BOOTSTRAP__ = ${serializeForInlineScript(bootstrap)};
      ${
        deepLinkQuery
          ? `try { window.history.replaceState({}, '', window.location.pathname + ${JSON.stringify(deepLinkQuery)}); } catch (e) {}`
          : ''
      }
    </script>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}

/** 32 hex chars, regenerated per load. */
export function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * Serialize for embedding inside a `<script>` element.
 * `</script>` anywhere in the data would otherwise terminate the block, so the
 * `<` is escaped as a unicode escape.
 */
export function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, (m) => (m === '\u2028' ? '\\u2028' : '\\u2029'));
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** Paths the webview is allowed to load from; anything else is blocked. */
export function localResourceRoots(extensionUri: vscode.Uri): vscode.Uri[] {
  return [vscode.Uri.joinPath(extensionUri, 'media')];
}
