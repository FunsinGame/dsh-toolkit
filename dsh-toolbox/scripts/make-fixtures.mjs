/**
 * Generate the image-compare fixtures: a small "dashboard screenshot" pair.
 *
 * The pair is drawn into raw RGBA buffers and encoded as PNG with zlib, so the
 * repository needs no image library. B differs in a handful of deliberate ways
 * (accent colors, a shifted card, a changed bar, a new badge, one changed table
 * row) which gives the six views something real to show.
 *
 *   node scripts/make-fixtures.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const out = join(root, 'fixtures')

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  header[10] = 0
  header[11] = 0
  header[12] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

class Canvas {
  constructor(width, height, background) {
    this.width = width
    this.height = height
    this.data = new Uint8Array(width * height * 4)
    this.fill(background)
  }

  fill([r, g, b, a = 255]) {
    for (let offset = 0; offset < this.data.length; offset += 4) {
      this.data[offset] = r
      this.data[offset + 1] = g
      this.data[offset + 2] = b
      this.data[offset + 3] = a
    }
  }

  rect(x, y, width, height, [r, g, b, a = 255]) {
    const x0 = Math.max(0, Math.round(x))
    const y0 = Math.max(0, Math.round(y))
    const x1 = Math.min(this.width, Math.round(x + width))
    const y1 = Math.min(this.height, Math.round(y + height))
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) {
        const offset = (py * this.width + px) * 4
        this.data[offset] = r
        this.data[offset + 1] = g
        this.data[offset + 2] = b
        this.data[offset + 3] = a
      }
    }
  }

  circle(cx, cy, radius, color) {
    const r2 = radius * radius
    for (let py = Math.floor(cy - radius); py <= Math.ceil(cy + radius); py += 1) {
      for (let px = Math.floor(cx - radius); px <= Math.ceil(cx + radius); px += 1) {
        const dx = px - cx
        const dy = py - cy
        if (dx * dx + dy * dy > r2) continue
        this.rect(px, py, 1, 1, color)
      }
    }
  }

  /** Horizontal "text": a filled bar. */
  line(x, y, width, height = 7, color = [203, 213, 225]) {
    this.rect(x, y, width, height, color)
  }

  png() {
    return encodePng(this.width, this.height, this.data)
  }
}

const WHITE = [255, 255, 255]
const PAGE = [238, 242, 247]
const INK = [30, 41, 59]
const MUTED = [148, 163, 184]
const SOFT = [226, 232, 240]
const BLUE = [65, 118, 230]
const VIOLET = [124, 108, 255]
const GREEN = [34, 197, 94]
const AMBER = [245, 158, 11]
const RED = [229, 72, 77]

