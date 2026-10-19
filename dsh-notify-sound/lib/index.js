/**
 * dsh-notify-sound —— 宿主半侧。
 *
 * 宿主只负责本插件的配置文档。所有字段都声明为 `.volatile()`，设置服务据此
 * 把它们投影成插件页上的配置表单；保存时写入当前 profile 的 patch，作为本行
 * 的覆盖值。
 *
 * 浏览器半侧通过 `ctx.configForms` 读取同一行配置；本半侧不播放声音，也不在
 * 运行时读取这些值。
 */
import z from "@deepseek-ai/schemastery";

/** 本 bundle 插入的行 id（同时是设置在设置服务里的命名空间）。 */
export const NOTIFY_SOUND_NS = "notify-sound";

/**
 * 提示音的实时配置。
 *
 * 默认值就是新 profile 直接可用的状态：两个自定义音频留空（使用合成提示音）、
 * 中等音量、启用。`min`/`max` 限定设置页允许写入的音量范围。
 */
export const Config = z.object({
  /** 任务完成提示音的自定义音频（URL 或 data URI）；留空使用合成音。 */
  completeSound: z.string().default("").volatile(),
  /** 询问/审批提示音的自定义音频（URL 或 data URI）；留空使用合成音。 */
  questionSound: z.string().default("").volatile(),
  /** 两种提示音共用的音量，取值 0~1。 */
  volume: z.number().min(0).max(1).default(0.4).volatile(),
  /** 总开关。 */
  enabled: z.boolean().default(true).volatile(),
});

/**
 * 挂载提示音插件的宿主半侧。
 *
 * 宿主唯一的职责是配置文档，播放完全由浏览器半侧负责。注册 `auto: false`
 * 表示本插件自带设置页（即 `plugins.bundle.config` 里注册的卡片），
 * 因此设置服务不会再为同一行生成一份 schema 页面。
 *
 * @param ctx - 宿主 Cordis 上下文。
 */
export function apply(ctx) {
  ctx.inject(["settings"], (child) => {
    // 页面策略来自新版设置服务；旧版宿主没有它时，浏览器半侧仍会用声明的
    // 默认值正常播放提示音。
    if (typeof child.settings.configure !== "function") return;
    child.effect(
      () => child.settings.configure({ auto: false }, ctx.fiber),
      "notify-sound: 设置页策略",
    );
  });
}
