/**
 * dsh-feishu-bot 宿主半侧测试。
 *
 * 全部离线：用内存假件替代 Cordis 上下文、飞书 SDK 与状态目录。
 * 覆盖：文本解析、卡片构建、状态文件、连接层、回合跟踪、提问/审批竞速、
 * 路由信任闸、服务层的飞书消息路由。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const { parseAnswer, parseApproval, cleanUserText, parseMessageContent, matchBindCode, truncate, formatTurnReason, describePromptError, answerHint } = await import('../lib/text.js')
const { buildCompleteCard, buildApprovalCard, buildQuestionCard, buildNoticeCard, buildEnabledCard, buildTestCard, finalizeCard, fitCard, cardBytes, cardTitleOf, ACTIONS_ELEMENT_ID } = await import('../lib/cards.js')
const { StateStore, pruneCards, maskId, coerceState, emptyState, CARD_TTL_DAYS } = await import('../lib/store.js')
const { FeishuBridge, describeTransportError } = await import('../lib/bridge.js')
const { TurnTracker, InteractionTakeover, quotedMessageId, senderOpenId, messageText } = await import('../lib/notify.js')
const { FeishuBotService } = await import('../lib/service.js')
const { registerRoutes, ROUTE_STATE, ROUTE_ACTION } = await import('../lib/routes.js')

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const silent = { info() {}, warn() {}, error() {} }

function tempDir(label) {
  const dir = mkdtempSync(join(tmpdir(), `dsh-feishu-bot-${label}-`))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/** 找出卡片里的按钮行。 */
function actionRowOf(card) {
  return card.body.elements.find(element => element.element_id === ACTIONS_ELEMENT_ID)
}

/** 按钮的 callback value。 */
function buttonValues(card) {
  const row = actionRowOf(card)
  if (row === undefined) return []
  return row.columns.map(column => column.elements[0].behaviors[0].value)
}

// ── text.js ──────────────────────────────────────────────────────────────

test('text: 解析飞书 content JSON 与 @ 占位符', () => {
  assert.equal(parseMessageContent('{"text":"你好"}'), '你好')
  assert.equal(parseMessageContent('not json'), '')
  assert.equal(parseMessageContent(''), '')
  const cleaned = cleanUserText('@_user_1 请继续 <at id=all></at>', [
    { key: '@_user_1', name: '机器人' },
  ])
  assert.equal(cleaned, '@机器人 请继续')
})

test('text: 绑定码宽松匹配', () => {
  assert.equal(matchBindCode('123456', '123456'), true)
  assert.equal(matchBindCode('  123456 ', '123456'), true)
  assert.equal(matchBindCode('/bind 123456', '123456'), true)
  assert.equal(matchBindCode('绑定 123456', '123456'), true)
  assert.equal(matchBindCode('123457', '123456'), false)
  assert.equal(matchBindCode('', '123456'), false)
})

test('text: 截断按码点计算', () => {
  assert.equal(truncate('abcdef', 3, '…'), 'ab…')
  assert.equal(truncate('abc', 10, '…'), 'abc')
  assert.equal(truncate('abcdef', 4, ''), 'abcd')
})

test('text: 单问题回答（选项/数字/自定义/多选）', () => {
  const single = { id: 'q1', question: '选哪个', options: [{ label: 'A' }, { label: 'B' }] }
  assert.deepEqual(parseAnswer([single], 'B'), {
    ok: true,
    answers: [{ id: 'q1', selected: ['B'] }],
  })
  assert.deepEqual(parseAnswer([single], '2'), {
    ok: true,
    answers: [{ id: 'q1', selected: ['B'] }],
  })
  assert.deepEqual(parseAnswer([single], '随便'), {
    ok: true,
    answers: [{ id: 'q1', selected: [], custom: '随便' }],
  })
  const multi = { id: 'q2', question: '多选', multiSelect: true, options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] }
  assert.deepEqual(parseAnswer([multi], '1, 3'), {
    ok: true,
    answers: [{ id: 'q2', selected: ['A', 'C'] }],
  })
  assert.deepEqual(parseAnswer([multi], 'A、B'), {
    ok: true,
    answers: [{ id: 'q2', selected: ['A', 'B'] }],
  })
  const free = { id: 'q3', question: '说说看' }
  assert.deepEqual(parseAnswer([free], '  就这个 '), {
    ok: true,
    answers: [{ id: 'q3', selected: [], custom: '就这个' }],
  })
})

test('text: 多问题回答（逐行/压缩/缺项/未知选项）', () => {
  const questions = [
    { id: 'q1', question: '一', options: [{ label: 'A' }, { label: 'B' }] },
    { id: 'q2', question: '二', options: [{ label: 'C' }, { label: 'D' }] },
  ]
  assert.deepEqual(parseAnswer(questions, '1. A\n2. D'), {
    ok: true,
    answers: [{ id: 'q1', selected: ['A'] }, { id: 'q2', selected: ['D'] }],
  })
  assert.deepEqual(parseAnswer(questions, '1=B, 2=C'), {
    ok: true,
    answers: [{ id: 'q1', selected: ['B'] }, { id: 'q2', selected: ['C'] }],
  })
  const missing = parseAnswer(questions, '1. A')
  assert.equal(missing.ok, false)
  assert.equal(missing.reason, 'missing')
  assert.deepEqual(missing.missing, ['q2'])
  // 单个不匹配的词按“自定义回答”处理（与 DSH 的 Other 语义一致）。
  assert.deepEqual(parseAnswer(questions, '1. ZZ\n2. C'), {
    ok: true,
    answers: [{ id: 'q1', selected: [], custom: 'ZZ' }, { id: 'q2', selected: ['C'] }],
  })
  // 多个不匹配的词才算认不出选项。
  const unknown = parseAnswer(questions, '1. ZZ YY\n2. C')
  assert.equal(unknown.ok, false)
  assert.equal(unknown.reason, 'unknown-option')
  assert.deepEqual(unknown.tokens, ['ZZ', 'YY'])
  assert.equal(parseAnswer(questions, '没有编号').reason, 'format')
  assert.equal(parseAnswer(questions, '   ').reason, 'empty')
  assert.equal(parseAnswer([], 'x').reason, 'no-questions')
})

test('text: 审批词表', () => {
  assert.equal(parseApproval('允许'), 'allowed-once')
  assert.equal(parseApproval('yes'), 'allowed-once')
  assert.equal(parseApproval('拒绝'), 'rejected')
  assert.equal(parseApproval('no'), 'rejected')
  assert.equal(parseApproval('再看看'), undefined)
  assert.equal(parseApproval(''), undefined)
})

