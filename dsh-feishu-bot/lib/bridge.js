/**
 * dsh-feishu-bot —— 飞书连接层。
 *
 * 用一个「自建应用 + 长连接」通道完成双向通信：
 *   - 出：`im.v1.message.create / reply / patch` 发卡片与回执；
 *   - 入：`im.message.receive_v1`（私聊文本、引用回复）与
 *     `card.action.trigger`（卡片按钮，JSON 2.0）。
 *
 * 长连接不需要公网地址、域名或内网穿透，也不需要 encrypt_key/verification_token；
 * SDK 自己管理 tenant_access_token 与断线重连。
 *
 * 本模块只做传输与幂等，不含业务判断：收到事件后交给 `onEvent` 里注入的回调。
 * 事件处理必须快（飞书要求 3 秒内应答），因此这里只做内存查找。
 */

/** 单条文本消息的安全长度。 */
const MAX_TEXT_CHARS = 8000

/** 去重表容量（飞书至少一次投递，可能重复推送同一事件）。 */
const SEEN_LIMIT = 1000

let cachedSdk

/**
 * 懒加载飞书 SDK：依赖缺失时只让本插件降级，不拖垮 DSH 启动。
 * @returns SDK 模块命名空间。
 */
export async function loadLarkSdk() {
  if (cachedSdk !== undefined) return cachedSdk
  try {
    cachedSdk = await import('@larksuiteoapi/node-sdk')
    return cachedSdk
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`飞书 SDK 加载失败（请确认已安装 @larksuiteoapi/node-sdk）：${message}`)
  }
}

/** 极简 LRU：记住最近的事件 id，用于去重。 */
class RecentSet {
  /** @param limit - 最多保留的条目数。 */
  constructor(limit = SEEN_LIMIT) {
    this.limit = limit
    this.map = new Map()
  }

  /** @returns 首次出现返回 false，重复出现返回 true。 */
  hit(key) {
    if (typeof key !== 'string' || key === '') return false
    if (this.map.has(key)) {
      this.map.delete(key)
      this.map.set(key, true)
      return true
    }
    this.map.set(key, true)
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value
      this.map.delete(oldest)
    }
    return false
  }
}

/** 从 SDK 响应里区分成功与失败。 */
function assertOk(response, action) {
  if (response === undefined || response === null) return response
  const code = response.code
  if (typeof code === 'number' && code !== 0) {
    const message = typeof response.msg === 'string' && response.msg !== '' ? response.msg : '未知错误'
    throw new Error(`${action}失败（code ${code}）：${message}`)
  }
  return response
}

/**
 * 把 SDK（axios）抛出的错误整理成一句可诊断的话。
 *
 * HTTP 4xx/5xx 时 SDK 抛的是 axios 错误，飞书的业务码与原因在
 * `error.response.data`（例如 `230099` + “unsupported tag note”）。只保留
 * “Request failed with status code 400”会把真正的原因丢掉。
 * @param error - 捕获到的异常。
 * @param action - 正在执行的动作名。
 * @returns 可直接展示的错误文本。
 */
export function describeTransportError(error, action) {
  const response = error?.response
  const body = response?.data
  const status = response?.status ?? '?'
  if (body !== null && typeof body === 'object' && body !== undefined) {
    const code = body.code ?? status
    const message = typeof body.msg === 'string' && body.msg !== ''
      ? body.msg
      : (typeof body.message === 'string' ? body.message : '')
    return `${action}失败（HTTP ${status} / code ${code}）：${String(message).slice(0, 300)}`
  }
  const message = error instanceof Error ? error.message : String(error)
  return response?.status === undefined ? `${action}失败：${message}` : `${action}失败（HTTP ${status}）：${message}`
}

/** 把卡片与文本收敛成 SDK 需要的参数形态。 */
function textContent(text) {
  const clipped = [...String(text ?? '')].slice(0, MAX_TEXT_CHARS).join('')
  return JSON.stringify({ text: clipped })
}

