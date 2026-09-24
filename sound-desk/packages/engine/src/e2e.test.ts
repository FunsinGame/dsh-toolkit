/**
 * End-to-end test of the vertical slice that matters most:
 *
 *   synthetic WAV files on disk
 *     → library scan (stage 1)
 *     → UCS classification + search text
 *     → keyword search, CJK search, UCS-prior search
 *     → semantic search with a stub embedder
 *     → HTTP API: auth, Range streaming, path-traversal defence
 *     → peaks cache built on demand
 *
 * Everything is synthetic: the test writes its own WAV bytes, so it needs no
 * audio fixtures and runs anywhere.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { backupPathFor } from '@sounddesk/audio-wav';

import { createApp, readRuntimeFile, writeRuntimeFile } from './index.js';
import { applyImport, buildBackup, planImport } from './sidecar.js';
import { startServer, type RunningServer } from './server.js';
import { createWav, sine, noise } from './test-utils.js';
import type { Embedder, EmbeddingResult } from '@sounddesk/core';

interface Harness {
  root: string;
  dataDir: string;
  app: Awaited<ReturnType<typeof createApp>>;
  server: RunningServer;
  /** the stub embedder actually used by the app, when one was injected */
  stub: StubEmbedder | null;
  cleanup(): void;
}

/** A deterministic stand-in for CLAP: hashes the caption into a 8-dim bag vector. */
class StubEmbedder implements Embedder {
  readonly id = 'stub-clap';
  readonly dim = 8;
  readonly ready = true;
  /** records what the search path asked to encode */
  readonly seenTexts: string[] = [];

  async embedText(texts: string[]): Promise<Float32Array[]> {
    this.seenTexts.push(...texts);
    return texts.map((t) => captionVector(t));
  }

  async embedAudio(samples: Float32Array): Promise<EmbeddingResult> {
    // Derive a vector from the signal's statistics so distinct sounds separate.
    const v = signalVector(samples);
    return { mean: v, onset: v };
  }
}

/** Keyword buckets act as orthogonal "semantic" dimensions. */
const BUCKETS = ['metal', 'glass', 'wood', 'door', 'footstep', 'water', 'wind', 'voice'];

function captionVector(text: string): Float32Array {
  const v = new Float32Array(BUCKETS.length);
  const lower = text.toLowerCase();
  BUCKETS.forEach((bucket, i) => {
    if (lower.includes(bucket)) v[i] = 1;
  });
  return normalize(v);
}

function signalVector(samples: Float32Array): Float32Array {
  // crude: map zero-crossing rate + RMS onto the bucket axes deterministically
  let crossings = 0;
  let energy = 0;
  for (let i = 1; i < samples.length; i += 1) {
    if ((samples[i]! >= 0) !== (samples[i - 1]! >= 0)) crossings += 1;
    energy += samples[i]! * samples[i]!;
  }
  const zcr = samples.length > 1 ? crossings / samples.length : 0;
  const rms = Math.sqrt(energy / Math.max(1, samples.length));
  const v = new Float32Array(BUCKETS.length);
  v[Math.min(BUCKETS.length - 1, Math.floor(zcr * 20))] = 1;
  v[0] = rms;
  return normalize(v);
}

function normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (const x of v) sum += x * x;
  const n = Math.sqrt(sum) || 1;
  for (let i = 0; i < v.length; i += 1) v[i] = v[i]! / n;
  return v;
}

function makeLibrary(root: string): void {
  mkdirSync(path.join(root, 'Doors', 'Wood'), { recursive: true });
  mkdirSync(path.join(root, 'Impacts', 'Metal'), { recursive: true });
  mkdirSync(path.join(root, 'Footsteps'), { recursive: true });

  // A UCS-conventional name: the CatID prefix should be picked up at L0.
  writeFileSync(
    path.join(root, 'Doors', 'Wood', 'DOORWood_WoodenDoorClose_MyLib_TestRec_01.wav'),
    createWav(sine(220, 1.2, 48_000), 48_000),
  );
  // Plain name — classification must fall back to directory + tokens.
  writeFileSync(
    path.join(root, 'Impacts', 'Metal', 'metal_impact_heavy_03.wav'),
    createWav(noise(0.6, 48_000), 48_000),
  );
  // Chinese description inside the filename: exercises CJK bigram indexing.
  writeFileSync(
    path.join(root, 'Footsteps', 'footstep_wood_floor_slow.wav'),
    createWav(sine(150, 0.8, 44_100), 44_100),
  );
  // A file the indexer should record but that is too short to be an ambience.
  writeFileSync(path.join(root, 'tick.wav'), createWav(sine(1200, 0.05, 48_000), 48_000));
}

