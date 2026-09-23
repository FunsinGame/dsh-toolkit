/** Search bar: query, mode, and a debounced submit. */

import { useEffect, useRef, useState } from 'react';
import type { SearchMode } from '@sounddesk/core';

import { store } from '../state/store.ts';
import { useAppState } from '../state/useAppState.ts';

const MODES: Array<{ id: SearchMode; label: string; title: string }> = [
  { id: 'hybrid', label: '混合', title: '关键词 + 语义 + UCS 融合（推荐）' },
  { id: 'semantic', label: '语义', title: '只用声音指纹找（需要模型）' },
  { id: 'keyword', label: '关键词', title: '只用文件名与元数据；支持 (a, b) -c * 语法' },
];

export function SearchBar(): React.JSX.Element {
  const state = useAppState();
  const [query, setQuery] = useState(state.query);
  const timer = useRef<number | null>(null);

  // keep the input in sync when something else changes the query
  // (clearing via Esc, or switching to a similarity result set)
  useEffect(() => {
    setQuery((current) => (current === state.query ? current : state.query));
  }, [state.query]);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  function schedule(value: string): void {
    setQuery(value);
    store.setQuery(value);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void store.runSearch();
    }, 260);
  }

  function submitNow(): void {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    void store.runSearch();
  }

  const running = state.jobs.find((j) => j.state === 'running');

  return (
    <div className="topbar">
      <div className="brand">
        Sound<span>Desk</span>
      </div>
      <div className="searchbox">
        <input
          value={query}
          aria-label="搜索"
          placeholder="用一句话描述你要的声音，或输入文件名 / 关键词语法（如 wind (gust*, blow*) -window）"
          onChange={(ev) => schedule(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') submitNow();
            if (ev.key === 'Escape') {
              setQuery('');
              store.setQuery('');
              submitNow();
            }
          }}
        />
        <div className="modes">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={state.mode === m.id ? 'active' : ''}
              title={m.title}
              onClick={() => store.setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="meta">
        {running
          ? `索引进度 ${running.done}/${running.total}${running.failed > 0 ? `（${running.failed} 失败）` : ''}`
          : state.searching
            ? '搜索中…'
            : state.stats
              ? `${state.stats.assets} 条素材 · ${state.tookMs}ms`
              : ''}
      </div>
    </div>
  );
}
