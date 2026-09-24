/**
 * Library backup and import — PLAN P1-3.
 *
 * ## What this backs up, and what it deliberately does not
 *
 * The backup holds **sidecar data only**: tags, favourites, ratings, manual
 * classifications, search history and usage events. It does **not** copy audio.
 * The files are the user's library and already exist; duplicating 3.5 GB into a
 * JSON file would be absurd, and inventing a second copy of the audio would create
 * two sources of truth for it.
 *
 * That scoping is exactly why the format is called out as a *sidecar* backup and
 * why the UI says so: restoring from it recovers your annotations, not your audio.
 *
 * ## Why matching is the whole problem
 *
 * Restoring onto another machine (or the same machine after a reorganisation) means
 * asset ids mean nothing — row 42 there is not row 42 here. So each record carries
 * three independent identifiers and is matched by the strongest one available:
 *
 *   1. **content hash** — the same bytes, wherever they live now. Survives a
 *      rename and a move.
 *   2. **library name + relative path** — the same layout. Survives a move of the
 *      whole library, and works for formats we cannot hash meaningfully.
 *   3. **filename + byte size** — a last resort for an empty destination, where the
 *      files were copied in but the paths changed.
 *
 * A record is applied to at most one asset and only when the match is
 * **unambiguous**: if two candidates tie, the record is skipped and reported rather
 * than guessed. Applying a favourite to the wrong sound is worse than not applying
 * it, because the user has no way to notice.
 */

import type { UsageKind } from '@sounddesk/core';

/** Bumped when the shape changes incompatibly; importers must refuse unknowns. */
export const BACKUP_FORMAT_VERSION = 1;

export interface BackupAsset {
  /** relative to the library root, using forward slashes for portability */
  relativePath: string;
  filename: string;
  sizeBytes: number;
  /** sha1 of the file contents, when it has been computed */
  contentHash: string | null;
}

export interface BackupAnnotation {
  relativePath: string;
  contentHash: string | null;
  filename: string;
  sizeBytes: number;
  tags: string[];
  favorite: boolean;
  rating: number;
  /** only present when the classification was made by hand */
  ucsCatId: string | null;
  /** manual overrides are authoritative, so they are backed up explicitly */
  manual: boolean;
}

export interface BackupSearchEntry {
  query: string;
  mode: string;
  hits: number;
  at: number;
}

export interface BackupUsageEntry {
  /** resolved via the same identifiers as annotations */
  relativePath: string | null;
  contentHash: string | null;
  query: string | null;
  kind: UsageKind;
  at: number;
}

export interface LibraryBackup {
  format: 'sounddesk-sidecar-backup';
  version: number;
  createdAt: string;
  /** which tool version produced it, for diagnosis only */
  app: string;
  /** the library name, used for the path-based match */
  libraryName: string | null;
  counts: {
    annotations: number;
    playlists: number;
    searches: number;
    usage: number;
  };
  annotations: BackupAnnotation[];
  playlists: Array<{ name: string; items: Array<{ relativePath: string | null; contentHash: string | null; filename: string; sizeBytes: number }> }>;
  searches: BackupSearchEntry[];
  usage: BackupUsageEntry[];
  /**
   * Manual classifications for assets that no longer exist in the catalogue.
   * Kept so an import onto a not-yet-rescanned library can still apply them.
   */
  orphans?: BackupAnnotation[];
}

export class BackupError extends Error {}

/** Normalise a path for the backup: always forward slashes, no leading slash. */
export function toPortableRelative(root: string, absolute: string, separator = '/'): string {
  const rel = absolute.startsWith(root) ? absolute.slice(root.length) : absolute;
  return rel.replace(/^[\\/]+/, '').split(/[\\/]/).join(separator);
}

/** Rewrite a portable relative path for the local platform. */
export function fromPortableRelative(relative: string, separator = '\\'): string {
  return relative.replace(/^[\\/]+/, '').split('/').join(separator);
}

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

/**
 * Parse and validate a backup file.
 *
 * Treated as untrusted input: it is a file a user was handed, possibly edited, and
 * a malformed one must be rejected with a reason rather than half-applied.
 */
