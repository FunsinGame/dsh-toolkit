import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SessionStore, type SecretStorageLike } from '../state/session';

/** 内存版密钥存储。 */
function fakeSecrets(): SecretStorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key: string) => data.get(key),
    store: async (key: string, value: string) => {
      data.set(key, value);
    },
    delete: async (key: string) => {
      data.delete(key);
    },
  };
}

test('只有设备指纹时不算已登录（这正是之前误判的那个 bug）', async () => {
  const secrets = fakeSecrets();
  const store = new SessionStore(secrets);
  await store.setBuvid('buvid3-value', 'buvid4-value');

  assert.equal(store.hasDeviceId, true);
  assert.equal(
    store.isLoggedIn,
    false,
    'buvid 不是账号凭据；否则每次启动都会白跑一次 myinfo 并误报「凭据失效」',
  );
  assert.equal(store.cookies?.buvid3, 'buvid3-value');
});

test('拿到 SESSDATA + bili_jct 才算已登录', async () => {
  const store = new SessionStore(fakeSecrets());
  await store.setCookies({ SESSDATA: 'sess', bili_jct: 'csrf', DedeUserID: '42' });
  assert.equal(store.isLoggedIn, true);

  const onlySessdata = new SessionStore(fakeSecrets());
  await onlySessdata.setCookies({ SESSDATA: 'sess', DedeUserID: '42' });
  assert.equal(onlySessdata.isLoggedIn, false, '写操作需要 bili_jct');

  const onlyCsrf = new SessionStore(fakeSecrets());
  await onlyCsrf.setCookies({ bili_jct: 'csrf' });
  assert.equal(onlyCsrf.isLoggedIn, false, '读接口需要 SESSDATA');
});

test('clearLogin 清掉登录凭据但保留设备指纹', async () => {
  const store = new SessionStore(fakeSecrets());
  await store.setBuvid('b3', 'b4');
  await store.mergeCookies({
    SESSDATA: 'sess',
    bili_jct: 'csrf',
    DedeUserID: '42',
    DedeUserID__ckMd5: 'md5',
    sid: 'sid',
  });
  assert.equal(store.isLoggedIn, true);

  await store.clearLogin();
  assert.equal(store.isLoggedIn, false);
  assert.deepEqual(store.cookies, { buvid3: 'b3', buvid4: 'b4' }, '设备指纹必须留下');
});

test('clearLogin 对空存储是安全的', async () => {
  const store = new SessionStore(fakeSecrets());
  await store.clearLogin();
  assert.equal(store.cookies, null);
});

test('clear 彻底清空（含设备指纹）', async () => {
  const secrets = fakeSecrets();
  const store = new SessionStore(secrets);
  await store.setBuvid('b3', 'b4');
  await store.clear();
  assert.equal(store.cookies, null);
  assert.equal(secrets.data.size, 0);

  const reloaded = new SessionStore(secrets);
  assert.equal(await reloaded.load(), null);
});

test('持久化后能被重新读回来（模拟重启 VS Code）', async () => {
  const secrets = fakeSecrets();
  const first = new SessionStore(secrets);
  await first.setCookies({ SESSDATA: 'sess', bili_jct: 'csrf', DedeUserID: '42' });

  const second = new SessionStore(secrets);
  const loaded = await second.load();
  assert.equal(loaded?.cookies.SESSDATA, 'sess');
  assert.equal(second.isLoggedIn, true);
  assert.equal(second.cookieHeader(), 'SESSDATA=sess; bili_jct=csrf; DedeUserID=42');
});

test('损坏的凭据按未登录处理，不抛错', async () => {
  const secrets = fakeSecrets();
  await secrets.store('musicPlayer.credentials', '{不是 JSON');
  const store = new SessionStore(secrets);
  assert.equal(await store.load(), null);
  assert.equal(store.isLoggedIn, false);
});

test('格式不对的凭据（缺 cookies 字段）也按未登录处理', async () => {
  const secrets = fakeSecrets();
  await secrets.store('musicPlayer.credentials', JSON.stringify({ savedAt: 1 }));
  const store = new SessionStore(secrets);
  assert.equal(await store.load(), null);
});

test('setCookieHeader 支持手动粘贴的 Cookie 头', async () => {
  const store = new SessionStore(fakeSecrets());
  await store.setCookieHeader('SESSDATA=a%2Cb; bili_jct=t; DedeUserID=7');
  assert.equal(store.isLoggedIn, true);
  assert.equal(store.cookies?.SESSDATA, 'a%2Cb');
});
