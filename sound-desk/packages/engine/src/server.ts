/**
 * Local HTTP + WebSocket server.
 *
 * Security model (this is a local service that can read arbitrary audio files
 * from disk, so it must not be reachable by a random web page):
 *   - binds to 127.0.0.1 only, on an OS-assigned port (no fixed port to guess)
 *   - a 32-byte random session token, required on every /api request
 *   - the Origin header is validated against a whitelist (browser CSRF defence,
 *     and the mechanism that lets the VSCode webview talk to us)
 *   - media is addressed by asset id only; the client can never hand us a path
 *   - any path-based lookup is resolved and checked to live inside a
 *     registered library root
 */

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';

import { WebSocketServer, type WebSocket } from 'ws';
import { hasBackup, isEditableWav, restoreFromBackup, updateWavMetadataFields } from '@sounddesk/audio-wav';
import {
  DEFAULT_SEARCH_LIMIT,
  EMBEDDING_DIM,
  SIMILARITY_THRESHOLD,
  type JobProgress,
  type ServerEvent,
  type SearchRequest,
} from '@sounddesk/core';

import type { Catalog } from './db.js';
import type { Indexer, JobState } from './indexer.js';
import type { SearchService, VectorIndex } from './search.js';
import { rowToAsset, rowToSummary } from './mappers.js';
import { streamPeaksFor } from './peaks.js';
import { errorMessage } from './indexer.js';
import { ExportError, deleteExports, exportRootsFor, isInside, listExports, saveExport } from './export.js';

export interface ServerOptions {
  catalog: Catalog;
  indexer: Indexer;
  searchService: SearchService;
  vectorIndex: VectorIndex;
  ucs: {
    list(): Array<{ catId: string; category: string; subCategory: string; synonymsEn: string[]; synonymsZh: string[]; excludes: string[] }>;
    categories(): string[];
    catIdsInCategory(category: string): string[];
    get(catId: string): unknown;
  };
  /** optional directory of built web assets to serve at / */
  webRoot?: string | null;
  /** extra allowed origins, e.g. the VSCode webview */
  allowedOrigins?: string[];
  /** re-run classification for one file and return the refreshed candidates */
  reclassify?: (assetPath: string) => Promise<unknown>;
  /** re-read one asset after its file changed on disk (metadata write-back) */
  reindexAsset?: (assetId: number) => Promise<void>;
  /** lookup helper backing /api/ucs/lookup */
  reclassifyLookup?: (term: string) => unknown[];
  host?: string;
  port?: number;
  log?: (msg: string) => void;
}

export interface RunningServer {
  port: number;
  token: string;
  url: string;
  close(): Promise<void>;
}

const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Exports are rendered audio, so they need a much larger ceiling than a JSON
 * request. 512 MB is roughly 30 minutes of 48 kHz 24-bit stereo — far beyond any
 * single sound effect, and `saveExport` enforces the same figure.
 */