test('text: 回合原因与错误说明', () => {
  assert.deepEqual(formatTurnReason({ kind: 'completed' }), { label: '完成', template: 'green', notify: true })
  assert.equal(formatTurnReason({ kind: 'error', error: { message: 'boom' } }).detail, 'boom')
  assert.equal(formatTurnReason({ kind: 'forked' }).notify, false)
  assert.equal(formatTurnReason(undefined).label, '结束')
  assert.match(describePromptError({ code: 'session/not-found' }), /不存在/u)
  assert.match(describePromptError({ code: 'weird', message: '细节' }), /细节/u)
  assert.match(answerHint([{ options: [{ label: 'a' }] }], 6), /按钮/u)
  assert.match(answerHint([{ options: [{ label: 'a' }] }], 1), /编号/u)
})

// ── cards.js ─────────────────────────────────────────────────────────────

test('cards: 完成卡片包含工作区、会话与结果，且没有按钮', () => {
  const card = buildCompleteCard({
    workspaceTitle: 'dsh-toolkit',
    sessionTitle: '修一下通知',
    turn: 3,
    reason: { kind: 'completed' },
    resultText: '已经改好了。',
    now: Date.UTC(2026, 9, 30, 3, 0, 0),
  })
  assert.equal(card.schema, '2.0')
  assert.equal(card.config.update_multi, true)
  assert.match(cardTitleOf(card), /任务完成/u)
  assert.match(cardTitleOf(card), /dsh-toolkit/u)
  const text = JSON.stringify(card.body.elements)
  assert.match(text, /修一下通知/u)
  assert.match(text, /已经改好了/u)
  assert.equal(actionRowOf(card), undefined)
  assert.match(text, /引用本卡片回复/u)
})

test('cards: 失败回合用红色标题并带原因', () => {
  const card = buildCompleteCard({
    workspaceTitle: 'w', sessionTitle: 's', turn: 1,
    reason: { kind: 'error', error: { message: 'API 超时' } }, resultText: '',
  })
  assert.equal(card.header.template, 'red')
  assert.match(JSON.stringify(card.body.elements), /API 超时/u)
})

test('cards: 单个单选问题出按钮，value 带 req/kind/q/i', () => {
  const card = buildQuestionCard({
    workspaceTitle: 'w', sessionTitle: 's',
    questions: [{ id: 'q1', question: '选哪个', options: [{ label: 'A' }, { label: 'B' }] }],
    requestId: 'rid',
  })
  const values = buttonValues(card)
  assert.deepEqual(values, [
    { v: 1, req: 'rid', kind: 'q', q: 'q1', i: 0 },
    { v: 1, req: 'rid', kind: 'q', q: 'q1', i: 1 },
  ])
})

test('cards: 多选/多问题/选项过多时改为编号列表', () => {
  const multiSelect = buildQuestionCard({
    questions: [{ id: 'q1', question: '多选', multiSelect: true, options: [{ label: 'A' }, { label: 'B' }] }],
    requestId: 'rid',
  })
  assert.equal(actionRowOf(multiSelect), undefined)
  assert.match(JSON.stringify(multiSelect.body.elements), /1\. A/u)

  const many = buildQuestionCard({
    questions: [{ id: 'q1', question: '很多', options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] }],
    requestId: 'rid',
    maxButtons: 2,
  })
  assert.equal(actionRowOf(many), undefined)

  const multiple = buildQuestionCard({
    questions: [
      { id: 'q1', question: '一', options: [{ label: 'A' }] },
      { id: 'q2', question: '二', options: [{ label: 'B' }] },
    ],
    requestId: 'rid',
  })
  assert.equal(actionRowOf(multiple), undefined)
  assert.match(JSON.stringify(multiple.body.elements), /Q1/u)
})

test('cards: plan-review 详情进入卡片', () => {
  const card = buildQuestionCard({
    questions: [{
      id: 'plan',
      question: '是否批准计划',
      detail: '# 计划\n\n第一步',
      intent: { kind: 'plan-review', approve: '批准' },
      options: [{ label: '批准' }, { label: '拒绝' }],
    }],
    requestId: 'rid',
  })
  assert.match(JSON.stringify(card.body.elements), /第一步/u)
  assert.equal(buttonValues(card).length, 2)
})

test('cards: 审批卡片两个按钮 + 参数摘录', () => {
  const card = buildApprovalCard({
    workspaceTitle: 'w', sessionTitle: 's', toolName: 'pwsh',
    toolArgs: '{"command":"Get-ChildItem"}', reason: '需要写工作区外',
    requestId: 'rid',
  })
  assert.equal(card.header.template, 'orange')
  assert.deepEqual(buttonValues(card), [
    { v: 1, req: 'rid', kind: 'a', act: 'allow' },
    { v: 1, req: 'rid', kind: 'a', act: 'reject' },
  ])
  assert.match(JSON.stringify(card.body.elements), /Get-ChildItem/u)
  assert.match(JSON.stringify(card.body.elements), /需要写工作区外/u)
})

test('cards: finalize 去掉按钮并追加状态', () => {
  const card = buildApprovalCard({ questions: [], requestId: 'rid' })
  const finalCard = finalizeCard(card, { line: '✅ 已允许一次', template: 'green', markTitle: true })
  assert.equal(actionRowOf(finalCard), undefined)
  assert.equal(finalCard.header.template, 'green')
  assert.match(cardTitleOf(finalCard), /已处理/u)
  assert.match(JSON.stringify(finalCard.body.elements), /已允许一次/u)
  // 原卡片不被修改
  assert.notEqual(actionRowOf(card), undefined)
})

test('cards: 超过大小上限会继续收缩', () => {
  const card = buildCompleteCard({
    workspaceTitle: 'w', sessionTitle: 's', turn: 1,
    reason: { kind: 'completed' },
    resultText: 'x'.repeat(60_000),
    maxResultChars: 20_000,
  })
  assert.ok(cardBytes(card) <= 28_000, `bytes=${cardBytes(card)}`)
})

test('cards: 通知类与测试卡片', () => {
  assert.match(cardTitleOf(buildEnabledCard({ workspaceCount: 3 })), /已开启/u)
  assert.equal(buttonValues(buildEnabledCard({})).length, 1)
  assert.match(cardTitleOf(buildTestCard({})), /测试/u)
  const notice = buildNoticeCard({ title: 't', lines: ['a'], footer: 'f' })
  assert.equal(cardTitleOf(notice), 't')
})

// ── store.js ─────────────────────────────────────────────────────────────

test('store: 保存/读取往返，且丢弃未知字段', () => {
  const { dir, cleanup } = tempDir('store')
  try {
    const store = new StateStore({ directory: dir })
    store.load()
    assert.equal(store.state.binding, undefined)
    store.state.binding = { openId: 'ou_1', chatId: 'oc_1', boundAt: 'now' }
    store.state.lastError = { at: 1, message: 'x' }
    store.save()
    const again = new StateStore({ directory: dir })
    again.load()
    assert.equal(again.state.binding.openId, 'ou_1')
    assert.equal(again.state.binding.chatId, 'oc_1')
    assert.equal(again.state.lastError.message, 'x')
    const raw = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'))
    assert.equal(raw.version, 1)
  } finally {
    cleanup()
  }
})

