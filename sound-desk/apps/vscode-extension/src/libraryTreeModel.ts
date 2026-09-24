/**
 * The pure data model behind the SoundDesk sidebar and the status bar item.
 *
 * This module deliberately imports nothing — in particular not `vscode`. The
 * extension's tests run under plain Node (`--experimental-strip-types --test`),
 * where the `vscode` module does not exist, so every decision about *what the
 * sidebar shows* and *what the status bar says* lives here as a function of a
 * plain snapshot object. That makes those decisions unit-testable without an
 * extension host. `libraryTree.ts` builds the snapshot from the engine and turns
 * these nodes into `vscode.TreeItem`s; `extension.ts` renders the status bar.
 *
 * Rule of thumb for everything below: a number is only ever shown when it was
 * computed from the engine. Nothing here invents a placeholder count.
 */

/** Where the local engine is in its lifecycle, as far as the UI can tell. */
export type EngineStatusState = 'starting' | 'ready' | 'error';

/** Mirrors the engine's `JobState['state']` without importing the engine. */
export type JobStateName = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface SnapshotLibrary {
  id: number;
  name: string;
  root: string;
  /** assets currently catalogued for this library */
  count: number;
}

export interface SnapshotPlaylist {
  id: number;
  name: string;
  count: number;
}

export interface SnapshotJob {
  id: string;
  kind: string;
  state: JobStateName;
  done: number;
  total: number;
}

export interface SnapshotStats {
  assets: number;
  libraries: number;
  embedded: number;
}

export interface SnapshotEmbedder {
  id: string;
  ready: boolean;
  /** non-null when the model could not be loaded, and why */
  error: string | null;
}

export interface SnapshotFfmpeg {
  available: boolean;
  version: string | null;
  source: string | null;
}

/** Everything the sidebar and the status bar read, collected in one place. */
export interface LibrarySnapshot {
  /** non-null when the engine could not be reached; the tree then says so */
  engineError: string | null;
  engineUrl: string | null;
  dataDir: string | null;
  libraries: SnapshotLibrary[];
  playlists: SnapshotPlaylist[];
  /** raw query strings, most recent first; duplicates are removed when rendered */
  recentSearches: string[];
  jobs: SnapshotJob[];
  stats: SnapshotStats;
  /** how many UCS CatIDs the classifier loaded */
  ucsCount: number;
  embedder: SnapshotEmbedder;
  ffmpeg: SnapshotFfmpeg;
}

export type LibraryNodeKind =
  | 'section'
  | 'library'
  | 'playlist'
  | 'recentSearch'
  | 'jobs'
  | 'job'
  | 'engineInfo'
  | 'engineOffline'
  | 'action';

/** Built-in codicon names, so the provider never needs an image asset. */
export type LibraryNodeIcon =
  | 'library'
  | 'playlist'
  | 'search'
  | 'sync~spin'
  | 'info'
  | 'warning'
  | 'play'
  | 'add'
  | 'refresh';

/**
 * One node of the sidebar, as plain data.
 *
 * `id` is stable across refreshes (it is used as `TreeItem.id`), which is what
 * keeps a section expanded after the tree is rebuilt.
 */
export interface LibraryNode {
  kind: LibraryNodeKind;
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  icon?: LibraryNodeIcon;
  /** present when the node itself is expandable */
  children?: LibraryNode[];
  /** engine identifiers the commands act on */
  libraryId?: number;
  playlistId?: number;
  query?: string;
  root?: string;
  jobId?: string;
  /** for `action` nodes: the command to run, and its argument if it takes one */
  command?: string;
  commandArg?: string;
}

/** How many recent queries the sidebar keeps: more than this is a scroll, not a shortcut. */
export const RECENT_SEARCH_LIMIT = 8;

/** A snapshot with no engine behind it, used as the base for failure states. */
export function emptySnapshot(overrides: Partial<LibrarySnapshot> = {}): LibrarySnapshot {
  return {
    engineError: null,
    engineUrl: null,
    dataDir: null,
    libraries: [],
    playlists: [],
    recentSearches: [],
    jobs: [],
    stats: { assets: 0, libraries: 0, embedded: 0 },
    ucsCount: 0,
    embedder: { id: '未加载', ready: false, error: null },
    ffmpeg: { available: false, version: null, source: null },
    ...overrides,
  };
}

const JOB_KIND_LABELS: Record<string, string> = {
  scan: '扫描文件',
  waveform: '生成波形',
  embed: '声音指纹',
  tag: '读取标签',
  reindex: '重建索引',
};

