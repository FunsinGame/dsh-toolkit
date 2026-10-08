/**
 * 诊断脚本：直接驱动生产环境的 `CsvTreeDataProvider`。
 *
 * 与 `scanProbe` 的区别在于，这个脚本不重写扫描逻辑，而是 `import` 扩展真正使
 * 用的那套代码（`activate` 里创建的那个类），所以它看到的结果就是侧边栏看到的
 * 结果；同时把 `getTreeItem` 的结果也打出来，确认节点能被视图渲染。
 *
 * `@vscode/test-electron` 会在扩展宿主里 `import` 本模块并调用 `run()`。
 */

import * as vscode from 'vscode';

import { CsvTreeDataProvider, uriOf } from '../../views/csvTreeProvider';
import type { CsvTreeNode, FileNode } from '../../views/treeModel';

/**
 * 把节点压成一行可读文本。
 *
 * @param provider - 提供树数据的实例。
 * @param node - 待描述的节点。
 * @returns 描述文本。
 */
function describe(provider: CsvTreeDataProvider, node: CsvTreeNode): string {
  const item = provider.getTreeItem(node);
  const label = typeof item.label === 'string' ? item.label : (item.label?.label ?? '?');
  const collapsible = item.collapsibleState ?? 0;
  return `${node.kind}「${label}」collapsible=${collapsible} ctx=${String(item.contextValue)}`;
}

/**
 * 走一遍真实的树数据路径。
 *
 * @returns 诊断结束时的 Promise。
 */
export async function run(): Promise<void> {
  const provider = new CsvTreeDataProvider();
  console.log('=== 树诊断开始');
  console.log(
    'workspaceFolders:',
    JSON.stringify((vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath)),
  );

  // 先看裸的 findFiles，再把每个资源过一遍 provider 内部用到的判断，
  // 这样能定位到底是哪一步把文件筛掉了。
  const raw = await vscode.workspace.findFiles('**/*.{csv,tsv,tab}', undefined, 5000);
  console.log(`裸 findFiles 命中 ${raw.length} 个`);
  for (const uri of raw.slice(0, 3)) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    console.log('  uri.path      :', uri.path);
    console.log('  小写结尾 .csv :', uri.path.toLowerCase().endsWith('.csv'));
    console.log('  workspaceFolder:', folder === undefined ? '(undefined)' : folder.uri.path);
  }

  await provider.refresh();
  const roots = provider.getChildren();
  console.log(`顶层节点 ${roots.length} 个`);
  for (const root of roots) {
    console.log('  ', describe(provider, root));
  }

  // 逐层展开，直到看见文件为止。
  let level: CsvTreeNode[] = roots;
  let files: FileNode[] = [];
  for (let depth = 0; depth < 4 && level.length > 0; depth += 1) {
    const next: CsvTreeNode[] = [];
    for (const node of level) {
      if (node.kind === 'file') {
        files.push(node);
      } else if (node.kind === 'folder') {
        next.push(...provider.getChildren(node));
      }
    }
    console.log(`第 ${depth + 1} 层展开出 ${next.length} 个节点`);
    level = next;
  }

  console.log(`一共看到 ${files.length} 个文件节点，前 5 个：`);
  for (const file of files.slice(0, 5)) {
    console.log('  ', uriOf(file).fsPath);
  }
  const sample = files[0];
  if (sample !== undefined) {
    const item = provider.getTreeItem(sample);
    console.log('第一个文件节点的 command:', JSON.stringify(item.command));
  }

  provider.dispose();
  console.log('=== 树诊断结束');
}
