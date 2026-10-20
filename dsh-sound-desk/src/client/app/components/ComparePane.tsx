/**
 * Compare workspace — plan P2-3's "多栏对比 / 批量搜索".
 *
 * One query per line, one column each, side by side. The view exists to answer a
 * question the normal list cannot: *do these different descriptions find the same
 * sound?* So the two things it does that a single list cannot are:
 *
 *  - **每栏独立排序** — one column by relevance next to one by duration, because
 *    "which matches best" and "which is shortest" are both real questions.
 *  - **跨栏重合度** — an asset found by several queries is corroborated; one found
 *    by a single query is that query's specific answer. Rows say which they are.
 *
 * Pinning freezes a column's results while other queries are tried, which is how
 * you keep a good result set as a reference point instead of losing it on the next
 * run.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { COMPARE_SORTS, crossColumnCounts, describeColumn, sortHits, type CompareSort } from '../util/compare.ts';
import { formatDuration, formatRate } from '../util/format.ts';
import { requestPlay } from '../audio/playback.ts';
import { store } from '../state/store.ts';
import { useAppState } from '../state/useAppState.ts';
import { Popover } from './Popover.tsx';

const MIN_WIDTH = 180;
const MAX_WIDTH = 720;

export function ComparePane({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const state = useAppState();
  const overlap = crossColumnCounts(state.columns);
  const dragging = useRef<{ id: string; startX: number; startWidth: number } | null>(null);

  /**
   * Column resizing.
   *
   * Listeners go on `window` during the drag so the pointer can leave the 6px
   * handle — a drag that stops working the moment the cursor moves off the grip is
   * the classic way this is implemented wrong.
   */
  const onPointerMove = useCallback((ev: PointerEvent) => {
    const drag = dragging.current;
    if (!drag) return;
    store.setColumnWidth(drag.id, drag.startWidth + (ev.clientX - drag.startX));
  }, []);

  const endDrag = useCallback(() => {
    dragging.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
    };
  }, [onPointerMove, endDrag]);

  const startDrag = (id: string, width: number, ev: React.PointerEvent): void => {
    ev.preventDefault();
    dragging.current = { id, startX: ev.clientX, startWidth: width };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <Popover
      open={open}
      testId="popover-compare"
      title="多栏对比"
      hint={state.columns.length > 0 ? `${state.columns.length} 栏` : '每行一个查询'}
      onClose={onClose}
    >
      <div className="pane compare">
        <div className="section">
        <textarea
          className="cmp-input"
          rows={3}
          value={state.compareInput}
          placeholder={'每行一个查询，最多 6 个，例如：\n金属门 关上\nmetal door close\ndoor slam heavy'}
          onChange={(ev) => store.setCompareInput(ev.target.value)}
          onKeyDown={(ev) => {
            // Ctrl/Cmd+Enter runs the batch; plain Enter must stay a newline here.
            if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
              ev.preventDefault();
              void store.runCompare();
            }
          }}
        />
        <div className="fx-toolbar">
          <button onClick={() => void store.runCompare()}>对比（Ctrl+Enter）</button>
          <button onClick={onClose} title="关闭对比窗口，回到单栏结果列表">
            退出对比
          </button>
          <span className="fx-hint">钉住的栏在重新对比时保留结果</span>
        </div>
        {state.searchError && <div className="fx-error">{state.searchError}</div>}
      </div>

      <div className="cmp-columns">
        {state.columns.map((column) => {
          const sorted = sortHits(column.hits, column.sort);
          return (
            <div className="cmp-column" key={column.id} style={{ width: column.width }}>
              <div className="cmp-col-head">
                <input
                  className="cmp-query"
                  value={column.query}
                  onChange={(ev) => store.setColumnQuery(column.id, ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') void store.rerunColumn(column.id);
                  }}
                  title="回车重新搜索这一栏"
                />
                <button
                  className={column.pinned ? 'active' : ''}
                  onClick={() => store.toggleColumnPin(column.id)}
                  title={column.pinned ? '已钉住：重新对比时保留当前结果' : '钉住这一栏的结果'}
                >
                  {column.pinned ? '📌' : '📍'}
                </button>
                <button onClick={() => store.promoteColumn(column.id)} title="用这个查询回到主列表">
                  ↗
                </button>
                <button onClick={() => store.removeColumn(column.id)} title="移除这一栏">
                  ✕
                </button>
              </div>

              <div className="cmp-col-meta">
                <select
                  value={column.sort}
                  onChange={(ev) => store.setColumnSort(column.id, ev.target.value as CompareSort)}
                  title="这一栏独立排序"
                >
                  {COMPARE_SORTS.map((sort) => (
                    <option key={sort.id} value={sort.id} title={sort.title}>
                      {sort.label}
                    </option>
                  ))}
                </select>
                <span className="count">{describeColumn(column)}</span>
              </div>

              <div className="cmp-col-body">
                {sorted.slice(0, 200).map((hit) => {
                  const shared = (overlap.get(hit.asset.id) ?? 1) > 1;
                  return (
                    <div
                      className={`cmp-row ${state.selectedId === hit.asset.id ? 'selected' : ''}`}
                      key={`${column.id}-${hit.asset.id}`}
                      onClick={() => void store.select(hit)}
                      onDoubleClick={() => requestPlay(hit.asset.id)}
                      title={
                        shared
                          ? `${hit.asset.path}\n出现在 ${overlap.get(hit.asset.id)} 栏中（多栏重合）`
                          : hit.asset.path
                      }
                    >
                      <div className="cmp-name">
                        {shared && <span className="cmp-shared" title="多个查询都找到它">●</span>}
                        {hit.asset.filename}
                      </div>
                      <div className="cmp-sub">
                        {formatDuration(hit.asset.durationMs)}
                        {hit.asset.sampleRate ? ` · ${formatRate(hit.asset.sampleRate)}` : ''}
                        {hit.asset.ucsCatId ? ` · ${hit.asset.ucsCatId}` : ''}
                      </div>
                    </div>
                  );
                })}
                {!column.loading && sorted.length === 0 && !column.error && (
                  <div className="fx-hint" style={{ padding: '8px 10px' }}>
                    没有结果
                  </div>
                )}
              </div>

              {/* 6px grip; the window-level listeners above keep the drag alive */}
              <div
                className="cmp-resize"
                onPointerDown={(ev) => startDrag(column.id, column.width, ev)}
                title="拖动调整栏宽"
                style={{ touchAction: 'none' }}
              />
            </div>
          );
        })}

        {state.columns.length === 0 && (
          <div className="fx-hint" style={{ padding: 12 }}>
            在上面输入几行查询，点「对比」。每行会变成一栏，可以各自排序、钉住、调宽，
            重合的结果会标上 ●。
          </div>
        )}
      </div>
      </div>
    </Popover>
  );
}

export { MIN_WIDTH, MAX_WIDTH };