test('store: 损坏文件被备份并重建', () => {
  const { dir, cleanup } = tempDir('corrupt')
  try {
    writeFileSync(join(dir, 'state.json'), '{ not json', 'utf8')
    const store = new StateStore({ directory: dir })
    store.load()
    assert.deepEqual(store.state, emptyState())
    assert.equal(existsSync(join(dir, 'state.json')), false)
    const backups = readdirSync(dir).filter(name => name.startsWith('state.json.bad-'))
    assert.equal(backups.length, 1)
  } finally {
    cleanup()
  }
})

test('store: 过期卡片被裁剪，超过上限时保留最新', () => {
  const state = emptyState()
  const day = 86_400_000
  const now = Date.UTC(2026, 9, 30)
  state.cards.old = { sessionId: 's1', kind: 'complete', at: now - (CARD_TTL_DAYS + 1) * day }
  state.cards.fresh = { sessionId: 's2', kind: 'complete', at: now - day }
  pruneCards(state, now)
  assert.equal(state.cards.old, undefined)
  assert.equal(state.cards.fresh.sessionId, 's2')
})

test('store: 卡片/错误辅助方法与 id 脱敏', () => {
  const { dir, cleanup } = tempDir('helpers')
  try {
    const store = new StateStore({ directory: dir })
    store.load()
    store.rememberCard('om_1', { sessionId: 's1', kind: 'question', requestId: 'r1' })
    assert.equal(store.cardFor('om_1').requestId, 'r1')
    assert.equal(store.cardFor('missing'), undefined)
    store.noteError('boom')
    assert.equal(store.state.lastError.message, 'boom')
    store.clearError()
    assert.equal(store.state.lastError, undefined)
    assert.equal(maskId('ou_abcdefghij'), 'ou_ab****ij')
    assert.equal(maskId(''), '')
    assert.equal(coerceState({ version: 9, extra: true }).version, 1)
  } finally {
    cleanup()
  }
})

// ── bridge.js ────────────────────────────────────────────────────────────

function fakeSdk() {
  const calls = { create: [], reply: [], patch: [] }
  const state = { started: 0, closed: 0, handlers: undefined, status: 'connected' }
  const sdk = {
    LoggerLevel: { info: 2 },
    Client: class {
      constructor(config) {
        this.config = config
        this.im = {
          v1: {
            message: {
              create: async (args) => {
                calls.create.push(args)
                return { code: 0, data: { message_id: `om_${calls.create.length}` } }
              },
              reply: async (args) => {
                calls.reply.push(args)
                return { code: 0, data: {} }
              },
              patch: async (args) => {
                calls.patch.push(args)
                if (state.status === 'patch-fail') return { code: 230001, msg: 'expired' }
                return { code: 0, data: {} }
              },
            },
          },
        }
      }
    },
    WSClient: class {
      async start({ eventDispatcher }) {
        state.started += 1
        state.handlers = eventDispatcher.handlers
      }

      async close() {
        state.closed += 1
      }
    },
    EventDispatcher: class {
      register(handlers) {
        this.handlers = handlers
        return this
      }
    },
  }
  return { sdk, calls, state }
}

test('bridge: 建连、发卡片、patch、去重与失败', async () => {
  const fake = fakeSdk()
  const messages = []
  const actions = []
  const bridge = new FeishuBridge({
    logger: silent,
    sdkLoader: async () => fake.sdk,
    onEvent: {
      message: (payload) => { messages.push(payload); return Promise.resolve() },
      cardAction: (payload) => { actions.push(payload); return { toast: { type: 'success', content: 'ok' } } },
    },
  })
  assert.equal(bridge.ready, false)
  await bridge.start({ appId: 'cli_1', appSecret: 'secret' })
  assert.equal(bridge.status, 'connected')
  assert.equal(bridge.ready, true)
  assert.equal(fake.state.started, 1)

  const messageId = await bridge.sendCard('oc_1', { schema: '2.0' })
  assert.equal(messageId, 'om_1')
  assert.equal(fake.calls.create[0].params.receive_id_type, 'chat_id')
  assert.equal(fake.calls.create[0].data.msg_type, 'interactive')

  const byOpenId = await bridge.sendCard('ou_1', { schema: '2.0' })
  assert.equal(byOpenId, 'om_2')
  assert.equal(fake.calls.create[1].params.receive_id_type, 'open_id')

  await bridge.replyText('om_1', '收到')
  assert.equal(fake.calls.reply[0].path.message_id, 'om_1')

  assert.equal(await bridge.patchCard('om_1', { schema: '2.0' }), true)
  assert.equal(fake.calls.patch.length, 1)
  fake.state.status = 'patch-fail'
  assert.equal(await bridge.patchCard('om_1', { schema: '2.0' }), false)

  const handlers = fake.state.handlers
  const payload = { message: { message_id: 'om_in' }, sender: { sender_id: { open_id: 'ou_1' } } }
  assert.deepEqual(handlers['im.message.receive_v1'](payload), {})
  handlers['im.message.receive_v1'](payload)
  await sleep(0)
  assert.equal(messages.length, 1, '重复投递只处理一次')

  const action = { header: { event_id: 'ev_1' }, context: { open_message_id: 'om_1' } }
  assert.equal(handlers['card.action.trigger'](action).toast.content, 'ok')
  assert.equal(handlers['card.action.trigger'](action).toast.content, '这条操作已经处理过了')
  assert.equal(actions.length, 1)

  await bridge.stop()
  assert.equal(bridge.status, 'stopped')
  assert.equal(fake.state.closed, 1)
})

test('bridge: 发送失败抛出飞书错误码', async () => {
  const fake = fakeSdk()
  const bridge = new FeishuBridge({ logger: silent, sdkLoader: async () => fake.sdk })
  await bridge.start({ appId: 'cli_1', appSecret: 'secret' })
  bridge.client.im.v1.message.create = async () => ({ code: 230013, msg: 'Bot has NO availability to this user' })
  await assert.rejects(() => bridge.sendCard('ou_1', {}), /230013/u)
  await bridge.stop()
})

test('bridge: 缺凭据与 SDK 加载失败都给出明确错误', async () => {
  const bridge = new FeishuBridge({ logger: silent, sdkLoader: async () => { throw new Error('missing sdk') } })
  await assert.rejects(() => bridge.start({ appId: '', appSecret: '' }), /缺少 app_id/u)
  await assert.rejects(() => bridge.start({ appId: 'a', appSecret: 'b' }), /missing sdk/u)
  assert.equal(bridge.status, 'error')
})

// ── notify.js ────────────────────────────────────────────────────────────

