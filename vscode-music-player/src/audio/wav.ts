/**
 * WAV（RIFF/PCM）封装。
 *
 * 这里的核心是「**预测长度**」：fMP4 的 dash 音频在解码前就知道时长（B 站
 * pagelist/playlist 会给出时长，`sidx` 也能给），于是可以先把 44 字节头部里的
 * `RIFF`/`data` 长度按预测值写好，再边解码边推送 PCM。这样 `<audio>` 不必等
 * 整首歌解码完就能起播，且缓冲范围内的 seek 立即可用。
 *
 * 预测与实际不一致时：不足补静音、超出截断，保证头部声明的长度永远成立。
 */

export const WAV_HEADER_BYTES = 44;
export const BITS_PER_SAMPLE = 16;
export const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

export interface WavFormat {
  sampleRate: number;
  channels: number;
  /** 默认 16 位；保留字段以便将来支持 24/32 位。 */
  bitsPerSample?: number;
}

interface ResolvedFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

function resolve(format: WavFormat): ResolvedFormat {
  const sampleRate = Math.round(format.sampleRate);
  const channels = Math.max(1, Math.round(format.channels));
  const bitsPerSample = format.bitsPerSample ?? BITS_PER_SAMPLE;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error(`非法的采样率：${String(format.sampleRate)}`);
  }
  return { sampleRate, channels, bitsPerSample };
}

/** 给定采样帧数返回 PCM 字节数。 */
export function pcmByteLength(frames: number, format: WavFormat): number {
  const { channels, bitsPerSample } = resolve(format);
  return Math.max(0, Math.round(frames)) * channels * (bitsPerSample / 8);
}

/** 给定秒数返回预测的 PCM 字节数。 */
export function predictedPcmBytes(durationSeconds: number, format: WavFormat): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const { sampleRate } = resolve(format);
  return pcmByteLength(Math.round(durationSeconds * sampleRate), format);
}

/** 构造 44 字节 WAV 头（PCM 格式，小端）。 */
export function buildWavHeader(format: WavFormat, dataBytes: number): Buffer {
  const { sampleRate, channels, bitsPerSample } = resolve(format);
  const bytesPerSample = bitsPerSample / 8;
  const byteRate = sampleRate * channels * bytesPerSample;
  const blockAlign = channels * bytesPerSample;
  const dataSize = Math.max(0, Math.floor(dataBytes));

  const header = Buffer.alloc(WAV_HEADER_BYTES);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt 块长度
  header.writeUInt16LE(1, 20); // 1 = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);
  return header;
}

/** 把完整的 PCM 一次性包成 WAV 文件。 */
export function encodeWav(pcm: Buffer, format: WavFormat): Buffer {
  return Buffer.concat([buildWavHeader(format, pcm.byteLength), pcm]);
}

/** 从 WAV 头部读出实际声明的 `data` 长度（解析用，也用于单测互证）。 */
export function readWavDataBytes(wav: Buffer): number {
  if (wav.byteLength < WAV_HEADER_BYTES) throw new Error('WAV 头部不完整');
  return wav.readUInt32LE(40);
}

/**
 * 解析 WAV 头（命中磁盘缓存时用它还原格式信息，避免再存一份 sidecar）。
 */
export function readWavFormat(wav: Buffer): ResolvedFormat & { dataBytes: number } {
  if (wav.byteLength < WAV_HEADER_BYTES) throw new Error('WAV 头部不完整');
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('不是合法的 WAV 文件');
  }
  return {
    sampleRate: wav.readUInt32LE(24),
    channels: wav.readUInt16LE(22),
    bitsPerSample: wav.readUInt16LE(34),
    dataBytes: wav.readUInt32LE(40),
  };
}

/**
 * 边解码边推送时的记账器：只负责头部、累计写入量与收尾补齐，
 * 真正的字节由调用方直接推给 HTTP 响应或文件流。
 */
export class ProgressiveWav {
  readonly format: ResolvedFormat;
  /** 头部里声明（预测）的 PCM 总字节数。 */
  readonly predictedDataBytes: number;
  private written = 0;

  constructor(format: WavFormat, predictedDataBytes: number) {
    this.format = resolve(format);
    this.predictedDataBytes = Math.max(0, Math.floor(predictedDataBytes));
  }

  /** 总长度（头 + 预测 PCM）。 */
  get totalBytes(): number {
    return WAV_HEADER_BYTES + this.predictedDataBytes;
  }

  /** 已经累计的 PCM 字节数。 */
  get writtenBytes(): number {
    return this.written;
  }

  header(): Buffer {
    return buildWavHeader(this.format, this.predictedDataBytes);
  }

  /** 记录一批 PCM 的写入；返回真正应当发送的字节（超出预测的部分被截断）。 */
  accept(chunk: Buffer): Buffer {
    const remaining = this.predictedDataBytes - this.written;
    if (remaining <= 0) return Buffer.alloc(0);
    const accepted = chunk.byteLength <= remaining ? chunk : chunk.subarray(0, remaining);
    this.written += accepted.byteLength;
    return accepted;
  }

  /** 收尾：还需要补多少字节静音才能凑满预测长度。 */
  paddingBytes(): number {
    return Math.max(0, this.predictedDataBytes - this.written);
  }

  finish(): Buffer {
    return silence(this.paddingBytes());
  }
}

function silence(bytes: number): Buffer {
  return Buffer.alloc(bytes);
}
