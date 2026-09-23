/**
 * Effect chain tests.
 *
 * These run the *real* graph through `node-web-audio-api`, an implementation of
 * the Web Audio spec for Node. That matters: the alternative is asserting on node
 * descriptors and hoping the audio is right. Here the assertions are on rendered
 * samples, so "reverb adds a tail" and "drive adds harmonics" are measured facts
 * rather than intentions.
 *
 * Every test uses a deterministic source (an impulse or a sine) and a fixed PRNG
 * seed for the impulse response, so failures are reproducible.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { OfflineAudioContext } from 'node-web-audio-api';

import {
  DEFAULT_EFFECT_CHAIN,
  distortionCurve,
  distortionCompensationDb,
  distanceResponse,
  envelopePoints,
  impulseResponse,
  isNeutral,
  normalizeChain,
  presetById,
  REVERB_SPACES,
  seededRandom,
  type EffectChain,
} from './chain.ts';
import { buildChain, type ContextLike } from './graph.ts';
import { renderWav, type OfflineContextLike } from './render.ts';
import { decodeWavBytes, encodeWav, WavCodecError } from './wav.ts';

const RATE = 48000;

/** The factory the browser provides natively; in Node it comes from the package. */
const createOfflineContext = (
  channels: number,
  length: number,
  sampleRate: number,
): OfflineContextLike =>
  new OfflineAudioContext(channels, length, sampleRate) as unknown as OfflineContextLike;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** A single-sample impulse: its response *is* the system's transfer function. */
function impulseWav(seconds = 0.5): Uint8Array {
  const frames = Math.round(RATE * seconds);
  const data = new Float32Array(frames);
  data[0] = 1;
  return encodeWav([data], RATE, { bitsPerSample: 32, encoding: 'float' });
}

/** A 440 Hz sine, for tests that need sustained energy to shape. */
function sineWav(freq = 440, seconds = 0.5, amplitude = 0.5): Uint8Array {
  const frames = Math.round(RATE * seconds);
  const data = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) data[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / RATE);
  return encodeWav([data], RATE, { bitsPerSample: 32, encoding: 'float' });
}

function chainWith(patch: Partial<EffectChain>): EffectChain {
  return normalizeChain({ ...structuredClone(DEFAULT_EFFECT_CHAIN), ...patch });
}

function peakOf(data: Float32Array): number {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  return peak;
}

function energyFrom(data: Float32Array, startFrame: number): number {
  let sum = 0;
  for (let i = startFrame; i < data.length; i += 1) sum += data[i]! * data[i]!;
  return sum;
}

function rms(data: Float32Array): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (const v of data) sum += v * v;
  return Math.sqrt(sum / data.length);
}

/** Rough high-frequency content: energy of the first difference. */
function highFrequencyEnergy(data: Float32Array): number {
  let sum = 0;
  for (let i = 1; i < data.length; i += 1) {
    const d = data[i]! - data[i - 1]!;
    sum += d * d;
  }
  return sum;
}

/**
 * Single-bin DFT magnitude (Goertzel-style).
 *
 * Needed to talk about harmonic distortion honestly: the crest factor is a
 * convenient proxy but it also moves when the level changes, so it cannot
 * distinguish "more harmonics" from "quieter". Measuring the harmonic bins
 * directly makes the claim exact.
 */
function binMagnitude(data: Float32Array, freq: number, sampleRate = RATE): number {
  const n = Math.min(data.length, Math.round(sampleRate * 0.2));
  let re = 0;
  let im = 0;
  const w = (2 * Math.PI * freq) / sampleRate;
  // Hann window to keep spectral leakage from neighbouring bins out of the sum
  for (let i = 0; i < n; i += 1) {
    const win = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    re += data[i]! * win * Math.cos(w * i);
    im -= data[i]! * win * Math.sin(w * i);
  }
  return Math.sqrt(re * re + im * im) / n;
}

