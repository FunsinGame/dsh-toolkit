/**
 * The staged index pipeline.
 *
 * The product requirement that drives this design: a freshly imported library
 * must be browsable, keyword-searchable and playable within minutes, and only
 * then should the expensive per-file work (waveform peaks, then audio
 * embeddings) trickle in behind it. So the pipeline is explicitly staged and
 * each stage records its progress on the asset row, which makes it resumable
 * across restarts for free — a file at stage < N is simply still pending.
 *
 * Stage 1 must stay IO-bound and fast. Stage 2 and 3 are the slow ones and run
 * through a concurrency-limited queue so the UI stays responsive.
 */

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { availableParallelism } from 'node:os';

import { buildSearchText, IndexStage, type EmbeddedMetadata, type DspFeatures, type Embedder } from '@sounddesk/core';
import { probeWav, decodeWav, analyzeDsp, buildPeaks, serializePeaks } from '@sounddesk/audio-wav';

import { decodeAudio, findFfmpeg, probeWithFfmpeg } from './decode.js';

import type { Catalog } from './db.js';
import { hashFile, discoverFiles, type DiscoveredFile } from './scanner.js';
import { UcsClassifier } from './ucs-classifier.js';
import { mkdir, writeFile } from 'node:fs/promises';

export interface JobState {
  id: string;
  kind: 'scan' | 'waveform' | 'embed' | 'tag' | 'reindex';
  libraryId: number | null;
  state: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  total: number;
  done: number;
  failed: number;
  startedAt: number;
  updatedAt: number;
  etaMs: number | null;
  currentPath: string | null;
  error: string | null;
}

export interface IndexerOptions {
  catalog: Catalog;
  classifier: UcsClassifier;
  /** optional — when absent, semantic search stays disabled and stage 3 is skipped */
  embedder?: Embedder | null;
  /** ms of audio decoded per file for DSP features */
  dspWindowMs?: number;
  /** how many files to process concurrently in the slow stages */
  concurrency?: number;
  /** directory for the .peaks cache; defaults to the catalog dir */
  peaksDir?: string;
}

export class Indexer extends EventEmitter {
  private readonly catalog: Catalog;
  private readonly classifier: UcsClassifier;
  private readonly embedder: Embedder | null;
  private readonly dspWindowMs: number;
  private readonly peaksDir: string;
  private readonly concurrency: number;
  private readonly jobs = new Map<string, JobState>();
  private abortControllers = new Map<string, AbortController>();
  private cancelled = new Set<string>();

  constructor(opts: IndexerOptions) {
    super();
    this.catalog = opts.catalog;
    this.classifier = opts.classifier;
    this.embedder = opts.embedder ?? null;
    this.dspWindowMs = opts.dspWindowMs ?? 30_000;
    this.peaksDir = opts.peaksDir ?? path.join(opts.catalog.dataDir, 'peaks');
    // Inference is CPU-bound and onnxruntime serialises it, so throughput
    // plateaus quickly: measured on a 16-core machine, 8 concurrent workers were
    // only 1.34x faster than one. More workers therefore buy almost nothing and
    // cost a lot of memory (each holds a decoded 30 s mono buffer), so the
    // default stays deliberately low.
    const cores = availableParallelism();
    this.concurrency = opts.concurrency ?? Math.max(2, Math.min(4, Math.floor(cores / 4)));
  }

  listJobs(): JobState[] {
    return [...this.jobs.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  getJob(id: string): JobState | undefined {
    return this.jobs.get(id);
  }

  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || (job.state !== 'running' && job.state !== 'queued')) return false;
    this.cancelled.add(jobId);
    this.abortControllers.get(jobId)?.abort();
    this.transition(job, 'cancelled');
    return true;
  }

