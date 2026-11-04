/**
 * Pixel comparison for the 图片对比 tool.
 *
 * Both images are normalized into the *first* image's frame: it defines the
 * output size, the second one is either contained or stretched into it. The
 * comparison is a max-channel difference per pixel (alpha included), computed
 * once per image pair and reused by the stats, the 相减 view and the 高亮 view.
 *
 * Everything runs in the renderer on a canvas; nothing is uploaded. Images
 * larger than `MAX_DIFF_PIXELS` are compared at a reduced raster so a 50 MP
 * photo cannot allocate hundreds of megabytes; the stage still shows the
 * original pixels because the canvas is scaled to the frame.
 */

export type AlignMode = 'contain' | 'stretch'

export interface LoadedImage {
  readonly name: string
  readonly size: number
  readonly type: string
  readonly width: number
  readonly height: number
  readonly url: string
  readonly element: HTMLImageElement
}

export interface DiffData {
  /** Raster size actually compared (may be smaller than the frame). */
  readonly width: number
  readonly height: number
  /** Max channel difference per pixel, 0–255. */
  readonly delta: Uint8Array
  /** 1 = the second image is brighter, 0 = darker, 2 = equal. */
  readonly sign: Uint8Array
  readonly maxDelta: number
}

export interface DiffStats {
  readonly changed: number
  readonly total: number
  readonly ratio: number
  readonly maxDelta: number
  readonly meanDelta: number
  readonly bbox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null
  /** The raster the stats were measured on. */
  readonly width: number
  readonly height: number
}

/** Above this many pixels the diff raster is scaled down. */
export const MAX_DIFF_PIXELS = 12_000_000

/** `3.4 MB`, `820 KB`, … */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function isLikelyImage(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(file.name)
}

export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (!isLikelyImage(file)) throw new Error('请选择图片文件（PNG / JPEG / WebP / GIF / BMP / AVIF）')
  if (file.size === 0) throw new Error('这个文件是空的')
  const url = URL.createObjectURL(file)
  const element = new Image()
  element.decoding = 'async'
  element.src = url
  try {
    await element.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new Error('无法解码这张图片：格式可能不受支持，或文件已损坏')
  }
  if (element.naturalWidth === 0 || element.naturalHeight === 0) {
    URL.revokeObjectURL(url)
    throw new Error('图片没有有效的像素尺寸')
  }
  return {
    name: file.name,
    size: file.size,
    type: file.type || 'image/*',
    width: element.naturalWidth,
    height: element.naturalHeight,
    url,
    element,
  }
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function readPixels(canvas: HTMLCanvasElement): ImageData {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) throw new Error('浏览器不支持 Canvas 2D，无法逐像素比较')
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

function drawImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  align: AlignMode,
): void {
  if (align === 'stretch') {
    context.drawImage(image, 0, 0, width, height)
    return
  }
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
}

/**
 * Compare `b` against `a`. `a` defines the frame; `b` is contained (aspect
 * preserved) or stretched into it. Throws when the canvas is tainted (an SVG
 * with external references) so the UI can explain the failure.
 */
export function computeDiff(a: LoadedImage, b: LoadedImage, align: AlignMode): DiffData {
  const scale = Math.min(1, Math.sqrt(MAX_DIFF_PIXELS / Math.max(1, a.width * a.height)))
  const width = Math.max(1, Math.round(a.width * scale))
  const height = Math.max(1, Math.round(a.height * scale))

  const canvasA = makeCanvas(width, height)
  const contextA = canvasA.getContext('2d', { willReadFrequently: true })
  if (contextA === null) throw new Error('浏览器不支持 Canvas 2D，无法逐像素比较')
  contextA.imageSmoothingQuality = 'high'
  drawImage(contextA, a.element, width, height, 'stretch')

  const canvasB = makeCanvas(width, height)
  const contextB = canvasB.getContext('2d', { willReadFrequently: true })
  if (contextB === null) throw new Error('浏览器不支持 Canvas 2D，无法逐像素比较')
  contextB.imageSmoothingQuality = 'high'
  drawImage(contextB, b.element, width, height, align)

  let pixelsA: ImageData
  let pixelsB: ImageData
  try {
    pixelsA = readPixels(canvasA)
    pixelsB = readPixels(canvasB)
  } catch {
    throw new Error('这张图片无法逐像素读取（可能是引用了外部资源的 SVG）')
  }

  const length = width * height
  const source = pixelsA.data
  const target = pixelsB.data
  const delta = new Uint8Array(length)
  const sign = new Uint8Array(length)
  let maxDelta = 0
  for (let index = 0, offset = 0; index < length; index += 1, offset += 4) {
    const dr = Math.abs(source[offset]! - target[offset]!)
    const dg = Math.abs(source[offset + 1]! - target[offset + 1]!)
    const db = Math.abs(source[offset + 2]! - target[offset + 2]!)
    const da = Math.abs(source[offset + 3]! - target[offset + 3]!)
    const diff = Math.max(dr, dg, db, da)
    delta[index] = diff
    if (diff > maxDelta) maxDelta = diff
    if (diff === 0) {
      sign[index] = 2
      continue
    }
    const luminanceA = 0.299 * source[offset]! + 0.587 * source[offset + 1]! + 0.114 * source[offset + 2]!
    const luminanceB = 0.299 * target[offset]! + 0.587 * target[offset + 1]! + 0.114 * target[offset + 2]!
    if (luminanceB === luminanceA) {
      sign[index] = target[offset + 3]! >= source[offset + 3]! ? 1 : 0
    } else {
      sign[index] = luminanceB > luminanceA ? 1 : 0
    }
  }

  return { width, height, delta, sign, maxDelta }
}

