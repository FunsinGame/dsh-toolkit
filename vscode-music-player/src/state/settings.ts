/**
 * 设置项的读写与校验。
 *
 * webview 只能通过消息请宿主改配置，而**不能**直接写 `vscode.workspace`。这里用一份
 * 白名单描述「哪些键可以改、改成什么类型、范围多少」，把校验做成纯函数：
 * 未经校验的键一律拒绝，避免界面（或将来某段注入代码）拿到任意写配置的能力。
 */

import type { PlayMode, SettingsState } from '../protocol';

export type { SettingsState };

/** 界面用到的键 → VS Code 配置键 + 类型/范围。 */
export const SETTINGS_SPEC = {
  audioQuality: { configKey: 'audioQuality', type: 'number', values: [30216, 30232, 30280] },
  defaultPlayMode: {
    configKey: 'defaultPlayMode',
    type: 'string',
    values: ['sequential', 'repeat-all', 'repeat-one', 'shuffle'],
  },
  volume: { configKey: 'volume', type: 'number', min: 0, max: 1 },
  /** 播放速度：只允许这几档，避免出现 0.37× 之类的怪值。 */
  playbackRate: {
    configKey: 'playbackRate',
    type: 'number',
    values: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
  },
  cacheEnabled: { configKey: 'cache.enabled', type: 'boolean' },
  cacheMaxMB: { configKey: 'cache.maxMB', type: 'number', min: 50, max: 100_000 },
  requestIntervalMs: {
    configKey: 'requestIntervalMs',
    type: 'number',
    min: 0,
    max: 10_000,
  },
  logLevel: { configKey: 'logLevel', type: 'string', values: ['off', 'info', 'debug'] },
  showStatusBar: { configKey: 'showStatusBar', type: 'boolean' },
} as const;

export type SettingsKey = keyof typeof SETTINGS_SPEC;

export const SETTINGS_KEYS = Object.keys(SETTINGS_SPEC) as SettingsKey[];

export function isSettingsKey(value: string): value is SettingsKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS_SPEC, value);
}

/** 按类型与范围把界面传来的值收敛成合法值；不合法返回 null（调用方拒绝）。 */
export function coerceSetting(
  key: SettingsKey,
  raw: unknown,
): { configKey: string; value: number | string | boolean } | null {
  const spec = SETTINGS_SPEC[key];
  if (spec.type === 'boolean') {
    if (typeof raw !== 'boolean') return null;
    return { configKey: spec.configKey, value: raw };
  }
  if (spec.type === 'string') {
    if (typeof raw !== 'string') return null;
    const allowed: readonly string[] = 'values' in spec ? spec.values : [];
    if (allowed.length > 0 && !allowed.includes(raw)) return null;
    return { configKey: spec.configKey, value: raw };
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const allowedNumbers: readonly number[] = 'values' in spec ? spec.values : [];
  if (allowedNumbers.length > 0) {
    if (!allowedNumbers.includes(raw)) return null;
    return { configKey: spec.configKey, value: raw };
  }
  const min = 'min' in spec ? spec.min : Number.NEGATIVE_INFINITY;
  const max = 'max' in spec ? spec.max : Number.POSITIVE_INFINITY;
  const clamped = Math.min(Math.max(raw, min), max);
  return { configKey: spec.configKey, value: clamped };
}

export interface ConfigReader {
  get<T>(key: string, defaultValue: T): T;
}

/** 从 VS Code 配置里读出界面需要的全部设置（带默认值兜底）。 */
export function readSettings(config: ConfigReader): SettingsState {
  const mode = config.get<string>('defaultPlayMode', 'sequential');
  const level = config.get<string>('logLevel', 'info');
  return {
    audioQuality: config.get<number>('audioQuality', 30280),
    defaultPlayMode: (['sequential', 'repeat-all', 'repeat-one', 'shuffle'] as const).includes(
      mode as PlayMode,
    )
      ? (mode as PlayMode)
      : 'sequential',
    volume: config.get<number>('volume', 0.8),
    playbackRate: config.get<number>('playbackRate', 1),
    cacheEnabled: config.get<boolean>('cache.enabled', true),
    cacheMaxMB: config.get<number>('cache.maxMB', 500),
    requestIntervalMs: config.get<number>('requestIntervalMs', 350),
    logLevel: level === 'off' || level === 'debug' ? level : 'info',
    showStatusBar: config.get<boolean>('showStatusBar', true),
  };
}
