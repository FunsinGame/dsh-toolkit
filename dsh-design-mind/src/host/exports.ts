/**
 * Export directories under `<dsh-home>/design-mind/exports`.
 *
 * Every export gets a fresh, server-generated id so nothing is ever overwritten,
 * and every path is proved to stay inside the root before it is used. Old
 * exports are pruned best-effort; a failed cleanup never fails the export.
 */

import { randomBytes } from 'node:crypto'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { InputError } from './feedback.ts'

export const EXPORT_ID_PATTERN = /^\d{8}-\d{6}-[0-9a-f]{8}$/
export const KEEP_EXPORTS = 50

export function isExportId(value: string): boolean {
  return EXPORT_ID_PATTERN.test(value)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** `20261031-204512-1a2b3c4d`: sortable by name, unique by suffix. */
export function newExportId(now: Date = new Date()): string {
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${stamp}-${randomBytes(4).toString('hex')}`
}

/** Resolve one export directory, refusing anything that escapes the root. */
export function exportDir(root: string, id: string): string {
  if (!isExportId(id)) throw new InputError(404, 'not_found', '导出不存在')
  const base = resolve(root)
  const dir = resolve(base, id)
  const rel = relative(base, dir)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new InputError(404, 'not_found', '导出不存在')
  }
  return dir
}

async function requireDirectory(dir: string): Promise<string> {
  try {
    const info = await stat(dir)
    if (info.isDirectory()) return dir
  } catch {
    // Fall through to the same 404 as a missing directory.
  }
  throw new InputError(404, 'not_found', '导出不存在')
}

/** Create a new export directory and return it. */
export async function createExport(root: string): Promise<{ id: string; dir: string }> {
  await mkdir(root, { recursive: true })
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = newExportId()
    const dir = join(root, id)
    try {
      await mkdir(dir)
      void pruneExports(root).catch(() => undefined)
      return { id, dir }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  throw new InputError(500, 'export_failed', '无法创建导出目录')
}

export async function requireExportDir(root: string, id: string): Promise<string> {
  return requireDirectory(exportDir(root, id))
}

/**
 * Write `feedback.json` with `wx`, so a second commit of the same export is a
 * clear 409 rather than a silent rewrite.
 */
export async function commitExport(dir: string, feedback: unknown): Promise<string> {
  const jsonPath = join(dir, 'feedback.json')
  try {
    await writeFile(jsonPath, `${JSON.stringify(feedback, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new InputError(409, 'already_committed', '这次导出已经写入，请重新导出')
    }
    throw error
  }
  return jsonPath
}

/** Remove all but the newest `keep` export directories. */
export async function pruneExports(root: string, keep: number = KEEP_EXPORTS): Promise<number> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return 0
  }
  const directories: Array<{ name: string; modified: number }> = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !isExportId(entry.name)) continue
    try {
      const info = await stat(join(root, entry.name))
      directories.push({ name: entry.name, modified: info.mtimeMs })
    } catch {
      // A directory that vanished between readdir and stat needs no pruning.
    }
  }
  directories.sort((left, right) => right.modified - left.modified)
  let removed = 0
  for (const entry of directories.slice(keep)) {
    try {
      await rm(join(root, entry.name), { recursive: true, force: true })
      removed += 1
    } catch {
      // Best-effort cleanup: never fail an export because of it.
    }
  }
  return removed
}

async function directorySize(directory: string): Promise<number> {
  let total = 0
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const target = join(directory, entry.name)
      if (entry.isDirectory()) total += await directorySize(target)
      else if (entry.isFile()) {
        try {
          total += (await stat(target)).size
        } catch {
          // A file that vanished between readdir and stat contributes nothing.
        }
      }
    }
  } catch {
    // An unreadable subdirectory still gets removed by the caller.
  }
  return total
}

/**
 * Delete every export this plugin created, plus stray `.part` uploads. Only
 * names matching the export-id pattern are touched, so a user file that happens
 * to live in the same directory survives.
 */
export async function cleanExports(root: string): Promise<{ removed: number; bytes: number }> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return { removed: 0, bytes: 0 }
  }
  let removed = 0
  let bytes = 0
  for (const entry of entries) {
    const target = join(root, entry.name)
    if (entry.isDirectory() && isExportId(entry.name)) {
      bytes += await directorySize(target)
      try {
        await rm(target, { recursive: true, force: true })
        removed += 1
      } catch {
        // Keep going: the next clean can retry a locked directory.
      }
    } else if (entry.isFile() && entry.name.endsWith('.part')) {
      try {
        await rm(target, { force: true })
      } catch {
        // A stray temp file is not worth failing the clean over.
      }
    }
  }
  return { removed, bytes }
}
