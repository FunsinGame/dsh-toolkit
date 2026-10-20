/**
 * Standalone web entry: account/password login, then the shared notes app.
 */

import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { NotesApp } from '../shared/ui/App.tsx'
import { ensureNotesStyles } from '../shared/ui/styles.ts'
import { WebBackend } from './backend.ts'
import { errorMessage } from '../shared/errors.ts'

const backend = new WebBackend()

const baseStyleId = 'dsh-notes-web-base'
function ensureBaseStyles(): void {
  if (document.getElementById(baseStyleId) !== null) return
  const style = document.createElement('style')
  style.id = baseStyleId
  style.textContent = 'html,body,#dsh-notes-root{height:100%;margin:0;padding:0}body{overflow:hidden}'
  document.head.append(style)
}

function LoginPage({ onLoggedIn }: { onLoggedIn: (user: { username: string; displayName: string }) => void }): React.ReactElement {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await backend.login(username.trim(), password)
      const user = await backend.getSession()
      if (user === null) throw new Error('登录状态读取失败')
      onLoggedIn(user)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="dsh-notes-root theme-auto">
      <div className="dsh-notes-login">
        <form className="dsh-notes-login-card" onSubmit={(event) => { void submit(event) }}>
          <h1>DSH Notes</h1>
          <p className="sub">登录后访问你的笔记。账号由服务器管理员配置。</p>
          <div className="dsh-notes-field">
            <label htmlFor="notes-username">用户名</label>
            <input id="notes-username" className="dsh-notes-input" value={username} autoComplete="username" autoFocus
              onChange={(event) => setUsername(event.target.value)} />
          </div>
          <div className="dsh-notes-field">
            <label htmlFor="notes-password">密码</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input id="notes-password" className="dsh-notes-input" type={showPassword ? 'text' : 'password'}
                value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} />
              <button type="button" className="dsh-notes-btn" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? '隐藏' : '显示'}
              </button>
            </div>
          </div>
          {error !== null && <div className="dsh-notes-error">{error}</div>}
          <button type="submit" className="dsh-notes-btn dsh-notes-btn-primary" style={{ width: '100%', height: 34, marginTop: 6 }} disabled={busy || username.trim() === '' || password === ''}>
            {busy ? '登录中…' : '登录'}
          </button>
          <div className="hint">
            没有注册入口。账号、密码与访问令牌只能在服务器本机通过 <code>dsh-notes-server</code> CLI 管理。
          </div>
        </form>
      </div>
    </div>
  )
}

function Shell(): React.ReactElement {
  const [user, setUser] = useState<{ username: string; displayName: string } | null | undefined>(undefined)
  useEffect(() => {
    void backend.getSession().then(setUser).catch(() => setUser(null))
  }, [])
  if (user === undefined) {
    return <div className="dsh-notes-root theme-auto"><div className="dsh-notes-empty"><div className="dsh-notes-empty-title">加载中…</div></div></div>
  }
  if (user === null) return <LoginPage onLoggedIn={setUser} />
  return <NotesApp backend={backend} onLogout={() => setUser(null)} />
}

ensureNotesStyles()
ensureBaseStyles()
const container = document.getElementById('dsh-notes-root')
if (container === null) throw new Error('dsh-notes-root element is missing')
createRoot(container).render(<Shell />)
