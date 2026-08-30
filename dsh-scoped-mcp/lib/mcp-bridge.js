/**
 * dsh-scoped-mcp MCP bridge.
 *
 * Creates an MCP client for one server config, lists its tools, and registers
 * them on the caller's (agent-scoped) `ctx.tools`. The public tool name is the
 * same `mcp__<serverName>__<rawName>` convention used by dsh-mcp-client.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { createHash } from 'node:crypto'
import { z } from 'zod'

const MAX_PUBLIC_NAME_LENGTH = 64
const INVALID_NAME_CHARS = /[^A-Za-z0-9_-]/g
const HASH_LENGTH = 12

/** Raw tools/call result: the bridge owns JSON-value validation after transport. */
const RawCallToolResultSchema = z.record(z.string(), z.unknown())

/** Errors that indicate the current MCP connection/session is unusable and a fresh connection may recover. */
const RETRYABLE_TRANSPORT_PATTERN = /connection closed|client closed|transport closed|ECONNREFUSED|ECONNRESET|socket hang up|fetch failed|network error/i

export function publicToolName(serverName, rawName) {
  const joined = `mcp__${serverName}__${rawName}`
  const normalized = joined.replace(INVALID_NAME_CHARS, '_')
  if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return normalized
  const hash = createHash('sha256').update(`${serverName}\0${rawName}`).digest('hex').slice(0, HASH_LENGTH)
  return `${normalized.slice(0, MAX_PUBLIC_NAME_LENGTH - HASH_LENGTH - 1)}_${hash}`
}

function createTransport(config) {
  if (config.transport === 'stdio') {
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.env },
      ...(config.cwd ? { cwd: config.cwd } : {}),
    })
  }
  return new StreamableHTTPClientTransport(
    new URL(config.url),
    { requestInit: { headers: config.headers } },
  )
}

function createClient(config) {
  return new Client(
    { name: 'dsh-scoped-mcp', version: '0.1.0' },
    { capabilities: {} },
  )
}

/** List tools without caching SDK output validators that `client.listTools` installs. */
async function listAllTools(client) {
  const tools = []
  let cursor
  do {
    const result = await client.request(
      { method: 'tools/list', ...cursor === undefined ? {} : { params: { cursor } } },
      ListToolsResultSchema,
    )
    tools.push(...result.tools)
    cursor = result.nextCursor
  } while (cursor)
  return tools
}

/** Call a tool without the SDK's strict result-schema/output-schema validation. */
async function callToolUncached(client, rawName, args, exec, config) {
  return client.request(
    { method: 'tools/call', params: { name: rawName, arguments: args } },
    RawCallToolResultSchema,
    { signal: exec.signal, timeout: config.toolCallTimeoutMs },
  )
}

function extractText(mcpContent, toolName) {
  const parts = []
  for (const value of mcpContent) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      parts.push('[unsupported content type: unknown]')
      continue
    }
    switch (value.type) {
      case 'text':
        if (value.text !== undefined) parts.push(value.text)
        break
      case 'image':
        parts.push(`[image: ${value.mimeType ?? 'unknown'}, content discarded]`)
        break
      case 'audio':
        parts.push(`[audio: ${value.mimeType ?? 'unknown'}, content discarded]`)
        break
      case 'resource':
      case 'resource_link':
        parts.push('[resource: content discarded]')
        break
      default:
        parts.push(`[unsupported content type: ${value.type}]`)
    }
  }
  return parts.join('\n') || `(${toolName} returned no text content)`
}

function createOutput(rawName) {
  return {
    schema: {
      type: 'object',
      properties: {
        content: { type: 'array', items: {} },
        structuredContent: {},
      },
      required: ['content'],
      additionalProperties: false,
    },
    render(_args, value) {
      const content = value && Array.isArray(value.content) ? value.content : []
      return [{ type: 'text', text: extractText(content, rawName) }]
    },
  }
}

function createToolDefinition(config, connection, tool) {
  const rawName = tool.name
  const publicName = publicToolName(config.serverName, rawName)
  const taskRequired = tool.execution?.taskSupport === 'required'
  return {
    name: publicName,
    description: tool.description ?? '',
    parameters: tool.inputSchema ?? { type: 'object', properties: {} },
    output: createOutput(rawName),
    async execute(args, exec) {
      if (taskRequired) {
        throw new Error(`Tool "${rawName}" requires task-based execution, which this bridge does not support`)
      }
      const argsObj = (typeof args === 'object' && args !== null ? args : {})
      const result = await connection.callTool(rawName, argsObj, exec)
      if (!Array.isArray(result.content)) {
        const rendered = 'toolResult' in result
          ? JSON.stringify(result.toolResult)
          : '(no output)'
        const text = typeof rendered === 'string' ? rendered : '(no output)'
        if (result.isError === true) throw new Error(text)
        return {
          content: [{ type: 'text', text }],
          ...(result.structuredContent !== undefined ? { structuredContent: result.structuredContent } : {}),
        }
      }
      const text = extractText(result.content, rawName)
      if (result.isError === true) throw new Error(text)
      return {
        content: result.content,
        ...(result.structuredContent !== undefined ? { structuredContent: result.structuredContent } : {}),
      }
    },
  }
}

