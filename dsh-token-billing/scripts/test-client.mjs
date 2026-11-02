/**
 * dsh-token-billing —— 浏览器半侧冒烟测试。
 *
 * 在 jsdom 里按 DSH 的模块加载方式执行 `lib/client.js`，用假的
 * `configForms` / `slots` / `locale` 服务挂载插件，然后：
 *   - 渲染费用行，核对缓存命中、未缓存输入、输出的计费结果；
 *   - 渲染配置卡片，核对价格表与保存载荷；
 *   - 直接测试纯函数（币种换算、匹配优先级、校验等）。
 *
 *   node scripts/test-client.mjs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import React from "react";
import { createRoot } from "react-dom/client";
import { Config as HostConfig, DEFAULT_MODELS as HOST_DEFAULT_MODELS } from "../lib/index.js";

const dom = new JSDOM("<!doctype html><html><head></head><body><div id=\"app\"></div></body></html>", {
  url: "http://127.0.0.1:53178/",
  pretendToBeVisual: true,
  runScripts: "outside-only",
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.HTMLElement = window.HTMLElement;
global.Event = window.Event;
global.MouseEvent = window.MouseEvent;
global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
global.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

if (typeof window.Element.prototype.attachEvent !== "function") {
  window.Element.prototype.attachEvent = () => {};
  window.Element.prototype.detachEvent = () => {};
}

// ── 按 DSH 的模块加载方式执行 bundle ──────────────────────────────────

let exported = null;
window.__ModuleLoader__ = {
  load({ id, factory }) {
    const require = (spec) => {
      if (spec === "react") return React;
      throw new Error(`unexpected require ${spec}`);
    };
    exported = factory(require);
    console.log(`module loaded: ${id}`);
  },
};
const code = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
window.eval(code);
assert.equal(typeof exported.apply, "function", "bundle exports apply()");
const api = exported.__test;
assert.ok(api, "bundle exposes __test helpers");

// ── 假宿主服务 ───────────────────────────────────────────────────────

const CONFIG = api.normalizePricing({
  enabled: true,
  currency: "CNY",
  exchangeRate: 7.2,
  showUnpriced: true,
  models: [{ provider: "deepseek-official", model: "deepseek-flash", currency: "CNY", input: 2, cacheRead: 0.2, cacheWrite: 2, output: 3 }],
});

const formListeners = new Set();
let formState = { status: "ready", value: CONFIG, writable: true, revision: 1, base: {}, user: {} };
const savedOps = [];
const form = {
  getSnapshot: () => formState,
  subscribe(listener) {
    formListeners.add(listener);
    return () => formListeners.delete(listener);
  },
  async mutate(ops) {
    savedOps.push(ops);
    return true;
  },
  async set(field, value) {
    savedOps.push([{ op: "set", path: [field], value }]);
    return true;
  },
  async unset() {
    return true;
  },
};

const registrations = [];
const locales = [];
const fakeSlots = {
  inject(slot, callback) {
    callback();
    return () => {};
  },
  register(options, component) {
    registrations.push({ slot: options.name, options, component });
    return () => {};
  },
};

const fakeCtx = {
  effect(factory) {
    const disposer = factory();
    return typeof disposer === "function" ? disposer : () => {};
  },
  inject(deps, callback) {
    if (deps.includes("slots")) {
      const child = {
        slots: fakeSlots,
        locale: {
          register(ns, dicts) {
            locales.push({ ns, dicts });
            return () => {};
          },
        },
        effect: fakeCtx.effect,
        inject(nestedDeps, nestedCallback) {
          if (nestedDeps.includes("configForms")) {
            nestedCallback({
              configForms: { get: () => form },
              effect: fakeCtx.effect,
            });
          }
        },
      };
      callback(child);
      return;
    }
    if (deps.includes("configForms")) {
      callback({ configForms: { get: () => form }, effect: fakeCtx.effect });
    }
  },
};

exported.apply(fakeCtx);

const turnRegistration = registrations.find((entry) => entry.slot === "conversation.chat.assistant-actions");
const sessionRegistration = registrations.find((entry) => entry.slot === "conversation.composer.dock");
const configRegistration = registrations.find((entry) => entry.slot === "plugins.bundle.config");
assert.ok(turnRegistration, "registers into conversation.chat.assistant-actions");
assert.ok(sessionRegistration, "registers into conversation.composer.dock");
assert.ok(configRegistration, "registers into plugins.bundle.config");
assert.equal(locales.length, 1, "registers one locale namespace");
assert.ok(locales[0].dicts.zh && locales[0].dicts.en, "locale has zh and en dictionaries");

// ── 假 Hook 与 Chat 数据 ─────────────────────────────────────────────

function sourceHook(source) {
  return (selector) => React.useSyncExternalStore(
    source.subscribe,
    () => selector(source.getSnapshot()),
  );
}

const t = (key, params = {}) => {
  let text = locales[0].dicts.zh[key] ?? key;
  for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
};

const usage = {
  uncachedInputTokens: 1000,
  cacheReadTokens: 9000,
  cacheWriteTokens: 0,
  outputTokens: 500,
  totalTokens: 10500,
  routes: [{ provider: "deepseek-official", model: "deepseek-flash" }],
};
const route = { provider: "deepseek-official", model: "deepseek-flash" };
const stepData = { usage, finalNode: { usage, providerMetadata: route } };
const turn = {
  turn: 1,
  steps: [{ data: { get: (key) => (key === "assistant-step" ? stepData : undefined) } }],
};
const turnData = {
  tokenUsage: usage,
  closing: { finalNode: { messageId: "m1" } },
};
turn.data = { get: (key) => (key === "turn-tail" ? turnData : undefined) };
const turns = new Map([[1, turn]]);
const chatSnapshot = { timeline: { turns } };
const chatSource = {
  getSnapshot: () => chatSnapshot,
  subscribe: () => () => {},
};

const injected = turnRegistration.options.inject();
assert.ok(injected.hooks && injected.hooks.pricing, "turn pill injects a pricing source");

// ── 渲染每轮费用（操作行）───────────────────────────────────────────

const container = document.getElementById("app");
const root = createRoot(container);
await new Promise((resolve) => {
  root.render(React.createElement(turnRegistration.component, {
    messageId: "m1",
    t,
    useChat: sourceHook(chatSource),
    usePricing: sourceHook(injected.hooks.pricing),
  }));
  setTimeout(resolve, 80);
});

const rendered = container.textContent ?? "";
console.log("turn cost:", rendered.replace(/\s+/g, " ").trim());
assert.ok(rendered.includes("费用 ¥0.0053"), `expected ¥0.0053 in ${rendered}`);
assert.ok(rendered.includes("缓存 90.0%"), `expected cache hit in ${rendered}`);
const turnPill = container.querySelector("[data-token-billing-turn]");
assert.ok(turnPill, "turn pill carries the turn marker");
const title = turnPill.getAttribute("title") ?? turnPill.firstElementChild?.getAttribute("title") ?? "";
assert.ok(title.includes("未缓存输入"), "title shows uncached input");
assert.ok(title.includes("1,000 tok"), "title shows exact input token count");
assert.ok(title.includes("缓存读取"), "title shows cache read");
assert.ok(title.includes("9,000 tok"), "title shows exact cache token count");
assert.ok(title.includes("缓存: 90.0%"), "title shows cache hit");

// ── 渲染会话费用（输入框底部统计栏）─────────────────────────────────

const sessionInjected = sessionRegistration.options.inject();
const projectedLoaded = {
  uncachedInputTokens: 1000,
  cacheReadTokens: 9000,
  cacheWriteTokens: 0,
  outputTokens: 500,
};
const sessionContainer = window.document.createElement("div");
window.document.body.appendChild(sessionContainer);
const sessionRoot = createRoot(sessionContainer);
await new Promise((resolve) => {
  sessionRoot.render(React.createElement(sessionRegistration.component, {
    t,
    useChat: sourceHook(chatSource),
    usePricing: sourceHook(sessionInjected.hooks.pricing),
    useProjection: () => projectedLoaded,
  }));
  setTimeout(resolve, 80);
});
const sessionText = sessionContainer.textContent ?? "";
console.log("session cost:", sessionText.replace(/\s+/g, " ").trim());
assert.ok(sessionText.includes("会话费用 ¥0.0053"), `expected session total in ${sessionText}`);

const projectedMore = {
  uncachedInputTokens: 2000,
  cacheReadTokens: 18000,
  cacheWriteTokens: 0,
  outputTokens: 1000,
};
const sessionMoreContainer = window.document.createElement("div");
window.document.body.appendChild(sessionMoreContainer);
const sessionMoreRoot = createRoot(sessionMoreContainer);
await new Promise((resolve) => {
  sessionMoreRoot.render(React.createElement(sessionRegistration.component, {
    t,
    useChat: sourceHook(chatSource),
    usePricing: sourceHook(sessionInjected.hooks.pricing),
    useProjection: () => projectedMore,
  }));
  setTimeout(resolve, 80);
});
const sessionMoreText = sessionMoreContainer.textContent ?? "";
console.log("session cost with missing history:", sessionMoreText.replace(/\s+/g, " ").trim());
assert.ok(sessionMoreText.includes("≈ 会话费用 ¥0.0106"), `expected estimated session total in ${sessionMoreText}`);

// ── 渲染配置卡片 ─────────────────────────────────────────────────────

const configInjected = configRegistration.options.inject();
assert.ok(configInjected.form, "settings card receives the form");

const configContainer = window.document.createElement("div");
window.document.body.appendChild(configContainer);
const configRoot = createRoot(configContainer);
await new Promise((resolve) => {
  configRoot.render(React.createElement(configRegistration.component, {
    form: configInjected.form,
    t,
  }));
  setTimeout(resolve, 80);
});
const settingsText = configContainer.textContent ?? "";
console.log("settings:", settingsText.replace(/\s+/g, " ").slice(0, 220));
assert.ok(settingsText.includes("模型费用表"), "settings show the model table");
assert.ok(settingsText.includes("deepseek-flash"), "settings show a default model");
assert.ok(settingsText.includes("人民币（CNY）"), "settings show the currency choice");
assert.ok(settingsText.includes("每 100 万 token"), "settings show the price unit");

// 添加一行：出现新模型卡片，且校验要求填写模型名。
const addButton = Array.from(configContainer.querySelectorAll("button")).find(
  (node) => node.textContent?.trim() === "添加模型",
);
assert.ok(addButton, "settings expose an add-model button");
addButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 60));
assert.ok((configContainer.textContent ?? "").includes("新模型"), "adding a model shows a new card");

// ── 纯函数：计费 ─────────────────────────────────────────────────────

const priced = api.computeTurnCost(turn, turnData, CONFIG);
assert.equal(priced.priced, true);
assert.equal(priced.currency, "CNY");
assert.equal(priced.tokens.total, 10500);
assert.equal(priced.cacheHitPercent, 90);
assert.ok(Math.abs(priced.total - 0.0053) < 1e-12, `expected 0.0053, got ${priced.total}`);
assert.equal(priced.items.length, 1);
assert.ok(Math.abs(priced.items[0].costInput - 0.002) < 1e-12);
assert.ok(Math.abs(priced.items[0].costCacheRead - 0.0018) < 1e-12);
assert.ok(Math.abs(priced.items[0].costOutput - 0.0015) < 1e-12);

// 没有可证明用量时不显示。
assert.equal(api.computeTurnCost(turn, {}, CONFIG), null);
assert.equal(api.computeTurnCost(turn, { tokenUsage: undefined }, CONFIG), null);

// 缓存单价留空 → 按输入价。
const fallbackPricing = api.normalizePricing({
  currency: "CNY",
  models: [{ provider: "", model: "m", currency: "CNY", input: 2, output: 3 }],
});
const fallbackUsage = {
  uncachedInputTokens: 0,
  cacheReadTokens: 1_000_000,
  outputTokens: 0,
  totalTokens: 1_000_000,
  routes: [{ provider: "p", model: "m" }],
};
const fallback = api.computeTurnCost(undefined, { tokenUsage: fallbackUsage }, fallbackPricing);
assert.ok(Math.abs(fallback.total - 2) < 1e-12, `cache read should fall back to input, got ${fallback.total}`);

// 跨币种：USD 单价换算到 CNY。
const usdPricing = api.normalizePricing({
  currency: "CNY",
  exchangeRate: 7.2,
  models: [{
    provider: "",
    model: "usd-model",
    currency: "USD",
    input: 0.3,
    cacheRead: 0.03,
    output: 2.5,
  }],
});
const usdUsage = {
  uncachedInputTokens: 1_000_000,
  cacheReadTokens: 1_000_000,
  outputTokens: 100_000,
  totalTokens: 2_100_000,
  routes: [{ provider: "x", model: "usd-model" }],
};
const usd = api.computeTurnCost(undefined, { tokenUsage: usdUsage }, usdPricing);
assert.ok(Math.abs(usd.total - (0.3 + 0.03 + 0.25) * 7.2) < 1e-12, `USD conversion got ${usd.total}`);

// 显示 USD：CNY 单价换算回 USD。
const cnyAsUsd = api.computeTurnCost(undefined, {
  tokenUsage: {
    uncachedInputTokens: 1_000_000,
    outputTokens: 0,
    totalTokens: 1_000_000,
    routes: [{ provider: "deepseek-official", model: "deepseek-flash" }],
  },
}, api.normalizePricing({
  currency: "USD",
  exchangeRate: 7.2,
  models: [{ provider: "deepseek-official", model: "deepseek-flash", currency: "CNY", input: 2, output: 3 }],
}));
assert.ok(Math.abs(cnyAsUsd.total - 2 / 7.2) < 1e-12, `CNY→USD got ${cnyAsUsd.total}`);

// 多模型回合：逐步归属不一致时回退为估算。
const multiUsage = {
  uncachedInputTokens: 1000,
  outputTokens: 0,
  totalTokens: 1000,
  routes: [{ provider: "a", model: "one" }, { provider: "b", model: "two" }],
};
const multiPricing = api.normalizePricing({
  currency: "CNY",
  models: [
    { provider: "a", model: "one", currency: "CNY", input: 2, output: 0 },
    { provider: "b", model: "two", currency: "CNY", input: 4, output: 0 },
  ],
});
const multi = api.computeTurnCost(undefined, { tokenUsage: multiUsage }, multiPricing);
assert.equal(multi.estimated, true);
assert.ok(Math.abs(multi.total - ((2 + 4) / 2) / 1000) < 1e-12, `multi-route estimate got ${multi.total}`);

// 未匹配模型。
const unpriced = api.computeTurnCost(undefined, {
  tokenUsage: {
    uncachedInputTokens: 10,
    outputTokens: 0,
    totalTokens: 10,
    routes: [{ provider: "nobody", model: "nothing" }],
  },
}, CONFIG);
assert.equal(unpriced.priced, false);
assert.equal(unpriced.unpricedRoutes.length, 1);

// `routes` 整体缺席（例如有重试尝试）时，用步骤节点上的 provider/model 兜底。
const retriedStep = {
  usage: { uncachedInputTokens: 10, outputTokens: 0, totalTokens: 10 },
  finalNode: { providerMetadata: route },
};
const retriedTurn = {
  turn: 2,
  steps: [{ data: { get: (key) => (key === "assistant-step" ? retriedStep : undefined) } }],
};
const retried = api.computeTurnCost(retriedTurn, {
  tokenUsage: { uncachedInputTokens: 20, outputTokens: 0, totalTokens: 20 },
}, CONFIG);
assert.equal(retried.priced, true);
assert.ok(Math.abs(retried.total - 20 * 2 / 1_000_000) < 1e-12, `retry route fallback got ${retried.total}`);

// 会话合计：已加载回合精确相加；投影里多出的历史 token 按最后路由估算。
const sessionSummary = api.computeSessionCost(turns, CONFIG, undefined);
assert.equal(sessionSummary.hasUsage, true);
assert.equal(sessionSummary.pricedTurns, 1);
assert.equal(sessionSummary.turnsWithUsage, 1);
assert.ok(Math.abs(sessionSummary.total - 0.0053) < 1e-12, `session sum got ${sessionSummary.total}`);
assert.equal(sessionSummary.estimated, false);
assert.equal(api.turnForClosingMessage(chatSnapshot, "m1"), turn);
assert.equal(api.turnForClosingMessage(chatSnapshot, "missing"), undefined);

const sessionWithMissing = api.computeSessionCost(turns, CONFIG, {
  uncachedInputTokens: 2000,
  cacheReadTokens: 18000,
  cacheWriteTokens: 0,
  outputTokens: 1000,
});
assert.equal(sessionWithMissing.estimated, true);
assert.equal(sessionWithMissing.missingTokens, 10500);
assert.ok(
  Math.abs(sessionWithMissing.total - 0.0106) < 1e-12,
  `session missing-history estimate got ${sessionWithMissing.total}`,
);

// 匹配优先级：provider+model 精确优先于只写模型名，通配最后。
const priorityPricing = api.normalizePricing({
  models: [
    { provider: "", model: "same", currency: "CNY", input: 1, output: 0 },
    { provider: "p", model: "same", currency: "CNY", input: 2, output: 0 },
    { provider: "*", model: "*", currency: "CNY", input: 9, output: 0 },
  ],
});
assert.equal(api.findRate(priorityPricing, { provider: "p", model: "same" }).input, 2);
assert.equal(api.findRate(priorityPricing, { provider: "q", model: "same" }).input, 1);
assert.equal(api.findRate(priorityPricing, { provider: "q", model: "other" }).input, 9);

// ── 纯函数：格式化与草稿 ─────────────────────────────────────────────

assert.equal(api.formatMoney(0.0053, "CNY"), "¥0.0053");
assert.equal(api.formatMoney(1.234, "USD"), "$1.23");
assert.equal(api.formatMoney(0, "CNY"), "¥0");
assert.equal(api.formatTokens(1234567), "1,234,567");
assert.equal(api.formatPercent(90), "90.0%");

const draft = api.toDraft(CONFIG);
assert.equal(draft.models.length, 1);
assert.equal(draft.models[0].cacheRead, "0.2");
const payload = api.buildSavePayload(draft);
assert.equal(payload.models[0].cacheRead, 0.2);
assert.equal(payload.models[0].provider, "deepseek-official");

const blankDraft = api.toDraft({
  currency: "USD",
  exchangeRate: 7.1,
  models: [{ model: "m", input: 1, cacheRead: null, cacheWrite: null, output: 2 }],
});
assert.equal(blankDraft.models[0].cacheRead, "");
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(api.buildSavePayload(blankDraft).models[0])),
  {
    provider: "",
    model: "m",
    currency: "CNY",
    input: 1,
    output: 2,
  },
);

assert.equal(api.validateDraft(api.toDraft({ models: [] })), null);
assert.equal(api.validateDraft({ ...blankDraft, exchangeRate: "0" }), "rate");
assert.equal(api.validateDraft({ ...blankDraft, models: [{ ...blankDraft.models[0], model: "" }] }), "model:0");
assert.equal(
  api.validateDraft({ ...blankDraft, models: [blankDraft.models[0], { ...blankDraft.models[0] }] }),
  "duplicate:m",
);
assert.equal(
  api.validateDraft({ ...blankDraft, models: [{ ...blankDraft.models[0], input: "abc" }] }),
  "price:0:input",
);

// ── 内置费用表：Giant LiteLLM 文档价格，峰谷价取高峰 ────────────────

assert.equal(api.DEFAULT_MODELS.length, 31);
const defaults = new Map(api.DEFAULT_MODELS.map((row) => [row.model, row]));
assert.deepStrictEqual(
  { input: defaults.get("deepseek-flash").input, output: defaults.get("deepseek-flash").output },
  { input: 0.3, output: 1.2 },
  "deepseek-flash uses peak pricing",
);
assert.deepStrictEqual(
  { input: defaults.get("deepseek-v4-pro").input, output: defaults.get("deepseek-v4-pro").output },
  { input: 0.66, output: 3.96 },
  "deepseek-v4-pro uses peak pricing",
);
assert.equal(defaults.get("claude-opus-5-5").input, 4);
assert.equal(defaults.get("claude-opus-5-5").output, 20);
assert.equal(defaults.get("gemini-3.8-flash").input, 0.75);
assert.equal(defaults.get("gemini-3.8-flash").output, 3.75);
assert.equal(defaults.get("glm-5.3-flash").input, 0.11);
assert.equal(defaults.get("kimi-k3").output, 15);
assert.equal(defaults.get("minimax-m3").output, 1.2);
assert.equal(defaults.get("gemini-4-argon"), undefined, "struck-through model is omitted");

// ── 宿主默认值必须与浏览器侧一致 ────────────────────────────────────

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(api.DEFAULT_MODELS)),
  JSON.parse(JSON.stringify(HOST_DEFAULT_MODELS)),
  "browser defaults match the host Config defaults",
);
const hostParsed = HostConfig({});
assert.equal(hostParsed.enabled.get(), true);
assert.equal(hostParsed.currency.get(), "USD");
assert.equal(hostParsed.models.get().length, HOST_DEFAULT_MODELS.length);
const hostCustom = HostConfig({ models: [{ model: "m", input: 1, output: 2 }] });
assert.deepStrictEqual(JSON.parse(JSON.stringify(hostCustom.models.get()[0])), {
  provider: "",
  model: "m",
  currency: "CNY",
  input: 1,
  output: 2,
});

console.log("\nall client checks passed");
root.unmount();
configRoot.unmount();
dom.window.close();
