/**
 * DSH page backend: same-origin host routes. The host owns the cache, sync and
 * remote bearer token; the page never sees the token or account password.
 */

import type { AppBackend, AppCapabilities } from '../shared/ui/backend.ts'
import type {
  AttachmentMeta,
  ConflictDetail,
  ConflictSummary,
  FolderCreateInput,
  FolderMeta,
  FolderUpdateInput,
  HostSettingsPublic,
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
import { NotesApiError } from '../shared/errors.ts'

function mount(): string {
  try {
    return new URL('dsh-notes/', document.baseURI).href
  } catch {
    return '/dsh-notes/'
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    'x-notes-request': '1',
  }
  const response = await fetch(new URL(path.replace(/^\/+/, ''), mount()).href, {
    credentials: 'same-origin',
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
  })
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    throw new NotesApiError(`宿主返回了非 JSON 响应（HTTP ${response.status}）`, { status: response.status })
  }
  if (!response.ok || (payload as { ok?: boolean } | null)?.ok === false) {
    const body = payload as { error?: { code?: string; message?: string } } | null
    throw new NotesApiError(body?.error?.message ?? `请求失败（HTTP ${response.status}）`, {
      status: response.status,
      code: body?.error?.code ?? 'HOST_FAILED',
      payload,
    })
  }
  return payload as T
}

export class DshBackend implements AppBackend {
  readonly kind = 'dsh' as const
  readonly label = 'DSH'
  readonly capabilities: AppCapabilities = {
    sync: true,
    settings: true,
    conflicts: true,
    versions: true,
    trash: true,
    offline: true,
  }

  async getTree(): Promise<TreeSnapshot> {
    const data = await request<{ tree: TreeSnapshot }>('tree')
    return data.tree
  }

  async getNote(id: string): Promise<NoteDetail> {
    const data = await request<{ note: NoteDetail }>(`notes/${encodeURIComponent(id)}`)
    return data.note
  }

  async createNote(input: NoteCreateInput): Promise<NoteDetail> {
    const data = await request<{ note: NoteDetail }>('notes', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return data.note
  }

  async updateNote(id: string, input: NoteUpdateInput): Promise<NoteDetail> {
    const data = await request<{ note: NoteDetail }>(`notes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
    return data.note
  }

  async deleteNote(id: string, permanent = false): Promise<void> {
    await request(`notes/${encodeURIComponent(id)}${permanent ? '?permanent=1' : ''}`, { method: 'DELETE' })
  }

  async restoreNote(id: string): Promise<NoteDetail> {
    const data = await request<{ note: NoteDetail }>(`notes/${encodeURIComponent(id)}/restore`, { method: 'POST', body: '{}' })
    return data.note
  }

  async moveNote(id: string, folderId: string | null, baseRevision: number): Promise<NoteDetail> {
    const data = await request<{ note: NoteDetail }>(`notes/${encodeURIComponent(id)}/move`, {
      method: 'POST',
      body: JSON.stringify({ folderId, baseRevision }),
    })
    return data.note
  }

  async createFolder(input: FolderCreateInput): Promise<FolderMeta> {
    const data = await request<{ folder: FolderMeta }>('folders', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return data.folder
  }

  async updateFolder(id: string, input: FolderUpdateInput): Promise<FolderMeta> {
    const data = await request<{ folder: FolderMeta }>(`folders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    return data.folder
  }

  async deleteFolder(id: string, recursive = false): Promise<void> {
    await request(`folders/${encodeURIComponent(id)}${recursive ? '?recursive=1' : ''}`, { method: 'DELETE' })
  }

  async search(query: string, options: { tag?: string; folderId?: string | null; limit?: number } = {}): Promise<SearchResult[]> {
    const params = new URLSearchParams({ q: query })
    if (options.limit !== undefined) params.set('limit', String(options.limit))
    const data = await request<{ results: SearchResult[] }>(`search?${params.toString()}`)
    return data.results
  }

  async getTrash(): Promise<NoteMeta[]> {
    const data = await request<{ notes: NoteMeta[] }>('trash')
    return data.notes
  }

  async getVersions(noteId: string): Promise<VersionSummary[]> {
    const data = await request<{ versions: VersionSummary[] }>(`versions?noteId=${encodeURIComponent(noteId)}`)
    return data.versions
  }

  async getVersion(noteId: string, revision: number): Promise<VersionDetail> {
    const data = await request<{ version: VersionDetail }>(`versions/${encodeURIComponent(noteId)}/${revision}`)
    return data.version
  }

  async revertNote(noteId: string, revision: number): Promise<NoteDetail> {
    const data = await request<{ note: NoteDetail }>('versions/restore', {
      method: 'POST',
      body: JSON.stringify({ noteId, revision }),
    })
    return data.note
  }

  uploadAttachment(noteId: string, file: File, onProgress?: (percent: number) => void): Promise<{ attachment: AttachmentMeta; markdown: string }> {
    return new Promise((resolveUpload, rejectUpload) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', new URL(`notes/${encodeURIComponent(noteId)}/attachments`, mount()).href)
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
    await request(`attachments/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  attachmentUrl(id: string): string {
    return new URL(`attachments/${encodeURIComponent(id)}`, mount()).href
  }

  async fetchAttachment(id: string): Promise<Blob> {
    const url = this.attachmentUrl(id)
    const response = await fetch(url, { credentials: 'same-origin' })
    if (!response.ok) {
      throw new NotesApiError(`附件读取失败（HTTP ${response.status}）`, { status: response.status })
    }
    return response.blob()
  }

  async getState(): Promise<HostState> {
    const data = await request<{ state: HostState }>('state')
    return data.state
  }

  async syncNow(): Promise<HostState> {
    const data = await request<{ state: HostState }>('sync', { method: 'POST', body: '{}' })
    return data.state
  }

  async getConflicts(): Promise<ConflictSummary[]> {
    const data = await request<{ conflicts: ConflictSummary[] }>('conflicts')
    return data.conflicts
  }

  async getConflict(noteId: string): Promise<ConflictDetail> {
    const data = await request<{ conflict: ConflictDetail }>(`conflicts/${encodeURIComponent(noteId)}`)
    return data.conflict
  }

  async resolveConflict(noteId: string, strategy: 'server' | 'local' | 'copy'): Promise<HostState> {
    const data = await request<{ state: HostState }>(`conflicts/${encodeURIComponent(noteId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ strategy }),
    })
    return data.state
  }

  async getSettings(): Promise<HostSettingsPublic> {
    const data = await request<{ settings: HostSettingsPublic }>('settings')
    return data.settings
  }

  async saveSettings(patch: { serverUrl?: string; token?: string; autoSyncSeconds?: number; quickSync?: boolean }): Promise<HostState> {
    const data = await request<{ state: HostState }>('settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    })
    return data.state
  }

  async testConnection(patch?: { serverUrl?: string; token?: string }): Promise<{ ok: boolean; message: string }> {
    const data = await request<{ ok: boolean; message: string }>('settings/test', {
      method: 'POST',
      body: JSON.stringify(patch ?? {}),
    })
    return { ok: data.ok, message: data.message }
  }
}
