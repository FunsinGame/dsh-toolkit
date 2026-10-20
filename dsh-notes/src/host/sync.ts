/**
 * DSH host sync engine.
 *
 * Local edits are dirty rows in the cache. A sync does pull (incremental change
 * cursor, full bootstrap when needed), then pushes dirty notes/folders, then
 * pulls once more so the local cache adopts the server's revisions. A revision
 * conflict is stored, not overwritten; the page resolves it explicitly.
 */

import { randomUUID } from 'node:crypto'
import type { Logger } from '../server/logger.ts' // type-only, erased from the browser-safe graph
import type { ConflictDetail, ConflictSummary, NoteDetail, NoteMeta, SearchResult, SyncStatus, TreeSnapshot } from '../shared/types.ts'
import type { EffectiveSettings } from './settings.ts'
import { LocalStore } from './cache.ts'
import { RemoteClient, RemoteError } from './remote.ts'

type Timer = ReturnType<typeof setTimeout>

export interface SyncEngineOptions {
  store: LocalStore
  settings: EffectiveSettings
  logger: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>
  onState?: (status: SyncStatus) => void
}

export class SyncEngine {
  private readonly store: LocalStore
  private readonly logger: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>
  private readonly onState: ((status: SyncStatus) => void) | undefined
  private settings: EffectiveSettings
  private remote: RemoteClient | null
  private timer: Timer | null = null
  private quickTimer: Timer | null = null
  private queue: Promise<void> = Promise.resolve()
  private disposed = false
  private state: SyncStatus
  private serverId: string | null = null
  private serverVersion: string | null = null
  private userId: string | null = null
  private lastSyncAt: number | null = null
  private lastAttemptAt: number | null = null
  private nextSyncAt: number | null = null
  private error: string | null = null
  private online = false

  constructor(options: SyncEngineOptions) {
    this.store = options.store
    this.settings = options.settings
    this.logger = options.logger
    this.onState = options.onState
    this.remote = this.settings.serverUrl !== '' && this.settings.token !== ''
      ? new RemoteClient(this.settings.serverUrl, this.settings.token)
      : null
    this.serverId = this.store.getMeta('serverId')
    this.serverVersion = this.store.getMeta('serverVersion')
    this.userId = this.store.getMeta('userId')
    const cursor = this.store.getMeta('cursor')
    this.state = {
      state: this.remote === null ? 'unconfigured' : cursor === null ? 'idle' : 'idle',
      online: false,
      pending: this.store.counts().pending,
      conflicts: this.store.counts().conflicts,
      lastSyncAt: Number(this.store.getMeta('lastSyncAt') ?? 0) || null,
      lastAttemptAt: null,
      nextSyncAt: null,
      error: null,
      serverId: this.serverId,
      serverVersion: this.serverVersion,
      userId: this.userId,
      autoSyncSeconds: this.settings.autoSyncSeconds,
      quickSync: this.settings.quickSync,
    }
    this.lastSyncAt = this.state.lastSyncAt
  }

  status(): SyncStatus {
    const counts = this.store.counts()
    return {
      ...this.state,
      pending: counts.pending,
      conflicts: counts.conflicts,
      autoSyncSeconds: this.settings.autoSyncSeconds,
      quickSync: this.settings.quickSync,
      online: this.online,
      lastSyncAt: this.lastSyncAt,
      lastAttemptAt: this.lastAttemptAt,
      nextSyncAt: this.nextSyncAt,
      error: this.error,
      serverId: this.serverId,
      serverVersion: this.serverVersion,
      userId: this.userId,
    }
  }

  configured(): boolean {
    return this.remote !== null
  }

  remoteClient(): RemoteClient | null {
    return this.remote
  }

  start(): void {
    if (this.remote === null) return
    void this.syncNow('start')
    this.scheduleNext()
  }

  stop(): void {
    this.disposed = true
    if (this.timer !== null) clearTimeout(this.timer)
    if (this.quickTimer !== null) clearTimeout(this.quickTimer)
    this.timer = null
    this.quickTimer = null
  }

