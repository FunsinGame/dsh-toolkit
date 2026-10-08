/**
 * 单元格里的引用公式：解析、求值，以及整张表的公式投影。
 *
 * 公式以 `=` 开头，写在单元格里，指向**另一张 CSV** 的值。它只影响显示：公式
 * 本身是单元格的真实内容（双击进编辑时看到的就是它），表格视图在不编辑时显示它
 * 算出来的值，读不到时退化成公式原文。因此公式从不写回被引用的文件，也不改变
 * 本文件的字段。
 *
 * 支持的写法（列可以用 `##var` / 表头行里的列名，单个字母的列标 `B`，或 `#2`）：
 *
 * - `=LOOKUP("路径", "键列", 键值, "取值列")` —— 精确匹配键值，取该行取值列的内容。
 *   键值可以写成字面量（`"61001"`）、本表某一列当前行的值（`%C`，**推荐**）、本表
 *   某个具体单元格（`C5`，行是写死的）或 `this`。
 * - `=REF("路径", "键列", 取值列)` —— 简写，键取**本表里与键列同名的列**在当前行的
 *   值。写在一格上就对整列生效，因此同一列只需要在第一行写一次。
 * - `=REF("路径", "键列", 键值, "取值列")` —— 同上，但键值写成字面量或本表某一列，
 *   只作用于自己这一格。
 * - `=CELL("路径", "B12")` —— 直接取某张表某个单元格，行号是文档行号（从 1 开始，
 *   与行号列显示的数字一致）。
 * - `=SUM("路径", "取值列", "键列", 键值)` —— 键匹配的所有行求和。
 * - `=FILTER("路径", "取值列", "键列", 键值, "模板")` —— 键匹配的所有行按模板拼接，
 *   模板里 `{值}` 是该行取值列、`{行}` 是该行的文档行号；省略模板时用 `+` 连接。
 *
 * **只写列、不写行号**：键值参数写 `%C`（C 列）或 `%"名称ID"`（列名）时，行号取
 * 公式自己所在的行。因此整列可以写成完全相同的文本，拖动行号换位、在中间插入行、
 * 把公式复制到别的行都不会指错；换成 `C5` 这种写法，行号是文档行号，移动后就可能
 * 指到别的行上去。
 *
 * 选择「列名」而不是列序号是刻意的：配表里的 `##var`（或表头行）已经写明了列名，
 * 引用方不必知道对方第几列。`%C` / `C5` / `this` 都指向**本表**，被引用的表只按
 * 列名查。
 */

/** 一张被引用的表，已经解析成行列。 */
export interface FormulaTable {
  /** 全部行，按文档顺序，含 `##` 元数据行。 */
  readonly rows: readonly (readonly string[])[];
  /** 第一个数据行的文档行号（从 0 开始）；没有数据行时为 `rows.length`。 */
  readonly firstDataRow: number;
}

/**
 * 供 {@link resolveFormulas} 读取被引用文件。
 *
 * @param path - 公式里写的路径。
 * @returns 解析后的表；读不到时返回 `null`。
 */
export type FormulaFileSource = (path: string) => FormulaTable | null;

/** 一个字符串参数的求值方式。 */
type StringArgument =
  | { readonly kind: 'literal'; readonly text: string }
  | { readonly kind: 'this' }
  | { readonly kind: 'reference'; readonly text: string }
  /** 只写列的写法（`%C`、`%"名称ID"`）：行号取公式自己所在的行。 */
  | { readonly kind: 'column'; readonly text: string };

/**
 * 一个「键」参数的写法。
 *
 * 可以当场写成字面量，也可以指向**本表**的某一列：
 *
 * - `%C` / `%"名称ID"` —— 本表当前行的 C 列（或名为「名称ID」的列）。**推荐**：
 *   不写行号，拖行、插行、把公式复制到别的行都不会指错。
 * - `C3` —— 本表第 3 行的 C 列；行是写死的，移动行之后就可能指错。
 * - `this` —— 本表里与被引用表「键列同名的列」在当前行的值；没有同名列时用公式
 *   自己那一列。
 */
type KeyArgument = StringArgument;

/** 一条公式在求值前需要从本表补读的键。 */
interface FormulaBindings {
  /** 提供键的列（本表）；没有绑定时为 `undefined`。 */
  readonly keyColumnIndex?: number;
  /** 提供键的绝对行号（本表，0 开始）；没有绑定时为 `undefined`。 */
  readonly keyRow?: number;
  /** `=REF` 的键值写在别的单元格时，那一格在本表的列序号。 */
  readonly valueColumnIndex?: number;
  /** `=REF` 的键值写在别的单元格时，那一格相对公式所在行的行偏移。 */
  readonly valueRowOffset?: number;
}

/** 解析时就知道位置、求值时才知道键值的公式。 */
type BoundFormula<T> = T & FormulaBindings;

