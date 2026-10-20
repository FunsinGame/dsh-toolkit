/**
 * Standalone web backend: direct HTTP + SSE against the notes server.
 */

import type { AppBackend, AppCapabilities } from '../shared/ui/backend.ts'
import type {
  AttachmentMeta,
  ConflictDetail,
  FolderCreateInput,
  FolderMeta,
  FolderUpdateInput,
  HostState,
  NoteCreateInput,
  NoteDetail,
  NoteMeta,
  NoteUpdateInput,
  SearchResult,
  TreeSnapshot,
  VersionDetail,
  VersionSummary,
} from '../shared/types.ts'
import { AuthRequiredError, NotesApiError } from '../shared/errors.ts'

function apiUrl(path: string): string {
  return new URL(path.replace(/^\/+/, ''), document.baseURI).href
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
  }
  if (method !== 'GET' && method !== 'HEAD') headers['x-notes-request'] = '1'
  const response = await fetch(apiUrl(path), {
    credentials: 'same-origin',
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
  })
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    throw new NotesApiError(`服务器返回了非 JSON 响应（HTTP ${response.status}）`, { status: response.status })
  }
  if (response.status === 401) {
    throw new AuthRequiredError((payload as { error?: { message?: string } } | null)?.error?.message ?? '需要登录')
  }
  if (!response.ok || (payload as { ok?: boolean } | null)?.ok === false) {
    const body = payload as { error?: { code?: string; message?: string } } | null
    throw new NotesApiError(body?.error?.message ?? `请求失败（HTTP ${response.status}）`, {
      status: response.status,
      code: body?.error?.code ?? 'REQUEST_FAILED',
      payload,
    })
  }
  return payload as T
}

export class WebBackend implements AppBackend {
  readonly kind = 'web' as const
  readonly label = 'Web'
  readonly capabilities: AppCapabilities = {
    sync: false,
    settings: false,
    conflicts: false,
    versions: true,
    trash: true,
    offline: false,
  }

  async getSession(): Promise<{ username: string; displayName: string } | null> {
    try {
      const data = await request<{ user: { username: string; displayName: string } }>('api/auth/session')
      return data.user
    } catch (error) {
      if (error instanceof AuthRequiredError) return null
      throw error
    }
  }