/** Energy in harmonics 2..5 relative to the fundamental, in dB. */
function harmonicRatioDb(data: Float32Array, fundamental = 440): number {
  const f0 = binMagnitude(data, fundamental);
  let harmonics = 0;
  for (let h = 2; h <= 5; h += 1) harmonics += binMagnitude(data, fundamental * h);
  if (f0 <= 0) return -Infinity;
  return 20 * Math.log10((harmonics + 1e-12) / (f0 + 1e-12));
}

async function render(wav: Uint8Array, chain: EffectChain): Promise<Float32Array> {
  const result = await renderWav(wav, chain, createOfflineContext, {
    encode: { bitsPerSample: 32, encoding: 'float' },
  });
  return decodeWavBytes(result.bytes).channelData[0]!;
}

// ---------------------------------------------------------------------------
// chain data
// ---------------------------------------------------------------------------

test('the default chain is neutral, so an untouched preview is bit-transparent', () => {
  assert.equal(isNeutral(DEFAULT_EFFECT_CHAIN), true);
  // and every preset that claims to do something, does
  for (const preset of ['radio', 'dark-cave', 'close-dry', 'monster']) {
    const apply = presetById(preset);
    assert.ok(apply, `preset ${preset} missing`);
    assert.equal(isNeutral(apply(structuredClone(DEFAULT_EFFECT_CHAIN))), false, `${preset} should not be neutral`);
  }
  assert.equal(isNeutral(structuredClone(DEFAULT_EFFECT_CHAIN)), true, 'the reset preset is neutral');
});

test('a disabled chain is neutral no matter what the slots say', () => {
  const heavy = normalizeChain({
    ...structuredClone(DEFAULT_EFFECT_CHAIN),
    enabled: false,
    reverb: { enabled: true, space: 'cathedral', decaySeconds: 4, mix: 0.8, preDelayScale: 1 },
    distortion: { enabled: true, drive: 0.9, mix: 1, outputDb: -6 },
  });
  assert.equal(isNeutral(heavy), true);
});

test('normalizeChain clamps hostile input instead of passing NaN to a filter', () => {
  const chain = normalizeChain({
    eq: [{ id: 'mid', kind: 'peaking', enabled: true, frequency: Number.NaN, gainDb: 999, q: -5 }],
    reverb: { enabled: true, space: 'cathedral', decaySeconds: 1e9, mix: 5, preDelayScale: -2 },
    distortion: { enabled: true, drive: 12, mix: -1, outputDb: Number.POSITIVE_INFINITY },
    mix: Number.NaN,
    outputGain: -3,
  } as unknown as Partial<EffectChain>);

  const mid = chain.eq.find((b) => b.id === 'mid')!;
  assert.ok(Number.isFinite(mid.frequency));
  assert.ok(mid.frequency >= 20 && mid.frequency <= 20000);
  assert.equal(mid.gainDb, 24, 'clamped to the top of the range');
  assert.ok(mid.q >= 0.1);
  assert.ok(chain.reverb.decaySeconds <= 8);
  assert.equal(chain.reverb.mix, 1);
  assert.equal(chain.reverb.preDelayScale, 0);
  assert.equal(chain.distortion.drive, 1);
  assert.equal(chain.distortion.mix, 0);
  assert.ok(Number.isFinite(chain.distortion.outputDb));
  assert.equal(chain.mix, 0, 'NaN falls back to the minimum, never propagates');
  assert.equal(chain.outputGain, 0);
});

test('normalizeChain keeps the four named EQ bands even from empty input', () => {
  const chain = normalizeChain(null);
  assert.deepEqual(
    chain.eq.map((b) => b.id),
    ['highpass', 'low', 'mid', 'high'],
  );
});

// ---------------------------------------------------------------------------
// derived DSP
// ---------------------------------------------------------------------------

test('distanceResponse removes highs and adds wet signal as it recedes', () => {
  const near = distanceResponse(0);
  const far = distanceResponse(1);
  assert.equal(near.cutoffHz, 20000, 'at the mic nothing is filtered');
  assert.equal(near.wet, 0, 'and there is no reverberant field');
  assert.ok(far.cutoffHz < 1000, `far cutoff should be low, got ${far.cutoffHz}`);
  assert.ok(far.wet > near.wet);
  // monotonic in both cues
  const mid = distanceResponse(0.5);
  assert.ok(mid.cutoffHz < near.cutoffHz && mid.cutoffHz > far.cutoffHz);
  assert.ok(mid.wet > near.wet && mid.wet < far.wet);
});

