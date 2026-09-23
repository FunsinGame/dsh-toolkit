import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSearchText,
  looksLikeNaturalLanguage,
  parseQuery,
  queryToFtsTerms,
  semanticTextOf,
  sniffFilename,
  toBigrams,
  toFtsMatch,
  containsCjk,
} from './query.ts';
import {
  agreementConfidence,
  buildScoreBreakdown,
  cosineSimilarity,
  l2Normalize,
  mmrRerank,
  reciprocalRankFusion,
} from './rank.ts';
import type { RankedList } from './rank.ts';

test('sniffFilename detects audio filenames but rejects query-language input', () => {
  // A name containing spaces is a query, not a filename.
  assert.equal(sniffFilename('DOORWood_Wooden Door Close_Mylib_01.wav'), null);
  // Query metacharacters must never be mistaken for a filename stem.
  assert.equal(sniffFilename('wind (gust*, blow*) -window'), null);
  assert.equal(sniffFilename('-carnivore, beast'), null);

  const f = sniffFilename('impact_metal_03.wav');
  assert.ok(f);
  assert.equal(f.extension, 'wav');
  assert.equal(f.stem, 'impact_metal_03');

  const stem = sniffFilename('DOORWood_WoodenDoorClose');
  assert.ok(stem);
  assert.equal(stem.extension, '');

  assert.equal(sniffFilename('metal door'), null);
  assert.equal(sniffFilename(''), null);
});

test('looksLikeNaturalLanguage separates descriptions from keyword queries', () => {
  assert.equal(looksLikeNaturalLanguage('wind (gust*, blow*) -window'), false);
  assert.equal(looksLikeNaturalLanguage('impact_metal_03.wav'), false);
  assert.equal(looksLikeNaturalLanguage('金属门重重关上，空仓库'), true);
  assert.equal(looksLikeNaturalLanguage('metal door heavy close'), true);
  assert.equal(looksLikeNaturalLanguage('whoosh'), false);
});

test('parseQuery handles AND / wildcard / exclusion / grouping', () => {
  const p = parseQuery('wind (gust*, blow*) -window');
  assert.deepEqual(p.required, ['wind']);
  // wildcards are preserved so the FTS layer can build a prefix query
  assert.deepEqual(p.optionalGroups, [['gust*', 'blow*']]);
  assert.deepEqual(p.excluded, ['window']);
  assert.equal(p.isNaturalLanguage, false);
});

test('parseQuery: commas separate clauses while parens group alternatives', () => {
  // Documented semantics: a comma at the top level separates clauses, and each
  // clause must match. Alternatives are expressed with parentheses.
  const comma = parseQuery('glass, break -music');
  assert.deepEqual(comma.required, ['glass', 'break']);
  assert.deepEqual(comma.excluded, ['music']);

  const grouped = parseQuery('glass (break, shatter)');
  assert.deepEqual(grouped.required, ['glass']);
  assert.deepEqual(grouped.optionalGroups, [['break', 'shatter']]);

  const only = parseQuery('-carnivore');
  assert.deepEqual(only.excluded, ['carnivore']);
  assert.deepEqual(only.required, []);
  assert.equal(toFtsMatch(only), 'NOT "carnivore"');
});

test('parseQuery handles a negated group', () => {
  const p = parseQuery('-(metal, glass)');
  assert.deepEqual(p.excluded.sort(), ['glass', 'metal']);
  assert.deepEqual(p.required, []);
});

test('toFtsMatch quotes terms so user input cannot inject FTS operators', () => {
  const p = parseQuery('door " OR *');
  const match = toFtsMatch(p);
  assert.ok(match);
  // every bare term is quoted; no unquoted operators leak through
  assert.ok(match!.includes('"door"'));
  assert.ok(!/ OR \s*$/.test(match!.trim()));
});

test('toFtsMatch emits prefix wildcards and column filters', () => {
  const p = parseQuery('gust*');
  assert.equal(toFtsMatch(p), '"gust"*');
  assert.equal(toFtsMatch(p, ['search_text']), '{search_text} : "gust"*');
});

test('semanticTextOf strips operators for the embedding retriever', () => {
  const p = parseQuery('metal (door, gate) -car');
  assert.ok(semanticTextOf(p).includes('metal'));
});

test('toBigrams segments CJK into overlapping pairs', () => {
  assert.equal(toBigrams('金属门'), '金属 属门');
  assert.equal(toBigrams('abc'), '');
  assert.equal(toBigrams('门'), '门');
  assert.equal(toBigrams('金属door'), '金属');
});

