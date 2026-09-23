/**
 * Center pane: the result list.
 *
 * Two details matter for usability and both come from the plan:
 *  - the rewritten English captions are shown, because the Chinese→English step
 *    is where semantic search can go wrong, and the user is the best judge;
 *  - when the library genuinely has nothing similar the UI says so, instead of
 *    padding the list with poor matches.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { store } from '../state/store.ts';
import { useAppState } from '../state/useAppState.ts';
import { confidenceClass, formatDuration, formatRate, rerankReasons, sourceLabel } from '../util/format.ts';
import { waveformColorFor } from '../audio/peaks.ts';

/** Row height used for windowing; must match the CSS. */
const ROW_HEIGHT = 46;
const OVERSCAN = 12;

export function ResultsPane({ playingId, onPlay }: { playingId: number | null; onPlay(id: number): void }): React.JSX.Element {
  const state = useAppState();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setViewportHeight(Math.floor(entry.contentRect.height));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const hits = state.hits;
  const total = hits.length;
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(total, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
  const windowed = useMemo(() => hits.slice(first, last), [hits, first, last]);

  return (
    <div className="results">
      {(state.captionsUsed.length > 0 || state.unmatchedTerms.length > 0) && (
        <div className="rewrite">
          <span className="label">检索用 caption</span>
          {state.captionsUsed.map((caption) => (
            <code key={caption}>{caption}</code>
          ))}
          {state.unmatchedTerms.length > 0 && (
            <span style={{ color: 'var(--text-faint)' }}>
              未识别：{state.unmatchedTerms.join('、')}
            </span>
          )}
        </div>
      )}

      {state.semanticIncomplete && (
        <div className="notice">
          声音指纹还没补齐，暂时只用了文件名 / 元数据 / 分类检索——正在后台索引，补完后语义搜索会自动生效。
        </div>
      )}

      {state.mode === 'semantic' && state.stats && state.stats.embedded === 0 && (
        <div className="notice">
          还没有声音指纹，语义搜索暂时没有可比对的向量。运行一次不带 <code>--no-model</code> 的索引即可补齐。
        </div>
      )}

      {state.belowThreshold && (
        <div className="notice">
          没有足够接近的结果——这本身是信息：库里可能真的没有像的素材。换个说法，或改用关键词模式。
        </div>
      )}

      {state.searchError && <div className="notice error">{state.searchError}</div>}

      <div className="pane-head">
        <span>
          结果 {total}
          {state.total > total ? ` / ${state.total}` : ''}
        </span>
        <span>{state.searching ? '…' : `${state.tookMs}ms`}</span>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto' }} onScroll={(ev) => setScrollTop(ev.currentTarget.scrollTop)}>
        <div style={{ height: total * ROW_HEIGHT, position: 'relative' }}>
          <div style={{ transform: `translateY(${first * ROW_HEIGHT}px)` }}>
            {windowed.map((hit) => {
              const asset = hit.asset;
              const selected = state.selectedId === asset.id;
              const playing = playingId === asset.id;
              return (
                <div
                  key={asset.id}
                  className={`row ${selected ? 'selected' : ''} ${playing ? 'playing' : ''}`}
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => void store.select(hit)}
                  onDoubleClick={() => onPlay(asset.id)}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="name" title={asset.path}>
                      {asset.favorite && <span className="fav">★ </span>}
                      {asset.filename}
                      {asset.relativeDir ? <span className="dirname">{asset.relativeDir}</span> : null}
                    </div>
                    <div className="sub">
                      <span>{formatDuration(asset.durationMs)}</span>
                      <span>{formatRate(asset.sampleRate)}</span>
                      {asset.channels ? <span>{asset.channels}ch</span> : null}
                      {asset.ucsCatId ? (
                        <span className={confidenceClass(asset.ucsConfidence, asset.ucsSource)} title={asset.ucsSource ?? ''}>
                          {asset.ucsCatId}
                        </span>
                      ) : (
                        <span className="badge">未分类</span>
                      )}
                      {asset.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="badge tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{ width: 3, height: 26, borderRadius: 2, background: waveformColorFor(asset.id) }}
                      title={[
                        `匹配度 ${(hit.score.confidence * 100).toFixed(0)}%`,
                        ...rerankReasons(hit.score),
                      ].join('\n')}
                    />
                    <span
                      className="count"
                      title={JSON.stringify(hit.score.ranks)}
                      style={hit.score.rerank && hit.score.rerank.matchedTerms.length > 0 ? { color: '#7ee0a0' } : undefined}
                    >
                      {sourceLabel(asset.ucsSource)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {total === 0 && !state.searching && (
          <div className="center-msg">
            <div>没有结果</div>
            <div style={{ fontSize: 12 }}>
              试试换个说法、拆成更具体的词（对象 + 材质 + 动作），或者用「关键词」模式搜文件名。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
