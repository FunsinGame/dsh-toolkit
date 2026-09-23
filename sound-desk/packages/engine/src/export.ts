/**
 * Saving rendered exports.
 *
 * This is the *only* place the effect chain reaches the disk, and it deliberately
 * does not reuse the metadata write-back path: that rewrites a file the user
 * already owns, whereas this creates a **new** file. The safety rules are
 * therefore different, and worth stating:
 *
 *  - Never overwrite. An export that silently replaced a source file would be
 *    unrecoverable, so a collision gets a numeric suffix instead. The metadata
 *    path can afford to overwrite because it backs the file up first; a new file
 *    has nothing to back up.
 *  - Never write outside an allowed root. The destination is resolved and then
 *    checked against the library directories (plus a dedicated export folder),
 *    because the request carries a path and a path from a client is untrusted.
 *  - The name is derived from the source asset, not taken from the request, so a
 *    malicious name cannot traverse directories.
 *  - Only WAV, and only audio: this endpoint writes rendered audio, not arbitrary
 *    bytes to arbitrary files.
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface ExportTarget {
  /** directory the export should land in */
  directory: string;
  /** file name without extension */
  baseName: string;
}

export interface ExportResult {
  /** absolute path actually written (may differ from the request on collision) */
  filePath: string;
  bytes: number;
  /** true when the requested name was taken and a suffix was added */
  renamed: boolean;
}

export class ExportError extends Error {
  /**
   * Not a constructor parameter property: Node's `--experimental-strip-types`
   * (used to run these sources directly) rejects that syntax, and the whole
   * point of this package is that its sources run unbuilt.
   */
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ExportError';
    this.status = status;
  }
}

/** Suffix appended to an exported file so it is identifiable at a glance. */
export const EXPORT_SUFFIX = '_fx';

/**
 * Strip anything that could escape the target directory.
 *
 * Applied to the *stem* only; the extension is chosen by the caller. Unicode
 * letters and digits are kept — sound libraries are full of them — while path
 * separators, `..`, control characters and Windows-reserved names are removed.
 */
export function safeStem(input: string): string {
  const withoutExtension = input.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  let stem = withoutExtension
    // path separators and traversal
    .replace(/[/\\]/g, '_')
    .replace(/\.{2,}/g, '.')
    // control characters and characters Windows forbids
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    // collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
    // Windows dislikes trailing dots and spaces
    .replace(/[. ]+$/, '');

  if (stem.length === 0) stem = 'export';
  // reserved device names, case-insensitive and with or without an extension
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem = `_${stem}`;
  return stem.slice(0, 120);
}

/**
 * Pick a file name that does not exist yet.
 *
 * Exported rather than inlined so the collision rule is testable without
 * touching the filesystem: `name.wav`, `name-2.wav`, `name-3.wav`, …
 */
export function uniqueName(directory: string, stem: string, extension: string, exists = existsSync): { name: string; renamed: boolean } {
  const first = `${stem}${extension}`;
  if (!exists(path.join(directory, first))) return { name: first, renamed: false };
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${stem}-${n}${extension}`;
    if (!exists(path.join(directory, candidate))) return { name: candidate, renamed: true };
  }
  throw new ExportError('同名文件太多，请换个名字', 409);
}

/** Is `target` inside `root`? Compares resolved paths, case-insensitively on Windows. */
export function isInside(root: string, target: string): boolean {
  const normalise = (p: string): string => {
    const resolved = path.resolve(p);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  const a = normalise(root);
  const b = normalise(target);
  if (a === b) return true;
  const withSep = a.endsWith(path.sep) ? a : a + path.sep;
  return b.startsWith(withSep);
}

export interface SaveExportOptions {
  /** directories an export is allowed to land in */
  allowedRoots: string[];
  /** requested directory; defaults to the first allowed root */
  directory?: string | null;
  /** requested file name (with or without extension) */
  filename: string;
  bytes: Uint8Array;
}

/**
 * Write rendered audio to disk, creating directories as needed.
 *
 * Throws `ExportError` with an HTTP status for anything the caller got wrong, so
 * the route can pass the reason straight through to the user.
 */
export function saveExport(options: SaveExportOptions): ExportResult {
  const { bytes } = options;
  if (bytes.byteLength === 0) throw new ExportError('没有可写出的音频数据');
  if (bytes.byteLength > 512 * 1024 * 1024) throw new ExportError('导出的文件过大（上限 512MB）', 413);

  // A WAV must start with RIFF/WAVE; refuse anything else rather than writing a
  // mislabelled file the user will only discover later.
  if (
    bytes.byteLength < 12 ||
    bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 || bytes[9] !== 0x41 || bytes[10] !== 0x56 || bytes[11] !== 0x45
  ) {
    throw new ExportError('导出内容不是 WAV 数据');
  }

  const roots = options.allowedRoots.filter((root) => root && root.length > 0);
  if (roots.length === 0) throw new ExportError('没有可用的导出位置', 409);

  const requested = options.directory && options.directory.length > 0 ? options.directory : roots[0]!;
  const directory = path.resolve(requested);
  if (!roots.some((root) => isInside(root, directory))) {
    throw new ExportError('只能导出到素材库目录或导出目录内', 403);
  }

  const stem = `${safeStem(options.filename)}${EXPORT_SUFFIX}`;
  mkdirSync(directory, { recursive: true });
  const { name, renamed } = uniqueName(directory, stem, '.wav');

  const filePath = path.join(directory, name);
  // Re-check after joining: belt and braces against a crafted stem.
  if (!roots.some((root) => isInside(root, filePath))) {
    throw new ExportError('导出路径非法', 403);
  }

  writeFileSync(filePath, bytes);
  return { filePath, bytes: bytes.byteLength, renamed };
}

/** Directories an export may be written to for one library. */
export function exportRootsFor(libraryRoot: string | null, dataDir: string): string[] {
  const roots: string[] = [];
  if (libraryRoot) roots.push(path.resolve(libraryRoot));
  roots.push(path.join(path.resolve(dataDir), 'exports'));
  return roots;
}

/** True when the path exists and is a directory (used to validate a request). */
export function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}
