/**
 * Tests for the max-similarity window planner and reduction.
 *
 * Everything in `maxsim.ts` is pure, so this suite needs no model, database or
 * audio file: it pins the arithmetic that decides which window of a long file is
 * reported as a match, which is otherwise very hard to observe end to end.
 *
 * The behaviour under test is the fix for a real retrieval failure: a whole-file
 * mean averages a short sound inside a long file into invisibility, so a reference
 * clip that matches two seconds of a ten-minute ambience scored near zero against
 * that ambience and never appeared in the results.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAXSIM_DEFAULT_REFINE,
  MAXSIM_MAX_WINDOWS,
  bestWindowPerAsset,
  formatOffset,
  isWindowable,
  mergeMaxsim,
  planMaxsim,
  selectBestWindow,
  windowOffsets,
  type MaxsimCandidate,
  type MaxsimOutcome,
  type WindowVector,
} from './maxsim.ts';

/** Axis-aligned unit vector, so cosine similarity is easy to reason about. */
function unit(dim: number, axis: number, value = 1): Float32Array {
  const v = new Float32Array(dim);
  v[axis] = value;
  return v;
}

/** A window whose vector mixes two axes by `weight` (0..1). */
function mixed(dim: number, a: number, b: number, weight: number): Float32Array {
  const v = new Float32Array(dim);
  v[a] = 1 - weight;
  v[b] = weight;
  const norm = Math.hypot(...v);
  for (let i = 0; i < dim; i += 1) v[i] = (v[i] ?? 0) / norm;
  return v;
}

/* ------------------------------------------------------------ windowing --- */

test('isWindowable is false for a single-window file and true beyond it', () => {
  assert.equal(isWindowable(null), false);
  assert.equal(isWindowable(undefined), false);
  assert.equal(isWindowable(0), false);
  assert.equal(isWindowable(1_000), false);
  // Exactly one window: max over one window equals the mean, so it is not windowable.
  assert.equal(isWindowable(10_000), false);
  assert.equal(isWindowable(10_001), true);
  assert.equal(isWindowable(600_000), true);
});

test('windowOffsets returns [0] for anything that fits in one window', () => {
  assert.deepEqual(windowOffsets(0), [0]);
  assert.deepEqual(windowOffsets(5_000), [0]);
  assert.deepEqual(windowOffsets(10_000), [0]);
  assert.deepEqual(windowOffsets(-100), [0]);
});

test('windowOffsets uses a uniform hop while the file fits the window cap', () => {
  // 60 s at a 10 s window / 10 s hop: starts at 0,10,…,50. 50 is lastStart, so no
  // extra tail offset is appended.
  assert.deepEqual(windowOffsets(60_000), [0, 10_000, 20_000, 30_000, 40_000, 50_000]);
});

test('windowOffsets always ends at lastStart so every window fits inside the file', () => {
  // 75 s: lastStart is 65 s, which the 10 s hop does not land on.
  const offsets = windowOffsets(75_000);
  assert.deepEqual(offsets, [0, 10_000, 20_000, 30_000, 40_000, 50_000, 60_000, 65_000]);
  assert.equal(offsets[offsets.length - 1], 65_000);
});

test('windowOffsets spans the whole file when it exceeds the window cap', () => {
  const durationMs = 600_000; // 10 minutes, 60 windows at a 10 s hop
  const offsets = windowOffsets(durationMs);
  // The cap must be respected, or a long bed costs minutes of inference.
  assert.ok(offsets.length <= MAXSIM_MAX_WINDOWS, `got ${offsets.length} windows`);
  // And the file must still be covered end to end rather than truncated: both ends
  // and everything between them is sampled.
  assert.equal(offsets[0], 0);
  assert.equal(offsets[offsets.length - 1], durationMs - 10_000);
  // Monotonic and unique — a duplicate window would double-count in the max.
  for (let i = 1; i < offsets.length; i += 1) {
    assert.ok(offsets[i]! > offsets[i - 1]!, `offsets not strictly increasing: ${offsets.join(',')}`);
  }
});

test('windowOffsets stays bounded and monotonic across many durations', () => {
  for (const seconds of [11, 30, 61, 120, 599, 600, 3_600, 21_600]) {
    const offsets = windowOffsets(seconds * 1000);
    assert.ok(offsets.length >= 2, `${seconds}s should produce at least the endpoints`);
    assert.ok(offsets.length <= MAXSIM_MAX_WINDOWS, `${seconds}s produced ${offsets.length} windows`);
    assert.equal(offsets[0], 0);
    assert.equal(offsets[offsets.length - 1], seconds * 1000 - 10_000);
    for (let i = 1; i < offsets.length; i += 1) assert.ok(offsets[i]! > offsets[i - 1]!);
  }
});

test('windowOffsets honours an explicit smaller cap', () => {
  const offsets = windowOffsets(600_000, { maxWindows: 3 });
  assert.equal(offsets.length, 3);
  assert.deepEqual(offsets, [0, 295_000, 590_000]);
});

