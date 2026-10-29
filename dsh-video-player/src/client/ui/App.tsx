/**
 * The activity page.
 *
 * It is a thin React shell over `PlayerEngine`: all playback state lives in the
 * engine's immutable snapshot, so a re-render never interrupts a seek or a
 * reverse loop. The page owns transient UI state (drag highlight, the start
 * editor draft) and the file inputs. In dual layout each pane contributes a
 * "选择视频" placeholder, a close X, and a start-position editor; the transport
 * below is shared and drives both videos on one synchronized timeline.
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
  type RefObject,
} from 'react'

import {
  formatFps,
  PLAYBACK_RATES,
  type PaneId,
  type PaneSnapshot,
  type PlayerEngine,
} from '../engine'
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
const FILE_ACCEPT = 'video/mp4,video/quicktime,video/webm,video/*,.mp4,.m4v,.mov'

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/** `MM:SS.mmm`, or `H:MM:SS.mmm` for long videos. */
function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.000'
  const total = Math.round(seconds * 1000) / 1000
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

function sideLabel(side: PaneId): string {
  return side === 'left' ? '左画面' : '右画面'
}

function frameText(pane: PaneSnapshot | null): string {
  if (pane === null || pane.frameCount <= 0) return '—'
  const number = Math.min(pane.frameIndex + 1, pane.frameCount)
  return `${pad(number, String(pane.frameCount).length)} / ${pane.frameCount}`
}

interface PaneCardProps {
  readonly engine: PlayerEngine
  readonly pane: PaneSnapshot
  readonly side: PaneId
  readonly hostRef: RefObject<HTMLDivElement>
  readonly fileRef: RefObject<HTMLInputElement>
  readonly dragging: boolean
  readonly selected: boolean
  readonly onSelect: (side: PaneId) => void
  readonly onFileChange: (side: PaneId, event: ChangeEvent<HTMLInputElement>) => void
  readonly onPick: (side: PaneId) => void
  readonly onClose: (side: PaneId) => void
  readonly onPaneSeek: (side: PaneId, seconds: number) => void
  readonly onSetStart: (side: PaneId) => void
  readonly onTogglePlay: () => void
  readonly onDragOver: (side: PaneId, event: DragEvent<HTMLDivElement>) => void
  readonly onDragLeave: (side: PaneId, event: DragEvent<HTMLDivElement>) => void
  readonly onDrop: (side: PaneId, event: DragEvent<HTMLDivElement>) => void
}

