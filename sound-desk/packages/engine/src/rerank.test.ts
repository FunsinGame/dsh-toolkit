/**
 * Reranker unit tests.
 *
 * The pure parts of §3.1(E): word matching, lexical overlap, the acoustic veto,
 * and the scoring blend. These are the pieces whose behaviour the benchmark
 * numbers depend on, so they are pinned here rather than only measured
 * end-to-end.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  categoryAgreement,
  contentWords,
  DEFAULT_RERANK_WEIGHTS,
  dspAgreement,
  lexicalOverlap,
  rerankScore,
  tokenize,
  wordsMatch,
  type RerankAssetInput,
} from './rerank.ts';
import type { DspFeatures } from '@sounddesk/core';

const NO_DSP: DspFeatures = {
  peak: 0.9,
  rms: 0.1,
  peakDb: -1,
  rmsDb: -20,
  decayMs: 300,
  spectralCentroidHz: 2000,
  highFrequencyRatio: 0.3,
  stereoCorrelation: 1,
  hasVoiceLikeActivity: false,
  tonality: 0.2,
};

test('tokenize splits camelCase and separators, keeps CJK', () => {
  assert.deepEqual(tokenize('ui_town_coins_sprk_med'), ['ui', 'town', 'coins', 'sprk', 'med']);
  assert.deepEqual(tokenize('doorWood.open'), ['door', 'wood', 'open']);
  // an all-caps run is left intact, matching how the library spells acronyms
  assert.deepEqual(tokenize('DOORWood'), ['doorwood']);
  assert.deepEqual(tokenize('金属门'), ['金属门']);
});

test('contentWords drops stop words and single characters', () => {
  assert.deepEqual(contentWords('a sound of the door'), ['door']);
  assert.deepEqual(contentWords('metal impact'), ['metal', 'impact']);
});

test('wordsMatch handles plurals and the abbreviations real libraries use', () => {
  assert.equal(wordsMatch('coins', 'coin'), true);
  assert.equal(wordsMatch('footsteps', 'foot'), true);
  assert.equal(wordsMatch('skeleton', 'skel'), true);
  assert.equal(wordsMatch('door', 'doors'), true);
  assert.equal(wordsMatch('metal', 'metallic'), true);

  // must not match unrelated words that merely share a short prefix
  assert.equal(wordsMatch('door', 'dog'), false);
  assert.equal(wordsMatch('drop', 'door'), false);
  assert.equal(wordsMatch('coin', 'cold'), false);
  assert.equal(wordsMatch('metal', 'med'), false);
  // a 3-character stem may not act as a prefix: "med" must not reach "media"
  assert.equal(wordsMatch('med', 'media'), false);
  // and a bare exact match still works at any length
  assert.equal(wordsMatch('ax', 'axe'), false, 'a 2-character word is never a prefix');
});

test('wordsMatch keeps long compounds, which a length-ratio guard would cut', () => {
  // Regression guard for a rule that was tried and removed: capping the ratio
  // between the two words cut exactly the useful pairs, because a real compound
  // is long by definition. These must all keep matching.
  assert.equal(wordsMatch('dark', 'darkestdungeon'), true);
  assert.equal(wordsMatch('dark', 'darkest01'), true);
  assert.equal(wordsMatch('town', 'townfair'), true);
  assert.equal(wordsMatch('room', 'roomtransition'), true);
  assert.equal(wordsMatch('remove', 'removequestherolevel'), true);
  assert.equal(wordsMatch('curio', 'curiousincantation'), true);
});

test('lexicalOverlap finds the filename evidence a caption score cannot see', () => {
  const asset: RerankAssetInput = { filename: 'ui_town_coins_sprk_med_07.wav', ucsCatId: null };
  const { score, matched } = lexicalOverlap(contentWords('coins dropping'), asset);
  // "coins" appears in the filename, "dropping" does not
  assert.equal(matched.includes('coins'), true);
  assert.ok(score > 0 && score < 1, `expected a partial score, got ${score}`);
});

test('lexicalOverlap weights a filename match above a description match', () => {
  const filenameHit = lexicalOverlap(['coin'], { filename: 'coins_01.wav', ucsCatId: null });
  const descriptionHit = lexicalOverlap(['coin'], {
    filename: 'unknown_01.wav',
    ucsCatId: null,
    description: 'a handful of coin',
  });
  assert.ok(filenameHit.score > descriptionHit.score, 'filename should outweigh description');
});

test('lexicalOverlap returns zero when nothing matches', () => {
  const { score, matched } = lexicalOverlap(['coins'], { filename: 'amb_townfair.wav', ucsCatId: null });
  assert.equal(score, 0);
  assert.deepEqual(matched, []);
});

test('lexicalOverlap is zero for an empty query', () => {
  assert.equal(lexicalOverlap([], { filename: 'x.wav', ucsCatId: null }).score, 0);
});

test('categoryAgreement is neutral without a hint, and half-credit on disagreement', () => {
  assert.equal(categoryAgreement(null, []), 1, 'no hint means nothing to contradict');
  assert.equal(categoryAgreement('DOORWood', ['DOORWood', 'IMPACTMetal']), 1);
  assert.equal(categoryAgreement('IMPACTMetal', ['DOORWood']), 0.5);
  assert.equal(categoryAgreement(null, ['DOORWood']), 0.5);
});

test('dspAgreement never promotes, only vetoes contradictions', () => {
  assert.equal(dspAgreement(null, null, ['slam']), 1, 'no features means no opinion');

  // a "slam" that decays for two seconds contradicts a transient reading
  const slow = { ...NO_DSP, decayMs: 2000 };
  assert.ok(dspAgreement(slow, 5000, ['slam']) < 1);

  // an "ambience" that is a 74ms blip contradicts a sustained reading
  const blip = { ...NO_DSP, decayMs: 50 };
  assert.ok(dspAgreement(blip, 74, ['ambience']) < 1);

  // and agreement leaves the score alone
  assert.equal(dspAgreement(NO_DSP, 900, ['slam']), 1);
});

test('rerankScore always counts the lexical weight so evidence cannot be inverted', () => {
  // Regression guard: the first version dropped the lexical term from the
  // divisor when nothing matched, which gave an item with *no* evidence a higher
  // score than one that matched — the exact opposite of the intent.
  const noEvidence = rerankScore(
    { fused: 0.60, vector: null, captions: ['coins'], rawQuery: 'coins', queryTerms: [], dsp: null, durationMs: null, hintCatIds: [] },
    { filename: 'amb_townfair.wav', ucsCatId: null },
  );
  const withEvidence = rerankScore(
    { fused: 0.50, vector: null, captions: ['coins'], rawQuery: 'coins', queryTerms: [], dsp: null, durationMs: null, hintCatIds: [] },
    { filename: 'ui_town_coins_sprk.wav', ucsCatId: null },
  );
  assert.ok(
    withEvidence.score > noEvidence.score,
    `lexical evidence must win: ${withEvidence.score} vs ${noEvidence.score}`,
  );
  assert.equal(noEvidence.lexical, 0);
  assert.ok(withEvidence.lexical > 0);
});

test('rerankScore lets the fused score carry a candidate with no lexical match', () => {
  const features = {
    fused: 0.8,
    vector: null,
    captions: [],
    rawQuery: 'zzz',
    queryTerms: [],
    dsp: null,
    durationMs: null,
    hintCatIds: [],
  };
  const a = rerankScore(features, { filename: 'aaa.wav', ucsCatId: null });
  const b = rerankScore({ ...features, fused: 0.4 }, { filename: 'bbb.wav', ucsCatId: null });
  assert.ok(a.score > b.score, 'with no lexical signal the order must follow the retriever');
});

test('rerankScore does not penalise a candidate for a missing category hint', () => {
  const features = {
    fused: 0.5,
    vector: null,
    captions: [],
    rawQuery: 'unknown thing',
    queryTerms: [],
    dsp: null,
    durationMs: null,
    hintCatIds: [],
  };
  const result = rerankScore(features, { filename: 'x.wav', ucsCatId: null });
  assert.equal(result.category, 1);
  assert.equal(result.dsp, 1);
});

test('rerankScore prefers the asset DSP over the feature-level fallback', () => {
  const features = {
    fused: 0.5,
    vector: null,
    captions: ['slam'],
    rawQuery: 'slam',
    queryTerms: [],
    dsp: { ...NO_DSP, decayMs: 5000 },
    durationMs: 6000,
    hintCatIds: [],
  };
  const withAssetDsp = rerankScore(features, { filename: 'impact.wav', ucsCatId: null, dsp: NO_DSP });
  const withoutAssetDsp = rerankScore(features, { filename: 'impact.wav', ucsCatId: null });
  assert.ok(withAssetDsp.dsp > withoutAssetDsp.dsp, 'the asset-level features should take precedence');
});

test('rerankScore does not count a term twice when the rewriter overlaps itself', () => {
  // "金币掉落" rewrites to captions that repeat "coins" across three of them, so
  // the joined term list contains it three times. Counting it once keeps the
  // lexical denominator honest and stops the UI showing the same term repeatedly.
  const base = {
    fused: 0.5,
    vector: null,
    rawQuery: '金币掉落',
    queryTerms: [],
    dsp: null,
    durationMs: null,
    hintCatIds: [],
  } as const;
  const asset = { filename: 'ui_town_coins_sprk_med_07.wav', ucsCatId: null };

  const once = rerankScore({ ...base, captions: ['coins, dropping'] }, asset);
  const threeTimes = rerankScore({ ...base, captions: ['coins, dropping', 'coins', 'coins'] }, asset);

  assert.equal(threeTimes.lexical, once.lexical, 'repeating a term must not move the score');
  // Three distinct terms survive: "coins", "dropping" and the Chinese original
  // (kept so a library containing Chinese metadata can still match). Only "coins"
  // is present in the filename, so the score is 1/3 rather than 1/4.
  assert.equal(once.lexical, 1 / 3);
  assert.deepEqual(threeTimes.matchedTerms, ['coins']);
  assert.deepEqual(once.matchedTerms, ['coins']);
});

test('lexicalOverlap reports each matched term once even if given duplicates', () => {
  const { matched } = lexicalOverlap(['coins', 'coins'], { filename: 'coins_01.wav', ucsCatId: null });
  assert.deepEqual(matched, ['coins']);
});

test('weights are exposed and default to the measured configuration', () => {
  assert.ok(DEFAULT_RERANK_WEIGHTS.fused > 0);
  assert.ok(DEFAULT_RERANK_WEIGHTS.lexical > 0);
});
