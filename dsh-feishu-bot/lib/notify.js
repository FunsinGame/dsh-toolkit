/**
 * dsh-feishu-bot —— 触发器。
 *
 * 两个独立职责：
 *   - `TurnTracker`：从全局 `session/event` 跟踪每个会话的回合，收集最终助手文本
 *     与工具调用参数，在 `turn/end` 之后（防抖确认真的空闲）通知完成；
 *   - `InteractionTakeover`：在 `user-questions/request` / `approval/request`
 *     两条 host waterfall 上**前置**接管，把请求同步发到飞书，并与桌面端竞速：
 *     先答者生效。
 *
 * 前置（`prepend: true`）是硬性要求：没有浏览器连接时，`api-remotes` 的桥不会
 * resolve，追加在它后面的监听者永远收不到请求。
 *
 * 宿主能力通过 `host` 对象注入，本模块不直接依赖 Cordis 服务。
 */
import { randomUUID } from 'node:crypto'
import { buildApprovalCard, buildQuestionCard, finalizeCard } from './cards.js'
import { cleanUserText, formatTurnReason, parseAnswer, parseApproval, truncate } from './text.js'

/** 一个永不结算的 Promise：用于“卡片没发出去时这一侧不参与竞速”。 */
const NEVER = new Promise(() => {})

/** 回合跟踪里单个回合的状态。 */
function emptyTurn(turn) {
  return { turn, text: '', calls: new Map(), startedAt: Date.now() }
}

/**
 * 回合跟踪 + 完成通知。
 */
export class TurnTracker {
  /** @param host - 见文件头说明。 */
  constructor(host) {
    this.host = host
    this.turns = new Map()
    this.timers = new Map()
    this.off = undefined
    this.disposed = false
  }

  /** 订阅全局 session 事件（scope 过滤要求显式 global）。 */
  attach() {
    if (this.off !== undefined) return
    this.off = this.host.onSessionEvent((session, event) => this.onEvent(session, event))
  }

  /** 取消订阅、清掉未触发的定时器。 */
  detach() {
    this.disposed = true
    if (typeof this.off === 'function') this.off()
    this.off = undefined
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    this.turns.clear()
  }

  /** 取某次工具调用的参数（审批卡片要展示它）。 */
  toolCallOf(sessionId, callId) {
    if (callId === undefined || callId === null) return undefined
    const state = this.turns.get(sessionId)
    if (state === undefined) return undefined
    return state.calls.get(String(callId))
  }

  /** 处理一个 session 事件。 */
  onEvent(session, event) {
    if (this.disposed || session === undefined || event === undefined) return
    const sessionId = session.id
    switch (event.type) {
      case 'turn/start': {
        this.turns.set(sessionId, emptyTurn(event.data?.turn))
        return
      }
      case 'tool/call': {
        const state = this.turns.get(sessionId)
        if (state === undefined) return
        const callId = event.data?.callId
        if (callId === undefined) return
        state.calls.set(String(callId), {
          name: typeof event.data?.name === 'string' ? event.data.name : 'unknown',
          arguments: typeof event.data?.arguments === 'string' ? event.data.arguments : '',
        })
        return
      }
      case 'assistant/message': {
        const state = this.turns.get(sessionId)
        if (state === undefined) return
        const content = event.data?.message?.content
        if (!Array.isArray(content)) return
        const text = content
          .filter(block => block?.type === 'text' && typeof block.text === 'string')
          .map(block => block.text)
          .join('')
        // 与 turnOutline 同口径：最新一条含文本的助手消息胜出。
        if (text.trim() !== '') state.text = text
        return
      }
      case 'turn/end': {
        this.onTurnEnd(session, event.data)
        return
      }
      default:
    }
  }

