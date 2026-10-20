/**
 * dsh-scoped-mcp host routes.
 *
 * A small same-origin JSON API for the MCP page:
 *
 *   GET  /dsh-scoped-mcp/state    the page's complete snapshot
 *   POST /dsh-scoped-mcp/action   enable | stop | remove | save
 *
 * Every request passes the composition's `connection` trust fence first, the
 * same one DSH's own plugin routes use, so only the authenticated GUI (or a
 * trusted host binding) can reach server configuration or spawn a process.
 */
const PLUGIN = 'dsh-scoped-mcp'
export const ROUTE_BASE = '/dsh-scoped-mcp'
export const ROUTE_STATE = `${ROUTE_BASE}/state`
export const ROUTE_ACTION = `${ROUTE_BASE}/action`

/** Action bodies are tiny JSON objects; anything larger is hostile. */
const MAX_BODY_BYTES = 64 * 1024

/** Send one JSON response (never cached: connection state is live). */
function sendJson(res, status, payload) {
  const text = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', Buffer.byteLength(text))
  res.end(text)
}

/** Method guard with the one method the route supports. */
function methodNotAllowed(res, allow) {
  res.statusCode = 405
  res.setHeader('allow', allow)
  res.end()
}

/** Collect a bounded request body as UTF-8 text; null past the ceiling. */
async function readBoundedBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.byteLength
    if (size > MAX_BODY_BYTES) {
      req.resume()
      return null
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, size).toString('utf8')
}

/** Validate the action body at the wire: a JSON object with a known action. */
function parseActionBody(text) {
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  if (typeof body.action !== 'string') return null
  if (typeof body.scope !== 'object' || body.scope === null) return null
  return body
}

/**
 * Register the state and action routes.
 * @param ctx - child context carrying `webServer` and `connection`.
 * @param manager - the plugin's ScopedMcpManager.
 * @returns disposer for this registration group.
 */
export function registerRoutes(ctx, manager) {
  const connectionOf = () => {
    try {
      return ctx.connection
    } catch {
      return undefined
    }
  }
  const rejected = (req, res) => {
    // An unauthenticated or untrusted caller cannot see server configuration or
    // start a process. A composition without the trust service is the desktop's
    // own in-process shell; routes are then reachable only from that page.
    const rejection = connectionOf()?.requestRejection?.(req)
    if (rejection === undefined) return false
    res.statusCode = rejection
    res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
    return true
  }

  const disposeState = ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_STATE,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      if (req.method !== 'GET') {
        methodNotAllowed(res, 'GET')
        return
      }
      try {
        sendJson(res, 200, { ok: true, state: await manager.snapshot() })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error?.message ?? String(error) })
      }
    },
  })

  const disposeAction = ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_ACTION,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      if (req.method !== 'POST') {
        methodNotAllowed(res, 'POST')
        return
      }
      const essence = String(req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
      if (essence !== 'application/json') {
        sendJson(res, 415, { ok: false, error: 'content-type must be application/json' })
        return
      }
      let text
      try {
        text = await readBoundedBody(req)
      } catch {
        sendJson(res, 400, { ok: false, error: '请求体读取失败' })
        return
      }
      if (text === null) {
        sendJson(res, 413, { ok: false, error: '请求体过大' })
        return
      }
      const body = parseActionBody(text)
      if (body === null) {
        sendJson(res, 400, { ok: false, error: '请求体必须是带 action 的 JSON 对象' })
        return
      }
      try {
        const outcome = await runAction(manager, body)
        sendJson(res, 200, { ok: true, ...outcome, state: await manager.snapshot() })
      } catch (error) {
        const message = error?.message ?? String(error)
        ctx.logger?.warn?.(`${PLUGIN}: ${body.action} failed: ${message}`)
        sendJson(res, 400, { ok: false, error: message })
      }
    },
  })

  return () => {
    disposeState()
    disposeAction()
  }
}

/** Dispatch one validated action body to the manager. */
async function runAction(manager, body) {
  switch (body.action) {
    case 'enable': {
      if (typeof body.serverName !== 'string') throw new Error('缺少 serverName')
      const result = await manager.enable(body.scope, body.serverName)
      return {
        connected: result.ok === true,
        toolCount: result.toolCount ?? 0,
        error: result.error ?? null,
      }
    }
    case 'stop': {
      if (typeof body.serverName !== 'string') throw new Error('缺少 serverName')
      await manager.stop(body.scope, body.serverName)
      return {}
    }
    case 'remove': {
      if (typeof body.serverName !== 'string') throw new Error('缺少 serverName')
      await manager.remove(body.scope, body.serverName)
      return {}
    }
    case 'save': {
      if (typeof body.server !== 'object' || body.server === null) throw new Error('缺少 server')
      await manager.save(body.scope, body.server, body.previousServerName)
      return {}
    }
    default:
      throw new Error(`未知操作：${String(body.action)}`)
  }
}
