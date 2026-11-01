import { useEffect, useRef, useState } from 'react'
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from 'react'

import {
  applyMove,
  applyResize,
  clamp,
  clampScale,
  cursorForHandle,
  fitView,
  handleAt,
  handlePoints,
  inside,
  normalizeRect,
  rectFromPoints,
  rectToScreen,
  sameRect,
  toImagePoint,
  zoomAt,
  type Handle,
  type Point,
  type Rect,
} from '../geometry.ts'
import { useStore } from '../hook.ts'
import type { Annotation, DesignMindStore, ImageState } from '../store.ts'
import { Icon } from '../icons.tsx'

interface CanvasProps {
  store: DesignMindStore
  onOpen: () => void
  onPaste: () => void
  onDropFile: (file: File) => void
  onNotify: (message: string) => void
  busy: boolean
}

type RegionAnnotation = Extract<Annotation, { kind: 'region' }>

type Interaction =
  | { mode: 'create'; start: Point; current: Point }
  | { mode: 'move'; id: string; start: Point; current: Point; original: Rect }
  | { mode: 'resize'; id: string; handle: Handle; current: Point; original: Rect }

interface PanState {
  startX: number
  startY: number
  originX: number
  originY: number
}

interface MenuState {
  id: string
  left: number
  top: number
}

const EMPTY_RECT: Rect = { x1: 0, y1: 0, x2: 0, y2: 0 }
const HANDLE_SIZE = 8
const HANDLE_TOLERANCE = 10

function previewFor(active: Interaction | null, image: ImageState): { id: string; rect: Rect } | null {
  if (active === null || active.mode === 'create') return null
  const size = { width: image.width, height: image.height }
  if (active.mode === 'move') {
    return {
      id: active.id,
      rect: applyMove(
        active.original,
        { x: active.current.x - active.start.x, y: active.current.y - active.start.y },
        size,
      ),
    }
  }
  return { id: active.id, rect: applyResize(active.original, active.handle, active.current, size) }
}

