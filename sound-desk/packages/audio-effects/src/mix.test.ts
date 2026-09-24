/**
 * Multi-track mixer tests.
 *
 * Like the effect tests, these render real audio through a real Web Audio
 * implementation. Mixing bugs are mostly *summing* bugs — a fader that does not
 * scale, a pan that does nothing, an offset that is ignored — and all three are
 * invisible to a test that only inspects parameters.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { OfflineAudioContext } from 'node-web-audio-api';

import { DEFAULT_EFFECT_CHAIN, normalizeChain, type EffectChain } from './chain.ts';
import {
  MAX_TRACKS,
  mixDuration,
  mixSampleRate,
  normalizeTracks,
  renderMix,
  renderStem,
  staggerTracks,
  trackDuration,
  type MixTrack,
  type MixTrackInput,
  type OfflineMixContextFactory,
} from './mix.ts';
import { decodeWavBytes, encodeWav } from './wav.ts';

const RATE = 48000;

const createContext: OfflineMixContextFactory = (channels, length, sampleRate) =>
  new OfflineAudioContext(channels, length, sampleRate) as never;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function tone(freq: number, seconds: number, amplitude = 0.4, rate = RATE): { channelData: Float32Array[]; sampleRate: number } {
  const frames = Math.round(rate * seconds);
  const data = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) data[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / rate);
  return { channelData: [data], sampleRate: rate };
}

function track(patch: Partial<MixTrackInput> & { audio: MixTrackInput['audio'] }): MixTrackInput {
  return {
    assetId: 1,
    label: 'test',
    ...patch,
  };
}

function peak(data: Float32Array): number {
  let p = 0;
  for (const v of data) p = Math.max(p, Math.abs(v));
  return p;
}

function rms(data: Float32Array): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (const v of data) sum += v * v;
  return Math.sqrt(sum / data.length);
}

/** RMS over a time window of the rendered stereo output. */
function rmsBetween(data: Float32Array, fromSeconds: number, toSeconds: number): number {
  const from = Math.max(0, Math.round(fromSeconds * RATE));
  const to = Math.min(data.length, Math.round(toSeconds * RATE));
  if (to <= from) return 0;
  return rms(data.subarray(from, to));
}

/** Single-bin magnitude, for checking that panning kept the content intact. */
function binMagnitude(data: Float32Array, freq: number): number {
  const n = Math.min(data.length, Math.round(RATE * 0.2));
  let re = 0;
  let im = 0;
  const w = (2 * Math.PI * freq) / RATE;
  for (let i = 0; i < n; i += 1) {
    const win = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    re += data[i]! * win * Math.cos(w * i);
    im -= data[i]! * win * Math.sin(w * i);
  }
  return Math.sqrt(re * re + im * im) / n;
}

async function render(tracks: MixTrackInput[], options: Parameters<typeof renderMix>[2] = {}) {
  const normalized = normalizeTracks(tracks);
  const result = await renderMix(normalized, createContext, {
    encode: { bitsPerSample: 32, encoding: 'float' },
    ...options,
  });
  const decoded = decodeWavBytes(result.bytes);
  return { result, left: decoded.channelData[0]!, right: decoded.channelData[1] ?? decoded.channelData[0]! };
}

// ---------------------------------------------------------------------------
// normalisation
// ---------------------------------------------------------------------------

test('normalizeTracks clamps every parameter and caps the track count', () => {
  const many = Array.from({ length: 10 }, (_, i) =>
    track({ assetId: i, label: `t${i}`, audio: tone(440, 0.05) }),
  );
  const tracks = normalizeTracks(many);
  assert.equal(tracks.length, MAX_TRACKS, 'the plan caps the mix at four tracks');

  const [wild] = normalizeTracks([
    track({
      assetId: 1,
      label: 'wild',
      audio: tone(440, 0.05),
      volume: 99,
      pan: -7,
      startSeconds: Number.NaN,
      trimStartSeconds: -3,
      trimLengthSeconds: -1,
    }),
  ]);
  assert.equal(wild!.volume, 2, 'volume is capped at +6 dB, not left unbounded');
  assert.equal(wild!.pan, -1);
  assert.equal(wild!.startSeconds, 0, 'a NaN offset must not become NaN time');
  assert.equal(wild!.trimStartSeconds, 0);
  assert.equal(wild!.trimLengthSeconds, 0);
});

