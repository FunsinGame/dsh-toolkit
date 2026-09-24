/**
 * Playlists — PLAN P1-3.
 *
 * Deliberately compact, because it lives in the 250px sidebar next to the UCS tree.
 * Two levels: the list of playlists, and the open one's tracks. Clicking a playlist
 * opens it; clicking a track selects it in the details pane, so the rest of the app
 * keeps working on it normally.
 *
 * The one interaction that matters is "add what I have selected", so it is the
 * primary button and it needs no target picker once a playlist is open.
 */

import { useEffect, useState } from 'react';

import { requestPlay } from '../audio/playback.ts';
import { store } from '../state/store.ts';
import { useAppState } from '../state/useAppState.ts';
import { formatDuration } from '../util/format.ts';

export function PlaylistSection(): React.JSX.Element {
  const state = useAppState();
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);

  // Load once, when the workbench becomes ready.
  useEffect(() => {
    if (state.ready) void store.refreshPlaylists();
  }, [state.ready]);

  const open = state.openPlaylist;

  return (
    <div className="pl-section">
      <div className="pl-toolbar">
        <input
          value={draft}
          placeholder="新建播放列表…"
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key !== 'Enter') return;
            const name = draft.trim();
            if (name.length === 0) return;
            setDraft('');
            void store.createPlaylist(name);
          }}
        />
      </div>

      {state.playlistError && <div className="fx-error">{state.playlistError}</div>}

      <ul className="pl-list">
        {state.playlists.map((playlist) => (
          <li key={playlist.id} className={open?.id === playlist.id ? 'pl-row open' : 'pl-row'}>
            {renaming?.id === playlist.id ? (
              <input
                className="pl-rename"
                autoFocus
                value={renaming.name}
                onChange={(ev) => setRenaming({ id: playlist.id, name: ev.target.value })}
                onBlur={() => setRenaming(null)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Escape') setRenaming(null);
                  if (ev.key !== 'Enter') return;
                  const name = renaming.name.trim();
                  setRenaming(null);
                  if (name.length > 0) void store.renamePlaylist(playlist.id, name);
                }}
              />
            ) : (
              <>
                <button
                  className="pl-name"
                  onClick={() => (open?.id === playlist.id ? store.closePlaylist() : void store.openPlaylist(playlist.id))}
                  title="打开这个播放列表"
                >
                  {open?.id === playlist.id ? '▾ ' : '▸ '}
                  {playlist.name}
                </button>
                <span className="count">{playlist.itemCount}</span>
                <button
                  className="pl-mini"
                  onClick={() => setRenaming({ id: playlist.id, name: playlist.name })}
                  title="重命名"
                >
                  ✎
                </button>
                <button
                  className="pl-mini"
                  onClick={() => {
                    if (window.confirm(`删除播放列表「${playlist.name}」？素材文件不会被删除。`)) {
                      void store.removePlaylist(playlist.id);
                    }
                  }}
                  title="删除这个播放列表（不动素材文件）"
                >
                  ✕
                </button>
              </>
            )}
          </li>
        ))}
        {state.playlists.length === 0 && <li className="fx-hint">还没有播放列表，上面输入名字回车即可新建。</li>}
      </ul>

      {open && (
        <div className="pl-detail">
          <div className="pl-toolbar">
            <button
              onClick={() => void store.addToOpenPlaylist()}
              disabled={state.selectedId === null}
              title={
                state.selectedId === null
                  ? '先在结果里选中一条素材'
                  : '把当前选中的素材加入这个播放列表'
              }
            >
              加入选中素材
            </button>
            <span className="count">{open.items.length} 项</span>
          </div>

          <ol className="pl-items">
            {open.items.map((item, index) => (
              <li key={item.assetId} className={state.selectedId === item.assetId ? 'pl-item selected' : 'pl-item'}>
                <button
                  className="pl-name"
                  onClick={() => void store.selectRow(item.assetId)}
                  onDoubleClick={() => requestPlay(item.assetId)}
                  title={`${item.filename}\n双击试听`}
                >
                  <span className="pl-index">{index + 1}</span>
                  {item.filename}
                </button>
                <span className="count">{formatDuration(item.durationMs)}</span>
                {/* Reordering by buttons rather than drag: a 250px-wide list is a
                    poor drag target, and this is unambiguous and keyboard-reachable. */}
                <button
                  className="pl-mini"
                  disabled={index === 0}
                  onClick={() => void store.moveInOpenPlaylist(item.assetId, index - 1)}
                  title="上移"
                >
                  ↑
                </button>
                <button
                  className="pl-mini"
                  disabled={index === open.items.length - 1}
                  onClick={() => void store.moveInOpenPlaylist(item.assetId, index + 1)}
                  title="下移"
                >
                  ↓
                </button>
                <button
                  className="pl-mini"
                  onClick={() => void store.removeFromOpenPlaylist(item.assetId)}
                  title="从播放列表移除（不删除文件）"
                >
                  ✕
                </button>
              </li>
            ))}
            {open.items.length === 0 && <li className="fx-hint">空列表。选中素材后点上面的按钮加入。</li>}
          </ol>
        </div>
      )}

      <BackupSection />
    </div>
  );
}