/** 解析成功的公式。 */
export type ParsedFormula =
  | BoundFormula<{ readonly kind: 'cell'; readonly path: string; readonly cell: string }>
  | BoundFormula<{
      readonly kind: 'lookup';
      readonly path: string;
      readonly keyColumn: string;
      readonly keyArgument: KeyArgument;
      readonly valueColumn: string;
    }>
  | BoundFormula<{
      readonly kind: 'ref';
      readonly path: string;
      /** 被引用表里用于匹配的列。 */
      readonly keyColumn: string;
      readonly valueColumn: string;
      /**
       * 可选的键值：字面量（`"61001"`）或本表单元格（`C5`）。
       *
       * 省略时用**本表同名列**在本行的值当键，于是写在某一列上就对整列生效；
       * 给了它则只作用于自己这一格，键可以来自别的列、别的行甚至直接写死。
       */
      readonly valueArgument?: KeyArgument;
    }>
  | BoundFormula<{
      readonly kind: 'sum';
      readonly path: string;
      readonly valueColumn: string;
      readonly keyColumn: string;
      readonly keyArgument: KeyArgument;
    }>
  | BoundFormula<{
      readonly kind: 'filter';
      readonly path: string;
      readonly valueColumn: string;
      readonly keyColumn: string;
      readonly keyArgument: KeyArgument;
      /** 拼接模板；为空时用 `+` 连接。 */
      readonly template: string;
    }>;

/** 一条公式求值时实际使用的键。 */
export interface FormulaKey {
  /** 被引用表里用于匹配的列。 */
  readonly keyColumn: string;
  /** 要匹配的键值。 */
  readonly key: string;
}

/** 一条公式在**被引用文件**里读的那个单元格。 */
export interface FormulaTarget {
  /** 公式里写的路径，原样返回，交给调用方去解析成文件。 */
  readonly path: string;
  /** 目标单元格的行下标（从 0 开始，与文件行号一致）。 */
  readonly row: number;
  /** 目标单元格的列下标（从 0 开始）。 */
  readonly column: number;
}

/**
 * 算出一条公式在别的文件里读的是哪一格。
 *
 * 用来实现「定位到引用表」：`=CELL` 直接给出行列；`=LOOKUP` / `=REF` / `=SUM` /
 * `=FILTER` 先在目标文件里按键定位到行，再取取值列。列名与键列都要在**目标文件**
 * 里解析，所以列号可能拿不到，这时返回 `null`，由调用方提示「定位失败」。
 *
 * @param site - 公式在本表里的位置。
 * @param rows - 本文件的行，用来取值引用写法里的键。
 * @param external - 路径 → 被引用的表；缺了某张表就定位不到。
 * @returns 目标单元格；定位不到时为 `null`。
 */
export function findFormulaTarget(
  site: FormulaSite,
  rows: readonly (readonly string[])[],
  external: ReadonlyMap<string, FormulaTable>,
): FormulaTarget | null {
  const formula = site.formula;
  const table = external.get(normalizeFormulaPath(formula.path));
  if (table === undefined) {
    return null;
  }
  if (formula.kind === 'cell') {
    const parts = cellParts(formula.cell);
    if (parts === null) {
      return null;
    }
    const column = resolveColumnIndex(table, parts.column);
    if (column === null) {
      return null;
    }
    return {
      path: formula.path,
      row: Number(parts.row) - FIRST_DOCUMENT_ROW,
      column,
    };
  }

  const key = formulaKey(site, rows);
  if (key === null || key.key.trim() === '') {
    return null;
  }
  const keyColumn = resolveColumnIndex(table, key.keyColumn);
  if (keyColumn === null) {
    return null;
  }
  const valueColumn = resolveColumnIndex(table, formula.valueColumn);
  if (valueColumn === null) {
    return null;
  }
  const row = findRow(table, keyColumn, key.key);
  if (row === null) {
    return null;
  }
  return { path: formula.path, row, column: valueColumn };
}

/**
 * 求出公式实际使用的键。
 *
 * 键参数有三种写法，落到具体单元格上时才有确定值：
 *
 * - 字面量：写公式时就定死了。
 * - `this`：本行**本列**（也就是公式自己那一列）的值；`=REF` 的简写也用这个，
 *   只是它指向的是参数里写的那一列。
 * - `B12`：本表第 12 行 B 列的值，公式放在哪一行都一样。
 *
 * `=REF` 的键由 {@link evaluateFormula} 直接处理（3 参数用本行本列的值，4 参数
 * 用写出来的那个键），这里只报出它的键列名。
 *
 * @param site - 公式在本表里的位置。
 * @param rows - 本文件的行。
 * @returns 键列与键值；公式不需要键时为 `null`。
 */
