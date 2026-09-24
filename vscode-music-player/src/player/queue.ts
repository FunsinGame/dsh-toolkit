/**
 * 播放队列（纯函数）。
 *
 * 设计要点：
 *
 * 1. **顺序与随机统一成一条 `order` 索引序列**。随机播放下如果每次「下一首」都
 *    现掷骰子，`上一首` 就无法回到刚才那首；这里给队列排一个稳定的置换，前后移动
 *    都在它上面走。
 * 2. **`auto` 区分「自动下一首」与「用户点下一首」**。单曲循环时自动播放要重播当前
 *    这首，但用户点「下一首」显然想换歌——这两个意图必须分开。
 * 3. 队列变长变短、拖动排序后，`order` 要重建；随机模式下重建即重新洗牌。
 */

import type { PlayMode, TrackSummary } from '../protocol';

export interface QueueSnapshot {
  items: TrackSummary[];
  /** 当前播放项在 `order` 里的位置。 */
  position: number;
  mode: PlayMode;
  /** 播放顺序：里面是 `items` 的下标。随机模式下是打乱后的置换。 */
  order: number[];
}

export const EMPTY_QUEUE: QueueSnapshot = { items: [], position: -1, mode: 'sequential', order: [] };

/** 顺序 / 列表循环的下标序列。 */
function identityOrder(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

/** Fisher-Yates；`random` 可注入，便于测试。 */
export function shuffleOrder(length: number, random: () => number = Math.random): number[] {
  const order = identityOrder(length);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const left = order[i] ?? 0;
    const right = order[j] ?? 0;
    order[i] = right;
    order[j] = left;
  }
  return order;
}

function buildOrder(length: number, mode: PlayMode, random?: () => number): number[] {
  return mode === 'shuffle' ? shuffleOrder(length, random) : identityOrder(length);
}

/** 当前项在 `items` 里的下标；空队列为 -1。 */
export function currentIndex(state: QueueSnapshot): number {
  return state.order[state.position] ?? -1;
}

export function currentTrack(state: QueueSnapshot): TrackSummary | null {
  const index = currentIndex(state);
  return index < 0 ? null : (state.items[index] ?? null);
}

/** 用一份新列表替换队列，并定位到 `index`。 */
export function adopt(
  items: TrackSummary[],
  index: number,
  mode: PlayMode,
  random?: () => number,
): QueueSnapshot {
  const order = buildOrder(items.length, mode, random);
  // 定位到「第 index 项」在 order 里的位置（随机模式下不能假设就是 index）。
  const position = order.indexOf(index);
  return {
    items: [...items],
    position: position >= 0 ? position : order.length > 0 ? 0 : -1,
    mode,
    order,
  };
}

/**
 * 列表变化后重建顺序。
 *
 * 不管哪种模式都走同一条路：先记住「现在播的是哪首」，重建后再按同一首歌找回位置。
 * 之前试图增量维护 `order`（增删/拖动时挪下标），下标一变就容易跳歌；重建更笨但更稳。
 */
function rebuild(
  items: TrackSummary[],
  mode: PlayMode,
  keep: TrackSummary | null,
  random?: () => number,
): QueueSnapshot {
  if (items.length === 0) return { ...EMPTY_QUEUE, mode };
  const keepIndex = keep === null ? -1 : items.indexOf(keep);
  if (mode === 'shuffle') {
    const currentIndex = keepIndex < 0 ? 0 : keepIndex;
    const others = items.map((_, index) => index).filter((index) => index !== currentIndex);
    const shuffled = shuffleOrder(others.length, random).map((value) => others[value] ?? 0);
    return { items, position: 0, mode, order: [currentIndex, ...shuffled] };
  }
  return {
    items,
    position: keepIndex < 0 ? 0 : keepIndex,
    mode,
    order: identityOrder(items.length),
  };
}

