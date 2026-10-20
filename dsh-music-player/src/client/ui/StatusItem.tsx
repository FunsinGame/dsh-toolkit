/** Compact status-bar item: current track plus play/next controls. */

import React from 'react'
import { imageUrl } from '../api'
import { IconMusic, IconNext, IconPause, IconPlay, IconSpinner } from '../icons'
import type { PlayerController } from '../player'
import { formatTime, useStore } from './common'

export interface StatusItemProps {
  controller: PlayerController
  open: () => void
}

export function StatusItem({ controller, open }: StatusItemProps): React.ReactElement | null {
  const player = useStore(controller.player)
  const library = useStore(controller.library)
  if (library.settings?.showStatusBar === false) return null
  const track = player.track
  if (track === null) {
    return (
      <button type="button" className="dmp-status" title="打开音乐播放器" onClick={open}>
        <span className="dmp-status-cover"><IconMusic size={10} /></span>
        <span className="dmp-status-title">音乐</span>
      </button>
    )
  }
  return (
    <div className="dmp-status">
      <button type="button" className="dmp-status" style={{ padding: 0 }} title={track.title} onClick={open}>
        <span className="dmp-status-cover">
          {track.cover !== '' ? <img src={imageUrl(track.cover)} alt="" loading="lazy" /> : <IconMusic size={10} />}
        </span>
        <span className="dmp-status-title">{track.title}</span>
        <span className="dmp-status-time">{formatTime(player.position)}</span>
      </button>
      <button
        type="button"
        className="dmp-status-btn"
        title={player.playing ? '暂停' : '播放'}
        onClick={() => {
          if (player.needsGesture) controller.restoreSound()
          else void controller.toggle()
        }}
      >
        {player.loading ? <IconSpinner size={11} /> : player.playing ? <IconPause size={11} /> : <IconPlay size={11} />}
      </button>
      <button type="button" className="dmp-status-btn" title="下一首" onClick={() => { void controller.next(false) }}>
        <IconNext size={11} />
      </button>
    </div>
  )
}
