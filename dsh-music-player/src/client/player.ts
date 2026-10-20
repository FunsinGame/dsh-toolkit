/**
 * Browser-side player controller.
 *
 * One controller lives for the whole plugin lifetime, outside React. The
 * `<audio>` element therefore survives switching activities, and the player
 * page, status-bar item, and mini player all observe the same stores.
 */

import { api, ApiError, hostUrl, imageUrl, modeLabel, qualityLabel } from './api'
import {
  adopt,
  advance,
  clear,
  currentIndex,
  currentTrack,
  enqueue,
  move,
  removeAt,
  setMode,
  type QueueSnapshot,
} from './queue'
import { createStore, type Store } from './store'
import type {
  AccountUser,
  CacheInfo,
  FavoriteMembership,
  LibraryState,
  PlayMode,
  PlayerState,
  QrState,
  Settings,
  Tab,
  Track,
  UiState,
} from './types'

const STORAGE_KEY = 'dsh.music-player.v1'

const DEFAULT_SETTINGS: Settings = {
  audioQuality: 30280,
  defaultPlayMode: 'sequential',
  volume: 0.8,
  playbackRate: 1,
  cacheEnabled: true,
  cacheMaxMB: 500,
  requestIntervalMs: 350,
  logLevel: 'info',
  showStatusBar: true,
}

const EMPTY_LIBRARY: LibraryState = {
  search: null,
  favorites: {
    loading: false,
    error: null,
    loaded: false,
    folders: [],
    open: null,
    busy: false,
  },
  account: { loggedIn: false, user: null, loading: true },
  qr: null,
  cache: null,
  settings: null,
  settingsLoading: true,
  hostError: null,
}

const EMPTY_PLAYER: PlayerState = {
  track: null,
  queue: [],
  queueIndex: -1,
  mode: 'sequential',
  playing: false,
  position: 0,
  duration: 0,
  buffered: 0,
  volume: DEFAULT_SETTINGS.volume,
  muted: false,
  rate: DEFAULT_SETTINGS.playbackRate,
  loading: false,
  loadingMessage: '',
  error: null,
  needsGesture: false,
  ready: false,
  format: null,
  nativeAac: true,
  hostReady: false,
}

interface Persisted {
  queue: Track[]
  queueIndex: number
  mode: PlayMode
  track: Track | null
  position: number
  volume: number
  rate: number
  tab: Tab
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function probeAac(): boolean {
  try {
    const element = document.createElement('audio')
    return element.canPlayType('audio/mp4; codecs="mp4a.40.2"') !== ''
  } catch {
    return true
  }
}

function formatError(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return error instanceof Error ? error.message : String(error)
}

function sameTrack(left: Track | null, right: Track | null): boolean {
  return left !== null && right !== null && left.bvid === right.bvid && left.cid === right.cid
}

export class PlayerController {
  readonly player: Store<PlayerState>
  readonly library: Store<LibraryState>
  readonly ui: Store<UiState>

  private readonly audio: HTMLAudioElement
  private started = false
  private queue: QueueSnapshot = { items: [], position: -1, mode: 'sequential', order: [] }
  private settings: Settings = { ...DEFAULT_SETTINGS }
  private requestId = 0
  private currentFormat: 'raw' | 'wav' | null = null
  private wavRetriedFor: string | null = null
  private qrTimer: number | null = null
  private persistTimer: number | null = null
  private toastTimer: number | null = null
  private settingsTimers = new Map<string, number>()
  private restorePosition = 0
  private lastPersistAt = 0
  private hasRestoredSettings = false
  private openHandler: (() => void) | null = null

  constructor() {
    this.player = createStore<PlayerState>({ ...EMPTY_PLAYER, nativeAac: probeAac() })
    this.library = createStore<LibraryState>(EMPTY_LIBRARY)
    this.ui = createStore<UiState>({ tab: 'search', toast: null })
    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.audio.crossOrigin = 'anonymous'
  }

  /** Start the controller and load local/remote state. */
  start(): void {
    if (this.started) return
    this.started = true
    this.bindAudio()
    this.restorePersisted()
    this.player.set((state) => ({ ...state, ready: true }))
    void this.refreshStatus()
  }

  dispose(): void {
    this.started = false
    this.requestId++
    this.clearQrTimer()
    if (this.persistTimer !== null) window.clearTimeout(this.persistTimer)
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer)
    for (const timer of this.settingsTimers.values()) window.clearTimeout(timer)
    this.settingsTimers.clear()
    try {
      this.audio.pause()
      this.audio.removeAttribute('src')
      this.audio.load()
    } catch {
      // Audio teardown is best-effort.
    }
  }

