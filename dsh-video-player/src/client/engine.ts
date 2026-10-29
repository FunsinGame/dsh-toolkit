/**
 * The player engine.
 *
 * Two panes live here, each owning its own `<video>` and frame table. The engine
 * keeps a single shared timeline: a position `t` maps every loaded pane to
 * `start + t`, so two videos with different in-points play and step together.
 * A pane's start is snapped to one of its own frame boundaries; frame stepping
 * advances the shared timeline by one frame of the master pane (the first loaded
 * pane, left preferred), and every other pane follows that time. With equal
 * frame rates this is exactly one frame per pane per step; with mixed rates the
 * master's cadence wins and each pane shows the frame covering that time.
 *
 * Frame-exact seeking itself is unchanged from the single-player version: the
 * MP4 sample table gives every frame's start and duration, and a step seeks to
 * the middle of the target frame rather than to an arbitrary `currentTime`.
 */

import {
  buildEstimatedFrameTable,
  codecLabel,
  frameIndexAt,
  parseMp4FrameTable,
  type FrameTable,
} from './mp4'

export type PaneId = 'left' | 'right'
export type Layout = 'single' | 'dual'
export type PlayerStatus = 'empty' | 'loading' | 'ready' | 'error'
export type FrameSource = 'mp4' | 'estimated' | 'none'

export interface PaneSnapshot {
  readonly id: PaneId
  readonly status: PlayerStatus
  readonly fileName: string
  readonly fileSize: number
  readonly error: string | null
  readonly duration: number
  readonly currentTime: number
  readonly frameIndex: number
  readonly frameCount: number
  readonly fps: number
  readonly width: number
  readonly height: number
  readonly codec: string
  readonly frameSource: FrameSource
  readonly start: number
  readonly loaded: boolean
}

export interface PlayerSnapshot {
  readonly layout: Layout
  readonly left: PaneSnapshot
  readonly right: PaneSnapshot
  readonly master: PaneId | null
  readonly timelinePosition: number
  readonly timelineDuration: number
  readonly playing: boolean
  readonly reverse: boolean
  readonly muted: boolean
  readonly volume: number
  readonly rate: number
  readonly notice: string | null
}

interface Preferences {
  muted: boolean
  volume: number
  rate: number
}

interface PaneCallbacks {
  onChange: () => void
  onEnded: () => void
  onError: () => void
}

const PREFS_KEY = 'dsh-video-player:prefs'
const HOLD_DELAY_MS = 300
const HOLD_INTERVAL_MS = 72
const DEFAULT_FPS = 30
const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]
/** A microsecond of slack for frame-boundary comparisons with float sums. */
const TIME_EPSILON = 0.000_001

/** Playback rates offered by the transport menu. */
export const PLAYBACK_RATES: readonly number[] = RATES

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function readPreferences(): Preferences {
  const fallback: Preferences = { muted: false, volume: 1, rate: 1 }
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (raw === null) return fallback
    const parsed = JSON.parse(raw) as Partial<Preferences>
    return {
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : fallback.muted,
      volume: typeof parsed.volume === 'number' ? clamp(parsed.volume, 0, 1) : fallback.volume,
      rate: typeof parsed.rate === 'number' && RATES.includes(parsed.rate) ? parsed.rate : fallback.rate,
    }
  } catch {
    return fallback
  }
}

function savePreferences(preferences: Preferences): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(preferences))
  } catch {
    // Private browsing or a locked-down renderer: preference loss is harmless.
  }
}

/** Human-readable reason for a `<video>` error. */
function videoErrorMessage(error: MediaError | null): string {
  switch (error?.code) {
    case 1:
      return '视频加载被中止'
    case 2:
      return '读取视频时发生错误，请重新选择文件'
    case 3:
      return '视频解码失败：编码可能不受支持'
    case 4:
      return '浏览器无法播放该视频：请使用 H.264/AAC 编码的 MP4 文件'
    default:
      return '无法读取该视频'
  }
}

/** Is the dropped/selected file plausibly a video? */
export function looksLikeVideo(file: File): boolean {
  if (file.type.startsWith('video/')) return true
  return /\.(mp4|m4v|mov|webm|ogv|ogg|mkv)$/i.test(file.name)
}

