import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MediaStore } from '../media/mediaStore';

test('register 返回 24 位十六进制 id，并能取回内容', () => {
  const store = new MediaStore();
  const id = store.register({ kind: 'audio', bytes: Buffer.from('hello'), contentType: 'audio/wav' });
  assert.match(id, /^[0-9a-f]{24}$/);
  const entry = store.get(id);
  assert.equal(entry?.contentType, 'audio/wav');
  assert.equal(entry?.bytes?.toString(), 'hello');
  assert.equal(store.totalBytes, 5);
  assert.deepEqual(store.stats(), { entries: 1, totalBytes: 5, audioEntries: 1 });
});

test('过期条目在被取用时立即失效', () => {
  const store = new MediaStore();
  const id = store.register({
    kind: 'audio',
    bytes: Buffer.alloc(10),
    contentType: 'audio/wav',
    ttlMs: -1,
  });
  assert.equal(store.get(id), undefined);
  assert.equal(store.size, 0, '取用时顺手删除');
});

test('sweep 清理过期条目并返回条数', () => {
  const store = new MediaStore();
  store.register({ kind: 'audio', bytes: Buffer.alloc(1), contentType: 'audio/wav', ttlMs: -1 });
  store.register({ kind: 'audio', bytes: Buffer.alloc(1), contentType: 'audio/wav', ttlMs: 60_000 });
  assert.equal(store.sweep(), 1);
  assert.equal(store.size, 1);
});

test('超出容量上限时按「优先级低 → 创建早」淘汰', () => {
  const store = new MediaStore(300);
  const keep = store.register({
    kind: 'audio',
    bytes: Buffer.alloc(100),
    contentType: 'audio/wav',
    priority: 10,
  });
  const first = store.register({ kind: 'audio', bytes: Buffer.alloc(100), contentType: 'audio/wav' });
  const second = store.register({ kind: 'audio', bytes: Buffer.alloc(150), contentType: 'audio/wav' });

  assert.equal(store.get(keep) !== undefined, true, '高优先级条目保留');
  assert.equal(store.get(second) !== undefined, true, '容量足够容纳它俩');
  assert.equal(store.totalBytes <= 300, true);
  // 淘汰发生后总字节数必须回到上限内
  assert.equal(store.get(first), undefined, '最先创建的低优先级条目被淘汰');
});

test('delete / clear 释放内存', () => {
  const store = new MediaStore();
  const id = store.register({ kind: 'audio', bytes: Buffer.alloc(1000), contentType: 'audio/wav' });
  assert.equal(store.delete(id), true);
  assert.equal(store.delete(id), false);
  store.register({ kind: 'image', upstreamUrl: 'https://example.com/a.png', contentType: 'image/png' });
  assert.equal(store.totalBytes, 0, '只登记上游地址时不占内存');
  store.clear();
  assert.equal(store.size, 0);
});
