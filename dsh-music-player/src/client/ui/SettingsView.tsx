import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { IconDownload, IconInfo, IconRefresh, IconTrash, IconWifi } from '../icons'
import type { PlayerController } from '../player'
import type { PlayMode } from '../types'
import { formatBytes, Spinner, Switch, useStore } from './common'

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

export function SettingsView({ controller }: { controller: PlayerController }): React.ReactElement {
  const library = useStore(controller.library)
  const player = useStore(controller.player)
  const settings = library.settings
  const cache = library.cache
  const [maxMB, setMaxMB] = useState(String(settings?.cacheMaxMB ?? 500))
  const [intervalMs, setIntervalMs] = useState(String(settings?.requestIntervalMs ?? 350))
  const [logs, setLogs] = useState<string[] | null>(null)
  const [loadingLogs, setLoadingLogs] = useState(false)

  useEffect(() => {
    if (settings !== null) {
      setMaxMB(String(settings.cacheMaxMB))
      setIntervalMs(String(settings.requestIntervalMs))
    }
  }, [settings?.cacheMaxMB, settings?.requestIntervalMs])

  if (settings === null) {
    return <div className="dmp-empty" style={{ minHeight: 220 }}><Spinner size={20} /><span>正在读取设置…</span></div>
  }

  const usedPercent = cache !== null && cache.maxBytes > 0
    ? Math.min(100, Math.round((cache.bytes / cache.maxBytes) * 100))
    : 0

  const commitNumber = (key: 'cacheMaxMB' | 'requestIntervalMs', raw: string): void => {
    const value = Number(raw)
    if (!Number.isFinite(value)) return
    void controller.updateSetting(key, value)
  }

  return (
    <div className="dmp-settings-grid dmp-fade-in">
      <section className="dmp-settings-card">
        <h4>播放</h4>
        <p>音质、默认模式与播放速度。</p>
        <div className="dmp-setting-row">
          <div className="dmp-setting-label"><strong>音质</strong><span>未登录时 B 站可能返回较低音质</span></div>
          <div className="dmp-setting-value">
            <select className="dmp-select" value={settings.audioQuality} onChange={(event) => { void controller.updateSetting('audioQuality', Number(event.target.value)) }}>
              <option value={30216}>64K</option>
              <option value={30232}>132K</option>
              <option value={30280}>192K</option>
            </select>
          </div>
        </div>
        <div className="dmp-setting-row">
          <div className="dmp-setting-label"><strong>默认播放模式</strong><span>在队列页也可以随时切换</span></div>
          <div className="dmp-setting-value">
            <select className="dmp-select" value={settings.defaultPlayMode} onChange={(event) => { void controller.updateSetting('defaultPlayMode', event.target.value as PlayMode) }}>
              <option value="sequential">顺序播放</option>
              <option value="repeat-all">列表循环</option>
              <option value="repeat-one">单曲循环</option>
              <option value="shuffle">随机播放</option>
            </select>
          </div>
        </div>
        <div className="dmp-setting-row">
          <div className="dmp-setting-label"><strong>音量</strong><span>{Math.round(player.volume * 100)}%</span></div>
          <div className="dmp-setting-value">
            <input className="dmp-range" type="range" min={0} max={100} value={Math.round(player.volume * 100)} onChange={(event) => { controller.setVolume(Number(event.target.value) / 100) }} />
          </div>
        </div>
        <div className="dmp-setting-row">
          <div className="dmp-setting-label"><strong>播放速度</strong><span>立即生效并记住</span></div>
          <div className="dmp-setting-value">
            <select className="dmp-select" value={player.rate} onChange={(event) => { controller.setRate(Number(event.target.value)) }}>
              {RATES.map((rate) => <option value={rate} key={rate}>{rate}×</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="dmp-settings-card">
        <h4>音频缓存</h4>
        <p>宿主解码或代理过的音频会缓存到本机。</p>
        <div className="dmp-setting-row">
          <div className="dmp-setting-label"><strong>启用磁盘缓存</strong><span>关闭后不再写入新缓存</span></div>
          <div className="dmp-setting-value">
            <Switch checked={settings.cacheEnabled} label="启用磁盘缓存" onChange={(next) => { void controller.updateSetting('cacheEnabled', next) }} />
          </div>
        </div>
        <div className="dmp-setting-row">
          <div className="dmp-setting-label"><strong>缓存上限</strong><span>超出后按最久未使用淘汰</span></div>
          <div className="dmp-setting-value">
            <input
              className="dmp-input"
              style={{ width: 82, height: 29, padding: '0 8px', border: '1px solid var(--dmp-border)', borderRadius: 8, background: 'var(--dmp-surface-2)', textAlign: 'right' }}
              value={maxMB}
              inputMode="numeric"
              onChange={(event) => { setMaxMB(event.target.value) }}
              onBlur={() => { commitNumber('cacheMaxMB', maxMB) }}
              onKeyDown={(event) => { if (event.key === 'Enter') commitNumber('cacheMaxMB', maxMB) }}
            />
            <span className="dmp-caption">MB</span>
          </div>
        </div>
        <div className="dmp-meter-row">
          <div className="dmp-meter"><i style={{ width: `${usedPercent}%` }} /></div>
          <span className="dmp-caption">{cache === null ? '—' : `${formatBytes(cache.bytes)} / ${formatBytes(cache.maxBytes)}`}</span>
        </div>
        <div className="dmp-caption" style={{ marginTop: 6 }}>{cache?.dir ?? '缓存目录不可用'}</div>
        <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
          <button type="button" className="dmp-btn sm" onClick={() => { void controller.refreshCache() }}>
            <IconRefresh size={13} />
            刷新
          </button>
          <button type="button" className="dmp-btn sm danger" onClick={() => { void controller.clearCache() }} disabled={cache === null || cache.files === 0}>
            <IconTrash size={13} />
            清理缓存
          </button>
        </div>
      </section>

      <section className="dmp-settings-card">
        <h4>网络与请求</h4>
        <p>所有 B 站请求都由宿主串行发出，避免触发风控。</p>
        <div className="dmp-setting-row">
          <div className="dmp-setting-label"><strong>请求间隔</strong><span>两次请求之间的最小间隔（毫秒）</span></div>
          <div className="dmp-setting-value">
            <input
              className="dmp-input"
              style={{ width: 82, height: 29, padding: '0 8px', border: '1px solid var(--dmp-border)', borderRadius: 8, background: 'var(--dmp-surface-2)', textAlign: 'right' }}
              value={intervalMs}
              inputMode="numeric"
              onChange={(event) => { setIntervalMs(event.target.value) }}
              onBlur={() => { commitNumber('requestIntervalMs', intervalMs) }}
              onKeyDown={(event) => { if (event.key === 'Enter') commitNumber('requestIntervalMs', intervalMs) }}
            />
            <span className="dmp-caption">ms</span>
          </div>
        </div>
        <div className="dmp-kv"><span>宿主</span><strong>{library.hostError === null ? '已连接' : library.hostError}</strong></div>
        <div className="dmp-kv"><span>音频路径</span><strong>{player.nativeAac ? '原生 AAC 直通' : '宿主 AAC → WAV 转码'}</strong></div>
        <div className="dmp-kv"><span>当前音源</span><strong>{player.format === null ? '—' : player.format === 'wav' ? 'WAV（宿主转码）' : '原始 AAC'}</strong></div>
        <div className="dmp-caption" style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8 }}>
          <IconWifi size={12} /> 调小间隔更快，但更容易触发 B 站风控。
        </div>
      </section>

      <section className="dmp-settings-card">
        <h4>界面与诊断</h4>
        <p>状态栏入口和日志。</p>
        <div className="dmp-setting-row">
          <div className="dmp-setting-label"><strong>状态栏显示曲目</strong><span>在 DSH 底部状态栏显示播放控制</span></div>
          <div className="dmp-setting-value">
            <Switch checked={settings.showStatusBar} label="状态栏显示曲目" onChange={(next) => { void controller.updateSetting('showStatusBar', next) }} />
          </div>
        </div>
        <div className="dmp-setting-row">
          <div className="dmp-setting-label"><strong>日志级别</strong><span>排查问题时调到详细</span></div>
          <div className="dmp-setting-value">
            <select className="dmp-select" value={settings.logLevel} onChange={(event) => { void controller.updateSetting('logLevel', event.target.value) }}>
              <option value="off">关闭</option>
              <option value="info">常规</option>
              <option value="debug">详细</option>
            </select>
          </div>
        </div>
        <div className="dmp-kv"><span>版本</span><strong>dsh-music-player 0.1.0</strong></div>
        <div className="dmp-kv"><span>提示音</span><strong>切换页面不会中断播放</strong></div>
        <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
          <button
            type="button"
            className="dmp-btn sm"
            onClick={() => {
              setLoadingLogs(true)
              void api.logs(120).then((result) => { setLogs(result.lines) }).catch((error: unknown) => {
                setLogs([error instanceof Error ? error.message : String(error)])
              }).finally(() => { setLoadingLogs(false) })
            }}
          >
            {loadingLogs ? <Spinner size={12} /> : <IconInfo size={13} />}
            查看宿主日志
          </button>
        </div>
        {logs !== null ? <pre className="dmp-logbox">{logs.length === 0 ? '暂无日志' : logs.join('\n')}</pre> : null}
      </section>
    </div>
  )
}
