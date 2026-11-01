/**
 * Zero-dependency image inspection and crash-safe writes.
 *
 * The exported image is the exact bytes the user picked or pasted, so the
 * feedback can name its SHA-256 and the AI can verify it is looking at the same
 * picture. Dimensions come from the bytes themselves, never from the browser:
 * a mismatch between the documented size and the real one would push every
 * annotation off target.
 */

import { createHash } from 'node:crypto'
import { open, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

export const MAX_IMAGE_BYTES = 32 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 32_000_000
export const MAX_IMAGE_EDGE = 8192

export interface ImageFormat {
  mimeType: 'image/png' | 'image/jpeg'
  extension: 'png' | 'jpg'
  width: number
  height: number
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** JPEG start-of-frame markers, whose payload begins with precision/height/width. */
const SOF_MARKERS = new Set<number>([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

function validDimensions(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
}

function pngFormat(bytes: Buffer): ImageFormat | null {
  if (bytes.length < 24) return null
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  if (bytes.toString('latin1', 12, 16) !== 'IHDR') return null
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (!validDimensions(width, height)) return null
  return { mimeType: 'image/png', extension: 'png', width, height }
}

function jpegFormat(bytes: Buffer): ImageFormat | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    // A marker may be preceded by any number of 0xFF fill bytes.
    let cursor = offset + 1
    while (cursor < bytes.length && bytes[cursor] === 0xff) cursor += 1
    if (cursor >= bytes.length) return null
    const marker = bytes[cursor] as number
    const next = cursor + 1
    // Standalone markers carry no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset = next
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return null
    if (next + 2 > bytes.length) return null
    const length = bytes.readUInt16BE(next)
    if (length < 2) return null
    const payload = next + 2
    if (SOF_MARKERS.has(marker)) {
      if (payload + 5 > bytes.length) return null
      const height = bytes.readUInt16BE(payload + 1)
      const width = bytes.readUInt16BE(payload + 3)
      if (!validDimensions(width, height)) return null
      return { mimeType: 'image/jpeg', extension: 'jpg', width, height }
    }
    offset = next + length
  }
  return null
}

/** Sniff PNG/JPEG and read the real pixel size; `null` means unsupported bytes. */
export function detectImageFormat(bytes: Buffer): ImageFormat | null {
  return pngFormat(bytes) ?? jpegFormat(bytes)
}

/**
 * Publish `bytes` as `dir/filename` without ever exposing a half-written file:
 * the bytes land in a dot-prefixed sibling, are flushed, then renamed.
 */
export async function writeImageFile(
  dir: string,
  filename: string,
  bytes: Buffer,
): Promise<{ sha256: string; size: number }> {
  const target = join(dir, filename)
  const part = join(dir, `.${filename}.${process.pid}.part`)
  const handle = await open(part, 'wx')
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await rename(part, target)
  } catch (error) {
    await rm(part, { force: true })
    throw error
  }
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
  }
}
