/** Small formatting helpers shared by the panes. */

import type { ScoreBreakdown } from '@sounddesk/core';

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
 * The reranker blends several weak signals into one number, which is only
 * trustworthy if the user can see what drove it. Returns one short phrase per
 * signal that actually carried information, in the order of the weights — so the
 * strongest reason reads first. An empty array means the order came from the
 * retriever alone and there is nothing extra to explain.
 */
export function rerankReasons(score: ScoreBreakdown | null | undefined): string[] {
  const rerank = score?.rerank;
  if (!rerank) return [];

  const reasons: string[] = [];
  if (rerank.matchedTerms.length > 0) {
    reasons.push(`文件名/元数据命中「${rerank.matchedTerms.join('、')}」`);
  }
  if (rerank.fused > 0) reasons.push(`融合分数 ${rerank.fused.toFixed(2)}`);
  // Only mention category/DSP when they express an opinion: the engine reports a
  // neutral 1 for "no hint" / "no features", and claiming agreement there would
  // be inventing evidence.
  if (rerank.category < 1) reasons.push(`UCS 分类与查询不符（${rerank.category.toFixed(2)}）`);
  if (rerank.dsp < 1) reasons.push(`声学形态与查询矛盾（${rerank.dsp.toFixed(2)}）`);
  return reasons;
}
