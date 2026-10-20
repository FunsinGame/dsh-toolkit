/**
 * HTTP carrier for the notes server.
 *
 * One listener serves the JSON API, the standalone web app and the MCP endpoint.
 * The server is deliberately small: a named route dispatcher, a strict auth /
 * CSRF / rate-limit layer, bounded request bodies, safe static-file serving and
 * authenticated attachment streaming. It never executes user content.
 */

import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, open, readFile, realpath, rm, stat } from 'node:fs/promises'
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { createWriteStream } from 'node:fs'
import { once } from 'node:events'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ServerConfig } from './config.ts'
import type { Logger } from './logger.ts'
import type { AuthContext, NotesService } from './service.ts'
import { ServiceError } from './service.ts'
import {
  attachmentStorageKey,
  filenameExtension,
  isInlineMime,
  resolveUploadMime,
  safeFilename,
  validateMagic,
} from './mime.ts'
import {
  createDummyHash,
  LoginGuard,
  parseCookies,
  RateLimiter,
} from './security.ts'
import { joinBase } from './platform.ts'
import type { AttachmentMeta, NoteDetail, SearchResult, VersionDetail, VersionSummary } from '../shared/types.ts'
import { handleMcpRequest } from './mcp/server.ts'

const COOKIE_NAME = 'dsh_notes_session'
const JSON_LIMIT = 1024 * 1024
const MAX_URL_LENGTH = 2048
const MAX_HEADER_BYTES = 16 * 1024

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly extra: Record<string, unknown>

  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.extra = extra
  }
}

interface SseClient {
  res: ServerResponse
  userId: string
}

export interface NotesServerStartResult {
  url: string
  port: number | null
  socket: string
}

export class NotesHttpServer {
  private readonly service: NotesService
  private readonly config: ServerConfig
  private readonly logger: Logger
  private readonly version: string
  private readonly webRoot: string
  private server: Server | null = null
  private readonly sseClients = new Set<SseClient>()
  private heartbeat: NodeJS.Timeout | null = null
  private readonly apiLimiter = new RateLimiter()
  private readonly loginMinute = new RateLimiter()
  private readonly loginHour = new RateLimiter()
  private readonly uploadLimiter = new RateLimiter()
  private readonly mcpLimiter = new RateLimiter()
  private readonly loginGuard = new LoginGuard(10, 15 * 60_000)
  private stopMaintenance: (() => void) | null = null

  constructor(service: NotesService, config: ServerConfig, logger: Logger, version: string) {
    this.service = service
    this.config = config
    this.logger = logger
    this.version = version
    const thisDir = dirname(fileURLToPath(import.meta.url))
    this.webRoot = resolve(join(thisDir, '..', '..', 'web'))
    this.attachChangeStream()
  }

  async start(): Promise<NotesServerStartResult> {
    const handler = (req: IncomingMessage, res: ServerResponse): void => {
      void this.handle(req, res)
    }
    let server: Server
    if (this.config.tlsCert !== '' && this.config.tlsKey !== '') {
      const [cert, key] = await Promise.all([
        readFile(this.config.tlsCert),
        readFile(this.config.tlsKey),
      ])
      server = createHttpsServer({ cert, key, minVersion: 'TLSv1.2' }, handler)
    } else {
      server = createHttpServer(handler)
    }
    server.headersTimeout = 15_000
    server.requestTimeout = 60_000
    server.keepAliveTimeout = 5_000
    server.maxHeadersCount = 100
    this.server = server
    this.stopMaintenance = this.startMaintenance()
    await new Promise<void>((resolveListen, rejectListen) => {
      const onError = (error: Error): void => rejectListen(error)
      server.once('error', onError)
      if (this.config.socket !== '') {
        server.listen(this.config.socket, () => {
          server.off('error', onError)
          resolveListen()
        })
      } else {
        server.listen(this.config.port, this.config.host, () => {
          server.off('error', onError)
          resolveListen()
        })
      }
    })
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : null
    if (this.config.socket !== '' && process.platform !== 'win32') {
      try {
        const { chmod } = await import('node:fs/promises')
        await chmod(this.config.socket, 0o600)
      } catch {
        /* Best effort. */
      }
    }
    const advertisedHost = this.config.host === '0.0.0.0' || this.config.host === '::' ? '127.0.0.1' : this.config.host
    const origin = this.config.publicUrl !== ''
      ? this.config.publicUrl
      : this.config.socket !== ''
        ? `http://localhost${this.config.basePath}`
        : `${this.config.tlsCert !== '' ? 'https' : 'http'}://${advertisedHost}:${port ?? this.config.port}${this.config.basePath}`
    return { url: `${origin.replace(/\/+$/, '')}/`, port, socket: this.config.socket }
  }