  /**
   * Stage 1 — the fast pass.
   *
   * Discovers files, inserts/updates rows, then reads each file's header plus a
   * bounded slice of audio for DSP features. After this returns, the library is
   * fully browsable, keyword-searchable and playable.
   */
  async runFastPass(libraryId: number, root: string, opts: { maxFiles?: number } = {}): Promise<JobState> {
    const library = this.catalog.getLibrary(libraryId);
    if (!library) throw new Error(`library ${libraryId} not found`);

    const job = this.createJob('scan', libraryId);
    const controller = new AbortController();
    this.abortControllers.set(job.id, controller);

    try {
      this.transition(job, 'running');
      const files = await discoverFiles({
        root,
        maxFiles: opts.maxFiles,
        signal: controller.signal,
        onProgress: (found) => {
          job.total = found;
          job.currentPath = null;
          this.emitUpdate(job);
        },
      });

      job.total = files.length;
      this.emitUpdate(job);

      const known = this.catalog.listAssetPaths(libraryId);

      // Insert/update rows first so the count is honest immediately, then do the
      // expensive header reads.
      for (const file of files) {
        const relativePath = path.relative(root, file.path);
        this.catalog.upsertAsset({
          libraryId,
          path: file.path,
          dir: file.dir,
          filename: file.filename,
          extension: file.extension,
          sizeBytes: file.sizeBytes,
          mtimeMs: file.mtimeMs,
          searchText: buildSearchText([file.filename, relativePath]),
        });
      }

      this.emit('library.changed', { libraryId, assetCount: files.length });

      const started = Date.now();
      let processed = 0;
      const filesByPath = new Map(files.map((f) => [f.path, f] as const));

      for (const file of files) {
        if (controller.signal.aborted || this.cancelled.has(job.id)) break;
        const assetId = this.catalog.getAssetByPath(file.path);
        if (assetId === null) continue;

        // Skip unchanged files that already have metadata.
        const prior = known.get(file.path);
        const row = this.catalog.getAssetRow(assetId);
        const alreadyFast = prior && prior.sizeBytes === file.sizeBytes && prior.mtimeMs === file.mtimeMs && Number(row?.stage ?? 0) >= 1;

        job.currentPath = file.path;
        if (!alreadyFast) {
          try {
            await this.indexMetadata(assetId, file, libraryId, root);
            processed += 1;
          } catch (err) {
            job.failed += 1;
            this.catalog.setError(assetId, errorMessage(err));
          }
        }

        job.done += 1;
        if (job.done % 25 === 0 || job.done === job.total) {
          const elapsed = Date.now() - started;
          const rate = job.done / Math.max(1, elapsed);
          job.etaMs = job.done > 0 ? Math.round((job.total - job.done) / Math.max(1e-6, rate)) : null;
          this.emitUpdate(job);
        }
      }

      void filesByPath;
      this.transition(job, controller.signal.aborted ? 'cancelled' : 'done');
      this.emit('library.changed', { libraryId, assetCount: this.catalog.countAssets(libraryId) });
      return job;
    } catch (err) {
      job.error = errorMessage(err);
      this.transition(job, 'failed');
      throw err;
    } finally {
      this.abortControllers.delete(job.id);
      this.cancelled.delete(job.id);
    }
  }