export function parseBackup(raw: unknown): LibraryBackup {
  if (!raw || typeof raw !== 'object') throw new BackupError('备份文件不是有效的 JSON 对象');
  const data = raw as Record<string, unknown>;

  if (data.format !== 'sounddesk-sidecar-backup') {
    throw new BackupError('这不是 SoundDesk 的备份文件');
  }
  const version = Number(data.version);
  if (!Number.isFinite(version)) throw new BackupError('备份文件缺少版本号');
  if (version > BACKUP_FORMAT_VERSION) {
    throw new BackupError(
      `备份版本 ${version} 比当前支持的 ${BACKUP_FORMAT_VERSION} 更新，请升级 SoundDesk 后再导入`,
    );
  }

  const annotations = Array.isArray(data.annotations) ? data.annotations : [];
  const playlists = Array.isArray(data.playlists) ? data.playlists : [];
  const searches = Array.isArray(data.searches) ? data.searches : [];
  const usage = Array.isArray(data.usage) ? data.usage : [];

  return {
    format: 'sounddesk-sidecar-backup',
    version,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date(0).toISOString(),
    app: typeof data.app === 'string' ? data.app : 'unknown',
    libraryName: typeof data.libraryName === 'string' ? data.libraryName : null,
    counts: {
      annotations: annotations.length,
      playlists: playlists.length,
      searches: searches.length,
      usage: usage.length,
    },
    annotations: annotations.map(normalizeAnnotation),
    playlists: playlists.map((entry) => {
      const playlist = (entry ?? {}) as Record<string, unknown>;
      return {
        name: typeof playlist.name === 'string' ? playlist.name : '未命名',
        items: (Array.isArray(playlist.items) ? playlist.items : []).map((item) => {
          const row = (item ?? {}) as Record<string, unknown>;
          return {
            relativePath: typeof row.relativePath === 'string' ? row.relativePath : null,
            contentHash: typeof row.contentHash === 'string' ? row.contentHash : null,
            filename: typeof row.filename === 'string' ? row.filename : '',
            sizeBytes: Number(row.sizeBytes) || 0,
          };
        }),
      };
    }),
    searches: searches
      .map((entry) => {
        const row = (entry ?? {}) as Record<string, unknown>;
        return {
          query: typeof row.query === 'string' ? row.query : '',
          mode: typeof row.mode === 'string' ? row.mode : 'hybrid',
          hits: Number(row.hits) || 0,
          at: Number(row.at) || 0,
        };
      })
      .filter((entry) => entry.query.length > 0),
    usage: usage
      .map((entry) => {
        const row = (entry ?? {}) as Record<string, unknown>;
        return {
          relativePath: typeof row.relativePath === 'string' ? row.relativePath : null,
          contentHash: typeof row.contentHash === 'string' ? row.contentHash : null,
          query: typeof row.query === 'string' ? row.query : null,
          kind: (typeof row.kind === 'string' ? row.kind : 'play') as UsageKind,
          at: Number(row.at) || 0,
        };
      })
      .filter((entry) => entry.query !== undefined),
    orphans: Array.isArray(data.orphans) ? data.orphans.map(normalizeAnnotation) : undefined,
  };
}

function normalizeAnnotation(raw: unknown): BackupAnnotation {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    relativePath: typeof row.relativePath === 'string' ? row.relativePath : '',
    contentHash: typeof row.contentHash === 'string' ? row.contentHash : null,
    filename: typeof row.filename === 'string' ? row.filename : '',
    sizeBytes: Number(row.sizeBytes) || 0,
    tags: (Array.isArray(row.tags) ? row.tags : []).filter((tag): tag is string => typeof tag === 'string'),
    favorite: row.favorite === true,
    rating: Math.max(0, Math.min(5, Number(row.rating) || 0)),
    ucsCatId: typeof row.ucsCatId === 'string' ? row.ucsCatId : null,
    manual: row.manual === true,
  };
}

// ---------------------------------------------------------------------------
// matching
// ---------------------------------------------------------------------------

export interface MatchCandidate {
  assetId: number;
  relativePath: string;
  contentHash: string | null;
  filename: string;
  sizeBytes: number;
}

export type MatchMethod = 'hash' | 'path' | 'name-size';

export interface MatchResult {
  assetId: number;
  method: MatchMethod;
}

