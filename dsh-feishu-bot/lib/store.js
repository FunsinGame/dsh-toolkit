/**
 * dsh-feishu-bot —— 插件私有状态。
 *
 * 只保存“机器本地、非密钥”的状态：绑定的飞书账号、一次性绑定码、卡片刻及
 * 错误摘要。`app_secret` 属于凭据服务（`$DSH_HOME/.credentials.yaml`），
 * 绝不写进这里。
 *
 * 文件位置：`$DSH_HOME/feishu-bot/state.json`。写入走原子替换（临时文件 +
 * rename），并在可行时压到 0600；读取时任何损坏都先备份再重建，绝不让一个
 * 坏文件阻止插件启动。
 *
 * 本模块不依赖 Cordis，也不联网，便于单元测试注入临时目录。
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/** 状态文件格式版本。结构变化时递增，并在此文件内做迁移。 */
export const STATE_VERSION = 1

/** 卡片映射保留天数（飞书卡片只在 14 天内可更新，语义与之对齐）。 */
export const CARD_TTL_DAYS = 14

/** 卡片映射的硬上限，防止长期运行撑大状态文件。 */
export const MAX_CARD_ENTRIES = 2000

/** 解析 DSH home：环境变量优先，其次 `~/.dsh`。 */
export function dshHome(env = process.env) {
  const fromEnv = typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  if (fromEnv !== '') return resolve(fromEnv)
  return join(homedir(), '.dsh')
}

