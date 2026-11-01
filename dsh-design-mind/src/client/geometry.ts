/** Pure geometry shared by the canvas, the toolbar, and the unit tests. */

export interface Rect {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface View {
  scale: number
  x: number
  y: number
}

export const MIN_REGION_SIZE = 4
export const MIN_SCALE = 0.05
export const MAX_SCALE = 8

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clampScale(scale: number): number {
  return clamp(scale, MIN_SCALE, MAX_SCALE)
}

/** Build a rect from two pointer positions, clamped to the image and rounded. */
export function rectFromPoints(a: Point, b: Point, size: Size): Rect | null {
  const x1 = Math.round(clamp(Math.min(a.x, b.x), 0, size.width))
  const y1 = Math.round(clamp(Math.min(a.y, b.y), 0, size.height))
  const x2 = Math.round(clamp(Math.max(a.x, b.x), 0, size.width))
  const y2 = Math.round(clamp(Math.max(a.y, b.y), 0, size.height))
  if (x2 <= x1 || y2 <= y1) return null
  return { x1, y1, x2, y2 }
}

/** A rect a user actually meant to create: large enough to be a real region. */
export function normalizeRect(a: Point, b: Point, size: Size, min: number = MIN_REGION_SIZE): Rect | null {
  const rect = rectFromPoints(a, b, size)
  if (rect === null || rect.x2 - rect.x1 < min || rect.y2 - rect.y1 < min) return null
  return rect
}

/** Pointer position in image pixels, given the wrap's screen origin and view. */
export function toImagePoint(
  clientX: number,
  clientY: number,
  originLeft: number,
  originTop: number,
  view: View,
): Point {
  return {
    x: (clientX - originLeft - view.x) / view.scale,
    y: (clientY - originTop - view.y) / view.scale,
  }
}

/** Where a rect lands on screen for the overlay layer. */
export function rectToScreen(rect: Rect, view: View): { left: number; top: number; width: number; height: number } {
  return {
    left: rect.x1 * view.scale + view.x,
    top: rect.y1 * view.scale + view.y,
    width: (rect.x2 - rect.x1) * view.scale,
    height: (rect.y2 - rect.y1) * view.scale,
  }
}

/** Center the whole image in the viewport without ever enlarging it past 100%. */
export function fitView(image: Size, viewport: Size, padding = 32): View {
  if (viewport.width <= 0 || viewport.height <= 0) return { scale: 1, x: 0, y: 0 }
  const availableWidth = Math.max(1, viewport.width - padding * 2)
  const availableHeight = Math.max(1, viewport.height - padding * 2)
  const scale = clampScale(Math.min(availableWidth / image.width, availableHeight / image.height, 1))
  return {
    scale,
    x: (viewport.width - image.width * scale) / 2,
    y: (viewport.height - image.height * scale) / 2,
  }
}

/** Zoom keeping the image point under `anchor` fixed on screen. */
export function zoomAt(view: View, nextScale: number, anchor: Point): View {
  const scale = clampScale(nextScale)
  if (scale === view.scale) return view
  const ratio = scale / view.scale
  return {
    scale,
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
  }
}

export function inside(rect: Rect, point: Point): boolean {
  return point.x >= rect.x1 && point.x < rect.x2 && point.y >= rect.y1 && point.y < rect.y2
}

/**
 * The six resize handles: four corners plus the left/right midpoints. The box
 * body moves the whole selection, so no top/bottom midpoint is needed.
 */
export type Handle = 'nw' | 'ne' | 'w' | 'e' | 'sw' | 'se'

export const HANDLES: readonly Handle[] = ['nw', 'ne', 'w', 'e', 'sw', 'se']

export function handlePoints(rect: Rect): Array<{ handle: Handle; point: Point }> {
  const middleX = (rect.x1 + rect.x2) / 2
  const middleY = (rect.y1 + rect.y2) / 2
  return [
    { handle: 'nw', point: { x: rect.x1, y: rect.y1 } },
    { handle: 'ne', point: { x: rect.x2, y: rect.y1 } },
    { handle: 'w', point: { x: rect.x1, y: middleY } },
    { handle: 'e', point: { x: rect.x2, y: middleY } },
    { handle: 'sw', point: { x: rect.x1, y: rect.y2 } },
    { handle: 'se', point: { x: rect.x2, y: rect.y2 } },
  ]
}

/** The handle within `tolerance` image pixels of `point`, if any. */
export function handleAt(rect: Rect, point: Point, tolerance: number): Handle | null {
  for (const candidate of handlePoints(rect)) {
    if (
      Math.abs(point.x - candidate.point.x) <= tolerance &&
      Math.abs(point.y - candidate.point.y) <= tolerance
    ) {
      return candidate.handle
    }
  }
  return null
}

export function cursorForHandle(handle: Handle): string {
  if (handle === 'nw' || handle === 'se') return 'nwse-resize'
  if (handle === 'ne' || handle === 'sw') return 'nesw-resize'
  return 'ew-resize'
}

/** Translate a rect by a drag delta, keeping it inside the image. */
export function applyMove(rect: Rect, delta: Point, size: Size): Rect {
  const width = rect.x2 - rect.x1
  const height = rect.y2 - rect.y1
  const x1 = clamp(Math.round(rect.x1 + delta.x), 0, Math.max(0, size.width - width))
  const y1 = clamp(Math.round(rect.y1 + delta.y), 0, Math.max(0, size.height - height))
  return { x1, y1, x2: x1 + width, y2: y1 + height }
}

/** Move one or two edges to the pointer, enforcing the minimum size. */
export function applyResize(
  rect: Rect,
  handle: Handle,
  point: Point,
  size: Size,
  min: number = MIN_REGION_SIZE,
): Rect {
  let { x1, y1, x2, y2 } = rect
  const x = Math.round(clamp(point.x, 0, size.width))
  const y = Math.round(clamp(point.y, 0, size.height))

  if (handle === 'nw' || handle === 'w' || handle === 'sw') x1 = Math.min(x, x2 - min)
  if (handle === 'ne' || handle === 'e' || handle === 'se') x2 = Math.max(x, x1 + min)
  if (handle === 'nw' || handle === 'ne') y1 = Math.min(y, y2 - min)
  if (handle === 'sw' || handle === 'se') y2 = Math.max(y, y1 + min)

  x1 = clamp(x1, 0, size.width - min)
  x2 = clamp(x2, x1 + min, size.width)
  y1 = clamp(y1, 0, size.height - min)
  y2 = clamp(y2, y1 + min, size.height)
  return { x1, y1, x2, y2 }
}

export function sameRect(left: Rect, right: Rect): boolean {
  return left.x1 === right.x1 && left.y1 === right.y1 && left.x2 === right.x2 && left.y2 === right.y2
}
