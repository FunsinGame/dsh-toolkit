/**
 * Host-side persistence: settings, the Bilibili cookie jar, and the cached WBI
 * keys. Small JSON documents under `$DSH_HOME/music-player`, written atomically
 * through a per-file serial queue.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CookieJar } from './bili'
import {
  getCsrfToken,
  getUserId,
  isLoggedIn as hasLoginCookies,
  mergeCookies,
  parseCookieHeader,
  serializeCookie,
} from './bili'
import type { Logger } from './logger'
import { silentLogger } from './logger'
import type { WbiKeys } from './bili'
import { COOKIES_FILE, DATA_DIR, SETTINGS_FILE, WBI_FILE } from './paths'

/* ----------------------------------------------------------------- settings */

export type PlaybackMode = 'sequential' | 'repeat-all' | 'repeat-one' | 'shuffle'

export interface SettingsState {
  audioQuality: number
  defaultPlayMode: PlaybackMode
  volume: number
  playbackRate: number
  cacheEnabled: boolean
  cacheMaxMB: number
  requestIntervalMs: number
  logLevel: 'off' | 'info' | 'debug'
  showStatusBar: boolean
}

export const DEFAULT_SETTINGS: SettingsState = {
  audioQuality: 30280,
  defaultPlayMode: 'sequential',
  volume: 0.8,
  playbackRate: 1,
  cacheEnabled: true,
  cacheMaxMB: 500,
  requestIntervalMs: 350,
  logLevel: 'info',
  showStatusBar: true,
}

type Spec =
  | { type: 'number'; values?: readonly number[]; min?: number; max?: number }
  | { type: 'string'; values: readonly string[] }
  | { type: 'boolean' }

const SPEC: Record<keyof SettingsState, Spec> = {
  audioQuality: { type: 'number', values: [30216, 30232, 30280] },
  defaultPlayMode: { type: 'string', values: ['sequential', 'repeat-all', 'repeat-one', 'shuffle'] },
  volume: { type: 'number', min: 0, max: 1 },
  playbackRate: { type: 'number', values: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] },
  cacheEnabled: { type: 'boolean' },
  cacheMaxMB: { type: 'number', min: 50, max: 100_000 },
  requestIntervalMs: { type: 'number', min: 0, max: 10_000 },
  logLevel: { type: 'string', values: ['off', 'info', 'debug'] },
  showStatusBar: { type: 'boolean' },
}

export function isSettingsKey(value: string): value is keyof SettingsState {
  return Object.prototype.hasOwnProperty.call(SPEC, value)
}

export function coerceSetting(
  key: keyof SettingsState,
  raw: unknown,
): SettingsState[keyof SettingsState] | null {
  const spec = SPEC[key]
  if (spec.type === 'boolean') return typeof raw === 'boolean' ? raw : null
  if (spec.type === 'string') {
    return typeof raw === 'string' && spec.values.includes(raw)
      ? (raw as SettingsState[keyof SettingsState])
      : null
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  if (spec.values !== undefined) return spec.values.includes(raw) ? raw : null
  const min = spec.min ?? Number.NEGATIVE_INFINITY
  const max = spec.max ?? Number.POSITIVE_INFINITY
  return Math.min(Math.max(raw, min), max)
}

/** Serialize writes for one path so rapid setting edits cannot interleave. */
class AtomicFile {
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly path: string, private readonly logger: Logger) {}

  async read(): Promise<string | null> {
    try {
      return await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return null
      this.logger.warn(`读取文件失败：${this.path}`, error)
      return null
    }
  }

  async write(text: string): Promise<void> {
    const run = async (): Promise<void> => {
      await mkdir(dirname(this.path), { recursive: true })
      const temporary = `${this.path}.${process.pid}.tmp`
      await writeFile(temporary, text, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, this.path)
    }
    const next = this.queue.then(run, run)
    this.queue = next.then(() => undefined, () => undefined)
    await next
  }
}

export class SettingsStore {
  private state: SettingsState = { ...DEFAULT_SETTINGS }
  private readonly file: AtomicFile

  constructor(private readonly logger: Logger = silentLogger) {
    this.file = new AtomicFile(SETTINGS_FILE, logger)
  }

  async load(): Promise<SettingsState> {
    const raw = await this.file.read()
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as Partial<SettingsState>
        for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof SettingsState>) {
          const value = parsed[key]
          const coerced = coerceSetting(key, value)
          if (coerced !== null) (this.state as unknown as Record<string, unknown>)[key] = coerced
        }
      } catch (error) {
        this.logger.warn('设置文件损坏，使用默认值', error)
      }
    }
    return this.current
  }

  get current(): SettingsState {
    return { ...this.state }
  }

  get<K extends keyof SettingsState>(key: K): SettingsState[K] {
    return this.state[key]
  }

  async update(key: string, raw: unknown): Promise<SettingsState> {
    if (!isSettingsKey(key)) throw new Error(`未知设置项：${key}`)
    const coerced = coerceSetting(key, raw)
    if (coerced === null) throw new Error(`设置值不合法：${key}`)
    ;(this.state as unknown as Record<string, unknown>)[key] = coerced
    await this.file.write(`${JSON.stringify(this.state, null, 2)}\n`)
    this.logger.debug(`设置已更新：${key}`, coerced)
    return this.current
  }
}

