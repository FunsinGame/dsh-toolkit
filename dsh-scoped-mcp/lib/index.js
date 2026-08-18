/**
 * dsh-scoped-mcp host plugin.
 *
 * Hooks agent creation/disposal. For every agent it resolves the session's
 * workspace project root, loads the merged global+workspace MCP server list,
 * and registers that workspace's MCP tools on `agent.ctx.tools` so different
 * workspaces in the same profile see different MCP servers.
 *
 * The host also reacts to Web-settings mutations (add/edit/remove/enable/
 * disable) and live-syncs every running agent's MCP bridges to the updated
 * config, so disabling a server also closes its already-open MCP connection.
 */
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { findProjectRoot, loadMergedServers, resolveDshHome } from './config.js'
import { startScopedServer } from './mcp-bridge.js'
import { ScopedMcpManagerGateway } from './mcp-service.js'
import { TYPERT } from './typert.host.js'

export const name = 'dsh-scoped-mcp'
export const inject = ['agents', 'sessions', 'typert']

const agentBridges = new Map()

async function debugLog(message) {
  try {
    await appendFile(join(resolveDshHome(), 'scoped-mcp-debug.log'), `${new Date().toISOString()} ${message}\n`, 'utf8')
  } catch {
    // Debug logging must never break MCP bridge synchronization.
  }
}

function getBridge(agent) {
  let bridge = agentBridges.get(agent.id)
  if (!bridge) {
    bridge = { servers: new Map(), queue: Promise.resolve() }
    agentBridges.set(agent.id, bridge)
  }
  return bridge
}

async function syncAgent(agent) {
  const bridge = getBridge(agent)
  const log = agent.ctx.logger ?? agent.ctx.root?.logger
  const run = async () => {
    try {
      const cwd = agent.session?.header?.cwd || process.cwd()
      const projectRoot = await findProjectRoot(cwd)
      const servers = await loadMergedServers(projectRoot)
      const desired = new Map(
        servers
          .filter((server) => !server.disabled)
          .map((server) => [server.serverName, server]),
      )

      for (const [serverName, entry] of [...bridge.servers]) {
        const desiredServer = desired.get(serverName)
        if (desiredServer && JSON.stringify(entry.config) === JSON.stringify(desiredServer)) continue
        bridge.servers.delete(serverName)
        try {
          entry.dispose()
        } catch {
          // A failing disposer must not prevent the remaining tools from unloading.
        }
        log?.info?.(`dsh-scoped-mcp: unregistered ${serverName} for ${projectRoot}`)
        void debugLog(`syncAgent agent=${agent.id} unregistered ${serverName} project=${projectRoot}`)
      }

      for (const [serverName, server] of desired) {
        if (bridge.servers.has(serverName)) continue
        try {
          const handle = await startScopedServer(agent.ctx, server)
          if (agentBridges.get(agent.id) !== bridge) {
            handle.dispose()
            return
          }
          bridge.servers.set(serverName, { dispose: handle.dispose, config: server })
          log?.info?.(`dsh-scoped-mcp: registered ${serverName} for ${projectRoot}`)
          void debugLog(`syncAgent agent=${agent.id} registered ${serverName} project=${projectRoot}`)
        } catch (error) {
          log?.warn?.(`dsh-scoped-mcp: ${serverName} failed for ${projectRoot}: ${error?.message ?? error}`)
        }
      }
    } catch (error) {
      log?.warn?.(`dsh-scoped-mcp: sync failed for ${agent.id}: ${error?.message ?? error}`)
    }
  }
  bridge.queue = bridge.queue.then(run).catch(() => {})
  return bridge.queue
}

async function setupAgent(agent) {
  getBridge(agent)
  await syncAgent(agent)
}

function teardownAgent(agent) {
  const bridge = agentBridges.get(agent.id)
  if (!bridge) return
  agentBridges.delete(agent.id)
  for (const entry of bridge.servers.values()) {
    try {
      entry.dispose()
    } catch {
      // A failing disposer must not prevent the remaining tools from unloading.
    }
  }
  bridge.servers.clear()
}

function syncAllAgents(ctx) {
  void debugLog(`syncAllAgents agents=${ctx.agents.list().length}`)
  for (const agent of ctx.agents.list()) {
    void syncAgent(agent)
  }
}

export function apply(ctx) {
  new ScopedMcpManagerGateway(ctx, () => syncAllAgents(ctx))
  ctx.effect(() => ctx.typert.register(TYPERT), 'dsh-scoped-mcp.typert')

  ctx.on('agent/created', ({ agent }) => {
    void setupAgent(agent)
  })
  ctx.on('agent/disposed', ({ agent }) => {
    teardownAgent(agent)
  })

  for (const agent of ctx.agents.list()) {
    void setupAgent(agent)
  }

  ctx.effect(() => {
    return () => {
      for (const bridge of agentBridges.values()) {
        for (const entry of bridge.servers.values()) {
          try { entry.dispose() } catch { /* best-effort cleanup */ }
        }
        bridge.servers.clear()
      }
      agentBridges.clear()
    }
  }, 'dsh-scoped-mcp.agentBridges')
}