/** 追加到队列末尾（正在播放时不影响当前项）。 */
export function enqueue(state: QueueSnapshot, track: TrackSummary, random?: () => number): QueueSnapshot {
  const items = [...state.items, track];
  if (state.items.length === 0) return adopt(items, 0, state.mode, random);
  if (state.mode === 'shuffle') {
    // 随机模式下把新项插到当前项之后：紧接着按「下一首」就能放到它。
    const order = [...state.order];
    order.splice(state.position + 1, 0, items.length - 1);
    return { items, position: state.position, mode: state.mode, order };
  }
  return { ...state, items, order: identityOrder(items.length) };
}

/** 移除第 `index` 项。 */
export function removeAt(state: QueueSnapshot, index: number, random?: () => number): QueueSnapshot {
  if (index < 0 || index >= state.items.length) return state;
  const items = state.items.filter((_, position) => position !== index);
  if (items.length === 0) return { ...EMPTY_QUEUE, mode: state.mode };

  let keep: TrackSummary | null;
  if (currentIndex(state) !== index) {
    keep = currentTrack(state);
  } else {
    // 删掉的正是正在播的那首：接着播「本来会播的下一首」；没有下一首就用上一首。
    const successor = state.order[state.position + 1] ?? state.order[state.position - 1];
    keep = successor === undefined ? null : (state.items[successor] ?? null);
  }
  return rebuild(items, state.mode, keep, random);
}

/** 把队列里的第 `from` 项移动到 `to`。 */
export function move(state: QueueSnapshot, from: number, to: number, random?: () => number): QueueSnapshot {
  if (from === to) return state;
  if (from < 0 || from >= state.items.length) return state;
  const target = Math.max(0, Math.min(to, state.items.length - 1));
  const keep = currentTrack(state);
  const items = [...state.items];
  const [moved] = items.splice(from, 1);
  if (moved === undefined) return state;
  items.splice(target, 0, moved);
  // 只是换个位置，同一首歌要接着播。
  return rebuild(items, state.mode, keep, random);
}

export function clear(state: QueueSnapshot): QueueSnapshot {
  return { ...EMPTY_QUEUE, mode: state.mode };
}

export function setMode(state: QueueSnapshot, mode: PlayMode, random?: () => number): QueueSnapshot {
  if (mode === state.mode) return state;
  return rebuild(state.items, mode, currentTrack(state), random);
}

export type AdvanceKind = 'replay' | 'play' | 'stop';

export interface AdvanceResult {
  kind: AdvanceKind;
  state: QueueSnapshot;
}

/**
 * 前进/后退一格。
 *
 * @param auto true 表示「上一首放完了自动接下一首」，false 表示用户点了上一首/下一首。
 */
export function advance(
  state: QueueSnapshot,
  direction: 1 | -1,
  options: { auto: boolean },
): AdvanceResult {
  if (state.order.length === 0 || state.position < 0) return { kind: 'stop', state };

  // 单曲循环：只有自动播放时才原地重播；用户点下一首仍然换歌。
  if (state.mode === 'repeat-one' && options.auto) {
    return { kind: 'replay', state };
  }

  const nextPosition = state.position + direction;
  const isLast = nextPosition >= state.order.length;
  const isBeforeFirst = nextPosition < 0;

  if (isLast) {
    if (state.mode === 'repeat-all' || state.mode === 'shuffle' || state.mode === 'repeat-one') {
      const wrapped = 0;
      // 只有一首歌且是列表循环：等价于重播。
      if (state.order.length === 1) return { kind: 'replay', state };
      return { kind: 'play', state: { ...state, position: wrapped } };
    }
    return { kind: 'stop', state };
  }

  if (isBeforeFirst) {
    if (state.mode === 'repeat-all' || state.mode === 'shuffle' || state.mode === 'repeat-one') {
      return { kind: 'play', state: { ...state, position: state.order.length - 1 } };
    }
    // 顺序播放时「上一首」停在第一首（重播它），而不是什么都不做。
    return { kind: 'replay', state };
  }

  return { kind: 'play', state: { ...state, position: nextPosition } };
}
