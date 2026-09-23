/**
 * Directory discovery.
 *
 * A scan is split from indexing on purpose: discovering 100k files is cheap and
 * gives the UI an immediate total, while reading each file's header is the slow
 * part that must be resumable and cancellable.
 */

import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

/** Extensions we will attempt to index. */
export const AUDIO_EXTENSIONS = new Set([
  '.wav', '.bwf', '.wave', '.rf64', '.w64',
  '.aif', '.aiff', '.aifc',
  '.flac', '.mp3', '.ogg', '.oga', '.opus',
  '.m4a', '.mp4', '.caf', '.ape', '.wv', '.mpc', '.dsf', '.dff',
]);

/** Extensions whose embedded metadata we can read *and* write back. */
export const WRITABLE_EXTENSIONS = new Set(['.wav', '.bwf', '.wave']);

export interface DiscoveredFile {
  path: string;
  dir: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  mtimeMs: number;
}

export interface ScanOptions {
  root: string;
  /** stop after this many entries (0 = no limit) */
  maxFiles?: number;
  /** ignore dot-directories and the usual build output */
  ignoreDirNames?: Set<string>;
  signal?: AbortSignal;
  onProgress?: (found: number) => void;
}

const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '$RECYCLE.BIN', 'System Volume Information',
  '.Trash', '.Trashes', 'lost+found',
]);

export function isAudioFile(filePath: string): boolean {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function isWritableContainer(filePath: string): boolean {
  return WRITABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * Recursively walk `root` and yield audio files.
 * Implemented iteratively with an explicit stack so that a pathological tree
 * cannot blow the call stack, and so cancellation is checked per directory.
 */
export async function discoverFiles(opts: ScanOptions): Promise<DiscoveredFile[]> {
  const ignored = opts.ignoreDirNames ?? DEFAULT_IGNORED_DIRS;
  const maxFiles = opts.maxFiles ?? 0;
  const out: DiscoveredFile[] = [];
  const stack: string[] = [path.resolve(opts.root)];
  let visitedDirs = 0;

  while (stack.length > 0) {
    if (opts.signal?.aborted) break;
    const dir = stack.pop()!;
    visitedDirs += 1;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      // unreadable directory (permissions, stale network mount) — skip, don't fail the scan
      continue;
    }

    for (const entry of entries) {
      if (opts.signal?.aborted) break;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || ignored.has(entry.name)) continue;
        stack.push(full);
        continue;
      }
      if (entry.isSymbolicLink()) continue;
      if (!entry.isFile()) continue;
      if (!isAudioFile(entry.name)) continue;

      let st;
      try {
        st = await stat(full);
      } catch {
        continue;
      }

      out.push({
        path: full,
        dir,
        filename: entry.name,
        extension: path.extname(entry.name).toLowerCase(),
        sizeBytes: st.size,
        mtimeMs: Math.floor(st.mtimeMs),
      });

      if (out.length % 500 === 0) opts.onProgress?.(out.length);
      if (maxFiles > 0 && out.length >= maxFiles) {
        stack.length = 0;
        break;
      }
    }
  }

  opts.onProgress?.(out.length);
  void visitedDirs;
  return out;
}

/**
 * Partial content hash: first 256 KiB + last 256 KiB + size.
 *
 * Hashing whole files would dominate a large import. This fingerprint is enough
 * to spot duplicated libraries while staying IO-cheap, and it is stable across
 * moves and renames — which is exactly how we detect "the same file" later.
 */
export async function hashFile(filePath: string, sizeBytes: number, chunk = 262_144): Promise<string> {
  const hash = createHash('sha256');
  hash.update(String(sizeBytes));

  if (sizeBytes <= chunk * 2) {
    await streamInto(hash, filePath, 0, sizeBytes);
  } else {
    await streamInto(hash, filePath, 0, chunk);
    await streamInto(hash, filePath, sizeBytes - chunk, chunk);
  }
  return hash.digest('hex').slice(0, 32);
}

function streamInto(hash: ReturnType<typeof createHash>, filePath: string, start: number, length: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { start, end: start + length - 1 });
    stream.on('data', (buf) => hash.update(buf));
    stream.on('error', reject);
    stream.on('end', () => resolve());
  });
}
