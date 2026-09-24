/**
 * Engine client.
 *
 * The same bundle runs in a browser and inside a VSCode webview, and those two
 * hosts reach the engine very differently:
 *
 *   browser  → fetch() against http://127.0.0.1:<port>, token from ?token=
 *   vscode   → postMessage to the extension host, which owns the engine
 *              in-process and answers directly
 *
 * Everything above this module is written against `EngineClient` and never
 * knows which host it is in.
 */

import type {
  Asset,
  AssetSummary,
  JobProgress,
  Library,
  SearchHit,
  SearchRequest,
  SearchResponse,
  StatsResponse,
} from '@sounddesk/core';

export interface EngineClient {
  readonly host: 'browser' | 'vscode';
  search(req: SearchRequest): Promise<SearchResponse>;
  asset(id: number): Promise<Asset>;
  patchAsset(id: number, patch: PatchableAsset): Promise<Asset>;
  reclassify(id: number): Promise<ReclassifyResult>;
  listAssets(params: { libraryId?: number; limit?: number; offset?: number }): Promise<AssetPage>;
  libraries(): Promise<Library[]>;
  addLibrary(root: string, name?: string): Promise<Library>;
  removeLibrary(id: number): Promise<void>;
  /** `full` also rebuilds waveforms and fingerprints; the plain form re-reads metadata only. */
  rescanLibrary(id: number, full?: boolean): Promise<JobProgress>;
  ucsTree(): Promise<UcsTree>;
  ucsLookup(term: string): Promise<UcsMatch[]>;
  stats(): Promise<StatsResponse & { dbBytes: number; modelsReady: boolean }>;
  jobs(): Promise<JobProgress[]>;
  cancelJob(id: string): Promise<void>;
  /** whether this asset's file can be written back, and what it currently holds */
  embeddedInfo(id: number): Promise<EmbeddedInfo>;
  /** write metadata into the file itself; `confirm` gates the actual write */
  updateEmbedded(id: number, fields: EmbeddedEditFields, confirm: boolean): Promise<EmbeddedEditResponse>;
  restoreEmbedded(id: number): Promise<boolean>;
  /** URL that can be handed to <audio> / <img> */
  mediaUrl(id: number): string;
  peaksUrl(id: number): string;
  /**
   * URL for a whole-file download that carries the original file name.
   *
   * Used for dragging a sound out to the Desktop or a DAW: the stream URL sends no
   * `Content-Disposition`, so a dragged copy would arrive without an extension.
   */
  downloadUrl(id: number): string;
  /**
   * Fetch a WAV's bytes for offline processing. Uses the authenticated media
   * route, which is the only way to get the decoded samples.
   */
  fetchWaveBytes(id: number): Promise<Uint8Array>;
  /** write rendered audio to disk; the engine picks a non-colliding name */
  saveExport(params: { assetId: number; filename: string; bytes: Uint8Array }): Promise<ExportResult>;
  /** this tool's own exported files, so they can be reviewed and cleaned up */
  listExports(libraryId?: number): Promise<string[]>;
  /** delete exported files; the engine refuses anything without the `_fx` marker */
  deleteExports(paths: string[], libraryId?: number): Promise<DeleteExportsResult>;
  /**
   * Ask the host to reveal a file in the OS file manager.
   *
   * Only the VSCode host can do this — a browser page never sees a filesystem
   * path — so the browser implementation throws a message the UI acts on by
   * hiding the button instead.
   */
  revealInSystem(assetId: number): Promise<void>;
  /** Ask the host to open the asset in an editor tab. VSCode only. */
  openInEditor(assetId: number): Promise<void>;
  /** personalised-ranking state (plan P2-3) */
  personalization(): Promise<PersonalizationState>;
  setPersonalization(enabled: boolean): Promise<PersonalizationState>;
  /** report what the user did, which is the only input to the learned weights */
  recordUsage(params: { assetId: number; kind: UsageKind; query?: string | null }): Promise<void>;
  /** forget everything learned */
  clearUsage(): Promise<{ removed: number }>;
  /** playlists (plan P1-3) */
  playlists(): Promise<Playlist[]>;
  playlist(id: number): Promise<PlaylistDetail>;
  createPlaylist(name: string): Promise<Playlist>;
  renamePlaylist(id: number, name: string): Promise<Playlist>;
  removePlaylist(id: number): Promise<void>;
  addToPlaylist(id: number, assetIds: number[]): Promise<number>;
  removeFromPlaylist(id: number, assetIds: number[]): Promise<number>;
  reorderPlaylist(id: number, assetId: number, toIndex: number): Promise<void>;
  /** URL for a playlist as M3U8, for handing the list to a DAW or a player */
  playlistM3uUrl(id: number): string;
  /** query by example: search using a reference clip from outside the library */
  searchWithProbe(bytes: Uint8Array, filename: string, limit?: number): Promise<ProbeResponse>;
  /** query by example: search using a window of an already-indexed asset */
  searchWithSlice(
    assetId: number,
    window: { offsetMs?: number; durationMs?: number },
    limit?: number,
  ): Promise<ProbeResponse>;
  /** URL for a sidecar backup download; the engine sets the filename */
  backupUrl(libraryId?: number, includeHistory?: boolean): string;
  /** what an import would do, without doing it */
  inspectBackup(backup: unknown): Promise<BackupInspection>;
  importBackup(
    backup: unknown,
    options?: { overwrite?: boolean; includeHistory?: boolean; includePlaylists?: boolean },
  ): Promise<BackupImportOutcome>;
  /** live job progress; returns an unsubscribe function */
  subscribe(onEvent: (event: EngineEvent) => void): () => void;
  /**
   * Ask the host for a directory to index, or `null` if the user cancelled.
   *
   * Optional because only the VSCode host can provide it: a browser has no way to
   * turn a folder the user picks into a filesystem path, so the browser client simply
   * does not implement it and the UI offers the CLI instruction instead of a button
   * that could never work.
   */
  pickFolder?(title?: string): Promise<string | null>;
  /**
   * Add a library and index it to completion.
   *
   * Unlike `addLibrary`, which kicks off a scan in the background, this resolves only
   * once the library is actually usable, so the UI can hold the user at a progress
   * screen instead of showing counts that are about to change.
   *
   * Optional: the browser host has no equivalent, and the import UI is only offered
   * where the host can support it.
   */
  importLibrary?(root: string, name?: string): Promise<LibraryImportResult>;
  /**
   * What the engine can and cannot do.
   *
   * Currently this carries ffmpeg availability, which the UI has to know: without
   * it, FLAC/MP3/AIFF have no waveform, no fingerprint and cannot play, and
   * "no waveform" with no explanation looks like a bug.
   */
  session(): Promise<SessionInfo>;
}