/** A formatted frame rate: integers stay whole, fractional rates keep 3 digits. */
export function formatFps(fps: number): string {
  if (!Number.isFinite(fps) || fps <= 0) return '—'
  return Number.isInteger(fps) ? String(fps) : fps.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

/** Load the frame table for a selected file, falling back to a nominal rate. */
async function loadFrameTable(file: File, duration: number, fallbackFps: number): Promise<FrameTable> {
  let parsed: FrameTable | null = null
  try {
    parsed = await parseMp4FrameTable(file)
  } catch {
    parsed = null
  }
  if (parsed !== null && parsed.totalFrames > 0) return parsed
  return buildEstimatedFrameTable(duration, fallbackFps)
}

/**
 * One video pane. It owns a `<video>`, the MP4 frame table and a start offset;
 * transport loops live in `PlayerEngine` because they need both panes.
 */
export class Pane {
  readonly id: PaneId
  readonly video: HTMLVideoElement

  status: PlayerStatus = 'empty'
  fileName = ''
  fileSize = 0
  error: string | null = null
  duration = 0
  width = 0
  height = 0
  codec = ''
  frameSource: FrameSource = 'none'
  start = 0
  frames: FrameTable | null = null

  private readonly callbacks: PaneCallbacks
  private objectUrl: string | null = null
  private loadToken = 0
  private seekGeneration = 0
  private disposed = false

  constructor(id: PaneId, callbacks: PaneCallbacks, preferences: Preferences) {
    this.id = id
    this.callbacks = callbacks
    const video = document.createElement('video')
    video.className = 'dvp-video'
    video.playsInline = true
    video.preload = 'auto'
    video.controls = false
    video.disablePictureInPicture = true
    video.muted = preferences.muted
    video.volume = preferences.volume
    video.playbackRate = preferences.rate
    this.video = video
    this.bindEvents()
  }

  get loaded(): boolean {
    return this.status === 'ready'
  }

  get currentTime(): number {
    return this.video.currentTime
  }

  get fps(): number {
    return this.frames?.fps ?? 0
  }

  attach(container: HTMLElement): void {
    if (this.video.parentElement !== container) container.append(this.video)
  }

  detach(): void {
    this.seekGeneration += 1
    if (!this.video.paused) this.video.pause()
    this.video.remove()
  }

  dispose(): void {
    this.disposed = true
    this.loadToken += 1
    this.seekGeneration += 1
    this.video.removeEventListener('loadedmetadata', this.onLoadedMetadata)
    this.video.removeEventListener('durationchange', this.onDurationChange)
    this.video.removeEventListener('timeupdate', this.onTimeUpdate)
    this.video.removeEventListener('play', this.onPlay)
    this.video.removeEventListener('pause', this.onPause)
    this.video.removeEventListener('ended', this.onEnded)
    this.video.removeEventListener('volumechange', this.onVolumeChange)
    this.video.removeEventListener('error', this.onError)
    this.revokeObjectUrl()
    this.video.pause()
    this.video.removeAttribute('src')
    this.video.load()
    this.video.remove()
  }

  async openFile(file: File, fallbackFps = DEFAULT_FPS): Promise<boolean> {
    if (this.disposed) return false
    if (!looksLikeVideo(file)) {
      this.status = 'error'
      this.error = '请选择视频文件（推荐 MP4 / H.264）'
      this.callbacks.onChange()
      return false
    }
    if (file.size === 0) {
      this.status = 'error'
      this.error = '这个文件是空的'
      this.callbacks.onChange()
      return false
    }
    const token = ++this.loadToken
    this.seekGeneration += 1
    this.revokeObjectUrl()
    this.frames = null
    this.start = 0
    this.status = 'loading'
    this.fileName = file.name
    this.fileSize = file.size
    this.error = null
    this.duration = 0
    this.width = 0
    this.height = 0
    this.codec = ''
    this.frameSource = 'none'
    this.objectUrl = URL.createObjectURL(file)
    this.video.pause()
    this.video.removeAttribute('src')
    this.video.load()
    this.callbacks.onChange()

    const metadata = this.waitForMetadata()
    this.video.src = this.objectUrl
    this.video.load()

    try {
      await metadata
    } catch (error) {
      if (token !== this.loadToken) return false
      this.status = 'error'
      this.error = error instanceof Error ? error.message : '无法读取该视频'
      this.callbacks.onChange()
      return false
    }
    if (token !== this.loadToken || this.disposed) return false

    const duration = Number.isFinite(this.video.duration) && this.video.duration > 0
      ? this.video.duration
      : 0
    const table = await loadFrameTable(file, duration, fallbackFps)
    if (token !== this.loadToken || this.disposed) return false

    this.frames = table
    this.duration = duration
    this.status = 'ready'
    this.width = this.video.videoWidth || table.width
    this.height = this.video.videoHeight || table.height
    this.codec = codecLabel(table.codec)
    this.frameSource = table.kind
    this.start = 0
    this.callbacks.onChange()
    return true
  }

  close(): void {
    this.loadToken += 1
    this.seekGeneration += 1
    this.revokeObjectUrl()
    this.video.pause()
    this.video.removeAttribute('src')
    this.video.load()
    this.frames = null
    this.status = 'empty'
    this.fileName = ''
    this.fileSize = 0
    this.error = null
    this.duration = 0
    this.width = 0
    this.height = 0
    this.codec = ''
    this.frameSource = 'none'
    this.start = 0
    this.callbacks.onChange()
  }

  snapshot(): PaneSnapshot {
    const currentTime = this.status === 'ready' ? this.video.currentTime : 0
    const frameIndex = this.frames === null
      ? 0
      : frameIndexAt(this.frames.times, currentTime)
    return {
      id: this.id,
      status: this.status,
      fileName: this.fileName,
      fileSize: this.fileSize,
      error: this.error,
      duration: this.duration,
      currentTime,
      frameIndex,
      frameCount: this.frames?.totalFrames ?? 0,
      fps: this.frames?.fps ?? 0,
      width: this.width,
      height: this.height,
      codec: this.codec,
      frameSource: this.frameSource,
      start: this.start,
      loaded: this.status === 'ready',
    }
  }

  frameIndexAt(time: number): number {
    if (this.frames === null) return 0
    return frameIndexAt(
      this.frames.times,
      clamp(time + TIME_EPSILON, 0, Math.max(0, this.duration)),
    )
  }

  frameStart(index: number): number {
    if (this.frames === null) return 0
    return this.frames.times[clamp(Math.round(index), 0, this.frames.totalFrames - 1)] ?? 0
  }

  frameDuration(index: number): number {
    if (this.frames === null) return 1 / Math.max(1, this.fps)
    return this.frames.durations[clamp(Math.round(index), 0, this.frames.totalFrames - 1)] ?? 1 / Math.max(1, this.fps)
  }

  frameMidpoint(index: number): number {
    if (this.frames === null) return this.video.currentTime
    const safe = clamp(Math.round(index), 0, this.frames.totalFrames - 1)
    const start = this.frames.times[safe] ?? 0
    const declared = this.frames.durations[safe] ?? 1 / Math.max(1, this.fps)
    const next = safe + 1 < this.frames.times.length
      ? this.frames.times[safe + 1] ?? start + declared
      : start + declared
    const span = Math.max(0.000_5, next - start)
    const midpoint = start + span / 2
    const limit = Math.max(0, this.duration - 0.000_5)
    return clamp(midpoint, 0, limit > 0 ? limit : midpoint)
  }

  /** Snap a requested in-point to the start of the frame that covers it. */
  snapStart(seconds: number): number {
    if (this.frames === null) return clamp(seconds, 0, Math.max(0, this.duration - 0.001))
    const index = this.frameIndexAt(seconds)
    return clamp(this.frameStart(index), 0, Math.max(0, this.duration - 0.001))
  }

  setStart(seconds: number): void {
    this.start = clamp(seconds, 0, Math.max(0, this.duration - 0.001))
  }

  async seekToFrame(index: number): Promise<void> {
    if (this.frames === null || this.status !== 'ready') return
    const safe = clamp(Math.round(index), 0, this.frames.totalFrames - 1)
    const target = this.frameMidpoint(safe)
    const generation = ++this.seekGeneration

    const finish = (): void => {
      if (generation !== this.seekGeneration || this.disposed) return
      this.callbacks.onChange()
    }

    if (Math.abs(this.video.currentTime - target) <= 0.000_5) {
      return this.afterPaint().then(finish)
    }
    this.video.currentTime = target
    await this.waitForSeek(generation)
    if (generation !== this.seekGeneration || this.disposed) return
    await this.afterPaint()
    finish()
  }

  async seekToTime(seconds: number): Promise<void> {
    if (this.status !== 'ready') return
    if (this.frames === null) {
      const target = clamp(seconds, 0, Math.max(0, this.duration - 0.000_5))
      const generation = ++this.seekGeneration
      this.video.currentTime = target
      await this.waitForSeek(generation)
      if (generation === this.seekGeneration && !this.disposed) this.callbacks.onChange()
      return
    }
    await this.seekToFrame(this.frameIndexAt(seconds))
  }

  setEstimatedFps(fps: number): boolean {
    if (this.frameSource !== 'estimated' || !(this.duration > 0)) return false
    this.frames = buildEstimatedFrameTable(this.duration, fps)
    this.frameSource = 'estimated'
    this.start = clamp(this.start, 0, Math.max(0, this.duration - 0.001))
    this.callbacks.onChange()
    return true
  }

  async play(): Promise<void> {
    if (this.status !== 'ready') return
    await this.video.play()
  }

  pause(): void {
    if (!this.video.paused) this.video.pause()
  }

  setRate(rate: number): void {
    this.video.playbackRate = rate
  }

  setMuted(muted: boolean): void {
    this.video.muted = muted
  }

  setVolume(volume: number): void {
    this.video.volume = clamp(volume, 0, 1)
  }

  private bindEvents(): void {
    this.video.addEventListener('loadedmetadata', this.onLoadedMetadata)
    this.video.addEventListener('durationchange', this.onDurationChange)
    this.video.addEventListener('timeupdate', this.onTimeUpdate)
    this.video.addEventListener('play', this.onPlay)
    this.video.addEventListener('pause', this.onPause)
    this.video.addEventListener('ended', this.onEnded)
    this.video.addEventListener('volumechange', this.onVolumeChange)
    this.video.addEventListener('error', this.onError)
  }

  private onLoadedMetadata = (): void => {
    if (this.status !== 'loading' && this.status !== 'ready') return
    this.duration = Number.isFinite(this.video.duration) && this.video.duration > 0
      ? this.video.duration
      : this.duration
    this.width = this.video.videoWidth || this.width
    this.height = this.video.videoHeight || this.height
    this.callbacks.onChange()
  }

  private onDurationChange = (): void => {
    if (!Number.isFinite(this.video.duration) || this.video.duration <= 0) return
    if (Math.abs(this.video.duration - this.duration) < 0.001) return
    this.duration = this.video.duration
    this.start = clamp(this.start, 0, Math.max(0, this.duration - 0.001))
    this.callbacks.onChange()
  }

  private onTimeUpdate = (): void => {
    if (this.status !== 'ready') return
    this.callbacks.onChange()
  }

  private onPlay = (): void => {
    this.callbacks.onChange()
  }

  private onPause = (): void => {
    this.callbacks.onChange()
  }

  private onEnded = (): void => {
    this.callbacks.onEnded()
    this.callbacks.onChange()
  }

  private onVolumeChange = (): void => {
    this.callbacks.onChange()
  }

  private onError = (): void => {
    if (this.video.getAttribute('src') === null) return
    if (this.status === 'empty') return
    this.status = 'error'
    this.error = videoErrorMessage(this.video.error)
    this.callbacks.onError()
    this.callbacks.onChange()
  }

  private waitForMetadata(): Promise<void> {
    if (this.video.readyState >= 1) return Promise.resolve()
    return new Promise((resolve, reject) => {
      let settled = false
      const cleanup = (): void => {
        this.video.removeEventListener('loadedmetadata', onLoaded)
        this.video.removeEventListener('error', onError)
        window.clearTimeout(timer)
      }
      const onLoaded = (): void => {
        if (settled) return
        settled = true
        cleanup()
        resolve()
      }
      const onError = (): void => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error(videoErrorMessage(this.video.error)))
      }
      const timer = window.setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error('读取视频超时：文件可能不是有效的视频，或编码不受支持'))
      }, 20_000)
      this.video.addEventListener('loadedmetadata', onLoaded)
      this.video.addEventListener('error', onError)
    })
  }

  private waitForSeek(generation: number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        this.video.removeEventListener('seeked', onSeeked)
        this.video.removeEventListener('error', finish)
        window.clearTimeout(timer)
        resolve()
      }
      const onSeeked = (): void => {
        if (generation !== this.seekGeneration) {
          finish()
          return
        }
        finish()
      }
      const timer = window.setTimeout(finish, 1200)
      this.video.addEventListener('seeked', onSeeked)
      this.video.addEventListener('error', finish)
    })
  }

  private afterPaint(): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve()
      }
      const timer = window.setTimeout(finish, 120)
      if (typeof this.video.requestVideoFrameCallback === 'function') {
        const handle = this.video.requestVideoFrameCallback(() => finish())
        window.setTimeout(() => {
          if (settled && typeof this.video.cancelVideoFrameCallback === 'function') {
            this.video.cancelVideoFrameCallback(handle)
          }
        }, 140)
      } else {
        window.requestAnimationFrame(() => window.requestAnimationFrame(finish))
      }
    })
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl === null) return
    URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = null
  }
}

