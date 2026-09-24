/**
 * Tests the webview→engine request surface.
 *
 * The point of these is that the mapping layer is pure: it takes a plain params
 * object and an engine and returns serialisable data. So we exercise it against
 * a **real** in-memory catalogue and a **real** UCS classifier, and only stub
 * the search service — this catches column-name and DTO mistakes that a fully
 * mocked engine would happily hide.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Catalog, UcsClassifier, syncUcsTable } from '@sounddesk/engine';
import { dataset } from '@sounddesk/ucs';
import { encodeWav } from '@sounddesk/audio-effects';

import { createHandler, type EngineLike } from './engineBridge.ts';

interface Fixture {
  engine: EngineLike;
  handler: (method: string, params: unknown) => Promise<unknown>;
  catalog: Catalog;
  close(): void;
}

function makeFixture(): Fixture {
  const catalog = Catalog.openMemory();
  const classifier = new UcsClassifier(dataset.categories as never[]);
  // A real temporary library root. A hard-coded POSIX-looking path such as
  // `/tmp/sfx` resolves *inside the repository* on Windows, which made the export
  // test write into the working tree and then collide with itself on a rerun.
  const libraryRoot = mkdtempSync(path.join(tmpdir(), 'sounddesk-ext-lib-'));
  const dataDir = mkdtempSync(path.join(tmpdir(), 'sounddesk-ext-data-'));
  // Real catalogues get this from createApp; a hand-built one must do it too or
  // the ucs_categories join reports everything as uncategorised.
  syncUcsTable(catalog, dataset.categories as never[]);

  const categories = [...new Set(dataset.categories.map((c) => c.category))];
  const engine: EngineLike = {
    catalog,
    classifier,
    dataDir,
    ucs: {
      list: () => dataset.categories.map((c) => ({ ...c, code: c.code ?? c.category })),
      categories: () => categories,
      catIdsInCategory: (category: string) =>
        dataset.categories.filter((c) => c.category === category.toUpperCase()).map((c) => c.catId),
      get: (catId: string) => dataset.categories.find((c) => c.catId === catId) ?? null,
      lookup: (term: string) =>
        dataset.categories.filter((c) => c.catId.includes(term) || c.synonymsEn.includes(term)),
      lookupAliases: (term: string) =>
        dataset.categories.filter((c) => c.catId.includes(term) || c.synonymsEn.includes(term)).map((c) => c.catId),
    },
    // Only `search` is exercised; the rest of SearchService is not reachable here.
    searchService: {
      search: async () => ({
        hits: [],
        total: 0,
        tookMs: 1,
        captionsUsed: [],
        unmatchedTerms: [],
        belowThreshold: false,
      }),
    } as unknown as EngineLike['searchService'],
    // Minimal stand-ins for the indexer surface the handler touches.
    indexer: {
      listJobs: () => [],
      cancel: () => true,
      runFastPass: async () => ({ id: 'j', state: 'done', done: 0, total: 0, failed: 0 }),
      runWaveformPass: async () => ({ id: 'j2', state: 'done', done: 0, total: 0, failed: 0 }),
      runEmbedPass: async () => ({ id: 'j3', state: 'done', done: 0, total: 0, failed: 0 }),
    } as unknown as EngineLike['indexer'],
    // Not ready, so `addLibraryAndIndex` skips the fingerprint pass — which is the
    // behaviour under test rather than an accident of the fixture.
    embedder: { id: 'none', dim: 512, ready: false } as unknown as EngineLike['embedder'],
  };

  const libraryId = catalog.addLibrary('Test Library', libraryRoot, 'local');
  const { id } = catalog.upsertAsset({
    libraryId,
    path: path.join(libraryRoot, 'Doors', 'wood_close.wav'),
    dir: path.join(libraryRoot, 'Doors'),
    filename: 'wood_close.wav',
    extension: '.wav',
    sizeBytes: 1234,
    mtimeMs: 111,
    searchText: 'wood close doors',
  });
  catalog.applyMetadata(id, {
    durationMs: 900,
    sampleRate: 48000,
    bitDepth: 16,
    channels: 1,
    codec: 'PCM',
    audioFormatTag: 1,
    isFloat: false,
    contentHash: 'abc',
    emDescription: 'wooden door closing',
    emKeywords: JSON.stringify(['door', 'wood']),
    emDesigner: null,
    emRecorder: null,
    emCopyright: null,
    emLibrary: null,
    emOriginator: null,
    emOriginationDate: null,
    emProject: null,
    emScene: null,
    emTake: null,
    emNote: null,
    emIxml: null,
    emInfo: null,
    emCodingHistory: null,
    hasBext: false,
    chunks: null,
    searchText: 'wood close doors',
    lastError: null,
  });
  catalog.setTags(id, ['我的标签']);

  return {
    engine,
    catalog,
    handler: createHandler(engine),
    close: () => {
      catalog.close();
      rmSync(libraryRoot, { recursive: true, force: true });
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

test('unknown methods fail loudly instead of hanging the UI', async () => {
  const f = makeFixture();
  try {
    await assert.rejects(() => f.handler('doesNotExist', {}), /unsupported engine method/);
  } finally {
    f.close();
  }
});

/**
 * The import path used by the web UI's "add a local library" button.
 *
 * Unlike `addLibrary`, which returns immediately and scans in the background, this
 * must resolve only after every pass has finished — the UI blocks on it, so returning
 * early would release the progress screen over a half-indexed library.
 */