export interface LibraryImportResult {
  library: { id?: number; name?: string; root?: string; assetCount?: number } | null;
  /** totals per pass, in the order they ran */
  passes?: Array<{ pass: string; job: { total: number; done: number; failed: number } }>;
  /** true when no embedding model was loaded, so no fingerprints were computed */
  embedSkipped?: boolean;
  /** files that could not be indexed, summed across passes */
  failed?: number;
}

export interface SessionInfo {
  ok: boolean;
  serverVersion: string;
  embeddingDim: number;
  similarityThreshold: number;
  webRoot: string | null;
  ffmpeg:
    | { available: true; version: string | null; source: 'env' | 'path' | 'bundled' }
    | { available: false };
}

/**
 * A query-by-example result.
 *
 * `preview` describes the *reference* — its length, channels and peak — so the UI can
 * show what was actually used. A silent or very short clip explains a poor result
 * far better than an empty list does.
 */
export interface ProbeResponse {
  hits: ProbeHit[];
  preview: {
    durationSeconds: number;
    sampleRate: number;
    channels: number;
    peak: number;
    warnings: string[];
  };
  warnings: string[];
  /** whether a reference clip or a selection answered */
  source: 'probe' | 'slice';
  /** what the max-similarity pass over long files did (plan §3.4) */
  maxsim: MaxsimReport | null;
  total: number;
}

/** A probe hit, optionally annotated with the window of the file that matched. */
export interface ProbeHit extends SearchHit {
  /**
   * Present when the score came from comparing the reference against the file's
   * individual windows rather than its whole-file mean.
   *
   * `offset` matters more than it looks: for a 10-minute ambience the mean-based
   * match is meaningless, and "matches at 3:20" is what makes the result usable.
   */
  maxsim?: {
    startMs: number;
    offset: string;
    windows: number;
    via: 'stored' | 'analysed';
  };
}

/**
 * How the max-similarity pass went.
 *
 * `analysed` files cost a decode plus inference each, so a query that took a
 * second deserves to say why rather than look slow for no reason.
 */
export interface MaxsimReport {
  stored: number;
  analysed: number;
  skippedShort: number;
  skippedBudget: number;
  maxWindows: number;
}

export interface PatchableAsset {
  tags?: string[];
  favorite?: boolean;
  rating?: number;
  ucsCatId?: string | null;
}

