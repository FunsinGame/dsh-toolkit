import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'

import {
  DesignMindApiError,
  cleanExports,
  commitExport,
  createExport,
  hostInfo,
  revealExports,
  uploadImage,
  type CommentPayload,
} from '../api.ts'
import { copyText } from '../clipboard.ts'
import { useStore } from '../hook.ts'
import { DesignGlyph } from '../icons.tsx'
import { prepareImage, readClipboardImage } from '../image.ts'
import type { Annotation, DesignMindStore } from '../store.ts'
import { Canvas } from './Canvas.tsx'
import { Comments } from './Comments.tsx'
import { Toolbar, type MaintenanceAction } from './Toolbar.tsx'

declare const __DESIGN_MIND_VERSION__: string
const CLIENT_VERSION = typeof __DESIGN_MIND_VERSION__ === 'string' ? __DESIGN_MIND_VERSION__ : '0.0.0'

interface AppProps {
  store: DesignMindStore
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function messageOf(error: unknown): string {
  if (error instanceof DesignMindApiError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * A 404 from the directory endpoints almost always means the page is newer than
 * the host: the client bundle is reloaded per view, the host bundle only at app
 * start. Translate that into the action the user needs to take.
 */
async function directoryError(error: unknown): Promise<string> {
  if (!(error instanceof DesignMindApiError) || error.status !== 404) return messageOf(error)
  try {
    const host = await hostInfo()
    if (host.version !== CLIENT_VERSION) {
      return `目录接口未加载（宿主 v${host.version}，页面 v${CLIENT_VERSION}）。请完全退出 DSH 后重新打开，只刷新窗口不够。`
    }
    return `宿主 v${host.version} 没有目录接口，请重启 DSH 后再试。`
  } catch {
    return '目录接口不可用，请完全退出 DSH 后重新打开。'
  }
}

function toPayload(annotation: Annotation): CommentPayload {
  if (annotation.kind === 'global') return { kind: 'global', text: annotation.text }
  return {
    kind: 'region',
    source: annotation.source,
    rect: annotation.rect,
    text: annotation.text,
  }
}

export function App({ store }: AppProps): ReactElement {
  const state = useStore(store)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const toastTimer = useRef<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [manualCopy, setManualCopy] = useState('')
  const [maintenance, setMaintenance] = useState<MaintenanceAction>(null)

  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2800)
  }, [])

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    },
    [],
  )

  const load = useCallback(
    async (file: File) => {
      const snapshot = store.getSnapshot()
      if (
        snapshot.image !== null &&
        snapshot.annotations.length > 0 &&
        !window.confirm('打开新图片会清除当前标注，继续吗？')
      ) {
        return
      }
      setBusy(true)
      try {
        const prepared = await prepareImage(file)
        const url = URL.createObjectURL(prepared.blob)
        store.setImage({
          blob: prepared.blob,
          url,
          width: prepared.width,
          height: prepared.height,
          mime: prepared.mime,
          name: prepared.name,
        })
        notify(prepared.scaled ? `图片已缩放为 ${prepared.width}×${prepared.height}` : '图片已载入')
      } catch (error) {
        notify(messageOf(error))
      } finally {
        setBusy(false)
      }
    },
    [store, notify],
  )

  const paste = useCallback(async () => {
    try {
      const file = await readClipboardImage()
      if (file === null) {
        notify('剪贴板里没有图片，也可以按 Ctrl+V 粘贴')
        return
      }
      await load(file)
    } catch {
      notify('读取剪贴板失败，请按 Ctrl+V 粘贴')
    }
  }, [load, notify])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target !== null && target.closest('textarea, input, [contenteditable="true"]') !== null) return
      const file = Array.from(event.clipboardData?.files ?? []).find((candidate) =>
        candidate.type.startsWith('image/'),
      )
      if (file === undefined) return
      event.preventDefault()
      void load(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [load])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target !== null && target.closest('textarea, input, [contenteditable="true"]') !== null) return
      const selected = store.getSnapshot().selectedId
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected !== null) {
        event.preventDefault()
        store.remove(selected)
        return
      }
      if (event.key === '0') {
        event.preventDefault()
        store.fit()
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        store.zoomBy(1.2)
      } else if (event.key === '-') {
        event.preventDefault()
        store.zoomBy(1 / 1.2)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store])

  const runExport = useCallback(async () => {
    const snapshot = store.getSnapshot()
    const { image, annotations } = snapshot
    if (image === null || annotations.length === 0) return
    const empty = annotations.filter((annotation) => annotation.text.trim() === '').length
    if (empty > 0 && !window.confirm(`有 ${empty} 条评论还没写内容，仍要导出吗？`)) return

    store.exportStart()
    try {
      const created = await createExport()
      const uploaded = await uploadImage(created.exportId, image.blob)
      if (uploaded.width !== image.width || uploaded.height !== image.height) {
        throw new Error('图片尺寸校验不一致，请重新导入图片')
      }
      const result = await commitExport(created.exportId, annotations.map(toPayload))
      store.exportReady(result)
      notify(`已导出 ${result.count} 条评论，点「复制提示词」`)
    } catch (error) {
      store.exportFailed(messageOf(error))
      notify(messageOf(error))
    }
  }, [store, notify])

  const copyPrompt = useCallback(async () => {
    const prompt = store.getSnapshot().exportState.prompt
    if (prompt === '') return
    const copied = await copyText(prompt)
    if (copied) {
      notify('提示词已复制，去会话里粘贴')
      return
    }
    notify('复制失败，请手动复制弹层里的文本')
    setManualCopy(prompt)
  }, [store, notify])

  const openDirectory = useCallback(async () => {
    if (maintenance !== null) return
    setMaintenance('opening')
    try {
      const result = await revealExports()
      notify(`已打开导出目录：${result.dir}`)
    } catch (error) {
      notify(await directoryError(error))
    } finally {
      setMaintenance(null)
    }
  }, [maintenance, notify])

  const cleanDirectory = useCallback(async () => {
    if (maintenance !== null) return
    if (!window.confirm('清理临时目录会删除所有已导出的图片与 JSON，且不可恢复。继续吗？')) return
    setMaintenance('cleaning')
    try {
      const result = await cleanExports()
      store.exportIdle()
      notify(
        result.removed === 0
          ? '临时目录已经是空的'
          : `已清理 ${result.removed} 份导出（${formatBytes(result.bytes)}）`,
      )
    } catch (error) {
      notify(await directoryError(error))
    } finally {
      setMaintenance(null)
    }
  }, [maintenance, notify, store])

  return (
    <div className="dm-root">
      <header className="dm-header">
        <div className="dm-brand">
          <DesignGlyph size={18} />
          <span>设计批注</span>
        </div>
        <div className="dm-meta">
          {state.image !== null ? (
            <>
              <span className="dm-filename" title={state.image.name}>
                {state.image.name}
              </span>
              <span className="dm-dim">
                {state.image.width}×{state.image.height}
              </span>
            </>
          ) : (
            <span className="dm-dim">未载入图片</span>
          )}
        </div>
        <div className="dm-hint">
          {busy
            ? '处理图片中…'
            : state.image === null
              ? '打开、拖入或粘贴一张设计图'
              : '在图上拖拽框选区域，右侧写意见'}
        </div>
      </header>

      <div className="dm-body">
        <Canvas
          store={store}
          onOpen={() => inputRef.current?.click()}
          onPaste={() => void paste()}
          onDropFile={(file) => void load(file)}
          onNotify={notify}
          busy={busy}
        />
        <Comments store={store} onCopy={() => void copyPrompt()} />
      </div>

      <Toolbar
        store={store}
        onOpen={() => inputRef.current?.click()}
        onPaste={() => void paste()}
        onExport={() => void runExport()}
        onCopy={() => void copyPrompt()}
        onOpenDirectory={() => void openDirectory()}
        onCleanDirectory={() => void cleanDirectory()}
        maintenance={maintenance}
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file !== undefined) void load(file)
        }}
      />

      {toast !== '' ? (
        <div className="dm-toast" role="status">
          {toast}
        </div>
      ) : null}

      {manualCopy !== '' ? (
        <div
          className="dm-modal"
          role="dialog"
          aria-modal="true"
          aria-label="手动复制提示词"
          onClick={() => setManualCopy('')}
        >
          <div className="dm-modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>手动复制提示词</h3>
            <p>自动复制被宿主拦截了。下面这段文本已经全选，按 Ctrl+C 复制。</p>
            <textarea readOnly value={manualCopy} onFocus={(event) => event.currentTarget.select()} />
            <div className="dm-modal-actions">
              <button type="button" className="dm-primary" onClick={() => setManualCopy('')}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