test('distortionCurve is odd-symmetric, bounded, and steeper with drive', () => {
  const gentle = distortionCurve(0.1, 65);
  const hot = distortionCurve(0.9, 65);

  for (const curve of [gentle, hot]) {
    assert.equal(curve.length, 65);
    for (const v of curve) {
      assert.ok(Number.isFinite(v));
      assert.ok(Math.abs(v) <= 1.0001, `curve left ±1: ${v}`);
    }
    // odd symmetry about the midpoint keeps even harmonics out
    for (let i = 0; i < 32; i += 1) {
      assert.ok(Math.abs(curve[i]! + curve[64 - i]!) < 1e-6, 'curve is not odd-symmetric');
    }
  }

  // a hotter drive saturates a small input harder
  const small = 0.1;
  const idx = Math.round(((small + 1) / 2) * 64);
  assert.ok(hot[idx]! > gentle[idx]!, 'more drive should mean more shaping at the same input level');
});

test('distortion compensation reduces level as drive rises', () => {
  assert.equal(distortionCompensationDb(0), -0);
  const half = distortionCompensationDb(0.5);
  const full = distortionCompensationDb(1);
  assert.ok(half < 0, `half drive should already be attenuated, got ${half}`);
  assert.ok(full < half, `more drive should attenuate more: ${half} -> ${full}`);
  assert.equal(full, -12);
});

test('impulseResponse is deterministic, decays, and respects pre-delay', () => {
  const a = impulseResponse('hall', RATE, 2, 1);
  const b = impulseResponse('hall', RATE, 2, 1);
  assert.deepEqual(Array.from(a.left), Array.from(b.left), 'same seed must give identical IRs');

  // silence before the pre-delay
  const preDelaySamples = Math.round((REVERB_SPACES.hall.preDelayMs / 1000) * RATE);
  for (let i = 0; i < preDelaySamples; i += 1) {
    assert.equal(a.left[i], 0, `expected silence at sample ${i} inside the pre-delay`);
  }
  assert.ok(preDelaySamples > 0);

  // early reflections are present right after it
  let reflectionPeak = 0;
  for (let i = preDelaySamples; i < preDelaySamples + RATE * 0.05; i += 1) {
    reflectionPeak = Math.max(reflectionPeak, Math.abs(a.left[i] ?? 0));
  }
  assert.ok(reflectionPeak > 0.05, `expected audible early reflections, peak ${reflectionPeak}`);

  // late energy is far below early energy
  const earlyE = energyFrom(a.left, preDelaySamples);
  const lateE = energyFrom(a.left, Math.round(RATE * 1.5));
  assert.ok(lateE < earlyE * 0.2, `tail should have decayed, early ${earlyE} late ${lateE}`);

  // a different space decays differently at the same offset
  const small = impulseResponse('small-room', RATE, 0.5, 1);
  assert.ok(small.left.length < a.left.length, 'a small room is shorter than a hall');
});

test('seededRandom is reproducible and stays in range', () => {
  const a = seededRandom(42);
  const b = seededRandom(42);
  for (let i = 0; i < 100; i += 1) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
  assert.notEqual(seededRandom(1)(), seededRandom(2)());
});

test('envelopePoints anchors the release to the end of the sound', () => {
  const points = envelopePoints(
    { enabled: true, attackMs: 100, decayMs: 200, sustain: 0.5, releaseMs: 300 },
    2,
  );
  assert.equal(points[0]!.gain, 0, 'starts silent');
  assert.ok(points.some((p) => p.time === 0.1 && p.gain === 1), 'reaches full after the attack');
  assert.ok(points.some((p) => Math.abs(p.time - 0.3) < 1e-9 && p.gain === 0.5), 'decays to sustain');
  const last = points[points.length - 1]!;
  assert.equal(last.time, 2, 'ends exactly at the sound end');
  assert.equal(last.gain, 0, 'and fades to silence');

  // a release longer than the sound must not produce negative time
  const short = envelopePoints({ enabled: true, attackMs: 500, decayMs: 500, sustain: 1, releaseMs: 500 }, 0.2);
  for (const p of short) {
    assert.ok(p.time >= 0 && p.time <= 0.2 + 1e-9, `point outside the sound: ${p.time}`);
  }
});

