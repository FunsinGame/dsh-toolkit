/**
 * Query by example, from outside the library — plan §3.4.
 *
 * Two related capabilities, both of which are just "embed some audio, then run the
 * vector retriever with it":
 *
 *  - **probe** — a reference clip the user drags in. It is decoded, embedded once and
 *    used as the query. Nothing is written to the library, so "use and discard" is
 *    the default rather than an option: there is no temporary namespace to clean up
 *    because there is no namespace at all.
 *  - **slice** — search using *part* of an indexed file. This is the one the plan
 *    calls out as a differentiator ("the reference product marks this as coming
 *    soon"), and it needs no schema change either: the embedding for one file is
 *    recomputed over the selected window on demand. That costs one decode plus one
 *    audio-tower pass for a single file, which is cheap enough between a click and
 *    a result, and avoids storing a few hundred sub-vectors for every long file.
 *
 * Query-by-example deliberately bypasses the fusion stage: there is no text query to
 * fuse with, and the vector similarity *is* the answer. MMR is applied in `similar`
 * mode by the search service, which is what stops a result page filling up with one
 * recording session.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Embedder } from '@sounddesk/core';

import { decodeAudio, type DecodeResult } from './decode.js';
import type { Catalog } from './db.js';
import type { VectorIndex } from './search.js';

/** Longest reference clip we accept, matching the plan's ≤60s. */
export const MAX_PROBE_SECONDS = 60;

export interface ProbeRequest {
  /** only one of these is given */
  filePath?: string;
  bytes?: Uint8Array;
  /** for `bytes`: the name to report and to guess the container from */
  filename?: string;
}

export interface ProbePreview {
  /** how long the reference is, in seconds */
  durationSeconds: number;
  sampleRate: number;
  /** channels after decoding; 1 for a mono file */
  channels: number;
  /** peak amplitude, so the UI can tell "silent file" from "no match" */
  peak: number;
  /** named reasons the clip cannot be used, e.g. too short */
  warnings: string[];
}

export class ProbeError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ProbeError';
    this.status = status;
  }
}

/**
 * Where a probe's temporary file goes.
 *
 * A probe arrives as bytes with a name we cannot trust, so it is written to a scratch
 * path under the data directory and deleted as soon as it is decoded. The upload's
 * name is sanitised into a *file name*, never used as a path — `path.basename` after
 * stripping separators, so a crafted name cannot escape the scratch directory.
 */
export function probeScratchPath(dataDir: string, filename: string | undefined, extension: string): string {
  const flattened = (filename ?? 'probe').replace(/[\\/]/g, '_');
  const cleaned = path.basename(flattened).replace(/[^\w.\- ]+/g, '_').slice(-70);
  const base = cleaned.length > 0 ? cleaned : `probe${extension}`;
  const withExt = base.toLowerCase().endsWith(extension) ? base : `${base}${extension}`;
  return path.join(dataDir, 'probe', `${Date.now()}-${withExt}`);
}

/** Extension implied by a name, defaulting to `.wav` so the RIFF reader gets a chance. */
export function extensionOf(filename: string | undefined): string {
  if (!filename) return '.wav';
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return '.wav';
  const ext = filename.slice(dot).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '.wav';
}

/** Reject a clip that cannot produce a meaningful embedding. */
export function assessProbe(decoded: { channelData: Float32Array[]; sampleRate: number }): ProbePreview {
  const channels = decoded.channelData.length;
  const frames = decoded.channelData[0]?.length ?? 0;
  const durationSeconds = decoded.sampleRate > 0 ? frames / decoded.sampleRate : 0;

  let peak = 0;
  for (const channel of decoded.channelData) {
    for (const value of channel) peak = Math.max(peak, Math.abs(value));
  }

  const warnings: string[] = [];
  // CLAP's window is ~10s; far less than that and the embedding is mostly padding.
  if (durationSeconds < 0.5) warnings.push('参考音频太短（不足 0.5 秒），结果可能不可靠');
  if (durationSeconds > MAX_PROBE_SECONDS) {
    warnings.push(`参考音频超过 ${MAX_PROBE_SECONDS} 秒，只取开头部分`);
  }
  if (peak < 0.001) warnings.push('参考音频几乎是静音，可能得不到有意义的结果');

  return { durationSeconds, sampleRate: decoded.sampleRate, channels, peak, warnings };
}

