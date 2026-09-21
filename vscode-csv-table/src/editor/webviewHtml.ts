/**
 * 表格视图的 HTML 外壳。
 *
 * 外壳本身不含任何界面文案：工具栏、表格、状态栏与右键菜单都由
 * `media/main.js` 构建，文案统一使用中文。
 */

import * as vscode from 'vscode';

/** 扩展内的媒体资源目录名。 */
export const MEDIA_DIRECTORY = 'media';

/** 渲染进表格视图的脚本文件。 */
const SCRIPT_FILE = 'main.js';

/** 渲染进表格视图的样式文件。 */
const STYLE_FILE = 'main.css';

/** 用于生成内容安全策略 nonce 的字符集。 */
const NONCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * 为视图的脚本标签生成一个 nonce。
 *
 * @returns 32 个字符的令牌；只要每次渲染都不可预测即可。
 */
function createNonce(): string {
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += NONCE_ALPHABET[Math.floor(Math.random() * NONCE_ALPHABET.length)];
  }
  return nonce;
}

/**
 * 渲染表格视图的 HTML。
 *
 * @param webview - 面板的 webview，用于取资源来源。
 * @param extensionUri - 扩展根目录 URI。
 * @returns 完整的 HTML 文档。
 */
export function renderTableHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = createNonce();
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, MEDIA_DIRECTORY, SCRIPT_FILE),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, MEDIA_DIRECTORY, STYLE_FILE),
  );

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link href="${styleUri}" rel="stylesheet">
<title>CSV 表格视图</title>
</head>
<body>
<div id="app">
  <div id="toolbar" class="toolbar" role="toolbar"></div>
  <div id="chips" class="chips" hidden></div>
  <div id="banner" class="banner" hidden></div>
  <div id="scroll" class="grid-scroll" tabindex="0" role="grid"></div>
  <div id="status" class="status" role="status"></div>
  <div id="menu" class="menu" hidden role="menu"></div>
</div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>
`;
}