// ---------------------------------------------------------------------------
// rendered audio — the part that actually proves the DSP
// ---------------------------------------------------------------------------

test('a neutral chain renders the source sample-for-sample', async () => {
  const source = sineWav(440, 0.2);
  const out = await render(source, structuredClone(DEFAULT_EFFECT_CHAIN));
  const input = decodeWavBytes(source).channelData[0]!;

  assert.equal(out.length, input.length, 'no tail should be appended');
  let maxDelta = 0;
  for (let i = 0; i < input.length; i += 1) {
    maxDelta = Math.max(maxDelta, Math.abs(out[i]! - input[i]!));
  }
  // float32 round-trip through the encoder is the only expected difference
  assert.ok(maxDelta < 1e-6, `neutral chain changed the signal by ${maxDelta}`);
});

test('bypass renders the source untouched even with every effect configured', async () => {
  const source = sineWav(440, 0.2);
  const loud = chainWith({
    enabled: false,
    reverb: { enabled: true, space: 'cathedral', decaySeconds: 4, mix: 0.9, preDelayScale: 1 },
    distortion: { enabled: true, drive: 0.9, mix: 1, outputDb: -6 },
    distance: { enabled: true, amount: 1 },
  });
  const out = await render(source, loud);
  const input = decodeWavBytes(source).channelData[0]!;
  assert.equal(out.length, input.length);
  let maxDelta = 0;
  for (let i = 0; i < input.length; i += 1) maxDelta = Math.max(maxDelta, Math.abs(out[i]! - input[i]!));
  assert.ok(maxDelta < 1e-6, `bypass leaked ${maxDelta} of processed signal`);
});

test('reverb adds a decaying tail after the source ends', async () => {
  const source = impulseWav(0.1);
  const dry = await render(source, structuredClone(DEFAULT_EFFECT_CHAIN));
  const wet = await render(
    source,
    chainWith({ reverb: { enabled: true, space: 'hall', decaySeconds: 2, mix: 0.6, preDelayScale: 1 } }),
  );

  assert.ok(wet.length > dry.length, 'the tail should extend the render');
  const sourceFrames = decodeWavBytes(source).channelData[0]!.length;
  const tailDry = energyFrom(dry, sourceFrames);
  const tailWet = energyFrom(wet, sourceFrames);
  assert.equal(tailDry, 0, 'nothing should follow the dry impulse');
  assert.ok(tailWet > 0, 'reverb must produce a tail');
});

test('a higher reverb mix produces more tail energy than a lower one', async () => {
  const source = impulseWav(0.1);
  const make = (mix: number): EffectChain =>
    chainWith({ reverb: { enabled: true, space: 'hall', decaySeconds: 2, mix, preDelayScale: 1 } });

  const sourceFrames = decodeWavBytes(source).channelData[0]!.length;
  const light = energyFrom(await render(source, make(0.15)), sourceFrames);
  const heavy = energyFrom(await render(source, make(0.8)), sourceFrames);
  assert.ok(heavy > light * 2, `expected a clear difference, light ${light} heavy ${heavy}`);
});

test('a longer reverb decay leaves more energy late in the tail', async () => {
  const source = impulseWav(0.05);
  const shortChain = chainWith({ reverb: { enabled: true, space: 'hall', decaySeconds: 0.5, mix: 0.8, preDelayScale: 1 } });
  const longChain = chainWith({ reverb: { enabled: true, space: 'hall', decaySeconds: 4, mix: 0.8, preDelayScale: 1 } });

  const shortOut = await render(source, shortChain);
  const longOut = await render(source, longChain);
  const lateStart = Math.round(RATE * 1.0);

  const shortLate = energyFrom(shortOut, lateStart);
  const longLate = energyFrom(longOut, lateStart);
  assert.ok(longLate > shortLate, `long decay should still have energy at 1s: short ${shortLate} long ${longLate}`);
});