  async stop(): Promise<void> {
    this.stopMaintenance?.()
    this.stopMaintenance = null
    if (this.heartbeat !== null) clearInterval(this.heartbeat)
    this.heartbeat = null
    for (const client of this.sseClients) {
      try {
        client.res.end()
      } catch {
        /* Ignore. */
      }
    }
    this.sseClients.clear()
    const server = this.server
    this.server = null
    if (server === null) return
    await new Promise<void>((resolveClose) => {
      server.close(() => resolveClose())
      try {
        server.closeAllConnections?.()
      } catch {
        /* Ignore. */
      }
      setTimeout(resolveClose, 2000).unref?.()
    })
  }

  private startMaintenance(): () => void {
    const run = (): void => {
      try {
        this.service.purgeExpiredTrash()
      } catch (error) {
        this.logger.warn('trash maintenance failed', error)
      }
    }
    const timer = setInterval(run, 6 * 60 * 60_000)
    timer.unref?.()
    return () => clearInterval(timer)
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const started = Date.now()
    try {
      this.applySecurityHeaders(req, res)
      const rawUrl = req.url ?? '/'
      if (rawUrl.length > MAX_URL_LENGTH) throw new HttpError(414, 'URI_TOO_LONG', '请求地址过长')
      if (Buffer.byteLength((req.rawHeaders ?? []).join('')) > MAX_HEADER_BYTES) {
        throw new HttpError(431, 'HEADERS_TOO_LARGE', '请求头过大')
      }
      const url = new URL(rawUrl, 'http://dsh-notes.invalid')
      let pathname = url.pathname
      if (this.config.basePath !== '') {
        if (pathname === '/') {
          this.redirect(res, `${this.config.basePath}/`)
          return
        }
        if (pathname === this.config.basePath) {
          this.redirect(res, `${this.config.basePath}/`)
          return
        }
        if (!pathname.startsWith(`${this.config.basePath}/`)) throw new HttpError(404, 'NOT_FOUND', '未找到')
        pathname = pathname.slice(this.config.basePath.length) || '/'
      }
      if (pathname === '/healthz') {
        this.sendJson(res, 200, { ok: true })
        return
      }
      if (pathname === '/mcp') {
        await this.handleMcp(req, res)
        return
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        await this.handleApi(req, res, url)
        return
      }
      await this.serveStatic(req, res, pathname, url)
    } catch (error) {
      this.sendError(req, res, error)
      this.logger.warn(`${req.method ?? 'GET'} ${req.url ?? '/'} failed`, error instanceof Error ? error.message : error)
    } finally {
      if (this.logger.enabled('debug')) {
        this.logger.debug(`${req.method ?? 'GET'} ${req.url ?? '/'} ${res.statusCode} ${Date.now() - started}ms`)
      }
    }
  }

  private applySecurityHeaders(req: IncomingMessage, res: ServerResponse): void {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()')
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self'",
      "connect-src 'self'",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '))
    res.removeHeader('X-Powered-By')
    if (this.isSecure(req)) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
  }

  private isSecure(req: IncomingMessage): boolean {
    if ((req.socket as { encrypted?: boolean }).encrypted === true) return true
    if (!this.config.behindProxy) return false
    const forwarded = headerValue(req.headers['x-forwarded-proto'])
    return forwarded.toLowerCase() === 'https'
  }

  private redirect(res: ServerResponse, location: string): void {
    res.statusCode = 302
    res.setHeader('Location', location)
    res.setHeader('Cache-Control', 'no-store')
    res.end()
  }

  // -- authentication -------------------------------------------------------

  private authenticate(req: IncomingMessage): AuthContext | null {
    const authorization = headerValue(req.headers.authorization)
    if (authorization.toLowerCase().startsWith('bearer ')) {
      return this.service.authenticateToken(authorization.slice(7).trim())
    }
    const cookies = parseCookies(req.headers.cookie)
    const session = cookies[COOKIE_NAME]
    if (typeof session === 'string' && session !== '') return this.service.authenticateSession(session)
    return null
  }

  private requireAuth(req: IncomingMessage): AuthContext {
    const auth = this.authenticate(req)
    if (auth === null) throw new HttpError(401, 'AUTH_REQUIRED', '需要登录')
    return auth
  }

  private requireWrite(auth: AuthContext): void {
    if (auth.kind === 'token' && !auth.scopes.includes('write')) {
      throw new HttpError(403, 'READ_ONLY_TOKEN', '该访问令牌只有只读权限')
    }
  }

