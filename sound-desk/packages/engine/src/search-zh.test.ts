/**
 * Regression tests: a Chinese query must reach the text index.
 *
 * WHY THIS SUITE EXISTS
 *
 * The catalogue's `searchText` is built from filenames, embedded metadata and UCS
 * names. For an English sound library that means **no CJK at all** — a real one
 * measured here has 3,383 assets and zero rows containing any Han character. So a
 * keyword search for `怪物` over that index can only ever return nothing, no matter
 * how good BM25 is: the token is simply not in the text.
 *
 * The Chinese→English rewrite already existed and was already wired into the
 * embedding path, which is why hybrid search found results and keyword mode did not.
 * These tests pin that the rewrite reaches FTS too — for both modes — and that the
 * fix did not quietly break exclusion syntax or plain English queries.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Catalog } from './db.ts';
import { SearchService, VectorIndex } from './search.ts';
import { UcsClassifier } from './ucs-classifier.ts';
import { expandQueryZh } from '@sounddesk/ucs';

/** A minimal catalogue of English-named assets, as a real sound library is. */
function makeService(): { service: SearchService; catalog: Catalog; close: () => void } {
  const catalog = Catalog.openMemory();
  const libraryId = catalog.addLibrary('lib', 'C:/lib', 'local');
  const classifier = new UcsClassifier([]);

  const rows: Array<[string, number]> = [
    ['char_en_vo_crow_death_02.wav', 1_800],
    ['char_en_vo_skeleton_aggro_04.wav', 2_200],
    ['monster_roar_distant_01.wav', 3_400],
    ['door_wood_close_heavy.wav', 900],
    ['whoosh_sword_fast_02.wav', 600],
  ];
  for (const [filename, durationMs] of rows) {
    const id = catalog.upsertAsset({
      libraryId,
      path: `C:/lib/${filename}`,
      dir: 'C:/lib',
      filename,
      extension: '.wav',
      sizeBytes: 1000,
      mtimeMs: 1,
      searchText: filename.replace(/[_.]/g, ' ').replace(/\.wav$/, ''),
    }).id;
    catalog.applyMetadata(id, {
      durationMs,
      sampleRate: 48_000,
      bitDepth: 16,
      channels: 1,
      codec: 'pcm_s16le',
      audioFormatTag: 1,
      isFloat: false,
      contentHash: null,
      emDescription: null,
      emKeywords: null,
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
      searchText: filename.replace(/[_.]/g, ' ').replace(/\.wav$/, ''),
      lastError: null,
    });
  }

  const vectorIndex = new VectorIndex(catalog);
  const service = new SearchService({
    catalog,
    vectorIndex,
    // No embedder: these tests are specifically about the *text* path, and leaving the
    // model out proves the results cannot have come from a vector search.
    embedder: null,
    classifierLookup: () => [],
    classifierLookupCategory: () => [],
    expandQuery: (text: string) => expandQueryZh(text),
  });

  return { service, catalog, close: () => catalog.close() };
}

test('the fixture really has no CJK in its indexed text', () => {
  const h = makeService();
  try {
    const withCjk = h.catalog.db
      .prepare("SELECT COUNT(*) AS n FROM assets WHERE searchText GLOB '*[一-龥]*'")
      .get() as { n: number };
    // This is the premise of the whole suite: if the index had CJK, a Chinese query
    // would work by accident and the tests below would prove nothing.
    assert.equal(withCjk.n, 0, 'the fixture must contain no Han characters');
  } finally {
    h.close();
  }
});

test('keyword mode finds assets for a Chinese query via the English rewrite', async () => {
  const h = makeService();
  try {
    // 怪物 → monster, creature. `monster_roar_distant_01.wav` must come back.
    const response = await h.service.search({ q: '怪物', mode: 'keyword', limit: 10 });
    const names = response.hits.map((hit) => hit.asset.filename);
    assert.ok(
      names.includes('monster_roar_distant_01.wav'),
      `expected the monster file; got ${JSON.stringify(names)}`,
    );
  } finally {
    h.close();
  }
});

test('the rewrite is reported so the UI can show what it searched for', async () => {
  const h = makeService();
  try {
    const response = await h.service.search({ q: '怪物', mode: 'hybrid', limit: 10 });
    assert.ok(response.captionsUsed.length > 0, 'captionsUsed must not be empty for a rewritten query');
    const joined = response.captionsUsed.join(' ').toLowerCase();
    assert.ok(
      joined.includes('monster') || joined.includes('creature'),
      `expected the rewrite in captionsUsed, got ${JSON.stringify(response.captionsUsed)}`,
    );
  } finally {
    h.close();
  }
});

test('an English keyword query still works unchanged', async () => {
  const h = makeService();
  try {
    const response = await h.service.search({ q: 'crow', mode: 'keyword', limit: 10 });
    assert.ok(
      response.hits.some((hit) => hit.asset.filename.startsWith('char_en_vo_crow')),
      'a plain English query must keep matching',
    );
  } finally {
    h.close();
  }
});

test('exclusion syntax survives the rewrite', async () => {
  const h = makeService();
  try {
    // `-skeleton` must still exclude even though the positives are now rewritten
    // English captions rather than the parsed query terms.
    const response = await h.service.search({ q: '怪物 -skeleton', mode: 'keyword', limit: 10 });
    const names = response.hits.map((hit) => hit.asset.filename);
    assert.equal(
      names.some((name) => name.includes('skeleton')),
      false,
      `-skeleton must exclude, got ${JSON.stringify(names)}`,
    );
  } finally {
    h.close();
  }
});

test('a Chinese query with no known translation returns nothing rather than everything', async () => {
  const h = makeService();
  try {
    // An unmatchable query must stay empty. The risk with feeding rewritten terms to
    // FTS is that a failed rewrite degenerates into an empty MATCH, which FTS5 treats
    // as "match anything".
    const response = await h.service.search({ q: '啊啊毫无关联', mode: 'keyword', limit: 10 });
    assert.equal(response.hits.length, 0, 'an unmatched query must not return the whole library');
  } finally {
    h.close();
  }
});

test('an empty query in keyword mode is still a no-op', async () => {
  const h = makeService();
  try {
    const response = await h.service.search({ q: '', mode: 'keyword', limit: 10 });
    assert.equal(response.hits.length, 0);
  } finally {
    h.close();
  }
});