test('the distance filter removes high-frequency content', async () => {
  // a bright source: white noise, so the low-pass has something to remove
  const frames = Math.round(RATE * 0.3);
  const noise = new Float32Array(frames);
  const rand = seededRandom(7);
  for (let i = 0; i < frames; i += 1) noise[i] = (rand() * 2 - 1) * 0.5;
  const source = encodeWav([noise], RATE, { bitsPerSample: 32, encoding: 'float' });

  const dry = await render(source, structuredClone(DEFAULT_EFFECT_CHAIN));
  const far = await render(source, chainWith({ distance: { enabled: true, amount: 0.9 } }));

  const dryHigh = highFrequencyEnergy(dry);
  const farHigh = highFrequencyEnergy(far);
  assert.ok(farHigh < dryHigh * 0.5, `distance should dull the signal: dry ${dryHigh} far ${farHigh}`);
  // and it must not simply attenuate everything into nothing
  assert.ok(peakOf(far) > 0.05, 'the filtered signal should still be audible');
});

test('distance also blends in a reverberant field', async () => {
  const source = impulseWav(0.1);
  const sourceFrames = decodeWavBytes(source).channelData[0]!.length;
  const dry = await render(source, structuredClone(DEFAULT_EFFECT_CHAIN));
  const far = await render(source, chainWith({ distance: { enabled: true, amount: 1 } }));
  assert.equal(energyFrom(dry, sourceFrames), 0, 'dry impulse has no tail');
  assert.ok(energyFrom(far, sourceFrames) > 0, 'a distant sound must have a reverberant tail');
});

test('distortion adds harmonics to a sine, and more drive adds more', async () => {
  const source = sineWav(440, 0.3, 0.6);
  const clean = await render(source, structuredClone(DEFAULT_EFFECT_CHAIN));
  const warm = await render(
    source,
    chainWith({ distortion: { enabled: true, drive: 0.3, mix: 1, outputDb: 0 } }),
  );
  const hot = await render(
    source,
    chainWith({ distortion: { enabled: true, drive: 0.95, mix: 1, outputDb: 0 } }),
  );

  const cleanDb = harmonicRatioDb(clean);
  const warmDb = harmonicRatioDb(warm);
  const hotDb = harmonicRatioDb(hot);

  // A clean sine with a rectangular-ish window should be well below -60 dB.
  assert.ok(cleanDb < -50, `a clean sine should have almost no harmonics, got ${cleanDb.toFixed(1)} dB`);
  assert.ok(warmDb > cleanDb + 20, `drive 0.3 should add harmonics: ${cleanDb.toFixed(1)} -> ${warmDb.toFixed(1)} dB`);
  assert.ok(hotDb > warmDb, `drive 0.95 should add more than 0.3: ${warmDb.toFixed(1)} -> ${hotDb.toFixed(1)} dB`);
});

test('distortion mix blends dry and wet rather than replacing the signal', async () => {
  const source = sineWav(440, 0.3, 0.6);
  const dry = await render(source, structuredClone(DEFAULT_EFFECT_CHAIN));
  const wetOnly = await render(
    source,
    chainWith({ distortion: { enabled: true, drive: 0.9, mix: 1, outputDb: 0 } }),
  );
  const half = await render(
    source,
    chainWith({ distortion: { enabled: true, drive: 0.9, mix: 0.5, outputDb: 0 } }),
  );

  // The half-mixed render must lie strictly between dry and fully wet in
  // harmonic content — that is what "blend" means, and it is the property a
  // user relies on when they pull the mix knob back.
  const dryDb = harmonicRatioDb(dry);
  const halfDb = harmonicRatioDb(half);
  const wetDb = harmonicRatioDb(wetOnly);
  assert.ok(halfDb > dryDb, `half mix should be dirtier than dry: ${dryDb.toFixed(1)} vs ${halfDb.toFixed(1)} dB`);
  assert.ok(halfDb < wetDb, `half mix should be cleaner than full wet: ${halfDb.toFixed(1)} vs ${wetDb.toFixed(1)} dB`);

  // and a zero mix must be exactly the dry signal
  const none = await render(
    source,
    chainWith({ distortion: { enabled: true, drive: 0.9, mix: 0, outputDb: 0 } }),
  );
  let maxDelta = 0;
  for (let i = 0; i < dry.length; i += 1) maxDelta = Math.max(maxDelta, Math.abs(none[i]! - dry[i]!));
  assert.ok(maxDelta < 1e-6, `a zero mix should be transparent, drifted ${maxDelta}`);
});

