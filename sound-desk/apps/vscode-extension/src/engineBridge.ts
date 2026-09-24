/**
 * Maps webview requests onto the in-process engine.
 *
 * Deliberately pure: it takes an already-running engine and a plain params
 * object and returns JSON-serialisable data. That makes the whole request
 * surface unit-testable with a fake engine and no VSCode host, which matters
 * because the integration test needs a real VSCode download.
 */

import path from 'node:path';
import { statSync } from 'node:fs';

import type { App } from '@sounddesk/engine';
import {
  Playlists,
  addToPlaylist,
  applyImport,
  deleteExports,
  exportRootsFor,
  isInside,
  listExports,
  moveWithinOrder,
  parseBackup,
  planImport,
  removeFromPlaylist,
  rowToAsset,
  rowToSummary,
  saveExport,
  type ImportPlan,
} from '@sounddesk/engine';
import { hasBackup, isEditableWav, restoreFromBackup, updateWavMetadataFields } from '@sounddesk/audio-wav';

import {
  asParams,
  type AddLibraryParams,
  type AssetIdParams,
  type CancelJobParams,
  type ListAssetsParams,
  type PatchAssetParams,
  type SearchParams,
  type UcsLookupParams,
} from './protocol.ts';

export interface EngineLike {
  catalog: App['catalog'];
  ucs: App['ucs'];
  classifier: App['classifier'];
  searchService: App['searchService'];
  indexer: App['indexer'];
  dataDir: string;
}

export type Handler = (method: string, params: unknown) => Promise<unknown>;

/**
 * A plan reduced to what the webview needs to render the confirmation.
 *
 * Mirrors the engine's own summary so the same UI works in both hosts.
 */
function summarizePlan(plan: ImportPlan): {
  matched: number;
  byMethod: Record<string, number>;
  unmatched: number;
  ambiguous: number;
  unmatchedExamples: string[];
  ambiguousExamples: string[];
} {
  return {
    matched: plan.annotations.length,
    byMethod: { ...plan.byMethod },
    unmatched: plan.unmatched.length,
    ambiguous: plan.ambiguous.length,
    unmatchedExamples: plan.unmatched.slice(0, 10).map((entry) => entry.relativePath || entry.filename),
    ambiguousExamples: plan.ambiguous
      .slice(0, 10)
      .map((entry) => entry.annotation.relativePath || entry.annotation.filename),
  };
}

/**
 * Build the request handler for one engine instance.
 * Throws on unknown methods so the UI surfaces a real error instead of hanging.
 */