/* ------------------------------------------------------------------ session */

interface StoredCredentials {
  cookies: CookieJar
  buvid3?: string
  buvid4?: string
  savedAt: number
}

const LOGIN_COOKIE_NAMES = [
  'SESSDATA',
  'bili_jct',
  'DedeUserID',
  'DedeUserID__ckMd5',
  'sid',
]

export class SessionStore {
  private cached: StoredCredentials | null = null
  private loaded = false
  private readonly file: AtomicFile

  constructor(private readonly logger: Logger = silentLogger) {
    this.file = new AtomicFile(COOKIES_FILE, logger)
  }

  async load(): Promise<StoredCredentials | null> {
    if (this.loaded) return this.cached
    this.loaded = true
    const raw = await this.file.read()
    if (raw === null) return null
    try {
      const parsed = JSON.parse(raw) as StoredCredentials
      if (!parsed || typeof parsed !== 'object' || typeof parsed.cookies !== 'object') {
        throw new Error('凭据格式不正确')
      }
      this.cached = parsed
      return parsed
    } catch (error) {
      this.logger.error('读取登录凭据失败，将视为未登录', error)
      this.cached = null
      return null
    }
  }

  get cookies(): CookieJar | null {
    return this.cached?.cookies ?? null
  }

  get credentials(): StoredCredentials | null {
    return this.cached
  }

  get isLoggedIn(): boolean {
    return hasLoginCookies(this.cached?.cookies)
  }

  get hasDeviceId(): boolean {
    return (this.cached?.buvid3 ?? '') !== ''
  }

  get mid(): number | null {
    return getUserId(this.cached?.cookies)
  }

  async setCookies(cookies: CookieJar): Promise<void> {
    const previous = this.cached
    await this.persist({
      cookies,
      savedAt: Date.now(),
      ...(previous?.buvid3 === undefined ? {} : { buvid3: previous.buvid3 }),
      ...(previous?.buvid4 === undefined ? {} : { buvid4: previous.buvid4 }),
    })
  }

  async mergeCookies(extra: CookieJar): Promise<void> {
    const previous = this.cached
    await this.persist({
      cookies: mergeCookies(previous?.cookies, extra),
      savedAt: Date.now(),
      ...(previous?.buvid3 === undefined ? {} : { buvid3: previous.buvid3 }),
      ...(previous?.buvid4 === undefined ? {} : { buvid4: previous.buvid4 }),
    })
  }

  async setCookieHeader(header: string): Promise<void> {
    await this.setCookies(parseCookieHeader(header))
  }

  async setBuvid(buvid3: string, buvid4: string): Promise<void> {
    const previous = this.cached
    await this.persist({
      cookies: mergeCookies(previous?.cookies, { buvid3, buvid4 }),
      savedAt: previous?.savedAt ?? Date.now(),
      buvid3,
      buvid4,
    })
  }

  async clearLogin(): Promise<void> {
    const previous = this.cached
    if (previous === null) return
    const remaining: CookieJar = {}
    for (const [name, value] of Object.entries(previous.cookies)) {
      if (!LOGIN_COOKIE_NAMES.includes(name)) remaining[name] = value
    }
    await this.persist({
      cookies: remaining,
      savedAt: Date.now(),
      ...(previous.buvid3 === undefined ? {} : { buvid3: previous.buvid3 }),
      ...(previous.buvid4 === undefined ? {} : { buvid4: previous.buvid4 }),
    })
  }

  cookieHeader(): string {
    return serializeCookie(this.cookies)
  }

  private async persist(next: StoredCredentials): Promise<void> {
    this.cached = next
    await this.file.write(`${JSON.stringify(next)}\n`)
  }
}

/* ---------------------------------------------------------------------- WBI */

export class WbiStore {
  private value: WbiKeys | null = null
  private readonly file: AtomicFile

  constructor(private readonly logger: Logger = silentLogger) {
    this.file = new AtomicFile(WBI_FILE, logger)
  }

  async load(): Promise<void> {
    const raw = await this.file.read()
    if (raw === null) return
    try {
      const parsed = JSON.parse(raw) as WbiKeys
      if (typeof parsed.imgKey === 'string' && typeof parsed.subKey === 'string' &&
          typeof parsed.fetchedAt === 'number') {
        this.value = parsed
      }
    } catch (error) {
      this.logger.warn('WBI 缓存损坏，将重新获取', error)
    }
  }

  read = (): WbiKeys | null => this.value
  write = (keys: WbiKeys): void => {
    this.value = keys
    void this.file.write(`${JSON.stringify(keys)}\n`).catch((error: unknown) => {
      this.logger.warn('写入 WBI 缓存失败', error)
    })
  }
}

/** Ensure the data directory exists before first use. */
export async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
}