function fakeCtx() {
  const handlers = new Map()
  return {
    handlers,
    on(event, handler, options) {
      const list = handlers.get(event) ?? []
      const entry = { handler, options }
      list.push(entry)
      handlers.set(event, list)
      return () => {
        const current = handlers.get(event) ?? []
        const index = current.indexOf(entry)
        if (index !== -1) current.splice(index, 1)
      }
    },
    emit(event, ...args) {
      for (const entry of [...(handlers.get(event) ?? [])]) entry.handler(...args)
    },
    async waterfall(event, request, fallback) {
      const list = [...(handlers.get(event) ?? [])]
      let index = 0
      const next = () => {
        const entry = list[index]
        index += 1
        if (entry === undefined) return typeof fallback === 'function' ? fallback() : fallback
        return entry.handler(request, next)
      }
      return next()
    },
    optionsOf(event) {
      return (handlers.get(event) ?? []).map(entry => entry.options)
    },
  }
}

function trackerHost(overrides = {}) {
  const notifications = []
  return {
    notifications,
    logger: silent,
    config: () => ({
      enabled: true,
      notifyComplete: true,
      notifyQuestion: true,
      notifyApproval: true,
      completeDebounceMs: 0,
      maxResultChars: 3000,
      maxCardButtons: 6,
      ...overrides.config,
    }),
    ready: () => overrides.ready ?? true,
    onSessionEvent: undefined,
    agentStatus: overrides.agentStatus ?? (() => 'idle'),
    sessionIdOf: (agent) => agent.session.id,
    describe: () => ({ workspaceTitle: 'w', sessionTitle: 's' }),
    toolCallOf: overrides.toolCallOf ?? (() => undefined),
    sendInteractionCard: overrides.sendInteractionCard ?? (async () => 'om_card'),
    patchCard: overrides.patchCard ?? (async () => true),
    noteError: overrides.noteError ?? (() => {}),
    confirmAck: overrides.confirmAck ?? (() => true),
    notifyTurnEnd: async (spec) => {
      notifications.push(spec)
    },
  }
}

function attachTracker(host) {
  const ctx = fakeCtx()
  const tracker = new TurnTracker(host)
  host.onSessionEvent = (handler) => ctx.on('session/event', handler, { global: true })
  tracker.attach()
  return { ctx, tracker }
}

const SESSION = { id: 'session-1', header: { cwd: 'C:\\work\\demo' } }

test('tracker: 回合结束后通知，取最新含文本的助手消息', async () => {
  const host = trackerHost()
  const { ctx, tracker } = attachTracker(host)
  ctx.emit('session/event', SESSION, { type: 'turn/start', data: { turn: 1 } })
  ctx.emit('session/event', SESSION, { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: '旧' }, { type: 'reasoning', text: '想' }] } } })
  ctx.emit('session/event', SESSION, { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: '最终答案' }] } } })
  ctx.emit('session/event', SESSION, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  await sleep(20)
  assert.equal(host.notifications.length, 1)
  assert.equal(host.notifications[0].text, '最终答案')
  assert.equal(host.notifications[0].sessionId, 'session-1')
  tracker.detach()
  assert.equal(ctx.handlers.get('session/event').length, 0)
})

test('tracker: 子智能体、关闭通知、goal 续轮都不发', async () => {
  const cases = [
    { label: 'subagent', session: { id: 's', header: { origin: 'subagent' } }, host: trackerHost() },
    { label: 'disabled', session: SESSION, host: trackerHost({ config: { notifyComplete: false } }) },
    { label: 'running', session: SESSION, host: trackerHost({ agentStatus: () => 'running' }) },
    { label: 'not-ready', session: SESSION, host: trackerHost({ ready: false }) },
    { label: 'forked', session: SESSION, host: trackerHost() },
  ]
  for (const item of cases) {
    const { ctx, tracker } = attachTracker(item.host)
    ctx.emit('session/event', item.session, { type: 'turn/start', data: { turn: 1 } })
    ctx.emit('session/event', item.session, { type: 'turn/end', data: { turn: 1, reason: { kind: item.label === 'forked' ? 'forked' : 'completed' } } })
    await sleep(20)
    assert.equal(item.host.notifications.length, 0, `${item.label} 不应通知`)
    tracker.detach()
  }
})

test('tracker: 防抖窗口内新的 turn/end 覆盖旧的定时器', async () => {
  const host = trackerHost({ config: { completeDebounceMs: 30 } })
  const { ctx, tracker } = attachTracker(host)
  ctx.emit('session/event', SESSION, { type: 'turn/start', data: { turn: 1 } })
  ctx.emit('session/event', SESSION, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  ctx.emit('session/event', SESSION, { type: 'turn/start', data: { turn: 2 } })
  ctx.emit('session/event', SESSION, { type: 'assistant/message', data: { turn: 2, message: { content: [{ type: 'text', text: '第二轮' }] } } })
  ctx.emit('session/event', SESSION, { type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } })
  await sleep(60)
  assert.equal(host.notifications.length, 1)
  assert.equal(host.notifications[0].text, '第二轮')
  tracker.detach()
})

test('tracker: 工具调用参数可供审批卡片使用', async () => {
  const host = trackerHost()
  const { ctx, tracker } = attachTracker(host)
  ctx.emit('session/event', SESSION, { type: 'turn/start', data: { turn: 1 } })
  ctx.emit('session/event', SESSION, { type: 'tool/call', data: { turn: 1, step: 1, callId: 'call-1', name: 'pwsh', arguments: '{"command":"ls"}' } })
  assert.deepEqual(tracker.toolCallOf('session-1', 'call-1'), { name: 'pwsh', arguments: '{"command":"ls"}' })
  assert.equal(tracker.toolCallOf('session-1', 'nope'), undefined)
  tracker.detach()
})

function takeoverHost(overrides = {}) {
  const sent = []
  const patches = []
  const errors = []
  let card = 0
  return {
    sent,
    patches,
    errors,
    logger: silent,
    config: () => ({
      enabled: true,
      notifyComplete: true,
      notifyQuestion: true,
      notifyApproval: true,
      maxResultChars: 3000,
      maxCardButtons: 6,
      ...overrides.config,
    }),
    ready: () => overrides.ready ?? true,
    sessionIdOf: (agent) => agent.session.id,
    describe: () => ({ workspaceTitle: 'w', sessionTitle: 's' }),
    toolCallOf: () => undefined,
    sendInteractionCard: overrides.sendInteractionCard ?? (async (built, meta) => {
      card += 1
      sent.push({ card: built, meta })
      return `om_${card}`
    }),
    patchCard: overrides.patchCard ?? (async (messageId, built) => {
      patches.push({ messageId, card: built })
      return true
    }),
    noteError: (message) => errors.push(message),
    confirmAck: () => true,
  }
}

const QUESTION_REQUEST = {
  questions: [{ id: 'q1', question: '选哪个', options: [{ label: 'A' }, { label: 'B' }] }],
  agent: { session: { id: 'session-1' } },
}

