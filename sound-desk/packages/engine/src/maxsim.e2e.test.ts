/**
 * End-to-end proof of the max-similarity long-file pass (plan §3.4).
 *
 * These tests exist because the failure they cover is invisible to a unit test of
 * the arithmetic: a whole-file embedding is an RMS-weighted mean of its windows, so
 * a two-second sound inside a two-minute file contributes ~1.7% of the vector and
 * the file looks like whatever the other 98% is. Max-sim asks the different
 * question — "does this file CONTAIN the reference" — and this suite pins that it
 * changes the answer end to end, through the real `Indexer` and a real
 * `ProbeService` over real WAV files on disk.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Embedder, EmbeddingResult } from '@sounddesk/core';
import { l2Normalize } from '@sounddesk/core';

import { Catalog } from './db.ts';
import { Indexer } from './indexer.ts';
import { VectorIndex } from './search.ts';
import { UcsClassifier } from './ucs-classifier.ts';
import { createWav } from './test-utils.ts';
import { ProbeService } from './probe.ts';

const SAMPLE_RATE = 48_000;
const MARKER_HZ = 2_400;
const BED_HZ = 300;

/**
 * A tiny stand-in for CLAP that separates pure tones.
 *
 * Each window is projected onto the bin for its dominant frequency, so two
 * different tones are near-orthogonal and a matching tone scores ~1. Deliberately
 * built on the dominant frequency of *the window the embedder was handed*, because
 * that is what lets this test tell a whole-file mean apart from a per-window
 * maximum — an embedding derived from the whole buffer could not.
 */
class ToneEmbedder implements Embedder {
  readonly id = 'tone-test';
  readonly dim = 24;
  readonly ready = true;

  async embedText(): Promise<Float32Array[]> {
    return [];
  }

  async embedAudio(samples: Float32Array, sampleRate: number): Promise<EmbeddingResult> {
    const windowSize = Math.round(10 * sampleRate);
    const windows: Array<{ vector: Float32Array; weight: number }> = [];

    if (samples.length <= windowSize) {
      windows.push({ vector: toneVector(samples, sampleRate, this.dim), weight: Math.max(1e-4, rms(samples)) });
    } else {
      // 10 s windows at a 10 s hop, mirroring CLAP_HOP_SECONDS, so the offsets this
      // test asserts on line up with the ones the service reports.
      for (let start = 0; start < samples.length; start += windowSize) {
        const slice = samples.subarray(start, Math.min(start + windowSize, samples.length));
        if (slice.length < sampleRate) break;
        windows.push({ vector: toneVector(slice, sampleRate, this.dim), weight: Math.max(1e-4, rms(slice)) });
      }
    }
    if (windows.length === 0) {
      windows.push({ vector: toneVector(samples, sampleRate, this.dim), weight: 1 });
    }

    const mean = new Float32Array(this.dim);
    let total = 0;
    for (const window of windows) {
      total += window.weight;
      for (let i = 0; i < this.dim; i += 1) mean[i] = (mean[i] ?? 0) + window.vector[i]! * window.weight;
    }
    for (let i = 0; i < this.dim; i += 1) mean[i] = (mean[i] ?? 0) / total;

    const frames = windows.map((window) => window.vector);
    return {
      mean: l2Normalize(mean),
      onset: frames[0]!,
      frames: frames.length > 1 ? frames : undefined,
      framesStartMs: frames.length > 1 ? windows.map((_, index) => index * 10_000) : undefined,
    };
  }
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const value of samples) sum += value * value;
  return Math.sqrt(sum / Math.max(1, samples.length));
}

/**
 * Project a signal onto the bin for its dominant frequency, plus a weaker
 * neighbour so nearby tones are graded rather than all-or-nothing.
 */