export interface AssetPage {
  items: AssetSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface UcsMatch {
  catId: string;
  category: string;
  subCategory: string;
}

export interface UcsTree {
  tree: Array<{
    category: string;
    count: number;
    children: Array<{ catId: string; label: string; count: number }>;
  }>;
  uncategorized: number;
}

export interface ReclassifyResult {
  catId: string | null;
  confidence: number;
  source: string;
  evidence: string;
  alternatives: Array<{ catId: string; score: number; evidence: string }>;
}

export type EngineEvent =
  | { type: 'job'; job: JobProgress }
  | { type: 'library.changed'; libraryId: number; assetCount: number }
  | { type: 'connected' }
  | { type: 'disconnected'; reason: string };

/** Fields that can be written back into a WAV/BWF file. */
export interface EmbeddedEditFields {
  description?: string;
  keywords?: string[];
  designer?: string;
  recorder?: string;
  library?: string;
  copyright?: string;
  scene?: string;
  take?: string;
  note?: string;
}

export interface EmbeddedEditResponse {
  changed: boolean;
  backupPath: string | null;
  warnings: string[];
  bytesBefore: number;
  bytesAfter: number;
  chunkIds: string[];
  asset: Asset;
}

export interface EmbeddedInfo {
  editable: boolean;
  reason: string | null;
  hasBackup: boolean;
  embedded: Asset['embedded'];
}

export interface ExportResult {
  filePath: string;
  bytes: number;
  /** true when the requested name was taken, so a numeric suffix was added */
  renamed: boolean;
  directory: string;
}

export interface DeleteExportsResult {
  removed: string[];
  /** paths that were refused, with the reason */
  failed: Array<{ filePath: string; reason: string }>;
}

/** Mirrors the engine's usage kinds; see `@sounddesk/core`. */
export type UsageKind = 'play' | 'select' | 'export' | 'download';

export interface PersonalizationState {
  enabled: boolean;
  /** how many usage events are stored */
  events: number;
  /** how many distinct assets have history */
  assets: number;
  /** the bound the weighting can never exceed, as a fraction */
  maxAdjustment: number;
}

export interface Playlist {
  id: number;
  name: string;
  createdAt: number;
  updatedAt: number;
  itemCount: number;
}

export interface PlaylistItem {
  assetId: number;
  position: number;
  filename: string;
  durationMs: number | null;
  ucsCatId: string | null;
  favorite: boolean;
  /** false when the asset row is gone but the reference survived */
  present: boolean;
}

export interface PlaylistDetail extends Playlist {
  items: PlaylistItem[];
}

/**
 * What an import would do.
 *
 * `byMethod` is the important part: it says whether the match came from content
 * hashes (trustworthy), paths, or the filename+size fallback (weak). `ambiguous`
 * counts records that tied on an identifier and were therefore skipped rather than
 * guessed.
 */
export interface BackupInspection {
  backup: { annotations: number; playlists: number; searches: number; usage: number };
  plan: {
    matched: number;
    byMethod: Record<string, number>;
    unmatched: number;
    ambiguous: number;
    unmatchedExamples: string[];
    ambiguousExamples: string[];
  };
}

export interface BackupImportOutcome {
  plan: BackupInspection['plan'];
  result: {
    applied: number;
    playlistsCreated: number;
    playlistItems: number;
    searchesAdded: number;
    usageAdded: number;
    skipped: Array<{ reason: string; detail: string }>;
  };
}

// ---------------------------------------------------------------------------
// bootstrap
// ---------------------------------------------------------------------------

interface VscodeBootstrap {
  port: number;
  token: string;
  url: string;
}

interface VscodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  interface Window {
    /** injected by the extension host before the bundle runs */
    __SOUNDDESK_BOOTSTRAP__?: VscodeBootstrap;
    acquireVsCodeApi?: () => VscodeApi;
  }
}

const VSCODE = typeof window !== 'undefined' && typeof window.acquireVsCodeApi === 'function';

export function detectHost(): 'browser' | 'vscode' {
  return VSCODE ? 'vscode' : 'browser';
}

// ---------------------------------------------------------------------------
// browser implementation
// ---------------------------------------------------------------------------

class HttpEngineClient implements EngineClient {
  readonly host = 'browser' as const;
  private readonly base: string;
  private readonly token: string;
  private socket: WebSocket | null = null;
  private listeners = new Set<(event: EngineEvent) => void>();
  private reconnectTimer: number | null = null;

  constructor(base: string, token: string) {
    this.base = base.replace(/\/$/, '');
    this.token = token;
    this.connect();
  }