export interface ProbeDeps {
  catalog: Catalog;
  vectorIndex: VectorIndex;
  embedder: Embedder | null;
  dataDir: string;
}

export interface ProbeMatches {
  preview: ProbePreview;
  /** asset id → cosine similarity, best first */
  matches: Array<{ assetId: number; score: number; via: 'probe' | 'slice' }>;
  warnings: string[];
  /** which mechanism answered, so the UI can say so */
  source: 'probe' | 'slice';
}

/**
 * Runs the vector retriever with an audio embedding instead of a text one.
 *
 * Kept as a service rather than folded into `SearchService` because the flow has
 * nothing in common with a text search: no parsing, no rewriting, no FTS and no
 * fusion. Sharing a function would mean threading "is this a text query?" through
 * every stage.
 */
export class ProbeService {
  /**
   * Plain field, not a constructor parameter property: Node's
   * `--experimental-strip-types` rejects that syntax and these sources run unbuilt
   * in tests and in `pnpm dev`. See CONTRIBUTING notes in the README.
   */
  private readonly deps: ProbeDeps;

  constructor(deps: ProbeDeps) {
    this.deps = deps;
  }

  /**
   * Search using a reference clip from outside the library.
   *
   * `limit` is how many neighbours to return before any MMR-style thinning the
   * caller applies.
   */
  async searchWithProbe(request: ProbeRequest, limit = 200): Promise<ProbeMatches> {
    const decoded = await this.decodeProbe(request);
    return this.searchWithSamples(decoded.channelData, decoded.sampleRate, limit, 'probe');
  }

  /**
   * Search using a window of an indexed file.
   *
   * The window is re-embedded on demand rather than stored: one decode and one
   * audio-tower pass for a single file, in exchange for no sub-vector table and no
   * re-index when this feature changes.
   */
  async searchWithSlice(
    assetId: number,
    window: { offsetMs?: number; durationMs?: number },
    limit = 200,
  ): Promise<ProbeMatches> {
    const row = this.deps.catalog.getAssetRow(assetId);
    if (!row) throw new ProbeError('找不到这条素材', 404);
    const filePath = String(row.path ?? '');
    if (!filePath) throw new ProbeError('这条素材没有文件路径');

    const offsetSeconds = Math.max(0, (window.offsetMs ?? 0) / 1000);
    const durationSeconds = window.durationMs !== undefined ? Math.max(0, window.durationMs / 1000) : undefined;

    // Decode the whole (bounded) file and take the window in memory. ffmpeg cannot
    // seek precisely without `-ss` before input, and our own RIFF reader has no seek
    // either, so one decode is the simplest correct approach.
    const decoded = await decodeAudio(filePath, { sampleRate: undefined });
    if (!decoded.ok) throw new ProbeError(decoded.reason, decoded.needsFfmpeg ? 501 : 415);

    const windowed = sliceChannels(decoded.channelData, decoded.sampleRate, offsetSeconds, durationSeconds);
    if (windowed.channelData[0]!.length === 0) {
      throw new ProbeError('选区落在文件之外，没有可用的采样');
    }

    const result = await this.searchWithSamples(windowed.channelData, decoded.sampleRate, limit, 'slice');
    return { ...result, preview: assessProbe(windowed) };
  }

