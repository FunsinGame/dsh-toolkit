/**
 * dsh-feishu-bot —— 飞书消息卡片（卡片 JSON 2.0）。
 *
 * 纯构建函数：输入业务数据，输出可直接 JSON.stringify 后发送的卡片对象。
 * 不联网、不读配置，便于快照式单测。
 *
 * 约定：
 *   - 所有卡片都带 `config.update_multi: true`（Feishu 原地 patch 的前提）；
 *   - 按钮行统一带 `element_id: 'fsb_actions'`，结算时整行移除；
 *   - 按钮的路由数据放 `behaviors[0].value`，回调里以 `event.action.value` 到达。
 */
import { answerHint, formatTurnReason, truncate, DEFAULT_RESULT_CHARS } from './text.js'

/** 卡片 JSON 2.0 的 schema 版本。 */
export const CARD_SCHEMA = '2.0'

/** 飞书卡片消息体上限 30KB；留出 JSON 转义余量。 */
export const MAX_CARD_BYTES = 28_000

/** 按钮行的固定 element_id，结算时按它整行删除。 */
export const ACTIONS_ELEMENT_ID = 'fsb_actions'

/** 卡片里各类文本的保守上限。 */
const LIMITS = {
  meta: 200,
  question: 1500,
  detail: 3000,
  args: 800,
  status: 400,
  note: 120,
}

/** `plain_text` 元素。 */
function plain(content) {
  return { tag: 'plain_text', content: String(content) }
}

/** `markdown` 元素。 */
function markdown(content, elementId) {
  return {
    tag: 'markdown',
    content: String(content),
    ...(elementId === undefined ? {} : { element_id: elementId }),
  }
}

/** 分隔线。 */
function divider() {
  return { tag: 'hr' }
}

/**
 * 卡片底部的小字说明。
 *
 * 卡片 JSON 2.0 **不再支持 `note` 元素**（飞书返回 200861 / 230099），因此这里
 * 用灰色字体的 markdown 行代替；`tag: 'note'` 出现在任何卡片里都会让整条消息
 * 被拒（HTTP 400）。
 */
function note(text) {
  return markdown(`<font color='grey'>${truncate(text, LIMITS.note, '')}</font>`)
}

/** 卡片外壳：schema 2.0 + 共享卡片 + 标题。 */
function shell(template, title) {
  return {
    schema: CARD_SCHEMA,
    config: { update_multi: true, width_mode: 'fill' },
    header: {
      template,
      title: plain(truncate(title, 120, '…')),
    },
    body: { elements: [] },
  }
}

/** 工作区/会话/时间那一块。 */
function metaBlock(workspaceTitle, sessionTitle, extra = []) {
  const lines = [
    `**工作区**　${truncate(workspaceTitle || '（未归属）', LIMITS.meta, '…')}`,
    `**会话**　${truncate(sessionTitle || '（未命名）', LIMITS.meta, '…')}`,
    ...extra,
  ]
  return markdown(lines.join('\n'))
}

/** 按钮行；`buttons` 为 `{label, value, type?}`。 */
export function actionRow(buttons) {
  const columns = buttons.map(button => ({
    tag: 'column',
    width: 'auto',
    weight: 1,
    elements: [{
      tag: 'button',
      type: button.type ?? 'default',
      text: plain(truncate(button.label, 100, '…')),
      behaviors: [{ type: 'callback', value: button.value }],
    }],
  }))
  return {
    tag: 'column_set',
    element_id: ACTIONS_ELEMENT_ID,
    flex_mode: 'flow',
    horizontal_spacing: '8px',
    columns,
  }
}