export function formulaKey(
  site: FormulaSite,
  rows: readonly (readonly string[])[],
): FormulaKey | null {
  const formula = site.formula;
  if (formula.kind === 'cell') {
    return null;
  }
  if (formula.kind === 'ref') {
    if (formula.valueArgument === undefined) {
      // 简写：键取本表里与 `keyColumn` 同名的列在当前行的值；本表没有同名列时
      // {@link bindRef} 会把它绑成公式自己那一列。
      const column = formula.keyColumnIndex ?? site.column;
      return { keyColumn: formula.keyColumn, key: rows[site.row]?.[column] ?? '' };
    }
    const argument = formula.valueArgument;
    if (argument.kind === 'literal') {
      return { keyColumn: formula.keyColumn, key: argument.text };
    }
    // `C5` 是**相对**引用（`C5` 写在第 5 行就是本行的 C 列，写在第 90 行就是本行
    // 的 C 列）；`%C` 更是只写列，行号永远取公式所在的行。
    const row = argument.kind === 'column' ? site.row : site.row + (formula.valueRowOffset ?? 0);
    const column =
      argument.kind === 'this'
        ? (formula.keyColumnIndex ?? site.column)
        : formula.valueColumnIndex;
    return {
      keyColumn: formula.keyColumn,
      key: column === undefined ? '' : (rows[row]?.[column] ?? ''),
    };
  }
  const argument = formula.keyArgument;
  if (argument.kind === 'literal') {
    return { keyColumn: formula.keyColumn, key: argument.text };
  }
  const row = argument.kind === 'column' ? site.row : (formula.keyRow ?? site.row);
  if (formula.keyColumnIndex === undefined) {
    return { keyColumn: formula.keyColumn, key: '' };
  }
  return { keyColumn: formula.keyColumn, key: rows[row]?.[formula.keyColumnIndex] ?? '' };
}

/**
 * 记下一条公式从本表哪一格读键。
 *
 * @param formula - 已解析的公式。
 * @param keyColumnIndex - 提供键的列。
 * @param keyRow - 提供键的行。
 * @returns 带绑定的公式。
 */
function withBindings<T extends ParsedFormula>(
  formula: T,
  keyColumnIndex?: number,
  keyRow?: number,
): T {
  // 只在确实有绑定时才加字段，解析结果本身保持干净（未绑定的公式里没有这些键）。
  const bound: FormulaBindings = {};
  if (keyColumnIndex !== undefined) {
    Object.assign(bound, { keyColumnIndex });
  }
  if (keyRow !== undefined) {
    Object.assign(bound, { keyRow });
  }
  return { ...formula, ...bound };
}

/**
 * 给 `=REF` 补上「键值从哪一格读」的信息。
 *
 * 3 参数写法只报出简写标记（`valueArgument` 缺省），4 参数写法则把键值参数的
 * 位置固定下来；两种情况都不需要去被引用的表里解析列名，列名是给**对方**用的。
 *
 * @param formula - 已解析的 `=REF`。
 * @param rows - 本文件的行，用来把「本表的键列」换算成列序号。
 * @param row - 公式所在的行。
 * @param column - 公式所在的列。
 * @returns 绑定好位置的公式。
 */
function bindRef(
  formula: Extract<ParsedFormula, { kind: 'ref' }>,
  rows: readonly (readonly string[])[],
  row: number,
  column: number,
  thisColumn: number,
): ParsedFormula {
  const argument = formula.valueArgument;
  // 3 参数简写：键取「本表里与它键列同名的列」在当前行的值；本表没有同名列时
  // 退回公式自己那一列（例如把 D 列的 key 直接换成公式时）。
  const local = resolveColumnIndex({ rows, firstDataRow: 0 }, formula.keyColumn);
  const selfColumn = local ?? column;
  if (argument === undefined) {
    return { ...formula, keyColumnIndex: selfColumn };
  }
  if (argument.kind === 'literal') {
    return formula;
  }
  if (argument.kind === 'this') {
    return { ...formula, keyColumnIndex: thisColumn, valueColumnIndex: thisColumn };
  }
  if (argument.kind === 'column') {
    // `%C`：只写列，行号在求值时取公式所在的行。
    const target = columnReference(rows, argument.text);
    if (target === null) {
      return formula;
    }
    return { ...formula, keyColumnIndex: selfColumn, valueColumnIndex: target };
  }
  const parts = cellParts(argument.text);
  if (parts === null) {
    return formula;
  }
  const target = Number(parts.row) - FIRST_DOCUMENT_ROW;
  return {
    ...formula,
    keyColumnIndex: selfColumn,
    valueColumnIndex: letterToIndex(parts.column),
    valueRowOffset: target - row,
  };
}

/** 一个公式作用在整张表上的位置。 */
export interface FormulaSite {
  /** 公式所在的行。 */
  readonly row: number;
  /** 公式所在的列。 */
  readonly column: number;
  /** 解析并绑定好的公式。 */
  readonly formula: ParsedFormula;
}

/** 把公式应用到整张表所需的上下文。 */
export interface ResolveContext {
  /** 路径 → 被引用的表，键由 {@link normalizeFormulaPath} 归一化。 */
  readonly external: ReadonlyMap<string, FormulaTable>;
}

/** 一个单元格的求值结果。 */
export interface FormulaOutcome {
  /** 算出来的显示文本；读取失败时为 `null`。 */
  readonly value: string | null;
  /** 失败原因（中文），成功时为空字符串。 */
  readonly error: string;
}

/** 整张表的公式投影结果。 */
export interface ResolvedFormulas {
  /** 需要替换显示的列 → 与行号对齐的显示文本；`null` 表示按公式原文显示。 */
  readonly columns: Record<number, (string | null)[]>;
  /** 公式读取失败的说明，用于提示条。 */
  readonly errors: string[];
}

/** 公式能引用的文件数量上限，避免误写的公式触发大量磁盘读取。 */
export const MAX_FORMULA_FILES = 64;

/** 行号（从 1 开始）到下标，与行号列显示的数字一致。 */
const FIRST_DOCUMENT_ROW = 1;

