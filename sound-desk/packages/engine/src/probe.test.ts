/**
 * Probe / slice tests.
 *
 * The parts worth testing on their own are the ones that decide whether a reference
 * clip is usable and how a selection is cut out of a file. The service as a whole
 * needs a model and an index, so those paths are covered by the engine e2e test; here
 * the pure logic is pinned, including the security-relevant bit — a crafted upload
 * name must not be able to steer the scratch path.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  MAX_PROBE_SECONDS,
  ProbeError,
  assessProbe,
  extensionOf,
  mixToMono,
  probeScratchPath,
  sliceChannels,
} from './probe.ts';

function tone(freq: number, seconds: number, sampleRate = 48000, amplitude = 0.5): Float32Array {
  const frames = Math.round(seconds * sampleRate);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

// ---------------------------------------------------------------------------
// extension handling
// ---------------------------------------------------------------------------

test('extensionOf reads a plausible extension and defaults to wav', () => {
  assert.equal(extensionOf('reference.flac'), '.flac');
  assert.equal(extensionOf('Reference.MP3'), '.mp3');
  assert.equal(extensionOf(undefined), '.wav', 'an unnamed upload should be tried as RIFF first');
  assert.equal(extensionOf('noextension'), '.wav');
  assert.equal(extensionOf('trailing.'), '.wav');
  // a bogus long "extension" is not one, so the default applies
  assert.equal(extensionOf('weird.notanextension'), '.wav');
});

// ---------------------------------------------------------------------------
// scratch path (untrusted input)
// ---------------------------------------------------------------------------

test('the scratch path cannot be steered outside the probe directory', () => {
  const dataDir = path.join('C:', 'data');
  const cases = [
    '../../../../etc/passwd',
    '..\\..\\Windows\\System32\\evil.wav',
    '/absolute/path.wav',
    'a/b/../../../escape.wav',
    'C:\\Windows\\evil.wav',
  ];
  for (const filename of cases) {
    const scratch = probeScratchPath(dataDir, filename, extensionOf(filename));
    const probeDir = path.join(dataDir, 'probe');
    assert.ok(
      scratch.startsWith(probeDir + path.sep),
      `${filename} produced ${scratch}, which is outside ${probeDir}`,
    );
    // and the result is a file in that directory, not a nested path
    assert.equal(path.dirname(scratch), probeDir);
  }
});

test('a probe path keeps a usable extension so the decoder can route it', () => {
  const scratch = probeScratchPath('C:/data', 'reference.flac', '.flac');
  assert.ok(scratch.endsWith('.flac'), scratch);
  // an unnamed probe still gets the default extension
  assert.ok(probeScratchPath('C:/data', undefined, '.wav').endsWith('.wav'));
  // a name that already carries the extension is not doubled
  assert.equal(probeScratchPath('C:/data', 'a.wav', '.wav').includes('a.wav.wav'), false);
});

test('two probes in the same millisecond do not collide in practice', () => {
  const a = probeScratchPath('C:/data', 'x.wav', '.wav');
  const b = probeScratchPath('C:/data', 'y.wav', '.wav');
  assert.notEqual(a, b, 'the name is part of the path, so different uploads differ');
});

// ---------------------------------------------------------------------------
// assessing a reference clip
// ---------------------------------------------------------------------------

test('assessProbe reports duration, channels and peak', () => {
  const preview = assessProbe({ channelData: [tone(440, 2)], sampleRate: 48000 });
  assert.ok(Math.abs(preview.durationSeconds - 2) < 1e-6);
  assert.equal(preview.sampleRate, 48000);
  assert.equal(preview.channels, 1);
  assert.ok(Math.abs(preview.peak - 0.5) < 0.01);
  assert.deepEqual(preview.warnings, [], 'a normal 2s clip should warn about nothing');
});

test('assessProbe warns instead of refusing, so the user can still try', () => {
  // Too short to fill CLAP's window.
  const short = assessProbe({ channelData: [tone(440, 0.1)], sampleRate: 48000 });
  assert.equal(short.warnings.length, 1);
  assert.match(short.warnings[0]!, /太短/);

  // Longer than the accepted maximum: warned, not rejected — the caller truncates.
  const long = assessProbe({ channelData: [tone(440, MAX_PROBE_SECONDS + 5)], sampleRate: 48000 });
  assert.match(long.warnings.join(' '), /超过/);

  // Silent: the most confusing failure, because "no results" looks like a search
  // problem rather than an input problem.
  const silent = assessProbe({ channelData: [new Float32Array(48000)], sampleRate: 48000 });
  assert.match(silent.warnings.join(' '), /静音/);
  assert.equal(silent.peak, 0);
});

test('assessProbe handles an empty decode without dividing by zero', () => {
  const empty = assessProbe({ channelData: [], sampleRate: 48000 });
  assert.equal(empty.durationSeconds, 0);
  assert.equal(empty.channels, 0);
  assert.equal(empty.peak, 0);
  assert.ok(empty.warnings.length > 0, 'an empty clip must warn');
});

// ---------------------------------------------------------------------------
// slicing
// ---------------------------------------------------------------------------

test('sliceChannels takes the requested window', () => {
  const channel = tone(440, 2, 1000); // 2000 frames at 1 kHz, so indices are milliseconds
  const sliced = sliceChannels([channel], 1000, 0.5, 0.25);
  assert.equal(sliced.channelData[0]!.length, 250);
  // the first sample of the slice is the sample at 0.5s
  assert.equal(sliced.channelData[0]![0], channel[500]);
});

test('sliceChannels applies the window to every channel', () => {
  const left = tone(440, 1, 1000);
  const right = tone(660, 1, 1000);
  const sliced = sliceChannels([left, right], 1000, 0.2, 0.3);
  assert.equal(sliced.channelData.length, 2);
  assert.equal(sliced.channelData[0]!.length, 300);
  assert.equal(sliced.channelData[1]!.length, 300);
  assert.equal(sliced.channelData[1]![0], right[200]);
});

test('sliceChannels to the end when no duration is given', () => {
  const channel = tone(440, 1, 1000);
  const sliced = sliceChannels([channel], 1000, 0.75, undefined);
  assert.equal(sliced.channelData[0]!.length, 250);
});

test('sliceChannels clamps rather than throwing on an out-of-range window', () => {
  const channel = tone(440, 1, 1000);

  // start beyond the end: empty, and the caller turns that into a clear error
  const past = sliceChannels([channel], 1000, 5, 0.1);
  assert.equal(past.channelData[0]!.length, 0);

  // duration longer than what remains: clamped to the end
  const overlong = sliceChannels([channel], 1000, 0.9, 10);
  assert.equal(overlong.channelData[0]!.length, 100);

  // negative offset is treated as the start
  const negative = sliceChannels([channel], 1000, -1, 0.1);
  assert.equal(negative.channelData[0]!.length, 100);
});

test('sliceChannels reports the sample rate unchanged', () => {
  assert.equal(sliceChannels([tone(440, 0.1, 44100)], 44100, 0, 0.05).sampleRate, 44100);
});

// ---------------------------------------------------------------------------
// mono mixing
// ---------------------------------------------------------------------------

test('mixToMono averages channels and never aliases the input', () => {
  const left = new Float32Array([1, 0, -1, 0]);
  const right = new Float32Array([0, 1, 0, -1]);
  const mono = mixToMono([left, right]);
  assert.equal(mono.length, 4);
  assert.deepEqual(Array.from(mono), [0.5, 0.5, -0.5, -0.5]);
  // a fresh array: mutating it must not reach back into the source
  mono[0] = 99;
  assert.equal(left[0], 1);
});

test('mixToMono passes a single channel straight through', () => {
  const only = tone(440, 0.01);
  assert.equal(mixToMono([only]), only, 'one channel is already mono; copying would be wasted work');
});

test('mixToMono handles channels of unequal length', () => {
  const long = new Float32Array([1, 1, 1, 1]);
  const short = new Float32Array([1, 1]);
  const mono = mixToMono([long, short]);
  // The shortest channel bounds the result, because a missing sample must not be
  // invented as silence — that would fade the tail.
  assert.equal(mono.length, 2);
  assert.deepEqual(Array.from(mono), [1, 1]);
});

test('ProbeError carries an HTTP status for the route to pass through', () => {
  assert.equal(new ProbeError('x').status, 400);
  assert.equal(new ProbeError('x', 501).status, 501);
  assert.equal(new ProbeError('x', 413).message, 'x');
});