test('buildSearchText expands camelCase and separators and adds CJK bigrams', () => {
  const text = buildSearchText(['DOORWood_Wooden Door_close.wav', '金属门']);
  // camelCase is split: DOORWood → DOOR Wood → door, wood after lowercasing
  assert.ok(text.toLowerCase().includes('door'), text);
  assert.ok(text.toLowerCase().includes('wood'), text);
  assert.ok(text.toLowerCase().includes('wooden'), text);
  assert.ok(text.includes('金属'), text);
  assert.ok(text.includes('属门'), text);
  // bigram expansion applies only to CJK — latin words stay whole
  assert.ok(!text.includes('金 属'), text);
});

test('queryToFtsTerms splits camelCase, lowercases, and bigrams CJK', () => {
  assert.deepEqual(queryToFtsTerms('MetalDoor 金属'), ['metal', 'door', '金属']);
  assert.deepEqual(queryToFtsTerms('金属门'), ['金属', '属门']);
});

test('containsCjk is true only for CJK text', () => {
  assert.equal(containsCjk('金属'), true);
  assert.equal(containsCjk('metal'), false);
  assert.equal(containsCjk('metal金属'), true);
});

test('reciprocalRankFusion rewards items found by several retrievers', () => {
  const lists: RankedList[] = [
    { retriever: 'vector', ids: [1, 2, 3], weight: 0.6 },
    { retriever: 'fts', ids: [2, 3, 4], weight: 0.4 },
  ];
  const fused = reciprocalRankFusion(lists);
  const s1 = fused.get(1)!.score;
  const s2 = fused.get(2)!.score;
  const s3 = fused.get(3)!.score;
  // item 2 is rank 2 in vector and rank 1 in fts → should beat item 1 (rank 1 in vector only)
  assert.ok(s2 > s1, `expected ${s2} > ${s1}`);
  assert.ok(s3 > 0);
  assert.equal(Math.max(...[...fused.values()].map((v) => v.score)), 1, 'top score normalised to 1');
  assert.deepEqual(fused.get(2)!.ranks, { vector: 2, fts: 1 });
});

test('reciprocalRankFusion ignores zero-weight and empty lists', () => {
  const fused = reciprocalRankFusion([
    { retriever: 'vector', ids: [], weight: 0.6 },
    { retriever: 'fts', ids: [7], weight: 0 },
  ]);
  assert.equal(fused.size, 0);
});

test('agreementConfidence grows with agreement and degrades with rank', () => {
  const single = agreementConfidence({ vector: 1 });
  const agreed = agreementConfidence({ vector: 1, fts: 2 });
  const deep = agreementConfidence({ vector: 80 });
  assert.ok(agreed > single, 'agreement should help');
  assert.ok(single > deep, 'deeper rank should be less confident');
  assert.equal(agreementConfidence({}), 0);
});

test('cosineSimilarity and l2Normalize behave', () => {
  const a = new Float32Array([1, 0, 0]);
  const b = new Float32Array([1, 0, 0]);
  const c = new Float32Array([0, 1, 0]);
  assert.ok(Math.abs(cosineSimilarity(a, b) - 1) < 1e-6);
  assert.ok(Math.abs(cosineSimilarity(a, c)) < 1e-6);
  assert.equal(cosineSimilarity(new Float32Array([0, 0]), a), 0);

  const n = l2Normalize(new Float32Array([3, 4]));
  assert.ok(Math.abs(Math.hypot(n[0]!, n[1]!) - 1) < 1e-6);
  const zero = l2Normalize(new Float32Array([0, 0]));
  assert.deepEqual([...zero], [0, 0]);
});

test('mmrRerank trades relevance for diversity', () => {
  const candidates = [
    { id: 1, score: 1.0, vector: new Float32Array([1, 0]) },
    { id: 2, score: 0.99, vector: new Float32Array([1, 0]) }, // duplicate of 1
    { id: 3, score: 0.8, vector: new Float32Array([0, 1]) },
  ];
  const diverse = mmrRerank(candidates, 0.5, 2);
  assert.equal(diverse[0]!.id, 1);
  assert.equal(diverse[1]!.id, 3, 'should pick the dissimilar item over the near-duplicate');

  const relevanceOnly = mmrRerank(candidates, 1.0, 2);
  assert.deepEqual(relevanceOnly.map((c) => c.id), [1, 2]);
});

test('mmrRerank tolerates missing vectors and short pools', () => {
  const out = mmrRerank([{ id: 1, score: 1, vector: null }, { id: 2, score: 0.5, vector: null }], 0.5, 10);
  assert.equal(out.length, 2);
});

test('buildScoreBreakdown derives confidence from rank agreement', () => {
  const bd = buildScoreBreakdown({
    vector: 0.62,
    fts: null,
    ucs: 0.4,
    struct: null,
    ranks: { vector: 3, ucs: 1 },
    fused: 0.87,
  });
  assert.equal(bd.final, 0.87);
  assert.equal(bd.ranks.vector, 3);
  assert.ok(bd.confidence > 0 && bd.confidence <= 1);
});
