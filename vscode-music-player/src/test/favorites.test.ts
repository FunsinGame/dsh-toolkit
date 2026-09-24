import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BilibiliApi } from '../bilibili/api';
import {
  collectRemainingPages,
  describeInvalidAttr,
  toFavoriteContentsView,
  toFavoriteEntry,
  type FavoriteContentsView,
  type FavoriteEntry,
} from '../bilibili/favorites';
import type { BilibiliClient } from '../bilibili/client';
import type { WbiKeyStore } from '../bilibili/wbi';
import type { FavoriteContentItem } from '../bilibili/types';

/* --------------------------------------------------------------- 归一化逻辑 */

function item(overrides: Partial<FavoriteContentItem> = {}): FavoriteContentItem {
  return {
    id: 170001,
    bvid: 'BV17x411w7KC',
    title: '标题',
    cover: 'https://i0.hdslb.com/a.jpg',
    duration: 213,
    pubdate: 1_700_000_000,
    page: 1,
    type: 2,
    attr: 0,
    upper: { mid: 1, name: 'UP', face: '' },
    ...overrides,
  } as FavoriteContentItem;
}

test('describeInvalidAttr 把失效原因说成人话', () => {
  assert.equal(describeInvalidAttr(0), null);
  assert.equal(describeInvalidAttr(9), 'up 主已删除');
  assert.equal(describeInvalidAttr(1), '已被删除或设为私密');
  assert.equal(describeInvalidAttr(7), '已失效');
});

test('toFavoriteEntry：只接受视频稿件，并标注失效项', () => {
  const ok = toFavoriteEntry(item());
  assert.equal(ok?.bvid, 'BV17x411w7KC');
  assert.equal(ok?.avid, 170001);
  assert.equal(ok?.durationSeconds, 213, '收藏夹接口给的是数字秒');
  assert.equal(ok?.pageCount, 1);
  assert.equal(ok?.invalid, false);
  assert.equal(ok?.invalidReason, null);

  const gone = toFavoriteEntry(item({ attr: 9 }));
  assert.equal(gone?.invalid, true);
  assert.equal(gone?.invalidReason, 'up 主已删除');

  assert.equal(toFavoriteEntry(item({ type: 12 })), null, '音频稿件不能播，直接过滤');
  assert.equal(toFavoriteEntry(item({ type: 21 })), null, '视频合集不能播，直接过滤');
  assert.equal(toFavoriteEntry(item({ bvid: '' })), null, '缺 bvid 的条目丢掉');
});

test('toFavoriteEntry：字段缺失/异常时不产生 NaN', () => {
  const weird = toFavoriteEntry(
    item({ duration: Number.NaN, page: 0 } as Partial<FavoriteContentItem>),
  );
  assert.equal(weird?.durationSeconds, 0);
  assert.equal(weird?.pageCount, 1);
});

test('toFavoriteContentsView：标题、总数、hasMore、过滤', () => {
  const view = toFavoriteContentsView({
    info: {
      id: 1,
      title: '我的音乐',
      cover: '',
      media_count: 42,
      intro: '',
      upper: { mid: 7, name: '我', face: '' },
    },
    medias: [item(), item({ type: 12 }), item({ attr: 1 })],
    has_more: true,
  });
  assert.equal(view.title, '我的音乐');
  assert.equal(view.total, 42);
  assert.equal(view.entries.length, 2, '音频项被过滤');
  assert.equal(view.hasMore, true);
  assert.equal(view.entries[1]?.invalidReason, '已被删除或设为私密');
});

test('toFavoriteContentsView：medias 为 null / info 缺失时不崩', () => {
  const view = toFavoriteContentsView({ info: null, medias: null, has_more: false });
  assert.deepEqual(view.entries, []);
  assert.equal(view.title, '');
  assert.equal(view.total, 0);
  assert.equal(view.hasMore, false);
});

/* ----------------------------------------------------------- 请求参数装配 */

interface Call {
  kind: 'get' | 'post';
  endpoint: string;
  params?: unknown;
  payload?: unknown;
}