  /** 回合结束：判定是否通知，并做一次防抖（goal 续轮会紧接着开新回合）。 */
  onTurnEnd(session, data) {
    const sessionId = session.id
    const state = this.turns.get(sessionId)
    this.turns.delete(sessionId)
    const reason = data?.reason
    const formatted = formatTurnReason(reason)
    if (!formatted.notify) return
    if (session.header?.origin === 'subagent') return
    const config = this.host.config()
    if (config.notifyComplete !== true) return
    if (!this.host.ready()) return

    const turn = Number.isFinite(data?.turn) ? data.turn : state?.turn
    const text = state?.text ?? ''
    const existing = this.timers.get(sessionId)
    if (existing !== undefined) clearTimeout(existing)

    const delay = Math.max(0, Math.min(60_000, Number(config.completeDebounceMs) || 0))
    const timer = setTimeout(() => {
      this.timers.delete(sessionId)
      if (this.disposed) return
      // 防抖后复核：如果 Agent 已经在下一轮里，说明这是 goal 续跑，不发中间卡片。
      const status = this.host.agentStatus(sessionId)
      if (status === 'running') return
      void Promise.resolve(this.host.notifyTurnEnd({ sessionId, turn, reason, text, session }))
        .catch((error) => this.host.logger?.warn?.('[feishu-bot] completion notify failed', error))
    }, delay)
    if (typeof timer.unref === 'function') timer.unref()
    this.timers.set(sessionId, timer)
  }
}

/** 提问/审批的待答记录。 */
function describeRecord(record) {
  return {
    kind: record.kind,
    requestId: record.requestId,
    messageId: record.messageId,
    sessionId: record.sessionId,
  }
}

/**
 * 提问与审批的飞书接管。
 */
export class InteractionTakeover {
  /** @param host - 见文件头说明。 */
  constructor(host) {
    this.host = host
    this.pending = new Map()
    this.offs = []
    this.disposed = false
  }

  /**
   * 注册两条 waterfall 监听（前置）。
   * @param ctx - 宿主 Cordis 上下文。
   */
  attach(ctx) {
    if (this.disposed) return
    const questions = ctx.on('user-questions/request', (request, next) => this.begin('question', request, next), { prepend: true })
    const approvals = ctx.on('approval/request', (request, next) => this.begin('approval', request, next), { prepend: true })
    this.offs.push(questions, approvals)
  }

  /** 卸下监听并让所有未答卡片失效。 */
  detach() {
    this.disposed = true
    for (const off of this.offs) {
      if (typeof off !== 'function') continue
      try {
        off()
      } catch {
        // 已经是失效的上下文也没关系。
      }
    }
    this.offs = []
    for (const record of this.pending.values()) this.expire(record.requestId, false)
    this.pending.clear()
  }

  /** 当前待答的请求数（诊断用）。 */
  get size() {
    return this.pending.size
  }

  /**
   * 一次请求的竞速入口。
   * @returns 桌面端或飞书的回答，先到者胜。
   */
  begin(kind, request, next) {
    if (this.disposed || this.host.ready() !== true) return next()
    const config = this.host.config()
    if (kind === 'question' ? config.notifyQuestion !== true : config.notifyApproval !== true) return next()
    const agent = request?.agent
    if (agent === undefined || agent === null) return next()
    const sessionId = this.host.sessionIdOf(agent)
    if (sessionId === undefined) return next()

    let local
    try {
      local = next()
    } catch (error) {
      // 链路本身坏了就不再做任何事，让错误按原样冒泡。
      throw error
    }
    const requestId = randomUUID()
    const remote = this.startRemote({ kind, request, requestId, sessionId, local })
      // 卡片发不出去时 startRemote 解析为 null：把这一侧变成“永不结算”，
      // 让桌面端的结果照常胜出。
      .then(result => (result === null || result === undefined ? NEVER : result))
    return Promise.race([local, remote])
  }

  /**
   * 发卡片并登记待答；发不出去时返回 undefined（只用桌面端的结果）。
   * @returns 一个只在用户真正作答时 resolve 的 Promise。
   */
  startRemote({ kind, request, requestId, sessionId, local }) {
    return this.postCard(kind, request, requestId, sessionId).then((posted) => {
      if (posted === null) return null
      return new Promise((resolve) => {
        const record = {
          kind,
          requestId,
          messageId: posted.messageId,
          card: posted.card,
          sessionId,
          signal: request?.signal ?? undefined,
          questions: Array.isArray(request?.questions) ? request.questions : [],
          resolve,
          settled: false,
        }
        this.pending.set(requestId, record)
        const signal = request?.signal
        if (signal !== undefined && signal !== null) {
          record.onAbort = () => this.expire(requestId, true)
          signal.addEventListener('abort', record.onAbort, { once: true })
          if (signal.aborted) this.expire(requestId, true)
        }
        // 桌面端先答：把卡片标记为“已在 DSH 中处理”，并释放待答记录。
        const finishLocal = () => {
          if (record.settled) return
          this.settleRecord(record, undefined, {
            line: '🖥 已经在 DSH 中回答或处理',
            template: 'grey',
          })
        }
        void Promise.resolve(local).then(finishLocal, finishLocal)
      })
    }).catch((error) => {
      this.host.noteError?.(`发送卡片失败：${error instanceof Error ? error.message : String(error)}`)
      return null
    })
  }

