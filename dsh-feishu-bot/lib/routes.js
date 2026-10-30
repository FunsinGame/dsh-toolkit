/**
 * dsh-feishu-bot —— 同源 JSON 接口。
 *
 *   GET  /dsh-feishu-bot/state    设置卡片的状态快照（已脱敏，永不含密钥）
 *   POST /dsh-feishu-bot/action   saveSecret | clearSecret | beginBind | cancelBind |
 *                                 unbind | sendTest | restartBridge | clearError
 *
 * 每个请求都先过组合的 `connection` 信任闸（与 DSH 自己的插件路由同一道），
 * 因此只有已认证的 GUI 或受信宿主机绑定能碰到凭据与绑定状态。
 */

/** 路由前缀。 */
export const ROUTE_BASE = '/dsh-feishu-bot'
/** 状态快照。 */
export const ROUTE_STATE = `${ROUTE_BASE}/state`
/** 动作接口。 */
export const ROUTE_ACTION = `${ROUTE_BASE}/action`

/** 动作请求体上限（这些请求本来就只有几十字节）。 */
const MAX_BODY_BYTES = 64 * 1024

/** 发送一个 JSON 响应（不缓存：连接状态是实时的）。 */
function sendJson(res, status, payload) {
  const text = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', Buffer.byteLength(text))
  res.end(text)
}

/** 方法不允许。 */
function methodNotAllowed(res, allow) {
  res.statusCode = 405
  res.setHeader('allow', allow)
  res.end()
}

/** 读有上限的请求体；超限返回 null。 */
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

/** 动作体必须是带字符串 action 的 JSON 对象。 */
function parseActionBody(text) {
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  if (typeof body.action !== 'string') return null
  return body
}

/**
 * 注册两条路由。
 * @param ctx - 带 `webServer` 与 `connection` 的子上下文。
 * @param service - FeishuBotService。
 * @returns 撤销注册的函数。
 */
export function registerRoutes(ctx, service) {
  const rejected = (req, res) => {
    // 不信任的调用方看不到凭据/绑定状态，也不能改写它们。
    const rejection = ctx.connection?.requestRejection?.(req)
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
        sendJson(res, 200, { ok: true, state: await service.snapshot() })
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
        const outcome = await service.runAction(body)
        sendJson(res, 200, { ok: true, ...outcome, state: await service.snapshot() })
      } catch (error) {
        const message = error?.message ?? String(error)
        ctx.logger?.warn?.(`dsh-feishu-bot: ${body.action} failed: ${message}`)
        sendJson(res, 400, { ok: false, error: message, state: await service.snapshot().catch(() => undefined) })
      }
    },
  })

  return () => {
    disposeState()
    disposeAction()
  }
}
