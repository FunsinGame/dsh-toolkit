/**
 * 极简日志抽象。
 *
 * 扩展宿主里由 `OutputChannel` 实现，命令行 spike 与单测里用 console 实现。
 * 音频/API 这些模块只依赖这个接口，因此可以脱离 `vscode` 单独运行与测试。
 */

export type LogLevel = 'off' | 'info' | 'debug';

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

/** 单条日志里附带的 JSON 数据最多打印这么多个字符。 */
const MAX_DATA_CHARS = 800;

function format(message: string, data?: unknown): string {
  if (data === undefined) return message;
  let text: string;
  try {
    text = typeof data === 'string' ? data : JSON.stringify(data);
  } catch {
    text = String(data);
  }
  if (text === undefined) text = String(data);
  if (text.length > MAX_DATA_CHARS) {
    text = `${text.slice(0, MAX_DATA_CHARS)}…(共 ${text.length} 字符)`;
  }
  return `${message} ${text}`;
}

/** 什么都不做的日志，用于单测与「日志级别 off」。 */
export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** 打到 stdout/stderr 的日志，供命令行 spike 使用。 */
export function createConsoleLogger(level: LogLevel = 'info', prefix = 'music'): Logger {
  if (level === 'off') return silentLogger;
  const wantDebug = level === 'debug';
  return {
    debug: (message, data) => {
      if (wantDebug) console.log(`[${prefix}] ${format(message, data)}`);
    },
    info: (message, data) => console.log(`[${prefix}] ${format(message, data)}`),
    warn: (message, data) => console.warn(`[${prefix}] ${format(message, data)}`),
    error: (message, data) => console.error(`[${prefix}] ${format(message, data)}`),
  };
}

/** 收集日志到数组，便于单测断言。 */
export function createMemoryLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    debug: (m, d) => lines.push(`debug ${format(m, d)}`),
    info: (m, d) => lines.push(`info ${format(m, d)}`),
    warn: (m, d) => lines.push(`warn ${format(m, d)}`),
    error: (m, d) => lines.push(`error ${format(m, d)}`),
  };
}

/** 把一条日志同时送到多个目标（输出面板 + 自检用的日志文件）。 */
export function createTeeLogger(...loggers: Logger[]): Logger {
  return {
    debug: (m, d) => loggers.forEach((logger) => logger.debug(m, d)),
    info: (m, d) => loggers.forEach((logger) => logger.info(m, d)),
    warn: (m, d) => loggers.forEach((logger) => logger.warn(m, d)),
    error: (m, d) => loggers.forEach((logger) => logger.error(m, d)),
  };
}
