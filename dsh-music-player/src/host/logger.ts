/**
 * dsh-music-player host logger.
 *
 * Keeps a small in-memory ring buffer so the web half can show diagnostics
 * without a filesystem round trip. Every line also reaches the host console
 * with a stable prefix, which is what shows up in the desktop log.
 */

export type LogLevel = 'off' | 'info' | 'debug'

export interface Logger {
  debug(message: string, data?: unknown): void
  info(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  error(message: string, data?: unknown): void
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

const MAX_LOG_LINES = 400
const MAX_DATA_CHARS = 900

/** Format one log call, keeping huge payloads bounded. */
function format(message: string, data?: unknown): string {
  if (data === undefined) return message
  let text: string
  try {
    text = typeof data === 'string' ? data : JSON.stringify(data)
  } catch {
    text = String(data)
  }
  if (text === undefined) text = String(data)
  if (text.length > MAX_DATA_CHARS) {
    text = `${text.slice(0, MAX_DATA_CHARS)}…(共 ${text.length} 字符)`
  }
  return `${message} ${text}`
}

export class MemoryLogger implements Logger {
  private readonly lines: string[] = []
  private level: LogLevel = 'info'

  constructor(private readonly prefix = 'music-player') {}

  setLevel(level: LogLevel): void {
    this.level = level
  }

  getLevel(): LogLevel {
    return this.level
  }

  private push(level: 'debug' | 'info' | 'warn' | 'error', text: string): void {
    const stamp = new Date().toISOString().slice(11, 19)
    this.lines.push(`${stamp} ${level.toUpperCase()} ${text}`)
    if (this.lines.length > MAX_LOG_LINES) this.lines.splice(0, this.lines.length - MAX_LOG_LINES)
  }

  debug(message: string, data?: unknown): void {
    if (this.level !== 'debug') return
    const text = format(message, data)
    this.push('debug', text)
    console.log(`[${this.prefix}] ${text}`)
  }

  info(message: string, data?: unknown): void {
    if (this.level === 'off') return
    const text = format(message, data)
    this.push('info', text)
    console.log(`[${this.prefix}] ${text}`)
  }

  warn(message: string, data?: unknown): void {
    if (this.level === 'off') return
    const text = format(message, data)
    this.push('warn', text)
    console.warn(`[${this.prefix}] ${text}`)
  }

  error(message: string, data?: unknown): void {
    if (this.level === 'off') return
    const text = format(message, data)
    this.push('error', text)
    console.error(`[${this.prefix}] ${text}`)
  }

  /** Recent lines, oldest first. */
  recent(limit = 200): string[] {
    return this.lines.slice(-Math.max(1, limit))
  }
}
