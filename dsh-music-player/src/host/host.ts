/**
 * dsh-music-player host half.
 *
 * Owns the Bilibili session, the settings document, the media cache, and the
 * same-origin HTTP surface the browser half talks to. Routes are mounted as a
 * single `/dsh-music-player` prefix on DSH's Web server, so the player needs no
 * extra port, no CORS exception, and no copied auth token.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { AudioPipeline } from './audio/pipeline'
import type {
  BilibiliApi,
  BilibiliClient,
  CookieJar,
  FavoriteContentsPage,
  FavoriteFolder,
} from './bili'
import {
  AUDIO_QUALITY,
  BilibiliApi as BilibiliApiClass,
  BilibiliClient as BilibiliClientClass,
  BilibiliError,
  isBvid,
  parseDurationText,
  stripHtmlTags,
  toBilibiliError,
  WbiKeyStore,
  toFavoriteContentsView,
} from './bili'
import { MemoryLogger } from './logger'
import { MediaService, type DeliveryFormat } from './media'
import { CACHE_WAV_DIR } from './paths'
import type { PlayMode, TrackSummary } from './protocol'
import { QrSessionManager } from './qr'
import { ensureDataDir, SessionStore, SettingsStore, WbiStore } from './store'

const PREFIX = '/dsh-music-player'
const MAX_BODY_BYTES = 512 * 1024

export interface AccountUser {
  mid: number
  name: string
  face: string
}

interface PlayBody {
  bvid?: unknown
  cid?: unknown
  quality?: unknown
  format?: unknown
  track?: Partial<TrackSummary>
}

interface JsonObject {
  [key: string]: unknown
}

function normalizeImageUrl(value: string | undefined): string {
  if (value === undefined || value === '') return ''
  return value.startsWith('//') ? `https:${value}` : value
}

function extractBvid(text: string): string | null {
  const match = /[Bb][Vv]([0-9A-Za-z]{10})/.exec(text)
  return match === null ? null : `BV${match[1]}`
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(text),
  })
  res.end(text)
}

function sendError(res: ServerResponse, error: unknown): void {
  const normalized = toBilibiliError(error)
  const status = normalized.kind === 'not-logged-in' ? 401 : normalized.kind === 'aborted' ? 499 : 400
  sendJson(res, status, {
    ok: false,
    error: normalized.userMessage,
    message: normalized.message,
    kind: normalized.kind,
  })
}

async function readJson(req: IncomingMessage): Promise<JsonObject> {
  const contentType = String(req.headers['content-type'] ?? '')
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new BilibiliError('api', '请求必须使用 application/json')
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) throw new BilibiliError('api', '请求体过大')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object')
    }
    return parsed as JsonObject
  } catch (error) {
    throw new BilibiliError('api', '请求体不是合法 JSON', { cause: error })
  }
}

export class MusicHost {
  readonly ready: Promise<void>
  private readonly logger = new MemoryLogger('dsh-music-player')
  private readonly settings = new SettingsStore(this.logger)
  private readonly session = new SessionStore(this.logger)
  private readonly wbiStore = new WbiStore(this.logger)
  private client!: BilibiliClient
  private api!: BilibiliApi
  private pipeline!: AudioPipeline
  private media!: MediaService
  private qr!: QrSessionManager
  private user: AccountUser | null = null
  private userLoaded = false
  private userPromise: Promise<void> | null = null
  private playAbort: AbortController | null = null
  private initError: BilibiliError | null = null
  private registered = false
  private disposed = false
  private readonly disposers: Array<() => void> = []

  constructor(private readonly version: string) {
    this.ready = this.initialize()
  }

  private async initialize(): Promise<void> {
    try {
      await ensureDataDir()
      await this.settings.load()
      this.logger.setLevel(this.settings.get('logLevel'))
      await this.session.load()
      await this.wbiStore.load()

      this.client = new BilibiliClientClass({
        readCookies: () => this.session.cookies,
        logger: this.logger,
        minIntervalMs: () => this.settings.get('requestIntervalMs'),
        getRetries: 1,
      })
      const wbi = new WbiKeyStore({
        load: async () => {
          const nav = await this.api.getNav()
          return { imgUrl: nav.wbi_img.img_url, subUrl: nav.wbi_img.sub_url }
        },
        read: this.wbiStore.read,
        write: this.wbiStore.write,
        logger: this.logger,
      })
      this.api = new BilibiliApiClass(this.client, wbi, this.logger)
      this.pipeline = new AudioPipeline({
        api: this.api,
        client: this.client,
        logger: this.logger,
        cacheDir: CACHE_WAV_DIR,
        cacheEnabled: () => this.settings.get('cacheEnabled'),
        getCacheMaxBytes: () => Math.max(50, this.settings.get('cacheMaxMB')) * 1024 * 1024,
      })
      this.media = new MediaService({
        api: this.api,
        client: this.client,
        pipeline: this.pipeline,
        logger: this.logger,
        cacheEnabled: () => this.settings.get('cacheEnabled'),
        cacheMaxBytes: () => Math.max(50, this.settings.get('cacheMaxMB')) * 1024 * 1024,
      })
      this.qr = new QrSessionManager(this.client, this.logger, async (cookies: CookieJar) => {
        await this.session.setCookies(cookies)
        await this.refreshUser(true)
      })
      this.logger.info(`宿主已就绪（v${this.version}，DSH_HOME=${process.env.DSH_HOME ?? 'default'}）`)
      void this.bootstrapAccount()
    } catch (error) {
      this.initError = toBilibiliError(error, '音乐播放器初始化失败')
      this.logger.error('初始化失败', this.initError.message)
    }
  }

  /** Register the prefix route on the DSH Web server. */
  register(webServer: { register: (route: { kind: 'prefix'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }) => () => void }): () => void {
    if (this.registered) return () => undefined
    this.registered = true
    this.disposers.push(
      webServer.register({
        kind: 'prefix',
        path: PREFIX,
        handler: (req, res) => {
          void this.handle(req, res)
        },
      }),
    )
    return () => this.dispose()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.playAbort?.abort()
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose()
      } catch {
        // Best-effort teardown.
      }
    }
    this.logger.info('宿主已卸载')
  }

  private async bootstrapAccount(): Promise<void> {
    try {
      if (!this.session.hasDeviceId) {
        const buvid = await this.api.fetchBuvid()
        if (buvid !== null) await this.session.setBuvid(buvid.b_3, buvid.b_4)
      }
    } catch (error) {
      this.logger.warn('获取设备指纹失败（不影响播放）', toBilibiliError(error).message)
    }
    await this.refreshUser(true)
  }

  private async refreshUser(force = false): Promise<void> {
    if (this.disposed) return
    if (!force && this.userLoaded) return
    if (this.userPromise !== null) return this.userPromise
    this.userPromise = (async () => {
      if (!this.session.isLoggedIn) {
        this.user = null
        this.userLoaded = true
        return
      }
      try {
        const info = await this.api.getUserInfo()
        this.user = { mid: info.mid, name: info.name, face: normalizeImageUrl(info.face) }
        this.userLoaded = true
        this.logger.info(`已登录：${info.name}（${info.mid}）`)
      } catch (error) {
        const normalized = toBilibiliError(error)
        if (normalized.kind === 'not-logged-in') {
          await this.session.clearLogin()
          this.user = null
          this.userLoaded = true
          this.logger.warn('登录凭据已失效，已清除登录态')
        } else {
          this.userLoaded = false
          this.logger.warn('获取用户信息失败（稍后重试）', normalized.message)
        }
      }
    })()
    try {
      await this.userPromise
    } finally {
      this.userPromise = null
    }
  }

  private requireMid(): number {
    if (!this.session.isLoggedIn) {
      throw new BilibiliError('not-logged-in', '收藏夹需要先扫码登录')
    }
    const mid = this.user?.mid ?? this.session.mid
    if (mid === null) throw new BilibiliError('not-logged-in', '登录凭据缺少用户 id，请重新登录')
    return mid
  }

  private async accountView(): Promise<{ loggedIn: boolean; user: AccountUser | null }> {
    if (!this.userLoaded) await this.refreshUser()
    return { loggedIn: this.session.isLoggedIn, user: this.user }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      await this.ready
      if (this.initError !== null) {
        sendJson(res, 503, { ok: false, error: this.initError.userMessage, kind: this.initError.kind })
        return
      }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const sub = url.pathname.slice(PREFIX.length)
      const method = req.method ?? 'GET'

      // The desktop renderer serves the app from the `dsh-app:` scheme while
      // the media/API host lives on `http://127.0.0.1:<port>`. Every response
      // therefore needs CORS, including the Range-bearing media responses.
      const origin = req.headers.origin
      const allowOrigin = origin === undefined || origin === 'null' ? '*' : origin
      res.setHeader('Access-Control-Allow-Origin', allowOrigin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range')
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type')
      if (method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      if (sub.startsWith('/media/')) {
        if (method !== 'GET' && method !== 'HEAD') {
          res.writeHead(405).end()
          return
        }
        await this.media.handleMedia(req, res, sub.slice('/media/'.length))
        return
      }

      if (sub === '/image') {
        if (method !== 'GET') {
          res.writeHead(405).end()
          return
        }
        await this.media.proxyImage(url.searchParams.get('url') ?? '', res)
        return
      }

      if (!sub.startsWith('/api')) {
        sendJson(res, 404, { ok: false, error: 'not found' })
        return
      }

      const path = sub.replace(/\/+$/, '')

      if (method === 'GET' && path === '/api/health') {
        sendJson(res, 200, { ok: true, version: this.version, ready: true })
        return
      }

      if (method === 'GET' && path === '/api/status') {
        const account = await this.accountView()
        const cache = await this.media.cacheStats()
        sendJson(res, 200, {
          ok: true,
          data: {
            version: this.version,
            loggedIn: account.loggedIn,
            user: account.user,
            settings: this.settings.current,
            cache,
            logLevel: this.logger.getLevel(),
          },
        })
        return
      }

      if (method === 'GET' && path === '/api/search') {
        const keyword = (url.searchParams.get('keyword') ?? '').trim()
        const page = Math.max(1, Math.trunc(asNumber(url.searchParams.get('page') ?? undefined) ?? 1))
        if (keyword === '') throw new BilibiliError('api', '请输入搜索关键词')
        const bvid = extractBvid(keyword)
        if (bvid !== null) {
          try {
            const info = await this.api.getVideoInfo(bvid)
            sendJson(res, 200, {
              ok: true,
              data: {
                keyword,
                page: 1,
                numPages: 1,
                items: [{
                  bvid: info.bvid,
                  title: info.title,
                  author: info.author,
                  cover: normalizeImageUrl(info.cover),
                  durationSeconds:
                    info.pages.length > 0 && Number.isFinite(info.pages[0]?.duration)
                      ? info.pages[0].duration
                      : info.durationSeconds,
                  pageCount: info.pageCount,
                  direct: true,
                }],
              },
            })
            return
          } catch (error) {
            this.logger.debug('BV 直链解析失败，退回搜索', toBilibiliError(error).message)
          }
        }
        const result = await this.api.searchVideos({ keyword, page })
        sendJson(res, 200, {
          ok: true,
          data: {
            keyword,
            page,
            numPages: result.numPages,
            items: result.items.map((item) => ({
              bvid: item.bvid ?? '',
              title: stripHtmlTags(item.title),
              author: item.author ?? '',
              cover: normalizeImageUrl(item.pic),
              durationSeconds: parseDurationText(item.duration) ?? 0,
              pageCount: 0,
              views: item.play ?? 0,
            })),
          },
        })
        return
      }

      if (method === 'POST' && path === '/api/play') {
        const body = (await readJson(req)) as PlayBody
        const bvid = asString(body.bvid)
        if (!isBvid(bvid)) throw new BilibiliError('api', '无效的 BV 号')
        const cid = asNumber(body.cid)
        const quality = asNumber(body.quality) ?? this.settings.get('audioQuality')
        const format: DeliveryFormat = body.format === 'wav' ? 'wav' : 'raw'
        const controller = new AbortController()
        this.playAbort?.abort()
        this.playAbort = controller
        res.on('close', () => {
          if (!res.writableEnded) controller.abort()
        })
        try {
          const result = await this.media.play({
            bvid,
            ...(cid === undefined ? {} : { cid }),
            quality,
            format,
            signal: controller.signal,
            ...(body.track === undefined ? {} : { track: body.track }),
          })
          sendJson(res, 200, { ok: true, data: result })
        } finally {
          if (this.playAbort === controller) this.playAbort = null
        }
        return
      }

      if (method === 'GET' && path === '/api/auth/qr') {
        const started = await this.qr.start()
        sendJson(res, 200, { ok: true, data: started })
        return
      }

      if (method === 'GET' && path === '/api/auth/poll') {
        const id = url.searchParams.get('id') ?? ''
        const status = await this.qr.poll(id)
        const account = await this.accountView()
        sendJson(res, 200, {
          ok: true,
          data: { ...status, loggedIn: account.loggedIn, user: account.user },
        })
        return
      }

      if (method === 'POST' && path === '/api/auth/logout') {
        await this.session.clearLogin()
        this.user = null
        this.userLoaded = true
        sendJson(res, 200, { ok: true, data: { loggedIn: false, user: null } })
        return
      }

      if (method === 'GET' && path === '/api/favorites') {
        const mid = this.requireMid()
        const folders = await this.api.getFavoriteFolders({ mid })
        sendJson(res, 200, { ok: true, data: { items: folders.map(folderView) } })
        return
      }

      if (method === 'GET' && path === '/api/favorites/contents') {
        this.requireMid()
        const mediaId = asNumber(url.searchParams.get('mediaId') ?? undefined)
        if (mediaId === undefined) throw new BilibiliError('api', '缺少收藏夹 id')
        const page = Math.max(1, Math.trunc(asNumber(url.searchParams.get('page') ?? undefined) ?? 1))
        const keyword = (url.searchParams.get('keyword') ?? '').trim()
        const raw = await this.api.getFavoriteContents({
          mediaId,
          page,
          ...(keyword === '' ? {} : { keyword, scope: 'this' as const }),
        })
        const view = toFavoriteContentsView(raw)
        sendJson(res, 200, {
          ok: true,
          data: {
            mediaId,
            page,
            title: view.title,
            total: view.total,
            hasMore: view.hasMore,
            items: view.entries.map(favoriteTrack),
          },
        })
        return
      }

      if (method === 'GET' && path === '/api/favorites/membership') {
        const mid = this.requireMid()
        const bvid = url.searchParams.get('bvid') ?? ''
        if (!isBvid(bvid)) throw new BilibiliError('api', '无效的 BV 号')
        const folders = await this.api.getFavoriteFolders({ mid, bvid })
        sendJson(res, 200, {
          ok: true,
          data: {
            bvid,
            folders: folders.map((folder) => ({
              id: folder.id,
              title: folder.title,
              selected: folder.fav_state === 1,
            })),
          },
        })
        return
      }

      if (method === 'POST' && path === '/api/favorites/create') {
        this.requireMid()
        const body = await readJson(req)
        const title = asString(body.title).trim()
        if (title === '') throw new BilibiliError('api', '收藏夹名称不能为空')
        const privacy = body.privacy === 1 ? 1 : 0
        const created = await this.api.createFavoriteFolder({ title, privacy })
        sendJson(res, 200, { ok: true, data: created })
        return
      }

      if (method === 'POST' && path === '/api/favorites/delete') {
        this.requireMid()
        const body = await readJson(req)
        const mediaId = asNumber(body.mediaId)
        if (mediaId === undefined) throw new BilibiliError('api', '缺少收藏夹 id')
        await this.api.deleteFavoriteFolders([mediaId])
        sendJson(res, 200, { ok: true, data: { mediaId } })
        return
      }

      if (method === 'POST' && path === '/api/favorites/remove') {
        this.requireMid()
        const body = await readJson(req)
        const mediaId = asNumber(body.mediaId)
        const bvids = asStringArray(body.bvids)
        if (mediaId === undefined) throw new BilibiliError('api', '缺少收藏夹 id')
        await this.api.removeFavoriteResources({ mediaId, bvids })
        sendJson(res, 200, { ok: true, data: { mediaId, removed: bvids.length } })
        return
      }

      if (method === 'POST' && path === '/api/favorites/deal') {
        this.requireMid()
        const body = await readJson(req)
        const bvid = asString(body.bvid)
        if (!isBvid(bvid)) throw new BilibiliError('api', '无效的 BV 号')
        const result = await this.api.dealFavoriteForOneVideo({
          bvid,
          addToFavoriteIds: asStringArray(body.addIds),
          delInFavoriteIds: asStringArray(body.delIds),
        })
        sendJson(res, 200, { ok: true, data: result })
        return
      }

      if (method === 'GET' && path === '/api/settings') {
        const cache = await this.media.cacheStats()
        sendJson(res, 200, { ok: true, data: { settings: this.settings.current, cache } })
        return
      }

      if (method === 'POST' && path === '/api/settings') {
        const body = await readJson(req)
        const key = asString(body.key)
        const settings = await this.settings.update(key, body.value)
        this.logger.setLevel(settings.logLevel)
        if (key === 'cacheMaxMB') void this.media.enforceCacheLimit()
        const cache = await this.media.cacheStats()
        sendJson(res, 200, { ok: true, data: { settings, cache } })
        return
      }

      if (method === 'GET' && path === '/api/cache') {
        sendJson(res, 200, { ok: true, data: await this.media.cacheStats() })
        return
      }

      if (method === 'POST' && path === '/api/cache/clear') {
        await this.media.clearCache()
        sendJson(res, 200, { ok: true, data: await this.media.cacheStats() })
        return
      }

      if (method === 'GET' && path === '/api/logs') {
        const limit = Math.min(400, Math.max(1, Math.trunc(asNumber(url.searchParams.get('limit') ?? undefined) ?? 200)))
        sendJson(res, 200, {
          ok: true,
          data: { level: this.logger.getLevel(), lines: this.logger.recent(limit) },
        })
        return
      }

      sendJson(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      this.logger.warn(
        '路由处理失败',
        error instanceof Error ? `${toBilibiliError(error).message}\n${error.stack ?? ''}` : String(error),
      )
      if (!res.headersSent) {
        sendError(res, error)
      } else {
        res.destroy()
      }
    }
  }
}

function folderView(folder: FavoriteFolder): { id: number; title: string; count: number } {
  return {
    id: folder.id,
    title: folder.title,
    count: Number.isFinite(folder.media_count) ? folder.media_count : 0,
  }
}

function favoriteTrack(entry: {
  bvid: string
  title: string
  upperName: string
  cover: string
  durationSeconds: number
  pageCount: number
  invalid: boolean
}): TrackSummary & { invalidReason?: string } {
  return {
    bvid: entry.bvid,
    title: entry.title,
    author: entry.upperName,
    cover: normalizeImageUrl(entry.cover),
    durationSeconds: entry.durationSeconds,
    pageCount: entry.pageCount,
    ...(entry.invalid ? { invalid: true } : {}),
  }
}
