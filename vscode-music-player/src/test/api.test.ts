import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BilibiliApi, looksSoftBlocked, pickAudioStream } from '../bilibili/api';
import { BilibiliError } from '../bilibili/errors';
import type { BilibiliClient } from '../bilibili/client';
import type { WbiKeyStore } from '../bilibili/wbi';
import type { SearchResultData } from '../bilibili/types';

/** 只实现 `get` 的假客户端；`state.calls` 记录调用次数。 */
function fakeClient(responses: unknown[]): { client: BilibiliClient; state: { calls: number } } {
  const state = { calls: 0 };
  const client = {
    get: async () => {
      const response = responses[Math.min(state.calls, responses.length - 1)];
      state.calls++;
      return response;
    },
  } as unknown as BilibiliClient;
  return { client, state };
}

function fakeWbi(): WbiKeyStore {
  return { signQuery: async () => 'wts=1&w_rid=fake' } as unknown as WbiKeyStore;
}

const SOFT_BLOCKED: SearchResultData = { result: [], numResults: undefined, numPages: undefined };
const LEGIT_EMPTY: SearchResultData = { result: [], numResults: 0, numPages: 0 };
const ONE_ITEM: SearchResultData = {
  numPages: 50,
  numResults: 1,
  result: [{ bvid: 'BV17x411w7KC', title: 't', author: 'a', duration: '3:00' }],
};

test('looksSoftBlocked 区分软风控与真的没结果', () => {
  assert.equal(looksSoftBlocked(SOFT_BLOCKED), true);
  assert.equal(looksSoftBlocked(LEGIT_EMPTY), false, '带 numPages:0 的是正常空结果');
  assert.equal(looksSoftBlocked(ONE_ITEM), false);
  assert.equal(looksSoftBlocked({ result: null }), true);
});

test('搜索：软风控后重试一次并成功', async () => {
  const tracker = fakeClient([SOFT_BLOCKED, ONE_ITEM]);
  const sleeps: number[] = [];
  const api = new BilibiliApi(tracker.client, fakeWbi(), undefined, {
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    softBlockRetryDelayMs: 1234,
  });

  const result = await api.searchVideos({ keyword: 'x' });
  assert.equal(result.items.length, 1);
  assert.equal(result.numPages, 50);
  assert.equal(tracker.state.calls, 2, '应当重试一次');
  assert.deepEqual(sleeps, [1234]);
});

test('搜索：连续两次软风控时抛出风控错误而不是「没搜到」', async () => {
  const tracker = fakeClient([SOFT_BLOCKED, SOFT_BLOCKED]);
  const api = new BilibiliApi(tracker.client, fakeWbi(), undefined, {
    sleep: async () => undefined,
  });

  await assert.rejects(
    () => api.searchVideos({ keyword: 'x' }),
    (error: unknown) => {
      assert.equal(error instanceof BilibiliError, true);
      assert.equal((error as BilibiliError).kind, 'risk');
      assert.match((error as BilibiliError).userMessage, /风控/);
      return true;
    },
  );
  assert.equal(tracker.state.calls, 2);
});

test('搜索：正常空结果不重试，直接返回空列表', async () => {
  const tracker = fakeClient([LEGIT_EMPTY]);
  const api = new BilibiliApi(tracker.client, fakeWbi(), undefined, {
    sleep: async () => undefined,
  });
  const result = await api.searchVideos({ keyword: 'x' });
  assert.deepEqual(result.items, []);
  assert.equal(result.numPages, 0, '正常空结果的 numPages 是 0，不该被兜底成 1');
  assert.equal(tracker.state.calls, 1, '不该重试');
});

test('搜索：过滤掉没有 bvid 的条目（合集/广告位）', async () => {
  const tracker = fakeClient([
    {
      numPages: 1,
      numResults: 2,
      result: [{ title: '合集', type: 'video_series' }, { bvid: 'BV17x411w7KC', title: 'ok' }],
    },
  ]);
  const api = new BilibiliApi(tracker.client, fakeWbi());
  const result = await api.searchVideos({ keyword: 'x' });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.bvid, 'BV17x411w7KC');
});

test('pickAudioStream：优先所需音质，其次最高音质，最后回退 durl', () => {
  const stream = pickAudioStream(
    {
      dash: {
        duration: 100,
        audio: [
          { id: 30216, baseUrl: 'https://cdn/low.m4s', codecs: 'mp4a.40.2' },
          { id: 30280, baseUrl: 'https://cdn/high.m4s', codecs: 'mp4a.40.2', backupUrl: ['https://b/high.m4s'] },
        ],
      },
    },
    30280,
  );
  assert.equal(stream.quality, 30280);
  assert.equal(stream.url, 'https://cdn/high.m4s');
  assert.deepEqual(stream.backupUrls, ['https://b/high.m4s']);
  assert.equal(stream.container, 'dash');

  const fallback = pickAudioStream(
    {
      dash: {
        audio: [
          { id: 30216, baseUrl: 'https://cdn/low.m4s' },
          { id: 30232, baseUrl: 'https://cdn/mid.m4s' },
        ],
      },
    },
    30280,
  );
  assert.equal(fallback.quality, 30232, '要不到就取可用的最高音质');

  const legacy = pickAudioStream({ durl: [{ order: 1, url: 'https://cdn/old.mp4' }], timelength: 125_000 }, 30280);
  assert.equal(legacy.container, 'durl');
  assert.equal(legacy.durationSeconds, 125);

  assert.throws(() => pickAudioStream({ dash: { audio: [] } }, 30280), /没有返回可用的音频流/);
});