  /** Read one file's header, embedded metadata, partial hash and DSP features. */
  async indexMetadata(assetId: number, file: DiscoveredFile, libraryId: number, root: string): Promise<void> {
    const ext = file.extension;
    const isWav = ext === '.wav' || ext === '.bwf' || ext === '.wave' || ext === '.w64' || ext === '.rf64';

    let durationMs: number | null = null;
    let sampleRate: number | null = null;
    let bitDepth: number | null = null;
    let channels: number | null = null;
    let codec: string | null = ext.replace('.', '').toUpperCase();
    let audioFormatTag: number | null = null;
    let isFloat = false;
    let embedded: EmbeddedMetadata | null = null;
    let dsp: DspFeatures | null = null;
    let lastError: string | null = null;

    if (isWav) {
      try {
        const probe = await probeWav(file.path);
        durationMs = probe.durationMs;
        sampleRate = probe.format.sampleRate;
        bitDepth = probe.format.bitsPerSample;
        channels = probe.format.channels;
        audioFormatTag = probe.format.audioFormat;
        isFloat = probe.format.isFloat;
        codec = isFloat ? 'PCM-FLOAT' : 'PCM';
        if (probe.unsupportedCodec) {
          codec = `WAV/${probe.format.audioFormat}`;
        }
        embedded = mapEmbedded(probe);

        if (!probe.unsupportedCodec) {
          try {
            const decoded = await decodeWav(file.path, { maxMs: this.dspWindowMs });
            const features = analyzeDsp(decoded.data, decoded.sampleRate);
            dsp = {
              peak: features.peak,
              rms: features.rms,
              peakDb: features.peakDb,
              rmsDb: features.rmsDb,
              decayMs: features.decayMs,
              spectralCentroidHz: features.spectralCentroidHz,
              highFrequencyRatio: features.highFrequencyRatio,
              stereoCorrelation: features.stereoCorrelation,
              hasVoiceLikeActivity: features.hasVoiceLikeActivity,
              tonality: features.tonality,
            };
          } catch (err) {
            // A file we can probe but not decode is still useful for keyword search.
            lastError = `decode: ${errorMessage(err)}`;
          }
        }
      } catch (err) {
        lastError = `probe: ${errorMessage(err)}`;
      }
    } else {
      /**
       * Non-RIFF containers (FLAC, MP3, AIFF, OGG, M4A…).
       *
       * Metadata comes from ffmpeg when it is available. Without it the file is
       * still indexed — name, size and hash are enough for keyword search and for
       * the backup to identify it — but it gets no duration, no DSP features and no
       * waveform, so the UI must not pretend otherwise. That difference is recorded
       * in `lastError` so it is visible rather than mysterious.
       */
      const probe = await probeWithFfmpeg(file.path);
      if (probe) {
        durationMs = probe.durationMs;
        sampleRate = probe.sampleRate;
        bitDepth = probe.bitDepth;
        channels = probe.channels;
        if (probe.codec) codec = probe.codec.toUpperCase();
      } else {
        const ffmpegInfo = await findFfmpeg();
        lastError = ffmpegInfo
          ? 'ffmpeg 无法读取这个文件的格式信息'
          : `这个格式（${codec}）需要 ffmpeg 才能读取时长与波形`;
      }

      // The fingerprint and the waveform both come from decoded samples, so they
      // share one decode rather than spawning ffmpeg twice per file.
      const decoded = await decodeAudio(file.path, { mono: true, maxSeconds: this.dspWindowMs / 1000 });
      if (decoded.ok) {
        // ffmpeg resamples to a known rate, so trust its numbers over the probe's
        // when the two disagree.
        sampleRate = decoded.sampleRate;
        if (durationMs === null && decoded.channelData[0]) {
          durationMs = Math.round((decoded.channelData[0].length / decoded.sampleRate) * 1000);
        }
        try {
          const features = analyzeDsp(decoded.channelData, decoded.sampleRate);
          dsp = {
            peak: features.peak,
            rms: features.rms,
            peakDb: features.peakDb,
            rmsDb: features.rmsDb,
            decayMs: features.decayMs,
            spectralCentroidHz: features.spectralCentroidHz,
            highFrequencyRatio: features.highFrequencyRatio,
            stereoCorrelation: features.stereoCorrelation,
            hasVoiceLikeActivity: features.hasVoiceLikeActivity,
            tonality: features.tonality,
          };
          lastError = null;
        } catch (err) {
          lastError = `dsp: ${errorMessage(err)}`;
        }
      } else if (lastError === null) {
        lastError = decoded.reason;
      }
    }

    const contentHash = await hashFile(file.path, file.sizeBytes).catch(() => null);

    const classification = await this.classifier.classify({
      filename: file.filename,
      relativePath: path.relative(root, file.path),
      embedded,
      dsp,
      durationMs,
    });

    const searchText = buildSearchText([
      file.filename,
      path.relative(root, file.path),
      embedded?.description ?? null,
      embedded?.keywords?.join(' ') ?? null,
      embedded?.project ?? null,
      embedded?.scene ?? null,
      embedded?.note ?? null,
      classification.catId,
      classification.category,
      classification.subCategory,
    ]);

    this.catalog.applyMetadata(assetId, {
      durationMs,
      sampleRate,
      bitDepth,
      channels,
      codec,
      audioFormatTag,
      isFloat,
      contentHash,
      emDescription: embedded?.description ?? null,
      emKeywords: embedded?.keywords ? JSON.stringify(embedded.keywords) : null,
      emDesigner: embedded?.designer ?? null,
      emRecorder: embedded?.recorder ?? null,
      emCopyright: embedded?.copyright ?? null,
      emLibrary: embedded?.library ?? null,
      emOriginator: embedded?.originator ?? null,
      emOriginationDate: embedded?.originationDate ?? null,
      emProject: embedded?.project ?? null,
      emScene: embedded?.scene ?? null,
      emTake: embedded?.take ?? null,
      emNote: embedded?.note ?? null,
      emIxml: embedded?.ixml ? JSON.stringify(embedded.ixml) : null,
      emInfo: embedded?.info ? JSON.stringify(embedded.info) : null,
      emCodingHistory: embedded?.codingHistory ? JSON.stringify(embedded.codingHistory) : null,
      hasBext: embedded?.hasBext ?? false,
      chunks: embedded?.chunks ? JSON.stringify(embedded.chunks) : null,
      searchText,
      lastError,
    });

    if (dsp) {
      this.catalog.applyDsp(assetId, {
        peakDb: dsp.peakDb,
        rmsDb: dsp.rmsDb,
        decayMs: dsp.decayMs,
        centroidHz: dsp.spectralCentroidHz,
        hfRatio: dsp.highFrequencyRatio,
        stereoCorr: dsp.stereoCorrelation,
        hasVoice: dsp.hasVoiceLikeActivity,
        tonality: dsp.tonality,
      });
    }

    this.catalog.applyClassification(assetId, {
      catId: classification.catId,
      confidence: classification.confidence,
      source: classification.source,
      alternatives: classification.alternatives.map((a) => ({
        catId: a.catId,
        score: a.score,
        evidence: a.evidence,
      })),
    });

    void libraryId;
  }

