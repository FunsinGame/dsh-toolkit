/**
 * Local SQLite cache for the DSH host plugin.
 *
 * Local edits are written immediately with dirty=1; the sync engine pushes the
 * final state and clears dirty. Conflicts keep both sides in a conflicts row so
 * the page can show a diff and choose a resolution.
 */

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { normalizeTags, noteTitleFromContent } from '../shared/format.ts'
import type {
  AttachmentMeta,
  ConflictDetail,
  ConflictSummary,
  FolderMeta,
  NoteDetail,
  NoteMeta,
  SearchResult,
  TreeSnapshot,
} from '../shared/types.ts'

type Row = Record<string, unknown>

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  server_revision INTEGER,
  local_revision INTEGER NOT NULL DEFAULT 0,
  dirty INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  folder_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  server_updated_at INTEGER,
  local_revision INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  dirty INTEGER NOT NULL DEFAULT 0,
  conflict INTEGER NOT NULL DEFAULT 0,
  body_loaded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS notes_folder ON notes(folder_id);
CREATE INDEX IF NOT EXISTS notes_dirty ON notes(dirty);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS attachments_note ON attachments(note_id);
CREATE TABLE IF NOT EXISTS conflicts (
  note_id TEXT PRIMARY KEY,
  local_title TEXT NOT NULL,
  local_content TEXT NOT NULL,
  local_tags TEXT NOT NULL,
  local_folder_id TEXT,
  local_pinned INTEGER NOT NULL,
  server_title TEXT NOT NULL,
  server_content TEXT NOT NULL,
  server_tags TEXT NOT NULL,
  server_folder_id TEXT,
  server_pinned INTEGER NOT NULL,
  base_revision INTEGER,
  server_revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS recent (note_id TEXT PRIMARY KEY, opened_at INTEGER NOT NULL);
`

export interface RemoteNoteMeta {
  id: string
  folderId: string | null
  title: string
  tags: string[]
  pinned: boolean
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt?: number | null
}

export class LocalStore {
  private readonly db: DatabaseSync

  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec('PRAGMA busy_timeout = 5000')
    this.db.exec(SCHEMA)
  }

  close(): void {
    try { this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)') } catch { /* ignore */ }
    try { this.db.close() } catch { /* ignore */ }
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as Row | undefined
    return typeof row?.value === 'string' ? row.value : null
  }

  setMeta(key: string, value: string): void {
    this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
  }

  private folderMeta(row: Row): FolderMeta {
    return {
      id: String(row.id ?? ''),
      parentId: row.parent_id === null || row.parent_id === undefined ? null : String(row.parent_id),
      name: String(row.name ?? ''),
      sortOrder: Number(row.sort_order ?? 0),
      revision: Number(row.server_revision ?? row.local_revision ?? 1),
      createdAt: Number(row.updated_at ?? 0),
      updatedAt: Number(row.updated_at ?? 0),
    }
  }

  private noteMeta(row: Row): NoteMeta {
    let tags: string[] = []
    try {
      const parsed = JSON.parse(String(row.tags ?? '[]'))
      if (Array.isArray(parsed)) tags = parsed.filter((tag): tag is string => typeof tag === 'string')
    } catch { tags = [] }
    return {
      id: String(row.id ?? ''),
      folderId: row.folder_id === null || row.folder_id === undefined ? null : String(row.folder_id),
      title: String(row.title ?? ''),
      tags,
      pinned: Number(row.pinned ?? 0) === 1,
      revision: Number(row.server_revision ?? row.local_revision ?? 1),
      createdAt: Number(row.created_at ?? row.updated_at ?? 0),
      updatedAt: Number(row.server_updated_at ?? row.updated_at ?? 0),
      deletedAt: Number(row.deleted ?? 0) === 1 ? Number(row.deleted_at ?? row.updated_at ?? 0) : null,
    }
  }

  private attachmentMeta(row: Row): AttachmentMeta {
    return {
      id: String(row.id ?? ''),
      noteId: String(row.note_id ?? ''),
      filename: String(row.filename ?? ''),
      mime: String(row.mime ?? 'application/octet-stream'),
      size: Number(row.size ?? 0),
      createdAt: Number(row.created_at ?? 0),
    }
  }

  listTree(): TreeSnapshot {
    const folders = this.db.prepare('SELECT * FROM folders WHERE deleted = 0 ORDER BY sort_order ASC, name COLLATE NOCASE ASC').all() as Row[]
    const notes = this.db.prepare('SELECT * FROM notes WHERE deleted = 0 ORDER BY pinned DESC, COALESCE(server_updated_at, updated_at) DESC').all() as Row[]
    return {
      folders: folders.map((row) => this.folderMeta(row)),
      notes: notes.map((row) => this.noteMeta(row)),
    }
  }

  getNoteRow(id: string): Row | null {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Row | undefined
    return row ?? null
  }

  hasBody(id: string): boolean {
    const row = this.getNoteRow(id)
    return row !== null && Number(row.body_loaded ?? 0) === 1
  }

  getNote(id: string): NoteDetail | null {
    const row = this.getNoteRow(id)
    if (row === null) return null
    return {
      ...this.noteMeta(row),
      content: String(row.content ?? ''),
      attachments: this.listAttachments(id),
    }
  }

  listAttachments(noteId: string): AttachmentMeta[] {
    const rows = this.db.prepare('SELECT * FROM attachments WHERE note_id = ? ORDER BY created_at ASC').all(noteId) as Row[]
    return rows.map((row) => this.attachmentMeta(row))
  }

  setNoteBody(id: string, content: string, revision?: number): void {
    const now = Date.now()
    if (revision !== undefined) {
      this.db.prepare('UPDATE notes SET content = ?, body_loaded = 1, server_revision = ?, updated_at = ? WHERE id = ?').run(content, revision, now, id)
    } else {
      this.db.prepare('UPDATE notes SET content = ?, body_loaded = 1 WHERE id = ?').run(content, id)
    }
  }

  // -- server -> local ------------------------------------------------------

  upsertFolderFromServer(meta: FolderMeta): boolean {
    const existing = this.db.prepare('SELECT dirty FROM folders WHERE id = ?').get(meta.id) as Row | undefined
    if (existing !== undefined && Number(existing.dirty ?? 0) === 1) return false
    this.db.prepare(`
      INSERT INTO folders (id, parent_id, name, sort_order, updated_at, server_revision, local_revision, dirty, deleted)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0)
      ON CONFLICT(id) DO UPDATE SET parent_id = excluded.parent_id, name = excluded.name,
        sort_order = excluded.sort_order, updated_at = excluded.updated_at,
        server_revision = excluded.server_revision, deleted = 0
    `).run(meta.id, meta.parentId, meta.name, meta.sortOrder, meta.updatedAt, meta.revision)
    return true
  }

  deleteFolderFromServer(id: string): void {
    const existing = this.db.prepare('SELECT dirty FROM folders WHERE id = ?').get(id) as Row | undefined
    if (existing !== undefined && Number(existing.dirty ?? 0) === 1) return
    this.db.prepare('DELETE FROM folders WHERE id = ?').run(id)
  }

  upsertNoteFromServer(meta: RemoteNoteMeta, content?: string): boolean {
    const existing = this.getNoteRow(meta.id)
    if (existing !== null && Number(existing.dirty ?? 0) === 1) return false
    const now = Date.now()
    const tags = JSON.stringify(meta.tags)
    if (existing === null) {
      this.db.prepare(`
        INSERT INTO notes (id, folder_id, title, content, tags, pinned, created_at, updated_at, server_updated_at,
          local_revision, server_revision, deleted, deleted_at, dirty, conflict, body_loaded)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, NULL, 0, 0, ?)
      `).run(meta.id, meta.folderId, meta.title, content ?? '', tags, meta.pinned ? 1 : 0,
        meta.createdAt, meta.updatedAt, meta.updatedAt, meta.revision, content === undefined ? 0 : 1)
      return true
    }
    const revisionChanged = Number(existing.server_revision ?? 0) !== meta.revision
    const bodyLoaded = content !== undefined ? 1 : revisionChanged ? 0 : Number(existing.body_loaded ?? 0)
    this.db.prepare(`
      UPDATE notes SET folder_id = ?, title = ?, tags = ?, pinned = ?, created_at = ?,
        server_updated_at = ?, server_revision = ?, deleted = 0, deleted_at = NULL, dirty = 0, conflict = 0,
        body_loaded = ?, content = ?
      WHERE id = ?
    `).run(meta.folderId, meta.title, tags, meta.pinned ? 1 : 0, meta.createdAt, meta.updatedAt,
      meta.revision, bodyLoaded, content !== undefined ? content : String(existing.content ?? ''), meta.id)
    void now
    return true
  }

  deleteNoteFromServer(id: string): void {
    const existing = this.getNoteRow(id)
    if (existing !== null && Number(existing.dirty ?? 0) === 1) return
    this.removeNote(id)
  }

  upsertAttachmentFromServer(meta: AttachmentMeta): void {
    this.db.prepare(`
      INSERT INTO attachments (id, note_id, filename, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET note_id = excluded.note_id, filename = excluded.filename,
        mime = excluded.mime, size = excluded.size
    `).run(meta.id, meta.noteId, meta.filename, meta.mime, meta.size, meta.createdAt)
  }

  deleteAttachmentFromServer(id: string): void {
    this.db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
  }

  knownNoteIds(): string[] {
    return (this.db.prepare('SELECT id FROM notes WHERE server_revision IS NOT NULL AND dirty = 0').all() as Row[])
      .map((row) => String(row.id ?? ''))
  }

  knownFolderIds(): string[] {
    return (this.db.prepare('SELECT id FROM folders WHERE server_revision IS NOT NULL AND dirty = 0').all() as Row[])
      .map((row) => String(row.id ?? ''))
  }

  pruneNotes(ids: Set<string>): void {
    for (const id of this.knownNoteIds()) if (!ids.has(id)) this.removeNote(id)
  }

  pruneFolders(ids: Set<string>): void {
    for (const id of this.knownFolderIds()) if (!ids.has(id)) this.db.prepare('DELETE FROM folders WHERE id = ?').run(id)
  }

  pruneAttachments(ids: Set<string>): void {
    const rows = this.db.prepare('SELECT id FROM attachments').all() as Row[]
    for (const row of rows) {
      const id = String(row.id ?? '')
      if (id !== '' && !ids.has(id)) this.db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
    }
  }

  // -- local edits ----------------------------------------------------------

  createLocalNote(input: { id?: string; folderId?: string | null; title?: string; content?: string; tags?: string[]; pinned?: boolean }): NoteDetail {
    const id = input.id ?? randomUUID()
    const content = input.content ?? ''
    const title = (input.title ?? '').trim() || noteTitleFromContent(content).slice(0, 200)
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO notes (id, folder_id, title, content, tags, pinned, created_at, updated_at, server_updated_at,
        local_revision, server_revision, deleted, deleted_at, dirty, conflict, body_loaded)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, NULL, 0, NULL, 1, 0, 1)
    `).run(id, input.folderId ?? null, title, content, JSON.stringify(normalizeTags(input.tags ?? [])), input.pinned === true ? 1 : 0, now, now)
    return this.getNote(id) as NoteDetail
  }

  updateLocalNote(id: string, patch: { title?: string; content?: string; tags?: string[]; pinned?: boolean; folderId?: string | null }): NoteDetail {
    const row = this.getNoteRow(id)
    if (row === null) throw new Error('笔记不存在')
    const content = patch.content === undefined ? String(row.content ?? '') : patch.content
    const title = patch.title === undefined
      ? String(row.title ?? '')
      : patch.title.trim() || noteTitleFromContent(content).slice(0, 200)
    const tags = JSON.stringify(patch.tags === undefined ? JSON.parse(String(row.tags ?? '[]')) : normalizeTags(patch.tags))
    const pinned = patch.pinned === undefined ? Number(row.pinned ?? 0) : patch.pinned ? 1 : 0
    const folderId = patch.folderId === undefined ? row.folder_id : patch.folderId
    this.db.prepare(`
      UPDATE notes SET title = ?, content = ?, tags = ?, pinned = ?, folder_id = ?, updated_at = ?,
        local_revision = local_revision + 1, dirty = 1, body_loaded = 1, deleted = 0 WHERE id = ?
    `).run(title, content, tags, pinned, folderId, Date.now(), id)
    return this.getNote(id) as NoteDetail
  }

  deleteLocalNote(id: string): void {
    const row = this.getNoteRow(id)
    if (row === null) return
    if (row.server_revision === null || row.server_revision === undefined) {
      this.removeNote(id)
      return
    }
    this.db.prepare('UPDATE notes SET deleted = 1, deleted_at = ?, dirty = 1, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), id)
  }

  restoreLocalNote(id: string): NoteDetail | null {
    this.db.prepare('UPDATE notes SET deleted = 0, deleted_at = NULL, dirty = 1, updated_at = ? WHERE id = ?').run(Date.now(), id)
    return this.getNote(id)
  }

  createLocalFolder(input: { id?: string; parentId?: string | null; name: string }): FolderMeta {
    const id = input.id ?? randomUUID()
    const now = Date.now()
    const order = Number((this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM folders').get() as Row)?.n ?? 0) + 1
    this.db.prepare(`
      INSERT INTO folders (id, parent_id, name, sort_order, updated_at, server_revision, local_revision, dirty, deleted)
      VALUES (?, ?, ?, ?, ?, NULL, 1, 1, 0)
    `).run(id, input.parentId ?? null, input.name.trim(), order, now)
    return this.folderMeta(this.db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as Row)
  }

  updateLocalFolder(id: string, patch: { name?: string; parentId?: string | null }): FolderMeta {
    const row = this.db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as Row | undefined
    if (row === undefined) throw new Error('目录不存在')
    const name = patch.name === undefined ? String(row.name ?? '') : patch.name.trim()
    const parentId = patch.parentId === undefined ? row.parent_id : patch.parentId
    this.db.prepare('UPDATE folders SET name = ?, parent_id = ?, updated_at = ?, local_revision = local_revision + 1, dirty = 1 WHERE id = ?')
      .run(name, parentId, Date.now(), id)
    return this.folderMeta(this.db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as Row)
  }

  deleteLocalFolder(id: string): void {
    const row = this.db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as Row | undefined
    if (row === undefined) return
    if (row.server_revision === null || row.server_revision === undefined) {
      this.db.prepare('DELETE FROM folders WHERE id = ?').run(id)
      return
    }
    this.db.prepare('UPDATE folders SET deleted = 1, dirty = 1, updated_at = ? WHERE id = ?').run(Date.now(), id)
  }

  // -- sync state -----------------------------------------------------------

  dirtyNotes(): Row[] {
    return this.db.prepare('SELECT * FROM notes WHERE dirty = 1 AND deleted = 0 AND conflict = 0').all() as Row[]
  }

  dirtyDeletedNotes(): Row[] {
    return this.db.prepare('SELECT * FROM notes WHERE dirty = 1 AND deleted = 1').all() as Row[]
  }

  conflictedNotes(): Row[] {
    return this.db.prepare('SELECT * FROM notes WHERE conflict = 1').all() as Row[]
  }

  dirtyFolders(): Row[] {
    return this.db.prepare('SELECT * FROM folders WHERE dirty = 1').all() as Row[]
  }

  markNoteSynced(id: string, serverRevision: number, serverUpdatedAt: number): void {
    this.db.prepare(`
      UPDATE notes SET server_revision = ?, server_updated_at = ?, dirty = 0, conflict = 0,
        deleted = 0, deleted_at = NULL, body_loaded = 1 WHERE id = ?
    `).run(serverRevision, serverUpdatedAt, id)
  }

  markFolderSynced(id: string, serverRevision: number): void {
    this.db.prepare('UPDATE folders SET server_revision = ?, dirty = 0, deleted = 0 WHERE id = ?').run(serverRevision, id)
  }

  markNoteUnsynced(id: string): void {
    this.db.prepare('UPDATE notes SET server_revision = NULL, dirty = 1, conflict = 0 WHERE id = ?').run(id)
  }

  markFolderUnsynced(id: string): void {
    this.db.prepare('UPDATE folders SET server_revision = NULL, dirty = 1, deleted = 0 WHERE id = ?').run(id)
  }

  removeNote(id: string): void {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    this.db.prepare('DELETE FROM attachments WHERE note_id = ?').run(id)
    this.db.prepare('DELETE FROM conflicts WHERE note_id = ?').run(id)
    this.db.prepare('DELETE FROM recent WHERE note_id = ?').run(id)
  }

  removeFolder(id: string): void {
    this.db.prepare('DELETE FROM folders WHERE id = ?').run(id)
  }

  // -- conflicts ------------------------------------------------------------

  markConflict(noteId: string, server: NoteDetail): void {
    const local = this.getNote(noteId)
    if (local === null) return
    this.db.prepare(`
      INSERT INTO conflicts (note_id, local_title, local_content, local_tags, local_folder_id, local_pinned,
        server_title, server_content, server_tags, server_folder_id, server_pinned, base_revision, server_revision, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(note_id) DO UPDATE SET local_title = excluded.local_title, local_content = excluded.local_content,
        local_tags = excluded.local_tags, local_folder_id = excluded.local_folder_id, local_pinned = excluded.local_pinned,
        server_title = excluded.server_title, server_content = excluded.server_content, server_tags = excluded.server_tags,
        server_folder_id = excluded.server_folder_id, server_pinned = excluded.server_pinned,
        server_revision = excluded.server_revision, created_at = excluded.created_at
    `).run(noteId, local.title, local.content, JSON.stringify(local.tags), local.folderId, local.pinned ? 1 : 0,
      server.title, server.content, JSON.stringify(server.tags), server.folderId, server.pinned ? 1 : 0,
      local.revision, server.revision, Date.now())
    this.db.prepare('UPDATE notes SET conflict = 1 WHERE id = ?').run(noteId)
  }

  getConflicts(): ConflictSummary[] {
    const rows = this.db.prepare('SELECT * FROM conflicts ORDER BY created_at DESC').all() as Row[]
    return rows.map((row) => ({
      noteId: String(row.note_id ?? ''),
      localTitle: String(row.local_title ?? ''),
      serverTitle: String(row.server_title ?? ''),
      baseRevision: row.base_revision === null || row.base_revision === undefined ? null : Number(row.base_revision),
      serverRevision: Number(row.server_revision ?? 0),
      createdAt: Number(row.created_at ?? 0),
    }))
  }

  getConflict(noteId: string): ConflictDetail | null {
    const row = this.db.prepare('SELECT * FROM conflicts WHERE note_id = ?').get(noteId) as Row | undefined
    if (row === undefined) return null
    return {
      noteId: String(row.note_id ?? ''),
      localTitle: String(row.local_title ?? ''),
      localContent: String(row.local_content ?? ''),
      localTags: parseTags(row.local_tags),
      localFolderId: row.local_folder_id === null || row.local_folder_id === undefined ? null : String(row.local_folder_id),
      serverTitle: String(row.server_title ?? ''),
      serverContent: String(row.server_content ?? ''),
      serverTags: parseTags(row.server_tags),
      serverFolderId: row.server_folder_id === null || row.server_folder_id === undefined ? null : String(row.server_folder_id),
      baseRevision: row.base_revision === null || row.base_revision === undefined ? null : Number(row.base_revision),
      serverRevision: Number(row.server_revision ?? 0),
      createdAt: Number(row.created_at ?? 0),
    }
  }

  adoptServerConflict(noteId: string): void {
    const conflict = this.getConflict(noteId)
    if (conflict === null) return
    this.db.prepare(`
      UPDATE notes SET title = ?, content = ?, tags = ?, folder_id = ?, pinned = ?, server_revision = ?,
        server_updated_at = ?, deleted = 0, deleted_at = NULL, dirty = 0, conflict = 0, body_loaded = 1 WHERE id = ?
    `).run(conflict.serverTitle, conflict.serverContent, JSON.stringify(conflict.serverTags),
      conflict.serverFolderId, conflict.serverPinned ? 1 : 0, conflict.serverRevision, Date.now(), noteId)
    this.db.prepare('DELETE FROM conflicts WHERE note_id = ?').run(noteId)
  }

  keepLocalConflict(noteId: string): void {
    const conflict = this.getConflict(noteId)
    if (conflict === null) return
    const serverRevision = conflict.serverRevision
    if (serverRevision > 0) {
      this.db.prepare('UPDATE notes SET server_revision = ?, dirty = 1, conflict = 0 WHERE id = ?')
        .run(serverRevision, noteId)
    } else {
      this.db.prepare('UPDATE notes SET server_revision = NULL, dirty = 1, conflict = 0 WHERE id = ?').run(noteId)
    }
    this.db.prepare('DELETE FROM conflicts WHERE note_id = ?').run(noteId)
  }

  // -- search / stats -------------------------------------------------------

  search(query: string, limit = 50): SearchResult[] {
    const text = query.trim()
    const rows = text === ''
      ? this.db.prepare('SELECT * FROM notes WHERE deleted = 0 ORDER BY COALESCE(server_updated_at, updated_at) DESC LIMIT ?').all(limit) as Row[]
      : this.db.prepare("SELECT * FROM notes WHERE deleted = 0 AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\') ORDER BY COALESCE(server_updated_at, updated_at) DESC LIMIT ?")
        .all(`%${escapeLike(text)}%`, `%${escapeLike(text)}%`, limit) as Row[]
    return rows.map((row) => {
      const meta = this.noteMeta(row)
      const content = String(row.content ?? '').replace(/\s+/gu, ' ').trim()
      const index = text === '' ? -1 : content.toLowerCase().indexOf(text.toLowerCase())
      const snippet = index < 0 ? content.slice(0, 180) : `${index > 40 ? '…' : ''}${content.slice(Math.max(0, index - 40), index + 160)}`
      return { note: meta, snippet }
    })
  }

  getTrashLocal(): NoteMeta[] {
    const rows = this.db.prepare('SELECT * FROM notes WHERE deleted = 1 ORDER BY deleted_at DESC').all() as Row[]
    return rows.map((row) => this.noteMeta(row))
  }

  counts(): { notes: number; folders: number; attachments: number; pending: number; conflicts: number } {
    const notes = Number((this.db.prepare('SELECT COUNT(*) AS n FROM notes WHERE deleted = 0').get() as Row)?.n ?? 0)
    const folders = Number((this.db.prepare('SELECT COUNT(*) AS n FROM folders WHERE deleted = 0').get() as Row)?.n ?? 0)
    const attachments = Number((this.db.prepare('SELECT COUNT(*) AS n FROM attachments').get() as Row)?.n ?? 0)
    const pending = Number((this.db.prepare('SELECT COUNT(*) AS n FROM notes WHERE dirty = 1 AND conflict = 0').get() as Row)?.n ?? 0)
      + Number((this.db.prepare('SELECT COUNT(*) AS n FROM folders WHERE dirty = 1').get() as Row)?.n ?? 0)
    const conflicts = Number((this.db.prepare('SELECT COUNT(*) AS n FROM conflicts').get() as Row)?.n ?? 0)
    return { notes, folders, attachments, pending, conflicts }
  }

  recent(limit = 20): NoteMeta[] {
    const rows = this.db.prepare('SELECT n.* FROM recent r JOIN notes n ON n.id = r.note_id WHERE n.deleted = 0 ORDER BY r.opened_at DESC LIMIT ?').all(limit) as Row[]
    return rows.map((row) => this.noteMeta(row))
  }

  markRecent(noteId: string): void {
    this.db.prepare('INSERT INTO recent (note_id, opened_at) VALUES (?, ?) ON CONFLICT(note_id) DO UPDATE SET opened_at = excluded.opened_at')
      .run(noteId, Date.now())
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

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}
