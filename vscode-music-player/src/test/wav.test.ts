import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildWavHeader,
  encodeWav,
  pcmByteLength,
  predictedPcmBytes,
  ProgressiveWav,
  readWavDataBytes,
  WAV_HEADER_BYTES,
} from '../audio/wav';

const STEREO_44K = { sampleRate: 44100, channels: 2, bitsPerSample: 16 };

test('buildWavHeader 写出合法的 RIFF/PCM 头', () => {
  const header = buildWavHeader(STEREO_44K, 1000);
  assert.equal(header.byteLength, WAV_HEADER_BYTES);
  assert.equal(header.toString('ascii', 0, 4), 'RIFF');
  assert.equal(header.readUInt32LE(4), 36 + 1000);
  assert.equal(header.toString('ascii', 8, 12), 'WAVE');
  assert.equal(header.toString('ascii', 12, 16), 'fmt ');
  assert.equal(header.readUInt32LE(16), 16);
  assert.equal(header.readUInt16LE(20), 1, 'PCM 格式码');
  assert.equal(header.readUInt16LE(22), 2, '声道数');
  assert.equal(header.readUInt32LE(24), 44100, '采样率');
  assert.equal(header.readUInt32LE(28), 44100 * 2 * 2, 'byteRate');
  assert.equal(header.readUInt16LE(32), 4, 'blockAlign');
  assert.equal(header.readUInt16LE(34), 16, '位深');
  assert.equal(header.toString('ascii', 36, 40), 'data');
  assert.equal(header.readUInt32LE(40), 1000);
});

test('pcmByteLength / predictedPcmBytes 按帧数换算', () => {
  assert.equal(pcmByteLength(44100, STEREO_44K), 44100 * 4);
  // 155 秒 44.1kHz 立体声 16bit —— P0a 实测样本的预测长度
  assert.equal(predictedPcmBytes(155, STEREO_44K), 155 * 44100 * 4);
  assert.equal(predictedPcmBytes(-1, STEREO_44K), 0);
  assert.equal(predictedPcmBytes(Number.NaN, STEREO_44K), 0);
});

test('非法采样率直接抛错而不是写出坏头', () => {
  assert.throws(() => buildWavHeader({ sampleRate: 0, channels: 2 }, 10), /非法的采样率/);
  assert.throws(() => predictedPcmBytes(1, { sampleRate: -5, channels: 1 }), /非法的采样率/);
});

test('encodeWav / readWavDataBytes 往返一致', () => {
  const pcm = Buffer.alloc(400, 7);
  const wav = encodeWav(pcm, STEREO_44K);
  assert.equal(wav.byteLength, WAV_HEADER_BYTES + 400);
  assert.equal(readWavDataBytes(wav), 400);
  assert.deepEqual(wav.subarray(WAV_HEADER_BYTES), pcm);
  assert.throws(() => readWavDataBytes(Buffer.alloc(10)), /WAV 头部不完整/);
});

test('ProgressiveWav：头部按预测长度写死，超出部分被截断', () => {
  const writer = new ProgressiveWav(STEREO_44K, 100);
  assert.equal(writer.totalBytes, WAV_HEADER_BYTES + 100);
  assert.equal(readWavDataBytes(writer.header()), 100);

  const first = writer.accept(Buffer.alloc(60, 1));
  assert.equal(first.byteLength, 60);
  assert.equal(writer.writtenBytes, 60);

  const second = writer.accept(Buffer.alloc(80, 2));
  assert.equal(second.byteLength, 40, '只接受剩余空间');
  assert.equal(writer.writtenBytes, 100);

  assert.equal(writer.accept(Buffer.alloc(10)).byteLength, 0, '已满则拒绝');
  assert.equal(writer.paddingBytes(), 0);
  assert.equal(writer.finish().byteLength, 0);
});

test('ProgressiveWav：解码不足时补齐静音，总长仍等于预测值', () => {
  const writer = new ProgressiveWav(STEREO_44K, 100);
  writer.accept(Buffer.alloc(70, 3));
  assert.equal(writer.paddingBytes(), 30);
  const padding = writer.finish();
  assert.equal(padding.byteLength, 30);
  assert.equal(padding.every((byte) => byte === 0), true, '补的是静音');
  const total = Buffer.concat([writer.header(), Buffer.alloc(70), padding]);
  assert.equal(total.byteLength, WAV_HEADER_BYTES + 100);
  assert.equal(readWavDataBytes(total), 100);
});

test('ProgressiveWav：采样率非法时构造即失败', () => {
  assert.throws(() => new ProgressiveWav({ sampleRate: 0, channels: 2 }, 10), /非法的采样率/);
});
