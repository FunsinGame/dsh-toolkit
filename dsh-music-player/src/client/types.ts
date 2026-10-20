/** Browser-half shared types. */

export interface Track {
  bvid: string
  cid?: number
  title: string
  author: string
  cover: string
  durationSeconds: number
  pageCount: number
  views?: number
  direct?: boolean
  invalid?: boolean
  invalidReason?: string
}

export type PlayMode = 'sequential' | 'repeat-all' | 'repeat-one' | 'shuffle'

export interface Settings {
  audioQuality: number
  defaultPlayMode: PlayMode
  volume: number
  playbackRate: number
  cacheEnabled: boolean
  cacheMaxMB: number
  requestIntervalMs: number
  logLevel: 'off' | 'info' | 'debug'
  showStatusBar: boolean
}

export interface CacheInfo {
  files: number
  bytes: number
  maxBytes: number
  dir: string
  enabled: boolean
}

export interface AccountUser {
  mid: number
  name: string
  face: string
}

export interface FavoriteFolder {
  id: number
  title: string
  count: number
}

export interface FavoriteMembership {
  id: number
  title: string
  selected: boolean
}

export interface SearchState {
  keyword: string
  page: number
  numPages: number
  items: Track[]
  loading: boolean
  error: string | null
  at: number
}

export interface FavoriteOpenState {
  mediaId: number
  title: string
  total: number
  page: number
  hasMore: boolean
  items: Track[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  keyword: string
  selected: string[]
}

export interface FavoritesState {
  loading: boolean
  error: string | null
  loaded: boolean
  folders: FavoriteFolder[]
  open: FavoriteOpenState | null
  busy: boolean
}

export type QrStatus = 'waiting' | 'scanned' | 'success' | 'expired' | 'cancelled' | 'error'

export interface QrState {
  id: string
  dataUrl: string
  status: QrStatus
  message: string
  active: boolean
  startedAt: number
}

export interface AccountState {
  loggedIn: boolean
  user: AccountUser | null
  loading: boolean
}

export interface ToastState {
  id: number
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

export type Tab = 'search' | 'favorites' | 'queue' | 'account' | 'settings'

export interface UiState {
  tab: Tab
  toast: ToastState | null
}

export interface PlayerState {
  track: Track | null
  queue: Track[]
  queueIndex: number
  mode: PlayMode
  playing: boolean
  position: number
  duration: number
  buffered: number
  volume: number
  muted: boolean
  rate: number
  loading: boolean
  loadingMessage: string
  error: string | null
  needsGesture: boolean
  ready: boolean
  format: 'raw' | 'wav' | null
  nativeAac: boolean
  hostReady: boolean
}

export interface LibraryState {
  search: SearchState | null
  favorites: FavoritesState
  account: AccountState
  qr: QrState | null
  cache: CacheInfo | null
  settings: Settings | null
  settingsLoading: boolean
  hostError: string | null
}