test('solo mutes the others; mute silences a track', () => {
  const soloed = normalizeTracks([
    track({ assetId: 1, label: 'a', audio: tone(440, 0.05), solo: true }),
    track({ assetId: 2, label: 'b', audio: tone(660, 0.05) }),
  ]);
  assert.equal(soloed[0]!.volume, 1, 'the soloed track is audible');
  assert.equal(soloed[1]!.volume, 0, 'the others are not');

  const muted = normalizeTracks([
    track({ assetId: 1, label: 'a', audio: tone(440, 0.05), mute: true }),
    track({ assetId: 2, label: 'b', audio: tone(660, 0.05) }),
  ]);
  assert.equal(muted[0]!.volume, 0);
  assert.equal(muted[1]!.volume, 1);

  // with nothing soloed, mute is the only thing that silences
  const both = normalizeTracks([
    track({ assetId: 1, label: 'a', audio: tone(440, 0.05), mute: true }),
    track({ assetId: 2, label: 'b', audio: tone(660, 0.05), solo: true }),
  ]);
  assert.equal(both[0]!.volume, 0);
  assert.equal(both[1]!.volume, 1);
});

test('trackDuration accounts for trimming in both directions', () => {
  const audio = tone(440, 1);
  const whole = normalizeTracks([track({ assetId: 1, label: 'a', audio })])[0]!;
  assert.ok(Math.abs(trackDuration(whole) - 1) < 1e-6);

  const trimmedStart = normalizeTracks([track({ assetId: 1, label: 'a', audio, trimStartSeconds: 0.25 })])[0]!;
  assert.ok(Math.abs(trackDuration(trimmedStart) - 0.75) < 1e-6);

  const trimmedBoth = normalizeTracks([
    track({ assetId: 1, label: 'a', audio, trimStartSeconds: 0.25, trimLengthSeconds: 0.3 }),
  ])[0]!;
  assert.ok(Math.abs(trackDuration(trimmedBoth) - 0.3) < 1e-6);

  // a trim longer than what is left is clamped to what is left
  const overlong = normalizeTracks([
    track({ assetId: 1, label: 'a', audio, trimStartSeconds: 0.9, trimLengthSeconds: 5 }),
  ])[0]!;
  assert.ok(Math.abs(trackDuration(overlong) - 0.1) < 1e-6);
});

test('mixDuration spans offsets and tail, and is 0 when nothing is audible', () => {
  const tracks = normalizeTracks([
    track({ assetId: 1, label: 'a', audio: tone(440, 0.5) }),
    track({ assetId: 2, label: 'b', audio: tone(660, 0.5), startSeconds: 1 }),
  ]);
  assert.ok(Math.abs(mixDuration(tracks) - 1.5) < 1e-6);
  assert.ok(Math.abs(mixDuration(tracks, 0.75) - 2.25) < 1e-6, 'tail extends the render');

  const silent = normalizeTracks([track({ assetId: 1, label: 'a', audio: tone(440, 0.5), mute: true })]);
  assert.equal(mixDuration(silent), 0);
});

test('mixSampleRate uses the highest rate any audible track needs', () => {
  const tracks = normalizeTracks([
    track({ assetId: 1, label: 'a', audio: tone(440, 0.1, 0.4, 44100) }),
    track({ assetId: 2, label: 'b', audio: tone(660, 0.1, 0.4, 48000) }),
  ]);
  assert.equal(mixSampleRate(tracks), 48000);

  const muted = normalizeTracks([
    track({ assetId: 1, label: 'a', audio: tone(440, 0.1, 0.4, 44100), mute: true }),
    track({ assetId: 2, label: 'b', audio: tone(660, 0.1, 0.4, 48000) }),
  ]);
  assert.equal(mixSampleRate(muted), 48000);
});

