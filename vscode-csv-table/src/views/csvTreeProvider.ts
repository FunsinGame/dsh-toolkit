/**
 * 侧边栏「CSV 配置表」的文件树。
 *
 * 工作区里的 CSV 文件由 `vscode.workspace.findFiles` 一次扫描出来，再交给
 * `treeModel.ts` 折成目录树；本文件只负责把节点翻译成 `vscode.TreeItem`、按需
 * 展开某一层，并在扫描期间给出占位提示。
 *
 * 扫描是有意的懒执行：没人打开侧边栏时不会去碰文件系统。
 */

import * as vscode from 'vscode';

import { isCsvResource } from '../commands';
import {
  childNodesOf,
  relativeUriPath,
  rootNodes,
  stateKey,
  type CsvEntry,
  type CsvTreeNode,
  type FileNode,
  type FolderNode,
  type StateNode,
} from './treeModel';

/** 扫描时使用的匹配模式。 */
export const CSV_GLOB = '**/*.{csv,tsv,tab}';

/** 一次扫描最多取多少个文件，避免超大仓库把侧边栏拖住。 */
const SCAN_LIMIT = 5000;

/** 扫描期间显示的占位文案。 */
const SCANNING_MESSAGE = '正在扫描工作区…';

/** 输出面板里显示扫描诊断信息的通道名。 */
const LOG_CHANNEL = 'CSV 配置表';

/**
 * 扫描过程的诊断日志。
 *
 * 只在真的要扫描时才创建输出面板通道，因此平时不会多出一个空面板；当侧边栏
 * 「扫不到文件」时，这里能直接看出扫描了哪些工作区、用了什么模式、命中了多少。
 */
let log: vscode.LogOutputChannel | null = null;

/**
 * 往诊断通道里写一行。
 *
 * @param message - 要记录的内容。
 */
function logScan(message: string): void {
  log ??= vscode.window.createOutputChannel(LOG_CHANNEL, { log: true });
  log.info(message);
}

/** 关闭诊断通道；由扩展的 `deactivate` 调用。 */
export function disposeScanLog(): void {
  log?.dispose();
  log = null;
}

/**
 * 从资源里取出用于 `TreeItem.id` 的键。
 *
 * @param uri - 文件资源。
 * @returns 稳定且唯一的字符串。
 */
function entryKey(uri: vscode.Uri): string {
  return uri.toString();
}

/**
 * 判断资源是否位于某个工作区文件夹之下（大小写不敏感）。
 *
 * @param uri - 文件资源。
 * @param folder - 工作区文件夹。
 * @returns 是否在该文件夹下。
 */
function isUnder(uri: vscode.Uri, folder: vscode.WorkspaceFolder): boolean {
  const from = folder.uri.path.replace(/\/+$/, '').toLowerCase();
  return uri.path.toLowerCase().startsWith(`${from}/`);
}

/**
 * 计算资源相对某个工作区文件夹的路径。
 *
 * 优先用 VS Code 自己的相对路径 API，但只在文件确实位于该文件夹下时才采信：
 * 嵌套的多根工作区里，这个 API 会挑它自己认为最合适的那一个根，直接用就会把
 * 文件挂到别的根下面。否则回退到 {@link relativeUriPath} 的大小写不敏感比较
 * ——在 Windows 上 `findFiles` 给出的是小写盘符 `/c:/…`，而
 * `workspaceFolder.uri.path` 是大写盘符 `/C:/…`，严格比较会一个文件都匹配不上。
 *
 * @param folder - 文件所属的工作区文件夹。
 * @param uri - 文件资源。
 * @returns 以 `/` 分隔的相对路径；不在该文件夹下时返回 `undefined`。
 */
function relativePath(folder: vscode.WorkspaceFolder, uri: vscode.Uri): string | undefined {
  if (folder.uri.scheme === uri.scheme && isUnder(uri, folder)) {
    const fromApi = uri.scheme === 'file' ? undefined : vscode.workspace.asRelativePath(uri, false);
    if (fromApi !== undefined && !pathIsAbsolute(fromApi)) {
      return fromApi === '' ? undefined : fromApi;
    }
  }
  return relativeUriPath(uri.path, folder.uri.path);
}

/**
 * 判断相对路径转换成绝对路径后是否仍是绝对路径。
 *
 * @param value - `asRelativePath` 的返回值。
 * @returns 该值看起来是不是一个绝对路径。
 */
function pathIsAbsolute(value: string): boolean {
  return /^([a-zA-Z]:[\\/]|\/)/.test(value);
}

/**
 * 把树模型里的文件还原成资源。
 *
 * @param node - 文件节点。
 * @returns 该文件的 URI。
 */
export function uriOf(node: FileNode): vscode.Uri {
  return vscode.Uri.joinPath(node.folder.uri, ...node.relativePath.split('/'));
}

