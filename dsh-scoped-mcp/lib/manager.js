/**
 * dsh-scoped-mcp connection manager.
 *
 * Owns the plugin's live MCP connections, one per (scope, serverName):
 *
 *   - the global scope is shared by every workspace that does not override the
 *     name in its own config file;
 *   - a workspace scope owns the connections of `<workspace>/.dsh/mcp.yml`;
 *   - a workspace entry with the same `serverName` as a global entry replaces
 *     the global entry for that workspace only.
 *
 * Agents subscribe to the effective entries of the workspace their session cwd
 * resolves to; a connected entry registers its tools on every subscribed
 * agent's scoped tool registry, and a stopped entry unregisters them. The
 * browser page drives `enable`, `stop`, `save`, and `remove` through the host
 * routes, and every connection state change becomes visible on the next state
 * read.
 */
import { realpath } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import {
  findProjectRoot,
  loadMergedServers,
  loadScopeServers,
  normalizeServerConfig,
  serverFingerprint,
  writeConfigFile,
} from './config.js'
import { createToolDefinition, McpConnection } from './mcp-connection.js'

const PLUGIN = 'dsh-scoped-mcp'
const SEP = '\u0000'

/** Connection key shared by the manager, the state projection, and the routes. */
export function entryKey(scopeKind, scopePath, serverName) {
  return `${scopeKind}${SEP}${scopePath ?? ''}${SEP}${serverName}`
}

/** Message of an unknown rejection. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/** Canonicalize a directory path, falling back to the resolved spelling. */
async function canonicalPath(path) {
  try {
    return await realpath(path)
  } catch {
    return resolve(path)
  }
}

/** One component of the MCP page's state snapshot. */
export class ScopedMcpManager {
  /**
   * @param ctx - host plugin context (root-level; reads the Workspace registry).
   * @param options - test seams: `connectionFactory(config)` builds the object
   *   responsible for one live MCP connection.
   */
  constructor(ctx, options = {}) {
    this.ctx = ctx
    this.createConnection = options.connectionFactory ?? (config => new McpConnection(config))
    /** @type {Map<string, object>} */
    this.entries = new Map()
    /** @type {Map<string, { agent: object, workspacePath: string, entries: Map<string, { entry: object, serverName: string }> }>} */
    this.agentBindings = new Map()
    this.disposed = false
    this.queue = Promise.resolve()
  }

  /** Plugin logger, when the composition provides one. */
  log() {
    try {
      return this.ctx.logger
    } catch {
      return undefined
    }
  }

  /** Serialize mutating operations so two page actions cannot interleave writes. */
  exclusive(task) {
    const run = this.queue.then(task, task)
    this.queue = run.then(() => undefined, () => undefined)
    return run
  }

  /** The host Workspace registry, when the composition mounts it. */
  workspaceRegistry() {
    try {
      return this.ctx.get('workspaceRegistry')
    } catch {
      return undefined
    }
  }

  /** Every currently registered (open) workspace, in registry order. */
  listWorkspaces() {
    const registry = this.workspaceRegistry()
    if (!registry) return []
    try {
      return registry.list().map(workspace => ({
        id: String(workspace.id),
        title: workspace.title,
        path: workspace.path,
      }))
    } catch (error) {
      this.log()?.warn?.(`${PLUGIN}: workspace list failed: ${messageOf(error)}`)
      return []
    }
  }

  /** The registered workspace owning `path` (longest ancestor match). */
  workspaceForPath(path) {
    let best
    for (const workspace of this.listWorkspaces()) {
      if (path !== workspace.path && !path.startsWith(workspace.path.endsWith(sep) ? workspace.path : `${workspace.path}${sep}`)) {
        continue
      }
      if (best === undefined || workspace.path.length > best.path.length) best = workspace
    }
    return best
  }

