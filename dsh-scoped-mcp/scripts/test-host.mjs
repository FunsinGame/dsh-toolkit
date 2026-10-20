/**
 * Host-half tests for dsh-scoped-mcp.
 *
 * Two layers:
 *   - the manager, driven by an in-process fake connection, covers scope
 *     precedence, agent tool registration, enable/stop, save/remove, and
 *     teardown;
 *   - one McpConnection against an in-memory SDK transport covers real
 *     connect / tools-list / tools-call behavior without spawning a process.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = await mkdtemp(join(tmpdir(), 'dsh-scoped-mcp-'))
const home = join(root, 'home')
const workspaceA = join(root, 'workspace-a')
const workspaceB = join(root, 'workspace-b')
process.env.DSH_HOME = home

const { ScopedMcpManager } = await import('../lib/manager.js')
const { loadMergedServers } = await import('../lib/config.js')
const { McpConnection, createToolDefinition, publicToolName } = await import('../lib/mcp-connection.js')
const { registerRoutes, ROUTE_STATE, ROUTE_ACTION } = await import('../lib/routes.js')

function fakeServerEntry(serverName, tag) {
  return [`  - serverName: ${serverName}`, '    transport: stdio', '    command: fake-command', '    env:', `      FAKE_MCP_TAG: ${tag}`].join('\n')
}

function configText(entries) {
  return `servers:\n${entries.join('\n')}\n`
}

function createContext(workspaces) {
  return {
    logger: { info() {}, warn() {}, error() {} },
    get(name) {
      if (name === 'workspaceRegistry') return { list: () => workspaces }
      return undefined
    },
    agents: { list: () => [] },
  }
}

function createAgent(id, cwd) {
  const tools = new Map()
  return {
    id,
    session: { header: { cwd } },
    ctx: {
      tools: {
        register(definition) {
          tools.set(definition.name, definition)
          return () => {
            if (tools.get(definition.name) === definition) tools.delete(definition.name)
          }
        },
      },
    },
    toolNames: () => [...tools.keys()].sort(),
    tool: name => tools.get(name),
  }
}

/** In-process stand-in for one MCP connection; records tags and lifetimes. */
function createFakeConnection(config) {
  const tag = config.env?.FAKE_MCP_TAG ?? ''
  const stats = { opens: 0, closes: 0 }
  return {
    config,
    stats,
    tools: [],
    onClose: null,
    closed: false,
    async open() {
      if (stats.closes > stats.opens) throw new Error('connection is closed')
      stats.opens += 1
      this.tools = [{
        name: 'echo',
        description: 'Echo the requested text back',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
      }]
    },
    async callTool(_rawName, args) {
      return { content: [{ type: 'text', text: `echo:${args?.text ?? ''}:${tag}` }] }
    },
    async close() {
      stats.closes += 1
      this.closed = true
    },
  }
}

const connections = new Map()
const connectionFactory = (config) => {
  const connection = createFakeConnection(config)
  connections.set(config.serverName, connection)
  return connection
}

const sleep = ms => new Promise((resolve) => { setTimeout(resolve, ms) })

async function waitFor(check, label, timeoutMs = 10_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await check()) return
    await sleep(20)
  }
  throw new Error(`timed out waiting for ${label}`)
}

const workspaceList = [
  { id: 'a', title: '工作区 A', path: workspaceA },
  { id: 'b', title: '工作区 B', path: workspaceB },
]

let manager
const agentA = createAgent('agent-a', workspaceA)
const agentB = createAgent('agent-b', workspaceB)

test.before(async () => {
  await mkdir(home, { recursive: true })
  await mkdir(join(workspaceA, '.dsh'), { recursive: true })
  await mkdir(join(workspaceB, '.dsh'), { recursive: true })
  await writeFile(join(home, 'mcp-scope.yml'), configText([
    fakeServerEntry('shared', 'global'),
    fakeServerEntry('globalOnly', 'global-only'),
  ]), 'utf8')
  await writeFile(join(workspaceA, '.dsh', 'mcp.yml'), configText([
    fakeServerEntry('shared', 'workspace'),
    fakeServerEntry('onlyA', 'only-a'),
  ]), 'utf8')
  await writeFile(join(workspaceB, '.dsh', 'mcp.yml'), configText([]), 'utf8')
  manager = new ScopedMcpManager(createContext(workspaceList), { connectionFactory })
})

