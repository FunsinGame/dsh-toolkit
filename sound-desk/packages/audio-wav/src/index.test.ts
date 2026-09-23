/**
 * Tests for @sounddesk/audio-wav.
 *
 * Every fixture is synthesized in-memory by the tiny WAV builders in this file — no external
 * audio files are used. File-based tests write their fixtures into a temporary directory that is
 * created inside this package and removed again afterwards.
 *
 * Run with: node --test --experimental-strip-types src/*.test.ts
 */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  analyzeDsp,
  buildPeaks,
  decodeWav,
  deserializePeaks,
  peaksForFile,
  probeWav,
  probeWavBuffer,
  serializePeaks,
} from './index.ts';

/* --------------------------------------------------------------------------------------------
 * WAV builders
 * ------------------------------------------------------------------------------------------ */

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface FmtSpec {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  audioFormat?: number;
  extensible?: boolean;
  channelMask?: number;
  validBitsPerSample?: number;
}

interface ChunkSpec {
  id: string;
  payload: Buffer;
}

/** One RIFF chunk: 4-byte id, u32 size, payload, plus a pad byte when the payload is odd. */
function makeChunk(spec: ChunkSpec, bigEndian = false): Buffer {
  const head = Buffer.alloc(8);
  head.write(spec.id.padEnd(4, ' ').slice(0, 4), 0, 4, 'latin1');
  if (bigEndian) head.writeUInt32BE(spec.payload.length, 4);
  else head.writeUInt32LE(spec.payload.length, 4);
  const tail = spec.payload.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0);
  return Buffer.concat([head, spec.payload, tail]);
}

function makeFmtPayload(spec: FmtSpec, bigEndian = false): Buffer {
  const bytesPerSample = spec.bitsPerSample / 8;
  const blockAlign = spec.channels * bytesPerSample;
  const byteRate = spec.sampleRate * blockAlign;
  const extensible = spec.extensible === true;

  const buf = Buffer.alloc(extensible ? 40 : 16);
  if (bigEndian) {
    buf.writeUInt16BE(extensible ? 0xfffe : (spec.audioFormat ?? 1), 0);
    buf.writeUInt16BE(spec.channels, 2);
    buf.writeUInt32BE(spec.sampleRate, 4);
    buf.writeUInt32BE(byteRate, 8);
    buf.writeUInt16BE(blockAlign, 12);
    buf.writeUInt16BE(spec.bitsPerSample, 14);
  } else {
    buf.writeUInt16LE(extensible ? 0xfffe : (spec.audioFormat ?? 1), 0);
    buf.writeUInt16LE(spec.channels, 2);
    buf.writeUInt32LE(spec.sampleRate, 4);
    buf.writeUInt32LE(byteRate, 8);
    buf.writeUInt16LE(blockAlign, 12);
    buf.writeUInt16LE(spec.bitsPerSample, 14);
  }

  if (extensible) {
    const tag = spec.audioFormat ?? 1;
    buf.writeUInt16LE(22, 16); // cbSize
    buf.writeUInt16LE(spec.validBitsPerSample ?? spec.bitsPerSample, 18);
    buf.writeUInt32LE(spec.channelMask ?? 0, 20);
    // KSDATAFORMAT_SUBTYPE_*: Data1 (tag) / 0000 / 0010 / 8000-00AA00389B71
    const guid = Buffer.from([
      tag & 0xff,
      (tag >> 8) & 0xff,
      0x00,
      0x00,
      0x00,
      0x00,
      0x10,
      0x00,
      0x80,
      0x00,
      0x00,
      0xaa,
      0x00,
      0x38,
      0x9b,
      0x71,
    ]);
    guid.copy(buf, 24);
  }
  return buf;
}

function assembleRiff(parts: Buffer[], bigEndian = false): Buffer {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(12);
  head.write(bigEndian ? 'RIFX' : 'RIFF', 0, 4, 'latin1');
  if (bigEndian) head.writeUInt32BE(4 + body.length, 4);
  else head.writeUInt32LE(4 + body.length, 4);
  head.write('WAVE', 8, 4, 'latin1');
  return Buffer.concat([head, body]);
}

function int16Payload(values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 2);
  for (let i = 0; i < values.length; i++) buf.writeInt16LE(values[i], i * 2);
  return buf;
}

function int24Payload(values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 3);
  for (let i = 0; i < values.length; i++) {
    let v = values[i] & 0xffffff;
    buf[i * 3] = v & 0xff;
    buf[i * 3 + 1] = (v >> 8) & 0xff;
    buf[i * 3 + 2] = (v >> 16) & 0xff;
  }
  return buf;
}

function float32Payload(values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) buf.writeFloatLE(values[i], i * 4);
  return buf;
}

