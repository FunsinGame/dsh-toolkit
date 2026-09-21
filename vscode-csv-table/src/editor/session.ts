/**
 * 一个已打开的表格视图。
 *
 * 会话持有文档解析后的行，应用视图请求的修改，并用「整张表」（`update`）或
 * 「新的行投影」（`view`）作答。视图本身从不解析 CSV，因此文件内容以宿主为
 * 唯一真相来源。
 */

import * as vscode from 'vscode';

import { parseCsv, serializeCsv, type CsvTable } from '../csv/csv';
import {
  applyOp,
  columnCount,
  detectHeader,
  EMPTY_FILTER,
  filterRows,
  withDelimiter,
  type CsvOp,
  type RowFilter,
  type SortDirection,
} from '../csv/table';

/** 首行的处理方式。 */
export type HeaderMode = 'auto' | 'yes' | 'no';

/** 最近一次应用到文档的排序，用于在表头上显示指示箭头。 */
export interface SortState {
  readonly column: number;
  readonly direction: SortDirection;
}

/** 生命周期长于单个编辑器页签的表格视图状态。 */
export interface ViewState {
  /** `'auto'` 或用户选定的具体分隔符。 */
  readonly delimiter: string;
  /** 首行是否为表头。 */
  readonly header: HeaderMode;
  /** 非破坏性的行过滤条件。 */
  readonly filter: RowFilter;
  /** 列序号（字符串键）到像素宽度。 */
  readonly columnWidths: Record<string, number>;
  /** 文档最近一次排序所依据的列。 */
  readonly sort: SortState | null;
}

/** 用户尚未做任何选择前的视图状态。 */
export const DEFAULT_VIEW_STATE: ViewState = {
  delimiter: 'auto',
  header: 'auto',
  filter: EMPTY_FILTER,
  columnWidths: {},
  sort: null,
};

/** 表格视图发给编辑器的消息。 */
export type WebviewMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'view'; readonly state: ViewState }
  | { readonly type: 'op'; readonly opId: number; readonly op: CsvOp }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }
  | { readonly type: 'clipboard'; readonly text: string }
  | { readonly type: 'error'; readonly message: string };

/** 视图要渲染的行与元数据。 */
export interface TableProjection {
  readonly rows: string[][];
  /** 通过过滤条件、指向 {@link rows} 的序号，升序排列。 */
  readonly visible: number[];
  readonly hasHeader: boolean;
  readonly columnCount: number;
  /** 截断之前文档中的数据行数。 */
  readonly totalRows: number;
  readonly truncated: boolean;
  readonly readOnly: boolean;
  readonly filterError: string;
  readonly delimiter: string;
  readonly detectedDelimiter: string;
  readonly delimiterIsAuto: boolean;
  readonly eol: string;
  readonly bom: boolean;
  readonly columnWidthMax: number;
  readonly sort: SortState | null;
}

/**
 * 判断过滤条件是否对任何行构成约束。
 *
 * @param filter - 待检查的过滤条件。
 * @returns 过滤条件是否为空。
 */
function filterIsEmpty(filter: RowFilter): boolean {
  if ((filter.query ?? '') !== '') {
    return false;
  }
  return Object.values(filter.columns ?? {}).every(value => (value ?? '') === '');
}

/**
 * 读取扩展配置的分隔符。
 *
 * @returns `'auto'` 或某个具体的分隔符。
 */
export function configuredDelimiter(): string {
  const value = vscode.workspace.getConfiguration('dshCsv').get<string>('delimiter', 'auto');
  return value ?? 'auto';
}

/**
 * 读取扩展配置的表头模式。
 *
 * @returns 配置的模式。
 */
function configuredHeader(): HeaderMode {
  const value = vscode.workspace.getConfiguration('dshCsv').get<string>('header', 'auto');
  return value === 'yes' || value === 'no' ? value : 'auto';
}

