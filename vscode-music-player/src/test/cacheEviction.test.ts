import assert from 'node:assert/strict';
import { test } from 'node:test';

import { selectCacheEvictions, type CacheFileInfo } from '../audio/pipeline';

function file(name: string, mb: number, modifiedAt: number): CacheFileInfo {
  return { name, bytes: mb * 1024 * 1024, modifiedAt };
}

test('未超上限时不淘汰任何文件', () => {
  const files = [file('a.wav', 40, 1), file('b.wav', 40, 2)];
  assert.deepEqual(selectCacheEvictions(files, 500 * 1024 * 1024), []);
});

test('刚好等于上限也不淘汰', () => {
  const files = [file('a.wav', 100, 1), file('b.wav', 100, 2)];
  assert.deepEqual(selectCacheEvictions(files, 200 * 1024 * 1024), []);
});

test('超上限时按最久未修改先删，删到限额以内为止', () => {
  const files = [
    file('newest.wav', 40, 3000),
    file('oldest.wav', 40, 1000),
    file('middle.wav', 40, 2000),
  ];
  // 总量 120MB，上限 50MB → 需要删到 ≤ 50MB，最多留一个。
  const evictions = selectCacheEvictions(files, 50 * 1024 * 1024);
  assert.deepEqual(
    evictions.map((item) => item.name),
    ['oldest.wav', 'middle.wav'],
  );
});

test('单个大文件也能被淘汰（删一个就够）', () => {
  const files = [file('huge.wav', 400, 1000), file('small.wav', 10, 2000)];
  const evictions = selectCacheEvictions(files, 100 * 1024 * 1024);
  assert.deepEqual(
    evictions.map((item) => item.name),
    ['huge.wav'],
    '删掉 400MB 那个之后剩下 10MB，已经在上限内，不该再删',
  );
});

test('空目录不报错', () => {
  assert.deepEqual(selectCacheEvictions([], 1024), []);
});

test('上限为 0 时全部淘汰', () => {
  const files = [file('a.wav', 1, 1)];
  assert.deepEqual(
    selectCacheEvictions(files, 0).map((item) => item.name),
    ['a.wav'],
  );
});
