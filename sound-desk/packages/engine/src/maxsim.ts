/**
 * Max-similarity over sliding windows — plan §3.4, "滑动窗最大相似度（Late
 * Interaction / max-sim）".
 *
 * WHY THIS EXISTS
 *
 * A whole-file embedding is an RMS-weighted mean of window vectors. That is the
 * right fingerprint for a short sound, and the wrong one for a long file: a
 * two-second door slam inside a ten-minute ambience bed contributes 0.3% of the
 * mean, so the bed's embedding says "quiet room" and the slam is invisible to
 * query-by-example. Taking the **maximum** cosine over the file's windows instead
 * means "does this file contain anything that sounds like the reference", which is
 * the question a sound-effects search is actually asking.
 *
 * The arithmetic here is deliberately not literally "late interaction": CLAP emits
 * one vector per window, not one per frame, so this is a max over window vectors
 * rather than a token-level MaxSim. It is the same idea at the granularity the
 * model provides, and the plan names it the same way.
 *
 * The functions below are pure and take vectors as plain arrays, so the whole
 * reduction is unit-testable without a model, a database or a file.
 */

import { cosineSimilarity, l2Normalize } from '@sounddesk/core';

/** One analysis window of a file, as stored. */
export interface WindowVector {
  /** window index within its analysis pass, 0-based */
  index: number;
  /** where the window starts in the file, in milliseconds */
  startMs: number;
  vector: Float32Array;
}

/** Which window of a candidate matched, and how well. */
export interface WindowHit {
  /** best cosine over the file's windows */
  score: number;
  /** offset of the best window, in milliseconds */
  startMs: number;
  /** window index of the best window */
  index: number;
  /** how many windows were compared */
  windows: number;
}

export const MAXSIM_WINDOW_SECONDS = 10;
export const MAXSIM_HOP_SECONDS = 10;

/**
 * How many windows a single file may contribute.
 *
 * A 10-minute ambience is 60 windows at a 10 s hop; the cost is CLAP inference per
 * window, so this is the knob that keeps a query bounded. Longer files are sampled
 * evenly up to the cap rather than truncated, because a match in the tail of a long
 * bed is exactly what mean-pooling already fails to find.
 */
export const MAXSIM_MAX_WINDOWS = 24;

/**
 * Files re-analysed per query when the stored index only holds a mean vector.
 *
 * Only the head of the candidate list is re-embedded: those are the only files that
 * can plausibly win. The number is small because the cost is high and measured, not
 * guessed: CLAP inference runs at ~2.1 s per 10 s window on CPU (the figure behind
 * `CLAP_HOP_SECONDS`), and a long file contributes several windows, so re-analysing
 * one candidate costs roughly 4–10 s and this budget is a **latency cap of about ten
 * seconds**, not a throughput setting.
 *
 * That is only acceptable as a fallback for a catalogue that predates stored window
 * vectors. Once the embed pass has run over a library, every long file answers from
 * `windowed_embeddings` and this path is not reached at all (see `planMaxsim`).
 */
export const MAXSIM_DEFAULT_REFINE = 2;

/** The default we search with when refining: much wider than what we return. */
export const MAXSIM_REFINE_POOL = 200;

/**
 * A short file has one window and its mean already is that window, so windowing
 * adds nothing but risk (a one-window max-sim equals the mean by construction).
 */
export function isWindowable(durationMs: number | null | undefined): boolean {
  return typeof durationMs === 'number' && durationMs > MAXSIM_WINDOW_SECONDS * 1000;
}

/**
 * Window start offsets for a file of `durationMs`, in milliseconds.
 *
 * When the whole file fits in `MAXSIM_MAX_WINDOWS` windows the hop is uniform and
 * every part of it is covered. When it does not, the hop is widened so the sampled
 * windows still span the file end to end, rather than analysing the first 4 minutes
 * of a 10-minute bed and calling that a search.
 *
 * The result is always strictly increasing and always ends at `lastStart`, so every
 * window fits inside the file and no two windows are the same.
 */
export function windowOffsets(
  durationMs: number,
  options: { windowSeconds?: number; hopSeconds?: number; maxWindows?: number } = {},
): number[] {
  const windowMs = (options.windowSeconds ?? MAXSIM_WINDOW_SECONDS) * 1000;
  const maxWindows = options.maxWindows ?? MAXSIM_MAX_WINDOWS;
  const duration = Math.max(0, durationMs);
  if (duration <= 0 || maxWindows <= 0 || windowMs <= 0) return [0];
  if (duration <= windowMs) return [0];

  // The last window must start early enough to still fit inside the file.
  const lastStart = duration - windowMs;
  const requestedHop = (options.hopSeconds ?? MAXSIM_HOP_SECONDS) * 1000;
  // The largest hop that still yields at most `maxWindows` starts, so a long file
  // is sampled across its whole length instead of truncated.
  const hopForCap = lastStart / Math.max(1, maxWindows - 1);
  const hop = Math.max(1, Math.max(requestedHop, hopForCap));

  const offsets: number[] = [];
  for (let start = 0; start < lastStart && offsets.length < maxWindows - 1; start += hop) {
    offsets.push(Math.round(start));
  }
  // Uniform hop rarely lands exactly on the end; adding it keeps the tail sampled.
  if (offsets.length === 0 || offsets[offsets.length - 1] !== Math.round(lastStart)) {
    offsets.push(Math.round(lastStart));
  }
  return offsets;
}

/**
 * Reduce a query against one file's windows to its single best match.
 *
 * Returns `null` when there is nothing to compare — no windows, or every window a
 * different width from the query, which would mean a model change and is better
 * reported as "no windowed match" than as a zero score.
 */