  updateSettings(settings: EffectiveSettings): void {
    this.settings = settings
    this.remote = settings.serverUrl !== '' && settings.token !== ''
      ? new RemoteClient(settings.serverUrl, settings.token)
      : null
    if (this.remote === null) {
      this.online = false
      this.state = { ...this.state, state: 'unconfigured', error: null }
    }
  }

  touch(): void {
    if (this.remote === null) return
    if (!this.settings.quickSync) return
    if (this.quickTimer !== null) clearTimeout(this.quickTimer)
    this.quickTimer = setTimeout(() => {
      this.quickTimer = null
      void this.syncNow('quick')
    }, 2500)
  }

  private scheduleNext(): void {
    if (this.disposed || this.remote === null) return
    if (this.timer !== null) clearTimeout(this.timer)
    const delay = Math.max(5, this.settings.autoSyncSeconds) * 1000
    this.nextSyncAt = Date.now() + delay
    this.timer = setTimeout(() => {
      this.timer = null
      void this.syncNow('timer')
    }, delay)
    this.emit()
  }

  async syncNow(reason = 'manual'): Promise<void> {
    if (this.remote === null) {
      this.state = { ...this.state, state: 'unconfigured' }
      this.emit()
      return
    }
    // Queue syncs instead of returning the in-flight one: an edit or delete
    // made while a sync is running must get its own push pass rather than
    // waiting for the next timer tick. The queue also keeps syncs serialized.
    const run = this.queue.then(() => this.runSync(reason))
    this.queue = run.catch(() => undefined)
    return run
  }

  private async runSync(reason: string): Promise<void> {
    if (this.disposed || this.remote === null) return
    this.lastAttemptAt = Date.now()
    this.state = { ...this.state, state: 'syncing' }
    this.emit()
    this.logger.debug(`sync start (${reason})`)
    try {
      const health = await this.remote.health()
      this.serverId = health.server.id
      this.serverVersion = health.server.version
      this.online = true
      this.error = null
      const session = await this.remote.session().catch(() => null)
      if (session !== null) this.userId = session.user.id
      const cachedServerId = this.store.getMeta('serverId')
      if (cachedServerId !== null && cachedServerId !== health.server.id) {
        this.logger.warn('server id changed; requiring a full resync')
        this.store.setMeta('cursor', '')
        this.store.setMeta('serverId', health.server.id)
      } else {
        this.store.setMeta('serverId', health.server.id)
      }
      this.store.setMeta('serverVersion', health.server.version)
      if (this.userId !== null) this.store.setMeta('userId', this.userId)
      await this.pull()
      await this.push()
      await this.pull()
      this.lastSyncAt = Date.now()
      this.store.setMeta('lastSyncAt', String(this.lastSyncAt))
      this.state = { ...this.state, state: 'idle' }
      this.logger.debug(`sync done (${reason})`)
    } catch (error) {
      this.online = false
      const message = error instanceof Error ? error.message : String(error)
      this.error = message
      if (error instanceof RemoteError && (error.status === 401 || error.status === 403)) {
        this.state = { ...this.state, state: 'error' }
      } else {
        this.state = { ...this.state, state: this.store.counts().conflicts > 0 ? 'conflict' : 'offline' }
      }
      this.logger.warn(`sync failed (${reason})`, message)
    } finally {
      const counts = this.store.counts()
      if (counts.conflicts > 0) this.state = { ...this.state, state: 'conflict' }
      else if (counts.pending > 0 && this.state.state === 'idle') this.state = { ...this.state, state: 'pending' }
      this.nextSyncAt = Date.now() + Math.max(5, this.settings.autoSyncSeconds) * 1000
      this.emit()
      this.scheduleNext()
    }
  }

  private emit(): void {
    try {
      this.onState?.(this.status())
    } catch {
      /* A UI observer must not break sync. */
    }
  }