/**
 * 计算第一个数据行的行下标。
 *
 * 配表用 `##` 开头的行写列定义与说明，它们不是数据；没有这些行时首行就是数据。
 *
 * @param rows - 解析出的行。
 * @returns 第一个数据行的行下标。
 */
export function firstDataRowOf(rows: readonly (readonly string[])[]): number {
  let index = 0;
  while (index < rows.length && (rows[index][0] ?? '').trim().startsWith('##')) {
    index += 1;
  }
  return index;
}

/**
 * 归一化公式里的路径，便于比较与去重。
 *
 * @param path - 公式里写的路径。
 * @returns 去掉首尾空白、反斜杠与 `./` 前缀，并统一为小写的路径。
 */
export function normalizeFormulaPath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .toLowerCase();
}

/**
 * 判断一个单元格内容是不是公式。
 *
 * 允许公式前有空白（文本模式里手写的公式常常带缩进）。
 *
 * @param value - 单元格内容。
 * @returns 去掉首尾空白后以 `=` 开头（且不是单独一个 `=`）时为真。
 */
export function isFormulaText(value: string): boolean {
  const text = value.trim();
  return text.charCodeAt(0) === 61 /* = */ && text.length > 1;
}

/**
 * 把表头行切成列名。
 *
 * @param header - `##var` 行或表头行。
 * @returns 去掉前导 `#` 与空白的列名。
 */
function headerNames(header: readonly string[]): string[] {
  return header.map(name => name.trim().replace(/^#+/, '').trim());
}

/**
 * 取一张表用于按名字查列的候选表头行，按优先级排列。
 *
 * 配表的第一行写的是给程序用的列名（`##var`，样例里常直接写成 `##`），其次是
 * 人类可读的表头行（同样是 `##` 开头，常带中文），最后退回首行（普通 CSV）。
 * 列名两侧的前导 `#` 会去掉，所以 `#名称` 也能按「名称」引用。
 *
 * @param rows - 表的全部行。
 * @returns 候选表头行，可能有多行。
 */
function headerCandidates(rows: readonly (readonly string[])[]): string[][] {
  const declared = rows.length > 0 && (rows[0][0] ?? '').trim().startsWith('##');
  const schema: string[][] = [];
  const readable: string[][] = [];
  for (const row of rows) {
    const first = (row[0] ?? '').trim();
    if (!first.startsWith('##')) {
      continue;
    }
    if (schema.length === 0) {
      schema.push(headerNames(row));
      continue;
    }
    readable.push(headerNames(row));
  }
  if (declared) {
    return [...schema, ...readable];
  }
  if (readable.length > 0) {
    return readable;
  }
  return rows.length > 0 ? [headerNames(rows[0])] : [];
}

/**
 * 把列标（`A`、`B`、`AA`）换算成列序号。
 *
 * @param letters - 列标。
 * @returns 列序号，从 0 开始。
 */
function letterToIndex(letters: string): number {
  let index = 0;
  for (const character of letters.toUpperCase()) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }
  return index - 1;
}

/**
 * 把公式里的列写法换算成列序号。
 *
 * 优先按列名（`##var` 或表头行，例如 `id`、`value`）匹配，这样引用方不必知道
 * 对方第几列；找不到才把**单个字母**当成列标（`A`、`B`…），多字母写法一律按
 * 列名理解，否则 `name` 会被误读成 `N-A-M-E` 这样的列标。序号写法是 `#2`。
 *
 * @param table - 被引用的表。
 * @param reference - 列名、列标（`B`）或序号（`#2`）。
 * @returns 列序号；无法识别时为 `null`。
 */
export function resolveColumnIndex(
  table: FormulaTable,
  reference: string,
): number | null {
  const text = reference.trim();
  if (text === '') {
    return null;
  }
  for (const header of headerCandidates(table.rows)) {
    const index = header.findIndex(name => name === text);
    if (index >= 0) {
      return index;
    }
  }
  if (/^#[1-9]\d*$/.test(text)) {
    return Number(text.slice(1)) - 1;
  }
  if (/^[A-Za-z]$/.test(text)) {
    return letterToIndex(text);
  }
  return null;
}

/**
 * 取某个单元格（按文档行号与列名）。
 *
 * @param table - 被引用的表。
 * @param rowReference - 公式里写的行号（从 1 开始）。
 * @param columnReference - 公式里写的列。
 * @returns 单元格内容；越界时为 `undefined`。
 */
export function cellValue(
  table: FormulaTable,
  rowReference: string,
  columnReference: string,
): string | undefined {
  const digits = rowReference.trim().match(/^(\d+)$/);
  if (digits === null) {
    return undefined;
  }
  const column = resolveColumnIndex(table, columnReference);
  if (column === null) {
    return undefined;
  }
  const index = Number(digits[1]) - FIRST_DOCUMENT_ROW;
  const row = table.rows[index];
  if (row === undefined) {
    return undefined;
  }
  return row[column] === undefined ? '' : row[column];
}

/**
 * 把一行里某一列的内容取出来。
 *
 * @param table - 被引用的表。
 * @param rowIndex - 行下标。
 * @param column - 列序号。
 * @returns 单元格内容；越界时为 `undefined`。
 */
function valueAt(
  table: FormulaTable,
  rowIndex: number,
  column: number,
): string | undefined {
  const row = table.rows[rowIndex];
  if (row === undefined || column < 0) {
    return undefined;
  }
  return row[column] === undefined ? '' : row[column];
}

/**
 * 读取一个参数。
 *
 * 带引号的是字面量；裸的 `this` 表示「本行本列」；像 `B12` 那样的是本表单元格
 * 引用；其余裸词按字面量处理，这样 `id` 这种列名不必加引号也能写。
 *
 * @param token - 参数词法单元。
 * @returns 参数的求值方式。
 */
function stringArgument(token: string | undefined): StringArgument {
  const text = (token ?? '').trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return { kind: 'literal', text: text.slice(1, -1) };
  }
  // `%C`、`%AA`、`%"名称ID"`：只写列，行号取公式所在的行。
  const percent = /^%(?:"([^"]*)"|([^%]+))$/.exec(text);
  if (percent !== null) {
    const name = (percent[1] ?? percent[2] ?? '').trim();
    return name === '' ? { kind: 'literal', text } : { kind: 'column', text: name };
  }
  if (text.toLowerCase() === 'this') {
    return { kind: 'this' };
  }
  if (/^[A-Za-z]+\d+$/.test(text)) {
    return { kind: 'reference', text };
  }
  return { kind: 'literal', text };
}

