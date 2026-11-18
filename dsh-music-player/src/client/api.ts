/** Same-origin client for the host half. */

import type {
  AccountUser,
  CacheInfo,
  FavoriteFolder,
  FavoriteMembership,
  PlayMode,
  QrStatus,
  Settings,
  Track,
} from './types'

interface TransportGlobal {
  __DSH_TRANSPORT__?: { streamBaseUrl?: string }
}

/** A page that is not served over HTTP(S) cannot address a Host origin. */
const PAGE_IS_HTTP = typeof location === 'undefined'
  ? false
  : location.protocol === 'http:' || location.protocol === 'https:'

/** Host origin the transport reports for a shell-owned Host, if any. */
const STREAM_ORIGIN = (() => {
  const raw = (globalThis as TransportGlobal).__DSH_TRANSPORT__?.streamBaseUrl
  if (typeof raw !== 'string' || raw.trim() === '') return ''
  try {
    return new URL(raw).origin
  } catch {
    return ''
  }
})()

const PREFIX = '/dsh-music-player'
/** Document-relative base: the served Web app's own origin, and the Desktop page. */
const RELATIVE_BASE = PREFIX
/** Absolute base for a Host living on another origin; empty when none is known. */
const ABSOLUTE_BASE = STREAM_ORIGIN === '' ? '' : `${STREAM_ORIGIN}${PREFIX}`

/**
 * The Desktop renderer is a static `dsh-app://app/` page. Electron's protocol
 * handler forwards its document-relative requests to the owned Host together
 * with the private credential, so `/dsh-music-player/...` reaches the Host. A
 * direct `http://127.0.0.1:<port>` request from that page is cross-origin and
 * carries no credential, and the Host's own responses grant no CORS origin, so
 * the browser rejects it as `TypeError: Failed to fetch` before the route runs.
 *
 * Only an HTTP(S) page starts on the absolute base: the served Web app is
 * same-origin either way, and a shell-owned Host on another origin needs its
 * reported origin. Every other page stays document-relative, and a network
 * failure promotes the other base (`send`), so either composition works.
 */
let activeBase = PAGE_IS_HTTP && ABSOLUTE_BASE !== '' ? ABSOLUTE_BASE : RELATIVE_BASE

/** Origin stem for the base in use; empty while the client is document-relative. */
function activeOrigin(): string {
  return activeBase === RELATIVE_BASE ? '' : STREAM_ORIGIN
}

/** The API base the client currently uses. */
export function apiBase(): string {
  return activeBase
}

/** Resolve a host-relative path against the base in use. */
export function hostUrl(path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path
  return `${activeOrigin()}${path.startsWith('/') ? '' : '/'}${path}`
}

/**
 * The base to retry with after a network failure, or `''` when there is no
 * different one to try.
 */
