/**
 * Filesystem-level metadata editing for WAV / BWF files.
 *
 * The rules here exist because writing into someone's sound library is the most
 * dangerous thing this project does:
 *
 *  1. **Only RIFF containers.** `.wav`/`.bwf`/`.wave`. Anything else is refused
 *     rather than converted — converting would change the audio.
 *  2. **A backup is taken once per file, before the first modification**, under
 *     `<dataDir>/backups/`. The original bytes are never lost, even if the
 *     rewrite is buggy.
 *  3. **Write to a temp file, then rename.** A crash mid-write leaves the
 *     original intact; rename is atomic on the same filesystem.
 *  4. **Re-parse the result before committing it.** If the rebuilt container does
 *     not probe as a valid WAVE with the same frame count, we abort and keep the
 *     original.
 *  5. **The audio payload is copied byte for byte.** Only metadata chunks change.
 */

import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { copyFile, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { probeWavBuffer, type BextChunk } from './index.js';
import { locateChunks, rewriteRiff, type MetadataEdit } from './writer.js';

const WRITABLE_EXTENSIONS = new Set(['.wav', '.bwf', '.wave']);

export interface UpdateOptions {
  /** where backups live; when omitted no backup is written (used by tests) */
  backupDir?: string | null;
  /** skip the write and just report what would happen */
  dryRun?: boolean;
}

export interface UpdateResult {
  path: string;
  /** backup file that was created, or the existing one reused */
  backupPath: string | null;
  changed: boolean;
  bytesBefore: number;
  bytesAfter: number;
  /** chunk ids present after the rewrite */
  chunkIds: string[];
  warnings: string[];
}

export function isEditableWav(filePath: string): boolean {
  return WRITABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * Directory that holds backups for a given data directory.
 *
 * Callers legitimately pass either `<dataDir>` or `<dataDir>/backups`, and
 * appending unconditionally would nest a second `backups/` and make the restore
 * path unreachable — a bug that only shows up on a real restore.
 */
export function backupDirFor(dataDir: string): string {
  const resolved = path.resolve(dataDir);
  return path.basename(resolved) === 'backups' ? resolved : path.join(resolved, 'backups');
}

/** Deterministic backup name: `<sha1-of-path>-<basename>.wav`, readable and unique. */
export function backupPathFor(dataDir: string, filePath: string): string {
  const digest = createHash('sha1').update(path.resolve(filePath)).digest('hex').slice(0, 16);
  const base = path.basename(filePath, path.extname(filePath));
  return path.join(backupDirFor(dataDir), `${digest}-${sanitize(base)}.wav`);
}

function sanitize(name: string): string {
  return name.replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 60);
}

/**
 * Apply metadata edits to a WAV file.
 *
 * `edit.bext` is written only when it is supplied or already present: a plain
 * "set the description" request on a file with no BWF block goes to iXML rather
 * than inventing a bext block, because bext carries timing/UMID semantics that
 * a tool should not fabricate.
 */
export async function updateWavMetadata(
  filePath: string,
  edit: MetadataEdit,
  options: UpdateOptions = {},
): Promise<UpdateResult> {
  const warnings: string[] = [];

  if (!isEditableWav(filePath)) {
    throw new Error(
      `only RIFF containers can be edited (got "${path.extname(filePath) || 'no extension'}"). ` +
        'Converting other formats would change the audio, so it is refused.',
    );
  }

  const original = await readFile(filePath);
  const before = await stat(filePath);

  let layout;
  try {
    layout = locateChunks(original);
  } catch (err) {
    throw new Error(`cannot parse ${path.basename(filePath)}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const hasData = layout.chunks.some((c) => c.id === 'data');
  if (!hasData) warnings.push('file has no data chunk; audio may be missing');

  // Read only the audio payload; everything else is small.
  const dataChunk = layout.chunks.find((c) => c.id === 'data');
  const audio = dataChunk ? original.subarray(dataChunk.payloadOffset, dataChunk.payloadOffset + dataChunk.size) : Buffer.alloc(0);

  const rebuilt = rewriteRiff(original, layout, edit, audio);

  // Verify *before* touching the original.
  let after;
  try {
    after = probeWavBuffer(rebuilt);
  } catch (err) {
    throw new Error(
      `refusing to write: the rebuilt file does not parse (${err instanceof Error ? err.message : String(err)}). ` +
        'Original left untouched.',
    );
  }

  const framesBefore = probeFrameCount(original);
  if (framesBefore !== null && after.frameCount !== framesBefore) {
    throw new Error(
      `refusing to write: frame count changed from ${framesBefore} to ${after.frameCount}. Original left untouched.`,
    );
  }

  if (rebuilt.equals(original)) {
    return {
      path: filePath,
      backupPath: null,
      changed: false,
      bytesBefore: original.length,
      bytesAfter: original.length,
      chunkIds: layout.chunks.map((c) => c.id),
      warnings,
    };
  }

  if (options.dryRun) {
    return {
      path: filePath,
      backupPath: null,
      changed: true,
      bytesBefore: original.length,
      bytesAfter: rebuilt.length,
      chunkIds: after.chunks.map((c) => c.id),
      warnings: [...warnings, 'dry run: nothing was written'],
    };
  }

  // 1. Back up the original bytes exactly once.
  let backupPath: string | null = null;
  if (options.backupDir) {
    backupPath = backupPathFor(options.backupDir, filePath);
    const existing = await stat(backupPath).catch(() => null);
    if (!existing) {
      await mkdir(path.dirname(backupPath), { recursive: true });
      await copyFile(filePath, backupPath);
    }
  } else {
    warnings.push('no backup directory configured — the original bytes are not preserved');
  }

  // 2. Write a sibling temp file, fsync it, then rename over the original.
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.sounddesk-${process.pid}-${Date.now()}.tmp`);
  try {
    const handle = await open(tempPath, fsConstants.O_CREAT | fsConstants.O_WRONLY | fsConstants.O_TRUNC, before.mode & 0o777);
    try {
      await handle.write(rebuilt);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tempPath, filePath);
  } catch (err) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw new Error(`write failed, original left untouched: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    path: filePath,
    backupPath,
    changed: true,
    bytesBefore: original.length,
    bytesAfter: rebuilt.length,
    chunkIds: after.chunks.map((c) => c.id),
    warnings,
  };
}

/** Restore the original bytes from the backup, if one exists. */
export async function restoreFromBackup(dataDir: string, filePath: string): Promise<boolean> {
  const backupPath = backupPathFor(dataDir, filePath);
  const exists = await stat(backupPath).catch(() => null);
  if (!exists) return false;
  await copyFile(backupPath, filePath);
  return true;
}

export async function hasBackup(dataDir: string, filePath: string): Promise<boolean> {
  return (await stat(backupPathFor(dataDir, filePath)).catch(() => null)) !== null;
}

/** Convenience wrapper for the common "edit the description/keywords" case. */
export async function updateWavMetadataFields(
  filePath: string,
  fields: {
    description?: string;
    keywords?: string[];
    designer?: string;
    recorder?: string;
    library?: string;
    copyright?: string;
    scene?: string;
    take?: string;
    note?: string;
  },
  options: UpdateOptions = {},
): Promise<UpdateResult> {
  const original = await readFile(filePath);
  const probe = probeWavBuffer(original);
  const layout = locateChunks(original);
  const hasBext = layout.chunks.some((c) => c.id === 'bext');

  const edit: MetadataEdit = {};
  const warnings: string[] = [];

  // bext: only when it already exists (see the note on updateWavMetadata).
  if (hasBext) {
    const existing = probe.embedded.bext;
    const next: BextChunk = {
      description: fields.description ?? existing?.description ?? '',
      originator: fields.designer ?? existing?.originator ?? '',
      originatorReference: existing?.originatorReference ?? '',
      originationDate: existing?.originationDate ?? '',
      originationTime: existing?.originationTime ?? '',
      timeReferenceLow: existing?.timeReferenceLow ?? 0,
      timeReferenceHigh: existing?.timeReferenceHigh ?? 0,
      version: existing?.version ?? 1,
      umid: existing?.umid ?? '',
      codingHistory: existing?.codingHistory ?? [],
      ...(existing?.loudnessValue !== undefined ? { loudnessValue: existing.loudnessValue } : {}),
    };
    edit.bext = next;
  } else if (fields.description || fields.designer) {
    warnings.push('file has no BWF bext block, so description/designer were written to iXML only');
  }

  // iXML: merge into whatever is there so unrelated fields survive.
  const merged: Record<string, string> = { ...(probe.embedded.ixml ?? {}) };
  if (fields.description !== undefined) merged.DESCRIPTION = fields.description;
  if (fields.designer !== undefined) merged.DESIGNER = fields.designer;
  if (fields.recorder !== undefined) merged.RECORDER = fields.recorder;
  if (fields.library !== undefined) merged.LIBRARY = fields.library;
  if (fields.copyright !== undefined) merged.COPYRIGHT = fields.copyright;
  if (fields.scene !== undefined) merged.SCENE = fields.scene;
  if (fields.take !== undefined) merged.TAKE = fields.take;
  if (fields.note !== undefined) merged.NOTE = fields.note;
  if (fields.keywords !== undefined) merged.KEYWORDS = fields.keywords.join(', ');

  edit.ixml = buildIxml(merged);

  const result = await updateWavMetadata(filePath, edit, options);
  return { ...result, warnings: [...warnings, ...result.warnings] };
}

/** Minimal, well-formed iXML document. */
export function buildIxml(fields: Record<string, string>): string {
  const lines = Object.entries(fields)
    .filter(([key, value]) => key.length > 0 && value !== undefined && value !== null && String(value).length > 0)
    .map(([key, value]) => `\t<${key}>${escapeXml(String(value))}</${key}>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<BWFXML>\n${lines.join('\n')}\n</BWFXML>\n`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Frame count from a raw RIFF buffer, or null when it cannot be determined. */
function probeFrameCount(buffer: Buffer): number | null {
  try {
    return probeWavBuffer(buffer).frameCount;
  } catch {
    return null;
  }
}

export {
  locateChunks,
  rewriteRiff,
  buildBextPayload,
  buildInfoPayload,
} from './writer.js';
export type { MetadataEdit, RiffLayout, LocatedChunk } from './writer.js';