/**
 * The two-pane player. Transport is global; each pane contributes a video, a
 * frame table and a start offset.
 */
export class PlayerEngine {
  readonly left: Pane
  readonly right: Pane

  private snapshotValue: PlayerSnapshot
  private readonly listeners = new Set<() => void>()
  private layout: Layout = 'single'
  private timelineValue = 0
  private playing = false
  private reverse = false
  private reverseToken = 0
  private queuedSteps = 0
  private stepping = false
  private stepPromise: Promise<void> = Promise.resolve()
  private holdDirection: -1 | 0 | 1 = 0
  private holdStride = 1
  private holdPane: PaneId | null = null
  private holdTimer: number | null = null
  private scrubWasPlaying = false
  private scrubWasReverse = false
  private noticeTimer: number | null = null
  private syncRaf = 0
  private disposed = false
  private readonly preferences: Preferences

  constructor() {
    this.preferences = readPreferences()
    const callbacks: PaneCallbacks = {
      onChange: () => this.handlePaneChange(),
      onEnded: () => this.handlePaneEnded(),
      onError: () => this.handlePaneError(),
    }
    this.left = new Pane('left', callbacks, this.preferences)
    this.right = new Pane('right', callbacks, this.preferences)
    this.snapshotValue = {
      layout: 'single',
      left: this.left.snapshot(),
      right: this.right.snapshot(),
      master: null,
      timelinePosition: 0,
      timelineDuration: 0,
      playing: false,
      reverse: false,
      muted: this.preferences.muted,
      volume: this.preferences.volume,
      rate: this.preferences.rate,
      notice: null,
    }
  }

