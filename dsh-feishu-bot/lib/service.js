/**
 * dsh-feishu-bot —— 宿主服务（装配层）。
 *
 * 把四块拼起来：
 *   - `Store`：绑定、一次性码、卡片刻（`$DSH_HOME/feishu-bot/state.json`）；
 *   - `FeishuBridge`：长连接与收发；
 *   - `TurnTracker`：回合结束 → 完成卡片；
 *   - `InteractionTakeover`：提问/审批与桌面端竞速，先答者生效。
 *
 * 连接与“是否通知”是两件事：
 *   - 只要配置了 app_id/app_secret，长连接就应保持（绑定码、卡片按钮回传都靠它）；
 *   - 只有 `enabled` + 已绑定，才发通知、才接管提问/审批。
 */
import { randomInt } from 'node:crypto'
import { basename } from 'node:path'
import { FeishuBridge } from './bridge.js'
import { buildBoundCard, buildCompleteCard, buildEnabledCard, buildTestCard } from './cards.js'
import { InteractionTakeover, TurnTracker, messageText, quotedMessageId, senderOpenId } from './notify.js'
import { maskId, StateStore } from './store.js'
import { describePromptError, matchBindCode, MAX_REPLY_CHARS, truncate } from './text.js'

/** 飞书 app_secret 在凭据服务里的引用名（POSIX 风格环境变量名）。 */
export const SECRET_REF = 'DSH_FEISHU_APP_SECRET'

/** 绑定码有效期。 */
const BIND_TTL_MS = 10 * 60_000

/** 绑定码最多尝试次数（防爆破）。 */
const BIND_MAX_ATTEMPTS = 20

/** 本机时区（喂给 prompt，让模型知道用户的时间语境）。 */
const LOCAL_TIMEZONE = (() => {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return typeof zone === 'string' && /^[A-Za-z][A-Za-z0-9_+-]*\/[A-Za-z0-9_+-]+$/u.test(zone) ? zone : undefined
  } catch {
    return undefined
  }
})()

/**
 * 插件服务。
 */
export class FeishuBotService {
  /**
   * @param ctx - 宿主 Cordis 上下文。
   * @param options - `{config, logger, store?, bridge?}`；`config` 返回当前生效的
   *   普通值快照；`store`/`bridge` 只在测试时注入。
   */
  constructor(ctx, options) {
    this.ctx = ctx
    this.logger = options.logger ?? ctx.logger ?? console
    this.readConfig = options.config
    this.store = options.store ?? new StateStore()
    this.bridge = options.bridge ?? new FeishuBridge({
      logger: this.logger,
      onEvent: {
        message: payload => this.onMessage(payload),
        cardAction: payload => this.takeover.handleCardAction(payload),
      },
      onStatus: (status, error) => {
        if (error !== '' && error !== undefined) this.noteError(error)
        this.logger.info?.(`[feishu-bot] bridge ${status}${error ? `: ${error}` : ''}`)
      },
    })
    const host = this.hostInterface()
    this.takeover = new InteractionTakeover(host)
    this.turns = new TurnTracker(host)
    this.bindAttempts = 0
    /** 上一次观察到的 enabled（`null` 表示刚启动，尚未观察）。 */
    this.lastEnabled = null
    /** 本次开启是否已经发过“已开启”卡片。 */
    this.announced = false
    this.disposed = false
  }

  // ── 生命周期 ───────────────────────────────────────────────────────────

  /** 载入状态、挂监听、恢复连接。 */
  async start() {
    this.store.load()
    this.turns.attach()
    this.takeover.attach(this.ctx)
    this.ctx.on('loader/volatile-update', () => {
      void this.sync()
    })
    await this.sync()
  }

  /** 停掉全部异步资源（幂等）。 */
  async dispose() {
    if (this.disposed) return
    this.disposed = true
    this.takeover.detach()
    this.turns.detach()
    await this.bridge.stop()
  }

