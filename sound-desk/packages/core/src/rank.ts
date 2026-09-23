/**
 * Rank fusion. Multiple retrievers (vector / BM25 / UCS prior / structured
 * filters) produce ranked lists; we combine them without needing comparable
 * raw scores, which is the whole point of RRF.
 */

import type { Retriever, ScoreBreakdown, SearchHit } from './types.js';

export interface RankedList {
  retriever: Retriever;
  /** best-first */
  ids: number[];
  /** optional raw scores parallel to ids, used for the score breakdown display */
  scores?: number[];
  /** relative importance; the weights are normalised internally */
  weight: number;
}

export interface FusionOptions {
  /** RRF constant. 60 is the value from the original paper and is a sane default. */
  k?: number;
  /** cap on how many items a single list can contribute */
  perListLimit?: number;
}

/**
 * Weighted Reciprocal Rank Fusion.
 * score(item) = Σ_list weight_list / (k + rank_list(item))
 * Results are normalized so the top score is 1.
 */
export function reciprocalRankFusion(lists: RankedList[], opts: FusionOptions = {}): Map<number, { score: number; ranks: Partial<Record<Retriever, number>>; raw: Partial<Record<Retriever, number>> }> {
  const k = opts.k ?? 60;
  const perListLimit = opts.perListLimit ?? 500;
  const totalWeight = lists.reduce((sum, l) => sum + Math.max(0, l.weight), 0) || 1;

  const acc = new Map<number, { score: number; ranks: Partial<Record<Retriever, number>>; raw: Partial<Record<Retriever, number>> }>();

  for (const list of lists) {
    if (list.weight <= 0 || list.ids.length === 0) continue;
    const w = list.weight / totalWeight;
    const limit = Math.min(list.ids.length, perListLimit);
    for (let i = 0; i < limit; i += 1) {
      const id = list.ids[i]!;
      const rank = i + 1;
      let entry = acc.get(id);
      if (!entry) {
        entry = { score: 0, ranks: {}, raw: {} };
        acc.set(id, entry);
      }
      entry.score += w / (k + rank);
      entry.ranks[list.retriever] = rank;
      if (list.scores && list.scores[i] !== undefined) {
        entry.raw[list.retriever] = list.scores[i]!;
      }
    }
  }

  // Normalize so the best item scores 1 — makes thresholds human-readable.
  let max = 0;
  for (const entry of acc.values()) if (entry.score > max) max = entry.score;
  if (max > 0) {
    for (const entry of acc.values()) entry.score /= max;
  }
  return acc;
}

/**
 * Confidence from retriever agreement: an item found by several retrievers at
 * good ranks is more trustworthy than one found by a single retriever.
 */
export function agreementConfidence(ranks: Partial<Record<Retriever, number>>): number {
  const entries = Object.values(ranks).filter((r): r is number => typeof r === 'number');
  if (entries.length === 0) return 0;
  // best rank drives the base confidence
  const best = Math.min(...entries);
  const base = 1 / (1 + Math.log10(1 + best));
  // each additional agreeing retriever adds a bonus, capped
  const bonus = Math.min(0.25, (entries.length - 1) * 0.12);
  return clamp01(base * 0.8 + bonus);
}

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export interface MmrCandidate {
  id: number;
  score: number;
  vector: Float32Array | null;
}

/**
 * Maximal Marginal Relevance reranking — keeps results relevant while avoiding
 * ten near-identical recordings of the same door. `lambda` 1 = pure relevance,
 * 0 = pure diversity.
 */
export function mmrRerank(candidates: MmrCandidate[], lambda: number, limit: number, similarity?: (a: Float32Array, b: Float32Array) => number): MmrCandidate[] {
  const sim = similarity ?? cosineSimilarity;
  const pool = [...candidates].sort((a, b) => b.score - a.score);
  const selected: MmrCandidate[] = [];
  const target = Math.min(limit, pool.length);

  while (selected.length < target && pool.length > 0) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      const cand = pool[i]!;
      let redundancy = 0;
      if (cand.vector) {
        for (const chosen of selected) {
          if (!chosen.vector) continue;
          const s = sim(cand.vector, chosen.vector);
          if (s > redundancy) redundancy = s;
        }
      }
      const value = lambda * cand.score - (1 - lambda) * redundancy;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }
    selected.push(pool.splice(bestIndex, 1)[0]!);
  }
  return selected;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function l2Normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i += 1) sum += v[i]! * v[i]!;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i += 1) out[i] = v[i]! / norm;
  return out;
}

export interface ScoreInput {
  vector: number | null;
  fts: number | null;
  ucs: number | null;
  struct: number | null;
  ranks: Partial<Record<Retriever, number>>;
  fused: number;
}

export function buildScoreBreakdown(input: ScoreInput): ScoreBreakdown {
  const ranked = Object.keys(input.ranks).length > 0;
  return {
    vector: input.vector,
    fts: input.fts,
    ucs: input.ucs,
    struct: input.struct,
    ranks: input.ranks,
    final: input.fused,
    // Items that were never ranked by any retriever (a pure browse/filter
    // result set) are exact matches of the request, hence full confidence.
    confidence: ranked ? agreementConfidence(input.ranks) : 1,
  };
}

export const DEFAULT_RETRIEVER_WEIGHTS: Record<Retriever, number> = {
  vector: 0.60,
  fts: 0.20,
  ucs: 0.12,
  struct: 0.08,
  probe: 0.60,
};

/** Sort helper shared by the engine and tests. */
export function sortHits(hits: SearchHit[]): SearchHit[] {
  return [...hits].sort((a, b) => {
    if (b.score.final !== a.score.final) return b.score.final - a.score.final;
    return a.asset.id - b.asset.id;
  });
}