test.after(async () => {
  manager?.dispose()
  await rm(root, { recursive: true, force: true })
})

test('merge precedence: a workspace entry replaces the same global name', async () => {
  const merged = await loadMergedServers(workspaceA)
  const shared = merged.find(server => server.serverName === 'shared')
  assert.equal(shared.scope, 'workspace')
  assert.equal(shared.env.FAKE_MCP_TAG, 'workspace')
  assert.ok(merged.some(server => server.serverName === 'globalOnly'))
  assert.ok(merged.some(server => server.serverName === 'onlyA'))

  const mergedB = await loadMergedServers(workspaceB)
  assert.equal(mergedB.find(server => server.serverName === 'shared').scope, 'global')
})

test('agents receive the effective tools of their workspace', async () => {
  await manager.attachAgent(agentA)
  await manager.attachAgent(agentB)

  await waitFor(() => agentA.tool('mcp__shared__echo') !== undefined, 'workspace A shared tool')
  await waitFor(() => agentA.tool('mcp__onlyA__echo') !== undefined, 'workspace A onlyA tool')
  await waitFor(() => agentA.tool('mcp__globalOnly__echo') !== undefined, 'workspace A global tool')
  await waitFor(() => agentB.tool('mcp__shared__echo') !== undefined, 'workspace B shared tool')

  const sharedA = agentA.tool('mcp__shared__echo')
  const valueA = await sharedA.execute({ text: 'ping' }, {})
  assert.equal(sharedA.output.render({}, valueA)[0].text, 'echo:ping:workspace')

  const sharedB = agentB.tool('mcp__shared__echo')
  const valueB = await sharedB.execute({ text: 'ping' }, {})
  assert.equal(sharedB.output.render({}, valueB)[0].text, 'echo:ping:global')

  const snapshot = await manager.snapshot()
  assert.equal(snapshot.workspaces.length, 2)
  const viewA = snapshot.workspaces.find(view => view.id === 'a')
  const viewB = snapshot.workspaces.find(view => view.id === 'b')
  assert.equal(viewA.configuredCount, 2)
  assert.equal(viewA.effectiveCount, 3)
  assert.equal(viewA.servers.find(server => server.serverName === 'shared').overridesGlobal, true)
  assert.equal(viewB.configuredCount, 0)
  assert.equal(viewB.effectiveCount, 2)
  assert.equal(viewB.servers.length, 0)
  assert.equal(snapshot.global.servers.find(server => server.serverName === 'shared').state, 'connected')
  assert.equal(snapshot.global.servers.find(server => server.serverName === 'globalOnly').state, 'connected')
})

test('stop closes one scope connection without disturbing the other scope', async () => {
  const result = await manager.stop({ kind: 'workspace', workspaceId: 'a' }, 'shared')
  assert.equal(result.changed, true)
  await waitFor(() => agentA.tool('mcp__shared__echo') === undefined, 'workspace A shared tool removed')
  assert.ok(agentB.tool('mcp__shared__echo'), 'workspace B keeps its own shared connection')

  const snapshot = await manager.snapshot()
  const viewA = snapshot.workspaces.find(view => view.id === 'a')
  assert.equal(viewA.servers.find(server => server.serverName === 'shared').state, 'disconnected')

  const enabled = await manager.enable({ kind: 'workspace', workspaceId: 'a' }, 'shared')
  assert.equal(enabled.ok, true)
  await waitFor(() => agentA.tool('mcp__shared__echo') !== undefined, 'workspace A shared tool restored')
})

test('removing a config deletes it from the file and unregisters its tools', async () => {
  await manager.remove({ kind: 'workspace', workspaceId: 'a' }, 'onlyA')
  await waitFor(() => agentA.tool('mcp__onlyA__echo') === undefined, 'onlyA tool removed')
  const text = await readFile(join(workspaceA, '.dsh', 'mcp.yml'), 'utf8')
  assert.ok(!text.includes('onlyA'))
  const snapshot = await manager.snapshot()
  assert.equal(snapshot.workspaces.find(view => view.id === 'a').configuredCount, 1)
})

