/**
 * AAC → PCM（wasm）。
 *
 * 用 `@wasm-audio-decoders/aac`（libfaad2 的 wasm 构建，MIT）。它在设置了
 * `audioSpecificConfig` 之后走 `decodeFrames()`，正好对应我们从 fMP4 里切出来的
 * 裸 AAC 帧（没有 ADTS 头）。
 *
 * 这个包是 ESM-only，所以用动态 `import()` 加载：扩展宿主最终由 esbuild 打成
 * CJS，Node 24 也支持 `require(esm)`，两条路都通。
 */

import { interleaveToInt16, int16ToBuffer } from './pcm';

/** 一次交给 wasm 的帧数：太大则长时间占住事件循环，太小则调用开销显著。 */
const DEFAULT_FRAMES_PER_BATCH = 256;

interface WasmDecodeError {
  message?: string;
}

interface WasmDecodedAudio {
  channelData: Float32Array[];
  samplesDecoded: number;
  sampleRate: number;
  errors: WasmDecodeError[];
}

interface WasmDecoder {
  ready: Promise<void>;
  decodeFrames(frames: Uint8Array[]): Promise<WasmDecodedAudio>;
  flush(): Promise<WasmDecodedAudio>;
  reset(): Promise<void>;
  free(): void;
}

interface WasmModule {
  AACDecoder: new (options?: { audioSpecificConfig?: Uint8Array }) => WasmDecoder;
}

export interface AacDecoderOptions {
  /** 来自 mp4 `esds` 的 AudioSpecificConfig；有它才能解裸帧。 */
  audioSpecificConfig?: Uint8Array | null;
  framesPerBatch?: number;
  onWarn?: (message: string) => void;
}

export interface DecodedChunk {
  /** 交错排列的 16 位小端 PCM。 */
  pcm: Buffer;
  /** 本批次的采样帧数（每声道）。 */
  frames: number;
  sampleRate: number;
  channels: number;
}

export interface DecodeSummary {
  sampleRate: number;
  channels: number;
  frames: number;
  bytes: number;
  chunkCount: number;
  errors: string[];
}

/** 把 wasm 解码器包装成「逐批吐 PCM」的形态。 */
export class AacFrameDecoder {
  private readonly options: AacDecoderOptions;
  private decoder: WasmDecoder | null = null;
  private sampleRate = 0;
  private channels = 0;
  private released = false;
  private totalFrames = 0;
  private totalBytes = 0;
  private chunkCount = 0;
  private readonly errors = new Set<string>();

  constructor(options: AacDecoderOptions = {}) {
    this.options = options;
  }

  private warn(message: string): void {
    this.options.onWarn?.(message);
  }

  /** 编译 wasm 并配置解码器。 */
  async ready(): Promise<void> {
    const module = (await import('@wasm-audio-decoders/aac')) as unknown as WasmModule;
    const asc = this.options.audioSpecificConfig ?? null;
    if (asc === null || asc.byteLength === 0) {
      throw new Error('缺少 AudioSpecificConfig，无法解码裸 AAC 帧');
    }
    this.decoder = new module.AACDecoder({ audioSpecificConfig: asc });
    await this.decoder.ready;
  }

  /**
   * 逐批解码并 flush（适合「一次性解一整首歌」）。
   *
   * @param frames 裸 AAC 帧
   * @param onChunk 每解出一批就回调一次
   */
  async decode(
    frames: Uint8Array[],
    onChunk?: (chunk: DecodedChunk) => void,
  ): Promise<DecodeSummary> {
    const summary = await this.decodePartial(frames, onChunk);
    const decoder = this.decoder;
    if (decoder === null) return summary;
    this.consumeResult(await decoder.flush(), onChunk);
    return this.snapshot();
  }

  /**
   * 只解这一批帧，**不 flush**。
   *
   * 流式起播时是「边下边解」：如果每一段都 flush，会把解码器的内部缓冲反复清空，
   * 段与段交界处容易出现杂音；flush 只该在整条码流结束时调用一次。
   */
  async decodePartial(
    frames: Uint8Array[],
    onChunk?: (chunk: DecodedChunk) => void,
  ): Promise<DecodeSummary> {
    if (this.decoder === null || this.released) {
      throw new Error('解码器尚未就绪或已释放');
    }
    const batchSize = Math.max(1, this.options.framesPerBatch ?? DEFAULT_FRAMES_PER_BATCH);
    for (let index = 0; index < frames.length; index += batchSize) {
      const batch = frames.slice(index, index + batchSize);
      this.consumeResult(await this.decoder.decodeFrames(batch), onChunk);
      // 让出事件循环：解码本身是同步的 wasm 调用，不分批会把扩展宿主卡住。
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return this.snapshot();
  }

  /** 整条码流结束：把解码器里剩下的数据吐出来。 */
  async flush(onChunk?: (chunk: DecodedChunk) => void): Promise<DecodeSummary> {
    if (this.decoder === null || this.released) {
      throw new Error('解码器尚未就绪或已释放');
    }
    this.consumeResult(await this.decoder.flush(), onChunk);
    return this.snapshot();
  }

  private snapshot(): DecodeSummary {
    return {
      sampleRate: this.sampleRate,
      channels: this.channels,
      frames: this.totalFrames,
      bytes: this.totalBytes,
      chunkCount: this.chunkCount,
      errors: [...this.errors],
    };
  }

  private consumeResult(decoded: WasmDecodedAudio, onChunk?: (chunk: DecodedChunk) => void): void {
    for (const error of decoded.errors ?? []) {
      if (error.message !== undefined) this.errors.add(error.message);
    }
    if (decoded.samplesDecoded <= 0 || decoded.channelData.length === 0) return;
    if (this.sampleRate === 0) {
      this.sampleRate = decoded.sampleRate;
      this.channels = decoded.channelData.length;
    } else if (decoded.sampleRate !== this.sampleRate) {
      this.warn(`采样率发生变化（${this.sampleRate} → ${decoded.sampleRate}）`);
      this.sampleRate = decoded.sampleRate;
    }
    const interleaved = interleaveToInt16(decoded.channelData, decoded.samplesDecoded);
    const pcm = int16ToBuffer(interleaved);
    this.totalFrames += decoded.samplesDecoded;
    this.totalBytes += pcm.byteLength;
    this.chunkCount++;
    onChunk?.({
      pcm,
      frames: decoded.samplesDecoded,
      sampleRate: this.sampleRate,
      channels: decoded.channelData.length,
    });
  }

  /** 释放 wasm 内存；释放后实例不可再用。 */
  free(): void {
    this.released = true;
    for (const message of this.errors) this.warn(`AAC 解码器报告：${message}`);
    this.decoder?.free();
    this.decoder = null;
  }
}

/** 一次性解完（spike 与单测用）。 */
export async function decodeAacToPcm(
  frames: Uint8Array[],
  audioSpecificConfig: Uint8Array,
  options: { framesPerBatch?: number; onWarn?: (message: string) => void } = {},
): Promise<{ pcm: Buffer; summary: DecodeSummary }> {
  const decoder = new AacFrameDecoder({
    audioSpecificConfig,
    ...(options.framesPerBatch === undefined ? {} : { framesPerBatch: options.framesPerBatch }),
    ...(options.onWarn === undefined ? {} : { onWarn: options.onWarn }),
  });
  await decoder.ready();
  try {
    const parts: Buffer[] = [];
    const summary = await decoder.decode(frames, (chunk) => parts.push(chunk.pcm));
    return { pcm: Buffer.concat(parts), summary };
  } finally {
    decoder.free();
  }
}