/**
 * 把 `%C` 这样的列写法解析成列序号。
 *
 * 单个字母按列标理解（`%C` 是第 3 列），其余按列名（`%"名称ID"`）。
 *
 * @param rows - 本文件的行。
 * @param reference - 列标或列名。
 * @returns 列序号；认不出来时为 `null`。
 */
function columnReference(
  rows: readonly (readonly string[])[],
  reference: string,
): number | null {
  const text = reference.trim();
  if (/^[A-Za-z]$/.test(text)) {
    return letterToIndex(text);
  }
  return localColumnIndex(rows, text);
}

/**
 * 把 `B12` 这样的写法拆成列标与行号。
 *
 * @param token - 单元格写法。
 * @returns 列标与行号；不像单元格时为 `null`。
 */
function cellParts(token: string): { readonly column: string; readonly row: string } | null {
  const parts = /^([A-Za-z]+)(\d+)$/.exec(token.trim());
  return parts === null ? null : { column: parts[1], row: parts[2] };
}

/**
 * 把词法单元列表切成参数。
 *
 * 词法单元里的引号是完整的（`"a,b"` 是一个单元），所以这里只需要跟踪括号与
 * 方括号的嵌套：`(list#sep=|),AttrItem` 这种列名里的逗号不会被当成分隔符。
 *
 * @param tokens - 括号内的词法单元。
 * @returns 参数列表；括号不配对或出现空参数时为 `null`。
 */
function splitArguments(tokens: readonly string[]): string[] | null {
  const args: string[] = [];
  let current = '';
  let depth = 0;
  for (const token of tokens) {
    if (token === '(' || token === '[') {
      depth += 1;
      current += token;
      continue;
    }
    if (token === ')' || token === ']') {
      depth -= 1;
      if (depth < 0) {
        return null;
      }
      current += token;
      continue;
    }
    if (token === ',' && depth === 0) {
      if (current.trim() === '') {
        return null;
      }
      args.push(current.trim());
      current = '';
      continue;
    }
    current += token;
  }
  if (depth !== 0) {
    return null;
  }
  if (current.trim() !== '') {
    args.push(current.trim());
  }
  return args;
}

/**
 * 解析一条公式。
 *
 * 解析结果里不含任何「这一行」的信息，键参数原样保留为 {@link KeyArgument}；
 * 真正落到某个单元格上时再由 {@link bindSites} 补上位置。
 *
 * @param text - 单元格内容。
 * @returns 解析结果；不是公式或写错时为 `null`。
 */
