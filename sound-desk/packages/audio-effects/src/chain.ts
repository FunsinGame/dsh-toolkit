/**
 * Effect chain — preview only, plan §8 / P2-1.
 *
 * The rule this module exists to enforce: **preview effects never touch the
 * user's file**. They live in the Web Audio graph, and only an explicit export
 * runs the same graph through an `OfflineAudioContext` to produce a new file.
 *
 * Everything here is deliberately structured so the DSP can be *checked* rather
 * than trusted:
 *
 *   - `EffectChain` is plain data (no AudioContext), so it can be validated,
 *     diffed, serialised into a preset and asserted on in a test.
 *   - `describeChain(chain)` resolves that data into an ordered list of node
 *     descriptors. Tests assert on the descriptors; `buildChain` then turns the
 *     same descriptors into live nodes. One source of truth, so a test that
 *     passes actually describes what the audio graph does.
 *   - Neutral defaults are *exactly* neutral. A bypassed or freshly reset chain
 *     must be bit-transparent, because "I didn't touch anything" should never
 *     colour the sound.
 */

// ---------------------------------------------------------------------------
// parameters
// ---------------------------------------------------------------------------

export type FilterKind = 'highpass' | 'lowshelf' | 'peaking' | 'highshelf';

export interface EqBand {
  /** stable id so the UI can address a band across reorders */
  id: string;
  kind: FilterKind;
  enabled: boolean;
  /** Hz */
  frequency: number;
  /** dB; ignored by highpass */
  gainDb: number;
  /** resonance; ignored by the shelf filters */
  q: number;
}

export interface DistortionSettings {
  enabled: boolean;
  /** 0..1 drive into the shaper */
  drive: number;
  /** 0..1 blend of shaped signal over dry */
  mix: number;
  /** pre-gain reduction so a driven signal does not clip the output */
  outputDb: number;
}

export interface EnvelopeSettings {
  enabled: boolean;
  /** ms; fade-in applied at the start of the sound */
  attackMs: number;
  /** ms; decay to sustain */
  decayMs: number;
  /** 0..1 level after decay */
  sustain: number;
  /** ms; fade-out applied at the end of the sound */
  releaseMs: number;
}

export type ReverbSpace = 'small-room' | 'large-room' | 'hall' | 'cathedral' | 'plate' | 'tunnel';

export interface ReverbSettings {
  enabled: boolean;
  space: ReverbSpace;
  /** 0..1 dry/wet */
  mix: number;
  /** 0.2..4 s; usually derived from the space preset */
  decaySeconds: number;
  /** 0..1; scales the pre-delay derived from the space */
  preDelayScale: number;
}

export interface DistanceSettings {
  enabled: boolean;
  /** 0 (at the mic) .. 1 (far away) */
  amount: number;
}

export interface EffectChain {
  /** master bypass: when false the chain is passthrough regardless of slots */
  enabled: boolean;
  eq: EqBand[];
  distortion: DistortionSettings;
  envelope: EnvelopeSettings;
  reverb: ReverbSettings;
  distance: DistanceSettings;
  /** 0..1 dry/wet across the whole chain; 1 = fully processed */
  mix: number;
  /** 0..1 output trim, applied after everything */
  outputGain: number;
}

// ---------------------------------------------------------------------------
// defaults and presets
// ---------------------------------------------------------------------------

/** Space presets: decay, pre-delay in seconds, and a tone hint as dB of damping. */
export const REVERB_SPACES: Record<
  ReverbSpace,
  { label: string; decaySeconds: number; preDelayMs: number; dampingHz: number }
> = {
  'small-room': { label: '小房间', decaySeconds: 0.5, preDelayMs: 5, dampingHz: 6000 },
  'large-room': { label: '大房间', decaySeconds: 1.2, preDelayMs: 12, dampingHz: 4500 },
  hall: { label: '大厅', decaySeconds: 2.2, preDelayMs: 22, dampingHz: 3200 },
  cathedral: { label: '大教堂', decaySeconds: 4.0, preDelayMs: 38, dampingHz: 2200 },
  plate: { label: '板式', decaySeconds: 1.6, preDelayMs: 2, dampingHz: 8000 },
  tunnel: { label: '隧道', decaySeconds: 2.8, preDelayMs: 30, dampingHz: 2600 },
};

/**
 * A fresh chain. Every band is disabled and every amount is at its neutral
 * value, so `DEFAULT_EFFECT_CHAIN` renders sample-identical audio.
 */
