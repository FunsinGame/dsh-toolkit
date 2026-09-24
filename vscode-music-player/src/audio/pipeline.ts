/**
 * 音频物化流水线：playurl → 取字节 → 解封装 → AAC 解码 → WAV。
 *
 * 「物化」这个词是刻意的：结果是一段可以直接交给 `<audio>` 的完整 WAV（内存
 * 里，可选落盘）。之所以不能在 webview 里直接播 AAC，见 `aacDecoder.ts` 顶部
 * 的说明——VS Code 的 Electron 不带 AAC 解码白名单。
 *
 * 长度用「预测」而不是「解完再定」：mp4box 从分片表算出的 `samples_duration`
 * 与真实解码帧数只差几毫秒（P0a 实测 0.015%），因此可以先写好头再推 PCM，
 * 让播放器不必等整首歌解完。
 */

import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { BilibiliError } from '../bilibili/errors';
import type { BilibiliApi } from '../bilibili/api';
import type { BilibiliClient } from '../bilibili/client';
import { AacFrameDecoder, type DecodeSummary } from './aacDecoder';
import { createStreamingDemuxer, demuxAudioTrack, type AudioTrackInfo } from './demuxer';
import {
  buildWavHeader,
  predictedPcmBytes,
  ProgressiveWav,
  readWavFormat,
  type WavFormat,
} from './wav';
import type { PrepareStage } from '../protocol';
import { silentLogger, type Logger } from '../util/log';
import { parseContentRangeTotal } from '../media/range';

export interface MaterializeOptions {
  bvid: string;
  cid: number;
  quality: number;
  /** 上层给的时长（秒），用于播放列表显示；预测长度优先用文件自报值。 */
  durationHintSeconds?: number;
  signal?: AbortSignal;
  onStage?: (stage: PrepareStage, message: string, percent: number | null) => void;
}

export interface MaterializedAudio {
  wav: Buffer;
  sampleRate: number;
  channels: number;
  durationSeconds: number;
  /** 上游压缩音频的字节数（诊断用）。 */
  sourceBytes: number;
  sourceContainer: 'dash' | 'durl';
  sourceCodecs: string | null;
  demuxMs: number;
  decodeMs: number;
  fromCache: boolean;
}

export interface AudioPipelineOptions {
  api: BilibiliApi;
  client: BilibiliClient;
  logger?: Logger;
  /** 磁盘缓存目录；为 null 则只放内存。 */
  cacheDir?: string | null;
  /** 磁盘缓存上限（字节）；超过后按最久未使用淘汰。 */
  cacheMaxBytes?: number;
}

/** 默认磁盘缓存上限：500MB。 */
const DEFAULT_CACHE_MAX_BYTES = 500 * 1024 * 1024;

/**
 * 缓存目录用量（按文件）。
 *
 * 导出成纯函数是为了能单测：淘汰逻辑（最久未使用先删、删到限额以内）不该只靠
 * 真跑一遍才能验证。
 */
export interface CacheFileInfo {
  name: string;
  bytes: number;
  /** 最后修改时间（毫秒）。 */
  modifiedAt: number;
}

/** 决定要删掉哪些缓存文件：按最后修改时间从旧到新删，直到总量不超过上限。 */
export function selectCacheEvictions(
  files: CacheFileInfo[],
  maxBytes: number,
): CacheFileInfo[] {
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  if (total <= maxBytes) return [];
  const oldestFirst = [...files].sort((left, right) => left.modifiedAt - right.modifiedAt);
  const evictions: CacheFileInfo[] = [];
  let remaining = total;
  for (const file of oldestFirst) {
    if (remaining <= maxBytes) break;
    evictions.push(file);
    remaining -= file.bytes;
  }
  return evictions;
}

export class AudioPipeline {
  private readonly logger: Logger;

  constructor(private readonly options: AudioPipelineOptions) {
    this.logger = options.logger ?? silentLogger;
  }

  private cachePath(options: MaterializeOptions): string | null {
    const dir = this.options.cacheDir;
    if (!dir) return null;
    return join(dir, `${options.bvid}-${options.cid}-${options.quality}.wav`);
  }

