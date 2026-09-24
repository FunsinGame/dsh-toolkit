/**
 * SQLite storage for the catalogue.
 *
 * Uses Node's built-in `node:sqlite` (SQLite 3.53 with FTS5 compiled in), which
 * avoids a native build step entirely — important because the project must run
 * from a plain `npm install` on Windows, macOS and Linux.
 *
 * Two things to know about the schema:
 *  - `assets_fts` is an external-content FTS5 table over `assets.searchText`.
 *    The search text is pre-expanded (camelCase split + CJK bigrams) by
 *    `@sounddesk/core`, so SQLite only ever sees whitespace-delimited tokens.
 *  - Embeddings live in their own table as raw Float32 blobs. At the target
 *    scale (tens of thousands of files) a linear scan is fast enough, and it
 *    keeps the dependency surface at zero. `VectorStore` wraps that decision so
 *    it can be swapped for an ANN index later.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import type { UsageEvent, UsageKind } from '@sounddesk/core';

/** Kinds we accept into the usage log; anything else is a bug in a caller. */
const USAGE_KINDS: ReadonlySet<string> = new Set<UsageKind>(['play', 'select', 'export', 'download']);

const SCHEMA_VERSION = 1;

const INIT_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS libraries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  root        TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL DEFAULT 'local',
  coverPath   TEXT,
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  libraryId     INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  path          TEXT NOT NULL UNIQUE,
  dir           TEXT NOT NULL,
  filename      TEXT NOT NULL,
  extension     TEXT NOT NULL,
  sizeBytes     INTEGER NOT NULL,
  mtimeMs       INTEGER NOT NULL,
  contentHash   TEXT,

  durationMs    INTEGER,
  sampleRate    INTEGER,
  bitDepth      INTEGER,
  channels      INTEGER,
  codec         TEXT,
  audioFormatTag INTEGER,
  isFloat       INTEGER,

  emDescription TEXT,
  emKeywords    TEXT,
  emDesigner    TEXT,
  emRecorder    TEXT,
  emCopyright   TEXT,
  emLibrary     TEXT,
  emOriginator  TEXT,
  emOriginationDate TEXT,
  emProject     TEXT,
  emScene       TEXT,
  emTake        TEXT,
  emNote        TEXT,
  emIxml        TEXT,
  emInfo        TEXT,
  emCodingHistory TEXT,
  hasBext       INTEGER NOT NULL DEFAULT 0,
  chunks        TEXT,

  dspPeakDb     REAL,
  dspRmsDb      REAL,
  dspDecayMs    REAL,
  dspCentroidHz REAL,
  dspHfRatio    REAL,
  dspStereoCorr REAL,
  dspHasVoice   INTEGER,
  dspTonality   REAL,

  ucsCatId      TEXT,
  ucsConfidence REAL,
  ucsSource     TEXT,
  ucsAlternatives TEXT,

  tags          TEXT NOT NULL DEFAULT '[]',
  favorite      INTEGER NOT NULL DEFAULT 0,
  rating        INTEGER NOT NULL DEFAULT 0,

  stage         INTEGER NOT NULL DEFAULT 0,
  hasPeaks      INTEGER NOT NULL DEFAULT 0,
  peaksPath     TEXT,
  lastError     TEXT,

  -- pre-expanded text for FTS (camelCase split + CJK bigrams)
  searchText    TEXT NOT NULL DEFAULT '',

  createdAt     INTEGER NOT NULL,
  updatedAt     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_library   ON assets(libraryId);
CREATE INDEX IF NOT EXISTS idx_assets_stage     ON assets(stage);
CREATE INDEX IF NOT EXISTS idx_assets_ucs       ON assets(ucsCatId);
CREATE INDEX IF NOT EXISTS idx_assets_dir       ON assets(dir);
CREATE INDEX IF NOT EXISTS idx_assets_hash      ON assets(contentHash);

CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(
  searchText,
  content='assets',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

-- keep the FTS index in sync with the content table
CREATE TRIGGER IF NOT EXISTS assets_ai AFTER INSERT ON assets BEGIN
  INSERT INTO assets_fts(rowid, searchText) VALUES (new.id, new.searchText);
END;
CREATE TRIGGER IF NOT EXISTS assets_ad AFTER DELETE ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, searchText) VALUES ('delete', old.id, old.searchText);
END;
CREATE TRIGGER IF NOT EXISTS assets_au AFTER UPDATE OF searchText ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, searchText) VALUES ('delete', old.id, old.searchText);
  INSERT INTO assets_fts(rowid, searchText) VALUES (new.id, new.searchText);
