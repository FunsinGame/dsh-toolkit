/**
 * The SoundDesk sidebar: an activity-bar tree of the real catalogue.
 *
 * This module owns everything that needs `vscode`: the `TreeDataProvider`, the
 * `ThemeIcon` names, the context values that `view/item/context` menus match on,
 * and the engine→snapshot query. The *decisions* — which sections exist, what a
 * node says — live in `libraryTreeModel.ts` and are unit-tested without an
 * extension host, because `vscode` cannot be imported under plain Node.
 */

import { Playlists, ffmpegStatus, type App } from '@sounddesk/engine';
import * as vscode from 'vscode';

import type { EngineHandle, EngineHost } from './engineHost.ts';
import {
  RECENT_SEARCH_LIMIT,
  buildLibraryTree,
  emptySnapshot,
  type LibraryNode,
  type LibraryNodeKind,
  type LibrarySnapshot,
} from './libraryTreeModel.ts';

export type {
  LibraryNode,
  LibraryNodeIcon,
  LibraryNodeKind,
  LibrarySnapshot,
  SnapshotJob,
  SnapshotLibrary,
  SnapshotPlaylist,
} from './libraryTreeModel.ts';

/**
 * `contextValue` per node kind, so a menu can target exactly one kind.
 * `view/item/context` matches these literally (`viewItem == soundDesk.playlist`).
 */
const CONTEXT_VALUES: Record<LibraryNodeKind, string> = {
  section: 'soundDesk.section',
  library: 'soundDesk.library',
  playlist: 'soundDesk.playlist',
  recentSearch: 'soundDesk.recentSearch',
  jobs: 'soundDesk.jobs',
  job: 'soundDesk.job',
  engineInfo: 'soundDesk.engineInfo',
  engineOffline: 'soundDesk.engineOffline',
};

/**
 * Read everything the sidebar and the status bar show out of a live engine.
 *
 * Exported because the status bar needs exactly the same numbers as the 引擎信息
 * node; two queries that are supposed to agree will eventually drift apart.
 */
export async function collectSnapshot(handle: EngineHandle): Promise<LibrarySnapshot> {
  const { app } = handle;
  const stats = app.catalog.stats();
  const playlists = new Playlists(app.catalog);
  const ffmpeg = await ffmpegStatus();

  return {
    engineError: null,
    engineUrl: handle.server.url,
    dataDir: app.dataDir,
    // `listLibraries()` already counts assets per library, so the sidebar does
    // not run one query per library.
    libraries: app.catalog.listLibraries().map((library) => ({
      id: library.id,
      name: library.name,
      root: library.root,
      count: library.assetCount,
    })),
    playlists: playlists.list().map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      count: playlist.itemCount,
    })),
    // Over-fetch: duplicates are dropped when rendered, and a query repeated ten
    // times should not crowd out the nine other things the user searched for.
    recentSearches: app.catalog.recentSearches(RECENT_SEARCH_LIMIT * 4).map((row) => row.query),
    jobs: app.indexer.listJobs().map((job) => ({
      id: job.id,
      kind: job.kind,
      state: job.state,
      done: job.done,
      total: job.total,
    })),
    stats: { assets: stats.assets, libraries: stats.libraries, embedded: stats.embedded },
    ucsCount: app.classifier.size,
    embedder: { id: app.embedder.id, ready: app.embedder.ready, error: app.embedderError },
    ffmpeg: {
      available: ffmpeg.available,
      version: ffmpeg.available ? ffmpeg.version : null,
      source: ffmpeg.available ? ffmpeg.source : null,
    },
  };
}

