/**
 * 扩展宿主集成测试。
 *
 * 这些用例运行在真实的 VS Code 实例里，因此覆盖了单元测试覆盖不到的部分：
 * 扩展激活、自定义编辑器注册，以及页签栏上表格视图与文本模式之间的切换。
 */

import * as assert from 'node:assert/strict';

import * as vscode from 'vscode';

import { CSV_TABLE_VIEW_TYPE } from '../../editor/csvTableEditor';
import { CsvTreeDataProvider, uriOf } from '../../views/csvTreeProvider';
import type { CsvTreeNode, FileNode } from '../../views/treeModel';

declare function suite(name: string, callback: () => void): void;
declare function test(name: string, callback: () => void | Promise<void>): void;

/**
 * 等待某个条件成立。
 *
 * @param condition - 要等待的条件。
 * @param description - 超时信息中描述的等待目标。
 */
async function waitFor(condition: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`等待「${description}」超时`);
}

/**
 * 当前活动的页签。
 *
 * @returns 活动页签；没有则为 `undefined`。
 */
function activeTab(): vscode.Tab | undefined {
  return vscode.window.tabGroups.activeTabGroup.activeTab;
}

/**
 * 当前活动页签是否承载 CSV 表格视图。
 *
 * @returns 是否为表格视图。
 */
function tableIsActive(): boolean {
  const input = activeTab()?.input;
  return input instanceof vscode.TabInputCustom && input.viewType === CSV_TABLE_VIEW_TYPE;
}

/**
 * 解析样例工作区里的一个文件。
 *
 * @param name - `samples/` 目录下的文件名。
 * @returns 该资源的 URI。
 */
function sample(name: string): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, '集成测试必须把 samples 目录作为工作区打开');
  return vscode.Uri.joinPath(folder.uri, name);
}

/**
 * 递归收集一棵树上的所有文件节点。
 *
 * @param provider - 提供树数据的实例。
 * @param nodes - 起始节点。
 * @returns 收集到的文件节点。
 */
function collectFiles(
  provider: CsvTreeDataProvider,
  nodes: readonly CsvTreeNode[],
): FileNode[] {
  const files: FileNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'file') {
      files.push(node);
    } else if (node.kind === 'folder') {
      files.push(...collectFiles(provider, provider.getChildren(node)));
    }
  }
  return files;
}