/**
 * 读取视图最多渲染的数据行数。
 *
 * @returns 一个正的行数上限。
 */
function configuredMaxRows(): number {
  const value = vscode.workspace.getConfiguration('dshCsv').get<number>('maxRows', 20000);
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : 20000;
}

/**
 * 读取自动列宽的上限。
 *
 * @returns 一个正的像素宽度。
 */
function configuredColumnWidthMax(): number {
  const config = vscode.workspace.getConfiguration('dshCsv');
  const value = config.get<number>('columnWidth.max', 480);
  return typeof value === 'number' && Number.isFinite(value) && value >= 60 ? Math.floor(value) : 480;
}

/**
 * 读取并校验持久化的视图状态。
 *
 * 工作区状态是持久化边界，因此由其他版本写入的值会在这里收窄，而不会未经
 * 检查就进入表格视图。
 *
 * @param raw - 从工作区状态读到的值。
 * @returns 可用的视图状态。
 */
export function normalizeViewState(raw: unknown): ViewState {
  if (typeof raw !== 'object' || raw === null) {
    return DEFAULT_VIEW_STATE;
  }
  const candidate = raw as Partial<ViewState>;
  const filter = candidate.filter;
  return {
    delimiter: typeof candidate.delimiter === 'string' ? candidate.delimiter : 'auto',
    header: candidate.header === 'yes' || candidate.header === 'no' ? candidate.header : 'auto',
    filter:
      typeof filter === 'object' && filter !== null
        ? {
            query: typeof filter.query === 'string' ? filter.query : '',
            mode:
              filter.mode === 'equals' || filter.mode === 'startsWith' || filter.mode === 'regex'
                ? filter.mode
                : 'contains',
            caseSensitive: filter.caseSensitive === true,
            columns:
              typeof filter.columns === 'object' && filter.columns !== null ? filter.columns : {},
          }
        : EMPTY_FILTER,
    columnWidths:
      typeof candidate.columnWidths === 'object' && candidate.columnWidths !== null
        ? candidate.columnWidths
        : {},
    sort:
      typeof candidate.sort === 'object' &&
      candidate.sort !== null &&
      typeof candidate.sort.column === 'number' &&
      (candidate.sort.direction === 'asc' || candidate.sort.direction === 'desc')
        ? { column: candidate.sort.column, direction: candidate.sort.direction }
        : null,
  };
}

/**
 * 保存某个文档视图状态的工作区状态键。
 *
 * @param uri - 状态所属的文档。
 * @returns 持久化用的键。
 */
export function viewStateKey(uri: vscode.Uri): string {
  return `dshCsv.view:${uri.toString()}`;
}

