/**
 * HTTP Range 解析（纯函数，便于单测）。
 *
 * `<audio>` 拖动进度条时会发 `Range: bytes=start-end`；我们必须正确回答 206 +
 * `Content-Range`，否则 seek 只能落在已缓冲的范围内。
 *
 * 三种结果的区分很重要：
 *  - `none`：没带 Range，或者是看不懂的头 → 返回整段 200（宽容处理）；
 *  - `unsatisfiable`：语法正确但区间落在文件之外 → 必须回 416，否则播放器会
 *    以为拿到了整段而重下 26MB；
 *  - `partial`：正常的分段响应。
 */

export interface ByteRange {
  start: number;
  end: number;
}

export type RangeOutcome =
  | { status: 'none' }
  | { status: 'unsatisfiable' }
  | { status: 'partial'; range: ByteRange };

/** 只支持单段 Range：浏览器播放器不会用多段。 */
const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;

export function evaluateRange(header: string | null | undefined, total: number): RangeOutcome {
  if (header === null || header === undefined) return { status: 'none' };
  const match = RANGE_PATTERN.exec(header.trim());
  if (!match) return { status: 'none' };

  const [, rawStart = '', rawEnd = ''] = match;
  if (rawStart === '' && rawEnd === '') return { status: 'none' };

  if (rawStart === '') {
    // 后缀区间：最后 N 字节
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return { status: 'none' };
    if (total === 0) return { status: 'unsatisfiable' };
    return { status: 'partial', range: { start: Math.max(0, total - suffix), end: total - 1 } };
  }

  const start = Number(rawStart);
  if (!Number.isFinite(start)) return { status: 'none' };
  if (total === 0 || start >= total) return { status: 'unsatisfiable' };

  const end = rawEnd === '' ? total - 1 : Number(rawEnd);
  if (!Number.isFinite(end)) return { status: 'none' };
  if (start > end) return { status: 'unsatisfiable' };
  return { status: 'partial', range: { start, end: Math.min(end, total - 1) } };
}

/** 兼容旧调用：只要可满足的区间，其它情况一律返回 null。 */
export function parseRange(header: string | null | undefined, total: number): ByteRange | null {
  const outcome = evaluateRange(header, total);
  return outcome.status === 'partial' ? outcome.range : null;
}

/** `Content-Range` 头的值。 */
export function formatContentRange(range: ByteRange, total: number): string {
  return `bytes ${range.start}-${range.end}/${total}`;
}

/**
 * 从 `Content-Range: bytes 0-1535999/2977475` 里取出资源总长度。
 *
 * 流式起播靠它判断「还剩多少没下」；拿不到（CDN 用 `*`）时返回 null，调用方会按
 * 「未知总长」继续分段下载。
 */
export function parseContentRangeTotal(header: string | null | undefined): number | null {
  if (header === null || header === undefined) return null;
  const match = /bytes\s+\d+-\d+\/(\d+)/i.exec(header.trim());
  if (match === null) return null;
  const total = Number(match[1]);
  return Number.isFinite(total) && total > 0 ? total : null;
}
