/**
 * Import progress for "add a local library" (side bar + fullscreen overlay).
 *
 * Kept as pure functions so the aggregation is testable without a DOM, an engine or
 * a running index: the overlay's whole job is to be correct about "are we still
 * busy, and how far along", and that is arithmetic over the job list.
 */

import type { JobKind, JobProgress } from '@sounddesk/core';

/** Phases an import walks through, in order. */
export const IMPORT_PHASES: readonly JobKind[] = ['scan', 'waveform', 'embed'];

/** Chinese labels for the phase, shown in the overlay. */
export const IMPORT_PHASE_LABELS: Record<string, string> = {
  scan: '扫描与元数据',
  waveform: '生成波形',
  embed: '声音指纹',
  tag: '读取标签',
  reindex: '重建索引',
  classify: '分类',
};

export function phaseLabel(kind: string): string {
  return IMPORT_PHASE_LABELS[kind] ?? kind;
}

export interface ImportProgress {
  /** the phase currently running, or the last one that ran */
  phase: JobKind | string | null;
  phaseLabel: string;
  done: number;
  total: number;
  /** 0..1, or null when the total is not yet known */
  fraction: number | null
  /**
   * Overall completion across every phase.
   *
   * A phase whose total is still 0 (not started, or the scanner has not counted
   * yet) contributes nothing to the denominator, so the bar does not jump backwards
   * when a later phase begins.
   */
  overallFraction: number | null;
  /** true while any of the import's jobs is running or queued */
  busy: boolean;
  failed: number;
  /** set when the import stopped because a phase failed */
  error: string | null;
  /** the library being imported */
  libraryName: string;
}

export interface ImportInputs {
  /** jobs belonging to this import, newest first is fine — order is not assumed */
  jobs: readonly JobProgress[];
  libraryId: number | null;
  libraryName: string;
}

/**
 * Reduce the engine's job list to the state of one import.
 *
 * Only jobs for `libraryId` count. The engine may be running other libraries'
 * background passes, and letting those advance this bar would make it meaningless.
 */
export function summarizeImport(inputs: ImportInputs): ImportProgress {
  const { jobs, libraryId, libraryName } = inputs;
  const scoped = jobs.filter((job) => (libraryId === null ? true : job.libraryId === libraryId));

  // One job per phase, keeping the most recently updated: a rescan creates a new job
  // row rather than reusing the old one.
  const byPhase = new Map<string, JobProgress>();
  for (const job of scoped) {
    const previous = byPhase.get(job.kind);
    if (!previous || job.updatedAt >= previous.updatedAt) byPhase.set(job.kind, job);
  }

  const running = scoped.find((job) => job.state === 'running');
  const queued = scoped.find((job) => job.state === 'queued');
  const current = running ?? queued ?? null;

  const failedJob = scoped.find((job) => job.state === 'failed');

  let done = 0;
  let total = 0;
  for (const kind of IMPORT_PHASES) {
    const job = byPhase.get(kind);
    if (!job) continue;
    // A phase that never reported a total is not counted, so the denominator only
    // ever describes work we actually know about.
    if (job.total <= 0) continue;
    total += job.total;
    done += Math.min(job.done, job.total);
  }

  const busy = running !== undefined || queued !== undefined;
  const fraction = current && current.total > 0 ? Math.min(1, current.done / current.total) : null;

  return {
    phase: current?.kind ?? null,
    phaseLabel: current ? phaseLabel(current.kind) : '',
    done: current?.done ?? 0,
    total: current?.total ?? 0,
    fraction,
    overallFraction: total > 0 ? Math.min(1, done / total) : null,
    busy,
    failed: scoped.reduce((sum, job) => sum + job.failed, 0),
    error: failedJob?.error ?? null,
    libraryName,
  };
}

/**
 * Whether the overlay should block the workbench.
 *
 * Blocking is the requested behaviour for an import specifically: a half-indexed
 * library makes every count, category and search result on screen wrong, so the UI is
 * hidden rather than allowed to show numbers that are about to change.
 */
export function shouldBlockUi(progress: ImportProgress | null): boolean {
  return progress !== null && progress.busy;
}

/** `42/100`, `42` when the total is unknown, or `—` before anything has run. */
export function formatImportCount(progress: ImportProgress): string {
  if (progress.total > 0) return `${progress.done}/${progress.total}`;
  if (progress.done > 0) return `${progress.done}`;
  return '-';
}

/** Whole percent, clamped, for the bar's label. */
export function formatPercent(fraction: number | null): string {
  if (fraction === null) return '';
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}
