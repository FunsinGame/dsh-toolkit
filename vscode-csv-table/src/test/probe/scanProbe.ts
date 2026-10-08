/**
 * 诊断脚本：为什么某些目录下的 CSV 扫不到。
 *
 * 在扩展宿主里直接调用与 `CsvTreeDataProvider` 完全相同的 `workspace.findFiles`
 * 调用，并逐个对照不同的匹配模式，把结果打到标准输出。
 *
 * `@vscode/test-electron` 会在扩展宿主里 `import` 本模块并调用 `run()`。
 */

import * as vscode from 'vscode';

/**
 * 诊断当前工作区里的 CSV 扫描。
 *
 * @returns 诊断结束时的 Promise。
 */
export function run(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  console.log('=== 诊断开始');
  console.log('workspaceFolders:', JSON.stringify(folders.map(folder => folder.uri.fsPath)));
  if (folders.length === 0) {
    console.log('没有工作区文件夹');
  }

  const patterns = [
    '**/*.{csv,tsv,tab}',
    '**/*.csv',
    '**/*.tsv',
    '**/*.CSV',
    '**/*',
  ];
  const pending = patterns.map(async pattern => {
    const started = Date.now();
    const found = await vscode.workspace.findFiles(pattern, undefined, 5000);
    const ms = Date.now() - started;
    console.log(`--- findFiles(${JSON.stringify(pattern)}) -> ${found.length} 个（${ms}ms）`);
    for (const uri of found.slice(0, 8)) {
      console.log('    ', uri.fsPath);
    }
  });

  return Promise.all(pending).then(() => {
    const workbench = vscode.workspace.getConfiguration('files');
    console.log('files.exclude:', JSON.stringify(workbench.get('exclude')));
    console.log('files.watcherExclude:', JSON.stringify(workbench.get('watcherExclude')));
    console.log('search.exclude:', JSON.stringify(vscode.workspace.getConfiguration('search').get('exclude')));
    console.log('=== 诊断结束');
  });
}