function bextPayload(opts: {
  description?: string;
  originator?: string;
  originatorReference?: string;
  originationDate?: string;
  originationTime?: string;
  timeReferenceLow?: number;
  timeReferenceHigh?: number;
  version?: number;
  umid?: Buffer;
  loudnessValue?: number;
  codingHistory?: string;
  totalSize?: number;
}): Buffer {
  const base = opts.totalSize ?? 602;
  const size = Math.max(base, 602) + (opts.codingHistory ? Buffer.byteLength(opts.codingHistory, 'latin1') : 0);
  const buf = Buffer.alloc(size);
  const writeField = (value: string | undefined, offset: number, length: number): void => {
    if (!value) return;
    buf.write(value.slice(0, length), offset, length, 'latin1');
  };
  writeField(opts.description, 0, 256);
  writeField(opts.originator, 256, 32);
  writeField(opts.originatorReference, 288, 32);
  writeField(opts.originationDate, 320, 10);
  writeField(opts.originationTime, 330, 8);
  buf.writeUInt32LE(opts.timeReferenceLow ?? 0, 338);
  buf.writeUInt32LE(opts.timeReferenceHigh ?? 0, 342);
  buf.writeUInt16LE(opts.version ?? 0, 346);
  if (opts.umid) opts.umid.copy(buf, 348, 0, Math.min(64, opts.umid.length));
  if ((opts.version ?? 0) >= 2) {
    buf.writeInt16LE(opts.loudnessValue ?? -32768, 412);
    buf.writeInt16LE(-32768, 414);
    buf.writeInt16LE(-32768, 416);
    buf.writeInt16LE(-32768, 418);
    buf.writeInt16LE(-32768, 420);
  }
  if (opts.codingHistory) {
    const history = Buffer.from(opts.codingHistory, 'latin1');
    const offset = base < 602 ? 602 : base;
    history.copy(buf, offset);
  }
  return buf;
}

/* --------------------------------------------------------------------------------------------
 * Misc helpers
 * ------------------------------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sine(frames: number, sampleRate: number, frequency: number, amplitude: number): Float32Array {
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  return out;
}

function int16Sine(frames: number, sampleRate: number, frequency: number, amplitude: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < frames; i++) {
    out.push(Math.round(32767 * amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate)));
  }
  return out;
}

function assertAllFinite(features: Record<string, number | boolean>): void {
  for (const [key, value] of Object.entries(features)) {
    if (typeof value === 'number') {
      assert.ok(Number.isFinite(value), `expected ${key} to be finite, got ${value}`);
    }
  }
}

/* --------------------------------------------------------------------------------------------
 * probe + decode: PCM16 stereo
 * ------------------------------------------------------------------------------------------ */

test('probeWavBuffer: PCM16 stereo headers', () => {
  const frames = 1000;
  const samples: number[] = [];
  for (let i = 0; i < frames; i++) {
    samples.push(Math.round(30000 * Math.sin((2 * Math.PI * 100 * i) / 44100)));
    samples.push(Math.round(-20000 * Math.cos((2 * Math.PI * 220 * i) / 44100)));
  }
  const fmt = makeFmtPayload({ channels: 2, sampleRate: 44100, bitsPerSample: 16 });
  const data = int16Payload(samples);
  const buf = assembleRiff([makeChunk({ id: 'fmt ', payload: fmt }), makeChunk({ id: 'data', payload: data })]);

  const probe = probeWavBuffer(buf);

  assert.equal(probe.format.audioFormat, 1);
  assert.equal(probe.format.channels, 2);
  assert.equal(probe.format.sampleRate, 44100);
  assert.equal(probe.format.bitsPerSample, 16);
  assert.equal(probe.format.byteRate, 44100 * 4);
  assert.equal(probe.format.blockAlign, 4);
  assert.equal(probe.format.isFloat, false);
  assert.equal(probe.format.isExtensible, false);
  assert.equal(probe.format.channelMask, undefined);
  assert.equal(probe.frameCount, frames);
  assert.equal(probe.dataBytes, frames * 4);
  assert.ok(Math.abs(probe.durationMs - (frames / 44100) * 1000) < 1e-9);
  assert.equal(probe.unsupportedCodec, false);
  assert.deepEqual(probe.embedded, {});
  assert.deepEqual(probe.chunks, [
    { id: 'fmt', size: 16, offset: 12 },
    { id: 'data', size: frames * 4, offset: 36 },
  ]);
});

test('decodeWav: PCM16 stereo round-trip (file) and mono downmix', async () => {
  const frames = 500;
  const samples: number[] = [];
  for (let i = 0; i < frames; i++) {
    samples.push(Math.round(32767 * Math.sin((2 * Math.PI * 50 * i) / 8000)) || 0);
    samples.push(-1000);
  }
  const buf = assembleRiff([
    makeChunk({ id: 'fmt ', payload: makeFmtPayload({ channels: 2, sampleRate: 8000, bitsPerSample: 16 }) }),
    makeChunk({ id: 'data', payload: int16Payload(samples) }),
  ]);
  const file = writeFixture('pcm16-stereo.wav', buf);

  const decoded = await decodeWav(file);
  assert.equal(decoded.sampleRate, 8000);
  assert.equal(decoded.channels, 2);
  assert.equal(decoded.data.length, 2);
  assert.equal(decoded.data[0].length, frames);
  for (let i = 0; i < frames; i++) {
    assert.equal(decoded.data[0][i], samples[i * 2] / 32768);
    assert.equal(decoded.data[1][i], samples[i * 2 + 1] / 32768);
  }

  const maxMsDecoded = await decodeWav(file, { maxMs: 10 });
  assert.equal(maxMsDecoded.data[0].length, 80); // 10 ms @ 8 kHz

  const mono = await decodeWav(file, { mono: true });
  assert.equal(mono.channels, 1);
  assert.equal(mono.data.length, 1);
  assert.equal(mono.data[0].length, frames);
  assert.ok(Math.abs(mono.data[0][0] - (samples[0] / 32768 + -1000 / 32768) / 2) < 1e-9);

  const probed = await probeWav(file);
  assert.equal(probed.frameCount, frames);
  assert.equal(probed.dataBytes, frames * 4);
});

