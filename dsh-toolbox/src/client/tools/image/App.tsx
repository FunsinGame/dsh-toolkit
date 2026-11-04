/**
 * 图片对比 — a two-image comparison stage with six views.
 *
 * The layout mirrors the way people actually check a changed export: pick the
 * original as A and the new file as B, then look at the same pair through
 * 分割 / 滑块 / 淡化 / 闪烁 / 相减 / 高亮. A defines the frame; B is contained or
 * stretched into it. Zoom and pan are shared by both panes of the split view and
 * survive mode switches.
 *
 * Everything is local: files are decoded with `HTMLImageElement.decode()` and
 * compared on a canvas. Nothing is uploaded, and this tool has no host route.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react'

import {
  computeDiff,
  exportDifferencePng,
  exportHighlightPng,
  formatBytes,
  loadImageFile,
  renderDifference,
  renderHighlight,
  summarize,
  type AlignMode,
  type DiffStats,
  type DiffData,
  type LoadedImage,
} from './diff'
import { readImageState, rememberImageState, type CompareMode } from './store'
import {
  AlertIcon,
  BlinkIcon,
  CloseIcon,
  DifferenceIcon,
  DownloadIcon,
  FadeIcon,
  FitIcon,
  HighlightIcon,
  ImageGlyph,
  PauseIcon,
  PlayIcon,
  SliderIcon,
  SplitIcon,
  SwapIcon,
  UploadIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './icons'

interface AppProps {
  /** False while another toolbox tool is showing; pauses the blink timer. */
  readonly active?: boolean
}

type Slot = 'a' | 'b'
type Mode = CompareMode

interface ViewState {
  /** Scale multiplier over the fit scale; 1 = fit the stage. */
  readonly zoom: number
  /** Pan offset in screen pixels from the centered position. */
  readonly x: number
  readonly y: number
}

interface ModeEntry {
  readonly id: Mode
  readonly label: string
  readonly hint: string
  readonly icon: (props: { size?: number }) => ReactElement
}

const MODES: readonly ModeEntry[] = [
  { id: 'split', label: '分割', hint: '两张图并排，缩放与平移同步', icon: SplitIcon },
  { id: 'slider', label: '滑块', hint: '拖动分隔线，从一张图揭晓另一张', icon: SliderIcon },
  { id: 'fade', label: '淡化', hint: '把 B 渐渐叠到 A 上，寻找重影', icon: FadeIcon },
  { id: 'blink', label: '闪烁', hint: '在原位交替显示 A 与 B', icon: BlinkIcon },
  { id: 'difference', label: '相减', hint: '逐像素相减，相同处为黑', icon: DifferenceIcon },
  { id: 'highlight', label: '高亮', hint: '把变化的像素标成红绿', icon: HighlightIcon },
]

const INTERVALS = [150, 300, 500, 800, 1200] as const
const ZOOM_MIN = 0.1
const ZOOM_MAX = 12
const DEFAULT_VIEW: ViewState = { zoom: 1, x: 0, y: 0 }

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function modeLabel(mode: Mode): string {
  return MODES.find((entry) => entry.id === mode)?.label ?? mode
}

/* ── stage ─────────────────────────────────────────────────────────────── */

interface Metrics {
  readonly stageWidth: number
  readonly stageHeight: number
  readonly fit: number
  readonly scale: number
  readonly tx: number
  readonly ty: number
}

interface StageBoxProps {
  readonly contentWidth: number
  readonly contentHeight: number
  readonly view: ViewState
  readonly onView: (next: ViewState) => void
  readonly onFit: (fit: number) => void
  readonly overlay?: ((metrics: Metrics) => ReactNode) | undefined
  readonly children: (metrics: Metrics) => ReactNode
}

/**
 * One pannable, zoomable viewport. The scene is positioned from the top-left
 * with an explicit scale so the math for zooming under the cursor stays simple.
 */
