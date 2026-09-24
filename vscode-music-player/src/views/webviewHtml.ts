/**
 * 构建 webview 文档。
 *
 * 两个地方是「差一点就静音」的坑，改这里时要小心：
 *
 * 1. **CSP 必须放行回环代理的 origin**（`media-src` / `img-src` / `connect-src`）。
 *    放漏了的表现是：界面正常、控制台一行 CSP 警告、就是没声音、没封面。
 * 2. **bootstrap 必须在模块脚本之前同步注入**，因为页面初始化时要同步读取
 *    `window.__MUSIC_PLAYER_BOOT__`（代理端口与 token）。
 */

import * as vscode from 'vscode';

import type { BootstrapPayload } from '../protocol';

export interface WebviewHtmlOptions {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  /** `http://127.0.0.1:<port>` */
  proxyOrigin: string;
  bootstrap: BootstrapPayload;
  title?: string;
}

export function buildWebviewHtml(options: WebviewHtmlOptions): string {
  const { webview, extensionUri, proxyOrigin, bootstrap } = options;
  const nonce = createNonce();
  const mediaRoot = vscode.Uri.joinPath(extensionUri, 'media');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'sidebar.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'sidebar.css'));

  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    // 封面图走本地代理，因此这里只需要放行代理 origin 与 data/blob。
    `img-src ${webview.cspSource} data: blob: ${proxyOrigin}`,
    // <audio src="http://127.0.0.1:PORT/audio/..."> —— 漏了这句就是静音
    `media-src ${proxyOrigin} blob: data:`,
    // 健康检查 / 将来的 fetch 调用
    `connect-src ${proxyOrigin}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="zh-Hans">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>${escapeHtml(options.title ?? 'B站音乐播放器')}</title>
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}">
      // 必须在模块脚本之前同步注入。
      window.__MUSIC_PLAYER_BOOT__ = ${serializeForInlineScript(bootstrap)};
    </script>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}

/** 32 位随机 nonce，每次加载都换。 */
export function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * 序列化后嵌入 `<script>`：数据里若出现 `</script>` 会提前闭合脚本块，
 * 因此把 `<` 转义成 unicode 转义。
 */
export function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
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

/** webview 只允许加载 `media/` 下的资源。 */
export function localResourceRoots(extensionUri: vscode.Uri): vscode.Uri[] {
  return [vscode.Uri.joinPath(extensionUri, 'media')];
}
