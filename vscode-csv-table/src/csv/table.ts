/**
 * 针对已解析 CSV 行的表格操作。
 *
 * 所有操作都是作用于 `string[][]` 的纯函数，因此由调用方决定结果是写回文档
 * 还是只用于显示。行保持「参差不齐」：只有确实需要某个单元格存在时才会补齐。
 */

import { type CsvDialect } from './csv';

/** 按列排序的方向。 */
export type SortDirection = 'asc' | 'desc';

/** 过滤条件与单元格的匹配方式。 */
export type MatchMode = 'contains' | 'equals' | 'startsWith' | 'regex';

/** 表格视图持有的非破坏性行过滤条件。 */
export interface RowFilter {
  /** 作用于所有「没有单独设置过滤条件」的列的关键词。 */
  readonly query: string;
  /** {@link query} 与 {@link columns} 的匹配方式。 */
  readonly mode: MatchMode;
  /** 是否区分大小写。 */
  readonly caseSensitive: boolean;
  /** 以列序号为键的单列过滤词；空字符串表示该列不加约束。 */
  readonly columns: Readonly<Record<number, string>>;
}

/** 保留全部行的空过滤条件。 */
export const EMPTY_FILTER: RowFilter = {
  query: '',
  mode: 'contains',
  caseSensitive: false,
  columns: {},
};

/**
 * 表格视图请求编辑器应用到文档上的一次修改。
 *
 * 行列序号直接指向解析出的行，因此当文档有表头时序号 `0` 就是表头行。
 * `setDelimiter` 不修改任何单元格，由调用方用新的分隔符重写整篇文档。
 */
export type CsvOp =
  | { readonly kind: 'initGrid'; readonly columns: number; readonly rows: number }
  | { readonly kind: 'setCell'; readonly row: number; readonly column: number; readonly value: string }
  | { readonly kind: 'setRow'; readonly row: number; readonly values: readonly string[] }
  | {
      readonly kind: 'clearRange';
      readonly rowStart: number;
      readonly rowEnd: number;
      readonly columnStart: number;
      readonly columnEnd: number;
    }
  | { readonly kind: 'insertRows'; readonly index: number; readonly count: number; readonly width: number }
  | { readonly kind: 'deleteRows'; readonly indices: readonly number[] }
  | { readonly kind: 'moveRow'; readonly from: number; readonly to: number }
  | { readonly kind: 'moveRows'; readonly indices: readonly number[]; readonly to: number }
  | { readonly kind: 'insertColumns'; readonly index: number; readonly count: number }
  | { readonly kind: 'deleteColumns'; readonly indices: readonly number[] }
  | { readonly kind: 'moveColumns'; readonly indices: readonly number[]; readonly to: number }
  | { readonly kind: 'sort'; readonly column: number; readonly direction: SortDirection; readonly hasHeader: boolean }
  | { readonly kind: 'setDelimiter'; readonly delimiter: string };

/** 对一段行区间应用过滤条件的结果。 */
export interface FilterResult {
  /** 命中行的序号，按升序排列。 */
  readonly indices: number[];
  /** 正则表达式非法时给出错误信息。 */
  readonly error?: string;
}

/**
 * 去重、排序并剔除越界的行列序号。
 *
 * @param indices - 待处理的序号。
 * @param size - 行数或列数。
 * @returns 升序排列的有效序号。
 */
function normalizeIndices(indices: readonly number[], size: number): number[] {
  const unique = new Set<number>();
  for (const index of indices) {
    if (Number.isInteger(index) && index >= 0 && index < size) {
      unique.add(index);
    }
  }
  return [...unique].sort((left, right) => left - right);
}

/**
 * 计算被移动项在「移除之后」数组中的插入位置。
 *
 * @param moving - 参与移动的序号（升序）。
 * @param to - 目标位置，表示插入到原数组该序号之前。
 * @returns 剩余数组中的插入下标。
 */
function insertionPoint(moving: readonly number[], to: number): number {
  const movingSet = new Set(moving);
  let insertAt = 0;
  for (let index = 0; index < to; index += 1) {
    if (!movingSet.has(index)) {
      insertAt += 1;
    }
  }
  return insertAt;
}