  // -- pull -----------------------------------------------------------------

  private async pull(): Promise<void> {
    if (this.remote === null) return
    const cursor = this.store.getMeta('cursor')
    if (cursor === null || cursor === '') {
      await this.bootstrap()
      return
    }
    let since = Number(cursor)
    if (!Number.isFinite(since)) since = 0
    for (let page = 0; page < 20; page += 1) {
      let result
      try {
        result = await this.remote.changes(since, 500)
      } catch (error) {
        if (error instanceof RemoteError && (error.status === 410 || error.code === 'SYNC_CURSOR_EXPIRED')) {
          await this.bootstrap()
          return
        }
        throw error
      }
      for (const change of result.changes) await this.applyChange(change)
      since = result.cursor
      this.store.setMeta('cursor', String(result.cursor))
      if (!result.hasMore) break
    }
  }

  private async bootstrap(): Promise<void> {
    if (this.remote === null) return
    const data = await this.remote.bootstrap()
    this.store.setMeta('serverId', data.server.id)
    this.store.setMeta('serverVersion', data.server.version)
    this.store.setMeta('userId', data.user.id)
    this.store.setMeta('cursor', String(data.cursor))
    const folderIds = new Set<string>()
    for (const folder of data.folders) {
      folderIds.add(folder.id)
      this.store.upsertFolderFromServer(folder)
    }
    const noteIds = new Set<string>()
    for (const note of data.notes) {
      noteIds.add(note.id)
      this.store.upsertNoteFromServer(note)
    }
    const attachmentIds = new Set<string>()
    for (const attachment of data.attachments) {
      attachmentIds.add(attachment.id)
      this.store.upsertAttachmentFromServer(attachment)
    }
    this.store.pruneNotes(noteIds)
    this.store.pruneFolders(folderIds)
    this.store.pruneAttachments(attachmentIds)
    this.serverId = data.server.id
    this.serverVersion = data.server.version
    this.userId = data.user.id
  }

  private async applyChange(change: { entity: string; id: string; action: string; data: Record<string, unknown> | null }): Promise<void> {
    if (change.entity === 'note') {
      const existing = this.store.getNoteRow(change.id)
      if (change.action === 'delete') {
        if (existing !== null && Number(existing.dirty ?? 0) === 1) {
          const local = this.store.getNote(change.id)
          if (local !== null) {
            this.store.markConflict(change.id, {
              ...local,
              title: '（服务器已删除）',
              content: '',
              tags: [],
              revision: 0,
              deletedAt: Date.now(),
              attachments: [],
            })
          }
          return
        }
        this.store.deleteNoteFromServer(change.id)
        return
      }
      const meta = change.data as unknown as NoteMeta | null
      if (meta === null) return
      if (existing !== null && Number(existing.dirty ?? 0) === 1) {
        const localRevision = Number(existing.server_revision ?? 0)
        if ((meta.revision ?? 0) !== localRevision) {
          const serverNote = await this.remote?.getNote(change.id).catch(() => null)
          if (serverNote !== null && serverNote !== undefined) this.store.markConflict(change.id, serverNote)
        }
        return
      }
      this.store.upsertNoteFromServer(meta)
      return
    }
    if (change.entity === 'folder') {
      if (change.action === 'delete') {
        this.store.deleteFolderFromServer(change.id)
        return
      }
      const meta = change.data as unknown as { id: string; parentId: string | null; name: string; sortOrder: number; revision: number; createdAt: number; updatedAt: number } | null
      if (meta === null) return
      this.store.upsertFolderFromServer({
        id: meta.id,
        parentId: meta.parentId ?? null,
        name: meta.name,
        sortOrder: meta.sortOrder ?? 0,
        revision: meta.revision ?? 1,
        createdAt: meta.createdAt ?? 0,
        updatedAt: meta.updatedAt ?? 0,
      })
      return
    }
    if (change.entity === 'attachment') {
      if (change.action === 'delete') {
        this.store.deleteAttachmentFromServer(change.id)
        return
      }
      const meta = change.data as unknown as { id: string; noteId: string; filename: string; mime: string; size: number; createdAt: number } | null
      if (meta !== null) this.store.upsertAttachmentFromServer(meta)
    }
  }

