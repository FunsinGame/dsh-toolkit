/**
 * Tests for the import progress reducer.
 *
 * The overlay's entire job is to be correct about "are we still busy, and how far
 * along", and both of those are arithmetic over the engine's job list — so they are
 * testable without a DOM, a running engine or a real import.
 *
 * The failure this suite guards against is the bar going backwards or the block
 * releasing early: either one turns a progress screen into a misleading one, which is
 * worse than no progress screen at all.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { JobProgress } from '@sounddesk/core';

import {
  IMPORT_PHASES,
  formatImportCount,
  formatPercent,
  phaseLabel,
  shouldBlockUi,
  summarizeImport,
} from './importProgress.ts';

/** A job with sensible defaults, so each test states only what it is about. */
function job(over: Partial<JobProgress> & { kind: JobProgress['kind']; state: JobProgress['state'] }): JobProgress {
  return {
    id: `${over.kind}-${over.state}`,
    libraryId: 1,
    total: 100,
    done: 0,
    failed: 0,
    etaMs: null,
    currentPath: null,
    error: null,
    startedAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const LIB = { libraryId: 1, libraryName: 'SFX' };

test('the phase list is the import pipeline, in order', () => {
  assert.deepEqual([...IMPORT_PHASES], ['scan', 'waveform', 'embed']);
  assert.equal(phaseLabel('scan'), '扫描与元数据');
  assert.equal(phaseLabel('waveform'), '生成波形');
  assert.equal(phaseLabel('embed'), '声音指纹');
  // An unknown kind is passed through rather than rendered as "undefined".
  assert.equal(phaseLabel('something-new'), 'something-new');
});

test('only the import library counts, so another library cannot move this bar', () => {
  const progress = summarizeImport({
    ...LIB,
    jobs: [
      job({ kind: 'scan', state: 'running', libraryId: 1, done: 10, total: 100 }),
      // A different library, indexing in the background.
      job({ kind: 'scan', state: 'running', libraryId: 2, done: 900, total: 1000 }),
    ],
  });

  assert.equal(progress.done, 10, 'the other library must not contribute');
  assert.equal(progress.total, 100);
  assert.equal(progress.fraction, 0.1);
});

test('busy is true while any phase is running or queued', () => {
  const running = summarizeImport({ ...LIB, jobs: [job({ kind: 'scan', state: 'running' })] });
  assert.equal(running.busy, true);
  assert.equal(shouldBlockUi(running), true);

  const queued = summarizeImport({ ...LIB, jobs: [job({ kind: 'waveform', state: 'queued' })] });
  assert.equal(queued.busy, true, 'queued work still means the catalogue is in flux');

  const finished = summarizeImport({ ...LIB, jobs: [job({ kind: 'scan', state: 'done', done: 100 })] });
  assert.equal(finished.busy, false);
  assert.equal(shouldBlockUi(finished), false, 'the block must release once nothing runs');

  assert.equal(shouldBlockUi(null), false, 'no import means no block');
});

test('the current phase is the running one and reports its own numbers', () => {
  const progress = summarizeImport({
    ...LIB,
    jobs: [
      job({ kind: 'scan', state: 'done', done: 100, total: 100 }),
      job({ kind: 'waveform', state: 'running', done: 30, total: 80, updatedAt: 5 }),
    ],
  });

  assert.equal(progress.phase, 'waveform');
  assert.equal(progress.phaseLabel, '生成波形');
  assert.equal(progress.done, 30);
  assert.equal(progress.total, 80);
  assert.equal(progress.fraction, 0.375);
});

test('a phase the scanner has not counted yet does not enter the denominator', () => {
  // This is the specific bug that would make the bar jump backwards: a later phase
  // starts with total 0, and including it would shrink the overall fraction.
  const early = summarizeImport({
    ...LIB,
    jobs: [
      job({ kind: 'scan', state: 'done', done: 100, total: 100 }),
      job({ kind: 'waveform', state: 'running', done: 0, total: 0, updatedAt: 5 }),
    ],
  });
  assert.equal(early.overallFraction, 1, 'only the known work counts, so this reads as complete-so-far');

  const midway = summarizeImport({
    ...LIB,
    jobs: [
      job({ kind: 'scan', state: 'done', done: 100, total: 100 }),
      job({ kind: 'waveform', state: 'running', done: 50, total: 100, updatedAt: 5 }),
    ],
  });
  assert.equal(midway.overallFraction, 150 / 200);

  // Once the scanner counts, the fraction can only move forward from there.
  const counted = summarizeImport({
    ...LIB,
    jobs: [
      job({ kind: 'scan', state: 'done', done: 100, total: 100 }),
      job({ kind: 'waveform', state: 'running', done: 50, total: 200, updatedAt: 5 }),
      job({ kind: 'embed', state: 'queued', done: 0, total: 300, updatedAt: 6 }),
    ],
  });
  assert.equal(counted.overallFraction, 150 / 600);
});

test('a phase that over-reports is clamped, so the bar cannot exceed 100%', () => {
  const progress = summarizeImport({
    ...LIB,
    jobs: [job({ kind: 'scan', state: 'running', done: 130, total: 100, updatedAt: 1 })],
  });
  assert.equal(progress.overallFraction, 1);
  assert.equal(progress.fraction, 1);
  assert.equal(formatPercent(progress.overallFraction), '100%');
});

test('a rescan supersedes the previous job for the same phase', () => {
  // The engine creates a new job row per pass, so an old finished job must not win.
  const progress = summarizeImport({
    ...LIB,
    jobs: [
      job({ kind: 'scan', state: 'done', done: 100, total: 100, updatedAt: 1 }),
      job({ kind: 'scan', state: 'running', done: 5, total: 50, updatedAt: 2 }),
    ],
  });
  assert.equal(progress.phase, 'scan');
  assert.equal(progress.total, 50, 'the newer job for the phase is the one that counts');
  assert.equal(progress.done, 5);
});

test('failures surface, including the reason', () => {
  const progress = summarizeImport({
    ...LIB,
    jobs: [
      job({ kind: 'scan', state: 'done', done: 100, total: 100, failed: 3 }),
      job({ kind: 'waveform', state: 'failed', done: 1, total: 10, failed: 2, error: '磁盘已满', updatedAt: 2 }),
    ],
  });
  assert.equal(progress.failed, 5, 'failed counts accumulate across passes');
  assert.equal(progress.error, '磁盘已满');
});

test('nothing has run yet: indeterminate rather than a stuck 0%', () => {
  const progress = summarizeImport({ ...LIB, jobs: [] });
  assert.equal(progress.overallFraction, null);
  assert.equal(progress.fraction, null);
  assert.equal(formatPercent(progress.overallFraction), '', 'no percentage is shown when there is no total');
  assert.equal(formatImportCount(progress), '-');
  assert.equal(progress.phaseLabel, '', 'the overlay supplies its own "preparing" label');
});

test('counts render as done/total, or a bare count before a total exists', () => {
  assert.equal(formatImportCount(summarizeImport({ ...LIB, jobs: [job({ kind: 'scan', state: 'running', done: 42, total: 100 })] })), '42/100');
  // A bare "42/" would look truncated, and "0/0" would look broken.
  assert.equal(formatImportCount(summarizeImport({ ...LIB, jobs: [job({ kind: 'scan', state: 'running', done: 42, total: 0 })] })), '42');
});

test('percentages are whole numbers and never negative', () => {
  assert.equal(formatPercent(0), '0%');
  assert.equal(formatPercent(0.005), '1%');
  assert.equal(formatPercent(0.567), '57%');
  assert.equal(formatPercent(1), '100%');
  assert.equal(formatPercent(-1), '0%');
  assert.equal(formatPercent(null), '');
});

test('libraryId null means "not known yet", and then every job counts', () => {
  // The store sets the id only after the engine reports the new library, and during
  // that window the progress must still advance rather than sit at 0%.
  const progress = summarizeImport({
    libraryId: null,
    libraryName: 'SFX',
    jobs: [job({ kind: 'scan', state: 'running', libraryId: 9, done: 20, total: 40 })],
  });
  assert.equal(progress.total, 40);
  assert.equal(progress.done, 20);
});

test('a snapshot with no jobs at all is a valid, non-blocking state', () => {
  const progress = summarizeImport({ ...LIB, jobs: [] });
  assert.equal(progress.busy, false);
  assert.equal(progress.libraryName, 'SFX');
  assert.equal(progress.error, null);
});
