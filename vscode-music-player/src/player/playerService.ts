/**
 * 播放服务（宿主侧权威状态）。
 *
 * 这里刻意把「谁在放、放到哪、队列是什么」放在扩展宿主而不是 webview：侧边栏
 * 视图随时可能被隐藏或销毁，只有宿主状态能跨视图生命周期存活。
 *
 * P0b 阶段只实现「物化 + 交给 webview 播放 + 记录上报」；队列、模式、缓存淘汰
 * 在 P3 补齐（接口已经预留）。
 */

import type { AudioPipeline, MaterializedAudio } from '../audio/pipeline';
import type { BilibiliApi } from '../bilibili/api';
import type { MediaStore } from '../media/mediaStore';
import { WAV_CONTENT_TYPE } from '../audio/pipeline';
import { BilibiliError, toBilibiliError } from '../bilibili/errors';
import type { GrowingBuffer } from '../media/growingBuffer';
import {
  adopt,
  advance,
  clear,
  currentIndex,
  currentTrack,
  enqueue,
  move,
  removeAt,
  setMode,
  EMPTY_QUEUE,
  type QueueSnapshot,
} from './queue';
import type { PlayMode, TrackSummary, PrepareStage } from '../protocol';
import { silentLogger, type Logger } from '../util/log';

export interface PlayerState {
  track: TrackSummary | null;
  playing: boolean;
  position: number;
  duration: number;
  /** 媒体代理上的地址（带 token）。 */
  url: string | null;
  /** 被自动播放策略逼成静音时为 true（时钟照走但没声音）。 */
  muted: boolean;
  volume: number;
}

export interface PlayerServiceOptions {
  api: BilibiliApi;
  pipeline: AudioPipeline;
  store: MediaStore;
  /** 拼媒体代理 URL（带 token）。 */
  proxyUrl: (path: string) => string;
  logger?: Logger;
  /** 状态或进度变化时回调。 */
  onState?: (state: PlayerState) => void;
  /** 物化进度回调。 */
  onPrepare?: (stage: PrepareStage, message: string, percent: number | null) => void;
  getQuality: () => number;
  getVolume?: () => number;
  /** 队列变化时回调（列表、当前下标、模式）。 */
  onQueue?: (state: QueueSnapshot, index: number) => void;
  /** 是否启用流式起播；默认开启（测试与排查时可关）。 */
  streamingEnabled?: () => boolean;
}

/** 一次「上一首/下一首」的判定结果，副作用交给调用方。 */
export type AdvanceDecision =
  /** 原地重播当前这一首（单曲循环，或列表只有一首）。 */
  | { kind: 'replay' }
  /** 换一首播。 */
  | { kind: 'play'; track: TrackSummary }
  /** 顺序播放到底了，停下来。 */
  | { kind: 'stop' };

/** 预取缓存最多留几条（一条 WAV 可达 40MB，不能多留）。 */
const PREPARED_CACHE_LIMIT = 2;

export class PlayerService {
  private readonly logger: Logger;
  private state: PlayerState = {
    track: null,
    playing: false,
    position: 0,
    duration: 0,
    url: null,
    muted: false,
    volume: 0.8,
  };
  /** 预取好的音频：键 → 物化结果。 */
  private readonly prepared = new Map<string, MaterializedAudio>();
  /** 正在物化的请求：键 → Promise，避免悬停与点击同时触发两次下载。 */
  private readonly inflight = new Map<string, Promise<MaterializedAudio>>();
  /** 当前音轨在登记表里的 id，切歌时清掉旧条目以免内存堆积。 */
  private currentMediaId: string | null = null;
  /** 正在物化的请求序号，用于丢弃过期结果。 */
  private requestSeq = 0;
  /** 流式起播时登记的「边写边播」条目；换歌或退回整段物化时要清掉。 */
  private streamingEntry: { id: string; growing: GrowingBuffer } | null = null;
  /** 当前播放请求的中止器：用户点了别的歌就把它掐掉，别继续白下载。 */
  private playAbort: AbortController | null = null;

