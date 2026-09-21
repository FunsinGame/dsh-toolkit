/**
 * CSV 文本的解析与序列化。
 *
 * 解析器遵循 RFC 4180：单个分隔符字符分隔字段，CRLF/LF/CR 分隔记录，用双引号
 * 包裹的字段内可以出现分隔符、换行或成对的引号（`""`）。字段从不做 trim，
 * 因此「解析 → 序列化」的往返除 {@link serializeCsv} 中说明的规范化外，会保留
 * 作者写入的原始内容。
 */

/** {@link detectDelimiter} 会尝试的分隔符，按优先级排列。 */
const DELIMITER_CANDIDATES: readonly string[] = [',', ';', '\t', '|'];

/** UTF-8 字节顺序标记；保留它才能让往返不丢信息。 */
const BOM = '\uFEFF';

/** 检测分隔符时采样的字节数。 */
const DETECTION_SAMPLE_BYTES = 64 * 1024;

/** 检测分隔符时采样的行数。 */
const DETECTION_SAMPLE_ROWS = 20;

/** 文档文本在磁盘上的书写方式。 */
export interface CsvDialect {
  /** 字段分隔符。 */
  readonly delimiter: string;
  /** 源文本中的换行符；只有一行时取 `\n`。 */
  readonly eol: string;
  /** 源文本是否以字节顺序标记开头。 */
  readonly bom: boolean;
  /** 源文本是否以换行符结尾。 */
  readonly trailingEol: boolean;
  /** {@link delimiter} 是自动检测得到的，而不是配置指定的。 */
  readonly detected: boolean;
}

/** 解析结果：按文档顺序排列的全部行，以及文本的书写方式。 */
export interface CsvTable {
  readonly rows: string[][];
  readonly dialect: CsvDialect;
}

/** {@link parseCsv} 的选项。 */
export interface ParseCsvOptions {
  /** 强制使用的分隔符；`undefined`、`''` 或 `'auto'` 表示从文本中检测。 */
  readonly delimiter?: string;
}

/** {@link serializeCsv} 的选项。 */
export interface SerializeCsvOptions {
  /** 覆盖书写方式中的换行符。 */
  readonly eol?: string;
}

interface ScanResult {
  readonly rows: string[][];
  /** 第一处记录分隔符；只有一行时为 `null`。 */
  readonly firstEol: string | null;
}

/**
 * 把 `text` 切分成行与字段。
 *
 * @param text - 不含字节顺序标记的文本。
 * @param delimiter - 字段分隔符。
 * @param maxRows - 扫描到这么多完整行后停止。
 * @returns 扫描出的行，以及出现的第一个换行符。
 */
function scan(text: string, delimiter: string, maxRows: number): ScanResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let firstEol: string | null = null;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
      i += 1;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (char === '\r' || char === '\n') {
      const eol = char === '\r' && text[i + 1] === '\n' ? '\r\n' : char;
      if (firstEol === null) {
        firstEol = eol;
      }
      i += eol.length;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      if (rows.length >= maxRows) {
        return { rows, firstEol };
      }
      continue;
    }

    field += char;
    i += 1;
  }

  row.push(field);
  rows.push(row);
  return { rows, firstEol };
}

/**
 * 在行边界处截断采样文本，保证参与评分的是完整行。
 *
 * @param text - 不含字节顺序标记的文本。
 * @returns 文本有换行符时，返回以换行符结尾的前缀。
 */
function detectionSample(text: string): string {
  if (text.length <= DETECTION_SAMPLE_BYTES) {
    return text;
  }
  const head = text.slice(0, DETECTION_SAMPLE_BYTES);
  const cut = Math.max(head.lastIndexOf('\n'), head.lastIndexOf('\r'));
  return cut < 0 ? head : head.slice(0, cut + 1);
}

