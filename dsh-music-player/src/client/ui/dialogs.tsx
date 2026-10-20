/** Modal dialogs for favorites. */

import React, { useEffect, useState } from 'react'
import type { PlayerController } from '../player'
import type { FavoriteMembership, Track } from '../types'
import { Cover, Modal, Spinner } from './common'

export function AddFavoriteDialog({
  controller,
  track,
  onClose,
}: {
  controller: PlayerController
  track: Track
  onClose: () => void
}): React.ReactElement {
  const [folders, setFolders] = useState<FavoriteMembership[] | null>(null)
  const [original, setOriginal] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPrivate, setNewPrivate] = useState(false)

  const load = async (): Promise<void> => {
    setError(null)
    try {
      const items = await controller.membership(track.bvid)
      setFolders(items)
      const checked = new Set(items.filter((item) => item.selected).map((item) => item.id))
      setOriginal(new Set(checked))
      setSelected(checked)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setFolders([])
    }
  }

  useEffect(() => { void load() }, [])

  const toggle = (id: number): void => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async (): Promise<void> => {
    const addIds = [...selected].filter((id) => !original.has(id)).map(String)
    const delIds = [...original].filter((id) => !selected.has(id)).map(String)
    if (addIds.length === 0 && delIds.length === 0) {
      onClose()
      return
    }
    setSaving(true)
    const ok = await controller.dealFavorite(track.bvid, addIds, delIds)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      title="加入收藏夹"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="dmp-btn subtle" onClick={onClose}>取消</button>
          <button type="button" className="dmp-btn primary" disabled={saving || folders === null} onClick={() => { void save() }}>
            {saving ? <Spinner size={13} /> : null}
            确定
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Cover src={track.cover} size={42} radius={8} />
        <div style={{ minWidth: 0 }}>
          <div className="dmp-ellipsis" style={{ fontSize: 12.5, fontWeight: 600 }}>{track.title}</div>
          <div className="dmp-caption dmp-ellipsis">{track.author}</div>
        </div>
      </div>
      {error !== null ? <div className="dmp-error">{error}</div> : null}
      {folders === null ? (
        <div className="dmp-empty" style={{ minHeight: 100 }}><Spinner size={20} /><span>正在读取收藏夹…</span></div>
      ) : folders.length === 0 ? (
        <div className="dmp-empty" style={{ minHeight: 100, padding: 14 }}>
          <p>还没有收藏夹。可以现在就新建一个。</p>
        </div>
      ) : (
        <div className="dmp-modal-list">
          {folders.map((folder) => {
            const checked = selected.has(folder.id)
            return (
              <div className="dmp-modal-row" key={folder.id} onClick={() => { toggle(folder.id) }}>
                <span className={`dmp-check ${checked ? 'on' : ''}`}>{checked ? '✓' : ''}</span>
                <span className="dmp-folder-mini">♥</span>
                <span className="dmp-modal-row-title">{folder.title}</span>
                {original.has(folder.id) ? <span className="dmp-tag accent">已收藏</span> : null}
              </div>
            )
          })}
        </div>
      )}
      {creating ? (
        <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--dmp-border-soft)', borderRadius: 10 }}>
          <input
            className="dmp-input"
            style={{ width: '100%', height: 30, padding: '0 9px', border: '1px solid var(--dmp-border)', borderRadius: 8, background: 'var(--dmp-surface)' }}
            placeholder="收藏夹名称"
            value={newTitle}
            autoFocus
            onChange={(event) => { setNewTitle(event.target.value) }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11 }}>
            <input type="checkbox" checked={newPrivate} onChange={(event) => { setNewPrivate(event.target.checked) }} />
            私密收藏夹
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
            <button type="button" className="dmp-btn sm subtle" onClick={() => { setCreating(false) }}>取消</button>
            <button
              type="button"
              className="dmp-btn sm primary"
              disabled={newTitle.trim() === ''}
              onClick={() => {
                void (async () => {
                  const ok = await controller.createFolder(newTitle.trim(), newPrivate ? 1 : 0)
                  if (ok) {
                    setCreating(false)
                    setNewTitle('')
                    await load()
                  }
                })()
              }}
            >
              创建
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="dmp-btn sm subtle" style={{ marginTop: 8 }} onClick={() => { setCreating(true) }}>
          + 新建收藏夹
        </button>
      )}
    </Modal>
  )
}

export function CreateFolderDialog({
  controller,
  onClose,
}: {
  controller: PlayerController
  onClose: () => void
}): React.ReactElement {
  const [title, setTitle] = useState('')
  const [privacy, setPrivacy] = useState(0)
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title="新建收藏夹"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="dmp-btn subtle" onClick={onClose}>取消</button>
          <button
            type="button"
            className="dmp-btn primary"
            disabled={title.trim() === '' || busy}
            onClick={() => {
              setBusy(true)
              void controller.createFolder(title.trim(), privacy === 1 ? 1 : 0).then((ok) => {
                setBusy(false)
                if (ok) onClose()
              })
            }}
          >
            {busy ? <Spinner size={13} /> : null}
            创建
          </button>
        </>
      }
    >
      <label style={{ display: 'block', fontSize: 11.5, color: 'var(--dmp-text-2)' }}>
        名称
        <input
          className="dmp-input"
          style={{ width: '100%', height: 32, marginTop: 6, padding: '0 10px', border: '1px solid var(--dmp-border)', borderRadius: 9, background: 'var(--dmp-surface)' }}
          value={title}
          autoFocus
          maxLength={40}
          placeholder="例如：通勤循环"
          onChange={(event) => { setTitle(event.target.value) }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, fontSize: 11.5 }}>
        <input type="checkbox" checked={privacy === 1} onChange={(event) => { setPrivacy(event.target.checked ? 1 : 0) }} />
        私密收藏夹（仅自己可见）
      </label>
    </Modal>
  )
}