/* --------------------------------------------------------- best window --- */

test('selectBestWindow picks the maximum and reports its offset', () => {
  const query = unit(4, 0);
  const windows: WindowVector[] = [
    { index: 0, startMs: 0, vector: unit(4, 1) }, // orthogonal → 0
    { index: 1, startMs: 10_000, vector: unit(4, 0) }, // identical → 1
    { index: 2, startMs: 20_000, vector: mixed(4, 0, 2, 0.5) }, // ~0.894
  ];
  const hit = selectBestWindow(query, windows);
  assert.ok(hit);
  assert.equal(hit.score, 1);
  assert.equal(hit.startMs, 10_000);
  assert.equal(hit.index, 1);
  assert.equal(hit.windows, 3);
});

test('selectBestWindow is the fix for a mean drowning a short sound', () => {
  // One 10 s window contains the reference; the other five are unrelated. The mean
  // of these six windows points nowhere near the reference, so a whole-file
  // comparison would miss this file entirely.
  const dim = 6;
  const query = unit(dim, 0);
  const windows: WindowVector[] = [
    { index: 0, startMs: 0, vector: unit(dim, 0) },
    ...Array.from({ length: 5 }, (_, i) => ({
      index: i + 1,
      startMs: (i + 1) * 10_000,
      vector: unit(dim, i + 1),
    })),
  ];

  const mean = new Float32Array(dim);
  for (const window of windows) for (let i = 0; i < dim; i += 1) mean[i] = (mean[i] ?? 0) + window.vector[i]!;
  const norm = Math.hypot(...mean);
  for (let i = 0; i < dim; i += 1) mean[i] = (mean[i] ?? 0) / norm;
  const meanScore = mean[0]!; // cosine against the query axis

  const hit = selectBestWindow(query, windows);
  assert.ok(hit);
  assert.equal(hit.score, 1, 'max-sim finds the window that actually matches');
  assert.ok(
    hit.score > meanScore * 2,
    `max-sim (${hit.score}) must beat the whole-file mean (${meanScore}) by a wide margin`,
  );
});

test('selectBestWindow returns null when nothing is comparable', () => {
  assert.equal(selectBestWindow(unit(4, 0), []), null);
  assert.equal(selectBestWindow(new Float32Array(0), [{ index: 0, startMs: 0, vector: unit(4, 0) }]), null);
  // A dimension change means a different model; reporting "no windowed match" is
  // better than inventing a zero score.
  assert.equal(
    selectBestWindow(unit(4, 0), [{ index: 0, startMs: 0, vector: unit(8, 0) }]),
    null,
  );
});

test('selectBestWindow skips unusable windows but keeps the usable ones', () => {
  const query = unit(4, 0);
  const hit = selectBestWindow(query, [
    { index: 0, startMs: 0, vector: unit(8, 0) }, // wrong width
    { index: 1, startMs: 5_000, vector: unit(4, 0) },
  ]);
  assert.ok(hit);
  assert.equal(hit.windows, 1, 'only comparable windows are counted');
  assert.equal(hit.startMs, 5_000);
});

test('selectBestWindow resolves ties to the earliest window', () => {
  const query = unit(4, 1);
  const hit = selectBestWindow(query, [
    { index: 0, startMs: 3_000, vector: unit(4, 1) },
    { index: 1, startMs: 9_000, vector: unit(4, 1) },
  ]);
  assert.equal(hit?.startMs, 3_000, 'a tie must be reproducible, not arbitrary');
});

test('bestWindowPerAsset keeps one entry per asset with its best score', () => {
  const merged = bestWindowPerAsset([
    { assetId: 1, hit: { score: 0.4, startMs: 0, index: 0, windows: 2 } },
    { assetId: 2, hit: { score: 0.9, startMs: 1_000, index: 1, windows: 3 } },
    { assetId: 1, hit: { score: 0.7, startMs: 20_000, index: 2, windows: 3 } },
  ]);
  assert.equal(merged.length, 2);
  const one = merged.find((entry) => entry.assetId === 1);
  assert.equal(one?.hit.score, 0.7);
  assert.equal(one?.hit.startMs, 20_000);
});

/* ------------------------------------------------------------- planning --- */

function candidate(over: Partial<MaxsimCandidate> & { assetId: number }): MaxsimCandidate {
  return {
    meanScore: 0.5,
    durationMs: 600_000,
    windowsInIndex: false,
    storedWindows: 0,
    ...over,
  };
}

