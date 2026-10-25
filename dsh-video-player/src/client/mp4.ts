/**
 * Minimal ISO-BMFF (MP4 / QuickTime) frame-table reader.
 *
 * A `<video>` element can seek, but it cannot tell us where one frame ends and
 * the next begins. Frame-accurate stepping therefore needs the sample table of
 * the video track: `stts` gives every sample duration, `ctts` gives the
 * composition offset of B-frames, and `elst` shifts the presentation timeline.
 * This module reads only `moov` from the File (never the media payload), so a
 * multi-gigabyte video costs a few kilobytes of I/O plus the sample table.
 *
 * The reader is intentionally small and dependency-free. It understands the
 * boxes a normal MP4/MOV uses; anything else (fragmented MP4 with an empty
 * `stbl`, an unsupported codec) returns `null` and the caller falls back to a
 * nominal frame rate that the user can correct in the UI.
 */

export interface FrameTable {
  /** Where the table came from. `estimated` means the video was not parseable. */
  readonly kind: 'mp4' | 'estimated'
  /** Presentation start of each frame, in seconds, ascending. */
  readonly times: Float64Array
  /** Duration of each frame, in seconds. Same length as `times`. */
  readonly durations: Float64Array
  /** Average frames per second over the table's span. */
  readonly fps: number
  readonly totalFrames: number
  /** Pixel dimensions from the video sample entry, or 0 when unknown. */
  readonly width: number
  readonly height: number
  /** Sample-entry fourcc (`avc1`, `hvc1`, …), or an empty string. */
  readonly codec: string
  /** Media timescale of the video track. */
  readonly timescale: number
  /** Track duration in seconds, as declared by `mdhd`. */
  readonly mediaDuration: number
}

interface Box {
  readonly type: string
  readonly start: number
  readonly size: number
  readonly header: number
}

const MAX_SAMPLES = 5_000_000
const MAX_TOP_LEVEL_BOXES = 4096

/** Read a four-character box type from a byte array. */
function fourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  )
}

/** Iterate the boxes that fill `[start, end)` in an in-memory payload. */
function boxesIn(view: DataView, start: number, end: number): Box[] {
  const boxes: Box[] = []
  let offset = start
  while (offset + 8 <= end) {
    let size = view.getUint32(offset)
    const type = fourcc(new Uint8Array(view.buffer, view.byteOffset + offset + 4, 4), 0)
    let header = 8
    if (size === 1) {
      if (offset + 16 > end) break
      size = Number(view.getBigUint64(offset + 8))
      header = 16
    } else if (size === 0) {
      size = end - offset
    }
    if (size < header || offset + size > end) break
    boxes.push({ type, start: offset, size, header })
    offset += size
  }
  return boxes
}

/** Read one top-level box header from a Blob without loading its body. */
async function readBlobBox(file: Blob, offset: number, end: number): Promise<Box | null> {
  if (offset + 8 > end) return null
  const headerBytes = new Uint8Array(
    await file.slice(offset, Math.min(offset + 16, end)).arrayBuffer(),
  )
  if (headerBytes.byteLength < 8) return null
  const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength)
  let size = view.getUint32(0)
  const type = fourcc(headerBytes, 4)
  let header = 8
  if (size === 1) {
    if (headerBytes.byteLength < 16) return null
    size = Number(view.getBigUint64(8))
    header = 16
  } else if (size === 0) {
    size = end - offset
  }
  if (size < header) return null
  return { type, start: offset, size, header }
}

/** Find the first child box of a given type. */
function findBox(boxes: readonly Box[], type: string): Box | undefined {
  return boxes.find((box) => box.type === type)
}

/** Read `mvhd`'s movie timescale. */
function movieTimescale(view: DataView, mvhd: Box | undefined): number {
  if (mvhd === undefined) return 1000
  const p = mvhd.start + mvhd.header
  const version = view.getUint8(p)
  const scale = version === 1 ? view.getUint32(p + 20) : view.getUint32(p + 12)
  return scale > 0 ? scale : 1000
}