test('decodeWav: 24-bit sign extension', async () => {
  const values = [0x7fffff, 0x800000, 0xffffff, 0x000001, 0x400000, 0x000000];
  const buf = assembleRiff([
    makeChunk({ id: 'fmt ', payload: makeFmtPayload({ channels: 1, sampleRate: 48000, bitsPerSample: 24 }) }),
    makeChunk({ id: 'data', payload: int24Payload(values) }),
  ]);
  const file = writeFixture('pcm24-mono.wav', buf);

  const probe = probeWavBuffer(buf);
  assert.equal(probe.format.bitsPerSample, 24);
  assert.equal(probe.frameCount, values.length);
  assert.equal(probe.unsupportedCodec, false);

  const decoded = await decodeWav(file);
  assert.equal(decoded.data[0].length, values.length);
  assert.equal(decoded.data[0][0], 8388607 / 8388608);
  assert.equal(decoded.data[0][1], -1);
  assert.equal(decoded.data[0][2], -1 / 8388608);
  assert.equal(decoded.data[0][3], 1 / 8388608);
  assert.equal(decoded.data[0][4], 0.5);
  assert.equal(decoded.data[0][5], 0);
});

test('decodeWav: 8-bit unsigned and 32-bit int/float', async () => {
  const pcm8 = assembleRiff([
    makeChunk({ id: 'fmt ', payload: makeFmtPayload({ channels: 1, sampleRate: 8000, bitsPerSample: 8 }) }),
    makeChunk({ id: 'data', payload: Buffer.from([0, 128, 255]) }),
  ]);
  const decoded8 = await decodeWav(writeFixture('pcm8.wav', pcm8));
  assert.equal(decoded8.data[0][0], -1);
  assert.equal(decoded8.data[0][1], 0);
  assert.equal(decoded8.data[0][2], (255 - 128) / 128);

  const pcm32 = assembleRiff([
    makeChunk({ id: 'fmt ', payload: makeFmtPayload({ channels: 1, sampleRate: 8000, bitsPerSample: 32 }) }),
    makeChunk({ id: 'data', payload: int32Payload([-2147483648, 0, 2147483647]) }),
  ]);
  const decoded32 = await decodeWav(writeFixture('pcm32.wav', pcm32));
  assert.equal(decoded32.data[0][0], -1);
  assert.equal(decoded32.data[0][1], 0);
  assert.ok(decoded32.data[0][2] > 0.9999);

  const f32 = assembleRiff([
    makeChunk({
      id: 'fmt ',
      payload: makeFmtPayload({ channels: 1, sampleRate: 8000, bitsPerSample: 32, audioFormat: 3 }),
    }),
    makeChunk({ id: 'data', payload: float32Payload([-0.5, 0.25, 2]) }),
  ]);
  const decodedF32 = await decodeWav(writeFixture('float32.wav', f32));
  assert.equal(decodedF32.data[0][0], -0.5);
  assert.equal(decodedF32.data[0][1], 0.25);
  assert.equal(decodedF32.data[0][2], 1); // clamped into -1..1

  const probeF32 = probeWavBuffer(f32);
  assert.equal(probeF32.format.isFloat, true);
  assert.equal(probeF32.unsupportedCodec, false);
});

function int32Payload(values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) buf.writeInt32LE(values[i], i * 4);
  return buf;
}

/* --------------------------------------------------------------------------------------------
 * extensible format
 * ------------------------------------------------------------------------------------------ */

test('fmt: WAVE_FORMAT_EXTENSIBLE (PCM and IEEE float subformats)', async () => {
  const pcmExt = assembleRiff([
    makeChunk({
      id: 'fmt ',
      payload: makeFmtPayload({
        channels: 2,
        sampleRate: 96000,
        bitsPerSample: 24,
        extensible: true,
        audioFormat: 1,
        channelMask: 0x3,
      }),
    }),
    makeChunk({ id: 'data', payload: int24Payload([1, -1, 2, -2]) }),
  ]);

  const probe = probeWavBuffer(pcmExt);
  assert.equal(probe.format.audioFormat, 0xfffe);
  assert.equal(probe.format.isExtensible, true);
  assert.equal(probe.format.isFloat, false);
  assert.equal(probe.format.channelMask, 3);
  assert.equal(probe.format.bitsPerSample, 24);
  assert.equal(probe.unsupportedCodec, false);

  const decoded = await decodeWav(writeFixture('ext-pcm24.wav', pcmExt));
  assert.equal(decoded.channels, 2);
  assert.equal(decoded.data[0][0], 1 / 8388608);
  assert.equal(decoded.data[1][0], -1 / 8388608);

  const floatExt = assembleRiff([
    makeChunk({
      id: 'fmt ',
      payload: makeFmtPayload({
        channels: 1,
        sampleRate: 48000,
        bitsPerSample: 32,
        extensible: true,
        audioFormat: 3,
        channelMask: 0x4,
      }),
    }),
    makeChunk({ id: 'data', payload: float32Payload([0.5, -0.5]) }),
  ]);
  const floatProbe = probeWavBuffer(floatExt);
  assert.equal(floatProbe.format.isExtensible, true);
  assert.equal(floatProbe.format.isFloat, true);
  assert.equal(floatProbe.format.channelMask, 4);
  assert.equal(floatProbe.unsupportedCodec, false);
  const floatDecoded = await decodeWav(writeFixture('ext-float32.wav', floatExt));
  assert.equal(floatDecoded.data[0][0], 0.5);
  assert.equal(floatDecoded.data[0][1], -0.5);
});

