/**
 * fMP4 / 渐进式 MP4 → 裸 AAC 帧 + AudioSpecificConfig。
 *
 * B 站 dash 音频的 `.m4s` 是 fragmented MP4，`durl` 回退则是带视频轨的渐进式
 * MP4。两者都由 mp4box 解封装：我们只取音轨，按 sample 切开，连同 `esds` 里的
 * AudioSpecificConfig 一起交给 wasm 解码器。
 *
 * 之所以不自己写 ISOBMFF 解析：`trun`/`sidx`/`tfhd` 的组合与 default 值语义
 * 很容易出错，而 mp4box 是久经考验的 BSD-3 实现。
 */

import { createFile, type ISOFile, type MP4BoxBuffer, type Sample, type Track } from 'mp4box';

export interface AudioTrackInfo {
  trackId: number;
  /** 形如 `mp4a.40.2`。 */
  codec: string;
  sampleRate: number;
  channelCount: number;
  timescale: number;
  /** 文件自报时长（秒）。优先用 `samples_duration`（分片文件里它是准的）。 */
  durationSeconds: number | null;
  /** 采样帧总数（mp4box 从分片表累加得到），用于精确预测 WAV 长度。 */
  samplesDuration: number | null;
  audioSpecificConfig: Uint8Array | null;
  /** mp4box 认为的采样帧总数（分片文件可能不准）。 */
  declaredSampleCount: number | null;
}

export interface DemuxedAudio {
  info: AudioTrackInfo;
  frames: Uint8Array[];
  totalBytes: number;
}

export interface DemuxOptions {
  /** 最多取多少个 sample（防御性上限）。 */
  maxFrames?: number;
  onWarn?: (message: string) => void;
}

/* ---------------------------------------------------------------- 内部类型 */

interface DescriptorLike {
  tag?: number;
  data?: Uint8Array;
  descs?: DescriptorLike[];
}

interface SampleEntryLike {
  esds?: { esd?: DescriptorLike };
  /** 部分封装会把 esds 藏在 `wave` 盒子里。 */
  wave?: { esds?: { esd?: DescriptorLike } };
}

/**
 * `getTrackById()` 返回的原始盒子树。
 *
 * 注意：mp4box 公开的 `Track` 对象（`onReady` 给的 `movie.tracks[]`）**不含**
 * `mdia`/`minf`/`stbl`/`stsd`，只有 `getTrackById()` 返回的 `trakBox` 才有——
 * 拿 AudioSpecificConfig 必须走这条路。
 */
interface TrakBoxLike {
  mdia?: { minf?: { stbl?: { stsd?: { entries?: SampleEntryLike[] } } } };
}

interface TrackInternals {
  id: number;
  codec?: string;
  timescale?: number;
  duration?: number;
  samples_duration?: number;
  nb_samples?: number;
  samples?: Sample[];
  audio?: { sample_rate?: number; channel_count?: number; sample_size?: number };
}

/* ------------------------------------------------------------ AudioSpecificConfig */

function searchDescriptors(descs: DescriptorLike[] | undefined, wantTag: number): Uint8Array | null {
  if (!descs) return null;
  for (const desc of descs) {
    if (desc.tag === wantTag && desc.data instanceof Uint8Array && desc.data.byteLength > 0) {
      return desc.data;
    }
    const nested = searchDescriptors(desc.descs, wantTag);
    if (nested) return nested;
  }
  return null;
}

/** 从 stsd 条目里挖出 AudioSpecificConfig（tag 5 = DecoderSpecificInfo）。 */
export function extractAudioSpecificConfig(entry: SampleEntryLike | undefined): Uint8Array | null {
  const descs = (entry?.esds ?? entry?.wave?.esds)?.esd?.descs;
  // tag 5 是标准位置；个别封装会把它放在别处，故再退一步找任何带 data 的描述符。
  return searchDescriptors(descs, 5) ?? searchDescriptorsAnyData(descs);
}

function searchDescriptorsAnyData(descs: DescriptorLike[] | undefined): Uint8Array | null {
  if (!descs) return null;
  for (const desc of descs) {
    if (desc.data instanceof Uint8Array && desc.data.byteLength > 0) return desc.data;
    const nested = searchDescriptorsAnyData(desc.descs);
    if (nested) return nested;
  }
  return null;
}

/* ------------------------------------------------------------------ 轨道选择 */

function trackInternals(track: unknown): TrackInternals {
  return track as unknown as TrackInternals;
}

