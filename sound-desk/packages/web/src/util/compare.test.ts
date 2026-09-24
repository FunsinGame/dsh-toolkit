/**
 * Compare-workspace tests.
 *
 * The sorting and parsing here are small but easy to get quietly wrong — a natural
 * sort that puts "10" before "2", a batch parser that splits a query containing a
 * comma — and both produce output that looks plausible while being wrong.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { SearchHit } from '@sounddesk/core';

import {
  COMPARE_SORTS,
  compareNaturally,
  crossColumnCounts,
  describeColumn,
  parseBatchQueries,
  sortHits,
  type CompareColumn,
} from './compare.ts';

function hit(id: number, filename: string, durationMs: number | null, sampleRate: number | null): SearchHit {
  return {
    asset: { id, filename, durationMs, sampleRate } as SearchHit['asset'],
    score: { final: 1 } as SearchHit['score'],
    highlights: [],
  };
}

function column(id: string, hits: SearchHit[], patch: Partial<CompareColumn> = {}): CompareColumn {
  return {
    id,
    query: id,
    hits,
    total: hits.length,
    tookMs: 1,
    sort: 'relevance',
    width: 320,
    pinned: false,
    loading: false,
    error: null,
    ...patch,
  };
}

// ---------------------------------------------------------------------------
// natural sort
// ---------------------------------------------------------------------------

test('compareNaturally orders numbered takes the way a person reads them', () => {
  const names = ['take_10.wav', 'take_2.wav', 'take_1.wav', 'take_20.wav'];
  const sorted = [...names].sort(compareNaturally);
  assert.deepEqual(sorted, ['take_1.wav', 'take_2.wav', 'take_10.wav', 'take_20.wav']);

  // the plain string comparison this replaces gets it wrong
  const naive = [...names].sort();
  assert.notDeepEqual(naive, sorted, 'plain sort should differ, or this test proves nothing');
});

test('compareNaturally keeps zero-padded numbers in a sane order', () => {
  const sorted = ['sfx_007.wav', 'sfx_07.wav', 'sfx_7.wav'].sort(compareNaturally);
  // all equal numerically; the shorter form is the smaller value
  assert.deepEqual(sorted, ['sfx_7.wav', 'sfx_07.wav', 'sfx_007.wav']);
});

test('compareNaturally handles mixed text and numbers, and non-ASCII', () => {
  const sorted = ['大教堂_2.wav', '大教堂_10.wav', '大教堂_1.wav'].sort(compareNaturally);
  assert.deepEqual(sorted, ['大教堂_1.wav', '大教堂_2.wav', '大教堂_10.wav']);

  assert.equal(compareNaturally('a', 'a'), 0);
  assert.equal(compareNaturally('a', 'b') < 0, true);
  // a name that is a prefix of another sorts first
  assert.equal(compareNaturally('door', 'doorbell') < 0, true);
});

// ---------------------------------------------------------------------------
// per-column sorting
// ---------------------------------------------------------------------------

test('relevance preserves the engine order exactly', () => {
  const hits = [hit(3, 'c.wav', 300, 48000), hit(1, 'a.wav', 100, 44100), hit(2, 'b.wav', 200, 96000)];
  const sorted = sortHits(hits, 'relevance');
  assert.deepEqual(sorted.map((h) => h.asset.id), [3, 1, 2]);
  // and it must be the same array, not a re-sorted copy: the engine's order
  // already encodes fused, reranked and personalised ties
  assert.equal(sorted, hits);
});

test('each sort orders by its own key and never mutates the input', () => {
  const hits = [hit(1, 'b_10.wav', 300, 44100), hit(2, 'b_2.wav', 100, 96000), hit(3, 'a.wav', 200, 48000)];
  const original = hits.map((h) => h.asset.id);

  assert.deepEqual(sortHits(hits, 'duration-asc').map((h) => h.asset.id), [2, 3, 1]);
  assert.deepEqual(sortHits(hits, 'duration-desc').map((h) => h.asset.id), [1, 3, 2]);
  assert.deepEqual(sortHits(hits, 'name').map((h) => h.asset.id), [3, 2, 1]);
  assert.deepEqual(sortHits(hits, 'samplerate').map((h) => h.asset.id), [2, 3, 1]);

  assert.deepEqual(hits.map((h) => h.asset.id), original, 'the input array must be untouched');
});

test('sorting tolerates missing metadata instead of producing NaN order', () => {
  const hits = [hit(1, 'a.wav', null, null), hit(2, 'b.wav', 100, 48000), hit(3, 'c.wav', null, null)];
  for (const sort of COMPARE_SORTS.map((s) => s.id)) {
    const sorted = sortHits(hits, sort);
    assert.equal(sorted.length, 3, `${sort} dropped a row`);
    assert.equal(new Set(sorted.map((h) => h.asset.id)).size, 3, `${sort} duplicated a row`);
  }
  // unknowns sort as zero, i.e. first ascending and last descending
  assert.deepEqual(sortHits(hits, 'duration-asc').map((h) => h.asset.id), [1, 3, 2]);
});

test('every advertised sort is actually implemented', () => {
  const hits = [hit(1, 'b_2.wav', 200, 48000), hit(2, 'a_10.wav', 100, 96000)];
  for (const { id } of COMPARE_SORTS) {
    const sorted = sortHits(hits, id);
    assert.equal(sorted.length, 2, `${id} lost rows`);
  }
  // an unknown sort falls through unchanged rather than throwing
  assert.deepEqual(sortHits(hits, 'nonsense' as never).map((h) => h.asset.id), [1, 2]);
});

test('two columns can hold different orders of the same results', () => {
  const hits = [hit(1, 'b.wav', 300, 48000), hit(2, 'a.wav', 100, 48000)];
  const byRelevance = sortHits(hits, 'relevance').map((h) => h.asset.id);
  const byDuration = sortHits(hits, 'duration-asc').map((h) => h.asset.id);
  // this is the point of the view: the same results answering different questions
  assert.notDeepEqual(byRelevance, byDuration);
});

// ---------------------------------------------------------------------------
// batch parsing
// ---------------------------------------------------------------------------

test('parseBatchQueries takes one query per line', () => {
  const { queries, dropped } = parseBatchQueries('metal door\n\n  glass break  \ncoins');
  assert.deepEqual(queries, ['metal door', 'glass break', 'coins']);
  assert.equal(dropped, 0);
});

test('parseBatchQueries keeps punctuation that the query syntax needs', () => {
  // Commas, parentheses and asterisks are all meaningful in a query, so splitting
  // on punctuation instead of newlines would corrupt it.
  const { queries } = parseBatchQueries('wind (gust*, blow*) -window\nmetal, glass');
  assert.deepEqual(queries, ['wind (gust*, blow*) -window', 'metal, glass']);
});

test('parseBatchQueries drops duplicates and reports how many', () => {
  const { queries, dropped } = parseBatchQueries('door\nDoor\nDOOR\nmetal');
  // case-insensitive: the same intent must not cost a second search
  assert.deepEqual(queries, ['door', 'metal']);
  assert.equal(dropped, 2);
});

test('parseBatchQueries enforces the column limit without losing the rest silently', () => {
  const text = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'].join('\n');
  const { queries, dropped } = parseBatchQueries(text, 6);
  assert.equal(queries.length, 6);
  assert.equal(dropped, 2, 'the caller must be able to tell the user what was ignored');
  assert.deepEqual(queries, ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']);
});

test('parseBatchQueries handles empty and whitespace-only input', () => {
  assert.deepEqual(parseBatchQueries('').queries, []);
  assert.deepEqual(parseBatchQueries('   \n\n  \t ').queries, []);
  assert.equal(parseBatchQueries('   \n  ').dropped, 0, 'blank lines are not "dropped" queries');
});

test('parseBatchQueries normalises Windows and Unix line endings alike', () => {
  assert.deepEqual(parseBatchQueries('a\r\nb\r\nc').queries, ['a', 'b', 'c']);
  assert.deepEqual(parseBatchQueries('a\nb\nc').queries, ['a', 'b', 'c']);
});

// ---------------------------------------------------------------------------
// cross-column agreement
// ---------------------------------------------------------------------------

test('crossColumnCounts reports how many columns contain each asset', () => {
  const columns = [
    column('a', [hit(1, 'shared.wav', 100, 48000), hit(2, 'only-a.wav', 100, 48000)]),
    column('b', [hit(1, 'shared.wav', 100, 48000), hit(3, 'only-b.wav', 100, 48000)]),
  ];
  const counts = crossColumnCounts(columns);
  assert.equal(counts.get(1), 2, 'an asset in both columns is corroborated');
  assert.equal(counts.get(2), 1);
  assert.equal(counts.get(3), 1);
});

test('crossColumnCounts counts a column once even if it lists an asset twice', () => {
  const columns = [column('a', [hit(1, 'x.wav', 100, 48000), hit(1, 'x.wav', 100, 48000)])];
  assert.equal(crossColumnCounts(columns).get(1), 1, 'duplicates within one column must not inflate agreement');
});

test('crossColumnCounts is empty for no columns', () => {
  assert.equal(crossColumnCounts([]).size, 0);
});

// ---------------------------------------------------------------------------
// headers
// ---------------------------------------------------------------------------

test('describeColumn reports the state a user needs to see', () => {
  assert.ok(describeColumn(column('a', [], { loading: true })).includes('搜索中'));
  assert.ok(describeColumn(column('a', [], { error: 'boom' })).includes('boom'));
  assert.ok(describeColumn(column('a', [])).includes('没有结果'));
  const summary = describeColumn(column('a', [hit(1, 'x.wav', 1, 1)], { tookMs: 12 }));
  assert.ok(summary.includes('1') && summary.includes('12'), `unexpected summary: ${summary}`);
});
