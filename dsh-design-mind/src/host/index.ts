/**
 * dsh-design-mind host entry.
 *
 * Registers the same-origin `/dsh-design-mind` routes that persist an exported
 * design review: the original image plus a small feedback JSON. The browser half
 * is loaded separately through `dsh.client`; this module never opens a listener
 * of its own and never talks to a model.
 *
 * The helpers below are re-exported for the test scripts. They are not part of
 * the plugin contract and may change without notice.
 */

import { registerHostRoutes } from './routes.ts'
import { exportsRoot } from './paths.ts'

declare const __DESIGN_MIND_VERSION__: string
const VERSION = typeof __DESIGN_MIND_VERSION__ === 'string' ? __DESIGN_MIND_VERSION__ : '0.1.0'

export const name = 'dsh-design-mind'

const fallbackLogger = {
  info: (...args: unknown[]) => console.info('[dsh-design-mind]', ...args),
  warn: (...args: unknown[]) => console.warn('[dsh-design-mind]', ...args),
  error: (...args: unknown[]) => console.error('[dsh-design-mind]', ...args),
  debug: (...args: unknown[]) => console.debug('[dsh-design-mind]', ...args),
}

export function apply(ctx: any): void {
  const logger = ctx.logger !== undefined && typeof ctx.logger.info === 'function' ? ctx.logger : fallbackLogger

  ctx.inject(['webServer', 'connection'], (child: any) => {
    child.effect(
      () =>
        registerHostRoutes({
          webServer: child.webServer,
          root: exportsRoot(),
          version: VERSION,
          logger,
          connectionOf: () => {
            try {
              return child.connection
            } catch {
              return null
            }
          },
        }),
      'dsh-design-mind: routes',
    )
  })

  logger.info(`design-mind host ready (exports: ${exportsRoot()})`)
}

export { createRouteHandler, PREFIX } from './routes.ts'
export { buildFeedback, buildPrompt, normalizeComments, FEEDBACK_SCHEMA } from './feedback.ts'
export { createExport, commitExport, cleanExports, exportDir, isExportId, pruneExports } from './exports.ts'
export { openDirectory } from './reveal.ts'
export { detectImageFormat, writeImageFile, MAX_IMAGE_BYTES, MAX_IMAGE_EDGE, MAX_IMAGE_PIXELS } from './imageInfo.ts'
export { exportsRoot, resolveDshHome } from './paths.ts'