test('takeover: 桌面先答时返回本地答案并把卡片标记为已处理', async () => {
  const host = takeoverHost()
  const ctx = fakeCtx()
  const takeover = new InteractionTakeover(host)
  takeover.attach(ctx)
  assert.equal(ctx.handlers.get('user-questions/request').length, 1)
  assert.equal(ctx.handlers.get('user-questions/request')[0].options.prepend, true)

  const result = await ctx.waterfall('user-questions/request', QUESTION_REQUEST, () => 'local-answer')
  assert.equal(result, 'local-answer')
  await sleep(10)
  assert.equal(host.sent.length, 1, '仍然会把请求发到飞书（两边都能答）')
  assert.equal(host.patches.length, 1)
  assert.match(JSON.stringify(host.patches[0].card.body.elements), /已经在 DSH 中/u)
  takeover.detach()
})

test('takeover: 飞书按钮先答时以飞书结果为准', async () => {
  const host = takeoverHost()
  const ctx = fakeCtx()
  const takeover = new InteractionTakeover(host)
  takeover.attach(ctx)
  const pending = ctx.waterfall(
    'user-questions/request',
    QUESTION_REQUEST,
    () => new Promise(() => {}), // 桌面端永不回答
  )
  await sleep(10)
  const requestId = host.sent[0].meta.requestId
  const response = takeover.handleCardAction({
    action: { value: { v: 1, req: requestId, kind: 'q', q: 'q1', i: 1 } },
    context: { open_message_id: 'om_1' },
    operator: { open_id: 'ou_1' },
  })
  assert.equal(response.toast.type, 'success')
  assert.equal(response.card.type, 'raw')
  const answer = await pending
  assert.deepEqual(answer, { kind: 'question', answers: [{ id: 'q1', selected: ['B'] }] })
  assert.equal(takeover.size, 0)
  takeover.detach()
})

test('takeover: 审批按钮返回 allowed-once / rejected', async () => {
  const host = takeoverHost()
  const ctx = fakeCtx()
  const takeover = new InteractionTakeover(host)
  takeover.attach(ctx)
  const request = { agent: { session: { id: 'session-1' } }, toolName: 'pwsh', reason: '需要权限', signal: undefined }
  const pending = ctx.waterfall('approval/request', request, () => new Promise(() => {}))
  await sleep(10)
  const requestId = host.sent[0].meta.requestId
  takeover.handleCardAction({ action: { value: { v: 1, req: requestId, kind: 'a', act: 'allow' } }, context: {} })
  assert.equal(await pending, 'allowed-once')
  takeover.detach()

  const second = new InteractionTakeover(host)
  second.attach(ctx)
  const pending2 = ctx.waterfall('approval/request', request, () => new Promise(() => {}))
  await sleep(10)
  const requestId2 = host.sent[1].meta.requestId
  second.handleCardAction({ action: { value: { v: 1, req: requestId2, kind: 'a', act: 'reject' } }, context: {} })
  assert.equal(await pending2, 'rejected')
  second.detach()
})

test('takeover: 已结算的请求再点按钮只给提示', async () => {
  const host = takeoverHost()
  const ctx = fakeCtx()
  const takeover = new InteractionTakeover(host)
  takeover.attach(ctx)
  const pending = ctx.waterfall('user-questions/request', QUESTION_REQUEST, () => new Promise(() => {}))
  await sleep(10)
  const requestId = host.sent[0].meta.requestId
  takeover.handleCardAction({ action: { value: { v: 1, req: requestId, kind: 'q', q: 'q1', i: 0 } }, context: {} })
  await pending
  const again = takeover.handleCardAction({ action: { value: { v: 1, req: requestId, kind: 'q', q: 'q1', i: 0 } }, context: {} })
  assert.equal(again.toast.type, 'info')
  takeover.detach()
})

test('takeover: 未启用/发送失败时完全不接管', async () => {
  const disabled = takeoverHost({ config: { notifyQuestion: false } })
  const ctx = fakeCtx()
  const disabledTakeover = new InteractionTakeover(disabled)
  disabledTakeover.attach(ctx)
  const localOnly = await ctx.waterfall('user-questions/request', QUESTION_REQUEST, () => 'local')
  assert.equal(localOnly, 'local')
  assert.equal(disabled.sent.length, 0)
  disabledTakeover.detach()

  const failing = takeoverHost({
    sendInteractionCard: async () => {
      throw new Error('network down')
    },
  })
  const failingTakeover = new InteractionTakeover(failing)
  failingTakeover.attach(ctx)
  const fallback = await ctx.waterfall('user-questions/request', QUESTION_REQUEST, () => 'local')
  assert.equal(fallback, 'local')
  await sleep(10)
  assert.equal(failing.errors.length, 1)
  assert.match(failing.errors[0], /network down/u)
  failingTakeover.detach()
})

test('takeover: 文本回答（单选/多选/审批/缺项）', async () => {
  const host = takeoverHost()
  const ctx = fakeCtx()
  const takeover = new InteractionTakeover(host)
  takeover.attach(ctx)

  const pending = ctx.waterfall('user-questions/request', QUESTION_REQUEST, () => new Promise(() => {}))
  await sleep(10)
  const record = takeover.findByMessage('om_1')
  assert.notEqual(record, undefined)
  const acknowledgement = takeover.answerByText(record, 'B')
  assert.match(acknowledgement, /已回答/u)
  assert.deepEqual(await pending, { kind: 'question', answers: [{ id: 'q1', selected: ['B'] }] })

  const multi = { questions: [{ id: 'm', question: '多选', multiSelect: true, options: [{ label: 'A' }, { label: 'B' }] }], agent: { session: { id: 'session-1' } } }
  const multiPending = ctx.waterfall('user-questions/request', multi, () => new Promise(() => {}))
  await sleep(10)
  const multiRecord = takeover.findByMessage('om_2')
  takeover.answerByText(multiRecord, 'A、B')
  assert.deepEqual(await multiPending, { kind: 'question', answers: [{ id: 'm', selected: ['A', 'B'] }] })

  const approvalRequest = { agent: { session: { id: 'session-1' } }, toolName: 'pwsh' }
  const approvalPending = ctx.waterfall('approval/request', approvalRequest, () => new Promise(() => {}))
  await sleep(10)
  const approvalRecord = takeover.findByMessage('om_3')
  assert.match(takeover.answerByText(approvalRecord, '随便'), /允许/u)
  takeover.answerByText(approvalRecord, '允许')
  assert.equal(await approvalPending, 'allowed-once')

  const multiQuestion = {
    questions: [
      { id: 'a', question: '一', options: [{ label: 'A' }, { label: 'B' }] },
      { id: 'b', question: '二', options: [{ label: 'C' }, { label: 'D' }] },
    ],
    agent: { session: { id: 'session-1' } },
  }
  const missingPending = ctx.waterfall('user-questions/request', multiQuestion, () => new Promise(() => {}))
  await sleep(10)
  const missingRecord = takeover.findByMessage('om_4')
  assert.match(takeover.answerByText(missingRecord, '1. A'), /还差/u)
  takeover.answerByText(missingRecord, '1. A\n2. C')
  assert.deepEqual(await missingPending, {
    kind: 'question',
    answers: [{ id: 'a', selected: ['A'] }, { id: 'b', selected: ['C'] }],
  })
  takeover.detach()
})