function StageBox(props: StageBoxProps): ReactElement {
  const { contentWidth, contentHeight, view, onView, onFit } = props
  const stageRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; origin: ViewState } | null>(null)

  useEffect(() => {
    const element = stageRef.current
    if (element === null) return
    const measure = (): void => {
      setSize({ width: element.clientWidth, height: element.clientHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [])

  const fit = size.width > 0 && size.height > 0 && contentWidth > 0 && contentHeight > 0
    ? Math.min(size.width / contentWidth, size.height / contentHeight) * 0.96
    : 1

  useEffect(() => {
    if (fit > 0) onFit(fit)
  }, [fit, onFit])

  const scale = fit * view.zoom
  const baseX = (size.width - contentWidth * scale) / 2
  const baseY = (size.height - contentHeight * scale) / 2
  const tx = baseX + view.x
  const ty = baseY + view.y

  // Keep at least the middle of the image reachable.
  const clampPan = useCallback((next: ViewState): ViewState => {
    const limitX = (size.width + contentWidth * scale) / 2
    const limitY = (size.height + contentHeight * scale) / 2
    return { ...next, x: clamp(next.x, -limitX, limitX), y: clamp(next.y, -limitY, limitY) }
  }, [contentHeight, contentWidth, scale, size.height, size.width])

  useEffect(() => {
    const element = stageRef.current
    if (element === null) return
    const onWheel = (event: WheelEvent): void => {
      if (contentWidth <= 0 || contentHeight <= 0) return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top
      const currentScale = fit * view.zoom
      const nextZoom = clamp(view.zoom * Math.exp(-event.deltaY * 0.0015), ZOOM_MIN, ZOOM_MAX)
      const nextScale = fit * nextZoom
      if (currentScale <= 0 || Math.abs(nextScale - currentScale) < 1e-6) return
      const contentX = (pointerX - baseX - view.x) / currentScale
      const contentY = (pointerY - baseY - view.y) / currentScale
      const nextBaseX = (size.width - contentWidth * nextScale) / 2
      const nextBaseY = (size.height - contentHeight * nextScale) / 2
      const nextX = pointerX - contentX * nextScale - nextBaseX
      const nextY = pointerY - contentY * nextScale - nextBaseY
      const limitX = (size.width + contentWidth * nextScale) / 2
      const limitY = (size.height + contentHeight * nextScale) / 2
      onView({
        zoom: nextZoom,
        x: clamp(nextX, -limitX, limitX),
        y: clamp(nextY, -limitY, limitY),
      })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', onWheel)
    }
  }, [baseX, baseY, contentHeight, contentWidth, fit, onView, size.height, size.width, view])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target?.closest('.dti-no-pan') != null) return
    event.currentTarget.setPointerCapture(event.pointerId)
    panRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: view }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const pan = panRef.current
    if (pan === null || pan.pointerId !== event.pointerId) return
    onView(clampPan({
      zoom: pan.origin.zoom,
      x: pan.origin.x + (event.clientX - pan.startX),
      y: pan.origin.y + (event.clientY - pan.startY),
    }))
  }

  const endPan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const pan = panRef.current
    if (pan === null || pan.pointerId !== event.pointerId) return
    panRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const metrics: Metrics = {
    stageWidth: size.width,
    stageHeight: size.height,
    fit,
    scale,
    tx,
    ty,
  }

  return (
    <div
      ref={stageRef}
      className="dti-stage"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onDoubleClick={() => onView(DEFAULT_VIEW)}
    >
      <div
        className="dti-scene"
        style={{
          width: contentWidth,
          height: contentHeight,
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        }}
      >
        {props.children(metrics)}
      </div>
      {props.overlay?.(metrics)}
    </div>
  )
}

/* ── source cards ─────────────────────────────────────────────────────── */

interface DropCardProps {
  readonly slot: Slot
  readonly image: LoadedImage | null
  readonly dragging: boolean
  readonly loading: boolean
  readonly onPick: () => void
  readonly onClear: () => void
  readonly onDragOver: (event: DragEvent<HTMLDivElement | HTMLButtonElement>) => void
  readonly onDragLeave: (event: DragEvent<HTMLDivElement | HTMLButtonElement>) => void
  readonly onDrop: (event: DragEvent<HTMLDivElement | HTMLButtonElement>) => void
}

