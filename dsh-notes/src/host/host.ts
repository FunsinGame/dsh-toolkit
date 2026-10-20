/**
 * DSH host orchestrator: owns settings, the per-instance cache and the sync
 * engine, and exposes the small API consumed by host routes and AI tools.
 */

import { join } from 'node:path'
import type { Logger } from '../server/logger.ts'
import type {
  ConflictDetail,
  ConflictSummary,
  FolderMeta,
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
import { LocalStore } from './cache.ts'
import { RemoteClient, RemoteError } from './remote.ts'
import {
  ensureHostDirs,
  normalizeServerUrl,
  SettingsStore,
  type EffectiveSettings,
  type PluginConfig,
  type PublicSettings,
  type SettingsPatch,
} from './settings.ts'
import { SyncEngine } from './sync.ts'

export interface NotesHostOptions {
  config?: PluginConfig
  logger: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>
  version: string
}

export class NotesHost {
  readonly version: string
  private readonly logger: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>
  private readonly settingsStore: SettingsStore
  private store: LocalStore
  private sync: SyncEngine
  private effective: EffectiveSettings
  private disposed = false

  constructor(options: NotesHostOptions) {
    this.version = options.version
    this.logger = options.logger
    this.settingsStore = new SettingsStore(options.config ?? {})
    this.effective = this.settingsStore.effective()
    ensureHostDirs(this.effective.serverUrl)
    this.store = new LocalStore(join(this.effective.dataDir, 'cache.db'))
    this.sync = new SyncEngine({
      store: this.store,
      settings: this.effective,
      logger: this.logger,
    })
    this.sync.start()
  }

  // -- settings / state -----------------------------------------------------

  settings(): PublicSettings {
    return this.settingsStore.public()
  }

  state(): HostState {
    const counts = this.sync.counts()
    const status = this.sync.status()
    const settings = this.settings()
    return {
      configured: settings.serverUrl !== '' && settings.hasToken,
      version: this.version,
      settings,
      sync: status,
      counts,
      conflicts: this.sync.conflicts(),
      serverVersion: status.serverVersion,
      serverId: status.serverId,
      userId: status.userId,
    }
  }

  async saveSettings(patch: SettingsPatch): Promise<HostState> {
    const previous = this.effective.serverUrl
    this.settingsStore.save(patch)
    const next = this.settingsStore.effective()
    if (next.serverUrl !== previous) {
      this.sync.stop()
      this.store.close()
      ensureHostDirs(next.serverUrl)
      this.store = new LocalStore(join(next.dataDir, 'cache.db'))
      this.sync = new SyncEngine({ store: this.store, settings: next, logger: this.logger })
      this.effective = next
      this.sync.start()
    } else {
      this.effective = next
      this.sync.updateSettings(next)
      void this.sync.syncNow('settings')
    }
    return this.state()
  }

  async testConnection(patch: { serverUrl?: string; token?: string } = {}): Promise<{ ok: boolean; message: string }> {
    const effective = this.settingsStore.effective()
    let serverUrl: string
    try {
      serverUrl = patch.serverUrl !== undefined && patch.serverUrl.trim() !== ''
        ? normalizeServerUrl(patch.serverUrl)
        : effective.serverUrl
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
    const token = patch.token !== undefined && patch.token.trim() !== '' ? patch.token.trim() : effective.token
    if (serverUrl === '' || token === '') return { ok: false, message: '请填写服务器地址和访问令牌' }
    const client = new RemoteClient(serverUrl, token)
    try {
      const health = await client.health()
      const session = await client.session()
      return {
        ok: true,
        message: `连接成功：${serverUrl} · 版本 ${health.server.version} · 用户 ${session.user.username} · 权限 ${session.auth.scopes.join(',')}`,
      }
    } catch (error) {
      const message = error instanceof RemoteError ? error.message : error instanceof Error ? error.message : String(error)
      return { ok: false, message }
    }
  }

  // -- reads ----------------------------------------------------------------

  tree(): TreeSnapshot {
    return this.sync.tree()
  }

  getNote(id: string): Promise<NoteDetail> {
    return this.sync.getNote(id)
  }

  search(query: string, limit = 50): SearchResult[] {
    return this.sync.search(query, limit)
  }

  recent(limit = 20): NoteMeta[] {
    return this.store.recent(limit)
  }

  async getTrash(): Promise<NoteMeta[]> {
    return this.sync.getTrash()
  }

  listAttachments(noteId: string): import('../shared/types.ts').AttachmentMeta[] {
    return this.store.listAttachments(noteId)
  }

  conflicts(): ConflictSummary[] {
    return this.sync.conflicts()
  }

  conflict(noteId: string): ConflictDetail | null {
    return this.sync.conflict(noteId)
  }

  async getVersions(noteId: string): Promise<VersionSummary[]> {
    return this.sync.getVersions(noteId)
  }

  async getVersion(noteId: string, revision: number): Promise<VersionDetail> {
    return this.sync.getVersion(noteId, revision)
  }

  async stats(): Promise<{ notes: number; folders: number; attachments: number; pending: number; conflicts: number; serverVersion: string | null; serverId: string | null; userId: string | null }> {
    const counts = this.sync.counts()
    const status = this.sync.status()
    return {
      ...counts,
      serverVersion: status.serverVersion,
      serverId: status.serverId,
      userId: status.userId,
    }
  }

  // -- local writes ---------------------------------------------------------

  createNote(input: NoteCreateInput): NoteDetail {
    const note = this.store.createLocalNote(input)
    this.sync.touch()
    return note
  }

  updateNote(id: string, input: NoteUpdateInput): NoteDetail {
    const existing = this.store.getNoteRow(id)
    if (existing === null) throw new Error('笔记不存在')
    const note = this.store.updateLocalNote(id, {
      title: input.title,
      content: input.content,
      tags: input.tags,
      pinned: input.pinned,
      folderId: input.folderId,
    })
    this.sync.touch()
    return note
  }

  async deleteNote(id: string, permanent = false): Promise<void> {
    const remote = this.sync.remoteClient()
    if (permanent && remote !== null) {
      try {
        await remote.deleteNote(id, true)
      } catch (error) {
        if (!(error instanceof RemoteError && error.status === 404)) throw error
      }
    }
    if (permanent) {
      const row = this.store.getNoteRow(id)
      const storage = row === null ? null : this.store.listAttachments(id)
      if (storage !== null) {
        for (const attachment of storage) {
          await remote?.deleteAttachment(attachment.id).catch(() => undefined)
        }
      }
      this.store.removeNote(id)
      return
    }
    this.store.deleteLocalNote(id)
    this.sync.touch()
  }

  async restoreNote(id: string): Promise<NoteDetail> {
    const restored = await this.sync.restoreNote(id)
    this.sync.touch()
    return restored
  }

  moveNote(id: string, folderId: string | null, baseRevision: number): NoteDetail {
    const note = this.store.updateLocalNote(id, { folderId })
    this.sync.touch()
    return note
  }

  createFolder(input: { id?: string; parentId?: string | null; name: string }): FolderMeta {
    const folder = this.store.createLocalFolder(input)
    this.sync.touch()
    return folder
  }

  updateFolder(id: string, input: { baseRevision: number; name?: string; parentId?: string | null }): FolderMeta {
    const folder = this.store.updateLocalFolder(id, { name: input.name, parentId: input.parentId })
    this.sync.touch()
    return folder
  }

  deleteFolder(id: string, recursive = false): void {
    const tree = this.store.listTree()
    const folder = tree.folders.find((item) => item.id === id)
    if (folder === undefined) throw new Error('目录不存在')
    const descendants = new Set<string>([id])
    let changed = true
    while (changed) {
      changed = false
      for (const item of tree.folders) {
        if (item.parentId !== null && descendants.has(item.parentId) && !descendants.has(item.id)) {
          descendants.add(item.id)
          changed = true
        }
      }
    }
    if (recursive) {
      for (const note of tree.notes) {
        if (note.folderId !== null && descendants.has(note.folderId)) this.store.deleteLocalNote(note.id)
      }
      for (const folderId of Array.from(descendants).reverse()) this.store.deleteLocalFolder(folderId)
    } else {
      for (const note of tree.notes) {
        if (note.folderId === id) this.store.updateLocalNote(note.id, { folderId: folder.parentId })
      }
      for (const item of tree.folders) {
        if (item.parentId === id) this.store.updateLocalFolder(item.id, { parentId: folder.parentId })
      }
      this.store.deleteLocalFolder(id)
    }
    this.sync.touch()
  }

  // -- sync / conflicts -----------------------------------------------------

  async syncNow(): Promise<HostState> {
    await this.sync.syncNow('manual')
    return this.state()
  }

  resolveConflict(noteId: string, strategy: 'server' | 'local' | 'copy'): HostState {
    this.sync.resolveConflict(noteId, strategy)
    void this.sync.syncNow('conflict')
    return this.state()
  }

  async revertNote(noteId: string, revision: number): Promise<NoteDetail> {
    const reverted = await this.sync.revertNote(noteId, revision)
    this.sync.touch()
    return reverted
  }

  // -- attachments ----------------------------------------------------------

  async uploadFromRequest(noteId: string, req: import('node:http').IncomingMessage): Promise<unknown> {
    const remote = this.sync.remoteClient()
    if (remote === null) throw new Error('需要先配置并连接笔记服务器')
    const payload = await remote.uploadFromRequest(noteId, req) as { attachment?: import('../shared/types.ts').AttachmentMeta }
    if (payload.attachment !== undefined) this.store.upsertAttachmentFromServer(payload.attachment)
    return payload
  }

  async uploadBase64(noteId: string, filename: string, mime: string, base64: string): Promise<unknown> {
    const remote = this.sync.remoteClient()
    if (remote === null) throw new Error('需要先配置并连接笔记服务器')
    const buffer = Buffer.from(base64, 'base64')
    if (buffer.byteLength === 0) throw new Error('附件内容为空')
    if (buffer.byteLength > 20 * 1024 * 1024) throw new Error('附件超过 20MB 工具限制')
    const payload = await remote.uploadBuffer(noteId, filename, mime, buffer) as { attachment?: import('../shared/types.ts').AttachmentMeta }
    if (payload.attachment !== undefined) this.store.upsertAttachmentFromServer(payload.attachment)
    return payload
  }

  async pipeAttachment(id: string, req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): Promise<void> {
    const remote = this.sync.remoteClient()
    if (remote === null) {
      res.statusCode = 503
      res.end('notes server is not configured')
      return
    }
    await remote.pipeAttachment(id, req, res)
  }

  async deleteAttachment(id: string): Promise<void> {
    await this.sync.deleteAttachment(id)
  }

  shortLabel(): string {
    try {
      return this.effective.serverUrl === '' ? '未配置' : new URL(this.effective.serverUrl).host
    } catch {
      return this.effective.serverUrl
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.sync.dispose()
    this.store.close()
  }
}
