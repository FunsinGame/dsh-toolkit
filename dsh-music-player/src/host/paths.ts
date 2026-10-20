/** Filesystem locations owned by dsh-music-player. */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export function resolveDshHome(): string {
  const fromEnv = process.env.DSH_HOME?.trim()
  return fromEnv ? resolve(fromEnv) : join(homedir(), '.dsh')
}

export const DATA_DIR = join(resolveDshHome(), 'music-player')
export const CACHE_DIR = join(DATA_DIR, 'cache')
export const CACHE_WAV_DIR = join(CACHE_DIR, 'wav')
export const CACHE_RAW_DIR = join(CACHE_DIR, 'raw')
export const SETTINGS_FILE = join(DATA_DIR, 'settings.json')
export const COOKIES_FILE = join(DATA_DIR, 'cookies.json')
export const WBI_FILE = join(DATA_DIR, 'wbi.json')
