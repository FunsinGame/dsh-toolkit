/**
 * dsh-notes host entry.
 *
 * Contributes the local cache + sync engine, the same-origin /dsh-notes API for
 * the activity page, and the notes_* AI tools. The standalone notes server is
 * deployed separately; this file never opens a network listener.
 */

import { NotesHost } from './host.ts'
import { registerHostRoutes } from './routes.ts'
import { registerNotesTools } from './tools.ts'
import type { PluginConfig } from './settings.ts'

declare const __DSH_NOTES_VERSION__: string
const VERSION = typeof __DSH_NOTES_VERSION__ === 'string' ? __DSH_NOTES_VERSION__ : '0.1.0'

export const name = 'dsh-notes'
export const inject = ['tools']

const fallbackLogger = {
  info: (...args: unknown[]) => console.info('[dsh-notes]', ...args),
  warn: (...args: unknown[]) => console.warn('[dsh-notes]', ...args),
  error: (...args: unknown[]) => console.error('[dsh-notes]', ...args),
  debug: (...args: unknown[]) => console.debug('[dsh-notes]', ...args),
}

export function apply(ctx: any, config?: PluginConfig): void {
  const logger = ctx.logger !== undefined && typeof ctx.logger.info === 'function' ? ctx.logger : fallbackLogger
  const host = new NotesHost({ config, logger, version: VERSION })

  ctx.effect(() => () => {
    void host.dispose()
  }, 'dsh-notes: dispose')

  registerNotesTools(ctx, host)

  ctx.inject(['webServer', 'connection'], (child: any) => {
    child.effect(() => registerHostRoutes({
      host,
      webServer: child.webServer,
      connectionOf: () => {
        try {
          return child.connection
        } catch {
          return null
        }
      },
      logger,
    }), 'dsh-notes: routes')
  })

  logger.info(`notes host ready (${host.shortLabel()})`)
}