  /**
   * Stage 2 — waveform peaks. Lower priority than embedding in the UI, but
   * cheaper, so we run it first to make scrubbing feel complete.
   */
  async runWaveformPass(libraryId: number, limit = 0): Promise<JobState> {
    const job = this.createJob('waveform', libraryId);
    const controller = new AbortController();
    this.abortControllers.set(job.id, controller);
    try {
      this.transition(job, 'running');
      await mkdir(this.peaksDir, { recursive: true });
      const pending = this.pendingFor(libraryId, IndexStage.Waveform, limit);
      job.total = pending.length;
      this.emitUpdate(job);

      await this.runPool(pending, job, controller, async (item) => {
        try {
          // Decode through the shared decoder so a FLAC gets a waveform wherever
          // ffmpeg is available. Peak building wants every channel, hence no `mono`.
          const decoded = await decodeAudio(item.path, { maxSeconds: 10 * 60 });
          if (!decoded.ok) {
            // Keep the file browsable, just without a waveform, and record why.
            this.catalog.markPeaks(item.id, null);
            if (decoded.needsFfmpeg) this.catalog.setError(item.id, `peaks: ${decoded.reason}`);
            return;
          }
          const peaks = buildPeaks(decoded.channelData, { sampleRate: decoded.sampleRate });
          const target = this.peaksFileFor(item.id);
          await writeFile(target, serializePeaks(peaks));
          this.catalog.markPeaks(item.id, target);
        } catch (err) {
          // Undecodable file: keep it browsable, just without a waveform.
          this.catalog.markPeaks(item.id, null);
          this.catalog.setError(item.id, `peaks: ${errorMessage(err)}`);
        }
      });

      this.transition(job, controller.signal.aborted ? 'cancelled' : 'done');
      return job;
    } catch (err) {
      job.error = errorMessage(err);
      this.transition(job, 'failed');
      throw err;
    } finally {
      this.abortControllers.delete(job.id);
      this.cancelled.delete(job.id);
    }
  }

  /**
   * Stage 3 — audio embeddings, which is what makes semantic search cover a
   * file. Resumable: any asset at stage < 3 is picked up on the next run.
   */
  async runEmbedPass(libraryId: number, limit = 0): Promise<JobState> {
    const job = this.createJob('embed', libraryId);
    const controller = new AbortController();
    this.abortControllers.set(job.id, controller);
    try {
      if (!this.embedder || !this.embedder.ready) {
        job.error = 'no embedding model is available; semantic search stays disabled';
        this.transition(job, 'done');
        return job;
      }
      this.transition(job, 'running');
      const pending = this.pendingFor(libraryId, IndexStage.Embedded, limit);
      job.total = pending.length;
      this.emitUpdate(job);
      const modelId = this.embedder.id;
      const dim = this.embedder.dim;

      await this.runPool(pending, job, controller, async (item) => {
        // CLAP expects mono 48 kHz; the decoder resamples and the embedder handles
        // anything left over.
        const decoded = await decodeAudio(item.path, { mono: true, maxSeconds: 60 });
        if (!decoded.ok) {
          // Not fatal for the library, but the asset stays un-embedded, so record the
          // reason: silently leaving it at stage 2 forever is worse.
          this.catalog.setError(item.id, `embed: ${decoded.reason}`);
          return;
        }
        const mono = decoded.channelData.length === 1 ? decoded.channelData[0]! : mixToMono(decoded.channelData);
        const result = await this.embedder!.embedAudio(mono, decoded.sampleRate);
        this.catalog.putEmbedding(item.id, modelId, dim, result.mean, result.onset ?? null);
      });

      this.transition(job, controller.signal.aborted ? 'cancelled' : 'done');
      return job;
    } catch (err) {
      job.error = errorMessage(err);
      this.transition(job, 'failed');
      throw err;
    } finally {
      this.abortControllers.delete(job.id);
      this.cancelled.delete(job.id);
    }
  }

