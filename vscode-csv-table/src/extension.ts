/**
 * 扩展入口。
 *
 * 两部分各自独立：
 *
 * - 表格视图注册为 CSV 文件的「可选」自定义编辑器：`.csv` 默认仍由文本编辑器
 *   打开，页签栏上的按钮在当前标签组内于两种编辑器之间切换。
 * - 活动栏上的「CSV 配置表」入口打开侧边栏文件树，列出工作区里所有 CSV，点一下
 *   就在右侧打开表格视图。
 */

import * as vscode from 'vscode';

import { registerCsvCommands, updateContextKeys } from './commands';
import { CSV_TABLE_VIEW_TYPE, CsvTableEditorProvider } from './editor/csvTableEditor';
import { CsvExplorer } from './views/csvExplorer';
import { disposeScanLog } from './views/csvTreeProvider';

/**
 * 注册表格视图、侧边栏文件树及其命令。
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
    new CsvExplorer(context),
  );
  registerCsvCommands(context);
  updateContextKeys();
}

/** 释放扩展自己创建的、挂在上下文之外的资源（扫描诊断的输出面板）。 */
export function deactivate(): void {
  disposeScanLog();
}
