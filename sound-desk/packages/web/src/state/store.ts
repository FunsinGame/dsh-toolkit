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

import type {
  BackupImportOutcome,
  BackupInspection,
  EngineClient,
  PersonalizationState,
  Playlist,
  PlaylistDetail,
  ProbeResponse,
  SessionInfo,
  UcsTree,
} from '../api/client.ts';
import { parseBatchQueries, type CompareSort, type CompareColumn } from '../util/compare.ts';
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
  /** this tool's exported files currently on disk */
  exportFiles: string[];
  /** last failure from a host-only action (reveal in OS, open in editor) */
  hostActionError: string | null;
  /** engine capabilities, notably whether non-RIFF formats can be decoded */
  session: SessionInfo | null;

  /** query by example: what the current probe was, and what it found */
  probe: {
    kind: 'probe' | 'slice';
    /** the reference's own description, so a bad result is explicable */
    label: string;
    preview: ProbeResponse['preview'] | null;
    /**
     * What the max-similarity pass over long files did.
     *
     * Kept so the bar can say "re-analysed 3 long files" instead of silently taking
     * a second longer than a keyword search would.
     */
    maxsim: ProbeResponse['maxsim'] | null;
    /** how many returned hits were matched by a window rather than the whole file */
    windowMatches: number;
  } | null;
  /** personalised ranking (plan P2-3) */
  personalization: PersonalizationState | null;

  /**
   * Compare workspace (plan P2-3): one column per query, side by side.
   *
   * Columns hold their own results and their own sort order, because the point of
   * the view is to judge several searches against each other — a shared sort would
   * make the comparison meaningless.
   */
  compare: boolean;
  columns: CompareColumn[];
  compareInput: string;
  /** true once `runCompare` has completed at least once */
  compareRan: boolean;

  /** playlists (plan P1-3) */
  playlists: Playlist[];
  /** the open playlist, with its items */
  openPlaylist: PlaylistDetail | null;
  playlistError: string | null;
  /** the dry run of a backup the user picked, awaiting confirmation */
  pendingImport: { backup: unknown; inspection: BackupInspection; fileName: string } | null;
  importOutcome: BackupImportOutcome | null;

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
  exportFiles: [],
  hostActionError: null,
  session: null,
  probe: null,
  personalization: null,
  compare: false,
  columns: [],
  compareInput: '',
  compareRan: false,
  playlists: [],
  openPlaylist: null,
  playlistError: null,
  pendingImport: null,
  importOutcome: null,
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
      // Loaded separately so a personalization failure cannot block the workbench.
      void this.refreshPersonalization();
      void this.refreshSession();
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
    // Looking at a result is weak evidence, but it is the only signal that exists
    // before anyone presses play, so it is recorded at a low weight.
    this.recordUsage(hit.asset.id, 'select');
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

  /** List this tool's own exports, so test renders can be reviewed and removed. */
  async refreshExports(): Promise<void> {
    try {
      const files = await this.getClient().listExports();
      this.set({ exportFiles: files, exportError: null });
    } catch (err) {
      this.set({ exportError: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Ask the host to reveal the selected asset in the OS file manager.
   *
   * VSCode-only: a browser page never sees a filesystem path, so the button that
   * calls this is hidden in that host.
   */
  async revealInSystem(assetId: number): Promise<void> {
    try {
      await this.getClient().revealInSystem(assetId);
      this.set({ hostActionError: null });
    } catch (err) {
      this.set({ hostActionError: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Ask the host to open the selected asset in an editor tab. VSCode-only. */
  async openInEditor(assetId: number): Promise<void> {
    try {
      await this.getClient().openInEditor(assetId);
      this.set({ hostActionError: null });
    } catch (err) {
      this.set({ hostActionError: err instanceof Error ? err.message : String(err) });
    }
  }

  // -- personalised ranking (plan P2-3) ----------------------------------

  /**
   * Engine capabilities.
   *
   * Best-effort: a failure here must not stop the workbench, it only means the UI
   * cannot say whether non-RIFF files are analysable.
   */
  async refreshSession(): Promise<void> {
    try {
      this.set({ session: await this.getClient().session() });
    } catch {
      this.set({ session: null });
    }
  }

  async refreshPersonalization(): Promise<void> {
    try {
      this.set({ personalization: await this.getClient().personalization() });
    } catch (err) {
      // Not fatal: the ranking simply stays unadjusted.
      this.set({ personalization: null, searchError: err instanceof Error ? err.message : String(err) });
    }
  }

  async setPersonalization(enabled: boolean): Promise<void> {
    try {
      const next = await this.getClient().setPersonalization(enabled);
      this.set({ personalization: next });
      // Turning it on or off changes the order, so the visible results must follow.
      await this.runSearch();
    } catch (err) {
      this.set({ searchError: err instanceof Error ? err.message : String(err) });
    }
  }

  async clearUsage(): Promise<void> {
    try {
      await this.getClient().clearUsage();
      await this.refreshPersonalization();
      await this.runSearch();
    } catch (err) {
      this.set({ searchError: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Record what the user did, for the learned weighting.
   *
   * Fire-and-forget and never surfaced as an error: failing to record a play must
   * not interrupt playback, and the weighting is a nicety, not a feature anyone is
   * waiting on. Deliberately records `select` too — it is the only signal that
   * exists before anyone has pressed play.
   */
  recordUsage(assetId: number, kind: 'play' | 'select' | 'export' | 'download'): void {
    if (!this.client) return;
    const query = this.state.query.trim();
    void this.client
      .recordUsage({ assetId, kind, query: query.length > 0 ? query : null })
      .catch(() => {
        /* the weighting is best-effort */
      });
  }

  // -- compare workspace (plan P2-3) -------------------------------------

  setCompare(on: boolean): void {
    this.set({ compare: on });
  }

  setCompareInput(text: string): void {
    this.set({ compareInput: text });
  }

  /**
   * Run every query as its own column.
   *
   * Searches run sequentially rather than in parallel: they share one engine and
   * one SQLite connection, and overlapping them would make the timings in each
   * column meaningless while gaining nothing on a local server.
   */
  async runCompare(): Promise<void> {
    const { queries, dropped } = parseBatchQueries(this.state.compareInput);
    if (queries.length === 0) {
      this.set({ columns: [], compareRan: true, searchError: null });
      return;
    }
    if (dropped > 0) {
      this.set({ searchError: `已忽略 ${dropped} 个重复或超出上限的查询（最多 6 个）` });
    } else {
      this.set({ searchError: null });
    }

    // Preserve the width and pin state of columns that are being re-run, so
    // re-running a batch does not throw away how the user arranged the view.
    const previous = new Map(this.state.columns.map((column) => [column.query.toLowerCase(), column]));

    const columns: CompareColumn[] = queries.map((query, index) => {
      const before = previous.get(query.toLowerCase());
      return {
        id: before?.id ?? `col-${Date.now()}-${index}`,
        query,
        hits: [],
        total: 0,
        tookMs: 0,
        sort: before?.sort ?? 'relevance',
        width: before?.width ?? 320,
        pinned: before?.pinned ?? false,
        loading: true,
        error: null,
      };
    });
    this.set({ columns, compareRan: true, searchError: null });

    for (let i = 0; i < columns.length; i += 1) {
      const column = columns[i]!;
      try {
        const response = await this.getClient().search({
          q: column.query,
          mode: this.state.mode,
          limit: 200,
          filters: this.buildFilters(),
          explain: true,
        });
        // A pinned column keeps its results: pinning means "hold this still while
        // I try other queries", so refreshing it would defeat the purpose.
        if (column.pinned) {
          this.set({
            columns: this.state.columns.map((c) => (c.id === column.id ? { ...c, loading: false } : c)),
          });
          continue;
        }
        this.set({
          columns: this.state.columns.map((c) =>
            c.id === column.id
              ? { ...c, hits: response.hits, total: response.total, tookMs: response.tookMs, loading: false }
              : c,
          ),
        });
      } catch (err) {
        this.set({
          columns: this.state.columns.map((c) =>
            c.id === column.id
              ? { ...c, loading: false, error: err instanceof Error ? err.message : String(err) }
              : c,
          ),
        });
      }
    }
  }

  /** Re-run one column, for when only its query changed. */
  async rerunColumn(id: string): Promise<void> {
    const column = this.state.columns.find((c) => c.id === id);
    if (!column || column.pinned) return;
    this.set({ columns: this.state.columns.map((c) => (c.id === id ? { ...c, loading: true, error: null } : c)) });
    try {
      const response = await this.getClient().search({
        q: column.query,
        mode: this.state.mode,
        limit: 200,
        filters: this.buildFilters(),
        explain: true,
      });
      this.set({
        columns: this.state.columns.map((c) =>
          c.id === id
            ? { ...c, hits: response.hits, total: response.total, tookMs: response.tookMs, loading: false }
            : c,
        ),
      });
    } catch (err) {
      this.set({
        columns: this.state.columns.map((c) =>
          c.id === id ? { ...c, loading: false, error: err instanceof Error ? err.message : String(err) } : c,
        ),
      });
    }
  }

  setColumnQuery(id: string, query: string): void {
    this.set({ columns: this.state.columns.map((c) => (c.id === id ? { ...c, query } : c)) });
  }

  setColumnSort(id: string, sort: CompareSort): void {
    this.set({ columns: this.state.columns.map((c) => (c.id === id ? { ...c, sort } : c)) });
  }

  setColumnWidth(id: string, width: number): void {
    // Clamped so a drag cannot leave an unusable sliver or push the others away.
    const clamped = Math.max(180, Math.min(720, Math.round(width)));
    this.set({ columns: this.state.columns.map((c) => (c.id === id ? { ...c, width: clamped } : c)) });
  }

  toggleColumnPin(id: string): void {
    this.set({ columns: this.state.columns.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)) });
  }

  removeColumn(id: string): void {
    this.set({ columns: this.state.columns.filter((c) => c.id !== id) });
  }

  /**
   * Promote one column into the main view.
   *
   * The bridge between the two modes: comparing several queries and then working
   * with the winner should not require retyping it.
   */
  promoteColumn(id: string): void {
    const column = this.state.columns.find((c) => c.id === id);
    if (!column) return;
    this.set({ compare: false, query: column.query });
    void this.runSearch();
  }

  // -- playlists (plan P1-3) ---------------------------------------------

  async refreshPlaylists(): Promise<void> {
    try {
      this.set({ playlists: await this.getClient().playlists(), playlistError: null });
    } catch (err) {
      this.set({ playlistError: err instanceof Error ? err.message : String(err) });
    }
  }

  async openPlaylist(id: number): Promise<void> {
    try {
      this.set({ openPlaylist: await this.getClient().playlist(id), playlistError: null });
    } catch (err) {
      this.set({ playlistError: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Select an asset that is not currently in the result list.
   *
   * Playlist items and compare columns can point at sounds the current query does
   * not return, so this loads the detail directly instead of requiring a `SearchHit`
   * — which would mean inventing a fake score for a row that has none.
   */
  async selectRow(assetId: number): Promise<void> {
    this.set({ selectedId: assetId, selectedScore: null, loadingAsset: true });
    this.recordUsage(assetId, 'select');
    try {
      const asset = await this.getClient().asset(assetId);
      if (this.state.selectedId !== assetId) return; // a newer selection won
      this.set({ selected: asset, loadingAsset: false });
    } catch (err) {
      this.set({ loadingAsset: false, playlistError: err instanceof Error ? err.message : String(err) });
    }
  }

  closePlaylist(): void {
    this.set({ openPlaylist: null });
  }

  async createPlaylist(name: string): Promise<void> {
    try {
      const created = await this.getClient().createPlaylist(name);
      await this.refreshPlaylists();
      await this.openPlaylist(created.id);
    } catch (err) {
      this.set({ playlistError: err instanceof Error ? err.message : String(err) });
    }
  }

  async renamePlaylist(id: number, name: string): Promise<void> {
    try {
      await this.getClient().renamePlaylist(id, name);
      await this.refreshPlaylists();
      if (this.state.openPlaylist?.id === id) await this.openPlaylist(id);
    } catch (err) {
      this.set({ playlistError: err instanceof Error ? err.message : String(err) });
    }
  }

  async removePlaylist(id: number): Promise<void> {
    try {
      await this.getClient().removePlaylist(id);
      if (this.state.openPlaylist?.id === id) this.set({ openPlaylist: null });
      await this.refreshPlaylists();
    } catch (err) {
      this.set({ playlistError: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Add assets to a playlist.
   *
   * Defaults to the open playlist, and to the selection when no ids are given —
   * which is the whole interaction: pick a sound, press add.
   */
  async addToOpenPlaylist(assetIds?: number[]): Promise<void> {
    const playlist = this.state.openPlaylist;
    const ids = assetIds ?? (this.state.selectedId !== null ? [this.state.selectedId] : []);
    if (!playlist || ids.length === 0) return;
    try {
      await this.getClient().addToPlaylist(playlist.id, ids);
      await this.openPlaylist(playlist.id);
      await this.refreshPlaylists();
    } catch (err) {
      this.set({ playlistError: err instanceof Error ? err.message : String(err) });
    }
  }

  async removeFromOpenPlaylist(assetId: number): Promise<void> {
    const playlist = this.state.openPlaylist;
    if (!playlist) return;
    try {
      await this.getClient().removeFromPlaylist(playlist.id, [assetId]);
      await this.openPlaylist(playlist.id);
      await this.refreshPlaylists();
    } catch (err) {
      this.set({ playlistError: err instanceof Error ? err.message : String(err) });
    }
  }

  async moveInOpenPlaylist(assetId: number, toIndex: number): Promise<void> {
    const playlist = this.state.openPlaylist;
    if (!playlist) return;
    try {
      await this.getClient().reorderPlaylist(playlist.id, assetId, toIndex);
      await this.openPlaylist(playlist.id);
    } catch (err) {
      this.set({ playlistError: err instanceof Error ? err.message : String(err) });
    }
  }

  // -- sidecar backup / import (plan P1-3) -------------------------------

  /** The URL a download link should point at for a sidecar backup. */
  backupUrl(includeHistory = true): string {
    return this.getClient().backupUrl(undefined, includeHistory);
  }

  /**
   * M3U8 URL for a playlist.
   *
   * A real download rather than generated client-side: the engine owns the file
   * paths, and every DAW and media player reads M3U.
   */
  playlistM3uUrl(id: number): string {
    return this.getClient().playlistM3uUrl(id);
  }

  /**
   * Read a backup file and work out what importing it would do — without doing it.
   *
   * Deliberately two steps. Import rewrites annotations across a library, so the
   * user sees the match report (how many matched, by which method, what tied) before
   * anything is written.
   */
  async inspectBackupFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const backup: unknown = JSON.parse(text);
      const inspection = await this.getClient().inspectBackup(backup);
      this.set({ pendingImport: { backup, inspection, fileName: file.name }, importOutcome: null, playlistError: null });
    } catch (err) {
      this.set({
        pendingImport: null,
        playlistError:
          err instanceof SyntaxError
            ? '这个文件不是有效的 JSON'
            : err instanceof Error
              ? err.message
              : String(err),
      });
    }
  }

  cancelImport(): void {
    this.set({ pendingImport: null });
  }

  async confirmImport(options: { overwrite?: boolean; includeHistory?: boolean; includePlaylists?: boolean } = {}): Promise<void> {
    const pending = this.state.pendingImport;
    if (!pending) return;
    try {
      const outcome = await this.getClient().importBackup(pending.backup, options);
      this.set({ importOutcome: outcome, pendingImport: null });
      // The library's annotations just changed, so anything showing them is stale.
      await this.refreshPlaylists();
      await this.runSearch();
    } catch (err) {
      this.set({ playlistError: err instanceof Error ? err.message : String(err) });
    }
  }

  clearImportOutcome(): void {
    this.set({ importOutcome: null });
  }

  // -- query by example (plan §3.4) --------------------------------------

  /**
   * Search using a reference clip the user supplied.
   *
   * Results replace the main list, because that is what the user is looking at: they
   * handed the tool a sound and want the library's answer, not a side panel.
   */
  async searchWithProbeFile(file: File): Promise<void> {
    await this.runProbe(`参考音频「${file.name}」`, async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return this.getClient().searchWithProbe(bytes, file.name);
    });
  }

  /**
   * Search using the current waveform selection of the loaded asset.
   *
   * The reference product marks this as not yet available; it is implemented here by
   * re-embedding just that window on demand.
   */
  async searchWithSelection(): Promise<void> {
    const playback = getPlayer().getState();
    const assetId = playback.assetId;
    const selection = playback.selection;
    if (assetId === null) {
      this.set({ searchError: '先在波形上选中一段（双击结果行加载素材）' });
      return;
    }
    if (!selection) {
      this.set({ searchError: '先在波形上拖出一段选区，再点「搜选区」' });
      return;
    }
    const durationMs = Math.max(1, (selection.end - selection.start) * 1000);
    await this.runProbe(
      `选区 ${selection.start.toFixed(2)}s–${selection.end.toFixed(2)}s`,
      () =>
        this.getClient().searchWithSlice(assetId, {
          offsetMs: Math.round(selection.start * 1000),
          durationMs: Math.round(durationMs),
        }),
    );
  }

  /**
   * Shared plumbing for both query-by-example paths.
   *
   * A probe failure is a *different* message from a search failure — "the model is
   * not loaded" and "your clip is silent" are both actionable and neither looks like
   * the other — so the reason is passed through verbatim rather than swallowed.
   */
  private async runProbe(label: string, run: () => Promise<ProbeResponse>): Promise<void> {
    const seq = ++this.searchSeq;
    this.set({
      searching: true,
      searchError: null,
      probe: { kind: 'probe', label, preview: null, maxsim: null, windowMatches: 0 },
    });
    try {
      const response = await run();
      if (seq !== this.searchSeq) return;
      this.set({
        hits: response.hits,
        total: response.total,
        tookMs: 0,
        mode: 'similar',
        captionsUsed: [],
        unmatchedTerms: response.warnings,
        belowThreshold: false,
        semanticIncomplete: false,
        searching: false,
        probe: {
          kind: response.source,
          label,
          preview: response.preview,
          maxsim: response.maxsim,
          windowMatches: response.hits.filter((hit) => hit.maxsim !== undefined).length,
        },
      });
    } catch (err) {
      if (seq !== this.searchSeq) return;
      this.set({
        searching: false,
        probe: null,
        searchError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Leave query-by-example and go back to the text query. */
  clearProbe(): void {
    this.set({ probe: null, searchError: null });
    void this.runSearch();
  }

  /**
   * Delete the given export files.
   *
   * The engine re-validates every path (suffix and containing root), so this can
   * only ever remove files this tool produced, whatever it is asked to delete.
   */
  async deleteExports(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    try {
      const result = await this.getClient().deleteExports(paths);
      const remaining = this.state.exportFiles.filter((file) => !result.removed.includes(file));
      this.set({
        exportFiles: remaining,
        exportError: result.failed.length > 0 ? `有 ${result.failed.length} 个文件没有删除：${result.failed[0]!.reason}` : null,
      });
    } catch (err) {
      this.set({ exportError: err instanceof Error ? err.message : String(err) });
    }
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