export function selectBestWindow(query: Float32Array, windows: readonly WindowVector[]): WindowHit | null {
  if (windows.length === 0 || query.length === 0) return null;
  const q = l2Normalize(query);

  let best: WindowHit | null = null;
  // Counted separately from `windows.length`: a window whose width differs from the
  // query came from a different model and was not actually compared, and reporting
  // it as a compared window would overstate the coverage of a max-sim result.
  let compared = 0;
  for (const window of windows) {
    if (window.vector.length !== q.length) continue;
    compared += 1;
    const score = cosineSimilarity(q, window.vector);
    // Ties resolve to the earliest window so a result is reproducible.
    if (best === null || score > best.score) {
      best = { score, startMs: window.startMs, index: window.index, windows: compared };
    }
  }
  if (best === null) return null;
  return { ...best, windows: compared };
}

/** Keep only the best window per asset id, preserving the incoming order on ties. */
export function bestWindowPerAsset(
  hits: ReadonlyArray<{ assetId: number; hit: WindowHit }>,
): Array<{ assetId: number; hit: WindowHit }> {
  const best = new Map<number, { assetId: number; hit: WindowHit }>();
  for (const entry of hits) {
    const previous = best.get(entry.assetId);
    if (!previous || entry.hit.score > previous.hit.score) best.set(entry.assetId, entry);
  }
  return [...best.values()];
}

/** A candidate offered to max-sim, as the probe service knows it. */
export interface MaxsimCandidate {
  assetId: number;
  /** similarity already known from the whole-file (mean) comparison */
  meanScore: number;
  durationMs: number | null;
  /** a stored window vector set exists for this asset */
  windowsInIndex: boolean;
  /** how many windows the stored set holds; 0 when `windowsInIndex` is false */
  storedWindows: number;
}

/** Why a candidate was or was not re-analysed, so the UI can explain the latency. */
export type MaxsimSkipReason = 'short' | 'not-a-candidate' | 'budget';

export interface MaxsimPlanStep {
  candidate: MaxsimCandidate;
  action: 'stored' | 'analyse' | 'skip';
  reason?: MaxsimSkipReason;
}

export interface MaxsimPlan {
  steps: MaxsimPlanStep[];
  /** how many files will need a fresh embed */
  analyse: number;
  /** how many can be answered from stored vectors */
  stored: number;
  skipped: number;
}

/**
 * Decide, per candidate, whether max-sim has anything to add.
 *
 * Ranking the *work* by mean score and stopping at `refine` is the whole safety
 * property of this feature: re-embedding a file costs seconds of CPU, so only the
 * files that could plausibly win are ever re-analysed. A stored window set is
 * always used, because it costs nothing.
 */
export function planMaxsim(
  candidates: readonly MaxsimCandidate[],
  options: { refine?: number } = {},
): MaxsimPlan {
  const refine = Math.max(0, options.refine ?? MAXSIM_DEFAULT_REFINE);
  // Best mean score first: that is the best available estimate of who can win.
  const ranked = [...candidates].sort((a, b) => b.meanScore - a.meanScore);

  const steps: MaxsimPlanStep[] = [];
  let analyse = 0;
  let stored = 0;
  let skipped = 0;

  for (const candidate of ranked) {
    if (!isWindowable(candidate.durationMs)) {
      steps.push({ candidate, action: 'skip', reason: 'short' });
      skipped += 1;
      continue;
    }
    if (candidate.windowsInIndex && candidate.storedWindows > 0) {
      steps.push({ candidate, action: 'stored' });
      stored += 1;
      continue;
    }
    if (analyse < refine) {
      steps.push({ candidate, action: 'analyse' });
      analyse += 1;
      continue;
    }
    steps.push({ candidate, action: 'skip', reason: 'budget' });
    skipped += 1;
  }

  return { steps, analyse, stored, skipped };
}

/** What one max-sim comparison produced for a candidate. */
export interface MaxsimOutcome {
  assetId: number;
  score: number;
  startMs: number;
  windows: number;
  /** `stored` came from the index; `analysed` was computed for this query */
  via: 'stored' | 'analysed';
}

/**
 * Merge whole-file scores with the max-sim results.
 *
 * An asset's score is replaced only when max-sim found something better; the mean
 * comparison stands otherwise. Both are cosine similarities over the same model, so
 * the better of the two is a meaningful ranking rather than a mix of two scales —
 * which is why nothing is re-normalized here.
 */
export function mergeMaxsim(
  meanScores: ReadonlyMap<number, number>,
  outcomes: ReadonlyArray<MaxsimOutcome>,
): Array<{ assetId: number; score: number; maxsim?: MaxsimOutcome }> {
  const merged = new Map<number, { assetId: number; score: number; maxsim?: MaxsimOutcome }>();
  for (const [assetId, score] of meanScores) merged.set(assetId, { assetId, score });
  for (const outcome of outcomes) {
    const existing = merged.get(outcome.assetId);
    if (!existing) {
      merged.set(outcome.assetId, { assetId: outcome.assetId, score: outcome.score, maxsim: outcome });
      continue;
    }
    if (outcome.score > existing.score) {
      merged.set(outcome.assetId, { assetId: outcome.assetId, score: outcome.score, maxsim: outcome });
    }
  }
  return [...merged.values()].sort((a, b) => b.score - a.score || a.assetId - b.assetId);
}

/**
 * Human-readable offset for the UI: `1:23.4`.
 *
 * Kept here rather than in each caller so the probe bar and the server response
 * cannot disagree about how a matched offset reads.
 */
export function formatOffset(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60_000);
  const seconds = (total % 60_000) / 1000;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}
