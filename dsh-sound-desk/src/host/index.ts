/**
 * dsh-sound-desk host entry.
 *
 * This file is deliberately thin: applying the plugin only advertises the
 * same-origin prefix on DSH's Web server. The host half — the engine, the UCS
 * dataset and its SQLite schema, all of which live in this bundle — is imported
 * and constructed on the first request the prefix receives. That request is the
 * workbench page's first `status?wait=1`, i.e. the first time the user opens the
 * activity from the rail.
 *
 * So DSH start-up costs one route registration and nothing else: no engine, no
 * catalogue handle, no model, no several-megabyte UCS dataset in memory. The
 * dynamic import is what makes that true — a static `import './host'` would run
 * all of that module-level work (data files included) before `apply` even ran.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import { ROUTE_PREFIX } from './paths'
import type { ConnectionLike, SoundDeskHost } from './host'

export const name = 'dsh-sound-desk'

/**
 * Test seam: lets `scripts/test-host.mjs` assert how an optional dependency resolves
 * in the *shipped* bundle, which is where the pnpm-store layout actually matters.
 * The plugin loader ignores exports other than `apply`/`inject`/`Config`/`name`.
 */
export { resolvePackage } from './deps'

interface WebServerLike {
  register: (route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }) => () => void
}

interface WebServerContext {
  webServer: WebServerLike
  effect: (factory: () => () => void, label?: string) => void
}

function connectionOf(ctx: any): ConnectionLike | null {
  try {
    return (ctx.get?.('connection') as ConnectionLike | undefined) ?? null
  } catch {
    return null
  }
}

/**
 * Answer a request that failed before the host could handle it.
 *
 * Loading the host half can fail for real reasons (a Node without `node:sqlite`,
 * a broken install), and the page renders a JSON error far better than a dropped
 * socket.
 */
function fail(res: ServerResponse, error: unknown): void {
  if (res.headersSent) {
    res.destroy()
    return
  }
  const text = JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
  res.writeHead(500, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

export function apply(ctx: any): void {
  let host: SoundDeskHost | null = null
  let loading: Promise<SoundDeskHost> | null = null
  let disposed = false

  /**
   * Load and construct the host half once, on demand.
   *
   * A failed load clears the cache so a later request tries again instead of
   * replaying a rejected promise forever.
   */
  const ensureHost = async (): Promise<SoundDeskHost> => {
    if (host !== null) return host
    if (loading === null) {
      loading = (async () => {
        const { SoundDeskHost: Host } = await import('./host')
        return new Host(() => connectionOf(ctx))
      })()
      loading.catch(() => {
        loading = null
      })
    }
    const created = await loading
    // The plugin may be unloaded while the import is in flight; an engine that
    // nobody owns any more must not stay running.
    if (disposed) {
      await created.dispose()
      throw new Error('dsh-sound-desk 已被卸载')
    }
    host = created
    return created
  }

  ctx.effect(() => () => {
    disposed = true
    const current = host
    host = null
    if (current !== null) void current.dispose()
  }, 'dsh-sound-desk: dispose')

  ctx.inject(['webServer'], (child: WebServerContext) => {
    child.effect(
      () =>
        child.webServer.register({
          kind: 'prefix',
          path: ROUTE_PREFIX,
          handler: async (req, res) => {
            try {
              const ready = await ensureHost()
              await ready.handleRequest(req, res)
            } catch (error) {
              fail(res, error)
            }
          },
        }),
      'dsh-sound-desk: routes',
    )
  })
}
