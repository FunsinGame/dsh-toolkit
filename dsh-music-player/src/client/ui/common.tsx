/** Shared presentational components for the player page. */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { imageUrl } from '../api'
import { IconCheck, IconClose, IconFolder, IconMusic, IconPause, IconPlay, IconPlus, IconQueue, IconSpinner } from '../icons'
import type { Store } from '../store'
import type { Track } from '../types'

export function useStore<T>(store: Store<T>): T {
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot)
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${minutes}:${String(rest).padStart(2, '0')}`
}

export function formatViews(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return ''
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)} 亿`
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)} 万`
  return String(Math.round(value))
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

export interface CoverProps {
  src: string
  size?: number
  radius?: number
  className?: string
  iconSize?: number
  alt?: string
}

export function Cover({ src, size = 58, radius = 10, className, iconSize, alt = '' }: CoverProps): React.ReactElement {
  const [failed, setFailed] = useState(false)
  const resolved = useMemo(() => imageUrl(src), [src])
  useEffect(() => { setFailed(false) }, [resolved])
  return (
    <div
      className={`dmp-result-cover ${className ?? ''}`}
      style={{ width: size, height: size, flexBasis: size, borderRadius: radius }}
    >
      {resolved !== '' && !failed ? (
        <img
          src={resolved}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => { setFailed(true) }}
        />
      ) : (
        <span className="dmp-cover-fallback"><IconMusic size={iconSize ?? Math.max(14, Math.round(size * 0.34))} /></span>
      )}
    </div>
  )
}

export interface AvatarProps {
  name: string
  src?: string
  size?: number
}

export function Avatar({ name, src, size = 28 }: AvatarProps): React.ReactElement {
  const [failed, setFailed] = useState(false)
  const initial = name.trim().slice(0, 1).toUpperCase() || 'B'
  return (
    <span className="dmp-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
      {src !== undefined && src !== '' && !failed
        ? <img src={imageUrl(src)} alt="" onError={() => { setFailed(true) }} />
        : initial}
    </span>
  )
}

export interface ProgressBarProps {
  position: number
  duration: number
  buffered: number
  onSeek: (value: number) => void
  className?: string
}

export function ProgressBar({ position, duration, buffered, onSeek, className }: ProgressBarProps): React.ReactElement {
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? position
  const safeDuration = duration > 0 ? duration : 0
  const progress = safeDuration > 0 ? Math.min(100, Math.max(0, (shown / safeDuration) * 100)) : 0
  const buffer = safeDuration > 0 ? Math.min(100, Math.max(0, (buffered / safeDuration) * 100)) : 0
  return (
    <div className={`dmp-progress-track ${className ?? ''}`}>
      <span className="dmp-progress-buffer" style={{ width: `${buffer}%` }} />
      <span className="dmp-progress-fill" style={{ width: `${progress}%` }} />
      <span className="dmp-progress-thumb" style={{ left: `${progress}%` }} />
      <input
        className="dmp-progress-input"
        type="range"
        min={0}
        max={safeDuration > 0 ? safeDuration : 100}
        step={0.1}
        value={shown}
        aria-label="播放进度"
        onChange={(event) => { setDraft(Number(event.target.value)) }}
        onPointerUp={() => {
          if (draft !== null) onSeek(draft)
          setDraft(null)
        }}
        onKeyUp={() => {
          if (draft !== null) onSeek(draft)
          setDraft(null)
        }}
        onBlur={() => {
          if (draft !== null) onSeek(draft)
          setDraft(null)
        }}
      />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}): React.ReactElement {
  return (
    <div className="dmp-empty">
      <span className="dmp-empty-icon">{icon ?? <IconMusic size={28} />}</span>
      <h4>{title}</h4>
      {description !== undefined ? <p>{description}</p> : null}
      {action}
    </div>
  )
}

export function SkeletonList({ rows = 6 }: { rows?: number }): React.ReactElement {
  return (
    <div className="dmp-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="dmp-skeleton-row" key={index}>
          <span className="dmp-skeleton-block dmp-skeleton-cover" />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="dmp-skeleton-block dmp-skeleton-line" style={{ width: `${58 + (index % 3) * 12}%` }} />
            <span className="dmp-skeleton-block dmp-skeleton-line" style={{ width: `${28 + (index % 4) * 9}%`, opacity: .6 }} />
          </span>
        </div>
      ))}
    </div>
  )
}

export function Spinner({ size = 16 }: { size?: number }): React.ReactElement {
  return <IconSpinner size={size} />
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }): React.ReactElement {
  return (
    <button
      type="button"
      className={`dmp-switch ${checked ? 'on' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={() => { onChange(!checked) }}
    />
  )
}