test('addLibraryAndIndex runs every pass and reports what it skipped', async () => {
  const f = makeFixture();
  try {
    const order: string[] = [];
    const indexer = (f.engine as unknown as { indexer: Record<string, unknown> }).indexer;
    indexer.runFastPass = async () => {
      order.push('scan');
      return { id: 'j1', state: 'done', done: 7, total: 7, failed: 0 };
    };
    indexer.runWaveformPass = async () => {
      order.push('waveform');
      return { id: 'j2', state: 'done', done: 7, total: 7, failed: 1 };
    };
    indexer.runEmbedPass = async () => {
      order.push('embed');
      return { id: 'j3', state: 'done', done: 7, total: 7, failed: 0 };
    };

    const result = (await f.handler('addLibraryAndIndex', { root: '/tmp/sfx', name: 'SFX' })) as {
      library: { id: number; name: string; root: string } | null;
      passes: Array<{ pass: string }>;
      embedSkipped: boolean;
      failed: number;
    };

    assert.deepEqual(order, ['scan', 'waveform'], 'with no model loaded the embed pass is skipped');
    assert.deepEqual(
      result.passes.map((p) => p.pass),
      ['scan', 'waveform'],
    );
    assert.equal(result.embedSkipped, true, 'the response must admit the fingerprints were not computed');
    assert.equal(result.failed, 1, 'failed counts are summed across passes');
    assert.equal(result.library?.name, 'SFX');
    assert.ok(result.library?.id, 'the new library must come back with an id');
  } finally {
    f.close();
  }
});

test('addLibraryAndIndex requires a root and refuses an empty one', async () => {
  const f = makeFixture();
  try {
    await assert.rejects(() => f.handler('addLibraryAndIndex', {}), /root is required/);
    await assert.rejects(() => f.handler('addLibraryAndIndex', { root: '' }), /root is required/);
  } finally {
    f.close();
  }
});

test('addLibraryAndIndex names the library after the folder when no name is given', async () => {
  const f = makeFixture();
  try {
    const indexer = (f.engine as unknown as { indexer: Record<string, unknown> }).indexer;
    indexer.runFastPass = async () => ({ id: 'j', state: 'done', done: 0, total: 0, failed: 0 });
    indexer.runWaveformPass = async () => ({ id: 'j2', state: 'done', done: 0, total: 0, failed: 0 });

    const result = (await f.handler('addLibraryAndIndex', { root: 'D:\\SFX\\Doors' })) as {
      library: { name: string } | null;
    };
    assert.equal(result.library?.name, 'Doors');
  } finally {
    f.close();
  }
});