  private assertCsrf(req: IncomingMessage, auth: AuthContext | null, requireHeader = false): void {
    const method = (req.method ?? 'GET').toUpperCase()
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return
    const tokenRequest = auth?.kind === 'token'
    if (tokenRequest) return
    if (requireHeader || auth?.kind === 'session') {
      if (headerValue(req.headers['x-notes-request']) !== '1') {
        throw new HttpError(403, 'CSRF_REQUIRED', '缺少请求校验头')
      }
      this.assertOrigin(req)
    }
  }

  private assertOrigin(req: IncomingMessage): void {
    const origin = headerValue(req.headers.origin)
    if (origin === '') return
    const allowed = new Set<string>()
    if (this.config.publicUrl !== '') {
      try {
        allowed.add(new URL(this.config.publicUrl).origin)
      } catch {
        /* Ignore a malformed publicUrl; startup already validates the listener. */
      }
    }
    const proto = this.isSecure(req) ? 'https' : 'http'
    const host = headerValue(req.headers.host)
    if (host !== '') allowed.add(`${proto}://${host}`)
    if (!allowed.has(origin)) throw new HttpError(403, 'ORIGIN_REJECTED', '来源不被允许')
  }

  private clientIp(req: IncomingMessage): string {
    const remote = String(req.socket.remoteAddress ?? '')
    const normalized = remote.replace(/^::ffff:/u, '')
    if (this.config.behindProxy || this.config.trustProxy) {
      const trusted = this.config.trustedProxies.includes('*')
        || this.config.trustedProxies.includes(remote)
        || this.config.trustedProxies.includes(normalized)
      if (trusted) {
        const forwarded = headerValue(req.headers['x-forwarded-for']).split(',')[0]?.trim() ?? ''
        if (forwarded !== '') return forwarded
      }
    }
    return normalized
  }