/**
 * 飞书连接。
 *
 * 状态机：`stopped → connecting → connected`，异常时进入 `error`；
 * 再次 `start()` 会先停掉旧连接（同一 app 的多个长连接会让事件随机分流）。
 */
export class FeishuBridge {
  /**
   * @param options - 依赖注入。
   */
  constructor(options = {}) {
    this.logger = options.logger ?? console
    this.sdkLoader = options.sdkLoader ?? loadLarkSdk
    this.onEvent = options.onEvent ?? {}
    this.onStatus = options.onStatus ?? (() => {})
    this.status = 'stopped'
    this.lastError = ''
    this.appId = ''
    this.client = undefined
    this.wsClient = undefined
    this.sdk = undefined
    this.seenCallbacks = new RecentSet()
    this.seenMessages = new RecentSet()
  }

  /** 记录状态并向外广播（设置卡片据此显示徽标）。 */
  setStatus(status, error = '') {
    this.status = status
    this.lastError = error
    try {
      this.onStatus(status, error)
    } catch {
      // 状态回调由宿主提供，失败不影响传输层。
    }
  }

  /**
   * 建立（或复用）长连接。
   * 成功返回时凭据已通过握手校验，因此 `connected` 即代表 app_id/secret 可用。
   * @param credentials - `{appId, appSecret}`。
   */
  async start(credentials) {
    const appId = typeof credentials?.appId === 'string' ? credentials.appId.trim() : ''
    const appSecret = typeof credentials?.appSecret === 'string' ? credentials.appSecret.trim() : ''
    if (appId === '' || appSecret === '') throw new Error('缺少 app_id 或 app_secret')
    if (this.status === 'connected' && this.appId === appId) return

    await this.stop()
    this.appId = appId
    this.setStatus('connecting')
    let sdk
    try {
      sdk = await this.sdkLoader()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setStatus('error', message)
      throw error
    }
    this.sdk = sdk
    const base = { appId, appSecret, loggerLevel: sdk.LoggerLevel?.warn ?? 2 }
    this.client = new sdk.Client(base)
    const dispatcher = new sdk.EventDispatcher({}).register({
      'im.message.receive_v1': (payload) => this.handleMessage(payload),
      'card.action.trigger': (payload) => this.handleCardAction(payload),
    })
    this.wsClient = new sdk.WSClient(base)
    try {
      await this.wsClient.start({ eventDispatcher: dispatcher })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.wsClient = undefined
      this.client = undefined
      this.setStatus('error', `长连接建立失败：${message}`)
      throw error
    }
    this.setStatus('connected')
    this.logger.info?.('[feishu-bot] long connection established')
  }

  /** 关闭连接（幂等）。 */
  async stop() {
    const ws = this.wsClient
    this.wsClient = undefined
    this.client = undefined
    this.sdk = undefined
    this.appId = ''
    if (ws !== undefined) {
      try {
        await ws.close()
      } catch (error) {
        this.logger.warn?.('[feishu-bot] close failed', error)
      }
    }
    if (this.status !== 'stopped') this.setStatus('stopped')
  }

  /** 当前是否可发送。 */
  get ready() {
    return this.status === 'connected' && this.client !== undefined
  }

  /**
   * 发送一张卡片。
   * @param receiveId - `chat_id` 或 `open_id`。
   * @param card - 卡片对象。
   * @param options - `{receiveIdType}`，默认按 id 前缀猜测。
   * @returns 飞书返回的 `message_id`。
   */
  async sendCard(receiveId, card, options = {}) {
    const client = this.requireClient()
    const id = typeof receiveId === 'string' ? receiveId.trim() : ''
    if (id === '') throw new Error('缺少接收方 id')
    const receiveIdType = options.receiveIdType ?? (id.startsWith('oc_') ? 'chat_id' : 'open_id')
    let response
    try {
      response = await client.im.v1.message.create({
        params: { receive_id_type: receiveIdType },
        data: {
          receive_id: id,
          msg_type: 'interactive',
          content: JSON.stringify(card),
        },
      })
    } catch (error) {
      throw new Error(describeTransportError(error, '发送卡片'))
    }
    assertOk(response, '发送卡片')
    const messageId = response?.data?.message_id
    if (typeof messageId !== 'string' || messageId === '') throw new Error('发送卡片失败：飞书未返回 message_id')
    return messageId
  }

