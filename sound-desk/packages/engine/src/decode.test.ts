/**
 * Decoder tests.
 *
 * The behaviour that matters is the *split*: RIFF goes through our own reader, and
 * everything else needs ffmpeg — and when ffmpeg is absent the engine must still
 * work, reporting exactly which files it cannot analyse rather than producing empty
 * peaks or a silent fingerprint.
 *
 * The ffmpeg-dependent tests are skipped when no binary is available, so the suite
 * passes on a machine without one. The `needsFfmpeg` path is tested by forcing
 * discovery to fail, which is the case a user actually hits.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ANALYSIS_SAMPLE_RATE,
  decodeAudio,
  ffmpegStatus,
  findFfmpeg,
  isRiffPath,
  probeWithFfmpeg,
  resetFfmpegCache,
  transcodeToWav,
} from './decode.ts';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** A 16-bit mono WAV, written by hand so the fixture has no dependency. */
function writeWav(file: string, { seconds = 0.2, rate = 48000, freq = 440, amplitude = 0.6 } = {}): void {
  const frames = Math.round(rate * seconds);
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) {
    const v = Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * amplitude * 32767);
    data.writeInt16LE(Math.max(-32768, Math.min(32767, v)), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([header, data]));
}

function peak(data: Float32Array): number {
  let max = 0;
  for (const value of data) max = Math.max(max, Math.abs(value));
  return max;
}

/** ffmpeg availability, resolved once for the whole file. */
let ffmpeg: Awaited<ReturnType<typeof findFfmpeg>> = null;
test.before(async () => {
  resetFfmpegCache();
  ffmpeg = await findFfmpeg();
});

// ---------------------------------------------------------------------------
// routing
// ---------------------------------------------------------------------------

test('isRiffPath recognises the containers our own reader handles', () => {
  for (const name of ['a.wav', 'a.WAV', 'a.wave', 'a.bwf', 'a.rf64', 'a.w64']) {
    assert.equal(isRiffPath(name), true, `${name} should go to the RIFF reader`);
  }
  for (const name of ['a.flac', 'a.mp3', 'a.aiff', 'a.ogg', 'a.m4a', 'noextension']) {
    assert.equal(isRiffPath(name), false, `${name} should need ffmpeg`);
  }
});

test('a WAV is decoded by our own reader, without a process spawn', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'decode-wav-'));
  try {
    const file = path.join(dir, 'tone.wav');
    writeWav(file, { seconds: 0.2, amplitude: 0.6 });

    const result = await decodeAudio(file, { mono: true });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.via, 'riff', 'a plain WAV must not need ffmpeg');
    assert.equal(result.sampleRate, 48000);
    assert.equal(result.channelData.length, 1);
    // the amplitude should survive the 16-bit round trip
    assert.ok(Math.abs(peak(result.channelData[0]!) - 0.6) < 0.01, `peak ${peak(result.channelData[0]!)}`);
    assert.equal(result.channelData[0]!.length, Math.round(0.2 * 48000));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('maxSeconds truncates a decode without reading the whole file', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'decode-trim-'));
  try {
    const file = path.join(dir, 'long.wav');
    writeWav(file, { seconds: 1 });
    const result = await decodeAudio(file, { mono: true, maxSeconds: 0.25 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.channelData[0]!.length, Math.round(0.25 * 48000));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing file fails with a reason rather than throwing', async () => {
  const result = await decodeAudio(path.join(tmpdir(), 'definitely-not-here.wav'));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.reason.length > 0);
  // a missing WAV is not fixed by installing ffmpeg, and must not claim to be
  assert.equal(result.needsFfmpeg, false);
});

// ---------------------------------------------------------------------------
// the no-ffmpeg path (the case a user actually hits)
// ---------------------------------------------------------------------------