test('fmt: unsupported codec is reported and decode throws', async () => {
  const adpcm = assembleRiff([
    makeChunk({ id: 'fmt ', payload: makeFmtPayload({ channels: 1, sampleRate: 8000, bitsPerSample: 4, audioFormat: 0x11 }) }),
    makeChunk({ id: 'data', payload: Buffer.alloc(16) }),
  ]);
  const probe = probeWavBuffer(adpcm);
  assert.equal(probe.unsupportedCodec, true);
  await assert.rejects(() => decodeWav(writeFixture('adpcm.wav', adpcm)), /Unsupported WAV codec/);
});

test('RIFX: big-endian headers probe but do not decode', async () => {
  const parts = [
    makeChunk({ id: 'fmt ', payload: makeFmtPayload({ channels: 2, sampleRate: 48000, bitsPerSample: 16 }, true) }, true),
    makeChunk({ id: 'data', payload: Buffer.alloc(8) }, true),
  ];
  const buf = assembleRiff(parts, true);

  const probe = probeWavBuffer(buf);
  assert.equal(probe.format.sampleRate, 48000);
  assert.equal(probe.format.channels, 2);
  assert.equal(probe.format.bitsPerSample, 16);
  assert.equal(probe.frameCount, 2);

  await assert.rejects(() => decodeWav(writeFixture('rifx.wav', buf)), /Big-endian/);
});

test('probeWavBuffer: rejects non-WAV input', () => {
  assert.throws(() => probeWavBuffer(Buffer.from('definitely not a wave file')), /Not a WAV file/);
  assert.throws(
    () => probeWavBuffer(assembleRiff([makeChunk({ id: 'JUNK', payload: Buffer.alloc(4) })])),
    /missing "fmt "/,
  );
});

/* --------------------------------------------------------------------------------------------
 * bext
 * ------------------------------------------------------------------------------------------ */

test('bext v2: fields, loudness and coding history', () => {
  const umid = Buffer.alloc(64);
  Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]).copy(umid, 0);
  const bext = bextPayload({
    description: 'Rain take 2',
    originator: 'SoundDesk',
    originatorReference: 'SD-0001',
    originationDate: '2024-05-06',
    originationTime: '07:08:09',
    timeReferenceLow: 123456,
    timeReferenceHigh: 1,
    version: 2,
    umid,
    loudnessValue: -2300,
    codingHistory: 'A=PCM,F=48000,W=24,M=stereo\r\nA=PCM,F=48000,W=24,M=mono',
  });

  const buf = assembleRiff([
    makeChunk({ id: 'fmt ', payload: makeFmtPayload({ channels: 2, sampleRate: 48000, bitsPerSample: 24 }) }),
    makeChunk({ id: 'bext', payload: bext }),
    makeChunk({ id: 'data', payload: Buffer.alloc(12) }),
  ]);

  const probe = probeWavBuffer(buf);
  const parsed = probe.embedded.bext;
  assert.ok(parsed);
  assert.equal(parsed.description, 'Rain take 2');
  assert.equal(parsed.originator, 'SoundDesk');
  assert.equal(parsed.originatorReference, 'SD-0001');
  assert.equal(parsed.originationDate, '2024-05-06');
  assert.equal(parsed.originationTime, '07:08:09');
  assert.equal(parsed.timeReferenceLow, 123456);
  assert.equal(parsed.timeReferenceHigh, 1);
  assert.equal(parsed.version, 2);
  assert.equal(parsed.umid, umid.toString('hex'));
  assert.equal(parsed.loudnessValue, -23);
  assert.deepEqual(parsed.codingHistory, [
    'A=PCM,F=48000,W=24,M=stereo',
    'A=PCM,F=48000,W=24,M=mono',
  ]);
});

