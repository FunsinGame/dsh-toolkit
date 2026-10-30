/**
 * dsh-feishu-bot —— 宿主半侧入口。
 *
 * 本行在 `cordis.patch.yml` 里以 `id: feishu-bot` 插入；所有可在插件页上编辑的
 * 字段都声明为 `.volatile()`，因此设置服务会为这一行生成表单，浏览器半侧用
 * `ctx.configForms.get('feishu-bot')` 读写同一份值。
 *
 * 宿主这边只做三件事：
 *   1. 把 Config 的 volatile 字段读成普通值快照，交给服务；
 *   2. 启动/卸载飞书服务（长连接、触发器、状态文件）；
 *   3. 在 `webServer` 上挂本插件的同源 JSON 路由。
 *
 * 配置里没有 `app_secret`：它属于凭据服务（`$DSH_HOME/.credentials.yaml`）。
 */
import z from '@deepseek-ai/schemastery'
import { FeishuBotService } from './service.js'
import { registerRoutes } from './routes.js'

/** 插件名（同时是浏览器半侧的模块 id）。 */
export const name = 'dsh-feishu-bot'

/** 必需服务：没有 Agent/Session 就没有可通知的东西。 */
export const inject = ['agents', 'sessions']

/**
 * 本插件的实时配置。
 *
 * 全部 `.volatile()`：改完立即生效，不需要重启 DSH；宿主每次使用时重新读取。
 */
export const Config = z.object({
  /** 总开关：只有它为 true 时才发通知、才接管提问/审批。 */
  enabled: z.boolean().default(false).volatile(),
  /** 飞书自建应用的 App ID（形如 `cli_xxx`）。 */
  appId: z.string().default('').volatile(),
  /** 任务回合结束后发完成卡片。 */
  notifyComplete: z.boolean().default(true).volatile(),
  /** Agent 提问时发卡片并允许在飞书作答。 */
  notifyQuestion: z.boolean().default(true).volatile(),
  /** 权限审批时发卡片并允许在飞书作答。 */
  notifyApproval: z.boolean().default(true).volatile(),
  /** 回合结束后等待多久再确认“真的空闲”（毫秒），避免 goal 续轮刷屏。 */
  completeDebounceMs: z.number().step(1).min(0).max(60000).default(1500).volatile(),
  /** 完成卡片里结果摘录的最大字符数。 */
  maxResultChars: z.number().step(1).min(200).max(20000).default(3000).volatile(),
  /** 提问选项超过该数量时改用编号列表 + 文本回答。 */
  maxCardButtons: z.number().step(1).min(1).max(10).default(6).volatile(),
})

/**
 * 读取一个 volatile 字段的当前值。
 *
 * 宿主既可能在配置里拿到 `Volatile<T>`（可 `.get()`），也可能拿到普通值（旧版
 * 设置服务或 `!!js` 表达式），这里都兼容。
 * @param value - 字段值。
 * @param fallback - 取不到时的默认值。
 * @returns 普通值。
 */
function readField(value, fallback) {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'object' && typeof value.get === 'function') {
    try {
      const resolved = value.get()
      return resolved === undefined || resolved === null ? fallback : resolved
    } catch {
      return fallback
    }
  }
  return value
}

/**
 * 挂载插件。
 * @param ctx - 宿主 Cordis 上下文。
 * @param config - 本行的 Config 实例（字段可能是 volatile 引用）。
 */
export function apply(ctx, config) {
  // 每次需要时重新读：volatile 字段的值会随设置页保存而变化。
  const readConfig = () => ({
    enabled: readField(config.enabled, false) === true,
    appId: readField(config.appId, ''),
    notifyComplete: readField(config.notifyComplete, true) !== false,
    notifyQuestion: readField(config.notifyQuestion, true) !== false,
    notifyApproval: readField(config.notifyApproval, true) !== false,
    completeDebounceMs: Number(readField(config.completeDebounceMs, 1500)),
    maxResultChars: Number(readField(config.maxResultChars, 3000)),
    maxCardButtons: Number(readField(config.maxCardButtons, 6)),
  })

  // 本 bundle 自带设置页，避免设置服务再自动生成一份。
  ctx.inject(['settings'], (child) => {
    if (typeof child.settings?.configure !== 'function') return
    child.effect(
      () => child.settings.configure({ auto: false }, ctx.fiber),
      'feishu-bot: 设置页策略',
    )
  })

  const service = new FeishuBotService(ctx, { config: readConfig, logger: ctx.logger })
  ctx.effect(() => {
    const ready = service.start().catch((error) => {
      ctx.logger?.warn?.(`dsh-feishu-bot: 启动失败：${error?.message ?? String(error)}`)
    })
    return async () => {
      await ready
      await service.dispose()
    }
  }, 'feishu-bot: service')

  ctx.inject(['webServer', 'connection'], (child) => {
    child.effect(() => registerRoutes(child, service), 'feishu-bot: routes')
  })
}
