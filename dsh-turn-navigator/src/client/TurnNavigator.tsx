/** Scroll-synced turn rail derived from settled user-message nodes. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { UserMessageNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TurnNavigator.module.css'

/** Minimum user-turn count at which navigation provides more value than noise. */
export const MIN_TURNS = 3

/** One marker projected from a settled user message. */
export interface TurnMarker {
  readonly seq: number
  readonly preview: string
}

/** Full props supplied by the session-scoped navigator slot and locale seat. */
export type TurnNavigatorProps =
  PropsRuntime<'conversation.chat.navigator'> & PropsLocale<'turnNavigator'>

/** Collapse the text blocks of one user message into a compact hover preview. */
export function messagePreview(content: UserMessageNode['content']): string {
  return content
    .flatMap(block => block.type === 'text' ? [block.text] : [])
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * User-turn rows currently rendered inside the transcript, in flow order.
 * The chat flow anchors rows by their conversation Context key (kind+id),
 * which the snapshot's legacy node projection does not expose, so markers
 * pair with rows positionally: the i-th settled user turn renders the i-th
 * user row.
 */
export function userRows(scrollport: HTMLElement): HTMLElement[] {
  return [...scrollport.querySelectorAll<HTMLElement>('[data-chat-flow-kind="user"]')]
}

/** Resolve the rendered row for the marker at `index` among user turns. */
export function rowForTurn(scrollport: HTMLElement, index: number): HTMLElement | null {
  return userRows(scrollport)[index] ?? null
}

/**
 * Resolve the turn crossing the reading line. The bottom position always
 * selects the newest turn, including a transcript shorter than its viewport.
 */
export function activeTurnSeq(scrollport: HTMLElement, turns: readonly TurnMarker[]): number | null {
  const earliest = turns.at(0)
  const latest = turns.at(-1)
  if (earliest === undefined || latest === undefined) return null
  if (scrollport.scrollHeight - scrollport.clientHeight - scrollport.scrollTop <= 1) return latest.seq
  if (scrollport.scrollTop <= 1) return earliest.seq

  const viewport = scrollport.getBoundingClientRect()
  const composer = scrollport.querySelector<HTMLElement>('[data-composer-seat]')
  const visibleBottom = composer?.getBoundingClientRect().top ?? viewport.bottom
  const readingLine = viewport.top + Math.min(120, Math.max(24, (visibleBottom - viewport.top) * 0.28))
  const rows = userRows(scrollport)
  let active = earliest
  let found = false
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index]!
    const row = rows[index]
    if (row === undefined) continue
    found = true
    if (row.getBoundingClientRect().top > readingLine) break
    active = turn
  }
  return found ? active.seq : latest.seq
}

/** Turn rail with hover/focus previews and direct scroll navigation. */
export function TurnNavigator({ useSession, loadOlder, t }: TurnNavigatorProps) {
  const nodes = useSession(snapshot => snapshot.nodes)
  const openState = useSession(snapshot => snapshot.openState)
  const hasMore = useSession(snapshot => snapshot.hasMore)
  const loadingOlder = useSession(snapshot => snapshot.loadingOlder)
  const turns = useMemo<TurnMarker[]>(() => nodes
    .filter((node): node is UserMessageNode => node.kind === 'user')
    .map(node => ({ seq: node.seq, preview: messagePreview(node.content) })), [nodes])
  const rootRef = useRef<HTMLDivElement>(null)
  const [activeSeq, setActiveSeq] = useState<number | null>(null)
  const [hoveredSeq, setHoveredSeq] = useState<number | null>(null)

  useEffect(() => {
    if (openState !== 'open' || turns.length >= MIN_TURNS || !hasMore || loadingOlder) return
    loadOlder()
  }, [hasMore, loadOlder, loadingOlder, openState, turns.length])

  useEffect(() => {
    if (turns.length < MIN_TURNS) return
    const scrollport = rootRef.current?.closest<HTMLElement>('[data-conversation-scroll]')
    if (scrollport === null || scrollport === undefined) return

    let frame: number | null = null
    const update = () => { setActiveSeq(activeTurnSeq(scrollport, turns)) }
    const schedule = () => {
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        update()
      })
    }
    update()
    scrollport.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      scrollport.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [turns])

  if (turns.length < MIN_TURNS) return null

  let latestSeq: number | null = null
  for (const turn of turns) latestSeq = turn.seq
  const currentSeq = turns.some(turn => turn.seq === activeSeq)
    ? activeSeq
    : latestSeq

  const jumpTo = (seq: number): void => {
    const scrollport = rootRef.current?.closest<HTMLElement>('[data-conversation-scroll]')
    if (scrollport === null || scrollport === undefined) return
    const index = turns.findIndex(turn => turn.seq === seq)
    if (index < 0) return
    const row = rowForTurn(scrollport, index)
    if (row === null) return
    scrollport.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }))
    scrollport.scrollTop += row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top
    setActiveSeq(seq)
  }

  return (
    <div ref={rootRef} className={css.host} data-turn-navigator="">
      <nav className={css.rail} aria-label={t('nav.aria')}>
        {turns.map((turn, index) => {
          const number = index + 1
          const preview = turn.preview === '' ? t('preview.empty') : turn.preview
          const edge = index === 0 ? 'first' : index === turns.length - 1 ? 'last' : 'middle'
          return (
            <button
              key={turn.seq}
              type="button"
              className={css.marker}
              aria-label={t('marker.aria', { index: number, preview })}
              aria-current={turn.seq === currentSeq ? 'step' : undefined}
              onClick={() => { jumpTo(turn.seq) }}
              onMouseEnter={() => { setHoveredSeq(turn.seq) }}
              onMouseLeave={() => { setHoveredSeq(null) }}
              onFocus={() => { setHoveredSeq(turn.seq) }}
              onBlur={() => { setHoveredSeq(null) }}
            >
              <span className={css.tick} aria-hidden="true" />
              {hoveredSeq === turn.seq && (
                <span className={css.preview} data-edge={edge} aria-hidden="true">
                  <span className={css.previewCard}>
                    <strong>{t('preview.title', { index: number })}</strong>
                    <span>{preview}</span>
                  </span>
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