test('bext: zero UMID is empty, absent loudness is undefined, short chunk does not throw', () => {
  const full = assembleRiff([
    makeChunk({ id: 'fmt ', payload: makeFmtPayload({ channels: 1, sampleRate: 48000, bitsPerSample: 16 }) }),
    makeChunk({ id: 'bext', payload: bextPayload({ description: 'x', version: 1 }) }),
    makeChunk({ id: 'data', payload: Buffer.alloc(4) }),
  ]);
  const bext1 = probeWavBuffer(full).embedded.bext;
  assert.ok(bext1);
  assert.equal(bext1.umid, '');
  assert.equal(bext1.loudnessValue, undefined);
  assert.deepEqual(bext1.codingHistory, []);

  const truncated = Buffer.alloc(400);
  truncated.write('Short bext', 0, 'latin1');
  truncated.writeUInt32LE(0, 338);
  truncated.writeUInt16LE(1, 346);
  const short = assembleRiff([
    makeChunk({ id: 'fmt ', payload: makeFmtPayload({ channels: 1, sampleRate: 48000, bitsPerSample: 16 }) }),
    makeChunk({ id: 'bext', payload: truncated }),
    makeChunk({ id: 'data', payload: Buffer.alloc(4) }),
  ]);
  const shortBext = probeWavBuffer(short).embedded.bext;
  assert.ok(shortBext);
  assert.equal(shortBext.description, 'Short bext');
  assert.equal(shortBext.version, 1);
});

/* --------------------------------------------------------------------------------------------
 * iXML
 * ------------------------------------------------------------------------------------------ */

