/** Pure playback-queue operations (ported from the VS Code extension). */

import type { PlayMode, Track } from './types'

export interface QueueSnapshot {
  items: Track[]
  position: number
  mode: PlayMode
  order: number[]
}

export const EMPTY_QUEUE: QueueSnapshot = { items: [], position: -1, mode: 'sequential', order: [] }

function identityOrder(length: number): number[] {
  return Array.from({ length }, (_, index) => index)
}

export function shuffleOrder(length: number, random: () => number = Math.random): number[] {
  const order = identityOrder(length)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const left = order[i] ?? 0
    const right = order[j] ?? 0
    order[i] = right
    order[j] = left
  }
  return order
}

function buildOrder(length: number, mode: PlayMode, random?: () => number): number[] {
  return mode === 'shuffle' ? shuffleOrder(length, random) : identityOrder(length)
}

export function currentIndex(state: QueueSnapshot): number {
  return state.order[state.position] ?? -1
}

export function currentTrack(state: QueueSnapshot): Track | null {
  const index = currentIndex(state)
  return index < 0 ? null : (state.items[index] ?? null)
}

export function adopt(items: Track[], index: number, mode: PlayMode, random?: () => number): QueueSnapshot {
  const order = buildOrder(items.length, mode, random)
  const position = order.indexOf(index)
  return {
    items: [...items],
    position: position >= 0 ? position : order.length > 0 ? 0 : -1,
    mode,
    order,
  }
}

function rebuild(items: Track[], mode: PlayMode, keep: Track | null, random?: () => number): QueueSnapshot {
  if (items.length === 0) return { ...EMPTY_QUEUE, mode }
  const keepIndex = keep === null ? -1 : items.indexOf(keep)
  if (mode === 'shuffle') {
    const currentIndexValue = keepIndex < 0 ? 0 : keepIndex
    const others = items.map((_, index) => index).filter((index) => index !== currentIndexValue)
    const shuffled = shuffleOrder(others.length, random).map((value) => others[value] ?? 0)
    return { items, position: 0, mode, order: [currentIndexValue, ...shuffled] }
  }
  return {
    items,
    position: keepIndex < 0 ? 0 : keepIndex,
    mode,
    order: identityOrder(items.length),
  }
}

export function enqueue(state: QueueSnapshot, track: Track, random?: () => number): QueueSnapshot {
  const items = [...state.items, track]
  if (state.items.length === 0) return adopt(items, 0, state.mode, random)
  if (state.mode === 'shuffle') {
    const order = [...state.order]
    order.splice(state.position + 1, 0, items.length - 1)
    return { items, position: state.position, mode: state.mode, order }
  }
  return { ...state, items, order: identityOrder(items.length) }
}

export function removeAt(state: QueueSnapshot, index: number, random?: () => number): QueueSnapshot {
  if (index < 0 || index >= state.items.length) return state
  const items = state.items.filter((_, position) => position !== index)
  if (items.length === 0) return { ...EMPTY_QUEUE, mode: state.mode }
  let keep: Track | null
  if (currentIndex(state) !== index) {
    keep = currentTrack(state)
  } else {
    const successor = state.order[state.position + 1] ?? state.order[state.position - 1]
    keep = successor === undefined ? null : (state.items[successor] ?? null)
  }
  return rebuild(items, state.mode, keep, random)
}

export function move(state: QueueSnapshot, from: number, to: number, random?: () => number): QueueSnapshot {
  if (from === to) return state
  if (from < 0 || from >= state.items.length) return state
  const target = Math.max(0, Math.min(to, state.items.length - 1))
  const keep = currentTrack(state)
  const items = [...state.items]
  const [moved] = items.splice(from, 1)
  if (moved === undefined) return state
  items.splice(target, 0, moved)
  return rebuild(items, state.mode, keep, random)
}

export function clear(state: QueueSnapshot): QueueSnapshot {
  return { ...EMPTY_QUEUE, mode: state.mode }
}

export function setMode(state: QueueSnapshot, mode: PlayMode, random?: () => number): QueueSnapshot {
  if (mode === state.mode) return state
  return rebuild(state.items, mode, currentTrack(state), random)
}

export type AdvanceKind = 'replay' | 'play' | 'stop'

export interface AdvanceResult {
  kind: AdvanceKind
  state: QueueSnapshot
}

export function advance(
  state: QueueSnapshot,
  direction: 1 | -1,
  options: { auto: boolean },
): AdvanceResult {
  if (state.order.length === 0 || state.position < 0) return { kind: 'stop', state }
  if (state.mode === 'repeat-one' && options.auto) return { kind: 'replay', state }
  const nextPosition = state.position + direction
  const isLast = nextPosition >= state.order.length
  const isBeforeFirst = nextPosition < 0
  if (isLast) {
    if (state.mode === 'repeat-all' || state.mode === 'shuffle' || state.mode === 'repeat-one') {
      if (state.order.length === 1) return { kind: 'replay', state }
      return { kind: 'play', state: { ...state, position: 0 } }
    }
    return { kind: 'stop', state }
  }
  if (isBeforeFirst) {
    if (state.mode === 'repeat-all' || state.mode === 'shuffle' || state.mode === 'repeat-one') {
      return { kind: 'play', state: { ...state, position: state.order.length - 1 } }
    }
    return { kind: 'replay', state }
  }
  return { kind: 'play', state: { ...state, position: nextPosition } }
}
