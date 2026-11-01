/**
 * Image intake: file picker, drag-and-drop, and the clipboard.
 *
 * The bytes that are displayed are the bytes that get uploaded, so a screenshot
 * taken at 2× keeps its exact pixels and the annotation coordinates match the
 * file the AI reads. Only pictures the host would refuse (unsupported format,
 * too many pixels, too many bytes) are transcoded first.
 */

export const MAX_IMAGE_BYTES = 32 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 32_000_000
export const MAX_IMAGE_EDGE = 8192

const ACCEPTED = new Set(['image/png', 'image/jpeg'])

export interface PreparedImage {
  blob: Blob
  width: number
  height: number
  mime: string
  name: string
  scaled: boolean
}

interface Decoded {
  image: HTMLImageElement
  revoke: () => void
}

function decode(file: File): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve({ image, revoke: () => URL.revokeObjectURL(url) })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取这张图片'))
    }
    image.src = url
  })
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const name = file.name !== '' ? file.name : '粘贴的图片'
  if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp)$/i.test(name)) {
    throw new Error('只支持图片文件')
  }

  const decoded = await decode(file)
  try {
    const { width, height } = decoded.image
    if (width === 0 || height === 0) throw new Error('图片尺寸无效')
    const needsScale =
      file.size > MAX_IMAGE_BYTES || width * height > MAX_IMAGE_PIXELS || Math.max(width, height) > MAX_IMAGE_EDGE
    const transcode = needsScale || !ACCEPTED.has(file.type)

    if (!transcode) {
      return { blob: file, width, height, mime: file.type, name, scaled: false }
    }

    const ratio = Math.min(
      1,
      Math.sqrt(MAX_IMAGE_PIXELS / (width * height)),
      MAX_IMAGE_EDGE / Math.max(width, height),
    )
    const targetWidth = Math.max(1, Math.round(width * ratio))
    const targetHeight = Math.max(1, Math.round(height * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('当前环境无法处理图片')
    context.drawImage(decoded.image, 0, 0, targetWidth, targetHeight)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (blob === null) throw new Error('图片转换失败')
    if (blob.size > MAX_IMAGE_BYTES) throw new Error('图片体积过大，请先压缩')
    return { blob, width: targetWidth, height: targetHeight, mime: 'image/png', name, scaled: true }
  } finally {
    decoded.revoke()
  }
}

/** Read one image from the async clipboard API, if the host allows it. */
export async function readClipboardImage(): Promise<File | null> {
  const clipboard = navigator.clipboard
  if (clipboard === undefined || typeof clipboard.read !== 'function') return null
  const items = await clipboard.read()
  for (const item of items) {
    for (const type of item.types) {
      if (!type.startsWith('image/')) continue
      const blob = await item.getType(type)
      const extension = type.split('/')[1] ?? 'png'
      return new File([blob], `clipboard-${Date.now()}.${extension}`, { type })
    }
  }
  return null
}

export function imageFileFromTransfer(transfer: DataTransfer | null): File | null {
  if (transfer === null) return null
  for (const file of Array.from(transfer.files)) {
    if (file.type.startsWith('image/')) return file
  }
  return null
}
