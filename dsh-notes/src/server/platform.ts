/**
 * Platform helpers for the standalone notes server.
 *
 * The server is pure JavaScript on top of Node built-ins, so the same bundle
 * runs on Windows, Linux and Debian. This file isolates the few places where
 * the operating systems differ: default paths, permission bits, and the
 * Windows rename retry needed for atomic replacement.
 */

import { chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

export const IS_WINDOWS = process.platform === 'win32'
export const IS_POSIX = process.platform !== 'win32'

const WINDOWS_TRANSIENT = new Set(['EACCES', 'EBUSY', 'EPERM'])

function isTransient(error: unknown): boolean {
  if (!IS_WINDOWS) return false
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && WINDOWS_TRANSIENT.has(code)
}

/** Best-effort chmod: Windows does not implement POSIX permission bits. */
export function hardenFileSync(file: string, mode = 0o600): void {
  if (!IS_POSIX) return
  try {
    chmodSync(file, mode)
  } catch {
    /* The file may not exist yet or the volume may not support modes. */
  }
}

export function hardenFile(file: string, mode = 0o600): Promise<void> {
  if (!IS_POSIX) return Promise.resolve()
  return chmodSyncSafe(file, mode)
}

async function chmodSyncSafe(file: string, mode: number): Promise<void> {
  try {
    const { chmod } = await import('node:fs/promises')
    await chmod(file, mode)
  } catch {
    /* Best effort. */
  }
}

export function ensurePrivateDirSync(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (IS_POSIX) {
    try {
      chmodSync(dir, 0o700)
    } catch {
      /* Best effort. */
    }
  }
}

export async function ensurePrivateDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  if (IS_POSIX) {
    try {
      const { chmod } = await import('node:fs/promises')
      await chmod(dir, 0o700)
    } catch {
      /* Best effort. */
    }
  }
}

/** Atomic replacement with a bounded Windows retry for transient locks. */
export function writeFileAtomicSync(file: string, content: string | Buffer, mode = 0o600): void {
  const temp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`
  try {
    writeFileSync(temp, content, { mode })
    for (let attempt = 0; ; attempt += 1) {
      try {
        renameSync(temp, file)
        break
      } catch (error) {
        if (!isTransient(error) || attempt >= 8) throw error
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1))
      }
    }
    hardenFileSync(file, mode)
  } catch (error) {
    try {
      rmSync(temp, { force: true })
    } catch {
      /* Ignore cleanup failure. */
    }
    throw error
  }
}

export async function writeFileAtomic(file: string, content: string | Buffer, mode = 0o600): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`
  try {
    await writeFile(temp, content, { mode })
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rename(temp, file)
        break
      } catch (error) {
        if (!isTransient(error) || attempt >= 8) throw error
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 20 * (attempt + 1)))
      }
    }
    await hardenFile(file, mode)
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined)
    throw error
  }
}

export function defaultDataDir(): string {
  return join(homedir(), '.dsh-notes')
}

/** Expand a leading `~` and resolve relative paths against the process cwd. */
export function expandPath(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  if (trimmed === '~') return homedir()
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) return join(homedir(), trimmed.slice(2))
  return isAbsolute(trimmed) ? resolve(trimmed) : resolve(trimmed)
}

export function platformLabel(): string {
  return `${process.platform} ${process.arch}`
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === 'localhost'
    || normalized.startsWith('127.')
}

/** Normalize a configured base path to '' for root or '/name' without a trailing slash. */
export function normalizeBasePath(input: string | undefined): string {
  const raw = (input ?? '').trim()
  if (raw === '' || raw === '/') return ''
  if (/^[a-z]+:\/\//i.test(raw)) {
    try {
      return normalizeBasePath(new URL(raw).pathname)
    } catch {
      return ''
    }
  }
  const withLead = raw.startsWith('/') ? raw : `/${raw}`
  const trimmed = withLead.replace(/\/+$/, '')
  if (trimmed === '') return ''
  if (/[\u0000-\u001f\u007f<>"'\\]/u.test(trimmed)) throw new Error('base path contains invalid characters')
  return trimmed
}

export function joinBase(basePath: string, suffix: string): string {
  const base = basePath === '' ? '' : basePath
  if (suffix === '' || suffix === '/') return `${base}/`
  const tail = suffix.startsWith('/') ? suffix : `/${suffix}`
  return `${base}${tail}`
}