/**
 * 对可辨识联合中不可达的分支抛出编译期错误。
 *
 * @param value - 必须为 `never` 的值。
 * @returns 永不返回；调用一定会抛错。
 */
function assertNever(value: never): never {
  throw new Error(`未处理的 CSV 操作：${JSON.stringify(value)}`);
}

/**
 * 复制行，使调用方可以比较修改前后的内容。
 *
 * @param rows - 要复制的行。
 * @returns 一份互不影响的副本。
 */
function cloneRows(rows: readonly (readonly string[])[]): string[][] {
  return rows.map(row => row.slice());
}

/**
 * 返回最宽的一行的长度，即表格的列数。
 *
 * @param rows - 要测量的行。
 * @returns 最大行长；没有行时为 `0`。
 */
export function columnCount(rows: readonly (readonly string[])[]): number {
  let width = 0;
  for (const row of rows) {
    if (row.length > width) {
      width = row.length;
    }
  }
  return width;
}

/**
 * 把一行用空单元格补齐到 `width` 长度。
 *
 * @param row - 要补齐的行。
 * @param width - 目标长度。
 * @returns 至少包含 `width` 个单元格的行。
 */
export function padRow(row: readonly string[], width: number): string[] {
  const padded = row.slice();
  while (padded.length < width) {
    padded.push('');
  }
  return padded;
}

/**
 * 把单元格解析为数值，用于按数值比较。
 *
 * @param value - 单元格内容。
 * @returns 数值；不是数字时返回 `null`。
 */
export function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '' || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 比较两个单元格：数字按数值比较，文本按自然顺序比较。
 *
 * @param left - 左侧单元格。
 * @param right - 右侧单元格。
 * @returns 左侧排在前时为负数，右侧排在前时为正数。
 */
