/**
 * Playlists — PLAN P1-3.
 *
 * A playlist is an ordered list of asset ids. It stores **references, never
 * copies**: the audio files stay where they are, and removing an asset from the
 * library removes it from every playlist (the schema's `ON DELETE CASCADE` does
 * this). A playlist that held its own copies would double a 3.5 GB library.
 */

import type { Catalog } from './db.js';

export interface Playlist {
  id: number;
  name: string;
  createdAt: number;
  updatedAt: number;
  itemCount: number;
}

export interface PlaylistItem {
  assetId: number;
  position: number;
  filename: string;
  durationMs: number | null;
  ucsCatId: string | null;
  favorite: boolean;
  /** false when the asset row is gone but the reference survived (should not happen) */
  present: boolean;
}

export class PlaylistError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'PlaylistError';
    this.status = status;
  }
}

/** Longest name we accept, to keep the UI and the DB sane. */
export const MAX_PLAYLIST_NAME = 120;

/** Normalise and validate a playlist name. */
export function normalizePlaylistName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (name.length === 0) throw new PlaylistError('播放列表名不能为空');
  if (name.length > MAX_PLAYLIST_NAME) {
    throw new PlaylistError(`播放列表名最长 ${MAX_PLAYLIST_NAME} 个字符`);
  }
  return name;
}

/**
 * Insert a list of ids into an existing order at a given position.
 *
 * Kept pure and separate from the database because the interesting cases are all
 * about what happens to duplicates and out-of-range positions, which is much
 * easier to get right — and to test — without SQL in the way.
 *
 * Duplicates already in the list are dropped rather than added twice: a playlist
 * with the same sound twice is almost always a mistake, and the user can still
 * hear it twice by playing it twice.
 */
export function insertIntoOrder(order: number[], ids: number[], position?: number): number[] {
  const existing = new Set(order);
  const additions: number[] = [];
  for (const id of ids) {
    if (existing.has(id)) continue;
    existing.add(id);
    additions.push(id);
  }
  if (additions.length === 0) return [...order];

  const at = position === undefined || !Number.isFinite(position) ? order.length : Math.trunc(position);
  const clamped = Math.max(0, Math.min(order.length, at));
  return [...order.slice(0, clamped), ...additions, ...order.slice(clamped)];
}

/** Move one entry within an order. Returns the order unchanged when it cannot move. */
export function moveWithinOrder(order: number[], id: number, toIndex: number): number[] {
  const from = order.indexOf(id);
  if (from < 0) return [...order];
  const to = Math.max(0, Math.min(order.length - 1, Math.trunc(toIndex)));
  if (to === from) return [...order];
  const out = [...order];
  out.splice(from, 1);
  out.splice(to, 0, id);
  return out;
}

export interface PlaylistStore {
  list(): Playlist[];
  get(id: number): Playlist | null;
  create(name: string): Playlist;
  rename(id: number, name: string): Playlist;
  remove(id: number): boolean;
  /** ordered asset ids */
  itemIds(id: number): number[];
  /** replace the whole order, which is how add/remove/move are all applied */
  setItemIds(id: number, ids: number[]): void;
  items(id: number): PlaylistItem[];
}

/**
 * Persist playlists in the catalogue database.
 *
 * The order is stored as a per-item `position` because that is what the schema
 * already had. Rewriting positions on every change is O(n) per edit, which is
 * irrelevant at playlist sizes and keeps the ordering trivially inspectable in
 * the database — a linked list or a fractional index would be faster and much
 * harder to debug.
 */
export class Playlists implements PlaylistStore {
  /**
   * Plain field rather than a constructor parameter property: Node's
   * `--experimental-strip-types` rejects that syntax, and these sources are run
   * unbuilt in tests and in `pnpm dev`.
   */
  private readonly catalog: Catalog;

  constructor(catalog: Catalog) {
    this.catalog = catalog;
  }

  list(): Playlist[] {
    return this.catalog.db
      .prepare(
        `SELECT p.id, p.name, p.createdAt, p.updatedAt,
                (SELECT COUNT(*) FROM playlist_items i WHERE i.playlistId = p.id) AS itemCount
         FROM playlists p
         ORDER BY p.name COLLATE NOCASE`,
      )
      .all() as unknown as Playlist[];
  }

  get(id: number): Playlist | null {
    const row = this.catalog.db
      .prepare(
        `SELECT p.id, p.name, p.createdAt, p.updatedAt,
                (SELECT COUNT(*) FROM playlist_items i WHERE i.playlistId = p.id) AS itemCount
         FROM playlists p WHERE p.id = ?`,
      )
      .get(id) as unknown as Playlist | undefined;
    return row ?? null;
  }

  create(name: string): Playlist {
    const clean = normalizePlaylistName(name);
    const existing = this.catalog.db
      .prepare('SELECT id FROM playlists WHERE name = ? COLLATE NOCASE')
      .get(clean);
    if (existing) throw new PlaylistError(`已经有名为「${clean}」的播放列表`, 409);

    const now = Date.now();
    const info = this.catalog.db
      .prepare('INSERT INTO playlists(name, createdAt, updatedAt) VALUES (?, ?, ?)')
      .run(clean, now, now);
    const id = Number(info.lastInsertRowid);
    return this.get(id)!;
  }