/**
 * The webview renders effect-chain exports offline and hands the finished bytes to
 * the host. The host only writes them, so the test is about the same safety rules
 * as the HTTP route: a real WAV lands on disk, and junk is refused rather than
 * written to a file named `.wav`.
 */
test('saveExport writes a real WAV and refuses non-audio bytes', async () => {
  const f = makeFixture();
  try {
    const assets = (await f.handler('listAssets', { limit: 1 })) as {
      items: Array<{ id: number; filename: string }>;
    };
    const asset = assets.items[0]!;

    const samples = new Float32Array(64);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.sin((i / samples.length) * Math.PI * 2) * 0.5;
    const wav = encodeWav([samples], 48000, { bitsPerSample: 24 });

    const saved = (await f.handler('saveExport', {
      assetId: asset.id,
      filename: asset.filename,
      bytes: wav,
    })) as { filePath: string; bytes: number; renamed: boolean };

    assert.equal(saved.bytes, wav.byteLength);
    assert.equal(saved.renamed, false);
    assert.ok(saved.filePath.endsWith('_fx.wav'), `expected an _fx suffix, got ${saved.filePath}`);
    assert.ok(existsSync(saved.filePath), 'the export must be on disk');
    assert.equal(statSync(saved.filePath).size, wav.byteLength);

    // a second export must not overwrite the first
    const again = (await f.handler('saveExport', {
      assetId: asset.id,
      filename: asset.filename,
      bytes: wav,
    })) as { filePath: string; renamed: boolean };
    assert.notEqual(again.filePath, saved.filePath);
    assert.equal(again.renamed, true);
    assert.ok(existsSync(saved.filePath), 'the first export must survive');

    await assert.rejects(
      () => f.handler('saveExport', { assetId: asset.id, filename: 'x.wav', bytes: new Uint8Array(32) }),
      /不是 WAV/,
    );
    await assert.rejects(() => f.handler('saveExport', { assetId: 999999, filename: 'x.wav', bytes: wav }), /not found/);
  } finally {
    f.close();
  }
});

test('libraries and assets round-trip through the bridge', async () => {
  const f = makeFixture();
  try {
    const libraries = (await f.handler('libraries', {})) as Array<{ id: number; name: string; assetCount: number }>;
    assert.equal(libraries.length, 1);
    assert.equal(libraries[0]!.name, 'Test Library');
    assert.equal(libraries[0]!.assetCount, 1, 'the asset count subquery must be exposed');

    const page = (await f.handler('listAssets', { limit: 10 })) as {
      items: Array<{ filename: string; durationMs: number; tags: string[] }>;
      total: number;
    };
    assert.equal(page.total, 1);
    assert.equal(page.items[0]!.filename, 'wood_close.wav');
    assert.equal(page.items[0]!.durationMs, 900);
    assert.deepEqual(page.items[0]!.tags, ['我的标签']);
  } finally {
    f.close();
  }
});

test('asset detail includes embedded metadata and format', async () => {
  const f = makeFixture();
  try {
    const asset = (await f.handler('asset', { id: 1 })) as {
      filename: string;
      format: { codec: string; sampleRate: number };
      embedded: { description: string; keywords: string[] };
    };
    assert.equal(asset.filename, 'wood_close.wav');
    assert.equal(asset.format.codec, 'PCM');
    assert.equal(asset.format.sampleRate, 48000);
    assert.equal(asset.embedded.description, 'wooden door closing');
    assert.deepEqual(asset.embedded.keywords, ['door', 'wood']);
  } finally {
    f.close();
  }
});

test('a missing asset is an error, not an empty object', async () => {
  const f = makeFixture();
  try {
    await assert.rejects(() => f.handler('asset', { id: 999 }), /not found/);
  } finally {
    f.close();
  }
});