  /**
   * 依据配置与状态启动/停止长连接，并在“刚被打开”时发一张确认卡片。
   *
   * 连接只看凭据：绑定码与卡片按钮回传都需要长连接在线，所以它们不受 `enabled`
   * 影响；`enabled` 只决定是否发通知、是否接管提问/审批。
   */
  async sync() {
    if (this.disposed) return
    const config = this.readConfig()
    const appId = typeof config.appId === 'string' ? config.appId.trim() : ''
    const appSecret = await this.resolveSecret()
    const binding = this.store.state.binding

    if (appId === '' || appSecret === undefined || appSecret === '') {
      await this.bridge.stop()
      if (config.enabled !== true) this.lastEnabled = false
      return
    }
    if (this.bridge.status !== 'connected' || this.bridge.appId !== appId) {
      try {
        await this.bridge.start({ appId, appSecret })
      } catch (error) {
        this.noteError(error instanceof Error ? error.message : String(error))
        return
      }
    }

    const enabledNow = config.enabled === true
    const toggledOn = this.lastEnabled === false
    this.lastEnabled = enabledNow
    if (!enabledNow) {
      this.announced = false
      return
    }
    if (binding === undefined) return
    if (toggledOn || !this.announced) await this.sendEnabledCard()
  }

  /** 取 app_secret：凭据服务优先，其次同名环境变量。 */
  async resolveSecret() {
    const credentials = this.ctx.get('credentials')
    if (credentials !== undefined && typeof credentials.resolve === 'function') {
      try {
        const resolved = await credentials.resolve(SECRET_REF)
        const value = resolved?.value
        if (typeof value === 'string' && value.trim() !== '') return value.trim()
      } catch (error) {
        this.logger.warn?.('[feishu-bot] resolve credential failed', error)
      }
    }
    const fromEnv = process.env[SECRET_REF]
    return typeof fromEnv === 'string' && fromEnv.trim() !== '' ? fromEnv.trim() : undefined
  }

  // ── 宿主能力（注入给 TurnTracker / InteractionTakeover） ────────────────

  /** 组装 notify.js 需要的能力对象。 */
  hostInterface() {
    return {
      logger: this.logger,
      config: () => this.configSnapshot(),
      ready: () => this.ready(),
      onSessionEvent: handler => this.ctx.on('session/event', handler, { global: true }),
      agentStatus: (sessionId) => {
        const agent = this.ctx.agents?.get?.(sessionId)
        return agent?.status
      },
      sessionIdOf: agent => (typeof agent?.session?.id === 'string' ? agent.session.id : (typeof agent?.id === 'string' ? agent.id : undefined)),
      describe: sessionId => this.describe(sessionId),
      toolCallOf: (sessionId, callId) => this.turns.toolCallOf(sessionId, callId),
      sendInteractionCard: (card, meta) => this.sendInteractionCard(card, meta),
      patchCard: (messageId, card) => this.bridge.patchCard(messageId, card),
      noteError: message => this.noteError(message),
      confirmAck: payload => this.confirmAck(payload),
      notifyTurnEnd: spec => this.notifyTurnEnd(spec),
    }
  }

  /** 当前生效配置的普通值快照。 */
  configSnapshot() {
    const raw = this.readConfig()
    return {
      enabled: raw.enabled === true,
      notifyComplete: raw.notifyComplete !== false,
      notifyQuestion: raw.notifyQuestion !== false,
      notifyApproval: raw.notifyApproval !== false,
      completeDebounceMs: Number.isFinite(raw.completeDebounceMs) ? raw.completeDebounceMs : 1500,
      maxResultChars: Number.isFinite(raw.maxResultChars) ? raw.maxResultChars : 3000,
      maxCardButtons: Number.isFinite(raw.maxCardButtons) ? raw.maxCardButtons : 6,
      appId: typeof raw.appId === 'string' ? raw.appId : '',
    }
  }

  /** 是否处于“会打扰用户”的状态：已启用 + 已绑定 + 连接就绪。 */
  ready() {
    const config = this.configSnapshot()
    return config.enabled && this.store.state.binding !== undefined && this.bridge.ready
  }

