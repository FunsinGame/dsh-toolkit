/**
 * Plugin log buffer.
 *
 * The reference extension exposes engine output through an Output channel; DSH has
 * no per-plugin channel for a local plugin, so the last lines are kept in memory
 * and shown in the workbench's settings drawer. The engine's own chatter is far too
 * verbose to print to the terminal, and a user debugging "why is semantic search
 * off" needs to see the reason without opening devtools.
 */

export interface LogLine {
  at: number
  level: 'info' | 'warn' | 'error'
  text: string
}

const LIMIT = 300

export class Logger {
  private readonly lines: LogLine[] = []

  constructor(private readonly sink: (line: LogLine) => void = () => {}) {}

  info(text: string): void {
    this.push('info', text)
  }

  warn(text: string): void {
    this.push('warn', text)
  }

  error(text: string): void {
    this.push('error', text)
  }

  /** Most recent lines first. */
  recent(limit = 200): LogLine[] {
    return this.lines.slice(-Math.max(1, limit)).reverse()
  }

  clear(): void {
    this.lines.length = 0
  }

  private push(level: LogLine['level'], text: string): void {
    const line: LogLine = { at: Date.now(), level, text }
    this.lines.push(line)
    if (this.lines.length > LIMIT) this.lines.splice(0, this.lines.length - LIMIT)
    this.sink(line)
  }
}

/** Whether a configured log level lets `line` through to a consumer. */
export function levelVisible(level: 'off' | 'normal' | 'verbose', line: LogLine['level']): boolean {
  if (level === 'off') return false
  if (level === 'verbose') return true
  return line !== 'info'
}