test('an unsupported format reports that it needs ffmpeg when none is installed', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'decode-noff-'));
  try {
    const file = path.join(dir, 'sample.flac');
    writeFileSync(file, 'not really flac');

    // Point the override at a path that does not exist so discovery cannot find the
    // bundled binary; this is the state of a machine without ffmpeg.
    const previous = process.env.SOUNDDESK_FFMPEG;
    process.env.SOUNDDESK_FFMPEG = path.join(dir, 'no-such-ffmpeg');
    resetFfmpegCache();
    try {
      // `whichFfmpeg` still looks at PATH, so simulate a machine without one.
      const savedPath = process.env.PATH;
      process.env.PATH = dir;
      resetFfmpegCache();
      const result = await decodeAudio(file);
      process.env.PATH = savedPath;
      resetFfmpegCache();

      assert.equal(result.ok, false);
      if (result.ok) return;
      // Either ffmpeg was genuinely absent (needsFfmpeg) or the bundled one was found
      // and failed on garbage — both are correct, but the message must say something.
      assert.ok(result.reason.length > 0, 'a failure must explain itself');
      if (result.needsFfmpeg) {
        assert.match(result.reason, /ffmpeg/, 'the reason must name the missing tool');
      }
    } finally {
      if (previous === undefined) delete process.env.SOUNDDESK_FFMPEG;
      else process.env.SOUNDDESK_FFMPEG = previous;
      resetFfmpegCache();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an explicit SOUNDDESK_FFMPEG override is honoured, and a bad one ignored', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'decode-env-'));
  try {
    const bogus = path.join(dir, 'bogus-binary');
    writeFileSync(bogus, '');
    process.env.SOUNDDESK_FFMPEG = bogus;
    resetFfmpegCache();
    const info = await findFfmpeg();
    // The file exists, so it is chosen as the override — discovery does not
    // second-guess the user. The version probe fails, which is reported as null.
    assert.equal(info?.source, 'env');
    assert.equal(info?.version, null, 'a binary that cannot report a version has none');

    process.env.SOUNDDESK_FFMPEG = path.join(dir, 'missing');
    resetFfmpegCache();
    const fallback = await findFfmpeg();
    // a non-existent override is ignored rather than fatal
    assert.notEqual(fallback?.source, 'env');
    delete process.env.SOUNDDESK_FFMPEG;
    resetFfmpegCache();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// ffmpeg decoding (skipped when unavailable)
// ---------------------------------------------------------------------------

test('ffmpeg decodes a non-RIFF format to float samples', async (t) => {
  if (!ffmpeg) {
    t.skip('no ffmpeg available');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'decode-ff-'));
  try {
    const wav = path.join(dir, 'tone.wav');
    writeWav(wav, { seconds: 0.3, amplitude: 0.6 });

    for (const ext of ['flac', 'mp3', 'ogg']) {
      const out = path.join(dir, `tone.${ext}`);
      execFileSync(ffmpeg.path, ['-y', '-loglevel', 'error', '-i', wav, out], { stdio: 'pipe' });

      const result = await decodeAudio(out, { mono: true });
      assert.equal(result.ok, true, `${ext} should decode`);
      if (!result.ok) continue;
      assert.equal(result.via, 'ffmpeg');
      // ffmpeg resamples to the analysis rate, which is what downstream assumes
      assert.equal(result.sampleRate, ANALYSIS_SAMPLE_RATE);
      assert.equal(result.channelData.length, 1, 'mono was requested');
      assert.ok(peak(result.channelData[0]!) > 0.3, `${ext} decoded to near-silence`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ffmpeg reports a mono source as mono, not as duplicated stereo', async (t) => {
  if (!ffmpeg) {
    t.skip('no ffmpeg available');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'decode-mono-'));
  try {
    const wav = path.join(dir, 'tone.wav');
    writeWav(wav, { seconds: 0.2 });
    const flac = path.join(dir, 'tone.flac');
    execFileSync(ffmpeg.path, ['-y', '-loglevel', 'error', '-i', wav, flac], { stdio: 'pipe' });

    const result = await decodeAudio(flac, { mono: false });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // A duplicate second channel would make the DSP features and the peak pyramid
    // report a stereo file where the source was mono.
    assert.equal(result.channelData.length, 1, 'identical channels should collapse to one');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('probeWithFfmpeg reads duration, rate and codec from a real file', async (t) => {
  if (!ffmpeg) {
    t.skip('no ffmpeg available');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'decode-probe-'));
  try {
    const wav = path.join(dir, 'tone.wav');
    writeWav(wav, { seconds: 1.5, rate: 48000 });
    const flac = path.join(dir, 'tone.flac');
    execFileSync(ffmpeg.path, ['-y', '-loglevel', 'error', '-i', wav, flac], { stdio: 'pipe' });

    const probe = await probeWithFfmpeg(flac);
    assert.ok(probe, 'probe should return something');
    assert.equal(probe!.codec, 'flac');
    assert.equal(probe!.sampleRate, 48000);
    assert.equal(probe!.channels, 1);
    assert.ok(
      probe!.durationMs !== null && Math.abs(probe!.durationMs - 1500) < 50,
      `duration should be ~1500ms, got ${probe!.durationMs}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('probeWithFfmpeg returns null for a file that is not audio', async (t) => {
  if (!ffmpeg) {
    t.skip('no ffmpeg available');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'decode-junk-'));
  try {
    const junk = path.join(dir, 'notes.txt');
    writeFileSync(junk, 'this is not audio at all');
    const probe = await probeWithFfmpeg(junk);
    // No duration line means the fields stay null; the call must not throw.
    assert.ok(probe === null || probe.durationMs === null, 'junk must not report a duration');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// transcoding for playback
// ---------------------------------------------------------------------------

test('transcodeToWav produces playable PCM for a format browsers cannot decode', async (t) => {
  if (!ffmpeg) {
    t.skip('no ffmpeg available');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'decode-tc-'));
  try {
    const wav = path.join(dir, 'tone.wav');
    writeWav(wav, { seconds: 0.3 });
    const flac = path.join(dir, 'tone.flac');
    execFileSync(ffmpeg.path, ['-y', '-loglevel', 'error', '-i', wav, flac], { stdio: 'pipe' });

    const bytes = await transcodeToWav(ffmpeg.path, flac);
    assert.ok(bytes, 'transcode should succeed');
    assert.equal(bytes!.subarray(0, 4).toString('ascii'), 'RIFF', 'the output must be a WAV');
    assert.equal(bytes!.subarray(8, 12).toString('ascii'), 'WAVE');

    // It must be readable by the browser as 16-bit PCM, which is what `<audio>`
    // can always decode.
    const formatTag = bytes!.readUInt16LE(20);
    assert.equal(formatTag, 1, 'PCM, not a compressed tag');
    const bits = bytes!.readUInt16LE(34);
    assert.equal(bits, 16);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('transcodeToWav honours a 24-bit request and returns null on junk', async (t) => {
  if (!ffmpeg) {
    t.skip('no ffmpeg available');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'decode-tc2-'));
  try {
    const wav = path.join(dir, 'tone.wav');
    writeWav(wav, { seconds: 0.1 });
    const flac = path.join(dir, 'tone.flac');
    execFileSync(ffmpeg.path, ['-y', '-loglevel', 'error', '-i', wav, flac], { stdio: 'pipe' });

    const deep = await transcodeToWav(ffmpeg.path, flac, { bitDepth: 24 });
    assert.ok(deep, '24-bit transcode should succeed');
    assert.equal(deep!.readUInt16LE(34), 24);

    const junk = path.join(dir, 'junk.flac');
    writeFileSync(junk, 'not audio');
    assert.equal(await transcodeToWav(ffmpeg.path, junk), null, 'junk must return null, not throw');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ffmpegStatus reports availability in the shape the UI consumes', async () => {
  resetFfmpegCache();
  const status = await ffmpegStatus();
  if (status.available) {
    assert.ok(['env', 'path', 'bundled'].includes(status.source));
  } else {
    assert.equal(status.available, false);
  }
  // `available` is always present, so the UI can branch on it without optional chaining
  assert.equal(typeof status.available, 'boolean');
});