  private headers(): Record<string, string> {
    return { 'x-sounddesk-token': this.token, 'content-type': 'application/json' };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      // A 401 here almost always means a stale or missing session token rather
      // than a bug: the engine mints a new one on every start and the browser
      // may still hold an old URL. Say what to do instead of showing a bare 401.
      if (res.status === 401) {
        throw new Error(
          '会话令牌无效或已过期。引擎每次启动都会生成新的令牌，请用引擎打印的带 ?token= 的地址重新打开本页面' +
            '（或查看 <数据目录>/runtime.json 里的 token，附加为 ?token=…）。',
        );
      }
      const detail = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  search(req: SearchRequest): Promise<SearchResponse> {
    return this.request<SearchResponse>('/api/search', { method: 'POST', body: JSON.stringify(req) });
  }

  asset(id: number): Promise<Asset> {
    return this.request<Asset>(`/api/assets/${id}`);
  }

  patchAsset(id: number, patch: PatchableAsset): Promise<Asset> {
    return this.request<Asset>(`/api/assets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  }

  reclassify(id: number): Promise<ReclassifyResult> {
    return this.request<ReclassifyResult>(`/api/assets/${id}/reclassify`, { method: 'POST' });
  }

  listAssets(params: { libraryId?: number; limit?: number; offset?: number }): Promise<AssetPage> {
    const qs = new URLSearchParams();
    if (params.libraryId !== undefined) qs.set('libraryId', String(params.libraryId));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    return this.request<AssetPage>(`/api/assets?${qs.toString()}`);
  }

  libraries(): Promise<Library[]> {
    return this.request<{ libraries: Library[] }>('/api/libraries').then((r) => r.libraries);
  }

  addLibrary(root: string, name?: string): Promise<Library> {
    return this.request<Library>('/api/libraries', { method: 'POST', body: JSON.stringify({ root, name }) });
  }

  async removeLibrary(id: number): Promise<void> {
    await this.request(`/api/libraries/${id}`, { method: 'DELETE' });
  }

  rescanLibrary(id: number, full = false): Promise<JobProgress> {
    const query = full ? '?full=1' : '';
    return this.request<{ job: JobProgress }>(`/api/libraries/${id}/rescan${query}`, { method: 'POST' }).then((r) => r.job);
  }

  ucsTree(): Promise<UcsTree> {
    return this.request<UcsTree>('/api/ucs/tree');
  }

  ucsLookup(term: string): Promise<UcsMatch[]> {
    return this.request<{ matches: UcsMatch[] }>(`/api/ucs/lookup?q=${encodeURIComponent(term)}`).then((r) => r.matches ?? []);
  }

  stats(): Promise<StatsResponse & { dbBytes: number; modelsReady: boolean }> {
    return this.request('/api/stats');
  }

  jobs(): Promise<JobProgress[]> {
    return this.request<{ jobs: JobProgress[] }>('/api/jobs').then((r) => r.jobs);
  }

  async cancelJob(id: string): Promise<void> {
    await this.request(`/api/jobs/${id}/cancel`, { method: 'POST' });
  }

  embeddedInfo(id: number): Promise<EmbeddedInfo> {
    return this.request<EmbeddedInfo>(`/api/assets/${id}/embedded`);
  }

  updateEmbedded(id: number, fields: EmbeddedEditFields, confirm: boolean): Promise<EmbeddedEditResponse> {
    return this.request<EmbeddedEditResponse>(`/api/assets/${id}/embedded`, {
      method: 'PUT',
      body: JSON.stringify({ ...fields, confirm }),
    });
  }

  restoreEmbedded(id: number): Promise<boolean> {
    return this.request<{ restored: boolean }>(`/api/assets/${id}/embedded/restore`, { method: 'POST' }).then(
      (r) => r.restored,
    );
  }

  /**
   * Media URLs carry the token as a query parameter because <audio> cannot send
   * custom headers. The engine accepts either form.
   */
  mediaUrl(id: number): string {
    return `${this.base}/api/media/${id}/stream?token=${encodeURIComponent(this.token)}`;
  }

  peaksUrl(id: number): string {
    return `${this.base}/api/media/${id}/peaks?token=${encodeURIComponent(this.token)}`;
  }

  downloadUrl(id: number): string {
    return `${this.base}/api/media/${id}/download?token=${encodeURIComponent(this.token)}`;
  }

  session(): Promise<SessionInfo> {
    return this.request<SessionInfo>('/api/session');
  }

  async fetchWaveBytes(id: number): Promise<Uint8Array> {
    const res = await fetch(this.mediaUrl(id), { headers: this.headers() });
    if (!res.ok) {
      // Same 401 explanation as `request`, since this bypasses it.
      if (res.status === 401) {
        throw new Error('会话令牌无效或已过期，请用引擎打印的带 ?token= 的地址重新打开本页面');
      }
      throw new Error(`无法读取音频数据（${res.status}）`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  saveExport(params: { assetId: number; filename: string; bytes: Uint8Array }): Promise<ExportResult> {
    const qs = new URLSearchParams({
      assetId: String(params.assetId),
      filename: params.filename,
    });
    return this.request<ExportResult>(`/api/export/save?${qs.toString()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: params.bytes as unknown as BodyInit,
    });
  }

  listExports(libraryId?: number): Promise<string[]> {
    const qs = libraryId !== undefined ? `?libraryId=${libraryId}` : '';
    return this.request<{ files: string[] }>(`/api/export/list${qs}`).then((r) => r.files ?? []);
  }

  deleteExports(paths: string[], libraryId?: number): Promise<DeleteExportsResult> {
    return this.request<DeleteExportsResult>('/api/export/delete', {
      method: 'POST',
      body: JSON.stringify({ paths, libraryId }),
    });
  }

  revealInSystem(): Promise<void> {
    // A page has no filesystem access, so this is genuinely unavailable rather
    // than merely unimplemented. The UI hides the button in this host.
    return Promise.reject(new Error('浏览器无法在文件管理器中定位文件，请在 VSCode 里使用'));
  }

  openInEditor(): Promise<void> {
    return Promise.reject(new Error('浏览器无法在编辑器里打开文件，请在 VSCode 里使用'));
  }

  personalization(): Promise<PersonalizationState> {
    return this.request<PersonalizationState>('/api/personalization');
  }

  setPersonalization(enabled: boolean): Promise<PersonalizationState> {
    return this.request<PersonalizationState>('/api/personalization', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });
  }

  recordUsage(params: { assetId: number; kind: UsageKind; query?: string | null }): Promise<void> {
    // Fire-and-forget on the engine side; the caller must not block playback on it.
    return this.request<{ ok: boolean }>('/api/personalization/usage', {
      method: 'POST',
      body: JSON.stringify({ assetId: params.assetId, kind: params.kind, query: params.query ?? null }),
    }).then(() => undefined);
  }