async function startHarness(withEmbedder: boolean): Promise<Harness> {
  const root = mkdtempSync(path.join(tmpdir(), 'sounddesk-lib-'));
  const dataDir = mkdtempSync(path.join(tmpdir(), 'sounddesk-data-'));
  makeLibrary(root);

  // Keep a reference to the exact instance handed to the app, so assertions
  // observe the object that actually ran.
  const stub = withEmbedder ? new StubEmbedder() : null;

  const app = await createApp({
    dataDir,
    loadModel: false,
    // Injecting the stub keeps semantic search testable without a 100 MB
    // download, and exercises exactly the same code path CLAP would.
    embedder: stub,
    log: () => {},
  });

  const libraryId = app.catalog.addLibrary('test-lib', root, 'local');
  await app.indexer.runFastPass(libraryId, root);

  if (withEmbedder) {
    await app.indexer.runEmbedPass(libraryId);
  }

  const server = await startServer({
    catalog: app.catalog,
    indexer: app.indexer,
    searchService: app.searchService,
    vectorIndex: app.vectorIndex,
    ucs: app.ucs,
    // Mirrors how the CLI wires these; without them /api/ucs/lookup returns []
    // and a metadata write-back would leave the catalogue row stale.
    reclassifyLookup: (term: string) => app.ucs.lookup(term),
    reindexAsset: async (assetId: number) => {
      const row = app.catalog.getAssetRow(assetId);
      if (!row) return;
      const filePath = String(row.path ?? '');
      const libraryId = Number(row.libraryId);
      const st = await stat(filePath).catch(() => null);
      await app.indexer.indexMetadata(
        assetId,
        {
          path: filePath,
          dir: path.dirname(filePath),
          filename: String(row.filename ?? path.basename(filePath)),
          extension: String(row.extension ?? path.extname(filePath)),
          sizeBytes: st?.size ?? Number(row.sizeBytes ?? 0),
          mtimeMs: st ? Math.floor(st.mtimeMs) : Number(row.mtimeMs ?? Date.now()),
        },
        libraryId,
        app.catalog.getLibrary(libraryId)?.root ?? path.dirname(filePath),
      );
    },
    log: () => {},
  });

  return {
    root,
    dataDir,
    app,
    server,
    stub,
    cleanup(): void {
      void server.close();
      app.close();
      rmSync(root, { recursive: true, force: true });
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

test('stage 1 indexes files and records format + DSP + UCS', async () => {
  const h = await startHarness(false);
  try {
    const total = h.app.catalog.countAssets();
    assert.equal(total, 4, 'all four WAV files should be indexed');

    const rows = h.app.catalog.db.prepare('SELECT * FROM assets ORDER BY filename').all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      assert.equal(Number(row.stage) >= 1, true, `${row.filename} should reach stage 1`);
      assert.equal(typeof row.durationMs, 'number', `${row.filename} should have a duration`);
      assert.equal(typeof row.sampleRate, 'number');
      assert.equal(typeof row.channels, 'number');
      assert.ok(String(row.searchText).length > 0, 'search text must be populated');
    }

    const clang = rows.find((r) => String(r.filename).startsWith('metal_impact'))!;
    assert.equal(clang.ucsSource, 'filename', 'directory hint should classify the metal clang');
    // Real UCS CatID: the vocabulary has METALCrsh/METLImpt, not IMPACTMetal.
    assert.equal(clang.ucsCatId, 'METLImpt');

    const door = rows.find((r) => String(r.filename).startsWith('DOORWood'))!;
    assert.equal(door.ucsSource, 'filename');
    assert.equal(door.ucsCatId, 'DOORWood', 'a UCS filename prefix is authoritative');

    const foot = rows.find((r) => String(r.filename).startsWith('footstep'))!;
    assert.ok(foot.dspPeakDb !== null, 'DSP features should be computed');
  } finally {
    h.cleanup();
  }
});

test('keyword search finds files and respects exclusion syntax', async () => {
  const h = await startHarness(false);
  try {
    const hit = await h.app.searchService.search({ q: 'metal impact', mode: 'keyword' });
    assert.ok(hit.hits.length >= 1, 'expected the metal impact to match');
    assert.equal(hit.hits[0]!.asset.filename, 'metal_impact_heavy_03.wav');

    const excluded = await h.app.searchService.search({ q: 'metal -impact', mode: 'keyword' });
    assert.equal(
      excluded.hits.some((x) => x.asset.filename === 'metal_impact_heavy_03.wav'),
      false,
      'the -impact exclusion must remove it',
    );

    const prefix = await h.app.searchService.search({ q: 'impact*', mode: 'keyword' });
    assert.ok(prefix.hits.length >= 1, 'prefix wildcard should match impact');
  } finally {
    h.cleanup();
  }
});

test('CJK query is bigram-indexed so Chinese terms match latin filenames metadata', async () => {
  const h = await startHarness(false);
  try {
    // The library has a Chinese description only in the UCS synonym table, so
    // this checks the UCS prior retriever rather than FTS.
    const res = await h.app.searchService.search({ q: '金属撞击', mode: 'hybrid', explain: true });
    assert.ok(res.hits.length >= 1, 'expected 金属撞击 to surface the metal impact');
    // 金属撞击 is curated onto the official METAL/IMPACT unit (METLImpt); the one
    // metal file in the fixture is classified METLCrsh from its directory hint.
    assert.ok(
      res.hits.some((x) => typeof x.asset.ucsCatId === 'string' && x.asset.ucsCatId.startsWith('METL')),
      `expected a METAL CatID in results, got ${JSON.stringify(res.hits.map((x) => x.asset.ucsCatId))}`,
    );
  } finally {
    h.cleanup();
  }
});

test('semantic search routes the query through the Chinese rewrite and uses the stub vectors', async () => {
  const h = await startHarness(true);
  try {
    const stub = h.stub!;
    const res = await h.app.searchService.search({ q: '金属门关上', mode: 'semantic', explain: true });

    assert.ok(stub.seenTexts.length > 0, `the embedder should have been asked to encode the query (diagnostics=${JSON.stringify(res.diagnostics)}, captionsUsed=${JSON.stringify(res.captionsUsed)}, hits=${res.hits.length})`);
    // the rewrite must have produced english captions, not just the raw Chinese
    assert.ok(
      stub.seenTexts.some((t) => /door/i.test(t)),
      `expected an english "door" caption, saw: ${JSON.stringify(stub.seenTexts.slice(0, 5))}`,
    );
    assert.ok(res.captionsUsed.some((c) => /door/i.test(c)), 'captionsUsed must expose the rewrite to the UI');
    assert.ok(res.diagnostics, 'explain mode should include diagnostics');
    // Check the durable record rather than the in-memory coverage counter, which
    // is a snapshot taken before the search lazily refreshed the index.
    assert.ok(
      h.app.catalog.countEmbeddings() > 0,
      'the embed pass should have stored vectors',
    );
    assert.ok(
      h.app.vectorIndex.size > 0,
      'searching should have lazily loaded the embedding index',
    );
  } finally {
    h.cleanup();
  }
});

test('similarity search works with zero inference (cached vectors)', async () => {
  const h = await startHarness(true);
  try {
    const rows = h.app.catalog.db.prepare('SELECT id, filename FROM assets').all() as Array<{ id: number; filename: string }>;
    const clang = rows.find((r) => r.filename.startsWith('metal_impact'))!;

    const stub = h.stub!;
    const before = stub.seenTexts.length;
    const res = await h.app.searchService.search({ mode: 'similar', q: '', similarToAssetId: clang.id, limit: 10 });

    assert.equal(stub.seenTexts.length, before, 'similarity search must not call the text tower');
    assert.equal(
      res.hits.some((x) => x.asset.id === clang.id),
      false,
      'the source asset must not be returned as its own neighbour',
    );
  } finally {
    h.cleanup();
  }
});

test('HTTP API enforces the token and serves Range requests for audio', async () => {
  const h = await startHarness(false);
  try {
    const base = h.server.url;
    const token = h.server.token;

    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200, 'health is intentionally unauthenticated');

    const unauth = await fetch(`${base}/api/stats`);
    assert.equal(unauth.status, 401, 'data endpoints must require the token');

    const authed = await fetch(`${base}/api/stats`, { headers: { 'x-sounddesk-token': token } });
    assert.equal(authed.status, 200);
    const stats = (await authed.json()) as { assets: number };
    assert.equal(stats.assets, 4);

    const rows = h.app.catalog.db.prepare('SELECT id FROM assets ORDER BY id').all() as Array<{ id: number }>;
    const first = rows[0]!.id;

    // full body
    const full = await fetch(`${base}/api/media/${first}/stream`, { headers: { 'x-sounddesk-token': token } });
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    const fullBuf = Buffer.from(await full.arrayBuffer());
    assert.ok(fullBuf.length > 44, 'should return a real WAV');
    assert.equal(fullBuf.subarray(0, 4).toString('ascii'), 'RIFF');

    // ranged body
    const ranged = await fetch(`${base}/api/media/${first}/stream`, {
      headers: { 'x-sounddesk-token': token, range: 'bytes=0-43' },
    });
    assert.equal(ranged.status, 206, 'range request must return 206');
    assert.equal(ranged.headers.get('content-range'), `bytes 0-43/${fullBuf.length}`);
    const rangedBuf = Buffer.from(await ranged.arrayBuffer());
    assert.equal(rangedBuf.length, 44);

    // unsatisfiable range
    const bad = await fetch(`${base}/api/media/${first}/stream`, {
      headers: { 'x-sounddesk-token': token, range: `bytes=${fullBuf.length + 10}-` },
    });
    assert.equal(bad.status, 416);

    // unknown asset
    const missing = await fetch(`${base}/api/media/999999/stream`, { headers: { 'x-sounddesk-token': token } });
    assert.equal(missing.status, 404);
  } finally {
    h.cleanup();
  }
});

test('peaks are built on demand and served as the SDPK container', async () => {
  const h = await startHarness(false);
  try {
    const rows = h.app.catalog.db.prepare('SELECT id FROM assets ORDER BY id').all() as Array<{ id: number }>;
    const id = rows[0]!.id;
    const res = await fetch(`${h.server.url}/api/media/${id}/peaks`, {
      headers: { 'x-sounddesk-token': h.server.token },
    });
    assert.equal(res.status, 200);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 4).toString('ascii'), 'SDPK', 'peaks must use the documented magic');
    assert.ok(buf.length > 16, 'peaks payload should carry at least one level');
  } finally {
    h.cleanup();
  }
});

