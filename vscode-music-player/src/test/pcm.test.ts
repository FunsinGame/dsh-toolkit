import assert from 'node:assert/strict';
import { test } from 'node:test';

import { floatToInt16, int16ToBuffer, interleaveToInt16, silenceBytes } from '../audio/pcm';

test('floatToInt16 做四舍五入与限幅', () => {
  assert.equal(floatToInt16(0), 0);
  assert.equal(floatToInt16(1), 32767);
  // 对称缩放（×32767）不占用 -32768 这个最低点，少 1 LSB 无感知。
  assert.equal(floatToInt16(-1), -32767);
  assert.equal(floatToInt16(2), 32767, '正向溢出被限幅');
  assert.equal(floatToInt16(-2), -32768, '负向溢出被限幅到下限');
  assert.equal(floatToInt16(0.5), Math.round(0.5 * 32767));
  assert.equal(floatToInt16(Number.NaN), 0, 'NaN 视为静音');
  assert.equal(floatToInt16(Number.POSITIVE_INFINITY), 0);
});

test('interleaveToInt16 按帧交错多声道', () => {
  const left = new Float32Array([1, 0, -1]);
  const right = new Float32Array([0, 1, 0]);
  const interleaved = interleaveToInt16([left, right], 3);
  assert.equal(interleaved.length, 6);
  assert.deepEqual(Array.from(interleaved), [32767, 0, 0, 32767, -32767, 0]);
});

test('interleaveToInt16 处理单声道与越界帧', () => {
  const mono = new Float32Array([1, 1]);
  assert.deepEqual(Array.from(interleaveToInt16([mono], 2)), [32767, 32767]);
  // 声称 4 帧但只有 2 帧数据：不足的部分补 0
  assert.deepEqual(Array.from(interleaveToInt16([mono], 4)), [32767, 32767, 0, 0]);
});

test('int16ToBuffer 输出小端字节序', () => {
  const buffer = int16ToBuffer(new Int16Array([1, -1, 256]));
  assert.equal(buffer.byteLength, 6);
  assert.equal(buffer.readInt16LE(0), 1);
  assert.equal(buffer.readInt16LE(2), -1);
  assert.equal(buffer.readInt16LE(4), 256);
});

test('silenceBytes 生成全零且长度不为负', () => {
  assert.equal(silenceBytes(5).every((byte) => byte === 0), true);
  assert.equal(silenceBytes(-3).byteLength, 0);
});