  constructor(private readonly options: PlayerServiceOptions) {
    this.logger = options.logger ?? silentLogger;
  }

  private volume(): number {
    return this.options.getVolume?.() ?? 0.8;
  }

  private key(bvid: string, cid: number, quality: number): string {
    return `${bvid}:${cid}:${quality}`;
  }

  /** 解析出 cid（搜索结果不带 cid，需要问一次 pagelist）。 */
  private async resolveCid(track: TrackSummary, signal?: AbortSignal): Promise<TrackSummary> {
    if (track.cid !== undefined) return track;
    const pages = await this.options.api.getPageList(track.bvid, signal);
    const first = pages[0];
    if (!first) throw new BilibiliError('unavailable', `视频没有分 P：${track.bvid}`);
    return {
      ...track,
      cid: first.cid,
      durationSeconds: track.durationSeconds > 0 ? track.durationSeconds : first.duration,
      pageCount: pages.length,
    };
  }

  /** 物化（带 inflight 去重与预取缓存）。 */
  private async materialize(
    track: TrackSummary,
    onStage: (stage: PrepareStage, message: string, percent: number | null) => void,
    signal?: AbortSignal,
  ): Promise<{ materialized: MaterializedAudio; fromPrepared: boolean }> {
    const cid = track.cid;
    if (cid === undefined) throw new BilibiliError('unavailable', '缺少 cid，无法播放');
    const quality = this.options.getQuality();
    const key = this.key(track.bvid, cid, quality);

    const cached = this.prepared.get(key);
    if (cached !== undefined) {
      this.prepared.delete(key);
      this.prepared.set(key, cached);
      return { materialized: cached, fromPrepared: true };
    }

    const existing = this.inflight.get(key);
    if (existing !== undefined) {
      onStage('fetch', '正在等待预取的音频…', null);
      return { materialized: await existing, fromPrepared: true };
    }

    const task = this.options.pipeline.materialize({
      bvid: track.bvid,
      cid,
      quality,
      durationHintSeconds: track.durationSeconds,
      onStage,
      ...(signal === undefined ? {} : { signal }),
    });
    this.inflight.set(key, task);
    try {
      const materialized = await task;
      this.remember(key, materialized);
      return { materialized, fromPrepared: false };
    } finally {
      this.inflight.delete(key);
    }
  }

  /** 记住物化结果，超过上限就丢掉最旧的。 */
  private remember(key: string, materialized: MaterializedAudio): void {
    this.prepared.delete(key);
    this.prepared.set(key, materialized);
    while (this.prepared.size > PREPARED_CACHE_LIMIT) {
      const oldest = this.prepared.keys().next();
      if (oldest.done === true) break;
      this.prepared.delete(oldest.value);
    }
  }

  /**
   * 预取：悬停时就把音频物化好，点击时 `play()` 才能落在 5 秒手势窗口内。
   * 失败只记日志，不打扰用户（悬停本身是「可能不点」的动作）。
   */
  async prepare(track: TrackSummary): Promise<void> {
    try {
      const resolved = await this.resolveCid(track);
      const cid = resolved.cid;
      if (cid === undefined) return;
      const quality = this.options.getQuality();
      const key = this.key(resolved.bvid, cid, quality);
      if (this.prepared.has(key) || this.inflight.has(key)) return;
      this.logger.debug(`预取音频：${resolved.title}`);
      await this.materialize(resolved, () => undefined);
    } catch (error) {
      this.logger.debug('预取失败（不影响点击播放）', error);
    }
  }

  get current(): PlayerState {
    return this.state;
  }

  get currentMediaUrl(): string | null {
    return this.state.url;
  }

  /** 是否处于静音兜底状态（时钟在走但没声音）。 */
  get muted(): boolean {
    return this.state.muted;
  }

  /* ------------------------------------------------------------------ 队列 */

  private queue: QueueSnapshot = { ...EMPTY_QUEUE };

