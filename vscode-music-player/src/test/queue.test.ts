import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  adopt,
  advance,
  clear,
  currentTrack,
  enqueue,
  move,
  removeAt,
  setMode,
  shuffleOrder,
  type QueueSnapshot,
} from '../player/queue';
import type { TrackSummary } from '../protocol';

function track(id: string): TrackSummary {
  return { bvid: id, title: id, author: '', cover: '', durationSeconds: 10, pageCount: 1 };
}

const A = track('A');
const B = track('B');
const C = track('C');

function titles(state: QueueSnapshot): string[] {
  return state.items.map((item) => item.title);
}

test('adopt 定位到指定项，顺序模式下就是它的下标', () => {
  const state = adopt([A, B, C], 1, 'sequential');
  assert.equal(currentTrack(state)?.title, 'B');
  assert.deepEqual(state.order, [0, 1, 2]);
});

test('advance：顺序播放到末尾就停，列表循环回到开头', () => {
  const sequential = adopt([A, B, C], 2, 'sequential');
  const stopped = advance(sequential, 1, { auto: true });
  assert.equal(stopped.kind, 'stop');

  const repeatAll = adopt([A, B, C], 2, 'repeat-all');
  const wrapped = advance(repeatAll, 1, { auto: true });
  assert.equal(wrapped.kind, 'play');
  assert.equal(currentTrack(wrapped.state)?.title, 'A');
});

test('advance：单曲循环只在自动播放时重播，用户点下一首仍然换歌', () => {
  const state = adopt([A, B, C], 1, 'repeat-one');
  const auto = advance(state, 1, { auto: true });
  assert.equal(auto.kind, 'replay');
  assert.equal(currentTrack(auto.state)?.title, 'B');

  const manual = advance(state, 1, { auto: false });
  assert.equal(manual.kind, 'play');
  assert.equal(currentTrack(manual.state)?.title, 'C');
});

test('advance：上一首在第一首时顺序播放重播当前，循环模式回到末尾', () => {
  const sequential = adopt([A, B, C], 0, 'sequential');
  assert.equal(advance(sequential, -1, { auto: false }).kind, 'replay');

  const repeatAll = adopt([A, B, C], 0, 'repeat-all');
  const last = advance(repeatAll, -1, { auto: false });
  assert.equal(last.kind, 'play');
  assert.equal(currentTrack(last.state)?.title, 'C');
});

test('advance：队列只有一首且为循环模式等同于重播', () => {
  const single = adopt([A], 0, 'repeat-all');
  assert.equal(advance(single, 1, { auto: true }).kind, 'replay');
  assert.equal(advance(single, 1, { auto: false }).kind, 'replay');
});

test('advance：空队列一律 stop', () => {
  assert.equal(advance(clear(adopt([A], 0, 'sequential')), 1, { auto: true }).kind, 'stop');
});

test('shuffleOrder 是可注入随机源的置换', () => {
  const order = shuffleOrder(5, () => 0);
  assert.equal(order.length, 5);
  assert.deepEqual([...order].sort((left, right) => left - right), [0, 1, 2, 3, 4], '必须是 0..n-1 的置换');
});

test('随机模式：next 走的是置换序列，previous 能回到刚才那首', () => {
  // random 恒为 0 时 Fisher-Yates 会得到 [1,2,3,0] 形状的确定结果，这里只看行为。
  let seed = 42;
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const state = adopt([A, B, C, A], 0, 'shuffle', random);
  const first = currentTrack(state)?.title;
  const next = advance(state, 1, { auto: false });
  const second = currentTrack(next.state)?.title;
  const back = advance(next.state, -1, { auto: false });
  assert.equal(currentTrack(back.state)?.title, first, '上一首要回到刚才那首');
  assert.equal(next.kind, 'play');
  assert.notEqual(second, undefined);
});

test('setMode 切换时保持当前这首歌不变', () => {
  const state = adopt([A, B, C], 1, 'sequential');
  const shuffled = setMode(state, 'shuffle', () => 0.5);
  assert.equal(currentTrack(shuffled)?.title, 'B', '切模式不该跳歌');
  const back = setMode(shuffled, 'repeat-all');
  assert.equal(currentTrack(back)?.title, 'B');
  assert.deepEqual(back.order, [0, 1, 2]);
});

test('enqueue 追加到末尾且不影响当前项（含随机模式）', () => {
  const state = adopt([A, B], 0, 'sequential');
  const added = enqueue(state, C);
  assert.deepEqual(titles(added), ['A', 'B', 'C']);
  assert.equal(currentTrack(added)?.title, 'A');

  const shuffleState = adopt([A, B], 0, 'shuffle', () => 0.5);
  const shuffleAdded = enqueue(shuffleState, C);
  assert.deepEqual(titles(shuffleAdded), ['A', 'B', 'C']);
  assert.equal(currentTrack(shuffleAdded)?.title, 'A');
  assert.equal(shuffleAdded.order[1], 2, '新项应紧跟在当前项之后');
});

test('enqueue 到空队列会把它变成当前项', () => {
  const state = enqueue(clear(adopt([A], 0, 'sequential')), B);
  assert.equal(currentTrack(state)?.title, 'B');
});

test('removeAt：删掉别的项不跳歌，删掉当前项落到下一首', () => {
  const state = adopt([A, B, C], 1, 'sequential');
  const other = removeAt(state, 0);
  assert.deepEqual(titles(other), ['B', 'C']);
  assert.equal(currentTrack(other)?.title, 'B', '删别人不该跳歌');

  const self = removeAt(state, 1);
  assert.deepEqual(titles(self), ['A', 'C']);
  assert.equal(currentTrack(self)?.title, 'C', '删掉当前项就播下一首');

  const last = removeAt(adopt([A, B, C], 2, 'sequential'), 2);
  assert.equal(
    currentTrack(last)?.title,
    'B',
    '删掉末尾的当前项：没有「下一首」就回退到上一首',
  );
});

test('removeAt：删空队列返回空快照但保留模式', () => {
  const state = removeAt(adopt([A], 0, 'shuffle'), 0);
  assert.equal(state.items.length, 0);
  assert.equal(state.mode, 'shuffle');
  assert.equal(currentTrack(state), null);
});

test('move：拖动排序后仍然播同一首歌', () => {
  const state = adopt([A, B, C], 1, 'sequential');
  const moved = move(state, 1, 2);
  assert.deepEqual(titles(moved), ['A', 'C', 'B']);
  assert.equal(currentTrack(moved)?.title, 'B');

  const toFront = move(state, 1, 0);
  assert.deepEqual(titles(toFront), ['B', 'A', 'C']);
  assert.equal(currentTrack(toFront)?.title, 'B');

  assert.equal(move(state, 5, 0), state, '越界的 from 原样返回');
  assert.equal(move(state, 1, 1), state, '原地移动原样返回');
});

test('clear 清空但保留播放模式', () => {
  const state = clear(adopt([A, B], 0, 'repeat-one'));
  assert.deepEqual(state.items, []);
  assert.equal(state.mode, 'repeat-one');
});