  // -- React store interface ------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): PlayerSnapshot => this.snapshotValue

  // -- page lifecycle -------------------------------------------------------

  /** Pause everything and detach both video elements without notifying React. */
  detach(): void {
    this.endAllHolds()
    this.haltSilently()
    this.snapshotValue = {
      ...this.snapshotValue,
      playing: false,
      reverse: false,
    }
    this.left.detach()
    this.right.detach()
  }

  dispose(): void {
    this.disposed = true
    this.listeners.clear()
    this.haltSilently()
    this.endAllHolds()
    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer)
    this.noticeTimer = null
    this.left.dispose()
    this.right.dispose()
  }

  // -- layout / files -------------------------------------------------------

  setLayout(layout: Layout): void {
    if (this.layout === layout || this.disposed) return
    this.haltSilently()
    this.endAllHolds()
    this.layout = layout
    this.timelineValue = 0
    this.refresh()
    void this.seekTimeline(0)
  }

  async openPane(paneId: PaneId, file: File): Promise<void> {
    if (this.disposed) return
    if (!looksLikeVideo(file)) {
      this.notify('请选择视频文件（推荐 MP4 / H.264）')
      return
    }
    if (file.size === 0) {
      this.notify('这个文件是空的')
      return
    }
    if (this.layout === 'single' && paneId === 'right') {
      this.layout = 'dual'
      this.refresh()
    }
    this.haltSilently()
    this.endAllHolds()
    this.timelineValue = 0
    const pane = this.pane(paneId)
    const ok = await pane.openFile(file, DEFAULT_FPS)
    if (this.disposed) return
    if (ok && pane.frameSource === 'estimated') {
      this.notify(`${paneId === 'left' ? '左' : '右'}画面未能读取精确帧表，当前按 30fps 估算`)
    }
    this.timelineValue = 0
    await this.seekTimeline(0)
    if (this.disposed) return
    this.refresh()
    if (this.activeLoadedPanes().length > 0 && this.computeTimelineDuration() <= 0) {
      this.notify('同步区间为 0，请调整起始位置')
    }
  }

  closePane(paneId: PaneId): void {
    if (this.disposed) return
    this.haltSilently()
    this.endAllHolds()
    this.timelineValue = 0
    this.pane(paneId).close()
    this.timelineValue = clamp(this.timelineValue, 0, this.computeTimelineDuration())
    this.refresh()
    void this.seekTimeline(this.timelineValue)
  }

  async setPaneStart(paneId: PaneId, seconds: number): Promise<void> {
    const pane = this.pane(paneId)
    if (this.disposed || !pane.loaded) return
    this.haltSilently()
    this.endAllHolds()
    pane.setStart(pane.snapStart(seconds))
    this.timelineValue = 0
    await this.seekTimeline(0)
    if (this.disposed) return
    this.refresh()
    if (this.activeLoadedPanes().length > 0 && this.computeTimelineDuration() <= 0) {
      this.notify('同步区间为 0，请调整起始位置')
    }
  }

  /** Seek one pane individually (per-pane progress bar or selected-pane step). */
  previewPane(paneId: PaneId, seconds: number): void {
    const pane = this.pane(paneId)
    if (this.disposed || !pane.loaded) return
    if (this.playing || this.reverse) this.haltSilently()
    void pane.seekToTime(seconds)
  }

  /** Set a pane's start to the frame it is currently showing. */
  async setPaneStartAtCurrent(paneId: PaneId): Promise<void> {
    const pane = this.pane(paneId)
    if (this.disposed || !pane.loaded) return
    await this.setPaneStart(paneId, pane.currentTime)
  }

  /** Step a single pane without moving the shared timeline or the other pane. */
  async stepPane(paneId: PaneId, delta: number): Promise<void> {
    const pane = this.pane(paneId)
    if (this.disposed || !pane.loaded || pane.frames === null) return
    this.haltSilently()
    const current = pane.frameIndexAt(pane.currentTime)
    const target = clamp(current + delta, 0, pane.frames.totalFrames - 1)
    if (target === current) return
    await pane.seekToTime(pane.frameStart(target))
  }

  setEstimatedFps(paneId: PaneId, fps: number): void {
    const pane = this.pane(paneId)
    if (this.disposed || !pane.setEstimatedFps(fps)) return
    this.timelineValue = clamp(this.timelineValue, 0, this.computeTimelineDuration())
    this.refresh()
    void this.seekTimeline(this.timelineValue)
  }

  // -- transport ------------------------------------------------------------

  async togglePlay(): Promise<void> {
    if (this.playing) {
      this.pause()
      return
    }
    await this.play()
  }

  async play(): Promise<void> {
    const panes = this.activeLoadedPanes()
    if (this.disposed || panes.length === 0) return
    this.endAllHolds()
    this.haltSilently()
    const duration = this.computeTimelineDuration()
    if (!(duration > 0)) {
      this.notify('同步区间为 0，无法播放')
      return
    }
    if (this.timelineValue >= duration - 0.001) this.timelineValue = 0
    await this.seekTimeline(this.timelineValue)
    if (this.disposed) return
    for (const pane of panes) pane.setRate(this.snapshotValue.rate)
    this.playing = true
    this.reverse = false
    this.refresh()
    try {
      await Promise.all(panes.map((pane) => pane.play()))
    } catch (error) {
      this.haltSilently()
      this.refresh()
      this.notify(error instanceof Error ? `无法开始播放：${error.message}` : '无法开始播放')
      return
    }
    if (!this.playing || this.disposed) return
    this.startSyncLoop()
  }

  pause(): void {
    if (this.disposed) return
    this.haltSilently()
    const master = this.masterPane()
    this.timelineValue = master === null ? 0 : this.framePosition(master)
    this.refresh()
  }

  toggleReverse(): void {
    if (this.disposed) return
    if (this.reverse) {
      this.stopReverse()
      this.notify('已停止倒放')
      return
    }
    const panes = this.activeLoadedPanes()
    if (panes.length === 0) return
    this.haltSilently()
    this.endAllHolds()
    this.timelineValue = clamp(this.timelineValue, 0, this.computeTimelineDuration())
    this.reverse = true
    this.reverseToken += 1
    this.refresh()
    void this.runReverse()
  }

  /** The master pane's current frame start, expressed on the shared timeline. */
  private framePosition(pane: Pane): number {
    if (pane.frames === null) return 0
    const index = pane.frameIndexAt(pane.currentTime)
    return clamp(pane.frameStart(index) - pane.start, 0, this.computeTimelineDuration())
  }

  // -- frame stepping -------------------------------------------------------

  /** Step the shared timeline by frames of the master pane; both panes follow. */
  step(delta: number, fromHold = false): Promise<void> {
    const panes = this.activeLoadedPanes()
    const master = panes[0]
    if (this.disposed || master === undefined || master.frames === null) return Promise.resolve()
    this.haltSilently()
    if (!fromHold) this.endAllHolds()
    const duration = this.computeTimelineDuration()
    const base = clamp(this.timelineValue, 0, duration)
    const current = master.frameIndexAt(master.start + base)
    const target = clamp(current + delta, 0, master.frames.totalFrames - 1)
    if (target === current) return Promise.resolve()
    this.queuedSteps += target - current
    if (this.stepping) return this.stepPromise

    this.stepping = true
    this.stepPromise = (async () => {
      let position = base
      try {
        while (this.queuedSteps !== 0) {
          const direction = this.queuedSteps > 0 ? 1 : -1
          this.queuedSteps -= direction
          const active = this.activeLoadedPanes()
          const clock = active[0]
          if (clock === undefined || clock.frames === null) break
          const index = clock.frameIndexAt(clock.start + position)
          const next = clamp(index + direction, 0, clock.frames.totalFrames - 1)
          if (next === index) continue
          const nextPosition = clamp(
            clock.frameStart(next) - clock.start,
            0,
            this.computeTimelineDuration(),
          )
          await this.seekTimeline(nextPosition)
          if (this.disposed) return
          this.timelineValue = nextPosition
          position = nextPosition
          this.refresh()
        }
      } finally {
        this.stepping = false
        this.queuedSteps = 0
      }
    })()
    return this.stepPromise
  }

  beginHold(direction: -1 | 1, stride = 1, paneId: PaneId | null = null): void {
    if (this.disposed || this.activeLoadedPanes().length === 0) return
    const target = paneId !== null && this.pane(paneId).loaded ? paneId : null
    this.holdPane = target
    this.holdDirection = direction
    this.holdStride = stride
    this.clearHoldTimer()
    if (target !== null) void this.stepPane(target, direction * stride)
    else void this.step(direction * stride, true)
    this.holdTimer = window.setTimeout(() => this.holdTick(direction), HOLD_DELAY_MS)
  }

  endHold(direction: -1 | 1): void {
    if (this.holdDirection !== direction) return
    this.holdDirection = 0
    this.holdPane = null
    this.clearHoldTimer()
  }

  endAllHolds(): void {
    this.holdDirection = 0
    this.holdPane = null
    this.clearHoldTimer()
  }

  firstFrame(): void {
    this.jumpToFrame(0)
  }

  lastFrame(): void {
    const master = this.masterPane()
    this.jumpToFrame((master?.frames?.totalFrames ?? 1) - 1)
  }

  jumpToFrame(index: number): void {
    const master = this.masterPane()
    if (this.disposed || master === null || master.frames === null) return
    this.haltSilently()
    this.endAllHolds()
    const target = clamp(Math.round(index), 0, master.frames.totalFrames - 1)
    const position = clamp(
      master.frameStart(target) - master.start,
      0,
      this.computeTimelineDuration(),
    )
    this.timelineValue = position
    this.refresh()
    void this.seekTimeline(position)
  }

  // -- scrubbing ------------------------------------------------------------

  scrubStart(): void {
    if (this.disposed) return
    this.endAllHolds()
    this.scrubWasPlaying = this.playing
    this.scrubWasReverse = this.reverse
    // Silent pause: a controlled range must keep the click's value while the
    // browser applies its default action; a render here would snap it back.
    this.haltSilently()
  }

  scrubTo(seconds: number): void {
    if (this.disposed) return
    const duration = this.computeTimelineDuration()
    this.timelineValue = clamp(seconds, 0, duration)
    for (const pane of this.activeLoadedPanes()) {
      void pane.seekToTime(pane.start + this.timelineValue)
    }
    this.refresh()
  }

  async scrubEnd(seconds: number): Promise<void> {
    if (this.disposed) return
    const master = this.masterPane()
    const duration = this.computeTimelineDuration()
    let position = clamp(seconds, 0, duration)
    if (master !== null && master.frames !== null) {
      const index = master.frameIndexAt(master.start + position)
      position = clamp(master.frameStart(index) - master.start, 0, duration)
    }
    this.timelineValue = position
    await this.seekTimeline(position)
    if (this.disposed) return
    this.refresh()
    const resumeReverse = this.scrubWasReverse
    const resumePlaying = this.scrubWasPlaying
    this.scrubWasReverse = false
    this.scrubWasPlaying = false
    if (resumeReverse) {
      this.toggleReverse()
    } else if (resumePlaying) {
      await this.play()
    }
  }

  // -- audio / rate ---------------------------------------------------------

  toggleMute(): void {
    this.setMuted(!this.snapshotValue.muted)
  }

  setMuted(muted: boolean): void {
    this.left.setMuted(muted)
    this.right.setMuted(muted)
    this.preferences.muted = muted
    savePreferences(this.preferences)
    this.patch({ muted })
  }

  setVolume(volume: number): void {
    const next = clamp(volume, 0, 1)
    const muted = next > 0 ? false : this.snapshotValue.muted
    this.left.setVolume(next)
    this.right.setVolume(next)
    this.left.setMuted(muted)
    this.right.setMuted(muted)
    this.preferences.volume = next
    this.preferences.muted = muted
    savePreferences(this.preferences)
    this.patch({ volume: next, muted })
  }

  setRate(rate: number): void {
    const next = RATES.includes(rate) ? rate : 1
    this.left.setRate(next)
    this.right.setRate(next)
    this.preferences.rate = next
    savePreferences(this.preferences)
    this.patch({ rate: next })
  }

  // -- engine internals -----------------------------------------------------

  private pane(id: PaneId): Pane {
    return id === 'left' ? this.left : this.right
  }

  private activeLoadedPanes(): Pane[] {
    if (this.layout === 'single') return this.left.loaded ? [this.left] : []
    return [this.left, this.right].filter((pane) => pane.loaded)
  }

  private masterPane(): Pane | null {
    return this.activeLoadedPanes()[0] ?? null
  }

  private computeTimelineDuration(): number {
    const panes = this.activeLoadedPanes()
    if (panes.length === 0) return 0
    return Math.max(0, Math.min(...panes.map((pane) => pane.duration - pane.start)))
  }

  private async seekTimeline(position: number): Promise<void> {
    const panes = this.activeLoadedPanes()
    const clamped = clamp(position, 0, this.computeTimelineDuration())
    await Promise.all(panes.map((pane) => pane.seekToTime(pane.start + clamped)))
  }

  private refresh(): void {
    if (this.disposed) return
    const panes = this.activeLoadedPanes()
    const duration = this.computeTimelineDuration()
    let position = this.timelineValue
    if (this.playing && panes.length > 0) {
      const master = panes[0]!
      position = master.currentTime - master.start
    }
    position = clamp(position, 0, duration)
    this.timelineValue = position
    this.snapshotValue = {
      ...this.snapshotValue,
      layout: this.layout,
      left: this.left.snapshot(),
      right: this.right.snapshot(),
      master: panes[0]?.id ?? null,
      timelinePosition: position,
      timelineDuration: duration,
      playing: this.playing,
      reverse: this.reverse,
    }
    for (const listener of this.listeners) listener()
  }

  private patch(next: Partial<PlayerSnapshot>): void {
    this.snapshotValue = { ...this.snapshotValue, ...next }
    for (const listener of this.listeners) listener()
  }

  private notify(text: string): void {
    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer)
    this.patch({ notice: text })
    this.noticeTimer = window.setTimeout(() => {
      this.noticeTimer = null
      this.patch({ notice: null })
    }, 2400)
  }

  private haltSilently(): void {
    this.playing = false
    this.reverse = false
    this.reverseToken += 1
    this.cancelSyncLoop()
    this.left.pause()
    this.right.pause()
  }

  private stopReverse(): void {
    if (!this.reverse) return
    this.reverse = false
    this.reverseToken += 1
    this.refresh()
  }

  private async runReverse(): Promise<void> {
    const token = ++this.reverseToken
    while (!this.disposed && this.reverse && token === this.reverseToken) {
      const panes = this.activeLoadedPanes()
      const master = panes[0]
      if (master === undefined || master.frames === null) break
      const duration = this.computeTimelineDuration()
      const current = clamp(this.timelineValue, 0, duration)
      if (current <= 0.000_5) {
        this.reverse = false
        this.timelineValue = 0
        this.refresh()
        this.notify('已到视频开头')
        return
      }
      const index = master.frameIndexAt(master.start + current)
      if (index <= 0) {
        this.reverse = false
        this.timelineValue = 0
        await this.seekTimeline(0)
        this.refresh()
        this.notify('已到视频开头')
        return
      }
      const previous = index - 1
      const target = clamp(master.frameStart(previous) - master.start, 0, duration)
      if (target >= current - 0.000_1) {
        this.stopReverse()
        return
      }
      const started = performance.now()
      await this.seekTimeline(target)
      if (!this.reverse || token !== this.reverseToken || this.disposed) return
      this.timelineValue = target
      this.refresh()
      const interval = Math.max(8, (master.frameDuration(previous) * 1000) / this.snapshotValue.rate)
      const elapsed = performance.now() - started
      if (elapsed < interval) await delay(interval - elapsed)
    }
  }

  private startSyncLoop(): void {
    this.cancelSyncLoop()
    const tick = (): void => {
      if (!this.playing || this.disposed) return
      const panes = this.activeLoadedPanes()
      const master = panes[0]
      if (master === undefined) {
        this.haltSilently()
        this.refresh()
        return
      }
      const duration = this.computeTimelineDuration()
      const position = clamp(master.currentTime - master.start, 0, duration)
      this.timelineValue = position
      for (let index = 1; index < panes.length; index += 1) {
        const pane = panes[index]!
        const expected = pane.start + position
        if (Math.abs(pane.currentTime - expected) > 0.15) pane.video.currentTime = expected
      }
      this.refresh()
      if (position >= duration - 0.008 || master.video.ended) {
        this.finishPlayback()
        return
      }
      this.syncRaf = window.requestAnimationFrame(tick)
    }
    this.syncRaf = window.requestAnimationFrame(tick)
  }

  private cancelSyncLoop(): void {
    if (this.syncRaf !== 0) window.cancelAnimationFrame(this.syncRaf)
    this.syncRaf = 0
  }

  private finishPlayback(): void {
    if (!this.playing && !this.reverse) return
    this.haltSilently()
    this.timelineValue = this.computeTimelineDuration()
    this.refresh()
    this.notify('已到同步范围末尾')
  }

  private handlePaneChange(): void {
    this.refresh()
  }

  private handlePaneEnded(): void {
    if (this.playing) {
      this.finishPlayback()
      return
    }
    this.refresh()
  }

  private handlePaneError(): void {
    if (this.playing || this.reverse) {
      this.haltSilently()
      this.refresh()
    }
  }

  private holdTick(direction: -1 | 1): void {
    if (this.holdDirection !== direction) return
    const started = performance.now()
    const paneId = this.holdPane
    const action = paneId !== null
      ? this.stepPane(paneId, direction * this.holdStride)
      : this.step(direction * this.holdStride, true)
    void action.then(() => {
      if (this.holdDirection !== direction) return
      const elapsed = performance.now() - started
      const wait = Math.max(0, HOLD_INTERVAL_MS - elapsed)
      this.holdTimer = window.setTimeout(() => this.holdTick(direction), wait)
    })
  }

  private clearHoldTimer(): void {
    if (this.holdTimer !== null) window.clearTimeout(this.holdTimer)
    this.holdTimer = null
  }
}
