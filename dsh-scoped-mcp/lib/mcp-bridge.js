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
import { createHash } from 'node:crypto'

const MAX_PUBLIC_NAME_LENGTH = 64
const INVALID_NAME_CHARS = /[^A-Za-z0-9_-]/g
const HASH_LENGTH = 12

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

async function listAllTools(client) {
  const tools = []
  let cursor
  do {
    const result = await client.listTools(cursor ? { cursor } : undefined)
    tools.push(...result.tools)
    cursor = result.nextCursor
  } while (cursor)
  return tools
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

function createToolDefinition(config, client, tool) {
  const rawName = tool.name
  const publicName = publicToolName(config.serverName, rawName)
  return {
    name: publicName,
    description: tool.description ?? '',
    parameters: tool.inputSchema ?? { type: 'object', properties: {} },
    output: createOutput(rawName),
    async execute(args, exec) {
      const argsObj = (typeof args === 'object' && args !== null ? args : {})
      const result = await client.callTool(
        { name: rawName, arguments: argsObj },
        undefined,
        { signal: exec.signal, timeout: config.toolCallTimeoutMs },
      )
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

/**
 * Connect one MCP server and register its tools on a scoped ctx.tools.
 * @param ctx - agent-scoped Cordis context (agent.ctx).
 * @param config - normalized MCP server config.
 * @returns `{ dispose }`; dispose unregisters tools and closes the client.
 */
export async function startScopedServer(ctx, config) {
  const client = createClient(config)
  const transport = createTransport(config)
  const disposers = []
  try {
    await client.connect(transport)
    const tools = await listAllTools(client)
    for (const tool of tools) {
      disposers.push(ctx.tools.register(createToolDefinition(config, client, tool)))
    }
  } catch (error) {
    await client.close().catch(() => {})
    throw error
  }
  return {
    dispose() {
      for (const dispose of disposers.splice(0)) dispose()
      client.close().catch(() => {})
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