  /** 记录错误摘要（设置卡片会展示）。 */
  noteError(message) {
    const text = typeof message === 'string' ? message : String(message ?? '')
    if (text.trim() === '') return
    this.logger.warn?.(`[feishu-bot] ${text}`)
    try {
      this.store.noteError(text)
    } catch {
      // 状态持久化失败不能拖垮调用链。
    }
  }

  // ── 会话元信息 ─────────────────────────────────────────────────────────

  /**
   * 会话展示信息：工作区标题、会话标题（失败时逐级回退）。
   * @param sessionId - 会话 id。
   * @returns `{sessionId, workspaceTitle, sessionTitle, cwd}`。
   */
  describe(sessionId) {
    const ctx = this.ctx
    let session
    try {
      session = ctx.sessions?.get?.(sessionId)
    } catch {
      session = undefined
    }
    const cwd = typeof session?.header?.cwd === 'string' ? session.header.cwd : undefined
    let title
    try {
      if (session !== undefined && ctx.get('sessionProjections') !== undefined) {
        const snapshot = ctx.sessionProjections.snapshot(session, ['title'])
        const value = snapshot?.values?.title
        if (typeof value === 'string' && value !== '') title = value
      }
    } catch {
      title = undefined
    }
    let workspace
    try {
      const registry = ctx.get('workspaceRegistry')
      if (registry !== undefined && typeof registry.list === 'function') {
        workspace = registry.list().find(item => Array.isArray(item.sessionIds) && item.sessionIds.includes(sessionId))
      }
    } catch {
      workspace = undefined
    }
    const base = cwd !== undefined && cwd !== '' ? basename(cwd) : ''
    return {
      sessionId,
      cwd,
      workspaceTitle: typeof workspace?.title === 'string' && workspace.title !== '' ? workspace.title : (base || '未归属工作区'),
      sessionTitle: title ?? (base !== '' ? base : String(sessionId ?? '').slice(0, 24)),
    }
  }

  /** 会话是否已归档（归档会话接受 prompt 但回合会 blocked）。 */
  isArchived(sessionId) {
    try {
      const registry = this.ctx.get('workspaceRegistry')
      const archived = registry?.archivedSessionIds
      return Array.isArray(archived) && archived.includes(sessionId)
    } catch {
      return false
    }
  }

  /** 当前绑定私聊的接收方 id（优先 chat_id，线程更完整）。 */
  recipient() {
    const binding = this.store.state.binding
    if (binding === undefined) return undefined
    return binding.chatId ?? binding.openId
  }

  // ── 发送 ───────────────────────────────────────────────────────────────

  /** 给绑定私聊发一张卡片；失败记录错误并返回 null。 */
  async sendToUser(card) {
    const recipient = this.recipient()
    if (recipient === undefined) return null
    try {
      const messageId = await this.bridge.sendCard(recipient, card)
      // 发成功了就说明之前的失败已经过去，别让“最近错误”一直挂着。
      if (this.store.state.lastError !== undefined) {
        try {
          this.store.clearError()
        } catch {
          // 状态持久化失败不影响发送结果。
        }
      }
      return messageId
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // 传输层已经带上了“发送卡片失败（HTTP…/code…）”前缀，避免重复。
      this.noteError(message.startsWith('发送卡片失败') ? message : `发送卡片失败：${message}`)
      return null
    }
  }

  /** 交互卡片：发送并记住卡片刻。 */
  async sendInteractionCard(card, meta) {
    const messageId = await this.sendToUser(card)
    if (messageId === null) return null
    try {
      this.store.rememberCard(messageId, meta)
    } catch (error) {
      this.noteError(`记录卡片失败：${error instanceof Error ? error.message : String(error)}`)
    }
    return messageId
  }

