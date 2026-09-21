/**
 * 在表格视图与文本编辑器之间切换 CSV 的命令。
 *
 * 表格以 `priority: "option"` 注册，因此 .csv 默认仍以文本打开；页签栏上的
 * 按钮（由 `editor/title` 贡献）在当前标签组内切换两种编辑器。二者共享同
 * 一个 `TextDocument`，所以未保存的缓冲区、撤销历史与保存行为都不受影响。
 */

import * as vscode from 'vscode';

import { CSV_TABLE_VIEW_TYPE } from './editor/csvTableEditor';

/** 表格视图接管的文件扩展名。 */
export const CSV_EXTENSIONS: readonly string[] = ['.csv', '.tsv', '.tab'];

/** 上下文键：当前页签是否为 CSV 文件。 */
const CONTEXT_CAN_SHOW = 'dshCsv.canShowTable';

/** 上下文键：当前页签是否已经是表格视图。 */
const CONTEXT_TABLE_ACTIVE = 'dshCsv.tableActive';

/**
 * 判断资源是否为 CSV 系列文件。
 *
 * @param uri - 待判断的资源。
 * @returns 表格视图能否打开它。
 */
export function isCsvResource(uri: vscode.Uri): boolean {
  const path = uri.path.toLowerCase();
  return CSV_EXTENSIONS.some(extension => path.endsWith(extension));
}

/**
 * 读取页签所显示的资源。
 *
 * @param input - 页签输入。
 * @returns 资源；对于不含文件的页签返回 `undefined`。
 */
function tabResource(input: unknown): vscode.Uri | undefined {
  if (
    input instanceof vscode.TabInputCustom ||
    input instanceof vscode.TabInputText ||
    input instanceof vscode.TabInputNotebook
  ) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputTextDiff) {
    return input.modified;
  }
  return undefined;
}

/**
 * 判断页签是否承载 CSV 表格视图。
 *
 * @param tab - 待判断的页签。
 * @returns 该页签是否为表格视图。
 */
function isTableTab(tab: vscode.Tab | undefined): boolean {
  return tab?.input instanceof vscode.TabInputCustom && tab.input.viewType === CSV_TABLE_VIEW_TYPE;
}

/**
 * 找到用户当前正在处理的资源。
 *
 * @returns 当前编辑器或页签的资源。
 */
function activeResource(): vscode.Uri | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor !== undefined) {
    return editor.document.uri;
  }
  return tabResource(vscode.window.tabGroups.activeTabGroup.activeTab?.input);
}

/**
 * 找到显示某个资源的标签组。
 *
 * @param uri - 要查找的资源。
 * @returns 该标签组的视图列；找不到时为 `undefined`。
 */
function viewColumnFor(uri: vscode.Uri): vscode.ViewColumn | undefined {
  const target = uri.toString();
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tabResource(tab.input)?.toString() === target) {
        return group.viewColumn;
      }
    }
  }
  return undefined;
}

/**
 * 以表格视图打开资源。
 *
 * @param uri - 来自菜单的资源；省略则使用当前页签。
 */
export async function openAsTable(uri?: vscode.Uri): Promise<void> {
  const target = uri ?? activeResource();
  if (target === undefined || !isCsvResource(target)) {
    void vscode.window.showWarningMessage('请先打开一个 .csv / .tsv 文件。');
    return;
  }
  const column = viewColumnFor(target) ?? vscode.ViewColumn.Active;
  await vscode.commands.executeCommand('vscode.openWith', target, CSV_TABLE_VIEW_TYPE, column);
}

/**
 * 以文本编辑器打开资源，替换掉表格页签。
 *
 * `workbench.editorAssociations` 可能把 `*.csv` 指向表格视图，因此这里会
 * 校验结果：一旦关联生效，就显式再请求一次文本编辑器。
 *
 * @param uri - 来自菜单的资源；省略则使用当前页签。
 */
export async function openAsText(uri?: vscode.Uri): Promise<void> {
  const target = uri ?? activeResource();
  if (target === undefined || !isCsvResource(target)) {
    void vscode.window.showWarningMessage('请先打开一个 .csv / .tsv 文件。');
    return;
  }
  const column = viewColumnFor(target) ?? vscode.ViewColumn.Active;
  await vscode.commands.executeCommand('vscode.openWith', target, 'default', column);
  if (isTableTab(vscode.window.tabGroups.activeTabGroup.activeTab)) {
    await vscode.window.showTextDocument(target, {
      viewColumn: column,
      preview: false,
      preserveFocus: false,
    });
  }
}

/** 在当前页签的表格视图与文本编辑器之间切换。 */
export async function toggleView(): Promise<void> {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (isTableTab(tab)) {
    await openAsText(tabResource(tab?.input));
  } else {
    await openAsTable();
  }
}

/** 为表格视图添加或移除 `*.csv` 编辑器关联。 */
export async function toggleDefaultEditor(): Promise<void> {
  const workbench = vscode.workspace.getConfiguration('workbench');
  const current = workbench.get<Record<string, string>>('editorAssociations') ?? {};
  const associations = { ...current };
  const enabled = associations['*.csv'] === CSV_TABLE_VIEW_TYPE;

  if (enabled) {
    // 这里从不关联 `.tab`，所以关闭时也不去动它。
    delete associations['*.csv'];
    delete associations['*.tsv'];
  } else {
    associations['*.csv'] = CSV_TABLE_VIEW_TYPE;
    associations['*.tsv'] = CSV_TABLE_VIEW_TYPE;
  }
  await workbench.update('editorAssociations', associations, vscode.ConfigurationTarget.Global);

  void vscode.window.showInformationMessage(
    enabled
      ? '.csv 将用文本编辑器打开，仍可在页签栏切换到表格视图。'
      : '.csv 将默认用表格视图打开，仍可在页签栏切换回文本模式。',
  );
}

/** 发布用于显示和标识页签栏按钮的上下文键。 */
export function updateContextKeys(): void {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  const resource = tabResource(tab?.input) ?? vscode.window.activeTextEditor?.document.uri;
  const tableActive = isTableTab(tab);
  // 按钮在 CSV 文本编辑器和本表格视图上显示；如果当前是别的自定义编辑器，
  // 即使它指向的是 CSV 文件也不显示。
  const canShow =
    resource !== undefined &&
    isCsvResource(resource) &&
    (tableActive || !(tab?.input instanceof vscode.TabInputCustom));

  void vscode.commands.executeCommand('setContext', CONTEXT_CAN_SHOW, canShow);
  void vscode.commands.executeCommand('setContext', CONTEXT_TABLE_ACTIVE, tableActive);
}

/**
 * 注册扩展提供的命令。
 *
 * @param context - 拥有这些注册项的扩展上下文。
 */
export function registerCsvCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('dshCsv.showTable', (uri?: vscode.Uri) => openAsTable(uri)),
    vscode.commands.registerCommand('dshCsv.showText', (uri?: vscode.Uri) => openAsText(uri)),
    vscode.commands.registerCommand('dshCsv.toggleView', () => toggleView()),
    vscode.commands.registerCommand('dshCsv.toggleDefaultEditor', () => toggleDefaultEditor()),
  );
}