function PaneCard(props: PaneCardProps): ReactElement {
  const { engine, pane, side } = props
  const label = sideLabel(side)
  const estimated = pane.frameSource === 'estimated'
  const fpsOptions = useMemo(() => {
    const values = [...COMMON_FPS]
    if (!values.some((value) => Math.abs(value - pane.fps) < 0.001)) values.push(pane.fps)
    return values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  }, [pane.fps])
  const duration = Math.max(pane.duration, 0.001)
  const fill = pane.duration > 0
    ? clamp((pane.currentTime / pane.duration) * 100, 0, 100)
    : 0
  const startPercent = pane.duration > 0
    ? clamp((pane.start / pane.duration) * 100, 0, 100)
    : 0
  const paneRangeStyle = {
    '--dvp-pane-fill': `${fill}%`,
    '--dvp-pane-start': `${startPercent}%`,
  } as CSSProperties
  const className = ['dvp-pane', props.selected ? 'selected' : '', props.dragging ? 'dragging' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      data-pane={side}
      data-ready={pane.loaded ? 'true' : 'false'}
      onDragOver={(event) => props.onDragOver(side, event)}
      onDragLeave={(event) => props.onDragLeave(side, event)}
      onDrop={(event) => props.onDrop(side, event)}
      onDoubleClick={(event) => {
        const target = event.target as HTMLElement | null
        if (target?.closest('button, input, select, .dvp-pane-footer') != null) return
        props.onTogglePlay()
      }}
    >
      <input
        ref={props.fileRef}
        type="file"
        accept={FILE_ACCEPT}
        style={{ display: 'none' }}
        onChange={(event) => props.onFileChange(side, event)}
      />

      <div className="dvp-pane-view">
        <div ref={props.hostRef} className="dvp-video-host" aria-hidden="true" />

        {pane.status === 'empty' ? (
          <div className="dvp-pane-empty">
            <span className="dvp-pane-orb"><VideoGlyph size={28} /></span>
            <strong>{label}</strong>
            <span>选择本地视频，或把文件拖到这里</span>
            <button type="button" className="dvp-btn primary small" onClick={() => props.onPick(side)}>
              <UploadIcon size={15} />
              <span>选择视频</span>
            </button>
          </div>
        ) : null}

        {pane.status === 'loading' ? (
          <div className="dvp-pane-overlay">
            <span className="dvp-spinner small" />
            <strong>正在读取视频…</strong>
            <span>{pane.fileName}</span>
          </div>
        ) : null}

        {pane.status === 'error' ? (
          <div className="dvp-pane-overlay">
            <span className="dvp-pane-error-icon"><AlertIcon size={22} /></span>
            <strong>无法打开这个视频</strong>
            <span title={pane.error ?? undefined}>
              {pane.error ?? '请换一个 H.264/AAC 编码的 MP4 文件再试。'}
            </span>
            <button type="button" className="dvp-btn small" onClick={() => props.onPick(side)}>
              重新选择
            </button>
          </div>
        ) : null}

        {pane.status !== 'empty' ? (
          <div className="dvp-pane-top">
            <span className="dvp-stage-tag" title={pane.fileName}><strong>{pane.fileName}</strong></span>
            <div className="dvp-pane-top-actions">
              {props.selected ? <span className="dvp-pane-selected">已选中</span> : null}
              <button
                type="button"
                className="dvp-pane-close"
                onClick={() => props.onClose(side)}
                title={`关闭${label}视频`}
                aria-label={`关闭${label}视频`}
              >
                <CloseIcon size={15} />
              </button>
            </div>
          </div>
        ) : null}

        {pane.loaded ? (
          <div className="dvp-pane-bottom">
            <div className="dvp-pane-badges">
              <span className="dvp-frame-badge">
                <FrameIcon size={13} />
                <span>帧 <strong>{frameText(pane)}</strong></span>
              </span>
            </div>
            <span className="dvp-pane-info">
              {pane.width > 0 ? `${pane.width}×${pane.height} · ` : ''}
              {formatFps(pane.fps)} fps · {formatSize(pane.fileSize)}
            </span>
          </div>
        ) : null}
      </div>

      {pane.loaded ? (
        <div className="dvp-pane-footer">
          <div className="dvp-pane-scrub" style={paneRangeStyle}>
            <span className="dvp-pane-time">{formatClock(pane.currentTime)}</span>
            <div className="dvp-pane-range-wrap">
              <div className="dvp-pane-range-track" aria-hidden="true">
                <div className="dvp-pane-range-fill" />
                <div className="dvp-pane-range-start" />
              </div>
              <input
                className="dvp-pane-range"
                type="range"
                min={0}
                max={duration}
                step="any"
                value={Math.min(pane.currentTime, duration)}
                aria-label={`${label}进度`}
                onInput={(event) => props.onPaneSeek(side, Number(event.currentTarget.value))}
                onChange={(event) => props.onPaneSeek(side, Number(event.currentTarget.value))}
                onPointerUp={() => props.onSelect(side)}
              />
            </div>
            <span className="dvp-pane-time total">{formatClock(pane.duration)}</span>
          </div>
          <div className="dvp-pane-actions">
            <span className="dvp-pane-start-label">起点 {formatClock(pane.start)}</span>
            <button
              type="button"
              className="dvp-pane-setstart"
              onClick={() => props.onSetStart(side)}
              title="把该画面当前帧设为同步起点"
            >
              设置为起点
            </button>
            {estimated ? (
              <select
                className="dvp-select tiny"
                value={String(pane.fps)}
                aria-label={`${label}估算帧率`}
                onChange={(event) => {
                  engine.setEstimatedFps(side, Number(event.currentTarget.value))
                  event.currentTarget.blur()
                }}
              >
                {fpsOptions.map((fps) => (
                  <option key={fps} value={String(fps)}>{formatFps(fps)} fps</option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      ) : null}

      {props.dragging ? <div className="dvp-drop-hint">松开以打开视频</div> : null}
    </div>
  )
}

export function App({ engine }: AppProps): ReactElement {
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot)
  const rootRef = useRef<HTMLDivElement>(null)
  const leftHostRef = useRef<HTMLDivElement>(null)
  const rightHostRef = useRef<HTMLDivElement>(null)
  const leftFileRef = useRef<HTMLInputElement>(null)
  const rightFileRef = useRef<HTMLInputElement>(null)
  const rangeRef = useRef<HTMLInputElement>(null)
  const scrubbingRef = useRef(false)
  const skipChangeRef = useRef(false)
  const [dragging, setDragging] = useState<PaneId | null>(null)
  const [selectedPane, setSelectedPane] = useState<PaneId | null>(null)

  const dual = snapshot.layout === 'dual'
  const left = snapshot.left
  const right = snapshot.right
  const master = snapshot.master === 'left'
    ? left
    : snapshot.master === 'right'
      ? right
      : null
  const masterSide = snapshot.master === 'right' ? '右' : '左'
  const timelineDuration = snapshot.timelineDuration
  const timelinePosition = snapshot.timelinePosition
  const rangeReady = timelineDuration > 0 && (dual ? (left.loaded || right.loaded) : left.loaded)
  const transportDisabled = !rangeReady
  const activeSelection = dual && selectedPane !== null && snapshot[selectedPane].loaded
    ? selectedPane
    : null
  const current = clamp(timelinePosition, 0, Math.max(timelineDuration, 0))
  const progress = timelineDuration > 0 ? Math.min(100, Math.max(0, (current / timelineDuration) * 100)) : 0
  const rangeStyle = { '--dvp-fill': `${progress}%` } as CSSProperties
  const volumeStyle = { '--dvp-volume': `${Math.round(snapshot.volume * 100)}%` } as CSSProperties
  const frameLabel = frameText(master)

  // The two video elements are engine-owned. Moving between the single stage
  // and the dual left pane re-attaches the same element, so playback state is
  // preserved across a layout change.
  useLayoutEffect(() => {
    const host = leftHostRef.current
    if (host === null) return
    engine.left.attach(host)
    return () => {
      engine.left.detach()
    }
  }, [engine, dual])

  useLayoutEffect(() => {
    if (!dual) return
    const host = rightHostRef.current
    if (host === null) return
    engine.right.attach(host)
    return () => {
      engine.right.detach()
    }
  }, [engine, dual])

  useEffect(() => {
    return () => {
      engine.detach()
    }
  }, [engine])

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
  }, [])

  // A native file picker returns focus to whatever was focused before it.
  // Once a pane is ready, hand the keyboard back to the page for arrow keys.
  useEffect(() => {
    if (snapshot.left.status === 'ready' || snapshot.right.status === 'ready') {
      rootRef.current?.focus({ preventScroll: true })
    }
  }, [snapshot.left.status, snapshot.right.status])

  const openPane = useCallback((side: PaneId): void => {
    if (side === 'left') leftFileRef.current?.click()
    else rightFileRef.current?.click()
  }, [])

  const pickTop = useCallback((): void => {
    if (!dual) {
      leftFileRef.current?.click()
      return
    }
    if (!left.loaded) {
      leftFileRef.current?.click()
      return
    }
    if (!right.loaded) rightFileRef.current?.click()
  }, [dual, left.loaded, right.loaded])

  const onFileChange = useCallback((side: PaneId, event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file === undefined) return
    setSelectedPane(null)
    engine.endAllHolds()
    void engine.openPane(side, file)
  }, [engine])

  const closePane = useCallback((side: PaneId): void => {
    if (selectedPane === side) setSelectedPane(null)
    engine.endAllHolds()
    engine.closePane(side)
  }, [engine, selectedPane])

  const toggleLayout = useCallback((checked: boolean): void => {
    setDragging(null)
    setSelectedPane(null)
    engine.endAllHolds()
    engine.setLayout(checked ? 'dual' : 'single')
  }, [engine])

  const selectPane = useCallback((side: PaneId): void => {
    if (!dual) return
    const live = engine.getSnapshot()[side]
    if (!live.loaded) {
      setSelectedPane(null)
      return
    }
    engine.endAllHolds()
    setSelectedPane(side)
    rootRef.current?.focus({ preventScroll: true })
  }, [dual, engine])

  const clearSelection = useCallback((): void => {
    engine.endAllHolds()
    setSelectedPane(null)
  }, [engine])

  // Clicking a video pane selects it; clicking anywhere outside the two panes
  // clears the selection. Range inputs select on pointerup instead, so their
  // default click action is not cancelled by a re-render.
  const onRootPointerDownCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dual) {
      clearSelection()
      return
    }
    const target = event.target as HTMLElement | null
    if (target?.closest('input[type="range"]') != null) return
    const paneElement = target?.closest<HTMLElement>('[data-pane]') ?? null
    if (paneElement === null) {
      clearSelection()
      return
    }
    const side = paneElement.dataset.pane as PaneId | undefined
    if (side === undefined) return
    const live = engine.getSnapshot()[side]
    if (!live.loaded) {
      clearSelection()
      return
    }
    engine.endAllHolds()
    setSelectedPane(side)
  }, [clearSelection, dual, engine])

  const onPaneDragOver = useCallback((side: PaneId, event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragging(side)
  }, [])

  const onPaneDragLeave = useCallback((side: PaneId, event: DragEvent<HTMLDivElement>): void => {
    const next = event.relatedTarget as Node | null
    if (next === null || !event.currentTarget.contains(next)) setDragging(null)
  }, [])

  const onPaneDrop = useCallback((side: PaneId, event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(null)
    const file = event.dataTransfer.files?.[0]
    if (file === undefined) return
    setSelectedPane(null)
    engine.endAllHolds()
    void engine.openPane(side, file)
  }, [engine])

  // The page is the keyboard owner while it is mounted. When a pane is
  // selected, arrows step that pane alone; otherwise they step the shared
  // timeline. Holding an arrow repeats from the engine's own timer (browser
  // auto-repeat is deliberately ignored so the cadence is ours, not the OS's).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const live = engine.getSnapshot()
      const active = live.layout === 'single'
        ? live.left.loaded
        : live.left.loaded || live.right.loaded
      if (!active) return
      const selected = live.layout === 'dual' && selectedPane !== null && live[selectedPane].loaded
        ? selectedPane
        : null
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.isComposing) return
      if (document.querySelector('[role="dialog"]') !== null) return
      const focused = document.activeElement
      const root = rootRef.current
      if (focused !== null && focused !== document.body && focused !== document.documentElement) {
        if (root === null || !root.contains(focused)) return
      }
      if (isEditable(event.target)) return
      const target = event.target as HTMLElement | null
      if (event.code === 'Space' && target?.tagName === 'BUTTON') return
      switch (event.code) {
        case 'ArrowLeft':
          event.preventDefault()
          if (!event.repeat) engine.beginHold(-1, event.shiftKey ? 10 : 1, selected)
          break
        case 'ArrowRight':
          event.preventDefault()
          if (!event.repeat) engine.beginHold(1, event.shiftKey ? 10 : 1, selected)
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
          if (!event.repeat) engine.setVolume(Math.min(1, live.volume + 0.05))
          break
        case 'ArrowDown':
          event.preventDefault()
          if (!event.repeat) engine.setVolume(Math.max(0, live.volume - 0.05))
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
  }, [engine, selectedPane])

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
    clearSelection()
  }, [clearSelection, engine])

  const onRangeChange = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    if (skipChangeRef.current || scrubbingRef.current) return
    engine.scrubStart()
    void engine.scrubEnd(Number(event.currentTarget.value))
  }, [engine])

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

  const seekPane = useCallback((side: PaneId, seconds: number): void => {
    engine.previewPane(side, seconds)
  }, [engine])

  const setPaneStart = useCallback((side: PaneId): void => {
    void engine.setPaneStartAtCurrent(side)
  }, [engine])

  const selectTopDisabled = dual && left.loaded && right.loaded
  const selectTopTitle = selectTopDisabled
    ? '两个画面都已打开视频；点画面右上角的 × 更换'
    : dual && left.loaded
      ? '为右画面选择视频'
      : '选择本地视频'

  return (
    <div
      className="dvp-root"
      ref={rootRef}
      tabIndex={-1}
      onPointerDownCapture={onRootPointerDownCapture}
      onPointerUp={onRootPointerUp}
    >
      <header className="dvp-header">
        <div className="dvp-brand">
          <span className="dvp-logo"><VideoGlyph size={20} /></span>
          <div className="dvp-brand-text">
            <h1>视频逐帧播放器</h1>
            <p>逐帧检视 · 方向键单步/按住连续 · 点画面选中后单独逐帧 · 支持同步对比、倒放与静音</p>
          </div>
        </div>

        <div className="dvp-header-meta">
          {dual ? (
            <>
              <span className="dvp-chip strong">左右对比</span>
              {left.loaded ? <span className="dvp-chip">左 {formatFps(left.fps)} fps</span> : null}
              {right.loaded ? <span className="dvp-chip">右 {formatFps(right.fps)} fps</span> : null}
              {!left.loaded ? <span className="dvp-chip warn">等待左画面</span> : null}
              {!right.loaded ? <span className="dvp-chip warn">等待右画面</span> : null}
            </>
          ) : left.loaded ? (
            <>
              <span className="dvp-chip strong">{left.codec.length > 0 ? left.codec : '视频'}</span>
              <span className="dvp-chip">{formatFps(left.fps)} fps</span>
              {left.width > 0 && left.height > 0 ? (
                <span className="dvp-chip">{left.width}×{left.height}</span>
              ) : null}
              {left.frameSource === 'estimated' ? <span className="dvp-chip warn">帧率估算</span> : null}
              {left.start > 0.000_1 ? (
                <button
                  type="button"
                  className="dvp-chip"
                  title="点击把起点清零"
                  onClick={() => { void engine.setPaneStart('left', 0) }}
                >
                  起点 {formatClock(left.start)}
                </button>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="dvp-header-actions">
          {!dual && left.status !== 'empty' ? (
            <button
              type="button"
              className="dvp-btn ghost small"
              onClick={() => closePane('left')}
              title="关闭当前视频"
            >
              <CloseIcon size={14} />
              <span>关闭</span>
            </button>
          ) : null}
          <button
            type="button"
            className="dvp-btn primary"
            onClick={pickTop}
            disabled={selectTopDisabled}
            title={selectTopTitle}
          >
            <UploadIcon size={16} />
            <span>选择视频</span>
          </button>
          <label className="dvp-switch" title="开启左右布局，两个画面同步播放">
            <span className="dvp-switch-label">左右布局</span>
            <input
              type="checkbox"
              checked={dual}
              aria-label="左右布局"
              onChange={(event) => toggleLayout(event.currentTarget.checked)}
            />
            <span className="dvp-switch-track" aria-hidden="true">
              <span className="dvp-switch-thumb" />
            </span>
          </label>
        </div>
      </header>

      <main className="dvp-body">
        {dual ? (
          <div className="dvp-stage dvp-stage-dual" data-ready={left.loaded || right.loaded ? 'true' : 'false'}>
            <PaneCard
              engine={engine}
              pane={left}
              side="left"
              hostRef={leftHostRef}
              fileRef={leftFileRef}
              dragging={dragging === 'left'}
              selected={activeSelection === 'left'}
              onSelect={selectPane}
              onFileChange={onFileChange}
              onPick={openPane}
              onClose={closePane}
              onPaneSeek={seekPane}
              onSetStart={setPaneStart}
              onTogglePlay={togglePlay}
              onDragOver={onPaneDragOver}
              onDragLeave={onPaneDragLeave}
              onDrop={onPaneDrop}
            />
            <PaneCard
              engine={engine}
              pane={right}
              side="right"
              hostRef={rightHostRef}
              fileRef={rightFileRef}
              dragging={dragging === 'right'}
              selected={activeSelection === 'right'}
              onSelect={selectPane}
              onFileChange={onFileChange}
              onPick={openPane}
              onClose={closePane}
              onPaneSeek={seekPane}
              onSetStart={setPaneStart}
              onTogglePlay={togglePlay}
              onDragOver={onPaneDragOver}
              onDragLeave={onPaneDragLeave}
              onDrop={onPaneDrop}
            />
            {snapshot.notice !== null ? <div className="dvp-toast">{snapshot.notice}</div> : null}
          </div>
        ) : (
          <div
            className={dragging === 'left' ? 'dvp-stage dragging' : 'dvp-stage'}
            data-ready={left.loaded ? 'true' : 'false'}
            onDragOver={(event) => onPaneDragOver('left', event)}
            onDragLeave={(event) => onPaneDragLeave('left', event)}
            onDrop={(event) => onPaneDrop('left', event)}
            onDoubleClick={left.loaded ? togglePlay : undefined}
          >
            <div ref={leftHostRef} className="dvp-video-host" aria-hidden="true" />
            <input
              ref={leftFileRef}
              type="file"
              accept={FILE_ACCEPT}
              style={{ display: 'none' }}
              onChange={(event) => onFileChange('left', event)}
            />

            {left.status === 'empty' ? (
              <div className="dvp-overlay">
                <div className="dvp-empty">
                  <span className="dvp-empty-orb"><VideoGlyph size={34} /></span>
                  <h2>打开一个视频，开始逐帧检视</h2>
                  <p>
                    选择本地 MP4 文件，或直接把视频拖到这里。播放、暂停、逐帧和倒放都在本机完成，
                    视频不会上传到任何服务器；打开右上角的「左右布局」可以同步对比两个视频。
                  </p>
                  <button type="button" className="dvp-btn primary" onClick={() => openPane('left')}>
                    <UploadIcon size={17} />
                    <span>选择本地视频</span>
                  </button>
                  <div className="dvp-empty-features">
                    <span>← / → 单帧 · 按住连续</span>
                    <span>倒放</span>
                    <span>点击进度条跳转</span>
                    <span>静音</span>
                    <span>左右同步对比</span>
                  </div>
                </div>
              </div>
            ) : null}

            {left.status === 'loading' ? (
              <div className="dvp-overlay">
                <div className="dvp-loading">
                  <span className="dvp-spinner" />
                  <strong>正在读取视频并解析帧表…</strong>
                  <span>{left.fileName}</span>
                </div>
              </div>
            ) : null}

            {left.status === 'error' ? (
              <div className="dvp-overlay">
                <div className="dvp-error">
                  <span className="dvp-error-icon"><AlertIcon size={26} /></span>
                  <strong>无法打开这个视频</strong>
                  <p>{left.error ?? '未知错误。请换一个 H.264/AAC 编码的 MP4 文件再试。'}</p>
                  <div className="dvp-error-actions">
                    <button type="button" className="dvp-btn" onClick={() => openPane('left')}>重新选择</button>
                    <button type="button" className="dvp-btn" onClick={() => closePane('left')}>关闭</button>
                  </div>
                </div>
              </div>
            ) : null}

            {left.loaded ? (
              <>
                <div className="dvp-stage-tools">
                  <span className="dvp-stage-tag" title={left.fileName}>
                    <strong>{left.fileName}</strong>
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
                  <span>帧 <strong>{frameText(left)}</strong></span>
                </div>
                <div className="dvp-stage-info">
                  {left.width > 0 ? `${left.width}×${left.height} · ` : ''}
                  {formatFps(left.fps)} fps · {formatSize(left.fileSize)}
                </div>
              </>
            ) : null}

            {snapshot.notice !== null ? <div className="dvp-toast">{snapshot.notice}</div> : null}
            {dragging === 'left' ? <div className="dvp-drop-hint">松开以打开视频</div> : null}
          </div>
        )}

        <div className="dvp-controls">
          <div className="dvp-timeline-row">
            <span className="dvp-time" title="同步时间">{formatClock(current)}</span>
            <div className="dvp-range-wrap" style={rangeStyle}>
              <div className="dvp-range-track" aria-hidden="true">
                <div className="dvp-range-fill" />
              </div>
              <input
                ref={rangeRef}
                className="dvp-range"
                type="range"
                min={0}
                max={Math.max(timelineDuration, 0.001)}
                step="any"
                value={Math.min(current, Math.max(timelineDuration, 0.001))}
                disabled={transportDisabled}
                aria-label="同步播放进度"
                onPointerDown={onRangePointerDown}
                onPointerUp={onRangePointerUp}
                onPointerCancel={onRangePointerUp}
                onInput={onRangeInput}
                onChange={onRangeChange}
              />
            </div>
            <span className="dvp-time total" title="同步时长">{formatClock(timelineDuration)}</span>
          </div>

          <div className="dvp-transport">
            <div className="dvp-group">
              <button
                type="button"
                className="dvp-iconbtn"
                disabled={transportDisabled}
                onClick={() => engine.firstFrame()}
                title="第一帧 (Home)"
                aria-label="跳到第一帧"
              >
                <JumpStartIcon />
              </button>
              <button
                type="button"
                className="dvp-iconbtn"
                disabled={transportDisabled}
                onClick={() => void engine.step(-1)}
                title="上一帧 (←，按住连续)"
                aria-label="上一帧"
              >
                <StepBackIcon />
              </button>
              <button
                type="button"
                className="dvp-play"
                disabled={transportDisabled}
                onClick={togglePlay}
                title={snapshot.playing ? '暂停 (Space)' : '播放 (Space)'}
                aria-label={snapshot.playing ? '暂停' : '播放'}
              >
                {snapshot.playing ? <PauseIcon size={21} /> : <PlayIcon size={22} />}
              </button>
              <button
                type="button"
                className="dvp-iconbtn"
                disabled={transportDisabled}
                onClick={() => void engine.step(1)}
                title="下一帧 (→，按住连续)"
                aria-label="下一帧"
              >
                <StepForwardIcon />
              </button>
              <button
                type="button"
                className="dvp-iconbtn"
                disabled={transportDisabled}
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
                disabled={transportDisabled || (master?.frameCount ?? 0) < 2}
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

            <div className="dvp-frame-pill" title={dual ? '同步时间对应的主画面帧' : '当前帧 / 总帧数'}>
              <FrameIcon size={14} />
              <span>
                {dual ? '同步帧' : '帧'} <strong>{frameLabel}</strong>
                {dual && master !== null ? <span className="dvp-total"> · {masterSide}</span> : null}
              </span>
            </div>

            {!dual && left.frameSource === 'estimated' && left.loaded ? (
              <label className="dvp-select-label" title="无法读取精确帧表时，可手动修正帧率">
                <select
                  className="dvp-select"
                  value={String(left.fps)}
                  onChange={(event) => {
                    engine.setEstimatedFps('left', Number(event.currentTarget.value))
                    rootRef.current?.focus({ preventScroll: true })
                  }}
                  aria-label="估算帧率"
                >
                  {COMMON_FPS.map((fps) => (
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
                title={snapshot.muted ? '取消静音 (M)' : '静音两个画面 (M)'}
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
                onPointerUp={clearSelection}
                aria-label="音量"
                title={`音量 ${Math.round(snapshot.volume * 100)}%`}
              />
            </div>
          </div>

          <div className="dvp-hint">
            <span>
              <kbd>←</kbd> <kbd>→</kbd>{' '}
              {activeSelection !== null
                ? `${sideLabel(activeSelection)}单独逐帧`
                : dual
                  ? '两画面同步逐帧'
                  : '逐帧'}
            </span>
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
            <span>
              {activeSelection !== null
                ? '点画面外恢复同步逐帧'
                : dual
                  ? '点画面选中后方向键单独逐帧；每格下方可设起点'
                  : '点击进度条跳转'}
            </span>
          </div>
        </div>
      </main>
    </div>
  )
}
