/**
 * dsh-feishu-bot —— 纯文本处理。
 *
 * 这里放三类逻辑，全部是纯函数（不碰网络、不碰 Cordis），因此可以脱离 DSH
 * 单测：
 *   1. 解析飞书消息事件里的文本（`message.content` 是 JSON 字符串）；
 *   2. 把用户的自由文本收敛成 DSH 的提问回答结构；
 *   3. 把回合结束原因翻译成卡片上的一句话。
 */

/** 注入会话的文本上限（飞书文本消息本身可到 150KB，这里只防呆）。 */
export const MAX_REPLY_CHARS = 8000

/** 卡片里展示的结果默认上限，调用方通常用配置覆盖。 */
export const DEFAULT_RESULT_CHARS = 3000

/** 判断是否普通对象。 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * 解析飞书 `message.content`（JSON 字符串）。
 * @param content - 事件里的 `message.content`。
 * @returns 纯文本；无法解析时返回空串。
 */
export function parseMessageContent(content) {
  if (typeof content !== 'string' || content.trim() === '') return ''
  try {
    const parsed = JSON.parse(content)
    if (isObject(parsed) && typeof parsed.text === 'string') return parsed.text
    if (typeof parsed === 'string') return parsed
    return ''
  } catch {
    return ''
  }
}

/** 去掉飞书文本里的 `<at …>…</at>` 富文本标签，避免卡片里误圈人。 */
export function stripAtTags(text) {
  if (typeof text !== 'string' || text === '') return ''
  return text
    .replace(/<at\b[^>]*>[\s\S]*?<\/at>/giu, '')
    .replace(/<at\b[^>]*\/>/giu, '')
}

/**
 * 清洗用户文本：解析 `@_user_N` 占位符、去富文本标签、统一换行、去掉首尾空白。
 * @param text - 原始文本。
 * @param mentions - 事件里的 `message.mentions`（可缺省）。
 * @returns 清洗后的文本。
 */
export function cleanUserText(text, mentions) {
  let result = stripAtTags(typeof text === 'string' ? text : '')
  if (Array.isArray(mentions)) {
    for (const mention of mentions) {
      if (!isObject(mention) || typeof mention.key !== 'string') continue
      const name = typeof mention.name === 'string' ? mention.name : ''
      result = result.split(mention.key).join(name === '' ? '' : `@${name}`)
    }
  }
  result = result.replace(/@_user_\d+/gu, '')
  return result.replace(/\r\n?/gu, '\n').trim()
}

/**
 * 判断一段文本是否在声称一次绑定码。
 * 接受纯码，也接受 `/bind 123456`、`绑定 123456` 这类写法。
 * @param text - 清洗后的文本。
 * @param code - 当前有效的绑定码。
 * @returns 是否命中。
 */
export function matchBindCode(text, code) {
  if (typeof text !== 'string' || typeof code !== 'string' || code === '') return false
  const normalized = text.trim().replace(/^[/／](?:bind|绑定)\s*/iu, '').replace(/^(?:绑定|bind)\s*[:：]?\s*/iu, '').trim()
  return normalized === code
}

/**
 * 截断文本并加省略标记。
 * @param text - 原文本。
 * @param max - 最大字符数（按码点计）。
 * @param suffix - 省略追加的说明；空串表示只截断。
 * @returns 截断后的文本。
 */
export function truncate(text, max, suffix = '…') {
  const source = typeof text === 'string' ? text : String(text ?? '')
  const limit = Number.isFinite(max) && max > 0 ? Math.trunc(max) : DEFAULT_RESULT_CHARS
  const points = [...source]
  if (points.length <= limit) return source
  const tail = suffix === '' ? '' : suffix
  const keep = Math.max(0, limit - [...tail].length)
  return `${points.slice(0, keep).join('')}${tail}`
}

/** 把选项标签与若干种写法做比较（去空白、忽略大小写）。 */
function labelMatches(token, label) {
  return token.trim().toLowerCase() === String(label).trim().toLowerCase()
}

/**
 * 在一组选项里定位一个 token：先按 1 起算的下标，再按标签匹配。
 * @param token - 用户给出的片段。
 * @param options - `{label}` 数组。
 * @returns 选项下标；未命中返回 -1。
 */