  /**
   * 发送纯文本（卡片过大或降级时使用）。
   * @returns 飞书返回的 `message_id`。
   */
  async sendText(receiveId, text, options = {}) {
    const client = this.requireClient()
    const id = typeof receiveId === 'string' ? receiveId.trim() : ''
    if (id === '') throw new Error('缺少接收方 id')
    const receiveIdType = options.receiveIdType ?? (id.startsWith('oc_') ? 'chat_id' : 'open_id')
    let response
    try {
      response = await client.im.v1.message.create({
        params: { receive_id_type: receiveIdType },
        data: { receive_id: id, msg_type: 'text', content: textContent(text) },
      })
    } catch (error) {
      throw new Error(describeTransportError(error, '发送消息'))
    }
    assertOk(response, '发送消息')
    const messageId = response?.data?.message_id
    return typeof messageId === 'string' ? messageId : ''
  }

  /** 引用某条消息回复一段文本（用于回执）。 */
  async replyText(messageId, text) {
    const client = this.requireClient()
    const target = typeof messageId === 'string' ? messageId.trim() : ''
    if (target === '') return
    let response
    try {
      response = await client.im.v1.message.reply({
        path: { message_id: target },
        data: { msg_type: 'text', content: textContent(text) },
      })
    } catch (error) {
      throw new Error(describeTransportError(error, '回复消息'))
    }
    assertOk(response, '回复消息')
  }

  /**
   * 原地更新卡片。失败只记日志：卡片过期（14 天）或已被撤回都不该影响会话。
   * @returns 是否更新成功。
   */
  async patchCard(messageId, card) {
    const client = this.requireClient()
    const target = typeof messageId === 'string' ? messageId.trim() : ''
    if (target === '') return false
    try {
      const response = await client.im.v1.message.patch({
        path: { message_id: target },
        data: { content: JSON.stringify(card) },
      })
      assertOk(response, '更新卡片')
      return true
    } catch (error) {
      const message = error?.response === undefined
        ? (error instanceof Error ? error.message : String(error))
        : describeTransportError(error, '更新卡片')
      this.logger.warn?.(`[feishu-bot] patch card ${target} failed: ${message}`)
      return false
    }
  }

  /** 取一个可用客户端，否则给出明确的连接错误。 */
  requireClient() {
    if (!this.ready) throw new Error('飞书连接尚未就绪')
    return this.client
  }

  /** 处理 `im.message.receive_v1`：去重后交给宿主，立刻返回（3 秒约束）。 */
  handleMessage(payload) {
    const messageId = payload?.message?.message_id
    if (this.seenMessages.hit(messageId)) return {}
    const handler = this.onEvent.message
    if (typeof handler !== 'function') return {}
    try {
      void Promise.resolve(handler(payload)).catch((error) => {
        this.logger.warn?.('[feishu-bot] message handler failed', error)
      })
    } catch (error) {
      this.logger.warn?.('[feishu-bot] message handler threw', error)
    }
    return {}
  }

  /** 处理 `card.action.trigger`：同步给出 toast/卡片，或抛错转成错误提示。 */
  handleCardAction(payload) {
    const eventId = payload?.header?.event_id
    const messageId = payload?.context?.open_message_id
    if (this.seenCallbacks.hit(eventId ?? messageId)) {
      return { toast: { type: 'info', content: '这条操作已经处理过了' } }
    }
    const handler = this.onEvent.cardAction
    if (typeof handler !== 'function') return {}
    try {
      const result = handler(payload)
      if (result !== undefined && result !== null) return result
      return {}
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn?.('[feishu-bot] card action failed', error)
      return { toast: { type: 'error', content: `处理失败：${message.slice(0, 120)}` } }
    }
  }
}
