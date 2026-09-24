import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MediaStore } from '../media/mediaStore';
import { PlayerService } from '../player/playerService';
import type { AudioPipeline, MaterializedAudio } from '../audio/pipeline';
import type { BilibiliApi } from '../bilibili/api';
import type { TrackSummary } from '../protocol';

function materialized(durationSeconds = 10): MaterializedAudio {
  return {
    wav: Buffer.alloc(44 + 176400),
    sampleRate: 44100,
    channels: 2,
    durationSeconds,
    sourceBytes: 1000,
    sourceContainer: 'dash',
    sourceCodecs: 'mp4a.40.2',
    demuxMs: 1,
    decodeMs: 1,
    fromCache: false,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function track(cid: number, title: string): TrackSummary {
  return {
    bvid: 'BV17x411w7KC',
    cid,
    title,
    author: 'UP',
    cover: '',
    durationSeconds: 10,
    pageCount: 1,
  };
}

function pageList(): Array<{ cid: number; page: number; part: string; duration: number }> {
  return [{ cid: 1, page: 1, part: 'P1', duration: 10 }];
}

interface Harness {
  service: PlayerService;
  store: MediaStore;
  /** 每次物化收到的 AbortSignal。 */
  signals: Array<AbortSignal | undefined>;
  calls: { count: number };
}

/**
 * 假流水线。
 *
 * `readCachedAudio` / `writeCachedAudio` 现在也是 `play()` 的必经调用（先查缓存、
 * 流式播完再落盘），所以每个用例都得把它们补上；这里统一给默认实现。
 */
function asPipeline(partial: Record<string, unknown>): AudioPipeline {
  return {
    readCachedAudio: async () => null,
    writeCachedAudio: async () => undefined,
    cacheStats: async () => ({ files: 0, bytes: 0 }),
    clearCache: async () => undefined,
    enforceCacheLimit: async () => 0,
    ...partial,
  } as unknown as AudioPipeline;
}

/** 组装一个只有必要依赖的 PlayerService。 */
function harness(options: { firstIsSlow?: boolean } = {}): Harness {
  const signals: Array<AbortSignal | undefined> = [];
  const calls = { count: 0 };
  const store = new MediaStore();
  const slow = deferred<MaterializedAudio>();

  const pipeline = asPipeline({
    materialize: async (materializeOptions: { signal?: AbortSignal }) => {
      signals.push(materializeOptions.signal);
      calls.count++;
      if (options.firstIsSlow === true && calls.count === 1) return slow.promise;
      return materialized();
    },
  });

  const api = { getPageList: async () => pageList() } as unknown as BilibiliApi;

  const service = new PlayerService({
    api,
    pipeline,
    store,
    proxyUrl: (path) => `http://127.0.0.1:1${path}`,
    getQuality: () => 30280,
  });

  return { service, store, signals, calls };
}

test('点新歌会中止上一首仍在进行的物化（省带宽、更快出声）', async () => {
  const h = harness({ firstIsSlow: true });

  const first = h.service.play(track(1, '第一首'));
  // 让第一次请求真正进入 materialize
  await new Promise((resolve) => setTimeout(resolve, 0));
  const secondUrl = await h.service.play(track(2, '第二首'));

  assert.match(secondUrl, /^http:\/\/127\.0\.0\.1:1\/audio\//);
  assert.equal(h.signals.length, 2);
  assert.equal(h.signals[0]?.aborted, true, '第一次的信号应当被中止');
  assert.equal(h.signals[1]?.aborted, false, '第二次的信号不该被中止');
  assert.equal(h.calls.count, 2);

  // 假 pipeline 不响应 abort，所以第一次会一直挂着——这正说明它已被放弃。
  const settled = await Promise.race([first, Promise.resolve('pending')]);
  assert.equal(settled, 'pending');
});

test('被取代的请求即使完成，也不会覆盖当前播放状态', async () => {
  const slow = deferred<MaterializedAudio>();
  const signals: Array<AbortSignal | undefined> = [];
  const calls = { count: 0 };
  const pipeline = asPipeline({
    materialize: async (options: { signal?: AbortSignal }) => {
      signals.push(options.signal);
      calls.count++;
      return calls.count === 1 ? slow.promise : materialized();
    },
  });
  const api = { getPageList: async () => pageList() } as unknown as BilibiliApi;
  const service = new PlayerService({
    api,
    pipeline,
    store: new MediaStore(),
    proxyUrl: (path) => `http://127.0.0.1:1${path}`,
    getQuality: () => 30280,
  });

  const first = service.play(track(1, '第一首'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await service.play(track(2, '第二首'));

  slow.resolve(materialized());
  const firstResult = await first;

  assert.equal(firstResult, '', '被取代的请求返回空串');
  assert.equal(service.current.track?.title, '第二首', '状态必须还是第二首');
});

test('预取结果会被播放复用（不再物化第二次）', async () => {
  const h = harness();
  await h.service.prepare(track(1, '预取目标'));
  const callsAfterPrepare = h.calls.count;
  assert.equal(callsAfterPrepare, 1);

  const url = await h.service.play(track(1, '预取目标'));
  assert.match(url, /\/audio\//);
  assert.equal(h.calls.count, callsAfterPrepare, '命中预取缓存不该再物化');
  assert.equal(h.store.size, 1, '音频已登记到媒体表，可被回环代理提供');
});

test('预取失败不影响后续播放（只是白跑一次）', async () => {
  const pipeline = asPipeline({
    materialize: async () => {
      throw new Error('网络炸了');
    },
  });
  const api = { getPageList: async () => pageList() } as unknown as BilibiliApi;
  const service = new PlayerService({
    api,
    pipeline,
    store: new MediaStore(),
    proxyUrl: (path) => `http://127.0.0.1:1${path}`,
    getQuality: () => 30280,
  });

  await service.prepare(track(1, '炸'));
  await assert.rejects(() => service.play(track(1, '炸')), /网络炸了/);
});

test('report 带上静音与音量，stop 释放媒体登记', async () => {
  const h = harness();
  const url = await h.service.play(track(1, '一首'));
  assert.equal(h.store.size, 1);
  assert.match(url, /\/audio\//);

  h.service.report({ playing: true, position: 3, duration: 10, muted: true, volume: 0.5 });
  assert.equal(h.service.current.muted, true);
  assert.equal(h.service.current.volume, 0.5);
  assert.equal(h.service.current.position, 3);

  h.service.stop();
  assert.equal(h.store.size, 0, '停止后应释放登记，别把几十 MB 挂在内存里');
  assert.equal(h.service.current.track, null);
});

test('缺少 cid 时会先问 pagelist 再物化', async () => {
  const signals: Array<AbortSignal | undefined> = [];
  const asked: string[] = [];
  const pipeline = asPipeline({
    materialize: async (options: { signal?: AbortSignal }) => {
      signals.push(options.signal);
      return materialized();
    },
  });
  const api = {
    getPageList: async (bvid: string) => {
      asked.push(bvid);
      return pageList();
    },
  } as unknown as BilibiliApi;
  const service = new PlayerService({
    api,
    pipeline,
    store: new MediaStore(),
    proxyUrl: (path) => `http://127.0.0.1:1${path}`,
    getQuality: () => 30280,
  });

  await service.play({
    bvid: 'BV17x411w7KC',
    title: '无 cid',
    author: '',
    cover: '',
    durationSeconds: 0,
    pageCount: 0,
  });
  assert.deepEqual(asked, ['BV17x411w7KC']);
  assert.equal(service.current.track?.cid, 1, '解析出来的 cid 要写回状态');
});

/* -------------------------------------------------------- 队列与播放模式 */

function list(...titles: string[]): TrackSummary[] {
  return titles.map((title, index) => ({
    bvid: `BV${title}`,
    cid: index + 1,
    title,
    author: 'UP',
    cover: '',
    durationSeconds: 10,
    pageCount: 1,
  }));
}

function queueService(): { service: PlayerService; queueEvents: Array<{ index: number; mode: string; size: number }> } {
  const queueEvents: Array<{ index: number; mode: string; size: number }> = [];
  const pipeline = asPipeline({
    materialize: async () => materialized(),
  });
  const api = { getPageList: async () => pageList() } as unknown as BilibiliApi;
  const service = new PlayerService({
    api,
    pipeline,
    store: new MediaStore(),
    proxyUrl: (path) => `http://127.0.0.1:1${path}`,
    getQuality: () => 30280,
    onQueue: (state, index) => queueEvents.push({ index, mode: state.mode, size: state.items.length }),
  });
  return { service, queueEvents };
}

test('列表点歌会接管队列，自动播完按顺序往下走', async () => {
  const { service } = queueService();
  const items = list('A', 'B', 'C');
  service.adoptQueue(items, 0);
  await service.play(items[0] as TrackSummary);

  const second = service.step(1, { auto: true });
  assert.equal(second.kind, 'play');
  assert.equal(second.kind === 'play' ? second.track.title : '', 'B');

  await service.play(items[1] as TrackSummary);
  assert.equal(service.step(1, { auto: true }).kind, 'play');
  await service.play(items[2] as TrackSummary);

  assert.equal(service.step(1, { auto: true }).kind, 'stop', '顺序播放到底应停下');
});

test('单曲循环：自动播完原地重播，用户点下一首仍然换歌', async () => {
  const { service } = queueService();
  const items = list('A', 'B');
  service.adoptQueue(items, 0);
  service.setPlayMode('repeat-one');
  await service.play(items[0] as TrackSummary);

  assert.equal(service.step(1, { auto: true }).kind, 'replay');
  const manual = service.step(1, { auto: false });
  assert.equal(manual.kind, 'play');
  assert.equal(manual.kind === 'play' ? manual.track.title : '', 'B');
});

test('列表循环：末尾回到开头', async () => {
  const { service } = queueService();
  const items = list('A', 'B');
  service.adoptQueue(items, 1);
  service.setPlayMode('repeat-all');
  await service.play(items[1] as TrackSummary);

  const wrapped = service.step(1, { auto: true });
  assert.equal(wrapped.kind === 'play' ? wrapped.track.title : '', 'A');
  assert.equal(service.queueState.mode, 'repeat-all');
});

test('缓存命中时直接起播：既不物化也不流式', async () => {
  let materializeCalls = 0;
  const pipeline = asPipeline({
    readCachedAudio: async () => materialized(123),
    materialize: async () => {
      materializeCalls++;
      return materialized();
    },
  });
  const api = { getPageList: async () => pageList() } as unknown as BilibiliApi;
  const store = new MediaStore();
  let sourceUrl = '';
  const service = new PlayerService({
    api,
    pipeline,
    store,
    proxyUrl: (path) => `http://127.0.0.1:1${path}`,
    getQuality: () => 30280,
  });

  const url = await service.play(track(1, '已缓存'), (value) => {
    sourceUrl = value;
  });
  assert.match(url, /\/audio\//);
  assert.equal(sourceUrl, url, 'onSource 要按 publish 的结果回调');
  assert.equal(materializeCalls, 0, '命中缓存不该再下载解码');
  assert.equal(service.current.duration, 123);
  assert.equal(store.size, 1);
});

test('加入队列、拖动排序、移除都反映到队列状态与当前曲目', async () => {
  const { service, queueEvents } = queueService();
  const items = list('A', 'B');
  service.adoptQueue(items, 0);
  await service.play(items[0] as TrackSummary);

  service.enqueueTrack({ ...(items[0] as TrackSummary), bvid: 'BVC', title: 'C' });
  assert.deepEqual(
    service.queueState.items.map((item) => item.title),
    ['A', 'B', 'C'],
  );

  service.moveInQueue(2, 1);
  assert.deepEqual(
    service.queueState.items.map((item) => item.title),
    ['A', 'C', 'B'],
  );

  // 删掉排在当前项前面的那条：正在播的还是 A
  service.removeQueueAt(0);
  assert.equal(service.queueState.items.length, 2);
  assert.ok(queueEvents.length >= 4, '每次队列变化都应广播');
});

test('清空队列保留播放模式', () => {
  const { service } = queueService();
  service.adoptQueue(list('A', 'B'), 0);
  service.setPlayMode('shuffle');
  service.clearQueue();
  assert.deepEqual(service.queueState.items, []);
  assert.equal(service.queueState.mode, 'shuffle');
});

test('空队列按下一首不会崩，也不会假装有歌', () => {
  const { service } = queueService();
  assert.equal(service.step(1, { auto: true }).kind, 'stop');
  assert.equal(service.trackAt(3), null);
  service.focusQueueIndex(2);
  assert.equal(service.queueState.position, -1);
});