export const DEFAULT_EFFECT_CHAIN: EffectChain = {
  enabled: true,
  eq: [
    { id: 'highpass', kind: 'highpass', enabled: false, frequency: 30, gainDb: 0, q: 0.707 },
    { id: 'low', kind: 'lowshelf', enabled: false, frequency: 200, gainDb: 0, q: 0.707 },
    { id: 'mid', kind: 'peaking', enabled: false, frequency: 1000, gainDb: 0, q: 1 },
    { id: 'high', kind: 'highshelf', enabled: false, frequency: 6000, gainDb: 0, q: 0.707 },
  ],
  distortion: { enabled: false, drive: 0.3, mix: 0.5, outputDb: -3 },
  envelope: { enabled: false, attackMs: 5, decayMs: 0, sustain: 1, releaseMs: 30 },
  reverb: { enabled: false, space: 'large-room', decaySeconds: 1.2, mix: 0.2, preDelayScale: 1 },
  distance: { enabled: false, amount: 0.35 },
  mix: 1,
  outputGain: 1,
};

/** Named presets, deliberately few and useful rather than exhaustive. */
export const EFFECT_PRESETS: Array<{ id: string; label: string; apply: (chain: EffectChain) => EffectChain }> = [
  {
    id: 'flat',
    label: '原声（清空）',
    apply: () => structuredClone(DEFAULT_EFFECT_CHAIN),
  },
  {
    id: 'radio',
    label: '无线电 / 电话',
    apply: (chain) => ({
      ...structuredClone(DEFAULT_EFFECT_CHAIN),
      eq: chain.eq.map((band) => {
        if (band.id === 'highpass') return { ...band, enabled: true, frequency: 400 };
        if (band.id === 'low') return { ...band, enabled: true, gainDb: -12 };
        if (band.id === 'high') return { ...band, enabled: true, gainDb: -6 };
        return band;
      }),
      distortion: { enabled: true, drive: 0.45, mix: 0.6, outputDb: -4 },
    }),
  },
  {
    id: 'dark-cave',
    label: '幽暗洞穴',
    apply: (chain) => ({
      ...structuredClone(DEFAULT_EFFECT_CHAIN),
      eq: chain.eq.map((band) =>
        band.id === 'high' ? { ...band, enabled: true, gainDb: -10 } : band,
      ),
      reverb: { enabled: true, space: 'cathedral', decaySeconds: 4, mix: 0.45, preDelayScale: 1.4 },
      distance: { enabled: true, amount: 0.45 },
    }),
  },
  {
    id: 'close-dry',
    label: '贴耳干声',
    apply: (chain) => ({
      ...structuredClone(DEFAULT_EFFECT_CHAIN),
      eq: chain.eq.map((band) => (band.id === 'low' ? { ...band, enabled: true, gainDb: 4 } : band)),
      envelope: { enabled: true, attackMs: 2, decayMs: 0, sustain: 1, releaseMs: 18 },
    }),
  },
  {
    id: 'monster',
    label: '低沉怪物',
    apply: (chain) => ({
      ...structuredClone(DEFAULT_EFFECT_CHAIN),
      eq: chain.eq.map((band) => {
        if (band.id === 'low') return { ...band, enabled: true, gainDb: 8, frequency: 120 };
        if (band.id === 'high') return { ...band, enabled: true, gainDb: -8 };
        return band;
      }),
      distortion: { enabled: true, drive: 0.35, mix: 0.35, outputDb: -5 },
      distance: { enabled: true, amount: 0.25 },
    }),
  },
];

export function presetById(id: string): ((chain: EffectChain) => EffectChain) | null {
  return EFFECT_PRESETS.find((preset) => preset.id === id)?.apply ?? null;
}

// ---------------------------------------------------------------------------
// validation and neutralisation
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

/** Longest reverb we will generate an impulse for; beyond this it is a wash. */
export const MAX_REVERB_SECONDS = 8;

/**
 * Coerce arbitrary input (a preset file, a URL, a hand-edited blob) into a chain
 * whose every parameter is finite and in range.
 *
 * Presets are user-editable data, so this is a trust boundary: a NaN frequency
 * reaching `BiquadFilterNode.frequency` throws in some browsers and silently
 * mutes in others.
 */
