/**
 * A tiny play-request channel.
 *
 * The result list and the details pane both need to start playback, and the
 * player lives in the transport bar. Rather than thread a callback through every
 * component (and through the windowing layer), they publish an intent here and
 * the transport consumes it.
 */

export type PlayRequest = { assetId: number; autoplay: boolean };

type Listener = (request: PlayRequest) => void;

const listeners = new Set<Listener>();

export function requestPlay(assetId: number, autoplay = true): void {
  for (const listener of listeners) listener({ assetId, autoplay });
}

export function onPlayRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
