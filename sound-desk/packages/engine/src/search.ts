/**
 * Hybrid retrieval: BM25 (FTS5) + KNN (embedding scan) + UCS prior +
 * structured filters, fused with weighted RRF.
 *
 * Two deliberate choices worth calling out:
 *  - The vector retriever brute-forces a cosine scan over an in-memory
 *    Float32Array index. At the scale this tool targets (tens of thousands of
 *    files) that is single-digit milliseconds and needs no native extension. The
 *    `VectorIndex` class is the seam where an ANN index would slot in later.
 *  - Results below the similarity threshold are dropped rather than padded.
 *    "Few results" is information: it means the library genuinely has nothing
 *    that sounds like the query.
 */

import {
  DEFAULT_RETRIEVER_WEIGHTS,
  DEFAULT_SEARCH_LIMIT,
  IndexStage,
  SIMILARITY_THRESHOLD,
  applyPersonalization,
  buildScoreBreakdown,
  cosineSimilarity,
  l2Normalize,
  mmrRerank,
  parseQuery,
  reciprocalRankFusion,
  semanticTextOf,
  summarizeUsage,
  toFtsMatch,
  type AssetSummary,
  type DspFeatures,
  type Embedder,
  type ParsedQuery,
  type Retriever,
  type SearchFilters,
  type SearchHit,
  type SearchRequest,
  type SearchResponse,
  type ScoreBreakdown,
} from '@sounddesk/core';

import type { Catalog } from './db.js';
import { rowToSummary } from './mappers.js';
import { contentWords, rerankScore, DEFAULT_RERANK_WEIGHTS, type RerankAssetInput, type RerankWeights } from './rerank.js';
import type { RankedList } from '@sounddesk/core';

export interface VectorIndexOptions {
  /** reload the embedding index from the DB (call after an embed pass) */
  catalog: Catalog;
}

/**
 * In-memory embedding index with a flat cosine scan.
 * Embeddings are stored L2-normalized at write time, so similarity is a dot
 * product; we still guard with the general cosine helper for safety.
 */
export class VectorIndex {
  private mean = new Map<number, Float32Array>();
  private onset = new Map<number, Float32Array>();
  private dim = 0;
  private loadedAt = 0;
  /** embedding row count at load time, used to detect a concurrent backfill */
  private countAtLoad = -1;

  private readonly catalog: Catalog;

  constructor(catalog: Catalog) {
    this.catalog = catalog;
  }

  get size(): number {
    return this.mean.size;
  }

  get dimension(): number {
    return this.dim;
  }

  get ageMs(): number {
    return Date.now() - this.loadedAt;
  }

  reload(): void {
    this.mean = this.catalog.loadEmbeddings('mean');
    this.onset = this.catalog.loadEmbeddings('onset');
    const first = this.mean.values().next();
    this.dim = first.done ? 0 : first.value.length;
    this.countAtLoad = this.catalog.countEmbeddings();
    this.loadedAt = Date.now();
  }

  /**
   * Reload when the index is stale, when it is empty but embeddings exist, or
   * when the embedding count changed underneath us.
   *
   * That last case is the important one: a backfill runs in its own process and
   * writes embeddings continuously, so a long-lived server would otherwise keep
   * serving whatever it loaded at startup. During a backfill that is a small,
   * biased subset, which makes semantic results actively misleading.
   */
  ensureFresh(maxAgeMs = 5_000): void {
    if (this.loadedAt === 0) {
      this.reload();
      return;
    }
    const stale = this.ageMs > maxAgeMs;
    const emptyButPopulated = this.size === 0 && this.catalog.countEmbeddings() > 0;
    const grew = this.catalog.countEmbeddings() !== this.countAtLoad;
    if (stale || emptyButPopulated || grew) this.reload();
  }

  get(assetId: number, field: 'mean' | 'onset' = 'mean'): Float32Array | null {
    const map = field === 'onset' ? this.onset : this.mean;
    return map.get(assetId) ?? null;
  }

