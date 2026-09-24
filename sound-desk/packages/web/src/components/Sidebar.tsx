/**
 * Left pane: libraries plus the UCS classification tree.
 *
 * Selecting a category is a *filter on the current search*, not a separate
 * browse mode — that keeps the mental model to one thing: there is always a
 * query, and the tree narrows it.
 */

import { useState } from 'react';

import { store } from '../state/store.ts';
import { useAppState } from '../state/useAppState.ts';
import { formatBytes } from '../util/format.ts';
import { PlaylistSection } from './PlaylistSection.tsx';

export function Sidebar(): React.JSX.Element {
  const state = useAppState();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  // Importing needs the extension host: only it can turn a folder the user picks into
  // a real filesystem path. The browser gets the CLI instruction instead, because a
  // button that cannot work is worse than a documented command.
  const canImport = state.host === 'vscode';

  const tree = state.ucsTree?.tree ?? [];
  const needle = filter.trim().toLowerCase();
  // The vocabulary has ~32 categories; showing the empty ones would bury the
  // handful that actually contain assets in this library.
  const populated = tree.filter((node) => node.count > 0);
  const base = populated.length > 0 ? populated : tree;
  const visible = needle
    ? base
        .map((node) => ({
          ...node,
          children: node.children.filter(
            (child) =>
              child.catId.toLowerCase().includes(needle) ||
              child.label.toLowerCase().includes(needle) ||
              node.category.toLowerCase().includes(needle),
          ),
        }))
        .filter((node) => node.children.length > 0 || node.category.toLowerCase().includes(needle))
    : base;

  function toggle(category: string): void {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <div className="pane">
      <div className="pane-head">
        <span>素材库</span>
        <span className="count">{state.libraries.length}</span>
      </div>

      {/*
        Import is offered as a button only where the host can actually deliver a real
        directory path. A browser cannot — `<input webkitdirectory>` yields File
        objects with no path — so there the CLI instruction stays, because a button
        that silently fails is worse than a documented command.
      */}
      {canImport ? (
        <div style={{ padding: '6px 8px' }}>
          <button
            style={{ width: '100%', fontSize: 12 }}
            onClick={() => void store.importLibrary()}
            disabled={state.libraryImport !== null}
            title="选择一个本地目录作为素材库，并索引到完成"
          >
            {state.libraryImport ? '正在导入…' : '＋ 添加本地素材库'}
          </button>
        </div>
      ) : (
        state.libraries.length === 0 && (
          <div className="section" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            还没有素材库。用 CLI 加一个目录：
            <div className="kv" style={{ marginTop: 6 }}>
              sounddesk --add "D:/SFX" 库名
            </div>
          </div>
        )
      )}

      {state.libraryImportError && (
        <div className="section" style={{ fontSize: 11, color: 'var(--danger, #f85149)' }}>
          {state.libraryImportError}
        </div>
      )}
      {state.libraries.map((library) => (
        <div key={library.id} className="section" style={{ padding: '6px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={library.root}>
              {library.name}
            </span>
            <span className="count">{library.assetCount ?? 0}</span>
          </div>
          <div className="kv" style={{ fontSize: 10 }}>
            {library.root}
          </div>
          <button
            style={{ marginTop: 4, fontSize: 11, padding: '2px 6px' }}
            onClick={() => void store.rescan(library.id)}
            title="增量重扫这个目录，只处理新增或变化的文件"
          >
            重扫
          </button>
        </div>
      ))}

      <div className="pane-head" style={{ top: 0 }}>
        <span>播放列表</span>
        <span className="count">{state.playlists.length || ''}</span>
      </div>
      <PlaylistSection />

      <div className="pane-head" style={{ top: 0 }}>
        <span>UCS 分类</span>
        <span className="count">
          {state.ucsTree ? state.ucsTree.tree.reduce((sum, n) => sum + n.count, 0) : 0}
        </span>
      </div>
      <div style={{ padding: '6px 8px' }}>
        <input
          value={filter}
          placeholder="过滤分类…"
          style={{ width: '100%' }}
          onChange={(ev) => setFilter(ev.target.value)}
        />
      </div>

      <button
        className={`tree-cat ${state.activeCategory === null && state.activeCatId === null ? 'selected' : ''}`}
        onClick={() => store.selectCategory(null, null)}
      >
        <span className="caret" />
        <span className="label">全部</span>
        <span className="count">{state.stats?.assets ?? 0}</span>
      </button>

      {visible.map((node) => {
        const isOpen = expanded.has(node.category) || needle.length > 0;
        const isActive = state.activeCategory === node.category && state.activeCatId === null;
        return (
          <div key={node.category}>
            <button
              className={`tree-cat ${isActive ? 'selected' : ''}`}
              onClick={() => {
                toggle(node.category);
                store.selectCategory(node.category, null);
              }}
              title={`${node.category}（${node.children.length} 个子类）`}
            >
              <span className="caret">{isOpen ? '▾' : '▸'}</span>
              <span className="label">{node.category}</span>
              <span className="count">{node.count}</span>
            </button>
            {isOpen &&
              node.children.map((child) => (
                <button
                  key={child.catId}
                  className={`tree-cat tree-sub ${state.activeCatId === child.catId ? 'selected' : ''}`}
                  onClick={() => store.selectCategory(node.category, child.catId)}
                  title={child.catId}
                >
                  <span className="caret" />
                  <span className="label">{child.label}</span>
                  <span className="count">{child.count}</span>
                </button>
              ))}
          </div>
        );
      })}

      {state.ucsTree && state.ucsTree.uncategorized > 0 && (
        <div className="section">
          <span className="count">{state.ucsTree.uncategorized} 条未分类</span>
        </div>
      )}

      {state.stats && (
        <div className="section" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          <div className="kv">
            索引库 <b>{formatBytes(state.stats.dbBytes)}</b>
          </div>
          <div className="kv">
            声音指纹 <b>{state.stats.embedded}</b>/{state.stats.assets}
          </div>
          <div className="kv">
            波形缓存 <b>{state.stats.peaks}</b>
          </div>
        </div>
      )}
    </div>
  );
}
