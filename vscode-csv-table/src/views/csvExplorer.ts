/**
 * 活动栏入口与「CSV 配置表」侧边栏视图的装配。
 *
 * 视图只是一棵文件树，交互都在命令里：点文件就在右侧打开表格视图，标题栏可以
 * 手动刷新，右键可以定位到系统资源管理器或复制路径。文件系统监听只用于让树里
 * 的增删及时反映出来，树的数据仍然来自一次完整扫描。
 */

import * as vscode from 'vscode';

import { openAsTable } from '../commands';
import { CSV_GLOB, CsvTreeDataProvider, uriOf } from './csvTreeProvider';
import type { CsvTreeNode, FileNode } from './treeModel';

/** 侧边栏视图的标识，与 `package.json` 中 `views` 的键一致。 */
export const CSV_FILES_VIEW_ID = 'csvExplorer.files';

/** 把连续的文件系统事件合并成一次扫描的等待时间。 */
const RESCAN_DELAY_MS = 300;

/** 把活动栏入口、文件树与它的命令接到扩展上下文上。 */
export class CsvExplorer implements vscode.Disposable {
  private readonly provider: CsvTreeDataProvider;
  private readonly tree: vscode.TreeView<CsvTreeNode>;
  private readonly disposables: vscode.Disposable[] = [];
  private rescanTimer: NodeJS.Timeout | null = null;
  private disposed = false;

  /**
   * 创建视图并注册它的命令。
   *
   * @param context - 扩展上下文，注册项会挂到它的 `subscriptions` 上。
   */
  public constructor(context: vscode.ExtensionContext) {
    this.provider = new CsvTreeDataProvider();
    this.tree = vscode.window.createTreeView(CSV_FILES_VIEW_ID, {
      treeDataProvider: this.provider,
      showCollapseAll: true,
    });

    const watcher = vscode.workspace.createFileSystemWatcher(CSV_GLOB);
    this.disposables.push(
      this.provider,
      this.tree,
      watcher,
      watcher.onDidCreate(() => this.scheduleRescan()),
      watcher.onDidDelete(() => this.scheduleRescan()),
      vscode.commands.registerCommand('dshCsv.refreshFiles', () => this.refresh()),
      vscode.commands.registerCommand('dshCsv.openFileInTable', (node: FileNode) =>
        openAsTable(uriOf(node)),
      ),
      vscode.commands.registerCommand('dshCsv.revealInOs', (node: FileNode) =>
        vscode.commands.executeCommand('revealFileInOS', uriOf(node)),
      ),
      vscode.commands.registerCommand('dshCsv.revealInExplorer', (node: FileNode) =>
        vscode.commands.executeCommand('revealInExplorer', uriOf(node)),
      ),
      vscode.commands.registerCommand('dshCsv.copyPath', (node: FileNode) =>
        vscode.env.clipboard.writeText(uriOf(node).fsPath),
      ),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.refresh();
      }),
    );

    context.subscriptions.push(this);
    void this.refresh();
  }

  /** 释放视图、监听器与定时器。 */
  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (this.rescanTimer !== null) {
      clearTimeout(this.rescanTimer);
      this.rescanTimer = null;
    }
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }

  /**
   * 重新扫描并刷新视图。
   *
   * @returns 扫描结束时兑现的 Promise。
   */
  public refresh(): Promise<void> {
    return this.provider.refresh();
  }

  /** 把短时间内的多次文件系统事件合并成一次扫描。 */
  private scheduleRescan(): void {
    if (this.disposed) {
      return;
    }
    if (this.rescanTimer !== null) {
      clearTimeout(this.rescanTimer);
    }
    this.rescanTimer = setTimeout(() => {
      this.rescanTimer = null;
      void this.provider.refresh();
    }, RESCAN_DELAY_MS);
  }
}