export function parseFormula(text: string): ParsedFormula | null {
  if (!isFormulaText(text)) {
    return null;
  }
  const body = text.trim().slice(1).trim();
  const call = /^([A-Za-z]+)\s*\(/.exec(body);
  if (call === null) {
    return null;
  }
  const name = call[1].toUpperCase();
  const close = body.lastIndexOf(')');
  if (close < call[0].length) {
    return null;
  }
  const inner = body.slice(call[0].length, close);
  const tokens = inner.match(/"[^"]*"|[^,[\]()]+|,|\[|\]|\(|\)/g) ?? [];
  const args = splitArguments(tokens);
  if (args === null) {
    return null;
  }
  const total = args.length;
  const argument = (index: number): StringArgument => stringArgument(args[index]);
  const literal = (index: number): string => {
    const value = argument(index);
    return value.kind === 'literal' ? value.text : '';
  };
  /** 单元格写法允许加引号（`"B12"`），也允许裸写（`B12`）。 */
  const identifier = (index: number): string => {
    const value = argument(index);
    if (value.kind === 'reference') {
      return value.text;
    }
    return value.kind === 'literal' ? value.text : '';
  };
  const keyArgument = (index: number): KeyArgument => argument(index);

  switch (name) {
    case 'CELL': {
      if (total !== 2) {
        return null;
      }
      const target = identifier(1).replace(/^"|"$/g, '');
      if (cellParts(target) === null) {
        return null;
      }
      return withBindings({ kind: 'cell' as const, path: literal(0), cell: target });
    }
    case 'LOOKUP': {
      if (total !== 4) {
        return null;
      }
      return withBindings({
        kind: 'lookup' as const,
        path: literal(0),
        keyColumn: literal(1),
        keyArgument: keyArgument(2),
        valueColumn: literal(3),
      });
    }
    case 'REF': {
      // 3 参数：`=REF(路径, 键列, 取值列)`，键取本行本列的值。
      // 4 参数：`=REF(路径, 键列, 键值, 取值列)`，键值可以写成字面量或本表单元格。
      if (total !== 3 && total !== 4) {
        return null;
      }
      return withBindings({
        kind: 'ref' as const,
        path: literal(0),
        keyColumn: literal(1),
        valueColumn: literal(total - 1),
        ...(total === 4 ? { valueArgument: keyArgument(2) } : {}),
      });
    }
    case 'SUM': {
      if (total !== 4) {
        return null;
      }
      return withBindings({
        kind: 'sum' as const,
        path: literal(0),
        valueColumn: literal(1),
        keyColumn: literal(2),
        keyArgument: keyArgument(3),
      });
    }
    case 'FILTER': {
      if (total !== 4 && total !== 5) {
        return null;
      }
      return withBindings({
        kind: 'filter' as const,
        path: literal(0),
        valueColumn: literal(1),
        keyColumn: literal(2),
        keyArgument: keyArgument(3),
        template: total === 5 ? literal(4) : '',
      });
    }
    default:
      return null;
  }
}

/**
 * 收集一条公式引用的文件路径。
 *
 * @param formula - 已解析的公式。
 * @returns 归一化后的路径。
 */
function formulaPath(formula: ParsedFormula): string {
  return normalizeFormulaPath(formula.path);
}

/**
 * 查找被引用文件里键匹配的第一个数据行。
 *
 * @param table - 被引用的表。
 * @param keyColumn - 键列序号。
 * @param key - 要匹配的键。
 * @returns 行下标；没有匹配时返回 `null`。
 */
function findRow(
  table: FormulaTable,
  keyColumn: number,
  key: string,
): number | null {
  for (let index = table.firstDataRow; index < table.rows.length; index += 1) {
    if (valueAt(table, index, keyColumn) === key) {
      return index;
    }
  }
  return null;
}

/**
 * 取一张表里键匹配的所有行。
 *
 * @param table - 被引用的表。
 * @param keyColumn - 键列序号。
 * @param key - 要匹配的键。
 * @returns 匹配的行下标。
 */
function matchingRows(
  table: FormulaTable,
  keyColumn: number,
  key: string,
): number[] {
  const rows: number[] = [];
  for (let index = table.firstDataRow; index < table.rows.length; index += 1) {
    if (valueAt(table, index, keyColumn) === key) {
      rows.push(index);
    }
  }
  return rows;
}

/**
 * 计算一条公式。
 *
 * @param site - 公式在本表里的位置。
 * @param context - 求值上下文。
 * @param rows - 本文件的行，用来读出键参数指向的单元格。
 * @returns 结果或失败原因。
 */
export function evaluateFormula(
  site: FormulaSite,
  context: ResolveContext,
  rows: readonly (readonly string[])[],
): FormulaOutcome {
  const formula = site.formula;
  const label = formula.path.trim() === '' ? '(空路径)' : formula.path;
  const table = context.external.get(formulaPath(formula));
  if (table === undefined) {
    return { value: null, error: `未找到被引用的文件：${label}` };
  }
  if (formula.kind === 'cell') {
    const parts = cellParts(formula.cell);
    if (parts === null) {
      return { value: null, error: `无法识别的单元格：${formula.cell}` };
    }
    const value = cellValue(table, parts.row, parts.column);
    if (value === undefined) {
      return { value: null, error: `单元格越界：${label}!${formula.cell}` };
    }
    return { value, error: '' };
  }

  const key = formulaKey(site, rows);
  const bound = key ?? { keyColumn: formula.keyColumn, key: '' };
  const keyColumn = resolveColumnIndex(table, bound.keyColumn);
  if (keyColumn === null) {
    return { value: null, error: `未找到列：${bound.keyColumn}` };
  }
  if (formula.kind === 'sum' || formula.kind === 'filter') {
    const valueColumn = resolveColumnIndex(table, formula.valueColumn);
    if (valueColumn === null) {
      return { value: null, error: `未找到列：${formula.valueColumn}` };
    }
    // 同一张表里键相同的行会一起参与聚合。
    const matched = matchingRows(table, keyColumn, bound.key);
    if (matched.length === 0) {
      return { value: null, error: `没有找到匹配的行：${bound.key}` };
    }
    if (formula.kind === 'sum') {
      const total = matched.reduce((sum, index) => {
        const raw = valueAt(table, index, valueColumn) ?? '';
        const parsed = Number(raw);
        return sum + (Number.isFinite(parsed) ? parsed : 0);
      }, 0);
      return { value: String(total), error: '' };
    }
    const parts = matched.map(index =>
      formula.template === ''
        ? String(valueAt(table, index, valueColumn) ?? '')
        : formula.template
            .split('{值}')
            .join(String(valueAt(table, index, valueColumn) ?? ''))
            .split('{行}')
            .join(String(index + FIRST_DOCUMENT_ROW)),
    );
    const joined =
      formula.template === '' ? parts.filter(part => part !== '').join('+') : parts.join('；');
    return joined === '' ? { value: null, error: '没有匹配的行' } : { value: joined, error: '' };
  }

  const valueColumn = resolveColumnIndex(table, formula.valueColumn);
  if (valueColumn === null) {
    return { value: null, error: `未找到列：${formula.valueColumn}` };
  }
  if (bound.key.trim() === '') {
    return { value: null, error: '引用行为空，没有可查询的键' };
  }
  const index = findRow(table, keyColumn, bound.key);
  if (index === null) {
    return { value: null, error: `没有找到匹配的行：${bound.key}` };
  }
  const value = valueAt(table, index, valueColumn);
  if (value === undefined) {
    return { value: null, error: `未找到列：${formula.valueColumn}` };
  }
  return { value, error: '' };
}

/**
 * 把公式里指向本表的部分换成具体行列。
 *
 * 四种写法各有归属：
 *
 * - 列名（`id`，可带引号）：先看**本表**有没有同名列（`##var` / 表头行），有就取
 *   本行那一列的值；本表没有这一列才按写死的键处理。
 * - `this`：本行本列。
 * - `B12`：本表第 12 行 B 列，行是写死的。
 * - 字面量（`"61001"`）：写死的键。
 *
 * `=REF` 的列名是给被引用的表用的（那边按列名查），本表这一侧由 {@link bindRef}
 * 处理。
 *
 * @param formula - 已解析的公式。
 * @param rows - 本文件的行，用来把列名换算成列序号。
 * @param row - 公式所在的行。
 * @param column - 公式所在的列。
 * @returns 绑定好位置的公式。
 */
function bindFormula(
  formula: ParsedFormula,
  rows: readonly (readonly string[])[],
  row: number,
  column: number,
): ParsedFormula {
  if (formula.kind === 'cell') {
    return formula;
  }
  if (formula.kind === 'ref') {
    return bindRef(formula, rows, row, column, column);
  }
  const argument: KeyArgument = formula.keyArgument;
  switch (argument.kind) {
    case 'literal': {
      // 先当成「本表里的同名列」；本表没有这一列就按写死的键处理。
      const index = localColumnIndex(rows, argument.text);
      return index === null ? formula : withBindings(formula, index, row);
    }
    case 'this':
      // `this` 指「本表里与键列同名的列」在当前行的值；没有同名列时才用公式自己
      // 那一列，这样 `=LOOKUP(路径, "id", this, "value")` 可以写在任意一列里。
      return withBindings(formula, localColumnIndex(rows, formula.keyColumn) ?? column, row);
    case 'column': {
      // `%C` / `%"名称ID"`：只写列，行号留给你正在编辑的那一行。
      const index = columnReference(rows, argument.text);
      return index === null ? formula : withBindings(formula, index, row);
    }
    case 'reference': {
      const parts = cellParts(argument.text);
      if (parts === null) {
        return formula;
      }
      // `B12` 这种写法自带列标与行号，行号是文档行号（从 1 开始）。
      return withBindings(formula, letterToIndex(parts.column), Number(parts.row) - FIRST_DOCUMENT_ROW);
    }
    default:
      // 其余裸词已在解析阶段当成字面量处理，这里没有可绑定的东西。
      return formula;
  }
}

/**
 * 在**本表**里按列名找一列。
 *
 * @param rows - 本文件的行。
 * @param reference - 列名。
 * @returns 列序号；本表没有这一列时为 `null`。
 */
function localColumnIndex(
  rows: readonly (readonly string[])[],
  reference: string,
): number | null {
  for (const header of headerCandidates(rows)) {
    const index = header.findIndex(name => name === reference.trim());
    if (index >= 0) {
      return index;
    }
  }
  return null;
}

/**
 * 扫描整张表，找出所有公式并绑定好它在本表里的位置。
 *
 * @param rows - 本文件的行。
 * @returns 每个公式单元格一条记录。
 */
export function bindSites(rows: readonly (readonly string[])[]): FormulaSite[] {
  const sites: FormulaSite[] = [];
  for (let row = 0; row < rows.length; row += 1) {
    const line = rows[row];
    for (let column = 0; column < line.length; column += 1) {
      const raw = line[column];
      if (raw === undefined || raw.indexOf('=') < 0) {
        continue;
      }
      const formula = parseFormula(raw);
      if (formula === null) {
        continue;
      }
      sites.push({ row, column, formula: bindFormula(formula, rows, row, column) });
    }
  }
  return sites;
}

/**
 * 收集整张表里所有公式引用到的文件路径。
 *
 * 先拿到路径，宿主才能把它们一次读齐再求值。
 *
 * @param rows - 本文件的行。
 * @returns 去重后的路径，保持公式里书写的原样。
 */
export function collectFormulaPaths(rows: readonly (readonly string[])[]): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const site of bindSites(rows)) {
    const path = site.formula.path.trim();
    const key = normalizeFormulaPath(path);
    if (key === '' || seen.has(key)) {
      continue;
    }
    seen.add(key);
    paths.push(path);
  }
  return paths;
}

