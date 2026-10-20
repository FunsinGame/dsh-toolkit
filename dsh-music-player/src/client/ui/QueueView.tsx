import React, { useState } from 'react'
import { IconGrip, IconListPlus, IconPause, IconPlay, IconRepeat, IconRepeatOne, IconShuffle, IconTrash } from '../icons'
import type { PlayerController } from '../player'
import type { PlayMode, Track } from '../types'
import { Cover, EmptyState, formatTime, useStore } from './common'

const MODES: Array<{ id: PlayMode; label: string; icon: React.ReactNode }> = [
  { id: 'sequential', label: '顺序', icon: <IconListPlus size={13} /> },
  { id: 'repeat-all', label: '循环', icon: <IconRepeat size={13} /> },
  { id: 'repeat-one', label: '单曲', icon: <IconRepeatOne size={13} /> },
  { id: 'shuffle', label: '随机', icon: <IconShuffle size={13} /> },
]

export function QueueView({ controller }: { controller: PlayerController }): React.ReactElement {
  const player = useStore(controller.player)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const totalSeconds = player.queue.reduce((sum, track) => sum + (Number.isFinite(track.durationSeconds) ? track.durationSeconds : 0), 0)
  const isCurrent = (track: Track): boolean =>
    player.track !== null && player.track.bvid === track.bvid &&
    (track.cid === undefined || player.track.cid === undefined || player.track.cid === track.cid)

  return (
    <div className="dmp-fade-in">
      <div className="dmp-queue-toolbar">
        <div className="dmp-mode-group" role="group" aria-label="播放模式">
          {MODES.map((mode) => (
            <button
              type="button"
              key={mode.id}
              className={`dmp-mode-btn ${player.mode === mode.id ? 'active' : ''}`}
              title={mode.label}
              onClick={() => { void controller.setMode(mode.id) }}
            >
              {mode.icon}
              {mode.label}
            </button>
          ))}
        </div>
        <span className="dmp-caption">
          {player.queue.length} 首 · {formatTime(totalSeconds)}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="dmp-btn sm"
          onClick={() => { void controller.next(false) }}
          disabled={player.queue.length === 0}
        >
          下一首
        </button>
        <button
          type="button"
          className="dmp-btn sm danger"
          onClick={() => { controller.clearQueue() }}
          disabled={player.queue.length === 0}
        >
          <IconTrash size={13} />
          清空
        </button>
      </div>

      {player.queue.length === 0 ? (
        <EmptyState
          icon={<IconListPlus size={28} />}
          title="队列是空的"
          description="在搜索结果或收藏夹里点「加入队列」，或直接点一首歌开始播放。"
        />
      ) : (
        <div className="dmp-result-list">
          {player.queue.map((track, index) => {
            const current = isCurrent(track)
            return (
              <div
                key={`${track.bvid}-${index}`}
                className={`dmp-queue-row ${current ? 'current' : ''} ${dragIndex === index ? 'dragging' : ''} ${overIndex === index && dragIndex !== null && dragIndex !== index ? 'drag-over' : ''}`}
                draggable
                onDragStart={() => { setDragIndex(index) }}
                onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
                onDragOver={(event) => { event.preventDefault(); setOverIndex(index) }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (dragIndex !== null && dragIndex !== index) controller.moveInQueue(dragIndex, index)
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                onDoubleClick={() => { void controller.playAt(index) }}
              >
                <span className="dmp-drag" title="拖动排序"><IconGrip size={13} /></span>
                <span className="dmp-q-index">{index + 1}</span>
                <Cover src={track.cover} size={44} radius={8} />
                <div className="dmp-result-main">
                  <div className="dmp-result-title">
                    {current ? <span className="dmp-eq"><i /><i /><i /></span> : null}
                    <strong title={track.title}>{track.title}</strong>
                  </div>
                  <div className="dmp-result-meta">
                    <span>{track.author || 'Bilibili'}</span>
                    <span className="sep">·</span>
                    <span>{formatTime(track.durationSeconds)}</span>
                  </div>
                </div>
                <div className="dmp-result-actions" style={{ opacity: 1 }}>
                  <button type="button" className="dmp-iconbtn play" title={current && player.playing ? '暂停' : '播放'} onClick={() => { void controller.playAt(index) }}>
                    {current && player.playing ? <IconPause size={14} /> : <IconPlay size={14} />}
                  </button>
                  <button type="button" className="dmp-iconbtn danger" title="从队列移除" onClick={() => { controller.removeQueueAt(index) }}>
                    <IconTrash size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