  async login(username: string, password: string): Promise<void> {
    await request('api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  }

  async logout(): Promise<void> {
    await request('api/auth/logout', { method: 'POST', body: '{}' }).catch(() => undefined)
  }

  async getTree(): Promise<TreeSnapshot> {
    const data = await request<{ tree: TreeSnapshot }>('api/tree')
    return data.tree
  }

  async getNote(id: string): Promise<NoteDetail> {
    const data = await request<{ note: NoteDetail }>(`api/notes/${encodeURIComponent(id)}`)
    return data.note
  }

  async createNote(input: NoteCreateInput): Promise<NoteDetail> {
    const data = await request<{ note: NoteDetail }>('api/notes', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return data.note
  }

  async updateNote(id: string, input: NoteUpdateInput): Promise<NoteDetail> {
    const data = await request<{ note: NoteDetail }>(`api/notes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    return data.note
  }

  async deleteNote(id: string, permanent = false): Promise<void> {
    await request(`api/notes/${encodeURIComponent(id)}${permanent ? '?permanent=1' : ''}`, { method: 'DELETE' })
  }

  async restoreNote(id: string): Promise<NoteDetail> {
    const data = await request<{ note: NoteDetail }>(`api/notes/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: '{}',
    })
    return data.note
  }

  async moveNote(id: string, folderId: string | null, baseRevision: number): Promise<NoteDetail> {
    const data = await request<{ note: NoteDetail }>(`api/notes/${encodeURIComponent(id)}/move`, {
      method: 'POST',
      body: JSON.stringify({ folderId, baseRevision }),
    })
    return data.note
  }

  async createFolder(input: FolderCreateInput): Promise<FolderMeta> {
    const data = await request<{ folder: FolderMeta }>('api/folders', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return data.folder
  }

  async updateFolder(id: string, input: FolderUpdateInput): Promise<FolderMeta> {
    const data = await request<{ folder: FolderMeta }>(`api/folders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    return data.folder
  }

  async deleteFolder(id: string, recursive = false): Promise<void> {
    await request(`api/folders/${encodeURIComponent(id)}${recursive ? '?recursive=1' : ''}`, { method: 'DELETE' })
  }

  async search(query: string, options: { tag?: string; folderId?: string | null; limit?: number } = {}): Promise<SearchResult[]> {
    const params = new URLSearchParams({ q: query })
    if (options.tag !== undefined) params.set('tag', options.tag)
    if (options.folderId !== undefined) params.set('folderId', options.folderId === null ? 'root' : options.folderId)
    if (options.limit !== undefined) params.set('limit', String(options.limit))
    const data = await request<{ results: SearchResult[] }>(`api/search?${params.toString()}`)
    return data.results
  }

  async getTrash(): Promise<NoteMeta[]> {
    const data = await request<{ notes: NoteMeta[] }>('api/trash')
    return data.notes
  }

  async getVersions(noteId: string): Promise<VersionSummary[]> {
    const data = await request<{ versions: VersionSummary[] }>(`api/notes/${encodeURIComponent(noteId)}/versions`)
    return data.versions
  }

  async getVersion(noteId: string, revision: number): Promise<VersionDetail> {
    const data = await request<{ version: VersionDetail }>(`api/notes/${encodeURIComponent(noteId)}/versions/${revision}`)
    return data.version
  }

  async revertNote(noteId: string, revision: number): Promise<NoteDetail> {
    const data = await request<{ note: NoteDetail }>(`api/notes/${encodeURIComponent(noteId)}/revert`, {
      method: 'POST',
      body: JSON.stringify({ revision }),
    })
    return data.note
  }

  uploadAttachment(noteId: string, file: File, onProgress?: (percent: number) => void): Promise<{ attachment: AttachmentMeta; markdown: string }> {
    return new Promise((resolveUpload, rejectUpload) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', apiUrl(`api/notes/${encodeURIComponent(noteId)}/attachments`))
      xhr.withCredentials = true
      xhr.setRequestHeader('content-type', file.type || 'application/octet-stream')
      xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name))
      xhr.setRequestHeader('x-notes-request', '1')
      xhr.upload.onprogress = (event) => {
        if (onProgress !== undefined && event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
      }
      xhr.onerror = () => rejectUpload(new NotesApiError('上传失败：网络错误'))
      xhr.onload = () => {
        let payload: unknown = null
        try {
          payload = JSON.parse(xhr.responseText)
        } catch {
          rejectUpload(new NotesApiError(`上传失败（HTTP ${xhr.status}）`, { status: xhr.status }))
          return
        }
        if (xhr.status === 401) {
          rejectUpload(new AuthRequiredError())
          return
        }
        if (xhr.status < 200 || xhr.status >= 300 || (payload as { ok?: boolean }).ok === false) {
          const body = payload as { error?: { code?: string; message?: string } }
          rejectUpload(new NotesApiError(body.error?.message ?? `上传失败（HTTP ${xhr.status}）`, {
            status: xhr.status,
            code: body.error?.code,
            payload,
          }))
          return
        }
        const data = payload as { attachment: AttachmentMeta; markdown: string }
        resolveUpload({ attachment: data.attachment, markdown: data.markdown })
      }
      xhr.send(file)
    })
  }

  async deleteAttachment(id: string): Promise<void> {
    await request(`api/attachments/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  attachmentUrl(id: string): string {
    return apiUrl(`api/attachments/${encodeURIComponent(id)}`)
  }

  subscribe(listener: () => void): () => void {
    if (typeof EventSource === 'undefined') return () => undefined
    const source = new EventSource(apiUrl('api/events'))
    const onChange = (): void => listener()
    source.addEventListener('change', onChange)
    return () => {
      source.removeEventListener('change', onChange)
      source.close()
    }
  }

  /** The web surface has no sync engine; these methods exist for type parity. */
  async getState(): Promise<HostState> {
    throw new NotesApiError('Web 端没有同步状态')
  }

  async getConflict(): Promise<ConflictDetail> {
    throw new NotesApiError('Web 端没有本地冲突')
  }
}