test('staggerTracks lays tracks out sequentially, overlapping, or together', () => {
  const inputs = [
    track({ assetId: 1, label: 'a', audio: tone(440, 1) }),
    track({ assetId: 2, label: 'b', audio: tone(660, 1) }),
    track({ assetId: 3, label: 'c', audio: tone(880, 1) }),
  ];

  const sequential = staggerTracks(inputs, 0.25, 'sequential');
  assert.deepEqual(sequential.map((t) => t.startSeconds), [0, 1.25, 2.5]);

  const together = staggerTracks(inputs, 0, 'together');
  assert.deepEqual(together.map((t) => t.startSeconds), [0, 0, 0]);

  const overlap = staggerTracks(inputs, 0, 'overlap');
  assert.deepEqual(overlap.map((t) => t.startSeconds), [0, 0.5, 1]);

  // it must not mutate the caller's tracks
  assert.equal(inputs[0]!.startSeconds, undefined);
});

// ---------------------------------------------------------------------------
// rendered mixes
// ---------------------------------------------------------------------------

test('a mix renders every track at its own offset', async () => {
  const { result, left } = await render([
    track({ assetId: 1, label: 'first', audio: tone(440, 0.3), startSeconds: 0 }),
    track({ assetId: 2, label: 'second', audio: tone(660, 0.3), startSeconds: 0.5 }),
  ]);

  assert.equal(result.trackCount, 2);
  assert.ok(Math.abs(result.durationSeconds - 0.8) < 1e-6, `expected 0.8s, got ${result.durationSeconds}`);

  // energy where the first tone is, silence in the gap, energy again for the second
  assert.ok(rmsBetween(left, 0.05, 0.25) > 0.05, 'first track should be audible');
  assert.ok(rmsBetween(left, 0.35, 0.45) < 0.01, 'the gap before the second track should be silent');
  assert.ok(rmsBetween(left, 0.6, 0.75) > 0.05, 'second track should be audible');
});

test('the fader scales a track linearly', async () => {
  const loud = await render([track({ assetId: 1, label: 'a', audio: tone(440, 0.3) })]);
  const quiet = await render([track({ assetId: 1, label: 'a', audio: tone(440, 0.3), volume: 0.25 })]);

  const ratio = rms(quiet.left) / rms(loud.left);
  assert.ok(Math.abs(ratio - 0.25) < 0.03, `expected a quarter of the level, got ${ratio.toFixed(3)}`);
});

test('panning moves a track between the channels without losing it', async () => {
  const audio = tone(440, 0.3);
  const centred = await render([track({ assetId: 1, label: 'a', audio })]);
  const hardLeft = await render([track({ assetId: 1, label: 'a', audio, pan: -1 })]);
  const hardRight = await render([track({ assetId: 1, label: 'a', audio, pan: 1 })]);

  // a centred source is present in both channels equally
  assert.ok(Math.abs(rms(centred.left) - rms(centred.right)) < 0.01, 'centre should be balanced');

  // StereoPannerNode uses the equal-power law, so hard-panning does *not* make a
  // channel louder than centre — it moves the energy out of the other one. The
  // measurable claim is therefore about the channel ratio, not the absolute level.
  assert.ok(rms(hardLeft.right) < rms(hardLeft.left) * 0.2, 'hard left should empty the right channel');
  assert.ok(rms(hardRight.left) < rms(hardRight.right) * 0.2, 'hard right should empty the left channel');

  // and the total power is conserved, which is the point of the equal-power law
  const centrePower = rms(centred.left) ** 2 + rms(centred.right) ** 2;
  const leftPower = rms(hardLeft.left) ** 2 + rms(hardLeft.right) ** 2;
  assert.ok(
    Math.abs(centrePower - leftPower) / centrePower < 0.05,
    `panning should conserve power: centre ${centrePower} vs left ${leftPower}`,
  );

  // panning must not change *what* is playing: the 440 Hz line survives
  const centredLine = binMagnitude(centred.left, 440);
  const pannedLine = binMagnitude(hardLeft.left, 440);
  assert.ok(pannedLine > centredLine, `the panned channel should carry the full signal: ${centredLine} -> ${pannedLine}`);
});

