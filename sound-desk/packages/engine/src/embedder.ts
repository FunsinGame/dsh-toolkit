/**
 * The ML seam.
 *
 * The engine must be fully useful with no model installed: keyword search, UCS
 * classification, waveform browsing and playback all work from the WAV parser
 * alone. Semantic search is the one capability that genuinely needs an embedding
 * model, so it is isolated behind these implementations.
 *
 * `NullEmbedder` is what ships by default. It reports `ready: false`, which the
 * indexer and search service treat as "skip the vector path" rather than as an
 * error. `ClapEmbedder` is the real implementation; it is loaded lazily so that
 * a missing or oversized model download can never break startup.
 *
 * The API shape here is **verified against the installed package**, not assumed:
 *
 *   text  : AutoTokenizer → ClapTextModelWithProjection  → output.text_embeds  [N,512]
 *   audio : AutoProcessor → ClapAudioModelWithProjection → output.audio_embeds [1,512]
 *
 * Two things this rules out, both of which were wrong in the first draft:
 *  - `ClapModel.get_text_features` / `get_audio_features` do not exist; that
 *    class exposes forward/encode_text/encode_audio instead, and the separate
 *    `*WithProjection` classes are what return the projected embeddings.
 *  - `AutoProcessor` for CLAP carries only the mel feature extractor. The
 *    tokenizer must be loaded separately with `AutoTokenizer`.
 *
 * Audio handling:
 *  - The feature extractor expects 48 kHz mono, which is what `embedAudio`
 *    receives after the indexer's mix-down.
 *  - Long files are chunked into 10 s windows with a 5 s hop. The whole-file
 *    embedding is the L2-normalized RMS-weighted mean of the window vectors.
 *  - The first window is kept separately as the "onset" embedding: a mean over
 *    a long tail dilutes transients, so impact search works better against it.
 */

import {
  EMBEDDING_DIM,
  l2Normalize,
  type Embedder,
  type EmbeddingResult,
} from '@sounddesk/core';

import { MAXSIM_MAX_WINDOWS, windowOffsets } from './maxsim.js';

/** Default model: LAION-CLAP, the text/audio dual tower. */
export const DEFAULT_CLAP_MODEL = 'Xenova/clap-htsat-unfused';

/**
 * Default model host.
 *
 * huggingface.co is unreachable from some networks (this one included) while
 * hf-mirror.com serves the same repository layout, so the host is configurable
 * and can be overridden with SOUNDDESK_HF_HOST.
 */
export const DEFAULT_MODEL_HOST = process.env.SOUNDDESK_HF_HOST ?? 'https://hf-mirror.com';

/** CLAP's audio tower expects 48 kHz mono. */
export const CLAP_SAMPLE_RATE = 48_000;
/** One analysis window. */
export const CLAP_WINDOW_SECONDS = 10;
/**
 * Stride for the sliding window.
 *
 * Measured on a real 3,374-file library: CPU inference costs ~2.1 s per 10 s
 * window, while decoding a file costs ~0.17 s. So windows, not I/O, are the
 * entire cost — the first draft's 5 s hop gave a 60 s file 11 windows (~23 s).
 * Music and ambience beds are exactly the long files, so that dominated the run.
 *
 * A 10 s hop gives full coverage of short sounds (one window) and at most three
 * informative snapshots of a long bed, which is all similarity search needs.
 */
export const CLAP_HOP_SECONDS = 10;
/**
 * How much of a long file we analyse at all.
 *
 * Capped at 30 s deliberately: this is a similarity fingerprint, not a full
 * analysis, and halving the ceiling halves the worst-case cost.
 */
export const CLAP_MAX_SECONDS = 30;

/**
 * Absolute ceiling on how much audio one file may contribute to an analysis pass.
 *
 * `windowOffsets` already bounds the number of windows, so this only matters for a
 * pathologically long file (a field recording of hours): without it, 24 windows
 * would be spread so far apart that the file is sampled rather than searched, and
 * the offsets reported for a match would point into a region we never compared.
 * Five minutes of coverage is enough for a similarity fingerprint and keeps the
 * worst case bounded.
 */
export const MAX_AUDIO_ANALYSIS_SECONDS = 300;

export class NullEmbedder implements Embedder {
  readonly id = 'none';
  readonly dim = EMBEDDING_DIM;
  readonly ready = false;

  async embedText(): Promise<Float32Array[]> {
    return [];
  }

  async embedAudio(): Promise<EmbeddingResult> {
    throw new Error('no embedding model is loaded');
  }
}

/** The slice of the Transformers.js surface we actually use. */
interface Tensor {
  data: Float32Array;
  dims: number[];
}
type OutputRecord = Record<string, Tensor | undefined>;
interface TextModel {
  (inputs: unknown): Promise<OutputRecord>;
  dispose?: () => Promise<void>;
}
interface AudioModel {
  (inputs: unknown): Promise<OutputRecord>;
  dispose?: () => Promise<void>;
}
interface TokenizerLike {
  (texts: string[], options?: unknown): Promise<unknown>;
}
interface ProcessorLike {
  (audio: Float32Array | Float32Array[]): Promise<Record<string, Tensor>>;
}

