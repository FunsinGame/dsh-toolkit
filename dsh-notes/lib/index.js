// src/host/host.ts
import { join as join2 } from "node:path";

// src/host/cache.ts
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

// src/shared/format.ts
function noteTitleFromContent(content, fallback = "\u672A\u547D\u540D\u7B14\u8BB0") {
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const heading = /^#{1,6}\s+(.+)$/u.exec(line);
    const title = (heading?.[1] ?? line).replace(/[*_`~]/gu, "").trim();
    if (title !== "") return title.slice(0, 120);
    break;
  }
  return fallback;
}
function normalizeTags(input) {
  if (!Array.isArray(input)) return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/^#/, "").slice(0, 64);
    if (tag === "" || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 32) break;
  }
  return out;
}

// src/host/cache.ts
var SCHEMA = `
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
`;
var LocalStore = class {
  db;
  constructor(file) {
    mkdirSync(dirname(file), { recursive: true, mode: 448 });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = NORMAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec(SCHEMA);
  }
  close() {
    try {
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
    }
    try {
      this.db.close();
    } catch {
    }
  }
  getMeta(key) {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
    return typeof row?.value === "string" ? row.value : null;
  }
  setMeta(key, value) {
    this.db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }
  folderMeta(row) {
    return {
      id: String(row.id ?? ""),
      parentId: row.parent_id === null || row.parent_id === void 0 ? null : String(row.parent_id),
      name: String(row.name ?? ""),
      sortOrder: Number(row.sort_order ?? 0),
      revision: Number(row.server_revision ?? row.local_revision ?? 1),
      createdAt: Number(row.updated_at ?? 0),
      updatedAt: Number(row.updated_at ?? 0)
    };
  }
  noteMeta(row) {
    let tags = [];
    try {
      const parsed = JSON.parse(String(row.tags ?? "[]"));
      if (Array.isArray(parsed)) tags = parsed.filter((tag) => typeof tag === "string");
    } catch {
      tags = [];
    }
    return {
      id: String(row.id ?? ""),
      folderId: row.folder_id === null || row.folder_id === void 0 ? null : String(row.folder_id),
      title: String(row.title ?? ""),
      tags,
      pinned: Number(row.pinned ?? 0) === 1,
      revision: Number(row.server_revision ?? row.local_revision ?? 1),
      createdAt: Number(row.created_at ?? row.updated_at ?? 0),
      updatedAt: Number(row.server_updated_at ?? row.updated_at ?? 0),
      deletedAt: Number(row.deleted ?? 0) === 1 ? Number(row.deleted_at ?? row.updated_at ?? 0) : null
    };
  }
  attachmentMeta(row) {
    return {
      id: String(row.id ?? ""),
      noteId: String(row.note_id ?? ""),
      filename: String(row.filename ?? ""),
      mime: String(row.mime ?? "application/octet-stream"),
      size: Number(row.size ?? 0),
      createdAt: Number(row.created_at ?? 0)
    };
  }
  listTree() {
    const folders = this.db.prepare("SELECT * FROM folders WHERE deleted = 0 ORDER BY sort_order ASC, name COLLATE NOCASE ASC").all();
    const notes = this.db.prepare("SELECT * FROM notes WHERE deleted = 0 ORDER BY pinned DESC, COALESCE(server_updated_at, updated_at) DESC").all();
    return {
      folders: folders.map((row) => this.folderMeta(row)),
      notes: notes.map((row) => this.noteMeta(row))
    };
  }
  getNoteRow(id) {
    const row = this.db.prepare("SELECT * FROM notes WHERE id = ?").get(id);
    return row ?? null;
  }
  hasBody(id) {
    const row = this.getNoteRow(id);
    return row !== null && Number(row.body_loaded ?? 0) === 1;
  }
  getNote(id) {
    const row = this.getNoteRow(id);
    if (row === null) return null;
    return {
      ...this.noteMeta(row),
      content: String(row.content ?? ""),
      attachments: this.listAttachments(id)
    };
  }
  listAttachments(noteId) {
    const rows = this.db.prepare("SELECT * FROM attachments WHERE note_id = ? ORDER BY created_at ASC").all(noteId);
    return rows.map((row) => this.attachmentMeta(row));
  }
  setNoteBody(id, content, revision) {
    const now = Date.now();
    if (revision !== void 0) {
      this.db.prepare("UPDATE notes SET content = ?, body_loaded = 1, server_revision = ?, updated_at = ? WHERE id = ?").run(content, revision, now, id);
    } else {
      this.db.prepare("UPDATE notes SET content = ?, body_loaded = 1 WHERE id = ?").run(content, id);
    }
  }
  // -- server -> local ------------------------------------------------------
  upsertFolderFromServer(meta) {
    const existing = this.db.prepare("SELECT dirty FROM folders WHERE id = ?").get(meta.id);
    if (existing !== void 0 && Number(existing.dirty ?? 0) === 1) return false;
    this.db.prepare(`
      INSERT INTO folders (id, parent_id, name, sort_order, updated_at, server_revision, local_revision, dirty, deleted)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0)
      ON CONFLICT(id) DO UPDATE SET parent_id = excluded.parent_id, name = excluded.name,
        sort_order = excluded.sort_order, updated_at = excluded.updated_at,
        server_revision = excluded.server_revision, deleted = 0
    `).run(meta.id, meta.parentId, meta.name, meta.sortOrder, meta.updatedAt, meta.revision);
    return true;
  }
  deleteFolderFromServer(id) {
    const existing = this.db.prepare("SELECT dirty FROM folders WHERE id = ?").get(id);
    if (existing !== void 0 && Number(existing.dirty ?? 0) === 1) return;
    this.db.prepare("DELETE FROM folders WHERE id = ?").run(id);
  }
  upsertNoteFromServer(meta, content) {
    const existing = this.getNoteRow(meta.id);
    if (existing !== null && Number(existing.dirty ?? 0) === 1) return false;
    const now = Date.now();
    const tags = JSON.stringify(meta.tags);
    if (existing === null) {
      this.db.prepare(`
        INSERT INTO notes (id, folder_id, title, content, tags, pinned, created_at, updated_at, server_updated_at,
          local_revision, server_revision, deleted, deleted_at, dirty, conflict, body_loaded)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, NULL, 0, 0, ?)
      `).run(
        meta.id,
        meta.folderId,
        meta.title,
        content ?? "",
        tags,
        meta.pinned ? 1 : 0,
        meta.createdAt,
        meta.updatedAt,
        meta.updatedAt,
        meta.revision,
        content === void 0 ? 0 : 1
      );
      return true;
    }
    const revisionChanged = Number(existing.server_revision ?? 0) !== meta.revision;
    const bodyLoaded = content !== void 0 ? 1 : revisionChanged ? 0 : Number(existing.body_loaded ?? 0);
    this.db.prepare(`
      UPDATE notes SET folder_id = ?, title = ?, tags = ?, pinned = ?, created_at = ?,
        server_updated_at = ?, server_revision = ?, deleted = 0, deleted_at = NULL, dirty = 0, conflict = 0,
        body_loaded = ?, content = ?
      WHERE id = ?
    `).run(
      meta.folderId,
      meta.title,
      tags,
      meta.pinned ? 1 : 0,
      meta.createdAt,
      meta.updatedAt,
      meta.revision,
      bodyLoaded,
      content !== void 0 ? content : String(existing.content ?? ""),
      meta.id
    );
    void now;
    return true;
  }
  deleteNoteFromServer(id) {
    const existing = this.getNoteRow(id);
    if (existing !== null && Number(existing.dirty ?? 0) === 1) return;
    this.removeNote(id);
  }
  upsertAttachmentFromServer(meta) {
    this.db.prepare(`
      INSERT INTO attachments (id, note_id, filename, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET note_id = excluded.note_id, filename = excluded.filename,
        mime = excluded.mime, size = excluded.size
    `).run(meta.id, meta.noteId, meta.filename, meta.mime, meta.size, meta.createdAt);
  }
  deleteAttachmentFromServer(id) {
    this.db.prepare("DELETE FROM attachments WHERE id = ?").run(id);
  }
  knownNoteIds() {
    return this.db.prepare("SELECT id FROM notes WHERE server_revision IS NOT NULL AND dirty = 0").all().map((row) => String(row.id ?? ""));
  }
  knownFolderIds() {
    return this.db.prepare("SELECT id FROM folders WHERE server_revision IS NOT NULL AND dirty = 0").all().map((row) => String(row.id ?? ""));
  }
  pruneNotes(ids) {
    for (const id of this.knownNoteIds()) if (!ids.has(id)) this.removeNote(id);
  }
  pruneFolders(ids) {
    for (const id of this.knownFolderIds()) if (!ids.has(id)) this.db.prepare("DELETE FROM folders WHERE id = ?").run(id);
  }
  pruneAttachments(ids) {
    const rows = this.db.prepare("SELECT id FROM attachments").all();
    for (const row of rows) {
      const id = String(row.id ?? "");
      if (id !== "" && !ids.has(id)) this.db.prepare("DELETE FROM attachments WHERE id = ?").run(id);
    }
  }
  // -- local edits ----------------------------------------------------------
  createLocalNote(input) {
    const id = input.id ?? randomUUID();
    const content = input.content ?? "";
    const title = (input.title ?? "").trim() || noteTitleFromContent(content).slice(0, 200);
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO notes (id, folder_id, title, content, tags, pinned, created_at, updated_at, server_updated_at,
        local_revision, server_revision, deleted, deleted_at, dirty, conflict, body_loaded)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, NULL, 0, NULL, 1, 0, 1)
    `).run(id, input.folderId ?? null, title, content, JSON.stringify(normalizeTags(input.tags ?? [])), input.pinned === true ? 1 : 0, now, now);
    return this.getNote(id);
  }
  updateLocalNote(id, patch) {
    const row = this.getNoteRow(id);
    if (row === null) throw new Error("\u7B14\u8BB0\u4E0D\u5B58\u5728");
    const content = patch.content === void 0 ? String(row.content ?? "") : patch.content;
    const title = patch.title === void 0 ? String(row.title ?? "") : patch.title.trim() || noteTitleFromContent(content).slice(0, 200);
    const tags = JSON.stringify(patch.tags === void 0 ? JSON.parse(String(row.tags ?? "[]")) : normalizeTags(patch.tags));
    const pinned = patch.pinned === void 0 ? Number(row.pinned ?? 0) : patch.pinned ? 1 : 0;
    const folderId = patch.folderId === void 0 ? row.folder_id : patch.folderId;
    this.db.prepare(`
      UPDATE notes SET title = ?, content = ?, tags = ?, pinned = ?, folder_id = ?, updated_at = ?,
        local_revision = local_revision + 1, dirty = 1, body_loaded = 1, deleted = 0 WHERE id = ?
    `).run(title, content, tags, pinned, folderId, Date.now(), id);
    return this.getNote(id);
  }
  deleteLocalNote(id) {
    const row = this.getNoteRow(id);
    if (row === null) return;
    if (row.server_revision === null || row.server_revision === void 0) {
      this.removeNote(id);
      return;
    }
    this.db.prepare("UPDATE notes SET deleted = 1, deleted_at = ?, dirty = 1, updated_at = ? WHERE id = ?").run(Date.now(), Date.now(), id);
  }
  restoreLocalNote(id) {
    this.db.prepare("UPDATE notes SET deleted = 0, deleted_at = NULL, dirty = 1, updated_at = ? WHERE id = ?").run(Date.now(), id);
    return this.getNote(id);
  }
  createLocalFolder(input) {
    const id = input.id ?? randomUUID();
    const now = Date.now();
    const order = Number(this.db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS n FROM folders").get()?.n ?? 0) + 1;
    this.db.prepare(`
      INSERT INTO folders (id, parent_id, name, sort_order, updated_at, server_revision, local_revision, dirty, deleted)
      VALUES (?, ?, ?, ?, ?, NULL, 1, 1, 0)
    `).run(id, input.parentId ?? null, input.name.trim(), order, now);
    return this.folderMeta(this.db.prepare("SELECT * FROM folders WHERE id = ?").get(id));
  }
  updateLocalFolder(id, patch) {
    const row = this.db.prepare("SELECT * FROM folders WHERE id = ?").get(id);
    if (row === void 0) throw new Error("\u76EE\u5F55\u4E0D\u5B58\u5728");
    const name2 = patch.name === void 0 ? String(row.name ?? "") : patch.name.trim();
    const parentId = patch.parentId === void 0 ? row.parent_id : patch.parentId;
    this.db.prepare("UPDATE folders SET name = ?, parent_id = ?, updated_at = ?, local_revision = local_revision + 1, dirty = 1 WHERE id = ?").run(name2, parentId, Date.now(), id);
    return this.folderMeta(this.db.prepare("SELECT * FROM folders WHERE id = ?").get(id));
  }
  deleteLocalFolder(id) {
    const row = this.db.prepare("SELECT * FROM folders WHERE id = ?").get(id);
    if (row === void 0) return;
    if (row.server_revision === null || row.server_revision === void 0) {
      this.db.prepare("DELETE FROM folders WHERE id = ?").run(id);
      return;
    }
    this.db.prepare("UPDATE folders SET deleted = 1, dirty = 1, updated_at = ? WHERE id = ?").run(Date.now(), id);
  }
  // -- sync state -----------------------------------------------------------
  dirtyNotes() {
    return this.db.prepare("SELECT * FROM notes WHERE dirty = 1 AND deleted = 0 AND conflict = 0").all();
  }
  dirtyDeletedNotes() {
    return this.db.prepare("SELECT * FROM notes WHERE dirty = 1 AND deleted = 1").all();
  }
  conflictedNotes() {
    return this.db.prepare("SELECT * FROM notes WHERE conflict = 1").all();
  }
  dirtyFolders() {
    return this.db.prepare("SELECT * FROM folders WHERE dirty = 1").all();
  }
  markNoteSynced(id, serverRevision, serverUpdatedAt) {
    this.db.prepare(`
      UPDATE notes SET server_revision = ?, server_updated_at = ?, dirty = 0, conflict = 0,
        deleted = 0, deleted_at = NULL, body_loaded = 1 WHERE id = ?
    `).run(serverRevision, serverUpdatedAt, id);
  }
  markFolderSynced(id, serverRevision) {
    this.db.prepare("UPDATE folders SET server_revision = ?, dirty = 0, deleted = 0 WHERE id = ?").run(serverRevision, id);
  }
  markNoteUnsynced(id) {
    this.db.prepare("UPDATE notes SET server_revision = NULL, dirty = 1, conflict = 0 WHERE id = ?").run(id);
  }
  markFolderUnsynced(id) {
    this.db.prepare("UPDATE folders SET server_revision = NULL, dirty = 1, deleted = 0 WHERE id = ?").run(id);
  }
  removeNote(id) {
    this.db.prepare("DELETE FROM notes WHERE id = ?").run(id);
    this.db.prepare("DELETE FROM attachments WHERE note_id = ?").run(id);
    this.db.prepare("DELETE FROM conflicts WHERE note_id = ?").run(id);
    this.db.prepare("DELETE FROM recent WHERE note_id = ?").run(id);
  }
  removeFolder(id) {
    this.db.prepare("DELETE FROM folders WHERE id = ?").run(id);
  }
  // -- conflicts ------------------------------------------------------------
  markConflict(noteId, server) {
    const local = this.getNote(noteId);
    if (local === null) return;
    this.db.prepare(`
      INSERT INTO conflicts (note_id, local_title, local_content, local_tags, local_folder_id, local_pinned,
        server_title, server_content, server_tags, server_folder_id, server_pinned, base_revision, server_revision, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(note_id) DO UPDATE SET local_title = excluded.local_title, local_content = excluded.local_content,
        local_tags = excluded.local_tags, local_folder_id = excluded.local_folder_id, local_pinned = excluded.local_pinned,
        server_title = excluded.server_title, server_content = excluded.server_content, server_tags = excluded.server_tags,
        server_folder_id = excluded.server_folder_id, server_pinned = excluded.server_pinned,
        server_revision = excluded.server_revision, created_at = excluded.created_at
    `).run(
      noteId,
      local.title,
      local.content,
      JSON.stringify(local.tags),
      local.folderId,
      local.pinned ? 1 : 0,
      server.title,
      server.content,
      JSON.stringify(server.tags),
      server.folderId,
      server.pinned ? 1 : 0,
      local.revision,
      server.revision,
      Date.now()
    );
    this.db.prepare("UPDATE notes SET conflict = 1 WHERE id = ?").run(noteId);
  }
  getConflicts() {
    const rows = this.db.prepare("SELECT * FROM conflicts ORDER BY created_at DESC").all();
    return rows.map((row) => ({
      noteId: String(row.note_id ?? ""),
      localTitle: String(row.local_title ?? ""),
      serverTitle: String(row.server_title ?? ""),
      baseRevision: row.base_revision === null || row.base_revision === void 0 ? null : Number(row.base_revision),
      serverRevision: Number(row.server_revision ?? 0),
      createdAt: Number(row.created_at ?? 0)
    }));
  }
  getConflict(noteId) {
    const row = this.db.prepare("SELECT * FROM conflicts WHERE note_id = ?").get(noteId);
    if (row === void 0) return null;
    return {
      noteId: String(row.note_id ?? ""),
      localTitle: String(row.local_title ?? ""),
      localContent: String(row.local_content ?? ""),
      localTags: parseTags(row.local_tags),
      localFolderId: row.local_folder_id === null || row.local_folder_id === void 0 ? null : String(row.local_folder_id),
      serverTitle: String(row.server_title ?? ""),
      serverContent: String(row.server_content ?? ""),
      serverTags: parseTags(row.server_tags),
      serverFolderId: row.server_folder_id === null || row.server_folder_id === void 0 ? null : String(row.server_folder_id),
      baseRevision: row.base_revision === null || row.base_revision === void 0 ? null : Number(row.base_revision),
      serverRevision: Number(row.server_revision ?? 0),
      createdAt: Number(row.created_at ?? 0)
    };
  }
  adoptServerConflict(noteId) {
    const conflict = this.getConflict(noteId);
    if (conflict === null) return;
    this.db.prepare(`
      UPDATE notes SET title = ?, content = ?, tags = ?, folder_id = ?, pinned = ?, server_revision = ?,
        server_updated_at = ?, deleted = 0, deleted_at = NULL, dirty = 0, conflict = 0, body_loaded = 1 WHERE id = ?
    `).run(
      conflict.serverTitle,
      conflict.serverContent,
      JSON.stringify(conflict.serverTags),
      conflict.serverFolderId,
      conflict.serverPinned ? 1 : 0,
      conflict.serverRevision,
      Date.now(),
      noteId
    );
    this.db.prepare("DELETE FROM conflicts WHERE note_id = ?").run(noteId);
  }
  keepLocalConflict(noteId) {
    const conflict = this.getConflict(noteId);
    if (conflict === null) return;
    const serverRevision = conflict.serverRevision;
    if (serverRevision > 0) {
      this.db.prepare("UPDATE notes SET server_revision = ?, dirty = 1, conflict = 0 WHERE id = ?").run(serverRevision, noteId);
    } else {
      this.db.prepare("UPDATE notes SET server_revision = NULL, dirty = 1, conflict = 0 WHERE id = ?").run(noteId);
    }
    this.db.prepare("DELETE FROM conflicts WHERE note_id = ?").run(noteId);
  }
  // -- search / stats -------------------------------------------------------
  search(query, limit = 50) {
    const text = query.trim();
    const rows = text === "" ? this.db.prepare("SELECT * FROM notes WHERE deleted = 0 ORDER BY COALESCE(server_updated_at, updated_at) DESC LIMIT ?").all(limit) : this.db.prepare("SELECT * FROM notes WHERE deleted = 0 AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\') ORDER BY COALESCE(server_updated_at, updated_at) DESC LIMIT ?").all(`%${escapeLike(text)}%`, `%${escapeLike(text)}%`, limit);
    return rows.map((row) => {
      const meta = this.noteMeta(row);
      const content = String(row.content ?? "").replace(/\s+/gu, " ").trim();
      const index = text === "" ? -1 : content.toLowerCase().indexOf(text.toLowerCase());
      const snippet = index < 0 ? content.slice(0, 180) : `${index > 40 ? "\u2026" : ""}${content.slice(Math.max(0, index - 40), index + 160)}`;
      return { note: meta, snippet };
    });
  }
  getTrashLocal() {
    const rows = this.db.prepare("SELECT * FROM notes WHERE deleted = 1 ORDER BY deleted_at DESC").all();
    return rows.map((row) => this.noteMeta(row));
  }
  counts() {
    const notes = Number(this.db.prepare("SELECT COUNT(*) AS n FROM notes WHERE deleted = 0").get()?.n ?? 0);
    const folders = Number(this.db.prepare("SELECT COUNT(*) AS n FROM folders WHERE deleted = 0").get()?.n ?? 0);
    const attachments = Number(this.db.prepare("SELECT COUNT(*) AS n FROM attachments").get()?.n ?? 0);
    const pending = Number(this.db.prepare("SELECT COUNT(*) AS n FROM notes WHERE dirty = 1 AND conflict = 0").get()?.n ?? 0) + Number(this.db.prepare("SELECT COUNT(*) AS n FROM folders WHERE dirty = 1").get()?.n ?? 0);
    const conflicts = Number(this.db.prepare("SELECT COUNT(*) AS n FROM conflicts").get()?.n ?? 0);
    return { notes, folders, attachments, pending, conflicts };
  }
  recent(limit = 20) {
    const rows = this.db.prepare("SELECT n.* FROM recent r JOIN notes n ON n.id = r.note_id WHERE n.deleted = 0 ORDER BY r.opened_at DESC LIMIT ?").all(limit);
    return rows.map((row) => this.noteMeta(row));
  }
  markRecent(noteId) {
    this.db.prepare("INSERT INTO recent (note_id, opened_at) VALUES (?, ?) ON CONFLICT(note_id) DO UPDATE SET opened_at = excluded.opened_at").run(noteId, Date.now());
  }
};
function parseTags(raw) {
  try {
    const parsed = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === "string") : [];
  } catch {
    return [];
  }
}
function escapeLike(value) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

