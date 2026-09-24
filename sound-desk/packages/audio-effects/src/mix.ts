/**
 * Multi-track mixing — plan §8, the "多轨叠层（≤4 轨）" half of P2-1.
 *
 * Each track is an asset plus its own volume, pan, start offset and **its own
 * effect chain**. Independent chains are the point: a layer of two sounds is only
 * useful if you can put the reverb on one and leave the other dry.
 *
 * As with the single-sound renderer, the mix is built from the same `buildChain`
 * the preview uses, in an `OfflineAudioContext`, so an export matches what was
 * auditioned. The context factory and the decoder are injected, which keeps this
 * module free of both DOM and Node dependencies and testable with real Web Audio
 * in Node.
 */

import { normalizeChain, distanceResponse, REVERB_SPACES, type EffectChain } from './chain.js';
import {
  buildChain,
  DISTANCE_ROOM_SECONDS,
  type AudioNodeLike,
  type BufferSourceLike,
  type ContextLike,
  type GainLike,
  type StereoPannerLike,
} from './graph.js';
import { encodeWav, type EncodeOptions } from './wav.js';

/** Stereo is the ceiling: sound-effect libraries are effectively mono or stereo. */
export const MAX_TRACKS = 4;

export interface MixTrack {
  /** stable id so the UI can address a track while it is being edited */
  id: string;
  /** the source file, for display and for the caller's own bookkeeping */
  assetId: number;
  label: string;
  /** 0..1 linear */
  volume: number;
  /** -1 (left) .. 1 (right) */
  pan: number;
  /** seconds before this track starts, for automatic staggering */
  startSeconds: number;
  /** trim from the start of the source, in seconds */
  trimStartSeconds: number;
  /** play at most this long; null plays to the end */
  trimLengthSeconds: number | null;
  mute: boolean;
  solo: boolean;
  chain: EffectChain;
  /** decoded source, resolved by the caller */
  channelData: Float32Array[];
  sampleRate: number;
}

/** A track plus the two things the caller has to supply. */
export interface MixTrackInput {
  id?: string;
  assetId: number;
  label: string;
  volume?: number;
  pan?: number;
  startSeconds?: number;
  trimStartSeconds?: number;
  trimLengthSeconds?: number | null;
  mute?: boolean;
  solo?: boolean;
  chain?: EffectChain;
  /** the decoded source audio for this track */
  audio: { channelData: Float32Array[]; sampleRate: number };
}

export interface DecodedAudioLike {
  channelData: Float32Array[];
  sampleRate: number;
}

export interface MixResult {
  bytes: Uint8Array;
  /** total rendered length in seconds */
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  /** how many tracks actually contributed */
  trackCount: number;
  /** true when nothing was audible */
  silent: boolean;
}

export interface MixOptions {
  encode?: EncodeOptions;
  /** extra seconds rendered after the last track ends, for reverb tails */
  tailSeconds?: number;
  onProgress?: (fraction: number) => void;
}

const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

/**
 * Turn loose track input into an audible-or-not decision plus clean parameters.
 *
 * Solo is resolved here rather than in the graph: "any track soloed mutes the
 * others" is a decision about which tracks are heard, and doing it in one place
 * keeps the audio path free of conditionals.
 */
export function normalizeTracks(inputs: MixTrackInput[]): MixTrack[] {
  const limited = inputs.slice(0, MAX_TRACKS);
  const anySolo = limited.some((t) => t.solo === true);
  return limited.map((input, index) => {
    const audible = anySolo ? input.solo === true : input.mute !== true;
    return {
      id: input.id ?? `track-${index + 1}`,
      assetId: input.assetId,
      label: input.label,
      volume: audible ? clamp(input.volume ?? 1, 0, 2) : 0,
      pan: clamp(input.pan ?? 0, -1, 1),
      startSeconds: Math.max(0, Number(input.startSeconds) || 0),
      trimStartSeconds: Math.max(0, Number(input.trimStartSeconds) || 0),
      trimLengthSeconds:
        input.trimLengthSeconds === null || input.trimLengthSeconds === undefined
          ? null
          : Math.max(0, Number(input.trimLengthSeconds) || 0),
      mute: input.mute === true,
      solo: input.solo === true,
      chain: normalizeChain(input.chain),
      channelData: input.audio.channelData,
      sampleRate: input.audio.sampleRate,
    };
  });
}

