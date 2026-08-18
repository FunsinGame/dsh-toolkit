/**
 * dsh-scoped-mcp config store.
 *
 * Global servers live in ~/.dsh/mcp-scope.yml. Workspace servers live in
 * <workspace>/.dsh/mcp.yml. A workspace server overrides a global server with
 * the same serverName; other global servers still apply to that workspace.
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { parse, stringify } from 'yaml'

export const SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/
export const DEFAULT_TIMEOUT_MS = 60_000
export const DEFAULT_RECONNECT = {
  enabled: true,
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  maxAttempts: 10,
}

export function resolveDshHome() {
  return process.env.DSH_HOME?.trim() ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh')
}

export function globalConfigPath() {
  return join(resolveDshHome(), 'mcp-scope.yml')
}

export function workspaceConfigPath(projectRoot) {
  return join(resolve(projectRoot), '.dsh', 'mcp.yml')
}

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

export async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

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

export async function writeConfigFile(path, config) {
  await mkdir(dirname(path), { recursive: true })
  const body = stringify({ servers: config.servers ?? [] }, { lineWidth: 0 })
  await writeFile(path, `# Managed by dsh-scoped-mcp. Edit with the CLI or by hand.\n${body}`, 'utf8')
}

export function normalizeScope(scope) {
  if (scope === undefined || scope === null || scope === '' || scope === 'global') {
    return { kind: 'global', label: 'global' }
  }
  return { kind: 'workspace', label: String(scope), path: resolve(String(scope)) }
}

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
      ? input.toolCallTimeoutMs
      : DEFAULT_TIMEOUT_MS,
    failOnStartupError: input.failOnStartupError === true,
    reconnect: {
      ...DEFAULT_RECONNECT,
      ...(input.reconnect && typeof input.reconnect === 'object' ? input.reconnect : {}),
    },
    disabled: input.disabled === true,
  }
  if (transport === 'stdio') {
    if (typeof input.command !== 'string' || input.command === '') throw new Error('stdio server requires command')
    return {
      ...common,
      command: input.command,
      args: Array.isArray(input.args) ? input.args.map(String) : [],
      env: input.env && typeof input.env === 'object' && !Array.isArray(input.env)
        ? Object.fromEntries(Object.entries(input.env).map(([k, v]) => [k, String(v)]))
        : {},
      cwd: typeof input.cwd === 'string' ? input.cwd : '',
    }
  }
  if (typeof input.url !== 'string' || input.url === '') throw new Error('streamable-http server requires url')
  return {
    ...common,
    url: input.url,
    headers: input.headers && typeof input.headers === 'object' && !Array.isArray(input.headers)
      ? Object.fromEntries(Object.entries(input.headers).map(([k, v]) => [k, String(v)]))
      : {},
  }
}

export function normalizeServerList(servers) {
  return (Array.isArray(servers) ? servers : []).map(normalizeServerConfig)
}

export async function loadMergedServers(projectRoot) {
  const global = normalizeServerList((await loadConfigFile(globalConfigPath())).servers)
  const workspace = normalizeServerList((await loadConfigFile(workspaceConfigPath(projectRoot))).servers)
  const byName = new Map()
  for (const server of global) byName.set(server.serverName, { ...server, scope: 'global' })
  for (const server of workspace) byName.set(server.serverName, { ...server, scope: 'workspace' })
  return [...byName.values()].sort((a, b) => a.serverName.localeCompare(b.serverName))
}

export function parseKeyValuePairs(values) {
  const out = {}
  for (const value of values ?? []) {
    const index = value.indexOf('=')
    if (index <= 0) throw new Error(`KEY=VALUE expected, got "${value}"`)
    out[value.slice(0, index)] = value.slice(index + 1)
  }
  return out
}