function isRetryableTransportError(error) {
  if (error && typeof error === 'object' && typeof error.code === 'number' && error.code >= 500 && error.code < 600) {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return RETRYABLE_TRANSPORT_PATTERN.test(message)
}

/**
 * One live MCP connection for a scoped server.
 *
 * Tool definitions close over this connection, not a fixed Client, so a stale
 * HTTP session or a closed transport can be replaced by a fresh connection
 * without re-registering every tool. Tool calls retry once when the current
 * connection/session looks unusable; the retry opens a new MCP session.
 */
class ScopedMcpConnection {
  constructor(config) {
    this.config = config
    this.ctx = null
    this.client = null
    this.opening = null
    this.toolDisposers = []
    this.reconnectTimer = null
    this.reconnectAttempts = 0
    this.disposed = false
  }

  async start(ctx) {
    this.ctx = ctx
    await this.open()
  }

  open() {
    if (this.disposed) return Promise.resolve()
    if (this.opening) return this.opening
    this.opening = this.doOpen().finally(() => {
      this.opening = null
    })
    return this.opening
  }

  async doOpen() {
    const client = createClient(this.config)
    const transport = createTransport(this.config)
    this.client = client
    client.onclose = () => {
      if (this.disposed || this.client !== client) return
      this.client = null
      this.scheduleReconnect()
    }
    try {
      await client.connect(transport)
      if (this.disposed || this.client !== client) {
        await client.close().catch(() => {})
        return
      }
      const tools = await listAllTools(client)
      if (this.disposed || this.client !== client) {
        await client.close().catch(() => {})
        return
      }
      if (this.toolDisposers.length === 0) {
        for (const tool of tools) {
          this.toolDisposers.push(this.ctx.tools.register(createToolDefinition(this.config, this, tool)))
        }
      }
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
      this.reconnectAttempts = 0
    } catch (error) {
      if (this.client === client) this.client = null
      await client.close().catch(() => {})
      throw error
    }
  }

  async reconnect() {
    if (this.disposed) return
    const old = this.client
    this.client = null
    if (old) await old.close().catch(() => {})
    await this.open()
  }

  scheduleReconnect() {
    if (this.disposed || this.reconnectTimer || this.config.reconnect?.enabled === false) return
    const maxAttempts = this.config.reconnect?.maxAttempts ?? 10
    if (this.reconnectAttempts >= maxAttempts) {
      this.ctx?.logger?.error?.(`dsh-scoped-mcp: giving up reconnecting ${this.config.serverName} after ${maxAttempts} attempts`)
      return
    }
    const initialDelayMs = this.config.reconnect?.initialDelayMs ?? 500
    const maxDelayMs = this.config.reconnect?.maxDelayMs ?? 30_000
    const delay = Math.min(maxDelayMs, initialDelayMs * 2 ** this.reconnectAttempts)
    this.reconnectAttempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.reconnect().catch((error) => {
        this.ctx?.logger?.warn?.(`dsh-scoped-mcp: reconnect failed for ${this.config.serverName}: ${error?.message ?? error}`)
        this.scheduleReconnect()
      })
    }, delay)
    this.reconnectTimer.unref?.()
  }

  async callTool(rawName, args, exec) {
    if (!this.client && !this.disposed && this.config.reconnect?.enabled !== false) {
      await this.reconnect()
    }
    const client = this.requireClient()
    try {
      return await callToolUncached(client, rawName, args, exec, this.config)
    } catch (error) {
      if (this.disposed || !isRetryableTransportError(error) || this.config.reconnect?.enabled === false) throw error
      try {
        await this.reconnect()
      } catch {
        // Surface the original transport error when the fresh connection also fails.
        throw error
      }
      if (!this.client) throw error
      return await callToolUncached(this.client, rawName, args, exec, this.config)
    }
  }

  requireClient() {
    if (!this.client) {
      throw new Error(`MCP server "${this.config.serverName}" is not connected`)
    }
    return this.client
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    for (const dispose of this.toolDisposers.splice(0)) {
      try {
        dispose()
      } catch {
        // A failing disposer must not prevent the remaining tools from unloading.
      }
    }
    const client = this.client
    this.client = null
    if (client) client.close().catch(() => {})
  }
}

/**
 * Connect one MCP server and register its tools on a scoped ctx.tools.
 * @param ctx - agent-scoped Cordis context (agent.ctx).
 * @param config - normalized MCP server config.
 * @returns `{ dispose }`; dispose unregisters tools and closes the client.
 */
export async function startScopedServer(ctx, config) {
  const connection = new ScopedMcpConnection(config)
  try {
    await connection.start(ctx)
  } catch (error) {
    connection.dispose()
    throw error
  }
  return {
    dispose() {
      connection.dispose()
    },
  }
}

/**
 * Connect, list tools, and disconnect. Used by the CLI `test` command.
 * @param config - normalized MCP server config.
 * @returns `{ ok, tools, error? }`.
 */
export async function probeServer(config) {
  const client = createClient(config)
  const transport = createTransport(config)
  try {
    await client.connect(transport)
    const tools = await listAllTools(client)
    await client.close()
    return { ok: true, tools: tools.map((tool) => ({ name: tool.name, description: tool.description })) }
  } catch (error) {
    await client.close().catch(() => {})
    return { ok: false, error: error?.message ?? String(error) }
  }
}