  /**
   * Resolve the config scope of one agent: its session cwd's registered
   * workspace, else the enclosing project root, else the cwd itself.
   * @param agent - live agent.
   * @returns absolute workspace root, or null when the session has no cwd.
   */
  async resolveAgentWorkspace(agent) {
    const cwd = agent?.session?.header?.cwd
    if (typeof cwd !== 'string' || cwd === '') return null
    const canonical = await canonicalPath(cwd)
    const workspace = this.workspaceForPath(canonical)
    if (workspace) return workspace.path
    try {
      return await findProjectRoot(canonical)
    } catch {
      return canonical
    }
  }

  /** Build one entry, or refresh its config when the file changed underneath. */
  ensureEntry(scope, server, workspacePath) {
    // The scope tag belongs to the merged projection, never to the stored
    // config: comparing tagged and untagged forms would look like a file edit.
    const { scope: _scopeTag, ...config } = server
    const scopePath = scope.kind === 'workspace' ? (workspacePath ?? scope.path) : null
    const key = entryKey(scope.kind, scopePath, config.serverName)
    let entry = this.entries.get(key)
    if (!entry) {
      entry = {
        key,
        scope: scope.kind === 'workspace'
          ? { kind: 'workspace', path: scopePath }
          : { kind: 'global' },
        serverName: config.serverName,
        config,
        state: 'idle',
        error: null,
        tools: [],
        connection: null,
        connecting: null,
        generation: 0,
        subscribers: new Map(),
        pinned: false,
        blocked: false,
      }
      this.entries.set(key, entry)
      return entry
    }
    if (serverFingerprint(entry.config) !== serverFingerprint(config)) {
      entry.config = config
      if (entry.state !== 'idle') void this.disconnectEntry(entry)
    }
    return entry
  }

  /** Publish a state transition; readers poll, so no event emitter is needed. */
  setState(entry, state, error) {
    entry.state = state
    entry.error = error ?? null
  }

  /** Unregister the tools one subscriber currently holds. */
  disposeSubscriberTools(subscriber) {
    for (const dispose of subscriber.disposers.splice(0)) {
      try {
        dispose()
      } catch {
        // A failing disposer must not prevent the remaining tools from unloading.
      }
    }
  }

  /** Register the entry's current tool generation on one subscriber, if connected. */
  registerToolsFor(entry, subscriber) {
    this.disposeSubscriberTools(subscriber)
    if (entry.state !== 'connected' || entry.connection === null) return
    const tools = subscriber.agent?.ctx?.tools
    if (!tools) return
    for (const tool of entry.tools) {
      try {
        subscriber.disposers.push(tools.register(createToolDefinition(entry.connection, tool)))
      } catch (error) {
        this.log()?.warn?.(`${PLUGIN}: ${entry.serverName}: tool registration failed: ${messageOf(error)}`)
      }
    }
  }

  /** Subscribe one agent binding to one entry and register its tools. */
  bind(binding, entry) {
    const agentId = String(binding.agent.id)
    let subscriber = entry.subscribers.get(agentId)
    if (subscriber === undefined) {
      subscriber = { agent: binding.agent, disposers: [] }
      entry.subscribers.set(agentId, subscriber)
      binding.entries.set(entry.serverName, { entry, serverName: entry.serverName })
    }
    this.registerToolsFor(entry, subscriber)
  }

  /** Remove one agent binding from one entry, closing it when nobody needs it. */
  unbind(binding, serverName) {
    const record = binding.entries.get(serverName)
    if (record === undefined) return
    binding.entries.delete(serverName)
    const agentId = String(binding.agent.id)
    const subscriber = record.entry.subscribers.get(agentId)
    if (subscriber !== undefined) {
      this.disposeSubscriberTools(subscriber)
      record.entry.subscribers.delete(agentId)
    }
    if (record.entry.subscribers.size === 0 && !record.entry.pinned) void this.disconnectEntry(record.entry)
  }