  get queueState(): QueueSnapshot {
    return this.queue;
  }

  private emitQueue(): void {
    this.options.onQueue?.(this.queue, currentIndex(this.queue));
  }

  /** 用一份列表接管队列，并定位到第 `index` 项（列表里点歌）。 */
  adoptQueue(items: TrackSummary[], index: number): void {
    this.queue = adopt(items, index, this.queue.mode);
    this.emitQueue();
  }

  /** 追加到队列末尾。 */
  enqueueTrack(track: TrackSummary): void {
    this.queue = enqueue(this.queue, track);
    this.emitQueue();
  }

  removeQueueAt(index: number): void {
    this.queue = removeAt(this.queue, index);
    this.emitQueue();
  }

  moveInQueue(from: number, to: number): void {
    this.queue = move(this.queue, from, to);
    this.emitQueue();
  }

  clearQueue(): void {
    this.queue = clear(this.queue);
    this.emitQueue();
  }

  setPlayMode(mode: PlayMode): void {
    this.queue = setMode(this.queue, mode);
    this.emitQueue();
  }

  /**
   * 前进/后退一格，并返回该怎么播。
   *
   * @param auto true = 上一首自然放完（`ended`）；false = 用户点了下一首。
   */
  step(direction: 1 | -1, options: { auto: boolean }): AdvanceDecision {
    const result = advance(this.queue, direction, options);
    this.queue = result.state;
    this.emitQueue();
    if (result.kind === 'replay') return { kind: 'replay' };
    if (result.kind === 'stop') return { kind: 'stop' };
    const track = currentTrack(this.queue);
    return track === null ? { kind: 'stop' } : { kind: 'play', track };
  }

  /** 队列里的第 `index` 项（用于「点队列里的某一条」）。 */
  trackAt(index: number): TrackSummary | null {
    return this.queue.items[index] ?? null;
  }

  /** 把队列定位到第 `index` 项（配合 play 使用）。 */
  focusQueueIndex(index: number): void {
    if (index < 0 || index >= this.queue.items.length) return;
    const position = this.queue.order.indexOf(index);
    if (position < 0) return;
    this.queue = { ...this.queue, position };
    this.emitQueue();
  }

  private emit(): void {
    this.options.onState?.({ ...this.state });
  }

  /** webview 上报播放进度/状态。 */
  report(report: {
    playing: boolean;
    position: number;
    duration: number;
    muted?: boolean;
    volume?: number;
  }): void {
    this.state = {
      ...this.state,
      playing: report.playing,
      position: report.position,
      duration: report.duration > 0 ? report.duration : this.state.duration,
      muted: report.muted ?? this.state.muted,
      volume: report.volume ?? this.state.volume,
    };
    this.emit();
  }

  /** 只是切换播放/暂停，不改音源。 */
  setPlaying(playing: boolean): void {
    this.state = { ...this.state, playing };
    this.emit();
  }

  seek(position: number): void {
    this.state = { ...this.state, position };
    this.emit();
  }

  /** 停止并把当前音源从登记表里移除（释放 26MB 级别的内存）。 */
  stop(): void {
    this.discardStreaming();
    if (this.currentMediaId !== null) {
      this.options.store.delete(this.currentMediaId);
      this.currentMediaId = null;
    }
    this.state = { ...this.blankState(), track: null };
    this.emit();
  }

  private blankState(): PlayerState {
    return {
      track: null,
      playing: false,
      position: 0,
      duration: 0,
      url: null,
      muted: false,
      volume: this.volume(),
    };
  }