export interface MatchIndex {
  byHash: Map<string, number[]>;
  byPath: Map<string, number[]>;
  byNameSize: Map<string, number[]>;
}

/** Key for the filename+size fallback. */
export function nameSizeKey(filename: string, sizeBytes: number): string {
  return `${filename.toLowerCase()}\u0000${sizeBytes}`;
}

export function buildMatchIndex(candidates: MatchCandidate[], separator = '\\'): MatchIndex {
  const byHash = new Map<string, number[]>();
  const byPath = new Map<string, number[]>();
  const byNameSize = new Map<string, number[]>();

  const push = (map: Map<string, number[]>, key: string, assetId: number): void => {
    const list = map.get(key);
    if (list) list.push(assetId);
    else map.set(key, [assetId]);
  };

  for (const candidate of candidates) {
    if (candidate.contentHash) push(byHash, candidate.contentHash, candidate.assetId);
    // paths are compared case-insensitively: Windows libraries differ only in case
    push(byPath, candidate.relativePath.toLowerCase().split('/').join(separator), candidate.assetId);
    push(byNameSize, nameSizeKey(candidate.filename, candidate.sizeBytes), candidate.assetId);
  }

  return { byHash, byPath, byNameSize };
}

/**
 * Resolve one backup record to exactly one asset, or to nothing.
 *
 * Returns null when no identifier matches, **and also when several do**. Ties are
 * the dangerous case: two identical files (a duplicated take, the same sample in
 * two libraries) both match a hash, and picking one arbitrarily would apply the
 * user's annotation to a coin flip. The caller reports these instead.
 */
export function matchRecord(
  index: MatchIndex,
  record: { relativePath: string; contentHash: string | null; filename: string; sizeBytes: number },
  separator = '\\',
): { match: MatchResult | null; ambiguous: MatchMethod | null } {
  const single = (list: number[] | undefined): number | null =>
    list && list.length === 1 ? list[0]! : null;

  if (record.contentHash) {
    const ids = index.byHash.get(record.contentHash);
    const one = single(ids);
    if (one !== null) return { match: { assetId: one, method: 'hash' }, ambiguous: null };
    if (ids && ids.length > 1) return { match: null, ambiguous: 'hash' };
  }

  if (record.relativePath) {
    const key = record.relativePath.toLowerCase().split('/').join(separator);
    const ids = index.byPath.get(key);
    const one = single(ids);
    if (one !== null) return { match: { assetId: one, method: 'path' }, ambiguous: null };
    if (ids && ids.length > 1) return { match: null, ambiguous: 'path' };
  }

  const ids = index.byNameSize.get(nameSizeKey(record.filename, record.sizeBytes));
  const one = single(ids);
  if (one !== null) return { match: { assetId: one, method: 'name-size' }, ambiguous: null };
  if (ids && ids.length > 1) return { match: null, ambiguous: 'name-size' };

  return { match: null, ambiguous: null };
}

// ---------------------------------------------------------------------------
// import planning
// ---------------------------------------------------------------------------

export interface ImportOptions {
  /** replace existing tags/ratings rather than merging */
  overwrite?: boolean;
  /** how to combine search history and usage events */
  history?: 'merge' | 'skip';
}

export interface PlannedAnnotation {
  assetId: number;
  method: MatchMethod;
  annotation: BackupAnnotation;
}

export interface ImportPlan {
  annotations: PlannedAnnotation[];
  /** records that matched nothing in this catalogue */
  unmatched: BackupAnnotation[];
  /** records skipped because several assets tied on an identifier */
  ambiguous: Array<{ annotation: BackupAnnotation; method: MatchMethod }>;
  /** method → how many records used it, so the user can judge the quality */
  byMethod: Record<MatchMethod, number>;
}

/**
 * Work out what an import would do, without doing any of it.
 *
 * A dry run is the only honest way to present this: the user is about to overwrite
 * annotations across a library, and "how many matched, and how" is exactly what
 * they need before agreeing.
 */