/** Read `mdhd`'s media timescale and duration. */
function mediaHeader(view: DataView, mdhd: Box): { timescale: number; duration: number } {
  const p = mdhd.start + mdhd.header
  const version = view.getUint8(p)
  const timescale = version === 1 ? view.getUint32(p + 20) : view.getUint32(p + 12)
  const duration = version === 1 ? Number(view.getBigUint64(p + 24)) : view.getUint32(p + 16)
  return { timescale: timescale > 0 ? timescale : 1000, duration }
}

/** Read the first edit-list shift: presentation time 0 → media time `media_time`. */
function editShift(
  view: DataView,
  edts: Box | undefined,
  movieScale: number,
  mediaScale: number,
): number {
  if (edts === undefined) return 0
  const elst = findBox(boxesIn(view, edts.start + edts.header, edts.start + edts.size), 'elst')
  if (elst === undefined) return 0
  const p = elst.start + elst.header
  const version = view.getUint8(p)
  const count = view.getUint32(p + 4)
  let empty = 0
  for (let i = 0; i < count; i += 1) {
    let segmentDuration: number
    let mediaTime: number
    if (version === 1) {
      const at = p + 8 + i * 20
      if (at + 20 > elst.start + elst.size) break
      segmentDuration = Number(view.getBigUint64(at))
      mediaTime = Number(view.getBigInt64(at + 8))
    } else {
      const at = p + 8 + i * 12
      if (at + 12 > elst.start + elst.size) break
      segmentDuration = view.getUint32(at)
      mediaTime = view.getInt32(at + 4)
    }
    if (mediaTime === -1) {
      empty += segmentDuration / movieScale
    } else {
      return empty - mediaTime / mediaScale
    }
  }
  return empty
}

/** Read the visual sample entry's fourcc and dimensions from `stsd`. */
function sampleEntry(
  view: DataView,
  stsd: Box | undefined,
): { codec: string; width: number; height: number } {
  if (stsd === undefined) return { codec: '', width: 0, height: 0 }
  const p = stsd.start + stsd.header
  const entryCount = view.getUint32(p + 4)
  if (entryCount === 0) return { codec: '', width: 0, height: 0 }
  const entry = p + 8
  if (entry + 8 > stsd.start + stsd.size) return { codec: '', width: 0, height: 0 }
  const codec = fourcc(new Uint8Array(view.buffer, view.byteOffset + entry + 4, 4), 0)
  const width = entry + 32 <= stsd.start + stsd.size ? view.getUint16(entry + 32) : 0
  const height = entry + 34 <= stsd.start + stsd.size ? view.getUint16(entry + 34) : 0
  return { codec, width, height }
}

/** Expand `stts` into per-sample decode timestamps and durations. */
function readStts(
  view: DataView,
  stts: Box,
): { dts: Float64Array; durations: Float64Array; count: number } {
  const p = stts.start + stts.header
  const entries = view.getUint32(p + 4)
  let count = 0
  for (let i = 0; i < entries; i += 1) {
    const at = p + 8 + i * 8
    if (at + 8 > stts.start + stts.size) break
    count += view.getUint32(at)
    if (count > MAX_SAMPLES) break
  }
  if (count === 0 || count > MAX_SAMPLES) {
    return { dts: new Float64Array(0), durations: new Float64Array(0), count: 0 }
  }
  const dts = new Float64Array(count)
  const durations = new Float64Array(count)
  let at = 0
  let time = 0
  for (let i = 0; i < entries && at < count; i += 1) {
    const entry = p + 8 + i * 8
    if (entry + 8 > stts.start + stts.size) break
    const sampleCount = view.getUint32(entry)
    const delta = view.getUint32(entry + 4)
    for (let j = 0; j < sampleCount && at < count; j += 1) {
      dts[at] = time
      durations[at] = delta
      time += delta
      at += 1
    }
  }
  return { dts, durations, count: at }
}

