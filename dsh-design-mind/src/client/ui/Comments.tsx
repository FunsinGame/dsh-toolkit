import type { ReactElement } from 'react'

import { useStore } from '../hook.ts'
import { Icon } from '../icons.tsx'
import type { DesignMindStore } from '../store.ts'

interface CommentsProps {
  store: DesignMindStore
  onCopy: () => void
}

export function Comments({ store, onCopy }: CommentsProps): ReactElement {
  const state = useStore(store)
  const { exportState } = state
  const ready = exportState.status === 'ready'

  return (
    <aside className="dm-panel" aria-label="评论">
      <div className="dm-panel-head">
        <span className="dm-panel-title">评论</span>
        <span className="dm-count">{state.annotations.length}</span>
        <button
          type="button"
          className="dm-ghost"
          onClick={() => store.addGlobal()}
          disabled={state.image === null}
          title="添加一条不针对具体区域的整体意见"
        >
          整体意见
        </button>
      </div>

      {ready ? (
        <div className={`dm-export${exportState.stale ? ' is-stale' : ''}`}>
          <span className="dm-export-title">{exportState.stale ? '内容已修改，请重新导出' : '已导出'}</span>
          <code className="dm-export-path" title={exportState.dir}>
            {exportState.dir}
          </code>
          <div className="dm-export-actions">
            <button type="button" className="dm-primary dm-small" onClick={onCopy}>
              复制提示词
            </button>
            <button type="button" className="dm-ghost dm-small" onClick={() => store.exportIdle()}>
              隐藏
            </button>
          </div>
        </div>
      ) : null}

      {exportState.status === 'error' ? (
        <div className="dm-export is-error" role="alert">
          <span className="dm-export-title">导出失败</span>
          <span>{exportState.error}</span>
        </div>
      ) : null}

      <div className="dm-cards">
        {state.annotations.length === 0 ? (
          <p className="dm-panel-empty">
            在左侧图上拖拽框选一处区域，它会作为一条评论出现在这里。
            <br />
            不针对具体位置的整体建议，点右上角「整体意见」。
          </p>
        ) : (
          state.annotations.map((annotation, index) => (
            <article
              key={annotation.id}
              className={`dm-card${annotation.id === state.selectedId ? ' is-selected' : ''}`}
              onClick={() => store.select(annotation.id)}
            >
              <header className="dm-card-head">
                <span className="dm-card-num">{index + 1}</span>
                <span
                  className="dm-card-coords"
                  title={
                    annotation.kind === 'region' && annotation.cut
                      ? `原始位置 ${annotation.source.x1},${annotation.source.y1}`
                      : ''
                  }
                >
                  {annotation.kind === 'region'
                    ? `${annotation.rect.x1},${annotation.rect.y1} · ${annotation.rect.x2 - annotation.rect.x1}×${annotation.rect.y2 - annotation.rect.y1}`
                    : '整体意见'}
                </span>
                {annotation.kind === 'region' && annotation.cut ? (
                  <span className="dm-chip">已裁剪</span>
                ) : null}
                <button
                  type="button"
                  className="dm-icon-button"
                  aria-label={`删除第 ${index + 1} 条评论`}
                  title="删除"
                  onClick={(event) => {
                    event.stopPropagation()
                    store.remove(annotation.id)
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              </header>
              <textarea
                className="dm-textarea"
                value={annotation.text}
                rows={2}
                placeholder="写下这一处要怎么改…"
                autoFocus={state.justAdded === annotation.id}
                onFocus={() => store.select(annotation.id)}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => store.setText(annotation.id, event.target.value)}
              />
            </article>
          ))
        )}
      </div>
    </aside>
  )
}