/** 插件自己的目录。 */
export function pluginHome(env = process.env) {
  return join(dshHome(env), 'feishu-bot')
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const asString = (value, fallback = '') => (typeof value === 'string' ? value : fallback)
const asTime = (value) => (Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0)

/** 把任意读入值收敛成当前状态结构；未知字段直接丢弃。 */
export function coerceState(raw) {
  const source = isObject(raw) ? raw : {}
  return {
    version: STATE_VERSION,
    binding: coerceBinding(source.binding),
    enabledAck: coerceAck(source.enabledAck),
    pendingBind: coercePendingBind(source.pendingBind),
    cards: coerceCards(source.cards),
    lastError: coerceError(source.lastError),
  }
}

function coerceBinding(value) {
  if (!isObject(value)) return undefined
  const openId = asString(value.openId)
  const chatId = asString(value.chatId)
  if (openId === '') return undefined
  return {
    openId,
    ...(chatId === '' ? {} : { chatId }),
    boundAt: asString(value.boundAt),
    ...(asString(value.name) === '' ? {} : { name: asString(value.name) }),
  }
}

function coerceAck(value) {
  if (!isObject(value)) return undefined
  const at = asString(value.at)
  if (at === '') return undefined
  return { at, ...(asString(value.messageId) === '' ? {} : { messageId: asString(value.messageId) }) }
}

function coercePendingBind(value) {
  if (!isObject(value)) return undefined
  const code = asString(value.code)
  const expiresAt = asTime(value.expiresAt)
  if (code === '' || expiresAt === 0) return undefined
  return { code, issuedAt: asTime(value.issuedAt), expiresAt }
}

function coerceCards(value) {
  if (!isObject(value)) return {}
  const cards = {}
  for (const [messageId, entry] of Object.entries(value)) {
    if (messageId === '' || !isObject(entry)) continue
    const sessionId = asString(entry.sessionId)
    if (sessionId === '') continue
    const kind = entry.kind === 'question' || entry.kind === 'approval' ? entry.kind : 'complete'
    cards[messageId] = {
      sessionId,
      kind,
      requestId: asString(entry.requestId) || undefined,
      at: asTime(entry.at),
    }
  }
  return cards
}

function coerceError(value) {
  if (!isObject(value)) return undefined
  const message = asString(value.message)
  if (message === '') return undefined
  return { at: asTime(value.at), message }
}

/** 空状态（首次安装）。 */
export function emptyState() {
  return coerceState(undefined)
}

/**
 * 丢弃过期与超量的卡片映射。
 * @param state - 待原地清理的状态。
 * @param now - 当前毫秒时间戳。
 * @returns 是否发生了改动。
 */
export function pruneCards(state, now = Date.now()) {
  const cutoff = now - CARD_TTL_DAYS * 86_400_000
  const entries = Object.entries(state.cards)
  let changed = false
  for (const [messageId, entry] of entries) {
    if (entry.at !== 0 && entry.at < cutoff) {
      delete state.cards[messageId]
      changed = true
    }
  }
  const remaining = Object.entries(state.cards)
  if (remaining.length > MAX_CARD_ENTRIES) {
    remaining.sort((left, right) => right[1].at - left[1].at)
    for (const [messageId] of remaining.slice(MAX_CARD_ENTRIES)) {
      delete state.cards[messageId]
      changed = true
    }
  }
  return changed
}

/**
 * 一条状态：读一次、改多次、显式保存。
 *
 * 用法：
 *   const store = new StateStore()
 *   store.state.binding = { openId, chatId, boundAt }
 *   store.save()
 */
export class StateStore {
  /** @param options - 可选的 home 覆盖（测试用）。 */
  constructor(options = {}) {
    this.directory = options.directory ?? pluginHome(options.env ?? process.env)
    this.file = join(this.directory, 'state.json')
    this.state = emptyState()
    this.loaded = false
  }

  /** 读取状态；文件缺失或损坏都返回空状态（损坏件先备份）。 */
  load() {
    this.loaded = true
    if (!existsSync(this.file)) {
      this.state = emptyState()
      return this.state
    }
    let text
    try {
      text = readFileSync(this.file, 'utf8').replace(/^\uFEFF/u, '')
    } catch {
      this.state = emptyState()
      return this.state
    }
    try {
      this.state = coerceState(JSON.parse(text))
    } catch {
      this.backupCorrupt(text)
      this.state = emptyState()
    }
    if (pruneCards(this.state)) this.save()
    return this.state
  }

  /** 原子保存当前状态。失败时抛错，由调用方决定是否降级为内存态。 */
  save() {
    mkdirSync(this.directory, { recursive: true })
    pruneCards(this.state)
    const text = `${JSON.stringify(this.state, null, 2)}\n`
    const temporary = `${this.file}.tmp-${process.pid}`
    writeFileSync(temporary, text, { encoding: 'utf8', mode: 0o600 })
    renameSync(temporary, this.file)
    try {
      chmodSync(this.file, 0o600)
    } catch {
      // Windows 上 chmod 只对只读位有意义；失败不影响可用性。
    }
  }

  /** 记录一条错误摘要（供设置卡片展示）。 */
  noteError(message, at = Date.now()) {
    const text = typeof message === 'string' ? message.trim() : String(message ?? '')
    if (text === '') return
    this.state.lastError = { at, message: text.slice(0, 500) }
    this.save()
  }

  /** 清空错误摘要。 */
  clearError() {
    if (this.state.lastError === undefined) return
    delete this.state.lastError
    this.save()
  }

  /** 记住一张卡片属于哪个会话。 */
  rememberCard(messageId, entry, at = Date.now()) {
    if (typeof messageId !== 'string' || messageId === '') return
    this.state.cards[messageId] = {
      sessionId: entry.sessionId,
      kind: entry.kind,
      ...(entry.requestId === undefined ? {} : { requestId: entry.requestId }),
      at,
    }
    this.save()
  }

  /** 查卡片归属。 */
  cardFor(messageId) {
    if (typeof messageId !== 'string' || messageId === '') return undefined
    return this.state.cards[messageId]
  }

  backupCorrupt(text) {
    try {
      const target = join(this.directory, `state.json.bad-${Date.now()}`)
      writeFileSync(target, text, 'utf8')
      rmSync(this.file, { force: true })
    } catch {
      // 备份失败也不能阻止启动。
    }
  }
}

/** 给设置页看的部分脱敏：保留可辨认的前缀/后缀。 */
export function maskId(value) {
  if (typeof value !== 'string' || value === '') return ''
  if (value.length <= 8) return `${value.slice(0, 2)}****`
  return `${value.slice(0, 5)}****${value.slice(-2)}`
}

/** 确保目录存在（给锁文件等外部使用者）。 */
export function ensureDir(directory) {
  mkdirSync(directory, { recursive: true })
  return directory
}

/** 父目录（导出以便测试断言路径布局）。 */
export function dirnameOf(file) {
  return dirname(file)
}
