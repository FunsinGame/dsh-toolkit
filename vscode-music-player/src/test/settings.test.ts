import assert from 'node:assert/strict';
import { test } from 'node:test';

import { coerceSetting, isSettingsKey, readSettings, SETTINGS_KEYS } from '../state/settings';

test('只有白名单里的键能被写', () => {
  assert.equal(isSettingsKey('volume'), true);
  assert.equal(isSettingsKey('cacheMaxMB'), true);
  assert.equal(isSettingsKey('__proto__'), false);
  assert.equal(isSettingsKey('constructor'), false);
  assert.equal(isSettingsKey('toString'), false);
  assert.equal(isSettingsKey('audioQuality2'), false);
  // 设置面板里出现的每个键都必须在白名单里
  for (const key of [
    'audioQuality',
    'defaultPlayMode',
    'volume',
    'playbackRate',
    'cacheEnabled',
    'cacheMaxMB',
    'requestIntervalMs',
    'logLevel',
    'showStatusBar',
  ]) {
    assert.equal(isSettingsKey(key), true, `${key} 必须在白名单里`);
  }
});

test('coerceSetting：播放速度只接受预设档位', () => {
  assert.deepEqual(coerceSetting('playbackRate', 1.5), {
    configKey: 'playbackRate',
    value: 1.5,
  });
  assert.deepEqual(coerceSetting('playbackRate', 1), { configKey: 'playbackRate', value: 1 });
  assert.equal(coerceSetting('playbackRate', 0.37), null, '怪值要被拒绝，而不是夹到某一档');
  assert.equal(coerceSetting('playbackRate', 0), null);
  assert.equal(coerceSetting('playbackRate', '2'), null);
});

test('coerceSetting：类型不对一律拒绝', () => {
  assert.equal(coerceSetting('volume', '0.5'), null, '字符串不是数字');
  assert.equal(coerceSetting('volume', Number.NaN), null);
  assert.equal(coerceSetting('cacheEnabled', 'yes'), null);
  assert.equal(coerceSetting('logLevel', 3), null);
  assert.equal(coerceSetting('defaultPlayMode', true), null);
});

test('coerceSetting：数值会被夹到范围内', () => {
  assert.deepEqual(coerceSetting('volume', 0.5), { configKey: 'volume', value: 0.5 });
  assert.deepEqual(coerceSetting('volume', 5), { configKey: 'volume', value: 1 }, '上限 1');
  assert.deepEqual(coerceSetting('volume', -2), { configKey: 'volume', value: 0 }, '下限 0');
  assert.deepEqual(coerceSetting('cacheMaxMB', 10), { configKey: 'cache.maxMB', value: 50 }, '下限 50MB');
});

test('coerceSetting：枚举值只接受已知项', () => {
  assert.deepEqual(coerceSetting('audioQuality', 30280), {
    configKey: 'audioQuality',
    value: 30280,
  });
  assert.equal(coerceSetting('audioQuality', 12345), null, '不存在的音质档位');
  assert.deepEqual(coerceSetting('defaultPlayMode', 'shuffle'), {
    configKey: 'defaultPlayMode',
    value: 'shuffle',
  });
  assert.equal(coerceSetting('defaultPlayMode', 'random'), null);
  // 嵌套键映射到 VS Code 的真实配置键
  assert.deepEqual(coerceSetting('cacheEnabled', false), {
    configKey: 'cache.enabled',
    value: false,
  });
  assert.deepEqual(coerceSetting('logLevel', 'debug'), { configKey: 'logLevel', value: 'debug' });
});

test('readSettings：读全字段并给默认值', () => {
  const values: Record<string, unknown> = {
    audioQuality: 30232,
    defaultPlayMode: 'shuffle',
    volume: 0.3,
    playbackRate: 1.5,
    'cache.enabled': false,
    'cache.maxMB': 128,
    requestIntervalMs: 500,
    logLevel: 'debug',
    showStatusBar: false,
  };
  const settings = readSettings({
    get: <T,>(key: string, fallback: T): T => (values[key] === undefined ? fallback : (values[key] as T)),
  });
  assert.deepEqual(settings, {
    audioQuality: 30232,
    defaultPlayMode: 'shuffle',
    volume: 0.3,
    playbackRate: 1.5,
    cacheEnabled: false,
    cacheMaxMB: 128,
    requestIntervalMs: 500,
    logLevel: 'debug',
    showStatusBar: false,
  });
});

test('readSettings：配置里是脏值时退回默认，不把界面带崩', () => {
  const settings = readSettings({
    get: <T,>(_key: string, fallback: T): T => fallback,
  });
  assert.deepEqual(settings, {
    audioQuality: 30280,
    defaultPlayMode: 'sequential',
    volume: 0.8,
    playbackRate: 1,
    cacheEnabled: true,
    cacheMaxMB: 500,
    requestIntervalMs: 350,
    logLevel: 'info',
    showStatusBar: true,
  });

  const dirty = readSettings({
    get: <T,>(key: string, _fallback: T): T =>
      (key === 'defaultPlayMode' ? 'nonsense' : key === 'logLevel' ? 'verbose' : 'x') as unknown as T,
  });
  assert.equal(dirty.defaultPlayMode, 'sequential');
  assert.equal(dirty.logLevel, 'info');
});

test('白名单键数量与规格表一致（防止加了键忘了校验）', () => {
  assert.deepEqual([...SETTINGS_KEYS].sort(), Object.keys(coerceSpecKeys()).sort());
});

function coerceSpecKeys(): Record<string, true> {
  return {
    audioQuality: true,
    defaultPlayMode: true,
    volume: true,
    playbackRate: true,
    cacheEnabled: true,
    cacheMaxMB: true,
    requestIntervalMs: true,
    logLevel: true,
    showStatusBar: true,
  };
}