END;

CREATE TABLE IF NOT EXISTS embeddings (
  assetId   INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  model     TEXT NOT NULL,
  dim       INTEGER NOT NULL,
  mean      BLOB NOT NULL,
  onset     BLOB,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  libraryId  INTEGER,
  state      TEXT NOT NULL,
  total      INTEGER NOT NULL DEFAULT 0,
  done       INTEGER NOT NULL DEFAULT 0,
  failed     INTEGER NOT NULL DEFAULT 0,
  startedAt  INTEGER NOT NULL,
  updatedAt  INTEGER NOT NULL,
  etaMs      INTEGER,
  currentPath TEXT,
  error      TEXT
);

CREATE TABLE IF NOT EXISTS ucs_categories (
  catId       TEXT PRIMARY KEY,
  category    TEXT NOT NULL,
  subCategory TEXT NOT NULL,
  synonymsEn  TEXT,
  synonymsZh  TEXT,
  excludes    TEXT
);
CREATE INDEX IF NOT EXISTS idx_ucs_category ON ucs_categories(category);

CREATE TABLE IF NOT EXISTS query_dictionary (
  term TEXT NOT NULL,
  lang TEXT NOT NULL,
  en   TEXT NOT NULL,
  PRIMARY KEY (term, lang)
);

CREATE TABLE IF NOT EXISTS tags (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  color     TEXT,
  useCount  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS feedback (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  assetId  INTEGER NOT NULL,
  oldCat   TEXT,
  newCat   TEXT,
  at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS search_history (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  query  TEXT NOT NULL,
  mode   TEXT NOT NULL,
  hits   INTEGER NOT NULL,
  at     INTEGER NOT NULL
);

-- Raw usage events, the only input to personalised ranking (plan P2-3).
--
-- Kept as events rather than a running score: the weight is then a pure function
-- that can be recomputed when the formula changes, explained per result, and
-- discarded by simply not reading the table. A stored score could do none of
-- those. The query column is nullable for context-free actions such as a download.
CREATE TABLE IF NOT EXISTS usage_events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  assetId INTEGER NOT NULL,
  query   TEXT,
  kind    TEXT NOT NULL,
  at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_asset ON usage_events(assetId);
CREATE INDEX IF NOT EXISTS idx_usage_at ON usage_events(at);

CREATE TABLE IF NOT EXISTS playlists (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  -- added after the first release, so existing databases need the migration in
  -- Catalog.migrate(); CREATE TABLE IF NOT EXISTS will not alter a live table
  updatedAt INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS playlist_items (
  playlistId INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  assetId    INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (playlistId, assetId)
);
`;

export interface OpenOptions {
  /** directory that holds catalog.db and the peak cache */
  dataDir: string;
}

export class Catalog {
  readonly db: DatabaseSync;
  readonly dataDir: string;

  private constructor(db: DatabaseSync, dataDir: string) {
    this.db = db;
    this.dataDir = dataDir;
  }

  static open(opts: OpenOptions): Catalog {
    mkdirSync(opts.dataDir, { recursive: true });
    const file = path.join(opts.dataDir, 'catalog.db');
    const db = new DatabaseSync(file);
    db.exec(INIT_SQL);
    const catalog = new Catalog(db, opts.dataDir);
    catalog.migrate();
    catalog.setMeta('schemaVersion', String(SCHEMA_VERSION));
    return catalog;
  }

  static openMemory(): Catalog {
    const db = new DatabaseSync(':memory:');
    db.exec(INIT_SQL);
    const catalog = new Catalog(db, ':memory:');
    catalog.migrate();
    return catalog;
  }

  /**
   * Bring an existing database up to the current shape.
   *
   * `INIT_SQL` is all `CREATE TABLE IF NOT EXISTS`, so it silently does nothing to
   * a table that already exists — adding a column to the schema above is not
   * enough for anyone who already has a catalogue. Every step here must therefore
   * be idempotent and safe to run on every open.
   */
  private migrate(): void {
    // playlists.updatedAt (P1-3). ALTER TABLE ADD COLUMN throws if the column is
    // already there, so check first.
    const columns = this.db.prepare('PRAGMA table_info(playlists)').all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'updatedAt')) {
      this.db.exec('ALTER TABLE playlists ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT 0');
      // Backfill from createdAt so an old playlist does not claim to be from 1970.
      this.db.exec('UPDATE playlists SET updatedAt = createdAt WHERE updatedAt = 0');
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      /* already closed */
    }
  }

  // -- meta --------------------------------------------------------------

  setMeta(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  }

  // -- libraries ---------------------------------------------------------

  addLibrary(name: string, root: string, kind: 'local' | 'nas' | 'probe' = 'local'): number {
    const now = Date.now();
    const normalized = path.resolve(root);
    const existing = this.db.prepare('SELECT id FROM libraries WHERE root = ?').get(normalized) as { id: number } | undefined;
    if (existing) return existing.id;
    const info = this.db
      .prepare('INSERT INTO libraries(name, root, kind, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
      .run(name, normalized, kind, now, now);
    return Number(info.lastInsertRowid);
  }

  listLibraries(): Array<{ id: number; name: string; root: string; kind: string; coverPath: string | null; createdAt: number; assetCount: number }> {
    return this.db
      .prepare(
        `SELECT l.id, l.name, l.root, l.kind, l.coverPath, l.createdAt,
                (SELECT COUNT(*) FROM assets a WHERE a.libraryId = l.id) AS assetCount
         FROM libraries l ORDER BY l.name`,
      )
      .all() as never;
  }

  getLibrary(id: number): { id: number; name: string; root: string; kind: string } | null {
    const row = this.db.prepare('SELECT id, name, root, kind FROM libraries WHERE id = ?').get(id) as
      | { id: number; name: string; root: string; kind: string }
      | undefined;
    return row ?? null;
  }

  removeLibrary(id: number): void {
    // Cascades to assets, embeddings, playlist items. Never touches the files.
    this.db.prepare('DELETE FROM libraries WHERE id = ?').run(id);
  }

  // -- assets ------------------------------------------------------------

  upsertAsset(input: AssetUpsert): { id: number; inserted: boolean } {
    const now = Date.now();
    const existing = this.db.prepare('SELECT id FROM assets WHERE path = ?').get(input.path) as { id: number } | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE assets SET
             libraryId = ?, dir = ?, filename = ?, extension = ?, sizeBytes = ?, mtimeMs = ?,
             searchText = ?, updatedAt = ?
           WHERE id = ?`,
        )
        .run(
          input.libraryId,
          input.dir,
          input.filename,
          input.extension,
          input.sizeBytes,
          input.mtimeMs,
          input.searchText,
          now,
          existing.id,
        );
      return { id: existing.id, inserted: false };
    }

    const info = this.db
      .prepare(
        `INSERT INTO assets(libraryId, path, dir, filename, extension, sizeBytes, mtimeMs, searchText, createdAt, updatedAt, stage)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(
        input.libraryId,
        input.path,
        input.dir,
        input.filename,
        input.extension,
        input.sizeBytes,
        input.mtimeMs,
        input.searchText,
        now,
        now,
      );
    return { id: Number(info.lastInsertRowid), inserted: true };
  }

  /**
   * Apply the results of the FAST metadata stage.
   * `onlyIfChanged` skips the write when size+mtime already match.
   */
  applyMetadata(assetId: number, m: MetadataUpdate): void {
    this.db
      .prepare(
        `UPDATE assets SET
           durationMs = ?, sampleRate = ?, bitDepth = ?, channels = ?, codec = ?,
           audioFormatTag = ?, isFloat = ?, contentHash = ?,
           emDescription = ?, emKeywords = ?, emDesigner = ?, emRecorder = ?, emCopyright = ?,
           emLibrary = ?, emOriginator = ?, emOriginationDate = ?, emProject = ?, emScene = ?,
           emTake = ?, emNote = ?, emIxml = ?, emInfo = ?, emCodingHistory = ?, hasBext = ?, chunks = ?,
           searchText = ?, stage = MAX(stage, 1), lastError = ?, updatedAt = ?
         WHERE id = ?`,
      )
      .run(
        m.durationMs,
        m.sampleRate,
        m.bitDepth,
        m.channels,
        m.codec,
        m.audioFormatTag,
        m.isFloat ? 1 : 0,
        m.contentHash,
        m.emDescription,
        m.emKeywords,
        m.emDesigner,
        m.emRecorder,
        m.emCopyright,
        m.emLibrary,
        m.emOriginator,
        m.emOriginationDate,
        m.emProject,
        m.emScene,
        m.emTake,
        m.emNote,
        m.emIxml,
        m.emInfo,
        m.emCodingHistory,
        m.hasBext ? 1 : 0,
        m.chunks,
        m.searchText,
        m.lastError,
        Date.now(),
        assetId,
      );
  }

  applyDsp(assetId: number, d: DspUpdate): void {
    this.db
      .prepare(
        `UPDATE assets SET
           dspPeakDb = ?, dspRmsDb = ?, dspDecayMs = ?, dspCentroidHz = ?,
           dspHfRatio = ?, dspStereoCorr = ?, dspHasVoice = ?, dspTonality = ?,
           updatedAt = ?
         WHERE id = ?`,
      )
      .run(
        d.peakDb,
        d.rmsDb,
        d.decayMs,
        d.centroidHz,
        d.hfRatio,
        d.stereoCorr,
        d.hasVoice ? 1 : 0,
        d.tonality,
        Date.now(),
        assetId,
      );
  }

  /** Record that the waveform stage has been attempted for this asset. */
  markPeaks(assetId: number, peaksPath: string | null): void {
    this.db
      .prepare('UPDATE assets SET hasPeaks = ?, peaksPath = ?, stage = MAX(stage, 2), updatedAt = ? WHERE id = ?')
      .run(peaksPath ? 1 : 0, peaksPath, Date.now(), assetId);
  }

  applyClassification(assetId: number, c: ClassificationUpdate): void {
    const current = this.db.prepare('SELECT ucsSource FROM assets WHERE id = ?').get(assetId) as
      | { ucsSource: string | null }
      | undefined;
    // A manual correction is never overwritten by the automatic pipeline.
    if (current?.ucsSource === 'manual' && c.source !== 'manual') return;

    // Deliberately does NOT touch `stage`: classification happens during the
    // metadata pass, and advancing the stage here would make the later waveform
    // and embedding passes think their work was already done.
    this.db
      .prepare(
        `UPDATE assets SET ucsCatId = ?, ucsConfidence = ?, ucsSource = ?, ucsAlternatives = ?,
           updatedAt = ? WHERE id = ?`,
      )
      .run(c.catId, c.confidence, c.source, JSON.stringify(c.alternatives ?? []), Date.now(), assetId);
  }

  setStage(assetId: number, stage: number): void {
    this.db.prepare('UPDATE assets SET stage = MAX(stage, ?), updatedAt = ? WHERE id = ?').run(stage, Date.now(), assetId);
  }

  setError(assetId: number, message: string | null): void {
    this.db.prepare('UPDATE assets SET lastError = ?, updatedAt = ? WHERE id = ?').run(message, Date.now(), assetId);
  }

  setTags(assetId: number, tags: string[]): void {
    this.db.prepare('UPDATE assets SET tags = ?, updatedAt = ? WHERE id = ?').run(JSON.stringify(tags), Date.now(), assetId);
    for (const tag of tags) {
      this.db
        .prepare('INSERT INTO tags(name, useCount) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET useCount = useCount + 1')
        .run(tag);
    }
  }

  setFavorite(assetId: number, favorite: boolean): void {
    this.db.prepare('UPDATE assets SET favorite = ?, updatedAt = ? WHERE id = ?').run(favorite ? 1 : 0, Date.now(), assetId);
  }

  setRating(assetId: number, rating: number): void {
    this.db.prepare('UPDATE assets SET rating = ?, updatedAt = ? WHERE id = ?').run(rating, Date.now(), assetId);
  }

  getAssetRow(id: number): Record<string, unknown> | null {
    const row = this.db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ?? null;
  }

  getAssetPath(id: number): string | null {
    const row = this.db.prepare('SELECT path FROM assets WHERE id = ?').get(id) as { path: string } | undefined;
    return row?.path ?? null;
  }

  getAssetByPath(p: string): number | null {
    const row = this.db.prepare('SELECT id FROM assets WHERE path = ?').get(p) as { id: number } | undefined;
    return row?.id ?? null;
  }

  deleteAsset(id: number): void {
    this.db.prepare('DELETE FROM assets WHERE id = ?').run(id);
  }

  listAssetPaths(libraryId: number): Map<string, { id: number; sizeBytes: number; mtimeMs: number }> {
    const rows = this.db
      .prepare('SELECT id, path, sizeBytes, mtimeMs FROM assets WHERE libraryId = ?')
      .all(libraryId) as Array<{ id: number; path: string; sizeBytes: number; mtimeMs: number }>;
    const map = new Map<string, { id: number; sizeBytes: number; mtimeMs: number }>();
    for (const r of rows) map.set(r.path, { id: r.id, sizeBytes: r.sizeBytes, mtimeMs: r.mtimeMs });
    return map;
  }

  /**
   * Assets whose index has not reached `stage` yet, oldest-first, for resumable
   * backfill. The stage ladder is monotonic: 1 = metadata, 2 = peaks,
   * 3 = embedding, 4 = fully enriched. Classification deliberately does not
   * advance it, so a file classified during stage 1 still shows up as pending
   * waveform and embedding work.
   */
  findPending(stage: number, limit: number, libraryId?: number): Array<{ id: number; path: string; filename: string }> {
    const where = libraryId ? 'AND libraryId = ?' : '';
    const params: Array<number> = libraryId ? [stage, libraryId, limit] : [stage, limit];
    return this.db
      .prepare(`SELECT id, path, filename FROM assets WHERE stage < ? ${where} ORDER BY updatedAt ASC LIMIT ?`)
      .all(...params) as never;
  }

  countAssets(libraryId?: number): number {
    const row = libraryId
      ? (this.db.prepare('SELECT COUNT(*) AS n FROM assets WHERE libraryId = ?').get(libraryId) as { n: number })
      : (this.db.prepare('SELECT COUNT(*) AS n FROM assets').get() as { n: number });
    return row.n;
  }

  stats(): {
    assets: number;
    libraries: number;
    embedded: number;
    peaks: number;
    totalBytes: number;
    byStage: Record<string, number>;
    byCategory: Array<{ category: string; count: number }>;
  } {
    const assets = this.countAssets();
    const libraries = (this.db.prepare('SELECT COUNT(*) AS n FROM libraries').get() as { n: number }).n;
    const embedded = (this.db.prepare('SELECT COUNT(*) AS n FROM embeddings').get() as { n: number }).n;
    const peaks = (this.db.prepare('SELECT COUNT(*) AS n FROM assets WHERE hasPeaks = 1').get() as { n: number }).n;
    const totalBytes = (this.db.prepare('SELECT COALESCE(SUM(sizeBytes), 0) AS n FROM assets').get() as { n: number }).n;
    const stageRows = this.db.prepare('SELECT stage, COUNT(*) AS n FROM assets GROUP BY stage').all() as Array<{
      stage: number;
      n: number;
    }>;
    const byStage: Record<string, number> = {};
    for (const r of stageRows) byStage[String(r.stage)] = r.n;
    const byCategory = this.db
      .prepare(
        `SELECT COALESCE(category, '(未分类)') AS category, COUNT(*) AS count
         FROM assets a LEFT JOIN ucs_categories c ON c.catId = a.ucsCatId
         GROUP BY 1 ORDER BY count DESC`,
      )
      .all() as Array<{ category: string; count: number }>;
    return { assets, libraries, embedded, peaks, totalBytes, byStage, byCategory };
  }

  // -- jobs --------------------------------------------------------------

  saveJob(job: JobRecord): void {
    this.db
      .prepare(
        `INSERT INTO jobs(id, kind, libraryId, state, total, done, failed, startedAt, updatedAt, etaMs, currentPath, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           state = excluded.state, total = excluded.total, done = excluded.done, failed = excluded.failed,
           updatedAt = excluded.updatedAt, etaMs = excluded.etaMs, currentPath = excluded.currentPath, error = excluded.error`,
      )
      .run(
        job.id,
        job.kind,
        job.libraryId,
        job.state,
        job.total,
        job.done,
        job.failed,
        job.startedAt,
        job.updatedAt,
        job.etaMs,
        job.currentPath,
        job.error,
      );
  }

  listJobs(): JobRecord[] {
    return this.db.prepare('SELECT * FROM jobs ORDER BY startedAt DESC LIMIT 50').all() as never;
  }

  // -- search helpers ----------------------------------------------------

  /** Raw FTS query. Returns ids best-first with the bm25 score (lower = better). */
  ftsSearch(match: string, limit: number, allowedIds?: Set<number>): Array<{ id: number; score: number }> {
    const rows = this.db
      .prepare('SELECT rowid AS id, bm25(assets_fts) AS score FROM assets_fts WHERE assets_fts MATCH ? ORDER BY score LIMIT ?')
      .all(match, limit) as Array<{ id: number; score: number }>;
    if (!allowedIds) return rows;
    return rows.filter((r) => allowedIds.has(r.id));
  }

  /** All embeddings as a flat map — used by the vector retriever. */
  loadEmbeddings(field: 'mean' | 'onset'): Map<number, Float32Array> {
    const col = field === 'mean' ? 'mean' : 'COALESCE(onset, mean)';
    const rows = this.db.prepare(`SELECT assetId, dim, ${col} AS vec FROM embeddings`).all() as Array<{
      assetId: number;
      dim: number;
      vec: Uint8Array;
    }>;
    const out = new Map<number, Float32Array>();
    for (const r of rows) {
      out.set(r.assetId, new Float32Array(r.vec.buffer, r.vec.byteOffset, r.dim));
    }
    return out;
  }

  putEmbedding(assetId: number, model: string, dim: number, mean: Float32Array, onset: Float32Array | null): void {
    this.db
      .prepare(
        `INSERT INTO embeddings(assetId, model, dim, mean, onset, updatedAt) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(assetId) DO UPDATE SET model = excluded.model, dim = excluded.dim,
           mean = excluded.mean, onset = excluded.onset, updatedAt = excluded.updatedAt`,
      )
      .run(assetId, model, dim, toBlob(mean), onset ? toBlob(onset) : null, Date.now());
    this.db.prepare('UPDATE assets SET stage = MAX(stage, 3), updatedAt = ? WHERE id = ?').run(Date.now(), assetId);
  }

  countEmbeddings(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM embeddings').get() as { n: number }).n;
  }

  addSearchHistory(query: string, mode: string, hits: number): void {
    this.db.prepare('INSERT INTO search_history(query, mode, hits, at) VALUES (?, ?, ?, ?)').run(query, mode, hits, Date.now());
  }

  // -- usage events (personalised ranking) ---------------------------------

  /**
   * Record one usage event.
   *
   * Ignored silently when the asset does not exist: a stale click after a rescan
   * must not break playback, and the event would be meaningless anyway.
   */
  recordUsage(assetId: number, kind: UsageKind | string, query: string | null): void {
    if (!USAGE_KINDS.has(kind)) return;
    const exists = this.db.prepare('SELECT 1 AS ok FROM assets WHERE id = ?').get(assetId);
    if (!exists) return;
    this.db
      .prepare('INSERT INTO usage_events(assetId, query, kind, at) VALUES (?, ?, ?, ?)')
      .run(assetId, query && query.trim().length > 0 ? query.trim() : null, kind, Date.now());
  }

  /**
   * Recent usage events, newest first, capped.
   *
   * The cap is a deliberate bound on how far back a preference is remembered: an
   * unbounded history would let a sound chosen months ago keep a permanent nudge,
   * which is not what "learn what you reach for" should mean.
   */
  recentUsage(limit = 5000): UsageEvent[] {
    const rows = this.db
      .prepare('SELECT assetId, query, kind, at FROM usage_events ORDER BY at DESC LIMIT ?')
      .all(limit) as Array<{ assetId: number; query: string | null; kind: string; at: number }>;
    // Rows written by an older build could hold an unknown kind; drop those rather
    // than let a stray string reach the weighting maths.
    return rows
      .filter((row) => USAGE_KINDS.has(row.kind))
      .map((row) => ({ assetId: row.assetId, query: row.query, kind: row.kind as UsageKind, at: row.at }));
  }

  countUsageEvents(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM usage_events').get() as { n: number }).n;
  }

  countUsageAssets(): number {
    return (this.db.prepare('SELECT COUNT(DISTINCT assetId) AS n FROM usage_events').get() as { n: number }).n;
  }

  /** Forget everything learned. The events are the only input, so this is complete. */
  clearUsage(): number {
    const before = this.countUsageEvents();
    this.db.prepare('DELETE FROM usage_events').run();
    return before;
  }

  /**
   * Is personalised ranking switched on?
   *
   * Read from the catalogue rather than captured in a dependency so the toggle
   * takes effect on the next search without rebuilding the engine.
   */
  personalizationEnabled(): boolean {
    return this.getMeta('personalization') === 'on';
  }

  setPersonalizationEnabled(enabled: boolean): void {
    this.setMeta('personalization', enabled ? 'on' : 'off');
  }

  // -- sidecar backup / import (plan P1-3) ---------------------------------

  /** Recent search history for a backup. */
  recentSearches(limit = 5000): Array<{ query: string; mode: string; hits: number; at: number }> {
    return this.db
      .prepare('SELECT query, mode, hits, at FROM search_history ORDER BY at DESC LIMIT ?')
      .all(limit) as Array<{ query: string; mode: string; hits: number; at: number }>;
  }

  /**
   * The asset fields a backup needs, in one query.
   *
   * Deliberately a narrow projection rather than `SELECT *`: a backup touches
   * seven columns, and the wide asset row carries metadata blobs and DSP features
   * that would be read into memory for no reason.
   */
  listAssetsForSidecar(libraryId?: number): Array<{
    id: number;
    libraryId: number;
    path: string;
    filename: string;
    sizeBytes: number;
    contentHash: string | null;
    tags: string[];
    favorite: boolean;
    rating: number;
    ucsCatId: string | null;
    ucsSource: string | null;
  }> {
    const sql =
      `SELECT id, libraryId, path, filename, sizeBytes, contentHash, tags, favorite, rating, ucsCatId, ucsSource
       FROM assets` + (libraryId !== undefined ? ' WHERE libraryId = ?' : '');
    const rows = (libraryId !== undefined
      ? this.db.prepare(sql).all(libraryId)
      : this.db.prepare(sql).all()) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: Number(row.id),
      libraryId: Number(row.libraryId),
      path: String(row.path ?? ''),
      filename: String(row.filename ?? ''),
      sizeBytes: Number(row.sizeBytes) || 0,
      contentHash: typeof row.contentHash === 'string' ? row.contentHash : null,
      tags: parseJsonArray(row.tags),
      favorite: row.favorite === 1,
      rating: Number(row.rating) || 0,
      ucsCatId: typeof row.ucsCatId === 'string' ? row.ucsCatId : null,
      ucsSource: typeof row.ucsSource === 'string' ? row.ucsSource : null,
    }));
  }

  /**
   * Read playlists with their items resolved to the identifiers a backup stores.
   *
   * Exists as a catalogue method so the backup module does not have to know about
   * SQL — reachable playlists are the catalogue's business.
   */
  listPlaylistsWithItems(): Array<{ name: string; assetIds: number[] }> {
    const rows = this.db
      .prepare(
        `SELECT p.name AS name, p.id AS playlistId, i.assetId AS assetId
         FROM playlists p
         LEFT JOIN playlist_items i ON i.playlistId = p.id
         ORDER BY p.name COLLATE NOCASE, i.position, i.assetId`,
      )
      .all() as Array<{ name: string; playlistId: number; assetId: number | null }>;

    const grouped = new Map<number, { name: string; assetIds: number[] }>();
    for (const row of rows) {
      let entry = grouped.get(row.playlistId);
      if (!entry) {
        entry = { name: row.name, assetIds: [] };
        grouped.set(row.playlistId, entry);
      }
      if (row.assetId !== null) entry.assetIds.push(row.assetId);
    }
    return [...grouped.values()];
  }

  /** Id of a playlist with this name, or null. Names are compared case-insensitively. */
  findPlaylistByName(name: string): number | null {
    const row = this.db
      .prepare('SELECT id FROM playlists WHERE name = ? COLLATE NOCASE')
      .get(name) as { id: number } | undefined;
    return row ? row.id : null;
  }

  /** Create a playlist and return its id. */
  createPlaylist(name: string): number {
    const now = Date.now();
    const info = this.db
      .prepare('INSERT INTO playlists(name, createdAt, updatedAt) VALUES (?, ?, ?)')
      .run(name, now, now);
    return Number(info.lastInsertRowid);
  }

  /**
   * Every asset expressed as the identifiers a backup uses.
   *
   * Lives here rather than in the backup module because the path convention is the
   * catalogue's business: the export, the dry-run plan and the usage-event
   * resolution must all agree on what identifies an asset, and the way to guarantee
   * that is to compute it in exactly one place.
   */
  sidecarCandidates(libraryId?: number, separator = path.sep): Array<{
    assetId: number;
    relativePath: string;
    contentHash: string | null;
    filename: string;
    sizeBytes: number;
  }> {
    const roots = new Map(this.listLibraries().map((library) => [library.id, library.root]));
    return this.listAssetsForSidecar(libraryId).map((asset) => {
      const root = roots.get(asset.libraryId) ?? '';
      const relative = asset.path.startsWith(root) ? asset.path.slice(root.length) : asset.path;
      // stored with forward slashes so a backup survives moving between platforms
      const portable = relative.replace(/^[\\/]+/, '').split(/[\\/]/).join('/');
      void separator;
      return {
        assetId: asset.id,
        relativePath: portable,
        contentHash: asset.contentHash,
        filename: asset.filename,
        sizeBytes: asset.sizeBytes,
      };
    });
  }

  /** Ordered asset ids in a playlist. */
  playlistItemIds(playlistId: number): number[] {
    const rows = this.db
      .prepare('SELECT assetId FROM playlist_items WHERE playlistId = ? ORDER BY position, assetId')
      .all(playlistId) as Array<{ assetId: number }>;
    return rows.map((row) => row.assetId);
  }

  /** Replace a playlist's contents. Keeps only ids that still exist. */
  setPlaylistItems(playlistId: number, assetIds: number[]): void {
    const valid = assetIds.filter((assetId) => this.getAssetRow(assetId) !== null);
    const remove = this.db.prepare('DELETE FROM playlist_items WHERE playlistId = ?');
    const insert = this.db.prepare('INSERT INTO playlist_items(playlistId, assetId, position) VALUES (?, ?, ?)');
    this.db.exec('BEGIN');
    try {
      remove.run(playlistId);
      valid.forEach((assetId, index) => insert.run(playlistId, assetId, index));
      this.db.prepare('UPDATE playlists SET updatedAt = ? WHERE id = ?').run(Date.now(), playlistId);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

export function toBlob(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

export interface AssetUpsert {
  libraryId: number;
  path: string;
  dir: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  mtimeMs: number;
  searchText: string;
}

export interface MetadataUpdate {
  durationMs: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number | null;
  codec: string | null;
  audioFormatTag: number | null;
  isFloat: boolean;
  contentHash: string | null;
  emDescription: string | null;
  emKeywords: string | null;
  emDesigner: string | null;
  emRecorder: string | null;
  emCopyright: string | null;
  emLibrary: string | null;
  emOriginator: string | null;
  emOriginationDate: string | null;
  emProject: string | null;
  emScene: string | null;
  emTake: string | null;
  emNote: string | null;
  emIxml: string | null;
  emInfo: string | null;
  emCodingHistory: string | null;
  hasBext: boolean;
  chunks: string | null;
  searchText: string;
  lastError: string | null;
}

export interface DspUpdate {
  peakDb: number;
  rmsDb: number;
  decayMs: number;
  centroidHz: number;
  hfRatio: number;
  stereoCorr: number;
  hasVoice: boolean;
  tonality: number;
}

/**
 * Read a JSON array column, tolerating null and malformed values.
 *
 * A backup must not fail because one row's tag list was written by an older build;
 * a bad value becomes an empty list and the rest of the library is still backed up.
 */
function parseJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

export interface ClassificationUpdate {
  catId: string | null;
  confidence: number | null;
  source: 'filename' | 'ixml' | 'clap' | 'dsp-rule' | 'llm' | 'manual';
  alternatives: Array<{ catId: string; score: number; evidence: string }>;
}

export interface JobRecord {
  id: string;
  kind: string;
  libraryId: number | null;
  state: string;
  total: number;
  done: number;
  failed: number;
  startedAt: number;
  updatedAt: number;
  etaMs: number | null;
  currentPath: string | null;
  error: string | null;
}
