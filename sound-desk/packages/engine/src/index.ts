/**
 * Engine wiring.
 *
 * `createApp()` assembles the catalog, classifier, indexer and search service
 * from persisted state and returns everything the CLI and the VSCode extension
 * need. Keeping construction in one place is what lets the extension start the
 * engine in-process instead of spawning a child process.
 */

import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

import {
  dataset,
  expandQuery,
  expandQueryZh,
  lookup as ucsLookup,
  categoryCodeOf,
  type Lang,
} from '@sounddesk/ucs';

import { Catalog } from './db.js';
import { Indexer } from './indexer.js';
import { SearchService, VectorIndex } from './search.js';
import { UcsClassifier, type UcsEntry } from './ucs-classifier.js';
import { createEmbedder, NullEmbedder, type ClapEmbedderOptions } from './embedder.js';
import type { Embedder } from '@sounddesk/core';

export interface AppOptions {
  /** where catalog.db, the peak cache and the runtime file live */
  dataDir?: string;
  /** extra origins allowed to call the API (the VSCode webview) */
  allowedOrigins?: string[];
  /** directory of built web assets; when omitted only the API is served */
  webRoot?: string | null;
  /** attempt to load the CLAP embedding model */
  loadModel?: boolean;
  /** inject an embedder directly (used by tests, and by a future bring-your-own-model path) */
  embedder?: Embedder | null;
  modelOptions?: ClapEmbedderOptions;
  host?: string;
  port?: number;
  log?: (msg: string) => void;
  /** interface language for UCS labels */
  lang?: Lang;
}

export interface App {
  catalog: Catalog;
  classifier: UcsClassifier;
  indexer: Indexer;
  searchService: SearchService;
  vectorIndex: VectorIndex;
  embedder: Embedder;
  /** non-null when the embedding model could not be loaded, and why */
  embedderError: string | null;
  dataDir: string;
  ucs: {
    list(): UcsEntry[];
    categories(): string[];
    catIdsInCategory(category: string): string[];
    get(catId: string): UcsEntry | null;
    lookup(term: string): UcsEntry[];
    /** raw alias → catIds lookup, shared with the search service */
    lookupAliases(term: string): string[];
  };
  close(): void;
}

export function defaultDataDir(): string {
  if (process.env.SOUNDDESK_DATA_DIR) return process.env.SOUNDDESK_DATA_DIR;
  return path.join(homedir(), '.sounddesk');
}

export async function createApp(options: AppOptions = {}): Promise<App> {
  const log = options.log ?? (() => {});
  const dataDir = options.dataDir ?? defaultDataDir();
  mkdirSync(dataDir, { recursive: true });

  const catalog = Catalog.open({ dataDir });
  const entries = dataset.categories as UcsEntry[];
  const classifier = new UcsClassifier(entries);
  log(`UCS dataset: ${entries.length} CatIDs, data version ${dataset.version}${dataset.complete ? '' : ' (seed subset)'}`);

  // Mirror the dataset into SQLite so the UI can join against it without
  // re-parsing JSON, and so counts stay a single query.
  syncUcsTable(catalog, entries);

  let embedder: Embedder = new NullEmbedder();
  let embedderError: string | null = null;
  if (options.embedder) {
    embedder = options.embedder;
    if (!embedder.ready) embedderError = 'injected embedder reports not ready';
    log(`embedding model injected: ${embedder.id} (${embedder.dim}d)`);
  } else if (options.loadModel) {
    const result = await createEmbedder({ cacheDir: path.join(dataDir, 'models'), ...options.modelOptions });
    embedder = result.embedder;
    embedderError = result.reason;
    if (result.reason) {
      log(`semantic search disabled: ${result.reason}`);
    } else {
      log(`embedding model ready: ${embedder.id} (${embedder.dim}d)`);
    }
  }

  const vectorIndex = new VectorIndex(catalog);
  vectorIndex.reload();

  // Alias lookup used by the UCS prior retriever: map every synonym and CatID to
  // the catIds it can stand for.
  const aliasIndex = new Map<string, Set<string>>();
  for (const entry of entries) {
    addAlias(aliasIndex, entry.catId, entry.catId);
    addAlias(aliasIndex, entry.category, entry.catId);
    addAlias(aliasIndex, entry.subCategory, entry.catId);
    for (const syn of entry.synonymsEn) addAlias(aliasIndex, syn, entry.catId);
    for (const syn of entry.synonymsZh) addAlias(aliasIndex, syn, entry.catId);
  }

  const byCategory = new Map<string, string[]>();
  for (const entry of entries) {
    const list = byCategory.get(entry.category) ?? [];
    list.push(entry.catId);
    byCategory.set(entry.category, list);
  }

  const classifierLookup = (term: string): string[] => {
    const key = normalizeAlias(term);
    if (!key) return [];
    const direct = aliasIndex.get(key);
    if (direct && direct.size > 0) return [...direct];
    // substring fallback, so a partially typed term still narrows the field
    const out = new Set<string>();
    for (const [alias, catIds] of aliasIndex) {
      if (alias.includes(key) || key.includes(alias)) {
        for (const id of catIds) out.add(id);
        if (out.size > 40) break;
      }
    }
    return [...out];
  };

  const searchService = new SearchService({
    catalog,
    vectorIndex,
    embedder,
    expandQuery: (text: string) => {
      const expansion = expandQuery(text, options.lang ?? 'zh-Hans');
      const unmatched = (expansion as { unmatched?: string[] }).unmatched ?? [];
      return { captions: expansion.captions, rewritten: expansion.rewritten, unmatched };
    },
    classifierLookup,
    classifierLookupCategory: (category: string) => byCategory.get(category.toUpperCase()) ?? [],
  });

  const indexer = new Indexer({ catalog, classifier, embedder });

  return {
    catalog,
    classifier,
    indexer,
    searchService,
    vectorIndex,
    embedder,
    embedderError,
    dataDir,
    ucs: {
      list: () => entries,
      categories: () => classifier.categories(),
      catIdsInCategory: (category: string) => byCategory.get(category.toUpperCase()) ?? [],
      get: (catId: string) => classifier.get(catId),
      lookup: (term: string) => ucsLookup(term, { limit: 10 }),
      lookupAliases: classifierLookup,
    },
    close: () => {
      catalog.close();
    },
  };
}