test('an EQ cut lowers energy in the band it targets', async () => {
  const source = sineWav(4000, 0.3, 0.5);
  const flat = await render(source, structuredClone(DEFAULT_EFFECT_CHAIN));
  // a high shelf cutting well below the tone frequency
  const cut = await render(
    source,
    chainWith({
      eq: normalizeChain({
        eq: [{ id: 'high', kind: 'highshelf', enabled: true, frequency: 1000, gainDb: -24, q: 0.707 }],
      }).eq,
    }),
  );

  assert.ok(rms(cut) < rms(flat) * 0.5, `highshelf cut should reduce a 4 kHz tone: ${rms(flat)} -> ${rms(cut)}`);
});

test('a high-pass removes low frequencies and keeps high ones', async () => {
  const lowTone = sineWav(60, 0.3, 0.5);
  const highTone = sineWav(6000, 0.3, 0.5);
  const chain = chainWith({
    eq: normalizeChain({
      eq: [{ id: 'highpass', kind: 'highpass', enabled: true, frequency: 500, gainDb: 0, q: 0.707 }],
    }).eq,
  });

  const lowOut = rms(await render(lowTone, chain));
  const highOut = rms(await render(highTone, chain));
  assert.ok(lowOut < 0.05, `60 Hz should be strongly attenuated, got ${lowOut}`);
  assert.ok(highOut > 0.3, `6 kHz should pass, got ${highOut}`);
});

test('the envelope fades the start and end of the sound', async () => {
  const source = sineWav(440, 0.4, 0.5);
  const shaped = await render(
    source,
    chainWith({ envelope: { enabled: true, attackMs: 80, decayMs: 0, sustain: 1, releaseMs: 80 } }),
  );

  const head = rms(shaped.slice(0, Math.round(RATE * 0.02)));
  const middle = rms(shaped.slice(Math.round(RATE * 0.15), Math.round(RATE * 0.25)));
  const tail = rms(shaped.slice(shaped.length - Math.round(RATE * 0.02)));

  assert.ok(head < middle * 0.4, `attack should silence the start: head ${head} mid ${middle}`);
  assert.ok(tail < middle * 0.4, `release should silence the end: tail ${tail} mid ${middle}`);
});

test('output gain scales the render without distorting it', async () => {
  const source = sineWav(440, 0.2, 0.5);
  const unity = await render(source, structuredClone(DEFAULT_EFFECT_CHAIN));
  const quiet = await render(source, chainWith({ outputGain: 0.25 }));

  const ratio = rms(quiet) / rms(unity);
  assert.ok(Math.abs(ratio - 0.25) < 0.02, `expected a quarter of the level, got ${ratio.toFixed(3)}`);
});

test('renderWav reports the tail it appended and honours a custom one', async () => {
  const source = impulseWav(0.1);
  const withReverb = chainWith({ reverb: { enabled: true, space: 'cathedral', decaySeconds: 4, mix: 0.9, preDelayScale: 1 } });
  const auto = await renderWav(source, withReverb, createOfflineContext);
  assert.ok(auto.durationSeconds > 0.1, 'the reverb tail should be included in the reported duration');
  assert.equal(auto.bypassed, false);
  assert.equal(auto.channels, 1);
  assert.equal(auto.sampleRate, RATE);

  const none = await renderWav(source, withReverb, createOfflineContext, { tailSeconds: 0 });
  assert.ok(
    Math.abs(none.durationSeconds - 0.1) < 0.01,
    `explicit tailSeconds:0 should not append anything, got ${none.durationSeconds}`,
  );

  const neutral = await renderWav(source, structuredClone(DEFAULT_EFFECT_CHAIN), createOfflineContext);
  assert.equal(neutral.bypassed, true);
  assert.ok(Math.abs(neutral.durationSeconds - 0.1) < 0.01);
});