  clearUsage(): Promise<{ removed: number }> {
    return this.request<{ removed: number }>('/api/personalization/usage', { method: 'DELETE' });
  }

  // -- playlists ---------------------------------------------------------

  playlists(): Promise<Playlist[]> {
    return this.request<{ playlists: Playlist[] }>('/api/playlists').then((r) => r.playlists ?? []);
  }

  playlist(id: number): Promise<PlaylistDetail> {
    return this.request<PlaylistDetail>(`/api/playlists/${id}`);
  }

  createPlaylist(name: string): Promise<Playlist> {
    return this.request<Playlist>('/api/playlists', { method: 'POST', body: JSON.stringify({ name }) });
  }

  renamePlaylist(id: number, name: string): Promise<Playlist> {
    return this.request<Playlist>(`/api/playlists/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
  }

  async removePlaylist(id: number): Promise<void> {
    await this.request(`/api/playlists/${id}`, { method: 'DELETE' });
  }

  addToPlaylist(id: number, assetIds: number[]): Promise<number> {
    return this.request<{ count: number }>(`/api/playlists/${id}/items`, {
      method: 'POST',
      body: JSON.stringify({ assetIds }),
    }).then((r) => r.count ?? 0);
  }

  removeFromPlaylist(id: number, assetIds: number[]): Promise<number> {
    return this.request<{ count: number }>(`/api/playlists/${id}/items`, {
      method: 'DELETE',
      body: JSON.stringify({ assetIds }),
    }).then((r) => r.count ?? 0);
  }

  async reorderPlaylist(id: number, assetId: number, toIndex: number): Promise<void> {
    await this.request(`/api/playlists/${id}/items`, {
      method: 'PUT',
      body: JSON.stringify({ assetId, toIndex }),
    });
  }

  playlistM3uUrl(id: number): string {
    return `${this.base}/api/playlists/${id}/m3u8?token=${encodeURIComponent(this.token)}`;
  }

  searchWithProbe(bytes: Uint8Array, filename: string, limit = 200): Promise<ProbeResponse> {
    // Raw body rather than multipart: the route takes exactly one field, so a
    // multipart envelope would be a parser for no benefit. The name travels as a
    // query parameter and is sanitised on the engine side.
    const qs = new URLSearchParams({ filename, limit: String(limit) });
    return this.request<ProbeResponse>(`/api/search/probe?${qs.toString()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: bytes as unknown as BodyInit,
    });
  }

  searchWithSlice(
    assetId: number,
    window: { offsetMs?: number; durationMs?: number },
    limit = 200,
  ): Promise<ProbeResponse> {
    return this.request<ProbeResponse>('/api/search/slice', {
      method: 'POST',
      body: JSON.stringify({ assetId, ...window, limit }),
    });
  }

  // -- sidecar backup / import -------------------------------------------

  backupUrl(libraryId?: number, includeHistory = true): string {
    const qs = new URLSearchParams({ token: this.token });
    if (libraryId !== undefined) qs.set('libraryId', String(libraryId));
    if (!includeHistory) qs.set('history', '0');
    return `${this.base}/api/backup?${qs.toString()}`;
  }

  inspectBackup(backup: unknown): Promise<BackupInspection> {
    return this.request<BackupInspection>('/api/backup/inspect', {
      method: 'POST',
      body: JSON.stringify({ backup }),
    });
  }

  importBackup(
    backup: unknown,
    options: { overwrite?: boolean; includeHistory?: boolean; includePlaylists?: boolean } = {},
  ): Promise<BackupImportOutcome> {
    return this.request<BackupImportOutcome>('/api/backup/import', {
      method: 'POST',
      body: JSON.stringify({
        backup,
        // the UI runs `inspectBackup` and shows the report first, so reaching this
        // point IS the confirmation
        confirm: true,
        overwrite: options.overwrite === true,
        includeHistory: options.includeHistory !== false,
        includePlaylists: options.includePlaylists !== false,
      }),
    });
  }

