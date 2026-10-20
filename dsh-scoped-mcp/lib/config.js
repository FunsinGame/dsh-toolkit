/**
 * dsh-scoped-mcp config store.
 *
 * Two config files, one per scope:
 *   - global:    <DSH_HOME>/mcp-scope.yml
 *   - workspace: <workspace>/.dsh/mcp.yml
 *
 * A workspace server with the same `serverName` as a global server replaces the
 * global entry for that workspace; every other global server still applies.
 *
 * The module is plain ESM JavaScript (no build step) and is shared by the host
 * plugin, the browser-facing HTTP API, and the CLI.
 */
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parse, stringify } from 'yaml'

export const SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/
export const DEFAULT_TIMEOUT_MS = 60_000
export const CONFIG_HEADER = '# Managed by dsh-scoped-mcp. Edit with the CLI, the MCP page, or by hand.\n'

export const DEFAULT_RECONNECT = {
  enabled: true,
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  maxAttempts: 10,
}

/** The DSH home directory (honours DSH_HOME, else ~/.dsh). */
export function resolveDshHome() {
  return process.env.DSH_HOME?.trim() ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh')
}

/** Path of the global scope's config file. */
export function globalConfigPath() {
  return join(resolveDshHome(), 'mcp-scope.yml')
}

/** Path of one workspace's config file. */
export function workspaceConfigPath(projectRoot) {
  return join(resolve(projectRoot), '.dsh', 'mcp.yml')
}

/**
 * Normalize a loose scope selector into `{ kind: 'global' }` or
 * `{ kind: 'workspace', path }`.
 * @param scope - 'global', a directory path, or an already-normalized scope.
 */
export function normalizeScope(scope) {
  if (scope === undefined || scope === null || scope === '' || scope === 'global') {
    return { kind: 'global', label: 'global' }
  }
  if (typeof scope === 'object' && scope.kind === 'global') return { kind: 'global', label: 'global' }
  if (typeof scope === 'object' && scope.kind === 'workspace') {
    return { kind: 'workspace', label: String(scope.path), path: resolve(String(scope.path)) }
  }
  return { kind: 'workspace', label: String(scope), path: resolve(String(scope)) }
}

/** Config file path for one normalized scope. */
export function configPathForScope(scope) {
  const normalized = normalizeScope(scope)
  return normalized.kind === 'global' ? globalConfigPath() : workspaceConfigPath(normalized.path)
}

/** Whether a path exists (any type). */
export async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Walk up from `start` until a directory containing `.git` is found. */
export async function findProjectRoot(start) {
  let current = resolve(start || process.cwd())
  while (true) {
    try {
      await access(join(current, '.git'))
      return current
    } catch {
      const parent = dirname(current)
      if (parent === current) return current
      current = parent
    }
  }
}

/**
 * Read one config file. A missing file is an empty config; a malformed
 * `servers` value is dropped instead of failing the whole page.
 * @param path - absolute config file path.
 * @returns `{ servers }` with raw (un-normalized) entries.
 */
export async function loadConfigFile(path) {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = parse(raw) ?? {}
    return { servers: Array.isArray(parsed.servers) ? parsed.servers : [] }
  } catch (error) {
    if (error?.code === 'ENOENT') return { servers: [] }
    throw error
  }
}

/**
 * Write one config file atomically (temp file + rename), so a concurrent
 * reader never observes a half-written file.
 * @param path - absolute config file path.
 * @param config - `{ servers }`.
 */
export async function writeConfigFile(path, config) {
  await mkdir(dirname(path), { recursive: true })
  const body = stringify({ servers: config.servers ?? [] }, { lineWidth: 0 })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, `${CONFIG_HEADER}${body}`, 'utf8')
  await rename(temporary, path)
}

/**
 * Validate and normalize one server entry. Defaults are filled in so two
 * equivalent spellings compare equal; unknown extra fields are dropped.
 * @param input - raw entry from YAML or the HTTP API.
 * @returns normalized server config.
 * @throws {Error} for an invalid name, transport, command, or URL.
 */