  private async decodeProbe(request: ProbeRequest): Promise<DecodeResult & { ok: true }> {
    if (request.bytes && request.bytes.byteLength > 0) {
      // 64 MB covers an uncompressed minute of 48 kHz stereo with room to spare.
      if (request.bytes.byteLength > 64 * 1024 * 1024) {
        throw new ProbeError('参考音频过大（上限 64MB）', 413);
      }
      const extension = extensionOf(request.filename);
      const scratch = probeScratchPath(this.deps.dataDir, request.filename, extension);
      const { mkdir, rm, writeFile } = await import('node:fs/promises');
      await mkdir(path.dirname(scratch), { recursive: true });
      await writeFile(scratch, request.bytes);
      try {
        const decoded = await decodeAudio(scratch, { maxSeconds: MAX_PROBE_SECONDS });
        if (!decoded.ok) throw new ProbeError(decoded.reason, decoded.needsFfmpeg ? 501 : 415);
        return decoded;
      } finally {
        // Deleted as soon as it is decoded: a probe is not library content, and
        // leaving user audio lying in the data directory would be a surprise.
        await rm(scratch, { force: true }).catch(() => {});
      }
    }

    if (!request.filePath) throw new ProbeError('需要 filePath 或音频数据');
    const decoded = await decodeAudio(request.filePath, { maxSeconds: MAX_PROBE_SECONDS });
    if (!decoded.ok) throw new ProbeError(decoded.reason, decoded.needsFfmpeg ? 501 : 415);
    return decoded;
  }

  private async searchWithSamples(
    channelData: Float32Array[],
    sampleRate: number,
    limit: number,
    source: 'probe' | 'slice',
  ): Promise<ProbeMatches> {
    if (!this.deps.embedder || !this.deps.embedder.ready) {
      throw new ProbeError('语义模型未就绪，无法用声音搜索（需要在有模型的情况下启动引擎）', 501);
    }
    // Same freshness rule as a text search, and for the same reason: the index is
    // lazy, and a backfill running in another process changes it continuously. The
    // probe path is the second entry point into the vector index, so it has to do
    // this too — without it, the first probe after startup reports an empty library.
    this.deps.vectorIndex.ensureFresh();
    if (this.deps.vectorIndex.size === 0) {
      throw new ProbeError('库里还没有声音指纹，先完成向量索引', 409);
    }

    const preview = assessProbe({ channelData, sampleRate });
    const mono = channelData.length === 1 ? channelData[0]! : mixToMono(channelData);
    // The embedder resamples to CLAP's 48 kHz and reports the onset window too; for
    // a reference clip the mean vector is what we compare with, since the reference
    // may be an ambience rather than an impact.
    const embedding = await this.deps.embedder.embedAudio(mono, sampleRate);
    const matches = this.deps.vectorIndex.search(embedding.mean, limit, 'mean');

    return {
      preview,
      matches: matches.map((entry) => ({ assetId: entry.id, score: entry.score, via: source })),
      warnings: preview.warnings,
      source,
    };
  }
}

/** Take `[offsetSeconds, offsetSeconds + durationSeconds)` from every channel. */
export function sliceChannels(
  channelData: Float32Array[],
  sampleRate: number,
  offsetSeconds: number,
  durationSeconds: number | undefined,
): { channelData: Float32Array[]; sampleRate: number } {
  const start = Math.max(0, Math.floor(offsetSeconds * sampleRate));
  const length = channelData[0]?.length ?? 0;
  if (start >= length) return { channelData: channelData.map(() => new Float32Array(0)), sampleRate };
  const end = durationSeconds === undefined ? length : Math.min(length, start + Math.floor(durationSeconds * sampleRate));
  return {
    channelData: channelData.map((channel) => channel.subarray(start, Math.max(start, end))),
    sampleRate,
  };
}

/** Average channels down to one. */
export function mixToMono(channelData: Float32Array[]): Float32Array {
  if (channelData.length === 1) return channelData[0]!;
  const frames = Math.min(...channelData.map((channel) => channel.length));
  const out = new Float32Array(frames);
  for (const channel of channelData) {
    for (let i = 0; i < frames; i += 1) {
      out[i] = (out[i] ?? 0) + (channel[i] ?? 0);
    }
  }
  for (let i = 0; i < frames; i += 1) out[i] = (out[i] ?? 0) / channelData.length;
  return out;
}

/** Read a probe from disk, for the upload path's tests. */
export async function readProbeBytes(filePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(filePath));
}