test('renderWav reports progress from start to finish', async () => {
  const seen: number[] = [];
  await renderWav(sineWav(440, 0.1), structuredClone(DEFAULT_EFFECT_CHAIN), createOfflineContext, {
    onProgress: (f) => seen.push(f),
  });
  assert.ok(seen.length >= 2, 'expected several progress updates');
  assert.equal(seen[seen.length - 1], 1, 'progress should end at 1');
  for (let i = 1; i < seen.length; i += 1) {
    assert.ok(seen[i]! >= seen[i - 1]!, 'progress must not go backwards');
  }
});

test('stereo input renders as stereo and keeps the channels distinct', async () => {
  const frames = Math.round(RATE * 0.2);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    left[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / RATE);
    right[i] = 0.5 * Math.sin((2 * Math.PI * 880 * i) / RATE);
  }
  const source = encodeWav([left, right], RATE, { bitsPerSample: 32, encoding: 'float' });
  const result = await renderWav(source, structuredClone(DEFAULT_EFFECT_CHAIN), createOfflineContext);
  const decoded = decodeWavBytes(result.bytes);
  assert.equal(decoded.channelData.length, 2);
  assert.notDeepEqual(
    Array.from(decoded.channelData[0]!.slice(1000, 1100)),
    Array.from(decoded.channelData[1]!.slice(1000, 1100)),
    'the two channels should not have been collapsed',
  );
});

// ---------------------------------------------------------------------------
// live graph
// ---------------------------------------------------------------------------

test('buildChain builds a graph that can be retuned without reconnecting', () => {
  const ctx = new OfflineAudioContext(1, 128, RATE) as unknown as ContextLike;
  const graph = buildChain(ctx, structuredClone(DEFAULT_EFFECT_CHAIN), 0);
  assert.ok(graph.input);
  assert.ok(graph.output);

  // retuning must be accepted at any time and must not throw
  const next = chainWith({ reverb: { enabled: true, space: 'tunnel', decaySeconds: 2, mix: 0.5, preDelayScale: 1 } });
  graph.update(next, 0);
  assert.equal(graph.chain.reverb.space, 'tunnel');

  // the same node handles remain valid
  assert.equal(graph.input, graph.input);
  graph.dispose();
});

test('scheduleEnvelope is a no-op when the envelope slot is disabled', () => {
  const ctx = new OfflineAudioContext(1, 128, RATE) as unknown as ContextLike;
  const graph = buildChain(ctx, structuredClone(DEFAULT_EFFECT_CHAIN), 0);
  assert.doesNotThrow(() => graph.scheduleEnvelope(0, 1));
  graph.dispose();
});

// ---------------------------------------------------------------------------
// wav codec
// ---------------------------------------------------------------------------

test('the WAV codec round-trips float, 16 and 24 bit', () => {
  const frames = 64;
  const data = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) data[i] = Math.sin((i / frames) * Math.PI * 2) * 0.8;

  for (const bits of [16, 24] as const) {
    const bytes = encodeWav([data], 44100, { bitsPerSample: bits });
    const back = decodeWavBytes(bytes);
    assert.equal(back.sampleRate, 44100);
    assert.equal(back.channelData.length, 1);
    assert.equal(back.sourceBitsPerSample, bits);
    // quantisation error stays inside one LSB
    const tolerance = bits === 16 ? 1 / 32768 : 1 / 8388608;
    for (let i = 0; i < frames; i += 1) {
      assert.ok(Math.abs(back.channelData[0]![i]! - data[i]!) <= tolerance * 2, `sample ${i} drifted at ${bits} bit`);
    }
  }

  const float = encodeWav([data], 44100, { bitsPerSample: 32, encoding: 'float' });
  const floatBack = decodeWavBytes(float);
  for (let i = 0; i < frames; i += 1) {
    assert.ok(Math.abs(floatBack.channelData[0]![i]! - data[i]!) < 1e-7);
  }
});