export interface TrackRowProps {
  track: Track
  current: boolean
  playing: boolean
  onPlay: () => void
  onEnqueue?: () => void
  onFavorite?: () => void
  selected?: boolean
  onToggleSelect?: () => void
  showCheckbox?: boolean
  trailing?: React.ReactNode
  index?: number
}

export function TrackRow({
  track,
  current,
  playing,
  onPlay,
  onEnqueue,
  onFavorite,
  selected = false,
  onToggleSelect,
  showCheckbox = false,
  trailing,
  index,
}: TrackRowProps): React.ReactElement {
  const meta = [
    track.author || 'Bilibili',
    formatViews(track.views),
  ].filter(Boolean)
  return (
    <div
      className={`dmp-result ${current ? 'current' : ''} ${selected ? 'selected' : ''}`}
      onDoubleClick={() => { if (track.invalid !== true) onPlay() }}
    >
      {showCheckbox ? (
        <button type="button" className="dmp-iconbtn sm" title="选择" onClick={onToggleSelect}>
          <span className={`dmp-check ${selected ? 'on' : ''}`}>{selected ? <IconCheck size={12} /> : null}</span>
        </button>
      ) : null}
      {index !== undefined ? <span className="dmp-caption" style={{ width: 22, textAlign: 'center' }}>{index + 1}</span> : null}
      <Cover src={track.cover} alt={track.title} />
      <div className="dmp-result-main">
        <div className="dmp-result-title">
          {current ? <span className="dmp-eq"><i /><i /><i /></span> : null}
          <strong title={track.title}>{track.title}</strong>
          {track.invalid === true ? <span className="dmp-tag danger">已失效</span> : null}
          {track.pageCount > 1 ? <span className="dmp-tag accent">{track.pageCount} P</span> : null}
        </div>
        <div className="dmp-result-meta">
          {meta.map((part, partIndex) => (
            <React.Fragment key={`${part}-${partIndex}`}>
              {partIndex > 0 ? <span className="sep">·</span> : null}
              <span>{part}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="dmp-result-actions">
        {trailing}
        <button
          type="button"
          className="dmp-iconbtn play"
          title={current && playing ? '暂停' : '播放'}
          disabled={track.invalid === true}
          onClick={onPlay}
        >
          {current && playing ? <IconPause size={15} /> : <IconPlay size={15} />}
        </button>
        {onEnqueue !== undefined ? (
          <button type="button" className="dmp-iconbtn" title="加入队列" onClick={onEnqueue}>
            <IconQueue size={15} />
          </button>
        ) : null}
        {onFavorite !== undefined ? (
          <button type="button" className="dmp-iconbtn" title="加入收藏夹" onClick={onFavorite}>
            <IconPlus size={15} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 480,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  size?: number
}): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return createPortal(
    <div className="dmp-modal-mask" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="dmp-modal" role="dialog" aria-modal="true" aria-label={title} style={{ width: `min(${size}px, 100%)` }} ref={ref} tabIndex={-1}>
        <div className="dmp-modal-head">
          <h3>{title}</h3>
          <button type="button" className="dmp-iconbtn" title="关闭" onClick={onClose}><IconClose size={16} /></button>
        </div>
        <div className="dmp-modal-body">{children}</div>
        {footer !== undefined ? <div className="dmp-modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = '确认',
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
  onClose: () => void
}): React.ReactElement {
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="dmp-btn subtle" onClick={onClose}>取消</button>
          <button
            type="button"
            className={`dmp-btn ${danger ? 'danger' : 'primary'}`}
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void Promise.resolve(onConfirm()).finally(() => { setBusy(false); onClose() })
            }}
          >
            {busy ? <Spinner size={13} /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: '2px 0 10px', fontSize: 12.5, lineHeight: 1.6, color: 'var(--dmp-text-2)' }}>{message}</p>
    </Modal>
  )
}

export function FolderIcon({ size = 18 }: { size?: number }): React.ReactElement {
  return <IconFolder size={size} />
}