  setOpenHandler(handler: (() => void) | null): void {
    this.openHandler = handler
  }

  /** Diagnostics only: the live audio element behind the stores. */
  get audioElement(): HTMLAudioElement {
    return this.audio
  }

  openPage(): void {
    this.openHandler?.()
  }

  /* ------------------------------------------------------------- bootstrap */

  async refreshStatus(retries = 2): Promise<void> {
    try {
      const status = await api.status()
      const current = this.player.getSnapshot()
      // Local volume/rate are restored before the host answers. Keep them when
      // they exist, and push them back to the host so both sides agree.
      const volume = this.hasRestoredSettings ? current.volume : status.settings.volume
      const rate = this.hasRestoredSettings ? current.rate : status.settings.playbackRate
      this.settings = { ...DEFAULT_SETTINGS, ...status.settings, volume, playbackRate: rate }
      this.library.set((state) => ({
        ...state,
        account: { loggedIn: status.loggedIn, user: status.user, loading: false },
        cache: status.cache,
        settings: this.settings,
        settingsLoading: false,
        hostError: null,
      }))
      this.player.set((state) => ({
        ...state,
        volume,
        rate,
        hostReady: true,
        nativeAac: state.nativeAac,
      }))
      this.audio.volume = volume
      this.audio.playbackRate = rate
      if (this.hasRestoredSettings) {
        if (Math.abs(volume - status.settings.volume) > 0.001) this.scheduleSetting('volume', volume)
        if (Math.abs(rate - status.settings.playbackRate) > 0.001) this.scheduleSetting('playbackRate', rate)
      }
      if (this.queue.items.length === 0 && this.queue.mode !== this.settings.defaultPlayMode) {
        this.queue = { ...this.queue, mode: this.settings.defaultPlayMode }
        this.emitQueue()
      }
    } catch (error) {
      if (retries > 0) {
        window.setTimeout(() => { void this.refreshStatus(retries - 1) }, 1200)
        return
      }
      const message = formatError(error)
      this.library.set((state) => ({
        ...state,
        settingsLoading: false,
        hostError: message,
      }))
      this.player.set((state) => ({ ...state, hostReady: false }))
    }
  }

  /* ---------------------------------------------------------------- audio */

