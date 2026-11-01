/** Filesystem locations owned by dsh-design-mind. */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const DSH_HOME_DIR_NAME = '.dsh'

/**
 * Resolve the DSH home the same way the harness does: `$DSH_HOME` first, then
 * `~/.dsh`. Read at call time so tests can point it at a temporary directory.
 */
export function resolveDshHome(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.DSH_HOME?.trim()
  return fromEnv !== undefined && fromEnv !== '' ? resolve(fromEnv) : join(homedir(), DSH_HOME_DIR_NAME)
}

/** Root of every export this plugin writes: `<dsh-home>/design-mind/exports`. */
export function exportsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveDshHome(env), 'design-mind', 'exports')
}