test('iXML: nested elements, duplicates, self-closing tags and UCS CatID', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<BWFXML>
  <IXML_VERSION>1.5</IXML_VERSION>
  <PROJECT>MY FILM</PROJECT>
  <SCENE>12A</SCENE>
  <TAKE>3</TAKE>
  <CATEGORY>AMBIENCE</CATEGORY>
  <SUBCATEGORY>RAIN</SUBCATEGORY>
  <NOTE><SUB>a &amp; b</SUB></NOTE>
  <EMPTY/>
  <FILE_SET><TIME>first</TIME></FILE_SET>
  <SYNC><TIME>second</TIME></SYNC>
  <TAPE><SPEED><TIMECODE_RATE>25</TIMECODE_RATE></SPEED></TAPE>
</BWFXML>`;

  const buf = assembleRiff([
    makeChunk({ id: 'fmt ', payload: makeFmtPayload({ channels: 1, sampleRate: 48000, bitsPerSample: 16 }) }),
    makeChunk({ id: 'iXML', payload: Buffer.from(xml, 'utf8') }),
    makeChunk({ id: 'data', payload: Buffer.alloc(4) }),
  ]);

  const probe = probeWavBuffer(buf);
  const ixml = probe.embedded.ixml;
  assert.ok(ixml);
  assert.equal(ixml.PROJECT, 'MY FILM');
  assert.equal(ixml.SCENE, '12A');
  assert.equal(ixml.TAKE, '3');
  assert.equal(ixml.IXML_VERSION, '1.5');
  assert.equal(ixml.SUB, 'a & b');
  assert.equal(ixml['NOTE/SUB'], 'a & b');
  assert.equal(ixml.TIME, 'first'); // duplicated leaf keeps the first occurrence
  assert.equal(ixml['SYNC/TIME'], 'second');
  assert.equal(ixml.TIMECODE_RATE, '25');
  assert.equal(ixml['SPEED/TIMECODE_RATE'], '25');
  assert.equal(ixml.BWFXML, undefined);
  assert.equal(ixml.EMPTY, undefined);
  assert.equal(probe.embedded.ucsCatId, 'AMBIENCERAIN');
});

test('iXML: UTF-8 BOM and non-ASCII text survive', () => {
  const xml = '\uFEFF<BWFXML><NOTE>caf\u00e9 \u2014 8\u00b0</NOTE></BWFXML>';
  const buf = assembleRiff([
    makeChunk({ id: 'fmt ', payload: makeFmtPayload({ channels: 1, sampleRate: 48000, bitsPerSample: 16 }) }),
    makeChunk({ id: 'iXML', payload: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(xml, 'utf8')]) }),
    makeChunk({ id: 'data', payload: Buffer.alloc(4) }),
  ]);
  const ixml = probeWavBuffer(buf).embedded.ixml;
  assert.ok(ixml);
  assert.equal(ixml.NOTE, 'caf\u00e9 \u2014 8\u00b0');
});

/* --------------------------------------------------------------------------------------------
 * LIST / INFO
 * ------------------------------------------------------------------------------------------ */

test('LIST/INFO: ASCII and UTF-16LE payloads, odd-sized tag', () => {
  const infoPayload = Buffer.concat([
    Buffer.from('INFO', 'latin1'),
    makeChunk({ id: 'INAM', payload: Buffer.from('My Recording', 'utf16le') }),
    makeChunk({ id: 'ICMT', payload: Buffer.from('plain ascii comment', 'latin1') }),
    makeChunk({ id: 'ICRD', payload: Buffer.from('2024-', 'latin1') }), // odd size -> padded
    makeChunk({ id: 'ISFT', payload: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('SoundDesk', 'utf16le')]) }),
  ]);

  const buf = assembleRiff([
    makeChunk({ id: 'JUNK', payload: Buffer.from([1, 2, 3]) }), // odd size -> padded
    makeChunk({ id: 'fmt ', payload: makeFmtPayload({ channels: 1, sampleRate: 48000, bitsPerSample: 16 }) }),
    makeChunk({ id: 'LIST', payload: infoPayload }),
    makeChunk({ id: 'data', payload: Buffer.alloc(8) }),
  ]);

  const probe = probeWavBuffer(buf);
  const info = probe.embedded.info;
  assert.ok(info);
  assert.deepEqual(info, {
    INAM: 'My Recording',
    ICMT: 'plain ascii comment',
    ICRD: '2024-',
    ISFT: 'SoundDesk',
  });
  // The odd-sized JUNK chunk must not desynchronize the walker.
  assert.deepEqual(
    probe.chunks.map((c) => c.id),
    ['JUNK', 'fmt', 'LIST', 'data'],
  );
  assert.equal(probe.chunks[0].size, 3);
  assert.equal(probe.frameCount, 4);
  assert.equal(probe.dataBytes, 8);
});

/* --------------------------------------------------------------------------------------------
 * DSP
 * ------------------------------------------------------------------------------------------ */

test('analyzeDsp: 1 kHz sine has a sane centroid and high tonality', () => {
  const sampleRate = 48000;
  const data = [sine(sampleRate / 2, sampleRate, 1000, 0.5)];
  const features = analyzeDsp(data, sampleRate);

  assert.ok(features.peak > 0.49 && features.peak <= 0.5, `peak=${features.peak}`);
  assert.ok(Math.abs(features.rms - 0.5 / Math.SQRT2) < 0.01, `rms=${features.rms}`);
  assert.ok(Math.abs(features.peakDb - 20 * Math.log10(features.peak)) < 1e-9);
  assert.ok(Math.abs(features.rmsDb - 20 * Math.log10(features.rms)) < 1e-9);
  assert.ok(
    features.spectralCentroidHz > 900 && features.spectralCentroidHz < 1100,
    `centroid=${features.spectralCentroidHz}`,
  );
  assert.ok(features.highFrequencyRatio < 0.05, `hf=${features.highFrequencyRatio}`);
  assert.ok(features.tonality > 0.9, `tonality=${features.tonality}`);
  assert.equal(features.stereoCorrelation, 1);
  assert.equal(features.hasVoiceLikeActivity, true);
  assertAllFinite(features as unknown as Record<string, number | boolean>);
});

test('analyzeDsp: white noise is not tonal, is bright and has no speech-like VAD', () => {
  const sampleRate = 48000;
  const random = mulberry32(0xc0ffee);
  const noise = new Float32Array(sampleRate);
  for (let i = 0; i < noise.length; i++) noise[i] = (random() * 2 - 1) * 0.3;

  const features = analyzeDsp([noise], sampleRate);
  assert.ok(features.tonality < 0.4, `tonality=${features.tonality}`);
  assert.ok(features.highFrequencyRatio > 0.5, `hf=${features.highFrequencyRatio}`);
  assert.ok(features.spectralCentroidHz > 5000, `centroid=${features.spectralCentroidHz}`);
  assert.equal(features.hasVoiceLikeActivity, false);
  assert.ok(features.rms > 0.1 && features.rms < 0.25, `rms=${features.rms}`);
  assertAllFinite(features as unknown as Record<string, number | boolean>);
});

test('analyzeDsp: exponential decay yields a plausible decayMs', () => {
  const sampleRate = 48000;
  const frames = sampleRate; // 1 s
  const data = new Float32Array(frames);
  const tau = 0.03;
  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate;
    data[i] = 0.9 * Math.exp(-t / tau) * Math.sin(2 * Math.PI * 1000 * t);
  }

  const features = analyzeDsp([data], sampleRate);
  // exp(-t/0.03) reaches 5% at ~90 ms; the 10 ms measurement window makes 90 ms the answer.
  assert.ok(features.decayMs >= 70 && features.decayMs <= 120, `decayMs=${features.decayMs}`);
  assert.ok(features.decayMs <= 1000, `decayMs=${features.decayMs}`);
  assert.ok(features.tonality > 0.9, `tonality=${features.tonality}`);

  const steady = analyzeDsp([sine(frames, sampleRate, 1000, 0.7)], sampleRate);
  assert.equal(steady.decayMs, 1000); // never decays -> capped at the duration
});

test('analyzeDsp: stereo correlation and degenerate inputs never produce NaN', () => {
  const sampleRate = 48000;
  const left = sine(4800, sampleRate, 440, 0.5);
  const right = sine(4800, sampleRate, 440, 0.5);
  assert.ok(analyzeDsp([left, right], sampleRate).stereoCorrelation > 0.99);

  const inverted = new Float32Array(right.length);
  for (let i = 0; i < right.length; i++) inverted[i] = -right[i];
  assert.ok(analyzeDsp([left, inverted], sampleRate).stereoCorrelation < -0.99);

  const unrelated = new Float32Array(right.length);
  const random = mulberry32(7);
  for (let i = 0; i < unrelated.length; i++) unrelated[i] = (random() * 2 - 1) * 0.5;
  const decorrelated = Math.abs(analyzeDsp([left, unrelated], sampleRate).stereoCorrelation);
  assert.ok(decorrelated < 0.1, `correlation=${decorrelated}`);

  const silence = analyzeDsp([new Float32Array(4800)], sampleRate);
  assert.equal(silence.peak, 0);
  assert.equal(silence.peakDb, -144);
  assert.equal(silence.rmsDb, -144);
  assert.equal(silence.tonality, 0);
  assert.equal(silence.spectralCentroidHz, 0);
  assert.equal(silence.highFrequencyRatio, 0);
  assertAllFinite(silence as unknown as Record<string, number | boolean>);

  const withNaN = new Float32Array(4800);
  withNaN[10] = Number.NaN;
  withNaN[11] = Number.POSITIVE_INFINITY;
  assertAllFinite(analyzeDsp([withNaN], sampleRate) as unknown as Record<string, number | boolean>);

  const empty = analyzeDsp([], sampleRate);
  assert.deepEqual(empty, {
    peak: 0,
    rms: 0,
    peakDb: -144,
    rmsDb: -144,
    decayMs: 0,
    spectralCentroidHz: 0,
    highFrequencyRatio: 0,
    stereoCorrelation: 1,
    hasVoiceLikeActivity: false,
    tonality: 0,
  });
  assert.deepEqual(analyzeDsp([new Float32Array(0)], sampleRate), empty);
});

/* --------------------------------------------------------------------------------------------
 * peaks
 * ------------------------------------------------------------------------------------------ */

test('buildPeaks: bucket min/max, level geometry and serialize round-trip', () => {
  const frames = 5000;
  const data = [sine(frames, 48000, 500, 0.8)];
  const pyramid = buildPeaks(data, { base: 64, sampleRate: 48000 });

  assert.equal(pyramid.sampleRate, 48000);
  assert.equal(pyramid.channels, 1);
  assert.equal(pyramid.levels.length, 4); // 79 -> 10 -> 2 -> 1 buckets
  assert.equal(pyramid.levels[0].samplesPerBucket, 64);
  assert.equal(pyramid.levels[0].buckets, Math.ceil(frames / 64));
  assert.equal(pyramid.levels[0].data.length, Math.ceil(frames / 64) * 2);
  assert.equal(pyramid.levels[1].samplesPerBucket, 512);
  assert.equal(pyramid.levels[1].buckets, Math.ceil(Math.ceil(frames / 64) / 8));
  assert.equal(pyramid.levels[3].buckets, 1);

  // Bucket 0 covers samples 0..63.
  let expectedMin = Infinity;
  let expectedMax = -Infinity;
  for (let i = 0; i < 64; i++) {
    expectedMin = Math.min(expectedMin, data[0][i]);
    expectedMax = Math.max(expectedMax, data[0][i]);
  }
  assert.equal(pyramid.levels[0].data[0], Math.round(expectedMin * 32767));
  assert.equal(pyramid.levels[0].data[1], Math.round(expectedMax * 32767));

  // Every coarse bucket must contain the extremes of its finer children.
  for (let level = 1; level < pyramid.levels.length; level++) {
    const coarse = pyramid.levels[level];
    const fine = pyramid.levels[level - 1];
    assert.equal(coarse.samplesPerBucket, fine.samplesPerBucket * 8);
    for (let b = 0; b < coarse.buckets; b++) {
      const start = b * 8;
      const end = Math.min(fine.buckets, start + 8);
      let min = Infinity;
      let max = -Infinity;
      for (let i = start; i < end; i++) {
        min = Math.min(min, fine.data[i * 2]);
        max = Math.max(max, fine.data[i * 2 + 1]);
      }
      assert.equal(coarse.data[b * 2], min);
      assert.equal(coarse.data[b * 2 + 1], max);
    }
  }

  const packed = serializePeaks(pyramid);
  let expectedBytes = 14;
  for (const level of pyramid.levels) expectedBytes += 12 + level.data.length * 2;
  assert.equal(packed.length, expectedBytes);
  assert.equal(packed.toString('latin1', 0, 4), 'SDPK');
  assert.equal(packed.readUInt16LE(4), 1);

  const restored = deserializePeaks(packed);
  assert.equal(restored.sampleRate, pyramid.sampleRate);
  assert.equal(restored.channels, pyramid.channels);
  assert.equal(restored.levels.length, pyramid.levels.length);
  for (let i = 0; i < pyramid.levels.length; i++) {
    assert.equal(restored.levels[i].samplesPerBucket, pyramid.levels[i].samplesPerBucket);
    assert.equal(restored.levels[i].buckets, pyramid.levels[i].buckets);
    assert.deepEqual(restored.levels[i].data, pyramid.levels[i].data);
  }

  assert.throws(() => deserializePeaks(Buffer.alloc(4)), /shorter than/);
  assert.throws(() => deserializePeaks(Buffer.from('NOPE000000000000', 'latin1')), /bad magic/);
});

test('buildPeaks: multi-channel layout, defaults and empty input', () => {
  const frames = 1000;
  const left = sine(frames, 48000, 300, 0.5);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) right[i] = -left[i];

  const pyramid = buildPeaks([left, right], { sampleRate: 44100 });
  assert.equal(pyramid.channels, 2);
  assert.equal(pyramid.levels[0].samplesPerBucket, 256); // default base
  assert.equal(pyramid.levels.length, 2); // 4 -> 1 bucket
  assert.equal(pyramid.levels[0].data.length, Math.ceil(frames / 256) * 4);

  const bucketOffset = 0;
  assert.equal(pyramid.levels[0].data[bucketOffset], Math.round(Math.min(...left.subarray(0, 256)) * 32767));
  assert.equal(
    pyramid.levels[0].data[bucketOffset + 2],
    Math.round(Math.min(...right.subarray(0, 256)) * 32767),
  );
  assert.deepEqual(deserializePeaks(serializePeaks(pyramid)).levels[0].data, pyramid.levels[0].data);

  const empty = buildPeaks([]);
  assert.equal(empty.channels, 0);
  assert.equal(empty.levels.length, 1);
  assert.equal(empty.levels[0].buckets, 0);
  assert.equal(empty.levels[0].data.length, 0);
  assert.deepEqual(deserializePeaks(serializePeaks(empty)), empty);

  const clamped = buildPeaks([Float32Array.from([2, -2, 0.5])], { base: 2 });
  assert.equal(clamped.levels[0].data[0], -32767);
  assert.equal(clamped.levels[0].data[1], 32767);
});

test('peaksForFile: decodes and builds from a WAV file', async () => {
  const sampleRate = 8000;
  const frames = 4096;
  const samples = int16Sine(frames, sampleRate, 440, 0.6);
  const file = writeFixture(
    'peaks.wav',
    assembleRiff([
      makeChunk({ id: 'fmt ', payload: makeFmtPayload({ channels: 1, sampleRate, bitsPerSample: 16 }) }),
      makeChunk({ id: 'data', payload: int16Payload(samples) }),
    ]),
  );

  const pyramid = await peaksForFile(file, { base: 128 });
  assert.equal(pyramid.sampleRate, sampleRate);
  assert.equal(pyramid.channels, 1);
  assert.equal(pyramid.levels[0].samplesPerBucket, 128);
  assert.equal(pyramid.levels[0].buckets, Math.ceil(frames / 128));

  const probed = await probeWav(file);
  assert.equal(probed.embedded.bext, undefined);
  assert.equal(probed.unsupportedCodec, false);
});

/* --------------------------------------------------------------------------------------------
 * end-to-end file fixture with all metadata
 * ------------------------------------------------------------------------------------------ */

test('probeWav: full BWF file with bext + iXML + INFO + odd chunks', async () => {
  const frames = 2000;
  const samples = int16Sine(frames, 48000, 1000, 0.5);
  const xml = '<BWFXML><PROJECT>E2E</PROJECT><CATEGORY>SFX</CATEGORY><SUBCATEGORY>IMPACT</SUBCATEGORY></BWFXML>';
  const info = Buffer.concat([
    Buffer.from('INFO', 'latin1'),
    makeChunk({ id: 'INAM', payload: Buffer.from('E2E impact', 'latin1') }),
  ]);
  const buf = assembleRiff([
    makeChunk({ id: 'JUNK', payload: Buffer.from([0, 1, 2, 3, 4]) }),
    makeChunk({ id: 'fmt ', payload: makeFmtPayload({ channels: 1, sampleRate: 48000, bitsPerSample: 16 }) }),
    makeChunk({ id: 'bext', payload: bextPayload({ description: 'E2E', originator: 'SoundDesk', version: 2, loudnessValue: -1900 }) }),
    makeChunk({ id: 'iXML', payload: Buffer.from(xml, 'utf8') }),
    makeChunk({ id: 'LIST', payload: info }),
    makeChunk({ id: 'fact', payload: int32Payload([frames]) }),
    makeChunk({ id: 'data', payload: int16Payload(samples) }),
  ]);
  const file = writeFixture('e2e.wav', buf);

  const probe = await probeWav(file);
  assert.equal(probe.format.sampleRate, 48000);
  assert.equal(probe.frameCount, frames);
  assert.equal(probe.embedded.bext?.description, 'E2E');
  assert.equal(probe.embedded.bext?.loudnessValue, -19);
  assert.equal(probe.embedded.info?.INAM, 'E2E impact');
  assert.equal(probe.embedded.ixml?.PROJECT, 'E2E');
  assert.equal(probe.embedded.ucsCatId, 'SFXIMPACT');
  assert.deepEqual(
    probe.chunks.map((c) => c.id),
    ['JUNK', 'fmt', 'bext', 'iXML', 'LIST', 'fact', 'data'],
  );

  const analysis = analyzeDsp((await decodeWav(file)).data, 48000);
  assert.ok(
    analysis.spectralCentroidHz > 800 && analysis.spectralCentroidHz < 1300,
    `centroid=${analysis.spectralCentroidHz}`,
  );
});

/* --------------------------------------------------------------------------------------------
 * temporary fixture files (created inside this package, removed afterwards)
 * ------------------------------------------------------------------------------------------ */

let fixtureDir: string | null = null;

function writeFixture(name: string, contents: Buffer): string {
  if (fixtureDir === null) fixtureDir = mkdtempSync(path.join(PACKAGE_DIR, '.tmp-audio-wav-'));
  const file = path.join(fixtureDir, name);
  writeFileSync(file, contents);
  return file;
}

after(() => {
  if (fixtureDir !== null) {
    rmSync(fixtureDir, { recursive: true, force: true });
    fixtureDir = null;
  }
});