const MAX_EXPORT_BYTES = 512 * 1024 * 1024;

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const log = opts.log ?? (() => {});
  const token = randomBytes(32).toString('base64url');
  const host = opts.host ?? '127.0.0.1';
  const allowedOrigins = new Set(opts.allowedOrigins ?? []);
  const sockets = new Set<WebSocket>();

  const broadcast = (event: ServerEvent): void => {
    const payload = JSON.stringify(event);
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  };

  opts.indexer.on('job', (job: JobState) => broadcast({ type: 'job', job: toJobProgress(job) }));
  opts.indexer.on('library.changed', (payload: { libraryId: number; assetCount: number }) =>
    broadcast({ type: 'library.changed', ...payload }),
  );

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      sendJson(res, 500, { error: errorMessage(err) });
    });
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${host}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    // Browsers cannot set headers on a WebSocket handshake, so the token rides
    // in the query string. The Origin check still applies.
    if (!safeEqual(url.searchParams.get('token') ?? '', token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    if (!originAllowed(req, host, allowedOrigins)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.add(ws);
      ws.on('close', () => sockets.delete(ws));
      ws.on('error', () => sockets.delete(ws));
      send(ws, {
        type: 'hello',
        serverVersion: '0.1.0',
        capabilities: {
          semantic: opts.vectorIndex.size > 0 || (opts.searchService as unknown as { embedderReady?: boolean }).embedderReady === true,
          embeddingModel: null,
          llmRewrite: false,
          waveform: true,
        },
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, host, () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('failed to bind server');
  const port = address.port;

  function originAllowed(req: IncomingMessage, bindHost: string, extra: Set<string>): boolean {
    const origin = req.headers.origin;
    // Non-browser clients (curl, tests, the VSCode extension host) send no Origin.
    if (!origin) return true;
    if (extra.has(origin)) return true;
    if (origin === `http://${bindHost}:${port}` || origin === `http://localhost:${port}`) return true;
    if (origin.startsWith('vscode-webview://')) return true;
    return false;
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${host}:${port}`);
    const pathname = url.pathname;

    if (!originAllowed(req, host, allowedOrigins)) {
      sendJson(res, 403, { error: 'origin not allowed' });
      return;
    }

    // ---- unauthenticated endpoints -----------------------------------
    if (pathname === '/api/health') {
      sendJson(res, 200, { ok: true, version: '0.1.0' });
      return;
    }

    // ---- everything else needs the token -----------------------------
    if (pathname.startsWith('/api/')) {
      const header = req.headers['x-sounddesk-token'];
      const fromHeader = Array.isArray(header) ? header[0] : header;
      // Media is requested by <audio>, <img> and waveform fetches, none of which
      // can attach a custom header — so the token is also accepted as a query
      // parameter, exactly like the WebSocket handshake.
      const fromQuery = url.searchParams.get('token');
      const value = fromHeader ?? fromQuery;
      if (!value || !safeEqual(value, token)) {
        sendJson(res, 401, { error: 'missing or invalid token' });
        return;
      }
    }

    try {
      await route(req, res, url, pathname);
    } catch (err) {
      sendJson(res, 500, { error: errorMessage(err) });
    }
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL, pathname: string): Promise<void> {
    const method = req.method ?? 'GET';

    // -- session --------------------------------------------------------
    if (pathname === '/api/session' && method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        serverVersion: '0.1.0',
        embeddingDim: EMBEDDING_DIM,
        similarityThreshold: SIMILARITY_THRESHOLD,
        webRoot: opts.webRoot ?? null,
      });
      return;
    }

    // -- libraries ------------------------------------------------------
    if (pathname === '/api/libraries' && method === 'GET') {
      sendJson(res, 200, { libraries: opts.catalog.listLibraries() });
      return;
    }

    if (pathname === '/api/libraries' && method === 'POST') {
      const body = await readJson<{ root?: string; name?: string; kind?: string }>(req);
      if (!body.root) {
        sendJson(res, 400, { error: 'root is required' });
        return;
      }
      const resolved = path.resolve(body.root);
      const st = await stat(resolved).catch(() => null);
      if (!st || !st.isDirectory()) {
        sendJson(res, 400, { error: `not a directory: ${resolved}` });
        return;
      }
      const name = body.name?.trim() || path.basename(resolved);
      const kind = body.kind === 'nas' ? 'nas' : 'local';
      const id = opts.catalog.addLibrary(name, resolved, kind);
      // Index in the background so the request returns immediately.
      void opts.indexer.runFastPass(id, resolved).catch((err) => log(`scan failed: ${errorMessage(err)}`));
      sendJson(res, 201, { id, name, root: resolved, kind });
      return;
    }

    const libraryMatch = /^\/api\/libraries\/(\d+)$/.exec(pathname);
    if (libraryMatch && method === 'DELETE') {
      const id = Number(libraryMatch[1]);
      opts.catalog.removeLibrary(id);
      broadcast({ type: 'library.changed', libraryId: id, assetCount: 0 });
      sendJson(res, 200, { ok: true, removedFiles: false });
      return;
    }

    if (libraryMatch && method === 'GET') {
      const id = Number(libraryMatch[1]);
      const library = opts.catalog.getLibrary(id);
      if (!library) {
        sendJson(res, 404, { error: 'library not found' });
        return;
      }
      sendJson(res, 200, library);
      return;
    }

    const rescanMatch = /^\/api\/libraries\/(\d+)\/rescan$/.exec(pathname);
    if (rescanMatch && method === 'POST') {
      const id = Number(rescanMatch[1]);
      const library = opts.catalog.getLibrary(id);
      if (!library) {
        sendJson(res, 404, { error: 'library not found' });
        return;
      }
      const job = await opts.indexer.runFastPass(id, library.root);
      sendJson(res, 200, { job: toJobProgress(job) });
      return;
    }

    // -- search ---------------------------------------------------------
    if (pathname === '/api/search' && method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      const filters = parseFilters(url);
      const response = await opts.searchService.search({
        q,
        mode: (url.searchParams.get('mode') as SearchRequest['mode']) ?? 'hybrid',
        limit: Number(url.searchParams.get('limit') ?? DEFAULT_SEARCH_LIMIT),
        offset: Number(url.searchParams.get('offset') ?? 0),
        vectorField: url.searchParams.get('vectorField') === 'onset' ? 'onset' : 'mean',
        filters,
        explain: url.searchParams.get('explain') === '1',
      });
      sendJson(res, 200, response);
      return;
    }

    if (pathname === '/api/search' && method === 'POST') {
      const body = await readJson<SearchRequest>(req);
      const response = await opts.searchService.search(body);
      sendJson(res, 200, response);
      return;
    }

    const similarMatch = /^\/api\/search\/similar\/(\d+)$/.exec(pathname);
    if (similarMatch && method === 'GET') {
      const assetId = Number(similarMatch[1]);
      const response = await opts.searchService.search({
        q: '',
        mode: 'similar',
        similarToAssetId: assetId,
        limit: Number(url.searchParams.get('limit') ?? DEFAULT_SEARCH_LIMIT),
        vectorField: url.searchParams.get('vectorField') === 'onset' ? 'onset' : 'mean',
      });
      sendJson(res, 200, response);
      return;
    }

    // -- assets ---------------------------------------------------------
    if (pathname === '/api/assets' && method === 'GET') {
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const libraryId = url.searchParams.get('libraryId');
      const where = libraryId ? 'WHERE libraryId = ?' : '';
      const params: unknown[] = libraryId ? [Number(libraryId)] : [];
      const rows = opts.catalog.db
        .prepare(
          `SELECT a.*, l.root AS libraryRoot FROM assets a
           LEFT JOIN libraries l ON l.id = a.libraryId
           ${libraryId ? 'WHERE a.libraryId = ?' : ''}
           ORDER BY a.filename LIMIT ? OFFSET ?`,
        )
        .all(...(params as never[]), limit, offset) as Array<Record<string, unknown>>;
      const total = opts.catalog.db
        .prepare(`SELECT COUNT(*) AS n FROM assets ${where}`)
        .get(...(params as never[])) as { n: number };
      sendJson(res, 200, { items: rows.map(rowToSummary), total: total.n, limit, offset });
      return;
    }

    const assetMatch = /^\/api\/assets\/(\d+)$/.exec(pathname);
    if (assetMatch && method === 'GET') {
      const row = opts.catalog.getAssetRow(Number(assetMatch[1]));
      if (!row) {
        sendJson(res, 404, { error: 'asset not found' });
        return;
      }
      sendJson(res, 200, rowToAsset(row));
      return;
    }

    if (assetMatch && method === 'PATCH') {
      const id = Number(assetMatch[1]);
      const row = opts.catalog.getAssetRow(id);
      if (!row) {
        sendJson(res, 404, { error: 'asset not found' });
        return;
      }
      const body = await readJson<{ tags?: string[]; favorite?: boolean; rating?: number; ucsCatId?: string | null }>(req);
      if (body.tags) opts.catalog.setTags(id, body.tags);
      if (typeof body.favorite === 'boolean') opts.catalog.setFavorite(id, body.favorite);
      if (typeof body.rating === 'number') opts.catalog.setRating(id, body.rating);
      if (body.ucsCatId !== undefined) {
        // A user correction is recorded as `manual` and is then authoritative.
        opts.catalog.applyClassification(id, {
          catId: body.ucsCatId,
          confidence: 1,
          source: 'manual',
          alternatives: [],
        });
        opts.catalog.db
          .prepare('INSERT INTO feedback(assetId, oldCat, newCat, at) VALUES (?, ?, ?, ?)')
          .run(id, String(row.ucsCatId ?? ''), String(body.ucsCatId ?? ''), Date.now());
      }
      sendJson(res, 200, rowToAsset(opts.catalog.getAssetRow(id)!));
      return;
    }

    const reclassifyMatch = /^\/api\/assets\/(\d+)\/reclassify$/.exec(pathname);
    if (reclassifyMatch && method === 'POST') {
      const id = Number(reclassifyMatch[1]);
      const row = opts.catalog.getAssetRow(id);
      if (!row) {
        sendJson(res, 404, { error: 'asset not found' });
        return;
      }
      const asset = rowToAsset(row);
      const result = await opts.reclassify?.(asset.path);
      sendJson(res, 200, result ?? { catId: asset.ucsCatId, alternatives: asset.ucsAlternatives ?? [] });
      return;
    }

    // -- embedded metadata editing (writes into the file) ---------------
    const embeddedMatch = /^\/api\/assets\/(\d+)\/embedded$/.exec(pathname);
    if (embeddedMatch && method === 'PUT') {
      const id = Number(embeddedMatch[1]);
      const row = opts.catalog.getAssetRow(id);
      if (!row) {
        sendJson(res, 404, { error: 'asset not found' });
        return;
      }
      const assetPath = String(row.path ?? '');

      if (!isEditableWav(assetPath)) {
        sendJson(res, 415, {
          error: '只支持写回 WAV/BWF 文件',
          detail: '其他格式写回会改变音频本身，因此被拒绝。可以改用「我的标签」，那存在旁挂数据里。',
        });
        return;
      }

      const body = await readJson<{
        description?: string;
        keywords?: string[];
        designer?: string;
        recorder?: string;
        library?: string;
        copyright?: string;
        scene?: string;
        take?: string;
        note?: string;
        /** must be literally true — the UI shows a confirmation first */
        confirm?: boolean;
        dryRun?: boolean;
      }>(req);

      if (body.confirm !== true) {
        sendJson(res, 428, { error: '写回原文件需要显式确认（confirm: true）' });
        return;
      }

      const result = await updateWavMetadataFields(
        assetPath,
        {
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.keywords !== undefined ? { keywords: body.keywords } : {}),
          ...(body.designer !== undefined ? { designer: body.designer } : {}),
          ...(body.recorder !== undefined ? { recorder: body.recorder } : {}),
          ...(body.library !== undefined ? { library: body.library } : {}),
          ...(body.copyright !== undefined ? { copyright: body.copyright } : {}),
          ...(body.scene !== undefined ? { scene: body.scene } : {}),
          ...(body.take !== undefined ? { take: body.take } : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
        },
        { backupDir: path.join(opts.catalog.dataDir, 'backups'), dryRun: body.dryRun === true },
      );

      // The file's embedded metadata changed, so the catalogue row is stale.
      if (result.changed && body.dryRun !== true) {
        try {
          await opts.reindexAsset?.(id);
        } catch (err) {
          log(`reindex after write failed: ${errorMessage(err)}`);
        }
      }

      sendJson(res, 200, {
        changed: result.changed,
        backupPath: result.backupPath,
        warnings: result.warnings,
        bytesBefore: result.bytesBefore,
        bytesAfter: result.bytesAfter,
        chunkIds: result.chunkIds,
        asset: rowToAsset(opts.catalog.getAssetRow(id)!),
      });
      return;
    }

    const embeddedGet = /^\/api\/assets\/(\d+)\/embedded$/.exec(pathname);
    if (embeddedGet && method === 'GET') {
      const id = Number(embeddedGet[1]);
      const row = opts.catalog.getAssetRow(id);
      if (!row) {
        sendJson(res, 404, { error: 'asset not found' });
        return;
      }
      const asset = rowToAsset(row);
      sendJson(res, 200, {
        editable: isEditableWav(asset.path),
        reason: isEditableWav(asset.path) ? null : '只支持 WAV/BWF 写回',
        hasBackup: await hasBackup(opts.catalog.dataDir, asset.path),
        embedded: asset.embedded,
      });
      return;
    }

    const restoreMatch = /^\/api\/assets\/(\d+)\/embedded\/restore$/.exec(pathname);
    if (restoreMatch && method === 'POST') {
      const id = Number(restoreMatch[1]);
      const row = opts.catalog.getAssetRow(id);
      if (!row) {
        sendJson(res, 404, { error: 'asset not found' });
        return;
      }
      const assetPath = String(row.path ?? '');
      const restored = await restoreFromBackup(opts.catalog.dataDir, assetPath);
      if (restored) {
        try {
          await opts.reindexAsset?.(id);
        } catch {
          /* the restore itself succeeded; the row will catch up on next scan */
        }
      }
      sendJson(res, restored ? 200 : 404, { restored });
      return;
    }

    // -- media ----------------------------------------------------------
    const streamMatch = /^\/api\/media\/(\d+)\/stream$/.exec(pathname);
    if (streamMatch && (method === 'GET' || method === 'HEAD')) {
      await streamAudio(req, res, Number(streamMatch[1]));
      return;
    }

    const peaksMatch = /^\/api\/media\/(\d+)\/peaks$/.exec(pathname);
    if (peaksMatch && method === 'GET') {
      const id = Number(peaksMatch[1]);
      const peaks = await streamPeaksFor(opts.catalog, id);
      if (!peaks) {
        sendJson(res, 404, { error: 'peaks not built for this asset yet' });
        return;
      }
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': String(peaks.byteLength),
        'cache-control': 'private, max-age=3600',
      });
      res.end(peaks);
      return;
    }

    /**
     * Whole-file download with the original file name.
     *
     * Exists for the "drag out to the Desktop / a DAW" flow (plan P2-2). The
     * stream route is for `<audio>` and sends no `Content-Disposition`, so a
     * dragged or downloaded copy would land as `12345` with no extension. Here the
     * name matters more than streaming, so Range is not offered.
     *
     * `filename*` carries the UTF-8 name (these libraries are full of Chinese and
     * accented names); the quoted ASCII fallback keeps older clients working.
     */
    const downloadMatch = /^\/api\/media\/(\d+)\/download$/.exec(pathname);
    if (downloadMatch && (method === 'GET' || method === 'HEAD')) {
      const id = Number(downloadMatch[1]);
      const row = opts.catalog.getAssetRow(id);
      if (!row) {
        sendJson(res, 404, { error: 'asset not found' });
        return;
      }
      const assetPath = String(row.path ?? '');
      // Same containment rule as streaming: the client addresses assets by id and
      // can never hand us a path.
      if (!assetPath || !isInsideAnyLibraryRoot(assetPath)) {
        sendJson(res, 403, { error: 'file is outside every library root' });
        return;
      }
      let st;
      try {
        st = await stat(assetPath);
      } catch {
        sendJson(res, 404, { error: 'file missing on disk' });
        return;
      }

      const name = String(row.filename ?? path.basename(assetPath));
      const asciiFallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
      res.writeHead(200, {
        'content-type': mimeFor(assetPath),
        'content-length': String(st.size),
        'content-disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'cache-control': 'private, max-age=600',
      });
      if (method === 'HEAD') {
        res.end();
        return;
      }
      createReadStream(assetPath).pipe(res);
      return;
    }

    // -- ucs ------------------------------------------------------------
    if (pathname === '/api/ucs/tree' && method === 'GET') {
      const counts = new Map<string, number>();
      const rows = opts.catalog.db
        .prepare(
          `SELECT COALESCE(c.category, '(未分类)') AS category, COUNT(*) AS n
           FROM assets a LEFT JOIN ucs_categories c ON c.catId = a.ucsCatId
           GROUP BY 1`,
        )
        .all() as Array<{ category: string; n: number }>;
      for (const r of rows) counts.set(r.category, r.n);

      const subRows = opts.catalog.db
        .prepare('SELECT ucsCatId, COUNT(*) AS n FROM assets WHERE ucsCatId IS NOT NULL GROUP BY 1')
        .all() as Array<{ ucsCatId: string; n: number }>;
      const subCounts = new Map(subRows.map((r) => [r.ucsCatId, r.n] as const));

      const tree = opts.ucs.categories().map((category) => ({
        category,
        count: counts.get(category) ?? 0,
        children: opts.ucs.catIdsInCategory(category).map((catId) => {
          const entry = opts.ucs.get(catId) as { subCategory?: string } | null;
          return {
            catId,
            label: entry?.subCategory ?? catId,
            count: subCounts.get(catId) ?? 0,
          };
        }),
      }));
      const uncategorized = counts.get('(未分类)') ?? 0;
      sendJson(res, 200, { tree, uncategorized });
      return;
    }

    if (pathname === '/api/ucs/lookup' && method === 'GET') {
      const term = url.searchParams.get('q') ?? '';
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 10), 50);
      sendJson(res, 200, { query: term, matches: opts.reclassifyLookup?.(term)?.slice(0, limit) ?? [] });
      return;
    }

    // -- jobs & stats ---------------------------------------------------
    if (pathname === '/api/jobs' && method === 'GET') {
      sendJson(res, 200, { jobs: opts.indexer.listJobs().map(toJobProgress) });
      return;
    }

    const cancelMatch = /^\/api\/jobs\/([\w-]+)\/cancel$/.exec(pathname);
    if (cancelMatch && method === 'POST') {
      const id = cancelMatch[1]!;
      const ok = opts.indexer.cancel(id);
      sendJson(res, ok ? 200 : 404, { ok });
      return;
    }

    if (pathname === '/api/stats' && method === 'GET') {
      const stats = opts.catalog.stats();
      sendJson(res, 200, {
        ...stats,
        dbBytes: await fileSize(path.join(opts.catalog.dataDir, 'catalog.db')),
        // Answer this from the live embedder rather than a constant: the UI uses
        // it to decide whether to offer semantic search at all.
        modelsReady: opts.searchService.embedderReady,
      });
      return;
    }

    // -- export: save a client-rendered effect-chain result -----------------
    //
    // The browser renders through OfflineAudioContext and posts the finished WAV.
    // Rendering server-side would mean reimplementing Web Audio in Node; the
    // client already has a spec-compliant implementation and the decoded audio.
    if (pathname === '/api/export/save' && method === 'POST') {
      const assetId = Number(url.searchParams.get('assetId'));
      const row = Number.isFinite(assetId) ? opts.catalog.getAssetRow(assetId) : undefined;
      if (!row) {
        sendJson(res, 404, { error: 'asset not found' });
        return;
      }

      // `getAssetRow` deliberately does not join the library, so look it up.
      const libraryId = row.libraryId !== null && row.libraryId !== undefined ? Number(row.libraryId) : null;
      const libraryRoot = libraryId !== null ? opts.catalog.getLibrary(libraryId)?.root ?? null : null;
      const roots = exportRootsFor(libraryRoot, opts.catalog.dataDir);
      const requestedDir = url.searchParams.get('directory');
      const requestedName = url.searchParams.get('filename');

      const bytes = await readBinary(req, MAX_EXPORT_BYTES);
      try {
        const result = saveExport({
          allowedRoots: roots,
          directory: requestedDir,
          // Always derived from the asset, never trusted from the client.
          filename: requestedName && requestedName.length > 0 ? requestedName : String(row.filename ?? 'export.wav'),
          bytes,
        });
        sendJson(res, 201, {
          ok: true,
          filePath: result.filePath,
          bytes: result.bytes,
          renamed: result.renamed,
          directory: path.dirname(result.filePath),
        });
      } catch (err) {
        if (err instanceof ExportError) {
          sendJson(res, err.status, { error: err.message });
          return;
        }
        throw err;
      }
      return;
    }

    // -- export: list and remove this tool's own rendered files ------------
    //
    // "Clean up my exports" needs care: a delete endpoint that removes whatever it
    // is told to is far worse than the clutter it fixes. So only files carrying
    // the export suffix, inside an allowed root, are ever touched, and the check
    // is repeated per path rather than trusted from the request.
    if (pathname === '/api/export/list' && method === 'GET') {
      const libraryId = Number(url.searchParams.get('libraryId'));
      const library = Number.isFinite(libraryId) ? opts.catalog.getLibrary(libraryId) : null;
      // Without a specific library, search every library plus the export folder.
      // Exports land next to their source, so a data-dir-only scan would report
      // an empty list while the files sit in plain sight in the library.
      const roots = library
        ? [library.root]
        : [...opts.catalog.listLibraries().map((l) => l.root), opts.catalog.dataDir];
      const files = roots.flatMap((root) => listExports(root, opts.catalog.dataDir));
      const unique = [...new Set(files)];
      sendJson(res, 200, { files: library ? unique.filter((file) => isInside(library.root, file)) : unique });
      return;
    }

    if (pathname === '/api/export/delete' && method === 'POST') {
      const body = await readJson<{ paths?: string[]; libraryId?: number }>(req);
      const paths = Array.isArray(body.paths) ? body.paths : [];
      if (paths.length === 0) {
        sendJson(res, 400, { error: '没有要删除的文件' });
        return;
      }
      const library = body.libraryId !== undefined ? opts.catalog.getLibrary(Number(body.libraryId)) : null;
      const roots = library
        ? exportRootsFor(library.root, opts.catalog.dataDir)
        : [...opts.catalog.listLibraries().map((l) => l.root), ...exportRootsFor(null, opts.catalog.dataDir)];
      sendJson(res, 200, deleteExports(paths, roots));
      return;
    }

    // -- drag-out test page ---------------------------------------------
    //
    // Served so the "drag a sound to the Desktop / a DAW" behaviour can actually be
    // verified by hand: browsers do not report the result of a drag initiated
    // inside a page, so there is no automated way to confirm a drop produced a
    // usable file. `/drop-test?token=…` is that confirmation, and it doubles as the
    // place to check what a host's webview really puts on the drag.
    if ((pathname === '/drop-test' || pathname === '/drop-test.html') && method === 'GET') {
      const html = await readFile(new URL('../assets/drop-test.html', import.meta.url)).catch(() => null);
      if (!html) {
        sendJson(res, 404, { error: 'drop-test.html not found next to the built server' });
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html);
      return;
    }

    // -- static web assets ---------------------------------------------
    if (opts.webRoot) {
      const served = await serveStatic(res, opts.webRoot, pathname);
      if (served) return;
    }

    sendJson(res, 404, { error: `no route for ${method} ${pathname}` });
  }

  /** HTTP Range streaming — required for instant playback and seeking. */
  async function streamAudio(req: IncomingMessage, res: ServerResponse, assetId: number): Promise<void> {
    const assetPath = opts.catalog.getAssetPath(assetId);
    if (!assetPath) {
      sendJson(res, 404, { error: 'asset not found' });
      return;
    }
    // Defence in depth: the path came from our own DB, but confirm it still sits
    // inside a registered library root before reading it.
    if (!isInsideAnyLibraryRoot(assetPath)) {
      sendJson(res, 403, { error: 'path outside registered libraries' });
      return;
    }

    const st = await stat(assetPath).catch(() => null);
    if (!st || !st.isFile()) {
      sendJson(res, 404, { error: 'file missing on disk' });
      return;
    }

    const total = st.size;
    const range = req.headers.range;
    const mime = mimeFor(assetPath);

    if (!range) {
      res.writeHead(200, {
        'content-type': mime,
        'content-length': String(total),
        'accept-ranges': 'bytes',
        'cache-control': 'private, max-age=600',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      createReadStream(assetPath).pipe(res);
      return;
    }

    const parsed = parseRange(range, total);
    if (!parsed) {
      res.writeHead(416, { 'content-range': `bytes */${total}` });
      res.end();
      return;
    }
    const { start, end } = parsed;
    res.writeHead(206, {
      'content-type': mime,
      'content-length': String(end - start + 1),
      'content-range': `bytes ${start}-${end}/${total}`,
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=600',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(assetPath, { start, end }).pipe(res);
  }

  function isInsideAnyLibraryRoot(candidate: string): boolean {
    const resolved = path.resolve(candidate);
    for (const lib of opts.catalog.listLibraries()) {
      const root = path.resolve(lib.root);
      const rel = path.relative(root, resolved);
      if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return true;
    }
    return false;
  }

  const url = `http://${host}:${port}`;
  log(`listening on ${url}`);

  return {
    port,
    token,
    url,
    async close(): Promise<void> {
      for (const ws of sockets) ws.close();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function toJobProgress(job: JobState): JobProgress {
  return {
    id: job.id,
    kind: job.kind,
    libraryId: job.libraryId,
    state: job.state,
    total: job.total,
    done: job.done,
    failed: job.failed,
    etaMs: job.etaMs,
    currentPath: job.currentPath,
    error: job.error,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
  };
}

function send(ws: WebSocket, event: ServerEvent): void {
  try {
    ws.send(JSON.stringify(event));
  } catch {
    /* socket already gone */
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(payload)),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new Error('request body too large');
    chunks.push(buf);
  }
  if (chunks.length === 0) return {} as T;
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

/** Read a raw request body, for endpoints that receive binary rather than JSON. */
async function readBinary(req: IncomingMessage, limit: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > limit) throw new Error(`request body too large (limit ${Math.round(limit / 1024 / 1024)}MB)`);
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function parseRange(header: string, total: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  let start: number;
  let end: number;
  if (rawStart === '') {
    // suffix range: last N bytes
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? total - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= total) return null;
  return { start, end: Math.min(end, total - 1) };
}

function mimeFor(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.wav':
    case '.bwf':
    case '.wave':
      return 'audio/wav';
    case '.mp3':
      return 'audio/mpeg';
    case '.flac':
      return 'audio/flac';
    case '.ogg':
    case '.oga':
      return 'audio/ogg';
    case '.opus':
      return 'audio/opus';
    case '.m4a':
    case '.mp4':
      return 'audio/mp4';
    case '.aif':
    case '.aiff':
    case '.aifc':
      return 'audio/aiff';
    default:
      return 'application/octet-stream';
  }
}

async function fileSize(p: string): Promise<number> {
  const st = await stat(p).catch(() => null);
  return st?.size ?? 0;
}

async function serveStatic(res: ServerResponse, root: string, pathname: string): Promise<boolean> {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, rel);

  // never serve outside the web root
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) return false;

  let data: Buffer;
  try {
    data = await readFile(target);
  } catch {
    // SPA fallback for client-side routes
    if (!path.extname(rel)) {
      try {
        data = await readFile(path.join(resolvedRoot, 'index.html'));
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(data);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  res.writeHead(200, {
    'content-type': staticMime(target),
    'content-length': String(data.byteLength),
    'cache-control': path.basename(target) === 'index.html' ? 'no-store' : 'public, max-age=3600',
  });
  res.end(data);
  return true;
}

function staticMime(p: string): string {
  switch (path.extname(p).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

function parseFilters(url: URL): SearchRequest['filters'] {
  const filters: NonNullable<SearchRequest['filters']> = {};
  const numList = (key: string): number[] | undefined => {
    const raw = url.searchParams.get(key);
    if (!raw) return undefined;
    const values = raw
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v));
    return values.length > 0 ? values : undefined;
  };
  const strList = (key: string): string[] | undefined => {
    const raw = url.searchParams.get(key);
    if (!raw) return undefined;
    const values = raw.split(',').map((v) => v.trim()).filter(Boolean);
    return values.length > 0 ? values : undefined;
  };

  filters.libraryIds = numList('libraryIds');
  filters.sampleRates = numList('sampleRates');
  filters.channels = numList('channels');
  filters.bitDepths = numList('bitDepths');
  filters.ucsCatIds = strList('ucsCatIds');
  filters.categories = strList('categories');
  filters.codecs = strList('codecs');
  filters.tags = strList('tags');
  const minDuration = url.searchParams.get('minDurationMs');
  if (minDuration) filters.minDurationMs = Number(minDuration);
  const maxDuration = url.searchParams.get('maxDurationMs');
  if (maxDuration) filters.maxDurationMs = Number(maxDuration);
  if (url.searchParams.get('favoritesOnly') === '1') filters.favoritesOnly = true;
  const minRating = url.searchParams.get('minRating');
  if (minRating) filters.minRating = Number(minRating);

  return Object.values(filters).some((v) => v !== undefined) ? filters : undefined;
}
