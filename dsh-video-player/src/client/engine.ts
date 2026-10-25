/**
 * The player engine.
 *
 * The DOM `<video>` element is owned here instead of by React: it is the one
 * object whose playback state must survive a re-render, and the frame-stepping
 * loops are easier to reason about outside the render cycle. React subscribes to
 * the immutable snapshot with `useSyncExternalStore`.
 *
 * Frame-exact stepping is built on top of ordinary `currentTime` seeks. The MP4
 * sample table gives the exact start/duration of every frame, so a step seeks to
 * the middle of the target frame — a point Chrome/Electron resolves to that
 * frame rather than to a nearby keyframe. Reverse playback is the same primitive
 * driven by a backwards loop; it is correct but bounded by the decoder's seek
 * speed.
 */

import {
  buildEstimatedFrameTable,
  codecLabel,
  frameIndexAt,
  parseMp4FrameTable,
  type FrameTable,
} from './mp4'

export type PlayerStatus = 'empty' | 'loading' | 'ready' | 'error'
export type FrameSource = 'mp4' | 'estimated' | 'none'

export interface PlayerSnapshot {
  readonly status: PlayerStatus
  readonly fileName: string
  readonly fileSize: number
  readonly fileType: string
  readonly error: string | null
  readonly notice: string | null
  readonly duration: number
  readonly currentTime: number
  readonly frameIndex: number
  readonly frameCount: number
  readonly fps: number
  readonly width: number
  readonly height: number
  readonly codec: string
  readonly playing: boolean
  readonly reverse: boolean
  readonly muted: boolean
  readonly volume: number
  readonly rate: number
  readonly scrubbing: boolean
  readonly buffered: number
  readonly frameSource: FrameSource
}

interface Preferences {
  muted: boolean
  volume: number
  rate: number
}

const PREFS_KEY = 'dsh-video-player:prefs'
const HOLD_DELAY_MS = 300
const HOLD_INTERVAL_MS = 72
const DEFAULT_FPS = 30
const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

/** Playback rates offered by the transport menu. */
export const PLAYBACK_RATES: readonly number[] = RATES

const EMPTY_TIMES = new Float64Array(0)

const INITIAL: PlayerSnapshot = {
  status: 'empty',
  fileName: '',
  fileSize: 0,
  fileType: '',
  error: null,
  notice: null,
  duration: 0,
  currentTime: 0,
  frameIndex: 0,
  frameCount: 0,
  fps: 0,
  width: 0,
  height: 0,
  codec: '',
  playing: false,
  reverse: false,
  muted: false,
  volume: 1,
  rate: 1,
  scrubbing: false,
  buffered: 0,
  frameSource: 'none',
}

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

export class PlayerEngine {
  readonly video: HTMLVideoElement

  private snapshotValue: PlayerSnapshot = INITIAL
  private readonly listeners = new Set<() => void>()
  private frames: FrameTable | null = null
  private objectUrl: string | null = null
  private loadToken = 0
  private seekGeneration = 0
  private targetFrame = 0
  private queuedSteps = 0
  private stepping = false
  private stepPromise: Promise<void> = Promise.resolve()
  private holdDirection: -1 | 0 | 1 = 0
  private holdStride = 1
  private holdTimer: number | null = null
  private reverseToken = 0
  private scrubbing = false
  private scrubWasPlaying = false
  private scrubWasReverse = false
  private noticeTimer: number | null = null
  private frameCallbackId: number | null = null
  private disposed = false
  private lastTimeEmit = 0
  private readonly preferences: Preferences

  constructor() {
    this.preferences = readPreferences()
    const video = document.createElement('video')
    video.className = 'dvp-video'
    video.playsInline = true
    video.preload = 'auto'
    video.controls = false
    video.disablePictureInPicture = true
    video.muted = this.preferences.muted
    video.volume = this.preferences.volume
    this.video = video
    this.snapshotValue = {
      ...INITIAL,
      muted: this.preferences.muted,
      volume: this.preferences.volume,
      rate: this.preferences.rate,
    }
    this.bindVideoEvents()
    this.bindFrameCallback()
  }

