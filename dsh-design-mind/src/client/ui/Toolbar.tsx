import type { ReactElement } from 'react'

import { useStore } from '../hook.ts'
import { Icon } from '../icons.tsx'
import type { DesignMindStore } from '../store.ts'

export type MaintenanceAction = 'opening' | 'cleaning' | null

interface ToolbarProps {
  store: DesignMindStore
  onOpen: () => void
  onPaste: () => void
  onExport: () => void
  onCopy: () => void
  onOpenDirectory: () => void
  onCleanDirectory: () => void
  maintenance: MaintenanceAction
}

export function Toolbar({
  store,
  onOpen,
  onPaste,
  onExport,
  onCopy,
  onOpenDirectory,
  onCleanDirectory,
  maintenance,
}: ToolbarProps): ReactElement {
  const state = useStore(store)
  const hasImage = state.image !== null
  const running = state.exportState.status === 'running'
  const busy = maintenance !== null
  const canExport = hasImage && state.annotations.length > 0 && !running && !busy
  const canCopy = state.exportState.status === 'ready'

  return (
    <footer className="dm-toolbar">
      <div className="dm-tools">
        <button type="button" className="dm-tool" onClick={onOpen}>
          <Icon name="image" />
          <span>打开图片</span>
        </button>
        <button type="button" className="dm-tool" onClick={onPaste}>
          <Icon name="clipboard" />
          <span>粘贴图片</span>
        </button>
        <button
          type="button"
          className="dm-tool"
          onClick={() => store.clearAnnotations()}
          disabled={state.annotations.length === 0}
        >
          <Icon name="trash" />
          <span>清除标注</span>
        </button>

        <span className="dm-tool-sep" aria-hidden="true" />

        <button
          type="button"
          className="dm-tool"
          onClick={onOpenDirectory}
          disabled={maintenance === 'opening' || maintenance === 'cleaning'}
          title="在文件管理器中打开导出的临时目录"
        >
          <Icon name="folder" />
          <span>{maintenance === 'opening' ? '打开中…' : '打开目录'}</span>
        </button>
        <button
          type="button"
          className="dm-tool"
          onClick={onCleanDirectory}
          disabled={maintenance === 'cleaning' || maintenance === 'opening'}
          title="删除临时目录中所有已导出的图片与 JSON"
        >
          <Icon name="broom" />
          <span>{maintenance === 'cleaning' ? '清理中…' : '清理目录'}</span>
        </button>
      </div>

      <div className="dm-zoom">
        <button
          type="button"
          className="dm-icon-button"
          onClick={() => store.fit()}
          disabled={!hasImage}
          title="适应窗口（0）"
          aria-label="适应窗口"
        >
          <Icon name="fit" />
        </button>
        <button
          type="button"
          className="dm-icon-button"
          onClick={() => store.zoomBy(1 / 1.2)}
          disabled={!hasImage}
          title="缩小（-）"
          aria-label="缩小"
        >
          <Icon name="zoomOut" />
        </button>
        <span className="dm-zoom-value">{Math.round(state.view.scale * 100)}%</span>
        <button
          type="button"
          className="dm-icon-button"
          onClick={() => store.zoomBy(1.2)}
          disabled={!hasImage}
          title="放大（+）"
          aria-label="放大"
        >
          <Icon name="zoomIn" />
        </button>
      </div>

      <div className="dm-actions">
        {canCopy ? (
          <button type="button" className="dm-ghost" onClick={onCopy}>
            <Icon name="copy" size={15} />
            <span>复制提示词</span>
          </button>
        ) : null}
        <button
          type="button"
          className="dm-primary"
          onClick={onExport}
          disabled={!canExport}
          title={hasImage ? '把原图与评论写入导出目录' : '先打开一张图片'}
        >
          <Icon name="download" size={15} />
          <span>{running ? '导出中…' : '导出设计批注'}</span>
        </button>
      </div>
    </footer>
  )
}