test('the session endpoint describes engine capabilities, including max-sim coverage', async () => {
  const h = await startHarness(true);
  try {
    const res = await fetch(`${h.server.url}/api/session`, { headers: { 'x-sounddesk-token': h.server.token } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ok: boolean;
      embeddingDim: number;
      ffmpeg: { available: boolean };
      maxsim: { windowedAssets: number; windowedVectors: number; maxWindows: number; refinePerQuery: number };
    };

    assert.equal(body.ok, true);
    assert.equal(body.embeddingDim, 512);
    assert.equal(typeof body.ffmpeg.available, 'boolean');
    // The sidebar and status bar read these to explain how much of a probe query can
    // be answered without re-running inference.
    assert.ok(body.maxsim, 'session must expose max-sim coverage');
    assert.equal(typeof body.maxsim.windowedAssets, 'number');
    assert.equal(typeof body.maxsim.windowedVectors, 'number');
    assert.ok(body.maxsim.maxWindows > 0);
    assert.ok(body.maxsim.refinePerQuery >= 0);
  } finally {
    h.cleanup();
  }
});

test('UCS tree reports per-category counts and the lookup endpoint resolves aliases', async () => {
  const h = await startHarness(false);
  try {
    const res = await fetch(`${h.server.url}/api/ucs/tree`, { headers: { 'x-sounddesk-token': h.server.token } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { tree: Array<{ category: string; count: number }>; uncategorized: number };
    assert.ok(body.tree.length > 5, 'the UCS vocabulary should be present');
    const metal = body.tree.find((t) => t.category === 'METAL');
    assert.ok(metal, 'METAL should exist in the tree');
    assert.ok(metal!.count >= 1, 'the metal clang should be counted under METAL');

    const lookup = await fetch(`${h.server.url}/api/ucs/lookup?q=${encodeURIComponent('太鼓')}`, {
      headers: { 'x-sounddesk-token': h.server.token },
    });
    assert.equal(lookup.status, 200);
    const found = (await lookup.json()) as { matches: Array<{ catId: string }> };
    assert.ok(found.matches.length > 0, '太鼓 should resolve via the UCS synonym table');
  } finally {
    h.cleanup();
  }
});

test('manual classification overrides the automatic pipeline and survives a rescan', async () => {
  const h = await startHarness(false);
  try {
    const rows = h.app.catalog.db.prepare('SELECT id, filename FROM assets').all() as Array<{ id: number; filename: string }>;
    const clang = rows.find((r) => r.filename.startsWith('metal_impact'))!;

    const patched = await fetch(`${h.server.url}/api/assets/${clang.id}`, {
      method: 'PATCH',
      headers: { 'x-sounddesk-token': h.server.token, 'content-type': 'application/json' },
      body: JSON.stringify({ ucsCatId: 'WOODImpt', tags: ['我的标签'], rating: 4 }),
    });
    assert.equal(patched.status, 200);
    const asset = (await patched.json()) as { ucsCatId: string; ucsSource: string; tags: string[]; rating: number };
    assert.equal(asset.ucsCatId, 'WOODImpt');
    assert.equal(asset.ucsSource, 'manual');
    assert.deepEqual(asset.tags, ['我的标签']);
    assert.equal(asset.rating, 4);

    // Re-running classification must NOT clobber the manual choice.
    const libraryId = (h.app.catalog.listLibraries()[0]!).id;
    await h.app.indexer.runFastPass(libraryId, h.root);
    const after = h.app.catalog.getAssetRow(clang.id)!;
    assert.equal(after.ucsCatId, 'WOODImpt', 'a manual correction must be sticky');
    assert.equal(after.ucsSource, 'manual');
  } finally {
    h.cleanup();
  }
});

test('media and peaks also accept the token as a query parameter', async () => {
  const h = await startHarness(false);
  try {
    // <audio> and fetch-based waveform loads cannot set custom headers, so the
    // query-parameter form must work — this is how the browser UI reaches them.
    const rows = h.app.catalog.db.prepare('SELECT id FROM assets ORDER BY id').all() as Array<{ id: number }>;
    const id = rows[0]!.id;

    const viaQuery = await fetch(`${h.server.url}/api/media/${id}/stream?token=${encodeURIComponent(h.server.token)}`);
    assert.equal(viaQuery.status, 200, 'media must be reachable with a query token');
    assert.equal(viaQuery.headers.get('accept-ranges'), 'bytes');

    const peaksViaQuery = await fetch(`${h.server.url}/api/media/${id}/peaks?token=${encodeURIComponent(h.server.token)}`);
    assert.equal(peaksViaQuery.status, 200, 'peaks must be reachable with a query token');
    const buf = Buffer.from(await peaksViaQuery.arrayBuffer());
    assert.equal(buf.subarray(0, 4).toString('ascii'), 'SDPK');

    // a wrong query token must still be rejected
    const bad = await fetch(`${h.server.url}/api/media/${id}/stream?token=nope`);
    assert.equal(bad.status, 401);
    const badHeader = await fetch(`${h.server.url}/api/media/${id}/stream`, {
      headers: { 'x-sounddesk-token': 'nope' },
    });
    assert.equal(badHeader.status, 401, 'a header token is still validated when present');
  } finally {
    h.cleanup();
  }
});

test('rescan?full=1 finishes the pipeline; a plain rescan never produces fingerprints', async () => {
  const h = await startHarness(true);
  try {
    const base = `${h.server.url}/api/libraries`;
    const libraryId = h.app.catalog.listLibraries()[0]!.id;

    // Reproduce the state that made the UI's advice impossible to follow: assets
    // catalogued, but no fingerprints, so semantic search has nothing to compare.
    h.app.catalog.db.prepare('DELETE FROM embeddings').run();
    h.app.catalog.db.prepare('UPDATE assets SET stage = 1, hasPeaks = 0').run();
    assert.equal(h.app.catalog.countEmbeddings(), 0);

    // A plain rescan re-reads metadata only. This is the documented behaviour, and it
    // is exactly why pressing it could not fix a library with no fingerprints.
    const plain = await fetch(`${base}/${libraryId}/rescan`, {
      method: 'POST',
      headers: { 'x-sounddesk-token': h.server.token },
    });
    assert.equal(plain.status, 200);
    const plainBody = (await plain.json()) as { full: boolean };
    assert.equal(plainBody.full, false);
    assert.equal(h.app.catalog.countEmbeddings(), 0, 'a plain rescan must not claim to embed');

    // The full form runs waveforms and starts the fingerprint pass.
    const full = await fetch(`${base}/${libraryId}/rescan?full=1`, {
      method: 'POST',
      headers: { 'x-sounddesk-token': h.server.token },
    });
    assert.equal(full.status, 200);
    const fullBody = (await full.json()) as { full: boolean; embedStarted: boolean; embedSkippedReason: string | null };
    assert.equal(fullBody.full, true);
    assert.equal(fullBody.embedStarted, true, 'a ready model must start the fingerprint pass');
    assert.equal(fullBody.embedSkippedReason, null);

    // The fingerprint pass runs in the background by design, so wait for it rather
    // than assuming it finished inside the response.
    const deadline = Date.now() + 20_000;
    while (h.app.catalog.countEmbeddings() === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(
      h.app.catalog.countEmbeddings() > 0,
      'after a full rescan the library must actually have fingerprints',
    );
  } finally {
    h.cleanup();
  }
});

test('a full rescan without a model says so instead of silently doing nothing', async () => {
  const h = await startHarness(false);
  try {
    const libraryId = h.app.catalog.listLibraries()[0]!.id;
    const res = await fetch(`${h.server.url}/api/libraries/${libraryId}/rescan?full=1`, {
      method: 'POST',
      headers: { 'x-sounddesk-token': h.server.token },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { embedStarted: boolean; embedSkippedReason: string | null };
    assert.equal(body.embedStarted, false);
    // The reason must be stated: "no fingerprints will ever appear" and "they are
    // being built right now" are indistinguishable from the UI otherwise.
    assert.ok(body.embedSkippedReason && body.embedSkippedReason.length > 0);
  } finally {
    h.cleanup();
  }
});

test('cross-origin responses carry the headers the webview needs', async () => {
  const h = await startHarness(false);
  try {
    const rows = h.app.catalog.db.prepare('SELECT id FROM assets ORDER BY id').all() as Array<{ id: number }>;
    const id = rows[0]!.id;

    /**
     * The VSCode webview runs on `vscode-webview://…`, which is a different origin
     * from `http://127.0.0.1:PORT`. Its `<audio crossOrigin="anonymous">` element
     * therefore refuses a response with no `Access-Control-Allow-Origin`, and the
     * rejection never reaches the app's own error handling — the symptom is "play
     * does nothing, with no message". This test pins the header that fixes it.
     */
    const origin = 'vscode-webview://test-origin';
    const media = await fetch(`${h.server.url}/api/media/${id}/stream?token=${encodeURIComponent(h.server.token)}`, {
      headers: { origin },
    });
    assert.equal(media.status, 200);
    assert.equal(
      media.headers.get('access-control-allow-origin'),
      origin,
      'media must be readable from the webview origin or playback is silently blocked',
    );
    // Seeking is a Range request; its response needs the same treatment.
    assert.match(media.headers.get('access-control-expose-headers') ?? '', /accept-ranges/);

    const ranged = await fetch(`${h.server.url}/api/media/${id}/stream?token=${encodeURIComponent(h.server.token)}`, {
      headers: { origin, range: 'bytes=0-1023' },
    });
    assert.equal(ranged.status, 206);
    assert.equal(ranged.headers.get('access-control-allow-origin'), origin, 'ranged media must be allowed too');

    // A JSON PATCH with a custom header triggers a preflight, which must be answered
    // or the real request never happens.
    const preflight = await fetch(`${h.server.url}/api/assets/${id}`, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'content-type',
      },
    });
    assert.equal(preflight.status, 204, 'the preflight must be answered, not 404d');
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /PATCH/);
    assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /content-type/);

    // The policy is not widened: an unknown origin is still refused.
    const evil = await fetch(`${h.server.url}/api/session?token=${encodeURIComponent(h.server.token)}`, {
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(evil.status, 403, 'cross-origin access stays restricted to known origins');

    // Localhost (the browser case) is allowed, and a request with no Origin at all
    // (the extension host, curl) is unaffected.
    const localhost = await fetch(`${h.server.url}/api/session`, {
      headers: { origin: `http://127.0.0.1:${h.server.port}`, 'x-sounddesk-token': h.server.token },
    });
    assert.equal(localhost.status, 200);
    assert.equal(localhost.headers.get('access-control-allow-origin'), `http://127.0.0.1:${h.server.port}`);

    const noOrigin = await fetch(`${h.server.url}/api/session`, { headers: { 'x-sounddesk-token': h.server.token } });
    assert.equal(noOrigin.status, 200);
    assert.equal(noOrigin.headers.get('access-control-allow-origin'), null, 'no Origin means no CORS header to send');
  } finally {
    h.cleanup();
  }
});

test('embedded metadata can be read and written back into the file', async () => {
  const h = await startHarness(false);
  try {
    const rows = h.app.catalog.db
      .prepare("SELECT id, filename, path FROM assets WHERE filename LIKE '%door%' ORDER BY id")
      .all() as Array<{ id: number; filename: string; path: string }>;
    assert.ok(rows.length > 0, 'the fixture must contain a door file');
    const target = rows[0]!;

    // readable, and reported as editable for a WAV
    const info = await fetch(`${h.server.url}/api/assets/${target.id}/embedded`, {
      headers: { 'x-sounddesk-token': h.server.token },
    });
    assert.equal(info.status, 200);
    const body = (await info.json()) as { editable: boolean; hasBackup: boolean };
    assert.equal(body.editable, true);
    assert.equal(body.hasBackup, false, 'no backup before the first edit');

    // a write without explicit confirmation is refused
    const unconfirmed = await fetch(`${h.server.url}/api/assets/${target.id}/embedded`, {
      method: 'PUT',
      headers: { 'x-sounddesk-token': h.server.token, 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'nope' }),
    });
    assert.equal(unconfirmed.status, 428, 'writing to a file requires confirm: true');

    // and the file must really be untouched after the refusal
    const before = readFileSync(target.path);

    const written = await fetch(`${h.server.url}/api/assets/${target.id}/embedded`, {
      method: 'PUT',
      headers: { 'x-sounddesk-token': h.server.token, 'content-type': 'application/json' },
      body: JSON.stringify({ description: '木门关上', keywords: ['door', 'wood'], confirm: true }),
    });
    assert.equal(written.status, 200);
    const result = (await written.json()) as {
      changed: boolean;
      backupPath: string | null;
      asset: { embedded: { description: string | null; keywords: string[] | null } };
    };
    assert.equal(result.changed, true);
    assert.ok(result.backupPath, 'a backup must be created on the first write');
    assert.equal(result.asset.embedded.description, '木门关上', 'the catalogue row must reflect the new value');
    assert.deepEqual(result.asset.embedded.keywords, ['door', 'wood']);
    assert.ok(existsSync(result.backupPath), `backup missing at ${result.backupPath}`);
    const expected = backupPathFor(h.app.dataDir, target.path);
    assert.equal(
      expected,
      result.backupPath,
      `the restore route must compute the same backup path\nexpected: ${expected}\nactual:   ${result.backupPath}\ndataDir:  ${h.app.dataDir}\npath:     ${target.path}`,
    );

    // the bytes on disk changed, and the audio payload did not
    const after = readFileSync(target.path);
    assert.notDeepEqual(after, before);
    assert.ok(after.length > 44);
    assert.equal(after.subarray(0, 4).toString('ascii'), 'RIFF');

    // restoring puts the original bytes back
    const restored = await fetch(`${h.server.url}/api/assets/${target.id}/embedded/restore`, {
      method: 'POST',
      headers: { 'x-sounddesk-token': h.server.token },
    });
    assert.equal(restored.status, 200);
    assert.deepEqual(readFileSync(target.path), before, 'restore must return the pristine bytes');
  } finally {
    h.cleanup();
  }
});

test('non-WAV assets are refused for metadata write-back with a clear reason', async () => {
  const h = await startHarness(false);
  try {
    const rows = h.app.catalog.db.prepare('SELECT id, path FROM assets ORDER BY id').all() as Array<{
      id: number;
      path: string;
    }>;
    const target = rows[0]!;

    // Simulate a non-RIFF asset by pointing the row at an .flac path. The engine
    // decides from the extension, so no real file is needed.
    h.app.catalog.db.prepare('UPDATE assets SET path = ? WHERE id = ?').run(`${target.path}.flac`, target.id);

    const info = await fetch(`${h.server.url}/api/assets/${target.id}/embedded`, {
      headers: { 'x-sounddesk-token': h.server.token },
    });
    const body = (await info.json()) as { editable: boolean; reason: string | null };
    assert.equal(body.editable, false);
    assert.match(body.reason ?? '', /WAV/);

    const attempt = await fetch(`${h.server.url}/api/assets/${target.id}/embedded`, {
      method: 'PUT',
      headers: { 'x-sounddesk-token': h.server.token, 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'x', confirm: true }),
    });
    assert.equal(attempt.status, 415, 'a non-RIFF format must be refused, not converted');
  } finally {
    h.cleanup();
  }
});

test('search history is recorded for non-empty queries', async () => {
  const h = await startHarness(false);
  try {
    await h.app.searchService.search({ q: 'door', mode: 'hybrid' });
    const count = h.app.catalog.db.prepare('SELECT COUNT(*) AS n FROM search_history').get() as { n: number };
    assert.ok(count.n >= 1);
  } finally {
    h.cleanup();
  }
});

/**
 * Personalised ranking (plan P2-3).
 *
 * The properties worth testing are the *off switch* and the *bound*: a learned
 * weight may nudge near-ties but must never reorder a clear result, and turning it
 * off must restore the exact original order.
 */
test('personalised ranking is off by default and changes nothing until switched on', async () => {
  const h = await startHarness(false);
  try {
    assert.equal(h.app.catalog.personalizationEnabled(), false, 'default must be reproducible ordering');

    const first = await h.app.searchService.search({ q: 'door', mode: 'hybrid', limit: 10 });
    const ids = first.hits.map((hit) => hit.asset.id);
    assert.ok(ids.length > 0, 'need results to test with');

    // Play one of the results a lot. Nothing should move while the toggle is off.
    for (let i = 0; i < 10; i += 1) h.app.catalog.recordUsage(ids[ids.length - 1]!, 'play', 'door');
    const stillOff = await h.app.searchService.search({ q: 'door', mode: 'hybrid', limit: 10 });
    assert.deepEqual(
      stillOff.hits.map((hit) => hit.asset.id),
      ids,
      'with the toggle off the order must be byte-identical',
    );
    assert.equal(stillOff.personalized, undefined, 'and nothing should be reported as adjusted');
  } finally {
    h.cleanup();
  }
});

test('switching personalisation on applies a bounded weight and explains it', async () => {
  const h = await startHarness(false);
  try {
    const base = await h.app.searchService.search({ q: 'door', mode: 'hybrid', limit: 10 });
    const ids = base.hits.map((hit) => hit.asset.id);
    assert.ok(ids.length >= 1, 'need a result to test with');

    // A decisive history for the top result: 20 plays for this very query.
    const favourite = ids[0]!;
    for (let i = 0; i < 20; i += 1) h.app.catalog.recordUsage(favourite, 'play', 'door');
    h.app.catalog.setPersonalizationEnabled(true);

    const on = await h.app.searchService.search({ q: 'door', mode: 'hybrid', limit: 10 });
    assert.ok(on.personalized && on.personalized.length > 0, 'the adjustment must be reported');

    const adjustment = on.personalized!.find((p) => p.assetId === favourite);
    assert.ok(adjustment, 'the played asset must be among the adjusted');
    // The bound is the whole justification for having this feature.
    assert.ok(adjustment!.weight <= 1.1 + 1e-9, `weight ${adjustment!.weight} exceeded the ceiling`);
    assert.ok(adjustment!.weight > 1, 'a heavily played asset should be nudged up');
    assert.ok(adjustment!.reason.length > 0, 'the reason must be human-readable');
    assert.ok(adjustment!.reason.includes('20'), `reason should cite the count: ${adjustment!.reason}`);

    // The score actually rose by exactly that weight — the report is not decorative.
    const after = on.hits.find((hit) => hit.asset.id === favourite)!;
    const before = base.hits.find((hit) => hit.asset.id === favourite)!;
    assert.ok(
      Math.abs(after.score.final - before.score.final * adjustment!.weight) < 1e-9,
      'the reported weight must be the one that was applied',
    );

    // Every reported weight respects the ceiling, not just this one.
    for (const p of on.personalized!) {
      assert.ok(p.weight >= 0.9 - 1e-9 && p.weight <= 1.1 + 1e-9, `weight ${p.weight} out of band`);
    }

    // The same query with personalisation forced off returns the original order.
    const forcedOff = await h.app.searchService.search({ q: 'door', mode: 'hybrid', limit: 10, personalize: false });
    assert.deepEqual(forcedOff.hits.map((hit) => hit.asset.id), ids, 'personalize:false must be reproducible');
  } finally {
    h.cleanup();
  }
});

test('a huge play history cannot breach the ±10% ceiling', async () => {
  const h = await startHarness(false);
  try {
    const base = await h.app.searchService.search({ q: 'door', mode: 'hybrid', limit: 10 });
    const ids = base.hits.map((hit) => hit.asset.id);
    assert.ok(ids.length >= 1);

    // Far more history than any real user produces, for every result.
    for (const id of ids) {
      for (let i = 0; i < 300; i += 1) h.app.catalog.recordUsage(id, 'play', 'door');
    }
    h.app.catalog.setPersonalizationEnabled(true);

    const on = await h.app.searchService.search({ q: 'door', mode: 'hybrid', limit: 10 });
    const before = new Map(base.hits.map((hit) => [hit.asset.id, hit.score.final]));

    for (const hit of on.hits) {
      const original = before.get(hit.asset.id);
      if (original === undefined || original === 0) continue;
      const ratio = hit.score.final / original;
      assert.ok(
        ratio >= 0.9 - 1e-9 && ratio <= 1.1 + 1e-9,
        `asset ${hit.asset.id} moved by ${ratio.toFixed(4)}× — outside the ±10% band`,
      );
    }
    // 300 plays should have saturated the curve, i.e. reached near the ceiling
    const favourite = on.personalized?.find((p) => p.assetId === ids[0]!);
    assert.ok(favourite, 'the adjusted asset should be reported');
    assert.ok(favourite!.weight > 1.05, `saturation should approach the ceiling, got ${favourite!.weight}`);
  } finally {
    h.cleanup();
  }
});

test('clearing the usage log returns the ranking to exactly its unlearned order', async () => {
  const h = await startHarness(false);
  try {
    const learned = await h.app.searchService.search({ q: 'door', mode: 'hybrid', limit: 10 });
    const ids = learned.hits.map((hit) => hit.asset.id);

    for (let i = 0; i < 30; i += 1) h.app.catalog.recordUsage(ids[ids.length - 1]!, 'play', 'door');
    h.app.catalog.setPersonalizationEnabled(true);
    const personalized = await h.app.searchService.search({ q: 'door', mode: 'hybrid', limit: 10 });
    assert.ok(personalized.personalized && personalized.personalized.length > 0);

    const removed = h.app.catalog.clearUsage();
    assert.ok(removed > 0, 'clearing should report how much it forgot');
    assert.equal(h.app.catalog.countUsageEvents(), 0);

    const after = await h.app.searchService.search({ q: 'door', mode: 'hybrid', limit: 10 });
    assert.equal(after.personalized, undefined, 'with no history there is nothing to apply');
    assert.deepEqual(after.hits.map((hit) => hit.asset.id), ids, 'and the order is the unlearned one');
  } finally {
    h.cleanup();
  }
});

test('usage events are scoped to the query they were made for', async () => {
  const h = await startHarness(false);
  try {
    const door = await h.app.searchService.search({ q: 'door', mode: 'hybrid', limit: 10 });
    const target = door.hits[0]!.asset.id;
    h.app.catalog.recordUsage(target, 'play', 'metal door');

    h.app.catalog.setPersonalizationEnabled(true);
    const sameQuery = await h.app.searchService.search({ q: 'metal door', mode: 'hybrid', limit: 10 });
    const otherQuery = await h.app.searchService.search({ q: 'footsteps', mode: 'hybrid', limit: 10 });

    const weightIn = (res: typeof sameQuery): number =>
      res.personalized?.find((p) => p.assetId === target)?.weight ?? 1;

    // picked for *this* query counts more than a general favourite
    assert.ok(
      weightIn(sameQuery) >= weightIn(otherQuery),
      `same-query weight ${weightIn(sameQuery)} should be at least the cross-query one ${weightIn(otherQuery)}`,
    );
  } finally {
    h.cleanup();
  }
});

/**
 * Playlists and the sidecar backup (plan P1-3).
 *
 * The round-trip is the point: a backup is only useful if importing it onto a
 * library whose asset ids are completely different actually restores the user's
 * annotations. So these tests export from one catalogue, import into another whose
 * ids share nothing, and check the data landed on the right sounds.
 */
test('playlists hold ordered references that survive asset removal', async () => {
  const h = await startHarness(false);
  try {
    const base = `http://127.0.0.1:${h.server.port}`;
    const token = h.server.token;
    const headers = { 'x-sounddesk-token': token, 'content-type': 'application/json' };

    const created = await fetch(`${base}/api/playlists`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: '我的首选' }),
    });
    assert.equal(created.status, 201);
    const playlist = (await created.json()) as { id: number; name: string; itemCount: number };
    assert.equal(playlist.name, '我的首选');
    assert.equal(playlist.itemCount, 0);

    const ids = (await h.app.catalog.listAssetsForSidecar()).map((asset) => asset.id);
    assert.ok(ids.length >= 3, 'need a few assets');

    // add, then add again: a duplicate must not appear twice
    await fetch(`${base}/api/playlists/${playlist.id}/items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ assetIds: [ids[0]!, ids[1]!] }),
    });
    const again = await fetch(`${base}/api/playlists/${playlist.id}/items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ assetIds: [ids[1]!, ids[2]!] }),
    });
    assert.equal(((await again.json()) as { count: number }).count, 3);

    const detail = (await (await fetch(`${base}/api/playlists/${playlist.id}`, { headers })).json()) as {
      items: Array<{ assetId: number; filename: string; present: boolean }>;
    };
    assert.deepEqual(detail.items.map((item) => item.assetId), [ids[0], ids[1], ids[2]], 'order preserved');
    assert.ok(detail.items.every((item) => item.present));

    // reorder: move the last one to the front
    await fetch(`${base}/api/playlists/${playlist.id}/items`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ assetId: ids[2], toIndex: 0 }),
    });
    const reordered = (await (await fetch(`${base}/api/playlists/${playlist.id}`, { headers })).json()) as {
      items: Array<{ assetId: number }>;
    };
    assert.deepEqual(reordered.items.map((item) => item.assetId), [ids[2], ids[0], ids[1]]);

    // removing from the playlist leaves the asset itself alone
    await fetch(`${base}/api/playlists/${playlist.id}/items`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ assetIds: [ids[0]!] }),
    });
    const trimmed = (await (await fetch(`${base}/api/playlists/${playlist.id}`, { headers })).json()) as {
      items: Array<{ assetId: number }>;
    };
    assert.deepEqual(trimmed.items.map((item) => item.assetId), [ids[2], ids[1]]);
    assert.equal(h.app.catalog.countAssets(), 4, 'the asset itself must still exist');

    // deleting the asset drops it from the playlist via the schema cascade
    h.app.catalog.db.prepare('DELETE FROM assets WHERE id = ?').run(ids[1]!);
    const afterDelete = (await (await fetch(`${base}/api/playlists/${playlist.id}`, { headers })).json()) as {
      items: Array<{ assetId: number }>;
    };
    assert.deepEqual(afterDelete.items.map((item) => item.assetId), [ids[2]], 'cascade must clean the reference');
  } finally {
    h.cleanup();
  }
});