  /** 构建并发送一张交互卡片；失败返回 null。 */
  async postCard(kind, request, requestId, sessionId) {
    const config = this.host.config()
    const where = this.host.describe(sessionId)
    const card = kind === 'question'
      ? buildQuestionCard({
        workspaceTitle: where.workspaceTitle,
        sessionTitle: where.sessionTitle,
        questions: request.questions,
        requestId,
        maxButtons: config.maxCardButtons,
      })
      : buildApprovalCard({
        workspaceTitle: where.workspaceTitle,
        sessionTitle: where.sessionTitle,
        toolName: request.toolName,
        toolArgs: request.callId === undefined
          ? ''
          : (this.host.toolCallOf?.(sessionId, request.callId)?.arguments ?? ''),
        reason: request.reason,
        requestId,
      })
    const messageId = await this.host.sendInteractionCard(card, { sessionId, kind, requestId })
    if (messageId === null) return null
    return { messageId, card }
  }

  /** 按 requestId 结算。 */
  settle(requestId, outcome, spec) {
    const record = this.pending.get(requestId)
    if (record === undefined || record.settled) return false
    this.settleRecord(record, outcome, spec)
    return true
  }

  /** 结算一条记录：解决等待、清理、更新卡片。 */
  settleRecord(record, outcome, spec = {}) {
    if (record.settled) return
    record.settled = true
    this.pending.delete(record.requestId)
    if (record.onAbort !== undefined) {
      try {
        record.signal?.removeEventListener?.('abort', record.onAbort)
      } catch {
        // 忽略：信号可能已不可用。
      }
    }
    if (outcome !== undefined) record.resolve(outcome)
    const finalCard = finalizeCard(record.card, {
      line: spec.line ?? '✅ 已处理',
      template: spec.template ?? 'grey',
      markTitle: true,
    })
    void Promise.resolve(this.host.patchCard(record.messageId, finalCard)).catch(() => {})
  }

  /** 请求失效（被取消/超时/插件卸载）：卡片标记失效。 */
  expire(requestId, patch = true) {
    const record = this.pending.get(requestId)
    if (record === undefined) return
    if (patch) {
      const finalCard = finalizeCard(record.card, {
        line: '⏱ 已失效（请求被取消或超时）',
        template: 'grey',
        markTitle: true,
      })
      void Promise.resolve(this.host.patchCard(record.messageId, finalCard)).catch(() => {})
    }
    record.settled = true
    this.pending.delete(requestId)
    if (record.onAbort !== undefined) {
      try {
        record.signal?.removeEventListener?.('abort', record.onAbort)
      } catch {
        // 忽略。
      }
    }
  }

  /** 通过卡片消息 id 找待答记录（文本回复路由用）。 */
  findByMessage(messageId) {
    if (typeof messageId !== 'string' || messageId === '') return undefined
    for (const record of this.pending.values()) {
      if (record.messageId === messageId) return record
    }
    return undefined
  }

  /**
   * 卡片按钮回调。
   *
   * 必须在 3 秒内返回，因此这里只做内存操作；发送/更新都走返回值里的 card。
   * @returns `{toast, card}` 或空对象。
   */
  handleCardAction(payload) {
    const value = payload?.action?.value
    if (value === undefined || value === null || typeof value !== 'object') return {}
    if (value.act === 'ack') {
      const handled = this.host.confirmAck?.(payload) ?? false
      return handled
        ? { toast: { type: 'success', content: '已确认，飞书通知已就绪' } }
        : { toast: { type: 'info', content: '已收到' } }
    }
    if (typeof value.req !== 'string') return {}
    const record = this.pending.get(value.req)
    if (record === undefined) {
      return { toast: { type: 'info', content: '这条请求已经处理，或已经失效' } }
    }
    if (record.kind === 'question' && value.kind === 'q') {
      return this.answerByButton(record, value)
    }
    if (record.kind === 'approval' && value.kind === 'a') {
      return this.answerApproval(record, value.act === 'allow' ? 'allowed-once' : 'rejected')
    }
    return { toast: { type: 'info', content: '这个操作与当前请求不匹配' } }
  }