  subscribe(onEvent: (event: EngineEvent) => void): () => void {
    this.listeners.add(onEvent);
    return () => this.listeners.delete(onEvent);
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private connect(): void {
    if (typeof WebSocket === 'undefined') return;
    try {
      const wsUrl = `${this.base.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(this.token)}`;
      const socket = new WebSocket(wsUrl);
      this.socket = socket;
      socket.onopen = () => this.emit({ type: 'connected' });
      socket.onmessage = (ev) => {
        try {
          const data = JSON.parse(String(ev.data)) as { type: string; job?: JobProgress; libraryId?: number; assetCount?: number };
          if (data.type === 'job' && data.job) this.emit({ type: 'job', job: data.job });
          else if (data.type === 'library.changed' && data.libraryId !== undefined) {
            this.emit({ type: 'library.changed', libraryId: data.libraryId, assetCount: data.assetCount ?? 0 });
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = () => {
        this.emit({ type: 'disconnected', reason: 'socket closed' });
        this.scheduleReconnect();
      };
      socket.onerror = () => {
        /* onclose follows */
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  /** Progress updates are nice-to-have, so reconnect gently rather than spamming. */
  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2500);
  }
}

// ---------------------------------------------------------------------------
// vscode implementation
// ---------------------------------------------------------------------------

type PendingResolver = { resolve: (value: unknown) => void; reject: (error: Error) => void };

class VscodeEngineClient implements EngineClient {
  readonly host = 'vscode' as const;
  private readonly vscode: VscodeApi;
  private readonly base: string;
  private readonly token: string;
  private readonly pending = new Map<number, PendingResolver>();
  /** host-only actions are answered on a different channel than engine requests */
  private readonly pendingHostActions = new Map<
    number,
    { resolve: () => void; reject: (error: Error) => void }
  >();
  /**
   * Folder picks are tracked separately because their answer is a path rather than
   * just success/failure. A `null` result means the user cancelled, which is not an
   * error and must not surface as one.
   */
  private readonly pendingFolderPicks = new Map<
    number,
    { resolve: (path: string | null) => void; reject: (error: Error) => void }
  >();
  private nextFolderPickId = 1;
  private nextHostActionId = 1;
  private nextId = 1;
  private listeners = new Set<(event: EngineEvent) => void>();

  constructor(bootstrap: VscodeBootstrap) {
    this.vscode = window.acquireVsCodeApi!();
    this.base = bootstrap.url.replace(/\/$/, '');
    this.token = bootstrap.token;
    window.addEventListener('message', (ev) => this.onMessage(ev.data));
  }

  private onMessage(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const msg = data as { type?: string; id?: number; result?: unknown; error?: string; job?: JobProgress };
    if (msg.type === 'engine.response' && typeof msg.id === 'number') {
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(msg.error));
      else entry.resolve(msg.result);
      return;
    }
    if (msg.type === 'engine.event' && msg.job) {
      for (const listener of this.listeners) listener({ type: 'job', job: msg.job });
    }
    if (msg.type === 'webview.hostActionReply' && typeof (msg as { requestId?: number }).requestId === 'number') {
      const reply = msg as { requestId: number; ok: boolean; error?: string };
      const entry = this.pendingHostActions.get(reply.requestId);
      if (!entry) return;
      this.pendingHostActions.delete(reply.requestId);
      if (reply.ok) entry.resolve();
      else entry.reject(new Error(reply.error ?? '宿主操作失败'));
    }
    if (msg.type === 'webview.pickFolderReply' && typeof (msg as { requestId?: number }).requestId === 'number') {
      const reply = msg as { requestId: number; path?: string; error?: string };
      const entry = this.pendingFolderPicks.get(reply.requestId);
      if (!entry) return;
      this.pendingFolderPicks.delete(reply.requestId);
      if (reply.error) entry.reject(new Error(reply.error));
      else entry.resolve(reply.path ?? null);
    }
  }

  /**
   * The extension host proxies the call. The engine is still the single source
   * of truth; this only changes the transport.
   */
  private call<T>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.vscode.postMessage({ type: 'engine.request', id, method, params });
    });
  }

  search(req: SearchRequest): Promise<SearchResponse> {
    return this.call('search', req);
  }

  asset(id: number): Promise<Asset> {
    return this.call('asset', { id });
  }

  patchAsset(id: number, patch: PatchableAsset): Promise<Asset> {
    return this.call('patchAsset', { id, patch });
  }

  reclassify(id: number): Promise<ReclassifyResult> {
    return this.call('reclassify', { id });
  }

  listAssets(params: { libraryId?: number; limit?: number; offset?: number }): Promise<AssetPage> {
    return this.call('listAssets', params);
  }

  libraries(): Promise<Library[]> {
    return this.call('libraries');
  }

  addLibrary(root: string, name?: string): Promise<Library> {
    return this.call('addLibrary', { root, name });
  }

  /**
   * Index a library to completion.
   *
   * The extension host runs the passes in sequence and resolves when they are done;
   * progress arrives on the job event channel.
   */
  importLibrary(root: string, name?: string): Promise<LibraryImportResult> {
    return this.call('addLibraryAndIndex', { root, name });
  }

  async removeLibrary(id: number): Promise<void> {
    await this.call('removeLibrary', { id });
  }

  rescanLibrary(id: number, full = false): Promise<JobProgress> {
    return this.call('rescanLibrary', { id, full });
  }

  ucsTree(): Promise<UcsTree> {
    return this.call('ucsTree');
  }

  ucsLookup(term: string): Promise<UcsMatch[]> {
    return this.call('ucsLookup', { term });
  }

  stats(): Promise<StatsResponse & { dbBytes: number; modelsReady: boolean }> {
    return this.call('stats');
  }

  jobs(): Promise<JobProgress[]> {
    return this.call('jobs');
  }

  async cancelJob(id: string): Promise<void> {
    await this.call('cancelJob', { id });
  }

  embeddedInfo(id: number): Promise<EmbeddedInfo> {
    return this.call('embeddedInfo', { id });
  }

  updateEmbedded(id: number, fields: EmbeddedEditFields, confirm: boolean): Promise<EmbeddedEditResponse> {
    return this.call('updateEmbedded', { id, fields, confirm });
  }

  restoreEmbedded(id: number): Promise<boolean> {
    return this.call<{ restored: boolean }>('restoreEmbedded', { id }).then((r) => r.restored);
  }

  mediaUrl(id: number): string {
    return `${this.base}/api/media/${id}/stream?token=${encodeURIComponent(this.token)}`;
  }

  peaksUrl(id: number): string {
    return `${this.base}/api/media/${id}/peaks?token=${encodeURIComponent(this.token)}`;
  }

  downloadUrl(id: number): string {
    return `${this.base}/api/media/${id}/download?token=${encodeURIComponent(this.token)}`;
  }

  session(): Promise<SessionInfo> {
    return this.call<SessionInfo>('session');
  }

  async fetchWaveBytes(id: number): Promise<Uint8Array> {
    // The extension host proxies everything else, but media is already served by
    // the in-process engine over HTTP, so reuse that rather than shipping
    // megabytes of audio through postMessage.
    const res = await fetch(this.mediaUrl(id));
    if (!res.ok) throw new Error(`无法读取音频数据（${res.status}）`);
    return new Uint8Array(await res.arrayBuffer());
  }

  saveExport(params: { assetId: number; filename: string; bytes: Uint8Array }): Promise<ExportResult> {
    return this.call<ExportResult>('saveExport', params);
  }

  listExports(libraryId?: number): Promise<string[]> {
    return this.call<{ files: string[] }>('listExports', { libraryId }).then((r) => r.files ?? []);
  }

  deleteExports(paths: string[], libraryId?: number): Promise<DeleteExportsResult> {
    return this.call<DeleteExportsResult>('deleteExports', { paths, libraryId });
  }

  revealInSystem(assetId: number): Promise<void> {
    return this.hostAction('revealInOS', assetId);
  }

  openInEditor(assetId: number): Promise<void> {
    return this.hostAction('openInEditor', assetId);
  }

  personalization(): Promise<PersonalizationState> {
    return this.call<PersonalizationState>('personalization');
  }

  setPersonalization(enabled: boolean): Promise<PersonalizationState> {
    return this.call<PersonalizationState>('setPersonalization', { enabled });
  }

  recordUsage(params: { assetId: number; kind: UsageKind; query?: string | null }): Promise<void> {
    return this.call<void>('recordUsage', params);
  }

  clearUsage(): Promise<{ removed: number }> {
    return this.call<{ removed: number }>('clearUsage');
  }

  // -- playlists ---------------------------------------------------------

  playlists(): Promise<Playlist[]> {
    return this.call<{ playlists: Playlist[] }>('playlists').then((r) => r.playlists ?? []);
  }

  playlist(id: number): Promise<PlaylistDetail> {
    return this.call<PlaylistDetail>('playlist', { id });
  }

  createPlaylist(name: string): Promise<Playlist> {
    return this.call<Playlist>('createPlaylist', { name });
  }

  renamePlaylist(id: number, name: string): Promise<Playlist> {
    return this.call<Playlist>('renamePlaylist', { id, name });
  }

  async removePlaylist(id: number): Promise<void> {
    await this.call('removePlaylist', { id });
  }

  addToPlaylist(id: number, assetIds: number[]): Promise<number> {
    return this.call<{ count: number }>('addToPlaylist', { id, assetIds }).then((r) => r.count ?? 0);
  }

  removeFromPlaylist(id: number, assetIds: number[]): Promise<number> {
    return this.call<{ count: number }>('removeFromPlaylist', { id, assetIds }).then((r) => r.count ?? 0);
  }

  async reorderPlaylist(id: number, assetId: number, toIndex: number): Promise<void> {
    await this.call('reorderPlaylist', { id, assetId, toIndex });
  }

  playlistM3uUrl(id: number): string {
    // The extension host runs the same HTTP engine, so a real download URL works.
    return `${this.base}/api/playlists/${id}/m3u8?token=${encodeURIComponent(this.token)}`;
  }

  async searchWithProbe(bytes: Uint8Array, filename: string, limit = 200): Promise<ProbeResponse> {
    // The engine is a real HTTP server even inside the extension host, so the raw
    // body goes over HTTP rather than through the message bridge: shipping megabytes
    // of audio through postMessage would be wasteful.
    const qs = new URLSearchParams({ filename, limit: String(limit), token: this.token });
    const res = await fetch(`${this.base}/api/search/probe?${qs.toString()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-sounddesk-token': this.token },
      body: bytes as unknown as BodyInit,
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(detail.error ?? `参考音频搜索失败（${res.status}）`);
    }
    return (await res.json()) as ProbeResponse;
  }

  async searchWithSlice(
    assetId: number,
    window: { offsetMs?: number; durationMs?: number },
    limit = 200,
  ): Promise<ProbeResponse> {
    const qs = new URLSearchParams({ token: this.token });
    const res = await fetch(`${this.base}/api/search/slice?${qs.toString()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sounddesk-token': this.token },
      body: JSON.stringify({ assetId, ...window, limit }),
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(detail.error ?? `选区搜索失败（${res.status}）`);
    }
    return (await res.json()) as ProbeResponse;
  }

  // -- sidecar backup / import -------------------------------------------

  backupUrl(libraryId?: number, includeHistory = true): string {
    // The extension host serves the same HTTP engine, so the download URL works
    // here too — and a real download is what a webview needs anyway.
    const qs = new URLSearchParams({ token: this.token });
    if (libraryId !== undefined) qs.set('libraryId', String(libraryId));
    if (!includeHistory) qs.set('history', '0');
    return `${this.base}/api/backup?${qs.toString()}`;
  }

  inspectBackup(backup: unknown): Promise<BackupInspection> {
    return this.call<BackupInspection>('inspectBackup', { backup });
  }

  importBackup(
    backup: unknown,
    options: { overwrite?: boolean; includeHistory?: boolean; includePlaylists?: boolean } = {},
  ): Promise<BackupImportOutcome> {
    return this.call<BackupImportOutcome>('importBackup', { backup, ...options });
  }

  /**
   * Ask the host to act on the asset's real file.
   *
   * Only the asset id travels; the extension host resolves the path from the
   * engine's own database, so a path can never be injected from the webview.
   */
  private hostAction(action: 'revealInOS' | 'openInEditor', assetId: number): Promise<void> {
    const requestId = this.nextHostActionId++;
    return new Promise<void>((resolve, reject) => {
      this.pendingHostActions.set(requestId, { resolve, reject });
      this.vscode.postMessage({ type: 'webview.hostAction', action, assetId, requestId });
      // A host that never answers must not leave the button spinning forever.
      window.setTimeout(() => {
        const entry = this.pendingHostActions.get(requestId);
        if (!entry) return;
        this.pendingHostActions.delete(requestId);
        reject(new Error('宿主没有响应，请重试'));
      }, 10_000);
    });
  }

  /**
   * Ask the host for a directory to index.
   *
   * The dialog lives in the extension host because a webview cannot produce a real
   * filesystem path; only the host can. Returns `null` when the user cancels.
   */
  pickFolder(title?: string): Promise<string | null> {
    const requestId = this.nextFolderPickId++;
    return new Promise<string | null>((resolve, reject) => {
      this.pendingFolderPicks.set(requestId, { resolve, reject });
      this.vscode.postMessage({ type: 'webview.pickFolder', requestId, ...(title ? { title } : {}) });
      window.setTimeout(() => {
        const entry = this.pendingFolderPicks.get(requestId);
        if (!entry) return;
        this.pendingFolderPicks.delete(requestId);
        reject(new Error('宿主没有响应，请重试'));
      }, 60_000);
    });
  }

  subscribe(onEvent: (event: EngineEvent) => void): () => void {
    this.listeners.add(onEvent);
    return () => this.listeners.delete(onEvent);
  }
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export interface ClientBootInfo {
  host: 'browser' | 'vscode';
  base: string;
  token: string | null;
}

/**
 * Resolve how to reach the engine.
 *
 * Browser: the engine serves this bundle, so same-origin fetches work and the
 * token arrives as `?token=` (then is stripped from the address bar so it does
 * not linger in history or get copied into a bug report).
 *
 * VSCode: the extension injects `window.__SOUNDDESK_BOOTSTRAP__`.
 */
/**
 * Where the browser keeps the session token between page loads.
 *
 * The token arrives as `?token=` and is then stripped from the address bar so it
 * does not linger in history. Without this stash that made the app unusable
 * after a refresh — the URL no longer carried the token, so every request 401'd
 * even though the engine was running fine. `sessionStorage` (not `localStorage`)
 * is the right scope: it survives a reload but not a browser restart, which
 * matches the fact that the engine mints a new token every time it starts.
 */
const TOKEN_STORAGE_KEY = 'sounddesk.token';

function readStoredToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // private mode / storage disabled — fall back to the URL only
    return null;
  }
}

function storeToken(token: string): void {
  try {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    /* not fatal: the URL still works for this load */
  }
}

export function resolveBoot(): ClientBootInfo {
  if (VSCODE) {
    const bootstrap = window.__SOUNDDESK_BOOTSTRAP__;
    if (!bootstrap) {
      throw new Error('running inside VSCode but no engine bootstrap was injected');
    }
    return { host: 'vscode', base: bootstrap.url, token: bootstrap.token };
  }

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('token');
  if (fromUrl) {
    storeToken(fromUrl);
    params.delete('token');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    return { host: 'browser', base: window.location.origin, token: fromUrl };
  }

  // No token in the URL: reuse the one from earlier in this tab so that a reload
  // keeps working. It is only replaced when a new token is supplied.
  return { host: 'browser', base: window.location.origin, token: readStoredToken() };
}

export function createEngineClient(): EngineClient {
  const boot = resolveBoot();
  if (boot.host === 'vscode') {
    return new VscodeEngineClient({ port: 0, token: boot.token ?? '', url: boot.base });
  }
  if (!boot.token) {
    throw new Error(
      '没有找到会话令牌。请用引擎打印的带 ?token= 的完整地址打开本页面（引擎启动时会输出该地址），' +
        '或查看 <数据目录>/runtime.json 里的 token。',
    );
  }
  return new HttpEngineClient(boot.base, boot.token);
}