function DropCard(props: DropCardProps): ReactElement {
  const title = props.slot === 'a' ? '图片 A · 原图' : '图片 B · 对比图'
  const handlers = {
    onDragOver: props.onDragOver,
    onDragLeave: props.onDragLeave,
    onDrop: props.onDrop,
  }

  if (props.image === null) {
    return (
      <button
        type="button"
        className="dti-drop"
        data-dragging={props.dragging ? 'true' : 'false'}
        data-slot={props.slot}
        onClick={props.onPick}
        {...handlers}
      >
        <span className="dti-drop-orb">
          {props.loading ? <span className="dti-spinner" /> : <UploadIcon size={22} />}
        </span>
        <strong>{title}</strong>
        <p>{props.loading ? '正在读取图片…' : '点击选择、把图片拖到这里，或直接按 Ctrl+V 粘贴截图'}</p>
        <span className="dti-drop-formats">PNG · JPEG · WebP · GIF · BMP · AVIF</span>
      </button>
    )
  }

  return (
    <div
      className="dti-drop"
      data-loaded="true"
      data-dragging={props.dragging ? 'true' : 'false'}
      data-slot={props.slot}
      {...handlers}
    >
      <div className="dti-drop-preview">
        <img src={props.image.url} alt={props.image.name} draggable={false} />
        <span className="dti-drop-badge">{props.slot === 'a' ? 'A · 原图' : 'B · 对比图'}</span>
      </div>
      <div className="dti-drop-bar">
        <div className="dti-drop-meta">
          <strong title={props.image.name}>{props.image.name}</strong>
          <span>
            {props.image.width}×{props.image.height} · {formatBytes(props.image.size)}
          </span>
        </div>
        <button type="button" className="dti-btn ghost" onClick={props.onPick}>更换</button>
        <button type="button" className="dti-iconbtn" title="移除这张图片" aria-label="移除这张图片" onClick={props.onClear}>
          <CloseIcon size={14} />
        </button>
      </div>
    </div>
  )
}

/* ── tool ──────────────────────────────────────────────────────────────── */