  // -- React store interface ------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): PlayerSnapshot => this.snapshotValue

  private patch(next: Partial<PlayerSnapshot>): void {
    this.snapshotValue = { ...this.snapshotValue, ...next }
    for (const listener of this.listeners) listener()
  }

  /** A getter keeps TypeScript from narrowing the status across an await. */
  private get failed(): boolean {
    return this.snapshotValue.status === 'error'
  }

  // -- lifecycle ------------------------------------------------------------

  /** Put the video element into the page's stage. */
  attach(container: HTMLElement): void {
    if (this.video.parentElement !== container) container.append(this.video)
  }

  /** Remove the video element; keep the file and position for the next mount. */
  detach(): void {
    this.endAllHolds()
    this.reverseToken += 1
    this.seekGeneration += 1
    this.queuedSteps = 0
    if (!this.video.paused) this.video.pause()
    this.snapshotValue = { ...this.snapshotValue, playing: false, reverse: false, scrubbing: false }
    this.scrubbing = false
    this.video.remove()
  }

  dispose(): void {
    this.disposed = true
    this.listeners.clear()
    this.loadToken += 1
    this.seekGeneration += 1
    this.reverseToken += 1
    this.endAllHolds()
    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer)
    this.noticeTimer = null
    if (this.frameCallbackId !== null && typeof this.video.cancelVideoFrameCallback === 'function') {
      this.video.cancelVideoFrameCallback(this.frameCallbackId)
    }
    this.frameCallbackId = null
    this.video.removeEventListener('loadedmetadata', this.onLoadedMetadata)
    this.video.removeEventListener('durationchange', this.onDurationChange)
    this.video.removeEventListener('timeupdate', this.onTimeUpdate)
    this.video.removeEventListener('progress', this.onProgress)
    this.video.removeEventListener('play', this.onPlay)
    this.video.removeEventListener('pause', this.onPause)
    this.video.removeEventListener('ended', this.onEnded)
    this.video.removeEventListener('volumechange', this.onVolumeChange)
    this.video.removeEventListener('error', this.onVideoError)
    this.revokeObjectUrl()
    this.video.pause()
    this.video.removeAttribute('src')
    this.video.load()
    this.video.remove()
  }

  // -- file handling --------------------------------------------------------

  async openFile(file: File): Promise<void> {
    if (this.disposed) return
    if (!looksLikeVideo(file)) {
      this.notify('请选择视频文件（推荐 MP4 / H.264）')
      return
    }
    if (file.size === 0) {
      this.notify('这个文件是空的')
      return
    }
    const token = ++this.loadToken
    this.endAllHolds()
    this.stopReverse()
    this.pauseForward()
    this.scrubbing = false
    this.seekGeneration += 1
    this.frames = null
    this.queuedSteps = 0
    this.targetFrame = 0
    this.revokeObjectUrl()
    this.objectUrl = URL.createObjectURL(file)
    this.patch({
      status: 'loading',
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      error: null,
      notice: null,
      duration: 0,
      currentTime: 0,
      frameIndex: 0,
      frameCount: 0,
      fps: 0,
      width: 0,
      height: 0,
      codec: '',
      playing: false,
      reverse: false,
      scrubbing: false,
      buffered: 0,
      frameSource: 'none',
    })

    // Reset the previous source first: otherwise a readyState left over from
    // the old file would make waitForMetadata resolve without the new metadata.
    this.video.removeAttribute('src')
    this.video.load()
    const metadata = this.waitForMetadata()
    this.video.src = this.objectUrl
    this.video.load()

    try {
      await metadata
    } catch (error) {
      if (token !== this.loadToken) return
      this.patch({
        status: 'error',
        error: error instanceof Error ? error.message : '无法读取该视频',
      })
      return
    }
    if (token !== this.loadToken || this.failed) return

    const duration = Number.isFinite(this.video.duration) && this.video.duration > 0
      ? this.video.duration
      : 0
    const table = await loadFrameTable(file, duration, DEFAULT_FPS)
    if (token !== this.loadToken || this.failed) return

    this.frames = table
    this.targetFrame = 0
    this.patch({
      status: 'ready',
      duration,
      frameCount: table.totalFrames,
      fps: table.fps,
      width: this.video.videoWidth || table.width,
      height: this.video.videoHeight || table.height,
      codec: codecLabel(table.codec),
      frameSource: table.kind,
      frameIndex: 0,
      currentTime: 0,
      buffered: this.bufferedEnd(),
    })

    // Paint the first frame immediately. A seek to the middle of frame 0 asks
    // the decoder for a displayed frame instead of the black pre-roll.
    await this.seekToFrame(0)
    if (token !== this.loadToken) return
    if (table.kind === 'estimated') {
      this.notify('未能读取精确帧表，当前按 30fps 估算')
    }
    this.video.focus?.()
  }

  closeFile(): void {
    this.loadToken += 1
    this.endAllHolds()
    this.stopReverse()
    this.pauseForward()
    this.scrubbing = false
    this.seekGeneration += 1
    this.frames = null
    this.queuedSteps = 0
    this.revokeObjectUrl()
    this.video.removeAttribute('src')
    this.video.load()
    this.targetFrame = 0
    this.patch({ ...INITIAL, muted: this.preferences.muted, volume: this.preferences.volume, rate: this.preferences.rate })
  }

  // -- transport ------------------------------------------------------------

  async togglePlay(): Promise<void> {
    if (this.snapshotValue.status !== 'ready') return
    if (this.snapshotValue.playing) {
      this.pauseForward()
      return
    }
    await this.play()
  }

  async play(): Promise<void> {
    if (this.snapshotValue.status !== 'ready') return
    this.endAllHolds()
    this.stopReverse()
    if (this.video.ended || this.video.currentTime >= this.snapshotValue.duration - 0.001) {
      await this.seekToFrame(0)
    }
    this.video.playbackRate = this.snapshotValue.rate
    try {
      await this.video.play()
    } catch (error) {
      this.patch({
        playing: false,
        error: error instanceof Error ? `无法开始播放：${error.message}` : '无法开始播放',
      })
    }
  }

  pauseForward(): void {
    if (!this.video.paused) this.video.pause()
    if (this.snapshotValue.playing) this.patch({ playing: false })
    if (this.frames !== null && !this.stepping && !this.scrubbing && !this.snapshotValue.reverse) {
      const index = frameIndexAt(this.frames.times, this.video.currentTime)
      this.targetFrame = index
      if (index !== this.snapshotValue.frameIndex) this.patch({ frameIndex: index })
    }
  }

  /** Start or stop continuous reverse playback. */
  toggleReverse(): void {
    if (this.snapshotValue.status !== 'ready') return
    if (this.snapshotValue.reverse) {
      this.stopReverse()
      this.notify('已停止倒放')
      return
    }
    this.endAllHolds()
    this.pauseForward()
    this.patch({ reverse: true, playing: false, error: null })
    void this.runReverse()
  }

  private stopReverse(): void {
    if (!this.snapshotValue.reverse) return
    this.reverseToken += 1
    this.patch({ reverse: false })
  }

  private async runReverse(): Promise<void> {
    const token = ++this.reverseToken
    while (!this.disposed && this.snapshotValue.reverse && token === this.reverseToken) {
      const next = this.targetFrame - 1
      if (next < 0) {
        this.patch({ reverse: false })
        this.notify('已到视频开头')
        return
      }
      const started = performance.now()
      await this.seekToFrame(next)
      if (!this.snapshotValue.reverse || token !== this.reverseToken) return
      const frameDuration = this.frames?.durations[next] ?? 1 / Math.max(1, this.snapshotValue.fps)
      const interval = Math.max(8, (frameDuration * 1000) / this.snapshotValue.rate)
      const elapsed = performance.now() - started
      if (elapsed < interval) await delay(interval - elapsed)
    }
  }

  // -- frame stepping -------------------------------------------------------

  /** Step by `delta` frames, coalescing rapid repeated calls. */
  step(delta: number, fromHold = false): Promise<void> {
    if (this.snapshotValue.status !== 'ready' || this.frames === null) return Promise.resolve()
    this.stopReverse()
    this.pauseForward()
    if (!fromHold) this.endAllHolds()
    const next = clamp(this.targetFrame + delta, 0, this.frames.totalFrames - 1)
    if (next === this.targetFrame) return Promise.resolve()
    this.queuedSteps += next - this.targetFrame
    if (this.stepping) return this.stepPromise

    this.stepping = true
    this.stepPromise = (async () => {
      try {
        while (this.queuedSteps !== 0) {
          const direction = this.queuedSteps > 0 ? 1 : -1
          this.queuedSteps -= direction
          const target = this.targetFrame + direction
          await this.seekToFrame(target)
        }
      } finally {
        this.stepping = false
        this.queuedSteps = 0
      }
    })()
    return this.stepPromise
  }

  /** Begin a held arrow key: one immediate step, then a steady repeat. */
  beginHold(direction: -1 | 1, stride = 1): void {
    if (this.snapshotValue.status !== 'ready') return
    this.holdDirection = direction
    this.holdStride = stride
    this.clearHoldTimer()
    void this.step(direction * stride, true)
    this.holdTimer = window.setTimeout(() => this.holdTick(direction), HOLD_DELAY_MS)
  }

  endHold(direction: -1 | 1): void {
    if (this.holdDirection !== direction) return
    this.holdDirection = 0
    this.clearHoldTimer()
  }

  endAllHolds(): void {
    this.holdDirection = 0
    this.clearHoldTimer()
  }

  private holdTick(direction: -1 | 1): void {
    if (this.holdDirection !== direction) return
    const started = performance.now()
    void this.step(direction * this.holdStride, true).then(() => {
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

  firstFrame(): void {
    this.jumpToFrame(0)
  }

  lastFrame(): void {
    this.jumpToFrame((this.frames?.totalFrames ?? 1) - 1)
  }

  /** Jump straight to a frame instead of walking there one frame at a time. */
  jumpToFrame(index: number): void {
    if (this.snapshotValue.status !== 'ready' || this.frames === null) return
    this.endAllHolds()
    this.stopReverse()
    this.pauseForward()
    this.queuedSteps = 0
    void this.seekToFrame(index)
  }

  // -- seeking / scrubbing --------------------------------------------------

  scrubStart(): void {
    if (this.snapshotValue.status !== 'ready') return
    this.scrubWasPlaying = this.snapshotValue.playing
    this.scrubWasReverse = this.snapshotValue.reverse
    this.endAllHolds()
    // Do not notify React here. A controlled range must keep its value while
    // the browser is applying the click's default action; re-rendering on
    // pointerdown would snap the thumb back before the input event arrives.
    if (this.scrubWasReverse) this.reverseToken += 1
    this.snapshotValue = {
      ...this.snapshotValue,
      playing: false,
      reverse: false,
    }
    if (!this.video.paused) this.video.pause()
    this.scrubbing = true
  }

  scrubTo(seconds: number): void {
    if (this.snapshotValue.status !== 'ready') return
    const time = clamp(seconds, 0, Math.max(0, this.snapshotValue.duration - 0.000_5))
    this.seekGeneration += 1
    this.video.currentTime = time
    const index = frameIndexAt(this.frames?.times ?? EMPTY_TIMES, time)
    this.targetFrame = index
    this.patch({
      currentTime: time,
      frameIndex: index,
      buffered: this.bufferedEnd(),
    })
  }

  async scrubEnd(seconds: number): Promise<void> {
    if (this.snapshotValue.status !== 'ready') return
    this.scrubTo(seconds)
    this.scrubbing = false
    this.patch({ scrubbing: false })
    const index = frameIndexAt(this.frames?.times ?? EMPTY_TIMES, seconds)
    await this.seekToFrame(index)
    if (this.scrubWasReverse) {
      this.scrubWasReverse = false
      this.toggleReverse()
    } else if (this.scrubWasPlaying) {
      this.scrubWasPlaying = false
      await this.play()
    } else {
      this.scrubWasPlaying = false
    }
  }

  /** Seek to a frame by index; resolves once the frame is presented. */
  seekToFrame(index: number): Promise<void> {
    const frames = this.frames
    if (frames === null || this.snapshotValue.status !== 'ready') return Promise.resolve()
    const clamped = clamp(Math.round(index), 0, frames.totalFrames - 1)
    this.targetFrame = clamped
    const target = this.frameMidpoint(clamped)
    const generation = ++this.seekGeneration

    const finish = (): void => {
      if (generation !== this.seekGeneration) return
      this.targetFrame = clamped
      const current = this.video.currentTime
      const shown = frameIndexAt(frames.times, current)
      // The target is authoritative while a step is in flight; the displayed
      // frame index is used when the decoder landed on the right frame.
      const indexNow = shown === clamped ? shown : clamped
      this.patch({
        frameIndex: indexNow,
        currentTime: current,
        buffered: this.bufferedEnd(),
      })
    }

    if (Math.abs(this.video.currentTime - target) <= 0.000_5) {
      return this.afterPaint().then(finish)
    }
    this.video.currentTime = target
    return this.waitForSeek(generation).then(() => {
      if (generation !== this.seekGeneration) return
      return this.afterPaint().then(finish)
    })
  }

  private frameMidpoint(index: number): number {
    const frames = this.frames
    if (frames === null) return 0
    const start = frames.times[index] ?? 0
    const declaredDuration = frames.durations[index] ?? 1 / Math.max(1, this.snapshotValue.fps)
    const next = index + 1 < frames.times.length ? frames.times[index + 1]! : start + declaredDuration
    const duration = Math.max(0.000_5, next - start)
    const midpoint = start + duration / 2
    const limit = Math.max(0, this.snapshotValue.duration - 0.000_5)
    return clamp(midpoint, 0, limit > 0 ? limit : midpoint)
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
        finish()
      }
      const timer = window.setTimeout(finish, 1200)
      this.video.addEventListener('seeked', onSeeked)
      this.video.addEventListener('error', finish)
      // A cached seek can complete before the listener is installed; the
      // generation check in the caller keeps a stale completion from winning.
      // The timeout is the only fallback: resolving on the next rAF could paint
      // the previous frame and make the next step skip one.
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
        // If the timeout wins, cancel the pending callback where supported.
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

  // -- preferences / audio --------------------------------------------------

  toggleMute(): void {
    this.setMuted(!this.snapshotValue.muted)
  }

  setMuted(muted: boolean): void {
    this.video.muted = muted
    this.preferences.muted = muted
    savePreferences(this.preferences)
    this.patch({ muted })
  }

  setVolume(volume: number): void {
    const next = clamp(volume, 0, 1)
    this.video.volume = next
    if (next > 0 && this.video.muted) this.video.muted = false
    this.preferences.volume = next
    this.preferences.muted = this.video.muted
    savePreferences(this.preferences)
    this.patch({ volume: next, muted: this.video.muted })
  }

  setRate(rate: number): void {
    const next = RATES.includes(rate) ? rate : 1
    this.video.playbackRate = next
    this.preferences.rate = next
    savePreferences(this.preferences)
    this.patch({ rate: next })
  }

  setEstimatedFps(fps: number): void {
    if (this.snapshotValue.frameSource !== 'estimated') return
    const duration = this.snapshotValue.duration
    if (!(duration > 0)) return
    const table = buildEstimatedFrameTable(duration, fps)
    this.frames = table
    const index = frameIndexAt(table.times, this.video.currentTime)
    this.targetFrame = index
    this.patch({
      frameCount: table.totalFrames,
      fps: table.fps,
      frameIndex: index,
    })
  }

  // -- notification ---------------------------------------------------------

  private notify(text: string): void {
    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer)
    this.patch({ notice: text })
    this.noticeTimer = window.setTimeout(() => {
      this.noticeTimer = null
      this.patch({ notice: null })
    }, 2400)
  }

  // -- video events ---------------------------------------------------------

  private bindVideoEvents(): void {
    this.video.addEventListener('loadedmetadata', this.onLoadedMetadata)
    this.video.addEventListener('durationchange', this.onDurationChange)
    this.video.addEventListener('timeupdate', this.onTimeUpdate)
    this.video.addEventListener('progress', this.onProgress)
    this.video.addEventListener('play', this.onPlay)
    this.video.addEventListener('pause', this.onPause)
    this.video.addEventListener('ended', this.onEnded)
    this.video.addEventListener('volumechange', this.onVolumeChange)
    this.video.addEventListener('error', this.onVideoError)
  }

  private onLoadedMetadata = (): void => {
    if (this.snapshotValue.status !== 'loading' && this.snapshotValue.status !== 'ready') return
    this.patch({
      duration: Number.isFinite(this.video.duration) ? this.video.duration : this.snapshotValue.duration,
      width: this.video.videoWidth || this.snapshotValue.width,
      height: this.video.videoHeight || this.snapshotValue.height,
      buffered: this.bufferedEnd(),
    })
  }

  private onDurationChange = (): void => {
    if (!Number.isFinite(this.video.duration)) return
    if (Math.abs(this.video.duration - this.snapshotValue.duration) < 0.001) return
    this.patch({ duration: this.video.duration })
  }

  private onTimeUpdate = (): void => {
    if (this.snapshotValue.status !== 'ready') return
    if (this.stepping || this.scrubbing || this.snapshotValue.reverse) return
    const index = frameIndexAt(this.frames?.times ?? EMPTY_TIMES, this.video.currentTime)
    this.targetFrame = index
    this.patch({
      currentTime: this.video.currentTime,
      frameIndex: index,
      buffered: this.bufferedEnd(),
    })
  }

  private onProgress = (): void => {
    this.patch({ buffered: this.bufferedEnd() })
  }

  private onPlay = (): void => {
    this.patch({ playing: true, reverse: false, error: null })
  }

  private onPause = (): void => {
    if (this.snapshotValue.playing) this.patch({ playing: false })
  }

  private onEnded = (): void => {
    this.patch({ playing: false, reverse: false })
    if (this.frames !== null) {
      this.targetFrame = this.frames.totalFrames - 1
      this.patch({ frameIndex: this.targetFrame })
    }
  }

  private onVolumeChange = (): void => {
    this.patch({ volume: this.video.volume, muted: this.video.muted })
  }

  private onVideoError = (): void => {
    if (this.snapshotValue.status === 'empty') return
    this.patch({ status: 'error', playing: false, error: videoErrorMessage(this.video.error) })
  }

  private bindFrameCallback(): void {
    if (typeof this.video.requestVideoFrameCallback !== 'function') return
    const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata): void => {
      if (this.disposed) return
      this.frameCallbackId = this.video.requestVideoFrameCallback(onFrame)
      if (this.snapshotValue.status !== 'ready') return
      if (this.stepping || this.scrubbing || this.snapshotValue.reverse) return
      const index = frameIndexAt(this.frames?.times ?? EMPTY_TIMES, metadata.mediaTime)
      const now = performance.now()
      const changed = index !== this.snapshotValue.frameIndex
      if (!changed && now - this.lastTimeEmit < 120) return
      this.lastTimeEmit = now
      this.patch({
        frameIndex: index,
        currentTime: metadata.mediaTime,
        buffered: this.bufferedEnd(),
      })
    }
    this.frameCallbackId = this.video.requestVideoFrameCallback(onFrame)
  }

  // -- helpers --------------------------------------------------------------

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

  private bufferedEnd(): number {
    try {
      const ranges = this.video.buffered
      const current = this.video.currentTime
      let best = 0
      for (let i = 0; i < ranges.length; i += 1) {
        if (ranges.start(i) <= current + 0.1 && ranges.end(i) >= current) return ranges.end(i)
        best = Math.max(best, ranges.end(i))
      }
      return best
    } catch {
      return 0
    }
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl === null) return
    URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = null
  }
}
