#!/usr/bin/env node
/**
 * dsh-scoped-mcp CLI.
 *
 * Manages global (~/.dsh/mcp-scope.yml) and workspace (<workspace>/.dsh/mcp.yml)
 * MCP server configs. The host plugin consumes the same files at runtime.
 */
import {
  globalConfigPath,
  loadConfigFile,
  loadMergedServers,
  normalizeScope,
  normalizeServerConfig,
  parseKeyValuePairs,
  workspaceConfigPath,
  writeConfigFile,
} from './config.js'
import { probeServer } from './mcp-bridge.js'

function usage() {
  console.log(`dsh-scoped-mcp — workspace-scoped MCP manager for DSH

Usage:
  dsh-scoped-mcp list [--scope global|PATH] [--json]
  dsh-scoped-mcp add --scope global|PATH --name <serverName> --stdio --command <cmd>
                      [--args <arg> ...] [--env KEY=VALUE ...] [--cwd <path>]
                      [--timeout <ms>] [--fail-on-startup] [--no-reconnect]
  dsh-scoped-mcp add --scope global|PATH --name <serverName> --http --url <url>
                      [--header KEY=VALUE ...] [--timeout <ms>] [--fail-on-startup]
                      [--no-reconnect]
  dsh-scoped-mcp remove --scope global|PATH --name <serverName> [--yes]
  dsh-scoped-mcp enable|disable --scope global|PATH --name <serverName>
  dsh-scoped-mcp test --scope global|PATH --name <serverName>

Scope:
  global              ~/.dsh/mcp-scope.yml
  PATH                <PATH>/.dsh/mcp.yml (workspace server overrides global by serverName)
`)
}

function fail(message) {
  console.error(`dsh-scoped-mcp: ${message}`)
  process.exitCode = 1
}

function parseScopeFromArgs(args) {
  let scope
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--scope') {
      i += 1
      if (i >= args.length) throw new Error('--scope requires a value')
      scope = args[i]
    }
  }
  return normalizeScope(scope)
}

async function scopeConfig(scope) {
  const normalized = scope && typeof scope === 'object' && scope.kind !== undefined
    ? scope
    : normalizeScope(scope)
  const path = normalized.kind === 'global' ? globalConfigPath() : workspaceConfigPath(normalized.path)
  const config = await loadConfigFile(path)
  return { normalized, path, config }
}

function findServer(servers, name) {
  return servers.find((server) => server.serverName === name)
}

async function commandList(args) {
  const json = args.includes('--json')
  const scopeArg = (() => {
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === '--scope') return args[i + 1]
    }
    return undefined
  })()
  const normalized = normalizeScope(scopeArg)
  if (normalized.kind === 'global') {
    const { config } = await scopeConfig(normalized)
    if (json) {
      console.log(JSON.stringify(config.servers, null, 2))
      return
    }
    if (config.servers.length === 0) {
      console.log('No MCP servers in global scope.')
      return
    }
    for (const server of config.servers) {
      console.log(formatServer(server, 'global'))
    }
    return
  }
  const servers = await loadMergedServers(normalized.path)
  if (json) {
    console.log(JSON.stringify(servers, null, 2))
    return
  }
  if (servers.length === 0) {
    console.log(`No MCP servers for workspace ${normalized.path}.`)
    return
  }
  for (const server of servers) {
    console.log(formatServer(server, server.scope ?? 'workspace'))
  }
}

function formatServer(server, scope) {
  const state = server.disabled ? 'disabled' : 'enabled'
  const target = server.transport === 'stdio' ? server.command : server.url
  return `${state.padEnd(9)} ${scope.padEnd(9)} ${server.serverName.padEnd(24)} ${server.transport.padEnd(16)} ${target}`
}