  /** Top-N by cosine similarity. Returns raw similarity scores in 0..1. */
  search(query: Float32Array, limit: number, field: 'mean' | 'onset' = 'mean'): Array<{ id: number; score: number }> {
    const map = field === 'onset' && this.onset.size > 0 ? this.onset : this.mean;
    if (map.size === 0) return [];
    const q = l2Normalize(query);
    const scored: Array<{ id: number; score: number }> = [];
    for (const [id, vec] of map) {
      if (vec.length !== q.length) continue;
      const score = cosineSimilarity(q, vec);
      scored.push({ id, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /**
   * Max-similarity for a specific set of assets.
   *
   * Used by the probe path, where the candidate set is already known and re-reading
   * the whole window table for a handful of ids would be wasteful. Returns one entry
   * per asset that had at least one comparable window.
   *
   * Deliberately NOT offered as a whole-library search: max-sim over every stored
   * window would be a scan of the entire window table, which is orders of magnitude
   * larger than the mean table and cannot meet the search latency budget without an
   * ANN index over the window vectors. Query-by-example does not need one, because it
   * already knows which few files it might be looking for.
   */
  searchMaxsimFor(
    query: Float32Array,
    assetIds: readonly number[],
  ): Array<{ assetId: number; score: number; startMs: number; windows: number }> {
    if (assetIds.length === 0 || query.length === 0) return [];
    const q = l2Normalize(query);
    const out: Array<{ assetId: number; score: number; startMs: number; windows: number }> = [];

    for (const assetId of assetIds) {
      const windows = this.catalog.loadWindowedEmbeddingsFor(assetId);
      if (windows.length === 0) continue;
      let best = -Infinity;
      let bestStart = windows[0]!.startMs;
      let compared = 0;
      for (const window of windows) {
        if (window.vector.length !== q.length) continue;
        compared += 1;
        const score = cosineSimilarity(q, window.vector);
        if (score > best) {
          best = score;
          bestStart = window.startMs;
        }
      }
      if (compared > 0) out.push({ assetId, score: best, startMs: bestStart, windows: compared });
    }
    return out;
  }

  /** How many assets have sub-window vectors stored, for the engine info panel. */
  get windowedSize(): number {
    return this.catalog.countWindowedAssets();
  }

  /** Nearest neighbours of an already-indexed asset — no inference needed. */
  similarTo(assetId: number, limit: number, field: 'mean' | 'onset' = 'mean'): Array<{ id: number; score: number }> {
    const vec = this.get(assetId, field);
    if (!vec) return [];
    return this.search(vec, limit + 1, field).filter((r) => r.id !== assetId).slice(0, limit);
  }
}

/** Below this fraction of assets embedded, the vector retriever is not used. */
export const MIN_VECTOR_COVERAGE = 0.6;

export interface SearchDeps {
  catalog: Catalog;
  vectorIndex: VectorIndex;
  /** null when no model is available; the semantic path is then skipped cleanly */
  embedder: Embedder | null;
  /** rewrites a natural-language query into captions the model understands */
  expandQuery: (text: string) => { captions: string[]; rewritten: string; unmatched: string[] };
  /** alias/CatID lookup used by the UCS prior retriever */
  classifierLookup: (term: string) => string[];
  /** every catId inside a top-level category code */
  classifierLookupCategory: (category: string) => string[];
  /** optional LLM rewrite, resolved lazily so search never blocks on the network */
  llmRewrite?: ((text: string) => Promise<string[]>) | null;
  /** override the coverage floor; mainly for tests */
  minVectorCoverage?: number;
  /** override rerank weights; mainly for the benchmark */
  rerankWeights?: RerankWeights;
  /** override the RRF weights; mainly for the benchmark */
  retrieverWeights?: Partial<Record<Retriever, number>>;
}

export class SearchService {
  private readonly deps: SearchDeps;

  constructor(deps: SearchDeps) {
    this.deps = deps;
  }

  /** Effective RRF weights: defaults, overridden by deps for benchmarking. */
  private weights(): Record<Retriever, number> {
    return { ...DEFAULT_RETRIEVER_WEIGHTS, ...(this.deps.retrieverWeights ?? {}) };
  }

  /**
   * Whether the semantic retriever can actually run.
   *
   * Reported through `/api/stats` so the UI can say "keyword only" instead of
   * implying semantic search is available. Note this is about the *embedder*
   * being loaded, not about the library being embedded — coverage is a separate
   * question answered per search.
   */
  get embedderReady(): boolean {
    return this.deps.embedder?.ready === true;
  }

  /**
   * The embedder itself, for callers that need to encode something the text path
   * cannot express — a reference clip or a selection, i.e. query-by-example.
   *
   * Exposed rather than reached into, so there is one place that knows how the
   * embedder is obtained.
   */
  get audioEmbedder(): Embedder | null {
    return this.deps.embedder;
  }

  /** How many assets already have embeddings, for progress reporting. */
  get embeddedCount(): number {
    return this.deps.vectorIndex.size;
  }

  async search(req: SearchRequest): Promise<SearchResponse> {
    const started = Date.now();
    const limit = Math.max(1, Math.min(req.limit ?? DEFAULT_SEARCH_LIMIT, 500));
    const mode = req.mode ?? 'hybrid';
    const diagnostics: NonNullable<SearchResponse['diagnostics']> = {
      perRetriever: [],
      vectorCoverage: { embedded: this.deps.vectorIndex.size, total: this.deps.catalog.countAssets() },
    };

    const rawQuery = (req.q ?? '').trim();
    const parsed = parseQuery(rawQuery);
    const allowed = this.resolveFilterIds(req.filters);

    // The request wins over the stored setting, so a caller can always ask for
    // reproducible ordering. Read from the catalogue per search rather than
    // captured at construction, so toggling it takes effect immediately.
    const personalizationOn =
      req.personalize ?? this.deps.catalog.personalizationEnabled();
    const personalized: NonNullable<SearchResponse['personalized']> = [];

    const lists: RankedList[] = [];
    let captionsUsed: string[] = [];
    let unmatchedTerms: string[] = [];

    // --- retriever 1: FTS5 / BM25 -------------------------------------
    if (mode !== 'similar' && (mode === 'keyword' || mode === 'hybrid') && rawQuery.length > 0) {
      const t0 = Date.now();
      const ftsList = this.runFts(parsed, limit * 4, allowed);
      diagnostics.perRetriever.push({ retriever: 'fts', candidates: ftsList.ids.length, tookMs: Date.now() - t0 });
      if (ftsList.ids.length > 0) lists.push(ftsList);
    }

    // --- retriever 2: embeddings --------------------------------------
    // Guarded by coverage. A partially-embedded library is the normal state
    // while the backfill runs, and ranking against that subset produces
    // confident nonsense: whichever few files happen to be embedded win,
    // regardless of relevance. Fewer, honest results beat that.
    //
    // Refresh first: the coverage number and the search itself must agree, and a
    // backfill running in another process changes the count continuously.
    this.deps.vectorIndex.ensureFresh();
    const totalAssets = this.deps.catalog.countAssets();
    const embedded = this.deps.vectorIndex.size;
    const coverage = totalAssets > 0 ? embedded / totalAssets : 0;
    const coverageFloor = this.deps.minVectorCoverage ?? MIN_VECTOR_COVERAGE;
    let vectorScores = new Map<number, number>();
    let semanticIncomplete = false;

    if (mode !== 'keyword' && mode !== 'similar') {
      if (embedded > 0 && coverage < coverageFloor) {
        // Too sparse to be meaningful. Say so rather than guessing.
        semanticIncomplete = true;
        diagnostics.perRetriever.push({ retriever: 'vector', candidates: 0, tookMs: 0 });
      } else {
        const t0 = Date.now();
        const result = await this.runVector(rawQuery, parsed, limit * 4, allowed, req.vectorField ?? 'mean');
        captionsUsed = result.captionsUsed;
        unmatchedTerms = result.unmatched;
        vectorScores = result.scores;
        const ids = this.rankFromScores(vectorScores, limit * 4);
        diagnostics.perRetriever.push({ retriever: 'vector', candidates: ids.length, tookMs: Date.now() - t0 });
        if (ids.length > 0) {
          lists.push({
            retriever: 'vector',
            ids,
            scores: ids.map((id) => vectorScores.get(id) ?? 0),
            weight: this.weights().vector,
          });
        }
      }
    }

    // --- retriever 3: query by example --------------------------------
    if (mode === 'similar' || req.similarToAssetId !== undefined) {
      const t0 = Date.now();
      const ids = this.runSimilar(req.similarToAssetId, limit * 3, allowed, req.vectorField ?? 'mean');
      diagnostics.perRetriever.push({ retriever: 'probe', candidates: ids.length, tookMs: Date.now() - t0 });
      if (ids.length > 0) lists.push({ retriever: 'probe', ids, weight: this.weights().probe });
    }

    // --- retriever 4: UCS prior ---------------------------------------
    // Deliberately skipped in `semantic` mode: the point of that mode is to see
    // what the *embeddings* think, and mixing in a classification prior both
    // reorders the results and makes the similarity scores look inconsistent.
    if (mode !== 'semantic') {
      const t0 = Date.now();
      const ucsList = this.runUcsPrior(parsed, rawQuery, limit * 3, allowed);
      diagnostics.perRetriever.push({ retriever: 'ucs', candidates: ucsList.ids.length, tookMs: Date.now() - t0 });
      if (ucsList.ids.length > 0) lists.push(ucsList);
    } else {
      diagnostics.perRetriever.push({ retriever: 'ucs', candidates: 0, tookMs: 0 });
    }

    // --- retriever 5: structured filters ------------------------------
    if (allowed) {
      const t0 = Date.now();
      const structIds = this.runStruct(allowed, limit * 3);
      diagnostics.perRetriever.push({ retriever: 'struct', candidates: structIds.length, tookMs: Date.now() - t0 });
      if (structIds.length > 0) lists.push({ retriever: 'struct', ids: structIds, weight: this.weights().struct });
    }

    if (lists.length === 0) {
      return {
        hits: [],
        total: 0,
        tookMs: Date.now() - started,
        captionsUsed,
        unmatchedTerms,
        belowThreshold: false,
        semanticIncomplete,
        diagnostics: req.explain ? diagnostics : undefined,
      };
    }

    const fused = reciprocalRankFusion(lists, { k: 60, perListLimit: limit * 4 });

    // Materialize summaries in one query, then apply the similarity gate.
    const ids = [...fused.keys()];
    const summaries = this.loadSummaries(ids);

    let belowThreshold = false;
    interface Candidate {
      hit: SearchHit;
      vector: Float32Array | null;
      vectorScore: number | null;
    }
    let candidates: Candidate[] = ids
      .map((id): Candidate | null => {
        const summary = summaries.get(id);
        const entry = fused.get(id);
        if (!summary || !entry) return null;
        const vectorScore = vectorScores.get(id) ?? null;
        const score: ScoreBreakdown = buildScoreBreakdown({
          vector: vectorScore,
          fts: entry.raw.fts ?? null,
          ucs: entry.raw.ucs ?? null,
          struct: entry.raw.struct ?? null,
          ranks: entry.ranks,
          fused: entry.score,
        });
        const hit: SearchHit = {
          asset: summary,
          score,
          highlights: buildHighlights(parsed, summary, vectorScore),
        };
        return { hit, vector: this.deps.vectorIndex.get(id, req.vectorField ?? 'mean'), vectorScore };
      })
      .filter((x): x is Candidate => x !== null);

    // "Honest results": when the semantic path ran and the best cosine is weak,
    // say so rather than padding the list with poor matches.
    if (vectorScores.size > 0 && candidates.length > 0) {
      const best = Math.max(...[...vectorScores.values()]);
      if (best < SIMILARITY_THRESHOLD && mode !== 'keyword') {
        candidates = candidates.filter((c) => (c.vectorScore ?? 0) >= SIMILARITY_THRESHOLD * 0.7);
        belowThreshold = candidates.length === 0;
      }
    }

    // MMR trades relevance for diversity, which is useful for "find me similar
    // sounds" (otherwise one recording session fills the page) but wrong for a
    // pure semantic listing, where the user expects strict similarity order.
    const withVectors = candidates.filter((c) => c.vector !== null);
    if (withVectors.length > 4 && mode === 'similar') {
      const reranked = mmrRerank(
        candidates.map((c) => ({ id: c.hit.asset.id, score: c.hit.score.final, vector: c.vector })),
        0.75,
        limit,
      );
      const order = new Map(reranked.map((r, i) => [r.id, i] as const));
      candidates.sort((a, b) => (order.get(a.hit.asset.id) ?? 1e9) - (order.get(b.hit.asset.id) ?? 1e9));
    } else {
      candidates.sort((a, b) => b.hit.score.final - a.hit.score.final);
    }

    // --- rerank (plan §3.1(E)) ----------------------------------------
    // The fused order is only roughly right: on a real library the top caption
    // similarities cluster tightly, so the vector retriever cannot separate
    // them. Refine using signals that cost nothing extra — lexical overlap with
    // the library's own vocabulary, UCS agreement, and acoustic plausibility.
    // Skipped for `similar` mode, where the vector order *is* the answer.
    const rerankEnabled = req.rerank ?? true;
    if (rerankEnabled && mode !== 'similar' && candidates.length > 0) {
      const rerankInputs = this.loadRerankInputs(candidates.map((c) => c.hit.asset.id));
      const hintCatIds = collectHintCatIds(this.deps.classifierLookup, parsed, rawQuery);
      const weights = this.deps.rerankWeights ?? DEFAULT_RERANK_WEIGHTS;

      for (const candidate of candidates) {
        const asset = rerankInputs.get(candidate.hit.asset.id);
        if (!asset) continue;
        const breakdown = rerankScore(
          {
            fused: candidate.hit.score.final,
            vector: candidate.vectorScore,
            captions: captionsUsed,
            rawQuery,
            queryTerms: [...parsed.required, ...parsed.optionalGroups.flat()],
            dsp: asset.dsp ?? null,
            durationMs: candidate.hit.asset.durationMs,
            hintCatIds,
          },
          asset,
          weights,
        );
        candidate.hit.score.rerank = breakdown;
        candidate.hit.score.final = breakdown.score;
        if (breakdown.matchedTerms.length > 0) {
          candidate.hit.highlights = [
            ...candidate.hit.highlights,
            `匹配 ${breakdown.matchedTerms.slice(0, 4).join(', ')}`,
          ];
        }
      }
      candidates.sort((a, b) => b.hit.score.final - a.hit.score.final);
    }

    // --- personalised ranking (plan P2-3) ------------------------------
    // Applied after reranking so the learned weight is the last, smallest word.
    // Bounded to ±10% by construction (see core/personalize.ts), which is what
    // makes it safe to leave on: it nudges near-ties and cannot promote a poor
    // match over a good one.
    if (personalizationOn && candidates.length > 0 && rawQuery.length > 0) {
      const usage = summarizeUsage(this.deps.catalog.recentUsage(), rawQuery);
      if (usage.size > 0) {
        const { items, adjustments } = applyPersonalization(
          candidates.map((c) => ({ id: c.hit.asset.id, score: c.hit.score.final, candidate: c })),
          usage,
          true,
        );
        for (const item of items) {
          item.candidate.hit.score.final = item.score;
          if (item.personalized) {
            personalized.push({
              assetId: item.personalized.assetId,
              weight: item.personalized.weight,
              reason: item.personalized.reason ?? '',
            });
          }
        }
        if (adjustments.length > 0) {
          candidates.sort((a, b) => b.hit.score.final - a.hit.score.final);
        }
      }
    }

    const offset = Math.max(0, req.offset ?? 0);
    const page = candidates.slice(offset, offset + limit).map((c) => c.hit);

    if (rawQuery.length > 0) {
      this.deps.catalog.addSearchHistory(rawQuery, mode, page.length);
    }

    return {
      hits: page,
      total: candidates.length,
      tookMs: Date.now() - started,
      captionsUsed,
      unmatchedTerms,
      belowThreshold,
      semanticIncomplete,
      personalized: personalized.length > 0 ? personalized : undefined,
      diagnostics: req.explain ? diagnostics : undefined,
    };
  }

  // -- retrievers --------------------------------------------------------

  private runFts(parsed: ParsedQuery, limit: number, allowed: Set<number> | null): RankedList {
    const match = toFtsMatch(parsed, ['searchText']);
    if (!match) return { retriever: 'fts', ids: [], scores: [], weight: this.weights().fts };
    let rows: Array<{ id: number; score: number }>;
    try {
      rows = this.deps.catalog.ftsSearch(match, limit, allowed ?? undefined);
    } catch {
      // A malformed MATCH expression must not take down search.
      return { retriever: 'fts', ids: [], scores: [], weight: this.weights().fts };
    }
    // bm25() returns lower-is-better (negative) scores; negate so higher is better.
    return {
      retriever: 'fts',
      ids: rows.map((r) => r.id),
      scores: rows.map((r) => -r.score),
      weight: this.weights().fts,
    };
  }

  private async runVector(
    rawQuery: string,
    parsed: ParsedQuery,
    limit: number,
    allowed: Set<number> | null,
    field: 'mean' | 'onset',
  ): Promise<{ scores: Map<number, number>; captionsUsed: string[]; unmatched: string[] }> {
    const empty = { scores: new Map<number, number>(), captionsUsed: [] as string[], unmatched: [] as string[] };
    const embedder = this.deps.embedder;
    if (!embedder || !embedder.ready) return empty;
    if (rawQuery.length === 0) return empty;
    if (this.deps.vectorIndex.size === 0) {
      this.deps.vectorIndex.ensureFresh();
      if (this.deps.vectorIndex.size === 0) return empty;
    }

    const semanticText = semanticTextOf(parsed);
    const expanded = this.deps.expandQuery(semanticText.length > 0 ? semanticText : rawQuery);
    let captions = expanded.captions;

    // Optional LLM rewrite is best-effort and must never delay a search badly.
    if (this.deps.llmRewrite && parsed.isNaturalLanguage) {
      try {
        const extra = await Promise.race([
          this.deps.llmRewrite(rawQuery),
          new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 1_200)),
        ]);
        if (extra.length > 0) captions = [...new Set([...captions, ...extra])].slice(0, 6);
      } catch {
        /* keep the dictionary rewrite */
      }
    }

    let queryVectors: Float32Array[];
    try {
      queryVectors = await embedder.embedText(captions);
    } catch {
      return { ...empty, captionsUsed: captions, unmatched: expanded.unmatched };
    }

    // Score an asset by its best-matching caption: a Chinese query and its
    // English rewrite each get a chance to be the closer match.
    const scores = new Map<number, number>();
    for (const qv of queryVectors) {
      for (const { id, score } of this.deps.vectorIndex.search(qv, limit, field)) {
        const prev = scores.get(id);
        if (prev === undefined || score > prev) scores.set(id, score);
      }
    }
    if (allowed) {
      for (const id of [...scores.keys()]) if (!allowed.has(id)) scores.delete(id);
    }

    return { scores, captionsUsed: captions, unmatched: expanded.unmatched };
  }

  private runSimilar(assetId: number | undefined, limit: number, allowed: Set<number> | null, field: 'mean' | 'onset'): number[] {
    if (assetId === undefined) return [];
    this.deps.vectorIndex.ensureFresh();
    let hits = this.deps.vectorIndex.similarTo(assetId, limit, field);
    if (allowed) hits = hits.filter((h) => allowed.has(h.id));
    return hits.map((h) => h.id);
  }

  /**
   * UCS prior: if the query names a category or a known CatID, assets already
   * classified there get a boost. This is also what makes a query like
   * "太鼓" work even before the embedding model is installed.
   */
  private runUcsPrior(parsed: ParsedQuery, rawQuery: string, limit: number, allowed: Set<number> | null): RankedList {
    const terms = [...parsed.required, ...parsed.optionalGroups.flat(), rawQuery];
    const catIds = new Set<string>();
    for (const term of terms) {
      const clean = term.replace(/\*+$/, '').trim();
      if (clean.length < 2) continue;
      for (const hit of this.deps.classifierLookup(clean)) catIds.add(hit);
    }
    if (catIds.size === 0) return { retriever: 'ucs', ids: [], scores: [], weight: this.weights().ucs };

    const placeholders = [...catIds].map(() => '?').join(',');
    const rows = this.deps.catalog.db
      .prepare(
        `SELECT id, filename, ucsCatId, ucsConfidence FROM assets
         WHERE ucsCatId IN (${placeholders})
         ORDER BY ucsConfidence DESC, id
         LIMIT ?`,
      )
      .all(...[...catIds], limit) as Array<{ id: number; filename: string; ucsCatId: string | null; ucsConfidence: number | null }>;

    // Exclusions must apply to every retriever, not just FTS. Without this,
    // "metal -clang" would still surface clang files through the UCS prior.
    const excluded = parsed.excluded.map((t) => t.toLowerCase()).filter(Boolean);
    const passesExclusion = (row: { filename: string; ucsCatId: string | null }): boolean => {
      if (excluded.length === 0) return true;
      const hay = `${row.filename} ${row.ucsCatId ?? ''}`.toLowerCase();
      return !excluded.some((term) => hay.includes(term));
    };

    let filtered = rows.filter(passesExclusion);
    if (allowed) filtered = filtered.filter((r) => allowed.has(r.id));
    return {
      retriever: 'ucs',
      ids: filtered.map((r) => r.id),
      scores: filtered.map((r) => r.ucsConfidence ?? 0),
      weight: this.weights().ucs,
    };
  }

  /** Structured filters act as a soft retriever, boosting files that match them. */
  private runStruct(allowed: Set<number>, limit: number): number[] {
    if (allowed.size === 0) return [];
    const ids = [...allowed];
    ids.sort((a, b) => a - b);
    return ids.slice(0, limit);
  }

  // -- helpers -----------------------------------------------------------

  /** Resolve `filters` to a set of allowed asset ids, or null for "no restriction". */
  private resolveFilterIds(filters: SearchFilters | undefined): Set<number> | null {
    if (!filters) return null;
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.libraryIds?.length) {
      clauses.push(`libraryId IN (${filters.libraryIds.map(() => '?').join(',')})`);
      params.push(...filters.libraryIds);
    }
    if (filters.ucsCatIds?.length) {
      clauses.push(`ucsCatId IN (${filters.ucsCatIds.map(() => '?').join(',')})`);
      params.push(...filters.ucsCatIds);
    }
    if (filters.categories?.length) {
      const ids = filters.categories.flatMap((c) => this.deps.classifierLookupCategory(c));
      if (ids.length === 0) return new Set();
      clauses.push(`ucsCatId IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
    if (filters.minDurationMs !== undefined) {
      clauses.push('durationMs >= ?');
      params.push(filters.minDurationMs);
    }
    if (filters.maxDurationMs !== undefined) {
      clauses.push('durationMs <= ?');
      params.push(filters.maxDurationMs);
    }
    if (filters.sampleRates?.length) {
      clauses.push(`sampleRate IN (${filters.sampleRates.map(() => '?').join(',')})`);
      params.push(...filters.sampleRates);
    }
    if (filters.channels?.length) {
      clauses.push(`channels IN (${filters.channels.map(() => '?').join(',')})`);
      params.push(...filters.channels);
    }
    if (filters.bitDepths?.length) {
      clauses.push(`bitDepth IN (${filters.bitDepths.map(() => '?').join(',')})`);
      params.push(...filters.bitDepths);
    }
    if (filters.codecs?.length) {
      clauses.push(`codec IN (${filters.codecs.map(() => '?').join(',')})`);
      params.push(...filters.codecs);
    }
    if (filters.favoritesOnly) clauses.push('favorite = 1');
    if (filters.minRating !== undefined) {
      clauses.push('rating >= ?');
      params.push(filters.minRating);
    }
    if (filters.minStage !== undefined) {
      clauses.push('stage >= ?');
      params.push(filters.minStage);
    }
    if (filters.tags?.length) {
      // tags are stored as a JSON array; a LIKE on the quoted token is exact
      // enough here and avoids a join for every search.
      for (const tag of filters.tags) {
        clauses.push('tags LIKE ?');
        params.push(`%"${tag}"%`);
      }
    }

    if (clauses.length === 0) return null;

    const sql = `SELECT id FROM assets WHERE ${clauses.join(' AND ')}`;
    const rows = this.deps.catalog.db.prepare(sql).all(...(params as never[])) as Array<{ id: number }>;
    return new Set(rows.map((r) => r.id));
  }

  private rankFromScores(scores: Map<number, number>, limit: number): number[] {
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
  }

  /**
   * Materialise the extra fields the reranker needs alongside the lite summary.
   *
   * `AssetSummary` deliberately omits the metadata blobs and the DSP columns, so
   * this is a separate narrow query rather than widening the summary type used by
   * the whole UI.
   */
  private loadRerankInputs(ids: number[]): Map<number, RerankAssetInput> {
    const out = new Map<number, RerankAssetInput>();
    if (ids.length === 0) return out;
    const chunkSize = 400;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const rows = this.deps.catalog.db
        .prepare(
          `SELECT a.id, a.filename, a.emDescription, a.emKeywords, a.ucsCatId,
                  a.dspPeakDb, a.dspRmsDb, a.dspDecayMs, a.dspCentroidHz,
                  a.dspHfRatio, a.dspStereoCorr, a.dspHasVoice, a.dspTonality,
                  c.category AS ucsCategory, c.subCategory AS ucsSubCategory
           FROM assets a
           LEFT JOIN ucs_categories c ON c.catId = a.ucsCatId
           WHERE a.id IN (${chunk.map(() => '?').join(',')})`,
        )
        .all(...chunk) as Array<Record<string, unknown>>;
      for (const row of rows) {
        out.set(Number(row.id), {
          filename: String(row.filename ?? ''),
          ucsCatId: typeof row.ucsCatId === 'string' ? row.ucsCatId : null,
          ucsCategory: typeof row.ucsCategory === 'string' ? row.ucsCategory : null,
          ucsSubCategory: typeof row.ucsSubCategory === 'string' ? row.ucsSubCategory : null,
          description: typeof row.emDescription === 'string' ? row.emDescription : null,
          keywords: parseStringArray(row.emKeywords),
          dsp: rowToDsp(row),
        });
      }
    }
    return out;
  }

  private loadSummaries(ids: number[]): Map<number, AssetSummary> {
    const out = new Map<number, AssetSummary>();
    if (ids.length === 0) return out;
    // chunk to stay well under SQLite's variable limit
    const chunkSize = 400;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const rows = this.deps.catalog.db
        .prepare(
          `SELECT a.*, l.root AS libraryRoot FROM assets a
           LEFT JOIN libraries l ON l.id = a.libraryId
           WHERE a.id IN (${chunk.map(() => '?').join(',')})`,
        )
        .all(...chunk) as Array<Record<string, unknown>>;
      for (const row of rows) {
        const summary = rowToSummary(row);
        out.set(summary.id, summary);
      }
    }
    return out;
  }

  /** Extra indirection so the engine can reuse the classifier's alias index. */
  classifierLookup(term: string): string[] {
    return this.deps.classifierLookup(term);
  }
}

/** Parse a JSON string array column, tolerating null and malformed values. */
function parseStringArray(value: unknown): string[] | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return null;
  }
}

/**
 * Rebuild the DSP feature object from its stored columns.
 *
 * `peak` is derived back from the stored dB because the linear value is not
 * persisted; the relationship is exact, so nothing is lost for this purpose.
 */
function rowToDsp(row: Record<string, unknown>): DspFeatures | null {
  if (typeof row.dspDecayMs !== 'number') return null;
  const peakDb = typeof row.dspPeakDb === 'number' ? row.dspPeakDb : -144;
  const rmsDb = typeof row.dspRmsDb === 'number' ? row.dspRmsDb : -144;
  return {
    peak: Math.pow(10, peakDb / 20),
    rms: Math.pow(10, rmsDb / 20),
    peakDb,
    rmsDb,
    decayMs: Number(row.dspDecayMs ?? 0),
    spectralCentroidHz: Number(row.dspCentroidHz ?? 0),
    highFrequencyRatio: Number(row.dspHfRatio ?? 0),
    stereoCorrelation: Number(row.dspStereoCorr ?? 1),
    hasVoiceLikeActivity: row.dspHasVoice === 1,
    tonality: Number(row.dspTonality ?? 0),
  };
}

/**
 * Which UCS categories does this query appear to be asking about?
 *
 * Used only to *confirm*, never to retrieve: a hit whose category agrees is
 * nudged up, a hit whose category disagrees is only nudged halfway down (since
 * the query's category reading may simply be wrong).
 */
export function collectHintCatIds(
  lookup: (term: string) => string[],
  parsed: ParsedQuery,
  rawQuery: string,
): string[] {
  const terms = [...parsed.required, ...parsed.optionalGroups.flat()];
  if (terms.length === 0 && rawQuery.trim().length > 0) terms.push(rawQuery.trim());

  const out = new Set<string>();
  for (const term of terms) {
    const clean = term.replace(/\*+$/, '').trim();
    // Single characters match far too much to be a useful hint.
    if (clean.length < 2) continue;
    for (const catId of lookup(clean)) out.add(catId);
    // Long natural-language phrases will not be a CatID alias; try their words.
    if (clean.length > 4 && /[a-z]/i.test(clean)) {
      for (const word of contentWords(clean)) {
        if (word.length < 4) continue;
        for (const catId of lookup(word)) out.add(catId);
      }
    }
  }
  return [...out];
}

function buildHighlights(parsed: ParsedQuery, asset: AssetSummary, vectorScore: number | null): string[] {
  const out: string[] = [];
  if (vectorScore !== null && vectorScore > 0.3) {
    out.push(`声学相似度 ${(vectorScore * 100).toFixed(0)}%`);
  }
  const terms = [...parsed.required, ...parsed.optionalGroups.flat()];
  const haystack = `${asset.filename}`.toLowerCase();
  const matched = terms.filter((t) => haystack.includes(t.replace(/\*+$/, '').toLowerCase()));
  if (matched.length > 0) out.push(`文件名命中 ${matched.join(', ')}`);
  if (asset.ucsCatId) out.push(`UCS ${asset.ucsCatId}`);
  return out;
}

export { IndexStage };