export function normalizeServerConfig(input) {
  if (!input || typeof input !== 'object') throw new Error('server config must be an object')
  const serverName = String(input.serverName ?? '')
  if (!SERVER_NAME_RE.test(serverName)) throw new Error('serverName must match [A-Za-z0-9_-]{1,32}')
  const transport = input.transport
  if (transport !== 'stdio' && transport !== 'streamable-http') {
    throw new Error('transport must be "stdio" or "streamable-http"')
  }
  const common = {
    serverName,
    transport,
    toolCallTimeoutMs: Number.isFinite(input.toolCallTimeoutMs) && input.toolCallTimeoutMs > 0
      ? Math.floor(input.toolCallTimeoutMs)
      : DEFAULT_TIMEOUT_MS,
    failOnStartupError: input.failOnStartupError === true,
    reconnect: {
      ...DEFAULT_RECONNECT,
      ...(input.reconnect && typeof input.reconnect === 'object' ? input.reconnect : {}),
    },
    disabled: input.disabled === true,
  }
  if (transport === 'stdio') {
    if (typeof input.command !== 'string' || input.command.trim() === '') {
      throw new Error('stdio server requires command')
    }
    return {
      ...common,
      command: input.command.trim(),
      args: Array.isArray(input.args) ? input.args.map(String) : [],
      env: input.env && typeof input.env === 'object' && !Array.isArray(input.env)
        ? Object.fromEntries(Object.entries(input.env).map(([key, value]) => [key, String(value)]))
        : {},
      cwd: typeof input.cwd === 'string' ? input.cwd.trim() : '',
    }
  }
  if (typeof input.url !== 'string' || input.url.trim() === '') {
    throw new Error('streamable-http server requires url')
  }
  return {
    ...common,
    url: input.url.trim(),
    headers: input.headers && typeof input.headers === 'object' && !Array.isArray(input.headers)
      ? Object.fromEntries(Object.entries(input.headers).map(([key, value]) => [key, String(value)]))
      : {},
  }
}

/** Normalize a list, skipping entries that fail validation (with a warning). */
export function normalizeServerList(servers, onInvalid) {
  const result = []
  for (const entry of Array.isArray(servers) ? servers : []) {
    try {
      result.push(normalizeServerConfig(entry))
    } catch (error) {
      onInvalid?.(entry, error)
    }
  }
  return result
}

/** Read and normalize one scope's own servers (no merge). */
export async function loadScopeServers(scope) {
  const path = configPathForScope(scope)
  const config = await loadConfigFile(path)
  return { path, servers: normalizeServerList(config.servers) }
}

/**
 * Merge the global and workspace scopes for one workspace. Workspace entries
 * replace same-named global entries; the result is sorted by name and tagged
 * with `scope` ('global' | 'workspace').
 * @param projectRoot - workspace root directory.
 * @returns merged normalized servers.
 */
export async function loadMergedServers(projectRoot) {
  const global = normalizeServerList((await loadConfigFile(globalConfigPath())).servers)
  const workspace = normalizeServerList(
    (await loadConfigFile(workspaceConfigPath(projectRoot))).servers,
  )
  const byName = new Map()
  for (const server of global) byName.set(server.serverName, { ...server, scope: 'global' })
  for (const server of workspace) byName.set(server.serverName, { ...server, scope: 'workspace' })
  return [...byName.values()].sort((left, right) => left.serverName.localeCompare(right.serverName))
}

/** Stable comparison key for one normalized server config. */
export function serverFingerprint(server) {
  return JSON.stringify(server)
}

/** Parse repeated `KEY=VALUE` command-line values. */
export function parseKeyValuePairs(values) {
  const result = {}
  for (const value of values ?? []) {
    const index = String(value).indexOf('=')
    if (index <= 0) throw new Error(`KEY=VALUE expected, got "${value}"`)
    result[String(value).slice(0, index)] = String(value).slice(index + 1)
  }
  return result
}
