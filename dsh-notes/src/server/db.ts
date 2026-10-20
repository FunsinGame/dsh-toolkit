/**
 * SQLite schema and connection setup for the notes server.
 *
 * node:sqlite is synchronous, which keeps the service code straightforward and
 * serializes mutations naturally in one process. WAL plus a busy timeout lets
 * the CLI (user/token/backup) share the database with a running server.
 */

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ensurePrivateDirSync, hardenFileSync } from './platform.ts'

export type NotesDatabase = DatabaseSync

export const SCHEMA_VERSION = 1

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  password_changed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  idle_expires_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS access_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS access_tokens_user ON access_tokens(user_id);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS folders_owner ON folders(owner_id);
CREATE INDEX IF NOT EXISTS folders_parent ON folders(owner_id, parent_id);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  folder_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT,
  updated_by TEXT,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS notes_owner_updated ON notes(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS notes_owner_folder ON notes(owner_id, folder_id);
CREATE INDEX IF NOT EXISTS notes_owner_deleted ON notes(owner_id, deleted_at);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (note_id, tag)
);
CREATE INDEX IF NOT EXISTS note_tags_tag ON note_tags(tag);

CREATE TABLE IF NOT EXISTS note_versions (
  note_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (note_id, revision)
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS attachments_note ON attachments(note_id);
CREATE INDEX IF NOT EXISTS attachments_owner ON attachments(owner_id);

CREATE TABLE IF NOT EXISTS changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  revision INTEGER,
  data TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS changes_user_seq ON changes(user_id, seq);

CREATE TABLE IF NOT EXISTS operations (
  op_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS operations_user ON operations(user_id);
`

export function openDatabase(dataDir: string): NotesDatabase {
  ensurePrivateDirSync(dataDir)
  const file = join(dataDir, 'notes.db')
  const db = new DatabaseSync(file)
  hardenFileSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('PRAGMA temp_store = MEMORY')
  db.exec(SCHEMA)
  if (metaGet(db, 'schemaVersion') === null) metaSet(db, 'schemaVersion', String(SCHEMA_VERSION))
  if (metaGet(db, 'serverId') === null) metaSet(db, 'serverId', randomUUID())
  hardenFileSync(`${file}-wal`)
  hardenFileSync(`${file}-shm`)
  return db
}

export function metaGet(db: NotesDatabase, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value?: string } | undefined
  return typeof row?.value === 'string' ? row.value : null
}

export function metaSet(db: NotesDatabase, key: string, value: string): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

export function serverId(db: NotesDatabase): string {
  return metaGet(db, 'serverId') ?? 'unknown'
}

export function checkpoint(db: NotesDatabase): void {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  } catch {
    /* A concurrent reader may keep the WAL; the backup still sees a consistent view. */
  }
}

export function closeDatabase(db: NotesDatabase): void {
  try {
    checkpoint(db)
  } catch {
    /* Ignore. */
  }
  try {
    db.close()
  } catch {
    /* Ignore double close. */
  }
}
