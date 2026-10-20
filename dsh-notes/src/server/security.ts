/**
 * Security primitives for dsh-notes-server.
 *
 * Passwords use Node's built-in scrypt (memory-hard, no native dependency).
 * Access tokens and sessions are stored as SHA-256 hashes; plaintext values
 * only exist in the response that creates them and in the client's memory.
 */

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

export interface ScryptParams {
  N: number
  r: number
  p: number
  keylen: number
}

export const CURRENT_SCRYPT: ScryptParams = { N: 32768, r: 8, p: 1, keylen: 64 }
const MAX_PASSWORD_LENGTH = 256
const MIN_PASSWORD_LENGTH = 12

/** Semaphore keeps concurrent scrypt verifications from exhausting memory. */
export class Semaphore {
  private active = 0
  private readonly waiters: Array<() => void> = []

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiters.push(resolve))
    }
    this.active += 1
    try {
      return await task()
    } finally {
      this.active -= 1
      const next = this.waiters.shift()
      if (next !== undefined) next()
    }
  }
}

export const passwordSemaphore = new Semaphore(2)

export async function hashPassword(password: string, params: ScryptParams = CURRENT_SCRYPT): Promise<string> {
  if (password.length > MAX_PASSWORD_LENGTH) throw new Error('password is too long')
  const salt = randomBytes(16)
  const derived = (await scryptAsync(password, salt, params.keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 128 * 1024 * 1024,
  })) as Buffer
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString('base64')}$${derived.toString('base64')}`
}

export interface VerifyResult {
  ok: boolean
  needsRehash: boolean
}

export async function verifyPassword(password: string, stored: string): Promise<VerifyResult> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return { ok: false, needsRehash: false }
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return { ok: false, needsRehash: false }
  const salt = Buffer.from(parts[4], 'base64')
  const expected = Buffer.from(parts[5], 'base64')
  if (salt.length === 0 || expected.length === 0) return { ok: false, needsRehash: false }
  if (password.length > MAX_PASSWORD_LENGTH) return { ok: false, needsRehash: false }
  let derived: Buffer
  try {
    derived = (await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 256 * 1024 * 1024,
    })) as Buffer
  } catch {
    return { ok: false, needsRehash: false }
  }
  if (derived.length !== expected.length) return { ok: false, needsRehash: false }
  const ok = timingSafeEqual(derived, expected)
  const needsRehash = N < CURRENT_SCRYPT.N || r < CURRENT_SCRYPT.r || expected.length !== CURRENT_SCRYPT.keylen
  return { ok, needsRehash: ok && needsRehash }
}

/** A fixed dummy hash makes unknown-user logins cost the same as known ones. */
export async function createDummyHash(): Promise<string> {
  return passwordSemaphore.run(() => hashPassword(randomBytes(24).toString('base64url')))
}

export function passwordPolicyError(password: string, username: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符`
  if (password.length > MAX_PASSWORD_LENGTH) return '密码过长'
  if (password.trim() === '') return '密码不能为空'
  if (/^\d+$/u.test(password)) return '密码不能是纯数字'
  if (username !== '' && password.toLowerCase() === username.toLowerCase()) return '密码不能与用户名相同'
  return null
}

export function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function validUsername(value: string): boolean {
  return /^[a-z0-9._-]{1,64}$/u.test(value)
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function hashSessionId(id: string): string {
  return createHash('sha256').update(id, 'utf8').digest('hex')
}

export function createSessionId(): string {
  return randomBytes(32).toString('base64url')
}

export interface AccessTokenValue {
  token: string
  id: string
  prefix: string
  hash: string
}

export function createAccessToken(): AccessTokenValue {
  const id = randomBytes(6).toString('hex')
  const secret = randomBytes(32).toString('base64url')
  const token = `dshn_${id}_${secret}`
  return { token, id, prefix: `dshn_${id}`, hash: hashToken(token) }
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof header !== 'string' || header === '') return out
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index <= 0) continue
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    try {
      out[name] = decodeURIComponent(value)
    } catch {
      out[name] = value
    }
  }
  return out
}

/** Sliding-window in-memory limiter. Suitable for a single-process personal server. */
export class RateLimiter {
  private readonly buckets = new Map<string, number[]>()
  private lastSweep = 0

  allow(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
    const now = Date.now()
    this.sweep(now)
    const cutoff = now - windowMs
    const hitList = (this.buckets.get(key) ?? []).filter((at) => at > cutoff)
    if (hitList.length >= limit) {
      const oldest = hitList[0] ?? now
      return { ok: false, retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) }
    }
    hitList.push(now)
    this.buckets.set(key, hitList)
    return { ok: true, retryAfter: 0 }
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return
    this.lastSweep = now
    for (const [key, hits] of this.buckets) {
      if (hits.every((at) => now - at > 3_600_000)) this.buckets.delete(key)
    }
  }
}

interface FailureRecord {
  count: number
  lockUntil: number
  lastFailure: number
}

/** Per-account brute-force guard. In-memory state resets with the process. */
export class LoginGuard {
  private readonly records = new Map<string, FailureRecord>()

  constructor(
    private readonly threshold = 10,
    private readonly lockMs = 15 * 60_000,
  ) {}

  lockedFor(username: string): number {
    const record = this.records.get(username)
    if (record === undefined) return 0
    const remaining = record.lockUntil - Date.now()
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0
  }

  fail(username: string): void {
    const now = Date.now()
    const current = this.records.get(username)
    if (current !== undefined && now - current.lastFailure > 60 * 60_000 && current.lockUntil < now) {
      current.count = 0
    }
    const record = current ?? { count: 0, lockUntil: 0, lastFailure: now }
    record.count += 1
    record.lastFailure = now
    if (record.count >= this.threshold) {
      record.lockUntil = now + this.lockMs
      record.count = 0
    }
    this.records.set(username, record)
  }

  success(username: string): void {
    this.records.delete(username)
  }
}
