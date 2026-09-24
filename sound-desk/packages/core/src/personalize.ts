/**
 * Personalised ranking — plan P2-3's "学习常用方向做轻度加权（可关）".
 *
 * ## Why this is deliberately weak
 *
 * A retrieval system that quietly reshapes itself around your clicks is hard to
 * trust and hard to debug: results stop matching the query and you cannot tell
 * why. So the adjustment here is **bounded to ±10%** by construction, and the
 * signal it learns from is the strongest one available — *you picked this for this
 * query* — rather than mere exposure.
 *
 * It is also entirely derivable: every weight is a pure function of the recorded
 * usage events, so it can be recomputed, explained ("6 plays for this query"), and
 * switched off without losing anything. Nothing here is a hidden model.
 */

/** A usage event, as recorded by the engine. */
export interface UsageEvent {
  assetId: number;
  /** null for a context-free action such as a download from the details pane */
  query: string | null;
  kind: UsageKind;
  at: number;
}

export type UsageKind = 'play' | 'select' | 'export' | 'download';

/**
 * How much each kind of action counts.
 *
 * `play` outweighs `select` because selecting a row is how you *look* at options
 * while playing one is how you *choose* it. `select` is included at a low weight
 * so the signal exists at all before anyone has pressed play.
 */
export const USAGE_KIND_WEIGHTS: Record<UsageKind, number> = {
  play: 1,
  export: 1.2,
  download: 1.2,
  select: 0.25,
};

/** The bound the plan specifies: never more than ±10%. */
export const MAX_ADJUSTMENT = 0.1;
export const MIN_WEIGHT = 1 - MAX_ADJUSTMENT;
export const MAX_WEIGHT = 1 + MAX_ADJUSTMENT;

/**
 * Number of same-query picks that reaches roughly full adjustment.
 *
 * Chosen so a handful of deliberate plays moves the needle while a single
 * accidental one does not: `1 - exp(-n/3)` is ~0.28 at n=1, ~0.63 at n=3, ~0.92
 * at n=8.
 */
export const SATURATION_POINTS = 3;

/** A cross-query pick counts for this share of a same-query one. */
export const CROSS_QUERY_DISCOUNT = 0.25;

/**
 * Normalise a query for comparison.
 *
 * Two searches that differ only in case, spacing or an image-search prefix are the
 * same intent, and treating them as different would silently halve the signal.
 */
export function normalizeQueryKey(query: string | null | undefined): string | null {
  if (query === null || query === undefined) return null;
  const trimmed = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return null;
  // image search is addressed with a `@id`-style prefix and must not be confused
  // with a text query that happens to look like one
  return trimmed.replace(/^@\d+\s*/, '');
}

export interface AssetUsage {
  assetId: number;
  /** adjusted event count: same-query picks at full value, others discounted */
  score: number;
  /** raw number of events, for explaining the weight to the user */
  events: number;
  /** how many of those were for the query currently being ranked */
  sameQuery: number;
  /** the most recent event time, so a stale preference can be aged out later */
  lastAt: number;
}

/**
 * Fold raw events into a per-asset usage score.
 *
 * `query` is the query being ranked right now. Events for that query count fully;
 * events for other queries count at {@link CROSS_QUERY_DISCOUNT}, because a sound
 * you keep reaching for in general is weaker evidence than one you picked for
 * *this* search.
 */
export function summarizeUsage(events: UsageEvent[], query: string | null): Map<number, AssetUsage> {
  const target = normalizeQueryKey(query);
  const out = new Map<number, AssetUsage>();

  for (const event of events) {
    if (!Number.isFinite(event.assetId)) continue;
    const kindWeight = USAGE_KIND_WEIGHTS[event.kind] ?? 0;
    if (kindWeight === 0) continue;

    const eventQuery = normalizeQueryKey(event.query);
    const isSameQuery = target !== null && eventQuery !== null && eventQuery === target;
    const value = kindWeight * (isSameQuery ? 1 : CROSS_QUERY_DISCOUNT);

    const existing = out.get(event.assetId);
    if (existing) {
      existing.score += value;
      existing.events += 1;
      if (isSameQuery) existing.sameQuery += 1;
      existing.lastAt = Math.max(existing.lastAt, event.at);
    } else {
      out.set(event.assetId, {
        assetId: event.assetId,
        score: value,
        events: 1,
        sameQuery: isSameQuery ? 1 : 0,
        lastAt: event.at,
      });
    }
  }

  return out;
}

/**
 * Turn a usage score into a multiplier.
 *
 * Saturating rather than linear so that a sound played fifty times does not run
 * away with the ranking; the bound is the point.
 */
export function usageWeight(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 1;
  const saturation = 1 - Math.exp(-score / SATURATION_POINTS);
  const weight = 1 + MAX_ADJUSTMENT * saturation;
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, weight));
}

/** The multiplier for one asset, from a summary map. Missing means neutral. */
export function weightFor(usage: Map<number, AssetUsage>, assetId: number): number {
  const record = usage.get(assetId);
  return record ? usageWeight(record.score) : 1;
}

export interface AppliedAdjustment {
  assetId: number;
  before: number;
  after: number;
  weight: number;
  /** human-readable reason, for the UI's explain panel */
  reason: string | null;
}

/**
 * Apply the learned weight to a scored list and report what changed.
 *
 * Returns the adjustments so the UI can explain them. A ranking that moved for
 * reasons the user cannot see is the failure mode this whole module is written to
 * avoid, so the reason string is part of the contract rather than a nicety.
 */
export function applyPersonalization<T extends { id: number; score: number }>(
  items: T[],
  usage: Map<number, AssetUsage>,
  enabled: boolean,
): { items: Array<T & { personalized?: AppliedAdjustment }>; adjustments: AppliedAdjustment[] } {
  if (!enabled || usage.size === 0) return { items, adjustments: [] };

  const adjustments: AppliedAdjustment[] = [];
  const out = items.map((item) => {
    const weight = weightFor(usage, item.id);
    if (weight === 1) return item;
    const after = item.score * weight;
    const record = usage.get(item.id)!;
    const parts: string[] = [];
    if (record.sameQuery > 0) parts.push(`该查询下选过 ${record.sameQuery} 次`);
    const other = record.events - record.sameQuery;
    if (other > 0) parts.push(`其他查询选过 ${other} 次`);
    const adjustment: AppliedAdjustment = {
      assetId: item.id,
      before: item.score,
      after,
      weight,
      reason: parts.length > 0 ? parts.join('，') : null,
    };
    adjustments.push(adjustment);
    return { ...item, score: after, personalized: adjustment };
  });

  return { items: out, adjustments };
}

/**
 * A one-line description of how much the personalisation is currently doing.
 *
 * Shown next to the toggle so "on" is never a mystery: a user who cannot tell
 * whether their ranking is being altered will not trust either state.
 */
export function describePersonalization(enabled: boolean, trackedAssets: number): string {
  if (!enabled) return '个性化排序已关闭，结果完全由检索决定';
  if (trackedAssets === 0) return '个性化排序已开启，但还没有足够的播放记录（最多 ±10%）';
  return `个性化排序已开启，基于 ${trackedAssets} 条素材的使用记录（最多 ±10%）`;
}