  /** 单选按钮作答。 */
  answerByButton(record, value) {
    const question = record.questions.find(item => item?.id === value.q)
    const options = Array.isArray(question?.options) ? question.options : []
    const option = options[value.i]
    if (question === undefined || option === undefined || typeof option.label !== 'string') {
      return { toast: { type: 'error', content: '这个选项已经不可用' } }
    }
    const outcome = {
      kind: 'question',
      answers: [{ id: question.id, selected: [option.label] }],
    }
    const finalCard = finalizeCard(record.card, {
      line: `✅ 你的选择：${option.label}`,
      template: 'green',
      markTitle: true,
    })
    this.settleRecord(record, outcome, { line: `✅ 你的选择：${option.label}`, template: 'green' })
    return {
      toast: { type: 'success', content: `已选择：${truncate(option.label, 60, '…')}` },
      card: { type: 'raw', data: finalCard },
    }
  }

  /** 审批按钮作答。 */
  answerApproval(record, outcome) {
    const line = outcome === 'allowed-once' ? '✅ 已允许一次' : '❌ 已拒绝'
    const finalCard = finalizeCard(record.card, { line, template: outcome === 'allowed-once' ? 'green' : 'red', markTitle: true })
    this.settleRecord(record, outcome, { line, template: outcome === 'allowed-once' ? 'green' : 'red' })
    return {
      toast: { type: 'success', content: line.replace(/^\S+\s*/u, '') },
      card: { type: 'raw', data: finalCard },
    }
  }

  /**
   * 文本回复作答（引用卡片）。
   * @param record - 待答记录。
   * @param rawText - 清洗后的文本。
   * @returns 给用户的回执文本；已结算返回 undefined。
   */
  answerByText(record, rawText) {
    if (record.kind === 'approval') {
      const outcome = parseApproval(rawText)
      if (outcome === undefined) return '请回复「允许」或「拒绝」。'
      const line = outcome === 'allowed-once' ? '✅ 已允许一次（文本回复）' : '❌ 已拒绝（文本回复）'
      this.settleRecord(record, outcome, { line, template: outcome === 'allowed-once' ? 'green' : 'red' })
      return line
    }
    const parsed = parseAnswer(record.questions, rawText)
    if (parsed.ok !== true) {
      if (parsed.reason === 'missing') {
        const names = parsed.missing
          .map(id => {
            const index = record.questions.findIndex(question => question?.id === id)
            return index === -1 ? id : `Q${index + 1}`
          })
          .join('、')
        return `还差这些没回答：${names}。请按「1. 答案」的格式补齐。`
      }
      if (parsed.reason === 'unknown-option') {
        return `没认出这些选项：${(parsed.tokens ?? []).join('、')}。请回复选项编号或选项文字。`
      }
      return '没看懂这个回答，可以点卡片按钮，或按提示回复编号/选项文字。'
    }
    const summary = parsed.answers
      .map(answer => {
        const labels = answer.selected.length > 0 ? answer.selected.join('、') : ''
        const custom = typeof answer.custom === 'string' && answer.custom !== '' ? answer.custom : ''
        return [labels, custom].filter(Boolean).join(' / ')
      })
      .join('；')
    const line = `✅ 已回答：${truncate(summary, 200, '…')}`
    this.settleRecord(record, { kind: 'question', answers: parsed.answers }, { line, template: 'green' })
    return line
  }
}

/** 从飞书消息负载里取“被回复的那条消息 id”。 */
export function quotedMessageId(payload) {
  const message = payload?.message
  if (message === undefined || message === null) return undefined
  const parent = message.parent_id
  if (typeof parent === 'string' && parent !== '') return parent
  const root = message.root_id
  if (typeof root === 'string' && root !== '') return root
  return undefined
}

/** 从飞书消息负载里取发送者 open_id。 */
export function senderOpenId(payload) {
  const openId = payload?.sender?.sender_id?.open_id
  return typeof openId === 'string' && openId !== '' ? openId : undefined
}

/** 从飞书消息负载里取文本（已清洗）。 */
export function messageText(payload) {
  const message = payload?.message
  if (message === undefined || message === null) return ''
  if (message.message_type !== 'text') return ''
  return cleanUserText(JSON.parse(message.content ?? '{}')?.text ?? '', message.mentions)
}