export function compareCellValues(left: string, right: string): number {
  const leftNumber = toNumber(left);
  const rightNumber = toNumber(right);
  if (leftNumber !== null && rightNumber !== null) {
    return leftNumber - rightNumber;
  }
  // 数字排在文本之前，这样以数字为主的列读起来更自然。
  if (leftNumber !== null) {
    return -1;
  }
  if (rightNumber !== null) {
    return 1;
  }
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * 按列排序时比较两个单元格，两个方向上都把空单元格排在最后。
 *
 * @param left - 左侧单元格。
 * @param right - 右侧单元格。
 * @param direction - 排序方向。
 * @returns 左侧排在前时为负数，右侧排在前时为正数。
 */
function compareForSort(left: string, right: string, direction: SortDirection): number {
  const leftEmpty = left.trim() === '';
  const rightEmpty = right.trim() === '';
  if (leftEmpty || rightEmpty) {
    if (leftEmpty && rightEmpty) {
      return 0;
    }
    return leftEmpty ? 1 : -1;
  }
  const result = compareCellValues(left, right);
  return direction === 'asc' ? result : -result;
}

/**
 * 按某一列排序，表头行保持不动。
 *
 * 排序是稳定的：键值相同的行保持原有的文档顺序。
 *
 * @param rows - 要排序的行。
 * @param column - 作为排序依据的列序号。
 * @param direction - 排序方向。
 * @param hasHeader - 第 `0` 行是否为需要固定在最前的表头。
 * @returns 排序后的副本。
 */
export function sortRows(
  rows: readonly (readonly string[])[],
  column: number,
  direction: SortDirection,
  hasHeader: boolean,
): string[][] {
  const start = hasHeader && rows.length > 0 ? 1 : 0;
  const body = rows.slice(start).map((row, index) => ({ row: row.slice(), index }));
  body.sort((left, right) => {
    const result = compareForSort(left.row[column] ?? '', right.row[column] ?? '', direction);
    return result !== 0 ? result : left.index - right.index;
  });
  return [...cloneRows(rows.slice(0, start)), ...body.map(entry => entry.row)];
}

/**
 * 为某个过滤词与匹配方式构造判定函数。
 *
 * @param query - 过滤词。
 * @param mode - 匹配方式。
 * @param caseSensitive - 是否区分大小写。
 * @returns 判定函数；正则非法时返回错误信息。
 */
function buildMatcher(
  query: string,
  mode: MatchMode,
  caseSensitive: boolean,
): { test(value: string): boolean } | { error: string } {
  const effective = caseSensitive ? query : query.toLowerCase();
  switch (mode) {
    case 'contains':
      return { test: value => (caseSensitive ? value : value.toLowerCase()).includes(effective) };
    case 'equals':
      return { test: value => (caseSensitive ? value : value.toLowerCase()) === effective };
    case 'startsWith':
      return { test: value => (caseSensitive ? value : value.toLowerCase()).startsWith(effective) };
    case 'regex':
      try {
        const expression = new RegExp(query, caseSensitive ? '' : 'i');
        return { test: value => expression.test(value) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    default:
      return assertNever(mode);
  }
}

/**
 * 选出满足过滤条件的行。
 *
 * 当每一列的单列过滤词都命中该列，且公共过滤词命中任意一个「未单独设置过滤
 * 条件」的列时，该行命中。过滤词为空表示不加约束。
 *
 * @param rows - 全部行。
 * @param filter - 要应用的过滤条件。
 * @param start - 起始行序号，用于跳过表头行。
 * @returns 命中行的序号（升序）；正则有误时返回错误信息。
 */
export function filterRows(
  rows: readonly (readonly string[])[],
  filter: RowFilter,
  start = 0,
): FilterResult {
  const columnEntries = Object.entries(filter.columns ?? {})
    .map(([key, value]) => ({ column: Number(key), query: value ?? '' }))
    .filter(entry => entry.query !== '')
    .sort((left, right) => left.column - right.column);
  const constrainedColumns = new Set(columnEntries.map(entry => entry.column));

  const columnMatchers: { column: number; test(value: string): boolean }[] = [];
  for (const entry of columnEntries) {
    const matcher = buildMatcher(entry.query, filter.mode, filter.caseSensitive);
    if ('error' in matcher) {
      return { indices: [], error: `列 ${entry.column + 1}：${matcher.error}` };
    }
    columnMatchers.push({ column: entry.column, test: matcher.test });
  }

  const sharedQuery = filter.query ?? '';
  const shared =
    sharedQuery === '' ? null : buildMatcher(sharedQuery, filter.mode, filter.caseSensitive);
  if (shared !== null && 'error' in shared) {
    return { indices: [], error: shared.error };
  }

  const indices: number[] = [];
  for (let index = start; index < rows.length; index += 1) {
    const row = rows[index];
    let matches = true;
    for (const matcher of columnMatchers) {
      if (!matcher.test(row[matcher.column] ?? '')) {
        matches = false;
        break;
      }
    }
    if (matches && shared !== null) {
      let anyUnconstrained = false;
      for (let column = 0; column < row.length; column += 1) {
        if (constrainedColumns.has(column)) {
          continue;
        }
        if (shared.test(row[column])) {
          anyUnconstrained = true;
          break;
        }
      }
      matches = anyUnconstrained;
    }
    if (matches) {
      indices.push(index);
    }
  }
  return { indices };
}

/**
 * 判断第一行是否为表头。
 *
 * 当文档不止一行，且第一行含有至少一个「非空且非数字」的单元格时，认为它是
 * 表头。首行全是数字（或全为空）的文档会把首行当作数据行。
 *
 * @param rows - 全部行。
 * @returns 第 `0` 行是否应固定为表头。
 */
export function detectHeader(rows: readonly (readonly string[])[]): boolean {
  if (rows.length < 2) {
    return false;
  }
  return rows[0].some(cell => cell.trim() !== '' && toNumber(cell) === null);
}

/**
 * 把一次修改应用到行上。
 *
 * @param rows - 当前的行。
 * @param op - 要应用的修改。
 * @returns 新的行；`setDelimiter` 返回内容不变的副本。
 */
export function applyOp(rows: readonly (readonly string[])[], op: CsvOp): string[][] {
  switch (op.kind) {
    case 'initGrid': {
      const width = Math.max(1, op.columns);
      return Array.from({ length: Math.max(1, op.rows) }, () => Array.from({ length: width }, () => ''));
    }

    case 'setCell': {
      if (op.row < 0 || op.row >= rows.length) {
        return cloneRows(rows);
      }
      const next = cloneRows(rows);
      const target = next[op.row];
      while (target.length <= op.column) {
        target.push('');
      }
      target[op.column] = op.value;
      return next;
    }

    case 'setRow': {
      if (op.row < 0 || op.row >= rows.length) {
        return cloneRows(rows);
      }
      const next = cloneRows(rows);
      next[op.row] = op.values.slice();
      return next;
    }

    case 'clearRange': {
      const next = cloneRows(rows);
      const lastRow = Math.min(next.length - 1, op.rowEnd);
      const lastColumn = op.columnEnd;
      for (let row = Math.max(0, op.rowStart); row <= lastRow; row += 1) {
        const target = next[row];
        for (
          let column = Math.max(0, op.columnStart);
          column <= Math.min(target.length - 1, lastColumn);
          column += 1
        ) {
          target[column] = '';
        }
      }
      return next;
    }

    case 'insertRows': {
      const index = Math.min(Math.max(op.index, 0), rows.length);
      const width = Math.max(0, op.width);
      const inserted = Array.from({ length: Math.max(1, op.count) }, () =>
        Array.from({ length: width }, () => ''),
      );
      return [...cloneRows(rows.slice(0, index)), ...inserted, ...cloneRows(rows.slice(index))];
    }

    case 'deleteRows': {
      const drop = new Set(op.indices.filter(index => index >= 0 && index < rows.length));
      if (drop.size === 0) {
        return cloneRows(rows);
      }
      return cloneRows(rows.filter((_row, index) => !drop.has(index)));
    }

    case 'moveRows': {
      const moving = normalizeIndices(op.indices, rows.length);
      if (moving.length === 0) {
        return cloneRows(rows);
      }
      const movingSet = new Set(moving);
      const target = Math.min(Math.max(op.to, 0), rows.length);
      const insertAt = insertionPoint(moving, target);
      const rest = rows
        .filter((_row, index) => !movingSet.has(index))
        .map(row => row.slice());
      const moved = moving.map(index => rows[index].slice());
      return [...rest.slice(0, insertAt), ...moved, ...rest.slice(insertAt)];
    }

    case 'moveRow': {
      if (op.from < 0 || op.from >= rows.length) {
        return cloneRows(rows);
      }
      const next = cloneRows(rows);
      const [moved] = next.splice(op.from, 1);
      const target = Math.min(Math.max(op.to, 0), next.length);
      next.splice(target, 0, moved);
      return next;
    }

    case 'insertColumns': {
      const count = Math.max(1, op.count);
      const index = Math.max(op.index, 0);
      return rows.map(row => {
        const next = padRow(row, index);
        next.splice(index, 0, ...Array.from({ length: count }, () => ''));
        return next;
      });
    }

    case 'deleteColumns': {
      const drop = new Set(op.indices.filter(index => index >= 0));
      if (drop.size === 0) {
        return cloneRows(rows);
      }
      return rows.map(row => row.filter((_cell, index) => !drop.has(index)));
    }

    case 'moveColumns': {
      const width = columnCount(rows);
      const moving = normalizeIndices(op.indices, width);
      if (moving.length === 0) {
        return cloneRows(rows);
      }
      const movingSet = new Set(moving);
      const target = Math.min(Math.max(op.to, 0), width);
      const insertAt = insertionPoint(moving, target);
      // 参与移动的最右一列决定需要补齐到多宽；更短的行会像 insertColumns 一样补空。
      const widest = moving[moving.length - 1] + 1;
      return rows.map(row => {
        const cells = padRow(row, widest);
        const moved = moving.map(index => cells[index]);
        const rest = cells.filter((_cell, index) => !movingSet.has(index));
        return [...rest.slice(0, insertAt), ...moved, ...rest.slice(insertAt)];
      });
    }

    case 'sort':
      return sortRows(rows, op.column, op.direction, op.hasHeader);

    case 'setDelimiter':
      return cloneRows(rows);

    default:
      return assertNever(op);
  }
}

/**
 * 改写书写方式中的分隔符，其余排版属性保持不变。
 *
 * @param dialect - 要修改的书写方式。
 * @param delimiter - 新的分隔符。
 * @returns 使用 `delimiter` 写出的书写方式。
 */
export function withDelimiter(dialect: CsvDialect, delimiter: string): CsvDialect {
  return { ...dialect, delimiter, detected: false };
}
