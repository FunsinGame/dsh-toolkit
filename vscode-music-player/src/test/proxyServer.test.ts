import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { test } from 'node:test';

import { MediaStore } from '../media/mediaStore';
import { startMediaProxy } from '../media/proxyServer';

function payload(size: number): Buffer {
  const buffer = Buffer.alloc(size);
  for (let i = 0; i < size; i++) buffer[i] = i % 251;
  return buffer;
}

async function withProxy(
  run: (context: { store: MediaStore; proxy: Awaited<ReturnType<typeof startMediaProxy>> }) => Promise<void>,
): Promise<void> {
  const store = new MediaStore();
  const proxy = await startMediaProxy({ store });
  try {
    await run({ store, proxy });
  } finally {
    await proxy.close();
  }
}

test('健康检查需要 token，且拒绝非 webview 的 Origin', async () => {
  await withProxy(async ({ proxy }) => {
    const noToken = await fetch(`${proxy.origin}/health`);
    assert.equal(noToken.status, 401);

    const wrongToken = await fetch(`${proxy.origin}/health?token=nope`);
    assert.equal(wrongToken.status, 401);

    const badOrigin = await fetch(proxy.url('/health'), { headers: { origin: 'https://evil.example' } });
    assert.equal(badOrigin.status, 403);

    const webviewOrigin = await fetch(proxy.url('/health'), {
      headers: { origin: 'vscode-webview://abc' },
    });
    assert.equal(webviewOrigin.status, 200);
    const body = (await webviewOrigin.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  });
});

test('token 也可以通过请求头传（给不能拼查询串的场景）', async () => {
  await withProxy(async ({ proxy }) => {
    const response = await fetch(`${proxy.origin}/health`, {
      headers: { 'x-media-token': proxy.token },
    });
    assert.equal(response.status, 200);
  });
});

test('音频：整段 200、Range 206、HEAD 只回头', async () => {
  await withProxy(async ({ store, proxy }) => {
    const bytes = payload(1000);
    const id = store.register({ kind: 'audio', bytes, contentType: 'audio/wav' });

    const full = await fetch(proxy.url(`/audio/${id}`));
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('content-type'), 'audio/wav');
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    assert.equal(full.headers.get('content-length'), '1000');
    assert.equal(Buffer.from(await full.arrayBuffer()).equals(bytes), true);

    const partial = await fetch(proxy.url(`/audio/${id}`), { headers: { range: 'bytes=100-199' } });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), 'bytes 100-199/1000');
    assert.equal(partial.headers.get('content-length'), '100');
    assert.equal(Buffer.from(await partial.arrayBuffer()).equals(bytes.subarray(100, 200)), true);

    const suffix = await fetch(proxy.url(`/audio/${id}`), { headers: { range: 'bytes=-10' } });
    assert.equal(suffix.status, 206);
    assert.equal(suffix.headers.get('content-range'), 'bytes 990-999/1000');

    const unsatisfiable = await fetch(proxy.url(`/audio/${id}`), { headers: { range: 'bytes=5000-' } });
    assert.equal(unsatisfiable.status, 416, '越界区间回 416，避免播放器重下整段');
    assert.equal(unsatisfiable.headers.get('content-range'), 'bytes */1000');

    const malformed = await fetch(proxy.url(`/audio/${id}`), { headers: { range: 'bytes=oops' } });
    assert.equal(malformed.status, 200, '看不懂的头退化为整段响应');

    const head = await fetch(proxy.url(`/audio/${id}`), { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), '1000');
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  });
});

test('未知 id / 过期 id / 类别不匹配都返回 404', async () => {
  await withProxy(async ({ store, proxy }) => {
    const unknown = await fetch(proxy.url('/audio/0123456789abcdef01234567'));
    assert.equal(unknown.status, 404);

    const expiredId = store.register({ kind: 'audio', bytes: payload(10), contentType: 'audio/wav', ttlMs: -1 });
    const expired = await fetch(proxy.url(`/audio/${expiredId}`));
    assert.equal(expired.status, 404);

    const audioId = store.register({ kind: 'audio', bytes: payload(10), contentType: 'audio/wav' });
    const wrongKind = await fetch(proxy.url(`/img/${audioId}`));
    assert.equal(wrongKind.status, 404);

    const badPath = await fetch(proxy.url('/audio/not-an-id'));
    assert.equal(badPath.status, 404);

    const posting = await fetch(proxy.url(`/audio/${audioId}`), { method: 'POST' });
    assert.equal(posting.status, 405);
  });
});

test('图片：上游只拉一次，之后走进程内缓存', async () => {
  let upstreamHits = 0;
  const upstream: Server = createServer((_req, res) => {
    upstreamHits++;
    res.writeHead(200, { 'content-type': 'image/jpeg' });
    res.end(Buffer.from('fake-jpeg-bytes'));
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = (upstream.address() as { port: number }).port;

  const store = new MediaStore();
  const proxy = await startMediaProxy({ store });
  try {
    const id = store.register({
      kind: 'image',
      upstreamUrl: `http://127.0.0.1:${upstreamPort}/cover.jpg`,
      contentType: 'image/jpeg',
      label: '封面',
    });

    const first = await fetch(proxy.url(`/img/${id}`));
    assert.equal(first.status, 200);
    assert.equal(await first.text(), 'fake-jpeg-bytes');
    assert.equal(first.headers.get('content-type'), 'image/jpeg');

    const second = await fetch(proxy.url(`/img/${id}`), { headers: { range: 'bytes=0-3' } });
    assert.equal(second.status, 206);
    assert.equal(await second.text(), 'fake');
    assert.equal(upstreamHits, 1, '第二次请求不应再打上游');
  } finally {
    await proxy.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test('上游失败返回 502，不影响代理自身存活', async () => {
  const store = new MediaStore();
  const proxy = await startMediaProxy({ store });
  try {
    const id = store.register({
      kind: 'image',
      // 127.0.0.1:1 基本可以确定连不上
      upstreamUrl: 'http://127.0.0.1:1/cover.jpg',
      contentType: 'image/jpeg',
    });
    const response = await fetch(proxy.url(`/img/${id}`));
    assert.equal(response.status, 502);
    const health = await fetch(proxy.url('/health'));
    assert.equal(health.status, 200);
  } finally {
    await proxy.close();
  }
});

test('close() 之后端口不再可用（防止重载窗口泄漏监听）', async () => {
  const store = new MediaStore();
  const proxy = await startMediaProxy({ store });
  const url = proxy.url('/health');
  await proxy.close();
  await assert.rejects(async () => {
    await fetch(url);
  });
});
