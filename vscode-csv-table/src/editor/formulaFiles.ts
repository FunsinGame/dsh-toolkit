/**
 * 公式引用的外部 CSV 文件：解析路径、读取内容，并监听它们的改动。
 *
 * 被引用的文件可能没有被打开过，所以这里走 `vscode.workspace.fs`（虚拟工作区
 * 同样适用）；如果它正好在编辑器里开着，就读那份内存文本，这样「编辑别的表 →
 * 本表的引用值跟着变」不需要先保存。
 */

import * as vscode from 'vscode';

import { parseCsv } from '../csv/csv';
import {
  firstDataRowOf,
  MAX_FORMULA_FILES,
  normalizeFormulaPath,
  type FormulaTable,
} from '../csv/formula';

/** 一次 {@link FormulaFiles.read} 的结果。 */
export interface FormulaReadResult {
  /** 路径（公式里的原文）→ 解析后的表。 */
  readonly tables: Map<string, FormulaTable>;
  /** 读取失败的说明。 */
  readonly errors: string[];
  /** 本次真正读到的文件，用于建立监听。 */
  readonly uris: vscode.Uri[];
}

/** 读取并监听公式引用的文件。 */
export class FormulaFiles implements vscode.Disposable {
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  private disposed = false;

  /**
   * 创建读取器。
   *
   * @param documentUri - 写公式的文件，相对路径优先从这里算。
   * @param onChange - 被引用文件发生变化时调用。
   */
  public constructor(
    private readonly documentUri: vscode.Uri,
    private readonly onChange: () => void,
  ) {}

  /** 释放所有文件监听。 */
  public dispose(): void {
    this.disposed = true;
    for (const watcher of this.watchers.values()) {
      watcher.dispose();
    }
    this.watchers.clear();
  }

  /**
   * 判断某个资源是不是本文件公式引用到的文件。
   *
   * @param uri - 待判断的资源。
   * @returns 上一次 {@link read} 读到过它时为真。
   */
  public knows(uri: vscode.Uri): boolean {
    return this.watchers.has(uri.toString());
  }

  /**
   * 读入公式引用到的所有文件。
   *
   * @param paths - 公式里写的路径（原文）。
   * @returns 解析后的表与失败说明。
   */
  public async read(paths: readonly string[]): Promise<FormulaReadResult> {
    const tables = new Map<string, FormulaTable>();
    const errors: string[] = [];
    const uris: vscode.Uri[] = [];
    const seen = new Set<string>();
    let count = 0;
    for (const path of paths) {
      const key = normalizeFormulaPath(path);
      if (key === '' || seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (count >= MAX_FORMULA_FILES) {
        errors.push(`一次最多引用 ${MAX_FORMULA_FILES} 个文件，已忽略：${path}`);
        continue;
      }
      count += 1;
      const uri = await this.resolve(path);
      if (uri === null) {
        errors.push(`未找到被引用的文件：${path}`);
        continue;
      }
      const text = await this.readText(uri);
      if (text === null) {
        errors.push(`无法读取：${path}`);
        continue;
      }
      const table = parseCsv(text, { delimiter: 'auto' });
      tables.set(key, { rows: table.rows, firstDataRow: firstDataRowOf(table.rows) });
      uris.push(uri);
      this.watch(uri);
    }
    return { tables, errors, uris };
  }

  /**
   * 把公式里的路径解析成一个存在的文件。
   *
   * 依次尝试：本文件所在目录、工作区根目录、路径本身（绝对路径或 URI）。
   *
   * @param path - 公式里写的路径。
   * @returns 文件 URI；都找不到时为 `null`。
   */
  private async resolve(path: string): Promise<vscode.Uri | null> {
    const cleaned = path.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    const candidates: vscode.Uri[] = [];
    if (/^[a-zA-Z]+:\/\//.test(cleaned)) {
      candidates.push(vscode.Uri.parse(cleaned));
    } else if (/^[a-zA-Z]:\//.test(cleaned)) {
      candidates.push(vscode.Uri.file(cleaned));
    } else {
      const folder = vscode.Uri.joinPath(this.documentUri, '..');
      candidates.push(vscode.Uri.joinPath(folder, cleaned));
      for (const workspace of vscode.workspace.workspaceFolders ?? []) {
        candidates.push(vscode.Uri.joinPath(workspace.uri, cleaned));
      }
    }
    for (const candidate of candidates) {
      try {
        await vscode.workspace.fs.stat(candidate);
        return candidate;
      } catch (error) {
        void error;
      }
    }
    return null;
  }

  /**
   * 读取文件内容。
   *
   * @param uri - 文件 URI。
   * @returns 文本；读不到时为 `null`。
   */
  private async readText(uri: vscode.Uri): Promise<string | null> {
    const open = vscode.workspace.textDocuments.find(
      document => document.uri.toString() === uri.toString(),
    );
    if (open !== undefined) {
      return open.getText();
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return new TextDecoder('utf-8').decode(bytes);
    } catch (error) {
      void error;
      return null;
    }
  }

  /**
   * 监听一个被引用的文件。
   *
   * 监听父目录里同名文件的变化，这样文件被删除后重建也能收到通知。
   *
   * @param uri - 文件 URI。
   */
  private watch(uri: vscode.Uri): void {
    if (this.disposed) {
      return;
    }
    const key = uri.toString();
    if (this.watchers.has(key)) {
      return;
    }
    const name = uri.path.split('/').pop() ?? '';
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.joinPath(uri, '..'), name),
    );
    const notify = (): void => this.onChange();
    watcher.onDidChange(notify);
    watcher.onDidCreate(notify);
    watcher.onDidDelete(notify);
    this.watchers.set(key, watcher);
  }
}