// src/host/remote.ts
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { PassThrough } from "node:stream";
var RemoteError = class extends Error {
  status;
  code;
  payload;
  constructor(message, options = {}) {
    super(message);
    this.name = "RemoteError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "REMOTE_FAILED";
    this.payload = options.payload;
  }
};
function joinUrl(baseUrl, path) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ""), base);
}
var RemoteClient = class {
  baseUrl;
  token;
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/+$/u, "");
    this.token = token;
  }
  headers(extra = {}) {
    return {
      authorization: `Bearer ${this.token}`,
      accept: "application/json",
      ...extra
    };
  }
  async request(path, init = {}, timeoutMs = 2e4) {
    let response;
    try {
      response = await fetch(joinUrl(this.baseUrl, path), {
        ...init,
        headers: this.headers(init.body === void 0 ? {} : { "content-type": "application/json" }),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      throw new RemoteError(`\u65E0\u6CD5\u8FDE\u63A5\u7B14\u8BB0\u670D\u52A1\u5668\uFF1A${error instanceof Error ? error.message : String(error)}`);
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      throw new RemoteError(`\u7B14\u8BB0\u670D\u52A1\u5668\u8FD4\u56DE\u4E86\u975E JSON \u54CD\u5E94\uFF08HTTP ${response.status}\uFF09`, { status: response.status });
    }
    if (!response.ok || payload?.ok === false) {
      const body = payload;
      throw new RemoteError(body?.error?.message ?? `\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09`, {
        status: response.status,
        code: body?.error?.code ?? "REMOTE_FAILED",
        payload
      });
    }
    return payload;
  }
  async health() {
    const data = await this.request("api/health");
    return data;
  }
  async session() {
    return this.request("api/auth/session");
  }
  async bootstrap() {
    const data = await this.request("api/sync/bootstrap");
    return data;
  }
  async changes(since, limit = 500) {
    return this.request(`api/changes?since=${since}&limit=${limit}`);
  }
  async getNote(id) {
    const data = await this.request(`api/notes/${encodeURIComponent(id)}`);
    return data.note;
  }
  async createNote(input) {
    const data = await this.request("api/notes", {
      method: "POST",
      body: JSON.stringify(input)
    });
    return data.note;
  }
  async updateNote(id, input) {
    const data = await this.request(`api/notes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
    return data.note;
  }
  async deleteNote(id, permanent = false) {
    await this.request(`api/notes/${encodeURIComponent(id)}${permanent ? "?permanent=1" : ""}`, { method: "DELETE" });
  }
  async restoreNote(id) {
    const data = await this.request(`api/notes/${encodeURIComponent(id)}/restore`, {
      method: "POST",
      body: "{}"
    });
    return data.note;
  }
  async moveNote(id, folderId, baseRevision) {
    const data = await this.request(`api/notes/${encodeURIComponent(id)}/move`, {
      method: "POST",
      body: JSON.stringify({ folderId, baseRevision })
    });
    return data.note;
  }
  async createFolder(input) {
    const data = await this.request("api/folders", {
      method: "POST",
      body: JSON.stringify(input)
    });
    return data.folder;
  }
  async updateFolder(id, input) {
    const data = await this.request(`api/folders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
    return data.folder;
  }
  async deleteFolder(id, recursive = false) {
    await this.request(`api/folders/${encodeURIComponent(id)}${recursive ? "?recursive=1" : ""}`, { method: "DELETE" });
  }
  async listTrash() {
    const data = await this.request("api/trash");
    return data.notes;
  }
  async getVersions(noteId) {
    const data = await this.request(`api/notes/${encodeURIComponent(noteId)}/versions`);
    return data.versions;
  }
  async getVersion(noteId, revision) {
    const data = await this.request(`api/notes/${encodeURIComponent(noteId)}/versions/${revision}`);
    return data.version;
  }
  async revertNote(noteId, revision) {
    const data = await this.request(`api/notes/${encodeURIComponent(noteId)}/revert`, {
      method: "POST",
      body: JSON.stringify({ revision })
    });
    return data.note;
  }
  async search(query, limit = 50) {
    const data = await this.request(`api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    return data.results;
  }
  async deleteAttachment(id) {
    await this.request(`api/attachments/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
  /** Stream a browser upload to the remote server without buffering it. */
  uploadFromRequest(noteId, req) {
    return this.sendUpload(noteId, req, {
      contentType: String(req.headers["content-type"] ?? "application/octet-stream"),
      fileName: String(req.headers["x-file-name"] ?? ""),
      contentLength: req.headers["content-length"]
    });
  }
  uploadBuffer(noteId, filename, mime, buffer) {
    const stream = new PassThrough();
    stream.end(buffer);
    return this.sendUpload(noteId, stream, {
      contentType: mime,
      fileName: encodeURIComponent(filename),
      contentLength: String(buffer.byteLength)
    });
  }
  sendUpload(noteId, source, meta) {
    const url = joinUrl(this.baseUrl, `api/notes/${encodeURIComponent(noteId)}/attachments`);
    const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest;
    return new Promise((resolveUpload, rejectUpload) => {
      const request = requestFn(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.token}`,
          accept: "application/json",
          "content-type": meta.contentType,
          ...meta.fileName === "" ? {} : { "x-file-name": meta.fileName },
          ...meta.contentLength === void 0 ? {} : { "content-length": String(meta.contentLength) }
        },
        timeout: 10 * 6e4
      }, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let payload = null;
          try {
            payload = JSON.parse(text);
          } catch {
            rejectUpload(new RemoteError(`\u4E0A\u4F20\u8FD4\u56DE\u4E86\u975E JSON \u54CD\u5E94\uFF08HTTP ${response.statusCode ?? 0}\uFF09`, { status: response.statusCode }));
            return;
          }
          const status = response.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            const body = payload;
            rejectUpload(new RemoteError(body.error?.message ?? `\u4E0A\u4F20\u5931\u8D25\uFF08HTTP ${status}\uFF09`, {
              status,
              code: body.error?.code,
              payload
            }));
            return;
          }
          resolveUpload(payload);
        });
      });
      request.on("error", (error) => rejectUpload(new RemoteError(`\u4E0A\u4F20\u5931\u8D25\uFF1A${error.message}`)));
      request.on("timeout", () => {
        request.destroy();
        rejectUpload(new RemoteError("\u4E0A\u4F20\u8D85\u65F6"));
      });
      source.on("error", (error) => request.destroy(error));
      source.pipe(request);
    });
  }
  /** Proxy an attachment with Range support. Resolves when the response ends. */
  pipeAttachment(id, req, res) {
    const url = joinUrl(this.baseUrl, `api/attachments/${encodeURIComponent(id)}`);
    const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest;
    return new Promise((resolvePipe, rejectPipe) => {
      const request = requestFn(url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.token}`,
          accept: "*/*",
          ...typeof req.headers.range === "string" ? { range: req.headers.range } : {}
        },
        timeout: 6e4
      }, (response) => {
        const status = response.statusCode ?? 502;
        const contentType = String(response.headers["content-type"] ?? "application/octet-stream");
        if (status >= 400) {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            if (!res.headersSent) {
              res.statusCode = status;
              res.setHeader("Content-Type", contentType);
              res.end(text);
            }
            resolvePipe();
          });
          return;
        }
        res.statusCode = status;
        for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control", "content-disposition"]) {
          const value = response.headers[key];
          if (value !== void 0) res.setHeader(key, value);
        }
        res.setHeader("X-Content-Type-Options", "nosniff");
        response.on("error", (error) => {
          if (!res.headersSent) {
            res.statusCode = 502;
            res.end(String(error.message));
          } else res.destroy();
          resolvePipe();
        });
        response.pipe(res);
        res.on("close", () => {
          response.destroy();
          resolvePipe();
        });
      });
      request.on("error", (error) => rejectPipe(new RemoteError(`\u8BFB\u53D6\u9644\u4EF6\u5931\u8D25\uFF1A${error.message}`)));
      request.on("timeout", () => {
        request.destroy();
        rejectPipe(new RemoteError("\u8BFB\u53D6\u9644\u4EF6\u8D85\u65F6"));
      });
      request.end();
    });
  }
};