/** 提供「CSV 配置表」视图的数据。 */
export class CsvTreeDataProvider
  implements vscode.TreeDataProvider<CsvTreeNode>, vscode.Disposable
{
  private readonly emitter = new vscode.EventEmitter<CsvTreeNode | undefined>();
  private entries: readonly CsvEntry[] = [];
  private scanning: Promise<void> | null = null;
  private disposed = false;

  /** 扫描完成（或失败）后触发，视图会重新取一遍节点。 */
  public readonly onDidChangeTreeData = this.emitter.event;

  /** 释放事件发射器。 */
  public dispose(): void {
    this.disposed = true;
    this.emitter.dispose();
  }

  /**
   * 重新扫描工作区，然后刷新整棵树。
   *
   * 并发调用共享同一次扫描；扫描完成前视图显示占位节点。
   *
   * @returns 扫描结束（无论成功还是失败）时兑现的 Promise。
   */
  public refresh(): Promise<void> {
    if (this.disposed) {
      return Promise.resolve();
    }
    if (this.scanning === null) {
      this.emitter.fire(undefined);
      this.scanning = this.scan()
        .then(next => {
          this.entries = next;
        })
        .catch((error: unknown) => {
          void vscode.window.showErrorMessage(
            'CSV 配置表：扫描工作区失败 —— ' +
              (error instanceof Error ? error.message : String(error)),
          );
        })
        .finally(() => {
          this.scanning = null;
          if (!this.disposed) {
            this.emitter.fire(undefined);
          }
        });
    }
    return this.scanning;
  }

  /**
   * 把一个节点翻译成视图项。
   *
   * @param node - 树模型节点。
   * @returns 对应的视图项。
   */
  public getTreeItem(node: CsvTreeNode): vscode.TreeItem {
    switch (node.kind) {
      case 'folder':
        return this.folderItem(node);
      case 'file':
        return this.fileItem(node);
      case 'state':
        return this.stateItem(node);
    }
  }

  /**
   * 取某个节点的直接子节点；省略参数表示树的根。
   *
   * @param node - 树模型节点。
   * @returns 该层的子节点。
   */
  public getChildren(node?: CsvTreeNode): CsvTreeNode[] {
    if (node === undefined) {
      if (this.scanning !== null && this.entries.length === 0) {
        return [stateNode('scanning', SCANNING_MESSAGE, 'sync~spin')];
      }
      if ((vscode.workspace.workspaceFolders?.length ?? 0) === 0) {
        return [
          stateNode('no-workspace', '打开一个文件夹后，这里会列出其中的 CSV 文件', 'folder-opened', {
            command: 'vscode.openFolder',
            title: '打开文件夹',
          }),
        ];
      }
      if (this.entries.length === 0) {
        return [stateNode('empty', '工作区里没有 .csv / .tsv 文件', 'info')];
      }
      return rootNodes(this.entries);
    }
    if (node.kind !== 'folder') {
      return [];
    }
    return childNodesOf(this.entries, node.folder, node.path);
  }

  /**
   * 真正去问文件系统。
   *
   * @returns 去重后的条目。
   */
  private async scan(): Promise<CsvEntry[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    logScan(
      `开始扫描：工作区 ${folders.length} 个 [${folders.map(folder => folder.uri.fsPath).join(' | ')}]，` +
        `模式 ${CSV_GLOB}`,
    );
    const uris = await vscode.workspace.findFiles(CSV_GLOB, undefined, SCAN_LIMIT);
    const seen = new Set<string>();
    const entries: CsvEntry[] = [];
    let skippedNotCsv = 0;
    let skippedNoFolder = 0;
    for (const uri of uris) {
      if (!isCsvResource(uri)) {
        skippedNotCsv += 1;
        continue;
      }
      const folder = vscode.workspace.getWorkspaceFolder(uri);
      if (folder === undefined) {
        skippedNoFolder += 1;
        continue;
      }
      const relative = relativePath(folder, uri);
      if (relative === undefined) {
        skippedNoFolder += 1;
        continue;
      }
      const key = entryKey(uri);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      entries.push({ folder, relativePath: relative, key });
    }
    logScan(
      `扫描结束：命中 ${uris.length} 个，收录 ${entries.length} 个` +
        `（扩展名不符 ${skippedNotCsv}，不在任何工作区文件夹下 ${skippedNoFolder}）`,
    );
    return entries;
  }

  /**
   * 渲染一个文件夹节点。
   *
   * @param node - 文件夹节点。
   * @returns 视图项。
   */
  private folderItem(node: FolderNode): vscode.TreeItem {
    const hasChildren = childNodesOf(this.entries, node.folder, node.path).length > 0;
    const item = new vscode.TreeItem(
      node.label,
      hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    item.id = node.key;
    item.contextValue = 'dshCsv.folder';
    item.iconPath = vscode.ThemeIcon.Folder;
    item.tooltip = node.path === '' ? node.label : node.path;
    return item;
  }

  /**
   * 渲染一个文件节点。
   *
   * @param node - 文件节点。
   * @returns 视图项；点击就在右侧打开表格视图。
   */
  private fileItem(node: FileNode): vscode.TreeItem {
    const uri = uriOf(node);
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.id = node.key;
    item.contextValue = 'dshCsv.file';
    item.resourceUri = uri;
    item.tooltip = node.relativePath;
    item.command = {
      command: 'dshCsv.openInTable',
      title: '打开表格视图',
      arguments: [uri],
    };
    return item;
  }

  /**
   * 渲染占位节点。
   *
   * @param node - 占位节点。
   * @returns 视图项。
   */
  private stateItem(node: StateNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.id = node.key;
    item.contextValue = 'dshCsv.state';
    item.iconPath = new vscode.ThemeIcon(node.icon);
    if (node.command !== undefined) {
      item.command = node.command;
    }
    return item;
  }
}

/**
 * 构造一个占位节点。
 *
 * @param reason - 占位原因，参与节点标识。
 * @param label - 显示文案。
 * @param icon - codicon 名字。
 * @param command - 点击时执行的命令。
 * @returns 占位节点。
 */
function stateNode(
  reason: string,
  label: string,
  icon: string,
  command?: vscode.Command,
): StateNode {
  return { kind: 'state', key: stateKey(reason), label, icon, command };
}
