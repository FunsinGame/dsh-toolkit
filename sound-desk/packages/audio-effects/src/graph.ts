/**
 * The live Web Audio graph for the effect chain.
 *
 * Structure, and why it is this shape:
 *
 *   source ─▶ inputGain ─┬──────────────────────────────────────────────▶ dryMaster ┐
 *                        └▶ [eq] ▶ dist ▶ env ▶ reverb ▶ distance ▶ wetMaster ─────┴▶ output
 *
 *  - `inputGain` / `dryMaster` form the bypass crossfade: 0 sends everything down
 *    the dry path, 1 sends it through the effect chain. That is what makes bypass
 *    click-free — toggling it is a parameter ramp, not a graph reconnection.
 *  - Every slot keeps its nodes present even when disabled, and expresses
 *    "disabled" as a *neutral setting* rather than a missing node. Reconnecting a
 *    live graph is where clicks and dropouts come from, so the graph is built
 *    once and only gains and filter settings change afterwards.
 *  - Wet effects (distortion, reverb, distance) are true parallel paths, because
 *    "30% reverb" means a blend of dry and wet, not merely a quieter wet signal.
 *
 * The chain is only ever inserted between the source and the destination. It
 * never writes to disk; that is `render.ts`'s job, using this same graph.
 */

import {
  distortionCompensationDb,
  distortionCurve,
  distanceResponse,
  impulseResponse,
  isNeutral,
  REVERB_SPACES,
  seededRandom,
  type EffectChain,
  type FilterKind,
} from './chain.js';

/**
 * Minimal structural typing for the Web Audio nodes we touch.
 *
 * Deliberately not the DOM lib types: this module must run under both the
 * browser's Web Audio implementation and `node-web-audio-api`, whose types are
 * close but not assignable to the DOM ones. Declaring the small surface actually
 * used keeps one implementation honest for both hosts.
 */
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  cancelScheduledValues(startTime: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): unknown;
}

export interface BiquadLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  gain: AudioParamLike;
  Q: AudioParamLike;
}

export interface WaveShaperLike extends AudioNodeLike {
  curve: Float32Array | null;
  oversample: string;
}

export interface GainLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface ConvolverLike extends AudioNodeLike {
  buffer: unknown;
  normalize: boolean;
}

export interface DelayLike extends AudioNodeLike {
  delayTime: AudioParamLike;
}

export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface BufferSourceLike extends AudioNodeLike {
  buffer: unknown;
  start(when?: number, offset?: number, duration?: number): void;
  stop(when?: number): void;
}

export interface StereoPannerLike extends AudioNodeLike {
  pan: AudioParamLike;
}

export interface ContextLike {
  sampleRate: number;
  currentTime: number;
  createGain(): GainLike;
  createBiquadFilter(): BiquadLike;
  createWaveShaper(): WaveShaperLike;
  createConvolver(): ConvolverLike;
  createDelay(maxDelayTime?: number): DelayLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  /**
   * Optional because the live preview never needs it — playback streams through
   * an `<audio>` element. The offline renderer does, so it is declared here
   * rather than simulated with a cast.
   */
  createBufferSource?(): BufferSourceLike;
  /** optional for the same reason; used by the multi-track mixer */
  createStereoPanner?(): StereoPannerLike;
  destination: AudioNodeLike;
}

/**
 * How long a parameter change takes. Short enough to feel instant, long enough
 * that a stepped gain change does not produce a click.
 */
export const SMOOTHING_SECONDS = 0.02;

export interface ChainGraph {
  /** the current settings; replaced by `update` */
  chain: EffectChain;
  /** the node a source should connect to */
  readonly input: GainLike;
  /** the node the caller connects to its own destination */
  readonly output: GainLike;
  /** apply new settings without rebuilding the graph */
  update(next: EffectChain, atTime?: number): void;
  /**
   * Schedule the ADSR envelope over a playback starting at `startTime` and
   * lasting `durationSeconds`. No-op when the envelope slot is off.
   */
  scheduleEnvelope(startTime: number, durationSeconds: number): void;
  /** detach every node */
  dispose(): void;
}

/**
 * Ramp a parameter, cheaply enough to call on every slider movement.
 *
 * The starting point is remembered rather than read back from `param.value`.
 * That is not an optimisation: under `node-web-audio-api` reading `.value` on an
 * *automated* param throws, and a `setValueAtTime(undefined, …)` is silently
 * dropped, which made the ramp interpolate from 0 — enough to mute the bypass
 * path completely. Keeping our own last-commanded value avoids depending on
 * read-back semantics that differ between implementations.
 *
 * `setValueAtTime` before the ramp matters for the same reason it does in the
 * spec: without it the interpolation starts from whenever the previous
 * automation ended rather than from the current value, which clicks. Scheduled
 * values are deliberately not cancelled, so a slider drag does not turn into a
 * series of steps.
 */