test('saving a new server connects it for an already running agent', async () => {
  await manager.save({ kind: 'workspace', workspaceId: 'a' }, {
    serverName: 'added',
    transport: 'stdio',
    command: 'fake-command',
    env: { FAKE_MCP_TAG: 'added' },
  })
  await waitFor(() => agentA.tool('mcp__added__echo') !== undefined, 'added tool registered')
  const definition = agentA.tool('mcp__added__echo')
  const value = await definition.execute({ text: 'ok' }, {})
  assert.equal(definition.output.render({}, value)[0].text, 'echo:ok:added')
})

test('a global connection can be enabled and stopped from the global scope', async () => {
  manager.detachAgent(agentA)
  manager.detachAgent(agentB)
  await sleep(50)

  const enabled = await manager.enable({ kind: 'global' }, 'globalOnly')
  assert.equal(enabled.ok, true)
  let snapshot = await manager.snapshot()
  assert.equal(snapshot.global.servers.find(server => server.serverName === 'globalOnly').state, 'connected')

  await manager.stop({ kind: 'global' }, 'globalOnly')
  snapshot = await manager.snapshot()
  assert.equal(snapshot.global.servers.find(server => server.serverName === 'globalOnly').state, 'disconnected')
})

test('a connection reports a failed handshake without throwing out of enable', async () => {
  manager.detachAgent(agentA)
  const failing = new ScopedMcpManager(createContext(workspaceList), {
    connectionFactory: (config) => ({
      config,
      tools: [],
      onClose: null,
      async open() { throw new Error('boom') },
      async callTool() { throw new Error('unreachable') },
      async close() {},
    }),
  })
  const result = await failing.enable({ kind: 'global' }, 'globalOnly')
  assert.equal(result.ok, false)
  assert.equal(result.error, 'boom')
  const snapshot = await failing.snapshot()
  assert.equal(snapshot.global.servers.find(server => server.serverName === 'globalOnly').state, 'error')
  failing.dispose()
})

test('McpConnection talks to an in-memory MCP server', async () => {
  const tag = 'memory'
  const server = new Server({ name: 'in-memory', version: '1.0.0' }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
      name: 'echo',
      description: 'Echo text',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    }],
  }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => ({
    content: [{ type: 'text', text: `echo:${request.params.arguments?.text ?? ''}:${tag}` }],
  }))
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)

  const connection = new McpConnection({
    serverName: 'memory',
    transport: 'stdio',
    command: 'unused',
    args: [],
    env: {},
    cwd: '',
    toolCallTimeoutMs: 5_000,
  }, { createTransport: () => clientTransport })
  await connection.open()
  assert.equal(connection.tools.length, 1)
  const definition = createToolDefinition(connection, connection.tools[0])
  assert.equal(definition.name, 'mcp__memory__echo')
  const value = await definition.execute({ text: 'hi' }, {})
  assert.equal(definition.output.render({}, value)[0].text, 'echo:hi:memory')
  await connection.close()
  await server.close()
})

test('McpConnection connects to a real stdio MCP server process', async () => {
  const connection = new McpConnection({
    serverName: 'stdio-fake',
    transport: 'stdio',
    command: process.execPath,
    args: [join(here, 'fake-mcp-server.mjs')],
    env: { FAKE_MCP_TAG: 'stdio' },
    cwd: here,
    toolCallTimeoutMs: 10_000,
  })
  await connection.open()
  assert.equal(connection.tools.length, 1)
  const definition = createToolDefinition(connection, connection.tools[0])
  assert.equal(definition.name, 'mcp__stdio-fake__echo')
  const value = await definition.execute({ text: 'real' }, {})
  assert.equal(definition.output.render({}, value)[0].text, 'echo:real:stdio')
  await connection.close()
})

test('public tool names stay within the model-facing budget', () => {
  assert.equal(publicToolName('github', 'create-issue'), 'mcp__github__create-issue')
  const long = publicToolName('server', 'a'.repeat(80))
  assert.ok(long.length <= 64)
  assert.match(long, /^[A-Za-z0-9_-]+$/)
})

