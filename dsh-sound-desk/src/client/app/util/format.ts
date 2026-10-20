/** Small formatting helpers shared by the panes. */

import { STRONG_SIMILARITY, type Retriever, type ScoreBreakdown } from '@sounddesk/core';

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  if (minutes === 0) return `${seconds.toFixed(2)}s`;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatRate(hz: number | null | undefined): string {
  if (!hz) return '—';
  return hz % 1000 === 0 ? `${hz / 1000}kHz` : `${(hz / 1000).toFixed(1)}kHz`;
}

export function formatEta(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `约 ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `约 ${minutes}min`;
  return `约 ${(minutes / 60).toFixed(1)}h`;
}

/**
 * Which retrievers actually returned this hit — the honest answer to "why is this row
 * here?".
 *
 * This is `score.ranks`, i.e. the retrieval paths, *not* `asset.ucsSource`. Those are
 * two different kinds of "source" and the list row used to show the wrong one: it
 * printed the **classification** source (文件名 / 内嵌 / AI / 声学 / 手动), which is why
 * every row appeared to be labelled after the file name — `filename` is the normal
 * classification source, since a UCS-style name is the primary evidence. The retrieval
 * path is what the row is actually about.
 *
 * `probe` is labelled 参考音频 rather than 语义 because for a query-by-example search the
 * fingerprint *is* the query, and that distinction is the whole point of the mode.
 */
const RETRIEVER_LABELS: Record<Retriever, string> = {
  fts: '关键词',
  vector: '语义',
  ucs: 'UCS分类',
  struct: '结构',
  probe: '参考音频',
};

/** Retrievers in a stable, meaningful order: exact evidence before inferred. */
const RETRIEVER_ORDER: Retriever[] = ['fts', 'vector', 'ucs', 'struct', 'probe'];

export interface HitPath {
  retriever: Retriever;
  label: string;
  /** 1-based rank within that retriever's own list */
  rank: number;
}

/**
 * Every retrieval path that returned this hit, strongest rank first.
 *
 * More than one path means the retrievers agreed, which is the same evidence
 * `agreementConfidence` is built from — so a row showing 「关键词 + 语义」 is visibly more
 * trustworthy than one showing a single path.
 */
export function hitPaths(score: ScoreBreakdown | null | undefined): HitPath[] {
  const ranks = score?.ranks;
  if (!ranks) return [];
  // `>= 1`, not just "is a number": ranks are 1-based, so a 0 would mean "this retriever
  // did not return the item" and would render as the nonsense 「第0名」.
  return RETRIEVER_ORDER.filter((r) => typeof ranks[r] === 'number' && ranks[r]! >= 1).map((r) => ({
    retriever: r,
    label: RETRIEVER_LABELS[r],
    rank: ranks[r]!,
  }));
}

/** The path badge's text, e.g. `关键词 + 语义`; empty when nothing reported a path. */
export function hitPathsLabel(score: ScoreBreakdown | null | undefined): string {
  return hitPaths(score)
    .map((p) => p.label)
    .join(' + ');
}

export function confidenceClass(confidence: number | null, source: string | null): string {
  if (source === 'manual') return 'badge manual';
  if (confidence === null) return 'badge';
  if (confidence >= 0.75) return 'badge conf-high';
  if (confidence >= 0.5) return 'badge conf-low';
  return 'badge';
}

export function sourceLabel(source: string | null): string {
  switch (source) {
    case 'filename':
      return '文件名';
    case 'ixml':
      return '内嵌';
    case 'clap':
      return 'AI';
    case 'dsp-rule':
      return '声学';
    case 'llm':
      return 'LLM';
    case 'manual':
      return '手动';
    default:
      return '';
  }
}

/**
 * Human-readable reasons for a hit's position (plan §3.1(E)).
 *
 * The reranker blends several weak signals into one number, which is only trustworthy if
 * the user can see what drove it. Every line here is a number the engine actually
 * computed; nothing is inferred from a name or a category.
 *
 * Deliberately does *not* include the retrieval paths — those come from `hitPaths` and
 * are a fact rather than an explanation, so each caller decides how to show them (the
 * list row prints them as its badge, the details pane gives them their own line).
 *
 * Two things this used to get wrong:
 *
 *  - **The semantic signal was invisible.** The vector cosine is the whole point of the
 *    semantic path and was never mentioned, so a row found purely by fingerprint
 *    similarity explained itself as an opaque 「融合分数」.
 *  - **「融合分数」 was unreadable.** It is a normalised rank aggregate (Σ w/(60+rank),
 *    rescaled so the top hit is 1), *not* a similarity — presented as a bare number it
 *    reads like a percentage and invites the wrong comparison. It is still shown,
 *    because it is the base the reranker refines, but it now says what it is.
 *
 * An empty array means the order came from the retriever alone and there is nothing
 * extra to explain.
 */
export function rerankReasons(score: ScoreBreakdown | null | undefined): string[] {
  if (!score) return [];
  const reasons: string[] = [];

  /*
    The fingerprint similarity, when the semantic path ran for this hit.

    Described against the measured calibration rather than as a bare percentage: on
    CLAP's shared space ~0.35 is a *correct* match, so "48% · 强" is honest where "48%"
    on its own reads like a failure.
  */
  const similarity = score.vector;
  if (typeof similarity === 'number' && Number.isFinite(similarity) && similarity > 0) {
    const strength = similarity >= STRONG_SIMILARITY ? '强' : '弱';
    reasons.push(`声音指纹相似度 ${(similarity * 100).toFixed(1)}%（${strength}）`);
  }

  const rerank = score.rerank;
  if (rerank) {
    if (rerank.matchedTerms.length > 0) {
      reasons.push(`文件名/元数据命中「${rerank.matchedTerms.join('、')}」`);
    }
    // Only mention category/DSP when they express an opinion: the engine reports a
    // neutral 1 for "no hint" / "no features", and claiming agreement there would be
    // inventing evidence.
    if (rerank.category < 1) reasons.push(`UCS 分类与查询不符（${rerank.category.toFixed(2)}）`);
    if (rerank.dsp < 1) reasons.push(`声学形态与查询矛盾（${rerank.dsp.toFixed(2)}）`);
    // Named as a rank aggregate so it is not mistaken for a similarity score.
    reasons.push(`融合排序分 ${rerank.fused.toFixed(2)}（各路名次的加权合成，不是相似度）`);
  }

  return reasons;
}

/** The retrieval paths as one line, for tooltips that mix facts with explanations. */
export function hitPathsLine(score: ScoreBreakdown | null | undefined): string {
  const paths = hitPaths(score);
  if (paths.length === 0) return '命中路径：未报告';
  return `命中路径：${paths.map((p) => `${p.label} 第${p.rank} 名`).join(' · ')}`;
}