type Ramping = (param: AudioParamLike, key: string, to: number, at: number) => void;

function makeRamping(): Ramping {
  const last = new Map<string, number>();
  return (param, key, to, at) => {
    const known = last.get(key);
    last.set(key, to);
    if (known === undefined) {
      // First command for this parameter: set it outright rather than ramping.
      // A ramp would have to start *before* `at` to be transparent at sample 0,
      // and negative automation times are not allowed (node-web-audio-api throws;
      // browsers clamp). Setting is both legal and exactly transparent, whereas a
      // 20 ms fade-in would make a neutral chain audibly ramp up.
      param.setValueAtTime(to, at);
      return;
    }
    param.setValueAtTime(known, at);
    param.linearRampToValueAtTime(to, at + SMOOTHING_SECONDS);
  };
}

/** How long the distance cue's room tail can last; used for export length. */
export const DISTANCE_ROOM_SECONDS = 0.45;

/** The frequency a band returns to when disabled, chosen to be inaudible. */
function neutralFrequency(kind: FilterKind): number {
  switch (kind) {
    case 'highpass':
      return 20;
    case 'lowshelf':
      return 200;
    case 'peaking':
      return 1000;
    case 'highshelf':
      return 20000;
    default:
      return 1000;
  }
}

interface Handles {
  inputGain: GainLike;
  eq: BiquadLike[];
  distIn: GainLike;
  shaper: WaveShaperLike;
  distWet: GainLike;
  distDry: GainLike;
  distOut: GainLike;
  env: GainLike;
  reverbIn: DelayLike;
  convolver: ConvolverLike;
  reverbWet: GainLike;
  reverbDry: GainLike;
  reverbOut: GainLike;
  /** pre-delay for the distance room tail */
  distRoomIn: DelayLike;
  /** short room tail that gives the distance cue its reverberant field */
  distRoom: ConvolverLike;
  distRoomWet: GainLike;
  distFilter: BiquadLike;
  distFilterWet: GainLike;
  distFilterDry: GainLike;
  distFilterOut: GainLike;
  wetMaster: GainLike;
  dryMaster: GainLike;
  output: GainLike;
}

/**
 * Values that must persist across `applyChain` calls: which impulse responses and
 * which waveshaper curve are currently loaded, so they are only rebuilt when they
 * actually change.
 */
interface GraphState {
  curveKey: string | null;
  irKey: string | null;
  roomKey: string | null;
}

