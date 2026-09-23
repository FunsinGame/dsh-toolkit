/**
 * Browser Web Audio factories.
 *
 * The effects package types against a minimal structural subset of Web Audio so
 * one implementation serves both the browser and `node-web-audio-api`. These two
 * adapters are the only place that knows which host it is in.
 */

import type { OfflineContextLike } from '@sounddesk/audio-effects';

/**
 * Create an `OfflineAudioContext` for export rendering.
 *
 * Throws a readable error rather than returning undefined when the constructor is
 * missing: offline rendering is the whole export path, so failing loudly here is
 * better than a silent empty file.
 */
export function createOfflineAudioContext(
  channels: number,
  length: number,
  sampleRate: number,
): OfflineContextLike {
  const Ctor =
    typeof OfflineAudioContext !== 'undefined'
      ? OfflineAudioContext
      : (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
          .webkitOfflineAudioContext;
  if (!Ctor) throw new Error('这个浏览器不支持 OfflineAudioContext，无法导出效果');
  // The structural type is satisfied by the real node graph; the cast is only
  // needed because the DOM lib types are nominal about AudioParam.
  return new Ctor(channels, length, sampleRate) as unknown as OfflineContextLike;
}
