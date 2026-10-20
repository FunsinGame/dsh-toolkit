import React from 'react'
import { imageUrl, qualityLabel } from '../api'
import {
  IconDisc,
  IconHeart,
  IconMusic,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconRepeat,
  IconRepeatOne,
  IconShuffle,
  IconVolume,
  IconVolumeMute,
} from '../icons'
import type { PlayerController } from '../player'
import type { PlayMode, Track } from '../types'
import { Cover, formatTime, ProgressBar, useStore } from './common'

const MODE_ORDER: PlayMode[] = ['sequential', 'repeat-all', 'repeat-one', 'shuffle']
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

function modeIcon(mode: PlayMode): React.ReactNode {
  if (mode === 'repeat-one') return <IconRepeatOne size={16} />
  if (mode === 'shuffle') return <IconShuffle size={16} />
  return <IconRepeat size={16} />
}

function modeTitle(mode: PlayMode): string {
  return mode === 'repeat-all'
    ? '列表循环'
    : mode === 'repeat-one'
      ? '单曲循环'
      : mode === 'shuffle'
        ? '随机播放'
        : '顺序播放'
}

export function NowPlaying({ controller }: { controller: PlayerController }): React.ReactElement {
  const player = useStore(controller.player)
  const library = useStore(controller.library)
  const track = player.track
  const quality = library.settings?.audioQuality ?? 30280
  const queue = player.queue
  const currentIndex = player.queueIndex
  const upcoming: Array<{ track: Track; index: number }> = []
  if (queue.length > 1 && currentIndex >= 0) {
    const count = Math.min(4, queue.length - 1)
    for (let offset = 1; offset <= count; offset++) {
      const index = (currentIndex + offset) % queue.length
      const item = queue[index]
      if (item !== undefined) upcoming.push({ track: item, index })
    }
  }
  const artStyle = track?.cover !== undefined && track.cover !== ''
    ? { backgroundImage: `url("${imageUrl(track.cover)}")` }
    : undefined

  return (
    <div>
      <div className="dmp-side-title"><IconDisc size={13} /> 正在播放</div>
      <div className="dmp-np-art" style={artStyle}>
        <div className="dmp-np-art-img">
          {track !== null && track.cover !== ''
            ? <img src={imageUrl(track.cover)} alt={track.title} loading="lazy" onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = 'none' }} />
            : (
              <span className="dmp-cover-fallback">
                <IconMusic size={54} />
              </span>
            )}
          <span className={`dmp-vinyl ${player.playing ? 'spinning' : ''}`}>
            <IconDisc size={24} />
          </span>
        </div>
      </div>

      {track === null ? (
        <>
          <div className="dmp-np-title" style={{ color: 'var(--dmp-text-3)' }}>还没有在播放</div>
          <div className="dmp-np-author">搜索一首歌，或从收藏夹里挑一首开始。</div>
        </>
      ) : (
        <>
          <div className="dmp-np-title" title={track.title}>{track.title}</div>
          <div className="dmp-np-author" title={track.author}>{track.author || 'Bilibili'}</div>
          <div className="dmp-np-tags">
            <span className="dmp-tag accent">{qualityLabel(quality)}</span>
            <span className="dmp-tag">{player.format === 'wav' ? 'WAV 转码' : 'AAC 直通'}</span>
            {track.pageCount > 1 ? <span className="dmp-tag">{track.pageCount} P</span> : null}
            {player.loading ? <span className="dmp-tag warn">{player.loadingMessage || '准备中'}</span> : null}
            {player.needsGesture ? <span className="dmp-tag danger">需要点击恢复声音</span> : null}
          </div>
          <div className="dmp-np-progress">
            <ProgressBar
              position={player.position}
              duration={player.duration}
              buffered={player.buffered}
              onSeek={(value) => { controller.seek(value) }}
            />
            <div className="dmp-time-row">
              <span>{formatTime(player.position)}</span>
              <span>{formatTime(player.duration)}</span>
            </div>
          </div>
          <div className="dmp-np-controls">
            <button
              type="button"
              className={`dmp-iconbtn ${player.mode !== 'sequential' ? 'on' : ''}`}
              title={`播放模式：${modeTitle(player.mode)}（点击切换）`}
              onClick={() => {
                const index = MODE_ORDER.indexOf(player.mode)
                const next = MODE_ORDER[(index + 1) % MODE_ORDER.length] as PlayMode
                void controller.setMode(next)
              }}
            >
              {modeIcon(player.mode)}
            </button>
            <button type="button" className="dmp-iconbtn" title="上一首" onClick={() => { void controller.previous() }}>
              <IconPrev size={19} />
            </button>
            <button
              type="button"
              className="dmp-play-big"
              title={player.playing ? '暂停' : '播放'}
              onClick={() => {
                if (player.needsGesture) controller.restoreSound()
                else void controller.toggle()
              }}
            >
              {player.playing ? <IconPause size={23} /> : <IconPlay size={23} />}
            </button>
            <button type="button" className="dmp-iconbtn" title="下一首" onClick={() => { void controller.next(false) }}>
              <IconNext size={19} />
            </button>
            <button
              type="button"
              className="dmp-iconbtn"
              title={player.muted ? '取消静音' : '静音'}
              onClick={() => { controller.toggleMute() }}
            >
              {player.muted ? <IconVolumeMute size={17} /> : <IconVolume size={17} />}
            </button>
          </div>
          <div className="dmp-np-extra">
            <IconVolume size={14} />
            <input
              className="dmp-range"
              type="range"
              min={0}
              max={100}
              value={Math.round((player.muted ? 0 : player.volume) * 100)}
              aria-label="音量"
              onChange={(event) => { controller.setVolume(Number(event.target.value) / 100) }}
            />
            <select className="dmp-select" value={player.rate} title="播放速度" onChange={(event) => { controller.setRate(Number(event.target.value)) }}>
              {RATES.map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
            </select>
          </div>
          {player.error !== null ? <div className="dmp-error" style={{ marginTop: 10 }}>{player.error}</div> : null}
        </>
      )}

      {upcoming.length > 0 ? (
        <div className="dmp-upnext">
          <div className="dmp-side-title"><IconHeart size={12} /> 接下来</div>
          {upcoming.map(({ track: item, index }) => (
            <div className="dmp-upnext-row" key={`${item.bvid}-${index}`} onClick={() => { void controller.playAt(index) }}>
              <Cover src={item.cover} size={34} radius={7} />
              <span className="dmp-upnext-title" title={item.title}>{item.title}</span>
              <span className="dmp-caption">{formatTime(item.durationSeconds)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
