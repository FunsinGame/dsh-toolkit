/**
 * Same-origin /dsh-notes API used by the DSH activity page.
 *
 * The routes live on DSH's existing Web server, so the plugin opens no new
 * port. Every request passes DSH's connection trust fence; the remote notes
 * token never leaves the host process.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Logger } from '../server/logger.ts'
import type { NotesHost } from './host.ts'
import type { SettingsPatch } from './settings.ts'

const PREFIX = '/dsh-notes'
const BODY_LIMIT = 1024 * 1024

interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

interface ConnectionLike {
  requestRejection?(request: { readonly headers: IncomingMessage['headers'] }): 401 | 403 | undefined
}

export interface HostRouteOptions {
  host: NotesHost
  webServer: WebServerLike
  connectionOf: () => ConnectionLike | null | undefined
  logger: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>
}

class RouteError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function registerHostRoutes(options: HostRouteOptions): () => void {
  const { host, webServer, connectionOf, logger } = options
  return webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: (req, res) => handle(req, res, host, connectionOf, logger),
  })
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  host: NotesHost,
  connectionOf: () => ConnectionLike | null | undefined,
  logger: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>,
): Promise<void> {
  try {
    const rejection = connectionOf()?.requestRejection?.(req)
    if (rejection !== undefined) {
      res.statusCode = rejection
      res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
      return
    }
    const url = new URL(req.url ?? '/', 'http://dsh-notes.invalid')
    let pathname = url.pathname
    if (!pathname.startsWith(PREFIX)) throw new RouteError(404, 'NOT_FOUND', '未找到')
    pathname = pathname.slice(PREFIX.length) || '/'
    const segments = pathname.split('/').filter((part) => part !== '').map((part) => decodeURIComponent(part))
    const method = (req.method ?? 'GET').toUpperCase()

    if (segments.length === 0 && method === 'GET') {
      sendJson(res, 200, { ok: true, state: host.state() })
      return
    }
    if (segments[0] === 'state' && method === 'GET') {
      sendJson(res, 200, { ok: true, state: host.state() })
      return
    }
    if (segments[0] === 'tree' && method === 'GET') {
      sendJson(res, 200, { ok: true, tree: host.tree() })
      return
    }
    if (segments[0] === 'search' && method === 'GET') {
      const query = url.searchParams.get('q') ?? ''
      sendJson(res, 200, { ok: true, results: host.search(query, Number(url.searchParams.get('limit') ?? 50)) })
      return
    }
    if (segments[0] === 'recent' && method === 'GET') {
      sendJson(res, 200, { ok: true, notes: host.recent(Number(url.searchParams.get('limit') ?? 20)) })
      return
    }
    if (segments[0] === 'trash' && method === 'GET') {
      sendJson(res, 200, { ok: true, notes: await host.getTrash() })
      return
    }
    if (segments[0] === 'sync' && method === 'POST') {
      sendJson(res, 200, { ok: true, state: await host.syncNow() })
      return
    }
    if (segments[0] === 'settings') {
      if (method === 'GET') {
        sendJson(res, 200, { ok: true, settings: host.settings() })
        return
      }
      if (method === 'PUT') {
        const body = await readJson(req)
        const state = await host.saveSettings({
          serverUrl: typeof body.serverUrl === 'string' ? body.serverUrl : undefined,
          token: typeof body.token === 'string' ? body.token : undefined,
          autoSyncSeconds: body.autoSyncSeconds === undefined ? undefined : Number(body.autoSyncSeconds),
          quickSync: body.quickSync === undefined ? undefined : body.quickSync === true,
        } satisfies SettingsPatch)
        sendJson(res, 200, { ok: true, state })
        return
      }
      if (method === 'POST' && segments[1] === 'test') {
        const body = await readJson(req)
        const result = await host.testConnection({
          serverUrl: typeof body.serverUrl === 'string' ? body.serverUrl : undefined,
          token: typeof body.token === 'string' ? body.token : undefined,
        })
        sendJson(res, 200, { ok: true, ...result })
        return
      }
      throw new RouteError(405, 'METHOD_NOT_ALLOWED', '不支持的方法')
    }
    if (segments[0] === 'conflicts') {
      if (segments[1] === undefined && method === 'GET') {
        sendJson(res, 200, { ok: true, conflicts: host.conflicts() })
        return
      }
      if (segments[1] !== undefined && segments[2] === undefined && method === 'GET') {
        const conflict = host.conflict(segments[1])
        if (conflict === null) throw new RouteError(404, 'CONFLICT_NOT_FOUND', '冲突不存在')
        sendJson(res, 200, { ok: true, conflict })
        return
      }
      if (segments[1] !== undefined && segments[2] === 'resolve' && method === 'POST') {
        const body = await readJson(req)
        const strategy = body.strategy
        if (strategy !== 'server' && strategy !== 'local' && strategy !== 'copy') {
          throw new RouteError(400, 'INVALID_STRATEGY', 'strategy 必须是 server/local/copy')
        }
        sendJson(res, 200, { ok: true, state: host.resolveConflict(segments[1], strategy) })
        return
      }
      throw new RouteError(404, 'NOT_FOUND', '未找到')
    }
    if (segments[0] === 'versions') {
      if (segments[1] === undefined && method === 'GET') {
        const noteId = url.searchParams.get('noteId') ?? ''
        if (noteId === '') throw new RouteError(400, 'NOTE_ID_REQUIRED', '缺少 noteId')
        sendJson(res, 200, { ok: true, versions: await host.getVersions(noteId) })
        return
      }
      if (segments[1] !== undefined && segments[2] !== undefined && method === 'GET') {
        sendJson(res, 200, { ok: true, version: await host.getVersion(segments[1], Number(segments[2])) })
        return
      }
      if (segments[1] === 'restore' && method === 'POST') {
        const body = await readJson(req)
        const noteId = typeof body.noteId === 'string' ? body.noteId : ''
        if (noteId === '') throw new RouteError(400, 'NOTE_ID_REQUIRED', '缺少 noteId')
        sendJson(res, 200, { ok: true, note: await host.revertNote(noteId, Number(body.revision)) })
        return
      }
      throw new RouteError(404, 'NOT_FOUND', '未找到')
    }
    if (segments[0] === 'notes') {
      const id = segments[1]
      if (id === undefined && method === 'POST') {
        const body = await readJson(req)
        const note = host.createNote({
          id: typeof body.id === 'string' ? body.id : undefined,
          folderId: body.folderId === null ? null : typeof body.folderId === 'string' ? body.folderId : null,
          title: typeof body.title === 'string' ? body.title : undefined,
          content: typeof body.content === 'string' ? body.content : undefined,
          tags: Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
          pinned: body.pinned === true,
          opId: typeof body.opId === 'string' ? body.opId : undefined,
        })
        sendJson(res, 201, { ok: true, note })
        return
      }
      if (id === undefined) throw new RouteError(405, 'METHOD_NOT_ALLOWED', '不支持的方法')
      if (segments[2] === 'attachments' && method === 'POST') {
        const payload = await host.uploadFromRequest(id, req)
        sendJson(res, 201, payload)
        return
      }
      if (segments[2] === 'restore' && method === 'POST') {
        sendJson(res, 200, { ok: true, note: await host.restoreNote(id) })
        return
      }
      if (segments[2] === 'move' && method === 'POST') {
        const body = await readJson(req)
        const folderId = body.folderId === null ? null : typeof body.folderId === 'string' ? body.folderId : null
        sendJson(res, 200, { ok: true, note: host.moveNote(id, folderId, Number(body.baseRevision)) })
        return
      }
      if (segments[2] !== undefined) throw new RouteError(404, 'NOT_FOUND', '未找到')
      if (method === 'GET') {
        sendJson(res, 200, { ok: true, note: await host.getNote(id) })
        return
      }
      if (method === 'PUT') {
        const body = await readJson(req)
        const note = host.updateNote(id, {
          baseRevision: Number(body.baseRevision),
          title: body.title === undefined ? undefined : String(body.title),
          content: body.content === undefined ? undefined : String(body.content),
          tags: Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
          pinned: body.pinned === undefined ? undefined : body.pinned === true,
          folderId: body.folderId === undefined ? undefined : body.folderId === null ? null : String(body.folderId),
          opId: typeof body.opId === 'string' ? body.opId : undefined,
        })
        sendJson(res, 200, { ok: true, note })
        return
      }
      if (method === 'DELETE') {
        const permanent = url.searchParams.get('permanent') === '1'
        await host.deleteNote(id, permanent)
        sendJson(res, 200, { ok: true })
        return
      }
      throw new RouteError(405, 'METHOD_NOT_ALLOWED', '不支持的方法')
    }
    if (segments[0] === 'folders') {
      const id = segments[1]
      if (id === undefined && method === 'POST') {
        const body = await readJson(req)
        const folder = host.createFolder({
          id: typeof body.id === 'string' ? body.id : undefined,
          parentId: body.parentId === null ? null : typeof body.parentId === 'string' ? body.parentId : null,
          name: typeof body.name === 'string' ? body.name : '',
        })
        sendJson(res, 201, { ok: true, folder })
        return
      }
      if (id !== undefined && method === 'PATCH') {
        const body = await readJson(req)
        const folder = host.updateFolder(id, {
          baseRevision: Number(body.baseRevision),
          name: body.name === undefined ? undefined : String(body.name),
          parentId: body.parentId === undefined ? undefined : body.parentId === null ? null : String(body.parentId),
        })
        sendJson(res, 200, { ok: true, folder })
        return
      }
      if (id !== undefined && method === 'DELETE') {
        const recursive = url.searchParams.get('recursive') === '1'
        host.deleteFolder(id, recursive)
        sendJson(res, 200, { ok: true })
        return
      }
      throw new RouteError(405, 'METHOD_NOT_ALLOWED', '不支持的方法')
    }
    if (segments[0] === 'attachments' && segments[1] !== undefined) {
      if (method === 'GET') {
        await host.pipeAttachment(segments[1], req, res)
        return
      }
      if (method === 'DELETE') {
        await host.deleteAttachment(segments[1])
        sendJson(res, 200, { ok: true })
        return
      }
      throw new RouteError(405, 'METHOD_NOT_ALLOWED', '不支持的方法')
    }
    throw new RouteError(404, 'NOT_FOUND', '未找到')
  } catch (error) {
    if (res.headersSent) {
      res.destroy()
      return
    }
    const status = error instanceof RouteError ? error.status : error instanceof Error && /不存在/.test(error.message) ? 404 : 400
    const code = error instanceof RouteError ? error.code : 'REQUEST_FAILED'
    const message = error instanceof Error ? error.message : String(error)
    if (status >= 500) logger.error('host route failed', error)
    else logger.debug(`host route ${req.method ?? 'GET'} ${req.url ?? '/'} -> ${status}: ${message}`)
    sendJson(res, status, { ok: false, error: { code, message } })
  }
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const essence = String(req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
  if (essence !== 'application/json') throw new RouteError(415, 'UNSUPPORTED_MEDIA_TYPE', '请求必须使用 application/json')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += buffer.byteLength
    if (size > BODY_LIMIT) throw new RouteError(413, 'BODY_TOO_LARGE', '请求体过大')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new RouteError(400, 'INVALID_JSON', 'JSON 格式错误')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RouteError(400, 'INVALID_JSON', '请求体必须是 JSON 对象')
  }
  return parsed as Record<string, unknown>
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Length', String(Buffer.byteLength(text)))
  res.end(text)
}