export interface ClapEmbedderOptions {
  modelId?: string;
  /** where downloaded weights are cached */
  cacheDir?: string;
  /** 'q8' keeps the download small; 'fp32' is more accurate */
  dtype?: 'q8' | 'fp16' | 'fp32' | 'auto';
  /** model host; defaults to DEFAULT_MODEL_HOST */
  host?: string;
  /** disable network access entirely (models must already be cached) */
  localOnly?: boolean;
  onProgress?: (info: ClapProgressInfo) => void;
}

export interface ClapProgressInfo {
  status?: string;
  file?: string;
  progress?: number;
}

export class ClapEmbedder implements Embedder {
  readonly id: string;
  readonly dim = EMBEDDING_DIM;
  ready = false;

  private tokenizer: TokenizerLike | null = null;
  private processor: ProcessorLike | null = null;
  private textModel: TextModel | null = null;
  private audioModel: AudioModel | null = null;

  private readonly modelId: string;
  private readonly cacheDir: string;
  private readonly dtype: NonNullable<ClapEmbedderOptions['dtype']>;
  private readonly host: string;
  private readonly localOnly: boolean;
  private readonly onProgress: ((info: ClapProgressInfo) => void) | undefined;

  private constructor(options: ClapEmbedderOptions) {
    this.modelId = options.modelId ?? DEFAULT_CLAP_MODEL;
    this.cacheDir = options.cacheDir ?? '';
    this.dtype = options.dtype ?? 'q8';
    this.host = options.host ?? DEFAULT_MODEL_HOST;
    this.localOnly = options.localOnly ?? false;
    this.onProgress = options.onProgress;
    this.id = this.modelId;
  }

  static async load(options: ClapEmbedderOptions = {}): Promise<ClapEmbedder> {
    const instance = new ClapEmbedder(options);
    await instance.init();
    return instance;
  }

  private async init(): Promise<void> {
    const lib = (await import('@huggingface/transformers')) as unknown as {
      env: { cacheDir: string; allowRemoteModels: boolean; allowLocalModels: boolean; remoteHost: string };
      AutoTokenizer: { from_pretrained: (id: string, opts?: unknown) => Promise<TokenizerLike> };
      AutoProcessor: { from_pretrained: (id: string, opts?: unknown) => Promise<ProcessorLike> };
      ClapTextModelWithProjection: { from_pretrained: (id: string, opts?: unknown) => Promise<TextModel> };
      ClapAudioModelWithProjection: { from_pretrained: (id: string, opts?: unknown) => Promise<AudioModel> };
    };

    if (this.cacheDir) lib.env.cacheDir = this.cacheDir;
    // Required on networks where huggingface.co is blocked; the repository layout
    // is identical, so only the host changes.
    lib.env.remoteHost = this.host;
    lib.env.allowRemoteModels = !this.localOnly;
    lib.env.allowLocalModels = true;

    const loadOptions: Record<string, unknown> = { dtype: this.dtype };
    if (this.onProgress) loadOptions.progress_callback = this.onProgress;

    // Sequential on purpose: three concurrent multi-hundred-MB downloads on a
    // slow link is worse than three serialised ones, and the log stays readable.
    this.tokenizer = await lib.AutoTokenizer.from_pretrained(this.modelId, loadOptions);
    this.processor = await lib.AutoProcessor.from_pretrained(this.modelId, loadOptions);
    this.textModel = await lib.ClapTextModelWithProjection.from_pretrained(this.modelId, loadOptions);
    this.audioModel = await lib.ClapAudioModelWithProjection.from_pretrained(this.modelId, loadOptions);

    this.ready = true;
  }

  /** Text embeddings, one L2-normalized 512-d vector per caption. */
  async embedText(texts: string[]): Promise<Float32Array[]> {
    if (!this.ready || !this.tokenizer || !this.textModel) return [];
    if (texts.length === 0) return [];

    const encoded = await this.tokenizer(texts, { padding: true, truncation: true });
    const output = await this.textModel(encoded);
    const embeds = output.text_embeds ?? output.embeds;
    if (!embeds) throw new Error('CLAP text tower returned no text_embeds tensor');

    const width = embeds.dims[embeds.dims.length - 1] ?? this.dim;
    const rows = embeds.dims.length === 2 ? (embeds.dims[0] ?? 1) : 1;
    const out: Float32Array[] = [];
    for (let row = 0; row < rows; row += 1) {
      out.push(l2Normalize(Float32Array.from(embeds.data.subarray(row * width, (row + 1) * width))));
    }
    return out;
  }

