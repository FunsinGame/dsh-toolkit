/**
 * Discovery of running DSH instances through the user-only instance file the
 * Host writes under `$DSH_HOME/runtime/external-input`, plus the web-session
 * secret that file's route now needs.
 */

import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { encodeBase64Url, isSessionSecret } from './session'

/** File the Host keeps its credential records in, relative to the harness home. */
const CREDENTIALS_FILE = '.credentials.yaml'

/** Record key of the browser-session signing secret. */
const SESSION_RECORD_KEY = /^\s*['"]?client-connection\/browser-session['"]?\s*:\s*$/u

/** The `secret:` field of that record. */
const SESSION_SECRET_LINE = /^\s+['"]?secret['"]?\s*:\s*(.*)$/u

/**
 * How long one endpoint may take to prove it is listening. Windows reports a
 * closed loopback port immediately, so this bound only matters for a Host that
 * is still binding.
 */
const PROBE_TIMEOUT_MS = 800

/** One running DSH instance's local external-input endpoint. */
export interface DshInstance {
  readonly schema: number
  readonly pid: number
  readonly port: number
  readonly url: string
  readonly token: string
  readonly cwd: string
  readonly startedAt: string
  /** Harness home the record was read from; its credentials live beside it. */
  readonly home: string
}

/** The fields one instance file carries. */
type InstanceRecord = Omit<DshInstance, 'home'>

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
 *
 * A record outlives its Host only until the next cleanup, and Windows reuses
 * process ids freely, so a months-old record can name a process that is now
 * some unrelated program. A pinned file is taken as given; directory discovery
 * additionally asks each endpoint to prove it is listening.
 *
 * @param homes - candidate homes in preference order.
 * @param exactFile - optional exact instance file path.
 * @returns live instances, newest mount per process, all reachable.
 */
export async function readInstancesFrom(homes: readonly string[], exactFile: string): Promise<DshInstance[]> {
  if (exactFile.trim() !== '') return readInstances(homes[0] ?? join(homedir(), '.dsh'), exactFile)
  const byPid = new Map<number, DshInstance>()
  for (const home of homes) {
    for (const instance of await readInstances(home, '')) {
      const seen = byPid.get(instance.pid)
      // One Host process can mount the Web surface more than once; the newest
      // mount owns the live routes, so it wins over whichever file was read last.
      if (seen === undefined || Date.parse(instance.startedAt) >= Date.parse(seen.startedAt)) {
        byPid.set(instance.pid, instance)
      }
    }
  }
  const candidates = [...byPid.values()]
  const reachable = await Promise.all(candidates.map(instance => isListening(instance)))
  return candidates.filter((_, index) => reachable[index] === true)
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
      const value = JSON.parse(await readFile(file, 'utf8')) as Partial<InstanceRecord>
      if (!isInstance(value) || !isAlive(value.pid)) continue
      instances.push({ ...value, home })
    } catch {
      // A file being rewritten or a stale entry is not a candidate.
    }
  }
  return instances
}

/**
 * Read the browser-session signing secret the Host derives its request cookie
 * from. It changes only when DSH recreates the credential record, so callers
 * may re-read it once after a rejected request.
 * @param home - harness home of the instance being addressed.
 * @returns the decoded secret, or undefined when this home has none to offer.
 */
export async function readBrowserSessionSecret(home: string): Promise<Uint8Array | undefined> {
  let text: string
  try {
    text = await readFile(join(home, CREDENTIALS_FILE), 'utf8')
  } catch {
    return undefined
  }
  const secret = credentialsSecret(text)
  if (secret === undefined) return undefined
  const decoded = decodeBase64Url(secret)
  return decoded !== undefined && isSessionSecret(decoded) ? decoded : undefined
}

/**
 * Whether the parsed file is a complete, current instance record.
 * @param value - parsed JSON value.
 * @returns whether every required field has the expected type.
 */
function isInstance(value: Partial<InstanceRecord>): value is InstanceRecord {
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
 * Whether the recorded endpoint answers at all. Admission answers `401` on
 * every named route, so any response — not any success — is the signal.
 * @param instance - candidate instance.
 * @returns whether something is listening on the recorded port.
 */
async function isListening(instance: DshInstance): Promise<boolean> {
  try {
    await fetch(`${instance.url}/external-input/v1/insert`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
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

/**
 * Locate the `secret:` scalar of the browser-session record in the credential
 * file. The file is machine-written with block indentation, so the record owns
 * every following line indented deeper than its key.
 * @param text - the whole credential file.
 * @returns the raw scalar, or undefined when the record is absent.
 */
function credentialsSecret(text: string): string | undefined {
  const lines = text.split(/\r?\n/u)
  const at = lines.findIndex(line => SESSION_RECORD_KEY.test(line))
  if (at === -1) return undefined
  const indent = indentation(lines[at] ?? '')
  for (let index = at + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (line.trim() === '') continue
    if (indentation(line) <= indent) return undefined
    const match = SESSION_SECRET_LINE.exec(line)
    if (match !== null) return scalar(match[1] ?? '')
  }
  return undefined
}

/**
 * Count the leading whitespace of one line.
 * @param line - one file line.
 * @returns the indentation width.
 */
function indentation(line: string): number {
  return line.length - line.trimStart().length
}

/**
 * Read one YAML scalar without implementing YAML: drop a trailing comment and
 * unwrap a matching quote pair.
 * @param raw - text after the `key:` separator.
 * @returns the scalar text.
 */
function scalar(raw: string): string {
  const trimmed = raw.replace(/\s+#.*$/u, '').trim()
  const quote = trimmed[0]
  if ((quote === '"' || quote === "'") && trimmed.length >= 2 && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * Decode an unpadded base64url string, rejecting non-canonical spellings.
 * @param value - encoded text.
 * @returns the bytes, or undefined when the text is not canonical base64url.
 */
function decodeBase64Url(value: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]*$/u.test(value) || value.length % 4 === 1) return undefined
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const decoded = Buffer.from(padded, 'base64')
  return encodeBase64Url(decoded) === value ? decoded : undefined
}