/** 挑音轨：优先 codec 以 `mp4a` 开头的，其次第一个带 `audio` 信息的轨道。 */
export function pickAudioTrack(tracks: Track[]): Track | null {
  const withAudio = tracks.filter((track) => trackInternals(track).audio !== undefined);
  const candidates = withAudio.length > 0 ? withAudio : tracks;
  const mp4a = candidates.find((track) => (trackInternals(track).codec ?? '').startsWith('mp4a'));
  return mp4a ?? candidates[0] ?? null;
}

function toTrackInfo(track: Track, trak: TrakBoxLike | null): AudioTrackInfo {
  const internals = trackInternals(track);
  const entry = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0];
  const timescale = internals.timescale ?? 0;
  const duration = internals.duration ?? 0;
  const samplesDuration = internals.samples_duration ?? 0;
  // dash 分片的 `duration`（mvhd/tkhd）经常是 0，而 `samples_duration` 是从
  // 分片表累加出来的真实长度——预测 WAV 长度要用后者。
  const effectiveDuration = samplesDuration > 0 ? samplesDuration : duration;
  return {
    trackId: internals.id,
    codec: internals.codec ?? 'unknown',
    sampleRate: internals.audio?.sample_rate ?? 0,
    channelCount: internals.audio?.channel_count ?? 0,
    timescale,
    durationSeconds: timescale > 0 && effectiveDuration > 0 ? effectiveDuration / timescale : null,
    samplesDuration: samplesDuration > 0 ? samplesDuration : null,
    audioSpecificConfig: extractAudioSpecificConfig(entry),
    declaredSampleCount: typeof internals.nb_samples === 'number' ? internals.nb_samples : null,
  };
}

/* ---------------------------------------------------------------------- 主流程 */

function toMp4Buffer(bytes: Uint8Array): MP4BoxBuffer {
  // mp4box 用 `fileStart` 定位数据在文件中的绝对偏移，因此必须给它一段从 0 开始
  // 的连续缓冲；Node 的 Buffer 常常是共享 ArrayBuffer 的视图，需要复制一次。
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return Object.assign(copy, { fileStart: 0 }) as unknown as MP4BoxBuffer;
}

/**
 * 解封装整个文件里的音轨。
 *
 * 分片文件（dash）走 `setExtractionOptions` + `onSamples`；如果该路径没有拿到
 * 任何 sample（不同 mp4box 行为差异 / 启动时机），退回读取轨道自带的 sample 表。
 */
export function demuxAudioTrack(bytes: Uint8Array, options: DemuxOptions = {}): DemuxedAudio {
  const maxFrames = options.maxFrames ?? Number.MAX_SAFE_INTEGER;
  const warn = options.onWarn ?? (() => undefined);

  const file: ISOFile = createFile();
  const frames: Uint8Array[] = [];
  // 用可变对象承载回调结果：赋值发生在 mp4box 的回调里，闭包外的局部变量会被
  // TS 的控制流分析误判（读成 null / never）。
  const state: { info: AudioTrackInfo | null; failure: Error | null; started: boolean } = {
    info: null,
    failure: null,
    started: false,
  };

  const push = (data: Uint8Array | undefined): void => {
    if (!(data instanceof Uint8Array) || data.byteLength === 0) return;
    if (frames.length >= maxFrames) return;
    frames.push(data);
  };

  file.onError = (module: string, message: string) => {
    state.failure ??= new Error(`mp4box 解析失败（${module}）：${message}`);
  };

  file.onReady = (movie) => {
    const tracks = ((movie as unknown as { tracks?: unknown[] }).tracks ?? []) as Track[];
    const track = pickAudioTrack(tracks);
    if (!track) {
      state.failure ??= new Error('这个文件里没有找到音轨');
      return;
    }
    state.info = toTrackInfo(track, file.getTrackById(trackInternals(track).id) as unknown as TrakBoxLike);
    // mp4box 2.x 的运行时返回 Promise，但它自带的类型声明写成了 void，
    // 因此用 unknown 接住再判断，避免出现未处理的 rejection。
    const pending: unknown = file.setExtractionOptions(state.info.trackId, null, { nbSamples: 200 });
    if (pending !== undefined && pending !== null && typeof (pending as { then?: unknown }).then === 'function') {
      (pending as Promise<unknown>).then(undefined, (error: unknown) => {
        warn(`setExtractionOptions 失败：${String(error)}`);
      });
    }
    file.start();
    state.started = true;
  };

  file.onSamples = (_trackId: number, _user: unknown, samples: Sample[]) => {
    for (const sample of samples) push(sample.data as Uint8Array | undefined);
  };

  file.appendBuffer(toMp4Buffer(bytes));
  file.flush();

  const info = state.info;
  if (state.failure) throw state.failure;
  if (!info) throw new Error('解封装失败：没有解析出轨道信息');

  // 兜底：直接读 sample 表（适合一次性 append 整个文件的情形）。
  if (frames.length === 0 && state.started) {
    warn('onSamples 没有回调，退回 sample 表读取');
    const track = file.getTrackById(info.trackId);
    const samples = trackInternals(track).samples ?? [];
    for (const sample of samples) push(sample.data as Uint8Array | undefined);
  }

  if (frames.length === 0) throw new Error('解封装失败：没有取到任何音频帧');

  const totalBytes = frames.reduce((sum, frame) => sum + frame.byteLength, 0);
  return { info, frames, totalBytes };
}