/** Expand `ctts` into per-sample composition offsets. */
function readCtts(view: DataView, ctts: Box | undefined, count: number): Int32Array {
  const offsets = new Int32Array(count)
  if (ctts === undefined) return offsets
  const p = ctts.start + ctts.header
  const version = view.getUint8(p)
  const entries = view.getUint32(p + 4)
  let at = 0
  for (let i = 0; i < entries && at < count; i += 1) {
    const entry = p + 8 + i * 8
    if (entry + 8 > ctts.start + ctts.size) break
    const sampleCount = view.getUint32(entry)
    // Version 0 stores an unsigned offset; versions 1+ store a signed one.
    const offset = version === 0 ? view.getUint32(entry + 4) : view.getInt32(entry + 4)
    for (let j = 0; j < sampleCount && at < count; j += 1) {
      offsets[at] = offset
      at += 1
    }
  }
  return offsets
}

/** A tiny guard for a sample entry's nominal width/height. */
function plausible(value: number): number {
  return value > 0 && value < 100_000 ? value : 0
}

/**
 * Parse the video track's frame table from an MP4/MOV Blob.
 *
 * Returns `null` when the file has no usable video sample table (not ISO-BMFF,
 * fragmented MP4, or an unknown layout). The caller should then fall back to a
 * nominal rate instead of treating this as a playback failure.
 */
export async function parseMp4FrameTable(file: Blob): Promise<FrameTable | null> {
  let moov: Box | null = null
  let sawFtyp = false
  let offset = 0
  for (let i = 0; i < MAX_TOP_LEVEL_BOXES && offset < file.size; i += 1) {
    const box = await readBlobBox(file, offset, file.size)
    if (box === null) break
    if (box.type === 'ftyp') sawFtyp = true
    if (box.type === 'moov') {
      moov = box
      break
    }
    if (box.size <= 0) break
    offset += box.size
  }
  if (moov === null || !sawFtyp) return null

  const payload = new Uint8Array(
    await file.slice(moov.start + moov.header, moov.start + moov.size).arrayBuffer(),
  )
  if (payload.byteLength < 8) return null
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const top = boxesIn(view, 0, payload.byteLength)
  const movieScale = movieTimescale(view, findBox(top, 'mvhd'))

  for (const trak of top.filter((box) => box.type === 'trak')) {
    const trakBoxes = boxesIn(view, trak.start + trak.header, trak.start + trak.size)
    const mdia = findBox(trakBoxes, 'mdia')
    if (mdia === undefined) continue
    const mdiaBoxes = boxesIn(view, mdia.start + mdia.header, mdia.start + mdia.size)
    const hdlr = findBox(mdiaBoxes, 'hdlr')
    if (hdlr === undefined) continue
    const handler = fourcc(
      new Uint8Array(view.buffer, view.byteOffset + hdlr.start + hdlr.header + 8, 4),
      0,
    )
    if (handler !== 'vide') continue

    const mdhd = findBox(mdiaBoxes, 'mdhd')
    if (mdhd === undefined) continue
    const { timescale, duration } = mediaHeader(view, mdhd)
    if (timescale <= 0) continue

    const minf = findBox(mdiaBoxes, 'minf')
    if (minf === undefined) continue
    const stbl = findBox(
      boxesIn(view, minf.start + minf.header, minf.start + minf.size),
      'stbl',
    )
    if (stbl === undefined) continue
    const stblBoxes = boxesIn(view, stbl.start + stbl.header, stbl.start + stbl.size)
    const stts = findBox(stblBoxes, 'stts')
    if (stts === undefined) continue
    const { dts, durations, count } = readStts(view, stts)
    if (count === 0) continue

    const ctts = findBox(stblBoxes, 'ctts')
    const offsets = readCtts(view, ctts, count)

    // Composition timestamps; with B-frames these are not in decode order.
    const cts = new Float64Array(count)
    let hasOffset = false
    for (let i = 0; i < count; i += 1) {
      cts[i] = dts[i]! + offsets[i]!
      if (offsets[i] !== 0) hasOffset = true
    }

    const order = new Uint32Array(count)
    for (let i = 0; i < count; i += 1) order[i] = i
    if (hasOffset) order.sort((a, b) => cts[a]! - cts[b]!)

    const edts = findBox(trakBoxes, 'edts')
    const shift = editShift(view, edts, movieScale, timescale)
    const times = new Float64Array(count)
    const mediaDurations = new Float64Array(count)
    let minimum = Number.POSITIVE_INFINITY
    for (let i = 0; i < count; i += 1) {
      const sample = order[i]!
      const start = cts[sample]! / timescale + shift
      times[i] = start
      mediaDurations[i] = durations[sample]! / timescale
      if (start < minimum) minimum = start
    }
    // A track without a covering edit list can start at a small negative CTS;
    // normalize so the first presented frame sits at 0.
    if (Number.isFinite(minimum) && minimum < 0) {
      for (let i = 0; i < count; i += 1) times[i] = times[i]! - minimum
    }

    // Frame duration is the gap to the next presentation time; the final frame
    // keeps its own sample duration.
    const outDurations = new Float64Array(count)
    let last = times[0]!
    for (let i = 0; i < count; i += 1) {
      const next = i + 1 < count ? times[i + 1]! : times[i]! + mediaDurations[i]!
      const gap = next - times[i]!
      outDurations[i] = gap > 0.000_001 ? gap : Math.max(mediaDurations[i]!, 0.000_001)
      last = times[i]! + outDurations[i]!
    }

    const span = last - times[0]!
    const fps = span > 0 ? count / span : 0
    const entry = sampleEntry(view, findBox(stblBoxes, 'stsd'))
    return {
      kind: 'mp4',
      times,
      durations: outDurations,
      fps: Number.isFinite(fps) && fps > 0 ? fps : 30,
      totalFrames: count,
      width: plausible(entry.width),
      height: plausible(entry.height),
      codec: entry.codec,
      timescale,
      mediaDuration: duration > 0 ? duration / timescale : span,
    }
  }

  return null
}