/**
 * 按「切分出的列数是否稳定」为一个候选分隔符打分。
 *
 * @param sample - 已在行边界截断的文本。
 * @param delimiter - 候选分隔符。
 * @returns 分数越高越好；`-1` 表示该候选不合格。
 */
function scoreDelimiter(sample: string, delimiter: string): number {
  const rows = scan(sample, delimiter, DETECTION_SAMPLE_ROWS + 1).rows.filter(row => row.length > 0);
  if (rows.length === 0) {
    return -1;
  }
  const width = rows[0].length;
  if (width <= 1) {
    return -1;
  }
  const consistent = rows.filter(row => row.length === width).length / rows.length;
  if (consistent < 0.5) {
    return -1;
  }
  // 一致性是主要因素；当多个分隔符都能把每一行切得同样整齐时，用列数分高下。
  return consistent * 100 + Math.min(width, 50);
}

/**
 * 选出能把采样文本切成最宽且列数稳定的那个分隔符。
 *
 * @param text - 不含字节顺序标记的文本。
 * @returns 检测到的分隔符；都不合格时返回 `,`。
 */
export function detectDelimiter(text: string): string {
  const sample = detectionSample(text);
  let best = ',';
  let bestScore = -1;
  for (const candidate of DELIMITER_CANDIDATES) {
    const score = scoreDelimiter(sample, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/**
 * 把 CSV 文本解析为行，并给出写回时所需的书写方式。
 *
 * @param text - 完整的文档文本。
 * @param options - 可选的强制分隔符。
 * @returns 按文档顺序排列的全部行；空文档没有任何行。
 */
export function parseCsv(text: string, options: ParseCsvOptions = {}): CsvTable {
  const bom = text.startsWith(BOM);
  const body = bom ? text.slice(1) : text;
  const configured = options.delimiter ?? '';
  const detected = configured === '' || configured === 'auto';
  const delimiter = detected ? detectDelimiter(body) : configured;

  if (body.length === 0) {
    return { rows: [], dialect: { delimiter, eol: '\n', bom, trailingEol: false, detected } };
  }

  const { rows, firstEol } = scan(body, delimiter, Number.POSITIVE_INFINITY);
  const trailingEol = body.endsWith('\n') || body.endsWith('\r');
  const last = rows[rows.length - 1];
  if (trailingEol && rows.length > 1 && last.length === 1 && last[0] === '') {
    rows.pop();
  }

  return { rows, dialect: { delimiter, eol: firstEol ?? '\n', bom, trailingEol, detected } };
}

/**
 * 当字段含有分隔符、引号或换行时为其加上引号。
 *
 * @param field - 原始字段内容。
 * @param delimiter - 当前生效的字段分隔符。
 * @returns 该字段在文件中的写法。
 */
function quoteField(field: string, delimiter: string): string {
  if (field === '') {
    return '';
  }
  const needsQuotes =
    field.includes(delimiter) ||
    field.includes('"') ||
    field.includes('\n') ||
    field.includes('\r');
  return needsQuotes ? `"${field.replace(/"/g, '""')}"` : field;
}

/**
 * 把行写回 CSV 文本。
 *
 * 书写方式中的分隔符、换行符、字节顺序标记与结尾换行都会保留。引号采用最小
 * 策略，因此源文件里多余的引号会在第一次写入时被去掉。
 *
 * @param rows - 要写入的行，按顺序给出。
 * @param dialect - 从文档检测到（或为文档选定）的书写方式。
 * @param options - 可选的换行符覆盖。
 * @returns 文档文本。
 */
export function serializeCsv(
  rows: readonly (readonly string[])[],
  dialect: CsvDialect,
  options: SerializeCsvOptions = {},
): string {
  const eol = options.eol ?? dialect.eol;
  const body = rows
    .map(row => row.map(field => quoteField(field, dialect.delimiter)).join(dialect.delimiter))
    .join(eol);
  const withTrailing = rows.length > 0 && dialect.trailingEol ? body + eol : body;
  return (dialect.bom ? BOM : '') + withTrailing;
}
