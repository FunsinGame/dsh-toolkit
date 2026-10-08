/**
 * 诊断脚本：从侧边栏点开一个文件之后，标签组到底是什么样子。
 *
 * 目的是验证「不拆分、单个页签」这条要求：点开后不能多出一个编辑列，表格应该
 * 作为普通页签落在活动的那一列里，并且会在同一列把该文件已有的页签替换掉。
 *
 * `@vscode/test-electron` 会在扩展宿主里 `import` 本模块并调用 `run()`。
 */

import * as vscode from 'vscode';

import { openInTable } from '../../commands';
import { CSV_TABLE_VIEW_TYPE } from '../../editor/csvTableEditor';

/**
 * 把当前所有标签组压成一行可读文本。
 *
 * @returns 形如 `1:[people.csv, 表格:quoted.csv] 2:[semicolon.csv]` 的描述。
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
 * 依次跑三种点开场景。
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

  console.log('=== 打开方式诊断开始');

  // 1) 编辑区全空：应该只出现一个标签组。
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  console.log('编辑区全空:', describeGroups());
  await openInTable(people);
  console.log('空编辑区点开 people.csv:', describeGroups());

  // 2) 第一列已经有别的文件：应该还是只有一个标签组，且原有页签仍在。
  await vscode.window.showTextDocument(quoted, { viewColumn: vscode.ViewColumn.One });
  console.log('第一列先打开 quoted.csv:', describeGroups());
  await openInTable(semicolon);
  console.log('再点开 semicolon.csv:', describeGroups());

  // 3) 同一个文件已经在第一列以文本打开：应该原地替换成表格。
  await openInTable(semicolon);
  console.log('再点一次同一个文件:', describeGroups());

  console.log('=== 打开方式诊断结束');
}