function alternateBase(current: string): string {
  if (ABSOLUTE_BASE === '') return ''
  return current === RELATIVE_BASE ? ABSOLUTE_BASE : RELATIVE_BASE
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: string = 'api',
    readonly status = 0,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface Envelope<T> {
  ok: boolean
  data?: T
  error?: string
  kind?: string
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const base = activeBase
  try {
    return await fetch(`${base}${path}`, init)
  } catch (error) {
    // Only a read is retried: a failed write may already have run on the Host.
    const method = (init.method ?? 'GET').toUpperCase()
    const alternate = method === 'GET' || method === 'HEAD' ? alternateBase(base) : ''
    if (alternate === '') throw error
    const response = await fetch(`${alternate}${path}`, init)
    activeBase = alternate
    return response
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await send(path, {
      credentials: 'same-origin',
      ...init,
      headers: {
        ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init?.headers,
      },
    })
  } catch (error) {
    throw new ApiError(`无法连接宿主：${error instanceof Error ? error.message : String(error)}`, 'network')
  }
  let payload: Envelope<T>
  try {
    payload = (await response.json()) as Envelope<T>
  } catch {
    throw new ApiError(`宿主返回了非 JSON 响应（HTTP ${response.status}）`, 'parse', response.status)
  }
  if (!response.ok || payload.ok !== true) {
    throw new ApiError(payload.error ?? `请求失败（HTTP ${response.status}）`, payload.kind ?? 'api', response.status)
  }
  return payload.data as T
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

export interface StatusPayload {
  version: string
  loggedIn: boolean
  user: AccountUser | null
  settings: Settings
  cache: CacheInfo
  logLevel: string
}

export interface SearchPayload {
  keyword: string
  page: number
  numPages: number
  items: Track[]
}

export interface PlayPayload {
  id: string
  url: string
  track: Track
  durationSeconds: number
  contentType: string
  format: 'raw' | 'wav'
  fromCache: boolean
  size: number | null
}

export interface FavoritesPayload {
  items: FavoriteFolder[]
}

export interface FavoriteContentsPayload {
  mediaId: number
  page: number
  title: string
  total: number
  hasMore: boolean
  items: Track[]
}

export interface MembershipPayload {
  bvid: string
  folders: FavoriteMembership[]
}

export interface SettingsPayload {
  settings: Settings
  cache: CacheInfo
}

export interface AuthStartPayload {
  id: string
  url: string
  dataUrl: string
  expiresInMs: number
}

export interface AuthPollPayload {
  status: QrStatus
  message: string
  loggedIn: boolean
  user: AccountUser | null
}

export const api = {
  status: (): Promise<StatusPayload> => request('/api/status'),
  health: (): Promise<{ ok: boolean; version: string }> => request('/api/health'),
  search: (keyword: string, page = 1): Promise<SearchPayload> =>
    request(`/api/search?keyword=${encodeURIComponent(keyword)}&page=${page}`),
  play: (body: {
    bvid: string
    cid?: number
    quality: number
    format: 'raw' | 'wav'
    track: Track
  }): Promise<PlayPayload> => post('/api/play', body),
  authStart: (): Promise<AuthStartPayload> => request('/api/auth/qr'),
  authPoll: (id: string): Promise<AuthPollPayload> =>
    request(`/api/auth/poll?id=${encodeURIComponent(id)}`),
  logout: (): Promise<{ loggedIn: boolean; user: null }> => post('/api/auth/logout', {}),
  favorites: (): Promise<FavoritesPayload> => request('/api/favorites'),
  favoriteContents: (mediaId: number, page = 1, keyword = ''): Promise<FavoriteContentsPayload> =>
    request(
      `/api/favorites/contents?mediaId=${mediaId}&page=${page}` +
        (keyword === '' ? '' : `&keyword=${encodeURIComponent(keyword)}`),
    ),
  membership: (bvid: string): Promise<MembershipPayload> =>
    request(`/api/favorites/membership?bvid=${encodeURIComponent(bvid)}`),
  createFolder: (title: string, privacy: 0 | 1): Promise<unknown> =>
    post('/api/favorites/create', { title, privacy }),
  deleteFolder: (mediaId: number): Promise<unknown> => post('/api/favorites/delete', { mediaId }),
  removeResources: (mediaId: number, bvids: string[]): Promise<unknown> =>
    post('/api/favorites/remove', { mediaId, bvids }),
  dealFavorite: (bvid: string, addIds: string[], delIds: string[]): Promise<unknown> =>
    post('/api/favorites/deal', { bvid, addIds, delIds }),
  settings: (): Promise<SettingsPayload> => request('/api/settings'),
  updateSetting: (key: string, value: unknown): Promise<SettingsPayload> =>
    post('/api/settings', { key, value }),
  cache: (): Promise<CacheInfo> => request('/api/cache'),
  clearCache: (): Promise<CacheInfo> => post('/api/cache/clear', {}),
  logs: (limit = 200): Promise<{ level: string; lines: string[] }> =>
    request(`/api/logs?limit=${limit}`),
}

/**
 * Unwrap URLs produced by an older host origin (the desktop app uses an
 * ephemeral port). Persisted queue entries can therefore carry
 * `http://127.0.0.1:<old-port>/dsh-music-player/image?url=...`; feeding that
 * back into the proxy would nest one proxy URL inside another and fail the
 * host's image-host allowlist.
 */
function unwrapImageProxy(value: string): string {
  let current = value
  for (let depth = 0; depth < 6; depth++) {
    let parsed: URL
    try {
      parsed = new URL(current, 'http://localhost')
    } catch {
      try {
        current = decodeURIComponent(current)
        parsed = new URL(current, 'http://localhost')
      } catch {
        break
      }
    }
    if (!parsed.pathname.endsWith('/dsh-music-player/image')) break
    const inner = parsed.searchParams.get('url')
    if (inner === null || inner === '') break
    current = inner
  }
  return current
}

export function imageUrl(url: string | null | undefined): string {
  if (url === null || url === undefined || url === '') return ''
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  const raw = unwrapImageProxy(url)
  if (raw.startsWith(PREFIX)) return hostUrl(raw)
  if (STREAM_ORIGIN !== '' && raw.startsWith(`${STREAM_ORIGIN}${PREFIX}`)) {
    // Already addressed to this Host: keep it on whichever base is in use.
    return hostUrl(raw.slice(STREAM_ORIGIN.length))
  }
  return `${activeBase}/image?url=${encodeURIComponent(raw)}`
}

export function modeLabel(mode: PlayMode): string {
  switch (mode) {
    case 'repeat-all': return '列表循环'
    case 'repeat-one': return '单曲循环'
    case 'shuffle': return '随机播放'
    default: return '顺序播放'
  }
}

export function qualityLabel(quality: number): string {
  switch (quality) {
    case 30216: return '64K'
    case 30232: return '132K'
    case 30280: return '192K'
    default: return String(quality)
  }
}