/** How long one track plays, after trimming. */
export function trackDuration(track: MixTrack): number {
  const total = track.channelData[0]?.length ? track.channelData[0]!.length / track.sampleRate : 0;
  const available = Math.max(0, total - track.trimStartSeconds);
  return track.trimLengthSeconds === null ? available : Math.min(available, track.trimLengthSeconds);
}

/**
 * Total length of the mix: every track's offset plus its own reverb tail.
 *
 * A track's decay is part of that track, so it has to be counted here. Omitting
 * it truncated the tail of the last track — the export then differed from the
 * preview, which is the one thing this design exists to prevent.
 */
export function mixDuration(tracks: MixTrack[], tailSeconds = 0): number {
  let end = 0;
  for (const track of tracks) {
    if (track.volume <= 0) continue;
    end = Math.max(end, track.startSeconds + trackDuration(track) + trackTail(track));
  }
  return end > 0 ? end + Math.max(0, tailSeconds) : 0;
}

/** How long this track's own reverb rings after it stops sounding. */
export function trackTail(track: MixTrack): number {
  if (!track.chain.enabled) return 0;
  const reverb = track.chain.reverb;
  let tail = 0;
  if (reverb.enabled && reverb.mix > 0) {
    const preset = REVERB_SPACES[reverb.space] ?? REVERB_SPACES['large-room'];
    tail = Math.max(tail, preset.decaySeconds * Math.min(1, reverb.mix * 1.5));
  }
  if (track.chain.distance.enabled && track.chain.distance.amount > 0) {
    tail = Math.max(tail, DISTANCE_ROOM_SECONDS * distanceResponse(track.chain.distance.amount).wet + 0.02);
  }
  return tail;
}

/**
 * Stagger tracks so they do not all start at once.
 *
 * "自动错开" in the plan. Offsets are cumulative from the *previous* track's end
 * rather than absolute, because the useful default for layering is "hear them one
 * after another" — which is how you compare candidates — not "stack them all at
 * zero", which is how you get a clipped mess.
 *
 * @param gapSeconds silence inserted between tracks
 */
export function staggerTracks(
  inputs: MixTrackInput[],
  gapSeconds = 0,
  mode: 'sequential' | 'overlap' | 'together' = 'sequential',
): MixTrackInput[] {
  if (mode === 'together') return inputs.map((t) => ({ ...t, startSeconds: 0 }));

  let cursor = 0;
  return inputs.map((track) => {
    const normalized = { ...track, startSeconds: cursor };
    const audio = track.audio;
    const total = audio.channelData[0]?.length ? audio.channelData[0]!.length / audio.sampleRate : 0;
    const trimmed = Math.max(0, total - (track.trimStartSeconds ?? 0));
    const length = track.trimLengthSeconds == null ? trimmed : Math.min(trimmed, track.trimLengthSeconds);
    // `overlap` starts each track part-way through the previous one, which is the
    // useful default for building up a layered sound.
    cursor += mode === 'overlap' ? Math.max(0.2, length * 0.5) : length + gapSeconds;
    return normalized;
  });
}

/** The sample rate a mix renders at: the highest any track uses. */
export function mixSampleRate(tracks: MixTrack[], fallback = 48000): number {
  let rate = 0;
  for (const track of tracks) {
    if (track.volume <= 0) continue;
    rate = Math.max(rate, track.sampleRate);
  }
  return rate > 0 ? rate : fallback;
}

