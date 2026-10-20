/**
 * Engine lifecycle.
 *
 * The SoundDesk engine runs **in-process**, exactly as it does inside the VS Code
 * extension: no child process, no stdout scraping to discover a port, and no
 * orphan on reload. It still listens on loopback over HTTP because the browser
 * needs real URLs for `<audio>`, waveform fetches and Range seeking; the plugin's
 * DSH route proxies that surface under one same-origin prefix.
 *
 * The two heavy optional capabilities are resolved before launch and snapshotted,
 * because they change the shape of `createApp`:
 *   - the CLAP fingerprint model, which needs `@huggingface/transformers`;
 *   - ffmpeg, without which non-WAV files cannot be decoded for peaks/playback.
 */

import { createRequire } from 'node:module'
import { stat } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'

import { createApp, startServer, rowToAsset } from '@sounddesk/engine'

import { PLUGIN_ROOT, pluginDir } from './paths'
import type { SettingsStore, SoundDeskSettings } from './settings'
import type { Logger } from './log'

export type EngineState = 'idle' | 'starting' | 'ready' | 'error'

export interface EngineInfo {
  port: number
  token: string
  url: string
}

export interface EngineHandle {
  app: any
  server: { port: number; token: string; url: string; close: () => Promise<void> }
}

const require = createRequire(import.meta.url)

/** Directories searched for the optional heavy packages, in priority order. */
function dependencyRoots(store: SettingsStore): string[] {
  return [
    ...store.referenceRoots(),
    PLUGIN_ROOT,
    join(PLUGIN_ROOT, '..', 'sound-desk'),
    join(PLUGIN_ROOT, '..', 'sound-desk', 'packages', 'engine'),
    pluginDir(),
  ]
}

/** Resolve a package to its directory by asking Node from each candidate root. */
function packageDir(specifier: string, roots: readonly string[]): string | null {
  for (const root of roots) {
    try {
      return dirname(createRequire(join(root, 'package.json')).resolve(specifier))
    } catch {
      /* not installed under this root */
    }
  }
  return null
}

/**
 * Publish `@huggingface/transformers` where the bundled engine shim can read it.
 *
 * The engine imports the package dynamically and this build keeps that import
 * resolvable but empty, so the plugin — not the package — decides which copy to
 * use and whether to pay for it at all.
 */
export async function preloadTransformers(
  store: SettingsStore,
  log: Logger,
): Promise<{ ok: true; from: string } | { ok: false; error: string }> {
  const roots = dependencyRoots(store)
  const candidates: string[] = []
  for (const root of roots) {
    const dir = packageDirFrom(root, '@huggingface/transformers')
    if (dir !== null && !candidates.includes(dir)) candidates.push(dir)
  }
  if (candidates.length === 0) {
    return {
      ok: false,
      error:
        '未找到 @huggingface/transformers。请安装该依赖，或在插件设置里把「参考目录」指向 sound-desk 检出目录。',
    }
  }

  for (const target of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')) as {
        main?: string
        module?: string
      }
      const main = pkg.module ?? pkg.main ?? 'index.js'
      const url = pathToFileURL(resolve(target, main)).href
      const mod = (await import(url)) as Record<string, unknown>
      const lib = (mod.AutoTokenizer !== undefined ? mod : (mod.default as Record<string, unknown>)) ?? mod
      ;(globalThis as Record<string, unknown>).__DSH_SOUND_DESK_TRANSFORMERS__ = lib
      log.info(`transformers loaded from ${target}`)
      return { ok: true, from: target }
    } catch (error) {
      log.warn(`transformers at ${target} failed to load: ${errorMessage(error)}`)
    }
  }
  return { ok: false, error: '找到了 @huggingface/transformers，但加载失败；详见插件日志。' }
}

function packageDirFrom(root: string, specifier: string): string | null {
  try {
    return dirname(createRequire(join(root, 'package.json')).resolve(specifier))
  } catch {
    return null
  }
}