/** 驱动一个自定义编辑器面板。 */
export class CsvTableSession implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private state: ViewState;
  private revision = 0;
  private lastPostedText: string | null = null;
  private disposed = false;
  // 消息按顺序到达，但每次修改都要等 `applyEdit`；把它们串起来可以避免后一次
  // 修改在前一次落盘之前就解析文档。
  private queue: Promise<void> = Promise.resolve();

  /**
   * 把一个会话连接到它的面板上。
   *
   * @param context - 扩展上下文，用于持久化视图状态。
   * @param document - 正在编辑的 CSV 文本文档。
   * @param panel - 承载表格视图的面板。
   * @param state - 从更早的会话恢复的视图状态（如果有）。
   */
  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly document: vscode.TextDocument,
    private readonly panel: vscode.WebviewPanel,
    state: ViewState,
  ) {
    this.state = state;
    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
        this.enqueue(() => this.handleMessage(message));
      }),
      vscode.workspace.onDidChangeTextDocument(event => this.handleDocumentChange(event)),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('dshCsv')) {
          this.postUpdate(null);
        }
      }),
      this.panel.onDidDispose(() => this.dispose()),
    );
  }

  /** 释放会话的监听器。 */
  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }

  /**
   * 当改动不是来自本面板时，重新推送整张表。
   *
   * @param event - 文本文档改动事件。
   */
  private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (event.document.uri.toString() !== this.document.uri.toString()) {
      return;
    }
    if (event.document.getText() === this.lastPostedText) {
      return;
    }
    this.postUpdate(null);
  }

  /**
   * 让一个消息处理函数排在它之前排队的处理函数之后执行。
   *
   * @param task - 要执行的工作。
   */
  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(task).catch((error: unknown) => {
      void vscode.window.showErrorMessage(
        'CSV 表格视图错误：' + (error instanceof Error ? error.message : String(error)),
      );
    });
  }

  /**
   * 分发来自表格视图的一条消息。
   *
   * @param message - 视图发来的消息。
   */
  private async handleMessage(message: WebviewMessage): Promise<void> {
    if (this.disposed) {
      return;
    }
    switch (message.type) {
      case 'ready':
        this.lastPostedText = null;
        this.postUpdate(null);
        return;
      case 'view':
        await this.updateViewState(message.state);
        return;
      case 'op':
        await this.applyOperation(message.opId, message.op);
        return;
      case 'undo':
        await vscode.commands.executeCommand('undo');
        return;
      case 'redo':
        await vscode.commands.executeCommand('redo');
        return;
      case 'clipboard':
        await vscode.env.clipboard.writeText(message.text);
        return;
      case 'error':
        void vscode.window.showWarningMessage('CSV 表格视图：' + message.message);
        return;
      default:
        return;
    }
  }

  /**
   * 保存只影响显示的改动，并重新推送行投影。
   *
   * @param state - 视图发来的视图状态。
   */
  private async updateViewState(state: ViewState): Promise<void> {
    const normalized = normalizeViewState(state);
    // 新的分隔符会改变文本的切分方式，所以要把行重新发给视图；其他视图状态
    // 的变化只需要重新投影。
    const delimiterChanged = normalized.delimiter !== this.state.delimiter;
    this.state = normalized;
    await this.context.workspaceState.update(this.stateKey(), normalized);
    if (delimiterChanged) {
      this.postUpdate(null);
    } else {
      this.postView();
    }
  }

  /**
   * 应用一次修改，并重新推送整张表。
   *
   * @param opId - 视图为这次修改分配的编号。
   * @param op - 要应用的修改。
   */
  private async applyOperation(opId: number, op: CsvOp): Promise<void> {
    const table = this.parse();
    const rows = applyOp(table.rows, op);
    const dialect =
      op.kind === 'setDelimiter' ? withDelimiter(table.dialect, op.delimiter) : table.dialect;
    const nextText = serializeCsv(rows, dialect);

    if (op.kind === 'sort') {
      this.state = { ...this.state, sort: { column: op.column, direction: op.direction } };
      await this.context.workspaceState.update(this.stateKey(), this.state);
    }

    if (nextText === this.document.getText()) {
      this.postUpdate(opId);
      return;
    }

    // 在修改落盘之前先认领新文本：随后触发的改动事件会看到「已经推送过的
    // 内容」，从而不会再推一次。
    this.lastPostedText = nextText;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(this.document.uri, this.fullDocumentRange(), nextText);
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      this.panel.webview.postMessage({ type: 'toast', message: '无法修改文档。' });
      this.postUpdate(opId);
      return;
    }

    if (op.kind === 'sort') {
      this.panel.webview.postMessage({
        type: 'toast',
        message: '已按该列排序并写入文件，可用 Ctrl+Z 撤销。',
      });
    }
    this.postUpdate(opId);
  }

  /**
   * 覆盖整篇文档的范围。
   *
   * @returns 文档的完整范围。
   */
  private fullDocumentRange(): vscode.Range {
    const text = this.document.getText();
    return new vscode.Range(this.document.positionAt(0), this.document.positionAt(text.length));
  }

  /**
   * 用当前生效的分隔符解析文档文本。
   *
   * @returns 解析出的行与书写方式。
   */
  private parse(): CsvTable {
    const configured = this.state.delimiter !== 'auto' ? this.state.delimiter : configuredDelimiter();
    return parseCsv(this.document.getText(), { delimiter: configured });
  }

  /**
   * 结合解析出的行确定表头模式。
   *
   * @param rows - 解析出的行。
   * @returns 第 `0` 行是否为表头。
   */
  private resolveHeader(rows: readonly (readonly string[])[]): boolean {
    const mode = this.state.header !== 'auto' ? this.state.header : configuredHeader();
    if (mode === 'yes') {
      return rows.length > 0;
    }
    if (mode === 'no') {
      return false;
    }
    return detectHeader(rows);
  }

  /**
   * 构造视图要渲染的行与元数据。
   *
   * @param table - 解析后的文档。
   * @returns 要发送的投影。
   */
  private project(table: CsvTable): TableProjection {
    const hasHeader = this.resolveHeader(table.rows);
    const maxRows = configuredMaxRows();
    const truncated = table.rows.length > maxRows;
    const rows = truncated ? table.rows.slice(0, maxRows) : table.rows;

    // 顶部固定条只显示列号，文件里的每一行（包括首行）都作为数据行渲染，
    // 因此过滤从第 0 行开始。
    let visible: number[];
    let filterError = '';
    if (filterIsEmpty(this.state.filter)) {
      visible = [];
      for (let index = 0; index < rows.length; index += 1) {
        visible.push(index);
      }
    } else {
      const result = filterRows(rows, this.state.filter, 0);
      visible = result.indices;
      filterError = result.error ?? '';
    }

    return {
      rows,
      visible,
      hasHeader,
      columnCount: Math.max(columnCount(rows), rows.length > 0 ? 1 : 0),
      totalRows: table.rows.length,
      truncated,
      readOnly: truncated,
      filterError,
      delimiter: table.dialect.delimiter,
      detectedDelimiter: table.dialect.detected
        ? table.dialect.delimiter
        : parseCsv(this.document.getText(), { delimiter: 'auto' }).dialect.delimiter,
      delimiterIsAuto: this.state.delimiter === 'auto',
      eol: table.dialect.eol,
      bom: table.dialect.bom,
      columnWidthMax: configuredColumnWidthMax(),
      sort: this.state.sort,
    };
  }

  /**
   * 把整张表发给视图。
   *
   * @param opId - 产生这段文本的修改编号；外部改动传 `null`。
   */
  private postUpdate(opId: number | null): void {
    if (this.disposed) {
      return;
    }
    const text = this.document.getText();
    this.lastPostedText = text;
    this.revision += 1;
    this.panel.webview.postMessage({
      type: 'update',
      revision: this.revision,
      opId,
      documentUri: this.document.uri.toString(),
      // 视图在第一次更新时用它恢复各个控件，这样带筛选重新打开文档时，工具栏
      // 上仍然显示着那个筛选条件。
      viewState: {
        delimiter: this.state.delimiter,
        header: this.state.header,
        filter: this.state.filter,
        columnWidths: this.state.columnWidths,
        sort: this.state.sort,
      },
      ...this.project(this.parse()),
    });
  }

  /** 只重新推送行投影，不重发行本身。 */
  private postView(): void {
    if (this.disposed) {
      return;
    }
    const projection = this.project(this.parse());
    this.revision += 1;
    this.panel.webview.postMessage({
      type: 'view',
      revision: this.revision,
      visible: projection.visible,
      hasHeader: projection.hasHeader,
      totalRows: projection.totalRows,
      truncated: projection.truncated,
      readOnly: projection.readOnly,
      filterError: projection.filterError,
    });
  }

  /**
   * 保存本文档视图状态的工作区状态键。
   *
   * @returns 持久化用的键。
   */
  private stateKey(): string {
    return viewStateKey(this.document.uri);
  }
}
