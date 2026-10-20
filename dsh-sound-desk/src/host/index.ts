/**
 * dsh-sound-desk host entry.
 *
 * Mounts the SoundDesk engine inside DSH's host process and exposes it on the Web
 * server under one same-origin prefix. Nothing starts unless the plugin is
 * enabled; the engine itself starts on the first request (or eagerly when the
 * `autoStart` setting says so).
 */

import { SoundDeskHost, type ConnectionLike } from './host'

export const name = 'dsh-sound-desk'

/**
 * Test seam: lets `scripts/test-host.mjs` assert how an optional dependency resolves
 * in the *shipped* bundle, which is where the pnpm-store layout actually matters.
 * The plugin loader ignores exports other than `apply`/`inject`/`Config`/`name`.
 */
export { resolvePackage } from './deps'

export function apply(ctx: any): void {
  const host = new SoundDeskHost(() => {
    try {
      return (ctx.get?.('connection') as ConnectionLike | undefined) ?? null
    } catch {
      return null
    }
  })

  ctx.effect(() => () => {
    void host.dispose()
  }, 'dsh-sound-desk: dispose')

  ctx.inject(['webServer'], (child: any) => {
    child.effect(() => host.register(child.webServer), 'dsh-sound-desk: routes')
  })

  host.startIfConfigured()
}