  rename(id: number, name: string): Playlist {
    const clean = normalizePlaylistName(name);
    if (!this.get(id)) throw new PlaylistError('播放列表不存在', 404);
    const clash = this.catalog.db
      .prepare('SELECT id FROM playlists WHERE name = ? COLLATE NOCASE AND id <> ?')
      .get(clean, id);
    if (clash) throw new PlaylistError(`已经有名为「${clean}」的播放列表`, 409);
    this.catalog.db.prepare('UPDATE playlists SET name = ?, updatedAt = ? WHERE id = ?').run(clean, Date.now(), id);
    return this.get(id)!;
  }

  remove(id: number): boolean {
    // playlist_items cascades, so this is one statement.
    const info = this.catalog.db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
    return Number(info.changes) > 0;
  }

  itemIds(id: number): number[] {
    const rows = this.catalog.db
      .prepare('SELECT assetId FROM playlist_items WHERE playlistId = ? ORDER BY position, assetId')
      .all(id) as Array<{ assetId: number }>;
    return rows.map((row) => row.assetId);
  }

  setItemIds(id: number, ids: number[]): void {
    if (!this.get(id)) throw new PlaylistError('播放列表不存在', 404);
    // Only keep ids that exist: a stale reference would show as a phantom row.
    const valid = ids.filter((assetId) => this.catalog.getAssetRow(assetId) !== null);
    const transaction = this.catalog.db.prepare('DELETE FROM playlist_items WHERE playlistId = ?');
    const insert = this.catalog.db.prepare(
      'INSERT INTO playlist_items(playlistId, assetId, position) VALUES (?, ?, ?)',
    );
    this.catalog.db.exec('BEGIN');
    try {
      transaction.run(id);
      valid.forEach((assetId, index) => insert.run(id, assetId, index));
      this.catalog.db.prepare('UPDATE playlists SET updatedAt = ? WHERE id = ?').run(Date.now(), id);
      this.catalog.db.exec('COMMIT');
    } catch (err) {
      this.catalog.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Items joined with enough of the asset row to render a list. */
  items(id: number): PlaylistItem[] {
    const rows = this.catalog.db
      .prepare(
        `SELECT i.assetId, i.position, a.filename, a.durationMs, a.ucsCatId, a.favorite
         FROM playlist_items i
         LEFT JOIN assets a ON a.id = i.assetId
         WHERE i.playlistId = ?
         ORDER BY i.position, i.assetId`,
      )
      .all(id) as Array<{
      assetId: number;
      position: number;
      filename: string | null;
      durationMs: number | null;
      ucsCatId: string | null;
      favorite: number | null;
    }>;

    return rows.map((row) => ({
      assetId: row.assetId,
      position: row.position,
      filename: row.filename ?? '(已删除)',
      durationMs: row.durationMs,
      ucsCatId: row.ucsCatId,
      favorite: row.favorite === 1,
      present: row.filename !== null,
    }));
  }
}

/** Add assets to a playlist, keeping their relative order. */
export function addToPlaylist(store: PlaylistStore, playlistId: number, assetIds: number[]): number[] {
  const next = insertIntoOrder(store.itemIds(playlistId), assetIds);
  store.setItemIds(playlistId, next);
  return next;
}

/** Remove assets from a playlist. */
export function removeFromPlaylist(store: PlaylistStore, playlistId: number, assetIds: number[]): number[] {
  const drop = new Set(assetIds);
  const next = store.itemIds(playlistId).filter((id) => !drop.has(id));
  store.setItemIds(playlistId, next);
  return next;
}

// ---------------------------------------------------------------------------
// M3U export
// ---------------------------------------------------------------------------

export interface M3uEntry {
  /** absolute path to the audio file */
  path: string;
  /** seconds, for the #EXTINF line */
  durationSeconds: number | null;
  /** shown to the player; falls back to the file name */
  title: string;
}

/**
 * Render a playlist as M3U8.
 *
 * The portable way to hand an ordered list to a DAW or a media player: every one of
 * them reads M3U, and it references the files in place rather than copying them —
 * the same principle as the playlist itself.
 *
 * Written as **M3U8** (UTF-8) rather than plain M3U, with an explicit BOM-less
 * `#EXTM3U` header, because these libraries are full of Chinese and accented names
 * and a legacy player assuming the system codepage would mangle them. Paths are
 * emitted with the local separator, which is what a local player expects.
 */
export function toM3u(entries: M3uEntry[], playlistName: string): string {
  const lines: string[] = ['#EXTM3U'];
  for (const entry of entries) {
    const seconds = entry.durationSeconds === null ? -1 : Math.round(entry.durationSeconds);
    // A newline inside a title would break the format, so collapse whitespace.
    const title = (entry.title || entry.path).replace(/[\r\n]+/g, ' ').trim();
    lines.push(`#EXTINF:${seconds},${title}`);
    lines.push(entry.path);
  }
  // A trailing newline, because some players ignore the last line without one.
  void playlistName;
  return `${lines.join('\n')}\n`;
}

/** Strip characters a file name cannot contain, for a download name. */
export function safePlaylistFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/, '')
    .trim();
  return `${cleaned.length > 0 ? cleaned : 'playlist'}.m3u8`;
}
