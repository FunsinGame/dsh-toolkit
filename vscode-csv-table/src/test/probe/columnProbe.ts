/**
 * 诊断脚本：`openWith` 到底把文件放进了哪一列。
 *
 * 依次尝试几种「在右侧打开」的写法，把标签组的分布打出来对照。
 *
 * `@vscode/test-electron` 会在扩展宿主里 `import` 本模块并调用 `run()`。
 */

import * as vscode from 'vscode';

import { debugCsvViewColumn } from '../../commands';
import { CSV_TABLE_VIEW_TYPE } from '../../editor/csvTableEditor';

/**
 * 把当前所有标签组压成一行可读文本。
 *
 * @returns 形如 `1:[people.csv, table:quoted.csv] 2:[semicolon.csv]` 的描述。
 */
function describeGroups(): string {
  return vscode.window.tabGroups.all
    .map(group => {
      const tabs = group.tabs.map(tab => {
        const input = tab.input;
        const name = (uri: vscode.Uri): string => uri.path.split('/').pop() ?? uri.path;
        if (input instanceof vscode.TabInputText) {
          return name(input.uri);
        }
        if (input instanceof vscode.TabInputCustom) {
          return `${input.viewType === CSV_TABLE_VIEW_TYPE ? '表格' : '自定义'}:${name(input.uri)}`;
        }
        return '其它';
      });
      return `${group.viewColumn}:[${tabs.join(', ')}]`;
    })
    .join(' ');
}

/**
 * 关闭所有标签组，回到「编辑区为空」的状态。
 */
async function reset(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

/**
 * 依次尝试几种写法。
 *
 * @returns 诊断结束时的 Promise。
 */
export async function run(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) {
    console.log('没有工作区');
    return;
  }
  const file = (name: string): vscode.Uri => vscode.Uri.joinPath(folder.uri, name);
  const people = file('people.csv');
  const quoted = file('quoted.csv');
  const semicolon = file('semicolon.csv');

  console.log('=== 标签组诊断开始');

  await reset();
  console.log('重置后 groups:', vscode.window.tabGroups.all.length, describeGroups());
  console.log('此时 csvViewColumn() =', debugCsvViewColumn());
  await vscode.commands.executeCommand('vscode.openWith', people, CSV_TABLE_VIEW_TYPE, debugCsvViewColumn());
  console.log('空编辑区打开后:', describeGroups());

  await reset();
  await vscode.window.showTextDocument(quoted, { viewColumn: vscode.ViewColumn.One });
  console.log('第一列放文本后:', describeGroups());
  console.log('此时 csvViewColumn() =', debugCsvViewColumn());
  await vscode.commands.executeCommand('vscode.openWith', people, CSV_TABLE_VIEW_TYPE, debugCsvViewColumn());
  console.log('用 csvViewColumn() 打开表格:', describeGroups());

  await reset();
  await vscode.window.showTextDocument(quoted, { viewColumn: vscode.ViewColumn.One });
  await vscode.commands.executeCommand('vscode.openWith', semicolon, CSV_TABLE_VIEW_TYPE, 2);
  console.log('硬编码 2 打开表格:', describeGroups());

  await reset();
  await vscode.window.showTextDocument(quoted, { viewColumn: vscode.ViewColumn.One });
  await vscode.commands.executeCommand('workbench.action.newGroupRight');
  console.log('newGroupRight 之后:', describeGroups());
  await vscode.commands.executeCommand('vscode.openWith', people, CSV_TABLE_VIEW_TYPE, debugCsvViewColumn());
  console.log('newGroupRight 后用 csvViewColumn() 打开:', describeGroups());

  await reset();
  console.log('结束（closeAllEditors 后）:', describeGroups());
  console.log('=== 标签组诊断结束');
}