  /**
   * Connect one entry (idempotent). A failure is published as the entry's error
   * state instead of rejecting, so callers can report it to the page.
   * @returns `{ ok, toolCount?, error? }`.
   */
  connectEntry(entry) {
    if (this.disposed) return Promise.resolve({ ok: false, error: '插件已卸载' })
    if (entry.state === 'connected' && entry.connection !== null) {
      return Promise.resolve({ ok: true, toolCount: entry.tools.length })
    }
    if (entry.connecting !== null) return entry.connecting
    const generation = ++entry.generation
    this.setState(entry, 'connecting', null)
    const connection = this.createConnection(entry.config)
    connection.onClose = (reason) => {
      if (entry.connection !== connection) return
      entry.connection = null
      entry.tools = []
      for (const subscriber of entry.subscribers.values()) this.disposeSubscriberTools(subscriber)
      this.setState(entry, 'error', reason)
      this.log()?.warn?.(`${PLUGIN}: ${entry.serverName}: ${reason}`)
    }
    const run = (async () => {
      try {
        await connection.open()
      } catch (error) {
        await connection.close()
        if (entry.generation !== generation || this.disposed) return { ok: false, cancelled: true }
        const message = messageOf(error)
        this.setState(entry, 'error', message)
        this.log()?.warn?.(`${PLUGIN}: ${entry.serverName}: ${message}`)
        return { ok: false, error: message }
      }
      if (entry.generation !== generation || this.disposed) {
        await connection.close()
        return { ok: false, cancelled: true }
      }
      entry.connection = connection
      entry.tools = connection.tools
      this.setState(entry, 'connected', null)
      for (const subscriber of [...entry.subscribers.values()]) this.registerToolsFor(entry, subscriber)
      this.log()?.info?.(`${PLUGIN}: connected ${entry.serverName} (${entry.tools.length} tools)`)
      return { ok: true, toolCount: entry.tools.length }
    })()
    const pending = run.finally(() => {
      if (entry.connecting === pending) entry.connecting = null
    })
    entry.connecting = pending
    return pending
  }

  /** Close one entry and unregister every tool it contributed. */
  async disconnectEntry(entry) {
    entry.generation += 1
    // Detach the in-flight attempt so a later enable can start a fresh one; the
    // attempt itself notices the generation change and closes what it opened.
    entry.connecting = null
    for (const subscriber of entry.subscribers.values()) this.disposeSubscriberTools(subscriber)
    const connection = entry.connection
    entry.connection = null
    entry.tools = []
    this.setState(entry, 'idle', null)
    if (connection !== null) await connection.close()
  }

  /** Drop an entry entirely and remove it from every agent binding. */
  async removeEntry(entry) {
    // Dispose while the subscriber map is still complete: that is what
    // unregisters the tools each subscribed agent currently holds.
    await this.disconnectEntry(entry)
    for (const binding of this.agentBindings.values()) {
      for (const [serverName, record] of [...binding.entries]) {
        if (record.entry === entry) binding.entries.delete(serverName)
      }
    }
    entry.subscribers.clear()
    this.entries.delete(entry.key)
  }

  /**
   * Bring one agent binding in line with its workspace's effective config:
   * subscribe to new servers, unsubscribe from removed or overridden ones.
   */
  async syncAgentBinding(binding) {
    const servers = await loadMergedServers(binding.workspacePath)
    const desired = new Map(servers.map(server => [server.serverName, server]))
    for (const serverName of [...binding.entries.keys()]) {
      if (!desired.has(serverName)) this.unbind(binding, serverName)
    }
    for (const server of servers) {
      const scope = server.scope === 'workspace'
        ? { kind: 'workspace', path: binding.workspacePath }
        : { kind: 'global' }
      const entry = this.ensureEntry(scope, server, binding.workspacePath)
      this.bind(binding, entry)
      if (!entry.blocked && !entry.config.disabled) void this.connectEntry(entry)
    }
  }