  // -- push -----------------------------------------------------------------

  private async push(): Promise<void> {
    if (this.remote === null) return
    for (const folder of this.store.dirtyFolders()) {
      if (Number(folder.deleted ?? 0) === 1) {
        if (folder.server_revision !== null && folder.server_revision !== undefined) {
          try {
            await this.remote.deleteFolder(String(folder.id), false)
          } catch (error) {
            if (!(error instanceof RemoteError && error.status === 404)) throw error
          }
        }
        this.store.removeFolder(String(folder.id))
        continue
      }
      const payload = {
        name: String(folder.name ?? ''),
        parentId: folder.parent_id === null || folder.parent_id === undefined ? null : String(folder.parent_id),
      }
      try {
        if (folder.server_revision === null || folder.server_revision === undefined) {
          const created = await this.remote.createFolder({ id: String(folder.id), ...payload })
          this.store.markFolderSynced(String(folder.id), created.revision)
        } else {
          const updated = await this.remote.updateFolder(String(folder.id), {
            baseRevision: Number(folder.server_revision),
            ...payload,
            opId: this.opIdFor('folder', String(folder.id)),
          })
          this.store.markFolderSynced(String(folder.id), updated.revision)
          this.clearOp('folder', String(folder.id))
        }
      } catch (error) {
        if (error instanceof RemoteError && error.status === 404) {
          this.store.markFolderUnsynced(String(folder.id))
          continue
        }
        if (error instanceof RemoteError && error.status === 409) {
          // Folder conflicts are rare; keep the local folder dirty for the next sync.
          continue
        }
        throw error
      }
    }

    for (const row of this.store.dirtyDeletedNotes()) {
      const id = String(row.id ?? '')
      try {
        if (row.server_revision !== null && row.server_revision !== undefined) {
          await this.remote.deleteNote(id)
        }
        this.store.removeNote(id)
      } catch (error) {
        if (error instanceof RemoteError && error.status === 404) {
          this.store.removeNote(id)
          continue
        }
        throw error
      }
    }

    for (const row of this.store.dirtyNotes()) {
      const id = String(row.id ?? '')
      const payload = {
        title: String(row.title ?? ''),
        content: String(row.content ?? ''),
        tags: parseTags(row.tags),
        pinned: Number(row.pinned ?? 0) === 1,
        folderId: row.folder_id === null || row.folder_id === undefined ? null : String(row.folder_id),
      }
      try {
        if (row.server_revision === null || row.server_revision === undefined) {
          const created = await this.remote.createNote({
            id,
            ...payload,
            opId: this.opIdFor('note', id),
          })
          this.store.markNoteSynced(id, created.revision, created.updatedAt)
          this.clearOp('note', id)
        } else {
          const updated = await this.remote.updateNote(id, {
            baseRevision: Number(row.server_revision),
            ...payload,
            opId: this.opIdFor('note', id),
          })
          this.store.markNoteSynced(id, updated.revision, updated.updatedAt)
          this.clearOp('note', id)
        }
      } catch (error) {
        if (error instanceof RemoteError && error.status === 409) {
          const current = (error.payload as { current?: NoteDetail } | null)?.current
            ?? await this.remote.getNote(id).catch(() => null)
          if (current !== null && current !== undefined) this.store.markConflict(id, current)
          continue
        }
        if (error instanceof RemoteError && error.status === 404) {
          this.store.markNoteUnsynced(id)
          continue
        }
        throw error
      }
    }
  }

  private opIdFor(entity: string, id: string): string {
    const key = `op:${entity}:${id}`
    const existing = this.store.getMeta(key)
    if (existing !== null && existing !== '') return existing
    const value = randomUUID()
    this.store.setMeta(key, value)
    return value
  }