test('takeover: 请求中止时卡片失效且不返回答案', async () => {
  const host = takeoverHost()
  const ctx = fakeCtx()
  const takeover = new InteractionTakeover(host)
  takeover.attach(ctx)
  const controller = new AbortController()
  const request = { ...QUESTION_REQUEST, signal: controller.signal }
  const pending = ctx.waterfall('user-questions/request', request, () => new Promise(() => {}))
  await sleep(10)
  controller.abort(new Error('turn aborted'))
  await sleep(10)
  assert.equal(takeover.size, 0)
  assert.match(JSON.stringify(host.patches.at(-1).card.body.elements), /已失效/u)
  takeover.detach()
  await sleep(0)
  assert.equal(pending instanceof Promise, true)
})

test('notify: 飞书消息负载辅助函数', () => {
  assert.equal(quotedMessageId({ message: { parent_id: 'om_p', root_id: 'om_r' } }), 'om_p')
  assert.equal(quotedMessageId({ message: { root_id: 'om_r' } }), 'om_r')
  assert.equal(quotedMessageId({ message: {} }), undefined)
  assert.equal(senderOpenId({ sender: { sender_id: { open_id: 'ou_1' } } }), 'ou_1')
  assert.equal(messageText({ message: { message_type: 'text', content: '{"text":"hi"}' } }), 'hi')
  assert.equal(messageText({ message: { message_type: 'image', content: '{}' } }), '')
})

// ── routes.js ────────────────────────────────────────────────────────────

function fakeHttpServer() {
  const routes = []
  return {
    routes,
    webServer: {
      register(route) {
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index !== -1) routes.splice(index, 1)
        }
      },
    },
  }
}

function fakeReq({ method = 'GET', contentType = 'application/json', body = '' } = {}) {
  const chunks = body === '' ? [] : [Buffer.from(body, 'utf8')]
  return {
    method,
    headers: { 'content-type': contentType },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
    resume() {},
  }
}

function fakeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) { res.headers[name] = value },
    end(text = '') { res.body = text; res.done = true },
  }
  return res
}

test('routes: 注册两条路由、信任闸生效、动作可用', async () => {
  const { routes, webServer } = fakeHttpServer()
  const state = { enabled: true }
  const service = {
    async snapshot() { return state },
    async runAction(body) {
      if (body.action === 'explode') throw new Error('boom')
      return { echo: body.action }
    },
  }
  let rejectWith
  const connection = { requestRejection: () => rejectWith }
  const dispose = registerRoutes({ webServer, connection, logger: silent }, service)
  assert.deepEqual(routes.map(route => route.path), [ROUTE_STATE, ROUTE_ACTION])

  const okRes = fakeRes()
  await routes[0].handler(fakeReq(), okRes)
  assert.equal(okRes.statusCode, 200)
  assert.deepEqual(JSON.parse(okRes.body).state, state)

  rejectWith = 403
  const denied = fakeRes()
  await routes[0].handler(fakeReq(), denied)
  assert.equal(denied.statusCode, 403)
  rejectWith = undefined

  const notAllowed = fakeRes()
  await routes[1].handler(fakeReq({ method: 'GET' }), notAllowed)
  assert.equal(notAllowed.statusCode, 405)

  const wrongType = fakeRes()
  await routes[1].handler(fakeReq({ method: 'POST', contentType: 'text/plain' }), wrongType)
  assert.equal(wrongType.statusCode, 415)

  const bad = fakeRes()
  await routes[1].handler(fakeReq({ method: 'POST', body: '{}' }), bad)
  assert.equal(bad.statusCode, 400)

  const good = fakeRes()
  await routes[1].handler(fakeReq({ method: 'POST', body: JSON.stringify({ action: 'sendTest' }) }), good)
  assert.equal(good.statusCode, 200)
  assert.equal(JSON.parse(good.body).echo, 'sendTest')

  const failing = fakeRes()
  await routes[1].handler(fakeReq({ method: 'POST', body: JSON.stringify({ action: 'explode' }) }), failing)
  assert.equal(failing.statusCode, 400)
  assert.match(JSON.parse(failing.body).error, /boom/u)

  dispose()
  assert.equal(routes.length, 0)
})

// ── service.js ───────────────────────────────────────────────────────────

function fakeBridge() {
  const cardSent = []
  const replies = []
  return {
    cardSent,
    replies,
    status: 'connected',
    appId: 'cli_1',
    lastError: '',
    get ready() { return this.status === 'connected' },
    async start() { this.status = 'connected' },
    async stop() { this.status = 'stopped' },
    async sendCard(receipt, card) {
      cardSent.push({ receipt, card })
      return `om_${cardSent.length}`
    },
    async patchCard() { return true },
    async replyText(messageId, text) { replies.push({ messageId, text }) },
  }
}

function fakeServiceCtx(overrides = {}) {
  const ctx = fakeCtx()
  ctx.agents = { get: () => ({ status: 'idle' }), list: () => [] }
  ctx.sessions = { get: () => undefined }
  ctx.prompts = []
  ctx.get = (name) => {
    if (name === 'credentials') {
      return {
        resolve: async () => ({ value: 'secret', source: 'file' }),
        describe: async () => ({ configured: true, source: 'file', writable: true }),
        set: async () => {},
        unset: async () => {},
      }
    }
    if (name === 'workspaceRegistry') {
      return { list: () => [{ title: 'demo-ws', sessionIds: ['session-1'] }], archivedSessionIds: overrides.archived ?? [] }
    }
    if (name === 'sessionController') {
      return {
        prompt: async (request) => {
          ctx.prompts.push(request)
          if (overrides.promptError !== undefined) throw overrides.promptError
          return { accepted: true }
        },
      }
    }
    return undefined
  }
  return ctx
}

function makeService(options = {}) {
  const { dir, cleanup } = tempDir('service')
  const store = new StateStore({ directory: dir })
  store.load()
  const bridge = fakeBridge()
  const ctx = fakeServiceCtx(options)
  const service = new FeishuBotService(ctx, {
    config: () => ({
      enabled: true,
      appId: 'cli_1',
      notifyComplete: true,
      notifyQuestion: true,
      notifyApproval: true,
      completeDebounceMs: 0,
      maxResultChars: 3000,
      maxCardButtons: 6,
      ...options.config,
    }),
    logger: silent,
    store,
    bridge,
  })
  return { service, store, bridge, ctx, cleanup }
}

function inboundMessage({ text, openId = 'ou_1', parentId, chatType = 'p2p', messageId = 'om_in_1', messageType = 'text' }) {
  return {
    sender: { sender_type: 'user', sender_id: { open_id: openId } },
    message: {
      message_id: messageId,
      chat_id: 'oc_1',
      chat_type: chatType,
      message_type: messageType,
      content: JSON.stringify({ text }),
      ...(parentId === undefined ? {} : { parent_id: parentId }),
    },
  }
}

