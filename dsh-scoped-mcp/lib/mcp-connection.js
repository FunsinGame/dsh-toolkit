/**
 * dsh-scoped-mcp MCP connection.
 *
 * One instance owns one live MCP client (stdio or Streamable HTTP) plus the
 * tool list discovered from it. The scoped manager creates connections on
 * demand, shares each one with every agent in the matching scope, and closes
 * it when the user stops it or the last interested agent goes away.
 *
 * Public tool names use the same `mcp__<serverName>__<rawName>` convention as
 * `@deepseek-ai/dsh-mcp-client`, so a server configured here and there is
 * recognizable in a conversation.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { createHash } from 'node:crypto'
import { z } from 'zod'

const PLUGIN_VERSION = '0.3.0'
const MAX_PUBLIC_NAME_LENGTH = 64
const INVALID_NAME_CHARS = /[^A-Za-z0-9_-]/g
const HASH_LENGTH = 12

/** Default ceiling for the connect + initial `tools/list` handshake. */
export const CONNECT_TIMEOUT_MS = 20_000

/** Raw tools/call result: the bridge owns JSON-value validation after transport. */
const RawCallToolResultSchema = z.record(z.string(), z.unknown())

/**
 * Public, model-facing tool name for one server tool. Names that already fit
 * the budget are used unchanged; anything else is normalized and suffixed with
 * a short hash so two different raw names never collide.
 * @param serverName - configured server name.
 * @param rawName - tool name as reported by the MCP server.
 */
export function publicToolName(serverName, rawName) {
  const joined = `mcp__${serverName}__${rawName}`
  const normalized = joined.replace(INVALID_NAME_CHARS, '_')
  if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return normalized
  const hash = createHash('sha256').update(`${serverName}\0${rawName}`).digest('hex').slice(0, HASH_LENGTH)
  return `${normalized.slice(0, MAX_PUBLIC_NAME_LENGTH - HASH_LENGTH - 1)}_${hash}`
}

/**
 * Resolve with `promise`, or reject with a timeout error after `ms`.
 * @param promise - work to bound.
 * @param ms - deadline in milliseconds.
 * @param label - message used by the timeout error.
 */
function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { reject(new Error(`${label}（${Math.round(ms / 1000)} 秒）`)) }, ms)
    timer.unref?.()
  })
  return Promise.race([promise, timeout]).finally(() => { clearTimeout(timer) })
}

/** One transport for one normalized server config. */
function createTransport(config) {
  if (config.transport === 'stdio') {
    return new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: { ...process.env, ...(config.env ?? {}) },
      ...(config.cwd ? { cwd: config.cwd } : {}),
    })
  }
  return new StreamableHTTPClientTransport(
    new URL(config.url),
    { requestInit: { headers: config.headers ?? {} } },
  )
}

/** A fresh SDK client for one server. */
function createClient() {
  return new Client({ name: 'dsh-scoped-mcp', version: PLUGIN_VERSION }, { capabilities: {} })
}

/** List every tool page without installing SDK output-schema validators. */
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

/** Flatten MCP content blocks to the model-facing text this bridge supports. */
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

/** The canonical output declaration shared by every bridged tool. */
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

/**
 * Tool definition registered on an agent's scoped tool registry. Execution
 * goes through the shared connection, so one connection serves every agent
 * subscribed to this scope.
 * @param connection - owning connection.
 * @param tool - raw MCP tool descriptor.
 */
export function createToolDefinition(connection, tool) {
  const rawName = tool.name
  const publicName = publicToolName(connection.config.serverName, rawName)
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
      return await connection.callTool(rawName, args, exec)
    },
  }
}

/** One live MCP connection. `open()` is idempotent until `close()`. */
export class McpConnection {
  /**
   * @param config - normalized server config.
   */
  /**
   * @param config - normalized server config.
   * @param options - test seam: `createTransport()` returns the SDK transport
   *   to use instead of deriving one from `config`.
   */
  constructor(config, options = {}) {
    this.config = config
    this.createTransport = options.createTransport ?? (() => createTransport(config))
    this.client = null
    this.tools = []
    this.instructions = ''
    this.closed = false
    /** Called when an established transport closes without `close()` being asked. */
    this.onClose = null
  }

  /** Connect and discover tools; throws on failure after closing the transport. */
  async open() {
    if (this.client) return
    const client = createClient()
    const transport = this.createTransport()
    // Installed before connect: a transport lost right after the handshake must
    // still report through onClose instead of looking connected forever.
    client.onclose = () => {
      if (this.closed || this.client !== client) return
      this.client = null
      this.tools = []
      this.onClose?.('MCP 连接已断开')
    }
    try {
      await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, '连接 MCP 服务器超时')
      const tools = await withTimeout(listAllTools(client), CONNECT_TIMEOUT_MS, '获取 MCP 工具列表超时')
      if (this.closed) {
        await client.close().catch(() => {})
        return
      }
      this.client = client
      this.tools = tools
      try {
        this.instructions = client.getInstructions?.()?.trimEnd() ?? ''
      } catch {
        // Instructions are optional metadata; a client without them is still usable.
        this.instructions = ''
      }
    } catch (error) {
      await client.close().catch(() => {})
      throw error
    }
  }

  /** Call one raw MCP tool through the live client. */
  async callTool(rawName, args, exec) {
    const client = this.client
    if (!client) throw new Error(`MCP 服务器 "${this.config.serverName}" 未连接`)
    const argsObject = typeof args === 'object' && args !== null ? args : {}
    const result = await client.request(
      { method: 'tools/call', params: { name: rawName, arguments: argsObject } },
      RawCallToolResultSchema,
      { signal: exec?.signal, timeout: this.config.toolCallTimeoutMs },
    )
    if (!Array.isArray(result.content)) {
      const rendered = 'toolResult' in result ? JSON.stringify(result.toolResult) : '(no output)'
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
  }

  /** Close the transport; safe to call repeatedly and after a failed `open()`. */
  async close() {
    this.closed = true
    const client = this.client
    this.client = null
    this.tools = []
    if (!client) return
    await withTimeout(client.close(), 5_000, '关闭 MCP 连接超时').catch(() => {})
  }
}

/**
 * Connect, list tools, and disconnect. Used by the CLI `test` command.
 * @param config - normalized server config.
 * @returns `{ ok, tools, error? }`.
 */
export async function probeServer(config) {
  const connection = new McpConnection(config)
  try {
    await connection.open()
    return {
      ok: true,
      tools: connection.tools.map(tool => ({ name: tool.name, description: tool.description })),
    }
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error) }
  } finally {
    await connection.close()
  }
}
