/**
 * Generate the PNG fixtures without any image dependency.
 *
 * A small hand-rolled PNG encoder (IHDR/IDAT/IEND with zlib) keeps the repo
 * self-contained. `fixtures/design.png` is a 320×200 mock UI for the host tests;
 * `fixtures/demo.png` is the same drawing at 3× for the README screenshot.
 */

import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let value = n
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[n] = value >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'latin1')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0)
  return Buffer.concat([length, typeBytes, data, crc])
}

/** Draw the mock UI on a 320×200 logical grid, enlarged by `scale`. */
function encode(scale) {
  const width = 320 * scale
  const height = 200 * scale
  const raw = Buffer.alloc((width * 3 + 1) * height)

  const write = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const index = y * (width * 3 + 1) + 1 + x * 3
    raw[index] = r
    raw[index + 1] = g
    raw[index + 2] = b
  }
  const set = (x, y, r, g, b) => {
    for (let dy = 0; dy < scale; dy += 1) {
      for (let dx = 0; dx < scale; dx += 1) write(x * scale + dx, y * scale + dy, r, g, b)
    }
  }
  const fill = (x, y, w, h, r, g, b) => {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) set(col, row, r, g, b)
    }
  }

  // Background and shell.
  fill(0, 0, 320, 200, 244, 246, 250)
  fill(0, 0, 320, 40, 255, 255, 255)
  fill(0, 39, 320, 1, 232, 236, 243)
  fill(0, 40, 74, 160, 238, 241, 247)
  for (let row = 0; row < 6; row += 1) fill(12, 58 + row * 20, 50, 7, 208, 215, 226)
  fill(92, 14, 96, 11, 40, 44, 52)
  fill(262, 12, 44, 16, 65, 118, 230)

  // Cards.
  fill(92, 58, 128, 74, 255, 255, 255)
  fill(92, 58, 128, 1, 228, 233, 241)
  fill(104, 72, 58, 8, 200, 207, 220)
  fill(104, 88, 96, 6, 224, 229, 238)
  fill(104, 100, 84, 6, 224, 229, 238)
  fill(104, 112, 44, 6, 224, 229, 238)
  fill(232, 58, 68, 74, 255, 255, 255)
  fill(232, 58, 68, 1, 228, 233, 241)
  fill(244, 78, 40, 26, 240, 242, 246)
  fill(244, 114, 44, 6, 224, 229, 238)

  // Table-ish content and the primary action.
  for (let row = 0; row < 3; row += 1) fill(92, 146 + row * 14, 208, 6, 214, 220, 231)
  fill(238, 158, 62, 22, 65, 118, 230)
  fill(250, 166, 38, 6, 255, 255, 255)

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

await mkdir(join(root, 'fixtures'), { recursive: true })
for (const [name, scale] of [
  ['design.png', 1],
  ['demo.png', 3],
]) {
  const png = encode(scale)
  await writeFile(join(root, 'fixtures', name), png)
  console.log(`fixtures/${name}: ${320 * scale}×${200 * scale}, ${png.length} bytes`)
}
