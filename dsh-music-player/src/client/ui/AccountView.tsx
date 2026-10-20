import React from 'react'
import { IconInfo, IconLogin, IconRefresh, IconUser } from '../icons'
import type { PlayerController } from '../player'
import { Avatar, EmptyState, Spinner, useStore } from './common'

export function AccountView({ controller }: { controller: PlayerController }): React.ReactElement {
  const library = useStore(controller.library)
  const { account, qr, cache } = library

  if (account.loggedIn && account.user !== null) {
    return (
      <div className="dmp-account-layout dmp-fade-in">
        <div className="dmp-account-card">
          <Avatar name={account.user.name} src={account.user.face} size={76} />
          <div className="dmp-account-name">{account.user.name}</div>
          <div className="dmp-account-mid">UID {account.user.mid}</div>
          <div className="dmp-account-actions">
            <button type="button" className="dmp-btn" onClick={() => { controller.setTab('favorites'); void controller.refreshFavorites() }}>
              打开收藏夹
            </button>
            <button type="button" className="dmp-btn danger" onClick={() => { void controller.logout() }}>
              退出登录
            </button>
          </div>
          <div className="dmp-divider" />
          <div style={{ textAlign: 'left' }}>
            <div className="dmp-kv"><span>宿主状态</span><strong>{library.hostError === null ? '已连接' : library.hostError}</strong></div>
            <div className="dmp-kv"><span>音频缓存</span><strong>{cache === null ? '—' : `${cache.files} 个文件`}</strong></div>
            <div className="dmp-kv"><span>登录凭据</span><strong>保存在 DSH 宿主目录</strong></div>
          </div>
          <p className="dmp-caption" style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <IconInfo size={12} /> 登录凭据只用于访问 B 站接口，不会上传到其他服务。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="dmp-account-layout dmp-fade-in">
      <div className="dmp-account-card">
        <span className="dmp-account-name" style={{ display: 'block' }}>扫码登录 B 站</span>
        <p className="dmp-caption" style={{ margin: '6px 0 0' }}>
          登录后可浏览、播放和整理收藏夹。二维码由宿主向 B 站申请，凭据只保存在本机。
        </p>

        {qr === null || qr.dataUrl === '' ? (
          <div style={{ marginTop: 18 }}>
            <div className="dmp-qr-box" style={{ width: 232, height: 232, background: 'var(--dmp-surface-2)' }}>
              <div className="dmp-empty" style={{ minHeight: 0, padding: 0, width: '100%' }}>
                {qr !== null && qr.status === 'waiting'
                  ? <><Spinner size={22} /><span style={{ fontSize: 11 }}>{qr.message}</span></>
                  : <><IconUser size={30} /><span style={{ fontSize: 11 }}>点击下方按钮获取二维码</span></>}
              </div>
            </div>
            <div className="dmp-account-actions">
              <button type="button" className="dmp-btn primary" onClick={() => { void controller.startQr() }}>
                <IconLogin size={14} />
                获取登录二维码
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="dmp-qr-box">
              <img src={qr.dataUrl} alt="B 站登录二维码" />
              {qr.status === 'expired' || qr.status === 'cancelled' || qr.status === 'error' ? (
                <span className="dmp-qr-veil">
                  {qr.status === 'expired' ? '二维码已过期' : qr.status === 'cancelled' ? '已取消' : '获取失败'}
                </span>
              ) : null}
            </div>
            <div className={`dmp-auth-status ${qr.status}`}>{qr.message}</div>
            <div className="dmp-account-actions">
              {qr.status === 'waiting' || qr.status === 'scanned' ? (
                <button type="button" className="dmp-btn" onClick={() => { controller.cancelQr() }}>取消</button>
              ) : null}
              <button type="button" className="dmp-btn" onClick={() => { void controller.startQr() }}>
                <IconRefresh size={13} />
                刷新二维码
              </button>
            </div>
            <div className="dmp-steps">
              <span><IconInfo size={12} /> 打开手机 B 站 App</span>
              <span>扫一扫</span>
              <span>确认登录</span>
            </div>
          </>
        )}

        {account.loading ? <div className="dmp-caption" style={{ marginTop: 10 }}>正在恢复登录状态…</div> : null}
        {library.hostError !== null ? <div className="dmp-error" style={{ justifyContent: 'center' }}>{library.hostError}</div> : null}
      </div>
    </div>
  )
}