function optionIndex(token, options) {
  const trimmed = token.trim()
  if (/^\d+$/u.test(trimmed)) {
    const index = Number(trimmed) - 1
    if (index >= 0 && index < options.length) return index
  }
  return options.findIndex(option => labelMatches(trimmed, option.label))
}

/** 按选项原始顺序排序并去重下标。 */
function normalizeIndexes(indexes) {
  return [...new Set(indexes)].sort((left, right) => left - right)
}

/**
 * 解析单个问题的回答片段。
 * @param raw - 用户给这个问题的文本。
 * @param question - `{id, options?, multiSelect?}`。
 * @returns `{selected, custom}`；格式错误返回 `{error}`。
 */
export function parseSingleAnswer(raw, question) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  const options = Array.isArray(question?.options) ? question.options.filter(option => typeof option?.label === 'string') : []
  if (text === '') return { error: 'empty' }
  if (options.length === 0) return { selected: [], custom: text }

  const tokens = text.split(/[,，、;；\/\s]+/u).map(token => token.trim()).filter(token => token !== '')
  if (question.multiSelect === true) {
    const indexes = []
    const unmatched = []
    for (const token of tokens) {
      const index = optionIndex(token, options)
      if (index === -1) unmatched.push(token)
      else indexes.push(index)
    }
    if (unmatched.length === 0 && indexes.length > 0) {
      return { selected: normalizeIndexes(indexes).map(index => options[index].label) }
    }
    if (indexes.length === 0) return { selected: [], custom: text }
    return { error: 'unknown-option', tokens: unmatched }
  }

  const index = optionIndex(text, options)
  if (index !== -1) return { selected: [options[index].label] }
  if (tokens.length === 1) return { selected: [], custom: text }
  return { error: 'unknown-option', tokens }
}

/** 解析多问题回答里的“压缩写法”：`1=A, 2=B`。 */
function parseCompactPairs(text) {
  const pairs = new Map()
  for (const segment of text.split(/[,，;；]+/u)) {
    const match = /^\s*(?:q|Q)?\s*(\d+)\s*[=:：]\s*(.+?)\s*$/u.exec(segment)
    if (match === null) return undefined
    pairs.set(Number(match[1]) - 1, match[2])
  }
  return pairs.size === 0 ? undefined : pairs
}

/**
 * 把用户回复解析成 DSH 的提问回答。
 *
 * 规则：
 *   - 单问题且无选项：整段文本作为 `custom`；
 *   - 单问题且有选项：数字下标、标签、或（多选时）逗号分隔的多个；
 *   - 多问题：每行 `N. 答案` / `N: 答案`，或单行 `1=A, 2=B`；必须全部覆盖。
 *
 * @param questions - 请求里的问题数组。
 * @param text - 清洗后的用户文本。
 * @returns `{ok:true, answers}` 或 `{ok:false, reason, missing?, tokens?}`
 */
export function parseAnswer(questions, text) {
  const list = Array.isArray(questions) ? questions : []
  const raw = typeof text === 'string' ? text.trim() : ''
  if (list.length === 0) return { ok: false, reason: 'no-questions' }
  if (raw === '') return { ok: false, reason: 'empty' }

  if (list.length === 1) {
    const parsed = parseSingleAnswer(raw, list[0])
    if (parsed.error !== undefined) return { ok: false, reason: parsed.error, tokens: parsed.tokens }
    return { ok: true, answers: [{ id: list[0].id, ...parsed }] }
  }

  const segments = new Map()
  const compact = parseCompactPairs(raw)
  if (compact !== undefined) {
    for (const [index, value] of compact) segments.set(index, value)
  } else {
    for (const line of raw.split(/\n+/u)) {
      const match = /^\s*(?:q|Q)?\s*(\d+)\s*[.、:：)\]]\s*(.+?)\s*$/u.exec(line)
      if (match !== null) segments.set(Number(match[1]) - 1, match[2])
    }
  }
  if (segments.size === 0) return { ok: false, reason: 'format' }

  const answers = []
  const missing = []
  const unknownTokens = []
  for (const [index, question] of list.entries()) {
    const value = segments.get(index)
    if (value === undefined) {
      missing.push(question.id)
      continue
    }
    const parsed = parseSingleAnswer(value, question)
    if (parsed.error !== undefined) {
      unknownTokens.push(...(parsed.tokens ?? []))
      missing.push(question.id)
      continue
    }
    answers.push({ id: question.id, ...parsed })
  }
  if (unknownTokens.length > 0) return { ok: false, reason: 'unknown-option', tokens: unknownTokens }
  if (missing.length > 0) return { ok: false, reason: 'missing', missing }
  return { ok: true, answers }
}