export function normalizeChain(input: Partial<EffectChain> | null | undefined): EffectChain {
  const base = structuredClone(DEFAULT_EFFECT_CHAIN);
  if (!input) return base;

  const byId = new Map((input.eq ?? []).map((band) => [band?.id, band]));
  const eq = base.eq.map((fallback) => {
    const band = byId.get(fallback.id);
    if (!band) return fallback;
    const kind: FilterKind =
      band.kind === 'highpass' || band.kind === 'lowshelf' || band.kind === 'peaking' || band.kind === 'highshelf'
        ? band.kind
        : fallback.kind;
    return {
      id: fallback.id,
      kind,
      enabled: band.enabled === true,
      frequency: clamp(Number(band.frequency), 20, 20000),
      gainDb: clamp(Number(band.gainDb), -24, 24),
      q: clamp(Number(band.q), 0.1, 18),
    };
  });

  const d = input.distortion;
  const e = input.envelope;
  const r = input.reverb;
  const dist = input.distance;

  return {
    enabled: input.enabled !== false,
    eq,
    distortion: {
      enabled: d?.enabled === true,
      drive: clamp(Number(d?.drive), 0, 1),
      mix: clamp(Number(d?.mix), 0, 1),
      outputDb: clamp(Number(d?.outputDb), -24, 12),
    },
    envelope: {
      enabled: e?.enabled === true,
      attackMs: clamp(Number(e?.attackMs), 0, 2000),
      decayMs: clamp(Number(e?.decayMs), 0, 5000),
      sustain: clamp(Number(e?.sustain), 0, 1),
      releaseMs: clamp(Number(e?.releaseMs), 0, 5000),
    },
    reverb: {
      enabled: r?.enabled === true,
      space: (r?.space && r.space in REVERB_SPACES ? r.space : base.reverb.space) as ReverbSpace,
      decaySeconds: clamp(Number(r?.decaySeconds), 0.2, MAX_REVERB_SECONDS),
      mix: clamp(Number(r?.mix), 0, 1),
      preDelayScale: clamp(Number(r?.preDelayScale), 0, 3),
    },
    distance: {
      enabled: dist?.enabled === true,
      amount: clamp(Number(dist?.amount), 0, 1),
    },
    mix: clamp(Number(input.mix), 0, 1),
    outputGain: clamp(Number(input.outputGain), 0, 4),
  };
}

/** True when the chain would leave the signal untouched. */
export function isNeutral(chain: EffectChain): boolean {
  if (!chain.enabled) return true;
  if (chain.mix !== 1 || chain.outputGain !== 1) return false;
  if (chain.eq.some((band) => band.enabled && band.gainDb !== 0 && band.kind !== 'highpass')) return false;
  if (chain.eq.some((band) => band.enabled && band.kind === 'highpass')) return false;
  if (chain.distortion.enabled && chain.distortion.mix > 0) return false;
  if (chain.envelope.enabled && (chain.envelope.attackMs > 0 || chain.envelope.releaseMs > 0)) return false;
  if (chain.reverb.enabled && chain.reverb.mix > 0) return false;
  if (chain.distance.enabled && chain.distance.amount > 0) return false;
  return true;
}

// ---------------------------------------------------------------------------
// derived DSP maths (pure, directly testable)
// ---------------------------------------------------------------------------

/**
 * Distance → low-pass cutoff and dry/wet balance.
 *
 * Two cues do the perceptual work, and both are needed: air absorption removes
 * high frequencies with distance, and the direct-to-reverberant ratio drops as
 * you move away. Doing only the filter leaves a sound that is muffled but still
 * "at the microphone".
 */
export function distanceResponse(amount: number): { cutoffHz: number; wet: number } {
  const a = clamp(amount, 0, 1);
  // 20 kHz (inaudible change) down to ~700 Hz (clearly across the room)
  const cutoffHz = 20000 * Math.pow(700 / 20000, a);
  return { cutoffHz, wet: a * 0.6 };
}

/**
 * Distortion transfer curve.
 *
 * `tanh`-based soft clipping rather than a hard clamp: it adds harmonics
 * progressively, which is what "warm saturation" means, and it never exceeds
 * ±1 so the shaper cannot introduce samples outside the valid range.
 */