export type OfflineMixContextFactory = (
  channels: number,
  length: number,
  sampleRate: number,
) => ContextLike & {
  startRendering(): Promise<{ getChannelData(channel: number): Float32Array }>;
};

/**
 * Render the tracks into one stereo WAV.
 *
 * Throws when nothing would be audible rather than writing a silent file: an
 * empty export looks like a bug in the tool, and the user has no way to tell it
 * apart from "my effects removed everything".
 */
export async function renderMix(
  tracks: MixTrack[],
  createContext: OfflineMixContextFactory,
  options: MixOptions = {},
): Promise<MixResult> {
  const tail = options.tailSeconds ?? 0;
  const duration = mixDuration(tracks, tail);
  if (duration <= 0) {
    throw new Error('所有轨道都是静音或空的，没有可导出的内容');
  }

  const sampleRate = mixSampleRate(tracks);
  const channels = 2;
  const totalFrames = Math.max(1, Math.ceil(duration * sampleRate));
  const ctx = createContext(channels, totalFrames, sampleRate);

  const master: GainLike = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.value = 1;

  let contributing = 0;
  for (const track of tracks) {
    if (track.volume <= 0 || track.channelData.length === 0) continue;
    const length = trackDuration(track);
    if (length <= 0) continue;

    // Render at the mix rate even when a source is lower-rate: resampling here
    // would need an interpolator, and in practice a library is one sample rate.
    const source = ctx.createBuffer(
      track.channelData.length,
      track.channelData[0]!.length,
      track.sampleRate,
    );
    for (let ch = 0; ch < track.channelData.length; ch += 1) {
      source.getChannelData(ch).set(track.channelData[ch]!);
    }

    const node: BufferSourceLike = createBufferSource(ctx, source);
    const graph = buildChain(ctx, track.chain, 0);

    // Track volume multiplies the chain's own output trim, so a chain that is
    // trimming output still responds to the fader.
    const outputGain = graph.output.gain;
    outputGain.setValueAtTime(track.chain.outputGain * track.volume, 0);

    // Panning after the chain: a stereo effect must not be panned twice.
    const panner: StereoPannerLike = createPanner(ctx, track.pan);
    node.connect(graph.input);
    graph.output.connect(panner);
    panner.connect(master);

    graph.scheduleEnvelope(track.startSeconds, length);
    node.start(track.startSeconds, track.trimStartSeconds, length);
    contributing += 1;
  }

  if (contributing === 0) {
    throw new Error('没有可导出的轨道内容');
  }

  options.onProgress?.(0.05);
  const rendered = await ctx.startRendering();
  options.onProgress?.(0.9);

  const out: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch += 1) out.push(rendered.getChannelData(ch));

  const bytes = encodeWav(out, sampleRate, options.encode);
  options.onProgress?.(1);

  return {
    bytes,
    durationSeconds: duration,
    sampleRate,
    channels,
    trackCount: contributing,
    silent: false,
  };
}

function createBufferSource(ctx: ContextLike, buffer: unknown): BufferSourceLike {
  if (!ctx.createBufferSource) throw new Error('this AudioContext cannot create buffer sources');
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

function createPanner(ctx: ContextLike, pan: number): StereoPannerLike {
  if (!ctx.createStereoPanner) throw new Error('this AudioContext cannot create a stereo panner');
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  return panner;
}

/**
 * Render one track on its own, with its effects, for stem export.
 *
 * Shares `renderMix` rather than duplicating the wiring, so a stem is exactly the
 * track as it appears in the mix.
 */
export async function renderStem(
  track: MixTrack,
  createContext: OfflineMixContextFactory,
  options: MixOptions = {},
): Promise<MixResult> {
  // Soloing the track keeps its own mute/solo state from silencing the stem.
  const soloed: MixTrack = { ...track, mute: false, solo: false, volume: track.volume > 0 ? track.volume : 1 };
  return renderMix([soloed], createContext, options);
}

export type { ContextLike };
