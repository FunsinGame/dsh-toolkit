/**
 * Reranking — plan §3.1(E).
 *
 * The retrievers return candidates ordered by fused rank, and on a real library
 * that ordering is only roughly right. Measured on 3,374 game-audio files, the
 * caption similarities of the top hits cluster tightly (e.g. 0.677 / 0.667 /
 * 0.652 / 0.647 for "sword swing"), so the vector retriever cannot separate them
 * on its own: mean recall@10 was 0.130 and MRR 0.218.
 *
 * ## Why not a cross-encoder
 *
 * The plan mentions "send (caption, audio tag text) to a small cross-encoder".
 * That needs a text tower pass per candidate against stored per-asset tag text,
 * which is a second model and thousands of extra inferences per query — out of
 * proportion for a CPU-only local tool. Instead this reranker fuses signals that
 * are **already available for free** at query time:
 *
 *   lexical  — how much of the expanded English caption appears in the file's
 *              own words (filename, embedded description, keywords, UCS names).
 *              Caption similarity alone cannot see that `ui_town_coins_sprk`
 *              literally contains "coins"; this is the signal that fixes it.
 *   category — agreement between the query's implied UCS category and the
 *              asset's assigned category.
 *   dsp      — coarse acoustic shape agreeing with the query (a "slam" should
 *              not be a long sustained bed).
 *   fused    — the retriever score, kept as the base so reranking refines the
 *              ranking rather than replacing it.
 *
 * Every component is reported per hit so the UI can explain the order, and the
 * weights live in one place so they can be tuned against the benchmark.
 */

import type { DspFeatures } from '@sounddesk/core';

/** Signals available for one candidate at rerank time. */
export interface RerankFeatures {
  /** the retriever's fused score, 0..1 */
  fused: number;
  /** caption similarity, when the vector retriever ran */
  vector: number | null;
  /** the English captions actually encoded for this query */
  captions: string[];
  /** the raw user query */
  rawQuery: string;
  /** user-visible terms (required + optional groups), for exclusion/coverage */
  queryTerms: string[];
  /** CSI: coarse acoustic features, if present */
  dsp: DspFeatures | null;
  durationMs: number | null;
  /** catIds the query appears to be asking about */
  hintCatIds: string[];
}

export interface RerankWeights {
  fused: number;
  lexical: number;
  category: number;
  dsp: number;
}

/**
 * Defaults chosen by measurement, not taste.
 *
 * `fused` stays the largest single term so the reranker refines rather than
 * overrides retrieval; `lexical` is large enough to rescue an item the vector
 * retriever buried (the coins case) without letting a filename match outrank a
 * clearly better acoustic match.
 */
export const DEFAULT_RERANK_WEIGHTS: RerankWeights = {
  fused: 0.40,
  lexical: 0.34,
  category: 0.16,
  dsp: 0.10,
};

export interface RerankBreakdown {
  lexical: number;
  category: number;
  dsp: number;
  fused: number;
  /** final blended score */
  score: number;
  /** caption terms the asset matched, for the UI */
  matchedTerms: string[];
}

export interface RerankResult<T> {
  item: T;
  breakdown: RerankBreakdown;
}

/**
 * Words that carry no retrieval signal and would inflate lexical overlap —
 * English articles/prepositions and the filler the rewriter emits.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'with', 'for', 'from',
  'by', 'as', 'is', 'are', 'be', 'it', 'its', 'this', 'that', 'sound', 'sounds',
  'effect', 'effects', 'sfx', 'audio', 'recording', 'clip', 'loop',
]);

/** Split text into comparable lowercase words, also splitting camelCase. */
export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/u)
    .filter((word) => word.length > 0);
}

