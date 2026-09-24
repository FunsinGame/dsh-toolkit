import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { AudioPipeline } from '../audio/pipeline';
import type { BilibiliApi } from '../bilibili/api';
import type { BilibiliClient } from '../bilibili/client';

/** 只需要缓存相关方法的流水线：api/client 用不上。 */
function pipelineWithCache(cacheDir: string | null, maxBytes?: number): AudioPipeline {
  return new AudioPipeline({
    api: {} as unknown as BilibiliApi,
    client: {} as unknown as BilibiliClient,
    cacheDir,
    ...(maxBytes === undefined ? {} : { cacheMaxBytes: maxBytes }),
  });
}

test('cacheStats 统计文件数与总字节', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vmp-cache-'));
  try {
    await writeFile(join(dir, 'a.wav'), Buffer.alloc(1000));
    await writeFile(join(dir, 'b.wav'), Buffer.alloc(2500));
    const stats = await pipelineWithCache(dir).cacheStats();
    assert.equal(stats.files, 2);
    assert.equal(stats.bytes, 3500);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('cacheStats 对不存在的目录返回 0 而不是抛错', async () => {
  const stats = await pipelineWithCache(join(tmpdir(), 'vmp-cache-does-not-exist-xyz')).cacheStats();
  assert.deepEqual(stats, { files: 0, bytes: 0 });
});

test('缓存关闭（cacheDir 为 null）时统计为 0，清空也是空操作', async () => {
  const pipeline = pipelineWithCache(null);
  assert.deepEqual(await pipeline.cacheStats(), { files: 0, bytes: 0 });
  await pipeline.clearCache();
});

test('clearCache 真的把目录删掉，之后再统计为 0', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vmp-cache-'));
  const pipeline = pipelineWithCache(dir);
  await writeFile(join(dir, 'a.wav'), Buffer.alloc(4096));
  await writeFile(join(dir, 'b.wav'), Buffer.alloc(4096));
  assert.equal((await pipeline.cacheStats()).files, 2);

  await pipeline.clearCache();
  assert.deepEqual(await pipeline.cacheStats(), { files: 0, bytes: 0 });
  await assert.rejects(() => readdir(dir), '目录应当被删除');
});

test('enforceCacheLimit 真的按最久未修改删文件（端到端）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vmp-cache-'));
  try {
    const { utimes } = await import('node:fs/promises');
    const oldFile = join(dir, 'old.wav');
    const midFile = join(dir, 'mid.wav');
    await writeFile(oldFile, Buffer.alloc(1000));
    await writeFile(midFile, Buffer.alloc(1000));
    await utimes(oldFile, new Date(Date.now() - 120_000), new Date(Date.now() - 120_000));
    await utimes(midFile, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
    await writeFile(join(dir, 'new.wav'), Buffer.alloc(1000));

    // 上限 2000 字节：总量 3000，需要删到 ≤ 2000 → 删最旧的一个
    const pipeline = pipelineWithCache(dir, 2000);
    const removed = await pipeline.enforceCacheLimit();
    assert.equal(removed, 1);

    const remaining = (await readdir(dir)).sort();
    assert.deepEqual(remaining, ['mid.wav', 'new.wav'], '最旧的被删，其余保留');
    assert.equal((await pipeline.cacheStats()).bytes, 2000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('enforceCacheLimit：未超限不删，缓存关闭时不动', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vmp-cache-'));
  try {
    await writeFile(join(dir, 'a.wav'), Buffer.alloc(1000));
    assert.equal(await pipelineWithCache(dir, 10_000).enforceCacheLimit(), 0);
    assert.equal((await readdir(dir)).length, 1);

    assert.equal(await pipelineWithCache(null).enforceCacheLimit(), 0);
    assert.equal(await pipelineWithCache(dir, 0).enforceCacheLimit(), 0, '上限 0 视为不限制');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