const JOB_STATE_LABELS: Record<JobStateName, string> = {
  queued: '排队中',
  running: '进行中',
  done: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

/**
 * Trim, drop blanks and collapse duplicates, keeping the newest first.
 *
 * `search_history` records every search, so the same query appears many times;
 * a sidebar entry per keystroke would be noise.
 */
export function uniqueQueries(queries: readonly string[], limit = RECENT_SEARCH_LIMIT): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of queries) {
    const query = raw.trim();
    if (query.length === 0 || seen.has(query)) continue;
    seen.add(query);
    out.push(query);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Build the sidebar tree.
 *
 * Top-level order is fixed - 引擎状态, 快捷操作, 素材库, 播放列表, 最近搜索, 索引任务 -
 * and a section is omitted entirely when it has no content, so an empty catalogue does
 * not look like a broken one. Never throws: a snapshot is plain data and every field is
 * read defensively by the type system, not by `try`.
 *
 * 引擎状态 comes first because it replaced the bottom status bar: the engine URL, the
 * asset count, the fingerprint coverage and live index progress all used to live down
 * there, and moving them into the sidebar means they should be the first thing visible
 * rather than buried under the category tree.
 */
export function buildLibraryTree(snapshot: LibrarySnapshot): LibraryNode[] {
  if (snapshot.engineError !== null) {
    return [
      {
        kind: 'engineOffline',
        id: 'engine:offline',
        label: '引擎未启动',
        description: '点击重试',
        tooltip: snapshot.engineError,
        icon: 'warning',
      },
      ...actionNodes(),
    ];
  }

  const nodes: LibraryNode[] = [];

  nodes.push({
    kind: 'engineInfo',
    id: 'engine:info',
    label: '引擎状态',
    description: engineInfoLine(snapshot),
    tooltip: formatStatusTooltip(snapshot, 'ready'),
    icon: 'info',
  });

  // Live progress sits directly under the engine row while something is running, so
  // the sidebar is where the user watches an import - the status bar is gone.
  const running = runningJob(snapshot);
  if (running) {
    nodes.push({
      kind: 'job',
      id: `job:current`,
      label: JOB_KIND_LABELS[running.kind] ?? running.kind,
      description: jobProgressLabel(running),
      tooltip: `任务 ${running.id}: ${running.done}/${running.total}`,
      icon: 'sync~spin',
      jobId: running.id,
    });
  }

  nodes.push(...actionNodes());

  if (snapshot.libraries.length > 0) {
    nodes.push({
      kind: 'section',
      id: 'section:libraries',
      label: '素材库',
      description: String(snapshot.libraries.length),
      icon: 'library',
      children: snapshot.libraries.map((library) => ({
        kind: 'library',
        id: `library:${library.id}`,
        label: library.name,
        description: `${library.count} 条`,
        tooltip: library.root,
        icon: 'library',
        libraryId: library.id,
        root: library.root,
      })),
    });
  }

  if (snapshot.playlists.length > 0) {
    nodes.push({
      kind: 'section',
      id: 'section:playlists',
      label: '播放列表',
      description: String(snapshot.playlists.length),
      icon: 'playlist',
      children: snapshot.playlists.map((playlist) => ({
        kind: 'playlist',
        id: `playlist:${playlist.id}`,
        label: playlist.name,
        description: `${playlist.count} 条`,
        tooltip: `播放列表「${playlist.name}」：${playlist.count} 条`,
        icon: 'playlist',
        playlistId: playlist.id,
      })),
    });
  }

  const queries = uniqueQueries(snapshot.recentSearches);
  if (queries.length > 0) {
    nodes.push({
      kind: 'section',
      id: 'section:searches',
      label: '最近搜索',
      description: String(queries.length),
      icon: 'search',
      children: queries.map((query) => ({
        kind: 'recentSearch',
        id: `search:${query}`,
        label: query,
        tooltip: `重新搜索「${query}」`,
        icon: 'search',
        query,
      })),
    });
  }

  // The section is for everything the single "current" row above does not already
  // show: a second concurrent job, or the recent history when nothing is running.
  const activeJobs = snapshot.jobs.filter((job) => job.state === 'running' || job.state === 'queued');
  const onlyCurrent = activeJobs.length === 1 && running !== null;
  const listed = onlyCurrent ? [] : activeJobs.length > 0 ? activeJobs : snapshot.jobs.slice(0, 3);
  if (listed.length > 0) {
    nodes.push({
      kind: 'jobs',
      id: 'section:jobs',
      label: '索引任务',
      description: String(listed.length),
      icon: 'sync~spin',
      children: listed.map((job) => ({
        kind: 'job',
        id: `job:${job.id}`,
        label: JOB_KIND_LABELS[job.kind] ?? job.kind,
        description: `${jobProgressLabel(job)} · ${JOB_STATE_LABELS[job.state]}`,
        tooltip: `任务 ${job.id}：${job.done}/${job.total}`,
        icon: 'sync~spin',
        jobId: job.id,
      })),
    });
  }

  return nodes;
}

/**
 * The always-present actions.
 *
 * These exist because the sidebar is now the tool's control surface: with the status
 * bar hidden, "open the workbench" has to live somewhere discoverable, and the same is
 * true of adding a library.
 */
function actionNodes(): LibraryNode[] {
  return [
    {
      kind: 'action',
      id: 'action:open',
      label: '打开工具页面',
      description: '工作台',
      tooltip: '在编辑器里打开完整的 SoundDesk 工作台（搜索 / 波形 / 效果链 / 素材库管理）',
      icon: 'play',
      command: 'soundDesk.open',
    },
    {
      kind: 'action',
      id: 'action:addLibrary',
      label: '添加本地素材库',
      tooltip: '选择一个本地目录并完整索引（扫描 → 波形 → 声音指纹）',
      icon: 'add',
      command: 'soundDesk.indexFolder',
    },
    {
      kind: 'action',
      id: 'action:refresh',
      label: '刷新',
      tooltip: '重新读取素材库、播放列表与任务状态',
      icon: 'refresh',
      command: 'soundDesk.refreshLibrary',
    },
  ];
}

/** `42/100 · 进行中`, or `42/100` when the state label would be redundant. */
function jobProgressLabel(job: SnapshotJob): string {
  if (job.total > 0) return `${job.done}/${job.total}`;
  return job.done > 0 ? String(job.done) : '-';
}

/** One line summarising the catalogue, used as the 引擎状态 node's description. */
function engineInfoLine(snapshot: LibrarySnapshot): string {
  const ffmpeg = snapshot.ffmpeg.available ? 'ffmpeg 可用' : 'ffmpeg 不可用';
  return `${snapshot.stats.assets} 条素材 · 指纹 ${snapshot.stats.embedded} · ${ffmpeg}`;
}

/**
 * Status bar text.
 *
 * The asset count is the one number worth permanent space; everything else lives
 * in the tooltip, where it can be as long as it needs to be.
 *
 * While an index job runs, progress takes that space instead: it is the only thing
 * on screen that changes moment to moment, and a silent index of a large library
 * looks indistinguishable from a hang.
 */
export function formatStatusText(snapshot: LibrarySnapshot | null, state: EngineStatusState): string {
  if (state === 'error') return '$(warning) SoundDesk';
  if (state === 'starting' || snapshot === null || snapshot.engineError !== null) return '$(music) SoundDesk';

  const running = snapshot.jobs.find((job) => job.state === 'running');
  if (running) {
    const label = JOB_KIND_LABELS[running.kind] ?? running.kind;
    // No count is shown when the total is unknown: "0/0" reads as broken and "42/"
    // as truncated.
    const progress = running.total > 0 ? ` ${running.done}/${running.total}` : '';
    return `$(sync~spin) SoundDesk · ${label}${progress}`;
  }

  return `$(music) SoundDesk · ${snapshot.stats.assets}`;
}

/** The running job, if any — used by the status bar tooltip and the sidebar. */
export function runningJob(snapshot: LibrarySnapshot | null): SnapshotJob | null {
  if (!snapshot) return null;
  return snapshot.jobs.find((job) => job.state === 'running') ?? null;
}

/**
 * Status bar tooltip, as markdown.
 *
 * Every line is either a real measurement or explicitly says it is unknown — the
 * point of the tooltip is to answer "why is semantic search off?" without
 * opening the output channel.
 */
export function formatStatusTooltip(snapshot: LibrarySnapshot | null, state: EngineStatusState): string {
  const lines: string[] = ['**SoundDesk 本地引擎**'];

  if (state === 'error') {
    lines.push('状态：启动失败');
    lines.push(`错误：${snapshot?.engineError ?? '未知错误'}`);
  } else if (state === 'starting' || snapshot === null) {
    lines.push('状态：正在启动…');
  } else {
    lines.push('状态：运行中');
  }

  // Catalogue numbers are only meaningful once the engine answered; reporting
  // zeros for a failed engine would read as "your library is empty".
  if (state === 'ready' && snapshot !== null) {
    const running = runningJob(snapshot);
    if (running) {
      const label = JOB_KIND_LABELS[running.kind] ?? running.kind;
      const progress = running.total > 0 ? `${running.done}/${running.total}` : `${running.done}`;
      lines.push(`正在进行：${label}（${progress}）`);
    }
    lines.push(`引擎地址：${snapshot.engineUrl ?? '（未知）'}`);
    lines.push(`数据目录：${snapshot.dataDir ?? '（未知）'}`);
    lines.push(`素材：${snapshot.stats.assets} 条（已生成指纹 ${snapshot.stats.embedded}）`);
    lines.push(`素材库：${snapshot.stats.libraries} 个 · UCS CatID：${snapshot.ucsCount} 个`);
    lines.push(
      `声音指纹模型：${snapshot.embedder.ready ? '已加载' : '未加载'}（${snapshot.embedder.id}）`,
    );
    if (snapshot.embedder.error) lines.push(`模型错误：${snapshot.embedder.error}`);
    lines.push(`语义搜索：${snapshot.embedder.ready ? '已启用' : '未启用（仅关键词 + UCS）'}`);
    lines.push(
      `ffmpeg：${
        snapshot.ffmpeg.available
          ? `可用${snapshot.ffmpeg.version ? `（${snapshot.ffmpeg.version}）` : ''}`
          : '不可用（非 WAV 格式无法试听）'
      }`,
    );
  }

  lines.push('点击打开工作台');
  // Markdown needs a blank line between paragraphs to break lines.
  return lines.join('\n\n');
}
