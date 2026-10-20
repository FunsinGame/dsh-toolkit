/**
 * dsh-scoped-mcp host plugin.
 *
 * Workspace-scoped MCP servers for DSH. The plugin keeps its own connection
 * manager (one live MCP connection per scope + serverName), attaches each
 * agent to the effective servers of its workspace, and serves the MCP page's
 * JSON API on the composition's own Web server.
 *
 * Scope precedence: a workspace entry replaces a global entry with the same
 * `serverName`; every other global entry still applies to that workspace.
 */
import { ScopedMcpManager } from './manager.js'
import { registerRoutes } from './routes.js'

export const name = 'dsh-scoped-mcp'

/** Agent lifecycle is the only required service; routes wait for their own. */
export const inject = ['agents']

/**
 * Install the connection manager, the agent subscriptions, and the Web routes.
 * @param ctx - host plugin context.
 */
export function apply(ctx) {
  const manager = new ScopedMcpManager(ctx)

  ctx.effect(() => () => {
    manager.dispose()
  }, 'dsh-scoped-mcp: connections')

  ctx.on('agent/created', ({ agent }) => {
    // Do not hold agent creation on an MCP handshake: tools appear as soon as
    // the connection completes, exactly like the shipped mcp-client.
    void manager.attachAgent(agent)
  })
  ctx.on('agent/disposed', ({ agent }) => {
    manager.detachAgent(agent)
  })

  for (const agent of ctx.agents.list()) void manager.attachAgent(agent)

  ctx.inject(['webServer', 'connection'], (child) => {
    child.effect(() => registerRoutes(child, manager), 'dsh-scoped-mcp: routes')
  })
}