  /** 命中磁盘缓存就直接读，省掉一次网络 + 解码。 */
  private async readCache(file: string): Promise<MaterializedAudio | null> {
    try {
      const info = await stat(file);
      if (info.size <= 44) return null;
      const wav = await readFile(file);
      const format = readWavFormat(wav);
      return {
        wav,
        sampleRate: format.sampleRate,
        channels: format.channels,
        durationSeconds: format.dataBytes / (format.sampleRate * format.channels * (format.bitsPerSample / 8)),
        sourceBytes: 0,
        sourceContainer: 'dash',
        sourceCodecs: null,
        demuxMs: 0,
        decodeMs: 0,
        fromCache: true,
      };
    } catch {
      return null;
    }
  }

  /**
   * 查磁盘缓存（供流式起播前调用）。
   *
   * 缓存命中是最快的一条路：不用下网络、不用解码，也就不会碰到「点击后超过 5 秒
   * 手势窗口」的问题。
   */
  async readCachedAudio(options: {
    bvid: string;
    cid: number;
    quality: number;
  }): Promise<MaterializedAudio | null> {
    const file = this.cachePath(options);
    if (file === null) return null;
    const cached = await this.readCache(file);
    if (cached !== null) this.logger.info(`命中音频缓存：${file}`);
    return cached;
  }