export class LibraryTreeProvider implements vscode.TreeDataProvider<LibraryNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<LibraryNode | undefined | void>();
  /** Fires when the tree must be rebuilt. */
  readonly onDidChangeTreeData = this.emitter.event;

  private readonly host: EngineHost;
  private readonly log: (message: string) => void;
  private jobListenerBound = false;
  private jobListener: ((job: { state?: string }) => void) | null = null;
  /** the engine whose events we subscribed to, kept so we can unsubscribe */
  private engine: App | null = null;

  constructor(host: EngineHost, log: (message: string) => void = () => {}) {
    this.host = host;
    this.log = log;
  }

  /** Rebuild on the next render. Cheap: nothing is cached between calls. */
  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(node: LibraryNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, collapsibleStateFor(node));
    // A stable id is what keeps a section expanded across a refresh.
    item.id = node.id;
    item.contextValue = CONTEXT_VALUES[node.kind];
    if (node.description !== undefined) item.description = node.description;
    if (node.tooltip !== undefined) item.tooltip = node.tooltip;
    if (node.icon !== undefined) item.iconPath = new vscode.ThemeIcon(node.icon);
    const command = commandFor(node);
    if (command) item.command = command;
    return item;
  }

  async getChildren(element?: LibraryNode): Promise<LibraryNode[]> {
    // Children are built with the parent, so an expanded node never round-trips
    // to the engine again.
    if (element) return element.children ?? [];

    const snapshot = await this.snapshot();
    try {
      return buildLibraryTree(snapshot);
    } catch (err) {
      // A tree that throws takes the whole view down with it, so this is the one
      // place where a defensive catch is worth more than the stack.
      const reason = message(err);
      this.log(`sidebar tree build failed: ${reason}`);
      return buildLibraryTree(emptySnapshot({ engineError: reason }));
    }
  }

  dispose(): void {
    if (this.engine && this.jobListener) this.engine.indexer.off('job', this.jobListener);
    this.jobListenerBound = false;
    this.jobListener = null;
    this.engine = null;
    this.emitter.dispose();
  }

  /** Start the engine if needed and read the catalogue; never rejects. */
  private async snapshot(): Promise<LibrarySnapshot> {
    let handle = this.host.current;
    if (!handle) {
      try {
        handle = await this.host.start();
      } catch (err) {
        return emptySnapshot({ engineError: message(err) });
      }
    }

    this.bindJobEvents(handle.app);
    try {
      return await collectSnapshot(handle);
    } catch (err) {
      const reason = message(err);
      this.log(`sidebar snapshot failed: ${reason}`);
      return emptySnapshot({ engineError: reason });
    }
  }

  /**
   * Rebuild the tree when an index job finishes.
   *
   * Only on completion: the indexer emits once per file, and re-querying the
   * catalogue for every file of a 100k scan would be a denial of service against
   * our own extension host.
   */
  private bindJobEvents(app: App): void {
    if (this.jobListenerBound) return;
    this.jobListenerBound = true;
    this.engine = app;
    const listener = (job: { state?: string }): void => {
      if (job.state === 'running' || job.state === 'queued') return;
      this.refresh();
    };
    this.jobListener = listener;
    app.indexer.on('job', listener);
  }
}

function collapsibleStateFor(node: LibraryNode): vscode.TreeItemCollapsibleState {
  if (!node.children || node.children.length === 0) return vscode.TreeItemCollapsibleState.None;
  // Sections open by default — the point of the sidebar is to see the libraries.
  return node.kind === 'section'
    ? vscode.TreeItemCollapsibleState.Expanded
    : vscode.TreeItemCollapsibleState.Collapsed;
}

/**
 * What clicking a node does.
 *
 * Everything routes to an already-contributed command: a `TreeItem.command` that
 * is not registered logs a warning and silently does nothing.
 */
function commandFor(node: LibraryNode): vscode.Command | undefined {
  switch (node.kind) {
    case 'library':
      return { command: 'soundDesk.open', title: '打开工作台' };
    case 'playlist':
      return { command: 'soundDesk.openPlaylist', title: '打开播放列表', arguments: [node] };
    case 'recentSearch':
      // `soundDesk.open` accepts a query string; the explorer and the editor
      // title call the same command with a Uri, which it ignores.
      return node.query === undefined
        ? undefined
        : { command: 'soundDesk.open', title: '重新搜索', arguments: [node.query] };
    case 'engineInfo':
      return { command: 'soundDesk.showEngineInfo', title: '显示引擎信息' };
    case 'engineOffline':
      // Opening the workbench also retries the engine, and reports the failure
      // in the panel when it still cannot start.
      return { command: 'soundDesk.open', title: '打开工作台' };
    default:
      return undefined;
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
