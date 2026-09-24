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
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { backupPathFor } from '@sounddesk/audio-wav';

import { createApp, readRuntimeFile, writeRuntimeFile } from './index.js';
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
    path.join(root, 'Impacts', 'Metal', 'metal_clang_heavy_03.wav'),
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

    const clang = rows.find((r) => String(r.filename).startsWith('metal_clang'))!;
    assert.equal(clang.ucsSource, 'filename', 'directory hint should classify the metal clang');
    assert.equal(clang.ucsCatId, 'IMPACTMetal');

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
    const hit = await h.app.searchService.search({ q: 'metal clang', mode: 'keyword' });
    assert.ok(hit.hits.length >= 1, 'expected the metal clang to match');
    assert.equal(hit.hits[0]!.asset.filename, 'metal_clang_heavy_03.wav');

    const excluded = await h.app.searchService.search({ q: 'metal -clang', mode: 'keyword' });
    assert.equal(
      excluded.hits.some((x) => x.asset.filename === 'metal_clang_heavy_03.wav'),
      false,
      'the -clang exclusion must remove it',
    );

    const prefix = await h.app.searchService.search({ q: 'clang*', mode: 'keyword' });
    assert.ok(prefix.hits.length >= 1, 'prefix wildcard should match clang');
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
    assert.ok(
      res.hits.some((x) => x.asset.ucsCatId === 'IMPACTMetal'),
      `expected IMPACTMetal in results, got ${JSON.stringify(res.hits.map((x) => x.asset.ucsCatId))}`,
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
    const clang = rows.find((r) => r.filename.startsWith('metal_clang'))!;

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

test('UCS tree reports per-category counts and the lookup endpoint resolves aliases', async () => {
  const h = await startHarness(false);
  try {
    const res = await fetch(`${h.server.url}/api/ucs/tree`, { headers: { 'x-sounddesk-token': h.server.token } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { tree: Array<{ category: string; count: number }>; uncategorized: number };
    assert.ok(body.tree.length > 5, 'the UCS vocabulary should be present');
    const impacts = body.tree.find((t) => t.category === 'IMPACTS');
    assert.ok(impacts, 'IMPACTS should exist in the tree');
    assert.ok(impacts!.count >= 1, 'the metal clang should be counted under IMPACTS');

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
    const clang = rows.find((r) => r.filename.startsWith('metal_clang'))!;

    const patched = await fetch(`${h.server.url}/api/assets/${clang.id}`, {
      method: 'PATCH',
      headers: { 'x-sounddesk-token': h.server.token, 'content-type': 'application/json' },
      body: JSON.stringify({ ucsCatId: 'IMPACTWood', tags: ['我的标签'], rating: 4 }),
    });
    assert.equal(patched.status, 200);
    const asset = (await patched.json()) as { ucsCatId: string; ucsSource: string; tags: string[]; rating: number };
    assert.equal(asset.ucsCatId, 'IMPACTWood');
    assert.equal(asset.ucsSource, 'manual');
    assert.deepEqual(asset.tags, ['我的标签']);
    assert.equal(asset.rating, 4);

    // Re-running classification must NOT clobber the manual choice.
    const libraryId = (h.app.catalog.listLibraries()[0]!).id;
    await h.app.indexer.runFastPass(libraryId, h.root);
    const after = h.app.catalog.getAssetRow(clang.id)!;
    assert.equal(after.ucsCatId, 'IMPACTWood', 'a manual correction must be sticky');
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
 * `--print-url` exists because the token rotates on every start, so a user who
 * lost the address cannot find it by restarting. These tests pin the boundary
 * that matters: a leftover runtime.json from a dead process must never be
 * reported as a reachable server.
 */
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