suite('CSV 表格视图', () => {
  test('扩展激活并注册了它的命令', async () => {
    const extension = vscode.extensions.getExtension('dsh-toolkit.dsh-csv-table');
    assert.ok(extension, '开发中的扩展必须被载入');
    await extension.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'dshCsv.showTable',
      'dshCsv.showText',
      'dshCsv.toggleView',
      'dshCsv.toggleDefaultEditor',
      'dshCsv.openInTable',
      'dshCsv.refreshFiles',
      'dshCsv.openFileInTable',
      'dshCsv.revealInOs',
      'dshCsv.revealInExplorer',
      'dshCsv.copyPath',
    ]) {
      assert.ok(commands.includes(command), `必须注册命令 ${command}`);
    }
  });

  test('侧边栏文件树已注册，并能枚举工作区里的 CSV', async () => {
    // 视图本身由 package.json 贡献，这里只验证它的命令可用、列表可刷新，
    // 并且嵌套目录里的 CSV 也能被扫到。
    await vscode.commands.executeCommand('dshCsv.refreshFiles');

    const found = await vscode.workspace.findFiles('**/*.{csv,tsv,tab}');
    const paths = found.map(uri => uri.path);
    for (const expected of ['/配置/物品.csv', '/配置/战斗/技能.csv', '/配置/战斗/drop-table.tsv']) {
      assert.ok(
        paths.some(path => path.endsWith(expected)),
        `扫描结果必须包含 ${expected}`,
      );
    }
  });

  test('文件树会收录深层目录里的 CSV，并把它们挂到正确的工作区文件夹下', async () => {
    // 这条用例走的是侧边栏真正使用的 `CsvTreeDataProvider`，而不是直接调用
    // findFiles —— 只在 findFiles 上做断言的话，「路径大小写不匹配导致所有文件
    // 都被 relativePath 丢掉」这类 bug 是测不出来的。
    const provider = new CsvTreeDataProvider();
    try {
      await provider.refresh();

      const roots = provider.getChildren();
      assert.ok(roots.length > 0, '文件树必须有顶层节点');
      assert.equal(roots[0]?.kind, 'folder', '有 CSV 时顶层是工作区文件夹而不是提示');

      const files = collectFiles(provider, roots);
      assert.ok(files.length >= 3, `文件树至少应看到 3 个 CSV，实际 ${files.length}`);

      // samples/配置/战斗/ 是两层深的目录，正好覆盖有过盘符大小写 bug 的路径。
      const nested = files.filter(file => file.relativePath.includes('配置'));
      assert.ok(nested.length >= 2, '两层深目录里的 CSV 也必须出现');
      for (const file of files) {
        const uri = uriOf(file);
        assert.equal(
          vscode.workspace.getWorkspaceFolder(uri)?.uri.toString(),
          file.folder.uri.toString(),
          `${file.relativePath} 必须仍然属于它所在的工作区文件夹`,
        );
        // `key` 就是扫描时那个资源的字符串，重建出来的 URI 必须指向同一个文件
        // （盘符大小写不算差异）。
        assert.equal(uri.toString().toLowerCase(), file.key.toLowerCase(), '节点必须指回原文件');
      }
    } finally {
      provider.dispose();
    }
  });

  test('把 CSV 打开为表格，并能切回文本编辑器', async () => {
    const uri = sample('people.csv');
    const document = await vscode.workspace.openTextDocument(uri);

    await vscode.commands.executeCommand(
      'vscode.openWith',
      uri,
      CSV_TABLE_VIEW_TYPE,
      vscode.ViewColumn.Active,
    );
    await waitFor(tableIsActive, '表格视图成为活动页签');
    assert.ok(tableIsActive(), '活动页签承载 CSV 表格视图');

    await vscode.commands.executeCommand('dshCsv.showText');
    await waitFor(
      () => vscode.window.activeTextEditor?.document.uri.toString() === uri.toString(),
      '文本编辑器成为活动编辑器',
    );
    assert.equal(tableIsActive(), false, '切到文本模式会替换掉表格页签');
    assert.equal(document.getText().includes('李安安'), true);
  });

  test('从侧边栏点开文件时在右侧新开一列，而不是替换掉正在编辑的文件', async () => {
    // 用一层子目录，顺便验证嵌套目录里的文件点开时同样正确。
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, '集成测试必须把 samples 目录作为工作区打开');
    const uri = vscode.Uri.joinPath(folder.uri, '配置', '战斗', 'drop-table.tsv');

    // 先占用第一列，这样「右侧」的含义是确定的：必须是一个新的标签组。
    await vscode.commands.executeCommand('dshCsv.showText', uri);
    await waitFor(
      () => vscode.window.activeTextEditor?.document.uri.toString() === uri.toString(),
      '文本编辑器在左侧打开该样例',
    );

    try {
      await vscode.commands.executeCommand('dshCsv.openInTable', uri);
      await waitFor(tableIsActive, '表格视图成为活动页签');
      assert.ok(tableIsActive(), '活动页签承载 CSV 表格视图');

      const active = vscode.window.tabGroups.activeTabGroup;
      assert.notEqual(
        active.viewColumn,
        vscode.ViewColumn.One,
        '侧边栏打开的文件不能替换掉第一列，而要开在它右边',
      );
      // 被点开的文件必须就在活动列里，并且是表格视图。
      const opened = active.tabs.some(tab => {
        const input = tab.input;
        return (
          input instanceof vscode.TabInputCustom &&
          input.viewType === CSV_TABLE_VIEW_TYPE &&
          input.uri.toString() === uri.toString()
        );
      });
      assert.ok(opened, '表格视图必须开在新的那一列里');
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    }
  });

  test('toggleView 能双向切换活动页签', async () => {
    const uri = sample('quoted.csv');
    await vscode.commands.executeCommand('dshCsv.showText', uri);
    await waitFor(
      () => vscode.window.activeTextEditor?.document.uri.toString() === uri.toString(),
      '文本编辑器打开该样例',
    );

    await vscode.commands.executeCommand('dshCsv.toggleView');
    await waitFor(tableIsActive, 'toggleView 打开表格');
    const input = activeTab()?.input;
    assert.ok(input instanceof vscode.TabInputCustom);
    assert.equal(input.uri.toString(), uri.toString());

    await vscode.commands.executeCommand('dshCsv.toggleView');
    await waitFor(
      () => vscode.window.activeTextEditor?.document.uri.toString() === uri.toString(),
      'toggleView 切回文本模式',
    );
  });

  test('即使把 *.csv 关联到表格视图，文本模式依然可用', async () => {
    const workbench = vscode.workspace.getConfiguration('workbench');
    const previous = workbench.get<Record<string, string>>('editorAssociations') ?? {};
    const uri = sample('semicolon.csv');

    try {
      await workbench.update(
        'editorAssociations',
        { ...previous, '*.csv': CSV_TABLE_VIEW_TYPE },
        vscode.ConfigurationTarget.Workspace,
      );
      await vscode.commands.executeCommand('dshCsv.showTable', uri);
      await waitFor(tableIsActive, '表格通过关联打开');
      assert.ok(tableIsActive());

      await vscode.commands.executeCommand('dshCsv.showText', uri);
      await waitFor(
        () => vscode.window.activeTextEditor?.document.uri.toString() === uri.toString(),
        '文本编辑器不再受该关联影响',
      );
      assert.equal(tableIsActive(), false);
    } finally {
      await workbench.update(
        'editorAssociations',
        previous,
        vscode.ConfigurationTarget.Workspace,
      );
    }
  });

  test('toggleDefaultEditor 能添加和移除 *.csv 关联', async () => {
    const workbench = vscode.workspace.getConfiguration('workbench');
    const previous = workbench.get<Record<string, string>>('editorAssociations') ?? {};
    const read = (): Record<string, string> =>
      vscode.workspace.getConfiguration('workbench').get<Record<string, string>>('editorAssociations') ??
      {};

    try {
      if (previous['*.csv'] === CSV_TABLE_VIEW_TYPE) {
        await vscode.commands.executeCommand('dshCsv.toggleDefaultEditor');
      }
      await vscode.commands.executeCommand('dshCsv.toggleDefaultEditor');
      assert.equal(read()['*.csv'], CSV_TABLE_VIEW_TYPE);
      await vscode.commands.executeCommand('dshCsv.toggleDefaultEditor');
      assert.equal(read()['*.csv'], undefined);
    } finally {
      await workbench.update(
        'editorAssociations',
        previous,
        vscode.ConfigurationTarget.Global,
      );
    }
  });

  test('锁定行列写进用户设置，跨文件与跨窗口都保留', async () => {
    const config = vscode.workspace.getConfiguration('dshCsv');
    const previous = config.inspect<number>('frozenRows')?.globalValue;
    try {
      await config.update('frozenRows', 3, vscode.ConfigurationTarget.Global);
      await config.update('frozenColumns', 2, vscode.ConfigurationTarget.Global);

      const stored = vscode.workspace.getConfiguration('dshCsv').inspect<number>('frozenRows');
      assert.equal(stored?.globalValue, 3, '写入的是用户设置而不是工作区设置');
      assert.equal(stored?.workspaceValue, undefined);
      assert.equal(vscode.workspace.getConfiguration('dshCsv').get<number>('frozenColumns', 0), 2);

      // 另开一个 CSV 也能读到同一组锁定数量。
      const uri = sample('quoted.csv');
      await vscode.commands.executeCommand('dshCsv.showTable', uri);
      await waitFor(tableIsActive, '表格视图打开');
      assert.equal(vscode.workspace.getConfiguration('dshCsv').get<number>('frozenRows', 0), 3);
    } finally {
      await config.update('frozenRows', previous, vscode.ConfigurationTarget.Global);
      await config.update('frozenColumns', undefined, vscode.ConfigurationTarget.Global);
    }
  });
});