/** Count pixels above `threshold` and their bounding box. */
export function summarize(diff: DiffData, threshold: number): DiffStats {
  const limit = Math.max(0, Math.min(255, Math.round(threshold)))
  let changed = 0
  let sum = 0
  let minX = diff.width
  let minY = diff.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < diff.height; y += 1) {
    const row = y * diff.width
    for (let x = 0; x < diff.width; x += 1) {
      const value = diff.delta[row + x]!
      if (value <= limit) continue
      changed += 1
      sum += value
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const total = diff.width * diff.height
  return {
    changed,
    total,
    ratio: total > 0 ? changed / total : 0,
    maxDelta: diff.maxDelta,
    meanDelta: changed > 0 ? sum / changed : 0,
    bbox: changed > 0
      ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
      : null,
    width: diff.width,
    height: diff.height,
  }
}

function setCanvasSize(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D {
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('浏览器不支持 Canvas 2D')
  return context
}

/** 相减: black where identical, brightness proportional to the difference. */
export function renderDifference(canvas: HTMLCanvasElement, diff: DiffData, gain: number): void {
  const context = setCanvasSize(canvas, diff.width, diff.height)
  const image = context.createImageData(diff.width, diff.height)
  const data = image.data
  const factor = Math.max(1, gain)
  const delta = diff.delta
  for (let index = 0, offset = 0; index < delta.length; index += 1, offset += 4) {
    const value = Math.min(255, Math.round(delta[index]! * factor))
    data[offset] = value
    data[offset + 1] = value
    data[offset + 2] = value
    data[offset + 3] = 255
  }
  context.putImageData(image, 0, 0)
}

/** 高亮: changed pixels in red (second image darker) or green (brighter). */
export function renderHighlight(canvas: HTMLCanvasElement, diff: DiffData, threshold: number): void {
  const context = setCanvasSize(canvas, diff.width, diff.height)
  const image = context.createImageData(diff.width, diff.height)
  const data = image.data
  const limit = Math.max(0, Math.min(255, Math.round(threshold)))
  const delta = diff.delta
  const sign = diff.sign
  for (let index = 0, offset = 0; index < delta.length; index += 1, offset += 4) {
    if (delta[index]! <= limit) continue
    if (sign[index] === 1) {
      data[offset] = 34
      data[offset + 1] = 197
      data[offset + 2] = 94
    } else {
      data[offset] = 229
      data[offset + 1] = 72
      data[offset + 2] = 77
    }
    data[offset + 3] = 245
  }
  context.putImageData(image, 0, 0)
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error('导出失败：浏览器无法生成 PNG'))
      else resolve(blob)
    }, type)
  })
}

/** 相减 export: the amplified difference at the compared raster. */
export async function exportDifferencePng(diff: DiffData, gain: number): Promise<Blob> {
  const canvas = makeCanvas(diff.width, diff.height)
  renderDifference(canvas, diff, gain)
  return canvasToBlob(canvas)
}

/** 高亮 export: grayscale base (when supplied) with red/green change marks. */
export async function exportHighlightPng(
  diff: DiffData,
  threshold: number,
  base: HTMLImageElement | null,
): Promise<Blob> {
  const canvas = makeCanvas(diff.width, diff.height)
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('浏览器不支持 Canvas 2D')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  if (base !== null && typeof context.filter === 'string') {
    context.filter = 'grayscale(1) opacity(0.55)'
    const scale = Math.min(canvas.width / base.naturalWidth, canvas.height / base.naturalHeight)
    const width = base.naturalWidth * scale
    const height = base.naturalHeight * scale
    context.drawImage(base, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
    context.filter = 'none'
  }
  const marks = makeCanvas(diff.width, diff.height)
  renderHighlight(marks, diff, threshold)
  context.drawImage(marks, 0, 0)
  return canvasToBlob(canvas)
}
