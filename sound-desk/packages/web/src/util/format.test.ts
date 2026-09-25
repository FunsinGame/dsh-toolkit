/**
 * Tests for the hit-provenance helpers.
 *
 * These exist because the result list was showing the wrong "source": it printed the
 * *classification* source (`asset.ucsSource`) where the *retrieval* path belongs, so
 * almost every row read 「文件名」 — `filename` is the normal classification source, since
 * a UCS-style name is the primary evidence. The tests below pin the retrieval-path
 * labels, and pin that a similarity is described against the measured calibration rather
 * than as a bare percentage.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { SIMILARITY_THRESHOLD, STRONG_SIMILARITY, type ScoreBreakdown } from '@sounddesk/core';

import { hitPaths, hitPathsLabel, hitPathsLine, rerankReasons } from './format.ts';

function score(partial: Partial<ScoreBreakdown> = {}): ScoreBreakdown {
  return {
    vector: null,
    fts: null,
    ucs: null,
    struct: null,
    ranks: {},
    final: 0.5,
    confidence: 0.5,
    ...partial,
  };
}

test('hitPaths names the retrievers that actually returned the hit', () => {
  const paths = hitPaths(score({ ranks: { fts: 3, vector: 7 } }));
  assert.deepEqual(
    paths.map((p) => p.label),
    ['关键词', '语义'],
  );
  assert.deepEqual(
    paths.map((p) => p.rank),
    [3, 7],
  );
});

test('hitPaths reports no path rather than inventing one', () => {
  // The bug in its original form: an empty `ranks` fell through to a classification-source
  // label, so a row with no reported path still showed 「文件名」.
  assert.deepEqual(hitPaths(score()), []);
  assert.deepEqual(hitPaths(null), []);
  assert.deepEqual(hitPaths(undefined), []);
  assert.equal(hitPathsLabel(score()), '');
  assert.equal(hitPathsLine(score()), '命中路径：未报告');
});

test('hitPaths orders paths the same way every time', () => {
  // A stable order matters: this string is a badge, and a badge that reshuffles between
  // renders is unreadable.
  const a = hitPathsLabel(score({ ranks: { fts: 1, vector: 2, ucs: 4 } }));
  const b = hitPathsLabel(score({ ranks: { ucs: 4, vector: 2, fts: 1 } }));
  assert.equal(a, '关键词 + 语义 + UCS分类');
  assert.equal(a, b);
});

test('hitPaths keeps a rank of 0 out rather than showing "第0名"', () => {
  // Ranks are 1-based, so a 0 means "this retriever did not return the item". It is a
  // number, so a type check alone would let it through and render 「关键词 第0名」.
  const paths = hitPaths(score({ ranks: { fts: 0, vector: 5 } }));
  assert.deepEqual(paths.map((p) => p.retriever), ['vector']);
  assert.deepEqual(paths.map((p) => p.rank), [5]);
});

test('a query-by-example hit is labelled 参考音频, not 语义', () => {
  // For a probe search the fingerprint *is* the query, and that distinction is the whole
  // point of the mode.
  assert.equal(hitPathsLabel(score({ ranks: { probe: 1 } })), '参考音频');
});

test('rerankReasons surfaces the fingerprint similarity with its strength', () => {
  const reasons = rerankReasons(score({ vector: 0.62 }));
  assert.equal(reasons.length, 1);
  assert.match(reasons[0]!, /声音指纹相似度 62\.0%（强）/);
});

test('a weak similarity is called weak instead of silently dropped', () => {
  // Below the calibration anchor but above the gate: a real, if loose, match. Saying
  // nothing would re-create the original bug (semantic evidence invisible).
  const value = SIMILARITY_THRESHOLD + 0.01;
  const reasons = rerankReasons(score({ vector: value }));
  assert.match(reasons[0]!, /（弱）/);
  // The reported percentage is the *input* value, not the threshold — computed here so
  // the assertion cannot drift from what the formatter is actually asked to render.
  assert.match(reasons[0]!, new RegExp(`${(value * 100).toFixed(1)}%`));
});

test('the strong/weak boundary is the exported calibration, not a local constant', () => {
  const justBelow = rerankReasons(score({ vector: STRONG_SIMILARITY - 0.001 }))[0]!;
  const atTheAnchor = rerankReasons(score({ vector: STRONG_SIMILARITY }))[0]!;
  assert.match(justBelow, /（弱）/);
  assert.match(atTheAnchor, /（强）/);
});

test('a hit with no vector score claims nothing about similarity', () => {
  assert.deepEqual(rerankReasons(score({ ranks: { fts: 1 } })), []);
});

test('the fused score is named as a rank aggregate, not a similarity', () => {
  const reasons = rerankReasons(
    score({ rerank: { lexical: 0, category: 1, dsp: 1, fused: 0.87, matchedTerms: [] } }),
  );
  assert.equal(reasons.length, 1);
  assert.match(reasons[0]!, /融合排序分 0\.87/);
  assert.match(reasons[0]!, /不是相似度/);
});

test('rerankReasons never emits the retrieval-path line', () => {
  // Paths are a fact, reasons are an explanation, and each caller shows them
  // differently — the list row uses the paths as its badge. Keeping them out of this
  // function is what stops a caller having to filter its own output.
  const reasons = rerankReasons(
    score({ ranks: { fts: 1, vector: 2 }, vector: 0.5, rerank: { lexical: 1, category: 1, dsp: 1, fused: 0.9, matchedTerms: ['door'] } }),
  );
  assert.equal(
    reasons.some((r) => r.includes('命中路径')),
    false,
  );
  assert.equal(
    reasons.some((r) => r.includes('文件名/元数据命中「door」')),
    true,
  );
});

test('every reason is a complete sentence a user can read', () => {
  // The details pane renders these as list items with no surrounding text, so a bare
  // number would be meaningless.
  const reasons = rerankReasons(
    score({
      ranks: { fts: 2, vector: 5 },
      vector: 0.4,
      rerank: { lexical: 0.3, category: 0.5, dsp: 0.75, fused: 0.9, matchedTerms: ['metal', 'door'] },
    }),
  );
  assert.equal(reasons.length, 5);
  for (const reason of reasons) {
    assert.ok(reason.length > 4, `too terse: ${reason}`);
    assert.match(reason, /[\u4e00-\u9fa5]/);
  }
  // The strongest explanatory line still comes first among the explanations.
  assert.match(reasons[0]!, /声音指纹相似度/);
  assert.match(reasons[1]!, /文件名\/元数据命中「metal、door」/);
  assert.match(reasons[2]!, /UCS 分类与查询不符/);
  assert.match(reasons[3]!, /声学形态与查询矛盾/);
  assert.match(reasons[4]!, /融合排序分/);
});
