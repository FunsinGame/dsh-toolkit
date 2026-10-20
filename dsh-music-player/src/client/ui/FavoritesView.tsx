import React, { useState } from 'react'
import { IconBack, IconCheck, IconFolder, IconHeart, IconPlay, IconPlus, IconRefresh, IconSearch, IconTrash } from '../icons'
import type { PlayerController } from '../player'
import type { Track } from '../types'
import { AddFavoriteDialog, CreateFolderDialog } from './dialogs'
import { ConfirmDialog, EmptyState, SkeletonList, Spinner, TrackRow, useStore } from './common'

export function FavoritesView({ controller }: { controller: PlayerController }): React.ReactElement {
  const library = useStore(controller.library)
  const player = useStore(controller.player)
  const { favorites, account } = library
  const open = favorites.open
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [favoriteTrack, setFavoriteTrack] = useState<Track | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [folderKeyword, setFolderKeyword] = useState('')

  if (!account.loggedIn) {
    return (
      <EmptyState
        icon={<IconHeart size={28} />}
        title="登录后浏览收藏夹"
        description="用手机 B 站 App 扫码，即可在这里浏览、播放和整理你的收藏夹。"
        action={<button type="button" className="dmp-btn primary" onClick={() => { controller.setTab('account'); void controller.startQr() }}>扫码登录</button>}
      />
    )
  }

  if (open !== null) {
    const isCurrent = (track: Track): boolean =>
      player.track !== null && player.track.bvid === track.bvid &&
      (track.cid === undefined || player.track.cid === undefined || player.track.cid === track.cid)
    return (
      <div className="dmp-fade-in">
        <div className="dmp-folder-head">
          <button type="button" className="dmp-iconbtn bordered" title="返回收藏夹列表" onClick={() => { controller.library.set((state) => ({ ...state, favorites: { ...state.favorites, open: null } })) }}>
            <IconBack size={16} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h3 className="dmp-ellipsis">{open.title || '收藏夹'}</h3>
            <div className="dmp-caption">{open.total} 个内容{open.keyword !== '' ? ` · 搜索「${open.keyword}」` : ''}</div>
          </div>
          <span className="dmp-spacer" />
          <button
            type="button"
            className="dmp-btn sm"
            onClick={() => { void controller.openFolder(open.mediaId, open.title, open.keyword) }}
            disabled={open.loading}
          >
            {open.loading ? <Spinner size={12} /> : <IconRefresh size={13} />}
            刷新
          </button>
          <button type="button" className="dmp-btn sm primary" disabled={open.items.length === 0} onClick={() => { controller.playFolderAt(0) }}>
            <IconPlay size={13} />
            播放歌单
          </button>
        </div>

        <div className="dmp-toolbar">
          <form
            style={{ display: 'flex', flex: 1, gap: 7, maxWidth: 380 }}
            onSubmit={(event) => { event.preventDefault(); void controller.searchInFolder(folderKeyword) }}
          >
            <input
              className="dmp-input"
              style={{ flex: 1, height: 32, padding: '0 10px', border: '1px solid var(--dmp-border)', borderRadius: 9, background: 'var(--dmp-surface)' }}
              placeholder="在这个收藏夹里搜索"
              value={folderKeyword}
              onChange={(event) => { setFolderKeyword(event.target.value) }}
            />
            <button type="submit" className="dmp-btn sm" title="搜索"><IconSearch size={14} /></button>
          </form>
          <button
            type="button"
            className={`dmp-btn sm ${selectMode ? 'primary' : ''}`}
            onClick={() => { setSelectMode((value) => !value) }}
          >
            <IconCheck size={13} />
            多选
          </button>
          {selectMode ? (
            <>
              <button type="button" className="dmp-btn sm" onClick={() => { controller.selectAllVisible() }}>
                全选 / 取消
              </button>
              <button
                type="button"
                className="dmp-btn sm danger"
                disabled={open.selected.length === 0 || favorites.busy}
                onClick={() => { setConfirmRemove(true) }}
              >
                <IconTrash size={13} />
                移出选中{open.selected.length > 0 ? ` (${open.selected.length})` : ''}
              </button>
            </>
          ) : null}
        </div>

        {open.error !== null ? <div className="dmp-error">{open.error}</div> : null}
        {open.loading && open.items.length === 0 ? (
          <SkeletonList rows={7} />
        ) : open.items.length === 0 ? (
          <EmptyState
            icon={<IconFolder size={28} />}
            title={open.keyword !== '' ? '没有匹配的内容' : '这个收藏夹是空的'}
            description={open.keyword !== '' ? '换个关键词，或清空搜索查看全部。' : '在 B 站 App 或网页里收藏视频后，刷新即可看到。'}
          />
        ) : (
          <div className="dmp-result-list">
            {open.items.map((track, index) => (
              <TrackRow
                key={`${track.bvid}-${index}`}
                track={track}
                current={isCurrent(track)}
                playing={player.playing}
                showCheckbox={selectMode}
                selected={open.selected.includes(track.bvid)}
                onToggleSelect={() => { controller.toggleSelected(track.bvid) }}
                onPlay={() => { controller.playFolderAt(index) }}
                onEnqueue={() => { controller.enqueue(track) }}
                onFavorite={() => { setFavoriteTrack(track) }}
                index={index}
              />
            ))}
          </div>
        )}
        <div className="dmp-pager">
          {open.hasMore ? (
            <button type="button" className="dmp-btn sm" disabled={open.loadingMore} onClick={() => { void controller.loadMoreFavorites() }}>
              {open.loadingMore ? <Spinner size={12} /> : null}
              加载更多
            </button>
          ) : open.items.length > 0 ? <span>已加载全部 {open.items.length} 项</span> : null}
        </div>

        {confirmRemove ? (
          <ConfirmDialog
            title="移出收藏夹"
            message={`确定把选中的 ${open.selected.length} 个视频移出「${open.title}」吗？视频本身不会被删除。`}
            confirmLabel="移出"
            danger
            onClose={() => { setConfirmRemove(false) }}
            onConfirm={() => controller.removeSelected()}
          />
        ) : null}
        {favoriteTrack !== null ? (
          <AddFavoriteDialog controller={controller} track={favoriteTrack} onClose={() => { setFavoriteTrack(null) }} />
        ) : null}
      </div>
    )
  }

  return (
    <div className="dmp-fade-in">
      <div className="dmp-toolbar">
        <button type="button" className="dmp-btn sm" onClick={() => { void controller.refreshFavorites() }} disabled={favorites.loading}>
          {favorites.loading ? <Spinner size={12} /> : <IconRefresh size={13} />}
          刷新
        </button>
        <button type="button" className="dmp-btn sm primary" onClick={() => { setCreateOpen(true) }}>
          <IconPlus size={13} />
          新建收藏夹
        </button>
        <span className="dmp-caption">{favorites.folders.length} 个收藏夹</span>
      </div>
      {favorites.error !== null ? <div className="dmp-error">{favorites.error}</div> : null}
      {favorites.loading && !favorites.loaded ? (
        <div className="dmp-folder-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="dmp-folder-card" key={index}>
              <span className="dmp-skeleton-block" style={{ width: 40, height: 40, borderRadius: 13 }} />
              <span className="dmp-skeleton-block dmp-skeleton-line" style={{ width: '62%' }} />
            </div>
          ))}
        </div>
      ) : favorites.folders.length === 0 ? (
        <EmptyState
          icon={<IconFolder size={28} />}
          title="还没有收藏夹"
          description="在 B 站创建收藏夹后，这里会自动出现。也可以现在新建一个。"
          action={<button type="button" className="dmp-btn primary" onClick={() => { setCreateOpen(true) }}>新建收藏夹</button>}
        />
      ) : (
        <div className="dmp-folder-grid">
          {favorites.folders.map((folder) => (
            <div
              className="dmp-folder-card"
              key={folder.id}
              role="button"
              tabIndex={0}
              onClick={() => { void controller.openFolder(folder.id, folder.title) }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  void controller.openFolder(folder.id, folder.title)
                }
              }}
            >
              <span className="dmp-folder-icon"><IconFolder size={20} /></span>
              <span className="dmp-folder-title">{folder.title}</span>
              <span className="dmp-folder-meta">
                <span>{folder.count} 个内容</span>
                <span style={{ marginLeft: 'auto' }}>打开 <IconPlay size={11} /></span>
              </span>
              <button
                type="button"
                className="dmp-iconbtn sm danger dmp-folder-delete"
                title="删除收藏夹"
                onClick={(event) => {
                  event.stopPropagation()
                  setDeleteTarget({ id: folder.id, title: folder.title })
                }}
                onKeyDown={(event) => { event.stopPropagation() }}
              >
                <IconTrash size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {createOpen ? <CreateFolderDialog controller={controller} onClose={() => { setCreateOpen(false) }} /> : null}
      {deleteTarget !== null ? (
        <ConfirmDialog
          title="删除收藏夹"
          message={`确定删除收藏夹「${deleteTarget.title}」吗？收藏夹内的视频不会从 B 站删除，但该收藏夹本身会被移除，且无法撤销。`}
          confirmLabel="删除"
          danger
          onClose={() => { setDeleteTarget(null) }}
          onConfirm={() => controller.deleteFolder(deleteTarget.id, deleteTarget.title)}
        />
      ) : null}
    </div>
  )
}
