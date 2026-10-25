/**
 * The activity page.
 *
 * It is a thin React shell over `PlayerEngine`: all playback state lives in the
 * engine's immutable snapshot, so a re-render never interrupts a seek or a
 * reverse loop. The page owns only transient UI state (drag highlight) and the
 * file input.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react'

import { formatFps, PLAYBACK_RATES, type PlayerEngine } from '../engine'
import {
  AlertIcon,
  CloseIcon,
  FrameIcon,
  JumpEndIcon,
  JumpStartIcon,
  MutedIcon,
  PauseIcon,
  PlayIcon,
  ReverseIcon,
  StepBackIcon,
  StepForwardIcon,
  UploadIcon,
  VideoGlyph,
  VolumeIcon,
} from '../icons'

interface AppProps {
  readonly engine: PlayerEngine
}

const COMMON_FPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60]

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

/** `MM:SS.mmm`, or `H:MM:SS.mmm` for long videos. */
function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.000'
  const total = Math.floor(seconds * 1000) / 1000
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total / 60) % 60
  const wholeSeconds = Math.floor(total) % 60
  const milliseconds = Math.round((total - Math.floor(total)) * 1000)
  const base = hours > 0
    ? `${hours}:${pad(minutes)}:${pad(wholeSeconds)}`
    : `${pad(minutes)}:${pad(wholeSeconds)}`
  return `${base}.${pad(milliseconds, 3)}`
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function isEditable(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (element === null) return false
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable
}