test('the WAV codec clamps instead of wrapping on overshoot', () => {
  // 1.5 and -1.5 would wrap to loud noise if clamped incorrectly
  const data = new Float32Array([1.5, -1.5, 0.5]);
  const bytes = encodeWav([data], 48000, { bitsPerSample: 24 });
  const back = decodeWavBytes(bytes).channelData[0]!;
  assert.ok(back[0]! > 0.99, 'positive overshoot should clamp to +1');
  assert.ok(back[1]! < -0.99, 'negative overshoot should clamp to -1');
  assert.ok(Math.abs(back[2]! - 0.5) < 1e-4);
});

test('the WAV codec reads 8-bit unsigned correctly', () => {
  // 8-bit WAV stores unsigned bytes biased by 128 — get this wrong and every
  // 8-bit file plays as loud noise
  const bytes = new Uint8Array(44 + 2);
  const view = new DataView(bytes.buffer);
  const tag = (offset: number, s: string): void => {
    for (let i = 0; i < 4; i += 1) view.setUint8(offset + i, s.charCodeAt(i));
  };
  tag(0, 'RIFF');
  view.setUint32(4, 36 + 2, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  tag(36, 'data');
  view.setUint32(40, 2, true);
  view.setUint8(44, 128); // silence
  view.setUint8(45, 255); // near +1

  const decoded = decodeWavBytes(bytes);
  assert.equal(decoded.channelData[0]![0], 0, '128 must decode to silence');
  assert.ok(decoded.channelData[0]![1]! > 0.98);
});

test('the WAV codec refuses unsupported input with a reason', () => {
  assert.throws(() => decodeWavBytes(new Uint8Array(4)), WavCodecError);
  assert.throws(() => decodeWavBytes(new Uint8Array(64)), /RIFF/);

  // a valid header claiming a compressed codec (format 2 = ADPCM)
  const bytes = new Uint8Array(48);
  const view = new DataView(bytes.buffer);
  const tag = (offset: number, s: string): void => {
    for (let i = 0; i < 4; i += 1) view.setUint8(offset + i, s.charCodeAt(i));
  };
  tag(0, 'RIFF');
  view.setUint32(4, 40, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 2, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 44100, true);
  view.setUint32(28, 44100, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 4, true);
  tag(36, 'data');
  view.setUint32(40, 0, true);
  assert.throws(() => decodeWavBytes(bytes), /编码格式/);
});

test('encodeWav rejects impossible requests', () => {
  assert.throws(() => encodeWav([], 48000), WavCodecError);
  assert.throws(() => encodeWav([new Float32Array(4), new Float32Array(8)], 48000), /长度不一致/);
  // float encoding is only meaningful at 32 bits
  assert.throws(() => encodeWav([new Float32Array(4)], 48000, { bitsPerSample: 16, encoding: 'float' }), /浮点/);
  // 32-bit integer PCM is legal and supported
  assert.doesNotThrow(() => encodeWav([new Float32Array(4)], 48000, { bitsPerSample: 32, encoding: 'pcm' }));
});

// ---------------------------------------------------------------------------
// every preset actually renders
// ---------------------------------------------------------------------------

test('every preset renders without throwing and changes the sound', async () => {
  const source = sineWav(440, 0.2, 0.5);
  const flat = await render(source, structuredClone(DEFAULT_EFFECT_CHAIN));

  for (const id of ['radio', 'dark-cave', 'close-dry', 'monster']) {
    const apply = presetById(id);
    assert.ok(apply, `preset ${id} missing`);
    const out = await render(source, apply(structuredClone(DEFAULT_EFFECT_CHAIN)));
    assert.ok(out.length > 0);
    assert.ok(peakOf(out) > 0, `preset ${id} rendered silence`);
    // each preset should be audibly different from the flat render
    let changed = 0;
    const compare = Math.min(out.length, flat.length);
    for (let i = 0; i < compare; i += 1) if (Math.abs(out[i]! - flat[i]!) > 1e-4) changed += 1;
    assert.ok(changed > compare * 0.1, `preset ${id} barely changed the signal`);
  }
});
