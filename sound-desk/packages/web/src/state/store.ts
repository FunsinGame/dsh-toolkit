/**
 * App state.
 *
 * Hand-rolled external store + `useSyncExternalStore` rather than a state
 * library: the shape is small, and this keeps the browser bundle free of an
 * extra runtime dependency (the extension has to ship it too).
 */

import type {
  Asset,
  AssetSummary,
  JobProgress,
  Library,
  SearchFilters,
  SearchHit,
  SearchMode,
  SearchResponse,
  ScoreBreakdown,
  StatsResponse,
} from '@sounddesk/core';

import type { EngineClient, UcsTree } from '../api/client.ts';
import { createOfflineAudioContext } from '../audio/offline.ts';
import { getMixer } from '../audio/mixer.ts';
import { getPlayer } from '../audio/player.ts';
import { normalizeTracks, renderMix, renderStem, renderWav } from '@sounddesk/audio-effects';

/**
 * 24-bit PCM for exports: the delivery standard for sound effects, and lossless
 * for anything the chain produces (16-bit would add audible quantisation to quiet
 * tails).
 */
const EXPORT_ENCODING = { bitsPerSample: 24, encoding: 'pcm' } as const;

/**
 * Silence appended after the mix so the last track's reverb can ring out. The
 * per-track tails are already counted by `mixDuration`; this covers a chain-level
 * tail such as a long decay shared by every track.
 */
const MIX_TAIL_SECONDS = 0.5;

export interface AppState {
  ready: boolean;
  fatalError: string | null;
  host: 'browser' | 'vscode' | null;

  query: string;
  mode: SearchMode;
  filters: SearchFilters;

  searching: boolean;
  hits: SearchHit[];
  total: number;
  tookMs: number;
  /** captions the Chinese→English rewriter produced — shown so the user can correct it */
  captionsUsed: string[];
  unmatchedTerms: string[];
  belowThreshold: boolean;
  /** semantic search was skipped because too few assets are embedded yet */
  semanticIncomplete: boolean;
  searchError: string | null;

  selectedId: number | null;
  selected: Asset | null;
  /**
   * The score breakdown for the selected row. Kept alongside the asset because
   * the asset itself carries no ranking information, and the details pane needs
   * it to explain why this file is where it is.
   */
  selectedScore: ScoreBreakdown | null;
  loadingAsset: boolean;

  /** true while an effect-chain export is being rendered */
  exporting: boolean;
  /** 0..1 render progress */
  exportProgress: number;
  exportError: string | null;
  exportResult: { filePath: string; bytes: number; renamed: boolean; durationSeconds: number; files?: string[] } | null;

  ucsTree: UcsTree | null;
  libraries: Library[];
  stats: (StatsResponse & { dbBytes: number; modelsReady: boolean }) | null;
  jobs: JobProgress[];

  /** UCS category filter, drives the tree selection */
  activeCategory: string | null;
  activeCatId: string | null;
}

const initialState: AppState = {
  ready: false,
  fatalError: null,
  host: null,
  query: '',
  mode: 'hybrid',
  filters: {},
  searching: false,
  hits: [],
  total: 0,
  tookMs: 0,
  captionsUsed: [],
  unmatchedTerms: [],
  belowThreshold: false,
  semanticIncomplete: false,
  searchError: null,
  selectedId: null,
  selected: null,
  selectedScore: null,
  loadingAsset: false,
  exporting: false,
  exportProgress: 0,
  exportError: null,
  exportResult: null,
  ucsTree: null,
  libraries: [],
  stats: null,
  jobs: [],
  activeCategory: null,
  activeCatId: null,
};

