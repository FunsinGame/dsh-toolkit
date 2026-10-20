/**
 * Add-library dialog.
 *
 * A folder path is the one thing a page cannot obtain by itself, so this asks for it
 * plainly: a native picker when the host can open one, and always a text field, which
 * is also the fallback on hosts without a dialog. Import then runs the full
 * scan → waveform → fingerprint pipeline and hands the progress to the workbench's
 * own import overlay, so there is exactly one progress display.
 */

import { useState } from 'react'

import { getClient } from '../dsh/client.ts'
import { store } from '../app/state/store.ts'

export function AddLibraryDialog({ onClose }: { onClose: () => void }) {
  const client = getClient()
  const [root, setRoot] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  async function browse(): Promise<void> {
    setHint(null)
    try {
      const picked = await client.pickFolder('选择要索引的素材库目录')
      if (picked !== null) setRoot(picked)
    } catch (err) {
      setHint(err instanceof Error ? err.message : String(err))
    }
  }

  async function submit(): Promise<void> {
    const trimmed = root.trim()
    if (trimmed === '' || busy) return
    setBusy(true)
    setError(null)
    try {
      await store.importLibraryAt(trimmed, name.trim() === '' ? undefined : name.trim())
      const failure = store.getState().libraryImportError
      if (failure !== null) {
        setError(failure)
        return
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="dsh-sdk-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="dsh-sdk-dialog" role="dialog" aria-modal="true" aria-label="添加本地素材库">
        <div className="dsh-sdk-dialog-head">
          <div className="dsh-sdk-dialog-title">添加本地素材库</div>
          <button onClick={onClose} disabled={busy} title="关闭">
            ✕
          </button>
        </div>

        <div className="dsh-sdk-dialog-body">
          <div className="dsh-sdk-field">
            <label htmlFor="dsh-sdk-root">素材库目录</label>
            <div className="dsh-sdk-row">
              <input
                id="dsh-sdk-root"
                className="dsh-sdk-grow"
                value={root}
                placeholder="例如 D:\SoundEffects\GameSFX"
                autoFocus
                onChange={(event) => setRoot(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submit()
                  if (event.key === 'Escape' && !busy) onClose()
                }}
              />
              <button onClick={() => void browse()} disabled={busy}>
                浏览…
              </button>
            </div>
            {hint !== null && <small className="dsh-sdk-boot-error">{hint}</small>}
          </div>

          <div className="dsh-sdk-field">
            <label htmlFor="dsh-sdk-name">名称（可选）</label>
            <input
              id="dsh-sdk-name"
              value={name}
              placeholder="默认使用目录名"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="dsh-sdk-note">
            导入会依次执行三步：扫描元数据 → 生成波形 → 计算声音指纹。全部完成前工作台显示全屏进度，
            因为半索引状态下的数量与分类都不准确。已经索引过的目录会增量补齐，不会重复劳动。
          </div>

          <div className="dsh-sdk-note dsh-sdk-warn">
            声音指纹需要先启用 CLAP 模型（设置 → 声音指纹），否则语义搜索与「以声搜声」不可用，其余功能不受影响。
          </div>

          {error !== null && <div className="dsh-sdk-boot-error">{error}</div>}
        </div>

        <div className="dsh-sdk-dialog-foot">
          <button onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="dsh-sdk-primary" onClick={() => void submit()} disabled={busy || root.trim() === ''}>
            {busy ? '正在导入…' : '添加并索引'}
          </button>
        </div>
      </div>
    </div>
  )
}
