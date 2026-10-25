/**
 * Unit tests for the MP4 frame-table reader.
 *
 * Node 24 can import the TypeScript module directly (type stripping), so the
 * test exercises the same source the client bundle is built from.
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildEstimatedFrameTable,
  codecLabel,
  frameIndexAt,
  parseMp4FrameTable,
} from '../src/client/mp4.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, '..', 'fixtures')

async function load(name) {
  const bytes = await readFile(join(fixtures, name))
  return new Blob([bytes], { type: 'video/mp4' })
}

function checkTable(table, name, frames, fps) {
  assert.ok(table !== null, `${name}: frame table should parse`)
  assert.equal(table.kind, 'mp4')
  assert.equal(table.totalFrames, frames, `${name}: frame count`)
  assert.ok(Math.abs(table.fps - fps) < 0.02, `${name}: fps ${table.fps} ≈ ${fps}`)
  assert.equal(table.times.length, frames)
  assert.equal(table.durations.length, frames)
  assert.equal(table.codec, 'avc1')
  assert.equal(table.width, 320)
  assert.equal(table.height, 180)
  let previous = -Infinity
  let total = 0
  for (let index = 0; index < frames; index += 1) {
    assert.ok(Number.isFinite(table.times[index]), `${name}: time[${index}]`)
    assert.ok(table.times[index] >= previous, `${name}: times ascending at ${index}`)
    assert.ok(table.durations[index] > 0, `${name}: duration[${index}] > 0`)
    previous = table.times[index]
    total += table.durations[index]
  }
  assert.ok(Math.abs(total - frames / fps) < 0.05, `${name}: span ${total}`)
  assert.equal(frameIndexAt(table.times, -1), 0)
  assert.equal(frameIndexAt(table.times, 0), 0)
  assert.equal(frameIndexAt(table.times, table.times[0] + 0.0001), 0)
  assert.equal(frameIndexAt(table.times, 999), frames - 1)
  const middle = Math.floor(frames / 2)
  assert.equal(frameIndexAt(table.times, table.times[middle] + 0.0001), middle)
  console.log(`  ${name}: ${frames} frames, ${table.fps.toFixed(3)} fps, codec ${codecLabel(table.codec)}`)
}

console.log('parser:')
checkTable(await parseMp4FrameTable(await load('frames-25fps.mp4')), 'frames-25fps.mp4', 120, 25)
checkTable(await parseMp4FrameTable(await load('frames-30fps.mp4')), 'frames-30fps.mp4', 90, 30)
checkTable(
  await parseMp4FrameTable(await load('frames-25fps-long-gop.mp4')),
  'frames-25fps-long-gop.mp4',
  120,
  25,
)

const fragmented = await parseMp4FrameTable(await load('frames-25fps-fragmented.mp4'))
assert.equal(fragmented, null, 'fragmented MP4 falls back instead of guessing')
console.log('  fragmented MP4: null (fallback expected)')

const estimated = buildEstimatedFrameTable(4.8, 25)
assert.equal(estimated.kind, 'estimated')
assert.equal(estimated.totalFrames, 120)
assert.ok(Math.abs(estimated.fps - 25) < 0.001)
assert.equal(frameIndexAt(estimated.times, 0.5), 12)
console.log(`  estimated fallback: ${estimated.totalFrames} frames at ${estimated.fps} fps`)

console.log('parser tests passed')