  /** 任务回合结束的完成卡片。 */
  async notifyTurnEnd({ sessionId, turn, reason, text }) {
    if (!this.ready()) return
    const where = this.describe(sessionId)
    const config = this.configSnapshot()
    const card = buildCompleteCard({
      workspaceTitle: where.workspaceTitle,
      sessionTitle: where.sessionTitle,
      turn,
      reason,
      resultText: text,
      maxResultChars: config.maxResultChars,
    })
    const messageId = await this.sendToUser(card)
    if (messageId === null) return
    try {
      this.store.rememberCard(messageId, { sessionId, kind: 'complete' })
    } catch (error) {
      this.noteError(`记录卡片失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** 发送“已开启”卡片（带确认按钮）；成功后本次开启不再重复发送。 */
  async sendEnabledCard() {
    let workspaceCount = 0
    try {
      const registry = this.ctx.get('workspaceRegistry')
      workspaceCount = Array.isArray(registry?.list?.()) ? registry.list().length : 0
    } catch {
      workspaceCount = 0
    }
    const card = buildEnabledCard({ workspaceCount })
    const messageId = await this.sendToUser(card)
    this.announced = messageId !== null
  }

  /** 卡片上的“确认收到”：证明回传通路可用。 */
  confirmAck(payload) {
    const binding = this.store.state.binding
    if (binding === undefined) return false
    const openId = payload?.operator?.open_id
    if (typeof openId === 'string' && openId !== '' && openId !== binding.openId) return false
    const messageId = payload?.context?.open_message_id
    this.store.state.enabledAck = {
      at: new Date().toISOString(),
      ...(typeof messageId === 'string' && messageId !== '' ? { messageId } : {}),
    }
    try {
      this.store.save()
    } catch (error) {
      this.noteError(`保存确认状态失败：${error instanceof Error ? error.message : String(error)}`)
      return false
    }
    this.store.clearError()
    return true
  }

  // ── 绑定与凭据 ─────────────────────────────────────────────────────────

  /** 生成一次性绑定码；需要先配好凭据（否则长连接收不到码）。 */
  async beginBind() {
    const config = this.configSnapshot()
    if (config.appId === '') throw new Error('请先填写 app_id')
    const secret = await this.resolveSecret()
    if (secret === undefined || secret === '') throw new Error('请先保存 app_secret')
    if (!this.bridge.ready) {
      await this.sync()
      if (!this.bridge.ready) throw new Error('飞书长连接尚未就绪，请稍后重试或查看错误信息')
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const now = Date.now()
    this.store.state.pendingBind = { code, issuedAt: now, expiresAt: now + BIND_TTL_MS }
    this.bindAttempts = 0
    this.store.save()
    return { code, expiresAt: now + BIND_TTL_MS }
  }

  /** 作废未使用的绑定码。 */
  cancelBind() {
    delete this.store.state.pendingBind
    this.store.save()
  }

  /** 解绑当前飞书账号（连接保留）。 */
  unbind() {
    delete this.store.state.binding
    delete this.store.state.enabledAck
    this.store.save()
    this.announced = false
  }

  /** 保存 app_secret 到凭据服务。 */
  async saveSecret(value) {
    const secret = typeof value === 'string' ? value.trim() : ''
    if (secret === '') throw new Error('app_secret 不能为空')
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined || typeof credentials.set !== 'function') {
      throw new Error(`当前部署未提供凭据服务，请改用环境变量 ${SECRET_REF}`)
    }
    await credentials.set(SECRET_REF, secret)
    await this.restartBridge()
  }

  /** 清除已保存的 app_secret。 */
  async clearSecret() {
    const credentials = this.ctx.get('credentials')
    if (credentials !== undefined && typeof credentials.unset === 'function') {
      await credentials.unset(SECRET_REF)
    }
    await this.restartBridge()
  }

  /**
   * 重建长连接（凭据或绑定变化后调用）。
   * 不重置 `announced`/`lastEnabled`：换个密钥或手动重启连接不应该再播报一次“已开启”。
   */
  async restartBridge() {
    await this.bridge.stop()
    await this.sync()
  }

  /** 发一张测试卡片。 */
  async sendTest() {
    if (this.store.state.binding === undefined) throw new Error('还没有绑定飞书账号')
    if (!this.bridge.ready) throw new Error('飞书长连接尚未就绪')
    const messageId = await this.sendToUser(buildTestCard({}))
    if (messageId === null) {
      // 把最近一次失败的真正原因直接抛给设置页，而不是只说“请查看最近错误”。
      const detail = this.store.state.lastError?.message
      throw new Error(typeof detail === 'string' && detail !== '' ? detail : '发送失败')
    }
    return { messageId }
  }

  // ── 飞书入站消息 ───────────────────────────────────────────────────────

  /**
   * 处理私聊消息：绑定码 → 引用卡片作答 → 引用卡片投递消息。
   * 未引用卡片一律只提示，不猜测目标会话。
   */
  async onMessage(payload) {
    try {
      const message = payload?.message
      const openId = senderOpenId(payload)
      if (message === undefined || message === null || openId === undefined) return
      if (message.chat_type !== 'p2p') return
      const reply = (text) => {
        if (typeof message.message_id !== 'string') return
        void this.bridge.replyText(message.message_id, text).catch(error => this.noteError(
          `回复失败：${error instanceof Error ? error.message : String(error)}`,
        ))
      }

      if (message.message_type !== 'text') {
        if (this.store.state.binding?.openId === openId) reply('目前只支持文本消息。')
        return
      }
      const text = messageText(payload)
      if (text === '') return

      // 1) 绑定码（未绑定时也接受）。
      const pending = this.store.state.pendingBind
      if (pending !== undefined && Date.now() <= pending.expiresAt) {
        if (matchBindCode(text, pending.code)) {
          this.completeBind(openId, message.chat_id, payload)
          reply('绑定成功，回到 DSH 的设置卡片打开总开关即可。')
          return
        }
        this.bindAttempts += 1
        if (this.bindAttempts > BIND_MAX_ATTEMPTS) {
          delete this.store.state.pendingBind
          this.store.save()
          reply('绑定码尝试次数过多，已作废。请在 DSH 里重新生成。')
          return
        }
      } else if (pending !== undefined) {
        delete this.store.state.pendingBind
        this.store.save()
      }

      // 2) 只有绑定用户可以继续。
      const binding = this.store.state.binding
      if (binding === undefined) {
        reply('还没有绑定。请先在 DSH 的设置卡片里生成绑定码，再把码发给我。')
        return
      }
      if (binding.openId !== openId) {
        reply('这个机器人只服务已绑定的 DSH 用户。')
        return
      }

      // 3) 引用哪张卡片？
      const parent = quotedMessageId(payload)
      if (parent === undefined) {
        reply('请引用要回复的那张卡片，再发送内容。')
        return
      }

      // 3a) 该卡片仍有待答的提问/审批 → 作为回答。
      const record = this.takeover.findByMessage(parent)
      if (record !== undefined) {
        const acknowledgement = this.takeover.answerByText(record, text)
        if (typeof acknowledgement === 'string' && acknowledgement !== '') reply(acknowledgement)
        return
      }

      // 3b) 已完成/已答的卡片 → 文本进入该会话。
      const entry = this.store.cardFor(parent)
      if (entry === undefined) {
        reply('找不到这张卡片对应的会话（可能已超过保留期）。')
        return
      }
      await this.deliverPrompt(entry.sessionId, text, message.message_id, reply)
    } catch (error) {
      this.noteError(`处理飞书消息失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** 完成绑定并立刻同步连接状态（可能触发“已开启”卡片）。 */
  completeBind(openId, chatId, payload) {
    const name = typeof payload?.sender?.sender_id?.name === 'string' ? payload.sender.sender_id.name : ''
    this.store.state.binding = {
      openId,
      ...(typeof chatId === 'string' && chatId !== '' ? { chatId } : {}),
      boundAt: new Date().toISOString(),
      ...(name === '' ? {} : { name }),
    }
    delete this.store.state.pendingBind
    this.store.save()
    void this.sync()
    void this.sendToUser(buildBoundCard({ name }))
  }

  /**
   * 把文本作为用户消息投递到会话。
   * @param sessionId - 目标会话。
   * @param text - 用户文本。
   * @param feishuMessageId - 飞书消息 id，用作幂等 requestId。
   * @param reply - 回执函数。
   */
  async deliverPrompt(sessionId, text, feishuMessageId, reply) {
    const sessionController = this.ctx.get('sessionController')
    if (sessionController === undefined || typeof sessionController.prompt !== 'function') {
      reply('当前部署没有暴露会话接口，无法发送。')
      return
    }
    if (this.isArchived(sessionId)) {
      reply('这个会话已归档，无法再发送消息。')
      return
    }
    const where = this.describe(sessionId)
    try {
      await sessionController.prompt({
        requestId: typeof feishuMessageId === 'string' && feishuMessageId !== '' ? feishuMessageId : `feishu-${Date.now()}`,
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text: truncate(text, MAX_REPLY_CHARS, '\n…（已截断）') }],
        ...(LOCAL_TIMEZONE === undefined ? {} : { clientTimeZone: LOCAL_TIMEZONE }),
      }, AbortSignal.timeout(30_000))
      reply(`已发送到 ${where.workspaceTitle} / ${where.sessionTitle}`)
    } catch (error) {
      reply(`发送失败：${describePromptError(error)}`)
    }
  }

  // ── 设置卡片用快照与动作 ───────────────────────────────────────────────

  /** 脱敏状态快照（供 `GET /dsh-feishu-bot/state`）。 */
  async snapshot() {
    const config = this.configSnapshot()
    const binding = this.store.state.binding
    const pending = this.store.state.pendingBind
    let secret = { configured: false, writable: false }
    const credentials = this.ctx.get('credentials')
    if (credentials !== undefined && typeof credentials.describe === 'function') {
      try {
        const info = await credentials.describe(SECRET_REF)
        secret = {
          configured: info?.configured === true,
          ...(typeof info?.source === 'string' ? { source: info.source } : {}),
          writable: info?.writable === true,
        }
      } catch (error) {
        this.logger.warn?.('[feishu-bot] describe credential failed', error)
      }
    } else if (typeof process.env[SECRET_REF] === 'string' && process.env[SECRET_REF].trim() !== '') {
      secret = { configured: true, source: 'env', writable: false }
    }
    const ack = this.store.state.enabledAck
    return {
      enabled: config.enabled,
      appId: config.appId,
      secret,
      bridge: this.bridge.status,
      bridgeError: this.bridge.lastError,
      binding: binding === undefined
        ? { bound: false }
        : {
          bound: true,
          openIdMasked: maskId(binding.openId),
          ...(binding.chatId === undefined ? {} : { chatIdMasked: maskId(binding.chatId) }),
          boundAt: binding.boundAt,
          ...(binding.name === undefined ? {} : { name: binding.name }),
        },
      pendingBind: pending === undefined || Date.now() > pending.expiresAt
        ? null
        : { code: pending.code, expiresAt: pending.expiresAt },
      ack: ack === undefined ? { confirmed: false } : { confirmed: true, at: ack.at },
      prefs: {
        notifyComplete: config.notifyComplete,
        notifyQuestion: config.notifyQuestion,
        notifyApproval: config.notifyApproval,
        completeDebounceMs: config.completeDebounceMs,
        maxResultChars: config.maxResultChars,
        maxCardButtons: config.maxCardButtons,
      },
      interactions: this.takeover.size,
      lastError: this.store.state.lastError ?? null,
    }
  }

  /**
   * 设置卡片的动作分发。
   * @param action - `{action, ...}`。
   * @returns 动作结果（不含状态，外层统一附上最新快照）。
   */
  async runAction(action) {
    const name = typeof action?.action === 'string' ? action.action : ''
    switch (name) {
      case 'saveSecret': {
        await this.saveSecret(action.value)
        return { saved: true }
      }
      case 'clearSecret': {
        await this.clearSecret()
        return { cleared: true }
      }
      case 'beginBind': {
        const code = await this.beginBind()
        return code
      }
      case 'cancelBind': {
        this.cancelBind()
        return {}
      }
      case 'unbind': {
        this.unbind()
        return {}
      }
      case 'sendTest': {
        return await this.sendTest()
      }
      case 'restartBridge': {
        await this.restartBridge()
        return {}
      }
      case 'clearError': {
        this.store.clearError()
        return {}
      }
      default:
        throw new Error(`未知操作：${name === '' ? '(空)' : name}`)
    }
  }
}