  /** 把整段音频写进磁盘缓存，并按上限淘汰旧文件。 */
  async writeCachedAudio(
    options: { bvid: string; cid: number; quality: number },
    wav: Buffer,
  ): Promise<void> {
    const file = this.cachePath(options);
    if (file === null || wav.byteLength <= 44) return;
    try {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, wav);
      await this.enforceCacheLimit();
    } catch (error) {
      this.logger.warn('写入音频缓存失败（不影响播放）', error);
    }
  }

  /** 取音频字节，主地址失败时依次尝试备用地址。 */
  private async fetchAudioBytes(
    urls: string[],
    signal?: AbortSignal,
  ): Promise<{ bytes: Uint8Array; url: string }> {
    let lastError: unknown = null;
    for (const url of urls) {
      try {
        const response = await this.options.client.fetchRaw({
          url,
          ...(signal === undefined ? {} : { signal }),
        });
        if (!response.ok) {
          throw new BilibiliError('http', `音频 CDN 返回 HTTP ${response.status}`, {
            httpStatus: response.status,
          });
        }
        return { bytes: new Uint8Array(await response.arrayBuffer()), url };
      } catch (error) {
        // 用户切歌导致的中止不是「这个地址不行」，别去试备用地址，直接往上抛。
        if (error instanceof BilibiliError && error.kind === 'aborted') throw error;
        lastError = error;
        this.logger.warn(`音频地址失败，尝试下一个：${url.slice(0, 80)}…`);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new BilibiliError('network', '所有音频地址都无法访问');
  }

  /**
   * 物化一首歌。返回的 WAV 可以直接交给回环代理。
   */
  async materialize(options: MaterializeOptions): Promise<MaterializedAudio> {
    const stage = options.onStage ?? (() => undefined);
    const cacheFile = this.cachePath(options);

    if (cacheFile !== null) {
      stage('cache', '正在查找缓存…', null);
      const cached = await this.readCache(cacheFile);
      if (cached !== null) {
        this.logger.info(`命中音频缓存：${cacheFile}`);
        stage('ready', '命中缓存', 100);
        return cached;
      }
    }

    stage('fetch', '正在获取音频地址…', null);
    const stream = await this.options.api.getAudioStream({
      bvid: options.bvid,
      cid: options.cid,
      quality: options.quality,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    const codecs = (stream.codecs ?? '').toLowerCase();
    if (stream.container === 'dash' && codecs !== '' && !codecs.startsWith('mp4a')) {
      throw new BilibiliError(
        'unavailable',
        `这个视频的音轨是 ${stream.codecs}，本插件只支持 AAC（mp4a）`,
      );
    }

    stage('fetch', '正在下载音频…', 5);
    const { bytes } = await this.fetchAudioBytes([stream.url, ...stream.backupUrls], options.signal);
    this.logger.info(`音频已下载：${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB`);
    stage('demux', '正在解封装…', 35);

    const demuxStart = Date.now();
    const demuxed = demuxAudioTrack(bytes, { onWarn: (message) => this.logger.warn(message) });
    const demuxMs = Date.now() - demuxStart;
    const asc = demuxed.info.audioSpecificConfig;
    if (asc === null) {
      throw new BilibiliError('parse', '音频文件里没有 AudioSpecificConfig，无法解码');
    }

    const format: WavFormat = {
      sampleRate: demuxed.info.sampleRate,
      channels: demuxed.info.channelCount,
      bitsPerSample: 16,
    };
    if (format.sampleRate <= 0 || format.channels <= 0) {
      throw new BilibiliError('parse', `音频格式异常：${format.sampleRate}Hz ${format.channels}ch`);
    }

    const predictedSeconds =
      demuxed.info.durationSeconds ?? demuxed.info.samplesDuration ?? options.durationHintSeconds ?? 0;
    const writer = new ProgressiveWav(format, predictedPcmBytes(predictedSeconds, format));

    stage('decode', '正在解码…', 45);
    const decodeStart = Date.now();
    const decoder = new AacFrameDecoder({
      audioSpecificConfig: asc,
      onWarn: (message) => this.logger.warn(message),
    });
    await decoder.ready();

    const pieces: Buffer[] = [writer.header()];
    let decodedFrames = 0;
    let summary: DecodeSummary;
    const totalFramesHint = summaryFramesHint(predictedSeconds, format);
    try {
      summary = await decoder.decode(demuxed.frames, (chunk) => {
        decodedFrames += chunk.frames;
        const accepted = writer.accept(chunk.pcm);
        if (accepted.byteLength > 0) pieces.push(accepted);
        if (predictedSeconds > 0) {
          const percent = Math.min(99, 45 + Math.round((decodedFrames / totalFramesHint) * 54));
          stage('decode', '正在解码…', percent);
        }
      });
    } finally {
      decoder.free();
    }
    const decodeMs = Date.now() - decodeStart;

    const padding = writer.finish();
    if (padding.byteLength > 0) pieces.push(padding);
    const wav = Buffer.concat(pieces);
    const durationSeconds =
      summary.sampleRate > 0 ? summary.frames / summary.sampleRate : decodedFrames / format.sampleRate;

    this.logger.info('音频已物化', {
      durationSeconds: Number(durationSeconds.toFixed(3)),
      predictedSeconds: Number(predictedSeconds.toFixed(3)),
      paddingMs: Math.round((padding.byteLength / (format.sampleRate * format.channels * 2)) * 1000),
      demuxMs,
      decodeMs,
      wavBytes: wav.byteLength,
    });

    if (cacheFile !== null) {
      try {
        await mkdir(dirname(cacheFile), { recursive: true });
        await writeFile(cacheFile, wav);
        await this.enforceCacheLimit();
      } catch (error) {
        this.logger.warn('写入音频缓存失败（不影响播放）', error);
      }
    }

    stage('ready', '准备就绪', 100);
    return {
      wav,
      sampleRate: summary.sampleRate,
      channels: summary.channels,
      durationSeconds,
      sourceBytes: bytes.byteLength,
      sourceContainer: stream.container,
      sourceCodecs: stream.codecs,
      demuxMs,
      decodeMs,
      fromCache: false,
    };
  }

  /** 缓存目录用量（`clearCache` 命令与状态显示用）。 */
  async cacheStats(): Promise<{ files: number; bytes: number }> {
    const dir = this.options.cacheDir;
    if (!dir) return { files: 0, bytes: 0 };
    try {
      const names = await readdir(dir);
      let bytes = 0;
      for (const name of names) {
        const info = await stat(join(dir, name)).catch(() => null);
        if (info?.isFile()) bytes += info.size;
      }
      return { files: names.length, bytes };
    } catch {
      return { files: 0, bytes: 0 };
    }
  }

  /** 清空磁盘缓存。 */
  async clearCache(): Promise<void> {
    const dir = this.options.cacheDir;
    if (!dir) return;
    await rm(dir, { recursive: true, force: true });
  }

  /**
   * 流式物化：先下头部就起播，剩下的在后台补。
   *
   * 与 `materialize` 的区别是它**不返回**完整 WAV，而是通过 `sink` 把 PCM 一段段推
   * 给调用方（调用方写进边写边播的缓冲区，代理按 Range 提供）。这样：
   *
   *  - 宿主可以在一秒左右就把播放地址交给界面，`play()` 落在 5 秒手势窗口内，
   *    不会再有「时钟在走却没声音」；
   *  - 出声时间从「整段下完 + 全曲解码」（实测约 6 秒）降到「头部下完 + 头部解码」
   *    （约 1～2 秒）。
   *
   * 任何一步失败都往上抛，由调用方决定是否退回 `materialize`（它更慢但更稳）。
   */
  async materializeStreaming(options: MaterializeStreamingOptions): Promise<StreamingSummary> {
    const stage = options.onStage ?? (() => undefined);
    stage('fetch', '正在获取音频地址…', null);

    const stream = await this.options.api.getAudioStream({
      bvid: options.bvid,
      cid: options.cid,
      quality: options.quality,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    const codecs = (stream.codecs ?? '').toLowerCase();
    if (stream.container === 'dash' && codecs !== '' && !codecs.startsWith('mp4a')) {
      throw new BilibiliError('unavailable', `这个视频的音轨是 ${stream.codecs}，本插件只支持 AAC（mp4a）`);
    }

    const durationHintSeconds = options.durationHintSeconds ?? stream.durationSeconds ?? 0;
    if (durationHintSeconds <= 0) {
      // 没有时长就算不出预测总长，而 WAV 头部又必须先发出去——只能退回整段路径。
      throw new BilibiliError('parse', '缺少时长信息，无法预测 WAV 总长');
    }

    stage('fetch', '正在下载开头…', 5);
    const head = await this.fetchRange(stream.url, 0, HEAD_FETCH_BYTES - 1, stream.backupUrls, options.signal);
    if (!head.ranged) {
      // CDN 不支持 Range（或忽略了它）：拿到的其实是整段，那就不必走流式复杂路径。
      throw new BilibiliError('network', '音频 CDN 未按 Range 返回，改用整段下载');
    }

    const demuxer = createStreamingDemuxer({ onWarn: (message) => this.logger.warn(message) });
    let frames = demuxer.append(head.bytes);
    const info: AudioTrackInfo | null = demuxer.info;
    if (info === null) {
      throw new BilibiliError('parse', '头部数据里没有解析出音轨信息');
    }
    const asc = info.audioSpecificConfig;
    if (asc === null) {
      throw new BilibiliError('parse', '音频文件里没有 AudioSpecificConfig，无法解码');
    }

    const format: WavFormat = {
      sampleRate: info.sampleRate,
      channels: info.channelCount,
      bitsPerSample: 16,
    };
    if (info.sampleRate <= 0 || info.channelCount <= 0) {
      throw new BilibiliError('parse', `音频格式异常：${info.sampleRate}Hz ${info.channelCount}ch`);
    }

    const predictedSeconds = durationHintSeconds * DURATION_SAFETY_FACTOR + DURATION_SAFETY_SECONDS;
    const dataBytes = predictedPcmBytes(predictedSeconds, format);
    const totalBytes = 44 + dataBytes;
    options.sink.onHeader({ format, totalBytes, headerBytes: buildWavHeader(format, dataBytes) });

    stage('decode', '正在解码…', 30);
    const decoder = new AacFrameDecoder({
      audioSpecificConfig: asc,
      onWarn: (message) => this.logger.warn(message),
    });
    await decoder.ready();

    const decodeStart = Date.now();
    let pcmBytes = 0;
    const consume = (chunk: { pcm: Buffer }): void => {
      pcmBytes += chunk.pcm.byteLength;
      options.sink.onPcm(chunk.pcm);
    };

    // 先把头部解出来——出声就靠它。
    const fedLengths: number[] = [];
    const consumeFrames = async (list: Uint8Array[]): Promise<void> => {
      if (list.length === 0) return;
      for (const frame of list) fedLengths.push(frame.byteLength);
      await decoder.decodePartial(list, consume);
    };
    await consumeFrames(frames);
    stage('decode', '已开始播放，正在解码后续内容…', 60);

    // 后台把剩下的下完，边下边解。
    let restBytes = 0;
    let totalSize = head.totalSize;
    let offset = head.bytes.byteLength;
    const restChunks: Buffer[] = [];
    try {
      while (totalSize === null || offset < totalSize) {
        if (options.signal?.aborted === true) break;
        const end =
          totalSize === null
            ? offset + REST_CHUNK_BYTES - 1
            : Math.min(offset + REST_CHUNK_BYTES - 1, totalSize - 1);
        const rest = await this.fetchRange(stream.url, offset, end, stream.backupUrls, options.signal);
        if (!rest.ranged || rest.bytes.byteLength === 0) break;
        restBytes += rest.bytes.byteLength;
        offset += rest.bytes.byteLength;
        if (rest.totalSize !== null) totalSize = rest.totalSize;
        restChunks.push(Buffer.from(rest.bytes));
        await consumeFrames(demuxer.append(rest.bytes));
      }

      // 整条码流结束，把两边的缓冲都清空。
      await consumeFrames(demuxer.flush());

      // 对账：增量解析偶尔会在分块边界上漏掉最后 1 个 sample。用整段解封装核对一次，
      // 把少喂的尾部帧补上（先校验前缀帧长度一致，对不上就放弃补，宁可少 20ms 也不喂错）。
      //
      // 已知的微小偏差：流式路径解出的 PCM 比整段路径少约 1000 个采样（≈23ms，位于
      // 结尾）。它来自「分段 decodePartial + flush」与「一次性 decode」在解码器尾部
      // 计数上的差异；由于头部的预测长度本来就留了 1%+0.5s 的静音余量（实测约 3 秒），
      // 这 23ms 落在静音区里，听不出来。整段路径依旧是它的回退方案。
      await this.reconcileTail(
        Buffer.concat([Buffer.from(head.bytes), ...restChunks]),
        fedLengths,
        consumeFrames,
      );

      await decoder.flush(consume);
    } finally {
      decoder.free();
    }
    const decodeMs = Date.now() - decodeStart;

    const paddingBytes = Math.max(0, dataBytes - pcmBytes);
    options.sink.onFinish(paddingBytes);
    const durationSeconds =
      info.sampleRate > 0 && info.channelCount > 0
        ? pcmBytes / (info.channelCount * 2) / info.sampleRate
        : 0;

    this.logger.info('流式物化完成', {
      headBytes: head.bytes.byteLength,
      restBytes,
      pcmBytes,
      paddingBytes,
      durationSeconds: Number(durationSeconds.toFixed(2)),
      decodeMs,
    });

    return {
      sampleRate: info.sampleRate,
      channels: info.channelCount,
      totalBytes,
      pcmBytes,
      durationSeconds,
      headBytes: head.bytes.byteLength,
      restBytes,
      decodeMs,
    };
  }

  /**
   * 用整段解封装给增量解析对账，补齐可能漏掉的尾部帧。
   *
   * 只在「已喂的帧长度序列与整段解析的前缀完全一致」时才补——那说明增量结果确实是
   * 整段结果的前缀，多出来的部分就是漏掉的尾部。对不上就什么都不做（宁可少听 20ms，
   * 也不能把错位的帧喂进解码器）。
   */
  private async reconcileTail(
    accumulated: Buffer,
    fedLengths: number[],
    consumeFrames: (list: Uint8Array[]) => Promise<void>,
  ): Promise<void> {
    if (accumulated.byteLength === 0) return;
    let whole;
    try {
      whole = demuxAudioTrack(new Uint8Array(accumulated), {
        onWarn: (message) => this.logger.warn(message),
      });
    } catch (error) {
      this.logger.warn('整段对账失败（忽略，继续用增量结果）', error);
      return;
    }
    if (whole.frames.length <= fedLengths.length) return;

    const prefixMatches = fedLengths.every(
      (length, index) => whole.frames[index]?.byteLength === length,
    );
    if (!prefixMatches) {
      this.logger.warn('整段对账发现前缀不一致，放弃补帧（避免喂错位的帧）');
      return;
    }
    const extra = whole.frames.slice(fedLengths.length);
    this.logger.info(`增量解析少给了 ${extra.length} 个尾部帧，已用整段对账补齐`);
    await consumeFrames(extra);
  }

  /**
   * 取一段字节。
   *
   * `ranged` 为 false 表示 CDN 没按 Range 返回（HTTP 200 整段），调用方必须据此
   * 放弃「边下边播」的假设——直接拿它当整段用是最稳的。
   */  private async fetchRange(
    url: string,
    start: number,
    end: number,
    backupUrls: string[] = [],
    signal?: AbortSignal,
  ): Promise<{ bytes: Uint8Array; ranged: boolean; totalSize: number | null }> {
    let lastError: unknown = null;
    for (const candidate of [url, ...backupUrls]) {
      try {
        const response = await this.options.client.fetchRaw({
          url: candidate,
          headers: { Range: `bytes=${start}-${end}` },
          ...(signal === undefined ? {} : { signal }),
        });
        if (!response.ok && response.status !== 206) {
          throw new BilibiliError('http', `音频 CDN 返回 HTTP ${response.status}`, {
            httpStatus: response.status,
          });
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const contentRange = response.headers.get('content-range');
        const totalSize = parseContentRangeTotal(contentRange);
        return { bytes, ranged: response.status === 206, totalSize };
      } catch (error) {
        if (error instanceof BilibiliError && error.kind === 'aborted') throw error;
        lastError = error;
        this.logger.warn(`分段下载失败，尝试下一个地址：${candidate.slice(0, 80)}…`);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new BilibiliError('network', '分段下载音频失败');
  }

  /**
   * 超出上限时按「最久未修改」淘汰，返回删掉的文件数。
   *
   * 设置项 `musicPlayer.cache.maxMB` 默认 500MB，而一首 WAV 就有 30–40MB，不淘汰的话
   * 听十几首就把用户的磁盘占满了。（公开是为了能直接测这条真会删文件的路径。）
   */
  async enforceCacheLimit(): Promise<number> {
    const dir = this.options.cacheDir;
    if (!dir) return 0;
    const maxBytes = this.options.cacheMaxBytes ?? DEFAULT_CACHE_MAX_BYTES;
    if (maxBytes <= 0) return 0;

    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return 0;
    }

    const files: CacheFileInfo[] = [];
    for (const name of names) {
      const info = await stat(join(dir, name)).catch(() => null);
      if (info?.isFile()) {
        files.push({ name, bytes: info.size, modifiedAt: info.mtimeMs });
      }
    }

    const evictions = selectCacheEvictions(files, maxBytes);
    if (evictions.length === 0) return 0;
    for (const file of evictions) {
      await rm(join(dir, file.name), { force: true }).catch(() => undefined);
    }
    this.logger.info(
      `音频缓存超出上限，已淘汰 ${evictions.length} 个文件（${Math.round(
        evictions.reduce((sum, file) => sum + file.bytes, 0) / 1024 / 1024,
      )}MB）`,
    );
    return evictions.length;
  }
}

/** 估算总帧数（只用于进度百分比，不需要精确）。 */
function summaryFramesHint(seconds: number, format: WavFormat): number {
  return Math.max(1, Math.round(seconds * format.sampleRate));
}

/** 把 WAV 包成 `<audio>` 用的正确 MIME。 */
export const WAV_CONTENT_TYPE = 'audio/wav';

/* ---------------------------------------------------------------- 流式起播 */

/**
 * 首播只下这么多字节。
 *
 * 192kbps 下 1.5MB ≈ 60 秒音频：足够解出格式、启动播放，也足够覆盖「剩下的部分
 * 在后台下完」所需要的时间。太小会让播放器追上下载进度而卡顿，太大则失去意义。
 */
const HEAD_FETCH_BYTES = 1_536_000;

/** 后台下载剩余部分时每块的大小。 */
const REST_CHUNK_BYTES = 1_048_576;

/**
 * 预测总长的保守放大。
 *
 * WAV 头部一旦发出去就改不了了，所以宁可**多留一点**（尾部补静音，无感知），也不能
 * 少算——少算会把结尾切掉。上游接口给的时长与真实解码长度通常差 0.1%~0.6%（实测
 * 155s vs 154.13s），再加 1% 与 0.5 秒余量足够安全。
 */
const DURATION_SAFETY_FACTOR = 1.01;
const DURATION_SAFETY_SECONDS = 0.5;

export interface StreamingSink {
  /** 格式与预测总长确定时调用：此时应把 `headerBytes` 写入缓冲区并对外发布 URL。 */
  onHeader(info: { format: WavFormat; totalBytes: number; headerBytes: Buffer }): void;
  /** 解出一批 PCM（交错 16 位小端）。 */
  onPcm(chunk: Buffer): void;
  /** 全部写完：`paddingBytes` 是补齐预测长度的静音字节数。 */
  onFinish(paddingBytes: number): void;
}

export interface MaterializeStreamingOptions {
  bvid: string;
  cid: number;
  quality: number;
  /** 上游给的时长（秒）。流式路径**必须**有它，否则算不出预测总长。 */
  durationHintSeconds?: number;
  signal?: AbortSignal;
  onStage?: (stage: PrepareStage, message: string, percent: number | null) => void;
  sink: StreamingSink;
}

export interface StreamingSummary {
  sampleRate: number;
  channels: number;
  /** 预测的 WAV 总字节数（含 44 字节头）。 */
  totalBytes: number;
  /** 实际解出的 PCM 字节数。 */
  pcmBytes: number;
  durationSeconds: number;
  /** 首播前只下了多少字节。 */
  headBytes: number;
  /** 后台又下了多少字节。 */
  restBytes: number;
  decodeMs: number;
}