/**
 * 算出整张表里所有公式的显示值。
 *
 * 只有确实写了公式的列才会出现在结果里。列里只要有**一条** `=REF`（键取本行
 * 本列的值），这一列的每一行就都按本行的值去查，因此在某一格写一次就能整列
 * 生效；其他写法（`=LOOKUP` / `=CELL` / `=SUM` / `=FILTER`）只作用于自己那一格。
 *
 * 读不到文件、匹配不上或越界时该单元格返回 `null`，由视图退化成显示公式原文。
 *
 * @param rows - 本文件的行。
 * @param firstDataRow - 第一个数据行的行下标；列级 `=REF` 只对它及其后的行生效，
 *   `##` 元数据行不会因为表头列名恰好能匹配而被算成一次失败。
 * @param context - 被引用的表。
 * @returns 各列的显示值与失败说明。
 */
export function resolveFormulas(
  rows: readonly (readonly string[])[],
  firstDataRow: number,
  context: ResolveContext,
): ResolvedFormulas {
  const result: Record<number, (string | null)[]> = {};
  const errors: string[] = [];
  const sites = bindSites(rows);
  if (sites.length === 0) {
    return { columns: result, errors };
  }

  // 一整列 `=REF` 的键会重复，同一个「公式 + 键」只算一次。
  const memo = new Map<string, FormulaOutcome>();

  const columns = new Map<number, FormulaSite[]>();
  for (const site of sites) {
    const list = columns.get(site.column);
    if (list === undefined) {
      columns.set(site.column, [site]);
    } else {
      list.push(site);
    }
  }

  for (const column of Array.from(columns.keys()).sort((left, right) => left - right)) {
    const columnSites = columns.get(column) as FormulaSite[];
    const byRow = new Map<number, FormulaSite>();
    for (const site of columnSites) {
      byRow.set(site.row, site);
    }
    // 这一列有没有「键取本行本列」的公式？有就整列都按它求值。
    // 这一列有没有「键取本表同名列」的简写公式？有就整列都按它求值。
    const applyAll =
      columnSites.find(
        site => site.formula.kind === 'ref' && site.formula.valueArgument === undefined,
      ) ?? null;
    const values: (string | null)[] = [];
    for (let row = 0; row < rows.length; row += 1) {
      const explicit = byRow.get(row) ?? null;
      // 列级 `=REF` 只作用于数据行；元数据行里那一列本来就是空的。
      const site =
        explicit ?? (applyAll === null || row < firstDataRow ? null : { ...applyAll, row });
      if (site === null) {
        values.push(null);
        continue;
      }
      const formula = site.formula;
      const key = formulaKey(site, rows);
      // 3 参数的 `=REF` 是列级公式（键取本表同名列的本行值），键相同的行复用同
      // 一次求值；其余写法逐格求值，键相同也不行 —— 同一行可能有别的差异。
      const columnLevel =
        formula.kind === 'ref' && formula.valueArgument === undefined;
      const cacheKey =
        columnLevel && key !== null
          ? `${column}|${key.key}|${memoKey(site)}`
          : `${column}|${row}|${memoKey(site)}`;
      let outcome = memo.get(cacheKey);
      if (outcome === undefined) {
        outcome = evaluateFormula(site, context, rows);
        memo.set(cacheKey, outcome);
      }
      values.push(outcome.value);
      if (outcome.error !== '') {
        const message = `第 ${row + 1} 行第 ${columnLetter(column)} 列：${outcome.error}`;
        if (!errors.includes(message)) {
          errors.push(message);
        }
      }
    }
    result[column] = values;
  }
  return { columns: result, errors };
}