/** 当前时刻的 `HH:mm`（用本机时区，卡片只是给人看的）。 */
export function clockOf(now = Date.now()) {
  const date = new Date(now)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/** 完成类卡片的标题与颜色。 */
function completionHeading(reason) {
  const formatted = formatTurnReason(reason)
  const icon = formatted.template === 'green' ? '✅' : formatted.template === 'red' ? '❌' : '⚠️'
  return { ...formatted, text: `${icon} 任务${formatted.label}` }
}

/**
 * 任务回合结束卡片。
 * @param spec - 上下文。
 * @returns 卡片对象。
 */
export function buildCompleteCard(spec) {
  const {
    workspaceTitle = '',
    sessionTitle = '',
    turn,
    reason,
    resultText = '',
    maxResultChars = DEFAULT_RESULT_CHARS,
    now = Date.now(),
  } = spec
  const heading = completionHeading(reason)
  const card = shell(heading.template, `${heading.text} · ${workspaceTitle || '未归属工作区'}`)
  card.body.elements.push(metaBlock(workspaceTitle, sessionTitle, [
    `**回合**　第 ${Number.isFinite(turn) ? turn : '?'} 轮　·　${clockOf(now)}`,
  ]))
  card.body.elements.push(divider())
  const body = typeof resultText === 'string' ? resultText.trim() : ''
  if (body === '') {
    card.body.elements.push(markdown('_本轮没有可展示的文本结果。_'))
  } else {
    const clipped = truncate(body, maxResultChars, '\n…（已截断，完整内容见 DSH）')
    card.body.elements.push(markdown(clipped))
  }
  if (heading.detail !== undefined && heading.detail !== '') {
    card.body.elements.push(markdown(`**${heading.label}原因**　${truncate(heading.detail, 600, '…')}`))
  }
  card.body.elements.push(note('引用本卡片回复，即可把内容发送到上面的会话'))
  return fitCard(card)
}

/**
 * 提问卡片。
 * 单个单选问题且选项数不超过 `maxButtons` 时出按钮；其余情况出编号列表并提示文本回复。
 * @param spec - 上下文（`requestId` 用于按钮回传）。
 * @returns 卡片对象。
 */
export function buildQuestionCard(spec) {
  const {
    workspaceTitle = '',
    sessionTitle = '',
    questions = [],
    requestId,
    maxButtons = 6,
    now = Date.now(),
  } = spec
  const card = shell('blue', `❓ 需要你选择 · ${workspaceTitle || '未归属工作区'}`)
  card.body.elements.push(metaBlock(workspaceTitle, sessionTitle, [`**时间**　${clockOf(now)}`]))

  const single = questions.length === 1 ? questions[0] : undefined
  const options = Array.isArray(single?.options) ? single.options.filter(option => typeof option?.label === 'string') : []
  const useButtons = single !== undefined
    && single.multiSelect !== true
    && options.length > 0
    && options.length <= maxButtons

  questions.forEach((question, index) => {
    const heading = question?.header
    const prefix = questions.length > 1 ? `**Q${index + 1}**　` : (typeof heading === 'string' && heading !== '' ? `**${heading}**　` : '')
    card.body.elements.push(markdown(`${prefix}${truncate(question?.question ?? '', LIMITS.question, '…')}`))

    if (typeof question?.detail === 'string' && question.detail.trim() !== '') {
      card.body.elements.push(markdown(truncate(question.detail, LIMITS.detail, '\n…（内容过长已截断）')))
    }

    const labels = Array.isArray(question?.options) ? question.options.filter(option => typeof option?.label === 'string') : []
    if (labels.length > 0 && !(useButtons && question === single)) {
      const numbered = labels.map((option, optionIndex) => {
        const description = typeof option.description === 'string' && option.description !== ''
          ? `（${truncate(option.description, 120, '…')}）`
          : ''
        return `${optionIndex + 1}. ${option.label}${description}`
      })
      card.body.elements.push(markdown(numbered.join('\n')))
    }
  })

  if (useButtons) {
    card.body.elements.push(actionRow(options.map((option, index) => ({
      label: option.label,
      type: index === 0 ? 'primary' : 'default',
      value: { v: 1, req: requestId, kind: 'q', q: single.id, i: index },
    }))))
  }

  card.body.elements.push(note(answerHint(questions, maxButtons)))
  return fitCard(card)
}

/**
 * 权限审批卡片。
 * @param spec - 上下文（含工具名与可选的参数摘录）。
 * @returns 卡片对象。
 */
export function buildApprovalCard(spec) {
  const {
    workspaceTitle = '',
    sessionTitle = '',
    toolName = 'unknown',
    toolArgs = '',
    reason = '',
    requestId,
    now = Date.now(),
  } = spec
  const card = shell('orange', `🔐 权限确认 · ${workspaceTitle || '未归属工作区'}`)
  card.body.elements.push(metaBlock(workspaceTitle, sessionTitle, [`**时间**　${clockOf(now)}`]))
  card.body.elements.push(markdown(`**工具**　\`${truncate(toolName, 120, '…')}\``))
  const args = typeof toolArgs === 'string' ? toolArgs.trim() : ''
  if (args !== '') {
    card.body.elements.push(markdown(`\`\`\`\n${truncate(args, LIMITS.args, '\n…（参数过长已截断）')}\n\`\`\``))
  }
  const why = typeof reason === 'string' ? reason.trim() : ''
  if (why !== '') {
    card.body.elements.push(markdown(`**原因**　${truncate(why, 600, '…')}`))
  }
  card.body.elements.push(actionRow([
    { label: '允许一次', type: 'primary', value: { v: 1, req: requestId, kind: 'a', act: 'allow' } },
    { label: '拒绝', type: 'danger', value: { v: 1, req: requestId, kind: 'a', act: 'reject' } },
  ]))
  card.body.elements.push(note('也可以引用本卡片回复 允许 / 拒绝'))
  return fitCard(card)
}

/**
 * 通知类卡片（绑定成功、已开启、测试消息等）。
 * @param spec - 标题、颜色、若干行 markdown、可选按钮。
 * @returns 卡片对象。
 */
export function buildNoticeCard(spec) {
  const { title, template = 'grey', lines = [], buttons = [], footer = '' } = spec
  const card = shell(template, title)
  for (const line of lines) {
    if (typeof line === 'string' && line !== '') card.body.elements.push(markdown(line))
  }
  if (buttons.length > 0) card.body.elements.push(actionRow(buttons))
  if (footer !== '') card.body.elements.push(note(footer))
  return fitCard(card)
}

/** “已开启”确认卡片（带确认按钮）。 */
export function buildEnabledCard(spec) {
  const { workspaceCount = 0, now = Date.now() } = spec
  return buildNoticeCard({
    title: '🤖 飞书通知已开启',
    template: 'green',
    lines: [
      `从此刻起，DSH 会在任务完成、需要你选择或需要权限确认时把卡片发到这里。`,
      workspaceCount > 0 ? `当前工作区数：${workspaceCount}` : '',
      `**开启时间**　${clockOf(now)}`,
    ].filter(Boolean),
    buttons: [{ label: '确认收到', type: 'primary', value: { v: 1, act: 'ack' } }],
    footer: '点一下“确认收到”，DSH 就知道这条回传通路也通了',
  })
}

/** 绑定成功卡片。 */
export function buildBoundCard(spec) {
  const { name = '', now = Date.now() } = spec
  return buildNoticeCard({
    title: '🔗 飞书已绑定',
    template: 'blue',
    lines: [
      name === '' ? '已记住你的飞书账号。' : `已记住 **${truncate(name, 60, '…')}** 的飞书账号。`,
      `**绑定时间**　${clockOf(now)}`,
      '回到 DSH 的设置卡片，打开总开关即可开始接收通知。',
    ],
  })
}

/** 测试消息卡片。 */
export function buildTestCard(spec = {}) {
  const { now = Date.now() } = spec
  return buildNoticeCard({
    title: '🧪 来自 DSH 的测试消息',
    template: 'blue',
    lines: [
      '如果你在手机上看到这张卡片，说明发送通路正常。',
      `**发送时间**　${clockOf(now)}`,
    ],
    buttons: [{ label: '回传测试：确认收到', type: 'primary', value: { v: 1, act: 'ack' } }],
    footer: '点下面的按钮，还会验证卡片回调通路',
  })
}

/**
 * 结算一张已发出的卡片：去掉按钮行、追加一行状态、按需要换颜色。
 * @param card - 原卡片（不会被修改）。
 * @param spec - `{line, template, markTitle}`。
 * @returns 新卡片对象。
 */
export function finalizeCard(card, spec = {}) {
  const next = JSON.parse(JSON.stringify(card))
  const elements = Array.isArray(next?.body?.elements) ? next.body.elements : []
  next.body.elements = elements.filter(element => element?.element_id !== ACTIONS_ELEMENT_ID)
  if (spec.template !== undefined) next.header.template = spec.template
  if (spec.markTitle === true && typeof next?.header?.title?.content === 'string') {
    next.header.title.content = truncate(`${next.header.title.content}（已处理）`, 120, '…')
  }
  if (typeof spec.line === 'string' && spec.line !== '') {
    next.body.elements.push(markdown(spec.line, 'fsb_status'))
  }
  return fitCard(next)
}

/** 序列化后的字节数（UTF-8）。 */
export function cardBytes(card) {
  return Buffer.byteLength(JSON.stringify(card), 'utf8')
}

/**
 * 保证卡片不超过大小上限：先削最长的 markdown，再丢弃尾部元素。
 * @param card - 卡片对象（原地修改并返回）。
 * @param maxBytes - 上限字节数。
 * @returns 同一张卡片。
 */
export function fitCard(card, maxBytes = MAX_CARD_BYTES) {
  let guard = 0
  while (cardBytes(card) > maxBytes && guard < 64) {
    guard += 1
    const elements = card.body?.elements ?? []
    let longest = null
    for (const element of elements) {
      if (element?.tag !== 'markdown' || typeof element.content !== 'string') continue
      if (longest === null || element.content.length > longest.content.length) longest = element
    }
    if (longest !== null && longest.content.length > 240) {
      longest.content = truncate(longest.content, Math.max(160, Math.floor(longest.content.length * 0.6)), '\n…（已截断）')
      continue
    }
    if (elements.length > 1) {
      elements.splice(elements.length - 1, 1)
      continue
    }
    break
  }
  return card
}

/** 供日志/测试读取卡片标题。 */
export function cardTitleOf(card) {
  const content = card?.header?.title?.content
  return typeof content === 'string' ? content : ''
}