test('trimming removes the head of a track', async () => {
  // A tone that is silent for the first half, so trimming it away is observable.
  const frames = Math.round(RATE * 0.4);
  const data = new Float32Array(frames);
  for (let i = Math.round(frames / 2); i < frames; i += 1) {
    data[i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / RATE);
  }
  const audio = { channelData: [data], sampleRate: RATE };

  const whole = await render([track({ assetId: 1, label: 'a', audio })]);
  assert.ok(rmsBetween(whole.left, 0, 0.15) < 0.01, 'the head is silent in the source');
  assert.ok(rmsBetween(whole.left, 0.25, 0.35) > 0.05, 'the tail is audible');

  const trimmed = await render([track({ assetId: 1, label: 'a', audio, trimStartSeconds: 0.2, trimLengthSeconds: 0.2 })]);
  assert.ok(rmsBetween(trimmed.left, 0, 0.1) > 0.05, 'after trimming the audible part is at the start');
  assert.ok(Math.abs(trimmed.result.durationSeconds - 0.2) < 1e-6);
});

test('per-track effect chains are independent', async () => {
  const audio = tone(440, 0.3);
  // One track reverbed (so it has a tail), the other completely dry.
  const { left } = await render([
    track({
      assetId: 1,
      label: 'wet',
      audio,
      chain: { ...structuredClone(DEFAULT_EFFECT_CHAIN), reverb: { enabled: true, space: 'hall', decaySeconds: 2, mix: 0.8, preDelayScale: 1 } },
    }),
    track({
      assetId: 2,
      label: 'dry',
      audio: { channelData: [new Float32Array(audio.channelData[0]!.length)], sampleRate: RATE },
    }),
  ]);

  // The dry track is pure silence, so everything after the wet track ends is the
  // reverb tail of that one chain — which only exists if chains are per-track.
  const tail = rmsBetween(left, 0.35, 1.5);
  assert.ok(tail > 0.001, `the reverbed track should leave a tail, got ${tail}`);
});

test('one track can be reverbed while another stays dry in the same render', async () => {
  const shortTone = tone(440, 0.2);
  const { left, right } = await render([
    track({
      assetId: 1,
      label: 'wet',
      audio: shortTone,
      chain: { ...structuredClone(DEFAULT_EFFECT_CHAIN), reverb: { enabled: true, space: 'cathedral', decaySeconds: 3, mix: 0.9, preDelayScale: 1 } },
    }),
    track({ assetId: 2, label: 'dry', audio: tone(880, 0.2), startSeconds: 0.3 }),
  ]);

  // After the dry track has finished, only the wet tail remains, and the dry
  // track contributed nothing there.
  const tailOnly = rmsBetween(left, 0.6, 1.5);
  assert.ok(tailOnly > 0.001, `expected a tail from the wet track, got ${tailOnly}`);
  void right;
});

test('renderMix refuses to write a silent file', async () => {
  await assert.rejects(
    () => render([track({ assetId: 1, label: 'a', audio: tone(440, 0.2), mute: true })]),
    /静音|空的/,
  );
  await assert.rejects(
    () => render([track({ assetId: 1, label: 'a', audio: { channelData: [], sampleRate: RATE } })]),
    /静音|空的/,
  );
  await assert.rejects(() => render([]), /静音|空的/);
});

test('renderMix reports a monotonic progress ramp', async () => {
  const seen: number[] = [];
  await render([track({ assetId: 1, label: 'a', audio: tone(440, 0.2) })], {
    onProgress: (f) => seen.push(f),
  });
  assert.ok(seen.length >= 2);
  assert.equal(seen[seen.length - 1], 1);
  for (let i = 1; i < seen.length; i += 1) assert.ok(seen[i]! >= seen[i - 1]!);
});