test('apply wires the agent lifecycle and the host routes', async () => {
  const registered = []
  const listeners = new Map()
  const child = {
    logger: { warn() {} },
    connection: { requestRejection: () => undefined },
    effect(factory) {
      const dispose = factory()
      return () => { dispose?.() }
    },
    webServer: {
      register(route) {
        registered.push(route.path)
        return () => {}
      },
    },
  }
  const ctx = {
    logger: { warn() {} },
    agents: { list: () => [] },
    effect() { return () => {} },
    on(event, listener) {
      listeners.set(event, listener)
      return () => {}
    },
    inject(_deps, callback) { callback(child) },
    get() { return undefined },
  }
  const module = await import('../lib/index.js')
  assert.equal(module.name, 'dsh-scoped-mcp')
  assert.deepEqual(module.inject, ['agents'])
  module.apply(ctx)
  assert.ok(listeners.has('agent/created'))
  assert.ok(listeners.has('agent/disposed'))
  assert.deepEqual(registered.sort(), ['/dsh-scoped-mcp/action', '/dsh-scoped-mcp/state'])
})

test('the JSON API serves state and dispatches actions behind the trust fence', async () => {
  const handlers = new Map()
  let rejection
  const ctx = {
    logger: { warn() {} },
    connection: { requestRejection: () => rejection },
    webServer: {
      register({ path, handler }) {
        handlers.set(path, handler)
        return () => { handlers.delete(path) }
      },
    },
  }
  const calls = []
  const api = {
    snapshot: async () => ({ marker: 'state' }),
    enable: async (scope, name) => { calls.push(['enable', scope, name]); return { ok: true, toolCount: 2 } },
    stop: async (scope, name) => { calls.push(['stop', scope, name]); return { ok: true } },
    remove: async (scope, name) => { calls.push(['remove', scope, name]); return { ok: true } },
    save: async (scope, server, previous) => { calls.push(['save', scope, server.serverName, previous]); return { ok: true } },
  }
  const dispose = registerRoutes(ctx, api)

  const makeRequest = (method, url, { body, contentType } = {}) => ({
    method,
    url,
    headers: contentType === undefined ? {} : { 'content-type': contentType },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(body)
    },
  })
  const makeResponse = () => {
    const state = { statusCode: 200, body: '' }
    return {
      get statusCode() { return state.statusCode },
      set statusCode(value) { state.statusCode = value },
      setHeader() {},
      end(value) { state.body = value === undefined ? '' : String(value) },
      state,
    }
  }

  const okState = makeResponse()
  await handlers.get(ROUTE_STATE)(makeRequest('GET', ROUTE_STATE), okState)
  assert.equal(okState.state.statusCode, 200)
  assert.deepEqual(JSON.parse(okState.state.body), { ok: true, state: { marker: 'state' } })

  rejection = 401
  const denied = makeResponse()
  await handlers.get(ROUTE_STATE)(makeRequest('GET', ROUTE_STATE), denied)
  assert.equal(denied.state.statusCode, 401)
  rejection = undefined

  const enabled = makeResponse()
  await handlers.get(ROUTE_ACTION)(
    makeRequest('POST', ROUTE_ACTION, {
      contentType: 'application/json',
      body: JSON.stringify({ action: 'enable', scope: { kind: 'global' }, serverName: 'github' }),
    }),
    enabled,
  )
  assert.equal(enabled.state.statusCode, 200)
  assert.equal(JSON.parse(enabled.state.body).connected, true)
  assert.deepEqual(calls.at(-1), ['enable', { kind: 'global' }, 'github'])

  const wrongType = makeResponse()
  await handlers.get(ROUTE_ACTION)(makeRequest('POST', ROUTE_ACTION, { body: '{}' }), wrongType)
  assert.equal(wrongType.state.statusCode, 415)

  const unknown = makeResponse()
  await handlers.get(ROUTE_ACTION)(
    makeRequest('POST', ROUTE_ACTION, { contentType: 'application/json', body: JSON.stringify({ action: 'dance', scope: { kind: 'global' } }) }),
    unknown,
  )
  assert.equal(unknown.state.statusCode, 400)

  dispose()
})