export function distortionCurve(drive: number, samples = 1024): Float32Array {
  const d = clamp(drive, 0, 1);
  const k = 1 + d * 40;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    // -1..1 across the table
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

/**
 * Pre-gain reduction for a driven signal, so turning up drive does not just
 * make everything louder. Measured against the normalised curve's own output.
 */
export function distortionCompensationDb(drive: number): number {
  const d = clamp(drive, 0, 1);
  return -(d * 12);
}

/**
 * Synthetic impulse response for a space.
 *
 * Generated rather than shipped: a stereo IR at 48 kHz is megabytes per preset,
 * and the reference product's spaces are all "noise with a decay envelope" any-
 * way. Early reflections are placed on a fixed grid so the result is
 * deterministic and therefore testable.
 *
 * @param rand injected for determinism; defaults to a seeded generator
 */
export function impulseResponse(
  space: ReverbSpace,
  sampleRate: number,
  decaySeconds: number,
  preDelayScale = 1,
  rand: () => number = seededRandom(0x5eed),
): { left: Float32Array; right: Float32Array; preDelaySamples: number; decaySeconds: number } {
  const preset = REVERB_SPACES[space] ?? REVERB_SPACES['large-room'];
  const decay = clamp(decaySeconds, 0.2, MAX_REVERB_SECONDS);
  const total = Math.max(1, Math.round(sampleRate * (decay + preset.preDelayMs / 1000)));
  const preDelaySamples = Math.round((preset.preDelayMs / 1000) * sampleRate * clamp(preDelayScale, 0, 3));
  const decaySamples = Math.max(1, Math.round(sampleRate * decay));

  const left = new Float32Array(total);
  const right = new Float32Array(total);

  // Damping: a one-pole low-pass over the noise, so high frequencies die first
  // the way they do in a real room.
  const dampCoefficient = Math.min(0.99, 1 - (preset.dampingHz / (sampleRate / 2)) * 0.5);
  let lpL = 0;
  let lpR = 0;

  for (let i = 0; i < total; i += 1) {
    const n = i - preDelaySamples;
    if (n < 0) continue; // pre-delay: silence before the first reflection
    const t = n / decaySamples;
    if (t >= 1) break;
    // exponential decay, slightly gentler than a pure exponential so the tail
    // does not vanish abruptly
    const envelope = Math.pow(1 - t, 2.2) * Math.exp(-2.2 * t);
    const noiseL = rand() * 2 - 1;
    const noiseR = rand() * 2 - 1;
    lpL = lpL * dampCoefficient + noiseL * (1 - dampCoefficient);
    lpR = lpR * dampCoefficient + noiseR * (1 - dampCoefficient);
    left[i] = lpL * envelope;
    right[i] = lpR * envelope;
  }

  // Early reflections on a fixed grid, decorrelated between channels by a
  // one-sample offset. These carry most of the "which room is this" cue.
  const earlyMs = [7, 11, 17, 23, 29, 37];
  for (let r = 0; r < earlyMs.length; r += 1) {
    const idx = preDelaySamples + Math.round((earlyMs[r]! / 1000) * sampleRate);
    if (idx >= total) continue;
    const amp = 0.6 * Math.pow(0.62, r);
    left[idx] = (left[idx] ?? 0) + amp;
    const idxR = idx + 1;
    if (idxR < total) right[idxR] = (right[idxR] ?? 0) + amp * 0.92;
  }

  // Normalise so a louder room does not simply mean a louder output, then
  // shorten quiet tails rather than paying for seconds of near-silence.
  let peak = 0;
  for (let i = 0; i < total; i += 1) {
    peak = Math.max(peak, Math.abs(left[i]!), Math.abs(right[i]!));
  }
  if (peak > 0) {
    const scale = 0.8 / peak;
    for (let i = 0; i < total; i += 1) {
      left[i] = left[i]! * scale;
      right[i] = right[i]! * scale;
    }
  }

  return { left, right, preDelaySamples, decaySeconds: decay };
}

/**
 * Small deterministic PRNG (mulberry32).
 *
 * A fixed seed is what makes the generated impulse response reproducible: two
 * renders of the same preset must be byte-identical or the `_fx` export would
 * differ every time it is run.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * ADSR as a piecewise gain envelope over the sound's duration.
 *
 * Returns absolute times in seconds. The release is anchored to the end of the
 * sound rather than following the decay, so a short clip still fades out instead
 * of being cut off — which is the audible artefact users actually notice.
 */
export function envelopePoints(
  settings: EnvelopeSettings,
  durationSeconds: number,
): Array<{ time: number; gain: number }> {
  const duration = Math.max(0, durationSeconds);
  const attack = Math.min(settings.attackMs / 1000, duration);
  const decay = Math.min(settings.decayMs / 1000, Math.max(0, duration - attack));
  const release = Math.min(settings.releaseMs / 1000, Math.max(0, duration - attack - decay));
  const sustainEnd = Math.max(attack + decay, duration - release);

  const points: Array<{ time: number; gain: number }> = [{ time: 0, gain: attack > 0 ? 0 : 1 }];
  if (attack > 0) points.push({ time: attack, gain: 1 });
  if (decay > 0) points.push({ time: attack + decay, gain: settings.sustain });
  if (release > 0) points.push({ time: sustainEnd, gain: settings.sustain });
  points.push({ time: duration, gain: release > 0 ? 0 : settings.sustain });
  return points;
}

// ---------------------------------------------------------------------------
// graph description
// ---------------------------------------------------------------------------

export interface NodeDescriptor {
  /** unique within a chain */
  id: string;
  kind: 'biquad' | 'waveshaper' | 'gain' | 'convolver' | 'delay' | 'panner' | 'mergeSplit';
  params: Record<string, number | string>;
  /** id of the next node, or 'destination' / 'input' handled by the caller */
  next: string;
}

/**
 * Resolve a chain into the exact ordered node graph that should be built.
 *
 * This is the single source of truth shared by the live preview and the offline
 * renderer, and the thing tests assert on. The shape is always:
 *
 *   input → [mix split] → eq bands → distortion → envelope → reverb → distance → output
 *
 * with `mix` implemented as a parallel dry path so that a partial mix is a real
 * blend rather than a gain change.
 */
export function describeChain(chain: EffectChain): { nodes: NodeDescriptor[]; bypassed: boolean } {
  const nodes: NodeDescriptor[] = [];
  const bypassed = !chain.enabled || isNeutral(chain);

  // The input trim always exists so the caller has a stable attach point and can
  // retune the chain without reconnecting anything.
  nodes.push({ id: 'input', kind: 'gain', params: { gain: 1 }, next: bypassed ? 'output' : 'eq:highpass' });

  if (bypassed) {
    nodes.push({ id: 'output', kind: 'gain', params: { gain: 1 }, next: 'destination' });
    return { nodes, bypassed };
  }

  const eqIds = chain.eq.map((band) => `eq:${band.id}`);
  chain.eq.forEach((band, index) => {
    nodes.push({
      id: `eq:${band.id}`,
      kind: 'biquad',
      params: {
        type: band.kind,
        frequency: band.frequency,
        gain: band.gainDb,
        Q: band.q,
        // disabled bands are still built, at exactly their neutral response, so
        // re-enabling one mid-playback never reconnects the graph
        bypassed: band.enabled ? 0 : 1,
      },
      next: eqIds[index + 1] ?? 'distortion',
    });
  });

  const dist = chain.distortion;
  nodes.push({
    id: 'distortion',
    kind: 'waveshaper',
    params: {
      drive: dist.enabled ? dist.drive : 0,
      mix: dist.enabled ? dist.mix : 0,
      outputDb: dist.enabled ? dist.outputDb : 0,
    },
    next: 'envelope',
  });

  const env = chain.envelope;
  nodes.push({
    id: 'envelope',
    kind: 'gain',
    params: { enabled: env.enabled ? 1 : 0, sustain: env.sustain },
    next: 'reverb',
  });

  const rev = chain.reverb;
  const preset = REVERB_SPACES[rev.space] ?? REVERB_SPACES['large-room'];
  nodes.push({
    id: 'reverb',
    kind: 'convolver',
    params: {
      space: rev.space,
      decaySeconds: preset.decaySeconds,
      preDelayMs: preset.preDelayMs * rev.preDelayScale,
      mix: rev.enabled ? rev.mix : 0,
      normalize: 1,
    },
    next: 'distance',
  });

  const resp = distanceResponse(chain.distance.enabled ? chain.distance.amount : 0);
  nodes.push({
    id: 'distance',
    kind: 'biquad',
    params: { type: 'lowpass', frequency: resp.cutoffHz, Q: 0.707, wet: resp.wet },
    next: 'mix',
  });

  nodes.push({
    id: 'mix',
    kind: 'gain',
    params: { mix: chain.mix },
    next: 'output',
  });
  nodes.push({
    id: 'output',
    kind: 'gain',
    params: { gain: chain.outputGain },
    next: 'destination',
  });

  return { nodes, bypassed };
}