  /** Re-run the effective-config sync for every attached agent. */
  async syncAllBindings() {
    for (const binding of [...this.agentBindings.values()]) {
      try {
        await this.syncAgentBinding(binding)
      } catch (error) {
        this.log()?.warn?.(`${PLUGIN}: agent sync failed: ${messageOf(error)}`)
      }
    }
  }

  /** Attach one agent to the MCP servers of its workspace. */
  async attachAgent(agent) {
    if (this.disposed) return
    const agentId = String(agent.id)
    if (this.agentBindings.has(agentId)) return
    const workspacePath = await this.resolveAgentWorkspace(agent)
    if (workspacePath === null) return
    if (this.disposed) return
    const binding = { agent, workspacePath, entries: new Map() }
    this.agentBindings.set(agentId, binding)
    try {
      await this.syncAgentBinding(binding)
    } catch (error) {
      this.log()?.warn?.(`${PLUGIN}: agent ${agentId} attach failed: ${messageOf(error)}`)
    }
  }

  /** Detach one agent and close whatever no other agent or the user still holds. */
  detachAgent(agent) {
    const agentId = String(agent.id)
    const binding = this.agentBindings.get(agentId)
    if (binding === undefined) return
    this.agentBindings.delete(agentId)
    for (const { entry } of binding.entries.values()) {
      const subscriber = entry.subscribers.get(agentId)
      if (subscriber !== undefined) {
        this.disposeSubscriberTools(subscriber)
        entry.subscribers.delete(agentId)
      }
      if (entry.subscribers.size === 0 && !entry.pinned) void this.disconnectEntry(entry)
    }
    binding.entries.clear()
  }

  /**
   * Reconcile entry configs with the files (the page polls, so hand edits and
   * CLI writes become visible). Removed configs stop a connection nobody
   * subscribes to; a running agent keeps its connection until it detaches.
   */
  async reconcile() {
    const known = new Map()
    const collect = (scope, scopePath, servers) => {
      for (const server of servers) known.set(entryKey(scope, scopePath, server.serverName), server)
    }
    try {
      collect('global', null, (await loadScopeServers({ kind: 'global' })).servers)
    } catch {
      // A transient read failure must not tear connections down.
      return
    }
    const workspaces = this.listWorkspaces()
    const workspacePaths = new Set(workspaces.map(workspace => workspace.path))
    for (const workspace of workspaces) {
      try {
        collect('workspace', workspace.path, (await loadScopeServers({ kind: 'workspace', path: workspace.path })).servers)
      } catch {
        // Same as above: skip this workspace for this pass.
      }
    }
    for (const [key, entry] of [...this.entries]) {
      if (entry.scope.kind === 'workspace' && !workspacePaths.has(entry.scope.path)) continue
      const server = known.get(key)
      if (server === undefined) {
        if (entry.subscribers.size === 0 && !entry.pinned) await this.removeEntry(entry)
        continue
      }
      if (serverFingerprint(entry.config) === serverFingerprint(server)) continue
      const wasActive = entry.state === 'connected' || entry.state === 'connecting'
      entry.config = server
      if (entry.state !== 'idle') await this.disconnectEntry(entry)
      // A server whose config changed while agents still use it comes back on
      // the new config; a stopped one stays stopped until the page enables it.
      if (wasActive && entry.subscribers.size > 0 && !entry.blocked && !server.disabled) {
        void this.connectEntry(entry)
      }
    }
  }