export function planImport(
  backup: LibraryBackup,
  candidates: MatchCandidate[],
  separator = '\\',
): ImportPlan {
  const index = buildMatchIndex(candidates, separator);
  const plan: ImportPlan = {
    annotations: [],
    unmatched: [],
    ambiguous: [],
    byMethod: { hash: 0, path: 0, 'name-size': 0 },
  };

  // A single asset must not receive two records: the first one wins and the rest
  // are reported, which happens when a backup is merged twice or contains both an
  // orphan copy and a live copy of the same file.
  const claimed = new Set<number>();
  const all = [...backup.annotations, ...(backup.orphans ?? [])];

  for (const annotation of all) {
    if (annotation.relativePath === '' && annotation.filename === '') continue;
    const { match, ambiguous } = matchRecord(index, annotation, separator);
    if (!match) {
      if (ambiguous) plan.ambiguous.push({ annotation, method: ambiguous });
      else plan.unmatched.push(annotation);
      continue;
    }
    if (claimed.has(match.assetId)) {
      plan.ambiguous.push({ annotation, method: match.method });
      continue;
    }
    claimed.add(match.assetId);
    plan.byMethod[match.method] += 1;
    plan.annotations.push({ assetId: match.assetId, method: match.method, annotation });
  }

  return plan;
}

// ---------------------------------------------------------------------------
// catalogue integration
// ---------------------------------------------------------------------------

/** The slice of the catalogue this module needs, so tests can supply a stub. */
export interface SidecarCatalog {
  listLibraries(): Array<{ id: number; name: string; root: string }>;
  getAssetRow(id: number): Record<string, unknown> | null;
  listAssetsForSidecar(libraryId?: number): SidecarAsset[];
  setTags(id: number, tags: string[]): void;
  setFavorite(id: number, favorite: boolean): void;
  setRating(id: number, rating: number): void;
  /**
   * Restore a manual classification.
   *
   * Declared with the full `ClassificationUpdate` shape rather than a narrowed one,
   * so the catalogue's real signature satisfies this interface: a structurally
   * narrower parameter type makes `Catalog` unassignable to it.
   */
  applyClassification(
    assetId: number,
    update: {
      catId: string | null;
      confidence: number | null;
      source: 'filename' | 'ixml' | 'clap' | 'dsp-rule' | 'llm' | 'manual';
      alternatives: Array<{ catId: string; score: number; evidence: string }>;
    },
  ): void;
  recentSearches(limit?: number): Array<{ query: string; mode: string; hits: number; at: number }>;
  addSearchHistory(query: string, mode: string, hits: number): void;
  recentUsage(limit?: number): Array<{ assetId: number; query: string | null; kind: string; at: number }>;
  recordUsage(assetId: number, kind: string, query: string | null): void;
  /** playlists with their items as asset ids */
  listPlaylistsWithItems(): Array<{ name: string; assetIds: number[] }>;
  /** id of a playlist with this name, or null when there is none */
  findPlaylistByName(name: string): number | null;
  /** create a playlist, returning its id */
  createPlaylist(name: string): number;
  /** ordered asset ids currently in a playlist */
  playlistItemIds(playlistId: number): number[];
  setPlaylistItems(playlistId: number, assetIds: number[]): void;
  /** every asset as the identifiers a backup uses (see Catalogue.sidecarCandidates) */
  sidecarCandidates(libraryId?: number, separator?: string): MatchCandidate[];
}

export interface SidecarAsset {
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
}

/** Where an asset lives inside its library, as a portable relative path. */
function relativeOf(rootFor: Map<number, string>, asset: SidecarAsset): string {
  return toPortableRelative(rootFor.get(asset.libraryId) ?? '', asset.path);
}

/**
 * Turn catalogue rows into the identifiers a backup stores.
 *
 * One place, so the export, the import plan and the usage-event resolution cannot
 * disagree about what identifies an asset — a mismatch there would silently break
 * matching.
 */
function toCandidates(assets: SidecarAsset[], rootFor: Map<number, string>): MatchCandidate[] {
  return assets.map((asset) => ({
    assetId: asset.id,
    relativePath: relativeOf(rootFor, asset),
    contentHash: asset.contentHash,
    filename: asset.filename,
    sizeBytes: asset.sizeBytes,
  }));
}

export interface ExportOptions {
  libraryId?: number;
  /** include search history and usage events */
  includeHistory?: boolean;
  app?: string;
}