/**
 * 把列序号渲染成电子表格列标。
 *
 * @param index - 列序号，从 0 开始。
 * @returns `A`、`B`、… `AA`。
 */
function columnLetter(index: number): string {
  let remaining = index;
  let label = '';
  do {
    label = String.fromCharCode(65 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return label;
}

/**
 * 为一条公式取一个可用于缓存的键。
 *
 * 只描述公式本身（含它绑定到的本表位置），不含求值时的键值；调用方会再把
 * 实际的键拼进来，这样键相同的行能直接命中同一次求值。`kind` 必须参与，
 * 否则在同一列里混用 `=LOOKUP` 与 `=REF` 时两者的缓存会撞车。
 *
 * @param site - 公式在本表里的位置。
 * @returns 能区分两条公式实例的字符串。
 */
function memoKey(site: FormulaSite): string {
  const formula = site.formula;
  switch (formula.kind) {
    case 'cell':
      return `cell|${formula.path}|${formula.cell}`;
    case 'lookup':
      return `lookup|${formula.path}|${formula.keyColumn}|${formula.valueColumn}`;
    case 'ref':
      return `ref|${formula.path}|${formula.keyColumn}|${formula.valueColumn}`;
    case 'sum':
      return `sum|${formula.path}|${formula.valueColumn}|${formula.keyColumn}|${site.row}`;
    case 'filter':
      return `filter|${formula.path}|${formula.valueColumn}|${formula.keyColumn}|${formula.template}|${site.row}`;
    default:
      return 'unknown';
  }
}