  private clearOp(entity: string, id: string): void {
    this.store.setMeta(`op:${entity}:${id}`, '')
  }

  // -- reads and conflict resolution ---------------------------------------

  async getNote(id: string): Promise<NoteDetail> {
    let local = this.store.getNote(id)
    if (local === null && this.remote !== null) {
      const remoteNote = await this.remote.getNote(id)
      this.store.upsertNoteFromServer(remoteNote, remoteNote.content)
      local = this.store.getNote(id)
    }
    if (local === null) throw new Error('笔记不存在')
    this.store.markRecent(id)
    if (!this.store.hasBody(id) && this.remote !== null) {
      try {
        const remoteNote = await this.remote.getNote(id)
        this.store.setNoteBody(id, remoteNote.content, remoteNote.revision)
        return this.store.getNote(id) ?? remoteNote
      } catch (error) {
        if (local.content !== '') return local
        throw error
      }
    }
    return local
  }

  search(query: string, limit = 50): SearchResult[] {
    return this.store.search(query, limit)
  }

  tree(): TreeSnapshot {
    return this.store.listTree()
  }

  async getTrash(): Promise<NoteMeta[]> {
    if (this.remote !== null) {
      try {
        return await this.remote.listTrash()
      } catch {
        /* Fall back to locally deleted rows. */
      }
    }
    return this.store.getTrashLocal()
  }

  async restoreNote(id: string): Promise<NoteDetail> {
    const local = this.store.restoreLocalNote(id)
    if (local !== null) {
      this.touch()
      return local
    }
    if (this.remote === null) throw new Error('笔记不存在')
    const restored = await this.remote.restoreNote(id)
    this.store.upsertNoteFromServer(restored, restored.content)
    await this.pull()
    return this.store.getNote(id) ?? restored
  }

  async getVersions(noteId: string) {
    if (this.remote === null) return []
    return this.remote.getVersions(noteId)
  }

  async getVersion(noteId: string, revision: number) {
    if (this.remote === null) throw new Error('需要连接服务器')
    return this.remote.getVersion(noteId, revision)
  }

  async revertNote(noteId: string, revision: number): Promise<NoteDetail> {
    if (this.remote === null) throw new Error('需要连接服务器')
    const reverted = await this.remote.revertNote(noteId, revision)
    this.store.upsertNoteFromServer(reverted, reverted.content)
    await this.pull()
    return this.store.getNote(noteId) ?? reverted
  }

  conflicts(): ConflictSummary[] {
    return this.store.getConflicts()
  }

  conflict(noteId: string): ConflictDetail | null {
    return this.store.getConflict(noteId)
  }

  resolveConflict(noteId: string, strategy: 'server' | 'local' | 'copy'): void {
    const conflict = this.store.getConflict(noteId)
    if (conflict === null) return
    if (strategy === 'copy') {
      this.store.createLocalNote({
        title: conflict.localTitle || '未命名笔记',
        content: conflict.localContent,
        tags: conflict.localTags,
        folderId: conflict.localFolderId,
        pinned: conflict.localPinned,
      })
      this.store.adoptServerConflict(noteId)
    } else if (strategy === 'local') {
      this.store.keepLocalConflict(noteId)
    } else {
      this.store.adoptServerConflict(noteId)
    }
    this.touch()
  }

  counts() {
    return this.store.counts()
  }

  async deleteAttachment(id: string): Promise<void> {
    if (this.remote === null) throw new Error('需要连接服务器才能删除附件')
    await this.remote.deleteAttachment(id)
    this.store.deleteAttachmentFromServer(id)
  }

  async addAttachmentMeta(meta: { id: string; noteId: string; filename: string; mime: string; size: number; createdAt: number }): Promise<void> {
    this.store.upsertAttachmentFromServer(meta)
  }

  dispose(): void {
    this.stop()
  }
}

function parseTags(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw ?? '[]'))
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : []
  } catch {
    return []
  }
}