/**
 * Build a backup from the catalogue.
 *
 * Search history and usage events are optional because they are personal but not
 * precious: a user sharing a backup with a colleague probably wants the tags and
 * manual classifications, not their own click history.
 */
export function buildBackup(
  catalog: SidecarCatalog,
  options: ExportOptions = {},
): LibraryBackup {
  const library = options.libraryId !== undefined
    ? catalog.listLibraries().find((entry) => entry.id === options.libraryId) ?? null
    : null;
  const libraries = catalog.listLibraries();
  const rootFor = new Map(libraries.map((entry) => [entry.id, entry.root]));

  const assets = catalog.listAssetsForSidecar(options.libraryId);
  const annotations: BackupAnnotation[] = [];

  for (const asset of assets) {
    const root = rootFor.get(asset.libraryId);
    if (!root) continue;
    // Skip records that carry nothing worth restoring, so a backup of a large
    // library is not mostly empty objects.
    const manual = asset.ucsSource === 'manual';
    if (
      asset.tags.length === 0 &&
      !asset.favorite &&
      asset.rating === 0 &&
      !manual
    ) {
      continue;
    }
    annotations.push({
      relativePath: relativeOf(rootFor, asset),
      contentHash: asset.contentHash,
      filename: asset.filename,
      sizeBytes: asset.sizeBytes,
      tags: asset.tags,
      favorite: asset.favorite,
      rating: asset.rating,
      ucsCatId: asset.ucsCatId,
      manual,
    });
  }

  const includeHistory = options.includeHistory !== false;
  const searches: BackupSearchEntry[] = includeHistory
    ? catalog.recentSearches(5000).map((entry) => ({
        query: entry.query,
        mode: entry.mode,
        hits: entry.hits,
        at: entry.at,
      }))
    : [];

  // Usage events reference assets by the same identifiers as annotations.
  const usage: BackupUsageEntry[] = [];
  if (includeHistory) {
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    for (const event of catalog.recentUsage(5000)) {
      const asset = byId.get(event.assetId);
      const root = asset ? rootFor.get(asset.libraryId) : undefined;
      usage.push({
        relativePath: asset && root ? relativeOf(rootFor, asset) : null,
        contentHash: asset?.contentHash ?? null,
        query: event.query,
        kind: event.kind as UsageKind,
        at: event.at,
      });
    }
  }

  const playlists = readPlaylistsForBackup(catalog, assets, rootFor);

  return {
    format: 'sounddesk-sidecar-backup',
    version: BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    app: options.app ?? 'unknown',
    libraryName: library?.name ?? null,
    counts: {
      annotations: annotations.length,
      playlists: playlists.length,
      searches: searches.length,
      usage: usage.length,
    },
    annotations,
    playlists,
    searches,
    usage,
  };
}

/**
 * Playlists, with their items expressed as identifiers rather than row ids.
 *
 * A playlist stored as asset ids would be meaningless on another machine; using the
 * same three identifiers as annotations means the same matching rules apply.
 */
function readPlaylistsForBackup(
  catalog: SidecarCatalog,
  assets: SidecarAsset[],
  rootFor: Map<number, string>,
): LibraryBackup['playlists'] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const out: LibraryBackup['playlists'] = [];
  for (const playlist of catalog.listPlaylistsWithItems()) {
    out.push({
      name: playlist.name,
      items: playlist.assetIds
        .map((assetId) => byId.get(assetId))
        .filter((asset): asset is SidecarAsset => asset !== undefined)
        .map((asset) => ({
          relativePath: relativeOf(rootFor, asset),
          contentHash: asset.contentHash,
          filename: asset.filename,
          sizeBytes: asset.sizeBytes,
        })),
    });
  }
  return out;
}

export interface ApplyResult {
  /** annotations written */
  applied: number;
  /** playlists created */
  playlistsCreated: number;
  /** playlist items attached */
  playlistItems: number;
  /** search history rows added */
  searchesAdded: number;
  /** usage events added */
  usageAdded: number;
  /** records deliberately not applied, with the reason */
  skipped: Array<{ reason: string; detail: string }>;
}

export interface ApplyOptions {
  /** replace existing tags/ratings instead of merging */
  overwrite?: boolean;
  /** attach playlists */
  includePlaylists?: boolean;
  /** import search history and usage events */
  includeHistory?: boolean;
}