export function createHandler(engine: EngineLike): Handler {
  const { catalog } = engine;
  // One instance per engine, so playlist edits share the engine's connection.
  const playlists = new Playlists(catalog);

  const handlers: Record<string, (params: unknown) => Promise<unknown> | unknown> = {
    search: (params) => engine.searchService.search(asParams<SearchParams>(params)),

    asset: (params) => {
      const { id } = asParams<AssetIdParams>(params);
      const row = catalog.getAssetRow(id);
      if (!row) throw new Error(`asset ${id} not found`);
      return rowToAsset(row);
    },

    patchAsset: (params) => {
      const { id, patch } = asParams<PatchAssetParams>(params);
      const row = catalog.getAssetRow(id);
      if (!row) throw new Error(`asset ${id} not found`);
      if (patch.tags) catalog.setTags(id, patch.tags);
      if (typeof patch.favorite === 'boolean') catalog.setFavorite(id, patch.favorite);
      if (typeof patch.rating === 'number') catalog.setRating(id, patch.rating);
      if (patch.ucsCatId !== undefined) {
        // A user correction is recorded as `manual` and becomes authoritative.
        catalog.applyClassification(id, {
          catId: patch.ucsCatId,
          confidence: 1,
          source: 'manual',
          alternatives: [],
        });
        catalog.db
          .prepare('INSERT INTO feedback(assetId, oldCat, newCat, at) VALUES (?, ?, ?, ?)')
          .run(id, String(row.ucsCatId ?? ''), String(patch.ucsCatId ?? ''), Date.now());
      }
      const updated = catalog.getAssetRow(id);
      if (!updated) throw new Error(`asset ${id} disappeared`);
      return rowToAsset(updated);
    },

    reclassify: async (params) => {
      const { id } = asParams<AssetIdParams>(params);
      const row = catalog.getAssetRow(id);
      if (!row) throw new Error(`asset ${id} not found`);
      const asset = rowToAsset(row);
      const result = await engine.classifier.classify({
        filename: asset.filename,
        embedded: asset.embedded,
        dsp: asset.dsp,
        durationMs: asset.durationMs,
      });
      return {
        catId: result.catId,
        confidence: result.confidence,
        source: result.source,
        evidence: result.evidence,
        alternatives: result.alternatives,
      };
    },

    listAssets: (params) => {
      const { libraryId, limit = 200, offset = 0 } = asParams<ListAssetsParams>(params);
      const where = libraryId !== undefined ? 'WHERE libraryId = ?' : '';
      const bind: unknown[] = libraryId !== undefined ? [libraryId] : [];
      const items = catalog.db
        .prepare(`SELECT * FROM assets ${where} ORDER BY filename LIMIT ? OFFSET ?`)
        .all(...(bind as never[]), Math.min(limit, 1000), offset) as Array<Record<string, unknown>>;
      const total = libraryId !== undefined ? catalog.countAssets(libraryId) : catalog.countAssets();
      return { items: items.map(rowToSummary), total, limit, offset };
    },

    libraries: () => catalog.listLibraries(),

    addLibrary: async (params) => {
      const { root, name } = asParams<AddLibraryParams>(params);
      if (!root) throw new Error('root is required');
      const id = catalog.addLibrary(name?.trim() || root.split(/[\\/]/).filter(Boolean).pop() || 'library', root, 'local');
      // Index in the background; the UI follows progress over the event channel.
      void engine.indexer.runFastPass(id, root).catch(() => undefined);
      return catalog.getLibrary(id);
    },

    removeLibrary: (params) => {
      const { id } = asParams<AssetIdParams>(params);
      catalog.removeLibrary(id);
      return { ok: true };
    },

    rescanLibrary: async (params) => {
      const { id } = asParams<AssetIdParams>(params);
      const library = catalog.getLibrary(id);
      if (!library) throw new Error(`library ${id} not found`);
      const job = await engine.indexer.runFastPass(id, library.root);
      return job;
    },

    ucsTree: () => {
      const counts = new Map<string, number>();
      const rows = catalog.db
        .prepare(
          `SELECT COALESCE(c.category, '(未分类)') AS category, COUNT(*) AS n
           FROM assets a LEFT JOIN ucs_categories c ON c.catId = a.ucsCatId GROUP BY 1`,
        )
        .all() as Array<{ category: string; n: number }>;
      for (const row of rows) counts.set(row.category, row.n);

      const subRows = catalog.db
        .prepare('SELECT ucsCatId, COUNT(*) AS n FROM assets WHERE ucsCatId IS NOT NULL GROUP BY 1')
        .all() as Array<{ ucsCatId: string; n: number }>;
      const subCounts = new Map(subRows.map((row) => [row.ucsCatId, row.n] as const));

      const tree = engine.ucs.categories().map((category) => ({
        category,
        count: counts.get(category) ?? 0,
        children: engine.ucs.catIdsInCategory(category).map((catId) => ({
          catId,
          label: engine.ucs.get(catId)?.subCategory ?? catId,
          count: subCounts.get(catId) ?? 0,
        })),
      }));
      return { tree, uncategorized: counts.get('(未分类)') ?? 0 };
    },

    ucsLookup: (params) => {
      const { term } = asParams<UcsLookupParams>(params);
      return engine.ucs.lookup(term ?? '');
    },

    stats: () => ({ ...catalog.stats(), dbBytes: 0, modelsReady: false }),

    jobs: () => engine.indexer.listJobs(),

    cancelJob: (params) => {
      const { id } = asParams<CancelJobParams>(params);
      return { ok: engine.indexer.cancel(id) };
    },

    embeddedInfo: async (params) => {
      const { id } = asParams<AssetIdParams>(params);
      const row = catalog.getAssetRow(id);
      if (!row) throw new Error(`asset ${id} not found`);
      const assetPath = String(row.path ?? '');
      const editable = isEditableWav(assetPath);
      return {
        editable,
        reason: editable ? null : '只支持 WAV/BWF 写回',
        hasBackup: await hasBackup(engine.dataDir, assetPath),
        embedded: rowToAsset(row).embedded,
      };
    },

    updateEmbedded: async (params) => {
      const { id, fields, confirm } = asParams<{
        id: number;
        fields: Record<string, unknown>;
        confirm: boolean;
      }>(params);
      const row = catalog.getAssetRow(id);
      if (!row) throw new Error(`asset ${id} not found`);
      const assetPath = String(row.path ?? '');
      if (!isEditableWav(assetPath)) {
        throw new Error('只支持写回 WAV/BWF 文件；其他格式写回会改变音频本身，因此被拒绝。');
      }
      if (confirm !== true) throw new Error('写回原文件需要显式确认');

      const result = await updateWavMetadataFields(assetPath, fields, {
        backupDir: path.join(engine.dataDir, 'backups'),
      });
      if (result.changed) {
        // The file changed under us; re-read just this asset.
        const library = catalog.getLibrary(Number(row.libraryId));
        await engine.indexer.indexMetadata(
          id,
          {
            path: assetPath,
            dir: path.dirname(assetPath),
            filename: String(row.filename ?? path.basename(assetPath)),
            extension: String(row.extension ?? path.extname(assetPath)),
            sizeBytes: statSync(assetPath).size,
            mtimeMs: Math.floor(statSync(assetPath).mtimeMs),
          },
          Number(row.libraryId),
          library?.root ?? path.dirname(assetPath),
        );
      }
      const updated = catalog.getAssetRow(id);
      if (!updated) throw new Error(`asset ${id} disappeared`);
      return { ...result, asset: rowToAsset(updated) };
    },

    restoreEmbedded: async (params) => {
      const { id } = asParams<AssetIdParams>(params);
      const row = catalog.getAssetRow(id);
      if (!row) throw new Error(`asset ${id} not found`);
      return { restored: await restoreFromBackup(engine.dataDir, String(row.path ?? '')) };
    },

    /**
     * Save an effect-chain export the webview rendered offline.
     *
     * The webview does the rendering because it owns the Web Audio
     * implementation that previewed the sound; the extension host only writes the
     * bytes. Same safety rules as the HTTP route: a new file, never an overwrite,
     * and only inside the library or the export folder.
     */
    saveExport: async (params) => {
      const { assetId, filename, bytes } = asParams<{
        assetId: number;
        filename: string;
        bytes: Uint8Array;
      }>(params);
      const row = catalog.getAssetRow(assetId);
      if (!row) throw new Error(`asset ${assetId} not found`);
      const library = row.libraryId !== null ? catalog.getLibrary(Number(row.libraryId)) : null;
      return saveExport({
        allowedRoots: exportRootsFor(library?.root ?? null, engine.dataDir),
        filename: filename && filename.length > 0 ? filename : String(row.filename ?? 'export.wav'),
        bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
      });
    },

    listExports: (params) => {
      const { libraryId } = asParams<{ libraryId?: number }>(params);
      const library = libraryId !== undefined ? catalog.getLibrary(libraryId) : null;
      // Exports land next to their source, so an unscoped listing has to visit
      // every library rather than only the data directory.
      const roots = library
        ? [library.root]
        : [...catalog.listLibraries().map((l) => l.root), engine.dataDir];
      const files = [...new Set(roots.flatMap((root) => listExports(root, engine.dataDir)))];
      return { files: library ? files.filter((file) => isInside(library.root, file)) : files };
    },

    deleteExports: (params) => {
      const { paths, libraryId } = asParams<{ paths?: string[]; libraryId?: number }>(params);
      const library = libraryId !== undefined ? catalog.getLibrary(libraryId) : null;
      const roots = library
        ? exportRootsFor(library.root, engine.dataDir)
        : [...catalog.listLibraries().map((l) => l.root), ...exportRootsFor(null, engine.dataDir)];
      return deleteExports(paths ?? [], roots);
    },

    // -- personalised ranking (plan P2-3) --------------------------------
    personalization: () => ({
      enabled: catalog.personalizationEnabled(),
      events: catalog.countUsageEvents(),
      assets: catalog.countUsageAssets(),
      maxAdjustment: 0.1,
    }),

    setPersonalization: (params) => {
      const { enabled } = asParams<{ enabled?: boolean }>(params);
      if (typeof enabled !== 'boolean') throw new Error('enabled 必须是布尔值');
      catalog.setPersonalizationEnabled(enabled);
      return {
        enabled: catalog.personalizationEnabled(),
        events: catalog.countUsageEvents(),
        assets: catalog.countUsageAssets(),
        maxAdjustment: 0.1,
      };
    },

    recordUsage: (params) => {
      const { assetId, kind, query } = asParams<{ assetId?: number; kind?: string; query?: string | null }>(params);
      if (typeof assetId !== 'number' || typeof kind !== 'string') throw new Error('需要 assetId 与 kind');
      catalog.recordUsage(assetId, kind, query ?? null);
      return { ok: true };
    },

    clearUsage: () => ({ removed: catalog.clearUsage() }),

    // -- playlists (plan P1-3) -------------------------------------------
    playlists: () => ({ playlists: playlists.list() }),

    playlist: (params) => {
      const { id } = asParams<{ id?: number }>(params);
      if (typeof id !== 'number') throw new Error('需要 id');
      const playlist = playlists.get(id);
      if (!playlist) throw new Error('播放列表不存在');
      return { ...playlist, items: playlists.items(id) };
    },

    createPlaylist: (params) => {
      const { name } = asParams<{ name?: string }>(params);
      return playlists.create(name ?? '');
    },

    renamePlaylist: (params) => {
      const { id, name } = asParams<{ id?: number; name?: string }>(params);
      if (typeof id !== 'number') throw new Error('需要 id');
      return playlists.rename(id, name ?? '');
    },

    removePlaylist: (params) => {
      const { id } = asParams<{ id?: number }>(params);
      if (typeof id !== 'number') throw new Error('需要 id');
      return { ok: playlists.remove(id) };
    },

    addToPlaylist: (params) => {
      const { id, assetIds } = asParams<{ id?: number; assetIds?: number[] }>(params);
      if (typeof id !== 'number') throw new Error('需要 id');
      return { count: addToPlaylist(playlists, id, assetIds ?? []).length };
    },

    removeFromPlaylist: (params) => {
      const { id, assetIds } = asParams<{ id?: number; assetIds?: number[] }>(params);
      if (typeof id !== 'number') throw new Error('需要 id');
      if (!assetIds || assetIds.length === 0) throw new Error('没有要移除的素材');
      return { count: removeFromPlaylist(playlists, id, assetIds).length };
    },

    reorderPlaylist: (params) => {
      const { id, assetId, toIndex } = asParams<{ id?: number; assetId?: number; toIndex?: number }>(params);
      if (typeof id !== 'number' || typeof assetId !== 'number' || typeof toIndex !== 'number') {
        throw new Error('需要 id、assetId 与 toIndex');
      }
      const order = moveWithinOrder(playlists.itemIds(id), assetId, toIndex);
      playlists.setItemIds(id, order);
      return { ok: true, order };
    },

    // -- sidecar backup / import (plan P1-3) ------------------------------
    inspectBackup: (params) => {
      const { backup } = asParams<{ backup?: unknown }>(params);
      const parsed = parseBackup(backup);
      const plan = planImport(parsed, catalog.sidecarCandidates());
      return { backup: parsed.counts, plan: summarizePlan(plan) };
    },

    importBackup: (params) => {
      const { backup, overwrite, includeHistory, includePlaylists } = asParams<{
        backup?: unknown;
        overwrite?: boolean;
        includeHistory?: boolean;
        includePlaylists?: boolean;
      }>(params);
      // The webview shows the dry run first, so arriving here is the confirmation.
      const parsed = parseBackup(backup);
      const plan = planImport(parsed, catalog.sidecarCandidates());
      const result = applyImport(catalog, parsed, plan, {
        overwrite: overwrite === true,
        includeHistory: includeHistory !== false,
        includePlaylists: includePlaylists !== false,
      });
      return { plan: summarizePlan(plan), result };
    },
  };

  return async (method: string, params: unknown): Promise<unknown> => {
    const handler = handlers[method];
    if (!handler) throw new Error(`unsupported engine method "${method}"`);
    return handler(params);
  };
}
