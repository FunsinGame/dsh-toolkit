import assert from 'node:assert/strict';
import { test } from 'node:test';

import { av2bv, bv2av, isBvid } from '../bilibili/ids';

test('官方文档基准值：av170001 ↔ BV17x411w7KC', () => {
  assert.equal(av2bv(170001), 'BV17x411w7KC');
  assert.equal(bv2av('BV17x411w7KC'), 170001);
});

test('av2bv / bv2av 大量往返一致', () => {
  const samples = [1, 2, 1000, 170001, 9999999, 123456789, 9876543210, 2251799813685247];
  for (const avid of samples) {
    const bvid = av2bv(avid);
    assert.equal(isBvid(bvid), true, `${avid} → ${bvid} 不是合法 BV 号`);
    assert.equal(bv2av(bvid), avid, `${bvid} 回转失败`);
  }
  // 连续区间往返
  for (let avid = 100000; avid < 100500; avid++) {
    assert.equal(bv2av(av2bv(avid)), avid, `avid=${avid}`);
  }
});

test('av2bv 接受 bigint', () => {
  assert.equal(av2bv(170001n), 'BV17x411w7KC');
});

test('非法输入直接抛错，不产出 NaN 号', () => {
  assert.throws(() => av2bv(0), /不是合法的 AV 号/);
  assert.throws(() => av2bv(-1), /不是合法的 AV 号/);
  assert.throws(() => bv2av('BV17x411w7K'), /不是合法的 BV 号/, '长度不足');
  assert.throws(() => bv2av('AV17x411w7KC'), /不是合法的 BV 号/, '前缀不对');
  assert.throws(() => bv2av('bv17x411w7KC'), /不是合法的 BV 号/, '大小写敏感');
  assert.equal(isBvid('BV17x411w7KC'), true);
  assert.equal(isBvid('BV17x411w7KCC'), false);
});
