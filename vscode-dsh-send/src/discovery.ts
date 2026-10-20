/**
 * Discovery of running DSH instances through the user-only instance file the
 * Host writes under `$DSH_HOME/runtime/external-input`.
 */

import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** One running DSH instance's local external-input endpoint. */
export interface DshInstance {
  readonly schema: number
  readonly pid: number
  readonly port: number
  readonly url: string
  readonly token: string
  readonly cwd: string
  readonly startedAt: string
}

/**
 * Resolve the harness home the same way the Host does.
 * @param configured - the `dshSend.home` setting; empty follows the environment.
 * @returns the absolute harness home.
 */
export function dshHome(configured: string): string {
  if (configured !== '') return expandHome(configured)
  const fromEnvironment = process.env.DSH_HOME?.trim()
  if (fromEnvironment !== undefined && fromEnvironment !== '') return expandHome(fromEnvironment)
  return join(homedir(), '.dsh')
}

/**
 * Every home an instance record may live under, in preference order: the
 * explicit setting, the extension host's `DSH_HOME`, then the user-level
 * `~/.dsh` where the Host mirrors its record.
 * @param configured - the `dshSend.home` setting.
 * @returns distinct absolute homes.
 */
export function candidateHomes(configured: string): string[] {
  const homes = new Set<string>()
  if (configured.trim() !== '') homes.add(expandHome(configured.trim()))
  const fromEnvironment = process.env.DSH_HOME?.trim()
  if (fromEnvironment !== undefined && fromEnvironment !== '') homes.add(expandHome(fromEnvironment))
  homes.add(join(homedir(), '.dsh'))
  return [...homes]
}

/**
 * Read live instances across every candidate home, deduplicated by process id.
 * @param homes - candidate homes in preference order.
 * @param exactFile - optional exact instance file path.
 * @returns live instances.
 */
export async function readInstancesFrom(homes: readonly string[], exactFile: string): Promise<DshInstance[]> {
  if (exactFile.trim() !== '') return readInstances(homes[0] ?? join(homedir(), '.dsh'), exactFile)
  const byPid = new Map<number, DshInstance>()
  for (const home of homes) {
    for (const instance of await readInstances(home, '')) byPid.set(instance.pid, instance)
  }
  return [...byPid.values()]
}

/**
 * Read every live instance file, or exactly one configured file.
 * @param home - resolved harness home.
 * @param exactFile - optional exact instance file path.
 * @returns instances whose process is still alive.
 */
export async function readInstances(home: string, exactFile: string): Promise<DshInstance[]> {
  const files = exactFile !== ''
    ? [resolve(exactFile)]
    : (await readdir(join(home, 'runtime', 'external-input')).catch(() => [] as string[]))
      .filter(name => name.endsWith('.json'))
      .map(name => join(home, 'runtime', 'external-input', name))
  const instances: DshInstance[] = []
  for (const file of files) {
    try {
      const value = JSON.parse(await readFile(file, 'utf8')) as Partial<DshInstance>
      if (!isInstance(value) || !isAlive(value.pid)) continue
      instances.push(value)
    } catch {
      // A file being rewritten or a stale entry is not a candidate.
    }
  }
  return instances
}

/**
 * Whether the parsed file is a complete, current instance record.
 * @param value - parsed JSON value.
 * @returns whether every required field has the expected type.
 */
function isInstance(value: Partial<DshInstance>): value is DshInstance {
  return value.schema === 1
    && typeof value.pid === 'number'
    && typeof value.port === 'number'
    && typeof value.url === 'string'
    && typeof value.token === 'string'
    && typeof value.cwd === 'string'
    && typeof value.startedAt === 'string'
}

/**
 * Whether a process still exists.
 * @param pid - process id from an instance file.
 * @returns whether signalling the process reports it alive.
 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Expand a leading `~` against the current user's home directory.
 * @param value - configured path.
 * @returns the absolute path.
 */
function expandHome(value: string): string {
  return value.startsWith('~') ? join(homedir(), value.slice(1)) : value
}
