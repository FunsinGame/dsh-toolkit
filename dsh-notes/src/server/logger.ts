/** Minimal leveled logger with optional size-rotated file output. */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

export type LogLevel = 'off' | 'error' | 'warn' | 'info' | 'debug'

const ORDER: Record<LogLevel, number> = { off: 0, error: 1, warn: 2, info: 3, debug: 4 }

export interface LoggerOptions {
  level?: LogLevel
  file?: string
  maxBytes?: number
  keep?: number
}

export class Logger {
  private readonly level: LogLevel
  private readonly file: string
  private readonly maxBytes: number
  private readonly keep: number

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info'
    this.file = options.file ?? ''
    this.maxBytes = options.maxBytes ?? 10 * 1024 * 1024
    this.keep = options.keep ?? 5
  }

  enabled(level: Exclude<LogLevel, 'off'>): boolean {
    return ORDER[this.level] >= ORDER[level]
  }

  error(message: string, detail?: unknown): void {
    this.write('error', message, detail)
  }

  warn(message: string, detail?: unknown): void {
    this.write('warn', message, detail)
  }

  info(message: string, detail?: unknown): void {
    this.write('info', message, detail)
  }

  debug(message: string, detail?: unknown): void {
    this.write('debug', message, detail)
  }

  private write(level: Exclude<LogLevel, 'off'>, message: string, detail?: unknown): void {
    if (!this.enabled(level)) return
    const time = new Date().toISOString()
    const suffix = detail === undefined ? '' : ` ${formatDetail(detail)}`
    const line = `${time} ${level.toUpperCase().padEnd(5)} ${message}${suffix}\n`
    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout
    stream.write(line)
    if (this.file !== '') {
      try {
        this.writeFile(line)
      } catch (error) {
        process.stderr.write(`${time} ERROR logger file write failed: ${(error as Error).message}\n`)
      }
    }
  }

  private writeFile(line: string): void {
    mkdirSync(dirname(this.file), { recursive: true })
    if (existsSync(this.file) && statSync(this.file).size + Buffer.byteLength(line) > this.maxBytes) {
      this.rotate()
    }
    appendFileSync(this.file, line, 'utf8')
  }

  private rotate(): void {
    for (let index = this.keep - 1; index >= 1; index -= 1) {
      const from = `${this.file}.${index}`
      const to = `${this.file}.${index + 1}`
      if (existsSync(from)) {
        try {
          renameSync(from, to)
        } catch {
          /* Ignore a file another process holds. */
        }
      }
    }
    try {
      renameSync(this.file, `${this.file}.1`)
    } catch {
      /* Ignore. */
    }
  }
}

function formatDetail(detail: unknown): string {
  if (detail instanceof Error) return `${detail.name}: ${detail.message}`
  if (typeof detail === 'string') return detail
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}

export function createLogger(level: LogLevel = 'info', file = ''): Logger {
  return new Logger({ level, file })
}
