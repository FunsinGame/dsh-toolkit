/**
 * 扩展宿主集成测试。
 *
 * 这些用例运行在真实的 VS Code 实例里，因此覆盖了单元测试覆盖不到的部分：
 * 扩展激活、自定义编辑器注册，以及页签栏上表格视图与文本模式之间的切换。
 */

import * as assert from 'node:assert/strict';

import * as vscode from 'vscode';

import { CSV_TABLE_VIEW_TYPE } from '../../editor/csvTableEditor';

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
    ]) {
      assert.ok(commands.includes(command), `必须注册命令 ${command}`);
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
});
