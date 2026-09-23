/**
 * Minimal WAV codec.
 *
 * Deliberately small and self-contained rather than reusing `@sounddesk/audio-wav`,
 * which is built around Node `Buffer` and the filesystem and carries the whole
 * RIFF chunk-surgery surface (bext/iXML rewriting) that a renderer does not need.
 * This module only has to do two things: read PCM/IEEE-float samples out of a
 * WAV, and write them back. `Uint8Array` in, `Uint8Array` out, so it runs
 * unchanged in the browser and in Node.
 *
 * Only what an export path actually encounters is supported: PCM 8/16/24/32-bit
 * integer and 32-bit float, mono or stereo. Anything else reports why instead of
 * producing a silently wrong file.
 */

export interface WavData {
  channelData: Float32Array[];
  sampleRate: number;
  /** bits per sample of the source file */
  sourceBitsPerSample: number;
}

export class WavCodecError extends Error {}

const RIFF = 0x52494646; // 'RIFF'
const WAVE = 0x57415645; // 'WAVE'
const FMT = 0x666d7420; // 'fmt '
const DATA = 0x64617461; // 'data'
const FACT = 0x66616374; // 'fact'
const FLOAT = 3;
const EXTENSIBLE = 0xfffe;

function readTag(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function fourCC(tag: number): string {
  return String.fromCharCode((tag >>> 24) & 0xff, (tag >>> 16) & 0xff, (tag >>> 8) & 0xff, tag & 0xff);
}

/**
 * Decode a WAV file into de-interleaved float channels.
 *
 * Throws `WavCodecError` with a human-readable reason for anything unsupported:
 * a wrong-but-plausible export is worse than a refusal.
 */
export function decodeWavBytes(bytes: Uint8Array): WavData {
  if (bytes.byteLength < 44) throw new WavCodecError('文件太小，不是有效的 WAV');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readTag(view, 0) !== RIFF || readTag(view, 8) !== WAVE) {
    throw new WavCodecError('不是 RIFF/WAVE 文件');
  }

  let fmt: {
    format: number;
    channels: number;
    sampleRate: number;
    bitsPerSample: number;
  } | null = null;
  let dataOffset = -1;
  let dataLength = 0;

  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = readTag(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === FMT) {
      if (body + 16 > bytes.byteLength) throw new WavCodecError('fmt 块被截断');
      let format = view.getUint16(body, true);
      const channels = view.getUint16(body + 2, true);
      const sampleRate = view.getUint32(body + 4, true);
      const bitsPerSample = view.getUint16(body + 14, true);
      if (format === EXTENSIBLE) {
        // WAVE_FORMAT_EXTENSIBLE stores the real format in the GUID's first two
        // bytes; the rest of the GUID is a fixed template.
        if (body + 26 > bytes.byteLength) throw new WavCodecError('extensible fmt 块被截断');
        format = view.getUint16(body + 24, true);
      }
      fmt = { format, channels, sampleRate, bitsPerSample };
    } else if (id === DATA) {
      dataOffset = body;
      dataLength = Math.min(size, bytes.byteLength - body);
    } else if (id === FACT) {
      // informational only
    }
    // chunks are word-aligned
    offset = body + size + (size % 2);
  }

  if (!fmt) throw new WavCodecError('缺少 fmt 块');
  if (dataOffset < 0) throw new WavCodecError('缺少 data 块');
  if (fmt.channels < 1 || fmt.channels > 8) {
    throw new WavCodecError(`不支持的声道数 ${fmt.channels}`);
  }
  if (fmt.sampleRate < 1000 || fmt.sampleRate > 384000) {
    throw new WavCodecError(`不支持的采样率 ${fmt.sampleRate}`);
  }

  const isFloat = fmt.format === FLOAT;
  if (!isFloat && fmt.format !== 1) {
    throw new WavCodecError(`不支持的编码格式 ${fmt.format}（只支持 PCM 与 32 位浮点）`);
  }

  const bytesPerSample = fmt.bitsPerSample / 8;
  if (!Number.isInteger(bytesPerSample)) {
    throw new WavCodecError(`不支持的位深 ${fmt.bitsPerSample}`);
  }
  const frameCount = Math.floor(dataLength / (bytesPerSample * fmt.channels));
  const channelData: Float32Array[] = [];
  for (let c = 0; c < fmt.channels; c += 1) channelData.push(new Float32Array(frameCount));

  const read = sampleReader(view, fmt.bitsPerSample, isFloat);
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let c = 0; c < fmt.channels; c += 1) {
      const at = dataOffset + (frame * fmt.channels + c) * bytesPerSample;
      channelData[c]![frame] = read(at);
    }
  }

  return { channelData, sampleRate: fmt.sampleRate, sourceBitsPerSample: fmt.bitsPerSample };
}

