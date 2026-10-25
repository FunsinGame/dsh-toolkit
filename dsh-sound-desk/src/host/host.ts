/**
 * dsh-sound-desk host half.
 *
 * Owns the in-process SoundDesk engine, mounts its HTTP surface on DSH's own Web
 * server under `/dsh-sound-desk`, and adds the handful of operations a browser
 * page cannot do for itself (choosing a folder, revealing a file, restarting the
 * engine, reading plugin logs).
 *
 * Everything the workbench does with the catalogue goes through the proxied
 * engine API. Only host actions use the small `/host/*` surface, so there is one
 * source of truth for engine behaviour and the UI stays identical in Web and
 * Desktop.
 *
 * Nothing here starts at DSH start-up. `src/host/index.ts` imports this module on
 * the first request from the workbench, and the engine itself still waits for the
 * page's first `status?wait=1`; so the plugin is inert until the user opens the
 * activity for the first time.
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'

import { Engine, errorMessage, resolveFfmpeg } from './engine'
import { Logger, levelVisible } from './log'
import { PLUGIN_NAME, ROUTE_PREFIX, VERSION } from './paths'
import { proxyRequest, sendProxyError } from './proxy'
import { SettingsStore, type SoundDeskSettings } from './settings'

const MAX_BODY_BYTES = 1024 * 1024

export interface ConnectionLike {
  requestRejection?(request: { readonly headers: IncomingMessage['headers'] }): 401 | 403 | undefined
}

interface JsonObject {
  [key: string]: unknown
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

async function readJson(req: IncomingMessage): Promise<JsonObject> {
  const contentType = String(req.headers['content-type'] ?? '')
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error('请求必须使用 application/json')
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) throw new Error('请求体过大')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('请求体不是合法 JSON 对象')
  return parsed as JsonObject
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Electron's main-process API, when this plugin runs inside the desktop app. */
function electronApi(): Record<string, any> | null {
  if (typeof process.versions.electron !== 'string') return null
  try {
    return createRequire(import.meta.url)('electron') as Record<string, any>
  } catch {
    return null
  }
}

export class SoundDeskHost {
  readonly engine: Engine
  private readonly settings = new SettingsStore()
  private readonly log = new Logger()
  private readonly connectionOf: () => ConnectionLike | null
  private electron: Record<string, any> | null | undefined

  constructor(connectionOf: () => ConnectionLike | null = () => null) {
    this.connectionOf = connectionOf
    this.engine = new Engine(this.settings, this.log)
  }

