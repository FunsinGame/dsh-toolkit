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
import type { ProbeHit } from '../api/client.ts';
import { confidenceClass, formatDuration, formatRate, rerankReasons, sourceLabel } from '../util/format.ts';
import { buildDragData } from '../util/dragOut.ts';

/**
 * MIME type for the drag payload.
 *
 * Only used as a hint to the drop target; the engine sends the authoritative
 * `content-type` on the download route. WAV covers the library that exists today,
 * and anything else falls back to a generic audio type rather than guessing wrong.
 */
function mimeTypeForName(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  switch (ext) {
    case '.wav':
    case '.wave':
    case '.bwf':
      return 'audio/wav';
    case '.aif':
    case '.aiff':
      return 'audio/aiff';
    case '.flac':
      return 'audio/flac';
    case '.mp3':
      return 'audio/mpeg';
    case '.ogg':
      return 'audio/ogg';
    case '.m4a':
      return 'audio/mp4';
    default:
      return 'audio/wav';
  }
}
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
          {/*
            Two different faults, two different fixes, and conflating them is what made
            this hard to diagnose:
              - no model  -> semantic search cannot run at all; turn loadModel on
              - no prints -> the model is fine; the library just needs the pass run
            The old copy asserted the second cause unconditionally, so a user who simply
            had the model switched off was told to re-index a library that was fine.
          */}
          {!state.stats.modelsReady ? (
            <>
              <strong>声音指纹模型没有加载</strong>，所以语义搜索没有可比对的向量。
              打开设置里的 <code>soundDesk.loadModel</code>（现在默认就是开的）后重载窗口即可；
              模型随插件离线打包，不需要下载。
            </>
          ) : (
            <>
              这个库还没有生成声音指纹，所以没有可比对的向量。用左侧素材库的<strong>「补齐指纹」</strong>按钮补一次即可。
            </>
          )}
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
              // Only probe / slice results carry a matched window; a text search has
              // no reference to compare windows against.
              const maxsim = (hit as ProbeHit).maxsim;
              return (
                <div
                  key={asset.id}
                  className={`row ${selected ? 'selected' : ''} ${playing ? 'playing' : ''}`}
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => void store.select(hit)}
                  onDoubleClick={() => onPlay(asset.id)}
                  // Dragging carries the asset's download URL out of the app, which
                  // is what lets a DAW or the desktop import it. The row is the drag
                  // handle because that is where the pointer already is.
                  draggable
                  onDragStart={(ev) => {
                    void store.select(hit);
                    buildDragData(ev.dataTransfer, {
                      assetId: asset.id,
                      filename: asset.filename,
                      mimeType: mimeTypeForName(asset.filename),
                      downloadUrl: store.getClient().downloadUrl(asset.id),
                      filePath: asset.path,
                    });
                  }}
                  title="拖到桌面 / DAW 可带出下载地址；详情面板有下载与在系统中显示"
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
                    {/*
                      A window match means this file CONTAINS the reference rather
                      than resembling it as a whole. Showing the offset is what makes
                      that usable on a ten-minute ambience — without it the user has
                      to scrub the file to find out why it matched.
                    */}
                    {maxsim && (
                      <span
                        className="badge"
                        title={`与参考音频的第 ${maxsim.windows} 个分析窗比对命中（${
                          maxsim.via === 'stored' ? '来自已存窗口向量' : '本次现场分析'
                        }）`}
                      >
                        @{maxsim.offset}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {total === 0 && !state.searching && (
          <div className="center-msg">
            <div>没有结果</div>
            {/*
              Which advice is useful depends entirely on the mode, and the old copy
              recommended 「关键词」 even when the user was already in it — a dead end,
              and exactly the situation where a Chinese query against an English
              library returns nothing because no filename contains the word.
            */}
            {state.mode === 'keyword' && (state.stats?.embedded ?? 0) > 0 ? (
              <>
                <div style={{ fontSize: 12 }}>
                  「关键词」只比对文件名、内嵌元数据和 UCS 分类名。中文词会被改写成英文再搜，
                  但库里没有哪个文件叫这个名字时就搜不到——而语义搜索比的是<strong>声音指纹</strong>，
                  能找出名字完全不同的素材。
                </div>
                <button style={{ marginTop: 8 }} onClick={() => store.setMode('hybrid')}>
                  改用语义搜索试试
                </button>
              </>
            ) : (
              <div style={{ fontSize: 12 }}>
                试试换个说法、拆成更具体的词（对象 + 材质 + 动作），或者改用「关键词」模式搜文件名。
                {/*
                  Say the real reason when there is one: with no model loaded the
                  semantic retriever never runs, so a Chinese query over an English
                  library cannot match anything — and the generic "换个说法" advice
                  above would send the user off rewriting a query that was fine.
                */}
                {state.stats && !state.stats.modelsReady && (
                  <>
                    {' '}
                    <strong>语义搜索当前不可用</strong>：声音指纹模型没有加载，打开{' '}
                    <code>soundDesk.loadModel</code> 后重载窗口再试。
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