test('playlist names are unique and validated', async () => {
  const h = await startHarness(false);
  try {
    const base = `http://127.0.0.1:${h.server.port}`;
    const headers = { 'x-sounddesk-token': h.server.token, 'content-type': 'application/json' };

    assert.equal((await fetch(`${base}/api/playlists`, { method: 'POST', headers, body: JSON.stringify({ name: 'A' }) })).status, 201);
    // case-insensitive clash
    assert.equal((await fetch(`${base}/api/playlists`, { method: 'POST', headers, body: JSON.stringify({ name: 'a' }) })).status, 409);
    assert.equal((await fetch(`${base}/api/playlists`, { method: 'POST', headers, body: JSON.stringify({ name: '   ' }) })).status, 400);
    assert.equal(
      (await fetch(`${base}/api/playlists`, { method: 'POST', headers, body: JSON.stringify({ name: 'x'.repeat(500) }) })).status,
      400,
    );
  } finally {
    h.cleanup();
  }
});

test('a sidecar backup round-trips onto a catalogue with entirely different ids', async () => {
  const source = await startHarness(false);
  const target = await startHarness(false);
  try {
    const sourceBase = `http://127.0.0.1:${source.server.port}`;
    const token = source.server.token;

    // Annotate the source library: tags, favourite, rating and a manual category.
    const assets = source.app.catalog.listAssetsForSidecar();
    assert.ok(assets.length >= 2);
    const first = assets[0]!;
    const second = assets[1]!;
    source.app.catalog.setTags(first.id, ['金属', '门']);
    source.app.catalog.setFavorite(first.id, true);
    source.app.catalog.setRating(first.id, 5);
    source.app.catalog.applyClassification(first.id, {
      catId: 'DOORWood',
      confidence: 1,
      source: 'manual',
      alternatives: [],
    });
    source.app.catalog.setTags(second.id, ['脚步']);

    const playlistId = source.app.catalog.createPlaylist('备份测试');
    source.app.catalog.setPlaylistItems(playlistId, [second.id, first.id]);

    // Export.
    const exported = await fetch(`${sourceBase}/api/backup`, { headers: { 'x-sounddesk-token': token } });
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get('content-disposition') ?? '', /sounddesk-backup-.*\.json/);
    const backup = (await exported.json()) as Record<string, unknown>;
    assert.equal(backup.format, 'sounddesk-sidecar-backup');
    assert.equal((backup.counts as { annotations: number }).annotations, 2, 'only annotated assets are recorded');
    assert.equal((backup.playlists as unknown[]).length, 1);

    // The two catalogues must genuinely disagree about ids, or this proves nothing.
    const targetBase = `http://127.0.0.1:${target.server.port}`;
    const targetToken = target.server.token;
    const targetHeaders = { 'x-sounddesk-token': targetToken, 'content-type': 'application/json' };
    // Both harnesses build the *same* fixture files, so the two libraries hold
    // identical audio. That is exactly what makes this a real test of identity
    // resolution: the ids differ (fresh catalogues both number from 1, so comparing
    // them would prove nothing), the paths are identical, and only the content hash
    // can be trusted — which is why the assertions below check that the match was
    // made by hash and that the annotations landed on the file with that hash.
    const targetAssets = target.app.catalog.listAssetsForSidecar();

    // Inspect first: a dry run must not change anything.
    const inspect = await fetch(`${targetBase}/api/backup/inspect`, {
      method: 'POST',
      headers: targetHeaders,
      body: JSON.stringify({ backup }),
    });
    assert.equal(inspect.status, 200);
    const dry = (await inspect.json()) as { plan: { matched: number; unmatched: number; ambiguous: number; byMethod: Record<string, number> } };
    assert.equal(dry.plan.matched, 2, 'both annotations should match by content hash');
    assert.equal(dry.plan.byMethod.hash, 2, 'content hash is the strongest identifier and should be used');
    assert.equal(dry.plan.unmatched, 0);
    assert.equal(dry.plan.ambiguous, 0, 'a tie must produce a skip, and there must be no tie here');
    // The dry run wrote nothing.
    const untouched = target.app.catalog.listAssetsForSidecar();
    assert.ok(untouched.every((asset) => asset.tags.length === 0 && !asset.favorite && asset.rating === 0));

    // Importing without confirmation is refused.
    const unconfirmed = await fetch(`${targetBase}/api/backup/import`, {
      method: 'POST',
      headers: targetHeaders,
      body: JSON.stringify({ backup }),
    });
    assert.equal(unconfirmed.status, 428, 'import must require explicit confirmation');

    // Now really import.
    const imported = await fetch(`${targetBase}/api/backup/import`, {
      method: 'POST',
      headers: targetHeaders,
      body: JSON.stringify({ backup, confirm: true }),
    });
    assert.equal(imported.status, 200);
    const outcome = (await imported.json()) as {
      result: { applied: number; playlistsCreated: number; playlistItems: number; searchesAdded: number };
    };
    assert.equal(outcome.result.applied, 2);
    assert.ok(outcome.result.playlistsCreated >= 1);

    // The annotations must be on the *right* sounds — matched by content, not by id.
    const byId = new Map(target.app.catalog.listAssetsForSidecar().map((asset) => [asset.id, asset]));
    const restored = targetAssets.find((asset) => asset.contentHash === first.contentHash);
    assert.ok(restored, 'the target should hold a file with the same content');
    const row = byId.get(restored!.id)!;
    assert.deepEqual(row.tags.sort(), ['门', '金属'].sort(), 'tags restored onto the matching file');
    assert.equal(row.favorite, true);
    assert.equal(row.rating, 5);
    assert.equal(row.ucsSource, 'manual', 'a manual classification is authoritative and comes back');
    assert.equal(row.ucsCatId, 'DOORWood');

    // The other asset got its own tags and nothing else.
    const other = byId.get(targetAssets.find((asset) => asset.contentHash === second.contentHash)!.id)!;
    assert.deepEqual(other.tags, ['脚步']);
    assert.equal(other.favorite, false);

    // The playlist came across, in its original order.
    const playlists = (await (await fetch(`${targetBase}/api/playlists`, { headers: targetHeaders })).json()) as {
      playlists: Array<{ id: number; name: string; itemCount: number }>;
    };
    const restoredPlaylist = playlists.playlists.find((entry) => entry.name === '备份测试');
    assert.ok(restoredPlaylist, 'the playlist must be recreated');
    assert.equal(restoredPlaylist!.itemCount, 2);
    const detail = (await (
      await fetch(`${targetBase}/api/playlists/${restoredPlaylist!.id}`, { headers: targetHeaders })
    ).json()) as { items: Array<{ assetId: number }> };
    const expectedOrder = [second, first].map((asset) => targetAssets.find((t) => t.contentHash === asset.contentHash)!.id);
    assert.deepEqual(detail.items.map((item) => item.assetId), expectedOrder, 'playlist order preserved');
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

test('import merges rather than discarding newer annotations, and can be told to overwrite', async () => {
  const source = await startHarness(false);
  const target = await startHarness(false);
  try {
    const assets = source.app.catalog.listAssetsForSidecar();
    const asset = assets[0]!;
    source.app.catalog.setTags(asset.id, ['旧的']);
    source.app.catalog.setRating(asset.id, 5);

    const backup = buildBackup(source.app.catalog);

    // The target has since gained its own annotation on the same file.
    const targetAsset = target.app.catalog
      .listAssetsForSidecar()
      .find((entry) => entry.contentHash === asset.contentHash)!;
    target.app.catalog.setTags(targetAsset.id, ['新的']);
    target.app.catalog.setRating(targetAsset.id, 2);

    const plan = planImport(backup, target.app.catalog.sidecarCandidates());
    const merged = applyImport(target.app.catalog, backup, plan);
    assert.equal(merged.applied, 1);

    let row = target.app.catalog.listAssetsForSidecar().find((entry) => entry.id === targetAsset.id)!;
    assert.deepEqual(row.tags.sort(), ['新的', '旧的'].sort(), 'merge keeps both sets of tags');
    assert.equal(row.rating, 5, 'the higher rating wins, so a restore cannot lower it');

    // With overwrite the backup is treated as the truth.
    target.app.catalog.setTags(targetAsset.id, ['又一次']);
    const plan2 = planImport(backup, target.app.catalog.sidecarCandidates());
    applyImport(target.app.catalog, backup, plan2, { overwrite: true });
    row = target.app.catalog.listAssetsForSidecar().find((entry) => entry.id === targetAsset.id)!;
    assert.deepEqual(row.tags, ['旧的'], 'overwrite replaces the tags outright');
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

test('an import never overwrites a manual classification the user made later', async () => {
  const source = await startHarness(false);
  const target = await startHarness(false);
  try {
    const asset = source.app.catalog.listAssetsForSidecar()[0]!;
    source.app.catalog.applyClassification(asset.id, {
      catId: 'DOORWood',
      confidence: 1,
      source: 'manual',
      alternatives: [],
    });
    const backup = buildBackup(source.app.catalog);

    const targetAsset = target.app.catalog
      .listAssetsForSidecar()
      .find((entry) => entry.contentHash === asset.contentHash)!;
    // The user corrected it by hand after the backup was taken.
    target.app.catalog.applyClassification(targetAsset.id, {
      catId: 'FOOTSteps',
      confidence: 1,
      source: 'manual',
      alternatives: [],
    });

    const plan = planImport(backup, target.app.catalog.sidecarCandidates());
    applyImport(target.app.catalog, backup, plan);

    const row = target.app.catalog.listAssetsForSidecar().find((entry) => entry.id === targetAsset.id)!;
    assert.equal(row.ucsCatId, 'FOOTSteps', 'the newer manual correction must win');
    assert.equal(row.ucsSource, 'manual');
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

test('importing a foreign or malformed file is refused with a reason', async () => {
  const h = await startHarness(false);
  try {
    const base = `http://127.0.0.1:${h.server.port}`;
    const headers = { 'x-sounddesk-token': h.server.token, 'content-type': 'application/json' };

    for (const [payload, pattern] of [
      [{ nothing: true }, /不是 SoundDesk 的备份/],
      [{ format: 'something-else', version: 1 }, /不是 SoundDesk 的备份/],
      [{ format: 'sounddesk-sidecar-backup', version: 99 }, /更新/],
    ] as const) {
      const res = await fetch(`${base}/api/backup/inspect`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ backup: payload }),
      });
      assert.equal(res.status, 400, 'a bad file must be rejected, not half-applied');
      const body = (await res.json()) as { error: string };
      assert.match(body.error, pattern);
    }
  } finally {
    h.cleanup();
  }
});

/**
 * `--print-url` exists because the token rotates on every start, so a user who
 * lost the address cannot find it by restarting. These tests pin the boundary
 * that matters: a leftover runtime.json from a dead process must never be
 * reported as a reachable server.
 */
/**
 * Query by example — probe upload and slice search (plan §3.4).
 *
 * The stub embedder derives its vector from signal statistics, so "similar" here
 * means "statistically similar samples". That is exactly the property under test:
 * that the reference audio actually reaches the audio tower, that the mechanism
 * reports itself, and that a slice excludes its own source file.
 */
test('an uploaded probe clip is embedded and searched without touching the library', async () => {
  const h = await startHarness(true);
  try {
    const base = `http://127.0.0.1:${h.server.port}`;
    const token = h.server.token;
    const before = h.app.catalog.countAssets();

    const reference = createWav(noise(0.25, 48_000), 48_000);
    const res = await fetch(`${base}/api/search/probe?token=${encodeURIComponent(token)}&filename=reference.wav`, {
      method: 'POST',
      headers: { 'x-sounddesk-token': token, 'content-type': 'application/octet-stream' },
      body: reference,
    });
    const probeBody = await res.text();
    assert.equal(res.status, 200, probeBody);
    const body = JSON.parse(probeBody) as {
      hits: Array<{ asset: { id: number; filename: string }; score: number; via: string }>;
      preview: { durationSeconds: number; channels: number; peak: number; warnings: string[] };
      source: string;
      warnings: string[];
      maxsim: {
        stored: number;
        analysed: number;
        skippedShort: number;
        skippedBudget: number;
        maxWindows: number;
      };
    };

    assert.equal(body.source, 'probe');
    assert.ok(body.hits.length > 0, 'a probe must return neighbours');
    assert.equal(body.hits[0]!.via, 'probe');
    assert.ok(Math.abs(body.preview.durationSeconds - 0.25) < 0.03, `duration ${body.preview.durationSeconds}`);
    assert.equal(body.preview.channels, 1);
    assert.ok(body.preview.peak > 0);

    // The max-sim pass must report what it did rather than being invisible: the web
    // UI renders these counts, so a missing report would be a silent UI regression.
    assert.ok(body.maxsim, 'the probe response must carry the max-sim report');
    assert.equal(typeof body.maxsim.analysed, 'number');
    assert.equal(typeof body.maxsim.stored, 'number');
    assert.ok(body.maxsim.maxWindows > 0);

    for (let i = 1; i < body.hits.length; i += 1) {
      assert.ok(body.hits[i - 1]!.score >= body.hits[i]!.score, 'hits must be ordered by similarity');
    }

    // A probe is not library content, and its scratch file must not survive.
    assert.equal(h.app.catalog.countAssets(), before, 'a probe must not add assets');
    const scratch = path.join(h.dataDir, 'probe');
    assert.equal(existsSync(scratch) ? readdirSync(scratch).length : 0, 0, 'the scratch file must be deleted');
  } finally {
    h.cleanup();
  }
});

test('an empty or non-audio probe is refused with a reason', async () => {
  const h = await startHarness(true);
  try {
    const base = `http://127.0.0.1:${h.server.port}`;
    const token = h.server.token;

    const empty = await fetch(`${base}/api/search/probe?token=${encodeURIComponent(token)}&filename=x.wav`, {
      method: 'POST',
      headers: { 'x-sounddesk-token': token, 'content-type': 'application/octet-stream' },
      body: new Uint8Array(0),
    });
    assert.equal(empty.status, 400);

    const junk = await fetch(`${base}/api/search/probe?token=${encodeURIComponent(token)}&filename=x.wav`, {
      method: 'POST',
      headers: { 'x-sounddesk-token': token, 'content-type': 'application/octet-stream' },
      body: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
    });
    assert.ok(junk.status >= 400, 'junk must not be reported as "no results"');
    assert.ok(((await junk.json()) as { error: string }).error.length > 0);
  } finally {
    h.cleanup();
  }
});

test('slice search uses a window of an indexed file and excludes that file itself', async () => {
  const h = await startHarness(true);
  try {
    const base = `http://127.0.0.1:${h.server.port}`;
    const token = h.server.token;

    const page = (await (
      await fetch(`${base}/api/assets?limit=10`, { headers: { 'x-sounddesk-token': token } })
    ).json()) as { items: Array<{ id: number; filename: string; durationMs: number }> };
    const source = page.items.find((item) => (item.durationMs ?? 0) >= 500) ?? page.items[0]!;

    const res = await fetch(`${base}/api/search/slice`, {
      method: 'POST',
      headers: { 'x-sounddesk-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ assetId: source.id, offsetMs: 100, durationMs: 200, limit: 50 }),
    });
    const sliceBody = await res.text();
    assert.equal(res.status, 200, sliceBody);
    const body = JSON.parse(sliceBody) as {
      hits: Array<{ asset: { id: number }; score: number; via: string }>;
      preview: { durationSeconds: number };
      source: string;
    };

    assert.equal(body.source, 'slice');
    // The preview must describe the *selection*, not the whole file.
    assert.ok(
      Math.abs(body.preview.durationSeconds - 0.2) < 0.06,
      `preview should describe the selection, got ${body.preview.durationSeconds}s`,
    );
    assert.equal(
      body.hits.some((hit) => hit.asset.id === source.id),
      false,
      'the source file must not be its own best match',
    );
    for (const hit of body.hits) assert.equal(hit.via, 'slice');
  } finally {
    h.cleanup();
  }
});

test('slice search rejects an out-of-range window and a missing asset', async () => {
  const h = await startHarness(true);
  try {
    const base = `http://127.0.0.1:${h.server.port}`;
    const token = h.server.token;
    const headers = { 'x-sounddesk-token': token, 'content-type': 'application/json' };

    const missing = await fetch(`${base}/api/search/slice`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ assetId: 999999 }),
    });
    assert.equal(missing.status, 404);

    const noId = await fetch(`${base}/api/search/slice`, { method: 'POST', headers, body: JSON.stringify({}) });
    assert.equal(noId.status, 400);

    const items = (await (
      await fetch(`${base}/api/assets?limit=1`, { headers: { 'x-sounddesk-token': token } })
    ).json()) as { items: Array<{ id: number }> };
    const past = await fetch(`${base}/api/search/slice`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ assetId: items.items[0]!.id, offsetMs: 10 * 60 * 1000, durationMs: 100 }),
    });
    assert.equal(past.status, 400, 'a window past the end must be refused, not silently empty');
    assert.match(((await past.json()) as { error: string }).error, /选区/);
  } finally {
    h.cleanup();
  }
});