test('service: 未绑定用户收到明确提示，非私聊被忽略', async () => {
  const { service, bridge } = makeService()
  await service.onMessage(inboundMessage({ text: '你好' }))
  assert.equal(bridge.replies.length, 1)
  assert.match(bridge.replies[0].text, /还没有绑定/u)
  await service.onMessage(inboundMessage({ text: '你好', chatType: 'group' }))
  assert.equal(bridge.replies.length, 1)
})

test('service: 绑定码完成绑定并落盘', async () => {
  const { service, store, bridge } = makeService()
  const code = '123456'
  store.state.pendingBind = { code, issuedAt: Date.now(), expiresAt: Date.now() + 60_000 }
  await service.onMessage(inboundMessage({ text: code }))
  assert.equal(store.state.binding.openId, 'ou_1')
  assert.equal(store.state.binding.chatId, 'oc_1')
  assert.equal(store.state.pendingBind, undefined)
  assert.match(bridge.replies[0].text, /绑定成功/u)
  await sleep(20)
  assert.ok(bridge.cardSent.length >= 1, '绑定后会发卡片')
  const titles = bridge.cardSent.map(entry => cardTitleOf(entry.card))
  assert.ok(titles.some(title => /已绑定/u.test(title)), titles.join(' | '))
})

test('service: 非绑定用户被拒绝；未引用卡片只提示', async () => {
  const { service, store, bridge } = makeService()
  store.state.binding = { openId: 'ou_1', chatId: 'oc_1', boundAt: 'now' }
  await service.onMessage(inboundMessage({ text: 'hi', openId: 'ou_other' }))
  assert.match(bridge.replies.at(-1).text, /只服务已绑定/u)

  await service.onMessage(inboundMessage({ text: '继续' }))
  assert.match(bridge.replies.at(-1).text, /引用/u)
})

test('service: 引用完成卡片 → 注入会话并回执', async () => {
  const { service, store, bridge, ctx } = makeService()
  store.state.binding = { openId: 'ou_1', chatId: 'oc_1', boundAt: 'now' }
  store.rememberCard('om_card_1', { sessionId: 'session-1', kind: 'complete' })
  await service.onMessage(inboundMessage({ text: '改一下 X', parentId: 'om_card_1' }))
  assert.equal(ctx.prompts.length, 1)
  assert.equal(ctx.prompts[0].sessionId, 'session-1')
  assert.equal(ctx.prompts[0].mode, 'queue')
  assert.deepEqual(ctx.prompts[0].content, [{ type: 'text', text: '改一下 X' }])
  assert.equal(ctx.prompts[0].requestId, 'om_in_1')
  assert.match(bridge.replies.at(-1).text, /已发送到 demo-ws/u)
})

test('service: 归档会话与投递错误都给出可读回执', async () => {
  const archived = makeService({ archived: ['session-1'] })
  archived.store.state.binding = { openId: 'ou_1', boundAt: 'now' }
  archived.store.rememberCard('om_card_1', { sessionId: 'session-1', kind: 'complete' })
  await archived.service.onMessage(inboundMessage({ text: 'x', parentId: 'om_card_1' }))
  assert.match(archived.bridge.replies.at(-1).text, /已归档/u)
  archived.cleanup()

  const failing = makeService({ promptError: Object.assign(new Error('gone'), { code: 'session/not-found' }) })
  failing.store.state.binding = { openId: 'ou_1', boundAt: 'now' }
  failing.store.rememberCard('om_card_1', { sessionId: 'session-1', kind: 'complete' })
  await failing.service.onMessage(inboundMessage({ text: 'x', parentId: 'om_card_1' }))
  assert.match(failing.bridge.replies.at(-1).text, /不存在/u)
  failing.cleanup()
})

test('service: 找不到卡片对应会话时提示', async () => {
  const { service, store, bridge, cleanup } = makeService()
  store.state.binding = { openId: 'ou_1', boundAt: 'now' }
  await service.onMessage(inboundMessage({ text: 'x', parentId: 'om_unknown' }))
  assert.match(bridge.replies.at(-1).text, /找不到/u)
  cleanup()
})

test('service: 开启后同步会发“已开启”卡片并在确认后记录', async () => {
  const { service, store, bridge, cleanup } = makeService()
  store.state.binding = { openId: 'ou_1', chatId: 'oc_1', boundAt: 'now' }
  service.lastEnabled = false
  await service.sync()
  assert.equal(bridge.cardSent.length, 1)
  assert.match(cardTitleOf(bridge.cardSent[0].card), /已开启/u)

  const confirmed = service.confirmAck({ operator: { open_id: 'ou_1' }, context: { open_message_id: 'om_9' } })
  assert.equal(confirmed, true)
  assert.equal(store.state.enabledAck.messageId, 'om_9')

  // 重复 sync 不重复发
  await service.sync()
  assert.equal(bridge.cardSent.length, 1)
  cleanup()
})

test('service: 关闭时不再发送，重启后不重复播报', async () => {
  const { service, store, bridge, cleanup } = makeService({ config: { enabled: false } })
  store.state.binding = { openId: 'ou_1', boundAt: 'now' }
  service.lastEnabled = true
  await service.sync()
  assert.equal(bridge.cardSent.length, 0)
  assert.equal(service.ready(), false)

  service.lastEnabled = null
  await service.sync()
  assert.equal(bridge.cardSent.length, 0, '启动时不应重复播报')
  cleanup()
})

test('service: 快照脱敏且不含密钥', async () => {
  const { service, store, cleanup } = makeService()
  store.state.binding = { openId: 'ou_abcdefgh', chatId: 'oc_12345678', boundAt: 'now', name: '张三' }
  const snapshot = await service.snapshot()
  assert.equal(snapshot.binding.bound, true)
  assert.equal(snapshot.binding.openIdMasked, 'ou_ab****gh')
  assert.equal(snapshot.secret.configured, true)
  assert.equal(JSON.stringify(snapshot).includes('secret"'), true, '字段名可以出现')
  assert.equal(JSON.stringify(snapshot).includes('"value"'), false, '绝不返回密钥值')
  assert.equal(snapshot.appId, 'cli_1')
  assert.equal(snapshot.enabled, true)
  cleanup()
})

test('service: sendTest 需要绑定与连接', async () => {
  const { service, store, bridge, cleanup } = makeService()
  await assert.rejects(() => service.sendTest(), /绑定/u)
  store.state.binding = { openId: 'ou_1', boundAt: 'now' }
  const result = await service.sendTest()
  assert.equal(result.messageId, 'om_1')
  assert.match(cardTitleOf(bridge.cardSent[0].card), /测试/u)
  cleanup()
})

