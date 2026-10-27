/**
 * Surface-neutral backend contract used by the shared notes application.
 *
 * The standalone web app talks to /api with a session cookie; the DSH page
 * talks to the host plugin's /dsh-notes routes, which own the local cache and
 * sync engine. Everything above this interface is shared React code.
 */

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
} from '../types.ts'
import type { NotesApiError } from '../errors.ts'

export interface AppCapabilities {
  /** Sync status bar, manual sync and DSH settings. */
  sync: boolean
  settings: boolean
  conflicts: boolean
  versions: boolean
  trash: boolean
  offline: boolean
}

export interface AppBackend {
  readonly kind: 'web' | 'dsh'
  readonly capabilities: AppCapabilities
  getSession?(): Promise<{ username: string; displayName: string } | null>
  login?(username: string, password: string): Promise<void>
  logout?(): Promise<void>
  getTree(): Promise<TreeSnapshot>
  getNote(id: string): Promise<NoteDetail>
  createNote(input: NoteCreateInput): Promise<NoteDetail>
  updateNote(id: string, input: NoteUpdateInput): Promise<NoteDetail>
  deleteNote(id: string, permanent?: boolean): Promise<void>
  restoreNote(id: string): Promise<NoteDetail>
  moveNote(id: string, folderId: string | null, baseRevision: number): Promise<NoteDetail>
  createFolder(input: FolderCreateInput): Promise<FolderMeta>
  updateFolder(id: string, input: FolderUpdateInput): Promise<FolderMeta>
  deleteFolder(id: string, recursive?: boolean): Promise<void>
  search(query: string, options?: { tag?: string; folderId?: string | null; limit?: number }): Promise<SearchResult[]>
  getTrash?(): Promise<NoteMeta[]>
  getVersions?(noteId: string): Promise<VersionSummary[]>
  getVersion?(noteId: string, revision: number): Promise<VersionDetail>
  getVersionContext?(): Promise<{ serverLabel: string } | null>
  revertNote?(noteId: string, revision: number): Promise<NoteDetail>
  uploadAttachment(noteId: string, file: File, onProgress?: (percent: number) => void): Promise<{ attachment: AttachmentMeta; markdown: string }>
  deleteAttachment(id: string): Promise<void>
  attachmentUrl(id: string): string
  /**
   * Read one attachment's bytes over this surface's authenticated transport.
   *
   * Images are rendered from these bytes as object URLs instead of pointing an
   * `<img src>` at `attachmentUrl()`: a browser subresource request cannot carry
   * the surface's authentication (the DSH desktop page lives on a custom scheme
   * and the standalone server fences direct file reads), so the direct URL can
   * answer 401/403 and show a broken image even though the API works.
   */
  fetchAttachment(id: string): Promise<Blob>
  getState?(): Promise<HostState>
  syncNow?(): Promise<HostState>
  getConflicts?(): Promise<ConflictSummary[]>
  getConflict?(noteId: string): Promise<ConflictDetail>
  resolveConflict?(noteId: string, strategy: 'server' | 'local' | 'copy'): Promise<HostState>
  getSettings?(): Promise<HostSettingsPublic>
  saveSettings?(patch: { serverUrl?: string; token?: string; autoSyncSeconds?: number; quickSync?: boolean }): Promise<HostState>
  testConnection?(patch?: { serverUrl?: string; token?: string }): Promise<{ ok: boolean; message: string }>
  /** Web SSE invalidation; the DSH adapter polls state instead. */
  subscribe?(listener: (change: unknown) => void): () => void
  /** Human-readable server label. */
  readonly label?: string
}

export interface EditorDraft {
  title: string
  content: string
  tags: string[]
  pinned: boolean
  baseRevision: number
  dirty: boolean
}

export interface ConflictBox {
  noteId: string
  serverNote: NoteDetail
  local: EditorDraft
}

export type { NotesApiError }