/**
 * Read a tag list out of a raw catalogue row.
 *
 * `getAssetRow` returns the database's own values, so `tags` arrives as a JSON
 * **string**, not an array. Assuming otherwise made the merge path silently drop the
 * user's existing tags: an array check on a string is always false, so the union came
 * out as only the backup's tags. Also tolerates an already-decoded array, in case a
 * caller hands us a mapped row.
 */
export function tagsFromRow(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  if (typeof value !== 'string' || value.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

export function applyImport(
  catalog: SidecarCatalog,
  backup: LibraryBackup,
  plan: ImportPlan,
  options: ApplyOptions = {},
): ApplyResult {
  const result: ApplyResult = {
    applied: 0,
    playlistsCreated: 0,
    playlistItems: 0,
    searchesAdded: 0,
    usageAdded: 0,
    skipped: [],
  };

  const assets = catalog.listAssetsForSidecar();
  const rootFor = new Map(catalog.listLibraries().map((entry) => [entry.id, entry.root]));
  const index = buildMatchIndex(catalog.sidecarCandidates());

  for (const planned of plan.annotations) {
    const { annotation } = planned;
    const existing = catalog.getAssetRow(planned.assetId);
    if (!existing) {
      result.skipped.push({ reason: '素材已不存在', detail: annotation.relativePath || annotation.filename });
      continue;
    }

    if (options.overwrite) {
      catalog.setTags(planned.assetId, [...new Set(annotation.tags)]);
      catalog.setRating(planned.assetId, annotation.rating);
      catalog.setFavorite(planned.assetId, annotation.favorite);
    } else {
      const current = tagsFromRow(existing.tags);
      catalog.setTags(planned.assetId, [...new Set([...current, ...annotation.tags])]);
      if (annotation.rating > (Number(existing.rating) || 0)) {
        catalog.setRating(planned.assetId, annotation.rating);
      }
      if (annotation.favorite && existing.favorite !== 1) catalog.setFavorite(planned.assetId, true);
    }

    // A manual classification is authoritative. It is only restored when the asset
    // is not already manually classified, because the current one may be a
    // correction the user made after this backup was taken.
    if (annotation.manual && annotation.ucsCatId && existing.ucsSource !== 'manual') {
      catalog.applyClassification(planned.assetId, {
        catId: annotation.ucsCatId,
        confidence: 1,
        source: 'manual',
        alternatives: [],
      });
    }

    result.applied += 1;
  }

  if (options.includePlaylists !== false) {
    for (const playlist of backup.playlists) {
      const existingId = catalog.findPlaylistByName(playlist.name);
      const created = existingId === null;
      const playlistId = existingId ?? catalog.createPlaylist(playlist.name);
      if (created) result.playlistsCreated += 1;

      // Reuse the matching rules, so a playlist item resolves exactly like an
      // annotation would and a tie is skipped rather than guessed.
      const existing = catalog.playlistItemIds(playlistId);
      const seen = new Set(existing);
      const order = [...existing];
      for (const item of playlist.items) {
        const { match } = matchRecord(index, {
          relativePath: item.relativePath ?? '',
          contentHash: item.contentHash,
          filename: item.filename,
          sizeBytes: item.sizeBytes,
        });
        if (!match || seen.has(match.assetId)) continue;
        seen.add(match.assetId);
        order.push(match.assetId);
        result.playlistItems += 1;
      }
      if (order.length > 0) catalog.setPlaylistItems(playlistId, order);
    }
  }

  if (options.includeHistory !== false) {
    for (const entry of backup.searches) {
      catalog.addSearchHistory(entry.query, entry.mode, entry.hits);
      result.searchesAdded += 1;
    }
    // An event whose asset is gone is dropped rather than recorded against nothing.
    for (const entry of backup.usage) {
      const { match } = matchRecord(index, {
        relativePath: entry.relativePath ?? '',
        contentHash: entry.contentHash,
        filename: '',
        sizeBytes: 0,
      });
      if (!match) continue;
      catalog.recordUsage(match.assetId, entry.kind, entry.query);
      result.usageAdded += 1;
    }
  }

  return result;
}
