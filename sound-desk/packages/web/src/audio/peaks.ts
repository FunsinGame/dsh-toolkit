/**
 * Peak pyramid codec and canvas renderer.
 *
 * The engine serves the `SDPK` container produced by `@sounddesk/audio-wav`.
 * Reading it here (rather than shipping an image or SVG) means:
 *   - one small binary fetch instead of a rendered waveform,
 *   - the UI can pick the level of detail that matches the current zoom, and
 *   - drawing stays on the GPU-cheap path (a few thousand line segments).
 *
 * Layout (little-endian):
 *   magic     4 bytes  "SDPK"
 *   version   u16
 *   sampleRate u32
 *   channels  u16
 *   levels    u16
 *   per level: samplesPerBucket u32, buckets u32, byteLength u32, then data
 *   data: `buckets` × `channels` pairs of (min, max) as Int16
 */

export interface PeakLevel {
  samplesPerBucket: number;
  buckets: number;
  /** interleaved per channel: [c0min, c0max, c1min, c1max, …] scaled to -1..1 */
  data: Float32Array;
}

export interface PeakPyramid {
  sampleRate: number;
  channels: number;
  levels: PeakLevel[];
}

export function parsePeaks(buffer: ArrayBuffer): PeakPyramid {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'SDPK') throw new Error(`not a SoundDesk peak file (magic "${magic}")`);

  const version = view.getUint16(4, true);
  if (version !== 1) throw new Error(`unsupported peak version ${version}`);

  const sampleRate = view.getUint32(6, true);
  const channels = view.getUint16(10, true);
  const levelCount = view.getUint16(12, true);

  let offset = 14;
  const levels: PeakLevel[] = [];
  for (let i = 0; i < levelCount; i += 1) {
    const samplesPerBucket = view.getUint32(offset, true);
    const buckets = view.getUint32(offset + 4, true);
    const byteLength = view.getUint32(offset + 8, true);
    offset += 12;

    const sampleCount = byteLength / 2;
    const data = new Float32Array(sampleCount);
    for (let s = 0; s < sampleCount; s += 1) {
      data[s] = view.getInt16(offset + s * 2, true) / 32767;
    }
    offset += byteLength;

    levels.push({ samplesPerBucket, buckets, data });
  }

  return { sampleRate, channels, levels };
}

/** Finest level whose buckets are at most `maxBuckets` — keeps drawing cheap. */
export function chooseLevel(pyramid: PeakPyramid, maxBuckets: number): PeakLevel | null {
  if (pyramid.levels.length === 0) return null;
  for (const level of pyramid.levels) {
    if (level.buckets <= maxBuckets) return level;
  }
  return pyramid.levels[pyramid.levels.length - 1]!;
}

export interface WaveformStyle {
  /** CSS pixel width of the drawing surface */
  width: number;
  height: number;
  /** accent colour for the positive half */
  waveColor: string;
  /** dimmer colour for the mirrored negative half */
  mirrorColor: string;
  /** centre line */
  axisColor: string;
  /** selection highlight, when a range is selected */
  selectionColor?: string;
  /** playhead position in 0..1, or null */
  playhead?: number | null;
  /** selection as fractions 0..1 */
  selection?: { start: number; end: number } | null;
  /** device pixel ratio, defaults to window.devicePixelRatio */
  dpr?: number;
}

/**
 * Draw the pyramid across the full width.
 *
 * All channels are overlaid around a shared centre line (multichannel files are
 * usually correlated, so overlaying reads better than stacking at this size).
 */
export function drawWaveform(canvas: HTMLCanvasElement, pyramid: PeakPyramid, style: WaveformStyle): void {
  const dpr = style.dpr ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const width = Math.max(1, Math.floor(style.width));
  const height = Math.max(1, Math.floor(style.height));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const centre = height / 2;
  const amplitude = height / 2 - 1;

  // selection background first, so the waveform draws on top
  if (style.selection) {
    const x0 = clamp01(style.selection.start) * width;
    const x1 = clamp01(style.selection.end) * width;
    ctx.fillStyle = style.selectionColor ?? 'rgba(96, 165, 250, 0.18)';
    ctx.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), height);
  }

  // centre axis
  ctx.strokeStyle = style.axisColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, centre + 0.5);
  ctx.lineTo(width, centre + 0.5);
  ctx.stroke();

  const level = chooseLevel(pyramid, Math.max(1, Math.floor(width * 2)));
  if (!level || level.buckets === 0) return;

  const channels = Math.max(1, pyramid.channels);
  const bucketsPerPixel = level.buckets / width;

  ctx.strokeStyle = style.waveColor;
  ctx.lineWidth = Math.max(1, Math.min(1.5, 400 / width));
  ctx.beginPath();

  for (let px = 0; px < width; px += 1) {
    const startBucket = Math.floor(px * bucketsPerPixel);
    const endBucket = Math.min(level.buckets, Math.max(startBucket + 1, Math.floor((px + 1) * bucketsPerPixel)));

    let min = 0;
    let max = 0;
    for (let bucket = startBucket; bucket < endBucket; bucket += 1) {
      for (let ch = 0; ch < channels; ch += 1) {
        const base = (bucket * channels + ch) * 2;
        const lo = level.data[base] ?? 0;
        const hi = level.data[base + 1] ?? 0;
        if (lo < min) min = lo;
        if (hi > max) max = hi;
      }
    }
    const x = px + 0.5;
    ctx.moveTo(x, centre - max * amplitude);
    ctx.lineTo(x, centre - min * amplitude);
  }
  ctx.stroke();

  if (style.playhead !== null && style.playhead !== undefined) {
    const x = clamp01(style.playhead) * width;
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.95)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Stable colour per file so lists are scannable. */
export function waveformColorFor(id: number): string {
  const palette = ['#38bdf8', '#34d399', '#a78bfa', '#fbbf24', '#f472b6', '#22d3ee'];
  return palette[Math.abs(id) % palette.length]!;
}