// src/host/settings.ts
import { createHash } from "node:crypto";
import { mkdirSync as mkdirSync2, readFileSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname as dirname2, join, resolve } from "node:path";
var DEFAULT_SETTINGS = {
  serverUrl: "",
  token: "",
  autoSyncSeconds: 60,
  quickSync: true
};
function dshHome() {
  const fromEnv = process.env.DSH_HOME;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") return resolve(fromEnv.trim());
  return join(homedir(), ".dsh");
}
function hostRoot() {
  return join(dshHome(), "notes");
}
function settingsPath() {
  return join(hostRoot(), "settings.json");
}
function normalizeServerUrl(value) {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  let withScheme = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:\/\//iu.test(withScheme)) withScheme = `http://${withScheme}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("\u670D\u52A1\u5668\u5730\u5740\u4E0D\u662F\u6709\u6548\u7684 URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("\u670D\u52A1\u5668\u5730\u5740\u53EA\u652F\u6301 http/https");
  url.hash = "";
  url.search = "";
  return url.href.replace(/\/+$/u, "");
}
function instanceKey(serverUrl) {
  if (serverUrl === "") return "unconfigured";
  return createHash("sha256").update(serverUrl).digest("hex").slice(0, 16);
}
function instanceDir(serverUrl) {
  return join(hostRoot(), "instances", instanceKey(serverUrl));
}
function coerce(raw) {
  const source = raw !== null && typeof raw === "object" ? raw : {};
  let serverUrl = "";
  try {
    serverUrl = normalizeServerUrl(typeof source.serverUrl === "string" ? source.serverUrl : "");
  } catch {
    serverUrl = "";
  }
  return {
    serverUrl,
    token: typeof source.token === "string" ? source.token : "",
    autoSyncSeconds: normalizeSeconds(source.autoSyncSeconds),
    quickSync: source.quickSync === void 0 ? true : source.quickSync === true
  };
}
function normalizeSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 60;
  return Math.min(3600, Math.max(10, Math.trunc(number)));
}
var SettingsStore = class {
  constructor(plugin = {}) {
    this.plugin = plugin;
  }
  current = null;
  load() {
    if (this.current !== null) return this.current;
    try {
      const text = readFileSync(settingsPath(), "utf8").replace(/^\uFEFF/u, "");
      this.current = coerce(JSON.parse(text));
    } catch {
      this.current = { ...DEFAULT_SETTINGS };
    }
    return this.current;
  }
  effective() {
    const stored = this.load();
    const envUrl = normalizeServerUrlSafe(process.env.DSH_NOTES_SERVER_URL ?? "");
    const pluginUrl = normalizeServerUrlSafe(this.plugin.serverUrl ?? "");
    const serverUrl = stored.serverUrl !== "" ? stored.serverUrl : pluginUrl !== "" ? pluginUrl : envUrl;
    const envToken = typeof process.env.DSH_NOTES_TOKEN === "string" ? process.env.DSH_NOTES_TOKEN.trim() : "";
    const tokenEnvValue = typeof this.plugin.tokenEnv === "string" && this.plugin.tokenEnv !== "" ? (process.env[this.plugin.tokenEnv] ?? "").trim() : "";
    const pluginToken = typeof this.plugin.token === "string" ? this.plugin.token.trim() : "";
    const token = envToken !== "" ? envToken : tokenEnvValue !== "" ? tokenEnvValue : stored.token !== "" ? stored.token : pluginToken;
    const tokenSource = envToken !== "" || tokenEnvValue !== "" ? "env" : stored.token !== "" || pluginToken !== "" ? "settings" : "none";
    const autoSyncSeconds = stored.autoSyncSeconds !== DEFAULT_SETTINGS.autoSyncSeconds ? stored.autoSyncSeconds : normalizeSeconds(this.plugin.autoSyncSeconds ?? stored.autoSyncSeconds);
    const quickSync = this.plugin.quickSync === void 0 ? stored.quickSync : this.plugin.quickSync === true;
    return {
      serverUrl,
      token,
      tokenSource,
      autoSyncSeconds,
      quickSync,
      dataDir: instanceDir(serverUrl)
    };
  }
  public() {
    const effective = this.effective();
    return {
      serverUrl: effective.serverUrl,
      hasToken: effective.token !== "",
      tokenSource: effective.tokenSource,
      autoSyncSeconds: effective.autoSyncSeconds,
      quickSync: effective.quickSync,
      dataDir: effective.dataDir
    };
  }
  save(patch) {
    const current = this.load();
    const next = {
      serverUrl: patch.serverUrl === void 0 ? current.serverUrl : normalizeServerUrl(patch.serverUrl),
      token: patch.token === void 0 || patch.token === "" ? current.token : patch.token.trim(),
      autoSyncSeconds: patch.autoSyncSeconds === void 0 ? current.autoSyncSeconds : normalizeSeconds(patch.autoSyncSeconds),
      quickSync: patch.quickSync === void 0 ? current.quickSync : patch.quickSync === true
    };
    mkdirSync2(hostRoot(), { recursive: true, mode: 448 });
    const file = settingsPath();
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(next, null, 2)}
`, { mode: 384 });
    renameSync(temp, file);
    if (process.platform !== "win32") {
      try {
        chmodSync(file, 384);
      } catch {
      }
    }
    this.current = next;
    return this.public();
  }
  hasStoredToken() {
    return this.load().token !== "";
  }
};
function normalizeServerUrlSafe(value) {
  try {
    return normalizeServerUrl(value);
  } catch {
    return "";
  }
}
function ensureHostDirs(serverUrl) {
  const dir = instanceDir(serverUrl);
  mkdirSync2(join(dir, "tmp"), { recursive: true, mode: 448 });
  return dir;
}

// src/host/sync.ts
import { randomUUID as randomUUID2 } from "node:crypto";
var SyncEngine = class {
  store;
  logger;
  onState;
  settings;
  remote;
  timer = null;
  quickTimer = null;
  inflight = null;
  disposed = false;
  state;
  serverId = null;
  serverVersion = null;
  userId = null;
  lastSyncAt = null;
  lastAttemptAt = null;
  nextSyncAt = null;
  error = null;
  online = false;
  constructor(options) {
    this.store = options.store;
    this.settings = options.settings;
    this.logger = options.logger;
    this.onState = options.onState;
    this.remote = this.settings.serverUrl !== "" && this.settings.token !== "" ? new RemoteClient(this.settings.serverUrl, this.settings.token) : null;
    this.serverId = this.store.getMeta("serverId");
    this.serverVersion = this.store.getMeta("serverVersion");
    this.userId = this.store.getMeta("userId");
    const cursor = this.store.getMeta("cursor");
    this.state = {
      state: this.remote === null ? "unconfigured" : cursor === null ? "idle" : "idle",
      online: false,
      pending: this.store.counts().pending,
      conflicts: this.store.counts().conflicts,
      lastSyncAt: Number(this.store.getMeta("lastSyncAt") ?? 0) || null,
      lastAttemptAt: null,
      nextSyncAt: null,
      error: null,
      serverId: this.serverId,
      serverVersion: this.serverVersion,
      userId: this.userId,
      autoSyncSeconds: this.settings.autoSyncSeconds,
      quickSync: this.settings.quickSync
    };
    this.lastSyncAt = this.state.lastSyncAt;
  }
  status() {
    const counts = this.store.counts();
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
      userId: this.userId
    };
  }
  configured() {
    return this.remote !== null;
  }
  remoteClient() {
    return this.remote;
  }
  start() {
    if (this.remote === null) return;
    void this.syncNow("start");
    this.scheduleNext();
  }
  stop() {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    if (this.quickTimer !== null) clearTimeout(this.quickTimer);
    this.timer = null;
    this.quickTimer = null;
  }
  updateSettings(settings) {
    this.settings = settings;
    this.remote = settings.serverUrl !== "" && settings.token !== "" ? new RemoteClient(settings.serverUrl, settings.token) : null;
    if (this.remote === null) {
      this.online = false;
      this.state = { ...this.state, state: "unconfigured", error: null };
    }
  }
  touch() {
    if (this.remote === null) return;
    if (!this.settings.quickSync) return;
    if (this.quickTimer !== null) clearTimeout(this.quickTimer);
    this.quickTimer = setTimeout(() => {
      this.quickTimer = null;
      void this.syncNow("quick");
    }, 2500);
  }
  scheduleNext() {
    if (this.disposed || this.remote === null) return;
    if (this.timer !== null) clearTimeout(this.timer);
    const delay = Math.max(5, this.settings.autoSyncSeconds) * 1e3;
    this.nextSyncAt = Date.now() + delay;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.syncNow("timer");
    }, delay);
    this.emit();
  }
  async syncNow(reason = "manual") {
    if (this.remote === null) {
      this.state = { ...this.state, state: "unconfigured" };
      this.emit();
      return;
    }
    if (this.inflight !== null) return this.inflight;
    this.inflight = this.runSync(reason);
    try {
      await this.inflight;
    } finally {
      this.inflight = null;
    }
  }
  async runSync(reason) {
    if (this.disposed || this.remote === null) return;
    this.lastAttemptAt = Date.now();
    this.state = { ...this.state, state: "syncing" };
    this.emit();
    this.logger.debug(`sync start (${reason})`);
    try {
      const health = await this.remote.health();
      this.serverId = health.server.id;
      this.serverVersion = health.server.version;
      this.online = true;
      this.error = null;
      const session = await this.remote.session().catch(() => null);
      if (session !== null) this.userId = session.user.id;
      const cachedServerId = this.store.getMeta("serverId");
      if (cachedServerId !== null && cachedServerId !== health.server.id) {
        this.logger.warn("server id changed; requiring a full resync");
        this.store.setMeta("cursor", "");
        this.store.setMeta("serverId", health.server.id);
      } else {
        this.store.setMeta("serverId", health.server.id);
      }
      this.store.setMeta("serverVersion", health.server.version);
      if (this.userId !== null) this.store.setMeta("userId", this.userId);
      await this.pull();
      await this.push();
      await this.pull();
      this.lastSyncAt = Date.now();
      this.store.setMeta("lastSyncAt", String(this.lastSyncAt));
      this.state = { ...this.state, state: "idle" };
      this.logger.debug(`sync done (${reason})`);
    } catch (error) {
      this.online = false;
      const message = error instanceof Error ? error.message : String(error);
      this.error = message;
      if (error instanceof RemoteError && (error.status === 401 || error.status === 403)) {
        this.state = { ...this.state, state: "error" };
      } else {
        this.state = { ...this.state, state: this.store.counts().conflicts > 0 ? "conflict" : "offline" };
      }
      this.logger.warn(`sync failed (${reason})`, message);
    } finally {
      const counts = this.store.counts();
      if (counts.conflicts > 0) this.state = { ...this.state, state: "conflict" };
      else if (counts.pending > 0 && this.state.state === "idle") this.state = { ...this.state, state: "pending" };
      this.nextSyncAt = Date.now() + Math.max(5, this.settings.autoSyncSeconds) * 1e3;
      this.emit();
      this.scheduleNext();
    }
  }
  emit() {
    try {
      this.onState?.(this.status());
    } catch {
    }
  }
  // -- pull -----------------------------------------------------------------
  async pull() {
    if (this.remote === null) return;
    const cursor = this.store.getMeta("cursor");
    if (cursor === null || cursor === "") {
      await this.bootstrap();
      return;
    }
    let since = Number(cursor);
    if (!Number.isFinite(since)) since = 0;
    for (let page = 0; page < 20; page += 1) {
      let result;
      try {
        result = await this.remote.changes(since, 500);
      } catch (error) {
        if (error instanceof RemoteError && (error.status === 410 || error.code === "SYNC_CURSOR_EXPIRED")) {
          await this.bootstrap();
          return;
        }
        throw error;
      }
      for (const change of result.changes) await this.applyChange(change);
      since = result.cursor;
      this.store.setMeta("cursor", String(result.cursor));
      if (!result.hasMore) break;
    }
  }
  async bootstrap() {
    if (this.remote === null) return;
    const data = await this.remote.bootstrap();
    this.store.setMeta("serverId", data.server.id);
    this.store.setMeta("serverVersion", data.server.version);
    this.store.setMeta("userId", data.user.id);
    this.store.setMeta("cursor", String(data.cursor));
    const folderIds = /* @__PURE__ */ new Set();
    for (const folder of data.folders) {
      folderIds.add(folder.id);
      this.store.upsertFolderFromServer(folder);
    }
    const noteIds = /* @__PURE__ */ new Set();
    for (const note of data.notes) {
      noteIds.add(note.id);
      this.store.upsertNoteFromServer(note);
    }
    const attachmentIds = /* @__PURE__ */ new Set();
    for (const attachment of data.attachments) {
      attachmentIds.add(attachment.id);
      this.store.upsertAttachmentFromServer(attachment);
    }
    this.store.pruneNotes(noteIds);
    this.store.pruneFolders(folderIds);
    this.store.pruneAttachments(attachmentIds);
    this.serverId = data.server.id;
    this.serverVersion = data.server.version;
    this.userId = data.user.id;
  }
  async applyChange(change) {
    if (change.entity === "note") {
      const existing = this.store.getNoteRow(change.id);
      if (change.action === "delete") {
        if (existing !== null && Number(existing.dirty ?? 0) === 1) {
          const local = this.store.getNote(change.id);
          if (local !== null) {
            this.store.markConflict(change.id, {
              ...local,
              title: "\uFF08\u670D\u52A1\u5668\u5DF2\u5220\u9664\uFF09",
              content: "",
              tags: [],
              revision: 0,
              deletedAt: Date.now(),
              attachments: []
            });
          }
          return;
        }
        this.store.deleteNoteFromServer(change.id);
        return;
      }
      const meta = change.data;
      if (meta === null) return;
      if (existing !== null && Number(existing.dirty ?? 0) === 1) {
        const localRevision = Number(existing.server_revision ?? 0);
        if ((meta.revision ?? 0) !== localRevision) {
          const serverNote = await this.remote?.getNote(change.id).catch(() => null);
          if (serverNote !== null && serverNote !== void 0) this.store.markConflict(change.id, serverNote);
        }
        return;
      }
      this.store.upsertNoteFromServer(meta);
      return;
    }
    if (change.entity === "folder") {
      if (change.action === "delete") {
        this.store.deleteFolderFromServer(change.id);
        return;
      }
      const meta = change.data;
      if (meta === null) return;
      this.store.upsertFolderFromServer({
        id: meta.id,
        parentId: meta.parentId ?? null,
        name: meta.name,
        sortOrder: meta.sortOrder ?? 0,
        revision: meta.revision ?? 1,
        createdAt: meta.createdAt ?? 0,
        updatedAt: meta.updatedAt ?? 0
      });
      return;
    }
    if (change.entity === "attachment") {
      if (change.action === "delete") {
        this.store.deleteAttachmentFromServer(change.id);
        return;
      }
      const meta = change.data;
      if (meta !== null) this.store.upsertAttachmentFromServer(meta);
    }
  }
  // -- push -----------------------------------------------------------------
  async push() {
    if (this.remote === null) return;
    for (const folder of this.store.dirtyFolders()) {
      if (Number(folder.deleted ?? 0) === 1) {
        if (folder.server_revision !== null && folder.server_revision !== void 0) {
          try {
            await this.remote.deleteFolder(String(folder.id), false);
          } catch (error) {
            if (!(error instanceof RemoteError && error.status === 404)) throw error;
          }
        }
        this.store.removeFolder(String(folder.id));
        continue;
      }
      const payload = {
        name: String(folder.name ?? ""),
        parentId: folder.parent_id === null || folder.parent_id === void 0 ? null : String(folder.parent_id)
      };
      try {
        if (folder.server_revision === null || folder.server_revision === void 0) {
          const created = await this.remote.createFolder({ id: String(folder.id), ...payload });
          this.store.markFolderSynced(String(folder.id), created.revision);
        } else {
          const updated = await this.remote.updateFolder(String(folder.id), {
            baseRevision: Number(folder.server_revision),
            ...payload,
            opId: this.opIdFor("folder", String(folder.id))
          });
          this.store.markFolderSynced(String(folder.id), updated.revision);
          this.clearOp("folder", String(folder.id));
        }
      } catch (error) {
        if (error instanceof RemoteError && error.status === 404) {
          this.store.markFolderUnsynced(String(folder.id));
          continue;
        }
        if (error instanceof RemoteError && error.status === 409) {
          continue;
        }
        throw error;
      }
    }
    for (const row of this.store.dirtyDeletedNotes()) {
      const id = String(row.id ?? "");
      try {
        if (row.server_revision !== null && row.server_revision !== void 0) {
          await this.remote.deleteNote(id);
        }
        this.store.removeNote(id);
      } catch (error) {
        if (error instanceof RemoteError && error.status === 404) {
          this.store.removeNote(id);
          continue;
        }
        throw error;
      }
    }
    for (const row of this.store.dirtyNotes()) {
      const id = String(row.id ?? "");
      const payload = {
        title: String(row.title ?? ""),
        content: String(row.content ?? ""),
        tags: parseTags2(row.tags),
        pinned: Number(row.pinned ?? 0) === 1,
        folderId: row.folder_id === null || row.folder_id === void 0 ? null : String(row.folder_id)
      };
      try {
        if (row.server_revision === null || row.server_revision === void 0) {
          const created = await this.remote.createNote({
            id,
            ...payload,
            opId: this.opIdFor("note", id)
          });
          this.store.markNoteSynced(id, created.revision, created.updatedAt);
          this.clearOp("note", id);
        } else {
          const updated = await this.remote.updateNote(id, {
            baseRevision: Number(row.server_revision),
            ...payload,
            opId: this.opIdFor("note", id)
          });
          this.store.markNoteSynced(id, updated.revision, updated.updatedAt);
          this.clearOp("note", id);
        }
      } catch (error) {
        if (error instanceof RemoteError && error.status === 409) {
          const current = error.payload?.current ?? await this.remote.getNote(id).catch(() => null);
          if (current !== null && current !== void 0) this.store.markConflict(id, current);
          continue;
        }
        if (error instanceof RemoteError && error.status === 404) {
          this.store.markNoteUnsynced(id);
          continue;
        }
        throw error;
      }
    }
  }
  opIdFor(entity, id) {
    const key = `op:${entity}:${id}`;
    const existing = this.store.getMeta(key);
    if (existing !== null && existing !== "") return existing;
    const value = randomUUID2();
    this.store.setMeta(key, value);
    return value;
  }
  clearOp(entity, id) {
    this.store.setMeta(`op:${entity}:${id}`, "");
  }
  // -- reads and conflict resolution ---------------------------------------
  async getNote(id) {
    let local = this.store.getNote(id);
    if (local === null && this.remote !== null) {
      const remoteNote = await this.remote.getNote(id);
      this.store.upsertNoteFromServer(remoteNote, remoteNote.content);
      local = this.store.getNote(id);
    }
    if (local === null) throw new Error("\u7B14\u8BB0\u4E0D\u5B58\u5728");
    this.store.markRecent(id);
    if (!this.store.hasBody(id) && this.remote !== null) {
      try {
        const remoteNote = await this.remote.getNote(id);
        this.store.setNoteBody(id, remoteNote.content, remoteNote.revision);
        return this.store.getNote(id) ?? remoteNote;
      } catch (error) {
        if (local.content !== "") return local;
        throw error;
      }
    }
    return local;
  }
  search(query, limit = 50) {
    return this.store.search(query, limit);
  }
  tree() {
    return this.store.listTree();
  }
  async getTrash() {
    if (this.remote !== null) {
      try {
        return await this.remote.listTrash();
      } catch {
      }
    }
    return this.store.getTrashLocal();
  }
  async restoreNote(id) {
    const local = this.store.restoreLocalNote(id);
    if (local !== null) {
      this.touch();
      return local;
    }
    if (this.remote === null) throw new Error("\u7B14\u8BB0\u4E0D\u5B58\u5728");
    const restored = await this.remote.restoreNote(id);
    this.store.upsertNoteFromServer(restored, restored.content);
    await this.pull();
    return this.store.getNote(id) ?? restored;
  }
  async getVersions(noteId) {
    if (this.remote === null) return [];
    return this.remote.getVersions(noteId);
  }
  async getVersion(noteId, revision) {
    if (this.remote === null) throw new Error("\u9700\u8981\u8FDE\u63A5\u670D\u52A1\u5668");
    return this.remote.getVersion(noteId, revision);
  }
  async revertNote(noteId, revision) {
    if (this.remote === null) throw new Error("\u9700\u8981\u8FDE\u63A5\u670D\u52A1\u5668");
    const reverted = await this.remote.revertNote(noteId, revision);
    this.store.upsertNoteFromServer(reverted, reverted.content);
    await this.pull();
    return this.store.getNote(noteId) ?? reverted;
  }
  conflicts() {
    return this.store.getConflicts();
  }
  conflict(noteId) {
    return this.store.getConflict(noteId);
  }
  resolveConflict(noteId, strategy) {
    const conflict = this.store.getConflict(noteId);
    if (conflict === null) return;
    if (strategy === "copy") {
      this.store.createLocalNote({
        title: conflict.localTitle || "\u672A\u547D\u540D\u7B14\u8BB0",
        content: conflict.localContent,
        tags: conflict.localTags,
        folderId: conflict.localFolderId,
        pinned: conflict.localPinned
      });
      this.store.adoptServerConflict(noteId);
    } else if (strategy === "local") {
      this.store.keepLocalConflict(noteId);
    } else {
      this.store.adoptServerConflict(noteId);
    }
    this.touch();
  }
  counts() {
    return this.store.counts();
  }
  async deleteAttachment(id) {
    if (this.remote === null) throw new Error("\u9700\u8981\u8FDE\u63A5\u670D\u52A1\u5668\u624D\u80FD\u5220\u9664\u9644\u4EF6");
    await this.remote.deleteAttachment(id);
    this.store.deleteAttachmentFromServer(id);
  }
  async addAttachmentMeta(meta) {
    this.store.upsertAttachmentFromServer(meta);
  }
  dispose() {
    this.stop();
  }
};
function parseTags2(raw) {
  try {
    const parsed = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

// src/host/host.ts
var NotesHost = class {
  version;
  logger;
  settingsStore;
  store;
  sync;
  effective;
  disposed = false;
  constructor(options) {
    this.version = options.version;
    this.logger = options.logger;
    this.settingsStore = new SettingsStore(options.config ?? {});
    this.effective = this.settingsStore.effective();
    ensureHostDirs(this.effective.serverUrl);
    this.store = new LocalStore(join2(this.effective.dataDir, "cache.db"));
    this.sync = new SyncEngine({
      store: this.store,
      settings: this.effective,
      logger: this.logger
    });
    this.sync.start();
  }
  // -- settings / state -----------------------------------------------------
  settings() {
    return this.settingsStore.public();
  }
  state() {
    const counts = this.sync.counts();
    const status = this.sync.status();
    const settings = this.settings();
    return {
      configured: settings.serverUrl !== "" && settings.hasToken,
      version: this.version,
      settings,
      sync: status,
      counts,
      conflicts: this.sync.conflicts(),
      serverVersion: status.serverVersion,
      serverId: status.serverId,
      userId: status.userId
    };
  }
  async saveSettings(patch) {
    const previous = this.effective.serverUrl;
    this.settingsStore.save(patch);
    const next = this.settingsStore.effective();
    if (next.serverUrl !== previous) {
      this.sync.stop();
      this.store.close();
      ensureHostDirs(next.serverUrl);
      this.store = new LocalStore(join2(next.dataDir, "cache.db"));
      this.sync = new SyncEngine({ store: this.store, settings: next, logger: this.logger });
      this.effective = next;
      this.sync.start();
    } else {
      this.effective = next;
      this.sync.updateSettings(next);
      void this.sync.syncNow("settings");
    }
    return this.state();
  }
  async testConnection(patch = {}) {
    const effective = this.settingsStore.effective();
    let serverUrl;
    try {
      serverUrl = patch.serverUrl !== void 0 && patch.serverUrl.trim() !== "" ? normalizeServerUrl(patch.serverUrl) : effective.serverUrl;
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
    const token = patch.token !== void 0 && patch.token.trim() !== "" ? patch.token.trim() : effective.token;
    if (serverUrl === "" || token === "") return { ok: false, message: "\u8BF7\u586B\u5199\u670D\u52A1\u5668\u5730\u5740\u548C\u8BBF\u95EE\u4EE4\u724C" };
    const client = new RemoteClient(serverUrl, token);
    try {
      const health = await client.health();
      const session = await client.session();
      return {
        ok: true,
        message: `\u8FDE\u63A5\u6210\u529F\uFF1A${serverUrl} \xB7 \u7248\u672C ${health.server.version} \xB7 \u7528\u6237 ${session.user.username} \xB7 \u6743\u9650 ${session.auth.scopes.join(",")}`
      };
    } catch (error) {
      const message = error instanceof RemoteError ? error.message : error instanceof Error ? error.message : String(error);
      return { ok: false, message };
    }
  }
  // -- reads ----------------------------------------------------------------
  tree() {
    return this.sync.tree();
  }
  getNote(id) {
    return this.sync.getNote(id);
  }
  search(query, limit = 50) {
    return this.sync.search(query, limit);
  }
  recent(limit = 20) {
    return this.store.recent(limit);
  }
  async getTrash() {
    return this.sync.getTrash();
  }
  listAttachments(noteId) {
    return this.store.listAttachments(noteId);
  }
  conflicts() {
    return this.sync.conflicts();
  }
  conflict(noteId) {
    return this.sync.conflict(noteId);
  }
  async getVersions(noteId) {
    return this.sync.getVersions(noteId);
  }
  async getVersion(noteId, revision) {
    return this.sync.getVersion(noteId, revision);
  }
  async stats() {
    const counts = this.sync.counts();
    const status = this.sync.status();
    return {
      ...counts,
      serverVersion: status.serverVersion,
      serverId: status.serverId,
      userId: status.userId
    };
  }
  // -- local writes ---------------------------------------------------------
  createNote(input) {
    const note = this.store.createLocalNote(input);
    this.sync.touch();
    return note;
  }
  updateNote(id, input) {
    const existing = this.store.getNoteRow(id);
    if (existing === null) throw new Error("\u7B14\u8BB0\u4E0D\u5B58\u5728");
    const note = this.store.updateLocalNote(id, {
      title: input.title,
      content: input.content,
      tags: input.tags,
      pinned: input.pinned,
      folderId: input.folderId
    });
    this.sync.touch();
    return note;
  }
  async deleteNote(id, permanent = false) {
    const remote = this.sync.remoteClient();
    if (permanent && remote !== null) {
      try {
        await remote.deleteNote(id, true);
      } catch (error) {
        if (!(error instanceof RemoteError && error.status === 404)) throw error;
      }
    }
    if (permanent) {
      const row = this.store.getNoteRow(id);
      const storage = row === null ? null : this.store.listAttachments(id);
      if (storage !== null) {
        for (const attachment of storage) {
          await remote?.deleteAttachment(attachment.id).catch(() => void 0);
        }
      }
      this.store.removeNote(id);
      return;
    }
    this.store.deleteLocalNote(id);
    this.sync.touch();
  }
  async restoreNote(id) {
    const restored = await this.sync.restoreNote(id);
    this.sync.touch();
    return restored;
  }
  moveNote(id, folderId, baseRevision) {
    const note = this.store.updateLocalNote(id, { folderId });
    this.sync.touch();
    return note;
  }
  createFolder(input) {
    const folder = this.store.createLocalFolder(input);
    this.sync.touch();
    return folder;
  }
  updateFolder(id, input) {
    const folder = this.store.updateLocalFolder(id, { name: input.name, parentId: input.parentId });
    this.sync.touch();
    return folder;
  }
  deleteFolder(id, recursive = false) {
    const tree = this.store.listTree();
    const folder = tree.folders.find((item) => item.id === id);
    if (folder === void 0) throw new Error("\u76EE\u5F55\u4E0D\u5B58\u5728");
    const descendants = /* @__PURE__ */ new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of tree.folders) {
        if (item.parentId !== null && descendants.has(item.parentId) && !descendants.has(item.id)) {
          descendants.add(item.id);
          changed = true;
        }
      }
    }
    if (recursive) {
      for (const note of tree.notes) {
        if (note.folderId !== null && descendants.has(note.folderId)) this.store.deleteLocalNote(note.id);
      }
      for (const folderId of Array.from(descendants).reverse()) this.store.deleteLocalFolder(folderId);
    } else {
      for (const note of tree.notes) {
        if (note.folderId === id) this.store.updateLocalNote(note.id, { folderId: folder.parentId });
      }
      for (const item of tree.folders) {
        if (item.parentId === id) this.store.updateLocalFolder(item.id, { parentId: folder.parentId });
      }
      this.store.deleteLocalFolder(id);
    }
    this.sync.touch();
  }
  // -- sync / conflicts -----------------------------------------------------
  async syncNow() {
    await this.sync.syncNow("manual");
    return this.state();
  }
  resolveConflict(noteId, strategy) {
    this.sync.resolveConflict(noteId, strategy);
    void this.sync.syncNow("conflict");
    return this.state();
  }
  async revertNote(noteId, revision) {
    const reverted = await this.sync.revertNote(noteId, revision);
    this.sync.touch();
    return reverted;
  }
  // -- attachments ----------------------------------------------------------
  async uploadFromRequest(noteId, req) {
    const remote = this.sync.remoteClient();
    if (remote === null) throw new Error("\u9700\u8981\u5148\u914D\u7F6E\u5E76\u8FDE\u63A5\u7B14\u8BB0\u670D\u52A1\u5668");
    const payload = await remote.uploadFromRequest(noteId, req);
    if (payload.attachment !== void 0) this.store.upsertAttachmentFromServer(payload.attachment);
    return payload;
  }
  async uploadBase64(noteId, filename, mime, base64) {
    const remote = this.sync.remoteClient();
    if (remote === null) throw new Error("\u9700\u8981\u5148\u914D\u7F6E\u5E76\u8FDE\u63A5\u7B14\u8BB0\u670D\u52A1\u5668");
    const buffer = Buffer.from(base64, "base64");
    if (buffer.byteLength === 0) throw new Error("\u9644\u4EF6\u5185\u5BB9\u4E3A\u7A7A");
    if (buffer.byteLength > 20 * 1024 * 1024) throw new Error("\u9644\u4EF6\u8D85\u8FC7 20MB \u5DE5\u5177\u9650\u5236");
    const payload = await remote.uploadBuffer(noteId, filename, mime, buffer);
    if (payload.attachment !== void 0) this.store.upsertAttachmentFromServer(payload.attachment);
    return payload;
  }
  async pipeAttachment(id, req, res) {
    const remote = this.sync.remoteClient();
    if (remote === null) {
      res.statusCode = 503;
      res.end("notes server is not configured");
      return;
    }
    await remote.pipeAttachment(id, req, res);
  }
  async deleteAttachment(id) {
    await this.sync.deleteAttachment(id);
  }
  shortLabel() {
    try {
      return this.effective.serverUrl === "" ? "\u672A\u914D\u7F6E" : new URL(this.effective.serverUrl).host;
    } catch {
      return this.effective.serverUrl;
    }
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.sync.dispose();
    this.store.close();
  }
};

// src/host/routes.ts
var PREFIX = "/dsh-notes";
var BODY_LIMIT = 1024 * 1024;
var RouteError = class extends Error {
  status;
  code;
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
};
function registerHostRoutes(options) {
  const { host, webServer, connectionOf, logger } = options;
  return webServer.register({
    kind: "prefix",
    path: PREFIX,
    handler: (req, res) => handle(req, res, host, connectionOf, logger)
  });
}
async function handle(req, res, host, connectionOf, logger) {
  try {
    const rejection = connectionOf()?.requestRejection?.(req);
    if (rejection !== void 0) {
      res.statusCode = rejection;
      res.end(rejection === 401 ? "unauthorized" : "forbidden");
      return;
    }
    const url = new URL(req.url ?? "/", "http://dsh-notes.invalid");
    let pathname = url.pathname;
    if (!pathname.startsWith(PREFIX)) throw new RouteError(404, "NOT_FOUND", "\u672A\u627E\u5230");
    pathname = pathname.slice(PREFIX.length) || "/";
    const segments = pathname.split("/").filter((part) => part !== "").map((part) => decodeURIComponent(part));
    const method = (req.method ?? "GET").toUpperCase();
    if (segments.length === 0 && method === "GET") {
      sendJson(res, 200, { ok: true, state: host.state() });
      return;
    }
    if (segments[0] === "state" && method === "GET") {
      sendJson(res, 200, { ok: true, state: host.state() });
      return;
    }
    if (segments[0] === "tree" && method === "GET") {
      sendJson(res, 200, { ok: true, tree: host.tree() });
      return;
    }
    if (segments[0] === "search" && method === "GET") {
      const query = url.searchParams.get("q") ?? "";
      sendJson(res, 200, { ok: true, results: host.search(query, Number(url.searchParams.get("limit") ?? 50)) });
      return;
    }
    if (segments[0] === "recent" && method === "GET") {
      sendJson(res, 200, { ok: true, notes: host.recent(Number(url.searchParams.get("limit") ?? 20)) });
      return;
    }
    if (segments[0] === "trash" && method === "GET") {
      sendJson(res, 200, { ok: true, notes: await host.getTrash() });
      return;
    }
    if (segments[0] === "sync" && method === "POST") {
      sendJson(res, 200, { ok: true, state: await host.syncNow() });
      return;
    }
    if (segments[0] === "settings") {
      if (method === "GET") {
        sendJson(res, 200, { ok: true, settings: host.settings() });
        return;
      }
      if (method === "PUT") {
        const body = await readJson(req);
        const state = await host.saveSettings({
          serverUrl: typeof body.serverUrl === "string" ? body.serverUrl : void 0,
          token: typeof body.token === "string" ? body.token : void 0,
          autoSyncSeconds: body.autoSyncSeconds === void 0 ? void 0 : Number(body.autoSyncSeconds),
          quickSync: body.quickSync === void 0 ? void 0 : body.quickSync === true
        });
        sendJson(res, 200, { ok: true, state });
        return;
      }
      if (method === "POST" && segments[1] === "test") {
        const body = await readJson(req);
        const result = await host.testConnection({
          serverUrl: typeof body.serverUrl === "string" ? body.serverUrl : void 0,
          token: typeof body.token === "string" ? body.token : void 0
        });
        sendJson(res, 200, { ok: true, ...result });
        return;
      }
      throw new RouteError(405, "METHOD_NOT_ALLOWED", "\u4E0D\u652F\u6301\u7684\u65B9\u6CD5");
    }
    if (segments[0] === "conflicts") {
      if (segments[1] === void 0 && method === "GET") {
        sendJson(res, 200, { ok: true, conflicts: host.conflicts() });
        return;
      }
      if (segments[1] !== void 0 && segments[2] === void 0 && method === "GET") {
        const conflict = host.conflict(segments[1]);
        if (conflict === null) throw new RouteError(404, "CONFLICT_NOT_FOUND", "\u51B2\u7A81\u4E0D\u5B58\u5728");
        sendJson(res, 200, { ok: true, conflict });
        return;
      }
      if (segments[1] !== void 0 && segments[2] === "resolve" && method === "POST") {
        const body = await readJson(req);
        const strategy = body.strategy;
        if (strategy !== "server" && strategy !== "local" && strategy !== "copy") {
          throw new RouteError(400, "INVALID_STRATEGY", "strategy \u5FC5\u987B\u662F server/local/copy");
        }
        sendJson(res, 200, { ok: true, state: host.resolveConflict(segments[1], strategy) });
        return;
      }
      throw new RouteError(404, "NOT_FOUND", "\u672A\u627E\u5230");
    }
    if (segments[0] === "versions") {
      if (segments[1] === void 0 && method === "GET") {
        const noteId = url.searchParams.get("noteId") ?? "";
        if (noteId === "") throw new RouteError(400, "NOTE_ID_REQUIRED", "\u7F3A\u5C11 noteId");
        sendJson(res, 200, { ok: true, versions: await host.getVersions(noteId) });
        return;
      }
      if (segments[1] !== void 0 && segments[2] !== void 0 && method === "GET") {
        sendJson(res, 200, { ok: true, version: await host.getVersion(segments[1], Number(segments[2])) });
        return;
      }
      if (segments[1] === "restore" && method === "POST") {
        const body = await readJson(req);
        const noteId = typeof body.noteId === "string" ? body.noteId : "";
        if (noteId === "") throw new RouteError(400, "NOTE_ID_REQUIRED", "\u7F3A\u5C11 noteId");
        sendJson(res, 200, { ok: true, note: await host.revertNote(noteId, Number(body.revision)) });
        return;
      }
      throw new RouteError(404, "NOT_FOUND", "\u672A\u627E\u5230");
    }
    if (segments[0] === "notes") {
      const id = segments[1];
      if (id === void 0 && method === "POST") {
        const body = await readJson(req);
        const note = host.createNote({
          id: typeof body.id === "string" ? body.id : void 0,
          folderId: body.folderId === null ? null : typeof body.folderId === "string" ? body.folderId : null,
          title: typeof body.title === "string" ? body.title : void 0,
          content: typeof body.content === "string" ? body.content : void 0,
          tags: Array.isArray(body.tags) ? body.tags.filter((tag) => typeof tag === "string") : void 0,
          pinned: body.pinned === true,
          opId: typeof body.opId === "string" ? body.opId : void 0
        });
        sendJson(res, 201, { ok: true, note });
        return;
      }
      if (id === void 0) throw new RouteError(405, "METHOD_NOT_ALLOWED", "\u4E0D\u652F\u6301\u7684\u65B9\u6CD5");
      if (segments[2] === "attachments" && method === "POST") {
        const payload = await host.uploadFromRequest(id, req);
        sendJson(res, 201, payload);
        return;
      }
      if (segments[2] === "restore" && method === "POST") {
        sendJson(res, 200, { ok: true, note: await host.restoreNote(id) });
        return;
      }
      if (segments[2] === "move" && method === "POST") {
        const body = await readJson(req);
        const folderId = body.folderId === null ? null : typeof body.folderId === "string" ? body.folderId : null;
        sendJson(res, 200, { ok: true, note: host.moveNote(id, folderId, Number(body.baseRevision)) });
        return;
      }
      if (segments[2] !== void 0) throw new RouteError(404, "NOT_FOUND", "\u672A\u627E\u5230");
      if (method === "GET") {
        sendJson(res, 200, { ok: true, note: await host.getNote(id) });
        return;
      }
      if (method === "PUT") {
        const body = await readJson(req);
        const note = host.updateNote(id, {
          baseRevision: Number(body.baseRevision),
          title: body.title === void 0 ? void 0 : String(body.title),
          content: body.content === void 0 ? void 0 : String(body.content),
          tags: Array.isArray(body.tags) ? body.tags.filter((tag) => typeof tag === "string") : void 0,
          pinned: body.pinned === void 0 ? void 0 : body.pinned === true,
          folderId: body.folderId === void 0 ? void 0 : body.folderId === null ? null : String(body.folderId),
          opId: typeof body.opId === "string" ? body.opId : void 0
        });
        sendJson(res, 200, { ok: true, note });
        return;
      }
      if (method === "DELETE") {
        const permanent = url.searchParams.get("permanent") === "1";
        await host.deleteNote(id, permanent);
        sendJson(res, 200, { ok: true });
        return;
      }
      throw new RouteError(405, "METHOD_NOT_ALLOWED", "\u4E0D\u652F\u6301\u7684\u65B9\u6CD5");
    }
    if (segments[0] === "folders") {
      const id = segments[1];
      if (id === void 0 && method === "POST") {
        const body = await readJson(req);
        const folder = host.createFolder({
          id: typeof body.id === "string" ? body.id : void 0,
          parentId: body.parentId === null ? null : typeof body.parentId === "string" ? body.parentId : null,
          name: typeof body.name === "string" ? body.name : ""
        });
        sendJson(res, 201, { ok: true, folder });
        return;
      }
      if (id !== void 0 && method === "PATCH") {
        const body = await readJson(req);
        const folder = host.updateFolder(id, {
          baseRevision: Number(body.baseRevision),
          name: body.name === void 0 ? void 0 : String(body.name),
          parentId: body.parentId === void 0 ? void 0 : body.parentId === null ? null : String(body.parentId)
        });
        sendJson(res, 200, { ok: true, folder });
        return;
      }
      if (id !== void 0 && method === "DELETE") {
        const recursive = url.searchParams.get("recursive") === "1";
        host.deleteFolder(id, recursive);
        sendJson(res, 200, { ok: true });
        return;
      }
      throw new RouteError(405, "METHOD_NOT_ALLOWED", "\u4E0D\u652F\u6301\u7684\u65B9\u6CD5");
    }
    if (segments[0] === "attachments" && segments[1] !== void 0) {
      if (method === "GET") {
        await host.pipeAttachment(segments[1], req, res);
        return;
      }
      if (method === "DELETE") {
        await host.deleteAttachment(segments[1]);
        sendJson(res, 200, { ok: true });
        return;
      }
      throw new RouteError(405, "METHOD_NOT_ALLOWED", "\u4E0D\u652F\u6301\u7684\u65B9\u6CD5");
    }
    throw new RouteError(404, "NOT_FOUND", "\u672A\u627E\u5230");
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const status = error instanceof RouteError ? error.status : error instanceof Error && /不存在/.test(error.message) ? 404 : 400;
    const code = error instanceof RouteError ? error.code : "REQUEST_FAILED";
    const message = error instanceof Error ? error.message : String(error);
    if (status >= 500) logger.error("host route failed", error);
    else logger.debug(`host route ${req.method ?? "GET"} ${req.url ?? "/"} -> ${status}: ${message}`);
    sendJson(res, status, { ok: false, error: { code, message } });
  }
}
async function readJson(req) {
  const essence = String(req.headers["content-type"] ?? "").split(";", 1)[0]?.trim().toLowerCase();
  if (essence !== "application/json") throw new RouteError(415, "UNSUPPORTED_MEDIA_TYPE", "\u8BF7\u6C42\u5FC5\u987B\u4F7F\u7528 application/json");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > BODY_LIMIT) throw new RouteError(413, "BODY_TOO_LARGE", "\u8BF7\u6C42\u4F53\u8FC7\u5927");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RouteError(400, "INVALID_JSON", "JSON \u683C\u5F0F\u9519\u8BEF");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RouteError(400, "INVALID_JSON", "\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  }
  return parsed;
}
function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", String(Buffer.byteLength(text)));
  res.end(text);
}

// src/host/tools.ts
function textResult(value) {
  return [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }];
}
function tool(definition) {
  return {
    ...definition,
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, value) => textResult(value)
    },
    execute: async (rawArgs) => definition.execute(asObject(rawArgs))
  };
}
function asObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}
function requiredString(args, key) {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`\u53C2\u6570\u9519\u8BEF\uFF1A${key} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32`);
  return value;
}
function optionalString(args, key) {
  const value = args[key];
  return typeof value === "string" ? value : void 0;
}
function optionalNumber(args, key) {
  const value = Number(args[key]);
  return Number.isFinite(value) ? value : void 0;
}
function optionalBoolean(args, key) {
  const value = args[key];
  return typeof value === "boolean" ? value : void 0;
}
function stringArray(args, key) {
  const value = args[key];
  if (!Array.isArray(value)) return void 0;
  return value.filter((item) => typeof item === "string");
}
function optionalId(args, key) {
  if (args[key] === null) return null;
  const value = args[key];
  return typeof value === "string" && value !== "" ? value : void 0;
}
var ID_SCHEMA = { type: "string", description: "\u7B14\u8BB0 id" };
var NOTE_ID_SCHEMA = { type: "string", description: "\u7B14\u8BB0 id" };
function registerNotesTools(ctx, host) {
  const register = (definition) => {
    ctx.tools.register(definition);
  };
  register(tool({
    name: "notes_tree",
    description: "\u8FD4\u56DE\u5F53\u524D\u8D26\u53F7\u7684\u7B14\u8BB0\u76EE\u5F55\u6811\uFF08\u6587\u4EF6\u5939\u4E0E\u7B14\u8BB0\u5143\u6570\u636E\uFF0C\u4EE5\u53CA Markdown \u5927\u7EB2\uFF09\u3002",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    isConcurrencySafe: () => true,
    execute: async () => {
      const tree = host.tree();
      return { tree, markdown: treeMarkdown(tree.folders, tree.notes) };
    }
  }));
  register(tool({
    name: "notes_list",
    description: "\u5217\u51FA\u7B14\u8BB0\u5143\u6570\u636E\uFF0C\u53EF\u6309\u76EE\u5F55\u8FC7\u6EE4\u3002",
    parameters: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "\u76EE\u5F55 id\uFF1B\u7701\u7565\u8868\u793A\u5168\u90E8\uFF0Croot \u8868\u793A\u6839\u76EE\u5F55" },
        limit: { type: "number", description: "\u6700\u591A\u8FD4\u56DE\u6761\u6570\uFF08\u9ED8\u8BA4 200\uFF09" }
      },
      additionalProperties: false
    },
    isConcurrencySafe: () => true,
    execute: async (args) => {
      const tree = host.tree();
      let notes = tree.notes;
      const folderId = optionalString(args, "folderId");
      if (folderId === "root") notes = notes.filter((note) => note.folderId === null);
      else if (folderId !== void 0) notes = notes.filter((note) => note.folderId === folderId);
      const limit = Math.min(500, Math.max(1, optionalNumber(args, "limit") ?? 200));
      return { notes: notes.slice(0, limit), folders: tree.folders };
    }
  }));
  register(tool({
    name: "notes_get",
    description: "\u6309 id \u8BFB\u53D6\u4E00\u6761\u7B14\u8BB0\u7684 Markdown \u6B63\u6587\u3001\u6807\u7B7E\u3001\u9644\u4EF6\u548C revision\u3002",
    parameters: { type: "object", properties: { id: ID_SCHEMA }, required: ["id"], additionalProperties: false },
    isConcurrencySafe: () => true,
    execute: async (args) => ({ note: await host.getNote(requiredString(args, "id")) })
  }));
  register(tool({
    name: "notes_search",
    description: "\u6309\u6807\u9898\u4E0E\u6B63\u6587\u641C\u7D22\u7B14\u8BB0\uFF0C\u8FD4\u56DE\u5339\u914D\u7247\u6BB5\u3002",
    parameters: {
      type: "object",
      properties: {
        q: { type: "string", description: "\u641C\u7D22\u8BCD\uFF1B\u7A7A\u5B57\u7B26\u4E32\u8FD4\u56DE\u6700\u8FD1\u7B14\u8BB0" },
        limit: { type: "number", description: "\u6700\u591A\u8FD4\u56DE\u6761\u6570\uFF08\u9ED8\u8BA4 50\uFF09" }
      },
      required: ["q"],
      additionalProperties: false
    },
    isConcurrencySafe: () => true,
    execute: async (args) => {
      const query = optionalString(args, "q") ?? "";
      return { results: host.search(query, Math.min(200, Math.max(1, optionalNumber(args, "limit") ?? 50))) };
    }
  }));
  register(tool({
    name: "notes_recent",
    description: "\u6700\u8FD1\u6253\u5F00\u6216\u66F4\u65B0\u7684\u7B14\u8BB0\u3002",
    parameters: { type: "object", properties: { limit: { type: "number" } }, additionalProperties: false },
    isConcurrencySafe: () => true,
    execute: async (args) => ({ notes: host.recent(Math.min(100, Math.max(1, optionalNumber(args, "limit") ?? 20))) })
  }));
  register(tool({
    name: "notes_stats",
    description: "\u5F53\u524D\u8D26\u53F7\u7684\u7B14\u8BB0\u3001\u76EE\u5F55\u3001\u9644\u4EF6\u3001\u5F85\u540C\u6B65\u4E0E\u51B2\u7A81\u6570\u91CF\u3002",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    deferLoading: true,
    isConcurrencySafe: () => true,
    execute: async () => host.stats()
  }));
  register(tool({
    name: "notes_create",
    description: "\u521B\u5EFA\u4E00\u6761 Markdown \u7B14\u8BB0\u3002",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        folderId: { type: ["string", "null"] },
        tags: { type: "array", items: { type: "string" } },
        pinned: { type: "boolean" },
        id: { type: "string", description: "\u53EF\u9009\uFF1A\u5BA2\u6237\u7AEF\u751F\u6210\u7684 id" }
      },
      additionalProperties: false
    },
    execute: async (args) => ({
      note: host.createNote({
        id: optionalString(args, "id"),
        title: optionalString(args, "title"),
        content: optionalString(args, "content"),
        folderId: optionalId(args, "folderId") ?? null,
        tags: stringArray(args, "tags"),
        pinned: optionalBoolean(args, "pinned")
      }),
      synced: false
    })
  }));
  register(tool({
    name: "notes_update",
    description: "\u66F4\u65B0\u7B14\u8BB0\u6807\u9898/\u6B63\u6587/\u6807\u7B7E/\u7F6E\u9876/\u76EE\u5F55\u3002\u66F4\u65B0\u5148\u5199\u672C\u5730\u7F13\u5B58\uFF0C\u518D\u5728\u540E\u53F0\u540C\u6B65\u5230\u670D\u52A1\u5668\u3002",
    parameters: {
      type: "object",
      properties: {
        id: NOTE_ID_SCHEMA,
        baseRevision: { type: "number", description: "\u8BFB\u53D6\u7B14\u8BB0\u65F6\u62FF\u5230\u7684 revision\uFF0C\u7528\u4E8E\u51B2\u7A81\u68C0\u6D4B" },
        title: { type: "string" },
        content: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        pinned: { type: "boolean" },
        folderId: { type: ["string", "null"] }
      },
      required: ["id"],
      additionalProperties: false
    },
    execute: async (args) => ({
      note: host.updateNote(requiredString(args, "id"), {
        baseRevision: optionalNumber(args, "baseRevision") ?? 0,
        title: optionalString(args, "title"),
        content: optionalString(args, "content"),
        tags: stringArray(args, "tags"),
        pinned: optionalBoolean(args, "pinned"),
        folderId: optionalId(args, "folderId")
      }),
      synced: false
    })
  }));
  register(tool({
    name: "notes_append",
    description: "\u5728\u7B14\u8BB0\u672B\u5C3E\u8FFD\u52A0 Markdown \u5185\u5BB9\u3002",
    parameters: {
      type: "object",
      properties: {
        id: NOTE_ID_SCHEMA,
        content: { type: "string" },
        separator: { type: "string", description: "\u9ED8\u8BA4\u4E24\u4E2A\u6362\u884C" }
      },
      required: ["id", "content"],
      additionalProperties: false
    },
    execute: async (args) => {
      const note = await host.getNote(requiredString(args, "id"));
      const separator = optionalString(args, "separator") ?? "\n\n";
      return { note: host.updateNote(note.id, { baseRevision: note.revision, content: `${note.content}${separator}${requiredString(args, "content")}` }), synced: false };
    }
  }));
  register(tool({
    name: "notes_replace",
    description: "\u5728\u7B14\u8BB0\u6B63\u6587\u4E2D\u66FF\u6362\u6587\u672C\uFF1B\u9ED8\u8BA4\u53EA\u66FF\u6362\u7B2C\u4E00\u5904\uFF0Call=true \u66FF\u6362\u5168\u90E8\u3002",
    parameters: {
      type: "object",
      properties: {
        id: NOTE_ID_SCHEMA,
        oldText: { type: "string" },
        newText: { type: "string" },
        all: { type: "boolean" }
      },
      required: ["id", "oldText", "newText"],
      additionalProperties: false
    },
    execute: async (args) => {
      const note = await host.getNote(requiredString(args, "id"));
      const oldText = requiredString(args, "oldText");
      if (!note.content.includes(oldText)) throw new Error("\u6B63\u6587\u4E2D\u627E\u4E0D\u5230 oldText");
      const content = optionalBoolean(args, "all") === true ? note.content.split(oldText).join(String(args.newText ?? "")) : note.content.replace(oldText, String(args.newText ?? ""));
      return { note: host.updateNote(note.id, { baseRevision: note.revision, content }), synced: false };
    }
  }));
  register(tool({
    name: "notes_move",
    description: "\u628A\u7B14\u8BB0\u79FB\u52A8\u5230\u6307\u5B9A\u76EE\u5F55\u3002",
    parameters: {
      type: "object",
      properties: { id: NOTE_ID_SCHEMA, folderId: { type: ["string", "null"] } },
      required: ["id", "folderId"],
      additionalProperties: false
    },
    execute: async (args) => ({
      note: host.moveNote(requiredString(args, "id"), optionalId(args, "folderId") ?? null, optionalNumber(args, "baseRevision") ?? 0),
      synced: false
    })
  }));
  register(tool({
    name: "notes_delete",
    description: "\u628A\u7B14\u8BB0\u79FB\u5165\u56DE\u6536\u7AD9\u3002",
    parameters: { type: "object", properties: { id: NOTE_ID_SCHEMA }, required: ["id"], additionalProperties: false },
    execute: async (args) => {
      await host.deleteNote(requiredString(args, "id"));
      return { deleted: true };
    }
  }));
  register(tool({
    name: "notes_restore",
    description: "\u4ECE\u56DE\u6536\u7AD9\u6062\u590D\u7B14\u8BB0\u3002",
    parameters: { type: "object", properties: { id: NOTE_ID_SCHEMA }, required: ["id"], additionalProperties: false },
    execute: async (args) => ({ note: await host.restoreNote(requiredString(args, "id")) })
  }));
  register(tool({
    name: "notes_history",
    description: "\u5217\u51FA\u4E00\u6761\u7B14\u8BB0\u7684\u5386\u53F2\u7248\u672C\u3002",
    parameters: { type: "object", properties: { id: NOTE_ID_SCHEMA }, required: ["id"], additionalProperties: false },
    deferLoading: true,
    isConcurrencySafe: () => true,
    execute: async (args) => ({ versions: await host.getVersions(requiredString(args, "id")) })
  }));
  register(tool({
    name: "notes_restore_version",
    description: "\u628A\u7B14\u8BB0\u6062\u590D\u5230\u6307\u5B9A\u5386\u53F2\u7248\u672C\uFF08\u751F\u6210\u65B0\u7684 revision\uFF09\u3002",
    parameters: {
      type: "object",
      properties: { id: NOTE_ID_SCHEMA, revision: { type: "number" } },
      required: ["id", "revision"],
      additionalProperties: false
    },
    deferLoading: true,
    execute: async (args) => ({ note: await host.revertNote(requiredString(args, "id"), Number(args.revision)) })
  }));
  register(tool({
    name: "notes_folders_create",
    description: "\u521B\u5EFA\u4E00\u4E2A\u7B14\u8BB0\u76EE\u5F55\u3002",
    parameters: {
      type: "object",
      properties: { name: { type: "string" }, parentId: { type: ["string", "null"] }, id: { type: "string" } },
      required: ["name"],
      additionalProperties: false
    },
    execute: async (args) => ({ folder: host.createFolder({
      id: optionalString(args, "id"),
      name: requiredString(args, "name"),
      parentId: optionalId(args, "parentId") ?? null
    }) })
  }));
  register(tool({
    name: "notes_folders_update",
    description: "\u91CD\u547D\u540D\u6216\u79FB\u52A8\u76EE\u5F55\u3002",
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" }, parentId: { type: ["string", "null"] } },
      required: ["id"],
      additionalProperties: false
    },
    execute: async (args) => ({ folder: host.updateFolder(requiredString(args, "id"), {
      baseRevision: optionalNumber(args, "baseRevision") ?? 0,
      name: optionalString(args, "name"),
      parentId: optionalId(args, "parentId")
    }) })
  }));
  register(tool({
    name: "notes_folders_delete",
    description: "\u5220\u9664\u76EE\u5F55\uFF1B\u9ED8\u8BA4\u628A\u7B14\u8BB0\u79FB\u5230\u7236\u76EE\u5F55\uFF0Crecursive=true \u65F6\u7B14\u8BB0\u4E00\u8D77\u79FB\u5165\u56DE\u6536\u7AD9\u3002",
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, recursive: { type: "boolean" } },
      required: ["id"],
      additionalProperties: false
    },
    execute: async (args) => {
      host.deleteFolder(requiredString(args, "id"), optionalBoolean(args, "recursive") === true);
      return { deleted: true };
    }
  }));
  register(tool({
    name: "notes_sync",
    description: "\u7ACB\u5373\u628A\u672C\u5730\u4FEE\u6539\u540C\u6B65\u5230\u7B14\u8BB0\u670D\u52A1\u5668\uFF0C\u5E76\u62C9\u53D6\u8FDC\u7AEF\u66F4\u65B0\u3002",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => {
      const state = await host.syncNow();
      return { configured: state.configured, sync: state.sync, counts: state.counts };
    }
  }));
  register(tool({
    name: "notes_sync_status",
    description: "\u67E5\u770B\u540C\u6B65\u72B6\u6001\u3001\u5F85\u540C\u6B65\u6570\u91CF\u4E0E\u51B2\u7A81\u3002",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    deferLoading: true,
    isConcurrencySafe: () => true,
    execute: async () => {
      const state = host.state();
      return { configured: state.configured, sync: state.sync, counts: state.counts, conflicts: state.conflicts };
    }
  }));
  register(tool({
    name: "attachments_list",
    description: "\u5217\u51FA\u67D0\u6761\u7B14\u8BB0\u7684\u9644\u4EF6\u3002",
    parameters: { type: "object", properties: { noteId: { type: "string" } }, required: ["noteId"], additionalProperties: false },
    deferLoading: true,
    isConcurrencySafe: () => true,
    execute: async (args) => ({ attachments: host.listAttachments(requiredString(args, "noteId")) })
  }));
  register(tool({
    name: "attachments_add",
    description: "\u4EE5 base64 \u4E0A\u4F20\u56FE\u7247\u6216\u97F3\u9891\u9644\u4EF6\u5230\u7B14\u8BB0\uFF0C\u5E76\u8FD4\u56DE\u53EF\u63D2\u5165\u6B63\u6587\u7684 Markdown \u94FE\u63A5\u3002",
    parameters: {
      type: "object",
      properties: {
        noteId: { type: "string" },
        filename: { type: "string" },
        mimeType: { type: "string" },
        base64: { type: "string", description: "\u6587\u4EF6\u5185\u5BB9\u7684 base64\uFF1B\u4E0A\u9650 20MB" }
      },
      required: ["noteId", "filename", "mimeType", "base64"],
      additionalProperties: false
    },
    deferLoading: true,
    execute: async (args) => host.uploadBase64(
      requiredString(args, "noteId"),
      requiredString(args, "filename"),
      requiredString(args, "mimeType"),
      requiredString(args, "base64")
    )
  }));
  register(tool({
    name: "attachments_delete",
    description: "\u6309\u9644\u4EF6 id \u5220\u9664\u9644\u4EF6\u3002",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    deferLoading: true,
    execute: async (args) => {
      await host.deleteAttachment(requiredString(args, "id"));
      return { deleted: true };
    }
  }));
  register(tool({
    name: "notes_daily",
    description: "\u83B7\u53D6\u6216\u521B\u5EFA\u4ECA\u5929\u7684\u65E5\u8BB0\u7B14\u8BB0\uFF08\u6807\u9898 YYYY-MM-DD\uFF09\u3002",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "\u53EF\u9009 YYYY-MM-DD" }, folderId: { type: ["string", "null"] } },
      additionalProperties: false
    },
    execute: async (args) => {
      const requested = optionalString(args, "date");
      const date = requested !== void 0 && /^\d{4}-\d{2}-\d{2}$/u.test(requested) ? requested : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const matches = host.search(date, 20).filter((result) => result.note.title === date);
      if (matches.length > 0) return { note: await host.getNote(matches[0].note.id), created: false };
      return { note: host.createNote({ title: date, content: `# ${date}

`, folderId: optionalId(args, "folderId") ?? null }), created: true };
    }
  }));
  register(tool({
    name: "notes_export_markdown",
    description: "\u8FD4\u56DE\u5305\u542B\u6807\u9898\u3001\u6B63\u6587\u3001\u6807\u7B7E\u548C\u9644\u4EF6\u94FE\u63A5\u7684 Markdown \u6587\u672C\u3002",
    parameters: { type: "object", properties: { id: NOTE_ID_SCHEMA }, required: ["id"], additionalProperties: false },
    deferLoading: true,
    isConcurrencySafe: () => true,
    execute: async (args) => {
      const note = await host.getNote(requiredString(args, "id"));
      const attachments = host.listAttachments(note.id);
      return { markdown: exportMarkdown(note, attachments.map((attachment) => `- [${attachment.filename}](api/attachments/${attachment.id})`)) };
    }
  }));
}
function treeMarkdown(folders, notes) {
  const lines = ["# \u7B14\u8BB0\u76EE\u5F55", ""];
  const children = /* @__PURE__ */ new Map();
  for (const folder of folders) {
    const list = children.get(folder.parentId) ?? [];
    list.push(folder);
    children.set(folder.parentId, list);
  }
  const notesByFolder = /* @__PURE__ */ new Map();
  for (const note of notes) {
    const list = notesByFolder.get(note.folderId) ?? [];
    list.push(note);
    notesByFolder.set(note.folderId, list);
  }
  const walk = (parentId, depth) => {
    const indent = "  ".repeat(depth);
    for (const folder of children.get(parentId) ?? []) {
      lines.push(`${indent}- \u{1F4C1} ${folder.name} (${folder.id})`);
      for (const note of notesByFolder.get(folder.id) ?? []) lines.push(`${indent}  - ${note.title || "\u672A\u547D\u540D\u7B14\u8BB0"} (${note.id})`);
      walk(folder.id, depth + 1);
    }
    if (parentId === null) {
      for (const note of notesByFolder.get(null) ?? []) lines.push(`- ${note.title || "\u672A\u547D\u540D\u7B14\u8BB0"} (${note.id})`);
    }
  };
  walk(null, 0);
  if (lines.length === 2) lines.push("\uFF08\u8FD8\u6CA1\u6709\u7B14\u8BB0\uFF09");
  return lines.join("\n");
}
function exportMarkdown(note, attachmentLines) {
  const tags = note.tags.length > 0 ? `

\u6807\u7B7E: ${note.tags.map((tag) => `#${tag}`).join(" ")}` : "";
  const attachments = attachmentLines.length > 0 ? `

## \u9644\u4EF6

${attachmentLines.join("\n")}` : "";
  return `# ${note.title}

${note.content}${tags}${attachments}
`;
}

// src/host/index.ts
var VERSION = true ? "0.1.0" : "0.1.0";
var name = "dsh-notes";
var inject = ["tools"];
var fallbackLogger = {
  info: (...args) => console.info("[dsh-notes]", ...args),
  warn: (...args) => console.warn("[dsh-notes]", ...args),
  error: (...args) => console.error("[dsh-notes]", ...args),
  debug: (...args) => console.debug("[dsh-notes]", ...args)
};
function apply(ctx, config) {
  const logger = ctx.logger !== void 0 && typeof ctx.logger.info === "function" ? ctx.logger : fallbackLogger;
  const host = new NotesHost({ config, logger, version: VERSION });
  ctx.effect(() => () => {
    void host.dispose();
  }, "dsh-notes: dispose");
  registerNotesTools(ctx, host);
  ctx.inject(["webServer", "connection"], (child) => {
    child.effect(() => registerHostRoutes({
      host,
      webServer: child.webServer,
      connectionOf: () => {
        try {
          return child.connection;
        } catch {
          return null;
        }
      },
      logger
    }), "dsh-notes: routes");
  });
  logger.info(`notes host ready (${host.shortLabel()})`);
}
export {
  apply,
  inject,
  name
};