/* ------------------------------------------------------------ 增量解封装 */

export interface StreamingDemuxer {
  /** 追加一段数据，返回这一段新解出的音频帧。 */
  append(chunk: Uint8Array): Uint8Array[];
  /** 通知解析器数据已经给完（把最后一片吐出来）。 */
  flush(): Uint8Array[];
  /** 轨道信息（`onReady` 之后才有）。 */
  get info(): AudioTrackInfo | null;
  get appendedBytes(): number;
}

/**
 * 增量解封装器（流式起播用）。
 *
 * 相比「分两次下载、每次整段重新解析」，增量解析的好处是**同一条码流只被解析一次**：
 * 不存在「第二次解析出来的前缀与第一次不一致」这类对齐问题，也不必把已解出的帧丢掉
 * 重来。mp4box 本身就支持按 `fileStart` 追加，这里只是把它包成「喂一段、吐一批帧」。
 */
export function createStreamingDemuxer(options: DemuxOptions = {}): StreamingDemuxer {
  const warn = options.onWarn ?? (() => undefined);
  const file: ISOFile = createFile();
  const state: { info: AudioTrackInfo | null; failure: Error | null } = { info: null, failure: null };
  let offset = 0;
  let pending: Uint8Array[] = [];

  file.onError = (module: string, message: string) => {
    state.failure ??= new Error(`mp4box 解析失败（${module}）：${message}`);
  };

  file.onReady = (movie) => {
    const tracks = ((movie as unknown as { tracks?: unknown[] }).tracks ?? []) as Track[];
    const track = pickAudioTrack(tracks);
    if (!track) {
      state.failure ??= new Error('这个文件里没有找到音轨');
      return;
    }
    state.info = toTrackInfo(
      track,
      file.getTrackById(trackInternals(track).id) as unknown as TrakBoxLike,
    );
    const inFlight: unknown = file.setExtractionOptions(state.info.trackId, null, { nbSamples: 200 });
    if (
      inFlight !== undefined &&
      inFlight !== null &&
      typeof (inFlight as { then?: unknown }).then === 'function'
    ) {
      (inFlight as Promise<unknown>).then(undefined, (error: unknown) => {
        warn(`setExtractionOptions 失败：${String(error)}`);
      });
    }
    file.start();
  };

  file.onSamples = (_trackId: number, _user: unknown, samples: Sample[]) => {
    for (const sample of samples) {
      const data = sample.data as Uint8Array | undefined;
      if (data instanceof Uint8Array && data.byteLength > 0) pending.push(data);
    }
  };

  const drain = (): Uint8Array[] => {
    const out = pending;
    pending = [];
    return out;
  };

  return {
    append(chunk: Uint8Array): Uint8Array[] {
      if (state.failure) throw state.failure;
      const buffer = new ArrayBuffer(chunk.byteLength);
      new Uint8Array(buffer).set(chunk);
      Object.assign(buffer, { fileStart: offset });
      offset += chunk.byteLength;
      file.appendBuffer(buffer as unknown as MP4BoxBuffer);
      const out = drain();
      if (state.failure) throw state.failure;
      return out;
    },
    flush(): Uint8Array[] {
      file.flush();
      return drain();
    },
    get info(): AudioTrackInfo | null {
      return state.info;
    },
    get appendedBytes(): number {
      return offset;
    },
  };
}
