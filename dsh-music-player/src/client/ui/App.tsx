import React, { useEffect } from 'react'
import {
  IconCheck,
  IconHeart,
  IconInfo,
  IconMusic,
  IconQueue,
  IconSearch,
  IconSettings,
  IconSpinner,
  IconUser,
} from '../icons'
import { MusicGlyph } from '../icons'
import type { PlayerController } from '../player'
import type { Tab } from '../types'
import { AccountView } from './AccountView'
import { Avatar, useStore } from './common'
import { FavoritesView } from './FavoritesView'
import { NowPlaying } from './NowPlaying'
import { PlayerBar } from './PlayerBar'
import { QueueView } from './QueueView'
import { SearchView } from './SearchView'
import { SettingsView } from './SettingsView'

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode; title: string; subtitle: string }> = [
  { id: 'search', label: '搜索', icon: <IconSearch size={17} />, title: '搜索 B 站音频', subtitle: '关键词或 BV 号直达，点一下就能听' },
  { id: 'favorites', label: '收藏夹', icon: <IconHeart size={17} />, title: '我的收藏夹', subtitle: '浏览、播放与整理 B 站收藏夹' },
  { id: 'queue', label: '队列', icon: <IconQueue size={17} />, title: '播放队列', subtitle: '拖动排序，双击开播，切换播放模式' },
  { id: 'account', label: '账户', icon: <IconUser size={17} />, title: '账户', subtitle: '扫码登录后同步收藏夹' },
  { id: 'settings', label: '设置', icon: <IconSettings size={17} />, title: '设置', subtitle: '音质、缓存、网络与界面选项' },
]

export function App({ controller }: { controller: PlayerController }): React.ReactElement {
  const library = useStore(controller.library)
  const player = useStore(controller.player)
  const ui = useStore(controller.ui)
  const tab = ui.tab
  const meta = TABS.find((item) => item.id === tab) ?? TABS[0] as (typeof TABS)[number]

  useEffect(() => {
    if (tab === 'favorites' && library.account.loggedIn && !library.favorites.loaded && !library.favorites.loading) {
      void controller.refreshFavorites()
    }
    if (tab === 'settings') void controller.refreshCache()
    // The tab switch is the trigger; the loaded flags prevent a request loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, library.account.loggedIn])

  const badges: Partial<Record<Tab, number>> = {
    favorites: library.favorites.folders.length > 0 ? library.favorites.folders.length : undefined,
    queue: player.queue.length > 0 ? player.queue.length : undefined,
  }

  return (
    <div className="dmp-root">
      <aside className="dmp-nav">
        <div className="dmp-brand">
          <span className="dmp-brand-mark"><MusicGlyph size={21} active /></span>
          <div className="dmp-brand-text">
            <h1>音乐播放器</h1>
            <span>Bilibili Audio</span>
          </div>
        </div>
        <nav className="dmp-nav-list" aria-label="播放器页面">
          {TABS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`dmp-nav-item ${tab === item.id ? 'active' : ''}`}
              onClick={() => { controller.setTab(item.id) }}
            >
              <span className="dmp-nav-icon">{item.icon}</span>
              <span className="dmp-nav-label">{item.label}</span>
              {badges[item.id] !== undefined ? <span className="dmp-nav-badge">{badges[item.id]}</span> : null}
            </button>
          ))}
        </nav>
        <div className="dmp-nav-foot">
          <button type="button" className="dmp-account-mini" onClick={() => { controller.setTab('account') }}>
            {library.account.loggedIn && library.account.user !== null
              ? <Avatar name={library.account.user.name} src={library.account.user.face} size={28} />
              : <span className="dmp-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>B</span>}
            <span className="dmp-mini-name">
              <strong>{library.account.loggedIn && library.account.user !== null ? library.account.user.name : '未登录'}</strong>
              <span>{library.account.loggedIn ? '已同步收藏夹' : '扫码登录 B 站'}</span>
            </span>
          </button>
          <div className="dmp-host-line" title={library.hostError ?? '宿主已连接'}>
            <span className={`dmp-dot ${library.hostError === null ? '' : 'bad'}`} />
            <span>{library.hostError === null ? '宿主已连接' : '宿主未连接'}</span>
          </div>
        </div>
      </aside>

      <main className="dmp-main">
        <header className="dmp-topbar">
          <div className="dmp-topbar-title">
            <h2>{meta.title}</h2>
            <p>{meta.subtitle}</p>
          </div>
          <div className="dmp-topbar-actions">
            {player.loading ? (
              <span className="dmp-tag warn" style={{ height: 26, gap: 6 }}>
                <IconSpinner size={12} />
                {player.loadingMessage || '准备中'}
              </span>
            ) : null}
            {library.hostError !== null ? (
              <span className="dmp-tag danger" style={{ height: 26, gap: 5 }}>
                <IconInfo size={12} />
                {library.hostError}
              </span>
            ) : null}
            {library.account.loggedIn && library.account.user !== null ? (
              <button type="button" className="dmp-iconbtn bordered" title={library.account.user.name} onClick={() => { controller.setTab('account') }}>
                <Avatar name={library.account.user.name} src={library.account.user.face} size={24} />
              </button>
            ) : null}
          </div>
        </header>

        <div className="dmp-content">
          {tab === 'search' ? <SearchView controller={controller} /> : null}
          {tab === 'favorites' ? <FavoritesView controller={controller} /> : null}
          {tab === 'queue' ? <QueueView controller={controller} /> : null}
          {tab === 'account' ? <AccountView controller={controller} /> : null}
          {tab === 'settings' ? <SettingsView controller={controller} /> : null}
        </div>

        <PlayerBar controller={controller} />
      </main>

      <aside className="dmp-side">
        <NowPlaying controller={controller} />
      </aside>

      {ui.toast !== null ? (
        <button
          type="button"
          className={`dmp-toast ${ui.toast.level}`}
          onClick={() => { controller.dismissToast() }}
          title="点击关闭"
        >
          {ui.toast.level === 'success' ? <IconCheck size={13} /> : ui.toast.level === 'error' ? <IconInfo size={13} /> : <IconMusic size={13} />}
          <span>{ui.toast.message}</span>
        </button>
      ) : null}
    </div>
  )
}
