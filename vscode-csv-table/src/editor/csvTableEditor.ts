/**
 * `dshCsv.table` 自定义文本编辑器。
 *
 * 使用「自定义文本编辑器」意味着表格背后仍是同一个 `TextDocument`：文本
 * 编辑器、差异编辑器、撤销/重做、保存与搜索都作用于表格所写入的同一份缓冲区。
 */

import * as vscode from 'vscode';

import { CsvTableSession, normalizeViewState, viewStateKey } from './session';
import { MEDIA_DIRECTORY, renderTableHtml } from './webviewHtml';

/** 为 CSV 文件注册的编辑器视图类型。 */
export const CSV_TABLE_VIEW_TYPE = 'dshCsv.table';

/** 为 CSV 文档注册并解析表格视图。 */
export class CsvTableEditorProvider implements vscode.CustomTextEditorProvider {
  /**
   * 创建 provider。
   *
   * @param context - 扩展上下文，会传给每个会话。
   */
  public constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * 为一个文档挂载表格视图。
   *
   * @param document - 正在打开的 CSV 文档。
   * @param panel - 承载表格的面板。
   * @param _token - 取消令牌；表格同步完成初始化。
   */
  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): void {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, MEDIA_DIRECTORY)],
    };
    panel.webview.html = renderTableHtml(panel.webview, this.context.extensionUri);
    const restored = this.context.workspaceState.get<unknown>(viewStateKey(document.uri));
    new CsvTableSession(this.context, document, panel, normalizeViewState(restored));
  }
}