async function commandAdd(args) {
  const scope = normalizeScope((() => {
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === '--scope') return args[i + 1]
    }
    return undefined
  })())
  const input = { reconnect: {} }
  const env = []
  const headers = []
  const argv = []
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--scope') {
      i += 1
    } else if (arg === '--name') {
      i += 1
      input.serverName = args[i]
    } else if (arg === '--stdio') {
      input.transport = 'stdio'
    } else if (arg === '--http') {
      input.transport = 'streamable-http'
    } else if (arg === '--command') {
      i += 1
      input.command = args[i]
    } else if (arg === '--url') {
      i += 1
      input.url = args[i]
    } else if (arg === '--args') {
      i += 1
      argv.push(args[i])
    } else if (arg === '--env') {
      i += 1
      env.push(args[i])
    } else if (arg === '--header') {
      i += 1
      headers.push(args[i])
    } else if (arg === '--cwd') {
      i += 1
      input.cwd = args[i]
    } else if (arg === '--timeout') {
      i += 1
      input.toolCallTimeoutMs = Number(args[i])
    } else if (arg === '--fail-on-startup') {
      input.failOnStartupError = true
    } else if (arg === '--no-reconnect') {
      input.reconnect.enabled = false
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }
  if (!input.serverName) throw new Error('--name is required')
  if (input.transport === 'stdio') {
    input.args = argv
    input.env = parseKeyValuePairs(env)
  } else if (input.transport === 'streamable-http') {
    input.headers = parseKeyValuePairs(headers)
  } else {
    throw new Error('add requires --stdio or --http')
  }
  const server = normalizeServerConfig(input)
  const { path, config } = await scopeConfig(scope)
  if (findServer(config.servers, server.serverName)) {
    throw new Error(`server "${server.serverName}" already exists in ${scope.kind === 'global' ? 'global' : `workspace ${scope.path}`}`)
  }
  config.servers.push(server)
  await writeConfigFile(path, config)
  console.log(`Added ${server.transport} MCP server "${server.serverName}" to ${scope.kind === 'global' ? 'global' : `workspace ${scope.path}`}.`)
}

async function commandMutate(args, mode) {
  const scope = normalizeScope((() => {
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === '--scope') return args[i + 1]
    }
    return undefined
  })())
  let name
  let yes = false
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--scope') {
      i += 1
    } else if (arg === '--name') {
      i += 1
      name = args[i]
    } else if (arg === '--yes') {
      yes = true
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown argument: ${arg}`)
    } else if (name === undefined) {
      name = arg
    } else {
      throw new Error(`unexpected argument: ${arg}`)
    }
  }
  if (!name) throw new Error('--name is required')
  const { path, config } = await scopeConfig(scope)
  const server = findServer(config.servers, name)
  if (!server) throw new Error(`server "${name}" not found in ${scope.kind === 'global' ? 'global' : `workspace ${scope.path}`}`)
  if (mode === 'remove') {
    if (!yes) {
      process.stderr.write(`Remove MCP server "${name}"? [y/N] `)
      const answer = await readStdinLine()
      if (answer !== 'y' && answer !== 'yes') {
        console.log('Canceled.')
        return
      }
    }
    config.servers = config.servers.filter((item) => item.serverName !== name)
    await writeConfigFile(path, config)
    console.log(`Removed MCP server "${name}".`)
    return
  }
  server.disabled = mode === 'disable'
  await writeConfigFile(path, config)
  console.log(`${mode === 'enable' ? 'Enabled' : 'Disabled'} MCP server "${name}".`)
}

function readStdinLine() {
  return new Promise((resolvePromise) => {
    process.stdin.setEncoding('utf8')
    process.stdin.once('data', (chunk) => resolvePromise(String(chunk).trim()))
  })
}

async function commandTest(args) {
  const scope = normalizeScope((() => {
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === '--scope') return args[i + 1]
    }
    return undefined
  })())
  let name
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--scope') {
      i += 1
    } else if (arg === '--name') {
      i += 1
      name = args[i]
    } else if (!arg.startsWith('-') && name === undefined) {
      name = arg
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }
  if (!name) throw new Error('--name is required')
  let server
  if (scope.kind === 'global') {
    const { config } = await scopeConfig(scope)
    server = findServer(config.servers, name)
  } else {
    const servers = await loadMergedServers(scope.path)
    server = findServer(servers, name)
  }
  if (!server) throw new Error(`server "${name}" not found in ${scope.kind === 'global' ? 'global' : `workspace ${scope.path}`}`)
  const result = await probeServer(server)
  if (!result.ok) {
    console.error(`Connection failed: ${result.error}`)
    process.exitCode = 1
    return
  }
  console.log(`Connected to "${name}", found ${result.tools.length} tool${result.tools.length === 1 ? '' : 's'}:`)
  for (const tool of result.tools) {
    console.log(`  - ${tool.name}${tool.description ? `: ${tool.description}` : ''}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
    usage()
    return
  }
  const command = args[0]
  const rest = args.slice(1)
  try {
    switch (command) {
      case 'list':
        await commandList(rest)
        break
      case 'add':
        await commandAdd(rest)
        break
      case 'remove':
        await commandMutate(rest, 'remove')
        break
      case 'enable':
        await commandMutate(rest, 'enable')
        break
      case 'disable':
        await commandMutate(rest, 'disable')
        break
      case 'test':
        await commandTest(rest)
        break
      default:
        throw new Error(`unknown command: ${command}`)
    }
  } catch (error) {
    fail(error?.message ?? String(error))
  }
}

main()
