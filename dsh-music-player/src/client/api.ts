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

/**
 * The desktop renderer runs on its own `dsh-app:` scheme while the host's Web
 * server lives on `http://127.0.0.1:<port>`. `streamBaseUrl` is the host
 * origin in that composition; the served Web app omits it and stays
 * same-origin.
 */
export const HOST_ORIGIN = (() => {
  const raw = (globalThis as TransportGlobal).__DSH_TRANSPORT__?.streamBaseUrl
  if (typeof raw !== 'string' || raw.trim() === '') return ''
  try {
    return new URL(raw).origin
  } catch {
    return ''
  }
})()

export const BASE = `${HOST_ORIGIN}/dsh-music-player`

/** Resolve a host-relative path against the desktop host origin. */
export function hostUrl(path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path
  return `${HOST_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
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

export function imageUrl(url: string | null | undefined): string {
  if (url === null || url === undefined || url === '') return ''
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  if (url.startsWith('/dsh-music-player')) return hostUrl(url)
  if (HOST_ORIGIN !== '' && url.startsWith(`${HOST_ORIGIN}/dsh-music-player`)) return url
  return `${BASE}/image?url=${encodeURIComponent(url)}`
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
