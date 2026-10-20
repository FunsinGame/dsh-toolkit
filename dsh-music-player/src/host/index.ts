/**
 * dsh-music-player host entry.
 *
 * The host half owns persistence and network access; the browser half is the
 * activity page. Routes are registered only when DSH's Web server is present,
 * so a headless composition can still load the package without failing.
 */

import { MusicHost } from './host'

/* Replaced at build time by scripts/build.mjs. */
// @ts-expect-error injected by esbuild define
const VERSION: string = __MUSIC_PLAYER_VERSION__

export const name = 'dsh-music-player'

export function apply(ctx: any): void {
  const host = new MusicHost(VERSION ?? '0.1.0')
  ctx.effect(() => () => host.dispose(), 'dsh-music-player: dispose')
  ctx.inject(['webServer'], (child: any) => {
    child.effect(() => host.register(child.webServer), 'dsh-music-player: routes')
  })
}
