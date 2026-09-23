/**
 * Offline render — what "export with effects baked in" means (plan §8, P2-1).
 *
 * The contract that makes this trustworthy: the renderer builds **the same graph**
 * as live preview (`buildChain`), in an `OfflineAudioContext`, and runs it faster
 * than real time. So what you hear is what you get, and the two paths cannot
 * drift apart without a test noticing.
 *
 * The context factory is injected rather than imported so the same code runs in
 * the browser (native `OfflineAudioContext`) and under Node
 * (`node-web-audio-api`) for tests. Importing either one directly would tie the
 * package to a single host.
 */

import { isNeutral, normalizeChain, REVERB_SPACES, distanceResponse, type EffectChain } from './chain.js';
import { buildChain, DISTANCE_ROOM_SECONDS, type BufferSourceLike, type ContextLike } from './graph.js';
import { decodeWavBytes, encodeWav, WavCodecError, type EncodeOptions } from './wav.js';

export interface OfflineContextLike extends ContextLike {
  startRendering(): Promise<{ getChannelData(channel: number): Float32Array; length: number; numberOfChannels: number }>;
}

/** Injected so this module has no hard dependency on a Web Audio implementation. */
export type OfflineContextFactory = (
  channels: number,
  length: number,
  sampleRate: number,
) => OfflineContextLike;

export interface RenderOptions {
  /** output encoding; defaults to 24-bit PCM, the delivery standard for SFX */
  encode?: EncodeOptions;
  /**
   * Extra seconds rendered after the source ends. Defaults to the reverb tail
   * when reverb is on, otherwise zero.
   */
  tailSeconds?: number;
  /** progress callback, 0..1 */
  onProgress?: (fraction: number) => void;
}

export interface RenderResult {
  bytes: Uint8Array;
  /** rendered length in seconds, including any tail */
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  /** true when the chain was a no-op and the source was passed through */
  bypassed: boolean;
}

/**
 * Render a WAV through the effect chain.
 *
 * `chain` is normalised first, so a malformed preset cannot produce a NaN filter
 * frequency (which throws in some browsers and silently mutes in others).
 */
export async function renderWav(
  source: Uint8Array,
  chain: EffectChain,
  createContext: OfflineContextFactory,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const normalized = normalizeChain(chain);
  const decoded = decodeWavBytes(source);

  const channels = Math.min(2, decoded.channelData.length);
  const sourceFrames = decoded.channelData[0]!.length;
  const sourceSeconds = sourceFrames / decoded.sampleRate;

  const bypassed = isNeutral(normalized);
  const tail = options.tailSeconds ?? defaultTailSeconds(normalized);
  const totalSeconds = sourceSeconds + tail;
  const totalFrames = Math.max(1, Math.ceil(totalSeconds * decoded.sampleRate));

  const ctx = createContext(channels, totalFrames, decoded.sampleRate);

  // The source is a decoded buffer, not a stream: rendering happens faster than
  // real time, so there is nothing to gain from streaming and everything to lose
  // in complexity.
  const buffer = ctx.createBuffer(decoded.channelData.length, sourceFrames, decoded.sampleRate);
  for (let c = 0; c < decoded.channelData.length; c += 1) {
    buffer.getChannelData(c).set(decoded.channelData[c]!);
  }

  const sourceNode = createBufferSource(ctx, buffer);
  const graph = buildChain(ctx, normalized, 0);
  sourceNode.connect(graph.input);

  graph.scheduleEnvelope(0, sourceSeconds);
  sourceNode.start(0);
  options.onProgress?.(0.05);
  const rendered = await ctx.startRendering();
  options.onProgress?.(0.9);

  const outChannels: Float32Array[] = [];
  for (let c = 0; c < channels; c += 1) {
    outChannels.push(rendered.getChannelData(c) as Float32Array);
  }

  const bytes = encodeWav(outChannels, decoded.sampleRate, options.encode);
  options.onProgress?.(1);

  return {
    bytes,
    durationSeconds: totalSeconds,
    sampleRate: decoded.sampleRate,
    channels,
    bypassed,
  };
}

/**
 * How much silence to render past the end of the source.
 *
 * A reverb tail is part of the sound, so truncating it would make the export
 * differ from what the user auditioned. Both slots that can ring on are counted:
 * the reverb slot at its chosen decay, and the shorter room tail the distance cue
 * adds. Each is scaled by its wet amount, because a 10% cathedral mix does not
 * need four seconds of near-silence appended.
 */
export function defaultTailSeconds(chain: EffectChain): number {
  if (!chain.enabled) return 0;
  let tail = 0;
  if (chain.reverb.enabled && chain.reverb.mix > 0) {
    const preset = REVERB_SPACES[chain.reverb.space] ?? REVERB_SPACES['large-room'];
    tail = Math.max(tail, preset.decaySeconds * Math.min(1, chain.reverb.mix * 1.5));
  }
  if (chain.distance.enabled && chain.distance.amount > 0) {
    const wet = distanceResponse(chain.distance.amount).wet;
    tail = Math.max(tail, DISTANCE_ROOM_SECONDS * wet + 0.02);
  }
  return Math.round(tail * 1000) / 1000;
}

/**
 * `createBufferSource` is the one node the graph builder does not provide, since
 * it is source-specific rather than part of the effect chain.
 */
function createBufferSource(ctx: ContextLike, buffer: unknown): BufferSourceLike {
  if (!ctx.createBufferSource) {
    throw new Error('this AudioContext cannot create buffer sources; offline render needs one');
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

export { WavCodecError };
