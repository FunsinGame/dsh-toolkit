/** DSH host settings, instance directories and token resolution. */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export interface PluginConfig {
  serverUrl?: string
  token?: string
  tokenEnv?: string
  autoSyncSeconds?: number
  quickSync?: boolean
}

export interface StoredSettings {
  serverUrl: string
  token: string
  autoSyncSeconds: number
  quickSync: boolean
}

export interface EffectiveSettings extends StoredSettings {
  tokenSource: 'settings' | 'env' | 'none'
  dataDir: string
}

export interface PublicSettings {
  serverUrl: string
  hasToken: boolean
  tokenSource: 'settings' | 'env' | 'none'
  autoSyncSeconds: number
  quickSync: boolean
  dataDir: string
}

export interface SettingsPatch {
  serverUrl?: string
  token?: string
  autoSyncSeconds?: number
  quickSync?: boolean
}

const DEFAULT_SETTINGS: StoredSettings = {
  serverUrl: '',
  token: '',
  autoSyncSeconds: 60,
  quickSync: true,
}

export function dshHome(): string {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return resolve(fromEnv.trim())
  return join(homedir(), '.dsh')
}

export function hostRoot(): string {
  return join(dshHome(), 'notes')
}

export function settingsPath(): string {
  return join(hostRoot(), 'settings.json')
}

export function normalizeServerUrl(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  let withScheme = trimmed
  if (!/^[a-z][a-z0-9+.-]*:\/\//iu.test(withScheme)) withScheme = `http://${withScheme}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error('服务器地址不是有效的 URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('服务器地址只支持 http/https')
  url.hash = ''
  url.search = ''
  return url.href.replace(/\/+$/u, '')
}

export function instanceKey(serverUrl: string): string {
  if (serverUrl === '') return 'unconfigured'
  return createHash('sha256').update(serverUrl).digest('hex').slice(0, 16)
}

export function instanceDir(serverUrl: string): string {
  return join(hostRoot(), 'instances', instanceKey(serverUrl))
}

function coerce(raw: unknown): StoredSettings {
  const source = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  let serverUrl = ''
  try {
    serverUrl = normalizeServerUrl(typeof source.serverUrl === 'string' ? source.serverUrl : '')
  } catch {
    serverUrl = ''
  }
  return {
    serverUrl,
    token: typeof source.token === 'string' ? source.token : '',
    autoSyncSeconds: normalizeSeconds(source.autoSyncSeconds),
    quickSync: source.quickSync === undefined ? true : source.quickSync === true,
  }
}

function normalizeSeconds(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return 60
  return Math.min(3600, Math.max(10, Math.trunc(number)))
}

export class SettingsStore {
  private current: StoredSettings | null = null

  constructor(private readonly plugin: PluginConfig = {}) {}

  load(): StoredSettings {
    if (this.current !== null) return this.current
    try {
      const text = readFileSync(settingsPath(), 'utf8').replace(/^\uFEFF/u, '')
      this.current = coerce(JSON.parse(text))
    } catch {
      this.current = { ...DEFAULT_SETTINGS }
    }
    return this.current
  }

  effective(): EffectiveSettings {
    const stored = this.load()
    const envUrl = normalizeServerUrlSafe(process.env.DSH_NOTES_SERVER_URL ?? '')
    const pluginUrl = normalizeServerUrlSafe(this.plugin.serverUrl ?? '')
    const serverUrl = stored.serverUrl !== '' ? stored.serverUrl : pluginUrl !== '' ? pluginUrl : envUrl
    const envToken = typeof process.env.DSH_NOTES_TOKEN === 'string' ? process.env.DSH_NOTES_TOKEN.trim() : ''
    const tokenEnvValue = typeof this.plugin.tokenEnv === 'string' && this.plugin.tokenEnv !== ''
      ? (process.env[this.plugin.tokenEnv] ?? '').trim()
      : ''
    const pluginToken = typeof this.plugin.token === 'string' ? this.plugin.token.trim() : ''
    const token = envToken !== '' ? envToken : tokenEnvValue !== '' ? tokenEnvValue : stored.token !== '' ? stored.token : pluginToken
    const tokenSource: EffectiveSettings['tokenSource'] = envToken !== '' || tokenEnvValue !== ''
      ? 'env'
      : stored.token !== '' || pluginToken !== ''
        ? 'settings'
        : 'none'
    const autoSyncSeconds = stored.autoSyncSeconds !== DEFAULT_SETTINGS.autoSyncSeconds
      ? stored.autoSyncSeconds
      : normalizeSeconds(this.plugin.autoSyncSeconds ?? stored.autoSyncSeconds)
    const quickSync = this.plugin.quickSync === undefined ? stored.quickSync : this.plugin.quickSync === true
    return {
      serverUrl,
      token,
      tokenSource,
      autoSyncSeconds,
      quickSync,
      dataDir: instanceDir(serverUrl),
    }
  }

  public(): PublicSettings {
    const effective = this.effective()
    return {
      serverUrl: effective.serverUrl,
      hasToken: effective.token !== '',
      tokenSource: effective.tokenSource,
      autoSyncSeconds: effective.autoSyncSeconds,
      quickSync: effective.quickSync,
      dataDir: effective.dataDir,
    }
  }

  save(patch: SettingsPatch): PublicSettings {
    const current = this.load()
    const next: StoredSettings = {
      serverUrl: patch.serverUrl === undefined ? current.serverUrl : normalizeServerUrl(patch.serverUrl),
      token: patch.token === undefined || patch.token === '' ? current.token : patch.token.trim(),
      autoSyncSeconds: patch.autoSyncSeconds === undefined ? current.autoSyncSeconds : normalizeSeconds(patch.autoSyncSeconds),
      quickSync: patch.quickSync === undefined ? current.quickSync : patch.quickSync === true,
    }
    mkdirSync(hostRoot(), { recursive: true, mode: 0o700 })
    const file = settingsPath()
    const temp = `${file}.${process.pid}.tmp`
    writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
    renameSync(temp, file)
    if (process.platform !== 'win32') {
      try { chmodSync(file, 0o600) } catch { /* Best effort. */ }
    }
    this.current = next
    return this.public()
  }

  hasStoredToken(): boolean {
    return this.load().token !== ''
  }
}

function normalizeServerUrlSafe(value: string): string {
  try {
    return normalizeServerUrl(value)
  } catch {
    return ''
  }
}

export function ensureHostDirs(serverUrl: string): string {
  const dir = instanceDir(serverUrl)
  mkdirSync(join(dir, 'tmp'), { recursive: true, mode: 0o700 })
  return dir
}

export function resolveInstancePath(serverUrl: string, file: string): string {
  return join(ensureHostDirs(serverUrl), file)
}

export function dirnameOf(path: string): string {
  return dirname(path)
}
