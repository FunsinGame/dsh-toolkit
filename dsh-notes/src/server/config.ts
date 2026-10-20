/** Server configuration shared by the HTTP layer and the CLI. */

import { resolve } from 'node:path'
import type { LogLevel } from './logger.ts'
import { defaultDataDir, expandPath, normalizeBasePath } from './platform.ts'

export interface ServerConfig {
  dataDir: string
  host: string
  port: number
  socket: string
  basePath: string
  publicUrl: string
  tlsCert: string
  tlsKey: string
  behindProxy: boolean
  trustedProxies: string[]
  insecureHttp: boolean
  maxUploadBytes: number
  sessionDays: number
  sessionIdleDays: number
  trashDays: number
  versionsPerNote: number
  logLevel: LogLevel
  logFile: string
  trustProxy: boolean
  /** MCP request body ceiling in bytes. */
  mcpBodyBytes: number
}

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  dataDir: defaultDataDir(),
  host: '127.0.0.1',
  port: 8787,
  socket: '',
  basePath: '',
  publicUrl: '',
  tlsCert: '',
  tlsKey: '',
  behindProxy: false,
  trustedProxies: ['127.0.0.1', '::1'],
  insecureHttp: false,
  maxUploadBytes: 50 * 1024 * 1024,
  sessionDays: 30,
  sessionIdleDays: 7,
  trashDays: 30,
  versionsPerNote: 50,
  logLevel: 'info',
  logFile: '',
  trustProxy: false,
  mcpBodyBytes: 4 * 1024 * 1024,
}

export function normalizeServerConfig(input: Partial<ServerConfig>): ServerConfig {
  const dataDir = input.dataDir !== undefined && input.dataDir !== ''
    ? expandPath(input.dataDir)
    : DEFAULT_SERVER_CONFIG.dataDir
  const basePath = normalizeBasePath(input.basePath ?? DEFAULT_SERVER_CONFIG.basePath)
  const publicUrl = (input.publicUrl ?? '').trim().replace(/\/+$/, '')
  const maxUploadBytes = Math.max(1024, Number(input.maxUploadBytes ?? DEFAULT_SERVER_CONFIG.maxUploadBytes))
  return {
    ...DEFAULT_SERVER_CONFIG,
    ...input,
    dataDir: resolve(dataDir),
    basePath,
    publicUrl,
    port: Number(input.port ?? DEFAULT_SERVER_CONFIG.port),
    maxUploadBytes,
    sessionDays: clampInt(input.sessionDays, 1, 365, DEFAULT_SERVER_CONFIG.sessionDays),
    sessionIdleDays: clampInt(input.sessionIdleDays, 1, 365, DEFAULT_SERVER_CONFIG.sessionIdleDays),
    trashDays: clampInt(input.trashDays, 1, 3650, DEFAULT_SERVER_CONFIG.trashDays),
    versionsPerNote: clampInt(input.versionsPerNote, 0, 500, DEFAULT_SERVER_CONFIG.versionsPerNote),
    trustedProxies: input.trustedProxies ?? DEFAULT_SERVER_CONFIG.trustedProxies,
    logLevel: input.logLevel ?? DEFAULT_SERVER_CONFIG.logLevel,
    mcpBodyBytes: clampInt(input.mcpBodyBytes, 1024, 64 * 1024 * 1024, DEFAULT_SERVER_CONFIG.mcpBodyBytes),
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(number)))
}

/** Validate the listener policy: public plaintext listeners require an explicit choice. */
export function assertListenerPolicy(config: ServerConfig): void {
  const hasTls = config.tlsCert !== '' && config.tlsKey !== ''
  const loopback = config.host === '127.0.0.1' || config.host === '::1' || config.host === 'localhost'
  if (config.socket !== '') {
    if (process.platform === 'win32') {
      throw new Error('--socket is supported on POSIX systems only; use a loopback TCP port on Windows')
    }
    return
  }
  if (!loopback && !hasTls && !config.behindProxy && !config.insecureHttp) {
    throw new Error(
      'refusing to listen on a non-loopback address without TLS. '
      + 'Use --tls-cert/--tls-key, --behind-proxy (with a trusted proxy), or --insecure-http for a controlled LAN test.',
    )
  }
}
