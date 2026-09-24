import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { encWbi, getMixinKey, MIXIN_KEY_ENC_TAB, WbiKeyStore, wbiKeyFromUrl } from '../bilibili/wbi';

/** 线上 nav 接口真实返回的两个 key（也是官方文档里的示例值）。 */
const REAL_IMG_KEY = '7cd084941338484aae1ad9425b84077c';
const REAL_SUB_KEY = '4932caff0ff746eab6f01bf08b70ac45';

test('getMixinKey 按官方重排表取前 32 位', () => {
  // 构造 64 个互不相同的字符，断言结果就是重排表前 32 项的取值顺序。
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const expected = MIXIN_KEY_ENC_TAB.slice(0, 32)
    .map((index) => alphabet[index] ?? '')
    .join('');
  assert.equal(getMixinKey(alphabet), expected);
  assert.equal(getMixinKey(alphabet).length, 32);
  assert.equal(MIXIN_KEY_ENC_TAB.length, 64);
});

test('getMixinKey 对线上真实 key 得到文档中的 mixin key', () => {
  assert.equal(getMixinKey(REAL_IMG_KEY + REAL_SUB_KEY), 'ea1db124af3c7062474693fa704f4ff8');
});

test('wbiKeyFromUrl 兼容有无扩展名', () => {
  assert.equal(wbiKeyFromUrl('https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png'), REAL_IMG_KEY);
  assert.equal(wbiKeyFromUrl('https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45'), REAL_SUB_KEY);
  assert.equal(wbiKeyFromUrl('4932caff0ff746eab6f01bf08b70ac45'), REAL_SUB_KEY);
});

test('encWbi 参数按 key 排序、追加 wts、结尾是 32 位 w_rid', () => {
  const query = encWbi({ keyword: '久石让', page: 1, search_type: 'video' }, REAL_IMG_KEY, REAL_SUB_KEY, 1_700_000_000_000);
  const [head] = query.split('&w_rid=');
  assert.ok(head !== undefined);
  const pairs = (head ?? '').split('&').map((pair) => pair.split('=')[0]);
  assert.deepEqual(pairs, ['keyword', 'page', 'search_type', 'wts'], '必须按 key 升序');
  assert.ok(query.endsWith('&w_rid=') === false);
  const wRid = query.slice(query.lastIndexOf('=') + 1);
  assert.match(wRid, /^[0-9a-f]{32}$/);
  assert.ok(query.includes(`wts=1700000000`), `wts 应为秒：${query}`);
});

test('encWbi 的 w_rid 等于 md5(排序后的查询串 + mixinKey)', () => {
  const params = { bvid: 'BV17x411w7KC', cid: '123', fnval: '4048' };
  const query = encWbi(params, REAL_IMG_KEY, REAL_SUB_KEY, 1_700_000_000_000);
  const unsigned = query.slice(0, query.indexOf('&w_rid='));
  const expected = createHash('md5')
    .update(unsigned + getMixinKey(REAL_IMG_KEY + REAL_SUB_KEY))
    .digest('hex');
  assert.equal(query.split('&w_rid=')[1], expected);
});

test('encWbi 过滤值里的 !\'()* 字符', () => {
  const query = encWbi({ q: "a!'()*b" }, REAL_IMG_KEY, REAL_SUB_KEY, 0);
  assert.ok(query.startsWith('q=ab&'), `应当剔除特殊字符：${query}`);
});

test('encWbi 同一入参同一时间戳结果稳定（不可重编码）', () => {
  const first = encWbi({ keyword: 'a b' }, REAL_IMG_KEY, REAL_SUB_KEY, 1);
  const second = encWbi({ keyword: 'a b' }, REAL_IMG_KEY, REAL_SUB_KEY, 1);
  assert.equal(first, second);
  assert.ok(first.includes('keyword=a%20b'), '空格必须是 %20 而不是 +，否则签名会失效');
});

test('WbiKeyStore 当日缓存、跨日刷新、并发去重', async () => {
  let loads = 0;
  let now = 1_700_000_000_000;
  let persisted: { imgKey: string; subKey: string; fetchedAt: number } | null = null;
  const store = new WbiKeyStore({
    now: () => now,
    read: () => persisted,
    write: (keys) => {
      persisted = keys;
    },
    load: async () => {
      loads++;
      return {
        imgUrl: `https://i0.hdslb.com/bfs/wbi/${REAL_IMG_KEY}.png`,
        subUrl: `https://i0.hdslb.com/bfs/wbi/${REAL_SUB_KEY}.png`,
      };
    },
  });

  // 并发取 keys 只应触发一次加载
  const [first, second] = await Promise.all([store.keys(), store.keys()]);
  assert.equal(loads, 1);
  assert.equal(first.imgKey, REAL_IMG_KEY);
  assert.equal(second.subKey, REAL_SUB_KEY);
  assert.notEqual(persisted, null);

  await store.keys();
  assert.equal(loads, 1, '同一天不应重复加载');

  // 换到第二天：应从 read() 拿到过期缓存并重新加载
  now += 24 * 60 * 60 * 1000;
  await store.keys();
  assert.equal(loads, 2, '跨日应刷新');

  store.invalidate();
  await store.keys();
  assert.equal(loads, 3, 'invalidate 后应强制刷新');
});

test('WbiKeyStore 解析不出 key 时报错', async () => {
  const store = new WbiKeyStore({
    // 以 `/` 结尾的地址取不出文件名，应当明确报错而不是拼出一个空 mixin key。
    load: async () => ({
      imgUrl: 'https://i0.hdslb.com/bfs/wbi/',
      subUrl: 'https://i0.hdslb.com/bfs/wbi/',
    }),
  });
  await assert.rejects(() => store.keys(), /wbi keys 解析失败/);
});

test('wbiKeyFromUrl 对目录形式返回空串', () => {
  assert.equal(wbiKeyFromUrl('https://i0.hdslb.com/bfs/wbi/'), '');
});
