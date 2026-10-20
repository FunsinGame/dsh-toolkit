/** HTTP client used by the DSH host plugin to reach the remote notes server. */

import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { PassThrough, type Readable } from 'node:stream'
import type {
  AttachmentMeta,
  ChangesResult,
  FolderMeta,
  NoteDetail,
  NoteMeta,
  SearchResult,
  VersionDetail,
  VersionSummary,
} from '../shared/types.ts'

export class RemoteError extends Error {
  readonly status: number
  readonly code: string
  readonly payload: unknown

  constructor(message: string, options: { status?: number; code?: string; payload?: unknown } = {}) {
    super(message)
    this.name = 'RemoteError'
    this.status = options.status ?? 0
    this.code = options.code ?? 'REMOTE_FAILED'
    this.payload = options.payload
  }
}

export interface RemoteBootstrap {
  server: { id: string; version: string; time: number }
  cursor: number
  folders: FolderMeta[]
  notes: NoteMeta[]
  attachments: AttachmentMeta[]
  user: { id: string; username: string; displayName: string }
}

function joinUrl(baseUrl: string, path: string): URL {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return new URL(path.replace(/^\/+/, ''), base)
}

export class RemoteClient {
  readonly baseUrl: string
  readonly token: string

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/u, '')
    this.token = token
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      accept: 'application/json',
      ...extra,
    }
  }

  async request<T>(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
    let response: Response
    try {
      response = await fetch(joinUrl(this.baseUrl, path), {
        ...init,
        headers: this.headers(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw new RemoteError(`无法连接笔记服务器：${error instanceof Error ? error.message : String(error)}`)
    }
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      throw new RemoteError(`笔记服务器返回了非 JSON 响应（HTTP ${response.status}）`, { status: response.status })
    }
    if (!response.ok || (payload as { ok?: boolean } | null)?.ok === false) {
      const body = payload as { error?: { code?: string; message?: string } } | null
      throw new RemoteError(body?.error?.message ?? `请求失败（HTTP ${response.status}）`, {
        status: response.status,
        code: body?.error?.code ?? 'REMOTE_FAILED',
        payload,
      })
    }
    return payload as T
  }

  async health(): Promise<{ server: { id: string; version: string }; counts: { notes: number } }> {
    const data = await this.request<{ server: { id: string; version: string }; counts: { notes: number } }>('api/health')
    return data
  }

  async session(): Promise<{ user: { id: string; username: string; displayName: string }; auth: { kind: string; scopes: string[] } }> {
    return this.request('api/auth/session')
  }

  async bootstrap(): Promise<RemoteBootstrap> {
    const data = await this.request<RemoteBootstrap & { ok: true }>('api/sync/bootstrap')
    return data
  }

  async changes(since: number, limit = 500): Promise<ChangesResult> {
    return this.request<ChangesResult>(`api/changes?since=${since}&limit=${limit}`)
  }

  async getNote(id: string): Promise<NoteDetail> {
    const data = await this.request<{ note: NoteDetail }>(`api/notes/${encodeURIComponent(id)}`)
    return data.note
  }

  async createNote(input: {
    id?: string
    folderId?: string | null
    title?: string
    content?: string
    tags?: string[]
    pinned?: boolean
    opId?: string
  }): Promise<NoteDetail> {
    const data = await this.request<{ note: NoteDetail }>('api/notes', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return data.note
  }

  async updateNote(id: string, input: {
    baseRevision: number
    title?: string
    content?: string
    tags?: string[]
    pinned?: boolean
    folderId?: string | null
    opId?: string
  }): Promise<NoteDetail> {
    const data = await this.request<{ note: NoteDetail }>(`api/notes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    return data.note
  }

  async deleteNote(id: string, permanent = false): Promise<void> {
    await this.request(`api/notes/${encodeURIComponent(id)}${permanent ? '?permanent=1' : ''}`, { method: 'DELETE' })
  }

  async restoreNote(id: string): Promise<NoteDetail> {
    const data = await this.request<{ note: NoteDetail }>(`api/notes/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: '{}',
    })
    return data.note
  }

  async moveNote(id: string, folderId: string | null, baseRevision: number): Promise<NoteDetail> {
    const data = await this.request<{ note: NoteDetail }>(`api/notes/${encodeURIComponent(id)}/move`, {
      method: 'POST',
      body: JSON.stringify({ folderId, baseRevision }),
    })
    return data.note
  }

  async createFolder(input: { id?: string; parentId?: string | null; name: string; opId?: string }): Promise<FolderMeta> {
    const data = await this.request<{ folder: FolderMeta }>('api/folders', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return data.folder
  }

  async updateFolder(id: string, input: { baseRevision: number; name?: string; parentId?: string | null; opId?: string }): Promise<FolderMeta> {
    const data = await this.request<{ folder: FolderMeta }>(`api/folders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    return data.folder
  }

  async deleteFolder(id: string, recursive = false): Promise<void> {
    await this.request(`api/folders/${encodeURIComponent(id)}${recursive ? '?recursive=1' : ''}`, { method: 'DELETE' })
  }

  async listTrash(): Promise<NoteMeta[]> {
    const data = await this.request<{ notes: NoteMeta[] }>('api/trash')
    return data.notes
  }

  async getVersions(noteId: string): Promise<VersionSummary[]> {
    const data = await this.request<{ versions: VersionSummary[] }>(`api/notes/${encodeURIComponent(noteId)}/versions`)
    return data.versions
  }

  async getVersion(noteId: string, revision: number): Promise<VersionDetail> {
    const data = await this.request<{ version: VersionDetail }>(`api/notes/${encodeURIComponent(noteId)}/versions/${revision}`)
    return data.version
  }

  async revertNote(noteId: string, revision: number): Promise<NoteDetail> {
    const data = await this.request<{ note: NoteDetail }>(`api/notes/${encodeURIComponent(noteId)}/revert`, {
      method: 'POST',
      body: JSON.stringify({ revision }),
    })
    return data.note
  }

  async search(query: string, limit = 50): Promise<SearchResult[]> {
    const data = await this.request<{ results: SearchResult[] }>(`api/search?q=${encodeURIComponent(query)}&limit=${limit}`)
    return data.results
  }

  async deleteAttachment(id: string): Promise<void> {
    await this.request(`api/attachments/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  /** Stream a browser upload to the remote server without buffering it. */
  uploadFromRequest(noteId: string, req: IncomingMessage): Promise<unknown> {
    return this.sendUpload(noteId, req, {
      contentType: String(req.headers['content-type'] ?? 'application/octet-stream'),
      fileName: String(req.headers['x-file-name'] ?? ''),
      contentLength: req.headers['content-length'],
    })
  }

  uploadBuffer(noteId: string, filename: string, mime: string, buffer: Buffer): Promise<unknown> {
    const stream = new PassThrough()
    stream.end(buffer)
    return this.sendUpload(noteId, stream, {
      contentType: mime,
      fileName: encodeURIComponent(filename),
      contentLength: String(buffer.byteLength),
    })
  }

  private sendUpload(noteId: string, source: Readable, meta: { contentType: string; fileName: string; contentLength?: string | number }): Promise<unknown> {
    const url = joinUrl(this.baseUrl, `api/notes/${encodeURIComponent(noteId)}/attachments`)
    const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest
    return new Promise((resolveUpload, rejectUpload) => {
      const request = requestFn(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.token}`,
          accept: 'application/json',
          'content-type': meta.contentType,
          ...(meta.fileName === '' ? {} : { 'x-file-name': meta.fileName }),
          ...(meta.contentLength === undefined ? {} : { 'content-length': String(meta.contentLength) }),
        },
        timeout: 10 * 60_000,
      }, (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let payload: unknown = null
          try {
            payload = JSON.parse(text)
          } catch {
            rejectUpload(new RemoteError(`上传返回了非 JSON 响应（HTTP ${response.statusCode ?? 0}）`, { status: response.statusCode }))
            return
          }
          const status = response.statusCode ?? 0
          if (status < 200 || status >= 300) {
            const body = payload as { error?: { code?: string; message?: string } }
            rejectUpload(new RemoteError(body.error?.message ?? `上传失败（HTTP ${status}）`, {
              status,
              code: body.error?.code,
              payload,
            }))
            return
          }
          resolveUpload(payload)
        })
      })
      request.on('error', (error) => rejectUpload(new RemoteError(`上传失败：${error.message}`)))
      request.on('timeout', () => {
        request.destroy()
        rejectUpload(new RemoteError('上传超时'))
      })
      source.on('error', (error) => request.destroy(error))
      source.pipe(request)
    })
  }

  /** Proxy an attachment with Range support. Resolves when the response ends. */
  pipeAttachment(id: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = joinUrl(this.baseUrl, `api/attachments/${encodeURIComponent(id)}`)
    const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest
    return new Promise((resolvePipe, rejectPipe) => {
      const request = requestFn(url, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${this.token}`,
          accept: '*/*',
          ...(typeof req.headers.range === 'string' ? { range: req.headers.range } : {}),
        },
        timeout: 60_000,
      }, (response) => {
        const status = response.statusCode ?? 502
        const contentType = String(response.headers['content-type'] ?? 'application/octet-stream')
        if (status >= 400) {
          const chunks: Buffer[] = []
          response.on('data', (chunk: Buffer) => chunks.push(chunk))
          response.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8')
            if (!res.headersSent) {
              res.statusCode = status
              res.setHeader('Content-Type', contentType)
              res.end(text)
            }
            resolvePipe()
          })
          return
        }
        res.statusCode = status
        for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'content-disposition']) {
          const value = response.headers[key]
          if (value !== undefined) res.setHeader(key, value)
        }
        res.setHeader('X-Content-Type-Options', 'nosniff')
        response.on('error', (error) => {
          if (!res.headersSent) {
            res.statusCode = 502
            res.end(String(error.message))
          } else res.destroy()
          resolvePipe()
        })
        response.pipe(res)
        res.on('close', () => {
          response.destroy()
          resolvePipe()
        })
      })
      request.on('error', (error) => rejectPipe(new RemoteError(`读取附件失败：${error.message}`)))
      request.on('timeout', () => {
        request.destroy()
        rejectPipe(new RemoteError('读取附件超时'))
      })
      request.end()
    })
  }
}