function fakeClient(responses: Record<string, unknown>): { client: BilibiliClient; calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    get: async (options: { endpoint: string; params?: unknown }) => {
      calls.push({ kind: 'get', endpoint: options.endpoint, params: options.params });
      return responses[options.endpoint] ?? {};
    },
    postWithCsrf: async (options: { endpoint: string; payload?: unknown }) => {
      calls.push({ kind: 'post', endpoint: options.endpoint, payload: options.payload });
      return responses[options.endpoint] ?? {};
    },
  } as unknown as BilibiliClient;
  return { client, calls };
}

function apiWith(responses: Record<string, unknown>): { api: BilibiliApi; calls: Call[] } {
  const fake = fakeClient(responses);
  const wbi = { signQuery: async () => 'wts=1&w_rid=x' } as unknown as WbiKeyStore;
  return { api: new BilibiliApi(fake.client, wbi), calls: fake.calls };
}

test('getFavoriteFolders：不带 bvid 时只传 up_mid', async () => {
  const { api, calls } = apiWith({
    '/x/v3/fav/folder/created/list-all': { count: 2, list: [{ id: 1, title: 'A', media_count: 3 }] },
  });
  const folders = await api.getFavoriteFolders({ mid: 42 });
  assert.equal(folders.length, 1);
  assert.deepEqual(calls[0]?.params, { up_mid: 42 });
});

test('getFavoriteFolders：带 bvid 时补上 rid 与 type=2（用于勾选状态）', async () => {
  const { api, calls } = apiWith({ '/x/v3/fav/folder/created/list-all': { list: null } });
  const folders = await api.getFavoriteFolders({ mid: 42, bvid: 'BV17x411w7KC' });
  assert.deepEqual(folders, [], 'list 为 null 时返回空数组');
  assert.deepEqual(calls[0]?.params, { up_mid: 42, rid: 170001, type: '2' });
});

test('getFavoriteContents：分页参数与空 medias 兜底', async () => {
  const { api, calls } = apiWith({
    '/x/v3/fav/resource/list': { info: null, medias: null, has_more: false },
  });
  const page = await api.getFavoriteContents({ mediaId: 7, page: 3 });
  assert.deepEqual(page.medias, []);
  assert.deepEqual(calls[0]?.params, { media_id: '7', pn: '3', ps: '40' });
});

test('getFavoriteContents：关键词搜索时带上 keyword 与 type', async () => {
  const { api, calls } = apiWith({
    '/x/v3/fav/resource/list': { info: null, medias: [], has_more: false },
  });
  await api.getFavoriteContents({ mediaId: 7, keyword: '钢琴', scope: 'this' });
  assert.equal((calls[0]?.params as Record<string, string>)['keyword'], '钢琴');
  assert.equal((calls[0]?.params as Record<string, string>)['type'], '0');

  await api.getFavoriteContents({ mediaId: 7, keyword: '钢琴', scope: 'all' });
  assert.equal((calls[1]?.params as Record<string, string>)['type'], '1');
});

test('createFavoriteFolder：payload 字段与字符串化', async () => {
  const { api, calls } = apiWith({ '/x/v3/fav/folder/add': { id: 9, fid: 9, mid: 42, title: '新夹' } });
  const created = await api.createFavoriteFolder({ title: '新夹', intro: '说明', privacy: 1 });
  assert.equal(created.id, 9);
  assert.deepEqual(calls[0]?.payload, { title: '新夹', intro: '说明', privacy: '1' });
});

test('deleteFavoriteFolders：media_ids 用逗号连接，空数组不发请求', async () => {
  const { api, calls } = apiWith({ '/x/v3/fav/folder/del': {} });
  await api.deleteFavoriteFolders([3, 5]);
  assert.deepEqual(calls[0]?.payload, { media_ids: '3,5' });

  await api.deleteFavoriteFolders([]);
  assert.equal(calls.length, 1, '空数组不该发请求');
});

test('dealFavoriteForOneVideo：rid 用 avid，加/减各一组 id', async () => {
  const { api, calls } = apiWith({ '/x/v3/fav/resource/deal': { success_num: 1 } });
  const result = await api.dealFavoriteForOneVideo({
    bvid: 'BV17x411w7KC',
    addToFavoriteIds: ['3'],
    delInFavoriteIds: ['5', '6'],
  });
  assert.equal(result.success_num, 1);
  assert.deepEqual(calls[0]?.payload, {
    rid: '170001',
    type: '2',
    add_media_ids: '3',
    del_media_ids: '5,6',
  });
});

