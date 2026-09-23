/**
 * Owns the local engine inside the extension host.
 *
 * Design decision: the engine runs **in-process**, not as a spawned child. That
 * avoids a whole class of problems — no child process to leak on reload, no
 * stdout scraping to discover a port, no pipe/sandbox issues — and the extension
 * host already is a Node process. The tradeoff is that a heavy indexing pass
 * shares the host's event loop; the indexer yields between files, so this stays
 * responsive in practice.
 *
 * The UI is still reached over HTTP, because a webview needs real URLs for
 * `<audio>` and the waveform canvas to work. `startServer` provides that on
 * loopback with a per-run token.
 */

import { createApp, startServer, type App, type RunningServer } from '@sounddesk/engine';

import type { EngineBootstrap } from './protocol.ts';

export interface EngineHostOptions {
  dataDir: string;
  /** serve the built web bundle; also lets dev builds share one origin */
  webRoot?: string | null;
  loadModel: boolean;
  log: (message: string) => void;
}

export interface EngineHandle {
  app: App;
  server: RunningServer;
  bootstrap: EngineBootstrap;
}

export class EngineHost {
  private handle: EngineHandle | null = null;
  private starting: Promise<EngineHandle> | null = null;

  constructor(private readonly options: EngineHostOptions) {}

  get current(): EngineHandle | null {
    return this.handle;
  }

  /**
   * Start (or reuse) the engine. Concurrent callers share the in-flight promise,
   * so two webviews cannot race into two engines.
   */
  async start(): Promise<EngineHandle> {
    if (this.handle) return this.handle;
    if (this.starting) return this.starting;

    this.starting = this.launch();
    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async launch(): Promise<EngineHandle> {
    const { options } = this;
    options.log(`starting engine (data dir: ${options.dataDir})`);
    const app = await createApp({
      dataDir: options.dataDir,
      loadModel: options.loadModel,
      log: options.log,
    });

    // The webview's origin is `vscode-webview://…`, which the server's origin
    // check already allows. No extra whitelist entry is needed.
    const server = await startServer({
      catalog: app.catalog,
      indexer: app.indexer,
      searchService: app.searchService,
      vectorIndex: app.vectorIndex,
      ucs: app.ucs,
      webRoot: options.webRoot ?? null,
      reclassifyLookup: (term: string) => app.ucs.lookup(term),
      log: options.log,
    });

    this.handle = {
      app,
      server,
      bootstrap: {
        port: server.port,
        token: server.token,
        url: server.url,
        dataDir: app.dataDir,
        modelLoaded: app.embedder.ready,
        host: 'vscode',
      },
    };
    options.log(`engine ready at ${server.url}`);
    return this.handle;
  }

  async stop(): Promise<void> {
    const current = this.handle;
    this.handle = null;
    if (!current) return;
    // Close the server first so in-flight requests finish against a live DB.
    await current.server.close().catch(() => undefined);
    try {
      current.app.close();
    } catch {
      /* already closed */
    }
  }

  async restart(): Promise<EngineHandle> {
    await this.stop();
    return this.start();
  }
}