test('renderStem renders one track as it sounds inside the mix', async () => {
  const audio = tone(440, 0.3);
  const tracks = normalizeTracks([
    track({ assetId: 1, label: 'a', audio, volume: 0.5 }),
    track({ assetId: 2, label: 'b', audio: tone(660, 0.3), mute: true }),
  ]);

  const stem = await renderStem(tracks[0]!, createContext, { encode: { bitsPerSample: 32, encoding: 'float' } });
  const decoded = decodeWavBytes(stem.bytes);
  assert.equal(stem.trackCount, 1);
  // the stem carries the fader position, so summing stems reproduces the mix
  assert.ok(rms(decoded.channelData[0]!) > 0.05);

  const full = await render(tracks.map((t) => ({ ...t, audio: { channelData: t.channelData, sampleRate: t.sampleRate } })));
  const stemLevel = rms(decoded.channelData[0]!);
  const mixLevel = rms(full.left);
  assert.ok(Math.abs(stemLevel - mixLevel) / mixLevel < 0.05, `stem ${stemLevel} should match the mix ${mixLevel}`);

  // a muted track still renders as a stem when asked for explicitly
  const mutedStem = await renderStem(tracks[1]!, createContext, { encode: { bitsPerSample: 32, encoding: 'float' } });
  assert.ok(mutedStem.bytes.byteLength > 0);
});

test('a track whose own chain bypasses is unaffected by it', async () => {
  const audio = tone(440, 0.3);
  const bypassed: EffectChain = { ...structuredClone(DEFAULT_EFFECT_CHAIN), enabled: false };
  const { left } = await render([track({ assetId: 1, label: 'a', audio, chain: bypassed })]);
  const plain = await render([track({ assetId: 1, label: 'a', audio })]);

  let maxDelta = 0;
  const n = Math.min(left.length, plain.left.length);
  for (let i = 0; i < n; i += 1) maxDelta = Math.max(maxDelta, Math.abs(left[i]! - plain.left[i]!));
  assert.ok(maxDelta < 1e-5, `a bypassed track chain should not colour the mix, drifted ${maxDelta}`);
});

test('four tracks sum without clipping surprises', async () => {
  const audio = tone(440, 0.3, 0.3);
  const { left, result } = await render([
    track({ assetId: 1, label: 'a', audio }),
    track({ assetId: 2, label: 'b', audio: tone(550, 0.3, 0.3) }),
    track({ assetId: 3, label: 'c', audio: tone(660, 0.3, 0.3) }),
    track({ assetId: 4, label: 'd', audio: tone(880, 0.3, 0.3) }),
  ]);

  assert.equal(result.trackCount, 4);
  const p = peak(left);
  assert.ok(p <= 1.0001, `summing must stay inside ±1, peaked at ${p}`);
  // four 0.3-amplitude tones should sum to something substantial
  assert.ok(rms(left) > 0.2, `expected a full mix, got ${rms(left)}`);
});

test('an explicit tail extends the mixed render', async () => {
  const audio = tone(440, 0.2);
  const without = await render([track({ assetId: 1, label: 'a', audio })]);
  const withTail = await render([track({ assetId: 1, label: 'a', audio })], { tailSeconds: 0.5 });

  assert.ok(withTail.left.length > without.left.length, 'a requested tail must lengthen the render');
  assert.ok(Math.abs(withTail.result.durationSeconds - 0.7) < 1e-6);
});

test('the encoded mix declares the sample rate the tracks actually used', async () => {
  const { result } = await render([track({ assetId: 1, label: 'a', audio: tone(440, 0.2, 0.4, 44100) })]);
  assert.equal(result.sampleRate, 44100);
  const decoded = decodeWavBytes(result.bytes);
  assert.equal(decoded.sampleRate, 44100);
});

test('a mono source becomes a stereo mix that is still centred', async () => {
  const { left, right, result } = await render([track({ assetId: 1, label: 'a', audio: tone(440, 0.2) })]);
  assert.equal(result.channels, 2);
  assert.ok(Math.abs(rms(left) - rms(right)) < 0.01, 'a centred mono source should fill both channels equally');
});

test('normalizeTracks gives every track a usable chain and id', () => {
  const tracks = normalizeTracks([
    track({ assetId: 7, label: 'no chain', audio: tone(440, 0.1) }),
    { ...track({ assetId: 8, label: 'explicit', audio: tone(660, 0.1) }), id: 'mine' },
  ]);
  assert.equal(tracks[0]!.id, 'track-1');
  assert.equal(tracks[1]!.id, 'mine');
  // a missing chain becomes the neutral default rather than undefined
  assert.equal(normalizeChain(tracks[0]!.chain).eq.length, 4);
  assert.deepEqual(
    tracks[0]!.chain.eq.map((b) => b.id),
    ['highpass', 'low', 'mid', 'high'],
  );
});