  /** One scope's projection: its own configured servers plus their live state. */
  async buildScopeView(scope, workspace) {
    const loaded = await loadScopeServers(scope)
    const globalNames = scope.kind === 'workspace'
      ? new Set((await loadScopeServers({ kind: 'global' })).servers.map(server => server.serverName))
      : new Set()
    const effective = scope.kind === 'workspace'
      ? await loadMergedServers(scope.path)
      : loaded.servers.map(server => ({ ...server, scope: 'global' }))
    return {
      key: scope.kind === 'global' ? 'global' : `ws:${workspace?.id ?? scope.path}`,
      kind: scope.kind,
      title: scope.kind === 'global' ? '全局配置' : workspace?.title ?? scope.path,
      ...(scope.kind === 'workspace' ? { id: workspace?.id ?? scope.path, path: scope.path } : {}),
      configPath: loaded.path,
      servers: loaded.servers.map(server => this.serverView(scope, server, globalNames)),
      effectiveCount: effective.length,
      configuredCount: loaded.servers.length,
    }
  }

  /** One configured server plus the live state of its connection, if any. */
  serverView(scope, server, globalNames) {
    const key = entryKey(scope.kind, scope.kind === 'workspace' ? scope.path : null, server.serverName)
    const entry = this.entries.get(key)
    const state = entry?.state ?? 'idle'
    return {
      ...server,
      scope: scope.kind,
      state: state === 'idle' ? 'disconnected' : state,
      error: entry?.error ?? null,
      toolCount: entry?.tools.length ?? 0,
      overridesGlobal: scope.kind === 'workspace' && globalNames.has(server.serverName),
    }
  }

  /** The complete state the MCP page renders. */
  async snapshot() {
    await this.reconcile()
    const global = await this.buildScopeView({ kind: 'global' })
    const workspaces = []
    for (const workspace of this.listWorkspaces()) {
      workspaces.push(await this.buildScopeView({ kind: 'workspace', path: workspace.path }, workspace))
    }
    return { global, workspaces }
  }

  /** Resolve a page scope reference to a normalized scope plus workspace metadata. */
  async resolveScope(scopeRef) {
    if (scopeRef === undefined || scopeRef === null || scopeRef.kind === 'global' || scopeRef === 'global') {
      return { scope: { kind: 'global' }, workspace: undefined }
    }
    const workspaceId = scopeRef.workspaceId ?? scopeRef.id
    if (workspaceId !== undefined) {
      const workspace = this.listWorkspaces().find(candidate => candidate.id === String(workspaceId))
      if (workspace === undefined) throw new Error(`工作区不存在或已关闭：${String(workspaceId)}`)
      return { scope: { kind: 'workspace', path: workspace.path }, workspace }
    }
    if (typeof scopeRef.path === 'string' && scopeRef.path !== '') {
      const canonical = await canonicalPath(scopeRef.path)
      const workspace = this.workspaceForPath(canonical)
      return {
        scope: { kind: 'workspace', path: workspace?.path ?? canonical },
        workspace,
      }
    }
    throw new Error('缺少工作区标识')
  }

  /** Find one configured server in a normalized scope. */
  async findConfiguredServer(scope, serverName) {
    const loaded = await loadScopeServers(scope)
    return { path: loaded.path, server: loaded.servers.find(server => server.serverName === serverName) }
  }

  /**
   * User action: connect one configured server now and keep it connected.
   * A persisted `disabled: true` is cleared, because enabling is a decision
   * about future sessions as well.
   */
  async enable(scopeRef, serverName) {
    return await this.exclusive(async () => {
      const { scope, workspace } = await this.resolveScope(scopeRef)
      const loaded = await loadScopeServers(scope)
      const index = loaded.servers.findIndex(server => server.serverName === serverName)
      if (index < 0) throw new Error(`当前范围没有 MCP 服务器“${serverName}”`)
      const server = loaded.servers[index]
      if (server.disabled) {
        const next = { ...server, disabled: false }
        const all = loaded.servers.map((item, itemIndex) => itemIndex === index ? next : item)
        await writeConfigFile(loaded.path, { servers: all })
        server.disabled = false
      }
      const entry = this.ensureEntry(scope, server, workspace?.path ?? scope.path)
      entry.blocked = false
      entry.pinned = true
      await this.syncAllBindings()
      return await this.connectEntry(entry)
    })
  }

