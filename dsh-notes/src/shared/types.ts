/**
 * Wire and cache types shared by the server, the standalone web app, the DSH
 * host plugin and the DSH browser page. This module is browser-safe: no Node
 * imports and no runtime side effects.
 */

export interface UserInfo {
  id: string
  username: string
  displayName: string
  scopes?: string[]
  authKind?: 'session' | 'token'
}

export interface ServerInfo {
  id: string
  version: string
  time: number
}

export interface FolderMeta {
  id: string
  parentId: string | null
  name: string
  sortOrder: number
  revision: number
  createdAt: number
  updatedAt: number
}

export interface NoteMeta {
  id: string
  folderId: string | null
  title: string
  tags: string[]
  pinned: boolean
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  createdBy?: string | null
  updatedBy?: string | null
}

export interface AttachmentMeta {
  id: string
  noteId: string
  filename: string
  mime: string
  size: number
  createdAt: number
}

export interface NoteDetail extends NoteMeta {
  content: string
  attachments: AttachmentMeta[]
}

export interface TreeSnapshot {
  folders: FolderMeta[]
  notes: NoteMeta[]
  cursor?: number
  server?: ServerInfo
  user?: UserInfo
}

export type ChangeEntity = 'note' | 'folder' | 'attachment'

export interface ChangeRow {
  seq: number
  entity: ChangeEntity
  id: string
  action: 'upsert' | 'delete'
  revision: number | null
  data: Record<string, unknown> | null
  at: number
}

export interface ChangesResult {
  cursor: number
  changes: ChangeRow[]
  hasMore: boolean
}

export interface ConflictSummary {
  noteId: string
  localTitle: string
  serverTitle: string
  baseRevision: number | null
  serverRevision: number
  createdAt: number
}

export interface ConflictDetail extends ConflictSummary {
  localContent: string
  serverContent: string
  localTags: string[]
  serverTags: string[]
  localFolderId: string | null
  serverFolderId: string | null
}

export type SyncState =
  | 'unconfigured'
  | 'idle'
  | 'syncing'
  | 'pending'
  | 'offline'
  | 'conflict'
  | 'error'

export interface SyncStatus {
  state: SyncState
  online: boolean
  pending: number
  conflicts: number
  lastSyncAt: number | null
  lastAttemptAt: number | null
  nextSyncAt: number | null
  error: string | null
  serverId: string | null
  serverVersion: string | null
  userId: string | null
  autoSyncSeconds: number
  quickSync: boolean
}

export interface HostSettings {
  serverUrl: string
  /** Never returned to the browser. */
  token?: string
  autoSyncSeconds: number
  quickSync: boolean
}

export interface HostSettingsPublic {
  serverUrl: string
  hasToken: boolean
  tokenSource: 'settings' | 'env' | 'none'
  autoSyncSeconds: number
  quickSync: boolean
  dataDir: string
}

export interface HostCounts {
  notes: number
  folders: number
  attachments: number
  pending: number
  conflicts: number
}

export interface HostState {
  configured: boolean
  version: string
  settings: HostSettingsPublic
  sync: SyncStatus
  counts: HostCounts
  conflicts: ConflictSummary[]
  serverVersion: string | null
  serverId: string | null
  userId: string | null
}

export interface SearchResult {
  note: NoteMeta
  snippet: string
}

export interface VersionSummary {
  revision: number
  title: string
  createdAt: number
  createdBy?: string | null
}

export interface VersionDetail extends VersionSummary {
  content: string
  tags: string[]
}

export interface NoteCreateInput {
  id?: string
  folderId?: string | null
  title?: string
  content?: string
  tags?: string[]
  pinned?: boolean
  opId?: string
}

export interface NoteUpdateInput {
  baseRevision: number
  title?: string
  content?: string
  tags?: string[]
  pinned?: boolean
  folderId?: string | null
  opId?: string
}

export interface FolderCreateInput {
  id?: string
  parentId?: string | null
  name: string
  opId?: string
}

export interface FolderUpdateInput {
  baseRevision: number
  name?: string
  parentId?: string | null
  opId?: string
}

export interface ApiSuccess {
  ok: true
  [key: string]: unknown
}

export interface ApiFailure {
  ok: false
  error: { code: string; message: string }
}

export type ApiResponse = ApiSuccess | ApiFailure

export interface LoginInput {
  username: string
  password: string
}

export interface UrlResolver {
  /** Resolve an `api/attachments/<id>` reference for the current surface. */
  attachment(id: string): string
}

export const CHANGE_ENTITIES: readonly ChangeEntity[] = ['note', 'folder', 'attachment']

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
