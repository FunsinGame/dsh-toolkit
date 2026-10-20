/**
 * Notes service: ownership-scoped accounts, folders, notes, versions,
 * attachments, incremental changes and idempotent mutations.
 *
 * This is the single business layer used by the HTTP API, the MCP endpoint and
 * the CLI. It never renders HTML and never executes user content.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import type { ServerConfig } from './config.ts'
import type { NotesDatabase } from './db.ts'
import { serverId } from './db.ts'
import { normalizeTags, noteTitleFromContent } from '../shared/format.ts'
import type {
  AttachmentMeta,
  ChangeRow,
  ChangesResult,
  ConflictDetail,
  FolderMeta,
  NoteDetail,
  NoteMeta,
  NoteCreateInput,
  NoteUpdateInput,
  SearchResult,
  ServerInfo,
  TreeSnapshot,
  UserInfo,
  VersionDetail,
  VersionSummary,
} from '../shared/types.ts'
import {
  createAccessToken,
  createDummyHash,
  createSessionId,
  hashPassword,
  hashSessionId,
  hashToken,
  normalizeUsername,
  passwordPolicyError,
  verifyPassword,
  validUsername,
  type AccessTokenValue,
} from './security.ts'
import { hardenFile, IS_WINDOWS } from './platform.ts'

export class ServiceError extends Error {
  readonly status: number
  readonly code: string
  readonly extra: Record<string, unknown>

  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ServiceError'
    this.status = status
    this.code = code
    this.extra = extra
  }
}

export interface UserRow {
  id: string
  username: string
  display_name: string
  password_hash: string
  disabled: number
  created_at: number
  updated_at: number
  password_changed_at: number
}

export interface AuthContext {
  user: UserInfo
  kind: 'session' | 'token'
  scopes: string[]
  sessionHash?: string
  tokenId?: string
}

export interface CreateUserInput {
  username: string
  password: string
  displayName?: string
}

export interface CreateTokenInput {
  name: string
  readOnly?: boolean
  expiresDays?: number
}

export interface CreateTokenResult {
  token: string
  id: string
  prefix: string
  name: string
  scopes: string
  expiresAt: number | null
}

export class NotesService {
  private readonly db: NotesDatabase
  private readonly config: ServerConfig
  private readonly version: string
  private readonly listeners = new Set<(event: { userId: string; change: ChangeRow }) => void>()
  private pendingChanges: ChangeRow[] = []
  private dummyHash = ''
  private readonly tokenTouch = new Map<string, number>()
  private readonly sessionTouch = new Map<string, number>()

  constructor(db: NotesDatabase, config: ServerConfig, version: string) {
    this.db = db
    this.config = config
    this.version = version
  }

  async init(): Promise<void> {
    this.dummyHash = await createDummyHash()
  }

  onChange(listener: (event: { userId: string; change: ChangeRow }) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  serverInfo(): ServerInfo {
    return { id: serverId(this.db), version: this.version, time: Date.now() }
  }

  // -- transactions and change log -----------------------------------------

  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    this.pendingChanges = []
    try {
      const result = fn()
      this.db.exec('COMMIT')
      const changes = this.pendingChanges
      this.pendingChanges = []
      for (const change of changes) {
        for (const listener of this.listeners) {
          try {
            listener({ userId: String((change.data as { ownerId?: string } | null)?.ownerId ?? ''), change })
          } catch {
            /* A broken SSE listener must not fail the mutation. */
          }
        }
      }
      return result
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        /* Ignore. */
      }
      this.pendingChanges = []
      throw error
    }
  }

  private recordChange(userId: string, entity: 'note' | 'folder' | 'attachment', id: string, action: 'upsert' | 'delete', revision: number | null, data: Record<string, unknown> | null): ChangeRow {
    const at = Date.now()
    const payload = data === null ? null : { ...data, ownerId: userId }
    const result = this.db.prepare(
      'INSERT INTO changes (user_id, entity, entity_id, action, revision, data, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(userId, entity, id, action, revision, payload === null ? null : JSON.stringify(payload), at)
    const change: ChangeRow = {
      seq: Number(result.lastInsertRowid),
      entity,
      id,
      action,
      revision,
      data: payload,
      at,
    }
    this.pendingChanges.push(change)
    return change
  }

  private markOperation(opId: string | undefined, userId: string, entity: string, entityId: string): boolean {
    if (typeof opId !== 'string' || opId === '') return false
    try {
      this.db.prepare('INSERT INTO operations (op_id, user_id, entity, entity_id, at) VALUES (?, ?, ?, ?, ?)')
        .run(opId, userId, entity, entityId, Date.now())
      return false
    } catch (error) {
      if (String((error as { code?: string }).code ?? '').includes('CONSTRAINT')) return true
      throw error
    }
  }

  private operationEntity(opId: string | undefined): string | null {
    if (typeof opId !== 'string' || opId === '') return null
    const row = this.db.prepare('SELECT entity_id FROM operations WHERE op_id = ?').get(opId) as { entity_id?: string } | undefined
    return typeof row?.entity_id === 'string' ? row.entity_id : null
  }

  // -- accounts -------------------------------------------------------------

  async createUser(input: CreateUserInput): Promise<UserInfo> {
    const username = normalizeUsername(input.username)
    if (!validUsername(username)) throw new ServiceError(400, 'INVALID_USERNAME', '用户名需为 1-64 位字母、数字、点、下划线或连字符')
    const policy = passwordPolicyError(input.password, username)
    if (policy !== null) throw new ServiceError(400, 'WEAK_PASSWORD', policy)
    const existing = this.db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existing !== undefined) throw new ServiceError(409, 'USER_EXISTS', '用户名已存在')
    const hash = await hashPassword(input.password)
    const id = randomUUID()
    const now = Date.now()
    const displayName = (input.displayName ?? input.username).trim().slice(0, 80) || input.username
    this.db.prepare(
      'INSERT INTO users (id, username, display_name, password_hash, disabled, created_at, updated_at, password_changed_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)',
    ).run(id, username, displayName, hash, now, now, now)
    return { id, username, displayName }
  }

  getUserByUsername(username: string): UserRow | null {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(normalizeUsername(username)) as UserRow | undefined
    return row ?? null
  }

  getUserById(id: string): UserRow | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
    return row ?? null
  }

  listUsers(): Array<Record<string, unknown>> {
    const rows = this.db.prepare('SELECT id, username, display_name, disabled, created_at, updated_at, password_changed_at FROM users ORDER BY username').all() as Array<Record<string, unknown>>
    return rows.map((row) => ({ ...row }))
  }

  async verifyLogin(username: string, password: string): Promise<UserRow | null> {
    const user = this.getUserByUsername(username)
    if (user === null) {
      if (this.dummyHash !== '') await verifyPassword(password, this.dummyHash)
      return null
    }
    const result = await verifyPassword(password, user.password_hash)
    if (!result.ok || user.disabled === 1) return null
    if (result.needsRehash) {
      try {
        const hash = await hashPassword(password)
        this.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, Date.now(), user.id)
      } catch {
        /* Rehash is an optimization; keep the old hash if it fails. */
      }
    }
    return user
  }

  async setPassword(userId: string, password: string, options: { keepTokens?: boolean } = {}): Promise<void> {
    const user = this.getUserById(userId)
    if (user === null) throw new ServiceError(404, 'USER_NOT_FOUND', '用户不存在')
    const policy = passwordPolicyError(password, user.username)
    if (policy !== null) throw new ServiceError(400, 'WEAK_PASSWORD', policy)
    const hash = await hashPassword(password)
    const now = Date.now()
    this.db.prepare('UPDATE users SET password_hash = ?, updated_at = ?, password_changed_at = ? WHERE id = ?').run(hash, now, now, userId)
    this.deleteUserSessions(userId)
    if (options.keepTokens !== true) this.deleteUserTokens(userId)
  }

  setUserDisabled(userId: string, disabled: boolean): void {
    const user = this.getUserById(userId)
    if (user === null) throw new ServiceError(404, 'USER_NOT_FOUND', '用户不存在')
    this.db.prepare('UPDATE users SET disabled = ?, updated_at = ? WHERE id = ?').run(disabled ? 1 : 0, Date.now(), userId)
    if (disabled) {
      this.deleteUserSessions(userId)
      this.deleteUserTokens(userId)
    }
  }

  async removeUser(userId: string, options: { purge?: boolean } = {}): Promise<void> {
    const user = this.getUserById(userId)
    if (user === null) throw new ServiceError(404, 'USER_NOT_FOUND', '用户不存在')
    const noteCount = Number((this.db.prepare('SELECT COUNT(*) AS n FROM notes WHERE owner_id = ?').get(userId) as { n?: number }).n ?? 0)
    if (noteCount > 0 && options.purge !== true) {
      throw new ServiceError(400, 'USER_HAS_NOTES', `该用户仍有 ${noteCount} 条笔记；使用 --purge 删除全部数据`)
    }
    if (options.purge === true) {
      const attachments = this.db.prepare('SELECT storage_key FROM attachments WHERE owner_id = ?').all(userId) as Array<{ storage_key?: string }>
      for (const row of attachments) {
        if (typeof row.storage_key === 'string') await rm(this.attachmentPath(row.storage_key), { force: true }).catch(() => undefined)
      }
      this.db.prepare('DELETE FROM note_versions WHERE note_id IN (SELECT id FROM notes WHERE owner_id = ?)').run(userId)
      this.db.prepare('DELETE FROM note_tags WHERE note_id IN (SELECT id FROM notes WHERE owner_id = ?)').run(userId)
      this.db.prepare('DELETE FROM notes WHERE owner_id = ?').run(userId)
      this.db.prepare('DELETE FROM folders WHERE owner_id = ?').run(userId)
      this.db.prepare('DELETE FROM attachments WHERE owner_id = ?').run(userId)
      this.db.prepare('DELETE FROM changes WHERE user_id = ?').run(userId)
      this.db.prepare('DELETE FROM operations WHERE user_id = ?').run(userId)
    }
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
    this.db.prepare('DELETE FROM access_tokens WHERE user_id = ?').run(userId)
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId)
  }

  // -- sessions -------------------------------------------------------------

  createSession(userId: string, meta: { userAgent?: string; ip?: string } = {}): { sessionId: string; expiresAt: number } {
    const sessionId = createSessionId()
    const now = Date.now()
    const expiresAt = now + this.config.sessionDays * 86_400_000
    const idleExpiresAt = now + this.config.sessionIdleDays * 86_400_000
    this.db.prepare(
      'INSERT INTO sessions (id_hash, user_id, created_at, last_used_at, idle_expires_at, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(hashSessionId(sessionId), userId, now, now, idleExpiresAt, expiresAt, (meta.userAgent ?? '').slice(0, 300), (meta.ip ?? '').slice(0, 80))
    return { sessionId, expiresAt }
  }

  authenticateSession(sessionId: string): AuthContext | null {
    if (sessionId === '') return null
    const hash = hashSessionId(sessionId)
    const row = this.db.prepare('SELECT * FROM sessions WHERE id_hash = ?').get(hash) as Record<string, unknown> | undefined
    if (row === undefined) return null
    const now = Date.now()
    const expiresAt = Number(row.expires_at ?? 0)
    const idleExpiresAt = Number(row.idle_expires_at ?? 0)
    if (now >= expiresAt || now >= idleExpiresAt) {
      this.db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hash)
      return null
    }
    const user = this.getUserById(String(row.user_id ?? ''))
    if (user === null || user.disabled === 1) {
      this.db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hash)
      return null
    }
    const lastTouch = this.sessionTouch.get(hash) ?? 0
    if (now - lastTouch > 60_000) {
      this.sessionTouch.set(hash, now)
      this.db.prepare('UPDATE sessions SET last_used_at = ?, idle_expires_at = ? WHERE id_hash = ?')
        .run(now, now + this.config.sessionIdleDays * 86_400_000, hash)
    }
    return {
      user: { id: user.id, username: user.username, displayName: user.display_name, authKind: 'session' },
      kind: 'session',
      scopes: ['read', 'write'],
      sessionHash: hash,
    }
  }

  deleteSession(sessionId: string): void {
    if (sessionId === '') return
    const hash = hashSessionId(sessionId)
    this.db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hash)
    this.sessionTouch.delete(hash)
  }

  deleteUserSessions(userId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  }

  listSessions(userId?: string): Array<Record<string, unknown>> {
    const rows = userId === undefined
      ? this.db.prepare('SELECT * FROM sessions ORDER BY last_used_at DESC').all()
      : this.db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY last_used_at DESC').all(userId)
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id_hash ?? '').slice(0, 12),
      userId: row.user_id,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      userAgent: row.user_agent,
      ip: row.ip,
    }))
  }

  revokeAllSessions(): void {
    this.db.prepare('DELETE FROM sessions').run()
  }

  // -- access tokens --------------------------------------------------------

  createToken(userId: string, input: CreateTokenInput): CreateTokenResult {
    const user = this.getUserById(userId)
    if (user === null) throw new ServiceError(404, 'USER_NOT_FOUND', '用户不存在')
    const name = input.name.trim().slice(0, 80) || 'token'
    const value: AccessTokenValue = createAccessToken()
    const scopes = input.readOnly === true ? 'read' : 'read,write'
    const now = Date.now()
    const expiresAt = input.expiresDays !== undefined && input.expiresDays > 0
      ? now + Math.min(3650, input.expiresDays) * 86_400_000
      : null
    this.db.prepare(
      'INSERT INTO access_tokens (id, user_id, name, token_hash, prefix, scopes, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(value.id, userId, name, value.hash, value.prefix, scopes, now, expiresAt)
    return { token: value.token, id: value.id, prefix: value.prefix, name, scopes, expiresAt }
  }

  authenticateToken(rawToken: string): AuthContext | null {
    if (rawToken === '') return null
    const hash = hashToken(rawToken)
    const row = this.db.prepare('SELECT * FROM access_tokens WHERE token_hash = ?').get(hash) as Record<string, unknown> | undefined
    if (row === undefined) return null
    const now = Date.now()
    const revokedAt = row.revoked_at
    const expiresAt = row.expires_at
    if (revokedAt !== null && revokedAt !== undefined) return null
    if (expiresAt !== null && expiresAt !== undefined && now >= Number(expiresAt)) return null
    const user = this.getUserById(String(row.user_id ?? ''))
    if (user === null || user.disabled === 1) return null
    const id = String(row.id ?? '')
    const lastTouch = this.tokenTouch.get(id) ?? 0
    if (now - lastTouch > 60_000) {
      this.tokenTouch.set(id, now)
      this.db.prepare('UPDATE access_tokens SET last_used_at = ? WHERE id = ?').run(now, id)
    }
    const scopes = String(row.scopes ?? 'read').split(',').map((scope) => scope.trim()).filter(Boolean)
    return {
      user: { id: user.id, username: user.username, displayName: user.display_name, scopes, authKind: 'token' },
      kind: 'token',
      scopes,
      tokenId: id,
    }
  }

  listTokens(userId?: string): Array<Record<string, unknown>> {
    const rows = userId === undefined
      ? this.db.prepare('SELECT * FROM access_tokens ORDER BY created_at DESC').all()
      : this.db.prepare('SELECT * FROM access_tokens WHERE user_id = ? ORDER BY created_at DESC').all(userId)
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: row.id,
      prefix: row.prefix,
      userId: row.user_id,
      name: row.name,
      scopes: row.scopes,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    }))
  }

  revokeToken(idOrPrefix: string): boolean {
    const value = idOrPrefix.trim()
    if (value === '') return false
    const result = this.db.prepare(
      'UPDATE access_tokens SET revoked_at = ? WHERE revoked_at IS NULL AND (id = ? OR prefix = ? OR prefix LIKE ?)',
    ).run(Date.now(), value, value, `${value}%`)
    return Number(result.changes) > 0
  }

  deleteUserTokens(userId: string): void {
    this.db.prepare('DELETE FROM access_tokens WHERE user_id = ?').run(userId)
  }

  // -- notes ----------------------------------------------------------------

  private noteMetaFromRow(row: Record<string, unknown>): NoteMeta {
    let tags: string[] = []
    try {
      const parsed = JSON.parse(String(row.tags ?? '[]'))
      if (Array.isArray(parsed)) tags = parsed.filter((tag): tag is string => typeof tag === 'string')
    } catch {
      tags = []
    }
    return {
      id: String(row.id ?? ''),
      folderId: row.folder_id === null || row.folder_id === undefined ? null : String(row.folder_id),
      title: String(row.title ?? ''),
      tags,
      pinned: Number(row.pinned ?? 0) === 1,
      revision: Number(row.revision ?? 1),
      createdAt: Number(row.created_at ?? 0),
      updatedAt: Number(row.updated_at ?? 0),
      deletedAt: row.deleted_at === null || row.deleted_at === undefined ? null : Number(row.deleted_at),
      createdBy: row.created_by === null || row.created_by === undefined ? null : String(row.created_by),
      updatedBy: row.updated_by === null || row.updated_by === undefined ? null : String(row.updated_by),
    }
  }

  private attachmentMetaFromRow(row: Record<string, unknown>): AttachmentMeta {
    return {
      id: String(row.id ?? ''),
      noteId: String(row.note_id ?? ''),
      filename: String(row.filename ?? ''),
      mime: String(row.mime ?? 'application/octet-stream'),
      size: Number(row.size ?? 0),
      createdAt: Number(row.created_at ?? 0),
    }
  }

  private noteRow(userId: string, noteId: string): Record<string, unknown> | null {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ? AND owner_id = ?').get(noteId, userId) as Record<string, unknown> | undefined
    return row ?? null
  }

  private requireNote(userId: string, noteId: string): Record<string, unknown> {
    const row = this.noteRow(userId, noteId)
    if (row === null) throw new ServiceError(404, 'NOTE_NOT_FOUND', '笔记不存在')
    return row
  }

  private folderRow(userId: string, folderId: string): Record<string, unknown> | null {
    const row = this.db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ?').get(folderId, userId) as Record<string, unknown> | undefined
    return row ?? null
  }

  private requireFolder(userId: string, folderId: string): Record<string, unknown> {
    const row = this.folderRow(userId, folderId)
    if (row === null) throw new ServiceError(404, 'FOLDER_NOT_FOUND', '目录不存在')
    return row
  }

  private validateFolder(userId: string, folderId: string | null | undefined): void {
    if (folderId === null || folderId === undefined) return
    if (typeof folderId !== 'string' || !isValidId(folderId)) throw new ServiceError(400, 'INVALID_FOLDER', '目录 ID 无效')
    this.requireFolder(userId, folderId)
  }

  private folderMetaFromRow(row: Record<string, unknown>): FolderMeta {
    return {
      id: String(row.id ?? ''),
      parentId: row.parent_id === null || row.parent_id === undefined ? null : String(row.parent_id),
      name: String(row.name ?? ''),
      sortOrder: Number(row.sort_order ?? 0),
      revision: Number(row.revision ?? 1),
      createdAt: Number(row.created_at ?? 0),
      updatedAt: Number(row.updated_at ?? 0),
    }
  }

  noteDetail(userId: string, noteId: string): NoteDetail {
    const row = this.requireNote(userId, noteId)
    if (row.deleted_at !== null && row.deleted_at !== undefined) throw new ServiceError(404, 'NOTE_NOT_FOUND', '笔记已在回收站')
    const meta = this.noteMetaFromRow(row)
    const attachmentRows = this.db.prepare(
      'SELECT * FROM attachments WHERE note_id = ? AND owner_id = ? AND deleted_at IS NULL ORDER BY created_at ASC',
    ).all(noteId, userId) as Array<Record<string, unknown>>
    return {
      ...meta,
      content: String(row.content ?? ''),
      attachments: attachmentRows.map((item) => this.attachmentMetaFromRow(item)),
    }
  }

  listAttachments(userId: string, noteId: string): AttachmentMeta[] {
    this.requireNote(userId, noteId)
    const rows = this.db.prepare(
      'SELECT * FROM attachments WHERE note_id = ? AND owner_id = ? AND deleted_at IS NULL ORDER BY created_at ASC',
    ).all(noteId, userId) as Array<Record<string, unknown>>
    return rows.map((row) => this.attachmentMetaFromRow(row))
  }

  createNote(userId: string, input: NoteCreateInput): NoteDetail {
    const content = typeof input.content === 'string' ? input.content : ''
    const title = normalizeTitle(input.title, content)
    const tags = normalizeTags(input.tags)
    const id = typeof input.id === 'string' && input.id !== '' ? input.id : randomUUID()
    if (!isValidId(id)) throw new ServiceError(400, 'INVALID_ID', '笔记 ID 无效')
    this.validateFolder(userId, input.folderId ?? null)
    return this.tx(() => {
      const prior = this.operationEntity(input.opId)
      if (prior !== null) {
        const existing = this.noteRow(userId, prior)
        if (existing !== null) return this.noteDetail(userId, prior)
      }
      const duplicate = this.noteRow(userId, id)
      if (duplicate !== null) throw new ServiceError(409, 'ID_CONFLICT', '笔记 ID 已存在')
      if (this.markOperation(input.opId, userId, 'note', id)) {
        return this.noteDetail(userId, id)
      }
      const now = Date.now()
      this.db.prepare(
        'INSERT INTO notes (id, owner_id, folder_id, title, content, tags, pinned, revision, created_at, updated_at, created_by, updated_by, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, NULL)',
      ).run(id, userId, input.folderId ?? null, title, content, JSON.stringify(tags), input.pinned === true ? 1 : 0, now, now, userId, userId)
      this.replaceTags(id, tags)
      const detail = this.noteDetail(userId, id)
      this.recordChange(userId, 'note', id, 'upsert', detail.revision, this.changeData(detail))
      return detail
    })
  }

  updateNote(userId: string, noteId: string, input: NoteUpdateInput): NoteDetail {
    const row = this.requireNote(userId, noteId)
    if (row.deleted_at !== null && row.deleted_at !== undefined) throw new ServiceError(404, 'NOTE_NOT_FOUND', '笔记已在回收站')
    const prior = this.operationEntity(input.opId)
    if (prior !== null) return this.noteDetail(userId, noteId)
    const currentRevision = Number(row.revision ?? 1)
    const baseRevision = Number(input.baseRevision)
    if (!Number.isFinite(baseRevision)) throw new ServiceError(400, 'BASE_REVISION_REQUIRED', '更新必须提供 baseRevision')
    if (baseRevision !== currentRevision) {
      throw new ServiceError(409, 'REVISION_CONFLICT', '笔记已被其他设备修改', { current: this.noteDetail(userId, noteId) })
    }
    if (input.folderId !== undefined) this.validateFolder(userId, input.folderId)
    return this.tx(() => {
      const latest = this.requireNote(userId, noteId)
      if (Number(latest.revision ?? 1) !== baseRevision) {
        throw new ServiceError(409, 'REVISION_CONFLICT', '笔记已被其他设备修改', { current: this.noteDetail(userId, noteId) })
      }
      if (this.markOperation(input.opId, userId, 'note', noteId)) return this.noteDetail(userId, noteId)
      const nextContent = typeof input.content === 'string' ? input.content : String(latest.content ?? '')
      const nextTitle = typeof input.title === 'string' ? normalizeTitle(input.title, nextContent) : String(latest.title ?? '')
      const nextTags = input.tags !== undefined ? normalizeTags(input.tags) : parseTags(String(latest.tags ?? '[]'))
      const contentChanged = nextContent !== String(latest.content ?? '')
        || nextTitle !== String(latest.title ?? '')
        || JSON.stringify(nextTags) !== String(latest.tags ?? '[]')
      if (contentChanged && this.config.versionsPerNote > 0) {
        this.db.prepare(
          'INSERT OR REPLACE INTO note_versions (note_id, revision, title, content, tags, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(noteId, Number(latest.revision ?? 1), String(latest.title ?? ''), String(latest.content ?? ''), String(latest.tags ?? '[]'), userId, Date.now())
        this.pruneVersions(noteId)
      }
      const nextRevision = Number(latest.revision ?? 1) + 1
      const now = Date.now()
      const nextFolder = input.folderId === undefined
        ? latest.folder_id
        : input.folderId
      const nextPinned = input.pinned === undefined ? Number(latest.pinned ?? 0) : input.pinned ? 1 : 0
      this.db.prepare(
        'UPDATE notes SET title = ?, content = ?, tags = ?, pinned = ?, folder_id = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = ? AND owner_id = ?',
      ).run(nextTitle, nextContent, JSON.stringify(nextTags), nextPinned, nextFolder, nextRevision, now, userId, noteId, userId)
      if (input.tags !== undefined) this.replaceTags(noteId, nextTags)
      const detail = this.noteDetail(userId, noteId)
      this.recordChange(userId, 'note', noteId, 'upsert', detail.revision, this.changeData(detail))
      return detail
    })
  }

  moveNote(userId: string, noteId: string, folderId: string | null, baseRevision: number, opId?: string): NoteDetail {
    return this.updateNote(userId, noteId, { baseRevision, folderId, opId })
  }

  deleteNote(userId: string, noteId: string, options: { permanent?: boolean } = {}): void {
    const row = this.requireNote(userId, noteId)
    if (options.permanent === true) {
      const attachments = this.db.prepare('SELECT storage_key FROM attachments WHERE note_id = ? AND owner_id = ?').all(noteId, userId) as Array<{ storage_key?: string }>
      for (const attachment of attachments) {
        if (typeof attachment.storage_key === 'string') {
          try {
            rmSync(this.attachmentPath(attachment.storage_key), { force: true })
          } catch {
            /* A missing file should not block removing the metadata. */
          }
        }
      }
      this.tx(() => {
        this.db.prepare('DELETE FROM attachments WHERE note_id = ? AND owner_id = ?').run(noteId, userId)
        this.db.prepare('DELETE FROM note_versions WHERE note_id = ?').run(noteId)
        this.db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId)
        this.db.prepare('DELETE FROM notes WHERE id = ? AND owner_id = ?').run(noteId, userId)
        this.recordChange(userId, 'note', noteId, 'delete', null, { id: noteId, permanent: true })
      })
      return
    }
    if (row.deleted_at !== null && row.deleted_at !== undefined) return
    this.tx(() => {
      const now = Date.now()
      const nextRevision = Number(row.revision ?? 1) + 1
      this.db.prepare('UPDATE notes SET deleted_at = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = ? AND owner_id = ?')
        .run(now, nextRevision, now, userId, noteId, userId)
      this.recordChange(userId, 'note', noteId, 'delete', nextRevision, {
        id: noteId,
        folderId: row.folder_id ?? null,
        title: String(row.title ?? ''),
        deletedAt: now,
      })
    })
  }

  restoreNote(userId: string, noteId: string): NoteDetail {
    const row = this.requireNote(userId, noteId)
    this.tx(() => {
      const now = Date.now()
      const nextRevision = Number(row.revision ?? 1) + 1
      this.db.prepare('UPDATE notes SET deleted_at = NULL, revision = ?, updated_at = ?, updated_by = ? WHERE id = ? AND owner_id = ?')
        .run(nextRevision, now, userId, noteId, userId)
      const detail = this.noteDetail(userId, noteId)
      this.recordChange(userId, 'note', noteId, 'upsert', detail.revision, this.changeData(detail))
    })
    return this.noteDetail(userId, noteId)
  }

  listTree(userId: string): TreeSnapshot {
    const folders = this.db.prepare('SELECT * FROM folders WHERE owner_id = ? ORDER BY sort_order ASC, name COLLATE NOCASE ASC')
      .all(userId) as Array<Record<string, unknown>>
    const notes = this.db.prepare('SELECT * FROM notes WHERE owner_id = ? AND deleted_at IS NULL ORDER BY pinned DESC, updated_at DESC')
      .all(userId) as Array<Record<string, unknown>>
    return {
      folders: folders.map((row) => this.folderMetaFromRow(row)),
      notes: notes.map((row) => this.noteMetaFromRow(row)),
      cursor: this.currentCursor(userId),
      server: this.serverInfo(),
    }
  }

  listTrash(userId: string): NoteMeta[] {
    const rows = this.db.prepare('SELECT * FROM notes WHERE owner_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC')
      .all(userId) as Array<Record<string, unknown>>
    return rows.map((row) => this.noteMetaFromRow(row))
  }

  search(userId: string, query: string, options: { folderId?: string | null; tag?: string; limit?: number } = {}): SearchResult[] {
    const text = query.trim().slice(0, 200)
    const limit = Math.min(200, Math.max(1, Number(options.limit ?? 50)))
    const clauses = ['owner_id = ?', 'deleted_at IS NULL']
    const params: unknown[] = [userId]
    if (text !== '') {
      const escaped = text.replace(/[\\%_]/g, (match) => `\\${match}`)
      clauses.push("(title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')")
      params.push(`%${escaped}%`, `%${escaped}%`)
    }
    if (options.folderId !== undefined) {
      if (options.folderId === null) {
        clauses.push('folder_id IS NULL')
      } else {
        clauses.push('folder_id = ?')
        params.push(options.folderId)
      }
    }
    if (typeof options.tag === 'string' && options.tag.trim() !== '') {
      clauses.push('id IN (SELECT note_id FROM note_tags WHERE tag = ?)')
      params.push(options.tag.trim())
    }
    params.push(limit)
    const rows = this.db.prepare(
      `SELECT * FROM notes WHERE ${clauses.join(' AND ')} ORDER BY pinned DESC, updated_at DESC LIMIT ?`,
    ).all(...params) as Array<Record<string, unknown>>
    return rows.map((row) => {
      const meta = this.noteMetaFromRow(row)
      const content = String(row.content ?? '')
      return { note: meta, snippet: makeSnippet(content, text) }
    })
  }

  listVersions(userId: string, noteId: string): VersionSummary[] {
    this.requireNote(userId, noteId)
    const rows = this.db.prepare(
      'SELECT revision, title, created_at, created_by FROM note_versions WHERE note_id = ? ORDER BY revision DESC LIMIT 200',
    ).all(noteId) as Array<Record<string, unknown>>
    return rows.map((row) => ({
      revision: Number(row.revision ?? 0),
      title: String(row.title ?? ''),
      createdAt: Number(row.created_at ?? 0),
      createdBy: row.created_by === null ? null : String(row.created_by ?? ''),
    }))
  }

  getVersion(userId: string, noteId: string, revision: number): VersionDetail {
    this.requireNote(userId, noteId)
    const row = this.db.prepare('SELECT * FROM note_versions WHERE note_id = ? AND revision = ?').get(noteId, revision) as Record<string, unknown> | undefined
    if (row === undefined) throw new ServiceError(404, 'VERSION_NOT_FOUND', '历史版本不存在')
    return {
      revision: Number(row.revision ?? 0),
      title: String(row.title ?? ''),
      content: String(row.content ?? ''),
      tags: parseTags(String(row.tags ?? '[]')),
      createdAt: Number(row.created_at ?? 0),
      createdBy: row.created_by === null ? null : String(row.created_by ?? ''),
    }
  }

  revertNote(userId: string, noteId: string, revision: number, opId?: string): NoteDetail {
    const version = this.getVersion(userId, noteId, revision)
    const note = this.noteDetail(userId, noteId)
    return this.updateNote(userId, noteId, {
      baseRevision: note.revision,
      title: version.title,
      content: version.content,
      tags: version.tags,
      opId,
    })
  }

  // -- folders --------------------------------------------------------------

  createFolder(userId: string, input: { id?: string; parentId?: string | null; name: string; opId?: string }): FolderMeta {
    const name = normalizeFolderName(input.name)
    const id = typeof input.id === 'string' && input.id !== '' ? input.id : randomUUID()
    if (!isValidId(id)) throw new ServiceError(400, 'INVALID_ID', '目录 ID 无效')
    this.validateFolder(userId, input.parentId ?? null)
    return this.tx(() => {
      const prior = this.operationEntity(input.opId)
      if (prior !== null && this.folderRow(userId, prior) !== null) return this.folderMetaFromRow(this.folderRow(userId, prior) as Record<string, unknown>)
      if (this.folderRow(userId, id) !== null) throw new ServiceError(409, 'ID_CONFLICT', '目录 ID 已存在')
      this.markOperation(input.opId, userId, 'folder', id)
      const now = Date.now()
      const order = Number((this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM folders WHERE owner_id = ?').get(userId) as { n?: number }).n ?? 0) + 1
      this.db.prepare(
        'INSERT INTO folders (id, owner_id, parent_id, name, sort_order, created_at, updated_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      ).run(id, userId, input.parentId ?? null, name, order, now, now)
      const meta = this.folderMetaFromRow(this.requireFolder(userId, id))
      this.recordChange(userId, 'folder', id, 'upsert', meta.revision, { ...meta })
      return meta
    })
  }

  updateFolder(userId: string, folderId: string, input: { baseRevision: number; name?: string; parentId?: string | null; opId?: string }): FolderMeta {
    const row = this.requireFolder(userId, folderId)
    const prior = this.operationEntity(input.opId)
    if (prior !== null) return this.folderMetaFromRow(this.requireFolder(userId, folderId))
    const base = Number(input.baseRevision)
    if (!Number.isFinite(base)) throw new ServiceError(400, 'BASE_REVISION_REQUIRED', '更新目录必须提供 baseRevision')
    if (base !== Number(row.revision ?? 1)) throw new ServiceError(409, 'REVISION_CONFLICT', '目录已被修改')
    if (input.parentId !== undefined && input.parentId !== null) {
      this.validateFolder(userId, input.parentId)
      this.assertNoFolderCycle(userId, folderId, input.parentId)
    }
    return this.tx(() => {
      this.markOperation(input.opId, userId, 'folder', folderId)
      const latest = this.requireFolder(userId, folderId)
      if (Number(latest.revision ?? 1) !== base) throw new ServiceError(409, 'REVISION_CONFLICT', '目录已被修改')
      const name = input.name === undefined ? String(latest.name ?? '') : normalizeFolderName(input.name)
      const parentId = input.parentId === undefined ? latest.parent_id : input.parentId
      const revision = Number(latest.revision ?? 1) + 1
      this.db.prepare('UPDATE folders SET name = ?, parent_id = ?, revision = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
        .run(name, parentId, revision, Date.now(), folderId, userId)
      const meta = this.folderMetaFromRow(this.requireFolder(userId, folderId))
      this.recordChange(userId, 'folder', folderId, 'upsert', meta.revision, { ...meta })
      return meta
    })
  }

  deleteFolder(userId: string, folderId: string, options: { recursive?: boolean } = {}): void {
    const folder = this.requireFolder(userId, folderId)
    const parentId = folder.parent_id === null || folder.parent_id === undefined ? null : String(folder.parent_id)
    if (options.recursive === true) {
      const descendants = this.descendantFolders(userId, folderId)
      const ids = [folderId, ...descendants]
      this.tx(() => {
        const placeholders = ids.map(() => '?').join(',')
        const noteRows = this.db.prepare(
          `SELECT * FROM notes WHERE owner_id = ? AND deleted_at IS NULL AND folder_id IN (${placeholders})`,
        ).all(userId, ...ids) as Array<Record<string, unknown>>
        const now = Date.now()
        for (const note of noteRows) {
          const revision = Number(note.revision ?? 1) + 1
          this.db.prepare('UPDATE notes SET deleted_at = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = ?')
            .run(now, revision, now, userId, String(note.id ?? ''))
          this.recordChange(userId, 'note', String(note.id ?? ''), 'delete', revision, {
            id: String(note.id ?? ''),
            folderId: note.folder_id ?? null,
            title: String(note.title ?? ''),
            deletedAt: now,
          })
        }
        for (const id of ids) {
          this.db.prepare('DELETE FROM folders WHERE id = ? AND owner_id = ?').run(id, userId)
          this.recordChange(userId, 'folder', id, 'delete', null, { id })
        }
      })
      return
    }
    this.tx(() => {
      const now = Date.now()
      const childNotes = this.db.prepare('SELECT * FROM notes WHERE owner_id = ? AND folder_id = ? AND deleted_at IS NULL')
        .all(userId, folderId) as Array<Record<string, unknown>>
      for (const note of childNotes) {
        const revision = Number(note.revision ?? 1) + 1
        this.db.prepare('UPDATE notes SET folder_id = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = ?')
          .run(parentId, revision, now, userId, String(note.id ?? ''))
        const detail = this.noteDetail(userId, String(note.id ?? ''))
        this.recordChange(userId, 'note', detail.id, 'upsert', detail.revision, this.changeData(detail))
      }
      const childFolders = this.db.prepare('SELECT * FROM folders WHERE owner_id = ? AND parent_id = ?')
        .all(userId, folderId) as Array<Record<string, unknown>>
      for (const child of childFolders) {
        const revision = Number(child.revision ?? 1) + 1
        this.db.prepare('UPDATE folders SET parent_id = ?, revision = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
          .run(parentId, revision, now, String(child.id ?? ''), userId)
        const meta = this.folderMetaFromRow(this.requireFolder(userId, String(child.id ?? '')))
        this.recordChange(userId, 'folder', meta.id, 'upsert', meta.revision, { ...meta })
      }
      this.db.prepare('DELETE FROM folders WHERE id = ? AND owner_id = ?').run(folderId, userId)
      this.recordChange(userId, 'folder', folderId, 'delete', null, { id: folderId })
    })
  }

  private descendantFolders(userId: string, folderId: string): string[] {
    const result: string[] = []
    const stack = [folderId]
    while (stack.length > 0) {
      const current = stack.pop() as string
      const children = this.db.prepare('SELECT id FROM folders WHERE owner_id = ? AND parent_id = ?')
        .all(userId, current) as Array<{ id?: string }>
      for (const child of children) {
        const id = String(child.id ?? '')
        if (id !== '') {
          result.push(id)
          stack.push(id)
        }
      }
    }
    return result
  }

  private assertNoFolderCycle(userId: string, folderId: string, parentId: string): void {
    let cursor: string | null = parentId
    const seen = new Set<string>()
    while (cursor !== null) {
      if (cursor === folderId) throw new ServiceError(400, 'FOLDER_CYCLE', '不能把目录移动到自身或子目录下')
      if (seen.has(cursor)) break
      seen.add(cursor)
      const row = this.folderRow(userId, cursor)
      if (row === null) break
      cursor = row.parent_id === null || row.parent_id === undefined ? null : String(row.parent_id)
    }
  }

  // -- attachments ----------------------------------------------------------

  attachmentPath(storageKey: string): string {
    return join(this.config.dataDir, 'attachments', ...storageKey.split('/'))
  }

  async createAttachment(userId: string, noteId: string, input: {
    tempPath: string
    storageKey: string
    filename: string
    mime: string
    size: number
    sha256: string
  }): Promise<AttachmentMeta> {
    this.requireNote(userId, noteId)
    const id = input.storageKey.split('/').pop() ?? randomUUID()
    const finalPath = this.attachmentPath(input.storageKey)
    await mkdir(join(finalPath, '..'), { recursive: true })
    await renameWithRetry(input.tempPath, finalPath)
    await hardenFile(finalPath, 0o600)
    try {
      return this.tx(() => {
        const now = Date.now()
        this.db.prepare(
          'INSERT INTO attachments (id, note_id, owner_id, filename, mime, size, sha256, storage_key, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)',
        ).run(id, noteId, userId, input.filename, input.mime, input.size, input.sha256, input.storageKey, now)
        const meta = this.attachmentMetaFromRow(this.db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Record<string, unknown>)
        this.recordChange(userId, 'attachment', id, 'upsert', null, { ...meta })
        return meta
      })
    } catch (error) {
      await rm(finalPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  getAttachmentForRead(userId: string, attachmentId: string): { meta: AttachmentMeta; path: string } {
    const row = this.db.prepare(
      'SELECT * FROM attachments WHERE id = ? AND owner_id = ? AND deleted_at IS NULL',
    ).get(attachmentId, userId) as Record<string, unknown> | undefined
    if (row === undefined) throw new ServiceError(404, 'ATTACHMENT_NOT_FOUND', '附件不存在')
    const storageKey = String(row.storage_key ?? '')
    return { meta: this.attachmentMetaFromRow(row), path: this.attachmentPath(storageKey) }
  }

  async deleteAttachment(userId: string, attachmentId: string): Promise<void> {
    const row = this.db.prepare('SELECT * FROM attachments WHERE id = ? AND owner_id = ?').get(attachmentId, userId) as Record<string, unknown> | undefined
    if (row === undefined) throw new ServiceError(404, 'ATTACHMENT_NOT_FOUND', '附件不存在')
    const storageKey = String(row.storage_key ?? '')
    await rm(this.attachmentPath(storageKey), { force: true }).catch(() => undefined)
    this.tx(() => {
      this.db.prepare('DELETE FROM attachments WHERE id = ? AND owner_id = ?').run(attachmentId, userId)
      this.recordChange(userId, 'attachment', attachmentId, 'delete', null, { id: attachmentId, noteId: row.note_id ?? null })
    })
  }

  async statAttachment(userId: string, attachmentId: string): Promise<{ meta: AttachmentMeta; path: string; size: number }> {
    const found = this.getAttachmentForRead(userId, attachmentId)
    const info = await stat(found.path).catch(() => null)
    if (info === null) throw new ServiceError(404, 'ATTACHMENT_FILE_MISSING', '附件文件不存在')
    return { ...found, size: info.size }
  }

  // -- sync -----------------------------------------------------------------

  currentCursor(userId: string): number {
    const row = this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM changes WHERE user_id = ?').get(userId) as { seq?: number } | undefined
    return Number(row?.seq ?? 0)
  }

  getChanges(userId: string, since: number, limit = 500): ChangesResult {
    const safeSince = Math.max(0, Number.isFinite(since) ? Math.trunc(since) : 0)
    const safeLimit = Math.min(1000, Math.max(1, Math.trunc(limit)))
    const rows = this.db.prepare(
      'SELECT * FROM changes WHERE user_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?',
    ).all(userId, safeSince, safeLimit + 1) as Array<Record<string, unknown>>
    const hasMore = rows.length > safeLimit
    const selected = hasMore ? rows.slice(0, safeLimit) : rows
    const changes: ChangeRow[] = selected.map((row) => ({
      seq: Number(row.seq ?? 0),
      entity: String(row.entity ?? 'note') as ChangeRow['entity'],
      id: String(row.entity_id ?? ''),
      action: String(row.action ?? 'upsert') as ChangeRow['action'],
      revision: row.revision === null || row.revision === undefined ? null : Number(row.revision),
      data: parseJsonObject(row.data),
      at: Number(row.at ?? 0),
    }))
    const cursor = changes.length > 0 ? changes[changes.length - 1].seq : Math.max(safeSince, this.currentCursor(userId))
    return { cursor, changes, hasMore }
  }

  bootstrap(userId: string): TreeSnapshot & { attachments: AttachmentMeta[]; user: UserInfo } {
    const tree = this.listTree(userId)
    const user = this.getUserById(userId)
    const attachmentRows = this.db.prepare(
      'SELECT * FROM attachments WHERE owner_id = ? AND deleted_at IS NULL ORDER BY created_at ASC',
    ).all(userId) as Array<Record<string, unknown>>
    return {
      ...tree,
      attachments: attachmentRows.map((row) => this.attachmentMetaFromRow(row)),
      user: {
        id: userId,
        username: user?.username ?? '',
        displayName: user?.display_name ?? '',
      },
    }
  }

  // -- maintenance ----------------------------------------------------------

  healthCounts(userId: string): { notes: number; folders: number; attachments: number } {
    const notes = Number((this.db.prepare('SELECT COUNT(*) AS n FROM notes WHERE owner_id = ? AND deleted_at IS NULL').get(userId) as { n?: number }).n ?? 0)
    const folders = Number((this.db.prepare('SELECT COUNT(*) AS n FROM folders WHERE owner_id = ?').get(userId) as { n?: number }).n ?? 0)
    const attachments = Number((this.db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE owner_id = ? AND deleted_at IS NULL').get(userId) as { n?: number }).n ?? 0)
    return { notes, folders, attachments }
  }

  purgeExpiredTrash(): void {
    const cutoff = Date.now() - this.config.trashDays * 86_400_000
    const rows = this.db.prepare('SELECT id FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?').all(cutoff) as Array<{ id?: string }>
    for (const row of rows) {
      const id = String(row.id ?? '')
      if (id === '') continue
      const owner = this.db.prepare('SELECT owner_id FROM notes WHERE id = ?').get(id) as { owner_id?: string } | undefined
      if (owner?.owner_id !== undefined) {
        try {
          this.deleteNote(String(owner.owner_id), id, { permanent: true })
        } catch {
          /* Skip a note another maintenance pass removed. */
        }
      }
    }
  }

  close(): void {
    /* The database is closed by the caller. */
  }

  // -- helpers --------------------------------------------------------------

  private changeData(detail: NoteDetail): Record<string, unknown> {
    return {
      id: detail.id,
      folderId: detail.folderId,
      title: detail.title,
      tags: detail.tags,
      pinned: detail.pinned,
      revision: detail.revision,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      deletedAt: detail.deletedAt,
    }
  }

  private replaceTags(noteId: string, tags: string[]): void {
    this.db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId)
    const insert = this.db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?, ?)')
    for (const tag of tags) insert.run(noteId, tag)
  }

  private pruneVersions(noteId: string): void {
    const keep = this.config.versionsPerNote
    if (keep <= 0) {
      this.db.prepare('DELETE FROM note_versions WHERE note_id = ?').run(noteId)
      return
    }
    this.db.prepare(
      'DELETE FROM note_versions WHERE note_id = ? AND revision NOT IN (SELECT revision FROM note_versions WHERE note_id = ? ORDER BY revision DESC LIMIT ?)',
    ).run(noteId, noteId, keep)
  }
}

function normalizeTitle(title: string | undefined, content: string): string {
  const value = typeof title === 'string' ? title.trim() : ''
  if (value !== '') return value.slice(0, 200)
  return noteTitleFromContent(content).slice(0, 200)
}

function normalizeFolderName(name: string): string {
  const value = typeof name === 'string' ? name.trim() : ''
  if (value === '') throw new ServiceError(400, 'INVALID_FOLDER_NAME', '目录名不能为空')
  if (value.length > 120) throw new ServiceError(400, 'INVALID_FOLDER_NAME', '目录名过长')
  return value.replace(/[\u0000-\u001f\u007f]/gu, '')
}

export function isValidId(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,80}$/u.test(value)
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : []
  } catch {
    return []
  }
}

function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw === '') return null
  try {
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function makeSnippet(content: string, query: string): string {
  const flat = content.replace(/\s+/gu, ' ').trim()
  if (flat === '') return ''
  if (query.trim() === '') return flat.slice(0, 180)
  const index = flat.toLowerCase().indexOf(query.trim().toLowerCase())
  if (index < 0) return flat.slice(0, 180)
  const start = Math.max(0, index - 60)
  return `${start > 0 ? '…' : ''}${flat.slice(start, start + 180)}${start + 180 < flat.length ? '…' : ''}`
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const code = (error as { code?: string } | null)?.code
      if (!IS_WINDOWS || !['EACCES', 'EBUSY', 'EPERM'].includes(String(code)) || attempt >= 8) throw error
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)))
    }
  }
}

export type { ConflictDetail }