test('planMaxsim uses stored windows for free and only re-analyses the head', () => {
  const candidates = [
    candidate({ assetId: 1, meanScore: 0.9, windowsInIndex: true, storedWindows: 12 }),
    candidate({ assetId: 2, meanScore: 0.8 }),
    candidate({ assetId: 3, meanScore: 0.7 }),
    candidate({ assetId: 4, meanScore: 0.6 }),
  ];
  const plan = planMaxsim(candidates, { refine: 1 });

  const byId = new Map(plan.steps.map((step) => [step.candidate.assetId, step]));
  assert.equal(byId.get(1)?.action, 'stored', 'a stored window set costs nothing, so it is always used');
  assert.equal(byId.get(2)?.action, 'analyse', 'the best mean score gets the one analysis slot');
  assert.equal(byId.get(3)?.action, 'skip');
  assert.equal(byId.get(3)?.reason, 'budget');
  assert.equal(byId.get(4)?.reason, 'budget');
  assert.equal(plan.analyse, 1);
  assert.equal(plan.stored, 1);
  assert.equal(plan.skipped, 2);
});

test('planMaxsim never re-analyses a file too short to have two windows', () => {
  const plan = planMaxsim([candidate({ assetId: 1, durationMs: 4_000, meanScore: 0.9 })]);
  assert.equal(plan.steps[0]?.action, 'skip');
  assert.equal(plan.steps[0]?.reason, 'short');
  assert.equal(plan.analyse, 0);
});

test('planMaxsim does re-analyse a long file with no stored windows, up to the cap', () => {
  const candidates = Array.from({ length: 20 }, (_, i) =>
    candidate({ assetId: i + 1, meanScore: 1 - i / 100 }),
  );
  const plan = planMaxsim(candidates);
  assert.equal(plan.analyse, MAXSIM_DEFAULT_REFINE);
  assert.equal(plan.stored, 0);
  assert.equal(plan.skipped, 20 - MAXSIM_DEFAULT_REFINE);
});

test('planMaxsim ranks the work by mean score, not by input order', () => {
  const plan = planMaxsim(
    [candidate({ assetId: 1, meanScore: 0.1 }), candidate({ assetId: 2, meanScore: 0.9 })],
    { refine: 1 },
  );
  assert.equal(plan.steps[0]?.candidate.assetId, 2);
  assert.equal(plan.steps[0]?.action, 'analyse');
});

/* -------------------------------------------------------------- merging --- */

test('mergeMaxsim replaces a mean score only when max-sim found something better', () => {
  const meanScores = new Map<number, number>([
    [1, 0.3],
    [2, 0.8],
  ]);
  const outcomes: MaxsimOutcome[] = [
    // Asset 1: the mean was dominated by the rest of the file, so the window wins.
    { assetId: 1, score: 0.95, startMs: 200_000, windows: 24, via: 'stored' },
    // Asset 2: its mean was already better; a weaker window must not lower it.
    { assetId: 2, score: 0.5, startMs: 0, windows: 24, via: 'analysed' },
  ];
  const merged = mergeMaxsim(meanScores, outcomes);

  assert.equal(merged[0]?.assetId, 1, 'the promoted file must rank first');
  assert.equal(merged[0]?.score, 0.95);
  assert.equal(merged[0]?.maxsim?.startMs, 200_000);
  assert.equal(merged[1]?.assetId, 2);
  assert.equal(merged[1]?.score, 0.8, 'a worse window must not lower an existing score');
  assert.equal(merged[1]?.maxsim, undefined, 'and must not claim a window match either');
});

test('mergeMaxsim keeps whole-file matches that max-sim never looked at', () => {
  const meanScores = new Map<number, number>([
    [1, 0.4],
    [2, 0.6],
  ]);
  const merged = mergeMaxsim(meanScores, []);
  assert.deepEqual(
    merged.map((entry) => entry.assetId),
    [2, 1],
  );
  for (const entry of merged) assert.equal(entry.maxsim, undefined);
});

test('mergeMaxsim can introduce an asset the mean ranking missed entirely', () => {
  // The realistic case: a long bed whose mean is nowhere near the reference, so it
  // is not in the vector top-N at all — but its windows are.
  const merged = mergeMaxsim(
    new Map([[9, 0.2]]),
    [{ assetId: 77, score: 0.88, startMs: 60_000, windows: 15, via: 'analysed' }],
  );
  assert.deepEqual(
    merged.map((entry) => entry.assetId),
    [77, 9],
  );
});

test('mergeMaxsim is deterministic on equal scores', () => {
  const merged = mergeMaxsim(
    new Map([
      [5, 0.5],
      [3, 0.5],
    ]),
    [],
  );
  assert.deepEqual(
    merged.map((entry) => entry.assetId),
    [3, 5],
    'ties break by asset id so paging is stable',
  );
});

/* ------------------------------------------------------------ formatting --- */

test('formatOffset renders a matched window offset as m:ss.s', () => {
  assert.equal(formatOffset(0), '0:00.0');
  assert.equal(formatOffset(1_500), '0:01.5');
  assert.equal(formatOffset(65_400), '1:05.4');
  assert.equal(formatOffset(200_000), '3:20.0');
  // A negative offset cannot happen, but must not render as "-1:-1.0".
  assert.equal(formatOffset(-5), '0:00.0');
});