function applyChain(
  ctx: ContextLike,
  h: Handles,
  chain: EffectChain,
  at: number,
  ramp: Ramping,
  state: GraphState,
): void {
  const bypassed = !chain.enabled || isNeutral(chain);

  // Bypass crossfade, applied *after* the split.
  //
  // The dry branch taps `inputGain`, so `inputGain` must stay at unity — putting
  // the crossfade there would attenuate the dry path along with the wet one and
  // silence the chain entirely when bypassed. Only the branch gains move.
  ramp(h.dryMaster.gain, 'dry', bypassed ? 1 : 0, at);
  ramp(h.wetMaster.gain, 'wet', bypassed ? 0 : chain.mix, at);

  // EQ: neutral settings when disabled, rather than removal
  chain.eq.forEach((band, index) => {
    const node = h.eq[index];
    if (!node) return;
    node.type = band.kind;
    const active = band.enabled && !bypassed;
    ramp(node.frequency, `${band.id}.freq`, active ? band.frequency : neutralFrequency(band.kind), at);
    ramp(node.gain, `${band.id}.gain`, active && band.kind !== 'highpass' ? band.gainDb : 0, at);
    ramp(node.Q, `${band.id}.q`, active && (band.kind === 'highpass' || band.kind === 'peaking') ? band.q : 0.707, at);
  });

  // distortion
  const dist = chain.distortion;
  const distActive = dist.enabled && dist.mix > 0 && !bypassed;
  const curveKey = String(dist.drive);
  if (state.curveKey !== curveKey) {
    // WaveShaperNode.curve may only be assigned once per distinct value in some
    // implementations, so only touch it when the drive actually changed.
    h.shaper.curve = distortionCurve(dist.drive);
    state.curveKey = curveKey;
  }
  h.shaper.oversample = '2x';
  ramp(h.distIn.gain, 'distIn', distActive ? 1 + dist.drive * 3 : 1, at);
  ramp(h.distWet.gain, 'distWet', distActive ? dist.mix : 0, at);
  ramp(h.distDry.gain, 'distDry', distActive ? 1 - dist.mix : 1, at);
  ramp(h.distOut.gain, 'distOut', distActive ? Math.pow(10, distortionCompensationDb(dist.drive) / 20) : 1, at);

  // reverb — regenerate the impulse only when the space or decay actually changed
  const rev = chain.reverb;
  const revActive = rev.enabled && rev.mix > 0 && !bypassed;
  const irKey = `${rev.space}|${rev.decaySeconds}|${rev.preDelayScale}|${ctx.sampleRate}`;
  if (state.irKey !== irKey) {
    const ir = impulseResponse(rev.space, ctx.sampleRate, rev.decaySeconds, rev.preDelayScale);
    const buffer = ctx.createBuffer(2, ir.left.length, ctx.sampleRate);
    buffer.getChannelData(0).set(ir.left);
    buffer.getChannelData(1).set(ir.right);
    h.convolver.buffer = buffer;
    state.irKey = irKey;
    const preset = REVERB_SPACES[rev.space] ?? REVERB_SPACES['large-room'];
    ramp(h.reverbIn.delayTime, 'preDelay', Math.min(0.5, (preset.preDelayMs / 1000) * rev.preDelayScale), at);
  }
  h.convolver.normalize = true;
  ramp(h.reverbWet.gain, 'revWet', revActive ? rev.mix : 0, at);
  ramp(h.reverbDry.gain, 'revDry', revActive ? 1 - rev.mix : 1, at);

  /**
   * Distance is two cues, and it needs both to read as "further away": air
   * absorption removes highs, and the direct-to-reverberant ratio drops. Doing
   * only the filter leaves a sound that is muffled but still at the microphone,
   * so the wet branch gets its own short room tail.
   */
  const distanceOn = chain.distance.enabled && chain.distance.amount > 0 && !bypassed;
  const resp = distanceResponse(distanceOn ? chain.distance.amount : 0);
  const roomKey = `dist|${ctx.sampleRate}`;
  if (state.roomKey !== roomKey) {
    const ir = impulseResponse('small-room', ctx.sampleRate, 0.45, 1, seededRandom(0xd157));
    const buffer = ctx.createBuffer(2, ir.left.length, ctx.sampleRate);
    buffer.getChannelData(0).set(ir.left);
    buffer.getChannelData(1).set(ir.right);
    h.distRoom.buffer = buffer;
    state.roomKey = roomKey;
  }
  h.distRoom.normalize = true;
  h.distFilter.type = 'lowpass';
  ramp(h.distFilter.frequency, 'distFreq', distanceOn ? resp.cutoffHz : 20000, at);
  ramp(h.distRoomWet.gain, 'distRoomWet', distanceOn ? resp.wet : 0, at);
  ramp(h.distFilterWet.gain, 'distWetGain', distanceOn ? resp.wet : 0, at);
  ramp(h.distFilterDry.gain, 'distDryGain', distanceOn ? 0 : 1, at);

  // master: only the output trim and the reverb-slot gain (set above)
  ramp(h.output.gain, 'output', chain.outputGain, at);
}

/**
 * Build the graph once. `chain` supplies the initial settings; call `update()`
 * afterwards rather than rebuilding.
 */
