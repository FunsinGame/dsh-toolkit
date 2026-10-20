/**
 * PCM 处理。
 *
 * wasm 解码器给出的是 `Float32Array[]`（每声道一条轨），而 WAV 需要交错排列的
 * 16 位小端整数。这里做两件事：浮点 → 16 位定点（带限幅），以及多声道交错。
 *
 * 性能敏感：一首 4 分钟的歌有上千万个采样点，因此走 TypedArray + Buffer 视图，
 * 不做逐样本的 `Buffer.writeInt16LE`。
 */

import { endianness } from 'node:os';

const CLIP_MAX = 32767;
const CLIP_MIN = -32768;

/** 单个浮点采样 → 16 位定点（已限幅）。 */
export function floatToInt16(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = Math.round(value * 32767);
  if (scaled > CLIP_MAX) return CLIP_MAX;
  if (scaled < CLIP_MIN) return CLIP_MIN;
  return scaled;
}

/**
 * 多声道浮点轨 → 交错 16 位定点。
 *
 * @param channelData 每声道一条 `Float32Array`（wasm 解码器的输出）
 * @param frames 每个声道的采样帧数；超出该数量的数据被忽略
 */
export function interleaveToInt16(channelData: Float32Array[], frames: number): Int16Array {
  const channels = channelData.length;
  const out = new Int16Array(frames * channels);
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const track = channelData[channel];
      const value = track === undefined ? 0 : (track[frame] ?? 0);
      out[frame * channels + channel] = floatToInt16(value);
    }
  }
  return out;
}

/** 把定点采样按小端字节序写进 Buffer（必要时做字节交换）。 */
export function int16ToBuffer(data: Int16Array): Buffer {
  if (endianness() === 'LE') {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  const out = Buffer.allocUnsafe(data.byteLength);
  for (let i = 0; i < data.length; i++) out.writeInt16LE(data[i] ?? 0, i * 2);
  return out;
}

/** 生成静音（用于补齐预测长度）。 */
export function silenceBytes(bytes: number): Buffer {
  return Buffer.alloc(Math.max(0, bytes));
}
