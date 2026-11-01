/**
 * Same-origin `/dsh-design-mind` API used by the activity page.
 *
 * The routes live on DSH's existing Web server, so the plugin opens no new port.
 * Every request passes DSH's connection trust fence first. The browser only
 * ever talks to its own origin; the host owns the export directory.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { buildFeedback, buildPrompt, InputError, normalizeComments, FEEDBACK_SCHEMA } from './feedback.ts'
import { cleanExports, commitExport, createExport, requireExportDir } from './exports.ts'
import { openDirectory as revealDirectory } from './reveal.ts'
import {
  detectImageFormat,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  MAX_IMAGE_PIXELS,
  writeImageFile,
  type ImageFormat,
} from './imageInfo.ts'

export const PREFIX = '/dsh-design-mind'

const JSON_BODY_LIMIT = 1024 * 1024
const JSON_CONTENT_TYPE = 'application/json'

interface ConnectionLike {
  requestRejection?(request: { readonly headers: IncomingMessage['headers'] }): 401 | 403 | undefined
}

interface LoggerLike {
  info?: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  debug?: (...args: unknown[]) => void
}

export interface HostRouteDeps {
  /** Directory containing every export; resolved by the caller. */
  root: string
  version: string
  logger?: LoggerLike
  connectionOf?: () => ConnectionLike | null | undefined
  /** Opens the export root in the OS file manager; injected by the tests. */
  openDirectory?: (directory: string) => Promise<void>
}

interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

export interface RegisterHostRouteOptions extends HostRouteDeps {
  webServer: WebServerLike
}

/** Build the request handler without touching DSH; used by the tests too. */
export function createRouteHandler(deps: HostRouteDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    try {
      const rejection = deps.connectionOf?.()?.requestRejection?.({ headers: req.headers })
      if (rejection !== undefined) {
        res.statusCode = rejection
        res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
        return
      }
      await dispatch(req, res, deps)
    } catch (error) {
      if (res.headersSent) {
        res.destroy()
        return
      }
      const status = error instanceof InputError ? error.status : 500
      const code = error instanceof InputError ? error.code : 'internal_error'
      const message = error instanceof Error ? error.message : String(error)
      if (status >= 500) {
        deps.logger?.error('design-mind route failed', error)
        sendJson(res, status, { ok: false, error: { code, message: '导出失败，请查看 DSH 日志' } })
        return
      }
      deps.logger?.debug?.(`design-mind route ${req.method ?? 'GET'} ${req.url ?? '/'} -> ${status}: ${message}`)
      sendJson(res, status, { ok: false, error: { code, message } })
    }
  }
}

export function registerHostRoutes(options: RegisterHostRouteOptions): () => void {
  return options.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: createRouteHandler(options),
  })
}

async function dispatch(req: IncomingMessage, res: ServerResponse, deps: HostRouteDeps): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://dsh-design-mind.invalid')
  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    throw new InputError(400, 'bad_path', '路径格式不正确')
  }
  if (pathname !== PREFIX && !pathname.startsWith(`${PREFIX}/`)) {
    throw new InputError(404, 'not_found', '未找到')
  }
  const segments = pathname
    .slice(PREFIX.length)
    .split('/')
    .filter((part) => part !== '')
  const method = (req.method ?? 'GET').toUpperCase()

  if (segments.length === 0 && method === 'GET') {
    sendJson(res, 200, { ok: true, name: 'dsh-design-mind', version: deps.version })
    return
  }

  if (segments[0] === 'exports') {
    if (segments.length === 1 && method === 'POST') {
      // Drain the (usually empty) JSON body so keep-alive connections are not
      // left with unread bytes.
      await readBody(req, 64 * 1024)
      const created = await createExport(deps.root)
      sendJson(res, 201, { ok: true, exportId: created.id, dir: created.dir })
      return
    }

    // Maintenance endpoints never accept a path from the request: they always
    // act on the plugin's own export root.
    if (segments.length === 2 && segments[1] === 'open' && method === 'POST') {
      const reveal = deps.openDirectory ?? revealDirectory
      try {
        await reveal(deps.root)
      } catch (error) {
        deps.logger?.warn('design-mind: cannot open export directory', error)
        throw new InputError(500, 'reveal_failed', '无法打开导出目录，请手动复制路径')
      }
      sendJson(res, 200, { ok: true, dir: deps.root })
      return
    }
    if (segments.length === 2 && segments[1] === 'clean' && method === 'POST') {
      const result = await cleanExports(deps.root)
      deps.logger?.info?.('design-mind: cleaned exports', result)
      sendJson(res, 200, { ok: true, removed: result.removed, bytes: result.bytes })
      return
    }

    const id = segments[1]
    if (id !== undefined && segments.length === 3 && segments[2] === 'image' && method === 'PUT') {
      await uploadImage(req, res, deps, id)
      return
    }
    if (id !== undefined && segments.length === 3 && segments[2] === 'commit' && method === 'POST') {
      await commitReview(req, res, deps, id)
      return
    }
  }

  throw new InputError(404, 'not_found', '未找到')
}

