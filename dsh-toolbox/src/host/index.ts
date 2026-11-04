/**
 * dsh-toolbox host entry.
 *
 * Every tool in the toolbox is browser-local: a video or an image picked through
 * `<input type="file">` / drag-and-drop is decoded in the renderer and never
 * leaves it. There is therefore no host route, no scratch directory and no port
 * to expose.
 *
 * This module exists because a DSH bundle row needs a host entry. It stays empty
 * so loading the plugin costs one module import and nothing else.
 */

export const name = 'dsh-toolbox'

/** Contract version surfaced by the test harness; the plugin loader ignores it. */
export const DSH_TOOLBOX_VERSION = __DSH_TOOLBOX_VERSION__

export function apply(): void {
  // Nothing to mount on the host side.
}