export function App({ engine }: AppProps): ReactElement {
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot)
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const videoHostRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const rangeRef = useRef<HTMLInputElement>(null)
  const scrubbingRef = useRef(false)
  const skipChangeRef = useRef(false)
  const [dragging, setDragging] = useState(false)

  const ready = snapshot.status === 'ready'
  const hasFile = snapshot.fileName.length > 0
  const duration = Math.max(snapshot.duration, 0.001)
  const progress = snapshot.duration > 0
    ? Math.min(100, Math.max(0, (snapshot.currentTime / snapshot.duration) * 100))
    : 0
  const buffered = snapshot.duration > 0
    ? Math.min(100, Math.max(0, (snapshot.buffered / snapshot.duration) * 100))
    : 0
  const rangeStyle = {
    '--dvp-fill': `${progress}%`,
    '--dvp-buffer': `${buffered}%`,
  } as CSSProperties
  const volumeStyle = {
    '--dvp-volume': `${Math.round(snapshot.volume * 100)}%`,
  } as CSSProperties

  const fpsOptions = useMemo(() => {
    const values = [...COMMON_FPS]
    if (!values.some((value) => Math.abs(value - snapshot.fps) < 0.001)) values.push(snapshot.fps)
    return values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  }, [snapshot.fps])

  useLayoutEffect(() => {
    const host = videoHostRef.current
    if (host === null) return
    engine.attach(host)
    return () => {
      engine.detach()
    }
  }, [engine])

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
  }, [])

  // Selecting a file closes the native picker on whatever element had focus.
  // Return keyboard ownership to the page once the frame table is ready so the
  // arrow keys work immediately.
  useEffect(() => {
    if (snapshot.status === 'ready') rootRef.current?.focus({ preventScroll: true })
  }, [snapshot.status])

  const pickFile = useCallback((): void => {
    fileRef.current?.click()
  }, [])

  const closeFile = useCallback((): void => {
    engine.closeFile()
    rootRef.current?.focus({ preventScroll: true })
  }, [engine])

  const onFileChange = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file !== undefined) void engine.openFile(file)
  }, [engine])

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragging(true)
  }, [])

  const onDragLeave = useCallback((event: DragEvent<HTMLDivElement>): void => {
    const next = event.relatedTarget as Node | null
    if (next === null || !event.currentTarget.contains(next)) setDragging(false)
  }, [])

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file !== undefined) void engine.openFile(file)
  }, [engine])

  // The page is the keyboard owner while it is mounted. Plain arrow keys step
  // one frame; holding one repeats from the engine's own timer (browser key
  // auto-repeat is deliberately ignored so the cadence is ours, not the OS's).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (engine.getSnapshot().status !== 'ready') return
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.isComposing) return
      if (document.querySelector('[role="dialog"]') !== null) return
      const active = document.activeElement
      const root = rootRef.current
      if (active !== null && active !== document.body && active !== document.documentElement) {
        if (root === null || !root.contains(active)) return
      }
      if (isEditable(event.target)) return
      const target = event.target as HTMLElement | null
      if (event.code === 'Space' && target?.tagName === 'BUTTON') return
      switch (event.code) {
        case 'ArrowLeft':
          event.preventDefault()
          if (!event.repeat) engine.beginHold(-1, event.shiftKey ? 10 : 1)
          break
        case 'ArrowRight':
          event.preventDefault()
          if (!event.repeat) engine.beginHold(1, event.shiftKey ? 10 : 1)
          break
        case 'Space':
          event.preventDefault()
          if (!event.repeat) void engine.togglePlay()
          break
        case 'KeyM':
          event.preventDefault()
          if (!event.repeat) engine.toggleMute()
          break
        case 'KeyR':
          event.preventDefault()
          if (!event.repeat) engine.toggleReverse()
          break
        case 'Home':
          event.preventDefault()
          engine.firstFrame()
          break
        case 'End':
          event.preventDefault()
          engine.lastFrame()
          break
        case 'ArrowUp':
          event.preventDefault()
          if (!event.repeat) engine.setVolume(Math.min(1, engine.getSnapshot().volume + 0.05))
          break
        case 'ArrowDown':
          event.preventDefault()
          if (!event.repeat) engine.setVolume(Math.max(0, engine.getSnapshot().volume - 0.05))
          break
        default:
          break
      }
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'ArrowLeft') engine.endHold(-1)
      if (event.code === 'ArrowRight') engine.endHold(1)
    }
    const onBlur = (): void => {
      engine.endAllHolds()
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
      engine.endAllHolds()
    }
  }, [engine])

  const onRangePointerDown = useCallback((): void => {
    scrubbingRef.current = true
    engine.scrubStart()
  }, [engine])

  const onRangeInput = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    engine.scrubTo(Number(event.currentTarget.value))
  }, [engine])

  const onRangePointerUp = useCallback((event: ReactPointerEvent<HTMLInputElement>): void => {
    scrubbingRef.current = false
    skipChangeRef.current = true
    void engine.scrubEnd(Number(event.currentTarget.value))
    window.setTimeout(() => {
      skipChangeRef.current = false
    }, 0)
    rootRef.current?.focus({ preventScroll: true })
  }, [engine])

  const onRangeChange = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    if (skipChangeRef.current || scrubbingRef.current) return
    engine.scrubStart()
    void engine.scrubEnd(Number(event.currentTarget.value))
  }, [engine])

  // A pointer released outside the range still ends the scrub, and a keyboard
  // change has no pointer at all; this listener covers the former.
  useEffect(() => {
    const finish = (): void => {
      if (!scrubbingRef.current) return
      scrubbingRef.current = false
      const input = rangeRef.current
      if (input !== null) void engine.scrubEnd(Number(input.value))
      rootRef.current?.focus({ preventScroll: true })
    }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [engine])

  const onRootPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement | null
    if (target?.closest('input, select, textarea') != null) return
    rootRef.current?.focus({ preventScroll: true })
  }, [])

  const togglePlay = useCallback((): void => {
    void engine.togglePlay()
  }, [engine])

  const frameTotal = Math.max(snapshot.frameCount, 0)
  const frameNumber = frameTotal > 0 ? Math.min(snapshot.frameIndex + 1, frameTotal) : 0
  const frameWidth = String(frameTotal).length
  const frameLabel = frameTotal > 0 ? `${pad(frameNumber, frameWidth)} / ${frameTotal}` : '—'

  return (
    <div
      className="dvp-root"
      ref={rootRef}
      tabIndex={-1}
      onPointerUp={onRootPointerUp}
    >
      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/*,.mp4,.m4v,.mov"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />

      <header className="dvp-header">
        <div className="dvp-brand">
          <span className="dvp-logo"><VideoGlyph size={20} /></span>
          <div className="dvp-brand-text">
            <h1>视频逐帧播放器</h1>
            <p>逐帧检视 · 左右方向键单步，按住连续 · 支持倒放与静音</p>
          </div>
        </div>
        <div className="dvp-header-meta">
          {ready ? (
            <>
              <span className="dvp-chip strong">{snapshot.codec.length > 0 ? snapshot.codec : '视频'}</span>
              <span className="dvp-chip">{formatFps(snapshot.fps)} fps</span>
              {snapshot.width > 0 && snapshot.height > 0 ? (
                <span className="dvp-chip">{snapshot.width}×{snapshot.height}</span>
              ) : null}
              {snapshot.frameSource === 'estimated' ? <span className="dvp-chip warn">帧率估算</span> : null}
            </>
          ) : null}
        </div>
        <div className="dvp-header-actions">
          {hasFile ? (
            <button type="button" className="dvp-btn ghost small" onClick={closeFile} title="关闭当前视频">
              <CloseIcon size={14} />
              <span>关闭</span>
            </button>
          ) : null}
          <button type="button" className="dvp-btn primary" onClick={pickFile}>
            <UploadIcon size={16} />
            <span>选择视频</span>
          </button>
        </div>
      </header>

      <main className="dvp-body">
        <div
          ref={stageRef}
          className={dragging ? 'dvp-stage dragging' : 'dvp-stage'}
          data-ready={ready ? 'true' : 'false'}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onDoubleClick={ready ? togglePlay : undefined}
        >
          <div ref={videoHostRef} className="dvp-video-host" aria-hidden="true" />
          {snapshot.status === 'empty' ? (
            <div className="dvp-overlay">
              <div className="dvp-empty">
                <span className="dvp-empty-orb"><VideoGlyph size={34} /></span>
                <h2>打开一个视频，开始逐帧检视</h2>
                <p>
                  选择本地 MP4 文件，或直接把视频拖到这里。播放、暂停、逐帧和倒放都在本机完成，
                  视频不会上传到任何服务器。
                </p>
                <button type="button" className="dvp-btn primary" onClick={pickFile}>
                  <UploadIcon size={17} />
                  <span>选择本地视频</span>
                </button>
                <div className="dvp-empty-features">
                  <span>← / → 单帧 · 按住连续</span>
                  <span>倒放</span>
                  <span>点击进度条跳转</span>
                  <span>静音</span>
                </div>
              </div>
            </div>
          ) : null}

          {snapshot.status === 'loading' ? (
            <div className="dvp-overlay">
              <div className="dvp-loading">
                <span className="dvp-spinner" />
                <strong>正在读取视频并解析帧表…</strong>
                <span>{snapshot.fileName}</span>
              </div>
            </div>
          ) : null}

          {snapshot.status === 'error' ? (
            <div className="dvp-overlay">
              <div className="dvp-error">
                <span className="dvp-error-icon"><AlertIcon size={26} /></span>
                <strong>无法打开这个视频</strong>
                <p>{snapshot.error ?? '未知错误。请换一个 H.264/AAC 编码的 MP4 文件再试。'}</p>
                <div className="dvp-error-actions">
                  <button type="button" className="dvp-btn" onClick={pickFile}>重新选择</button>
                  {hasFile ? <button type="button" className="dvp-btn" onClick={closeFile}>关闭</button> : null}
                </div>
              </div>
            </div>
          ) : null}

          {ready ? (
            <>
              <div className="dvp-stage-tools">
                <span className="dvp-stage-tag" title={snapshot.fileName}>
                  <strong>{snapshot.fileName}</strong>
                </span>
                {snapshot.reverse ? (
                  <span className="dvp-stage-tag reverse">
                    <span className="dvp-live-dot" />
                    倒放中
                  </span>
                ) : null}
                {snapshot.playing ? (
                  <span className="dvp-stage-tag playing">
                    <span className="dvp-live-dot" />
                    播放中
                  </span>
                ) : null}
              </div>
              <div className="dvp-frame-badge">
                <FrameIcon size={14} />
                <span>帧 <strong>{pad(frameNumber, frameWidth)}</strong> / {frameTotal}</span>
              </div>
              <div className="dvp-stage-info">
                {snapshot.width > 0 ? `${snapshot.width}×${snapshot.height} · ` : ''}
                {formatFps(snapshot.fps)} fps · {formatSize(snapshot.fileSize)}
              </div>
            </>
          ) : null}

          {snapshot.notice !== null ? <div className="dvp-toast">{snapshot.notice}</div> : null}
          {dragging ? <div className="dvp-drop-hint">松开以打开视频</div> : null}
        </div>

        <div className="dvp-controls">
          <div className="dvp-timeline-row">
            <span className="dvp-time" title="当前时间">{formatClock(snapshot.currentTime)}</span>
            <div className="dvp-range-wrap" style={rangeStyle}>
              <div className="dvp-range-track" aria-hidden="true">
                <div className="dvp-range-buffer" />
                <div className="dvp-range-fill" />
              </div>
              <input
                ref={rangeRef}
                className="dvp-range"
                type="range"
                min={0}
                max={duration}
                step="any"
                value={Math.min(snapshot.currentTime, duration)}
                disabled={!ready}
                aria-label="播放进度"
                onPointerDown={onRangePointerDown}
                onPointerUp={onRangePointerUp}
                onPointerCancel={onRangePointerUp}
                onInput={onRangeInput}
                onChange={onRangeChange}
              />
            </div>
            <span className="dvp-time total" title="视频时长">{formatClock(snapshot.duration)}</span>
          </div>

          <div className="dvp-transport">
            <div className="dvp-group">
              <button
                type="button"
                className="dvp-iconbtn"
                disabled={!ready}
                onClick={() => engine.firstFrame()}
                title="第一帧 (Home)"
                aria-label="跳到第一帧"
              >
                <JumpStartIcon />
              </button>
              <button
                type="button"
                className="dvp-iconbtn"
                disabled={!ready}
                onClick={() => void engine.step(-1)}
                title="上一帧 (←，按住连续)"
                aria-label="上一帧"
              >
                <StepBackIcon />
              </button>
              <button
                type="button"
                className="dvp-play"
                disabled={!ready}
                onClick={togglePlay}
                title={snapshot.playing ? '暂停 (Space)' : '播放 (Space)'}
                aria-label={snapshot.playing ? '暂停' : '播放'}
              >
                {snapshot.playing ? <PauseIcon size={21} /> : <PlayIcon size={22} />}
              </button>
              <button
                type="button"
                className="dvp-iconbtn"
                disabled={!ready}
                onClick={() => void engine.step(1)}
                title="下一帧 (→，按住连续)"
                aria-label="下一帧"
              >
                <StepForwardIcon />
              </button>
              <button
                type="button"
                className="dvp-iconbtn"
                disabled={!ready}
                onClick={() => engine.lastFrame()}
                title="最后一帧 (End)"
                aria-label="跳到最后一帧"
              >
                <JumpEndIcon />
              </button>
            </div>

            <div className="dvp-group">
              <button
                type="button"
                className={snapshot.reverse ? 'dvp-reverse active' : 'dvp-reverse'}
                disabled={!ready || snapshot.frameCount < 2}
                onClick={() => engine.toggleReverse()}
                title="倒放 (R)：逐帧向后解码，长 GOP 视频可能较慢"
                aria-pressed={snapshot.reverse}
                aria-label={snapshot.reverse ? '停止倒放' : '倒放'}
              >
                <ReverseIcon size={16} />
                <span>{snapshot.reverse ? '停止倒放' : '倒放'}</span>
              </button>
            </div>

            <div className="dvp-sep" />

            <div className="dvp-frame-pill" title="当前帧 / 总帧数">
              <FrameIcon size={14} />
              <span>帧 <strong>{frameLabel}</strong></span>
            </div>

            {snapshot.frameSource === 'estimated' && ready ? (
              <label className="dvp-select-label" title="无法读取精确帧表时，可手动修正帧率">
                <select
                  className="dvp-select"
                  value={String(snapshot.fps)}
                  onChange={(event) => {
                    engine.setEstimatedFps(Number(event.currentTarget.value))
                    rootRef.current?.focus({ preventScroll: true })
                  }}
                  aria-label="估算帧率"
                >
                  {fpsOptions.map((fps) => (
                    <option key={fps} value={String(fps)}>{formatFps(fps)} fps</option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="dvp-spacer" />

            <label className="dvp-select-label" title="播放速度；倒放时同时控制倒放速度">
              <select
                className="dvp-select"
                value={String(snapshot.rate)}
                onChange={(event) => {
                  engine.setRate(Number(event.currentTarget.value))
                  rootRef.current?.focus({ preventScroll: true })
                }}
                aria-label="播放速度"
              >
                {PLAYBACK_RATES.map((rate) => (
                  <option key={rate} value={String(rate)}>{rate}×</option>
                ))}
              </select>
            </label>

            <div className="dvp-volume">
              <button
                type="button"
                className={snapshot.muted ? 'dvp-iconbtn active' : 'dvp-iconbtn'}
                onClick={() => engine.toggleMute()}
                title={snapshot.muted ? '取消静音 (M)' : '静音 (M)'}
                aria-label={snapshot.muted ? '取消静音' : '静音'}
                aria-pressed={snapshot.muted}
              >
                {snapshot.muted ? <MutedIcon /> : <VolumeIcon />}
              </button>
              <input
                className="dvp-volume-range"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={snapshot.muted ? 0 : snapshot.volume}
                style={volumeStyle}
                onChange={(event) => engine.setVolume(Number(event.currentTarget.value))}
                aria-label="音量"
                title={`音量 ${Math.round(snapshot.volume * 100)}%`}
              />
            </div>
          </div>

          <div className="dvp-hint">
            <span><kbd>←</kbd> <kbd>→</kbd> 逐帧</span>
            <span className="dvp-hint-dot" />
            <span>按住连续</span>
            <span className="dvp-hint-dot" />
            <span><kbd>Shift</kbd> + <kbd>←</kbd>/<kbd>→</kbd> 10 帧</span>
            <span className="dvp-hint-dot" />
            <span><kbd>Space</kbd> 播放/暂停</span>
            <span className="dvp-hint-dot" />
            <span><kbd>R</kbd> 倒放</span>
            <span className="dvp-hint-dot" />
            <span><kbd>M</kbd> 静音</span>
            <span className="dvp-hint-dot" />
            <span><kbd>Home</kbd> / <kbd>End</kbd> 首/尾帧</span>
            <span className="dvp-hint-spacer" />
            <span>点击进度条跳转</span>
          </div>
        </div>
      </main>
    </div>
  )
}