  async embedAudio(samples: Float32Array, sampleRate: number): Promise<EmbeddingResult> {
    if (!this.ready || !this.processor || !this.audioModel) {
      throw new Error('embedding model not loaded');
    }
    const mono = sampleRate === CLAP_SAMPLE_RATE ? samples : resampleLinear(samples, sampleRate, CLAP_SAMPLE_RATE);

    const windowSize = CLAP_WINDOW_SECONDS * CLAP_SAMPLE_RATE;
    const seconds = mono.length / CLAP_SAMPLE_RATE;
    // The window plan is shared with max-similarity search so that the vectors we
    // store and the offsets we report come from exactly the same definition of
    // "window". A 30 s cap used to truncate long files here, which meant the tail of
    // an ambience bed could never match anything; `windowOffsets` instead samples up
    // to MAXSIM_MAX_WINDOWS windows across the whole file, so cost stays bounded
    // while coverage does not.
    const offsetsMs = windowOffsets(seconds * 1000, { maxWindows: MAXSIM_MAX_WINDOWS });
    // A pathological duration must not turn one file into an hour of inference.
    const capped = offsetsMs.filter((offset) => offset < MAX_AUDIO_ANALYSIS_SECONDS * 1000);

    const windows: Float32Array[] = [];
    const usedOffsets: number[] = [];
    for (const offsetMs of capped) {
      const start = Math.round((offsetMs / 1000) * CLAP_SAMPLE_RATE);
      const slice = mono.subarray(start, Math.min(start + windowSize, mono.length));
      // shorter than a second adds more noise than signal
      if (slice.length < CLAP_SAMPLE_RATE) continue;
      // copy: the extractor may keep a reference to the buffer
      windows.push(Float32Array.from(slice));
      usedOffsets.push(offsetMs);
    }
    if (windows.length === 0) {
      windows.push(mono.subarray(0, Math.min(mono.length, windowSize)));
      usedOffsets.push(0);
    }

    const vectors: Float32Array[] = [];
    const weights: number[] = [];
    for (const window of windows) {
      const features = await this.processor(window);
      const input = features.input_features ?? (Object.values(features)[0] as Tensor);
      const output = await this.audioModel({ input_features: input });
      const embeds = output.audio_embeds ?? output.embeds;
      if (!embeds) throw new Error('CLAP audio tower returned no audio_embeds tensor');
      const width = embeds.dims[embeds.dims.length - 1] ?? this.dim;
      vectors.push(l2Normalize(Float32Array.from(embeds.data.subarray(0, width))));
      weights.push(Math.max(1e-4, rms(window)));
    }

    const mean = weightedMean(vectors, weights);
    const onset = vectors[0] ?? mean;
    return {
      mean,
      onset,
      frames: vectors.length > 1 ? vectors : undefined,
      // Only meaningful alongside `frames`; omitted for a single-window file, where
      // the window's own offset would just be 0 and the mean already covers it.
      framesStartMs: vectors.length > 1 ? usedOffsets : undefined,
      framesDurationMs: Math.round((mono.length / CLAP_SAMPLE_RATE) * 1000),
    };
  }
}

/**
 * Build the best embedder available without failing the caller.
 * Any error (host unreachable, unsupported graph, wrong output shape) degrades
 * to the null embedder, and the reason is reported so the UI can explain why
 * semantic search is off.
 */
export async function createEmbedder(options: ClapEmbedderOptions = {}): Promise<{ embedder: Embedder; reason: string | null }> {
  try {
    const embedder = await ClapEmbedder.load(options);
    // Prove the text tower actually runs and returns the expected width before
    // advertising semantic search as available.
    const vectors = await embedder.embedText(['a door closing']);
    if (vectors.length === 0 || vectors[0]!.length !== embedder.dim) {
      throw new Error(`text tower returned ${vectors[0]?.length ?? 0}-d vectors, expected ${embedder.dim}`);
    }
    return { embedder, reason: null };
  } catch (err) {
    return { embedder: new NullEmbedder(), reason: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// small DSP helpers
// ---------------------------------------------------------------------------

export function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / Math.max(1, samples.length));
}

export function weightedMean(vectors: Float32Array[], weights: number[]): Float32Array {
  const first = vectors[0];
  const dim = first ? first.length : 0;
  const out = new Float32Array(dim);
  let total = 0;
  for (let i = 0; i < vectors.length; i += 1) {
    const w = weights[i] ?? 1;
    const v = vectors[i]!;
    total += w;
    for (let d = 0; d < dim; d += 1) {
      out[d] = (out[d] ?? 0) + (v[d] ?? 0) * w;
    }
  }
  if (total > 0) {
    for (let d = 0; d < dim; d += 1) {
      out[d] = (out[d] ?? 0) / total;
    }
  }
  return l2Normalize(out);
}

/** Linear resampling. Good enough for embedding input; not for playback. */
export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = toRate / fromRate;
  const length = Math.max(1, Math.floor(input.length * ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = src - i0;
    out[i] = (input[i0] ?? 0) * (1 - frac) + (input[i1] ?? 0) * frac;
  }
  return out;
}
