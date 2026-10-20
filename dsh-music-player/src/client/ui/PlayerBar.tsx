import React from 'react'
import { imageUrl } from '../api'
import {
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
import type { PlayMode } from '../types'
import { formatTime, ProgressBar, useStore } from './common'

const MODE_ORDER: PlayMode[] = ['sequential', 'repeat-all', 'repeat-one', 'shuffle']
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

function modeIcon(mode: PlayMode): React.ReactNode {
  if (mode === 'repeat-one') return <IconRepeatOne size={15} />
  if (mode === 'shuffle') return <IconShuffle size={15} />
  return <IconRepeat size={15} />
}

export function PlayerBar({ controller }: { controller: PlayerController }): React.ReactElement {
  const player = useStore(controller.player)
  const track = player.track
  return (
    <div className="dmp-playerbar">
      <div className="dmp-pb-track">
        <div className="dmp-pb-cover">
          {track !== null && track.cover !== ''
            ? <img src={imageUrl(track.cover)} alt="" loading="lazy" />
            : <IconMusic size={19} />}
        </div>
        <div className="dmp-pb-meta">
          <strong title={track?.title ?? ''}>{track?.title ?? '未在播放'}</strong>
          <span title={track?.author ?? ''}>{track?.author ?? '搜索一首歌开始'}</span>
        </div>
      </div>

      <div className="dmp-pb-controls">
        <button type="button" className="dmp-iconbtn sm" title="上一首" onClick={() => { void controller.previous() }}>
          <IconPrev size={15} />
        </button>
        <button
          type="button"
          className="dmp-play-small"
          title={player.playing ? '暂停' : '播放'}
          onClick={() => {
            if (player.needsGesture) controller.restoreSound()
            else void controller.toggle()
          }}
        >
          {player.playing ? <IconPause size={17} /> : <IconPlay size={17} />}
        </button>
        <button type="button" className="dmp-iconbtn sm" title="下一首" onClick={() => { void controller.next(false) }}>
          <IconNext size={15} />
        </button>
      </div>

      <div className="dmp-pb-progress">
        <span className="dmp-time">{formatTime(player.position)}</span>
        <ProgressBar
          position={player.position}
          duration={player.duration}
          buffered={player.buffered}
          onSeek={(value) => { controller.seek(value) }}
        />
        <span className="dmp-time">{formatTime(player.duration)}</span>
      </div>

      <div className="dmp-pb-extra">
        <button
          type="button"
          className={`dmp-iconbtn sm ${player.mode !== 'sequential' ? 'on' : ''}`}
          title="播放模式"
          onClick={() => {
            const index = MODE_ORDER.indexOf(player.mode)
            void controller.setMode(MODE_ORDER[(index + 1) % MODE_ORDER.length] as PlayMode)
          }}
        >
          {modeIcon(player.mode)}
        </button>
        <div className="dmp-pb-volume">
          <button type="button" className="dmp-iconbtn sm" title={player.muted ? '取消静音' : '静音'} onClick={() => { controller.toggleMute() }}>
            {player.muted ? <IconVolumeMute size={15} /> : <IconVolume size={15} />}
          </button>
          <input
            className="dmp-range"
            type="range"
            min={0}
            max={100}
            value={Math.round((player.muted ? 0 : player.volume) * 100)}
            aria-label="音量"
            onChange={(event) => { controller.setVolume(Number(event.target.value) / 100) }}
          />
        </div>
        <select className="dmp-select" value={player.rate} title="播放速度" onChange={(event) => { controller.setRate(Number(event.target.value)) }}>
          {RATES.map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
        </select>
      </div>
    </div>
  )
}