/** Words worth matching on: no stop words, no single characters. */
export function contentWords(text: string): string[] {
  return tokenize(text).filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

/**
 * Match a query word against an asset word, tolerating the inflection and
 * abbreviation that real libraries use: "coins"↔"coin", "footsteps"↔"foot",
 * "skeleton"↔"skel".
 */
export function wordsMatch(queryWord: string, assetWord: string): boolean {
  if (queryWord === assetWord) return true;
  const shorter = queryWord.length <= assetWord.length ? queryWord : assetWord;
  const longer = queryWord.length <= assetWord.length ? assetWord : queryWord;
  if (!longer.startsWith(shorter)) return false;

  // Require at least 4 shared leading characters. A 3-character stem is the
  // library's own noise ("med"↔"metal", "pro"↔"prop") and cannot be told apart
  // from a real abbreviation at that length; this also stops "drop"↔"door" and
  // "coin"↔"cold". Because the check is on the *shorter* word, an abbreviation
  // like "skel" needs its expansion to reach 5 characters — "skel"↔"skeleton"
  // still matches, "med"↔"media" does not.
  //
  // A length-ratio guard was tried here and removed. Measured over the library's
  // 1,047-word vocabulary it cut 19 unique pairs, and the ones it cut were the
  // *useful* ones — "dark"↔"darkestdungeon", "room"↔"roomtransition",
  // "remove"↔"removequestherolevel", "curio"↔"curiousincantation" — because a real
  // compound is long by definition. It left the 20-query benchmark bit-identical
  // (recall@10 0.300, MRR 0.531 either way), so it bought nothing measurable while
  // costing real matches on queries the benchmark does not cover.
  return shorter.length >= 4;
}

/** Field weights: a filename match is stronger evidence than a category token. */
const FIELD_WEIGHTS = {
  filename: 1.0,
  keywords: 0.9,
  description: 0.7,
  ucs: 0.6,
} as const;

/**
 * Fraction of the query's content words that appear in the asset's own text,
 * weighted by which field they appear in.
 */
export function lexicalOverlap(
  queryWords: string[],
  asset: RerankAssetInput,
): { score: number; matched: string[] } {
  if (queryWords.length === 0) return { score: 0, matched: [] };

  const fields: Array<{ words: string[]; weight: number }> = [
    { words: contentWords(asset.filename), weight: FIELD_WEIGHTS.filename },
    ...(asset.ucsCategory ? [{ words: contentWords(asset.ucsCategory), weight: FIELD_WEIGHTS.ucs }] : []),
    ...(asset.ucsSubCategory ? [{ words: contentWords(asset.ucsSubCategory), weight: FIELD_WEIGHTS.ucs }] : []),
    ...(asset.keywords ? [{ words: asset.keywords.flatMap(contentWords), weight: FIELD_WEIGHTS.keywords }] : []),
    ...(asset.description ? [{ words: contentWords(asset.description), weight: FIELD_WEIGHTS.description }] : []),
  ];

  const matched: string[] = [];
  let bestPerWord = 0;
  for (const queryWord of queryWords) {
    let best = 0;
    for (const field of fields) {
      if (field.words.some((assetWord) => wordsMatch(queryWord, assetWord))) {
        if (field.weight > best) best = field.weight;
      }
    }
    // Guard against a repeated term counting twice — `rerankScore` dedupes its
    // own terms, but this function is exported and must not over-count if called
    // directly. The list is shown to the user, so repeats are visible noise.
    if (best > 0 && !matched.includes(queryWord)) matched.push(queryWord);
    bestPerWord += best;
  }
  return { score: bestPerWord / queryWords.length, matched };
}

/**
 * Acoustic sanity: does the file's shape contradict what the query implies?
 *
 * Deliberately conservative — it can only discount, never promote, because the
 * DSP features are crude estimates and a wrong promotion is worse than a missed
 * refinement. Returns 0..1 where 1 means "no contradiction".
 */
export function dspAgreement(dsp: DspFeatures | null, durationMs: number | null, queryWords: string[]): number {
  if (!dsp) return 1;

  const wantsTransient = queryWords.some((w) => /impact|hit|slam|clang|shatter|crash|smash|crit|stab|shot/.test(w));
  const wantsSustained = queryWords.some((w) => /ambience|ambient|loop|drone|hum|wind|rain|atmosphere|bed/.test(w));

  let agreement = 1;
  if (wantsTransient && dsp.decayMs > 1500) agreement -= 0.4;
  if (wantsSustained && dsp.decayMs < 200 && (durationMs ?? 0) < 1500) agreement -= 0.4;
  return Math.max(0, agreement);
}

/**
 * Category agreement: did the asset land in a category the query pointed at?
 * Returns 1 when the query gave no category hint (nothing to contradict).
 */
export function categoryAgreement(assetCatId: string | null, hintCatIds: string[]): number {
  if (hintCatIds.length === 0) return 1;
  if (!assetCatId) return 0.5;
  return hintCatIds.includes(assetCatId) ? 1 : 0.5;
}

/**
 * The asset fields the reranker reads. `AssetSummary` is intentionally lite (no
 * metadata blobs), so the engine widens the row it passes in with the few extra
 * columns this needs.
 */
export interface RerankAssetInput {
  filename: string;
  ucsCatId: string | null;
  ucsCategory?: string | null;
  ucsSubCategory?: string | null;
  description?: string | null;
  keywords?: string[] | null;
  /** coarse acoustic features, when the asset has been analysed */
  dsp?: DspFeatures | null;
}

/**
 * Blend the signals into a final score.
 *
 * Weight handling is the subtle part, and getting it wrong is how the first
 * version of this made retrieval *worse* (mean recall@10 0.130 -> 0.095):
 *
 *  - `fused` is always counted, so the score stays on the retriever's scale.
 *  - `lexical` is always counted too. Dropping it from the divisor when a word
 *    did not match looked harmless but meant a candidate with **no** lexical
 *    evidence was normalised by a smaller total, which handed it a *better*
 *    score than one that matched — inverting the very signal being added.
 *  - `category` and `dsp` are only counted when they carry information (a query
 *    with no category hint, or an asset with no DSP, must not be penalised).
 *
 * Kept as one pure function so the engine and the benchmark cannot drift: the
 * numbers the benchmark reports come from exactly this code.
 */
export function rerankScore(
  features: RerankFeatures,
  asset: RerankAssetInput,
  weights: RerankWeights = DEFAULT_RERANK_WEIGHTS,
): RerankBreakdown {
  // Terms come from both the raw query and the rewritten captions. Including the
  // Chinese original costs nothing (no asset word will match it) but means a
  // library that *does* contain Chinese metadata can still be matched lexically.
  //
  // Deduplicated at the source, because the rewriter deliberately overlaps the
  // two: "金币掉落" yields the captions "coins, dropping" and "gold coins,
  // falling", so "coins" appears three times over. Counting it once matters twice
  // over — `lexicalOverlap` would otherwise inflate its own denominator (making
  // every hit's lexical score look worse than it is) and would report the same
  // term repeatedly to the UI.
  const queryWords = [...new Set(contentWords([features.rawQuery, ...features.captions].join(' ')))];

  const { score: lexical, matched } = lexicalOverlap(queryWords, asset);

  const hasCategoryHint = features.hintCatIds.length > 0;
  const category = hasCategoryHint ? categoryAgreement(asset.ucsCatId, features.hintCatIds) : 1;
  // Prefer the asset's own DSP (passed via the width-typed input) and fall back
  // to whatever the caller put on the features.
  const dspFeatures = asset.dsp ?? features.dsp;
  const hasDsp = dspFeatures !== null;
  const dsp = hasDsp ? dspAgreement(dspFeatures, features.durationMs, queryWords) : 1;

  let numerator = features.fused * weights.fused + lexical * weights.lexical;
  let denominator = weights.fused + weights.lexical;
  if (hasCategoryHint) {
    numerator += category * weights.category;
    denominator += weights.category;
  }
  if (hasDsp) {
    numerator += dsp * weights.dsp;
    denominator += weights.dsp;
  }

  const score = denominator > 0 ? numerator / denominator : features.fused;

  return {
    lexical,
    category,
    dsp,
    fused: features.fused,
    score,
    matchedTerms: matched,
  };
}
