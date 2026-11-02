/**
 * dsh-token-billing —— 宿主半侧。
 *
 * 宿主只负责本插件的配置文档。所有字段都声明为 `.volatile()`，设置服务据此
 * 把它们投影成 Plugins 页上的配置表单；保存时写入当前 profile 的 patch，作为
 * 本行的覆盖值。
 *
 * 费用本身由浏览器半侧（`lib/client.js`）计算：token 用量已经在会话事件里，
 * 浏览器侧拿到每个回合的 `TurnTokenUsage` 后按这里的价格表计价并渲染。
 * 宿主不读取、也不参与计价。
 */
import z from "@deepseek-ai/schemastery";

/** 本 bundle 插入的行 id（同时是设置在设置服务里的命名空间）。 */
export const BILLING_NS = "token-billing";

/**
 * 内置价格表：Giant LiteLLM 接入指引（2026-10-30）。
 *
 * 价格单位统一为「每 100 万 token」，币种 USD。文档只给出输入/输出价，
 * 因此 `cacheRead` / `cacheWrite` 省略，按输入价计费。存在峰谷价的
 * `deepseek-flash` / `deepseek-v4-pro` 默认采用**高峰时段**价格。
 * 文档中已划线的 `gemini-4-argon`（暂时不可用）未收录。
 */
export const DEFAULT_MODELS = [
  { model: "claude-opus-5-5", currency: "USD", input: 4, output: 20 },
  { model: "claude-sonnet-5-5", currency: "USD", input: 2, output: 10 },
  { model: "claude-haiku-5-5", currency: "USD", input: 0.1, output: 0.5 },
  { model: "gemini-3.1-pro-preview", currency: "USD", input: 2, output: 12 },
  { model: "gemini-3.8-flash", currency: "USD", input: 0.75, output: 3.75 },
  { model: "gemini-3.5-flash-lite", currency: "USD", input: 0.3, output: 2.5 },
  { model: "gemini-3.1-flash-lite", currency: "USD", input: 0.25, output: 1.5 },
  { model: "deepseek-flash", currency: "USD", input: 0.3, output: 1.2 },
  { model: "deepseek-v4-pro", currency: "USD", input: 0.66, output: 3.96 },
  { model: "gpt-6.1-sol", currency: "USD", input: 2, output: 10 },
  { model: "gpt-6.1-terra", currency: "USD", input: 1, output: 5 },
  { model: "gpt-6-astra", currency: "USD", input: 10, output: 50 },
  { model: "gpt-6-sol", currency: "USD", input: 2, output: 10 },
  { model: "gpt-6-luna", currency: "USD", input: 0.1, output: 0.5 },
  { model: "gpt-5.6-sol", currency: "USD", input: 4, output: 20 },
  { model: "gpt-5.6-terra", currency: "USD", input: 2, output: 12 },
  { model: "gpt-5.6-luna", currency: "USD", input: 0.2, output: 1.2 },
  { model: "global.openai.gpt-6.1-sol", currency: "USD", input: 2, output: 10 },
  { model: "global.openai.gpt-6.1-terra", currency: "USD", input: 1, output: 5 },
  { model: "global.openai.gpt-6-astra", currency: "USD", input: 10, output: 50 },
  { model: "global.openai.gpt-6-sol", currency: "USD", input: 2, output: 10 },
  { model: "global.openai.gpt-6-luna", currency: "USD", input: 0.1, output: 0.5 },
  { model: "global.openai.gpt-5.6-sol", currency: "USD", input: 4, output: 20 },
  { model: "global.openai.gpt-5.6-terra", currency: "USD", input: 2, output: 12 },
  { model: "global.openai.gpt-5.6-luna", currency: "USD", input: 0.2, output: 1.2 },
  { model: "glm-5.2", currency: "USD", input: 1.4, output: 4.4 },
  { model: "glm-5.3", currency: "USD", input: 1.19, output: 4.17 },
  { model: "glm-5.3-flash", currency: "USD", input: 0.11, output: 0.42 },
  { model: "glm-5.3-flashx", currency: "USD", input: 0.3, output: 1.04 },
  { model: "kimi-k3", currency: "USD", input: 3, output: 15 },
  { model: "minimax-m3", currency: "USD", input: 0.3, output: 1.2 },
];

/** 一个模型的价格条目。 */
const modelPrice = z.object({
  /** 提供方路由 id，例如 `deepseek-official`；留空表示只按模型名匹配。 */
  provider: z.string().default(""),
  /** 模型 id，例如 `deepseek-flash`；`*` 表示该提供方下的任意模型。 */
  model: z.string().min(1),
  /** 这条单价的计费币种：CNY 或 USD。 */
  currency: z.union(["CNY", "USD"]).default("CNY"),
  /** 每 100 万未缓存输入 token 的价格。 */
  input: z.number().min(0).default(0),
  /** 每 100 万缓存命中（读取）token 的价格；省略时按输入价。 */
  cacheRead: z.number().min(0),
  /** 每 100 万缓存写入 token 的价格；省略时按输入价。 */
  cacheWrite: z.number().min(0),
  /** 每 100 万输出 token 的价格。 */
  output: z.number().min(0).default(0),
});

/** 本插件的配置文档。 */
export const Config = z.object({
  /** 总开关。 */
  enabled: z.boolean().default(true).volatile(),
  /** 费用显示货币：CNY（人民币）或 USD（美元）。 */
  currency: z.union(["CNY", "USD"]).default("USD").volatile(),
  /** 1 USD 折合多少 CNY，用于跨币种换算。 */
  exchangeRate: z.number().min(0.000001).default(7.2).volatile(),
  /** 没有匹配到单价时，是否在消息后面显示「未配置价格」。 */
  showUnpriced: z.boolean().default(true).volatile(),
  /** 每个模型的费用表，价格单位为每 100 万 token。 */
  models: z.array(modelPrice).default(DEFAULT_MODELS).volatile(),
});

/**
 * 挂载计费插件的宿主半侧。
 *
 * 注册 `auto: false` 表示本插件自带设置页（即 `plugins.bundle.config` 里注册的
 * 卡片），因此设置服务不会再为同一行生成一份 schema 页面。
 *
 * @param ctx - 宿主 Cordis 上下文。
 */
export function apply(ctx) {
  ctx.inject(["settings"], (child) => {
    // 页面策略来自新版设置服务；旧版宿主没有它时，浏览器半侧仍会用声明的
    // 默认值正常计费。
    if (typeof child.settings.configure !== "function") return;
    child.effect(
      () => child.settings.configure({ auto: false }, ctx.fiber),
      "token-billing: 设置页策略",
    );
  });
}