test('removeFavoriteResources：resources 用 `avid:2` 且带 platform', async () => {
  const { api, calls } = apiWith({ '/x/v3/fav/resource/batch-del': {} });
  await api.removeFavoriteResources({ mediaId: 7, bvids: ['BV17x411w7KC', 'BV17x411w7KC'] });
  assert.deepEqual(calls[0]?.payload, {
    resources: '170001:2,170001:2',
    media_id: '7',
    platform: 'web',
  });

  await api.removeFavoriteResources({ mediaId: 7, bvids: [] });
  assert.equal(calls.length, 1, '空列表不发请求');
});

test('getFavoriteResourceIds：返回空数组而不是 null/对象', async () => {
  const nullCase = apiWith({ '/x/v3/fav/resource/ids': null });
  assert.deepEqual(await nullCase.api.getFavoriteResourceIds(7), []);
  // 空收藏夹时接口真的会回 `{}` 而不是数组。
  const objectCase = apiWith({ '/x/v3/fav/resource/ids': {} });
  assert.deepEqual(await objectCase.api.getFavoriteResourceIds(7), []);
});

/* -------------------------------------------------- 「播放歌单」的翻页收集 */

function view(entries: FavoriteEntry[], hasMore: boolean): FavoriteContentsView {
  return { title: '夹子', total: entries.length, entries, hasMore };
}

function entry(name: string): FavoriteEntry {
  return {
    avid: 1,
    bvid: `BV${name}`,
    title: name,
    cover: '',
    upperName: 'UP',
    durationSeconds: 10,
    pageCount: 1,
    invalid: false,
    invalidReason: null,
  };
}

test('collectRemainingPages：逐页取完并把每页交给回调', async () => {
  const requested: number[] = [];
  const batches: string[][] = [];
  const result = await collectRemainingPages({
    startPage: 1,
    hasMore: true,
    fetchPage: async (page) => {
      requested.push(page);
      if (page === 2) return view([entry('B'), entry('C')], true);
      if (page === 3) return view([entry('D')], false);
      return view([entry('X')], false);
    },
    onBatch: (entries, page) => {
      batches.push([`p${page}`, ...entries.map((item) => item.title)]);
    },
  });

  assert.deepEqual(requested, [2, 3], '从 startPage+1 开始，遇到 has_more=false 停止');
  assert.deepEqual(batches, [
    ['p2', 'B', 'C'],
    ['p3', 'D'],
  ]);
  assert.deepEqual(result, { pages: 2, items: 3, truncated: false });
});

test('collectRemainingPages：已无更多时一个请求都不发', async () => {
  let calls = 0;
  const result = await collectRemainingPages({
    startPage: 3,
    hasMore: false,
    fetchPage: async () => {
      calls++;
      return view([], false);
    },
    onBatch: () => undefined,
  });
  assert.equal(calls, 0);
  assert.deepEqual(result, { pages: 0, items: 0, truncated: false });
});

test('collectRemainingPages：单页失败就停下并回报，不抛给调用方', async () => {
  const reported: number[] = [];
  const result = await collectRemainingPages({
    startPage: 1,
    hasMore: true,
    fetchPage: async (page) => {
      if (page === 3) throw new Error('网络炸了');
      return view([entry('A')], true);
    },
    onBatch: () => undefined,
    onError: (_error, page) => reported.push(page),
  });
  assert.deepEqual(reported, [3]);
  assert.equal(result.pages, 1, '只成功取到第 2 页');
});

test('collectRemainingPages：达到安全上限时标记 truncated（防止接口异常导致无限翻页）', async () => {
  const result = await collectRemainingPages({
    startPage: 0,
    hasMore: true,
    maxPages: 3,
    fetchPage: async () => view([entry('A')], true),
    onBatch: () => undefined,
  });
  assert.deepEqual(result, { pages: 3, items: 3, truncated: true });
});

test('collectRemainingPages：空页也计入页数并继续（until has_more 变假）', async () => {
  const pages: number[] = [];
  const result = await collectRemainingPages({
    startPage: 4,
    hasMore: true,
    fetchPage: async (page) => {
      pages.push(page);
      return view([], page < 6);
    },
    onBatch: () => {
      throw new Error('空页不该触发回调');
    },
  });
  assert.deepEqual(pages, [5, 6]);
  assert.deepEqual(result, { pages: 2, items: 0, truncated: false });
});