  /** Run whichever stages still have pending work — used on startup resume. */
  async resumePending(libraryId: number): Promise<void> {
    const stage = this.catalog.stats().byStage;
    const counts = {
      metadata: Number(stage['0'] ?? 0),
      waveform: Number(stage['1'] ?? 0),
      embedded: Number(stage['2'] ?? 0),
    };
    if (counts.metadata > 0) {
      const library = this.catalog.getLibrary(libraryId);
      if (library) await this.runFastPass(libraryId, library.root);
    }
    if (counts.waveform > 0) await this.runWaveformPass(libraryId);
    if (counts.embedded > 0 && this.embedder?.ready) await this.runEmbedPass(libraryId);
  }

  // -- internals ---------------------------------------------------------

  private pendingFor(libraryId: number, stage: number, limit: number): Array<{ id: number; path: string; filename: string }> {
    return this.catalog.findPending(stage, limit > 0 ? limit : 1_000_000, libraryId);
  }

  private async runPool(
    items: Array<{ id: number; path: string; filename: string }>,
    job: JobState,
    controller: AbortController,
    worker: (item: { id: number; path: string; filename: string }) => Promise<void>,
  ): Promise<void> {
    let cursor = 0;
    const started = Date.now();
    const next = async (): Promise<void> => {
      while (!controller.signal.aborted && !this.cancelled.has(job.id)) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        const item = items[index]!;
        job.currentPath = item.path;
        try {
          await worker(item);
        } catch (err) {
          job.failed += 1;
          this.catalog.setError(item.id, errorMessage(err));
        }
        job.done += 1;
        const elapsed = Date.now() - started;
        const rate = job.done / Math.max(1, elapsed);
        job.etaMs = job.done > 0 ? Math.round((job.total - job.done) / Math.max(1e-6, rate)) : null;
        if (job.done % 10 === 0 || job.done === job.total) this.emitUpdate(job);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, items.length) }, () => next()));
  }

  private peaksFileFor(assetId: number): string {
    return path.join(this.peaksDir, `${assetId}.peaks`);
  }

  private createJob(kind: JobState['kind'], libraryId: number | null): JobState {
    const job: JobState = {
      id: `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      libraryId,
      state: 'queued',
      total: 0,
      done: 0,
      failed: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      etaMs: null,
      currentPath: null,
      error: null,
    };
    this.jobs.set(job.id, job);
    this.catalog.saveJob({ ...job, libraryId: job.libraryId });
    return job;
  }

  private transition(job: JobState, state: JobState['state']): void {
    job.state = state;
    job.updatedAt = Date.now();
    if (state === 'done' || state === 'failed' || state === 'cancelled') {
      job.etaMs = 0;
      job.currentPath = null;
    }
    this.catalog.saveJob({ ...job, libraryId: job.libraryId });
    this.emitUpdate(job);
  }

  private emitUpdate(job: JobState): void {
    job.updatedAt = Date.now();
    this.emit('job', { ...job });
  }
}

function mapEmbedded(probe: Awaited<ReturnType<typeof probeWav>>): EmbeddedMetadata {
  const bext = probe.embedded.bext;
  const ixml = probe.embedded.ixml ?? null;
  const info = probe.embedded.info ?? null;
  const keywordsRaw = ixml?.KEYWORDS ?? ixml?.KEYWORD ?? info?.IKEY ?? null;
  const keywords = keywordsRaw
    ? keywordsRaw
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

  return {
    description: bext?.description?.trim() || ixml?.DESCRIPTION || info?.ICMT || info?.INAM || null,
    keywords,
    designer: ixml?.DESIGNER ?? ixml?.SOUNDDESIGNER ?? null,
    recorder: ixml?.RECORDER ?? ixml?.RECORDIST ?? null,
    copyright: ixml?.COPYRIGHT ?? info?.ICOP ?? null,
    library: ixml?.LIBRARY ?? ixml?.SOURCELIBRARY ?? null,
    originator: bext?.originator?.trim() || ixml?.ORIGINATOR || null,
    originationDate: bext?.originationDate?.trim() || ixml?.ORIGINATIONDATE || null,
    project: ixml?.PROJECT ?? null,
    scene: ixml?.SCENE ?? null,
    take: ixml?.TAKE ?? null,
    note: ixml?.NOTE ?? null,
    ixml,
    info,
    codingHistory: bext?.codingHistory && bext.codingHistory.length > 0 ? bext.codingHistory : null,
    hasBext: Boolean(bext),
    chunks: probe.chunks ?? null,
  };
}

function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0]!;
  const length = channels[0]!.length;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    for (const ch of channels) sum += ch[i] ?? 0;
    out[i] = sum / channels.length;
  }
  return out;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Stat helper used by callers that need to confirm a file is still there. */
export async function fileStillExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
