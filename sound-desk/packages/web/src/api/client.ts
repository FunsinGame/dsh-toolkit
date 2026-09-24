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
  rescanLibrary(id: number): Promise<JobProgress>;
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
  /** live job progress; returns an unsubscribe function */
  subscribe(onEvent: (event: EngineEvent) => void): () => void;
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

  rescanLibrary(id: number): Promise<JobProgress> {
    return this.request<{ job: JobProgress }>(`/api/libraries/${id}/rescan`, { method: 'POST' }).then((r) => r.job);
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

  async removeLibrary(id: number): Promise<void> {
    await this.call('removeLibrary', { id });
  }

  rescanLibrary(id: number): Promise<JobProgress> {
    return this.call('rescanLibrary', { id });
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