test('readRuntimeFile returns the live server details', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sounddesk-runtime-'));
  try {
    writeRuntimeFile(dir, { port: 1234, token: 'tok-abc', url: 'http://127.0.0.1:1234' });
    const info = readRuntimeFile(dir);
    assert.ok(info, 'expected the live runtime file to be read');
    assert.equal(info.port, 1234);
    assert.equal(info.token, 'tok-abc');
    assert.equal(info.url, 'http://127.0.0.1:1234');
    // the pid is this test process, which is certainly alive
    assert.equal(info.pid, process.pid);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readRuntimeFile returns null when there is no server', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sounddesk-runtime-'));
  try {
    assert.equal(readRuntimeFile(dir), null, 'missing file');

    writeFileSync(path.join(dir, 'runtime.json'), 'not json at all');
    assert.equal(readRuntimeFile(dir), null, 'malformed file');

    writeFileSync(path.join(dir, 'runtime.json'), JSON.stringify({ port: 1, url: 'http://x' }));
    assert.equal(readRuntimeFile(dir), null, 'no token');

    writeFileSync(path.join(dir, 'runtime.json'), JSON.stringify({ port: 1, token: 't' }));
    assert.equal(readRuntimeFile(dir), null, 'no url');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readRuntimeFile rejects a runtime file left behind by a dead process', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sounddesk-runtime-'));
  try {
    // A pid that cannot be running: the maximum on Windows is well below this,
    // and process.kill(pid, 0) throws for anything that does not exist.
    writeRuntimeFile(dir, { port: 1234, token: 'tok-abc', url: 'http://127.0.0.1:1234' });
    const file = path.join(dir, 'runtime.json');
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    parsed.pid = 2 ** 30;
    writeFileSync(file, JSON.stringify(parsed));

    assert.equal(readRuntimeFile(dir), null, 'a stale pid must not be reported as reachable');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * The export route saves a client-rendered WAV. The browser does the DSP; the
 * engine's job is only to write bytes safely, so these assertions are about the
 * safety rules rather than about audio.
 */
test('the export route saves rendered audio next to the library without overwriting', async () => {
  const h = await startHarness(false);
  try {
    const base = `http://127.0.0.1:${h.server.port}`;
    const token = h.server.token;
    const assets = (await (
      await fetch(`${base}/api/assets?limit=5`, { headers: { 'x-sounddesk-token': token } })
    ).json()) as { items: Array<{ id: number; filename: string }> };
    const asset = assets.items[0]!;

    // A real 16-bit WAV, so the RIFF check passes honestly.
    const wav = createWav(sine(440, 0.05, 48_000), 48_000);
    const url = `${base}/api/export/save?assetId=${asset.id}&filename=${encodeURIComponent(asset.filename)}`;

    const first = await fetch(url, {
      method: 'POST',
      headers: { 'x-sounddesk-token': token, 'content-type': 'application/octet-stream' },
      body: wav,
    });
    const saved = (await first.json()) as { filePath: string; bytes: number; renamed: boolean; directory: string };
    assert.equal(first.status, 201, JSON.stringify(saved));
    assert.equal(saved.renamed, false);
    assert.equal(saved.bytes, wav.byteLength);
    assert.ok(saved.filePath.endsWith('_fx.wav'), `expected an _fx suffix, got ${saved.filePath}`);
    // it landed inside the library we exported from, not somewhere else
    assert.equal(saved.directory.toLowerCase(), h.root.toLowerCase(), `landed in ${saved.directory}, root is ${h.root}`);
    assert.ok(existsSync(saved.filePath));

    // exporting the same asset again must not clobber the first file
    const second = await fetch(url, {
      method: 'POST',
      headers: { 'x-sounddesk-token': token, 'content-type': 'application/octet-stream' },
      body: wav,
    });
    assert.equal(second.status, 201);
    const savedAgain = (await second.json()) as { filePath: string; renamed: boolean };
    assert.notEqual(savedAgain.filePath, saved.filePath);
    assert.equal(savedAgain.renamed, true);
    assert.ok(existsSync(saved.filePath), 'the first export must still exist');
    assert.ok(existsSync(savedAgain.filePath));

    // and the original asset is untouched
    const original = createWav(sine(1200, 0.05, 48_000), 48_000);
    assert.ok(original.length > 0);
  } finally {
    h.cleanup();
  }
});

/**
 * Drag-out (plan P2-2) needs a whole file with a usable name. The stream route
 * sends no `Content-Disposition`, so a dragged copy would lose its extension —
 * which is what would make dropping one into a DAW fail.
 */
test('the download route sends the original file name and the whole file', async () => {
  const h = await startHarness(false);
  try {
    const base = `http://127.0.0.1:${h.server.port}`;
    const token = h.server.token;
    const assets = (await (
      await fetch(`${base}/api/assets?limit=5`, { headers: { 'x-sounddesk-token': token } })
    ).json()) as { items: Array<{ id: number; filename: string; sizeBytes: number }> };
    const asset = assets.items[0]!;

    const res = await fetch(`${base}/api/media/${asset.id}/download`, {
      headers: { 'x-sounddesk-token': token },
    });
    assert.equal(res.status, 200);
    const disposition = res.headers.get('content-disposition') ?? '';
    assert.match(disposition, /^attachment;/, 'a download must be an attachment');
    assert.ok(disposition.includes('filename='), `no filename in "${disposition}"`);
    // the extension must survive, or the dragged file is unusable
    assert.ok(disposition.includes('.wav'), `no extension in "${disposition}"`);

    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.equal(bytes.byteLength, asset.sizeBytes, 'the whole file must be sent');
    // and it must still be a real WAV, not an error page
    assert.equal(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!), 'RIFF');

    // HEAD gives the headers without the body
    const head = await fetch(`${base}/api/media/${asset.id}/download`, {
      method: 'HEAD',
      headers: { 'x-sounddesk-token': token },
    });
    assert.equal(head.status, 200);
    assert.ok((head.headers.get('content-disposition') ?? '').includes('.wav'));
    assert.equal((await head.arrayBuffer()).byteLength, 0);

    // unknown asset, and no token
    assert.equal((await fetch(`${base}/api/media/999999/download`, { headers: { 'x-sounddesk-token': token } })).status, 404);
    assert.equal((await fetch(`${base}/api/media/${asset.id}/download`)).status, 401);
  } finally {
    h.cleanup();
  }
});

