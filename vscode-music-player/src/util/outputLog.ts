/**
 * 把日志写到 VS Code 的输出面板。
 *
 * 单独成一个模块，是为了让 `util/log.ts` 保持零 `vscode` 依赖——命令行 spike 与
 * 单测直接复用那些模块，一旦 `log.ts` 里出现 `import 'vscode'` 就跑不起来了。
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type * as vscode from 'vscode';

import { silentLogger, type Logger, type LogLevel } from './log';

function format(data: unknown): string {
  if (data === undefined) return '';
  if (data instanceof Error) return ` ${data.stack ?? data.message}`;
  try {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return text === undefined ? '' : ` ${text.length > 800 ? `${text.slice(0, 800)}…` : text}`;
  } catch {
    return ` ${String(data)}`;
  }
}

function stamp(): string {
  return new Date().toISOString().slice(11, 23);
}

export function createOutputLogger(channel: vscode.OutputChannel, level: LogLevel): Logger {
  if (level === 'off') return silentLogger;
  const wantDebug = level === 'debug';
  return {
    debug: (message, data) => {
      if (wantDebug) channel.appendLine(`[${stamp()}] [debug] ${message}${format(data)}`);
    },
    info: (message, data) => channel.appendLine(`[${stamp()}] [info ] ${message}${format(data)}`),
    warn: (message, data) => channel.appendLine(`[${stamp()}] [warn ] ${message}${format(data)}`),
    error: (message, data) => channel.appendLine(`[${stamp()}] [error] ${message}${format(data)}`),
  };
}

/**
 * 同步写文件的日志。
 *
 * 只在自动化自检（`VMP_SELFTEST=1`）时启用：这样即使无人看着界面，也能把扩展
 * 宿主的日志取回来分析。正常情况下日志只进输出面板。
 */
export function createFileLogger(file: string, level: LogLevel = 'debug'): Logger {
  if (level === 'off') return silentLogger;
  const wantDebug = level === 'debug';
  let prepared = false;
  const write = (tag: string, message: string, data: unknown): void => {
    try {
      if (!prepared) {
        mkdirSync(dirname(file), { recursive: true });
        prepared = true;
      }
      appendFileSync(file, `[${stamp()}] [${tag}] ${message}${format(data)}\n`, 'utf8');
    } catch {
      // 日志写不进去不能影响功能。
    }
  };
  return {
    debug: (message, data) => {
      if (wantDebug) write('debug', message, data);
    },
    info: (message, data) => write('info ', message, data),
    warn: (message, data) => write('warn ', message, data),
    error: (message, data) => write('error', message, data),
  };
}
