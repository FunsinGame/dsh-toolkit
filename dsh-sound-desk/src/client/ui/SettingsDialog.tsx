/**
 * Workbench settings.
 *
 * The reference extension keeps these in VS Code's settings UI. DSH exposes plugin
 * configuration through the profile, but this plugin owns a running engine whose
 * options only take effect on restart — so the dialog that owns the restart button
 * is also the honest place to edit them.
 */

import { useEffect, useState } from 'react'

import { getClient, type HostLogLine, type HostSettings, type HostStatus } from '../dsh/client.ts'

interface Draft {
  dataDir: string
  loadModel: boolean
  autoStart: boolean
  ffmpegPath: string
  referenceDir: string
  logLevel: HostSettings['logLevel']
}

function draftOf(settings: HostSettings): Draft {
  return {
    dataDir: settings.dataDir,
    loadModel: settings.loadModel,
    autoStart: settings.autoStart,
    ffmpegPath: settings.ffmpegPath,
    referenceDir: settings.referenceDir,
    logLevel: settings.logLevel,
  }
}

const STATE_LABEL: Record<HostStatus['state'], string> = {
  idle: '未启动',
  starting: '启动中',
  ready: '运行中',
  error: '启动失败',
}

export function SettingsDialog({
  onClose,
  onSettingsChanged,
}: {
  onClose: () => void
  onSettingsChanged: (settings: HostSettings) => void
}) {
  const client = getClient()
  const [status, setStatus] = useState<HostStatus | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [logs, setLogs] = useState<HostLogLine[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reload(): Promise<void> {
    try {
      const [next, lines] = await Promise.all([client.status(false), client.logs(200)])
      setStatus(next)
      setDraft((current) => current ?? draftOf(next.settings))
      setLogs(lines.lines)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void reload()
    // `reload` is stable enough for a mount-only load; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save(): Promise<void> {
    if (draft === null || busy) return
    setBusy(true)
    setNote(null)
    setError(null)
    try {
      const result = await client.saveSettings(draft)
      onSettingsChanged(result.settings)
      setNote(
        result.restartRequired
          ? '已保存。数据目录、声音指纹模型、ffmpeg 或依赖目录的改动需要重启引擎后生效。'
          : '已保存。',
      )
      const next = await client.status(false)
      setStatus(next)
      setDraft(draftOf(next.settings))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function restart(): Promise<void> {
    if (busy) return
    setBusy(true)
    setNote('正在重启引擎…')
    setError(null)
    try {
      await client.restart()
      setNote('引擎已重启。')
      const next = await client.status(true)
      setStatus(next)
      setDraft(draftOf(next.settings))
      const lines = await client.logs(200)
      setLogs(lines.lines)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const state = status?.state ?? 'idle'
  const stats = status?.stats

  return (
    <div
      className="dsh-sdk-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="dsh-sdk-dialog" role="dialog" aria-modal="true" aria-label="工作台设置">
        <div className="dsh-sdk-dialog-head">
          <div className="dsh-sdk-dialog-title">工作台设置</div>
          <button onClick={onClose} disabled={busy} title="关闭">
            ✕
          </button>
        </div>

        <div className="dsh-sdk-dialog-body">
          <div className="dsh-sdk-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span className={`dsh-sdk-tag ${state === 'ready' ? 'ok' : state === 'error' ? 'err' : 'warn'}`}>
              引擎 {STATE_LABEL[state]}
            </span>
            <span className={`dsh-sdk-tag ${status?.modelLoaded === true ? 'ok' : 'warn'}`}>
              {status?.modelLoaded === true ? '声音指纹已启用' : '声音指纹未启用'}
            </span>
            <span className={`dsh-sdk-tag ${status?.ffmpeg !== null && status?.ffmpeg !== undefined ? 'ok' : 'warn'}`}>
              {status?.ffmpeg !== null && status?.ffmpeg !== undefined ? 'ffmpeg 可用' : 'ffmpeg 未找到'}
            </span>
            {stats !== null && stats !== undefined && (
              <span className="dsh-sdk-tag">
                {stats.assets} 条素材 · {stats.libraries} 个库 · 指纹 {stats.embedded}
              </span>
            )}
            {status?.version !== undefined && <span className="dsh-sdk-tag">v{status.version}</span>}
          </div>

          {status?.error !== null && status?.error !== undefined && (
            <div className="dsh-sdk-boot-error">{status.error}</div>
          )}
          {status?.embedderError !== null && status?.embedderError !== undefined && (
            <div className="dsh-sdk-note dsh-sdk-warn">声音指纹未加载：{status.embedderError}</div>
          )}

          {draft !== null && (
            <>
              <div className="dsh-sdk-field">
                <label htmlFor="dsh-sdk-datadir">数据目录</label>
                <input
                  id="dsh-sdk-datadir"
                  value={draft.dataDir}
                  placeholder={status?.dataDir ?? ''}
                  onChange={(event) => setDraft({ ...draft, dataDir: event.target.value })}
                />
                <small>留空使用 DSH 目录下的 sound-desk（当前：{status?.dataDir ?? '—'}）。</small>
              </div>

              <label className="dsh-sdk-switch">
                <input
                  type="checkbox"
                  checked={draft.loadModel}
                  onChange={(event) => setDraft({ ...draft, loadModel: event.target.checked })}
                />
                <span className="dsh-sdk-switch-text">
                  <b>加载声音指纹模型（CLAP）</b>
                  <span>
                    语义搜索与以声搜声的前提。首次加载需要下载数百 MB 权重，并在启动时占用一段时间；关闭后仅关键词
                    + UCS 分类可用。
                  </span>
                </span>
              </label>

              <label className="dsh-sdk-switch">
                <input
                  type="checkbox"
                  checked={draft.autoStart}
                  onChange={(event) => setDraft({ ...draft, autoStart: event.target.checked })}
                />
                <span className="dsh-sdk-switch-text">
                  <b>随 DSH 启动</b>
                  <span>关闭后引擎在第一次打开工作台时才启动。</span>
                </span>
              </label>

              <div className="dsh-sdk-field">
                <label htmlFor="dsh-sdk-ffmpeg">ffmpeg 路径（可选）</label>
                <input
                  id="dsh-sdk-ffmpeg"
                  value={draft.ffmpegPath}
                  placeholder="留空自动查找 PATH / ffmpeg-static"
                  onChange={(event) => setDraft({ ...draft, ffmpegPath: event.target.value })}
                />
                <small>没有 ffmpeg 时只有 WAV/BWF 能生成波形与播放，其他格式仍会入库但不可试听。</small>
              </div>

              <div className="dsh-sdk-field">
                <label htmlFor="dsh-sdk-reference">可选依赖目录（可选）</label>
                <input
                  id="dsh-sdk-reference"
                  value={draft.referenceDir}
                  placeholder="例如 C:\g-workspace\deepseek-harness\dsh-toolkit\sound-desk"
                  onChange={(event) => setDraft({ ...draft, referenceDir: event.target.value })}
                />
                <small>
                  用于寻找 @huggingface/transformers 与 ffmpeg-static。也可以把这两个包装进插件自己的
                  node_modules。
                </small>
              </div>

              <div className="dsh-sdk-field">
                <label htmlFor="dsh-sdk-loglevel">日志级别</label>
                <select
                  id="dsh-sdk-loglevel"
                  value={draft.logLevel}
                  onChange={(event) =>
                    setDraft({ ...draft, logLevel: event.target.value as HostSettings['logLevel'] })
                  }
                >
                  <option value="off">关闭</option>
                  <option value="normal">常规（警告与错误）</option>
                  <option value="verbose">详细</option>
                </select>
              </div>
            </>
          )}

          {note !== null && <div className="dsh-sdk-note">{note}</div>}
          {error !== null && <div className="dsh-sdk-boot-error">{error}</div>}

          <div className="dsh-sdk-field">
            <label>最近日志</label>
            <div className="dsh-sdk-log">
              {logs.length === 0 ? (
                <span style={{ color: 'var(--text-faint)' }}>暂无日志。</span>
              ) : (
                logs.map((line, index) => (
                  <div key={`${line.at}-${index}`} className="dsh-sdk-log-line">
                    <span className="dsh-sdk-log-time">
                      {new Date(line.at).toLocaleTimeString('zh-CN', { hour12: false })}
                    </span>
                    <span className={`dsh-sdk-log-${line.level}`}>{line.text}</span>
                  </div>
                ))
              )}
            </div>
            <small>
              引擎地址：{status?.engineUrl ?? '—'} · 由插件在 DSH 宿主进程内运行，不额外监听公开端口。
            </small>
          </div>
        </div>

        <div className="dsh-sdk-dialog-foot">
          <button onClick={() => void reload()} disabled={busy}>
            刷新
          </button>
          <button onClick={() => void restart()} disabled={busy}>
            重启引擎
          </button>
          <button className="dsh-sdk-primary" onClick={() => void save()} disabled={busy || draft === null}>
            {busy ? '处理中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