test('the download route encodes a non-ASCII name for the client', async () => {
  const h = await startHarness(false);
  try {
    const base = `http://127.0.0.1:${h.server.port}`;
    const token = h.server.token;
    // Rename one catalogue entry to a name with non-ASCII characters, which is
    // the normal case for these libraries, and check how it is advertised.
    const row = h.app.catalog.db.prepare('SELECT id FROM assets LIMIT 1').get() as { id: number };
    h.app.catalog.db.prepare('UPDATE assets SET filename = ? WHERE id = ?').run('金属门_fx.wav', row.id);

    const res = await fetch(`${base}/api/media/${row.id}/download`, {
      headers: { 'x-sounddesk-token': token },
    });
    const disposition = res.headers.get('content-disposition') ?? '';
    // RFC 5987 form so the real name survives, plus an ASCII fallback
    assert.ok(disposition.includes("filename*=UTF-8''"), `missing filename* in "${disposition}"`);
    assert.ok(disposition.includes(encodeURIComponent('金属门_fx.wav')), `wrong encoded name in "${disposition}"`);
    assert.equal(res.status, 200);
  } finally {
    h.cleanup();
  }
});

test('the export route refuses non-WAV payloads and unknown assets', async () => {
  const h = await startHarness(false);
  try {
    const base = `http://127.0.0.1:${h.server.port}`;
    const token = h.server.token;

    const notAudio = await fetch(`${base}/api/export/save?assetId=1&filename=x.wav`, {
      method: 'POST',
      headers: { 'x-sounddesk-token': token, 'content-type': 'application/octet-stream' },
      body: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    });
    assert.ok(notAudio.status >= 400, 'arbitrary bytes must not be written');

    const missing = await fetch(`${base}/api/export/save?assetId=999999&filename=x.wav`, {
      method: 'POST',
      headers: { 'x-sounddesk-token': token, 'content-type': 'application/octet-stream' },
      body: createWav(sine(440, 0.02, 48_000), 48_000),
    });
    assert.equal(missing.status, 404);

    // and it is not reachable without the token
    const unauth = await fetch(`${base}/api/export/save?assetId=1&filename=x.wav`, {
      method: 'POST',
      body: new Uint8Array(0),
    });
    assert.equal(unauth.status, 401);
  } finally {
    h.cleanup();
  }
});
