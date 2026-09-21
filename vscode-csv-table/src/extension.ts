/**
 * 扩展入口。
 *
 * 表格视图注册为 CSV 文件的「可选」自定义编辑器：.csv 默认仍由文本编辑器
 * 打开，页签栏上的按钮在当前标签组内于两种编辑器之间切换。
 */

import * as vscode from 'vscode';

import { registerCsvCommands, updateContextKeys } from './commands';
import { CSV_TABLE_VIEW_TYPE, CsvTableEditorProvider } from './editor/csvTableEditor';

/**
 * 注册表格视图及其命令。
 *
 * @param context - 拥有这些注册项的扩展上下文。
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      CSV_TABLE_VIEW_TYPE,
      new CsvTableEditorProvider(context),
      {
        // 页签被隐藏时保留表格的滚动位置、选区与列宽。
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
    vscode.window.tabGroups.onDidChangeTabs(() => updateContextKeys()),
    vscode.window.onDidChangeActiveTextEditor(() => updateContextKeys()),
  );
  registerCsvCommands(context);
  updateContextKeys();
}

/** 没有需要在扩展上下文之外释放的资源。 */
export function deactivate(): void {
  return undefined;
}