function addAlias(index: Map<string, Set<string>>, raw: string, catId: string): void {
  const key = normalizeAlias(raw);
  if (!key) return;
  let set = index.get(key);
  if (!set) {
    set = new Set();
    index.set(key, set);
  }
  set.add(catId);
}

function normalizeAlias(s: string): string {
  return s
    .toLowerCase()
    .replace(/[_\-./\\()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Write the runtime file the browser/extension uses to discover port + token. */
export function writeRuntimeFile(dataDir: string, info: { port: number; token: string; url: string }): string {
  const file = path.join(dataDir, 'runtime.json');
  writeFileSync(file, JSON.stringify({ ...info, pid: process.pid, startedAt: new Date().toISOString() }, null, 2), {
    mode: 0o600,
  });
  return file;
}

/**
 * Read back the runtime file, or null when there is no live server.
 *
 * Used by `--print-url` so a user who lost the address does not have to restart
 * the engine: the token rotates on every start, so the URL that worked earlier
 * today may already be stale. Returns null when the file is missing, malformed,
 * or names a process that is no longer running — a leftover file must not be
 * reported as a working address.
 */
export function readRuntimeFile(
  dataDir: string,
): { port: number; token: string; url: string; pid: number; startedAt: string } | null {
  const file = path.join(dataDir, 'runtime.json');
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }

  const port = Number(parsed.port);
  const token = parsed.token;
  const url = parsed.url;
  const pid = Number(parsed.pid);
  if (!Number.isFinite(port) || typeof token !== 'string' || token.length === 0) return null;
  if (typeof url !== 'string' || url.length === 0) return null;

  // Confirm the recorded process still exists (signal 0 only tests for it).
  if (Number.isFinite(pid) && pid > 0) {
    try {
      process.kill(pid, 0);
    } catch {
      return null;
    }
  }

  return {
    port,
    token,
    url,
    pid: Number.isFinite(pid) ? pid : 0,
    startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : '',
  };
}

/**
 * Mirror the UCS dataset into the `ucs_categories` table.
 *
 * Exported because it is part of standing up a usable catalogue: anything that
 * builds a Catalog without `createApp` (test fixtures, alternative hosts) must
 * call this, or the category join in /api/ucs/tree silently reports everything
 * as uncategorised.
 */
export function syncUcsTable(catalog: Catalog, entries: UcsEntry[]): void {
  const count = (catalog.db.prepare('SELECT COUNT(*) AS n FROM ucs_categories').get() as { n: number }).n;
  if (catalog.getMeta('ucsVersion') === dataset.version && count === entries.length) return;
  const insert = catalog.db.prepare(
    `INSERT INTO ucs_categories(catId, category, subCategory, synonymsEn, synonymsZh, excludes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(catId) DO UPDATE SET category = excluded.category, subCategory = excluded.subCategory,
       synonymsEn = excluded.synonymsEn, synonymsZh = excluded.synonymsZh, excludes = excluded.excludes`,
  );
  catalog.db.exec('BEGIN');
  try {
    for (const entry of entries) {
      insert.run(
        entry.catId,
        entry.category,
        entry.subCategory,
        JSON.stringify(entry.synonymsEn ?? []),
        JSON.stringify(entry.synonymsZh ?? []),
        JSON.stringify(entry.excludes ?? []),
      );
    }
    catalog.db.exec('COMMIT');
  } catch (err) {
    catalog.db.exec('ROLLBACK');
    throw err;
  }
  catalog.setMeta('ucsVersion', dataset.version);
}

export { categoryCodeOf, expandQueryZh, expandQuery };
export { Catalog } from './db.js';
export { Indexer } from './indexer.js';
export { SearchService, VectorIndex } from './search.js';
export { UcsClassifier } from './ucs-classifier.js';
export { NullEmbedder, ClapEmbedder, createEmbedder } from './embedder.js';
export { startServer } from './server.js';
export type { RunningServer, ServerOptions } from './server.js';
export { discoverFiles, hashFile, AUDIO_EXTENSIONS } from './scanner.js';
/** Row → DTO mapping, so hosts (the VSCode extension) can reuse it verbatim. */
export { rowToAsset, rowToSummary } from './mappers.js';

export {
  EXPORT_SUFFIX,
  ExportError,
  exportRootsFor,
  isInside,
  safeStem,
  saveExport,
  uniqueName,
  type ExportResult,
} from './export.js';