/** Build a nominal table when the container cannot be parsed. */
export function buildEstimatedFrameTable(duration: number, fps: number): FrameTable {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30
  const total = Math.max(1, Math.round(safeDuration * safeFps))
  const step = safeDuration > 0 ? safeDuration / total : 1 / safeFps
  const times = new Float64Array(total)
  const durations = new Float64Array(total)
  for (let i = 0; i < total; i += 1) {
    times[i] = i * step
    durations[i] = step
  }
  return {
    kind: 'estimated',
    times,
    durations,
    fps: total / (safeDuration > 0 ? safeDuration : total / safeFps),
    totalFrames: total,
    width: 0,
    height: 0,
    codec: '',
    timescale: 1000,
    mediaDuration: safeDuration,
  }
}

/** Largest frame index whose presentation start is at or before `time`. */
export function frameIndexAt(times: Float64Array, time: number): number {
  const count = times.length
  if (count === 0) return 0
  if (time <= times[0]!) return 0
  if (time >= times[count - 1]!) return count - 1
  let low = 0
  let high = count - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (times[middle]! <= time) low = middle
    else high = middle - 1
  }
  return low
}

/** A friendly codec label for the UI. */
export function codecLabel(codec: string): string {
  switch (codec) {
    case 'avc1':
    case 'avc3':
      return 'H.264'
    case 'hvc1':
    case 'hev1':
      return 'H.265 / HEVC'
    case 'vp09':
      return 'VP9'
    case 'av01':
      return 'AV1'
    case 'mp4v':
      return 'MPEG-4'
    case 'ap4h':
      return 'ProRes 4444'
    case 'apcn':
      return 'ProRes 422'
    default:
      return codec
  }
}