test('patching records a manual classification that survives re-patching', async () => {
  const f = makeFixture();
  try {
    const updated = (await f.handler('patchAsset', {
      id: 1,
      patch: { ucsCatId: 'DOORWood', tags: ['a', 'b'], favorite: true, rating: 5 },
    })) as { ucsCatId: string; ucsSource: string; tags: string[]; favorite: boolean; rating: number };

    assert.equal(updated.ucsCatId, 'DOORWood');
    assert.equal(updated.ucsSource, 'manual', 'a user correction must be marked manual');
    assert.deepEqual(updated.tags, ['a', 'b']);
    assert.equal(updated.favorite, true);
    assert.equal(updated.rating, 5);

    // the automatic pipeline must not clobber it
    f.catalog.applyClassification(1, { catId: 'IMPACTMetal', confidence: 0.9, source: 'clap', alternatives: [] });
    const row = f.catalog.getAssetRow(1)!;
    assert.equal(row.ucsCatId, 'DOORWood');
    assert.equal(row.ucsSource, 'manual');

    const feedback = f.catalog.db.prepare('SELECT COUNT(*) AS n FROM feedback').get() as { n: number };
    assert.equal(feedback.n, 1, 'the correction should be recorded as training feedback');
  } finally {
    f.close();
  }
});

test('favourite and rating can be patched independently of classification', async () => {
  const f = makeFixture();
  try {
    await f.handler('patchAsset', { id: 1, patch: { favorite: true } });
    const afterFav = f.catalog.getAssetRow(1)!;
    assert.equal(afterFav.favorite, 1);
    assert.equal(afterFav.ucsSource, null, 'patching a favourite must not touch classification');

    await f.handler('patchAsset', { id: 1, patch: { rating: 3 } });
    assert.equal(f.catalog.getAssetRow(1)!.rating, 3);
  } finally {
    f.close();
  }
});

test('ucsTree reports counts per category and totals uncategorised assets', async () => {
  const f = makeFixture();
  try {
    // classify the one asset so a category has a non-zero count
    await f.handler('patchAsset', { id: 1, patch: { ucsCatId: 'DOORWood' } });

    const tree = (await f.handler('ucsTree', {})) as {
      tree: Array<{ category: string; count: number; children: Array<{ catId: string; count: number }> }>;
      uncategorized: number;
    };
    const doors = tree.tree.find((n) => n.category === 'DOORS');
    assert.ok(doors, 'DOORS must exist in the vocabulary');
    assert.equal(doors!.count, 1);
    const wood = doors!.children.find((c) => c.catId === 'DOORWood');
    assert.ok(wood, 'the subcategory must be listed');
    assert.equal(wood!.count, 1);
    assert.equal(tree.uncategorized, 0);
  } finally {
    f.close();
  }
});

test('stats and jobs return serialisable shapes', async () => {
  const f = makeFixture();
  try {
    const stats = (await f.handler('stats', {})) as { assets: number; libraries: number };
    assert.equal(stats.assets, 1);
    assert.equal(stats.libraries, 1);

    const jobs = await f.handler('jobs', {});
    assert.ok(Array.isArray(jobs));
  } finally {
    f.close();
  }
});

test('removing a library drops its assets but never touches files', async () => {
  const f = makeFixture();
  try {
    await f.handler('removeLibrary', { id: 1 });
    assert.equal(f.catalog.countAssets(), 0);
    assert.equal(f.catalog.listLibraries().length, 0);
  } finally {
    f.close();
  }
});

test('search params are forwarded to the engine verbatim', async () => {
  const f = makeFixture();
  try {
    let seen: unknown = null;
    (f.engine.searchService as unknown as { search: (r: unknown) => Promise<unknown> }).search = async (request) => {
      seen = request;
      return { hits: [], total: 0, tookMs: 0, captionsUsed: [], unmatchedTerms: [], belowThreshold: false };
    };
    await f.handler('search', { q: '金属门', mode: 'semantic', limit: 5 });
    assert.deepEqual(seen, { q: '金属门', mode: 'semantic', limit: 5 });
  } finally {
    f.close();
  }
});