export function buildChain(ctx: ContextLike, chain: EffectChain, atTime = ctx.currentTime): ChainGraph {
  const inputGain = ctx.createGain();
  const dryMaster = ctx.createGain();
  const wetMaster = ctx.createGain();
  const output = ctx.createGain();

  const eq = chain.eq.map(() => ctx.createBiquadFilter());

  const distIn = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  const distWet = ctx.createGain();
  const distDry = ctx.createGain();
  const distOut = ctx.createGain();

  const env = ctx.createGain();

  const reverbIn = ctx.createDelay(0.5);
  const convolver = ctx.createConvolver();
  const reverbWet = ctx.createGain();
  const reverbDry = ctx.createGain();
  const reverbOut = ctx.createGain();

  const distFilter = ctx.createBiquadFilter();
  const distFilterWet = ctx.createGain();
  const distFilterDry = ctx.createGain();
  const distFilterOut = ctx.createGain();
  // the distance cue needs its own room tail, separate from the reverb slot
  const distRoomIn = ctx.createDelay(0.5);
  const distRoom = ctx.createConvolver();
  const distRoomWet = ctx.createGain();

  const h: Handles = {
    inputGain, eq,
    distIn, shaper, distWet, distDry, distOut,
    env,
    reverbIn, convolver, reverbWet, reverbDry, reverbOut,
    distRoomIn, distRoom, distRoomWet,
    distFilter, distFilterWet, distFilterDry, distFilterOut,
    wetMaster, dryMaster, output,
  };

  // --- wiring -------------------------------------------------------------
  inputGain.connect(dryMaster);
  dryMaster.connect(output);
  dryMaster.gain.value = 0;

  let cursor: AudioNodeLike = inputGain;
  for (const band of eq) {
    cursor.connect(band);
    cursor = band;
  }

  // → distortion (shaped and dry paths rejoin at distOut)
  cursor.connect(distIn);
  distIn.connect(shaper);
  shaper.connect(distWet);
  distWet.connect(distOut);
  distIn.connect(distDry);
  distDry.connect(distOut);

  // → envelope
  distOut.connect(env);

  // → reverb: pre-delay into the convolver, blended against the dry signal
  env.connect(reverbIn);
  reverbIn.connect(convolver);
  convolver.connect(reverbWet);
  reverbWet.connect(reverbOut);
  env.connect(reverbDry);
  reverbDry.connect(reverbOut);

  // → distance: the direct path gets the low-pass (air absorption) while the
  //   reverberant path keeps the filtered signal plus a short room tail
  reverbOut.connect(distFilter);
  distFilter.connect(distFilterWet);
  distFilterWet.connect(distFilterOut);
  reverbOut.connect(distFilterDry);
  distFilterDry.connect(distFilterOut);

  distFilter.connect(distRoomIn);
  distRoomIn.connect(distRoom);
  distRoom.connect(distRoomWet);
  distRoomWet.connect(distFilterOut);

  // → master blend → output
  //
  // Deliberately *not* connected to `ctx.destination` here. A chain is a
  // processing block, and the owner decides where its output goes — the offline
  // renderer goes to the destination, the mixer goes to its own bus, and the live
  // player goes to the volume gain. Connecting internally as well created a
  // second, unprocessed path to the speakers that silently defeated per-track
  // panning.
  distFilterOut.connect(wetMaster);
  wetMaster.connect(output);

  wetMaster.gain.value = 0;
  output.gain.value = chain.outputGain;

  const state: GraphState = { curveKey: null, irKey: null, roomKey: null };
  const ramp = makeRamping();
  applyChain(ctx, h, chain, atTime, ramp, state);

  const graph: ChainGraph = {
    chain,
    input: inputGain,
    output,
    update(next, at = ctx.currentTime) {
      applyChain(ctx, h, next, at, ramp, state);
      graph.chain = next;
    },
    scheduleEnvelope(startTime, durationSeconds) {
      const settings = graph.chain.envelope;
      if (!settings.enabled || durationSeconds <= 0) {
        return;
      }
      const gain = env.gain;
      const attack = Math.min(settings.attackMs / 1000, durationSeconds);
      const release = Math.min(settings.releaseMs / 1000, Math.max(0, durationSeconds - attack));
      const decay = Math.min(settings.decayMs / 1000, Math.max(0, durationSeconds - attack));
      gain.cancelScheduledValues(startTime);
      gain.setValueAtTime(attack > 0 ? 0 : 1, startTime);
      if (attack > 0) gain.linearRampToValueAtTime(1, startTime + attack);
      if (decay > 0) gain.linearRampToValueAtTime(settings.sustain, startTime + attack + decay);
      if (release > 0) {
        // hold sustain until the release begins, then fade to zero at the end
        const sustainEnd = startTime + Math.max(attack + decay, durationSeconds - release);
        gain.setValueAtTime(settings.sustain, sustainEnd);
        gain.linearRampToValueAtTime(0, startTime + durationSeconds);
      }
    },
    dispose() {
      for (const node of [
        inputGain, dryMaster, wetMaster, output, ...eq,
        distIn, shaper, distWet, distDry, distOut, env,
        reverbIn, convolver, reverbWet, reverbDry, reverbOut,
        distRoomIn, distRoom, distRoomWet,
        distFilter, distFilterWet, distFilterDry, distFilterOut,
      ]) {
        try {
          node.disconnect();
        } catch {
          /* already detached */
        }
      }
    },
  };

  return graph;
}
