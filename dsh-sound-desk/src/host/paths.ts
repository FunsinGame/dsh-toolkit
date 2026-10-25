/**
 * Stable locations for this plugin.
 *
 * Settings live beside the engine's data directory under DSH's home, mirroring
 * the sibling plugins' `$DSH_HOME/<name>` convention. The data directory itself is
 * configurable, because a sound library's index and waveform cache can grow to
 * gigabytes and belongs wherever the user keeps that kind of data.
 */

import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PLUGIN_NAME = 'dsh-sound-desk'

/**
 * Mount point on DSH's own Web server.
 *
 * Kept here rather than beside the engine so the plugin entry can register the
 * route without importing the engine half.
 */
export const ROUTE_PREFIX = '/dsh-sound-desk'

/* Replaced at build time by scripts/build.mjs. */
export const VERSION: string = typeof __SOUND_DESK_VERSION__ === 'string' ? __SOUND_DESK_VERSION__ : '0.1.0'

/** Absolute path to the installed plugin directory (the bundle lives in `lib/`). */
export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function dshHome(): string {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return resolve(fromEnv.trim())
  return join(homedir(), '.dsh')
}

/** `<DSH_HOME>/sound-desk` — settings, logs, and the default engine data dir. */
export function pluginDir(): string {
  return join(dshHome(), 'sound-desk')
}

export function settingsPath(): string {
  return join(pluginDir(), 'settings.json')
}

/** Expand a leading `~` and resolve relative paths against the DSH home. */
export function expandPath(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  if (trimmed === '~') return homedir()
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) return join(homedir(), trimmed.slice(2))
  return isAbsolute(trimmed) ? resolve(trimmed) : resolve(pluginDir(), trimmed)
}
