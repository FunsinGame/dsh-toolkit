/**
 * 「定位到引用表」的待办登记处。
 *
 * 公式的取值可能来自任意 CSV，点击「定位到引用表」时要先打开那张表，再让它滚动并
 * 选中取到值的那一格。打开是异步的（`vscode.openWith` 返回时表格视图往往还没建
 * 好、webview 也还没发出 `ready`），所以这里先把「请定位到这一格」记下来，等那张
 * 表的会话就绪时再按文档 URI 取走。
 */

/** 一次待完成的定位。 */
export interface PendingReveal {
  /** 目标单元格所属文档的 URI 字符串。 */
  readonly uri: string;
  /** 目标单元格的行下标（从 0 开始，与文件行号一致）。 */
  readonly row: number;
  /** 目标单元格的列下标（从 0 开始）。 */
  readonly column: number;
}

/** 文档 URI → 待定位的单元格。 */
const pending = new Map<string, PendingReveal>();

/**
 * 登记一次定位。
 *
 * @param reveal - 要定位的单元格。
 */
export function requestReveal(reveal: PendingReveal): void {
  pending.set(reveal.uri, reveal);
}

/**
 * 取走某个文档待完成的定位。
 *
 * @param uri - 文档 URI。
 * @returns 待定位的单元格；没有登记过时为 `null`。
 */
export function claimReveal(uri: string): PendingReveal | null {
  const reveal = pending.get(uri);
  if (reveal === undefined) {
    return null;
  }
  pending.delete(uri);
  return reveal;
}

/**
 * 丢掉某个文档的定位登记（例如目标文件不是 CSV、根本打不开）。
 *
 * @param uri - 文档 URI。
 */
export function discardReveal(uri: string): void {
  pending.delete(uri);
}
