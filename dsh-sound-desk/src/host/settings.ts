/**
 * Plugin settings.
 *
 * A small JSON document under `$DSH_HOME/sound-desk/settings.json`. It is read on
 * every use rather than cached so a hand edit is picked up without a restart —
 * except for the engine options, which are snapshotted when the engine launches
 * and only take effect after a restart (the UI says so).
 *
 * There is no "start with DSH" switch on purpose: the engine starts when the
 * workbench is first opened and at no other time. The old `autoStart` key is
 * ignored when read, so an existing file keeps loading.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { expandPath, pluginDir, settingsPath } from './paths'

export type LogLevel = 'off' | 'normal' | 'verbose'

export interface SoundDeskSettings {
  /** Empty means `$DSH_HOME/sound-desk`. */
  dataDir: string
  /** Load the CLAP fingerprint model (semantic search). Heavy: hundreds of MB. */
  loadModel: boolean
  /** Explicit ffmpeg binary; empty means auto-discover. */
  ffmpegPath: string
  /** Extra search root for the optional heavy dependencies. */
  referenceDir: string
  logLevel: LogLevel
}

export const DEFAULT_SETTINGS: SoundDeskSettings = {
  dataDir: '',
  loadModel: false,
  ffmpegPath: '',
  referenceDir: '',
  logLevel: 'normal',
}

function coerce(raw: unknown): SoundDeskSettings {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)
  const text = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback)
  const level = source.logLevel
  return {
    dataDir: text(source.dataDir, DEFAULT_SETTINGS.dataDir),
    loadModel: bool(source.loadModel, DEFAULT_SETTINGS.loadModel),
    ffmpegPath: text(source.ffmpegPath, DEFAULT_SETTINGS.ffmpegPath),
    referenceDir: text(source.referenceDir, DEFAULT_SETTINGS.referenceDir),
    logLevel: level === 'off' || level === 'verbose' || level === 'normal' ? level : DEFAULT_SETTINGS.logLevel,
  }
}

export class SettingsStore {
  private current: SoundDeskSettings | null = null

  get(): SoundDeskSettings {
    if (this.current !== null) return this.current
    try {
      const text = readFileSync(settingsPath(), 'utf8')
      this.current = coerce(JSON.parse(text))
    } catch {
      this.current = { ...DEFAULT_SETTINGS }
    }
    return this.current
  }

  update(patch: Partial<SoundDeskSettings>): SoundDeskSettings {
    const next = coerce({ ...this.get(), ...patch })
    const file = settingsPath()
    mkdirSync(dirname(file), { recursive: true })
    const temp = `${file}.tmp`
    writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    renameSync(temp, file)
    this.current = next
    return next
  }

  /** Where the engine keeps its catalogue when `dataDir` is unset. */
  effectiveDataDir(): string {
    const configured = this.get().dataDir
    return configured.trim() !== '' ? expandPath(configured) : pluginDir()
  }

  /** Search roots for optional heavy dependencies, in priority order. */
  referenceRoots(): string[] {
    const roots: string[] = []
    const configured = this.get().referenceDir
    if (configured.trim() !== '') roots.push(expandPath(configured))
    const fromEnv = process.env.SOUNDDESK_REFERENCE
    if (typeof fromEnv === 'string' && fromEnv.trim() !== '') roots.push(expandPath(fromEnv))
    return roots
  }
}