class Store {
  private state: AppState = initialState;
  private listeners = new Set<() => void>();
  private client: EngineClient | null = null;
  private searchSeq = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): AppState => this.state;

  private set(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener();
  }

  getClient(): EngineClient {
    if (!this.client) throw new Error('store not initialized');
    return this.client;
  }

  async init(client: EngineClient): Promise<void> {
    this.client = client;
    this.set({ host: client.host });
    client.subscribe((event) => {
      if (event.type === 'job') {
        const jobs = [...this.state.jobs];
        const index = jobs.findIndex((j) => j.id === event.job.id);
        if (index >= 0) jobs[index] = event.job;
        else jobs.unshift(event.job);
        this.set({ jobs: jobs.slice(0, 20) });
      } else if (event.type === 'library.changed') {
        void this.refreshLibraryData();
      }
    });

    try {
      const [libraries, ucsTree, stats, jobs] = await Promise.all([
        client.libraries(),
        client.ucsTree(),
        client.stats(),
        client.jobs(),
      ]);
      this.set({ libraries, ucsTree, stats, jobs, ready: true });
      void this.runSearch();
    } catch (err) {
      this.set({ fatalError: err instanceof Error ? err.message : String(err) });
    }
  }

  async refreshLibraryData(): Promise<void> {
    if (!this.client) return;
    const [libraries, ucsTree, stats] = await Promise.all([
      this.client.libraries(),
      this.client.ucsTree(),
      this.client.stats(),
    ]).catch(() => [null, null, null] as const);
    this.set({
      ...(libraries ? { libraries } : {}),
      ...(ucsTree ? { ucsTree } : {}),
      ...(stats ? { stats } : {}),
    });
  }

  setQuery(query: string): void {
    this.set({ query });
  }

  setMode(mode: SearchMode): void {
    this.set({ mode });
    void this.runSearch();
  }

  /**
   * Run the current query and filters.
   *
   * The search endpoint only returns retriever hits, so an empty query with no
   * filter would render an empty list. "No query" is a legitimate browsing state
   * though, so it is handled explicitly: browse the catalogue instead of
   * pretending nothing matched.
   */
  async runSearch(): Promise<void> {
    if (!this.client) return;
    const seq = ++this.searchSeq;
    const hasQuery = this.state.query.trim().length > 0;
    const hasFilter = Boolean(this.state.activeCatId || this.state.activeCategory);
    this.set({ searching: true, searchError: null });

    try {
      if (!hasQuery && !hasFilter) {
        const page = await this.client.listAssets({ limit: 500 });
        if (seq !== this.searchSeq) return;
        const now = Date.now();
        this.set({
          hits: page.items.map((asset) => ({
            asset,
            // Not a similarity judgement — this is the whole catalogue.
            score: { vector: null, fts: null, ucs: null, struct: null, ranks: {}, final: 1, confidence: 1 },
            highlights: [],
          })),
          total: page.total,
          tookMs: Date.now() - now,
          captionsUsed: [],
          unmatchedTerms: [],
          belowThreshold: false,
          semanticIncomplete: false,
          searching: false,
        });
        return;
      }

      const response: SearchResponse = await this.client.search({
        q: hasQuery ? this.state.query : '',
        mode: this.state.mode,
        limit: 500,
        filters: this.buildFilters(),
        explain: true,
      });
      if (seq !== this.searchSeq) return; // a newer search already won
      this.set({
        hits: response.hits,
        total: response.total,
        tookMs: response.tookMs,
        captionsUsed: response.captionsUsed,
        unmatchedTerms: response.unmatchedTerms,
        belowThreshold: response.belowThreshold,
        semanticIncomplete: response.semanticIncomplete ?? false,
        searching: false,
      });
    } catch (err) {
      if (seq !== this.searchSeq) return;
      this.set({ searching: false, searchError: err instanceof Error ? err.message : String(err) });
    }
  }

  private buildFilters(): SearchFilters {
    const filters: SearchFilters = { ...this.state.filters };
    if (this.state.activeCatId) filters.ucsCatIds = [this.state.activeCatId];
    else if (this.state.activeCategory) filters.categories = [this.state.activeCategory];
    return filters;
  }

  selectCategory(category: string | null, catId: string | null): void {
    this.set({ activeCategory: category, activeCatId: catId });
    void this.runSearch();
  }

  async select(hit: SearchHit | null): Promise<void> {
    if (!hit) {
      this.set({ selectedId: null, selected: null, selectedScore: null });
      return;
    }
    this.set({ selectedId: hit.asset.id, selectedScore: hit.score, loadingAsset: true });
    try {
      const asset = await this.getClient().asset(hit.asset.id);
      this.set({ selected: asset, loadingAsset: false });
    } catch (err) {
      this.set({ loadingAsset: false, searchError: err instanceof Error ? err.message : String(err) });
    }
  }

  async patchSelected(patch: { tags?: string[]; favorite?: boolean; rating?: number; ucsCatId?: string | null }): Promise<void> {
    const id = this.state.selectedId;
    if (id === null) return;
    try {
      const asset = await this.getClient().patchAsset(id, patch);
      this.set({ selected: asset });
      // the list row shows tags / favourite / category, so refresh it in place
      const hits = this.state.hits.map((h) =>
        h.asset.id === id
          ? {
              ...h,
              asset: {
                ...h.asset,
                tags: asset.tags,
                favorite: asset.favorite,
                rating: asset.rating,
                ucsCatId: asset.ucsCatId,
                ucsSource: asset.ucsSource,
                ucsConfidence: asset.ucsConfidence,
              } as AssetSummary,
            }
          : h,
      );
      this.set({ hits });
      void this.refreshLibraryData();
    } catch (err) {
      this.set({ searchError: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Re-read the selected asset. Used after an edit that changed the file on disk. */
  async refreshSelected(): Promise<void> {
    const id = this.state.selectedId;
    if (id === null) return;
    try {
      const asset = await this.getClient().asset(id);
      this.set({ selected: asset });
      const hits = this.state.hits.map((h) =>
        h.asset.id === id
          ? {
              ...h,
              asset: {
                ...h.asset,
                durationMs: asset.durationMs,
                tags: asset.tags,
                favorite: asset.favorite,
                rating: asset.rating,
                ucsCatId: asset.ucsCatId,
                ucsSource: asset.ucsSource,
                ucsConfidence: asset.ucsConfidence,
              } as AssetSummary,
            }
          : h,
      );
      this.set({ hits });
    } catch (err) {
      this.set({ searchError: err instanceof Error ? err.message : String(err) });
    }
  }

  async addLibrary(root: string, name?: string): Promise<void> {
    await this.getClient().addLibrary(root, name);
    await this.refreshLibraryData();
  }

  /**
   * Render the current preview effects into a new file.
   *
   * Runs entirely in the browser: the samples are decoded by the Web Audio
   * implementation that is already playing them, and the engine only writes the
   * finished bytes. Doing it server-side would mean a second DSP implementation
   * that could disagree with what the user auditioned.
   *
   * The source file is never touched — the engine allocates a new name and will
   * not overwrite anything.
   */
  async exportEffect(assetId: number, filename: string): Promise<void> {
    if (this.state.exporting) return;
    this.set({ exporting: true, exportError: null, exportResult: null });
    try {
      const client = this.getClient();
      const source = await client.fetchWaveBytes(assetId);
      const result = await renderWav(source, getPlayer().getChain(), createOfflineAudioContext, {
        encode: EXPORT_ENCODING,
        onProgress: (fraction: number) => this.set({ exportProgress: fraction }),
      });
      const saved = await client.saveExport({ assetId, filename, bytes: result.bytes });
      this.set({
        exporting: false,
        exportProgress: 1,
        exportResult: {
          filePath: saved.filePath,
          bytes: saved.bytes,
          renamed: saved.renamed,
          durationSeconds: result.durationSeconds,
        },
      });
    } catch (err) {
      this.set({
        exporting: false,
        exportProgress: 0,
        exportError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Render the multi-track mix to a new file.
   *
   * `stems` writes one file per track instead of a single mix; both paths use the
   * same offline renderer, so a set of stems sums back to the mix.
   */
  async exportMix(mode: 'mix' | 'stems'): Promise<void> {
    if (this.state.exporting) return;
    const mixer = getMixer();
    const trackCount = mixer.trackCount;
    if (trackCount === 0) {
      this.set({ exportError: '还没有轨道可以导出' });
      return;
    }
    this.set({ exporting: true, exportError: null, exportResult: null, exportProgress: 0 });

    try {
      const client = this.getClient();
      const inputs = mixer.toMixTrackInputs();
      if (inputs.length === 0) throw new Error('轨道都还没有解码完成');
      const tracks = normalizeTracks(inputs);
      const total = mode === 'stems' ? tracks.length : 1;
      const written: string[] = [];
      let bytes = 0;
      let seconds = 0;

      for (let i = 0; i < tracks.length; i += 1) {
        const result =
          mode === 'stems'
            ? await renderStem(tracks[i]!, createOfflineAudioContext, { encode: EXPORT_ENCODING })
            : await renderMix(tracks, createOfflineAudioContext, {
                encode: EXPORT_ENCODING,
                tailSeconds: MIX_TAIL_SECONDS,
                onProgress: (fraction) => this.set({ exportProgress: fraction }),
              });
        // Save immediately after each render so a failure part-way leaves the
        // stems already written rather than losing all of them.
        const saved = await client.saveExport({
          assetId: tracks[i]!.assetId,
          filename: mode === 'stems' ? `${tracks[i]!.label}_stem.wav` : `mix_${tracks.length}tracks.wav`,
          bytes: result.bytes,
        });
        written.push(saved.filePath);
        bytes += saved.bytes;
        seconds = Math.max(seconds, result.durationSeconds);
        if (mode === 'stems') this.set({ exportProgress: (i + 1) / total });
      }

      this.set({
        exporting: false,
        exportProgress: 1,
        exportResult: {
          filePath: written.length === 1 ? written[0]! : `${written.length} 个文件`,
          bytes,
          renamed: false,
          durationSeconds: seconds,
          files: written,
        },
      });
    } catch (err) {
      this.set({
        exporting: false,
        exportProgress: 0,
        exportError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  clearExportStatus(): void {
    this.set({ exportResult: null, exportError: null, exportProgress: 0 });
  }

  async rescan(libraryId: number): Promise<void> {
    await this.getClient().rescanLibrary(libraryId);
  }

  async cancelJob(id: string): Promise<void> {
    await this.getClient().cancelJob(id);
    const jobs = await this.getClient().jobs();
    this.set({ jobs });
  }

  async findSimilar(assetId: number): Promise<void> {
    if (!this.client) return;
    this.set({ searching: true, searchError: null, mode: 'similar' });
    try {
      const response = await this.client.search({ q: '', mode: 'similar', similarToAssetId: assetId, limit: 200 });
      this.set({
        hits: response.hits,
        total: response.total,
        tookMs: response.tookMs,
        captionsUsed: [],
        unmatchedTerms: [],
        belowThreshold: response.belowThreshold,
        searching: false,
        query: '',
      });
    } catch (err) {
      this.set({ searching: false, searchError: err instanceof Error ? err.message : String(err) });
    }
  }
}

export const store = new Store();
export type { EngineClient };