  /**
   * Handle one request on the plugin's prefix.
   *
   * The route itself is registered by the plugin entry, which owns the lazy
   * import; this is the seam it calls once the host half exists.
   */
  handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    return this.handle(req, res)
  }

  async dispose(): Promise<void> {
    await this.engine.dispose()
  }

  private rejected(req: IncomingMessage, res: ServerResponse): boolean {
    // Resolved per request: the connection service may not exist yet when the
    // plugin is applied, and a later composition must still be authenticated.
    const rejection = this.connectionOf()?.requestRejection?.(req)
    if (rejection === undefined) return false
    res.writeHead(rejection, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
    return true
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://dsh-sound-desk.invalid')
    const pathname = url.pathname
    if (pathname !== ROUTE_PREFIX && !pathname.startsWith(`${ROUTE_PREFIX}/`)) {
      sendJson(res, 404, { error: 'not found' })
      return
    }
    // Every route on this prefix can read local files or drive the host, so it is
    // authenticated exactly like DSH's own plugin routes.
    if (this.rejected(req, res)) return

    const rest = pathname.slice(ROUTE_PREFIX.length) || '/'
    try {
      if (rest === '/' || rest === '') {
        sendJson(res, 200, { plugin: PLUGIN_NAME, version: VERSION, routes: ['/host/status', '/api/*'] })
        return
      }
      if (rest.startsWith('/host/')) {
        await this.handleHost(req, res, rest.slice('/host'.length), url)
        return
      }
      if (rest.startsWith('/api/')) {
        await this.forward(req, res, rest + url.search)
        return
      }
      sendJson(res, 404, { error: `no route for ${req.method} ${pathname}` })
    } catch (error) {
      if (!res.headersSent) sendJson(res, 500, { error: errorMessage(error) })
      else res.destroy()
    }
  }

  private async forward(req: IncomingMessage, res: ServerResponse, upstreamPath: string): Promise<void> {
    let handle
    try {
      handle = await this.engine.ensure()
    } catch (error) {
      sendProxyError(res, error)
      return
    }
    await proxyRequest(
      req,
      res,
      { host: '127.0.0.1', port: handle.server.port, token: handle.server.token },
      upstreamPath,
      this.log,
    )
  }

  // -- host endpoints -----------------------------------------------------

  private async handleHost(
    req: IncomingMessage,
    res: ServerResponse,
    route: string,
    url: URL,
  ): Promise<void> {
    const method = req.method ?? 'GET'
    switch (`${method} ${route}`) {
      case 'GET /status':
        await this.status(res, url.searchParams.get('wait') === '1')
        return
      case 'GET /settings':
        sendJson(res, 200, {
          settings: this.settings.get(),
          dataDir: this.settings.effectiveDataDir(),
          restartRequired: this.engine.restartRequired(),
        })
        return
      case 'PUT /settings': {
        const body = await readJson(req)
        const next = this.settings.update(coerceSettings(body))
        sendJson(res, 200, {
          settings: next,
          dataDir: this.settings.effectiveDataDir(),
          restartRequired: this.engine.restartRequired(),
          engineState: this.engine.engineState,
        })
        return
      }
      case 'POST /pick-folder':
        await this.pickFolder(req, res)
        return
      case 'POST /import-library':
        await this.importLibrary(req, res)
        return
      case 'POST /reveal':
        await this.hostFileAction(req, res, 'reveal')
        return
      case 'POST /open-file':
        await this.hostFileAction(req, res, 'open')
        return
      case 'POST /restart':
        await this.engine.restart()
        sendJson(res, 200, { ok: true, state: this.engine.engineState })
        return
      case 'GET /logs': {
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 200), 1), 300)
        const level = this.settings.get().logLevel
        const lines = this.log.recent(limit).filter((line) => levelVisible(level, line.level))
        sendJson(res, 200, { level, lines })
        return
      }
      default:
        sendJson(res, 404, { error: `no host route for ${method} ${route}` })
    }
  }

  private async status(res: ServerResponse, wait: boolean): Promise<void> {
    if (wait) {
      try {
        await this.engine.ensure()
      } catch {
        /* reported through state/error below */
      }
    }
    const settings = this.settings.get()
    const handle = this.engine.current
    let stats: unknown = null
    if (handle !== null) {
      try {
        stats = handle.app.catalog.stats()
      } catch {
        stats = null
      }
    }
    sendJson(res, 200, {
      plugin: PLUGIN_NAME,
      version: VERSION,
      state: this.engine.engineState,
      error: this.engine.lastError,
      restartRequired: this.engine.restartRequired(),
      dataDir: this.settings.effectiveDataDir(),
      engineUrl: handle?.server.url ?? null,
      modelLoaded: Boolean(handle?.app?.embedder?.ready),
      modelId: handle?.app?.embedder?.id ?? null,
      embedderError: this.engine.modelError,
      ffmpeg: resolveFfmpeg(settings, this.settings, this.log),
      stats,
      settings,
    })
  }

  private async pickFolder(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJson(req).catch(() => ({}) as JsonObject)
    const title = asString(body.title) || '选择要索引的素材库目录'
    this.electron ??= electronApi()
    const dialog = this.electron?.dialog
    if (typeof dialog?.showOpenDialog !== 'function') {
      sendJson(res, 200, {
        path: null,
        cancelled: true,
        unsupported: true,
        reason: '当前宿主没有可用的系统目录选择器，请直接输入目录路径。',
      })
      return
    }
    const result = await dialog.showOpenDialog({
      title,
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: '作为素材库索引',
    })
    const picked = Array.isArray(result?.filePaths) ? String(result.filePaths[0] ?? '') : ''
    sendJson(res, 200, { path: result?.canceled === true || picked === '' ? null : resolve(picked) })
  }

  private async importLibrary(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJson(req)
    const root = resolve(asString(body.root).trim())
    const name = asString(body.name).trim()
    if (root === '') {
      sendJson(res, 400, { error: '缺少目录路径' })
      return
    }
    const info = await stat(root).catch(() => null)
    if (info === null || !info.isDirectory()) {
      sendJson(res, 400, { error: `不是有效目录：${root}` })
      return
    }
    const result = await this.engine.importLibrary(root, name === '' ? undefined : name)
    sendJson(res, 200, result)
  }

  private async hostFileAction(req: IncomingMessage, res: ServerResponse, action: 'reveal' | 'open'): Promise<void> {
    const body = await readJson(req)
    const assetId = Number(body.assetId)
    if (!Number.isFinite(assetId)) {
      sendJson(res, 400, { error: '缺少 assetId' })
      return
    }
    const handle = this.engine.current
    if (handle === null) {
      sendJson(res, 503, { error: '引擎尚未启动' })
      return
    }
    // The path always comes from the catalogue, never from the page: a reveal
    // endpoint that accepts a path would be a file-system read primitive.
    const row = handle.app.catalog.getAssetRow(assetId) as Record<string, unknown> | null
    const assetPath = row === null ? '' : String(row.path ?? '')
    if (assetPath === '') {
      sendJson(res, 404, { error: `找不到素材 ${assetId}` })
      return
    }

    this.electron ??= electronApi()
    const shell = this.electron?.shell
    if (action === 'reveal') {
      if (typeof shell?.showItemInFolder === 'function') {
        shell.showItemInFolder(assetPath)
      } else {
        spawn('explorer.exe', ['/select,', assetPath], { detached: true, stdio: 'ignore' }).unref()
      }
      sendJson(res, 200, { ok: true })
      return
    }

    if (typeof shell?.openPath === 'function') {
      const failure = await shell.openPath(assetPath)
      if (typeof failure === 'string' && failure !== '') {
        sendJson(res, 500, { error: failure })
        return
      }
    } else {
      spawn('explorer.exe', [assetPath], { detached: true, stdio: 'ignore' }).unref()
    }
    sendJson(res, 200, { ok: true })
  }
}

/** Only these keys may cross the settings route. */
function coerceSettings(body: JsonObject): Partial<SoundDeskSettings> {
  const patch: Partial<SoundDeskSettings> = {}
  if (typeof body.dataDir === 'string') patch.dataDir = body.dataDir
  if (typeof body.loadModel === 'boolean') patch.loadModel = body.loadModel
  if (typeof body.ffmpegPath === 'string') patch.ffmpegPath = body.ffmpegPath
  if (typeof body.referenceDir === 'string') patch.referenceDir = body.referenceDir
  if (body.logLevel === 'off' || body.logLevel === 'normal' || body.logLevel === 'verbose') {
    patch.logLevel = body.logLevel
  }
  return patch
}
