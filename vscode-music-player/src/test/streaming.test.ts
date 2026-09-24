import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GrowingBuffer } from '../media/growingBuffer';
import { parseContentRangeTotal } from '../media/range';
import { MediaStore } from '../media/mediaStore';
import { startMediaProxy } from '../media/proxyServer';

/* ------------------------------------------------------------ 增长缓冲区 */

test('append 顺序写入并截断到容量', () => {
  const growing = new GrowingBuffer({ capacity: 10 });
  assert.equal(growing.append(Buffer.from('abc')), 3);
  assert.equal(growing.availableBytes, 3);
  assert.equal(growing.append(Buffer.from('0123456789')), 7, '超出容量只写剩余部分');
  assert.equal(growing.availableBytes, 10);
  assert.equal(growing.append(Buffer.from('x')), 0, '满了就不再写');
  assert.equal(growing.buffer.subarray(0, 3).toString(), 'abc');
});

test('waitForAtLeast 在数据到位时立刻兑现', async () => {
  const growing = new GrowingBuffer({ capacity: 100 });
  const waiting = growing.waitForAtLeast(5, 1000);
  assert.equal(growing.pendingWaiters, 1);
  growing.append(Buffer.alloc(5));
  assert.equal(await waiting, true);
  assert.equal(growing.pendingWaiters, 0);
});

test('waitForAtLeast 超时返回 false，且不残留等待者', async () => {
  const growing = new GrowingBuffer({ capacity: 100 });
  const satisfied = await growing.waitForAtLeast(50, 30);
  assert.equal(satisfied, false);
  assert.equal(growing.pendingWaiters, 0);
});

test('finish() 唤醒所有等待者（哪怕数据没到齐）', async () => {
  const growing = new GrowingBuffer({ capacity: 100 });
  const waiting = growing.waitForAtLeast(90, 5000);
  growing.append(Buffer.alloc(10));
  growing.finish();
  assert.equal(await waiting, true, '写完就该唤醒，让代理用现成数据回一个短响应');
  assert.equal(growing.isComplete, true);
});

test('已经满足的条件不再等待', async () => {
  const growing = new GrowingBuffer({ capacity: 100 });
  growing.append(Buffer.alloc(20));
  assert.equal(await growing.waitForAtLeast(10, 5000), true);
  assert.equal(await growing.waitForAtLeast(0, 5000), true);
});

test('needed 超过容量时按容量处理（只能等 finish）', async () => {
  const growing = new GrowingBuffer({ capacity: 10 });
  growing.append(Buffer.alloc(10));
  assert.equal(await growing.waitForAtLeast(999, 50), true, '已满即已满足');
});

/* ------------------------------------------------------- Content-Range */

test('parseContentRangeTotal 取出总长度', () => {
  assert.equal(parseContentRangeTotal('bytes 0-1535999/2977475'), 2977475);
  assert.equal(parseContentRangeTotal('bytes 100-199/*'), null, '未知总长返回 null');
  assert.equal(parseContentRangeTotal('bytes 0-10'), null);
  assert.equal(parseContentRangeTotal(null), null);
  assert.equal(parseContentRangeTotal(''), null);
});

/* ------------------------------------------------- 代理的流式（增量）响应 */

test('代理对流式音频先回一段可用数据，补完后再回剩下的', async () => {
  const store = new MediaStore();
  const proxy = await startMediaProxy({
    store,
    growingInitialWaitMs: 1000,
    growingChunkBytes: 64,
    growingChunkWaitMs: 200,
  });
  try {
    const total = 200;
    const created = store.registerGrowing({ capacity: total, contentType: 'audio/wav' });
    // 先只写 100 字节（含「头部」）
    const firstHalf = Buffer.alloc(100, 1);
    created.growing.append(firstHalf);

    const first = await fetch(proxy.url(`/audio/${created.id}`), { headers: { range: 'bytes=0-' } });
    assert.equal(first.status, 206);
    assert.equal(
      first.headers.get('content-range'),
      `bytes 0-99/${total}`,
      '只回已经写好的部分，而不是等整段',
    );
    assert.equal((await first.arrayBuffer()).byteLength, 100);

    // 播放器接着要后面的：此时还没写，代理会等到有数据为止
    const pending = fetch(proxy.url(`/audio/${created.id}`), { headers: { range: 'bytes=100-199' } });
    setTimeout(() => {
      created.growing.append(Buffer.alloc(100, 2));
      created.growing.finish();
    }, 50);
    const second = await pending;
    assert.equal(second.status, 206);
    assert.equal(second.headers.get('content-range'), `bytes 100-199/${total}`);
    assert.equal((await second.arrayBuffer()).byteLength, 100);

    // 数据齐了之后是整段 200
    const whole = await fetch(proxy.url(`/audio/${created.id}`));
    assert.equal(whole.status, 200);
    assert.equal(whole.headers.get('content-length'), String(total));
  } finally {
    await proxy.close();
  }
});

test('代理在流式音频还完全没数据时最多等一小会儿，然后回 503 让播放器重试', async () => {
  const store = new MediaStore();
  const proxy = await startMediaProxy({ store, growingInitialWaitMs: 60 });
  try {
    const created = store.registerGrowing({ capacity: 100, contentType: 'audio/wav' });
    const response = await fetch(proxy.url(`/audio/${created.id}`));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '1');

    // 有数据之后同样的请求就正常了
    created.growing.append(Buffer.alloc(64, 7));
    const retry = await fetch(proxy.url(`/audio/${created.id}`));
    assert.equal(retry.status, 206);
    assert.equal(retry.headers.get('content-range'), 'bytes 0-63/100');
  } finally {
    await proxy.close();
  }
});