async function uploadImage(
  req: IncomingMessage,
  res: ServerResponse,
  deps: HostRouteDeps,
  id: string,
): Promise<void> {
  const dir = await requireExportDir(deps.root, id)
  const contentType = String(req.headers['content-type'] ?? '')
    .split(';', 1)[0]
    ?.trim()
    .toLowerCase()
  if (
    contentType !== undefined &&
    contentType !== '' &&
    contentType !== 'image/png' &&
    contentType !== 'image/jpeg' &&
    contentType !== 'application/octet-stream'
  ) {
    throw new InputError(415, 'unsupported_media_type', '只支持 PNG 或 JPEG 图片')
  }

  const bytes = await readBody(req, MAX_IMAGE_BYTES)
  if (bytes.length === 0) throw new InputError(400, 'empty_image', '图片内容为空')

  const format = detectImageFormat(bytes)
  if (format === null) throw new InputError(415, 'unsupported_image', '无法识别图片格式，只支持 PNG 或 JPEG')
  if (format.width * format.height > MAX_IMAGE_PIXELS || Math.max(format.width, format.height) > MAX_IMAGE_EDGE) {
    throw new InputError(413, 'image_too_large', '图片尺寸超出上限，请缩小后再试')
  }

  // A retried upload replaces this export's own picture, never another file.
  await rm(join(dir, 'design.png'), { force: true })
  await rm(join(dir, 'design.jpg'), { force: true })
  const file = `design.${format.extension}`
  const written = await writeImageFile(dir, file, bytes)
  sendJson(res, 200, {
    ok: true,
    file,
    mimeType: format.mimeType,
    width: format.width,
    height: format.height,
    sha256: written.sha256,
    bytes: written.size,
  })
}

async function commitReview(
  req: IncomingMessage,
  res: ServerResponse,
  deps: HostRouteDeps,
  id: string,
): Promise<void> {
  const dir = await requireExportDir(deps.root, id)
  const body = await readJson(req, JSON_BODY_LIMIT)
  const image = await readExportedImage(dir)
  const comments = normalizeComments(body.objects, image.format.width, image.format.height)
  const feedback = buildFeedback({
    version: deps.version,
    image: {
      file: image.file,
      mimeType: image.format.mimeType,
      width: image.format.width,
      height: image.format.height,
      sha256: image.sha256,
    },
    comments,
  })
  const jsonPath = await commitExport(dir, feedback)
  const imagePath = join(dir, image.file)
  sendJson(res, 201, {
    ok: true,
    dir,
    imagePath,
    jsonPath,
    prompt: buildPrompt({ imagePath, jsonPath, comments }),
    schemaVersion: FEEDBACK_SCHEMA,
    count: comments.length,
  })
}

interface ExportedImage {
  file: string
  format: ImageFormat
  sha256: string
}

async function readExportedImage(dir: string): Promise<ExportedImage> {
  for (const file of ['design.png', 'design.jpg'] as const) {
    try {
      const bytes = await readFile(join(dir, file))
      const format = detectImageFormat(bytes)
      if (format === null || format.extension !== file.slice(-3)) continue
      return {
        file,
        format,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }
    } catch {
      // Try the other extension; a missing file is reported once below.
    }
  }
  throw new InputError(409, 'image_missing', '这次导出还没有图片')
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? '')
  if (Number.isFinite(declared) && declared > limit) {
    throw new InputError(413, 'body_too_large', '请求体过大')
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += buffer.byteLength
    if (size > limit) throw new InputError(413, 'body_too_large', '请求体过大')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

async function readJson(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const essence = String(req.headers['content-type'] ?? '')
    .split(';', 1)[0]
    ?.trim()
    .toLowerCase()
  if (essence !== JSON_CONTENT_TYPE) {
    throw new InputError(415, 'unsupported_media_type', '请求必须使用 application/json')
  }
  const bytes = await readBody(req, limit)
  if (bytes.length === 0) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new InputError(400, 'invalid_json', 'JSON 格式错误')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InputError(400, 'invalid_json', '请求体必须是 JSON 对象')
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
