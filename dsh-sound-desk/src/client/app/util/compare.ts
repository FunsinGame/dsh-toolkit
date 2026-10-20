/**
 * Compare workspace helpers — plan P2-3's "多栏对比 / 批量搜索".
 *
 * Two things live here rather than in the store, because they are the parts worth
 * testing on their own: how a batch of typed queries is parsed, and how each
 * column's independent sort orders its results.
 *
 * The per-column sort is the feature, not a detail: the whole reason to put several
 * searches side by side is to judge them against each other, which requires each
 * column to be able to answer a different question ("which is shortest?" next to
 * "which matches best?").
 */

import type { SearchHit } from '@sounddesk/core';

export type CompareSort = 'relevance' | 'duration-asc' | 'duration-desc' | 'name' | 'samplerate';

export const COMPARE_SORTS: Array<{ id: CompareSort; label: string; title: string }> = [
  { id: 'relevance', label: '匹配度', title: '按检索给出的相关度' },
  { id: 'duration-asc', label: '短→长', title: '按时长升序' },
  { id: 'duration-desc', label: '长→短', title: '按时长降序' },
  { id: 'name', label: '文件名', title: '按文件名（自然顺序：2 在 10 之前）' },
  { id: 'samplerate', label: '采样率', title: '按采样率降序' },
];

export interface CompareColumn {
  id: string;
  query: string;
  hits: SearchHit[];
  total: number;
  tookMs: number;
  sort: CompareSort;
  /** pixel width of the column */
  width: number;
  /** pinned columns keep their results when the batch is re-run */
  pinned: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Compare two file names the way a person reads them.
 *
 * Plain string comparison puts "10" before "2", which is visibly wrong in a list of
 * numbered takes — and numbered takes are exactly what a sound library is full of.
 */
export function compareNaturally(a: string, b: string): number {
  const chunk = /(\d+)|(\D+)/g;
  const left = a.match(chunk) ?? [];
  const right = b.match(chunk) ?? [];
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const l = left[i]!;
    const r = right[i]!;
    const lNum = /^\d+$/.test(l);
    const rNum = /^\d+$/.test(r);
    if (lNum && rNum) {
      const diff = Number(l) - Number(r);
      if (diff !== 0) return diff;
      // equal numerically: the longer one is the larger number (007 vs 07)
      if (l.length !== r.length) return l.length - r.length;
    } else {
      const diff = l.localeCompare(r, 'zh-Hans');
      if (diff !== 0) return diff;
    }
  }
  return left.length - right.length;
}

/**
 * Order one column's hits.
 *
 * Returns a new array: the column holds the engine's order and must not be mutated,
 * so switching sorts back and forth is lossless.
 *
 * `relevance` preserves the engine's order, which is the fused, reranked and
 * (optionally) personalised one. Re-sorting by `score.final` here would silently
 * drop that ordering's tie-breaking.
 */
export function sortHits(hits: SearchHit[], sort: CompareSort): SearchHit[] {
  if (sort === 'relevance') return hits;
  const out = [...hits];
  switch (sort) {
    case 'duration-asc':
      out.sort((a, b) => (a.asset.durationMs ?? 0) - (b.asset.durationMs ?? 0));
      break;
    case 'duration-desc':
      out.sort((a, b) => (b.asset.durationMs ?? 0) - (a.asset.durationMs ?? 0));
      break;
    case 'name':
      out.sort((a, b) => compareNaturally(a.asset.filename, b.asset.filename));
      break;
    case 'samplerate':
      out.sort((a, b) => (b.asset.sampleRate ?? 0) - (a.asset.sampleRate ?? 0));
      break;
    default:
      break;
  }
  return out;
}

/**
 * Split the batch input into queries.
 *
 * One query per line, because a query routinely contains commas, slashes and
 * parentheses (the keyword syntax), so splitting on punctuation would corrupt them.
 */
export function parseBatchQueries(text: string, limit = 6): { queries: string[]; dropped: number } {
  const seen = new Set<string>();
  const queries: string[] = [];
  let dropped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const query = raw.trim();
    if (query.length === 0) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) {
      dropped += 1;
      continue;
    }
    if (queries.length >= limit) {
      dropped += 1;
      continue;
    }
    seen.add(key);
    queries.push(query);
  }
  return { queries, dropped };
}

/**
 * Which assets appear in more than one column.
 *
 * The actual question this view exists to answer: "do two different searches agree
 * on anything?" An asset in every column is corroborated; one in a single column is
 * the specific answer to that query.
 */
export function crossColumnCounts(columns: CompareColumn[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const column of columns) {
    // Count each column once per asset, not once per duplicate row.
    const seen = new Set<number>();
    for (const hit of column.hits) {
      if (seen.has(hit.asset.id)) continue;
      seen.add(hit.asset.id);
      counts.set(hit.asset.id, (counts.get(hit.asset.id) ?? 0) + 1);
    }
  }
  return counts;
}

/** A short summary of a column, for its header. */
export function describeColumn(column: CompareColumn): string {
  if (column.error) return `失败：${column.error}`;
  if (column.loading) return '搜索中…';
  if (column.hits.length === 0) return '没有结果';
  return `${column.hits.length} 条 · ${column.tookMs}ms`;
}