test('service: 未知动作被拒绝', async () => {
  const { service, cleanup } = makeService()
  await assert.rejects(() => service.runAction({ action: 'nope' }), /未知操作/u)
  cleanup()
})

test('service: 完成通知在未就绪时静默跳过', async () => {
  const { service, bridge, cleanup } = makeService({ config: { enabled: false } })
  await service.notifyTurnEnd({ sessionId: 'session-1', turn: 1, reason: { kind: 'completed' }, text: 'x' })
  assert.equal(bridge.cardSent.length, 0)
  cleanup()
})

// ── index.js ─────────────────────────────────────────────────────────────

test('index: 声明插件名、注入与 volatile 配置字段', async () => {
  const mod = await import('../lib/index.js')
  assert.equal(mod.name, 'dsh-feishu-bot')
  assert.deepEqual(mod.inject, ['agents', 'sessions'])
  assert.equal(typeof mod.apply, 'function')
  assert.equal(typeof mod.Config, 'function')
  const fields = ['enabled', 'appId', 'notifyComplete', 'notifyQuestion', 'notifyApproval', 'completeDebounceMs', 'maxResultChars', 'maxCardButtons']
  assert.deepEqual(Object.keys(mod.Config.dict), fields)
  const value = mod.Config({})
  assert.equal(value.enabled.get(), false)
  assert.equal(value.appId.get(), '')
  assert.equal(value.notifyComplete.get(), true)
  assert.equal(value.completeDebounceMs.get(), 1500)
  assert.equal(value.maxResultChars.get(), 3000)
  assert.equal(value.maxCardButtons.get(), 6)
})

test('index: 包清单满足 web 客户端与 bundle 的硬性要求', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.name, 'dsh-feishu-bot')
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.main, 'lib/index.js')
  assert.equal(manifest.exports['.'], './lib/index.js')
  assert.equal(manifest.exports['./client'], './lib/client.js')
  assert.equal(manifest.exports['./icon'], './media/icon.svg')
  assert.equal(manifest.icon, 'media/icon.svg')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(existsSync(new URL('../cordis.patch.yml', import.meta.url)))
  assert.ok(existsSync(new URL('../lib/client.js', import.meta.url)))
  assert.ok(existsSync(new URL('../media/icon.svg', import.meta.url)))
  assert.match(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'), /id: feishu-bot/u)
  assert.match(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'), /name: dsh-feishu-bot/u)
})

test('apply: 装配服务、设置页策略与两条路由', async () => {
  const { dir, cleanup } = tempDir('apply')
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = dir
  try {
    const mod = await import('../lib/index.js')
    const routes = []
    const configureCalls = []
    const disposers = []
    const childEffect = (fn) => {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    }
    const ctx = {
      logger: silent,
      fiber: {},
      on: () => () => {},
      get: () => undefined,
      effect(fn) {
        const dispose = fn()
        disposers.push(dispose)
        return () => {}
      },
      inject(names, callback) {
        if (names[0] === 'settings') {
          callback({
            settings: {
              configure: (...args) => {
                configureCalls.push(args)
                return () => {}
              },
            },
            effect: childEffect,
          })
          return
        }
        if (names[0] === 'webServer') {
          callback({
            webServer: {
              register(route) {
                routes.push(route)
                return () => {}
              },
            },
            connection: { requestRejection: () => undefined },
            logger: silent,
            effect: childEffect,
          })
        }
      },
    }
    mod.apply(ctx, mod.Config({}))
    await sleep(30)
    assert.equal(configureCalls.length, 1)
    assert.equal(configureCalls[0][0].auto, false)
    assert.deepEqual(routes.map(route => route.path), ['/dsh-feishu-bot/state', '/dsh-feishu-bot/action'])
    for (const dispose of disposers) {
      if (typeof dispose === 'function') await dispose()
    }
    await sleep(10)
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    cleanup()
  }
})

// ── 回归：飞书卡片 schema 2.0 的禁用元素与错误透出 ────────────────────────

test('cards: 所有卡片都不含 JSON 2.0 已移除的 note 元素', () => {
  const cards = [
    buildTestCard({}),
    buildEnabledCard({ workspaceCount: 3 }),
    buildCompleteCard({ workspaceTitle: 'w', sessionTitle: 's', turn: 1, reason: { kind: 'completed' }, resultText: '正文' }),
    buildCompleteCard({ workspaceTitle: 'w', sessionTitle: 's', turn: 1, reason: { kind: 'error', error: { message: 'boom' } }, resultText: '' }),
    buildApprovalCard({ workspaceTitle: 'w', sessionTitle: 's', toolName: 'pwsh', requestId: 'r' }),
    buildQuestionCard({ workspaceTitle: 'w', sessionTitle: 's', questions: [{ id: 'q', question: '?' }], requestId: 'r' }),
    buildNoticeCard({ title: 't', lines: ['a'], footer: '引用本卡片回复' }),
    finalizeCard(buildApprovalCard({ requestId: 'r' }), { line: '✅ 已允许一次', template: 'green', markTitle: true }),
  ]
  for (const card of cards) {
    assert.ok(!JSON.stringify(card).includes('"tag":"note"'), `卡片不应包含 note 元素：${cardTitleOf(card)}`)
  }
  // 底部小字改为灰色 markdown
  const notice = buildNoticeCard({ title: 't', footer: '引用本卡片回复' })
  assert.match(JSON.stringify(notice.body.elements), /<font color='grey'>引用本卡片回复<\/font>/u)
})

test('bridge: 错误信息带上飞书业务码与原因（不只是 HTTP 400）', async () => {
  const fake = fakeSdk()
  const bridge = new FeishuBridge({ logger: silent, sdkLoader: async () => fake.sdk })
  await bridge.start({ appId: 'cli_1', appSecret: 'secret' })
  const axiosLike = Object.assign(new Error('Request failed with status code 400'), {
    response: {
      status: 400,
      data: { code: 230099, msg: 'ErrCode: 200861 unsupported tag note' },
    },
  })
  bridge.client.im.v1.message.create = async () => { throw axiosLike }
  await assert.rejects(() => bridge.sendCard('oc_1', { schema: '2.0' }), (error) => {
    assert.match(error.message, /发送卡片失败/u)
    assert.match(error.message, /HTTP 400/u)
    assert.match(error.message, /230099/u)
    assert.match(error.message, /unsupported tag note/u)
    return true
  })
  await bridge.stop()
})

test('bridge: describeTransportError 覆盖网络错误与无响应体', () => {
  assert.match(
    describeTransportError({ response: { status: 400, data: { code: 230099, msg: 'bad tag' } } }, '发送卡片'),
    /发送卡片失败（HTTP 400 \/ code 230099）：bad tag/u,
  )
  assert.match(describeTransportError({ response: { status: 502 } }, '发送消息'), /HTTP 502/u)
  assert.match(describeTransportError(new Error('ECONNRESET'), '回复消息'), /ECONNRESET/u)
})