/** Set `SOUNDDESK_FFMPEG` when the plugin can find a binary the engine would miss. */
export function resolveFfmpeg(settings: SoundDeskSettings, store: SettingsStore, log: Logger): string | null {
  const explicit = settings.ffmpegPath.trim()
  if (explicit !== '') {
    const expanded = resolve(explicit)
    if (existsSync(expanded)) return expanded
    log.warn(`configured ffmpeg path does not exist: ${expanded}`)
  }
  if (process.env.SOUNDDESK_FFMPEG && existsSync(process.env.SOUNDDESK_FFMPEG)) return process.env.SOUNDDESK_FFMPEG

  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const roots = dependencyRoots(store)
  const candidates: string[] = []
  for (const root of roots) {
    const dir = packageDirFrom(root, 'ffmpeg-static')
    if (dir !== null) candidates.push(join(dir, exe))
  }
  candidates.push(join(pluginDir(), 'bin', exe))
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

export class Engine {
  private handle: EngineHandle | null = null
  private starting: Promise<EngineHandle> | null = null
  private state: EngineState = 'idle'
  private error: string | null = null
  private embedderError: string | null = null
  /** Settings snapshot the running engine was launched with. */
  private launchedWith: SoundDeskSettings | null = null

  constructor(
    private readonly store: SettingsStore,
    private readonly log: Logger,
  ) {}

  get current(): EngineHandle | null {
    return this.handle
  }

  get engineState(): EngineState {
    return this.state
  }

  get lastError(): string | null {
    return this.error
  }

  get modelError(): string | null {
    return this.embedderError
  }

  /** True when a setting that only affects startup changed since the launch. */
  restartRequired(): boolean {
    if (this.launchedWith === null) return false
    const current = this.store.get()
    return (
      this.launchedWith.dataDir !== current.dataDir ||
      this.launchedWith.loadModel !== current.loadModel ||
      this.launchedWith.ffmpegPath !== current.ffmpegPath ||
      this.launchedWith.referenceDir !== current.referenceDir
    )
  }

  async ensure(): Promise<EngineHandle> {
    if (this.handle !== null) return this.handle
    if (this.starting !== null) return this.starting
    this.starting = this.launch()
    try {
      return await this.starting
    } finally {
      this.starting = null
    }
  }

  private async launch(): Promise<EngineHandle> {
    const settings = this.store.get()
    const dataDir = this.store.effectiveDataDir()
    this.state = 'starting'
    this.error = null
    this.embedderError = null
    this.log.info(`starting engine (data dir: ${dataDir})`)

    try {
      // Optional capabilities first: both change what `createApp` can promise.
      let loadModel = settings.loadModel
      if (loadModel) {
        const preloaded = await preloadTransformers(this.store, this.log)
        if (preloaded.ok) {
          this.log.info(`fingerprint model enabled (${preloaded.from})`)
        } else {
          loadModel = false
          this.embedderError = preloaded.error
          this.log.warn(`semantic search disabled: ${preloaded.error}`)
        }
      }
      const ffmpeg = resolveFfmpeg(settings, this.store, this.log)
      if (ffmpeg !== null && !process.env.SOUNDDESK_FFMPEG) {
        process.env.SOUNDDESK_FFMPEG = ffmpeg
        this.log.info(`ffmpeg: ${ffmpeg}`)
      }

      const app = (await createApp({ dataDir, loadModel, log: (message: string) => this.log.info(message) })) as any

      const server = await startServer({
        catalog: app.catalog,
        indexer: app.indexer,
        searchService: app.searchService,
        vectorIndex: app.vectorIndex,
        ucs: app.ucs,
        webRoot: null,
        reclassifyLookup: (term: string) => app.ucs.lookup(term),
        // Wired here rather than through the engine's own HTTP host so a manual
        // re-classification reflects the file as it is on disk right now.
        reclassify: async (assetPath: string) => this.reclassify(app, assetPath),
        reindexAsset: async (assetId: number) => this.reindexAsset(app, assetId),
        log: (message: string) => this.log.info(message),
      })

      this.handle = { app, server }
      this.state = 'ready'
      this.launchedWith = settings
      this.embedderError = app.embedderError ?? this.embedderError
      this.log.info(`engine ready at ${server.url}`)
      return this.handle
    } catch (error) {
      this.state = 'error'
      this.error = engineHint(errorMessage(error))
      this.log.error(`engine failed to start: ${this.error}`)
      throw error
    }
  }

  private async reclassify(app: any, assetPath: string): Promise<unknown> {
    const assetId = app.catalog.getAssetByPath(assetPath)
    const row = assetId === null ? null : app.catalog.getAssetRow(assetId)
    if (row === null) return null
    const asset = rowToAsset(row)
    const result = await app.classifier.classify({
      filename: asset.filename,
      embedded: asset.embedded,
      dsp: asset.dsp,
      durationMs: asset.durationMs,
    })
    return {
      catId: result.catId,
      confidence: result.confidence,
      source: result.source,
      evidence: result.evidence,
      alternatives: result.alternatives,
    }
  }

  /**
   * Re-read one asset after its file changed on disk.
   *
   * `indexMetadata` is the engine's own metadata pass, so this keeps the catalogue
   * consistent with what write-back actually wrote instead of leaving a stale row.
   */
  private async reindexAsset(app: any, assetId: number): Promise<void> {
    const row = app.catalog.getAssetRow(assetId)
    if (row === null) return
    const assetPath = String(row.path ?? '')
    if (assetPath === '') return
    const libraryId = row.libraryId === null || row.libraryId === undefined ? null : Number(row.libraryId)
    const library = libraryId === null ? null : app.catalog.getLibrary(libraryId)
    if (library === null) return
    const info = await stat(assetPath)
    await app.indexer.indexMetadata(
      assetId,
      {
        path: assetPath,
        dir: dirname(assetPath),
        filename: basename(assetPath),
        extension: extname(assetPath).toLowerCase(),
        sizeBytes: info.size,
        mtimeMs: info.mtimeMs,
      },
      libraryId,
      library.root,
    )
  }

  /**
   * Add a library and index it to completion.
   *
   * The three passes are sequential by design (a file must exist before it can
   * have a waveform, and must have a waveform before a fingerprint is meaningful),
   * and the embed pass is skipped rather than faked when no model is loaded.
   */
  async importLibrary(root: string, name?: string): Promise<{
    library: unknown
    passes: Array<{ pass: string; job: { total: number; done: number; failed: number } }>
    embedSkipped: boolean
    failed: number
  }> {
    const handle = await this.ensure()
    const app = handle.app
    const trimmed = name?.trim()
    const label = trimmed && trimmed.length > 0 ? trimmed : basename(root) || 'library'
    const id = app.catalog.addLibrary(label, root, 'local')

    const passes: Array<{ pass: string; job: any }> = []
    const fast = await app.indexer.runFastPass(id, root)
    passes.push({ pass: 'scan', job: fast })
    const waveform = await app.indexer.runWaveformPass(id)
    passes.push({ pass: 'waveform', job: waveform })
    if (app.embedder && app.embedder.ready) {
      const embed = await app.indexer.runEmbedPass(id)
      passes.push({ pass: 'embed', job: embed })
    }

    return {
      library: app.catalog.getLibrary(id),
      passes: passes.map((entry) => ({
        pass: entry.pass,
        job: { total: entry.job.total, done: entry.job.done, failed: entry.job.failed },
      })),
      embedSkipped: !(app.embedder && app.embedder.ready),
      failed: passes.reduce((sum, entry) => sum + (entry.job.failed ?? 0), 0),
    }
  }

  async stop(): Promise<void> {
    const current = this.handle
    this.handle = null
    this.state = 'idle'
    if (current === null) return
    // Close the HTTP listener first so in-flight reads finish against a live DB.
    await current.server.close().catch(() => undefined)
    try {
      current.app.close()
    } catch {
      /* already closed */
    }
  }

  async restart(): Promise<EngineHandle> {
    await this.stop()
    return this.ensure()
  }

  async dispose(): Promise<void> {
    await this.stop()
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : String(error)
}

/**
 * Attach the one hint that turns an opaque startup failure into an actionable one.
 *
 * The engine stores its catalogue with `node:sqlite`, which is available without a
 * flag from Node 23.4 onward. DSH supports Node 22, where the module exists only
 * behind `--experimental-sqlite`, so a Web host on 22 otherwise fails with a bare
 * "No such built-in module".
 */
function engineHint(message: string): string {
  if (!/node:sqlite|built-in module.*sqlite|experimental-sqlite/i.test(message)) return message
  return `${message}\n\n此插件需要 Node 23.4+（内置 SQLite）。请升级运行 DSH 的 Node，或用桌面端（Electron 内置 Node 24）。`
}
