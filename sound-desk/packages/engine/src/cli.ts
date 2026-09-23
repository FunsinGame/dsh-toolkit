#!/usr/bin/env node
/**
 * SoundDesk engine CLI.
 *
 *   sounddesk                      start the server (loads the model if present)
 *   sounddesk --no-model           start without attempting a model download
 *   sounddesk --add <dir> [name]   register a library and index it, then serve
 *   sounddesk --port 8080          bind a specific port (default: OS-assigned)
 *   sounddesk --open               open the UI in the default browser
 *
 * The server prints its URL and token, and also writes them to
 * `<dataDir>/runtime.json` so the web UI and the VSCode extension can discover
 * them without scraping stdout.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';

import { createApp, defaultDataDir, readRuntimeFile, writeRuntimeFile } from './index.js';
import { startServer, type RunningServer } from './server.js';
import { rowToAsset } from './mappers.js';
import { errorMessage } from './indexer.js';

interface Args {
  dataDir: string;
  port: number;
  host: string;
  loadModel: boolean;
  open: boolean;
  add: string | null;
  addName: string | null;
  webRoot: string | null;
  scanOnly: boolean;
  printUrl: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dataDir: defaultDataDir(),
    port: 0,
    host: '127.0.0.1',
    loadModel: true,
    open: false,
    add: null,
    addName: null,
    webRoot: null,
    scanOnly: false,
    printUrl: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    switch (a) {
      case '--data-dir':
        args.dataDir = argv[++i] ?? args.dataDir;
        break;
      case '--port':
        args.port = Number(argv[++i] ?? 0);
        break;
      case '--host':
        args.host = argv[++i] ?? args.host;
        break;
      case '--no-model':
      case '--keyword-only':
        args.loadModel = false;
        break;
      case '--open':
        args.open = true;
        break;
      case '--scan-only':
        args.scanOnly = true;
        break;
      case '--print-url':
        args.printUrl = true;
        break;
      case '--web-root':
        args.webRoot = argv[++i] ?? null;
        break;
      case '--add':
        args.add = argv[++i] ?? null;
        args.addName = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[++i]! : null;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        break;
    }
  }
  return args;
}

function printHelp(): void {
  process.stdout.write(
    [
      'SoundDesk — local-first AI audio asset manager',
      '',
      'Usage: sounddesk [options]',
      '',
      '  --add <dir> [name]   register a directory as a library and index it',
      '  --data-dir <dir>     where catalog.db / models / peaks live (default ~/.sounddesk)',
      '  --port <n>           bind a specific port (default: OS-assigned)',
      '  --host <addr>        bind address (default 127.0.0.1 — do not expose this)',
      '  --no-model           skip the CLAP model download (keyword search only)',
      '  --web-root <dir>     serve a built web UI from this directory',
      '  --scan-only          index the library then exit (no server)',
      '  --print-url          print the running server\'s session URL and exit',
      '  --open               open the UI in the default browser',
      '  -h, --help           show this help',
      '',
    ].join('\n'),
  );
}

const argv = process.argv.slice(2);
const args = parseArgs(argv);

if (args.help) {
  printHelp();
  process.exit(0);
}

// Answer "what was my URL again?" without starting a second server. The token
// rotates on every start, so an address from an earlier session is stale and a
// fresh start would not help the user reach the *running* instance.
if (args.printUrl) {
  const info = readRuntimeFile(args.dataDir);
  if (!info) {
    process.stderr.write(
      `[sounddesk] no running server found for ${args.dataDir}\n` +
        '  start one with: sounddesk --open\n',
    );
    process.exit(1);
  }
  process.stdout.write(`${info.url}/?token=${info.token}\n`);
  process.exit(0);
}

const log = (msg: string): void => {
  process.stdout.write(`[sounddesk] ${msg}\n`);
};

let running: RunningServer | null = null;
let app: Awaited<ReturnType<typeof createApp>> | null = null;

async function main(): Promise<void> {
  log(`data dir: ${args.dataDir}`);
  app = await createApp({
    dataDir: args.dataDir,
    loadModel: args.loadModel,
    webRoot: args.webRoot,
    host: args.host,
    port: args.port,
    log,
  });

  const { catalog, indexer } = app;

  // Register and index a directory if asked.
  if (args.add) {
    const resolved = path.resolve(args.add);
    if (!existsSync(resolved)) {
      log(`error: directory does not exist: ${resolved}`);
      process.exitCode = 1;
      return;
    }
    const libraryId = catalog.addLibrary(args.addName ?? path.basename(resolved), resolved, 'local');
    log(`indexing ${resolved} ...`);
    const job = await indexer.runFastPass(libraryId, resolved);
    log(`stage 1 done: ${job.done}/${job.total} files (${job.failed} failed) in ${((Date.now() - job.startedAt) / 1000).toFixed(1)}s`);
    if (args.scanOnly) {
      app.close();
      return;
    }
  }

  running = await startServer({
    catalog: app.catalog,
    indexer: app.indexer,
    searchService: app.searchService,
    vectorIndex: app.vectorIndex,
    ucs: app.ucs,
    webRoot: args.webRoot,
    host: args.host,
    port: args.port,
    // Backs /api/ucs/lookup, which the classification-correction UI uses.
    reclassifyLookup: (term: string) => app!.ucs.lookup(term),
    reclassify: async (assetPath: string) => {
      const id = app!.catalog.getAssetByPath(assetPath);
      if (id === null) return null;
      const row = app!.catalog.getAssetRow(id);
      if (!row) return null;
      const asset = rowToAsset(row);
      const result = await app!.classifier.classify({
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
    // After a metadata write-back the file on disk differs from the catalogue
    // row, so re-read just that one file instead of rescanning the library.
    reindexAsset: async (assetId: number) => {
      const row = app!.catalog.getAssetRow(assetId);
      if (!row) return;
      const filePath = String(row.path ?? '');
      const libraryId = Number(row.libraryId);
      const sizeBytes = Number(row.sizeBytes ?? 0);
      const mtimeMs = Date.now();
      const st = await stat(filePath).catch(() => null);
      await app!.indexer.indexMetadata(
        assetId,
        {
          path: filePath,
          dir: path.dirname(filePath),
          filename: String(row.filename ?? path.basename(filePath)),
          extension: String(row.extension ?? path.extname(filePath)),
          sizeBytes: st?.size ?? sizeBytes,
          mtimeMs: st ? Math.floor(st.mtimeMs) : mtimeMs,
        },
        libraryId,
        app!.catalog.getLibrary(libraryId)?.root ?? path.dirname(filePath),
      );
    },
    log,
  });

  const runtimeFile = writeRuntimeFile(args.dataDir, {
    port: running.port,
    token: running.token,
    url: running.url,
  });

  log(`API base:   ${running.url}/api`);
  log(`session:    ${running.url}/?token=${running.token}`);
  log(`runtime:    ${runtimeFile}`);
  if (!args.webRoot) {
    log('note: no --web-root given, so only the API is served (use the Vite dev server for the UI)');
  }

  if (args.open) {
    openBrowser(`${running.url}/?token=${running.token}`);
  }

  if (args.scanOnly) {
    await running.close();
    app.close();
    running = null;
    return;
  }
}

async function shutdown(signal: string): Promise<void> {
  log(`received ${signal}, shutting down`);
  try {
    if (running) await running.close();
  } catch {
    /* ignore */
  }
  try {
    app?.close();
  } catch {
    /* ignore */
  }
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((err) => {
  process.stderr.write(`[sounddesk] fatal: ${errorMessage(err)}\n`);
  if (err instanceof Error && err.stack) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});

function openBrowser(url: string): void {
  const platform = process.platform;
  const command = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const cmdArgs = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(command, cmdArgs, { detached: true, stdio: 'ignore' });
    child.on('error', () => log(`could not open a browser; visit ${url}`));
    child.unref();
  } catch {
    log(`could not open a browser; visit ${url}`);
  }
}