  /**
   * 播放一首歌：解析 cid → 物化 → 登记到媒体表 → 把地址交给调用方。
   *
   * 优先走**流式**：只下开头十几秒的音频就发布地址（约 1～2 秒），剩下的在后台补。
   * 这样 `play()` 落在点击后的 5 秒手势窗口内，不会再出现「时钟在走却没声音」；
   * 流式任何一步失败都退回整段物化（慢但稳），调用方无需关心走了哪条路。
   */
  async play(input: TrackSummary, onSource?: (url: string) => void): Promise<string> {
    const seq = ++this.requestSeq;
    const onPrepare = this.options.onPrepare ?? (() => undefined);

    // 换歌就把上一首还没下完/还没解完的活掐掉：既省带宽，也让新歌更快出声。
    this.playAbort?.abort();
    const controller = new AbortController();
    this.playAbort = controller;

    onPrepare('queued', '正在准备…', null);
    const track = await this.resolveCid(input, controller.signal);
    const cid = track.cid;
    if (cid === undefined) throw new BilibiliError('unavailable', '缺少 cid，无法播放');
    const quality = this.options.getQuality();

    const prepared = this.takePrepared(track, cid, quality);
    if (prepared !== null) {
      return this.publish(track, prepared, true, onSource);
    }

    // 磁盘缓存是最快的一条路（不下网络、不解码，也就不会撞上自动播放的手势窗口）。
    const cached = await this.options.pipeline.readCachedAudio({
      bvid: track.bvid,
      cid,
      quality,
    });
    if (cached !== null && seq === this.requestSeq) {
      return this.publish(track, cached, false, onSource);
    }

    // 预取正在跑：直接等它，不重复下载。
    const key = this.key(track.bvid, cid, quality);
    const inflight = this.inflight.get(key);
    if (inflight !== undefined && !this.streaming()) {
      onPrepare('fetch', '正在等待预取的音频…', null);
      return this.publish(track, await inflight, true, onSource);
    }

    if (this.streaming() && track.durationSeconds > 0) {
      try {
        const url = await this.playStreaming(track, cid, quality, controller, seq, onPrepare, onSource);
        if (url !== '') {
          // 流式播完把整段结果落盘：下次点这首就能秒开（且不再走网络）。
          this.persistStreamingResult(track, cid, quality);
          return url;
        }
      } catch (error) {
        if (error instanceof BilibiliError && error.kind === 'aborted') throw error;
        this.logger.warn('流式起播失败，退回整段物化', error);
        this.discardStreaming();
      }
    }

    const materialized = await this.materialize(
      track,
      (stage, message, percent) => {
        // 迟到的进度消息直接丢掉，避免切歌时进度条乱跳。
        if (seq !== this.requestSeq) return;
        onPrepare(stage, message, percent);
      },
      controller.signal,
    );

    if (seq !== this.requestSeq) {
      this.logger.debug('播放请求已被更新的请求取代，丢弃结果', { bvid: track.bvid, cid });
      return '';
    }
    if (this.playAbort === controller) this.playAbort = null;
    return this.publish(track, materialized.materialized, materialized.fromPrepared, onSource);
  }

  /** 是否启用流式起播（测试与排查时可关掉）。 */
  private streaming(): boolean {
    return this.options.streamingEnabled?.() ?? true;
  }

  /** 从预取缓存里取（命中即用，不重复下载解码）。 */
  private takePrepared(track: TrackSummary, cid: number, quality: number): MaterializedAudio | null {
    const key = this.key(track.bvid, cid, quality);
    const cached = this.prepared.get(key);
    if (cached === undefined) return null;
    this.prepared.delete(key);
    this.prepared.set(key, cached);
    return cached;
  }

  /** 把整段物化的结果登记为媒体并发地址。 */
  private publish(
    track: TrackSummary,
    materialized: MaterializedAudio,
    fromPrepared: boolean,
    onSource?: (url: string) => void,
  ): string {
    if (this.currentMediaId !== null) this.options.store.delete(this.currentMediaId);
    const mediaId = this.options.store.register({
      kind: 'audio',
      bytes: materialized.wav,
      contentType: WAV_CONTENT_TYPE,
      label: `${track.title} (${track.bvid}/${track.cid ?? 0})`,
      priority: 10,
      ttlMs: 6 * 60 * 60 * 1000,
    });
    this.currentMediaId = mediaId;
    const url = this.options.proxyUrl(`/audio/${mediaId}`);
    this.state = {
      track: { ...track, durationSeconds: materialized.durationSeconds },
      playing: false,
      position: 0,
      duration: materialized.durationSeconds,
      url,
      muted: false,
      volume: this.volume(),
    };
    this.logger.info('开始播放（整段）', {
      title: track.title,
      bvid: track.bvid,
      fromCache: materialized.fromCache,
      fromPrepared,
      durationSeconds: Number(materialized.durationSeconds.toFixed(2)),
    });
    this.emit();
    onSource?.(url);
    return url;
  }