function sampleReader(view: DataView, bits: number, isFloat: boolean): (at: number) => number {
  if (isFloat && bits === 32) {
    return (at) => view.getFloat32(at, true);
  }
  if (isFloat && bits === 64) {
    return (at) => view.getFloat64(at, true);
  }
  switch (bits) {
    case 8:
      // 8-bit WAV is *unsigned* with a 128 bias — the classic trap.
      return (at) => (view.getUint8(at) - 128) / 128;
    case 16:
      return (at) => view.getInt16(at, true) / 32768;
    case 24: {
      return (at) => {
        const b0 = view.getUint8(at);
        const b1 = view.getUint8(at + 1);
        const b2 = view.getUint8(at + 2);
        // sign-extend 24 bits
        let value = (b2 << 16) | (b1 << 8) | b0;
        if (value & 0x800000) value -= 0x1000000;
        return value / 8388608;
      };
    }
    case 32:
      return (at) => view.getInt32(at, true) / 2147483648;
    default:
      throw new WavCodecError(`不支持的位深 ${bits}`);
  }
}

export interface EncodeOptions {
  /** 16 or 24 bit integer, or 32 for IEEE float. Default 24. */
  bitsPerSample?: 16 | 24 | 32;
  /** 'pcm' writes integer samples, 'float' writes IEEE float */
  encoding?: 'pcm' | 'float';
}

/**
 * Encode float channels as a WAV file.
 *
 * Defaults to 24-bit PCM: it is the delivery standard for sound effects and is
 * transparent for anything the effect chain produces, whereas 16-bit would add
 * audible dither-free quantisation noise to quiet tails.
 *
 * Samples outside ±1 are clamped, not wrapped — wrapping turns a small overshoot
 * into a loud click, which is the worst possible failure for a preview chain that
 * the user has been listening to.
 */
export function encodeWav(channelData: Float32Array[], sampleRate: number, opts: EncodeOptions = {}): Uint8Array {
  const bits = opts.bitsPerSample ?? 24;
  const encoding = opts.encoding ?? (bits === 32 ? 'float' : 'pcm');
  if (channelData.length === 0) throw new WavCodecError('没有可编码的声道');
  if (encoding === 'float' && bits !== 32) {
    throw new WavCodecError('浮点编码只支持 32 位');
  }
  if (encoding === 'pcm' && bits !== 16 && bits !== 24 && bits !== 32) {
    throw new WavCodecError(`不支持的位深 ${bits}`);
  }

  const channels = channelData.length;
  const frames = channelData[0]!.length;
  for (const channel of channelData) {
    if (channel.length !== frames) throw new WavCodecError('各声道长度不一致');
  }

  const bytesPerSample = bits / 8;
  const dataBytes = frames * channels * bytesPerSample;
  const headerBytes = 44;
  const out = new Uint8Array(headerBytes + dataBytes);
  const view = new DataView(out.buffer);

  const writeTag = (offset: number, tag: string): void => {
    for (let i = 0; i < 4; i += 1) view.setUint8(offset + i, tag.charCodeAt(i));
  };

  writeTag(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeTag(8, 'WAVE');
  writeTag(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, encoding === 'float' ? FLOAT : 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true); // byte rate
  view.setUint16(32, channels * bytesPerSample, true); // block align
  view.setUint16(34, bits, true);
  writeTag(36, 'data');
  view.setUint32(40, dataBytes, true);

  const clamp = (v: number): number => (v > 1 ? 1 : v < -1 ? -1 : Number.isFinite(v) ? v : 0);
  let at = headerBytes;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let c = 0; c < channels; c += 1) {
      const value = clamp(channelData[c]![frame]!);
      if (encoding === 'float') {
        view.setFloat32(at, value, true);
      } else if (bits === 16) {
        view.setInt16(at, Math.round(value * 32767), true);
      } else if (bits === 24) {
        const scaled = Math.max(-8388608, Math.min(8388607, Math.round(value * 8388607)));
        const unsigned = scaled < 0 ? scaled + 0x1000000 : scaled;
        view.setUint8(at, unsigned & 0xff);
        view.setUint8(at + 1, (unsigned >>> 8) & 0xff);
        view.setUint8(at + 2, (unsigned >>> 16) & 0xff);
      } else {
        view.setInt32(at, Math.round(value * 2147483647), true);
      }
      at += bytesPerSample;
    }
  }

  return out;
}

/** Human-readable summary of a WAV's format, for error messages and the UI. */
export function describeWavFormat(bytes: Uint8Array): string {
  try {
    const data = decodeWavBytes(bytes);
    return `${data.channelData.length}ch · ${data.sampleRate}Hz · ${data.sourceBitsPerSample}bit · ${data.channelData[0]!.length} frames`;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export { fourCC };