  private bindAudio(): void {
    const audio = this.audio
    audio.addEventListener('timeupdate', () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : this.player.getSnapshot().duration
      this.player.set((state) => ({
        ...state,
        position: audio.currentTime,
        duration,
        buffered: bufferedEnd(audio),
      }))
      this.persistThrottled()
    })
    audio.addEventListener('durationchange', () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return
      this.player.set((state) => ({ ...state, duration: audio.duration }))
    })
    audio.addEventListener('progress', () => {
      this.player.set((state) => ({ ...state, buffered: bufferedEnd(audio) }))
    })
    audio.addEventListener('play', () => {
      this.player.set((state) => ({ ...state, playing: true, needsGesture: false, error: null }))
    })
    audio.addEventListener('pause', () => {
      this.player.set((state) => ({ ...state, playing: false }))
      this.persistSoon()
    })
    audio.addEventListener('waiting', () => {
      this.player.set((state) => ({ ...state, loading: true, loadingMessage: '缓冲中…' }))
    })
    audio.addEventListener('canplay', () => {
      this.player.set((state) => ({ ...state, loading: false, loadingMessage: '' }))
    })
    audio.addEventListener('playing', () => {
      this.player.set((state) => ({ ...state, loading: false, loadingMessage: '', error: null }))
    })
    audio.addEventListener('volumechange', () => {
      this.player.set((state) => ({ ...state, volume: audio.volume, muted: audio.muted }))
    })
    audio.addEventListener('ratechange', () => {
      this.player.set((state) => ({ ...state, rate: audio.playbackRate }))
    })
    audio.addEventListener('ended', () => {
      void this.next(true)
    })
    audio.addEventListener('error', () => {
      if (!this.started) return
      const state = this.player.getSnapshot()
      if (state.track === null) return
      const key = `${state.track.bvid}:${state.track.cid ?? 0}`
      if (this.currentFormat === 'raw' && this.wavRetriedFor !== key) {
        this.wavRetriedFor = key
        this.toast('warn', '浏览器未能直接解码 AAC，正在用宿主转码重试…')
        void this.playTrack(state.track, { keepQueue: true, forceWav: true, resumeAt: audio.currentTime })
        return
      }
      const message = audio.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
        ? '音频格式不受支持，转码也失败了'
        : '音频加载失败，请检查网络后重试'
      this.player.set((current) => ({ ...current, loading: false, playing: false, error: message }))
      this.toast('error', message)
    })
  }

  private async playTrack(
    track: Track,
    options: {
      queue?: Track[]
      index?: number
      keepQueue?: boolean
      forceWav?: boolean
      resumeAt?: number
    } = {},
  ): Promise<void> {
    if (track.invalid === true) {
      this.toast('warn', '这个视频已经失效，无法播放')
      return
    }
    if (options.queue !== undefined && options.queue.length > 0) {
      this.queue = adopt(options.queue, options.index ?? 0, this.queue.mode)
    } else {
      const existing = this.queue.items.findIndex((item) =>
        item.bvid === track.bvid && (item.cid === undefined || track.cid === undefined || item.cid === track.cid))
      if (existing >= 0) {
        const position = this.queue.order.indexOf(existing)
        if (position >= 0) this.queue = { ...this.queue, position }
      } else if (!options.keepQueue) {
        this.queue = adopt([track], 0, this.queue.mode)
      }
    }
    this.emitQueue()
    this.persistSoon()

    const requestId = ++this.requestId
    const state = this.player.getSnapshot()
    const format: 'raw' | 'wav' = options.forceWav === true || !state.nativeAac ? 'wav' : 'raw'
    const key = `${track.bvid}:${track.cid ?? 0}`
    if (format === 'wav' && this.wavRetriedFor !== key) this.wavRetriedFor = key

    this.player.set((current) => ({
      ...current,
      track,
      loading: true,
      loadingMessage: format === 'wav' ? '正在转码音频…' : '正在准备音频…',
      error: null,
      needsGesture: false,
      playing: false,
      position: options.resumeAt ?? 0,
      duration: track.durationSeconds,
      format,
    }))
    try {
      this.audio.pause()
      const result = await api.play({
        bvid: track.bvid,
        ...(track.cid === undefined ? {} : { cid: track.cid }),
        quality: this.settings.audioQuality,
        format,
        track,
      })
      if (requestId !== this.requestId) return
      this.currentFormat = result.format
      const resolvedTrack: Track = {
        ...track,
        ...result.track,
        cover: track.cover || result.track.cover,
        cid: result.track.cid ?? track.cid,
        durationSeconds: result.durationSeconds || track.durationSeconds,
      }
      this.audio.src = hostUrl(result.url)
      this.audio.load()
      this.audio.volume = this.settings.volume
      this.audio.muted = this.player.getSnapshot().muted
      this.audio.playbackRate = this.settings.playbackRate
      const resume = options.resumeAt ?? 0
      if (resume > 0) {
        try {
          this.audio.currentTime = resume
        } catch {
          // Some containers reject a seek before metadata; playback starts at 0.
        }
      }
      this.player.set((current) => ({
        ...current,
        track: resolvedTrack,
        duration: result.durationSeconds || resolvedTrack.durationSeconds,
        format: result.format,
        loading: false,
        loadingMessage: '',
      }))
      if (this.queue.items.length > 0) this.replaceCurrentTrack(resolvedTrack)
      try {
        await this.audio.play()
      } catch (error) {
        const name = error instanceof Error ? error.name : ''
        if (name === 'NotAllowedError') {
          this.player.set((current) => ({ ...current, needsGesture: true, playing: false }))
          return
        }
        throw error
      }
      this.persistSoon()
    } catch (error) {
      if (requestId !== this.requestId) return
      const message = formatError(error)
      if (format === 'raw' && options.forceWav !== true) {
        this.toast('warn', '直接播放失败，正在尝试宿主转码…')
        void this.playTrack(track, { ...options, forceWav: true })
        return
      }
      this.player.set((current) => ({
        ...current,
        loading: false,
        playing: false,
        error: message,
      }))
      this.toast('error', message)
    }
  }

  private replaceCurrentTrack(track: Track): void {
    const index = currentIndex(this.queue)
    if (index < 0) return
    const items = [...this.queue.items]
    items[index] = { ...track }
    this.queue = { ...this.queue, items }
    this.emitQueue()
  }

  async toggle(): Promise<void> {
    const state = this.player.getSnapshot()
    if (state.track === null) {
      if (this.queue.items.length > 0) {
        await this.playAt(Math.max(0, currentIndex(this.queue)))
      } else {
        this.toast('info', '先搜索一首歌，或打开收藏夹')
      }
      return
    }
    if (this.audio.src === '') {
      await this.playTrack(state.track, { keepQueue: true, resumeAt: this.restorePosition })
      return
    }
    if (this.audio.paused) {
      try {
        await this.audio.play()
      } catch (error) {
        if (error instanceof Error && error.name === 'NotAllowedError') {
          this.player.set((current) => ({ ...current, needsGesture: true }))
        } else {
          this.toast('error', formatError(error))
        }
      }
    } else {
      this.audio.pause()
    }
  }

  restoreSound(): void {
    void this.audio.play().catch((error: unknown) => {
      this.toast('error', formatError(error))
    })
  }

  seek(position: number): void {
    const duration = this.player.getSnapshot().duration
    const target = clamp(position, 0, duration > 0 ? duration : position)
    if (this.audio.src === '') {
      this.restorePosition = target
      this.player.set((state) => ({ ...state, position: target }))
      return
    }
    try {
      this.audio.currentTime = target
      this.player.set((state) => ({ ...state, position: target }))
    } catch {
      // Ignore seeks before metadata is available.
    }
  }

  setVolume(value: number): void {
    const volume = clamp(value, 0, 1)
    this.audio.volume = volume
    this.audio.muted = volume === 0 ? true : false
    this.settings = { ...this.settings, volume }
    this.player.set((state) => ({ ...state, volume, muted: this.audio.muted }))
    this.scheduleSetting('volume', volume)
    this.persistSoon()
  }

  toggleMute(): void {
    this.audio.muted = !this.audio.muted
    this.player.set((state) => ({ ...state, muted: this.audio.muted }))
  }

  setRate(value: number): void {
    this.audio.playbackRate = value
    this.settings = { ...this.settings, playbackRate: value }
    this.player.set((state) => ({ ...state, rate: value }))
    this.scheduleSetting('playbackRate', value)
    this.persistSoon()
  }

  async setMode(mode: PlayMode): Promise<void> {
    this.queue = setMode(this.queue, mode)
    this.settings = { ...this.settings, defaultPlayMode: mode }
    this.emitQueue()
    this.toast('info', `播放模式：${modeLabel(mode)}`)
    this.scheduleSetting('defaultPlayMode', mode)
    this.persistSoon()
  }

  async next(auto = false): Promise<void> {
    const decision = advance(this.queue, 1, { auto })
    this.queue = decision.state
    this.emitQueue()
    if (decision.kind === 'stop') {
      this.audio.pause()
      this.player.set((state) => ({ ...state, playing: false }))
      return
    }
    if (decision.kind === 'replay') {
      this.audio.currentTime = 0
      await this.audio.play().catch((error: unknown) => { this.toast('error', formatError(error)) })
      return
    }
    const track = currentTrack(this.queue)
    if (track !== null) await this.playTrack(track, { keepQueue: true })
  }

  async previous(): Promise<void> {
    const decision = advance(this.queue, -1, { auto: false })
    this.queue = decision.state
    this.emitQueue()
    if (decision.kind === 'stop') {
      this.audio.pause()
      this.player.set((state) => ({ ...state, playing: false }))
      return
    }
    if (decision.kind === 'replay') {
      this.audio.currentTime = 0
      await this.audio.play().catch((error: unknown) => { this.toast('error', formatError(error)) })
      return
    }
    const track = currentTrack(this.queue)
    if (track !== null) await this.playTrack(track, { keepQueue: true })
  }

  async playAt(index: number): Promise<void> {
    const track = this.queue.items[index]
    if (track === undefined) return
    const position = this.queue.order.indexOf(index)
    if (position >= 0) this.queue = { ...this.queue, position }
    this.emitQueue()
    await this.playTrack(track, { keepQueue: true })
  }

  enqueue(track: Track): void {
    this.queue = enqueue(this.queue, track)
    this.emitQueue()
    this.persistSoon()
    this.toast('success', `已加入队列：${track.title}`)
  }

  removeQueueAt(index: number): void {
    const wasCurrent = currentIndex(this.queue) === index
    this.queue = removeAt(this.queue, index)
    this.emitQueue()
    this.persistSoon()
    if (wasCurrent) {
      this.audio.pause()
      const track = currentTrack(this.queue)
      if (track === null) {
        this.player.set((state) => ({ ...state, track: null, playing: false, position: 0, duration: 0 }))
      }
    }
  }

  moveInQueue(from: number, to: number): void {
    this.queue = move(this.queue, from, to)
    this.emitQueue()
    this.persistSoon()
  }

  clearQueue(): void {
    this.queue = clear(this.queue)
    this.emitQueue()
    this.audio.pause()
    this.player.set((state) => ({
      ...state,
      track: null,
      playing: false,
      position: 0,
      duration: 0,
      format: null,
    }))
    this.persistSoon()
  }

  /* ---------------------------------------------------------------- search */

  async search(keyword: string, page = 1): Promise<void> {
    const trimmed = keyword.trim()
    if (trimmed === '') return
    this.library.set((state) => ({
      ...state,
      search: {
        keyword: trimmed,
        page,
        numPages: state.search?.numPages ?? 1,
        items: page === 1 ? [] : state.search?.items ?? [],
        loading: true,
        error: null,
        at: Date.now(),
      },
    }))
    try {
      const result = await api.search(trimmed, page)
      this.library.set((state) => ({
        ...state,
        search: {
          keyword: result.keyword,
          page: result.page,
          numPages: result.numPages,
          // Keep the raw Bilibili cover URL: the host origin can change across
          // desktop restarts, and proxying belongs at render time.
          items: result.items.map((item) => ({ ...item })),
          loading: false,
          error: null,
          at: Date.now(),
        },
      }))
    } catch (error) {
      const message = formatError(error)
      this.library.set((state) => ({
        ...state,
        search: state.search === null
          ? null
          : { ...state.search, loading: false, error: message },
      }))
      this.toast('error', `搜索失败：${message}`)
    }
  }

  playSearchAt(index: number): void {
    const search = this.library.getSnapshot().search
    if (search === null) return
    const track = search.items[index]
    if (track === undefined) return
    const queue = search.items.map((item) => ({ ...item }))
    void this.playTrack(track, { queue, index })
  }

  playSearchAll(): void {
    const search = this.library.getSnapshot().search
    if (search === null || search.items.length === 0) return
    void this.playTrack(search.items[0] as Track, { queue: search.items, index: 0 })
  }

  /* ------------------------------------------------------------- favorites */

  async refreshFavorites(): Promise<void> {
    this.library.set((state) => ({
      ...state,
      favorites: { ...state.favorites, loading: true, error: null },
    }))
    try {
      const result = await api.favorites()
      this.library.set((state) => ({
        ...state,
        favorites: {
          ...state.favorites,
          loading: false,
          loaded: true,
          error: null,
          folders: result.items,
        },
      }))
    } catch (error) {
      const message = formatError(error)
      this.library.set((state) => ({
        ...state,
        favorites: { ...state.favorites, loading: false, loaded: true, error: message },
      }))
      this.toast('error', `读取收藏夹失败：${message}`)
    }
  }

  async openFolder(mediaId: number, title = '', keyword = ''): Promise<void> {
    this.library.set((state) => ({
      ...state,
      favorites: {
        ...state.favorites,
        open: {
          mediaId,
          title,
          total: 0,
          page: 0,
          hasMore: false,
          items: [],
          loading: true,
          loadingMore: false,
          error: null,
          keyword,
          selected: [],
        },
      },
    }))
    await this.loadFolderPage(mediaId, 1, keyword, true)
  }

  private async loadFolderPage(mediaId: number, page: number, keyword: string, replace: boolean): Promise<void> {
    try {
      const result = await api.favoriteContents(mediaId, page, keyword)
      this.library.set((state) => {
        const open = state.favorites.open
        if (open === null || open.mediaId !== mediaId) return state
        const items = replace ? result.items : [...open.items, ...result.items]
        return {
          ...state,
          favorites: {
            ...state.favorites,
            open: {
              ...open,
              title: result.title || open.title,
              total: result.total,
              page: result.page,
              hasMore: result.hasMore,
              items: items.map((item) => ({ ...item })),
              loading: false,
              loadingMore: false,
              error: null,
            },
          },
        }
      })
    } catch (error) {
      const message = formatError(error)
      this.library.set((state) => {
        const open = state.favorites.open
        if (open === null || open.mediaId !== mediaId) return state
        return {
          ...state,
          favorites: {
            ...state.favorites,
            open: { ...open, loading: false, loadingMore: false, error: message },
          },
        }
      })
      this.toast('error', `读取收藏夹内容失败：${message}`)
    }
  }

  async loadMoreFavorites(): Promise<void> {
    const open = this.library.getSnapshot().favorites.open
    if (open === null || !open.hasMore || open.loading || open.loadingMore) return
    this.library.set((state) => ({
      ...state,
      favorites: {
        ...state.favorites,
        open: state.favorites.open === null
          ? null
          : { ...state.favorites.open, loadingMore: true },
      },
    }))
    await this.loadFolderPage(open.mediaId, open.page + 1, open.keyword, false)
  }

  async searchInFolder(keyword: string): Promise<void> {
    const open = this.library.getSnapshot().favorites.open
    if (open === null) return
    this.library.set((state) => ({
      ...state,
      favorites: {
        ...state.favorites,
        open: state.favorites.open === null
          ? null
          : { ...state.favorites.open, keyword, items: [], loading: true, page: 0, hasMore: false },
      },
    }))
    await this.loadFolderPage(open.mediaId, 1, keyword, true)
  }

  playFolderAt(index: number): void {
    const open = this.library.getSnapshot().favorites.open
    if (open === null) return
    const track = open.items[index]
    if (track === undefined) return
    void this.playTrack(track, { queue: open.items, index })
  }

  async createFolder(title: string, privacy: 0 | 1): Promise<boolean> {
    try {
      await api.createFolder(title, privacy)
      this.toast('success', `已创建收藏夹「${title}」`)
      await this.refreshFavorites()
      return true
    } catch (error) {
      this.toast('error', `创建收藏夹失败：${formatError(error)}`)
      return false
    }
  }

  async deleteFolder(mediaId: number, title: string): Promise<void> {
    this.library.set((state) => ({
      ...state,
      favorites: { ...state.favorites, busy: true },
    }))
    try {
      await api.deleteFolder(mediaId)
      this.toast('success', `已删除收藏夹「${title}」`)
      const open = this.library.getSnapshot().favorites.open
      this.library.set((state) => ({
        ...state,
        favorites: {
          ...state.favorites,
          busy: false,
          ...(open?.mediaId === mediaId ? { open: null } : {}),
        },
      }))
      await this.refreshFavorites()
    } catch (error) {
      this.library.set((state) => ({
        ...state,
        favorites: { ...state.favorites, busy: false },
      }))
      this.toast('error', `删除收藏夹失败：${formatError(error)}`)
    }
  }

  toggleSelected(bvid: string): void {
    this.library.set((state) => {
      const open = state.favorites.open
      if (open === null) return state
      const selected = open.selected.includes(bvid)
        ? open.selected.filter((item) => item !== bvid)
        : [...open.selected, bvid]
      return {
        ...state,
        favorites: { ...state.favorites, open: { ...open, selected } },
      }
    })
  }

  selectAllVisible(): void {
    this.library.set((state) => {
      const open = state.favorites.open
      if (open === null) return state
      const all = open.items.map((item) => item.bvid)
      const selected = open.selected.length === all.length ? [] : all
      return {
        ...state,
        favorites: { ...state.favorites, open: { ...open, selected } },
      }
    })
  }

  async removeSelected(): Promise<void> {
    const open = this.library.getSnapshot().favorites.open
    if (open === null || open.selected.length === 0) return
    this.library.set((state) => ({
      ...state,
      favorites: { ...state.favorites, busy: true },
    }))
    try {
      await api.removeResources(open.mediaId, open.selected)
      this.toast('success', `已移出 ${open.selected.length} 个视频`)
      await this.openFolder(open.mediaId, open.title, open.keyword)
      await this.refreshFavorites()
    } catch (error) {
      this.toast('error', `移出失败：${formatError(error)}`)
    } finally {
      this.library.set((state) => ({
        ...state,
        favorites: { ...state.favorites, busy: false },
      }))
    }
  }

  async membership(bvid: string): Promise<FavoriteMembership[]> {
    const result = await api.membership(bvid)
    return result.folders
  }

  async dealFavorite(bvid: string, addIds: string[], delIds: string[]): Promise<boolean> {
    try {
      await api.dealFavorite(bvid, addIds, delIds)
      this.toast('success', addIds.length > 0 ? '已加入收藏夹' : '已移出收藏夹')
      await this.refreshFavorites()
      return true
    } catch (error) {
      this.toast('error', `收藏夹操作失败：${formatError(error)}`)
      return false
    }
  }

  /* ------------------------------------------------------------------ auth */

  async startQr(): Promise<void> {
    this.clearQrTimer()
    this.library.set((state) => ({
      ...state,
      qr: {
        id: '',
        dataUrl: '',
        status: 'waiting',
        message: '正在获取二维码…',
        active: true,
        startedAt: Date.now(),
      },
    }))
    try {
      const started = await api.authStart()
      this.library.set((state) => ({
        ...state,
        qr: {
          id: started.id,
          dataUrl: started.dataUrl,
          status: 'waiting',
          message: '请用手机 B 站 App 扫描二维码',
          active: true,
          startedAt: Date.now(),
        },
      }))
      this.pollQr(started.id)
    } catch (error) {
      this.library.set((state) => ({
        ...state,
        qr: state.qr === null
          ? null
          : { ...state.qr, status: 'error', message: formatError(error), active: false },
      }))
      this.toast('error', `获取二维码失败：${formatError(error)}`)
    }
  }

  private pollQr(id: string): void {
    this.clearQrTimer()
    this.qrTimer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await api.authPoll(id)
          this.library.set((state) => ({
            ...state,
            qr: state.qr === null
              ? null
              : { ...state.qr, status: result.status, message: result.message },
            account: {
              loggedIn: result.loggedIn,
              user: result.user,
              loading: false,
            },
          }))
          if (result.status === 'success') {
            this.clearQrTimer()
            this.library.set((state) => ({
              ...state,
              qr: state.qr === null ? null : { ...state.qr, active: false },
            }))
            this.toast('success', `登录成功${result.user === null ? '' : `：${result.user.name}`}`)
            this.library.set((state) => ({
              ...state,
              favorites: { ...state.favorites, loaded: false },
            }))
            void this.refreshFavorites()
            return
          }
          if (result.status === 'expired' || result.status === 'cancelled' || result.status === 'error') {
            this.clearQrTimer()
            this.library.set((state) => ({
              ...state,
              qr: state.qr === null ? null : { ...state.qr, active: false },
            }))
            return
          }
          this.pollQr(id)
        } catch (error) {
          this.library.set((state) => ({
            ...state,
            qr: state.qr === null
              ? null
              : { ...state.qr, status: 'error', message: formatError(error), active: false },
          }))
        }
      })()
    }, 2000)
  }

  cancelQr(): void {
    this.clearQrTimer()
    this.library.set((state) => ({
      ...state,
      qr: state.qr === null
        ? null
        : { ...state.qr, active: false, status: 'cancelled', message: '已取消登录' },
    }))
  }

  async logout(): Promise<void> {
    this.clearQrTimer()
    try {
      await api.logout()
      this.library.set((state) => ({
        ...state,
        account: { loggedIn: false, user: null, loading: false },
        qr: null,
        favorites: {
          loading: false,
          error: null,
          loaded: false,
          folders: [],
          open: null,
          busy: false,
        },
      }))
      this.toast('info', '已退出登录')
    } catch (error) {
      this.toast('error', `退出登录失败：${formatError(error)}`)
    }
  }

  private clearQrTimer(): void {
    if (this.qrTimer !== null) {
      window.clearTimeout(this.qrTimer)
      this.qrTimer = null
    }
  }

  /* -------------------------------------------------------------- settings */

  async updateSetting(key: keyof Settings, value: unknown): Promise<void> {
    this.settings = { ...this.settings, [key]: value } as Settings
    this.library.set((state) => ({ ...state, settings: this.settings }))
    if (key === 'volume') {
      const volume = clamp(Number(value), 0, 1)
      this.audio.volume = volume
      this.player.set((state) => ({ ...state, volume }))
    }
    if (key === 'playbackRate') {
      const rate = Number(value)
      this.audio.playbackRate = rate
      this.player.set((state) => ({ ...state, rate }))
    }
    try {
      const result = await api.updateSetting(key, value)
      this.settings = { ...DEFAULT_SETTINGS, ...result.settings }
      this.library.set((state) => ({
        ...state,
        settings: this.settings,
        cache: result.cache,
        settingsLoading: false,
      }))
    } catch (error) {
      this.toast('error', `保存设置失败：${formatError(error)}`)
    }
  }

  private scheduleSetting(key: keyof Settings, value: unknown): void {
    const previous = this.settingsTimers.get(key)
    if (previous !== undefined) window.clearTimeout(previous)
    const timer = window.setTimeout(() => {
      this.settingsTimers.delete(key)
      void api.updateSetting(key, value).then((result) => {
        this.library.set((state) => ({ ...state, cache: result.cache }))
      }).catch(() => undefined)
    }, 600)
    this.settingsTimers.set(key, timer)
  }

  async refreshCache(): Promise<void> {
    try {
      const cache = await api.cache()
      this.library.set((state) => ({ ...state, cache }))
    } catch (error) {
      this.toast('error', `读取缓存失败：${formatError(error)}`)
    }
  }

  async clearCache(): Promise<void> {
    try {
      const cache = await api.clearCache()
      this.library.set((state) => ({ ...state, cache }))
      this.toast('success', `已清理缓存，释放 ${formatBytes(cache.bytes)}`)
    } catch (error) {
      this.toast('error', `清理缓存失败：${formatError(error)}`)
    }
  }

  /* -------------------------------------------------------------------- ui */

  setTab(tab: Tab): void {
    this.ui.set((state) => ({ ...state, tab }))
    this.persistSoon()
  }

  toast(level: 'info' | 'warn' | 'error' | 'success', message: string): void {
    const id = Date.now() + Math.random()
    this.ui.set((state) => ({ ...state, toast: { id, level, message } }))
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => {
      this.ui.set((state) => (state.toast?.id === id ? { ...state, toast: null } : state))
      this.toastTimer = null
    }, 4200)
  }

  dismissToast(): void {
    this.ui.set((state) => ({ ...state, toast: null }))
  }

  image(url: string | undefined): string {
    return imageUrl(url)
  }

  qualityLabel(): string {
    return qualityLabel(this.settings.audioQuality)
  }

  /* --------------------------------------------------------------- persist */

  private emitQueue(): void {
    this.player.set((state) => ({
      ...state,
      queue: [...this.queue.items],
      queueIndex: currentIndex(this.queue),
      mode: this.queue.mode,
    }))
  }

  private persistThrottled(): void {
    const now = Date.now()
    if (now - this.lastPersistAt < 2000) return
    this.lastPersistAt = now
    this.persistSoon()
  }

  private persistSoon(): void {
    if (!this.started) return
    if (this.persistTimer !== null) return
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = null
      this.persist()
    }, 500)
  }

  private persist(): void {
    const state = this.player.getSnapshot()
    const timer = this.ui.getSnapshot()
    const data: Persisted = {
      queue: this.queue.items.slice(0, 500),
      queueIndex: currentIndex(this.queue),
      mode: this.queue.mode,
      track: state.track,
      position: Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : state.position,
      volume: state.volume,
      rate: state.rate,
      tab: timer.tab,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // Storage can be unavailable or full; playback continues.
    }
  }

  private restorePersisted(): void {
    let data: Persisted | null = null
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw !== null) data = JSON.parse(raw) as Persisted
    } catch {
      data = null
    }
    if (data === null) return
    const mode = data.mode ?? 'sequential'
    if (Array.isArray(data.queue) && data.queue.length > 0) {
      const queue = data.queue.filter((track) => track !== null && typeof track.bvid === 'string')
      const index = clamp(Math.trunc(data.queueIndex ?? 0), 0, Math.max(0, queue.length - 1))
      this.queue = adopt(queue, index, mode)
      this.emitQueue()
      const track = data.track ?? currentTrack(this.queue)
      if (track !== null) {
        this.restorePosition = Number.isFinite(data.position) ? data.position : 0
        this.player.set((state) => ({
          ...state,
          track,
          position: this.restorePosition,
          duration: track.durationSeconds,
          mode,
        }))
      }
    }
    const volume = Number.isFinite(data.volume) ? clamp(data.volume, 0, 1) : DEFAULT_SETTINGS.volume
    const rate = Number.isFinite(data.rate) ? data.rate : DEFAULT_SETTINGS.playbackRate
    this.hasRestoredSettings = Number.isFinite(data.volume) || Number.isFinite(data.rate)
    this.audio.volume = volume
    this.audio.playbackRate = rate
    this.player.set((state) => ({ ...state, volume, rate, mode }))
    if (data.tab !== undefined) this.ui.set((state) => ({ ...state, tab: data.tab }))
  }
}

function bufferedEnd(audio: HTMLAudioElement): number {
  const ranges = audio.buffered
  if (ranges.length === 0) return 0
  return ranges.end(ranges.length - 1)
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

export { DEFAULT_SETTINGS, formatBytes }