export function App({ active = true }: AppProps): ReactElement {
  const [a, setA] = useState<LoadedImage | null>(() => readImageState().a)
  const [b, setB] = useState<LoadedImage | null>(() => readImageState().b)
  const [mode, setMode] = useState<Mode>(() => readImageState().mode)
  const [align, setAlign] = useState<AlignMode>(() => readImageState().align)
  const [threshold, setThreshold] = useState(() => readImageState().threshold)
  const [gain, setGain] = useState(() => readImageState().gain)
  const [fade, setFade] = useState(() => readImageState().fade)
  const [sliderRatio, setSliderRatio] = useState(() => readImageState().sliderRatio)
  const [blinkMs, setBlinkMs] = useState<number>(() => readImageState().blinkMs)
  const [blinkRunning, setBlinkRunning] = useState(true)
  const [blinkB, setBlinkB] = useState(false)
  const [showGray, setShowGray] = useState(() => readImageState().showGray)
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW)
  const [fit, setFit] = useState(1)
  const [diff, setDiff] = useState<DiffData | null>(null)
  const [computing, setComputing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState<Slot | null>(null)
  const [loadingSlot, setLoadingSlot] = useState<Slot | null>(null)
  const [exporting, setExporting] = useState(false)

  const aRef = useRef<LoadedImage | null>(readImageState().a)
  const bRef = useRef<LoadedImage | null>(readImageState().b)
  const fileARef = useRef<HTMLInputElement>(null)
  const fileBRef = useRef<HTMLInputElement>(null)
  const diffCanvasRef = useRef<HTMLCanvasElement>(null)
  const noticeTimer = useRef<number | null>(null)
  const dividerDrag = useRef<{ rectLeft: number; tx: number; scale: number } | null>(null)

  const flash = useCallback((text: string): void => {
    setNotice(text)
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => {
      noticeTimer.current = null
      setNotice(null)
    }, 2600)
  }, [])

  // The image pair outlives this component (the toolbox page unmounts when the
  // user opens the conversation), so only the local timer is released here.
  useEffect(() => {
    return () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    }
  }, [])

  useEffect(() => {
    rememberImageState({ a, b, mode, align, threshold, gain, fade, sliderRatio, blinkMs, showGray })
  }, [a, b, mode, align, threshold, gain, fade, sliderRatio, blinkMs, showGray])

  const assign = useCallback(async (slot: Slot, file: File): Promise<void> => {
    setError(null)
    setLoadingSlot(slot)
    try {
      const image = await loadImageFile(file)
      const previous = slot === 'a' ? aRef.current : bRef.current
      if (previous !== null) URL.revokeObjectURL(previous.url)
      if (slot === 'a') {
        aRef.current = image
        setA(image)
      } else {
        bRef.current = image
        setB(image)
      }
      setView(DEFAULT_VIEW)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取这张图片')
    } finally {
      setLoadingSlot(null)
    }
  }, [])

  const pick = useCallback((slot: Slot): void => {
    if (slot === 'a') fileARef.current?.click()
    else fileBRef.current?.click()
  }, [])

  const onFileChange = useCallback((slot: Slot, event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file === undefined) return
    void assign(slot, file)
  }, [assign])

  const clearSlot = useCallback((slot: Slot): void => {
    const image = slot === 'a' ? aRef.current : bRef.current
    if (image !== null) URL.revokeObjectURL(image.url)
    if (slot === 'a') {
      aRef.current = null
      setA(null)
    } else {
      bRef.current = null
      setB(null)
    }
    setView(DEFAULT_VIEW)
  }, [])

  const clearAll = useCallback((): void => {
    clearSlot('a')
    clearSlot('b')
    setError(null)
  }, [clearSlot])

  const swap = useCallback((): void => {
    const left = aRef.current
    const right = bRef.current
    aRef.current = right
    bRef.current = left
    setA(right)
    setB(left)
    setView(DEFAULT_VIEW)
  }, [])

  const onDragOver = useCallback((slot: Slot) => (event: DragEvent<HTMLDivElement | HTMLButtonElement>): void => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragging(slot)
  }, [])

  const onDragLeave = useCallback((slot: Slot) => (event: DragEvent<HTMLDivElement | HTMLButtonElement>): void => {
    const next = event.relatedTarget as Node | null
    if (next === null || !event.currentTarget.contains(next)) {
      setDragging((current) => (current === slot ? null : current))
    }
  }, [])

  const onDrop = useCallback((slot: Slot) => (event: DragEvent<HTMLDivElement | HTMLButtonElement>): void => {
    event.preventDefault()
    setDragging(null)
    const file = event.dataTransfer.files?.[0]
    if (file === undefined) return
    void assign(slot, file)
  }, [assign])

  // Paste is scoped to the visible tool: the first empty slot receives the
  // clipboard image, and a full pair asks the user to clear one first.
  useEffect(() => {
    if (!active) return
    const onPaste = (event: ClipboardEvent): void => {
      const data = event.clipboardData
      if (data === null) return
      const file = Array.from(data.files).find((candidate) => candidate.type.startsWith('image/'))
      if (file === undefined) return
      event.preventDefault()
      const slot: Slot | null = aRef.current === null ? 'a' : bRef.current === null ? 'b' : null
      if (slot === null) {
        flash('两张图都已就绪：先移除一张再粘贴')
        return
      }
      void assign(slot, file)
    }
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('paste', onPaste)
    }
  }, [active, assign, flash])

  // Blink alternates in place. The timer only exists while the view is in front.
  useEffect(() => {
    if (!active || mode !== 'blink' || !blinkRunning || a === null || b === null) {
      setBlinkB(false)
      return
    }
    const timer = window.setInterval(() => {
      setBlinkB((value) => !value)
    }, blinkMs)
    return () => {
      window.clearInterval(timer)
    }
  }, [active, a, b, blinkMs, blinkRunning, mode])

  useEffect(() => {
    if (a === null || b === null) {
      setDiff(null)
      setComputing(false)
      return
    }
    let cancelled = false
    setComputing(true)
    const timer = window.setTimeout(() => {
      try {
        const result = computeDiff(a, b, align)
        if (cancelled) return
        setDiff(result)
        setError(null)
      } catch (reason) {
        if (cancelled) return
        setDiff(null)
        setError(reason instanceof Error ? reason.message : '逐像素比较失败')
      } finally {
        if (!cancelled) setComputing(false)
      }
    }, 30)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [a, b, align])

  const stats: DiffStats | null = useMemo(() => {
    if (diff === null) return null
    return summarize(diff, threshold)
  }, [diff, threshold])

  useEffect(() => {
    const canvas = diffCanvasRef.current
    if (canvas === null || diff === null) return
    try {
      if (mode === 'difference') renderDifference(canvas, diff, gain)
      else if (mode === 'highlight') renderHighlight(canvas, diff, threshold)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法绘制差异图')
    }
  }, [diff, gain, mode, threshold])

  const handleFit = useCallback((value: number): void => {
    setFit(value)
  }, [])

  const zoomBy = useCallback((factor: number): void => {
    setView((current) => ({ ...current, zoom: clamp(current.zoom * factor, ZOOM_MIN, ZOOM_MAX) }))
  }, [])

  const fitView = useCallback((): void => {
    setView(DEFAULT_VIEW)
  }, [])

  const actualSize = useCallback((): void => {
    setView({ zoom: fit > 0 ? clamp(1 / fit, ZOOM_MIN, ZOOM_MAX) : 1, x: 0, y: 0 })
  }, [fit])

  const exportDiff = useCallback(async (): Promise<void> => {
    if (diff === null) return
    setExporting(true)
    try {
      const blob = mode === 'highlight'
        ? await exportHighlightPng(diff, threshold, showGray ? b?.element ?? null : null)
        : await exportDifferencePng(diff, gain)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `image-${mode}-${Date.now()}.png`
      link.rel = 'noopener'
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 5000)
      flash('差异图已导出为 PNG')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '导出失败')
    } finally {
      setExporting(false)
    }
  }, [b, diff, flash, gain, mode, showGray, threshold])

  const startDivider = useCallback((event: ReactPointerEvent<HTMLDivElement>, metrics: Metrics): void => {
    event.preventDefault()
    event.stopPropagation()
    const stage = (event.currentTarget as HTMLElement).closest('.dti-stage')
    if (!(stage instanceof HTMLElement)) return
    const rect = stage.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    dividerDrag.current = { rectLeft: rect.left, tx: metrics.tx, scale: metrics.scale }
  }, [])

  const moveDivider = useCallback((event: ReactPointerEvent<HTMLDivElement>, contentWidth: number): void => {
    const drag = dividerDrag.current
    if (drag === null) return
    const ratio = (event.clientX - drag.rectLeft - drag.tx) / Math.max(1, contentWidth * drag.scale)
    setSliderRatio(clamp(ratio, 0.02, 0.98))
  }, [])

  const endDivider = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    dividerDrag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  // Slider mode owns the arrow keys while the tool is in front: nudging the
  // divider should not require focusing a 3 px handle first. Editable fields
  // and open dialogs keep their keys.
  useEffect(() => {
    if (!active || mode !== 'slider' || a === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable === true) return
      if (document.querySelector('[role="dialog"]') !== null) return
      event.preventDefault()
      const step = event.shiftKey ? 0.05 : 0.01
      setSliderRatio((current) => clamp(current + (event.key === 'ArrowRight' ? step : -step), 0.02, 0.98))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [a, active, mode])

  const zoomPercent = Math.max(1, Math.round(fit * view.zoom * 100))
  const sizesDiffer = a !== null && b !== null && (a.width !== b.width || a.height !== b.height)
  const alignClass = align === 'stretch' ? 'fill' : 'contain'

  const draggingCard = (slot: Slot): boolean => dragging === slot

  const sourceStrip = (): ReactElement | null => {
    if (a === null || b === null) return null
    const sourceCard = (slot: Slot, image: LoadedImage): ReactElement => (
      <div className="dti-source" data-slot={slot}>
        <img className="dti-source-thumb" src={image.url} alt="" draggable={false} />
        <div className="dti-source-text">
          <strong title={image.name}>
            <span className="dti-source-tag">{slot === 'a' ? 'A' : 'B'}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{image.name}</span>
          </strong>
          <span>{image.width}×{image.height} · {formatBytes(image.size)}</span>
        </div>
        <div className="dti-source-actions">
          <button type="button" className="dti-iconbtn" title={`更换图片 ${slot === 'a' ? 'A' : 'B'}`} onClick={() => pick(slot)}>
            <UploadIcon size={14} />
          </button>
          <button
            type="button"
            className="dti-iconbtn"
            title={`移除图片 ${slot === 'a' ? 'A' : 'B'}`}
            aria-label={`移除图片 ${slot === 'a' ? 'A' : 'B'}`}
            onClick={() => clearSlot(slot)}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      </div>
    )
    return (
      <div className="dti-sources">
        {sourceCard('a', a)}
        <button type="button" className="dti-swap" title="交换 A 与 B" aria-label="交换 A 与 B" onClick={swap}>
          <SwapIcon size={16} />
        </button>
        {sourceCard('b', b)}
      </div>
    )
  }

  const modeOptions = (): ReactElement | null => {
    switch (mode) {
      case 'split':
        return <span className="dti-opt">拖动平移 · 滚轮缩放 · 两侧同步</span>
      case 'slider':
        return <span className="dti-opt">拖动分隔线 · 聚焦后可用 ← → 微调</span>
      case 'fade':
        return (
          <label className="dti-opt">
            B 不透明度
            <input
              className="dti-range"
              type="range"
              min={0}
              max={100}
              step={1}
              value={fade}
              aria-label="B 不透明度"
              onChange={(event) => setFade(Number(event.currentTarget.value))}
            />
            <strong>{fade}%</strong>
          </label>
        )
      case 'blink':
        return (
          <>
            <label className="dti-opt">
              间隔
              <select value={String(blinkMs)} aria-label="闪烁间隔" onChange={(event) => setBlinkMs(Number(event.currentTarget.value))}>
                {INTERVALS.map((value) => (
                  <option key={value} value={String(value)}>{value} ms</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={blinkRunning ? 'dti-btn ghost' : 'dti-btn'}
              onClick={() => setBlinkRunning((value) => !value)}
            >
              {blinkRunning ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
              {blinkRunning ? '暂停闪烁' : '开始闪烁'}
            </button>
            <span className="dti-opt">当前 <strong>{blinkB ? 'B' : 'A'}</strong></span>
          </>
        )
      case 'difference':
        return (
          <>
            <label className="dti-opt">
              增益
              <input
                className="dti-range"
                type="range"
                min={1}
                max={16}
                step={1}
                value={gain}
                aria-label="相减增益"
                onChange={(event) => setGain(Number(event.currentTarget.value))}
              />
              <strong>×{gain}</strong>
            </label>
            <button type="button" className="dti-btn" onClick={() => { void exportDiff() }} disabled={exporting || diff === null}>
              <DownloadIcon size={14} />
              {exporting ? '导出中…' : '导出 PNG'}
            </button>
          </>
        )
      case 'highlight':
        return (
          <>
            <label className="dti-opt">
              阈值
              <input
                className="dti-range"
                type="range"
                min={0}
                max={128}
                step={1}
                value={threshold}
                aria-label="差异阈值"
                onChange={(event) => setThreshold(Number(event.currentTarget.value))}
              />
              <strong>{threshold}</strong>
            </label>
            <label className="dti-check">
              <input type="checkbox" checked={showGray} onChange={(event) => setShowGray(event.currentTarget.checked)} />
              灰度底
            </label>
            <button type="button" className="dti-btn" onClick={() => { void exportDiff() }} disabled={exporting || diff === null}>
              <DownloadIcon size={14} />
              {exporting ? '导出中…' : '导出 PNG'}
            </button>
          </>
        )
      default:
        return null
    }
  }

  const modeBar = (): ReactElement | null => {
    if (a === null || b === null) return null
    return (
      <div className="dti-modebar">
        <div className="dti-modes" role="tablist" aria-label="对比模式">
          {MODES.map((entry) => {
            const Icon = entry.icon
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                className="dti-mode"
                data-active={mode === entry.id ? 'true' : 'false'}
                aria-selected={mode === entry.id}
                title={entry.hint}
                onClick={() => setMode(entry.id)}
              >
                <Icon size={14} />
                <span>{entry.label}</span>
              </button>
            )
          })}
        </div>
        <div className="dti-options">
          {sizesDiffer ? (
            <label className="dti-opt" title="两张图尺寸不同时，决定 B 如何对齐到 A 的画框">
              尺寸不同
              <select value={align} aria-label="尺寸对齐方式" onChange={(event) => setAlign(event.currentTarget.value as AlignMode)}>
                <option value="contain">等比适应</option>
                <option value="stretch">拉伸填满</option>
              </select>
            </label>
          ) : null}
          {modeOptions()}
        </div>
      </div>
    )
  }

  const zoomControls = (): ReactElement => (
    <div className="dti-zoom">
      <button type="button" className="dti-iconbtn" title="缩小" aria-label="缩小" onClick={() => zoomBy(1 / Math.SQRT2)}>
        <ZoomOutIcon size={15} />
      </button>
      <button type="button" className="dti-zoom-label" title="切换到 100% 实际像素" onClick={actualSize}>
        {zoomPercent}%
      </button>
      <button type="button" className="dti-iconbtn" title="放大" aria-label="放大" onClick={() => zoomBy(Math.SQRT2)}>
        <ZoomInIcon size={15} />
      </button>
      <span className="dti-zoom-sep" />
      <button type="button" className="dti-iconbtn" title="适应窗口 (双击画面)" aria-label="适应窗口" onClick={fitView}>
        <FitIcon size={15} />
      </button>
    </div>
  )

  const stageTags = (): ReactElement | null => {
    switch (mode) {
      case 'slider':
        return (
          <>
            <span className="dti-tag">A · 原图</span>
            <span className="dti-tag right">B · 对比图</span>
          </>
        )
      case 'fade':
        return <span className="dti-tag">A → B · {fade}%</span>
      case 'blink':
        return <span className="dti-tag accent">{blinkB ? 'B · 对比图' : 'A · 原图'} · 闪烁</span>
      case 'difference':
        return <span className="dti-tag">相减 · 增益 ×{gain}</span>
      case 'highlight':
        return <span className="dti-tag">高亮 · 阈值 {threshold}</span>
      default:
        return null
    }
  }

  const overlay = mode === 'slider'
    ? (metrics: Metrics): ReactNode => {
        if (a === null) return null
        const x = metrics.tx + a.width * metrics.scale * sliderRatio
        if (x < 0 || x > metrics.stageWidth) return null
        return (
          <div
            className="dti-divider dti-no-pan"
            style={{ left: x }}
            onPointerDown={(event) => startDivider(event, metrics)}
            onPointerMove={(event) => moveDivider(event, a.width)}
            onPointerUp={endDivider}
            onPointerCancel={endDivider}
          >
            <span className="dti-divider-line" />
            <span
              className="dti-divider-handle"
              role="slider"
              tabIndex={0}
              aria-label="分隔线位置"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(sliderRatio * 100)}
            >
              <SliderIcon size={15} />
            </span>
          </div>
        )
      }
    : undefined

  return (
    <div className="dti-root">
      <header className="dti-header">
        <div className="dti-brand">
          <span className="dti-logo"><ImageGlyph size={20} /></span>
          <div className="dti-brand-text">
            <h1>图片对比</h1>
            <p>两张图，六种看法：分割 · 滑块 · 淡化 · 闪烁 · 相减 · 高亮</p>
          </div>
        </div>
        <div className="dti-header-actions">
          {error !== null ? <span className="dti-stat dti-warn"><AlertIcon size={14} />比较出错</span> : null}
          {a !== null || b !== null ? (
            <button type="button" className="dti-btn ghost" onClick={clearAll}>清除全部</button>
          ) : null}
        </div>
      </header>

      {a === null || b === null ? (
        <div className="dti-picker">
          <div className="dti-picker-grid">
            <DropCard
              slot="a"
              image={a}
              dragging={draggingCard('a')}
              loading={loadingSlot === 'a'}
              onPick={() => pick('a')}
              onClear={() => clearSlot('a')}
              onDragOver={onDragOver('a')}
              onDragLeave={onDragLeave('a')}
              onDrop={onDrop('a')}
            />
            <DropCard
              slot="b"
              image={b}
              dragging={draggingCard('b')}
              loading={loadingSlot === 'b'}
              onPick={() => pick('b')}
              onClear={() => clearSlot('b')}
              onDragOver={onDragOver('b')}
              onDragLeave={onDragLeave('b')}
              onDrop={onDrop('b')}
            />
          </div>
          <div className="dti-picker-tips">
            <span>支持 PNG / JPEG / WebP / GIF / BMP / AVIF</span>
            <span className="dot" />
            <span>也可以直接 Ctrl+V 粘贴截图</span>
            <span className="dot" />
            <span>图片只在本机解码，不会上传</span>
          </div>
        </div>
      ) : (
        <>
          {sourceStrip()}
          {modeBar()}
          <div className="dti-canvas">
            {mode === 'split' ? (
              <div className="dti-split">
                {(['a', 'b'] as const).map((slot) => {
                  const image = slot === 'a' ? a : b
                  return (
                    <div className="dti-split-pane" key={slot} data-slot={slot}>
                      <StageBox
                        contentWidth={a.width}
                        contentHeight={a.height}
                        view={view}
                        onView={setView}
                        onFit={handleFit}
                      >
                        {() => (
                          <img
                            className={slot === 'a' ? 'dti-layer fill' : `dti-layer ${alignClass}`}
                            src={image.url}
                            alt={slot === 'a' ? '图片 A' : '图片 B'}
                            draggable={false}
                          />
                        )}
                      </StageBox>
                      <span className="dti-tag">{slot === 'a' ? 'A · 原图' : 'B · 对比图'}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <StageBox
                contentWidth={a.width}
                contentHeight={a.height}
                view={view}
                onView={setView}
                onFit={handleFit}
                overlay={overlay}
              >
                {() => (
                  <>
                    {mode === 'difference' || mode === 'highlight' ? (
                      <>
                        {mode === 'highlight' && showGray ? (
                          <img className="dti-layer gray" src={b.url} alt="" draggable={false} />
                        ) : null}
                        {mode === 'highlight' && !showGray ? <span className="dti-layer dti-white" /> : null}
                        <canvas ref={diffCanvasRef} className="dti-layer" />
                      </>
                    ) : (
                      <>
                        <img className="dti-layer fill" src={a.url} alt="图片 A" draggable={false} />
                        {mode === 'blink' ? (
                          blinkB ? <img className={`dti-layer ${alignClass}`} src={b.url} alt="图片 B" draggable={false} /> : null
                        ) : null}
                        {mode === 'fade' ? (
                          <img
                            className={`dti-layer ${alignClass}`}
                            src={b.url}
                            alt="图片 B"
                            draggable={false}
                            style={{ opacity: fade / 100 }}
                          />
                        ) : null}
                        {mode === 'slider' ? (
                          <img
                            className={`dti-layer ${alignClass}`}
                            src={b.url}
                            alt="图片 B"
                            draggable={false}
                            style={{ clipPath: `inset(0 ${(100 - sliderRatio * 100).toFixed(2)}% 0 0)` }}
                          />
                        ) : null}
                      </>
                    )}
                  </>
                )}
              </StageBox>
            )}

            {stageTags()}
            {zoomControls()}
            {computing ? (
              <div className="dti-canvas-note">
                <span className="dti-spinner" />
                正在逐像素比较…
              </div>
            ) : null}
            {error !== null ? <div className="dti-toast">{error}</div> : null}
            {notice !== null ? <div className="dti-toast ok">{notice}</div> : null}
          </div>

          <div className="dti-stats">
            <span className="dti-stat"><span className="dti-stat-badge">A</span><strong>{a.width}×{a.height}</strong> · {formatBytes(a.size)}</span>
            <span className="dti-stat"><span className="dti-stat-badge">B</span><strong>{b.width}×{b.height}</strong> · {formatBytes(b.size)}</span>
            <span className="dti-sep" />
            {stats !== null ? (
              <span className="dti-stat accent">
                差异 <strong>{stats.changed.toLocaleString()}</strong> px · {(stats.ratio * 100).toFixed(2)}% · 最大 Δ{stats.maxDelta}
                {stats.bbox !== null ? ` · 区域 ${stats.bbox.width}×${stats.bbox.height}` : ''}
              </span>
            ) : (
              <span className="dti-stat">等待比较…</span>
            )}
            {sizesDiffer ? <span className="dti-stat dti-warn">尺寸不同，已按 A 的画框对齐</span> : null}
            {diff !== null && (diff.width !== a.width || diff.height !== a.height) ? (
              <span className="dti-stat">按 {diff.width}×{diff.height} 栅格采样</span>
            ) : null}
            <span className="dti-stat muted">本地逐像素计算，图片不会上传</span>
          </div>
        </>
      )}

      <input
        ref={fileARef}
        type="file"
        data-slot="a"
        accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif"
        style={{ display: 'none' }}
        onChange={(event) => onFileChange('a', event)}
      />
      <input
        ref={fileBRef}
        type="file"
        data-slot="b"
        accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif"
        style={{ display: 'none' }}
        onChange={(event) => onFileChange('b', event)}
      />
    </div>
  )
}