/**
 * Sidecar backup and import.
 *
 * The wording here is doing real work, not decoration: a backup that people assume
 * contains their audio files would be a nasty surprise on restore, so the section
 * says plainly that it holds annotations only. And an import shows the match report
 * *before* writing anything, because it rewrites data across the whole library and a
 * wrong match attaches the user's work to the wrong sounds — silently.
 */
function BackupSection(): React.JSX.Element {
  const state = useAppState();
  const [includeHistory, setIncludeHistory] = useState(true);

  const pending = state.pendingImport;

  return (
    <div className="section pl-backup">
      <h3>备份 / 导入</h3>
      <div className="fx-hint" style={{ marginBottom: 6 }}>
        只备份<strong>旁挂数据</strong>：标签、收藏、评级、手动分类、播放列表和使用记录。
        <strong>不含音频文件</strong>——文件本来就在你的库里。
      </div>

      <label className="pl-check">
        <input type="checkbox" checked={includeHistory} onChange={(ev) => setIncludeHistory(ev.target.checked)} />
        含搜索历史与使用记录
      </label>

      <div className="pl-toolbar">
        <a href={store.backupUrl(includeHistory)} download title="下载一个 JSON 备份文件">
          导出备份
        </a>
        <label className="pl-import" title="选择一个之前导出的 JSON 备份">
          导入备份…
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(ev) => {
              const file = ev.target.files?.[0];
              // Reset so choosing the same file twice still fires a change event.
              ev.target.value = '';
              if (file) void store.inspectBackupFile(file);
            }}
          />
        </label>
      </div>

      {pending && (
        <div className="fx-ok">
          <div>
            将导入 <code>{pending.fileName}</code>
          </div>
          <ul className="pl-report">
            <li>
              可匹配 <strong>{pending.inspection.plan.matched}</strong> 条
            </li>
            {/* Which identifier matched is the quality signal the user needs. */}
            <li className="count">
              内容哈希 {pending.inspection.plan.byMethod.hash ?? 0} · 路径{' '}
              {pending.inspection.plan.byMethod.path ?? 0} · 文件名+大小{' '}
              {pending.inspection.plan.byMethod['name-size'] ?? 0}
            </li>
            {pending.inspection.plan.unmatched > 0 && (
              <li className="count">
                未匹配 {pending.inspection.plan.unmatched} 条
                {pending.inspection.plan.unmatchedExamples.length > 0
                  ? `（例如 ${pending.inspection.plan.unmatchedExamples.slice(0, 2).join('、')}）`
                  : ''}
              </li>
            )}
            {pending.inspection.plan.ambiguous > 0 && (
              <li className="count">
                因标识重复被跳过 {pending.inspection.plan.ambiguous} 条——两个素材命中了同一个标识，
                跳过而不是随便挑一个
              </li>
            )}
          </ul>
          <div className="pl-toolbar">
            <button onClick={() => void store.confirmImport({ includeHistory })}>确认导入（合并）</button>
            <button
              onClick={() => void store.confirmImport({ includeHistory, overwrite: true })}
              title="用备份里的值覆盖现有标签与评级，而不是合并"
            >
              覆盖导入
            </button>
            <button onClick={() => store.cancelImport()}>取消</button>
          </div>
        </div>
      )}

      {state.importOutcome && (
        <div className="fx-ok">
          导入完成
          <ul className="pl-report">
            <li>标注 {state.importOutcome.result.applied} 条</li>
            {state.importOutcome.result.playlistsCreated > 0 && (
              <li>
                新建播放列表 {state.importOutcome.result.playlistsCreated} 个，共{' '}
                {state.importOutcome.result.playlistItems} 项
              </li>
            )}
            {state.importOutcome.result.searchesAdded > 0 && (
              <li>搜索历史 {state.importOutcome.result.searchesAdded} 条</li>
            )}
            {state.importOutcome.result.skipped.length > 0 && (
              <li className="count">跳过 {state.importOutcome.result.skipped.length} 条</li>
            )}
          </ul>
          <button style={{ marginTop: 4 }} onClick={() => store.clearImportOutcome()}>
            知道了
          </button>
        </div>
      )}
    </div>
  );
}