export function Canvas({
  store,
  onOpen,
  onPaste,
  onDropFile,
  onNotify,
  busy,
}: CanvasProps): ReactElement {
  const state = useStore(store)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef(state.view)
  viewRef.current = state.view
  const [interaction, setInteraction] = useState<Interaction | null>(null)
  const [pan, setPan] = useState<PanState | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [cursor, setCursor] = useState('crosshair')

  const image = state.image
  const preview = interaction !== null && image !== null ? previewFor(interaction, image) : null

  const selected =
    state.annotations.find(
      (annotation): annotation is RegionAnnotation =>
        annotation.id === state.selectedId && annotation.kind === 'region',
    ) ?? null

  const rectOf = (annotation: RegionAnnotation): Rect =>
    preview !== null && preview.id === annotation.id ? preview.rect : annotation.rect

  const regionAt = (point: Point): RegionAnnotation | null => {
    for (let index = state.annotations.length - 1; index >= 0; index -= 1) {
      const annotation = state.annotations[index]
      if (annotation === undefined || annotation.kind !== 'region') continue
      if (inside(rectOf(annotation), point)) return annotation
    }
    return null
  }

  // The viewport lives in the store so the toolbar can fit and zoom without
  // reaching into this component.
  useEffect(() => {
    const element = wrapRef.current
    if (element === null) return
    const measure = (): void => {
      store.setViewport({ width: element.clientWidth, height: element.clientHeight })
    }
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure)
      observer.observe(element)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [store])

  // Fit once per new image, not on every window resize: keeping the user's zoom
  // is more valuable than re-fitting after a layout change.
  useEffect(() => {
    const { image: current, needsFit, viewport } = state
    if (current === null || !needsFit || viewport.width === 0 || viewport.height === 0) return
    store.setView(fitView({ width: current.width, height: current.height }, viewport))
  }, [state, store])

  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.code !== 'Space') return
      const target = event.target as HTMLElement | null
      if (target !== null && target.closest('textarea, input, [contenteditable="true"]') !== null) return
      event.preventDefault()
      setSpaceDown(true)
      setCursor('grab')
    }
    const up = (event: KeyboardEvent): void => {
      if (event.code !== 'Space') return
      setSpaceDown(false)
      setCursor('crosshair')
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useEffect(() => {
    if (menu === null) return
    const close = (event: Event): void => {
      const target = event.target as HTMLElement | null
      if (target !== null && target.closest('.dm-menu') !== null) return
      setMenu(null)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  useEffect(() => {
    setInteraction(null)
    setMenu(null)
  }, [image?.url])

  useEffect(() => {
    const element = wrapRef.current
    if (element === null) return
    const onWheel = (event: WheelEvent): void => {
      const current = store.getSnapshot().image
      if (current === null) return
      event.preventDefault()
      setMenu(null)
      const view = viewRef.current
      const bounds = element.getBoundingClientRect()
      const anchor = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      const next = clampScale(view.scale * Math.exp(-event.deltaY * 0.0015))
      if (next === view.scale) return
      store.setView(zoomAt(view, next, anchor))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [store])

  const pointOf = (event: { clientX: number; clientY: number }): Point => {
    const element = wrapRef.current
    if (element === null || image === null) return { x: 0, y: 0 }
    const bounds = element.getBoundingClientRect()
    return toImagePoint(event.clientX, event.clientY, bounds.left, bounds.top, viewRef.current)
  }

  const handleTolerance = (rect: Rect): number => {
    // Screen-space tolerance, capped so a zoomed-out frame is not all handles.
    const imageTolerance = HANDLE_TOLERANCE / viewRef.current.scale
    return Math.max(
      2,
      Math.min(imageTolerance, (rect.x2 - rect.x1) / 3, (rect.y2 - rect.y1) / 3),
    )
  }

  const cursorAt = (point: Point): string => {
    if (spaceDown) return 'grab'
    if (selected !== null) {
      const rect = rectOf(selected)
      const handle = handleAt(rect, point, handleTolerance(rect))
      if (handle !== null) return cursorForHandle(handle)
    }
    return regionAt(point) !== null ? 'move' : 'crosshair'
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (menu !== null) setMenu(null)
    if (image === null) return

    if (event.button === 1 || (event.button === 0 && spaceDown)) {
      event.preventDefault()
      const view = viewRef.current
      setPan({ startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y })
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if (event.button !== 0) return

    const point = pointOf(event)

    // Handles sit above the frame, so they are tested before the body.
    if (selected !== null) {
      const rect = rectOf(selected)
      const handle = handleAt(rect, point, handleTolerance(rect))
      if (handle !== null) {
        setInteraction({
          mode: 'resize',
          id: selected.id,
          handle,
          current: point,
          original: selected.rect,
        })
        event.currentTarget.setPointerCapture(event.pointerId)
        return
      }
    }

    const hit = regionAt(point)
    if (hit !== null) {
      store.select(hit.id)
      setInteraction({ mode: 'move', id: hit.id, start: point, current: point, original: hit.rect })
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }

    // Empty canvas: this is the only place a new frame may start.
    store.select(null)
    setInteraction({ mode: 'create', start: point, current: point })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (pan !== null) {
      store.setView({
        ...viewRef.current,
        x: pan.originX + (event.clientX - pan.startX),
        y: pan.originY + (event.clientY - pan.startY),
      })
      return
    }
    if (interaction !== null) {
      const point = pointOf(event)
      setInteraction({ ...interaction, current: point })
      return
    }
    if (image === null) return
    const next = cursorAt(pointOf(event))
    setCursor((previous) => (previous === next ? previous : next))
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (pan !== null) {
      setPan(null)
      return
    }
    if (interaction === null) return

    const active = interaction
    setInteraction(null)
    if (image === null) return

    const point = pointOf(event)
    const size = { width: image.width, height: image.height }
    if (active.mode === 'create') {
      const rect = normalizeRect(active.start, point, size)
      if (rect !== null) store.addRegion(rect)
      return
    }

    const rect =
      active.mode === 'move'
        ? applyMove(
            active.original,
            { x: point.x - active.start.x, y: point.y - active.start.y },
            size,
          )
        : applyResize(active.original, active.handle, point, size)
    if (!sameRect(rect, active.original)) store.setRegionRect(active.id, rect)
  }

  function handlePointerCancel(): void {
    setInteraction(null)
    setPan(null)
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>): void {
    event.preventDefault()
    const element = wrapRef.current
    if (element === null || image === null) {
      setMenu(null)
      return
    }
    const bounds = element.getBoundingClientRect()
    const point = toImagePoint(event.clientX, event.clientY, bounds.left, bounds.top, viewRef.current)
    const hit = regionAt(point)
    if (hit === null) {
      setMenu(null)
      return
    }
    store.select(hit.id)
    setMenu({
      id: hit.id,
      left: clamp(event.clientX - bounds.left, 8, Math.max(8, bounds.width - 184)),
      top: clamp(event.clientY - bounds.top, 8, Math.max(8, bounds.height - 108)),
    })
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setDropping(false)
    const file = Array.from(event.dataTransfer.files).find((candidate) =>
      candidate.type.startsWith('image/'),
    )
    if (file !== undefined) onDropFile(file)
  }

  const createPreview =
    interaction !== null && interaction.mode === 'create' && image !== null
      ? rectFromPoints(interaction.start, interaction.current, {
          width: image.width,
          height: image.height,
        })
      : null

  const menuTarget =
    menu === null ? null : state.annotations.find((annotation) => annotation.id === menu.id)
  const menuCutDone =
    menuTarget === undefined ||
    menuTarget === null ||
    menuTarget.kind !== 'region' ||
    menuTarget.cut

  const selectedRect = selected === null ? null : rectOf(selected)
  const handleScreen = selectedRect === null ? null : rectToScreen(selectedRect, state.view)
  const handlePositions: Record<Handle, Point> | null =
    handleScreen === null
      ? null
      : {
          nw: { x: handleScreen.left, y: handleScreen.top },
          ne: { x: handleScreen.left + handleScreen.width, y: handleScreen.top },
          w: { x: handleScreen.left, y: handleScreen.top + handleScreen.height / 2 },
          e: { x: handleScreen.left + handleScreen.width, y: handleScreen.top + handleScreen.height / 2 },
          sw: { x: handleScreen.left, y: handleScreen.top + handleScreen.height },
          se: {
            x: handleScreen.left + handleScreen.width,
            y: handleScreen.top + handleScreen.height,
          },
        }

  return (
    <div
      ref={wrapRef}
      className="dm-canvas"
      style={{ cursor: pan !== null ? 'grabbing' : cursor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={handleContextMenu}
      onDragOver={(event) => {
        event.preventDefault()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={handleDrop}
    >
      {image === null ? (
        <div className="dm-empty">
          <div className={`dm-empty-card${dropping ? ' is-dropping' : ''}`}>
            <Icon name="image" size={30} />
            <h2>{busy ? '正在处理图片…' : '打开一张设计图，开始标注'}</h2>
            <p>
              把设计稿、网页截图或任意界面图片拖进来，
              <br />
              也可以粘贴剪贴板里的截图，然后在图上拖拽框选区域。
            </p>
            <div className="dm-empty-actions">
              <button type="button" className="dm-primary" onClick={onOpen} disabled={busy}>
                打开图片
              </button>
              <button type="button" className="dm-ghost" onClick={onPaste} disabled={busy}>
                粘贴剪贴板
              </button>
            </div>
            <p>支持 PNG / JPEG；也可以直接按 Ctrl+V。</p>
          </div>
        </div>
      ) : (
        <>
          <div
            className="dm-stage"
            style={{
              transform: `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.scale})`,
            }}
          >
            <img
              className="dm-image"
              src={image.url}
              width={image.width}
              height={image.height}
              alt={image.name}
              draggable={false}
            />
          </div>

          <div className="dm-overlay">
            {/* Cut regions leave a checkerboard hole where their content was. */}
            {state.annotations.map((annotation) =>
              annotation.kind === 'region' && annotation.cut ? (
                <div
                  key={`hole-${annotation.id}`}
                  className="dm-hole"
                  style={rectToScreen(annotation.source, state.view)}
                />
              ) : null,
            )}

            {/* The cut content itself, clipped to the frame and scaled with it. */}
            {state.annotations.map((annotation) => {
              if (annotation.kind !== 'region' || !annotation.cut) return null
              const rect = rectOf(annotation)
              const box = rectToScreen(rect, state.view)
              const scaleX = (rect.x2 - rect.x1) / Math.max(1, annotation.source.x2 - annotation.source.x1)
              const scaleY = (rect.y2 - rect.y1) / Math.max(1, annotation.source.y2 - annotation.source.y1)
              return (
                <div
                  key={`content-${annotation.id}`}
                  className="dm-moved"
                  style={{
                    left: box.left,
                    top: box.top,
                    width: box.width,
                    height: box.height,
                    backgroundImage: `url("${image.url}")`,
                    backgroundSize: `${image.width * scaleX * state.view.scale}px ${
                      image.height * scaleY * state.view.scale
                    }px`,
                    backgroundPosition: `${-annotation.source.x1 * scaleX * state.view.scale}px ${
                      -annotation.source.y1 * scaleY * state.view.scale
                    }px`,
                  }}
                />
              )
            })}

            {state.annotations.map((annotation, index) =>
              annotation.kind === 'region' ? (
                <div
                  key={annotation.id}
                  className={`dm-region${annotation.id === state.selectedId ? ' is-selected' : ''}${
                    annotation.cut ? ' is-cut' : ''
                  }`}
                  style={rectToScreen(rectOf(annotation), state.view)}
                >
                  <span className="dm-badge-num">{index + 1}</span>
                </div>
              ) : null,
            )}

            {createPreview !== null ? (
              <div className="dm-region is-preview" style={rectToScreen(createPreview, state.view)} />
            ) : null}

            {handlePositions !== null && selectedRect !== null
              ? handlePoints(selectedRect).map(({ handle }) => {
                  const point = handlePositions[handle]
                  return (
                    <span
                      key={handle}
                      className={`dm-handle dm-handle-${handle}`}
                      style={{ left: point.x - HANDLE_SIZE / 2, top: point.y - HANDLE_SIZE / 2 }}
                    />
                  )
                })
              : null}
          </div>

          {menu !== null ? (
            <div
              className="dm-menu"
              role="menu"
              style={{ left: menu.left, top: menu.top }}
              onPointerDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <button
                type="button"
                role="menuitem"
                disabled={menuCutDone}
                title={menuCutDone ? '这个框已经裁剪过了' : '把框内内容切下来，拖动它移动到目标位置'}
                onClick={() => {
                  store.cutRegion(menu.id)
                  setMenu(null)
                  onNotify('已裁剪：拖动这个框把内容移到目标位置，原位置会留空')
                }}
              >
                裁剪移动
              </button>
              <div className="dm-menu-sep" />
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                onClick={() => {
                  store.remove(menu.id)
                  setMenu(null)
                }}
              >
                删除
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