function toneVector(samples: Float32Array, sampleRate: number, dim: number): Float32Array {
  const freq = dominantFrequency(samples, sampleRate);
  const axis = Math.min(dim - 1, Math.max(0, Math.round(freq / 200)));
  const v = new Float32Array(dim);
  v[axis] = 1;
  if (axis + 1 < dim) v[axis + 1] = 0.25;
  return l2Normalize(v);
}

/** Zero-crossing frequency estimate — exact for a pure tone, which is all we need. */
function dominantFrequency(samples: Float32Array, sampleRate: number): number {
  let crossings = 0;
  for (let i = 1; i < samples.length; i += 1) {
    if ((samples[i]! >= 0) !== (samples[i - 1]! >= 0)) crossings += 1;
  }
  return (crossings * sampleRate) / (2 * Math.max(1, samples.length));
}

function tone(freq: number, seconds: number): Float32Array {
  const frames = Math.round(seconds * SAMPLE_RATE);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) out[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  return out;
}

function concat(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

interface Harness {
  root: string;
  catalog: Catalog;
  indexer: Indexer;
  probe: ProbeService;
  ids: Record<'marker' | 'long' | 'other', number>;
  cleanup: () => void;
}

/**
 * Build and index a library whose long file contains the marker in one window only.
 *
 * `long_bed.wav` is 120 s: bed, then the marker for 10 s at t=60 s, then bed again.
 * Its mean vector is therefore essentially the bed, while one of its windows is the
 * marker — which is exactly the situation mean-pooling gets wrong.
 */
async function makeHarness(): Promise<Harness> {
  const root = mkdtempSync(path.join(tmpdir(), 'sounddesk-maxsim-'));
  writeFileSync(path.join(root, 'marker.wav'), createWav(tone(MARKER_HZ, 8), SAMPLE_RATE));
  writeFileSync(
    path.join(root, 'long_bed.wav'),
    createWav(concat([tone(BED_HZ, 60), tone(MARKER_HZ, 10), tone(BED_HZ, 50)]), SAMPLE_RATE),
  );
  writeFileSync(path.join(root, 'other.wav'), createWav(tone(BED_HZ, 8), SAMPLE_RATE));

  const catalog = Catalog.openMemory();
  const embedder = new ToneEmbedder();
  const indexer = new Indexer({
    catalog,
    classifier: new UcsClassifier([]),
    embedder,
    peaksDir: path.join(root, '.peaks'),
  });

  const libraryId = catalog.addLibrary('test', root, 'local');
  await indexer.runFastPass(libraryId, root);
  // The real embed pass, so window storage is exercised rather than simulated.
  await indexer.runEmbedPass(libraryId);

  const ids = {
    marker: catalog.getAssetByPath(path.join(root, 'marker.wav'))!,
    long: catalog.getAssetByPath(path.join(root, 'long_bed.wav'))!,
    other: catalog.getAssetByPath(path.join(root, 'other.wav'))!,
  };

  const vectorIndex = new VectorIndex(catalog);
  vectorIndex.reload();

  return {
    root,
    catalog,
    indexer,
    probe: new ProbeService({ catalog, vectorIndex, embedder, dataDir: root, maxsimRefine: 8 }),    ids,
    cleanup: () => {
      catalog.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** A fresh probe over the same catalog, so a test can vary the refine budget. */
function probeWith(h: Harness, maxsimRefine: number): ProbeService {
  const vectorIndex = new VectorIndex(h.catalog);
  vectorIndex.reload();
  return new ProbeService({
    catalog: h.catalog,
    vectorIndex,
    embedder: new ToneEmbedder(),
    dataDir: h.root,
    maxsimRefine,
  });
}

test('the indexer stores window vectors for a multi-window file', async () => {
  const h = await makeHarness();
  try {
    // 120 s at 10 s windows/hop is 12 windows. This is the storage half of the
    // feature; without it, max-sim can only ever re-analyse on demand.
    const windows = h.catalog.loadWindowedEmbeddingsFor(h.ids.long);
    assert.ok(windows.length >= 5, `expected several stored windows, got ${windows.length}`);
    assert.equal(windows[0]?.startMs, 0);
    assert.ok(windows.some((window) => window.startMs === 60_000), 'the marker window must be stored');

    // A single-window file has no rows: its one-window max IS its mean.
    assert.deepEqual(h.catalog.loadWindowedEmbeddingsFor(h.ids.marker), []);
    assert.ok(h.catalog.countWindowedAssets() >= 1);
    assert.ok(h.catalog.countWindowedEmbeddings() >= 5);
  } finally {
    h.cleanup();
  }
});

test('max-sim finds a short sound buried inside a long file, with its offset', async () => {
  const h = await makeHarness();
  try {
    const result = await h.probe.searchWithSamples([tone(MARKER_HZ, 8)], SAMPLE_RATE, 200, 'probe');

    const long = result.matches.find((match) => match.assetId === h.ids.long);
    assert.ok(long, `the long bed must be returned; got ${JSON.stringify(result.matches.map((m) => m.assetId))}`);

    // The match is a window, not the whole file, and that is the entire feature.
    assert.ok(long.maxsim, 'the long bed must be scored by a window, not by its mean');
    assert.equal(long.maxsim.via, 'stored', 'its windows were indexed, so no inference was needed');
    assert.equal(long.maxsim.startMs, 60_000, 'the marker sits at t=60s');
    assert.ok(long.maxsim.windows >= 5, `expected several windows compared, got ${long.maxsim.windows}`);

    // And it beats the file that is nothing but bed tone.
    const other = result.matches.find((match) => match.assetId === h.ids.other);
    if (other) assert.ok(long.score > other.score, 'the file containing the marker must outrank pure bed');

    assert.ok(result.maxsim.stored >= 1, 'the report must say stored windows were used');
    assert.equal(result.maxsim.analysed, 0, 'nothing needed re-analysis');
  } finally {
    h.cleanup();
  }
});

test('the whole-file mean alone would have missed the long file', async () => {
  const h = await makeHarness();
  try {
    // Reproduce what the pre-max-sim code compared: the stored whole-file mean.
    const query = l2Normalize((await new ToneEmbedder().embedAudio(tone(MARKER_HZ, 8), SAMPLE_RATE)).mean);
    const longMean = h.catalog.loadEmbeddings('mean').get(h.ids.long);
    assert.ok(longMean);
    let dot = 0;
    for (let i = 0; i < query.length; i += 1) dot += query[i]! * longMean[i]!;

    const result = await h.probe.searchWithSamples([tone(MARKER_HZ, 8)], SAMPLE_RATE, 200, 'probe');
    const long = result.matches.find((match) => match.assetId === h.ids.long);
    assert.ok(long?.maxsim);

    // The regression in numbers: the mean is diluted by the bed, the window is not.
    // If a future change drops the window pass, this assertion fails.
    assert.ok(
      long.score > dot * 1.5,
      `max-sim (${long.score.toFixed(3)}) must clearly beat the whole-file mean (${dot.toFixed(3)})`,
    );
  } finally {
    h.cleanup();
  }
});

test('a file with no stored windows is re-analysed on demand and still finds the offset', async () => {
  const h = await makeHarness();
  try {
    // Simulate an index built before this feature existed.
    h.catalog.db.prepare('DELETE FROM windowed_embeddings WHERE assetId = ?').run(h.ids.long);

    const result = await h.probe.searchWithSamples([tone(MARKER_HZ, 8)], SAMPLE_RATE, 200, 'probe');
    const long = result.matches.find((match) => match.assetId === h.ids.long);
    assert.ok(long, 'the on-demand pass must still surface the long file');
    assert.ok(long.maxsim, 'and must do so through a window comparison');
    assert.equal(long.maxsim.via, 'analysed', 'it had to re-embed the file for this query');
    assert.equal(long.maxsim.startMs, 60_000, 'the on-demand analysis must report the real offset');
    assert.ok(result.maxsim.analysed >= 1, 'the report must admit the extra work it did');
  } finally {
    h.cleanup();
  }
});

test('the on-demand pass is bounded by the refine budget', async () => {
  const h = await makeHarness();
  try {
    h.catalog.db.prepare('DELETE FROM windowed_embeddings').run();

    // A budget of zero must disable the expensive path entirely, which is what makes
    // probe latency predictable on a large library.
    const result = await probeWith(h, 0).searchWithSamples([tone(MARKER_HZ, 8)], SAMPLE_RATE, 200, 'probe');
    assert.equal(result.maxsim.analysed, 0, 'nothing may be re-embedded when the budget is 0');
    assert.ok(result.maxsim.skippedBudget > 0, 'and the skipped work must be reported');
    for (const match of result.matches) {
      assert.equal(match.maxsim, undefined, 'no hit may claim a window match it did not compute');
    }
  } finally {
    h.cleanup();
  }
});

test('a short file is never reported as a window match', async () => {
  const h = await makeHarness();
  try {
    const result = await h.probe.searchWithSamples([tone(MARKER_HZ, 8)], SAMPLE_RATE, 200, 'probe');
    const marker = result.matches.find((match) => match.assetId === h.ids.marker);
    assert.ok(marker, 'the exact tone must be found');
    // marker.wav is 8 s: one window, so max-sim equals the mean and claiming a
    // window match would be noise rather than information.
    assert.equal(marker.maxsim, undefined);
    assert.ok(result.maxsim.skippedShort >= 1, 'such files are counted as skipped, not analysed');
  } finally {
    h.cleanup();
  }
});

test('the reported offset lands inside the window that actually contains the match', async () => {
  const h = await makeHarness();
  try {
    const result = await h.probe.searchWithSamples([tone(MARKER_HZ, 8)], SAMPLE_RATE, 200, 'probe');
    const long = result.matches.find((match) => match.assetId === h.ids.long);
    assert.ok(long?.maxsim);
    // The marker occupies [60s, 70s); the reported window must address that region,
    // not the file start — otherwise the offset is worse than useless.
    assert.ok(
      long.maxsim.startMs >= 60_000 && long.maxsim.startMs < 70_000,
      `offset ${long.maxsim.startMs} should land inside the marker window [60000, 70000)`,
    );
  } finally {
    h.cleanup();
  }
});

test('one undecodable candidate does not fail the whole probe', async () => {
  const h = await makeHarness();
  try {
    // Force the on-demand path onto a file that no longer exists.
    h.catalog.db.prepare('UPDATE assets SET path = ? WHERE id = ?').run(path.join(h.root, 'gone.wav'), h.ids.long);
    h.catalog.db.prepare('DELETE FROM windowed_embeddings WHERE assetId = ?').run(h.ids.long);

    const result = await h.probe.searchWithSamples([tone(MARKER_HZ, 8)], SAMPLE_RATE, 200, 'probe');
    assert.ok(result.matches.length > 0, 'the other candidates must still come back');
    assert.ok(
      result.matches.some((match) => match.assetId === h.ids.marker),
      'the decodable answers must survive a bad neighbour',
    );
  } finally {
    h.cleanup();
  }
});

test('a probe from a file path goes through the same max-sim pass as an upload', async () => {
  const h = await makeHarness();
  try {
    const reference = path.join(h.root, 'reference.wav');
    writeFileSync(reference, createWav(tone(MARKER_HZ, 8), SAMPLE_RATE));

    const result = await h.probe.searchWithProbe({ filePath: reference }, 200);
    const long = result.matches.find((match) => match.assetId === h.ids.long);
    assert.ok(long?.maxsim, 'the file-path entry point must reach max-sim too');
    assert.equal(long.maxsim.startMs, 60_000);
  } finally {
    h.cleanup();
  }
});
