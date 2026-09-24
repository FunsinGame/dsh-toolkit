/**
 * Tests the sidebar / status-bar model.
 *
 * This file imports `libraryTreeModel.ts` and never `libraryTree.ts`: the latter
 * imports `vscode`, which does not exist in a plain Node test process. That split
 * is the reason the model is a separate module — everything asserted here is the
 * logic that decides what the user actually sees.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECENT_SEARCH_LIMIT,
  buildLibraryTree,
  emptySnapshot,
  formatStatusText,
  formatStatusTooltip,
  runningJob,
  uniqueQueries,
  type LibraryNode,
} from './libraryTreeModel.ts';

function nodeById(nodes: LibraryNode[], id: string): LibraryNode | undefined {
  return nodes.find((node) => node.id === id);
}

test('libraries, playlists and recent searches render with their real counts', () => {
  const tree = buildLibraryTree(
    emptySnapshot({
      libraries: [
        { id: 1, name: 'SFX', root: 'C:\\SFX', count: 12 },
        { id: 2, name: 'Music', root: 'D:\\Music', count: 3 },
      ],
      playlists: [{ id: 7, name: '预告片', count: 4 }],
      recentSearches: ['门 关闭', 'whoosh'],
      stats: { assets: 15, libraries: 2, embedded: 9 },
      ucsCount: 420,
      ffmpeg: { available: true, version: '6.1', source: 'path' },
    }),
  );

  // Fixed top-level order, with 索引任务 absent because nothing is running.
  assert.deepEqual(
    tree.map((node) => node.id),
    ['section:libraries', 'section:playlists', 'section:searches', 'engine:info'],
  );

  const libraries = nodeById(tree, 'section:libraries');
  assert.ok(libraries);
  assert.equal(libraries.children?.length, 2);
  assert.equal(libraries.children[0]?.kind, 'library');
  assert.equal(libraries.children[0]?.label, 'SFX');
  assert.equal(libraries.children[0]?.description, '12 条');
  assert.equal(libraries.children[0]?.tooltip, 'C:\\SFX');
  assert.equal(libraries.children[0]?.libraryId, 1);
  assert.equal(libraries.children[0]?.icon, 'library');

  const playlists = nodeById(tree, 'section:playlists');
  assert.ok(playlists);
  assert.equal(playlists.children?.length, 1);
  assert.equal(playlists.children[0]?.label, '预告片');
  assert.equal(playlists.children[0]?.description, '4 条');
  assert.equal(playlists.children[0]?.playlistId, 7);

  const searches = nodeById(tree, 'section:searches');
  assert.ok(searches);
  assert.deepEqual(
    searches.children?.map((node) => node.label),
    ['门 关闭', 'whoosh'],
  );
  // The query travels with the node so the command can re-run it.
  assert.equal(searches.children[0]?.query, '门 关闭');

  const info = nodeById(tree, 'engine:info');
  assert.ok(info);
  assert.equal(info.description, '15 条素材 · 2 个素材库 · 420 个 UCS CatID · ffmpeg 可用');
});

test('a section with no content is omitted', () => {
  // Nothing to report is still a valid tree, and must never throw.
  assert.doesNotThrow(() => buildLibraryTree(emptySnapshot()));

  const tree = buildLibraryTree(emptySnapshot());
  // No libraries, no playlists, no history, no jobs — only the engine summary.
  assert.deepEqual(
    tree.map((node) => node.id),
    ['engine:info'],
  );
  assert.equal(tree[0]?.kind, 'engineInfo');
  assert.equal(tree[0]?.description, '0 条素材 · 0 个素材库 · 0 个 UCS CatID · ffmpeg 不可用');

  // A section disappears as soon as it empties, not just when everything is empty.
  const onlyPlaylists = buildLibraryTree(emptySnapshot({ playlists: [{ id: 1, name: 'A', count: 0 }] }));
  assert.deepEqual(
    onlyPlaylists.map((node) => node.id),
    ['section:playlists', 'engine:info'],
  );
});

test('a running job renders done/total, and the section hides once nothing runs', () => {
  const tree = buildLibraryTree(
    emptySnapshot({
      jobs: [
        { id: 'j1', kind: 'scan', state: 'running', done: 42, total: 100 },
        { id: 'j2', kind: 'embed', state: 'done', done: 5, total: 5 },
      ],
    }),
  );

  const jobs = nodeById(tree, 'section:jobs');
  assert.ok(jobs);
  // The finished job is no longer "正在索引".
  assert.equal(jobs.children?.length, 1);
  assert.equal(jobs.children[0]?.label, '扫描文件');
  assert.equal(jobs.children[0]?.description, '42/100 · 进行中');
  assert.equal(jobs.children[0]?.jobId, 'j1');

  const quiet = buildLibraryTree(
    emptySnapshot({ jobs: [{ id: 'j2', kind: 'embed', state: 'done', done: 5, total: 5 }] }),
  );
  assert.equal(nodeById(quiet, 'section:jobs'), undefined);
});

test('the status bar text reflects the engine state and the asset count', () => {
  const ready = emptySnapshot({
    stats: { assets: 3383, libraries: 2, embedded: 120 },
    embedder: { id: 'clap', ready: true, error: null },
  });

  assert.equal(formatStatusText(ready, 'ready'), '$(music) SoundDesk · 3383');
  // Before the engine answers there is no count worth showing.
  assert.equal(formatStatusText(null, 'starting'), '$(music) SoundDesk');
  assert.equal(formatStatusText(null, 'error'), '$(warning) SoundDesk');
});

test('the status bar shows live index progress instead of the asset count', () => {
  const running = emptySnapshot({
    stats: { assets: 3383, libraries: 2, embedded: 120 },
    jobs: [
      { id: 'j1', kind: 'scan', state: 'running', done: 42, total: 100 },
      { id: 'j2', kind: 'embed', state: 'done', done: 5, total: 5 },
    ],
  });

  // Progress takes the space because it is the only thing changing moment to
  // moment, and a silent index of a large library looks like a hang.
  assert.equal(formatStatusText(running, 'ready'), '$(sync~spin) SoundDesk · 扫描文件 42/100');
  assert.match(formatStatusTooltip(running, 'ready'), /正在进行：扫描文件（42\/100）/);

  // Once nothing runs, the count comes back.
  const finished = emptySnapshot({
    stats: { assets: 3383, libraries: 2, embedded: 120 },
    jobs: [{ id: 'j2', kind: 'embed', state: 'done', done: 5, total: 5 }],
  });
  assert.equal(formatStatusText(finished, 'ready'), '$(music) SoundDesk · 3383');
  assert.doesNotMatch(formatStatusTooltip(finished, 'ready'), /正在进行/);

  // A queued job is not progress, and an unknown total must not render "0/0".
  const queued = emptySnapshot({
    stats: { assets: 1, libraries: 1, embedded: 0 },
    jobs: [{ id: 'j3', kind: 'scan', state: 'queued', done: 0, total: 0 }],
  });
  assert.equal(formatStatusText(queued, 'ready'), '$(music) SoundDesk · 1', 'queued is not running');

  const unknownTotal = emptySnapshot({
    stats: { assets: 1, libraries: 1, embedded: 0 },
    jobs: [{ id: 'j4', kind: 'scan', state: 'running', done: 7, total: 0 }],
  });
  assert.equal(formatStatusText(unknownTotal, 'ready'), '$(sync~spin) SoundDesk · 扫描文件');
});

test('runningJob reports the running job and nothing else', () => {
  assert.equal(runningJob(null), null);
  assert.equal(runningJob(emptySnapshot()), null);
  assert.equal(
    runningJob(emptySnapshot({ jobs: [{ id: 'a', kind: 'scan', state: 'done', done: 1, total: 1 }] })),
    null,
  );
  const job = { id: 'b', kind: 'embed', state: 'running' as const, done: 3, total: 9 };
  assert.equal(runningJob(emptySnapshot({ jobs: [job] }))?.id, 'b');
});

test('the status tooltip reflects ffmpeg availability and embedder readiness', () => {
  const loaded = emptySnapshot({
    engineUrl: 'http://127.0.0.1:4321',
    dataDir: 'C:\\Users\\me\\.sounddesk',
    stats: { assets: 3383, libraries: 2, embedded: 120 },
    ucsCount: 420,
    embedder: { id: 'clap', ready: true, error: null },
    ffmpeg: { available: true, version: '6.1.1', source: 'path' },
  });

  const withModel = formatStatusTooltip(loaded, 'ready');
  assert.match(withModel, /引擎地址：http:\/\/127\.0\.0\.1:4321/);
  assert.match(withModel, /数据目录：C:\\Users\\me\\\.sounddesk/);
  assert.match(withModel, /素材：3383 条（已生成指纹 120）/);
  assert.match(withModel, /UCS CatID：420 个/);
  assert.match(withModel, /语义搜索：已启用/);
  assert.match(withModel, /ffmpeg：可用（6\.1\.1）/);

  const withoutOptional = formatStatusTooltip(
    emptySnapshot({
      embedder: { id: 'null-embedder', ready: false, error: '模型文件缺失' },
      ffmpeg: { available: false, version: null, source: null },
    }),
    'ready',
  );
  assert.match(withoutOptional, /语义搜索：未启用/);
  assert.match(withoutOptional, /声音指纹模型：未加载（null-embedder）/);
  assert.match(withoutOptional, /模型错误：模型文件缺失/);
  assert.match(withoutOptional, /ffmpeg：不可用/);

  const failed = formatStatusTooltip(emptySnapshot({ engineError: '端口被占用' }), 'error');
  assert.match(failed, /状态：启动失败/);
  assert.match(failed, /错误：端口被占用/);
  // A failed engine must not report an empty library as if it were a fact.
  assert.doesNotMatch(failed, /素材：/);
});

test('an unreachable engine produces a single, actionable node', () => {
  const tree = buildLibraryTree(emptySnapshot({ engineError: '引擎启动超时' }));
  assert.equal(tree.length, 1);
  assert.equal(tree[0]?.kind, 'engineOffline');
  assert.equal(tree[0]?.label, '引擎未启动');
  assert.equal(tree[0]?.tooltip, '引擎启动超时');
});

test('recent queries are trimmed, de-duplicated and capped', () => {
  assert.deepEqual(uniqueQueries(['门', ' 门 ', '', '   ', 'whoosh']), ['门', 'whoosh']);
  assert.equal(uniqueQueries(Array.from({ length: 30 }, (_, i) => `q${i}`)).length, RECENT_SEARCH_LIMIT);

  const tree = buildLibraryTree(emptySnapshot({ recentSearches: ['门', '门', 'whoosh'] }));
  const searches = nodeById(tree, 'section:searches');
  assert.deepEqual(
    searches?.children?.map((node) => node.label),
    ['门', 'whoosh'],
  );
  // Ids must stay unique, or the tree collapses two entries into one.
  const ids = (searches?.children ?? []).map((node) => node.id);
  assert.equal(new Set(ids).size, ids.length);
});
