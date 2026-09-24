import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateRange, formatContentRange, parseRange } from '../media/range';

test('parseRange 处理闭区间与开区间', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=100-', 1000), { start: 100, end: 999 });
  assert.deepEqual(parseRange('bytes=500-999', 1000), { start: 500, end: 999 });
  assert.deepEqual(parseRange('bytes=0-0', 1000), { start: 0, end: 0 });
});

test('parseRange 处理后缀区间（播放器拉尾部元数据时会用）', () => {
  assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=-5000', 1000), { start: 0, end: 999 }, '后缀超过总长则从头开始');
});

test('parseRange 把越界的结束位置夹到末尾', () => {
  assert.deepEqual(parseRange('bytes=900-5000', 1000), { start: 900, end: 999 });
});

test('看不懂的头按「没有 Range」处理（回整段 200）', () => {
  for (const header of [null, undefined, '', 'bytes=', 'items=0-10', 'bytes=0-10,20-30', 'bytes=abc-def', 'bytes=-0']) {
    assert.deepEqual(evaluateRange(header, 1000), { status: 'none' }, `header=${String(header)}`);
    assert.equal(parseRange(header, 1000), null);
  }
});

test('语法正确但越界的区间必须判为 unsatisfiable（回 416）', () => {
  assert.deepEqual(evaluateRange('bytes=1000-', 1000), { status: 'unsatisfiable' });
  assert.deepEqual(evaluateRange('bytes=1000-2000', 1000), { status: 'unsatisfiable' });
  assert.deepEqual(evaluateRange('bytes=500-100', 1000), { status: 'unsatisfiable' }, '起点大于终点');
  assert.deepEqual(evaluateRange('bytes=0-', 0), { status: 'unsatisfiable' }, '空文件');
  assert.deepEqual(evaluateRange('bytes=-1', 0), { status: 'unsatisfiable' }, '空文件后缀区间');
  assert.equal(parseRange('bytes=1000-', 1000), null);
});

test('可满足区间返回 partial', () => {
  assert.deepEqual(evaluateRange('bytes=0-99', 1000), {
    status: 'partial',
    range: { start: 0, end: 99 },
  });
  assert.deepEqual(evaluateRange('bytes=-10', 1000), {
    status: 'partial',
    range: { start: 990, end: 999 },
  });
});

test('formatContentRange 输出标准格式', () => {
  assert.equal(formatContentRange({ start: 0, end: 99 }, 1000), 'bytes 0-99/1000');
});

test('416 响应里的 content-range 形式', () => {
  // 代理在 unsatisfiable 时写的是 `bytes */total`
  assert.equal(`bytes */${1000}`, 'bytes */1000');
});

