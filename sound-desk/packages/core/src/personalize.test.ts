/**
 * Personalised-ranking tests.
 *
 * The property that matters most is the **bound**: this code must never be able to
 * move a result more than ±10%, because the whole justification for having it is
 * that it cannot meaningfully override the query. Most of these tests are about
 * that ceiling and about the signal being explainable.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_WEIGHT,
  MIN_WEIGHT,
  USAGE_KIND_WEIGHTS,
  applyPersonalization,
  describePersonalization,
  normalizeQueryKey,
  summarizeUsage,
  usageWeight,
  weightFor,
  type UsageEvent,
} from './personalize.ts';

const at = (n: number): number => 1_700_000_000_000 + n * 1000;

function events(list: Array<[number, string | null, UsageEvent['kind']]>): UsageEvent[] {
  return list.map(([assetId, query, kind], i) => ({ assetId, query, kind, at: at(i) }));
}

test('normalizeQueryKey folds the differences that do not change intent', () => {
  assert.equal(normalizeQueryKey('  Metal  Door '), 'metal door');
  assert.equal(normalizeQueryKey('metal\tdoor'), 'metal door');
  assert.equal(normalizeQueryKey(''), null);
  assert.equal(normalizeQueryKey('   '), null);
  assert.equal(normalizeQueryKey(null), null);
  assert.equal(normalizeQueryKey(undefined), null);
  // an image-search prefix is addressing, not intent
  assert.equal(normalizeQueryKey('@42 metal door'), 'metal door');
  assert.equal(normalizeQueryKey('@42'), '', '@42 alone leaves nothing');
});

test('the weight can never leave the ±10% band, whatever the history', () => {
  // one event, a hundred events, and an absurd score
  for (const score of [0, 0.0001, 0.25, 1, 3, 10, 100, 10_000, Number.MAX_SAFE_INTEGER]) {
    const weight = usageWeight(score);
    assert.ok(weight >= MIN_WEIGHT && weight <= MAX_WEIGHT, `score ${score} produced ${weight}`);
  }
  // and a nonsensical score is neutral rather than NaN
  assert.equal(usageWeight(Number.NaN), 1);
  assert.equal(usageWeight(-5), 1);
  assert.equal(usageWeight(0), 1);
});

test('a weight rises with use but saturates', () => {
  const one = usageWeight(1);
  const three = usageWeight(3);
  const twenty = usageWeight(20);
  assert.ok(one > 1, 'a single pick should already count for something');
  assert.ok(three > one, 'more picks should count for more');
  assert.ok(twenty > three, 'and keep rising');
  // saturation: the difference between 20 and 200 picks is negligible
  assert.ok(Math.abs(usageWeight(200) - twenty) < 0.001, 'the curve must flatten out');
  assert.ok(twenty < MAX_WEIGHT, 'and never reach the ceiling in practice');
});

test('same-query picks outweigh picks for other queries', () => {
  const sameQuery = summarizeUsage(events([[7, 'metal door', 'play']]), 'metal door');
  const otherQuery = summarizeUsage(events([[7, 'glass break', 'play']]), 'metal door');

  assert.equal(sameQuery.get(7)!.sameQuery, 1);
  assert.equal(otherQuery.get(7)!.sameQuery, 0);
  assert.ok(
    sameQuery.get(7)!.score > otherQuery.get(7)!.score,
    'picking a sound for this query is stronger evidence than a general favourite',
  );
  assert.ok(weightFor(sameQuery, 7) > weightFor(otherQuery, 7));
});

test('a play is worth more than merely selecting the row', () => {
  const played = summarizeUsage(events([[7, 'q', 'play']]), 'q');
  const selected = summarizeUsage(events([[7, 'q', 'select']]), 'q');
  assert.ok(played.get(7)!.score > selected.get(7)!.score);
  assert.ok(USAGE_KIND_WEIGHTS.play > USAGE_KIND_WEIGHTS.select);
  // exporting or downloading is a deliberate act too
  assert.ok(USAGE_KIND_WEIGHTS.export >= USAGE_KIND_WEIGHTS.play);
});

test('an unknown event kind is ignored rather than crashing the ranking', () => {
  const summary = summarizeUsage(
    [{ assetId: 1, query: 'q', kind: 'nonsense' as UsageEvent['kind'], at: at(0) }],
    'q',
  );
  assert.equal(summary.size, 0);
});

test('summarizeUsage counts events and tracks the newest one', () => {
  const summary = summarizeUsage(
    events([
      [7, 'metal door', 'play'],
      [7, 'metal door', 'select'],
      [9, null, 'download'],
    ]),
    'metal door',
  );

  const seven = summary.get(7)!;
  assert.equal(seven.events, 2);
  assert.equal(seven.sameQuery, 2);
  assert.equal(seven.lastAt, at(1), 'the newest event wins');

  // a context-free action still counts, at the cross-query discount
  const nine = summary.get(9)!;
  assert.equal(nine.events, 1);
  assert.equal(nine.sameQuery, 0);
  assert.ok(nine.score > 0, 'a download with no query is still a signal');
});

test('only one of the four kinds is needed to move a result', () => {
  // every kind must produce a weight above neutral on its own, or that signal is
  // recorded and then silently ignored
  for (const kind of Object.keys(USAGE_KIND_WEIGHTS) as Array<UsageEvent['kind']>) {
    const summary = summarizeUsage(events([[7, 'q', kind]]), 'q');
    assert.ok(weightFor(summary, 7) > 1, `${kind} did not move the weight`);
  }
});

test('an asset with no history is left exactly alone', () => {
  const summary = summarizeUsage(events([[7, 'q', 'play']]), 'q');
  assert.equal(weightFor(summary, 8), 1, 'no history must mean no adjustment at all');
  assert.equal(weightFor(new Map(), 7), 1);
});

test('applyPersonalization preserves the original score and explains the change', () => {
  const summary = summarizeUsage(events([[7, 'metal door', 'play'], [7, 'metal door', 'play']]), 'metal door');
  const items = [
    { id: 7, score: 1 },
    { id: 8, score: 1 },
  ];

  const { items: out, adjustments } = applyPersonalization(items, summary, true);

  assert.equal(out.length, 2);
  assert.equal(out[0]!.score > 1, true, 'the used asset moves up');
  assert.equal(out[1]!.score, 1, 'the unused one is untouched');

  assert.equal(adjustments.length, 1);
  const adjustment = adjustments[0]!;
  assert.equal(adjustment.assetId, 7);
  assert.equal(adjustment.before, 1, 'the original score is recorded, not lost');
  assert.ok(adjustment.after > adjustment.before);
  assert.ok(adjustment.reason && adjustment.reason.includes('2'), `reason should cite the count: ${adjustment.reason}`);
});

test('applyPersonalization can be switched off and then changes nothing', () => {
  const summary = summarizeUsage(events([[7, 'q', 'play']]), 'q');
  const items = [{ id: 7, score: 0.5 }];

  const off = applyPersonalization(items, summary, false);
  assert.deepEqual(off.items, items, 'with the toggle off the list must be identical');
  assert.deepEqual(off.adjustments, []);

  const on = applyPersonalization(items, summary, true);
  assert.ok(on.items[0]!.score > 0.5, 'and with it on, the weight applies');
});

test('personalisation cannot reorder results that are far apart', () => {
  // This is the property the whole design rests on: a large score gap must survive.
  const heavy = events(Array.from({ length: 50 }, () => [7, 'q', 'play'] as [number, string, 'play']));
  const summary = summarizeUsage(heavy, 'q');

  const better = { id: 8, score: 1.0 };
  const worse = { id: 7, score: 0.8 };
  const { items } = applyPersonalization([worse, better], summary, true);
  const byId = new Map(items.map((i) => [i.id, i.score]));

  assert.ok(
    byId.get(8)! > byId.get(7)!,
    `a genuinely better match must still win: ${byId.get(7)} vs ${byId.get(8)}`,
  );
});

test('personalisation can reorder results that are nearly tied', () => {
  const summary = summarizeUsage(events(Array.from({ length: 6 }, () => [7, 'q', 'play'] as [number, string, 'play'])), 'q');
  const { items } = applyPersonalization(
    [
      { id: 7, score: 0.5 },
      { id: 8, score: 0.51 },
    ],
    summary,
    true,
  );
  const byId = new Map(items.map((i) => [i.id, i.score]));
  assert.ok(byId.get(7)! > byId.get(8)!, 'a near-tie is where personalisation is allowed to act');
});

test('describePersonalization never claims more than is true', () => {
  assert.ok(describePersonalization(false, 100).includes('关闭'));
  const empty = describePersonalization(true, 0);
  assert.ok(empty.includes('没有') || empty.includes('不足'), `should admit it has no data: ${empty}`);
  const active = describePersonalization(true, 42);
  assert.ok(active.includes('42'), 'should say how many assets it has learned from');
  // the bound is stated in both "on" cases, because that is the honest framing
  assert.ok(active.includes('10%'));
  assert.ok(empty.includes('10%'));
});

test('a huge history still cannot breach the ceiling through many assets', () => {
  const many: UsageEvent[] = [];
  for (let assetId = 1; assetId <= 200; assetId += 1) {
    for (let n = 0; n < 20; n += 1) many.push({ assetId, query: 'q', kind: 'play', at: at(n) });
  }
  const summary = summarizeUsage(many, 'q');
  for (const assetId of summary.keys()) {
    const weight = weightFor(summary, assetId);
    assert.ok(weight <= MAX_WEIGHT && weight >= MIN_WEIGHT, `asset ${assetId} weight ${weight}`);
  }
});
