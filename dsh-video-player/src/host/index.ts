/**
 * dsh-video-player host entry.
 *
 * The player is intentionally browser-local: a video selected through the
 * `<input type="file">` never leaves the renderer, and frame tables are parsed
 * from that File with the browser's own Blob APIs. There is therefore no host
 * route, no temporary media directory, and no port to expose.
 *
 * This module exists because a DSH bundle row needs a host entry. It stays
 * empty so loading the plugin costs one module import and nothing else.
 */

export const name = 'dsh-video-player'

/** Contract version surfaced by the test harness; the plugin loader ignores it. */
export const VIDEO_PLAYER_VERSION = __VIDEO_PLAYER_VERSION__

export function apply(): void {
  // Nothing to mount on the host side.
}
