/**
 * The activity page.
 *
 * Boots the engine (the host waits for a cold start when asked), hands the shared
 * workbench store its client once, and then renders the SoundDesk workbench. The
 * store and the audio graph are module singletons, so switching to the conversation
 * and back keeps the library, the query and anything currently playing.
 */

import { useEffect, useState } from 'react'

import styles from '../app/styles.css'
import { App } from '../app/App.tsx'
import { store } from '../app/state/store.ts'
import { getClient } from '../dsh/client.ts'
import { AddLibraryDialog } from './AddLibraryDialog.tsx'
import { SettingsDialog } from './SettingsDialog.tsx'
import { ShadowStage } from './ShadowStage.tsx'

type Phase = 'boot' | 'ready' | 'error'

/** The store outlives this component; initialize it once per page. */
let bootstrapped = false

function Bars(): React.JSX.Element {
  return (
    <div className="dsh-sdk-boot-mark" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6].map((index) => (
        <span
          key={index}
          style={{
            height: 34,
            animationDelay: `${index * 0.09}s`,
          }}
        />
      ))}
    </div>
  )
}

export function Workbench(): React.JSX.Element {
  const client = getClient()
  const [phase, setPhase] = useState<Phase>('boot')
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addLibraryOpen, setAddLibraryOpen] = useState(false)

  useEffect(() => {
    let alive = true
    setPhase('boot')
    setError(null)
    void (async () => {
      try {
        // The host route blocks until the engine is listening, so a cold start with
        // a model download shows this screen instead of a wall of failed requests.
        const status = await client.status(true)
        if (!alive) return
        if (status.state === 'error') throw new Error(status.error ?? '本地引擎启动失败')

        if (!bootstrapped || store.getState().fatalError !== null) {
          bootstrapped = true
          await store.init(client)
        }
        if (!alive) return
        const state = store.getState()
        if (state.fatalError !== null) throw new Error(state.fatalError)
        setPhase('ready')
      } catch (err) {
        if (!alive) return
        setError(err instanceof Error ? err.message : String(err))
        setPhase('error')
      }
    })()
    return () => {
      alive = false
    }
  }, [attempt, client])

  useEffect(() => {
    const openSettings = (): void => setSettingsOpen(true)
    const openLibrary = (): void => setAddLibraryOpen(true)
    window.addEventListener('dsh-sound-desk:open-settings', openSettings)
    window.addEventListener('dsh-sound-desk:add-library', openLibrary)
    return () => {
      window.removeEventListener('dsh-sound-desk:open-settings', openSettings)
      window.removeEventListener('dsh-sound-desk:add-library', openLibrary)
    }
  }, [])

  return (
    <ShadowStage css={styles}>
      {phase === 'boot' && (
        <div className="dsh-sdk-boot">
          <Bars />
          <div className="dsh-sdk-boot-title">正在启动 SoundDesk 引擎</div>
          <div className="dsh-sdk-boot-text">首次启用声音指纹模型时需要下载权重，请稍候。</div>
        </div>
      )}

      {phase === 'error' && (
        <div className="dsh-sdk-boot">
          <div className="dsh-sdk-boot-title">本地引擎没能启动</div>
          <div className="dsh-sdk-boot-text">工作台的搜索、波形和试听都由这个引擎提供。可以重试，或先检查设置与日志。</div>
          {error !== null && <div className="dsh-sdk-boot-error">{error}</div>}
          <div className="dsh-sdk-boot-actions">
            <button
              className="dsh-sdk-primary"
              onClick={() => {
                setAttempt((value) => value + 1)
              }}
            >
              重试
            </button>
            <button onClick={() => setSettingsOpen(true)}>打开设置</button>
          </div>
        </div>
      )}

      {phase === 'ready' && <App bootError={null} />}

      {settingsOpen && (
        <SettingsDialog
          onClose={() => setSettingsOpen(false)}
          onSettingsChanged={() => {
            window.dispatchEvent(new CustomEvent('dsh-sound-desk:settings-changed'))
          }}
        />
      )}

      {addLibraryOpen && <AddLibraryDialog onClose={() => setAddLibraryOpen(false)} />}
    </ShadowStage>
  )
}
