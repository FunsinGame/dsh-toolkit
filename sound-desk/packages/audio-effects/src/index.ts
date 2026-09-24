/**
 * `@sounddesk/audio-effects` — preview-only effect chain, plan §8 / P2-1.
 *
 * The rule the whole package follows: effects shape the **playback graph**, never
 * the user's file. Export is the one explicit path that produces a new file, and
 * it does so by running the identical graph offline (`renderWav`), so what was
 * auditioned is what gets written.
 *
 * Hosts: `chain.ts` is pure data, `graph.ts`/`render.ts` type against a minimal
 * structural subset of Web Audio so the browser and `node-web-audio-api` both
 * satisfy it, and `wav.ts` is `Uint8Array`-in/out. Nothing here imports Node or
 * DOM APIs directly.
 */

export {
  DEFAULT_EFFECT_CHAIN,
  EFFECT_PRESETS,
  MAX_REVERB_SECONDS,
  REVERB_SPACES,
  describeChain,
  distortionCompensationDb,
  distortionCurve,
  distanceResponse,
  envelopePoints,
  impulseResponse,
  isNeutral,
  normalizeChain,
  presetById,
  seededRandom,
  type DistanceSettings,
  type DistortionSettings,
  type EffectChain,
  type EnvelopeSettings,
  type EqBand,
  type FilterKind,
  type NodeDescriptor,
  type ReverbSettings,
  type ReverbSpace,
} from './chain.js';

export {
  buildChain,
  SMOOTHING_SECONDS,
  type AudioNodeLike,
  type AudioParamLike,
  type BiquadLike,
  type BufferSourceLike,
  type ChainGraph,
  type ContextLike,
  type GainLike,
} from './graph.js';

export {
  defaultTailSeconds,
  renderWav,
  type OfflineContextFactory,
  type OfflineContextLike,
  type RenderOptions,
  type RenderResult,
} from './render.js';

export {
  MAX_TRACKS,
  mixDuration,
  mixSampleRate,
  normalizeTracks,
  renderMix,
  renderStem,
  staggerTracks,
  trackDuration,
  type DecodedAudioLike,
  type MixOptions,
  type MixResult,
  type MixTrack,
  type MixTrackInput,
  type OfflineMixContextFactory,
} from './mix.js';

export {
  decodeWavBytes,
  describeWavFormat,
  encodeWav,
  WavCodecError,
  type EncodeOptions,
  type WavData,
} from './wav.js';