  private setSessionCookie(req: IncomingMessage, res: ServerResponse, sessionId: string, maxAgeSeconds: number): void {
    const parts = [
      `${COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
      `Path=${this.config.basePath === '' ? '/' : this.config.basePath}`,
      `Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}`,
      'HttpOnly',
      'SameSite=Strict',
    ]
    if (this.isSecure(req)) parts.push('Secure')
    res.setHeader('Set-Cookie', parts.join('; '))
  }

  private clearSessionCookie(req: IncomingMessage, res: ServerResponse): void {
    this.setSessionCookie(req, res, '', 0)
  }

  // -- API ------------------------------------------------------------------

  private async handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase()
    let segments: string[]
    try {
      segments = url.pathname.split('/').filter((part) => part !== '').map((part) => decodeURIComponent(part))
    } catch {
      throw new HttpError(400, 'BAD_PATH', '路径编码无效')
    }
    if (segments[0] !== 'api') throw new HttpError(404, 'NOT_FOUND', '未找到')
    const path = segments.slice(1)

    if (path[0] === 'auth') {
      if (method === 'POST' && path[1] === 'login') {
        await this.handleLogin(req, res)
        return
      }
      if (method === 'POST' && path[1] === 'logout') {
        this.assertCsrf(req, this.authenticate(req), true)
        const cookies = parseCookies(req.headers.cookie)
        this.service.deleteSession(cookies[COOKIE_NAME] ?? '')
        this.clearSessionCookie(req, res)
        this.sendJson(res, 200, { ok: true })
        return
      }
      if (method === 'GET' && path[1] === 'session') {
        const auth = this.requireAuth(req)
        this.sendJson(res, 200, {
          ok: true,
          user: auth.user,
          auth: { kind: auth.kind, scopes: auth.scopes },
        })
        return
      }
      throw new HttpError(404, 'NOT_FOUND', '未找到')
    }

    const auth = this.requireAuth(req)
    this.assertCsrf(req, auth)
    const limiter = this.apiLimiter.allow(`${auth.kind}:${auth.tokenId ?? auth.sessionHash ?? auth.user.id}`, 600, 60_000)
    if (!limiter.ok) throw new HttpError(429, 'RATE_LIMITED', '请求过于频繁', { retryAfter: limiter.retryAfter })

    if (method === 'GET' && path[0] === 'health') {
      this.sendJson(res, 200, {
        ok: true,
        server: this.service.serverInfo(),
        counts: this.service.healthCounts(auth.user.id),
        user: auth.user,
      })
      return
    }

    if (method === 'GET' && path[0] === 'events') {
      this.handleEvents(req, res, auth)
      return
    }

    if (method === 'GET' && path[0] === 'tree') {
      this.sendJson(res, 200, { ok: true, tree: this.service.listTree(auth.user.id) })
      return
    }

    if (method === 'GET' && path[0] === 'trash') {
      this.sendJson(res, 200, { ok: true, notes: this.service.listTrash(auth.user.id) })
      return
    }

    if (method === 'GET' && path[0] === 'search') {
      const query = url.searchParams.get('q') ?? ''
      const tag = url.searchParams.get('tag') ?? undefined
      const rawFolder = url.searchParams.get('folderId')
      const folderId = rawFolder === null ? undefined : rawFolder === 'root' ? null : rawFolder
      const limit = Number(url.searchParams.get('limit') ?? 50)
      this.sendJson(res, 200, { ok: true, results: this.service.search(auth.user.id, query, { tag, folderId, limit }) })
      return
    }

    if (method === 'GET' && path[0] === 'changes') {
      const since = Number(url.searchParams.get('since') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 500)
      this.sendJson(res, 200, { ok: true, ...this.service.getChanges(auth.user.id, since, limit) })
      return
    }

    if (method === 'GET' && path[0] === 'sync' && path[1] === 'bootstrap') {
      this.sendJson(res, 200, { ok: true, ...this.service.bootstrap(auth.user.id) })
      return
    }

    if (path[0] === 'notes') {
      await this.handleNotes(req, res, auth, path, method, url)
      return
    }

    if (path[0] === 'folders') {
      await this.handleFolders(req, res, auth, path, method)
      return
    }

    if (path[0] === 'attachments' && method === 'GET' && path[1] !== undefined) {
      await this.sendAttachment(req, res, auth, path[1], url)
      return
    }

    if (path[0] === 'attachments' && method === 'DELETE' && path[1] !== undefined) {
      this.requireWrite(auth)
      await this.service.deleteAttachment(auth.user.id, path[1])
      this.sendJson(res, 200, { ok: true })
      return
    }

    if (path[0] === 'export' && path[1] === 'note' && path[2] !== undefined && method === 'GET') {
      await this.sendExport(req, res, auth, path[2].replace(/\.md$/u, ''), url)
      return
    }

    throw new HttpError(404, 'NOT_FOUND', '未找到')
  }

  private async handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.assertCsrf(req, null, true)
    const ip = this.clientIp(req)
    const minute = this.loginMinute.allow(ip, 5, 60_000)
    if (!minute.ok) throw new HttpError(429, 'RATE_LIMITED', '登录尝试过于频繁', { retryAfter: minute.retryAfter })
    const hour = this.loginHour.allow(ip, 20, 3_600_000)
    if (!hour.ok) throw new HttpError(429, 'RATE_LIMITED', '登录尝试过于频繁', { retryAfter: hour.retryAfter })
    const body = await this.readJson(req)
    const username = typeof body.username === 'string' ? body.username.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (username === '' || password === '') throw new HttpError(400, 'CREDENTIALS_REQUIRED', '请输入用户名和密码')
    const lockRemaining = this.loginGuard.lockedFor(username.toLowerCase())
    if (lockRemaining > 0) {
      throw new HttpError(429, 'ACCOUNT_LOCKED', '登录失败次数过多，请稍后再试', { retryAfter: lockRemaining })
    }
    const user = await this.service.verifyLogin(username, password)
    if (user === null) {
      this.loginGuard.fail(username.toLowerCase())
      throw new HttpError(401, 'INVALID_CREDENTIALS', '用户名或密码错误')
    }
    this.loginGuard.success(username.toLowerCase())
    const session = this.service.createSession(user.id, { userAgent: headerValue(req.headers['user-agent']), ip })
    this.setSessionCookie(req, res, session.sessionId, this.config.sessionDays * 86_400)
    this.sendJson(res, 200, {
      ok: true,
      user: { id: user.id, username: user.username, displayName: user.display_name, authKind: 'session' },
      expiresAt: session.expiresAt,
    })
  }

  private async handleNotes(req: IncomingMessage, res: ServerResponse, auth: AuthContext, path: string[], method: string, url: URL): Promise<void> {
    const id = path[1]
    if (id === undefined) {
      if (method === 'POST') {
        this.requireWrite(auth)
        const body = await this.readJson(req)
        const note = this.service.createNote(auth.user.id, {
          id: stringValue(body.id) || undefined,
          folderId: folderValue(body.folderId),
          title: stringValue(body.title),
          content: stringValue(body.content),
          tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
          pinned: body.pinned === true,
          opId: stringValue(body.opId) || undefined,
        })
        this.sendJson(res, 201, { ok: true, note })
        return
      }
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', '不支持的方法')
    }

    if (path[2] === 'attachments') {
      if (method === 'GET') {
        this.sendJson(res, 200, { ok: true, attachments: this.service.listAttachments(auth.user.id, id) })
        return
      }
      if (method === 'POST') {
        this.requireWrite(auth)
        await this.handleAttachmentUpload(req, res, auth, id)
        return
      }
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', '不支持的方法')
    }

    if (path[2] === 'versions') {
      if (method === 'GET' && path[3] === undefined) {
        this.sendJson(res, 200, { ok: true, versions: this.service.listVersions(auth.user.id, id) })
        return
      }
      if (method === 'GET' && path[3] !== undefined) {
        const revision = Number(path[3])
        if (!Number.isFinite(revision)) throw new HttpError(400, 'INVALID_REVISION', '版本号无效')
        this.sendJson(res, 200, { ok: true, version: this.service.getVersion(auth.user.id, id, revision) })
        return
      }
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', '不支持的方法')
    }

    if (path[2] === 'revert' && method === 'POST') {
      this.requireWrite(auth)
      const body = await this.readJson(req)
      const revision = Number(body.revision)
      if (!Number.isFinite(revision)) throw new HttpError(400, 'INVALID_REVISION', '版本号无效')
      const note = this.service.revertNote(auth.user.id, id, revision, stringValue(body.opId) || undefined)
      this.sendJson(res, 200, { ok: true, note })
      return
    }

    if (path[2] === 'restore' && method === 'POST') {
      this.requireWrite(auth)
      const note = this.service.restoreNote(auth.user.id, id)
      this.sendJson(res, 200, { ok: true, note })
      return
    }

    if (path[2] === 'move' && method === 'POST') {
      this.requireWrite(auth)
      const body = await this.readJson(req)
      const note = this.service.moveNote(
        auth.user.id,
        id,
        folderValue(body.folderId),
        Number(body.baseRevision),
        stringValue(body.opId) || undefined,
      )
      this.sendJson(res, 200, { ok: true, note })
      return
    }

    if (method === 'GET') {
      this.sendJson(res, 200, { ok: true, note: this.service.noteDetail(auth.user.id, id) })
      return
    }
    if (method === 'PATCH') {
      this.requireWrite(auth)
      const body = await this.readJson(req)
      const note = this.service.updateNote(auth.user.id, id, {
        baseRevision: Number(body.baseRevision),
        title: body.title === undefined ? undefined : stringValue(body.title),
        content: body.content === undefined ? undefined : stringValue(body.content),
        tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
        pinned: body.pinned === undefined ? undefined : body.pinned === true,
        folderId: body.folderId === undefined ? undefined : folderValue(body.folderId),
        opId: stringValue(body.opId) || undefined,
      })
      this.sendJson(res, 200, { ok: true, note })
      return
    }
    if (method === 'DELETE') {
      this.requireWrite(auth)
      const permanent = url.searchParams.get('permanent') === '1'
      this.service.deleteNote(auth.user.id, id, { permanent })
      this.sendJson(res, 200, { ok: true })
      return
    }
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', '不支持的方法')
  }

  private async handleFolders(req: IncomingMessage, res: ServerResponse, auth: AuthContext, path: string[], method: string): Promise<void> {
    const id = path[1]
    if (id === undefined) {
      if (method === 'POST') {
        this.requireWrite(auth)
        const body = await this.readJson(req)
        const folder = this.service.createFolder(auth.user.id, {
          id: stringValue(body.id) || undefined,
          parentId: folderValue(body.parentId),
          name: stringValue(body.name),
          opId: stringValue(body.opId) || undefined,
        })
        this.sendJson(res, 201, { ok: true, folder })
        return
      }
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', '不支持的方法')
    }
    if (method === 'PATCH') {
      this.requireWrite(auth)
      const body = await this.readJson(req)
      const folder = this.service.updateFolder(auth.user.id, id, {
        baseRevision: Number(body.baseRevision),
        name: body.name === undefined ? undefined : stringValue(body.name),
        parentId: body.parentId === undefined ? undefined : folderValue(body.parentId),
        opId: stringValue(body.opId) || undefined,
      })
      this.sendJson(res, 200, { ok: true, folder })
      return
    }
    if (method === 'DELETE') {
      this.requireWrite(auth)
      const recursive = new URL(req.url ?? '/', 'http://localhost').searchParams.get('recursive') === '1'
      this.service.deleteFolder(auth.user.id, id, { recursive })
      this.sendJson(res, 200, { ok: true })
      return
    }
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', '不支持的方法')
  }

  private async handleAttachmentUpload(req: IncomingMessage, res: ServerResponse, auth: AuthContext, noteId: string): Promise<void> {
    const limit = this.uploadLimiter.allow(`${auth.user.id}`, 10, 60_000)
    if (!limit.ok) throw new HttpError(429, 'RATE_LIMITED', '上传过于频繁', { retryAfter: limit.retryAfter })
    req.setTimeout(10 * 60_000)
    const declared = headerValue(req.headers['content-type'])
    const rawName = headerValue(req.headers['x-file-name'])
    let filename = 'attachment'
    if (rawName !== '') {
      try {
        filename = safeFilename(decodeURIComponent(rawName))
      } catch {
        filename = safeFilename(rawName)
      }
    } else {
      const extension = filenameExtension(declared)
      if (extension !== '') filename = `attachment.${extension}`
    }
    const mime = resolveUploadMime(filename, declared)
    if (mime === null) throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', '只允许上传图片或音频文件')
    const contentLength = Number(req.headers['content-length'] ?? 0)
    if (Number.isFinite(contentLength) && contentLength > this.config.maxUploadBytes) {
      throw new HttpError(413, 'FILE_TOO_LARGE', `文件超过 ${Math.round(this.config.maxUploadBytes / 1024 / 1024)}MB 限制`)
    }
    const tempDir = join(this.config.dataDir, 'tmp')
    await mkdir(tempDir, { recursive: true, mode: 0o700 })
    const tempPath = join(tempDir, `upload-${randomUUID()}.tmp`)
    const hash = createHash('sha256')
    let size = 0
    let head = Buffer.alloc(0)
    const out = createWriteStream(tempPath, { mode: 0o600 })
    try {
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
        size += buffer.byteLength
        if (size > this.config.maxUploadBytes) {
          out.destroy()
          throw new HttpError(413, 'FILE_TOO_LARGE', `文件超过 ${Math.round(this.config.maxUploadBytes / 1024 / 1024)}MB 限制`)
        }
        if (head.length < 64) head = Buffer.concat([head, buffer.subarray(0, 64 - head.length)])
        hash.update(buffer)
        if (!out.write(buffer)) await once(out, 'drain')
      }
      out.end()
      await once(out, 'finish')
      if (size === 0) throw new HttpError(400, 'EMPTY_FILE', '文件为空')
      if (!validateMagic(mime, head)) {
        throw new HttpError(415, 'MEDIA_MISMATCH', '文件内容与声明的类型不符')
      }
      const id = randomUUID()
      const storageKey = attachmentStorageKey(id)
      const attachment = await this.service.createAttachment(auth.user.id, noteId, {
        tempPath,
        storageKey,
        filename,
        mime,
        size,
        sha256: hash.digest('hex'),
      })
      this.sendJson(res, 201, {
        ok: true,
        attachment,
        markdown: imageMime(mime) ? `![${filename}](api/attachments/${attachment.id})` : `[${filename}](api/attachments/${attachment.id})`,
      })
    } catch (error) {
      out.destroy()
      await rm(tempPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private async sendAttachment(req: IncomingMessage, res: ServerResponse, auth: AuthContext, id: string, url: URL): Promise<void> {
    const found = await this.service.statAttachment(auth.user.id, id)
    const download = url.searchParams.get('download') === '1'
    const mime = found.meta.mime
    res.setHeader('Content-Type', mime)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.setHeader('Content-Disposition', contentDisposition(found.meta.filename, download ? 'attachment' : isInlineMime(mime) ? 'inline' : 'attachment'))
    const range = headerValue(req.headers.range)
    if (range !== '') {
      const parsed = parseRange(range, found.size)
      if (parsed === null) {
        res.statusCode = 416
        res.setHeader('Content-Range', `bytes */${found.size}`)
        res.end()
        return
      }
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${parsed.start}-${parsed.end}/${found.size}`)
      res.setHeader('Content-Length', String(parsed.end - parsed.start + 1))
      const stream = createReadStream(found.path, { start: parsed.start, end: parsed.end })
      stream.on('error', () => res.destroy())
      stream.pipe(res)
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Length', String(found.size))
    const stream = createReadStream(found.path)
    stream.on('error', () => {
      if (!res.headersSent) this.sendJson(res, 404, { ok: false, error: { code: 'ATTACHMENT_FILE_MISSING', message: '附件文件不存在' } })
      else res.destroy()
    })
    stream.pipe(res)
  }

  private async sendExport(req: IncomingMessage, res: ServerResponse, auth: AuthContext, id: string, url: URL): Promise<void> {
    const note = this.service.noteDetail(auth.user.id, id)
    const base = this.config.publicUrl !== ''
      ? this.config.publicUrl
      : `${this.isSecure(req) ? 'https' : 'http'}://${headerValue(req.headers.host) || 'localhost'}${this.config.basePath}`
    const content = note.content.replace(/(\]\()api\/attachments\//gu, `$1${base.replace(/\/+$/, '')}/api/attachments/`)
    const filename = `${sanitizeDownloadName(note.title || 'note')}.md`
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
    res.setHeader('Content-Disposition', contentDisposition(filename, 'attachment'))
    res.setHeader('Cache-Control', 'no-store')
    res.end(content)
  }

  private handleEvents(req: IncomingMessage, res: ServerResponse, auth: AuthContext): void {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.write(`event: hello\ndata: ${JSON.stringify({ userId: auth.user.id, time: Date.now() })}\n\n`)
    const client: SseClient = { res, userId: auth.user.id }
    this.sseClients.add(client)
    if (this.heartbeat === null) {
      this.heartbeat = setInterval(() => {
        for (const item of this.sseClients) {
          try {
            item.res.write(': heartbeat\n\n')
          } catch {
            this.sseClients.delete(item)
          }
        }
      }, 25_000)
      this.heartbeat.unref?.()
    }
    const cleanup = (): void => {
      this.sseClients.delete(client)
    }
    req.on('close', cleanup)
    res.on('close', cleanup)
    res.on('error', cleanup)
  }

  private broadcast(userId: string, change: unknown): void {
    const payload = `event: change\ndata: ${JSON.stringify(change)}\n\n`
    for (const client of this.sseClients) {
      if (client.userId !== userId) continue
      try {
        client.res.write(payload)
      } catch {
        this.sseClients.delete(client)
      }
    }
  }

  // -- MCP ------------------------------------------------------------------

  private async handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
      res.statusCode = 405
      res.setHeader('Allow', 'POST')
      res.end()
      return
    }
    const auth = this.authenticate(req)
    if (auth === null || auth.kind !== 'token') {
      res.statusCode = 401
      res.setHeader('WWW-Authenticate', 'Bearer realm="dsh-notes"')
      this.sendJson(res, 401, { ok: false, error: { code: 'AUTH_REQUIRED', message: 'MCP 需要 Bearer 访问令牌' } })
      return
    }
    const limit = this.mcpLimiter.allow(auth.tokenId ?? auth.user.id, 120, 60_000)
    if (!limit.ok) throw new HttpError(429, 'RATE_LIMITED', 'MCP 请求过于频繁', { retryAfter: limit.retryAfter })
    const body = await this.readJson(req, this.config.mcpBodyBytes)
    await handleMcpRequest({
      req,
      res,
      body,
      service: this.service,
      auth,
      version: this.version,
    })
  }

  // -- static ---------------------------------------------------------------

  private async serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string, url: URL): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'METHOD_NOT_ALLOWED', '不支持的方法')
    let decoded: string
    try {
      decoded = decodeURIComponent(pathname)
    } catch {
      throw new HttpError(400, 'BAD_PATH', '路径编码无效')
    }
    if (decoded.includes('\0') || decoded.includes('\\')) throw new HttpError(400, 'BAD_PATH', '路径无效')
    const relative = decoded.replace(/^\/+/, '')
    if (relative.split('/').some((part) => part === '..' || part.startsWith('.'))) {
      throw new HttpError(404, 'NOT_FOUND', '未找到')
    }
    let file = resolve(this.webRoot, relative)
    const rootReal = await realpath(this.webRoot).catch(() => resolve(this.webRoot))
    if (file !== rootReal && !file.startsWith(`${rootReal}${sep}`)) throw new HttpError(404, 'NOT_FOUND', '未找到')
    let info = await stat(file).catch(() => null)
    if (info === null || info.isDirectory()) {
      if (extname(relative) !== '') throw new HttpError(404, 'NOT_FOUND', '未找到')
      file = join(this.webRoot, 'index.html')
      info = await stat(file).catch(() => null)
      if (info === null) throw new HttpError(503, 'UI_NOT_BUILT', 'Web UI 尚未构建，请运行 npm run build')
    }
    if (info === null) throw new HttpError(404, 'NOT_FOUND', '未找到')
    const realFile = await realpath(file).catch(() => file)
    if (realFile !== rootReal && !realFile.startsWith(`${rootReal}${sep}`)) throw new HttpError(404, 'NOT_FOUND', '未找到')
    const extension = extname(file).toLowerCase()
    const type = MIME[extension] ?? 'application/octet-stream'
    res.setHeader('Content-Type', type)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (extension === '.html') {
      res.setHeader('Cache-Control', 'no-store')
      if (method === 'HEAD') {
        res.statusCode = 200
        res.end()
        return
      }
      const html = await readFile(file, 'utf8')
      const baseHref = `${this.config.basePath === '' ? '' : this.config.basePath}/`
      const rendered = html.replace('__BASE_HREF__', escapeHtmlAttr(baseHref))
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(rendered)
      return
    }
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('Content-Length', String(info.size))
    if (method === 'HEAD') {
      res.statusCode = 200
      res.end()
      return
    }
    res.statusCode = 200
    const stream = createReadStream(file)
    stream.on('error', () => res.destroy())
    stream.pipe(res)
  }

  // -- request helpers ------------------------------------------------------

  private async readJson(req: IncomingMessage, limit = JSON_LIMIT): Promise<Record<string, unknown>> {
    const essence = headerValue(req.headers['content-type']).split(';', 1)[0]?.trim().toLowerCase() ?? ''
    if (essence !== 'application/json') throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', '请求必须使用 application/json')
    const length = Number(req.headers['content-length'] ?? 0)
    if (Number.isFinite(length) && length > limit) throw new HttpError(413, 'BODY_TOO_LARGE', '请求体过大')
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
      size += buffer.byteLength
      if (size > limit) throw new HttpError(413, 'BODY_TOO_LARGE', '请求体过大')
      chunks.push(buffer)
    }
    if (chunks.length === 0) return {}
    let parsed: unknown
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      throw new HttpError(400, 'INVALID_JSON', 'JSON 格式错误')
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new HttpError(400, 'INVALID_JSON', '请求体必须是 JSON 对象')
    }
    return parsed as Record<string, unknown>
  }

  private sendJson(res: ServerResponse, status: number, body: unknown): void {
    if (res.headersSent) {
      res.end()
      return
    }
    const text = JSON.stringify(body)
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Length', String(Buffer.byteLength(text)))
    res.end(text)
  }

  private sendError(req: IncomingMessage, res: ServerResponse, error: unknown): void {
    if (res.headersSent) {
      res.destroy()
      return
    }
    let status = 500
    let code = 'INTERNAL_ERROR'
    let message = '服务器内部错误'
    let extra: Record<string, unknown> = {}
    if (error instanceof HttpError) {
      status = error.status
      code = error.code
      message = error.message
      extra = error.extra
    } else if (error instanceof ServiceError) {
      status = error.status
      code = error.code
      message = error.message
      extra = error.extra
    } else if (error instanceof Error) {
      this.logger.error(`${req.method ?? 'GET'} ${req.url ?? '/'}`, error)
    }
    if (status === 429 && extra.retryAfter !== undefined) {
      res.setHeader('Retry-After', String(extra.retryAfter))
    }
    if (status === 401) res.setHeader('WWW-Authenticate', 'Bearer realm="dsh-notes"')
    const body: Record<string, unknown> = { ok: false, error: { code, message, ...(extra.retryAfter !== undefined ? { retryAfter: extra.retryAfter } : {}) } }
    if (extra.current !== undefined) body.current = extra.current
    this.sendJson(res, status, body)
  }

  /** Wire the service change stream into SSE. */
  attachChangeStream(): void {
    this.service.onChange(({ userId, change }) => this.broadcast(userId, change))
  }
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function folderValue(value: unknown): string | null {
  if (value === null) return null
  return typeof value === 'string' ? value : null
}

function imageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

function sanitizeDownloadName(value: string): string {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/gu, '_').trim().slice(0, 120) || 'note'
}

function contentDisposition(filename: string, mode: 'inline' | 'attachment'): string {
  const fallback = filename.replace(/[^\x20-\x7e]/gu, '_').replace(/["\\]/gu, '_')
  return `${mode}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim())
  if (match === null) return null
  const startRaw = match[1] ?? ''
  const endRaw = match[2] ?? ''
  if (startRaw === '' && endRaw === '') return null
  let start: number
  let end: number
  if (startRaw === '') {
    const suffix = Number(endRaw)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(startRaw)
    end = endRaw === '' ? size - 1 : Number(endRaw)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return null
  return { start, end: Math.min(end, size - 1) }
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))
}

export type { AttachmentMeta, NoteDetail, SearchResult, VersionDetail, VersionSummary }