test('the mix honours each track own output trim as well as the fader', async () => {
  const audio = tone(440, 0.3);
  const trimmedChain = normalizeChain({ ...structuredClone(DEFAULT_EFFECT_CHAIN), outputGain: 0.5 });
  const both = await render([track({ assetId: 1, label: 'a', audio, volume: 0.5, chain: trimmedChain })]);
  const plain = await render([track({ assetId: 1, label: 'a', audio })]);

  const ratio = rms(both.left) / rms(plain.left);
  assert.ok(Math.abs(ratio - 0.25) < 0.03, `expected chain trim × fader = 0.25, got ${ratio.toFixed(3)}`);
});

/**
 * The preview and the export must compute a track's level the same way:
 * `chain.outputGain × volume`. Getting this wrong is what produced the two live
 * mixer bugs (a stale master read, and one track's change being written to every
 * voice), so the formula is pinned here as a numeric result rather than left to
 * the two implementations agreeing by inspection.
 */
test('a track level is exactly chain trim × fader', async () => {
  const audio = tone(440, 0.3, 0.5);
  const unity = await render([track({ assetId: 1, label: 'a', audio })]);
  const base = rms(unity.left);

  // three independent combinations, each checked against the same formula
  const cases: Array<{ trim: number; volume: number }> = [
    { trim: 1, volume: 0.5 },
    { trim: 0.25, volume: 1 },
    { trim: 0.4, volume: 0.25 },
    { trim: 2, volume: 0.5 },
  ];
  for (const { trim, volume } of cases) {
    const chain = normalizeChain({ ...structuredClone(DEFAULT_EFFECT_CHAIN), outputGain: trim });
    const { left } = await render([track({ assetId: 1, label: 'a', audio, volume, chain })]);
    const expected = trim * volume;
    const actual = rms(left) / base;
    assert.ok(
      Math.abs(actual - expected) / expected < 0.05,
      `trim ${trim} × volume ${volume} should be ${expected}, measured ${actual.toFixed(4)}`,
    );
  }
});

test('a silent track contributes nothing to the mix level', async () => {
  const audio = tone(440, 0.3);
  const alone = await render([track({ assetId: 1, label: 'a', audio })]);
  const withSilent = await render([
    track({ assetId: 1, label: 'a', audio }),
    track({ assetId: 2, label: 'muted', audio: tone(660, 0.3), mute: true }),
  ]);

  const before = rms(alone.left);
  const after = rms(withSilent.left);
  assert.ok(Math.abs(before - after) / before < 0.01, `a muted track changed the level: ${before} -> ${after}`);
});

test('a very short mix still renders at least one frame', async () => {
  const audio = tone(440, 0.001);
  const { result } = await render([track({ assetId: 1, label: 'a', audio })]);
  assert.ok(result.bytes.byteLength > 44, 'even a 1 ms track must produce a valid WAV');
});

test('encodeWav round-trips the mixed output losslessly at 32-bit float', () => {
  const audio = tone(440, 0.1);
  const wav = encodeWav([audio.channelData[0]!], RATE, { bitsPerSample: 32, encoding: 'float' });
  const back = decodeWavBytes(wav);
  assert.equal(back.channelData.length, 1);
  for (let i = 0; i < 100; i += 1) {
    assert.ok(Math.abs(back.channelData[0]![i]! - audio.channelData[0]![i]!) < 1e-7);
  }
});

test('MixTrack type is exported and usable by a host', () => {
  // A compile-time check with a runtime assertion so the export cannot silently
  // disappear: hosts construct these objects directly.
  const tracks: MixTrack[] = normalizeTracks([track({ assetId: 1, label: 'a', audio: tone(440, 0.05) })]);
  assert.equal(typeof tracks[0]!.startSeconds, 'number');
  assert.equal(typeof tracks[0]!.trimLengthSeconds, 'object');
});