/** 审批文本：允许一次 / 拒绝。 */
const ALLOW_WORDS = new Set(['允许', '同意', '批准', '通过', '可以', '1', 'y', 'yes', 'ok', 'allow', 'allowed', 'approve'])
const REJECT_WORDS = new Set(['拒绝', '不同意', '不批准', '不行', '否', '2', 'n', 'no', 'deny', 'reject', 'decline'])

/**
 * 解析审批卡片的文本回复。
 * @param text - 清洗后的文本。
 * @returns `'allowed-once'`、`'rejected'`，无法判定返回 `undefined`。
 */
export function parseApproval(text) {
  const token = typeof text === 'string' ? text.trim().toLowerCase() : ''
  if (token === '') return undefined
  if (ALLOW_WORDS.has(token)) return 'allowed-once'
  if (REJECT_WORDS.has(token)) return 'rejected'
  if ([...ALLOW_WORDS].some(word => token.startsWith(word))) return 'allowed-once'
  if ([...REJECT_WORDS].some(word => token.startsWith(word))) return 'rejected'
  return undefined
}

/**
 * 把 `turn/end` 原因翻译成卡片文案。
 * `TurnEndReasonMap` 是插件可扩展的，因此未知 kind 也给出可读结果。
 * @param reason - 事件里的 `reason`。
 * @returns `{label, template, detail?, notify}`。
 */
export function formatTurnReason(reason) {
  const kind = typeof reason?.kind === 'string' ? reason.kind : 'unknown'
  switch (kind) {
    case 'completed':
      return { label: '完成', template: 'green', notify: true }
    case 'aborted':
      return { label: '已中止', template: 'orange', detail: '本轮被取消', notify: true }
    case 'blocked':
      return { label: '被阻断', template: 'orange', detail: '本轮没有进入模型调用', notify: true }
    case 'max-tokens':
      return { label: '达到输出上限', template: 'orange', detail: '输出被截断', notify: true }
    case 'interrupted':
      return { label: '中断', template: 'orange', detail: '进程曾异常退出，回合被补记为中断', notify: true }
    case 'forked':
      return { label: '已派生', template: 'grey', notify: false }
    case 'error': {
      const failure = reason?.error
      const message = typeof failure?.message === 'string' && failure.message !== ''
        ? failure.message
        : (typeof failure?.code === 'string' ? failure.code : '未知错误')
      return { label: '失败', template: 'red', detail: message, notify: true }
    }
    default:
      return { label: kind === 'unknown' ? '结束' : kind, template: 'grey', notify: true }
  }
}

/**
 * 把注入会话时的错误转成一句人话（`RemoteError` 带 code）。
 * @param error - 捕获到的异常。
 * @returns 中文说明。
 */
export function describePromptError(error) {
  const code = typeof error?.code === 'string' ? error.code : ''
  const message = typeof error?.message === 'string' ? error.message : String(error ?? '')
  switch (code) {
    case 'session/not-found':
      return '该会话已不存在（可能已被删除）'
    case 'session/agent-busy':
      return '该会话正在被其它执行占用（子智能体会话不能直接投递）'
    case 'session/writer-held':
      return '该会话的日志被另一个进程占用'
    case 'gateway/bad-request':
      return '消息内容为空'
    case 'session/invalid-time-zone':
      return '时区参数无效'
    default:
      return message === '' ? '发送失败' : message.slice(0, 200)
  }
}

/** 生成一张卡片里“多问题/多选”时给用户看的回答示例。 */
export function answerHint(questions, maxButtons) {
  const list = Array.isArray(questions) ? questions : []
  if (list.length === 1) {
    const question = list[0]
    const options = Array.isArray(question?.options) ? question.options : []
    if (options.length === 0) return '直接回复你的答案即可。'
    if (options.length > maxButtons) {
      return `回复选项编号（1-${options.length}）${question.multiSelect === true ? '，可多选，用逗号分隔' : ''}。`
    }
    if (question.multiSelect === true) return '回复选项编号或选项文字，多个用逗号分隔。'
    return '点上面的按钮，或回复选项编号/选项文字。'
  }
  return '按行回复，每条一个：`1. 答案`（也可以用 `1=答案, 2=答案`）。'
}