function dashboard(variant) {
  const changed = variant === 'b'
  const canvas = new Canvas(960, 600, PAGE)

  // Title bar.
  canvas.rect(0, 0, 960, 56, WHITE)
  canvas.rect(24, 16, 24, 24, changed ? RED : BLUE)
  canvas.line(changed ? 62 : 56, 23, 132, 10, INK)
  canvas.line(changed ? 210 : 204, 26, 62, 6, MUTED)
  canvas.rect(880, 20, 56, 16, SOFT)
  canvas.circle(852, 28, 6, changed ? RED : GREEN)
  canvas.rect(0, 55, 960, 1, SOFT)

  // Sidebar.
  canvas.rect(0, 56, 184, 544, WHITE)
  for (let index = 0; index < 5; index += 1) {
    const active = index === (changed ? 2 : 1)
    if (active) canvas.rect(14, 84 + index * 44, 156, 32, BLUE)
    else canvas.rect(14, 84 + index * 44, 156, 32, [248, 250, 252])
    canvas.line(28, 97 + index * 44, 14, 6, active ? [255, 255, 255] : MUTED)
    canvas.line(50, 97 + index * 44, 74, 6, active ? [224, 235, 255] : SOFT)
  }
  canvas.rect(184, 56, 1, 544, SOFT)

  // Hero card.
  const heroTop = 80
  canvas.rect(208, heroTop, 720, 168, WHITE)
  canvas.rect(208, heroTop, 6, 168, changed ? AMBER : BLUE)
  canvas.line(232, heroTop + 28, 188, 14, INK)
  canvas.line(232, heroTop + 54, 286, 8, MUTED)
  canvas.line(232, heroTop + 70, 214, 8, MUTED)
  canvas.rect(232, heroTop + 112, 118, 32, changed ? VIOLET : BLUE)
  canvas.rect(366, heroTop + 112, 96, 32, SOFT)
  canvas.circle(886, heroTop + 36, changed ? 15 : 12, changed ? GREEN : SOFT)
  if (changed) {
    canvas.rect(780, heroTop + 112, 84, 32, [220, 252, 231])
    canvas.line(794, heroTop + 125, 46, 7, [22, 163, 74])
  }

  // Stat cards.
  const statTop = 276
  for (let index = 0; index < 3; index += 1) {
    const x = 208 + index * 244
    canvas.rect(x, statTop, 232, 96, WHITE)
    canvas.rect(x + 18, statTop + 20, 30, 30, index === 0 ? [219, 234, 254] : index === 1 ? [220, 252, 231] : [254, 243, 199])
    canvas.line(x + 62, statTop + 22, 54, 7, MUTED)
    const barWidth = index === 1 && changed ? 128 : 96
    canvas.line(x + 62, statTop + 40, barWidth, 12, index === 0 ? BLUE : index === 1 ? GREEN : AMBER)
  }

  // Table card.
  const tableTop = statTop + 112
  canvas.rect(208, tableTop, 720, 176, WHITE)
  canvas.line(230, tableTop + 22, 96, 9, INK)
  canvas.rect(208, tableTop + 48, 720, 28, [248, 250, 252])
  for (let column = 0; column < 4; column += 1) {
    canvas.line(230 + column * 172, tableTop + 57, 62, 7, MUTED)
  }
  for (let row = 0; row < 3; row += 1) {
    const y = tableTop + 84 + row * 28
    if (changed && row === 1) canvas.rect(208, y - 4, 720, 28, [255, 247, 237])
    canvas.line(230, y, 70 + (row % 2) * 14 + (row === 1 && changed ? 24 : 0), 7, row === 2 && changed ? VIOLET : [203, 213, 225])
    canvas.line(402, y, 54, 7, SOFT)
    canvas.line(574, y, 86, 7, SOFT)
    const badge = row === 0 && changed ? AMBER : GREEN
    canvas.rect(746, y - 2, 52, 14, badge)
  }

  return canvas
}

await mkdir(out, { recursive: true })
const first = dashboard('a')
const second = dashboard('b')
await writeFile(join(out, 'compare-a.png'), first.png())
await writeFile(join(out, 'compare-b.png'), second.png())

// A downscaled B exercises the "尺寸不同" alignment path.
const small = new Canvas(720, 450, PAGE)
for (let y = 0; y < small.height; y += 1) {
  for (let x = 0; x < small.width; x += 1) {
    const sourceX = Math.min(second.width - 1, Math.round((x / small.width) * second.width))
    const sourceY = Math.min(second.height - 1, Math.round((y / small.height) * second.height))
    const src = (sourceY * second.width + sourceX) * 4
    const dst = (y * small.width + x) * 4
    small.data[dst] = second.data[src]
    small.data[dst + 1] = second.data[src + 1]
    small.data[dst + 2] = second.data[src + 2]
    small.data[dst + 3] = 255
  }
}
await writeFile(join(out, 'compare-b-small.png'), small.png())

console.log(`wrote ${join(out, 'compare-a.png')}`)
console.log(`wrote ${join(out, 'compare-b.png')}`)
console.log(`wrote ${join(out, 'compare-b-small.png')}`)