  /**
   * User action: close one connection. It stays closed (no reconnect from
   * agent lifecycle) until the page enables it again or the Host restarts.
   */
  async stop(scopeRef, serverName) {
    return await this.exclusive(async () => {
      const { scope, workspace } = await this.resolveScope(scopeRef)
      const key = entryKey(scope.kind, scope.kind === 'workspace' ? (workspace?.path ?? scope.path) : null, serverName)
      const entry = this.entries.get(key)
      if (entry === undefined) return { ok: true, changed: false }
      entry.blocked = true
      entry.pinned = false
      await this.disconnectEntry(entry)
      return { ok: true, changed: true }
    })
  }

  /** User action: remove one server from its scope file and close its connection. */
  async remove(scopeRef, serverName) {
    return await this.exclusive(async () => {
      const { scope } = await this.resolveScope(scopeRef)
      const loaded = await loadScopeServers(scope)
      const remaining = loaded.servers.filter(server => server.serverName !== serverName)
      if (remaining.length === loaded.servers.length) {
        throw new Error(`当前范围没有 MCP 服务器“${serverName}”`)
      }
      await writeConfigFile(loaded.path, { servers: remaining })
      const key = entryKey(scope.kind, scope.kind === 'workspace' ? scope.path : null, serverName)
      const entry = this.entries.get(key)
      if (entry !== undefined) await this.removeEntry(entry)
      await this.syncAllBindings()
      return { ok: true }
    })
  }

  /** User action: create or update one server entry in a scope file. */
  async save(scopeRef, serverInput, previousServerName) {
    return await this.exclusive(async () => {
      const { scope } = await this.resolveScope(scopeRef)
      const server = normalizeServerConfig(serverInput)
      const loaded = await loadScopeServers(scope)
      const collision = loaded.servers.find(candidate =>
        candidate.serverName === server.serverName && candidate.serverName !== previousServerName)
      if (collision !== undefined) throw new Error(`当前范围已存在同名 MCP 服务器“${server.serverName}”`)
      const next = loaded.servers.filter(candidate =>
        candidate.serverName !== previousServerName && candidate.serverName !== server.serverName)
      next.push(server)
      await writeConfigFile(loaded.path, { servers: next })
      const oldKey = previousServerName === undefined || previousServerName === server.serverName
        ? undefined
        : entryKey(scope.kind, scope.kind === 'workspace' ? scope.path : null, previousServerName)
      if (oldKey !== undefined) {
        const oldEntry = this.entries.get(oldKey)
        if (oldEntry !== undefined) await this.removeEntry(oldEntry)
      }
      const entry = this.ensureEntry(scope, server, scope.kind === 'workspace' ? scope.path : undefined)
      entry.blocked = false
      const wasActive = entry.state === 'connected' || entry.state === 'connecting'
      if (wasActive) await this.disconnectEntry(entry)
      await this.syncAllBindings()
      if (wasActive && !server.disabled) await this.connectEntry(entry)
      return { ok: true }
    })
  }

  /** Close every connection and unregister every contributed tool. */
  dispose() {
    this.disposed = true
    for (const binding of this.agentBindings.values()) {
      for (const { entry } of binding.entries.values()) {
        const subscriber = entry.subscribers.get(String(binding.agent.id))
        if (subscriber !== undefined) this.disposeSubscriberTools(subscriber)
        entry.subscribers.delete(String(binding.agent.id))
      }
    }
    this.agentBindings.clear()
    for (const entry of this.entries.values()) {
      entry.generation += 1
      for (const subscriber of entry.subscribers.values()) this.disposeSubscriberTools(subscriber)
      entry.subscribers.clear()
      const connection = entry.connection
      entry.connection = null
      entry.tools = []
      if (connection !== null) void connection.close()
    }
    this.entries.clear()
  }
}
