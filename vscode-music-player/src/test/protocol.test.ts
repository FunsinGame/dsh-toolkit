import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isWebviewToHostType, WEBVIEW_TO_HOST_TYPES } from '../protocol';

/**
 * 这份清单是「webview 实际会发哪些消息」的独立复述——故意和源码分开写，
 * 这样如果有人加了新消息却忘了进白名单，测试会失败。
 *
 * 之前踩过的坑：`prepareTrack` 与 `auth.start` 漏进白名单，宿主当未知消息丢掉，
 * 界面永远卡在「正在获取二维码…」。
 */
const MESSAGES_THE_WEBVIEW_SENDS = [
  'ready',
  'search',
  'play',
  'prepareTrack',
  'toggle',
  'seek',
  'stop',
  'player.next',
  'player.previous',
  'player.ended',
  'player.setMode',
  'queue.enqueue',
  'queue.remove',
  'queue.move',
  'queue.playAt',
  'queue.clear',
  'cache.stats',
  'cache.clear',
  'settings.get',
  'settings.set',
  'auth.start',
  'auth.cancel',
  'auth.logout',
  'favorites.list',
  'favorites.open',
  'favorites.create',
  'favorites.removeFolder',
  'favorites.removeResources',
  'favorites.membership',
  'favorites.deal',
  'favorites.playAll',
  'dialog.confirm',
  'report',
  'log',
];

test('白名单覆盖 webview 会发出的所有消息', () => {
  for (const type of MESSAGES_THE_WEBVIEW_SENDS) {
    assert.equal(isWebviewToHostType(type), true, `${type} 必须在白名单里`);
  }
  assert.deepEqual(
    [...WEBVIEW_TO_HOST_TYPES].sort(),
    [...MESSAGES_THE_WEBVIEW_SENDS].sort(),
    '白名单与清单必须完全一致（多了少了都算不一致）',
  );
});

test('未知消息类型一律拒绝', () => {
  for (const type of ['', 'playe', 'auth.start ', 'PLAY', '__proto__', 'constructor', 'toString']) {
    assert.equal(isWebviewToHostType(type), false, `${type} 不该被接受`);
  }
});