  /** 流式：先下头部就发布地址，其余后台补。 */
  private async playStreaming(
    track: TrackSummary,
    cid: number,
    quality: number,
    controller: AbortController,
    seq: number,
    onPrepare: (stage: PrepareStage, message: string, percent: number | null) => void,
    onSource?: (url: string) => void,
  ): Promise<string> {
    this.discardStreaming();

    await this.options.pipeline.materializeStreaming({
      bvid: track.bvid,
      cid,
      quality,
      durationHintSeconds: track.durationSeconds,
      signal: controller.signal,
      onStage: (stage, message, percent) => {
        if (seq !== this.requestSeq) return;
        onPrepare(stage, message, percent);
      },
      sink: {
        onHeader: ({ totalBytes, headerBytes }) => {
          if (seq !== this.requestSeq) return;
          const created = this.options.store.registerGrowing({
            capacity: totalBytes,
            contentType: WAV_CONTENT_TYPE,
            label: `${track.title} (${track.bvid}/${cid})`,
            priority: 10,
            ttlMs: 6 * 60 * 60 * 1000,
          });
          this.streamingEntry = { id: created.id, growing: created.growing };
          created.growing.append(headerBytes);
          const url = this.options.proxyUrl(`/audio/${created.id}`);
          this.state = {
            track: { ...track },
            playing: false,
            position: 0,
            duration: track.durationSeconds,
            url,
            muted: false,
            volume: this.volume(),
          };
          this.emit();
          this.logger.info('开始播放（流式）', {
            title: track.title,
            bvid: track.bvid,
            capacityMB: Number((totalBytes / 1024 / 1024).toFixed(1)),
          });
          onSource?.(url);
        },
        onPcm: (chunk) => {
          this.streamingEntry?.growing.append(chunk);
        },
        onFinish: (paddingBytes) => {
          const entry = this.streamingEntry;
          if (entry === null) return;
          if (paddingBytes > 0) entry.growing.append(Buffer.alloc(paddingBytes));
          entry.growing.finish();
        },
      },
    });

    if (seq !== this.requestSeq) return '';
    return this.state.url ?? '';
  }

  /** 丢掉上一次流式登记的条目（换歌或退回整段物化时）。 */
  private discardStreaming(): void {
    const entry = this.streamingEntry;
    if (entry === null) return;
    this.streamingEntry = null;
    if (this.currentMediaId === entry.id) this.currentMediaId = null;
    if (!entry.growing.isComplete) entry.growing.finish();
    this.options.store.delete(entry.id);
  }

  /**
   * 流式播完后把结果写进磁盘缓存。
   *
   * 刻意不 await：写 30–40MB 不该挡着播放。缓冲是提前分配好的，这里只取前
   * `availableBytes` 那一截，不复制。
   */
  private persistStreamingResult(track: TrackSummary, cid: number, quality: number): void {
    const entry = this.streamingEntry;
    if (entry === null || !entry.growing.isComplete) return;
    const wav = entry.growing.buffer.subarray(0, entry.growing.availableBytes);
    void this.options.pipeline
      .writeCachedAudio({ bvid: track.bvid, cid, quality }, wav)
      .catch((error: unknown) => this.logger.warn('写缓存失败', error));
  }

  /** 出错时把消息变成用户能看懂的一句中文。 */
  static describeError(error: unknown): string {
    return error instanceof BilibiliError ? error.userMessage : toBilibiliError(error).userMessage;
  }
}
