/**
 * dsh-token-billing —— 浏览器半侧。
 *
 * 负责三件事：
 *   1. 在每条上下文（每个已完成回合）末尾显示本次费用；
 *   2. 在 Plugins 页本 bundle 的详情页上提供费用表配置卡片；
 *   3. 把宿主配置行（`token-billing`）同步为计价参数。
 *
 * 费用按 provider + model 匹配价格表。token 用量来自 Chat 快照里
 * `turn-tail` 的 `TurnTokenUsage`；该结构把缓存命中（cacheRead）、缓存写入
 * （cacheWrite）、未缓存输入与输出分开统计，因此可以分别计价。
 *
 * 本文件是手写的浏览器模块：`window.__ModuleLoader__.load` 只登记工厂，
 * 模块体在首次 require 时才执行。
 */
window.__ModuleLoader__.load({
	id: "dsh-token-billing",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const { useSyncExternalStore, useState, useEffect, useCallback, useMemo } = React;

		/** 宿主配置行的 id：设置的读写都定位到这一行。 */
		const ENTRY_ID = "token-billing";

		/** 本 bundle 在 Plugins 页注册配置页时使用的键（即包名）。 */
		const BUNDLE_NAME = "dsh-token-billing";

		/** 本插件拥有的词典命名空间。 */
		const NS = "token-billing";

		/** 价格表以「每 100 万 token」为单位。 */
		const PER_MILLION = 1_000_000;

		/** 支持币种。 */
		const CURRENCIES = ["CNY", "USD"];

		/**
		 * 浏览器侧的内置默认值，必须与宿主 `lib/index.js` 的 `Config` 默认值
		 * 保持一致：配置表单返回之前先用这份数据计费。
		 *
		 * 来源：Giant LiteLLM 接入指引（2026-10-30），USD / 每 100 万 token；
		 * `deepseek-flash` / `deepseek-v4-pro` 使用高峰时段价格。
		 */
		const DEFAULT_MODELS = [
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

		const DEFAULT_CONFIG = {
			enabled: true,
			currency: "USD",
			exchangeRate: 7.2,
			showUnpriced: true,
			models: DEFAULT_MODELS,
		};

		// ── 纯函数：配置归一化 ─────────────────────────────────────────────

		/** 非负有限数，否则返回 null。 */
		function readPrice(value) {
			if (value === undefined || value === null || value === "") return null;
			const number = typeof value === "number" ? value : Number(value);
			return Number.isFinite(number) && number >= 0 ? number : null;
		}

		/** 计费币种，非法值回落到 CNY。 */
		function readCurrency(value) {
			return value === "USD" ? "USD" : "CNY";
		}

		/** 归一化一条模型单价。 */
		function normalizeModel(raw) {
			if (raw === null || typeof raw !== "object") return null;
			const model = typeof raw.model === "string" ? raw.model.trim() : "";
			if (model === "") return null;
			const cacheRead = readPrice(raw.cacheRead);
			const cacheWrite = readPrice(raw.cacheWrite);
			return {
				provider: typeof raw.provider === "string" ? raw.provider.trim() : "",
				model,
				currency: readCurrency(raw.currency),
				input: readPrice(raw.input) ?? 0,
				...(cacheRead === null ? {} : { cacheRead }),
				...(cacheWrite === null ? {} : { cacheWrite }),
				output: readPrice(raw.output) ?? 0,
			};
		}

		/**
		 * 把设置表单的原始值归一化成计价快照。
		 * @param value - `configForms` 返回的已接受配置。
		 * @returns 计价快照；`models` 在配置缺失时回落到内置表。
		 */
		function normalizePricing(value) {
			const source = value !== null && typeof value === "object" ? value : {};
			const exchangeRate = readPrice(source.exchangeRate);
			const models = Array.isArray(source.models)
				? source.models.map(normalizeModel).filter((row) => row !== null)
				: DEFAULT_MODELS.map(normalizeModel).filter((row) => row !== null);
			return {
				enabled: source.enabled !== false,
				currency: readCurrency(source.currency),
				exchangeRate: exchangeRate !== null && exchangeRate > 0 ? exchangeRate : 7.2,
				showUnpriced: source.showUnpriced !== false,
				models,
			};
		}

		// ── 纯函数：计价 ─────────────────────────────────────────────────

		/** 非负安全整数计数。 */
		function count(value) {
			return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
		}

		/** 从 `TurnTokenUsage` / `TokenUsage` 读出互不重叠的 token 桶。 */
		function tokenCounts(usage) {
			const input = count(usage.uncachedInputTokens ?? usage.inputTokens);
			const cacheRead = count(usage.cacheReadTokens);
			const cacheWrite = count(usage.cacheWriteTokens);
			const output = count(usage.outputTokens);
			const total = count(usage.totalTokens) || input + cacheRead + cacheWrite + output;
			return {
				input,
				cacheRead,
				cacheWrite,
				output,
				reasoning: count(usage.reasoningTokens),
				prompt: input + cacheRead + cacheWrite,
				total,
			};
		}

		/** 按「1 USD = exchangeRate CNY」把金额换算到显示币种。 */
		function convertCurrency(amount, from, to, exchangeRate) {
			if (from === to) return amount;
			const rate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 7.2;
			if (from === "USD" && to === "CNY") return amount * rate;
			if (from === "CNY" && to === "USD") return amount / rate;
			return amount;
		}

		/** 模型路由的展示文本。 */
		function routeText(route) {
			if (route === undefined || route === null) return "";
			const provider = typeof route.provider === "string" ? route.provider.trim() : "";
			const model = typeof route.model === "string" ? route.model.trim() : "";
			if (provider !== "" && model !== "") return `${provider}/${model}`;
			return model || provider || "?";
		}

		/** 一组路由去重后的展示文本。 */
		function routesText(routes) {
			const seen = new Set();
			const parts = [];
			for (const route of routes ?? []) {
				const text = routeText(route);
				if (text === "" || seen.has(text)) continue;
				seen.add(text);
				parts.push(text);
			}
			return parts.join(", ");
		}

		/**
		 * 在价格表里为一条路由找单价。
		 *
		 * 匹配顺序：provider+model 精确匹配 → provider `*` + model → 只写了
		 * 模型名（provider 留空）的行 → 同名模型的任意 provider 行 → model `*`
		 * 的通配行。
		 * @param pricing - 计价快照。
		 * @param route - `{ provider, model }`。
		 * @returns 匹配到的单价条目，或 undefined。
		 */
		function findRate(pricing, route) {
			if (route === undefined || route === null) return undefined;
			const provider = typeof route.provider === "string" ? route.provider.trim().toLowerCase() : "";
			const model = typeof route.model === "string" ? route.model.trim().toLowerCase() : "";
			if (model === "") return undefined;
			const rows = pricing.models;
			const providerIsWildcard = (row) => row.provider === "*";
			const modelIsWildcard = (row) => row.model === "*";
			const rowProvider = (row) => row.provider.toLowerCase();
			const rowModel = (row) => row.model.toLowerCase();
			// 1. provider + model 精确匹配
			for (const row of rows) {
				if (rowProvider(row) === provider && rowModel(row) === model) return row;
			}
			// 2. 该 provider 的任意模型
			for (const row of rows) {
				if (providerIsWildcard(row) && rowModel(row) === model) return row;
			}
			// 3. 只按模型名匹配（provider 留空）
			for (const row of rows) {
				if (row.provider === "" && rowModel(row) === model) return row;
			}
			// 4. 模型名相同的任意 provider 行（模型是费用表的主键；provider 只是
			//    用来区分同名模型的更强匹配）
			for (const row of rows) {
				if (rowModel(row) === model) return row;
			}
			// 5. provider + `*`
			for (const row of rows) {
				if (rowProvider(row) === provider && modelIsWildcard(row)) return row;
			}
			// 6. 全部通配
			for (const row of rows) {
				if (modelIsWildcard(row)) return row;
			}
			return undefined;
		}

		/** 单条用量按一条单价计费（金额已换算到显示币种）。 */
		function partCost(usage, rate, pricing) {
			const tokens = tokenCounts(usage);
			const inputPrice = rate.input;
			const cacheReadPrice = rate.cacheRead === undefined ? inputPrice : rate.cacheRead;
			const cacheWritePrice = rate.cacheWrite === undefined ? inputPrice : rate.cacheWrite;
			const costInput = (tokens.input * inputPrice) / PER_MILLION;
			const costCacheRead = (tokens.cacheRead * cacheReadPrice) / PER_MILLION;
			const costCacheWrite = (tokens.cacheWrite * cacheWritePrice) / PER_MILLION;
			const costOutput = (tokens.output * rate.output) / PER_MILLION;
			const raw = costInput + costCacheRead + costCacheWrite + costOutput;
			const convert = (amount) =>
				convertCurrency(amount, rate.currency, pricing.currency, pricing.exchangeRate);
			return {
				...tokens,
				amount: convert(raw),
				costInput: convert(costInput),
				costCacheRead: convert(costCacheRead),
				costCacheWrite: convert(costCacheWrite),
				costOutput: convert(costOutput),
				rates: {
					input: inputPrice,
					cacheRead: cacheReadPrice,
					cacheWrite: cacheWritePrice,
					output: rate.output,
					currency: rate.currency,
				},
			};
		}

		/** 把多个精确步骤的 token 桶求和。 */
		function sumTokens(parts) {
			const totals = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, total: 0 };
			for (const part of parts) {
				const tokens = tokenCounts(part.usage);
				totals.input += tokens.input;
				totals.cacheRead += tokens.cacheRead;
				totals.cacheWrite += tokens.cacheWrite;
				totals.output += tokens.output;
				totals.total += tokens.total;
			}
			return totals;
		}

		/**
		 * 逐步用量与回合总量完全一致时，才能用逐步归属做精确的按模型计价。
		 * 重试等未落在 `assistant-step` 上的尝试会让两者不一致，此时回退到
		 * 回合总量。
		 */
		function exactParts(turn, aggregate) {
			if (turn === undefined || turn === null || !Array.isArray(turn.steps) || turn.steps.length === 0) {
				return undefined;
			}
			const parts = [];
			for (const step of turn.steps) {
				const data = step && step.data && typeof step.data.get === "function"
					? step.data.get("assistant-step")
					: undefined;
				if (data === undefined || data === null) return undefined;
				const usage = data.usage ?? (data.finalNode === undefined ? undefined : data.finalNode.usage);
				const route = data.finalNode === undefined ? undefined : data.finalNode.providerMetadata;
				if (usage === undefined || usage === null || route === undefined || route === null) return undefined;
				parts.push({ usage, route });
			}
			if (parts.length === 0) return undefined;
			const totals = sumTokens(parts);
			const expected = tokenCounts(aggregate);
			const keys = ["input", "cacheRead", "cacheWrite", "output", "total"];
			for (const key of keys) {
				if (totals[key] !== expected[key]) return undefined;
			}
			return parts;
		}

		/** 从步骤节点收集去重后的 provider/model 路由。 */
		function routesFromSteps(turn) {
			if (turn === undefined || turn === null || !Array.isArray(turn.steps)) return [];
			const seen = new Set();
			const routes = [];
			for (const step of turn.steps) {
				const data = step && step.data && typeof step.data.get === "function"
					? step.data.get("assistant-step")
					: undefined;
				const route = data === undefined || data === null || data.finalNode === undefined
					? undefined
					: data.finalNode.providerMetadata;
				if (route === undefined || route === null) continue;
				const provider = typeof route.provider === "string" ? route.provider.trim() : "";
				const model = typeof route.model === "string" ? route.model.trim() : "";
				if (model === "") continue;
				const key = `${provider}\u0000${model}`;
				if (seen.has(key)) continue;
				seen.add(key);
				routes.push({ provider, model });
			}
			return routes;
		}

		/**
		 * 计算一个已完成回合的费用。
		 * @param turn - `TurnLocation`（可以缺省，缺省时只用回合总量）。
		 * @param turnData - Chat 快照里的 `TurnTailChatData`。
		 * @param pricing - 计价快照。
		 * @returns 费用结果；没有可证明的用量时返回 null。
		 */
		function computeTurnCost(turn, turnData, pricing) {
			const aggregate = turnData === undefined || turnData === null ? undefined : turnData.tokenUsage;
			if (aggregate === undefined || aggregate === null) return null;
			const overall = tokenCounts(aggregate);
			let aggregateRoutes = Array.isArray(aggregate.routes) ? aggregate.routes : [];
			if (aggregateRoutes.length === 0) {
				// 有重试等没有 provider 归属的尝试时，`TurnTokenUsage.routes` 会整体
				// 缺席；这时用步骤节点上的最终 provider/model 兜底。
				aggregateRoutes = routesFromSteps(turn);
			}
			const parts = exactParts(turn, aggregate);
			const items = [];
			const unpricedRoutes = [];
			let estimated = false;

			const pushPart = (route, usage) => {
				const rate = findRate(pricing, route);
				if (rate === undefined) {
					unpricedRoutes.push(route);
					return;
				}
				items.push({ routes: [route], ...partCost(usage, rate, pricing) });
			};

			if (parts !== undefined) {
				for (const part of parts) pushPart(part.route, part.usage);
			} else if (aggregateRoutes.length === 1) {
				pushPart(aggregateRoutes[0], aggregate);
			} else if (aggregateRoutes.length > 1) {
				estimated = true;
				const matched = [];
				for (const route of aggregateRoutes) {
					const rate = findRate(pricing, route);
					if (rate === undefined) unpricedRoutes.push(route);
					else matched.push(rate);
				}
				if (matched.length > 0) {
					// 无法从回合总量里拆出每条路由的占比：按各路由对整段用量
					// 计费后取平均，并明确标记为估算值。
					const costs = matched.map((rate) => partCost(aggregate, rate, pricing));
					const amount = costs.reduce((sum, cost) => sum + cost.amount, 0) / costs.length;
					items.push({
						routes: aggregateRoutes.filter((route) => findRate(pricing, route) !== undefined),
						...overall,
						amount,
						costInput: undefined,
						costCacheRead: undefined,
						costCacheWrite: undefined,
						costOutput: undefined,
						rates: undefined,
					});
				}
			} else {
				// 没有 provider/model 归属：允许一条 `*` 通配价兜底。
				const rate = findRate(pricing, { provider: "", model: "*" });
				if (rate !== undefined) {
					items.push({ routes: [], ...partCost(aggregate, rate, pricing) });
				}
			}

			const total = items.reduce((sum, item) => sum + item.amount, 0);
			const cacheHitPercent = overall.prompt > 0 ? (overall.cacheRead / overall.prompt) * 100 : undefined;
			return {
				priced: items.length > 0,
				estimated,
				currency: pricing.currency,
				total,
				items,
				unpricedRoutes,
				cacheHitPercent,
				tokens: overall,
			};
		}

		// ── 纯函数：格式化 ───────────────────────────────────────────────

		/** 货币符号。 */
		function currencySymbol(currency) {
			return currency === "USD" ? "$" : "¥";
		}

		/** 按数量级选择小数位，避免每轮几分钱被四舍五入成 0。 */
		function formatMoney(amount, currency) {
			if (!Number.isFinite(amount)) return "—";
			const symbol = currencySymbol(currency);
			const absolute = Math.abs(amount);
			if (absolute === 0) return `${symbol}0`;
			if (absolute >= 1) return `${symbol}${amount.toFixed(2)}`;
			if (absolute >= 0.0001) return `${symbol}${amount.toFixed(4)}`;
			if (absolute >= 0.000001) return `${symbol}${amount.toFixed(6)}`;
			return `<${symbol}0.000001`;
		}

		/** 精确 token 数，带千分位。 */
		function formatTokens(value) {
			return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}

		/** 百分比，一位小数。 */
		function formatPercent(value) {
			return `${value.toFixed(1)}%`;
		}

		// ── 纯函数：设置卡片草稿 ─────────────────────────────────────────

		/** 数字 → 输入框文本。 */
		function priceText(value) {
			return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
		}

		/** 配置值 → 可编辑草稿。 */
		function toDraft(value) {
			const pricing = normalizePricing(value);
			return {
				enabled: pricing.enabled,
				currency: pricing.currency,
				exchangeRate: String(pricing.exchangeRate),
				showUnpriced: pricing.showUnpriced,
				models: pricing.models.map((row) => ({
					provider: row.provider,
					model: row.model,
					currency: row.currency,
					input: priceText(row.input),
					cacheRead: row.cacheRead === undefined ? "" : priceText(row.cacheRead),
					cacheWrite: row.cacheWrite === undefined ? "" : priceText(row.cacheWrite),
					output: priceText(row.output),
				})),
			};
		}

		/**
		 * 输入框文本 → 价格。
		 * @returns 数字、`null`（留空，表示省略/回落）或 `NaN`（非法）。
		 */
		function parsePriceText(text) {
			if (text === undefined || text === null) return null;
			const trimmed = String(text).trim();
			if (trimmed === "") return null;
			const number = Number(trimmed);
			return Number.isFinite(number) && number >= 0 ? number : Number.NaN;
		}

		/** 草稿 → 保存到设置里的 JSON 载荷。 */
		function buildSavePayload(draft) {
			const models = draft.models.map((row) => {
				const input = parsePriceText(row.input);
				const output = parsePriceText(row.output);
				const cacheRead = parsePriceText(row.cacheRead);
				const cacheWrite = parsePriceText(row.cacheWrite);
				return {
					provider: String(row.provider ?? "").trim(),
					model: String(row.model ?? "").trim(),
					currency: readCurrency(row.currency),
					input: input === null || Number.isNaN(input) ? 0 : input,
					output: output === null || Number.isNaN(output) ? 0 : output,
					...(cacheRead === null || Number.isNaN(cacheRead) ? {} : { cacheRead }),
					...(cacheWrite === null || Number.isNaN(cacheWrite) ? {} : { cacheWrite }),
				};
			});
			const exchangeRate = Number(String(draft.exchangeRate).trim());
			return {
				enabled: draft.enabled !== false,
				currency: readCurrency(draft.currency),
				exchangeRate: Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 7.2,
				showUnpriced: draft.showUnpriced !== false,
				models,
			};
		}

		/**
		 * 校验草稿。
		 * @returns 错误码（例如 `"rate"`、`"model:2"`、`"duplicate:deepseek-flash"`），
		 *   合法时返回 null。
		 */
		function validateDraft(draft) {
			const exchangeRate = Number(String(draft.exchangeRate).trim());
			if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return "rate";
			const seen = new Set();
			for (let index = 0; index < draft.models.length; index++) {
				const row = draft.models[index];
				const model = String(row.model ?? "").trim();
				if (model === "") return `model:${index}`;
				const key = `${String(row.provider ?? "").trim().toLowerCase()}\u0000${model.toLowerCase()}`;
				if (seen.has(key)) return `duplicate:${model}`;
				seen.add(key);
				for (const field of ["input", "cacheRead", "cacheWrite", "output"]) {
					if (Number.isNaN(parsePriceText(row[field]))) return `price:${index}:${field}`;
				}
			}
			return null;
		}

		// ── 价格来源：设置表单镜像 ───────────────────────────────────────

		/**
		 * 创建一个供 Hook 读取的价格快照源。只有归一化后的值真正变化时才
		 * 通知订阅者，避免设置表单的无关刷新导致整条会话重渲。
		 */
		function createPricingStore() {
			let current = normalizePricing(DEFAULT_CONFIG);
			let currentKey = JSON.stringify(current);
			const listeners = new Set();
			return {
				getSnapshot: () => current,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				accept: (value) => {
					const next = normalizePricing(value);
					const nextKey = JSON.stringify(next);
					if (nextKey === currentKey) return;
					current = next;
					currentKey = nextKey;
					for (const listener of [...listeners]) listener();
				},
			};
		}

		// ── 词典 ─────────────────────────────────────────────────────────

		const LOCALES = {
			zh: {
				description: "按模型单价和 token 用量计算每条上下文的费用；缓存命中和缓存写入可以分别定价。",
				enabled: "启用计费显示",
				currency: "显示货币",
				currencyCny: "人民币（CNY）",
				currencyUsd: "美元（USD）",
				exchangeRate: "汇率（1 USD = ? CNY）",
				exchangeRateHint: "不同币种的单价会按这个汇率换算到显示货币。",
				showUnpriced: "未匹配到单价时显示提示",
				showUnpricedHint: "开启后，没有配置价格的模型会显示「未配置价格」，方便发现遗漏。",
				models: "模型费用表",
				modelsHint: "价格单位是每 100 万 token。缓存价格留空表示按输入价计费；填 0 表示免费。",
				priceUnit: "每 100 万 token",
				model: "模型",
				modelPlaceholder: "例如 deepseek-flash",
				provider: "提供方（可选）",
				providerPlaceholder: "例如 deepseek-official；留空按模型名匹配",
				billingCurrency: "计费币种",
				inputPrice: "未缓存输入",
				cacheReadPrice: "缓存命中",
				cacheWritePrice: "缓存写入",
				outputPrice: "输出",
				sameAsInput: "同输入",
				newModel: "新模型",
				addModel: "添加模型",
				removeModel: "删除这个模型",
				resetDefaults: "恢复默认价格",
				save: "保存",
				saving: "保存中…",
				discard: "放弃",
				unsaved: "未保存",
				readOnly: "当前设置只读",
				loading: "正在读取设置…",
				unavailable: "当前版本未提供该插件的设置",
				saveFailed: "保存失败，请重试",
				invalidRate: "请输入大于 0 的汇率",
				invalidPrice: "第 {index} 行的「{field}」不是有效价格",
				modelRequired: "第 {index} 行还没有填写模型名",
				duplicateModel: "模型「{model}」重复配置了",
				noModels: "还没有模型价格；点「添加模型」开始配置。",
				costLabel: "费用",
				costTitle: "本条上下文费用",
				sessionCostLabel: "会话费用",
				sessionCostTitle: "当前会话费用合计",
				sessionCostTurns: "已计价 {priced} / {total} 轮",
				sessionCostMissing: "另有 {tokens} token 来自尚未加载的历史回合，按最后已知单价估算",
				sessionCostUnpriced: "{count} 轮没有匹配到单价",
				cacheHit: "缓存",
				uncachedInput: "未缓存输入",
				cacheRead: "缓存读取",
				cacheWrite: "缓存写入",
				output: "输出",
				tokens: "token",
				estimated: "估算",
				estimatedHint: "这个回合跨了多个模型，用量只能按各模型单价的平均值估算。",
				unpriced: "未配置价格",
				unpricedHint: "这个模型的单价还没有配置；打开 Plugins → Token 计费 添加。",
				partialUnpriced: "部分未配置",
				price: "单价",
				perMillion: "每 100 万 token",
				formula: "费用 = Σ(token 数 × 对应单价) ÷ 100 万，再按汇率换算到显示货币。",
				conversionHint: "单价币种与显示币种不同时按汇率换算。",
				reasoning: "其中推理",
				close: "关闭",
			},
			en: {
				description: "Price each context from per-model rates and token usage, with separate cache-read and cache-write pricing.",
				enabled: "Show billing",
				currency: "Display currency",
				currencyCny: "Chinese yuan (CNY)",
				currencyUsd: "US dollar (USD)",
				exchangeRate: "Exchange rate (1 USD = ? CNY)",
				exchangeRateHint: "Rates in another currency are converted to the display currency at this rate.",
				showUnpriced: "Show a notice when no rate matches",
				showUnpricedHint: "When on, models without a configured rate show \"No rate\" so the gap is visible.",
				models: "Model rates",
				modelsHint: "Prices are per 1,000,000 tokens. Leave a cache price empty to use the input rate; enter 0 for free.",
				priceUnit: "per 1,000,000 tokens",
				model: "Model",
				modelPlaceholder: "e.g. deepseek-flash",
				provider: "Provider (optional)",
				providerPlaceholder: "e.g. deepseek-official; blank matches by model name",
				billingCurrency: "Billing currency",
				inputPrice: "Uncached input",
				cacheReadPrice: "Cache read",
				cacheWritePrice: "Cache write",
				outputPrice: "Output",
				sameAsInput: "same as input",
				newModel: "New model",
				addModel: "Add model",
				removeModel: "Remove this model",
				resetDefaults: "Restore defaults",
				save: "Save",
				saving: "Saving…",
				discard: "Discard",
				unsaved: "Unsaved",
				readOnly: "Settings are read-only",
				loading: "Reading settings…",
				unavailable: "This version does not serve settings for this plugin",
				saveFailed: "Save failed; please try again",
				invalidRate: "Enter an exchange rate greater than 0",
				invalidPrice: "Row {index}: \"{field}\" is not a valid price",
				modelRequired: "Row {index} has no model name",
				duplicateModel: "Model \"{model}\" is configured more than once",
				noModels: "No model rates yet. Choose \"Add model\" to start.",
				costLabel: "Cost",
				costTitle: "Cost of this context",
				sessionCostLabel: "Session cost",
				sessionCostTitle: "Total cost of this session",
				sessionCostTurns: "{priced} of {total} turns priced",
				sessionCostMissing: "{tokens} tokens come from history that is not loaded yet; estimated at the last known rate",
				sessionCostUnpriced: "{count} turns have no matching rate",
				cacheHit: "Cache",
				uncachedInput: "Uncached input",
				cacheRead: "Cache read",
				cacheWrite: "Cache write",
				output: "Output",
				tokens: "tok",
				estimated: "estimated",
				estimatedHint: "This turn spans several models, so its usage can only be estimated from the average of their rates.",
				unpriced: "No rate",
				unpricedHint: "No rate is configured for this model. Open Plugins → Token billing to add one.",
				partialUnpriced: "partly unpriced",
				price: "Rate",
				perMillion: "per 1M tokens",
				formula: "Cost = Σ(tokens × rate) ÷ 1,000,000, converted to the display currency.",
				conversionHint: "Rates in another currency are converted at the exchange rate.",
				reasoning: "including reasoning",
				close: "Close",
			},
		};

		// ── 内联样式 ─────────────────────────────────────────────────────

		const actionPillRootStyle = {
			order: 1,
			display: "inline-flex",
			alignItems: "center",
			minWidth: 0,
			fontSize: "calc(var(--dsh-content-font-size-secondary, 13px) - 1px)",
		};
		const actionPillStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: "4px",
			boxSizing: "border-box",
			height: "calc(28px + var(--dsh-content-font-delta, 0px))",
			padding: "0 8px",
			border: "none",
			borderRadius: "var(--dsw-radius-sm, 6px)",
			background: "transparent",
			color: "var(--dsw-alias-label-tertiary, rgba(127,127,127,0.95))",
			font: "inherit",
			fontVariantNumeric: "tabular-nums",
			lineHeight: 1,
			whiteSpace: "nowrap",
		};
		const actionPillUnpricedStyle = {
			color: "var(--dsw-alias-label-warning, #c98a00)",
		};
		const dockAnchorStyle = {
			order: 1,
			display: "inline-flex",
			minWidth: 0,
			fontSize: "calc(var(--dsh-content-font-size-secondary, 13px) - 1px)",
			lineHeight: "calc(20px + var(--dsh-content-font-delta-secondary, 0px))",
		};
		const dockPillStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: "6px",
			boxSizing: "border-box",
			maxWidth: "100%",
			padding: "1px 8px",
			border: "none",
			borderRadius: "var(--dsw-radius-sm, 6px)",
			background: "transparent",
			color: "var(--dsw-alias-label-tertiary, rgba(127,127,127,0.95))",
			font: "inherit",
			fontVariantNumeric: "tabular-nums",
			lineHeight: "inherit",
			whiteSpace: "nowrap",
		};
		const dockPillUnpricedStyle = {
			color: "var(--dsw-alias-label-warning, #c98a00)",
		};
		const mutedStyle = {
			opacity: 0.7,
		};

		const pageStyle = {
			display: "flex",
			flexDirection: "column",
			gap: "14px",
			maxWidth: "760px",
		};
		const hintStyle = { fontSize: "12px", opacity: 0.72, margin: 0 };
		const errorStyle = { fontSize: "12px", color: "var(--dsw-alias-label-danger, #d64541)", margin: 0 };
		const fieldStyle = {
			display: "flex",
			flexDirection: "column",
			gap: "4px",
			fontSize: "12px",
			minWidth: 0,
		};
		const inputStyle = {
			width: "100%",
			boxSizing: "border-box",
			padding: "6px 8px",
			border: "1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,0.4))",
			borderRadius: "6px",
			background: "transparent",
			color: "inherit",
			font: "inherit",
		};
		const selectStyle = { ...inputStyle, appearance: "auto" };
		const rowCardStyle = {
			display: "flex",
			flexDirection: "column",
			gap: "8px",
			padding: "10px 12px",
			border: "1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,0.3))",
			borderRadius: "8px",
		};
		const modelGridStyle = {
			display: "grid",
			gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
			gap: "8px",
		};
		const priceGridStyle = {
			display: "grid",
			gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
			gap: "8px",
		};
		const footerStyle = {
			display: "flex",
			justifyContent: "flex-end",
			alignItems: "center",
			gap: "8px",
			marginTop: "2px",
		};
		const buttonStyle = {
			padding: "6px 12px",
			border: "1px solid var(--dsw-alias-border-secondary, rgba(128,128,128,0.4))",
			borderRadius: "6px",
			background: "transparent",
			color: "inherit",
			font: "inherit",
			cursor: "pointer",
		};
		const primaryButtonStyle = {
			...buttonStyle,
			borderColor: "var(--dsw-alias-label-primary, #333333)",
			fontWeight: 600,
		};
		const smallButtonStyle = {
			...buttonStyle,
			padding: "2px 8px",
			fontSize: "12px",
		};
		const cardHeaderStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: "8px",
		};

		/**
		 * 一轮费用结果的缓存：`turn-tail` 对象在一次回合结束后保持稳定，
		 * 所以价格表不变时不必在每个 token/步骤刷新里重算所有历史回合。
		 */
		const turnCostCache = new WeakMap();
		const pricingKeyCache = new WeakMap();
		let pricingKeySeq = 0;

		/** 为一份计价快照取一个稳定的缓存键。 */
		function pricingKeyOf(pricing) {
			let key = pricingKeyCache.get(pricing);
			if (key === undefined) {
				key = `p${++pricingKeySeq}`;
				pricingKeyCache.set(pricing, key);
			}
			return key;
		}

		/** 带缓存的 `computeTurnCost`。 */
		function cachedTurnCost(turn, data, pricing) {
			const key = pricingKeyOf(pricing);
			const cached = turnCostCache.get(data);
			if (cached !== undefined && cached.key === key) return cached.result;
			const result = computeTurnCost(turn, data, pricing);
			turnCostCache.set(data, { key, result });
			return result;
		}

		// ── 费用显示组件 ─────────────────────────────────────────────────

		/**
		 * `messageId → TurnLocation` 索引。按 ChatSnapshot 缓存，避免每条消息的
		 * 操作行都全量扫描回合表。
		 */
		const closingTurnIndex = new WeakMap();

		/**
		 * 找到以某条最终助手消息收尾的回合。
		 * @param snapshot - Chat 快照。
		 * @param messageId - 操作行收到的最终助手消息 id。
		 * @returns 对应回合，或 undefined。
		 */
		function turnForClosingMessage(snapshot, messageId) {
			if (messageId === undefined || messageId === null) return undefined;
			let index = closingTurnIndex.get(snapshot);
			if (index === undefined) {
				index = new Map();
				for (const location of snapshot.timeline.turns.values()) {
					const data = location.data.get("turn-tail");
					const id = data === undefined || data === null ? undefined : data.closing?.finalNode?.messageId;
					if (id !== undefined && id !== null) index.set(id, location);
				}
				closingTurnIndex.set(snapshot, index);
			}
			return index.get(messageId);
		}

		/**
		 * 把一抹费用结果整理成原生 title 的多行文本。
		 * @param result - `computeTurnCost` 的返回值。
		 * @param t - 本插件词典。
		 * @returns 可直接放进 `title` 的字符串。
		 */
		function costTitleText(result, t) {
			const lines = [];
			lines.push(`${t("costTitle")}: ${result.priced ? formatMoney(result.total, result.currency) : t("unpriced")}`);
			for (const item of result.items) {
				const route = routesText(item.routes);
				if (route !== "") lines.push(`${route}: ${formatMoney(item.amount, result.currency)}`);
				const line = (label, tokens, amount) => {
					const amountText = typeof amount === "number" && Number.isFinite(amount)
						? ` · ${formatMoney(amount, result.currency)}`
						: "";
					lines.push(`  ${label}: ${formatTokens(tokens)} ${t("tokens")}${amountText}`);
				};
				line(t("uncachedInput"), item.input, item.costInput);
				line(t("cacheRead"), item.cacheRead, item.costCacheRead);
				line(t("cacheWrite"), item.cacheWrite, item.costCacheWrite);
				line(t("output"), item.output, item.costOutput);
			}
			if (result.cacheHitPercent !== undefined) {
				lines.push(`${t("cacheHit")}: ${formatPercent(result.cacheHitPercent)}`);
			}
			if (result.unpricedRoutes.length > 0) {
				lines.push(`${t("unpriced")}: ${routesText(result.unpricedRoutes)}`);
			}
			if (!result.priced) lines.push(t("unpricedHint"));
			if (result.estimated) lines.push(t("estimatedHint"));
			lines.push(t("formula"));
			return lines.join("\n");
		}

		/**
		 * 每轮对话底部操作行里的费用读数，排在“用量”之后。
		 *
		 * 注册进 `conversation.chat.assistant-actions` 后，它是操作行的一个直接
		 * 子项；`order: 1` 让它在 flex 行里排在默认顺序的“用量/时间”之后。
		 * 明细放在原生 `title` 里，避免撑高 28px 的操作行。
		 */
		function TurnCostPill(props) {
			const { messageId, t, useChat, usePricing } = props;
			const pricing = usePricing((value) => value);
			const turn = useChat((snapshot) => turnForClosingMessage(snapshot, messageId));
			if (pricing === undefined || pricing === null || pricing.enabled === false) return null;
			if (turn === undefined) return null;
			const data = turn.data.get("turn-tail");
			if (data === undefined || data === null) return null;
			const result = cachedTurnCost(turn, data, pricing);
			if (result === null) return null;
			if (!result.priced && result.unpricedRoutes.length === 0) return null;
			if (!result.priced && pricing.showUnpriced !== true) return null;

			const amountText = result.priced ? formatMoney(result.total, result.currency) : t("unpriced");
			const cacheText = result.cacheHitPercent === undefined
				? null
				: `${t("cacheHit")} ${formatPercent(result.cacheHitPercent)}`;
			const partial = result.priced && result.unpricedRoutes.length > 0;
			const label = result.priced
				? `${result.estimated ? "≈ " : ""}${t("costLabel")} ${amountText}${cacheText === null ? "" : ` · ${cacheText}`}${partial ? ` · ${t("partialUnpriced")}` : ""}`
				: t("unpriced");
			const title = costTitleText(result, t);
			return React.createElement(
				"span",
				{ style: actionPillRootStyle, "data-token-billing-turn": turn.turn },
				React.createElement(
					"span",
					{
						style: result.priced ? actionPillStyle : { ...actionPillStyle, ...actionPillUnpricedStyle },
						title,
						"aria-label": label,
					},
					label,
				),
			);
		}

		/**
		 * 汇总当前会话所有已加载回合的费用；当整段会话日志比已加载窗口更长时，
		 * 用 durable `tokenUsage` 投影补齐缺失的 token，并按最后一条已知路由的
		 * 单价估算，标记为估算值。
		 *
		 * @param turns - Chat 快照里的回合表。
		 * @param pricing - 计价快照。
		 * @param projectedUsage - 整个会话的 token 用量投影（可选）。
		 * @returns 会话费用汇总。
		 */
		function computeSessionCost(turns, pricing, projectedUsage) {
			const byRoute = new Map();
			const loaded = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
			let total = 0;
			let pricedTurns = 0;
			let unpricedTurns = 0;
			let estimated = false;
			let hasUsage = false;
			let turnsWithUsage = 0;
			let lastRoute;
			if (turns !== undefined && turns !== null && typeof turns.values === "function") {
				for (const location of turns.values()) {
					const data = location.data.get("turn-tail");
					if (data === undefined || data === null || data.tokenUsage === undefined) continue;
					hasUsage = true;
					turnsWithUsage += 1;
					const tokens = tokenCounts(data.tokenUsage);
					loaded.input += tokens.input;
					loaded.cacheRead += tokens.cacheRead;
					loaded.cacheWrite += tokens.cacheWrite;
					loaded.output += tokens.output;
					const result = cachedTurnCost(location, data, pricing);
					if (result === null) continue;
					if (result.priced) {
						total += result.total;
						pricedTurns += 1;
						for (const item of result.items) {
							const key = routesText(item.routes) || "?";
							const row = byRoute.get(key) ?? { amount: 0, tokens: 0 };
							row.amount += item.amount;
							row.tokens += item.total;
							byRoute.set(key, row);
						}
					}
					if (result.unpricedRoutes.length > 0) unpricedTurns += 1;
					if (result.estimated) estimated = true;
					const routes = Array.isArray(data.tokenUsage.routes) ? data.tokenUsage.routes : [];
					if (routes.length > 0) lastRoute = routes[routes.length - 1];
					else if (data.closing?.finalNode?.providerMetadata !== undefined) {
						lastRoute = data.closing.finalNode.providerMetadata;
					}
				}
			}

			let missingTokens = 0;
			if (projectedUsage !== undefined && projectedUsage !== null) {
				const projected = tokenCounts({
					uncachedInputTokens: projectedUsage.uncachedInputTokens,
					cacheReadTokens: projectedUsage.cacheReadTokens,
					cacheWriteTokens: projectedUsage.cacheWriteTokens,
					outputTokens: projectedUsage.outputTokens,
				});
				const missingInput = Math.max(0, projected.input - loaded.input);
				const missingRead = Math.max(0, projected.cacheRead - loaded.cacheRead);
				const missingWrite = Math.max(0, projected.cacheWrite - loaded.cacheWrite);
				const missingOutput = Math.max(0, projected.output - loaded.output);
				missingTokens = missingInput + missingRead + missingWrite + missingOutput;
				if (missingTokens > 0) {
					estimated = true;
					const rate = lastRoute === undefined ? undefined : findRate(pricing, lastRoute);
					if (rate === undefined) {
						unpricedTurns += 1;
					} else {
						const cost = partCost({
							uncachedInputTokens: missingInput,
							cacheReadTokens: missingRead,
							cacheWriteTokens: missingWrite,
							outputTokens: missingOutput,
							totalTokens: missingTokens,
						}, rate, pricing);
						total += cost.amount;
						const key = routesText([lastRoute]);
						const row = byRoute.get(key) ?? { amount: 0, tokens: 0 };
						row.amount += cost.amount;
						row.tokens += missingTokens;
						byRoute.set(key, row);
					}
				}
			}

			return { total, pricedTurns, unpricedTurns, estimated, hasUsage, turnsWithUsage, missingTokens, byRoute };
		}

		/** 会话费用读数的明细 title。 */
		function sessionCostTitleText(summary, pricing, t) {
			const amount = summary.pricedTurns > 0 ? formatMoney(summary.total, pricing.currency) : t("unpriced");
			const lines = [`${t("sessionCostTitle")}: ${summary.estimated ? "≈ " : ""}${amount}`];
			lines.push(t("sessionCostTurns", { priced: summary.pricedTurns, total: summary.turnsWithUsage }));
			for (const [route, row] of summary.byRoute) {
				lines.push(`${route}: ${formatMoney(row.amount, pricing.currency)}`);
			}
			if (summary.missingTokens > 0) {
				lines.push(t("sessionCostMissing", { tokens: formatTokens(summary.missingTokens) }));
			}
			if (summary.unpricedTurns > 0) {
				lines.push(t("sessionCostUnpriced", { count: summary.unpricedTurns }));
			}
			lines.push(t("formula"));
			return lines.join("\n");
		}

		/**
		 * 输入框底部统计栏里的会话费用合计。
		 *
		 * `order: 1` 让它在 flex 统计行里排到默认顺序的“轮次/用量/上下文”
		 * 之后，正好落在设计标注的尾部位置。
		 */
		function SessionCostPill(props) {
			const { t, useChat, usePricing, useProjection } = props;
			const pricing = usePricing((value) => value);
			const turns = useChat((snapshot) => snapshot.timeline.turns);
			const projected = useProjection("tokenUsage");
			const summary = useMemo(
				() => computeSessionCost(turns, pricing, projected),
				[turns, pricing, projected],
			);
			if (pricing === undefined || pricing === null || pricing.enabled === false) return null;
			if (!summary.hasUsage) return null;
			const priced = summary.pricedTurns > 0;
			const amount = formatMoney(summary.total, pricing.currency);
			const label = `${summary.estimated ? "≈ " : ""}${t("sessionCostLabel")} ${priced ? amount : t("unpriced")}`;
			return React.createElement(
				"span",
				{ style: dockAnchorStyle, "data-composer-stat": "cost" },
				React.createElement(
					"span",
					{
						style: priced ? dockPillStyle : { ...dockPillStyle, ...dockPillUnpricedStyle },
						title: sessionCostTitleText(summary, pricing, t),
						"aria-label": label,
					},
					label,
				),
			);
		}

		// ── 设置卡片 ─────────────────────────────────────────────────────

		/** 带标签的表单控件。 */
		function labeled(label, control, key) {
			return React.createElement(
				"label",
				{ style: fieldStyle, key },
				React.createElement("span", { style: mutedStyle }, label),
				control,
			);
		}

		/** 校验失败时把错误码翻成当前语言。 */
		function errorText(code, t) {
			if (code === null) return null;
			if (code === "rate") return t("invalidRate");
			if (code.startsWith("model:")) {
				return t("modelRequired", { index: Number(code.slice(6)) + 1 });
			}
			if (code.startsWith("duplicate:")) {
				return t("duplicateModel", { model: code.slice(10) });
			}
			if (code.startsWith("price:")) {
				const parts = code.split(":");
				const index = Number(parts[1]) + 1;
				const field = parts[2];
				const labelKey = field === "input"
					? "inputPrice"
					: field === "cacheRead"
						? "cacheReadPrice"
						: field === "cacheWrite"
							? "cacheWritePrice"
							: "outputPrice";
				return t("invalidPrice", { index, field: t(labelKey) });
			}
			return code;
		}

		/** Plugins 页上的费用表配置卡片。 */
		function SettingsCard(props) {
			const { form, t } = props;
			// React 会把订阅函数与取值函数当作独立函数调用，而宿主表单是类实例，
			// 方法需要原来的 this。
			const subscribe = useCallback((listener) => form.subscribe(listener), [form]);
			const getSnapshot = useCallback(() => form.getSnapshot(), [form]);
			const snapshot = useSyncExternalStore(subscribe, getSnapshot);
			const [draft, setDraft] = useState(null);
			const [saving, setSaving] = useState(false);
			const [failed, setFailed] = useState(false);

			useEffect(() => {
				if (draft === null && snapshot.status === "ready" && snapshot.value !== undefined) {
					setDraft(toDraft(snapshot.value));
				}
			}, [draft, snapshot]);

			if (snapshot.status === "loading") {
				return React.createElement("p", { style: hintStyle }, t("loading"));
			}
			if (snapshot.status === "ready" && draft === null && snapshot.value !== undefined) {
				return React.createElement("p", { style: hintStyle }, t("loading"));
			}
			if (snapshot.status !== "ready" || draft === null) {
				return React.createElement("p", { style: hintStyle }, t("unavailable"));
			}

			const writable = snapshot.writable !== false;
			const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(snapshot.value));
			const code = validateDraft(draft);
			const blocked = !dirty || code !== null || saving || !writable;

			const setField = (field, value) => {
				setDraft({ ...draft, [field]: value });
				setFailed(false);
			};
			const setModelField = (index, field, value) => {
				const models = draft.models.map((row, rowIndex) =>
					rowIndex === index ? { ...row, [field]: value } : row);
				setDraft({ ...draft, models });
				setFailed(false);
			};
			const addModel = () => {
				setDraft({
					...draft,
					models: [
						...draft.models,
						{
							provider: "",
							model: "",
							currency: draft.currency,
							input: "0",
							cacheRead: "",
							cacheWrite: "",
							output: "0",
						},
					],
				});
				setFailed(false);
			};
			const removeModel = (index) => {
				setDraft({ ...draft, models: draft.models.filter((_row, rowIndex) => rowIndex !== index) });
				setFailed(false);
			};
			const discard = () => {
				setDraft(toDraft(snapshot.value));
				setFailed(false);
			};
			const save = async () => {
				if (blocked) return;
				setSaving(true);
				setFailed(false);
				const payload = buildSavePayload(draft);
				const ops = [
					{ op: "set", path: ["enabled"], value: payload.enabled },
					{ op: "set", path: ["currency"], value: payload.currency },
					{ op: "set", path: ["exchangeRate"], value: payload.exchangeRate },
					{ op: "set", path: ["showUnpriced"], value: payload.showUnpriced },
					{ op: "set", path: ["models"], value: payload.models },
				];
				let landed = false;
				try {
					if (typeof form.mutate === "function") {
						landed = await form.mutate(ops);
					} else {
						landed = true;
						for (const op of ops) {
							landed = await form.set(op.path[0], op.value);
							if (!landed) break;
						}
					}
				} catch (error) {
					landed = false;
				}
				setSaving(false);
				setFailed(!landed);
				if (landed) setDraft(null);
			};

			const modelRows = draft.models.map((row, index) =>
				React.createElement(
					"div",
					{ style: rowCardStyle, key: `model-${index}` },
					React.createElement(
						"div",
						{ style: cardHeaderStyle },
						React.createElement("strong", null, row.model.trim() === "" ? t("newModel") : row.model),
						React.createElement(
							"button",
							{
								type: "button",
								style: smallButtonStyle,
								disabled: !writable,
								title: t("removeModel"),
								onClick: () => removeModel(index),
							},
							"×",
						),
					),
					React.createElement(
						"div",
						{ style: modelGridStyle },
						labeled(
							t("model"),
							React.createElement("input", {
								type: "text",
								style: inputStyle,
								value: row.model,
								placeholder: t("modelPlaceholder"),
								disabled: !writable,
								onChange: (event) => setModelField(index, "model", event.target.value),
							}),
							"model",
						),
						labeled(
							t("provider"),
							React.createElement("input", {
								type: "text",
								style: inputStyle,
								value: row.provider,
								placeholder: t("providerPlaceholder"),
								disabled: !writable,
								onChange: (event) => setModelField(index, "provider", event.target.value),
							}),
							"provider",
						),
					),
					React.createElement(
						"div",
						{ style: priceGridStyle },
						labeled(
							t("inputPrice"),
							React.createElement("input", {
								type: "text",
								inputMode: "decimal",
								style: inputStyle,
								value: row.input,
								disabled: !writable,
								onChange: (event) => setModelField(index, "input", event.target.value),
							}),
							"input",
						),
						labeled(
							t("cacheReadPrice"),
							React.createElement("input", {
								type: "text",
								inputMode: "decimal",
								style: inputStyle,
								value: row.cacheRead,
								placeholder: t("sameAsInput"),
								disabled: !writable,
								onChange: (event) => setModelField(index, "cacheRead", event.target.value),
							}),
							"cacheRead",
						),
						labeled(
							t("cacheWritePrice"),
							React.createElement("input", {
								type: "text",
								inputMode: "decimal",
								style: inputStyle,
								value: row.cacheWrite,
								placeholder: t("sameAsInput"),
								disabled: !writable,
								onChange: (event) => setModelField(index, "cacheWrite", event.target.value),
							}),
							"cacheWrite",
						),
						labeled(
							t("outputPrice"),
							React.createElement("input", {
								type: "text",
								inputMode: "decimal",
								style: inputStyle,
								value: row.output,
								disabled: !writable,
								onChange: (event) => setModelField(index, "output", event.target.value),
							}),
							"output",
						),
					),
					labeled(
						t("billingCurrency"),
						React.createElement(
							"select",
							{
								style: selectStyle,
								value: row.currency,
								disabled: !writable,
								onChange: (event) => setModelField(index, "currency", event.target.value),
							},
							React.createElement("option", { value: "CNY" }, t("currencyCny")),
							React.createElement("option", { value: "USD" }, t("currencyUsd")),
						),
						"currency",
					),
				),
			);

			return React.createElement(
				"div",
				{ style: pageStyle },
				React.createElement("p", { style: hintStyle }, t("description")),
				!writable ? React.createElement("p", { style: hintStyle }, t("readOnly")) : null,
				React.createElement(
					"label",
					{
						style: {
							...fieldStyle,
							flexDirection: "row",
							alignItems: "center",
							gap: "6px",
						},
					},
					React.createElement("input", {
						type: "checkbox",
						checked: draft.enabled,
						disabled: !writable,
						onChange: (event) => setField("enabled", event.target.checked),
					}),
					t("enabled"),
				),
				React.createElement(
					"div",
					{ style: modelGridStyle },
					labeled(
						t("currency"),
						React.createElement(
							"select",
							{
								style: selectStyle,
								value: draft.currency,
								disabled: !writable,
								onChange: (event) => setField("currency", event.target.value),
							},
							React.createElement("option", { value: "CNY" }, t("currencyCny")),
							React.createElement("option", { value: "USD" }, t("currencyUsd")),
						),
						"display-currency",
					),
					labeled(
						t("exchangeRate"),
						React.createElement("input", {
							type: "text",
							inputMode: "decimal",
							style: inputStyle,
							value: draft.exchangeRate,
							disabled: !writable,
							onChange: (event) => setField("exchangeRate", event.target.value),
						}),
						"exchange-rate",
					),
				),
				React.createElement("p", { style: hintStyle }, t("exchangeRateHint")),
				React.createElement(
					"label",
					{
						style: {
							...fieldStyle,
							flexDirection: "row",
							alignItems: "center",
							gap: "6px",
						},
					},
					React.createElement("input", {
						type: "checkbox",
						checked: draft.showUnpriced,
						disabled: !writable,
						onChange: (event) => setField("showUnpriced", event.target.checked),
					}),
					t("showUnpriced"),
				),
				React.createElement("p", { style: hintStyle }, t("showUnpricedHint")),
				React.createElement(
					"div",
					{ style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" } },
					React.createElement("strong", null, t("models")),
					React.createElement("span", { style: hintStyle }, t("priceUnit")),
				),
				React.createElement("p", { style: hintStyle }, t("modelsHint")),
				draft.models.length === 0
					? React.createElement("p", { style: hintStyle }, t("noModels"))
					: modelRows,
				React.createElement(
					"div",
					{ style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
					React.createElement(
						"button",
						{ type: "button", style: smallButtonStyle, disabled: !writable, onClick: addModel },
						t("addModel"),
					),
					React.createElement(
						"button",
						{
							type: "button",
							style: smallButtonStyle,
							disabled: !writable,
							onClick: () => {
								setDraft(toDraft({ ...DEFAULT_CONFIG, currency: draft.currency, exchangeRate: Number(draft.exchangeRate) || DEFAULT_CONFIG.exchangeRate }));
								setFailed(false);
							},
						},
						t("resetDefaults"),
					),
				),
				code === null ? null : React.createElement("p", { style: errorStyle }, errorText(code, t)),
				failed ? React.createElement("p", { style: errorStyle }, t("saveFailed")) : null,
				React.createElement(
					"div",
					{ style: footerStyle },
					dirty
						? React.createElement("span", { style: { ...hintStyle, marginRight: "auto" } }, t("unsaved"))
						: null,
					React.createElement(
						"button",
						{ type: "button", style: buttonStyle, disabled: !dirty || saving, onClick: discard },
						t("discard"),
					),
					React.createElement(
						"button",
						{
							type: "button",
							style: primaryButtonStyle,
							disabled: blocked,
							onClick: () => {
								void save();
							},
						},
						saving ? t("saving") : t("save"),
					),
				),
			);
		}

		// ── 插件主体 ─────────────────────────────────────────────────────

		/**
		 * 挂载计费显示与配置页。
		 *
		 * 每个可选服务都通过各自的子注入获取：没有 `configForms` 时仍用内置
		 * 默认价格计费，只是没有配置卡片；没有 `slots`/`locale` 时不显示任何
		 * UI，也不会阻塞 Web 启动。
		 *
		 * @param ctx - 浏览器插件上下文。
		 */
		function apply(ctx) {
			const pricing = createPricingStore();

			// 价格同步：设置表单是唯一来源；表单回答之后替换内置默认值。
			ctx.inject(["configForms"], (child) => {
				const form = child.configForms.get(ENTRY_ID);
				const sync = () => {
					const snapshot = form.getSnapshot();
					if (snapshot.status === "ready" && snapshot.value !== undefined && snapshot.value !== null) {
						pricing.accept(snapshot.value);
					}
				};
				child.effect(() => form.subscribe(sync), "token-billing: 价格同步");
				sync();
			});

			// UI：每轮操作行费用 + 输入框底部会话合计 + Plugins 页配置卡片。
			ctx.inject(["slots", "locale"], (child) => {
				child.effect(() => child.locale.register(NS, LOCALES), "token-billing: 词典");

				// 每轮对话底部：与“用量”同处操作行，排在它后面。
				child.slots.inject("conversation.chat.assistant-actions", () => child.slots.register(
					{
						name: "conversation.chat.assistant-actions",
						id: "token-billing-turn",
						order: 20,
						locale: NS,
						inject: () => ({ hooks: { pricing } }),
					},
					TurnCostPill,
				));

				// 输入框底部统计栏：当前会话所有轮的合计。
				child.slots.inject("conversation.composer.dock", () => child.slots.register(
					{
						name: "conversation.composer.dock",
						id: "token-billing-session",
						order: 2,
						locale: NS,
						inject: () => ({ hooks: { pricing } }),
					},
					SessionCostPill,
				));

				child.inject(["configForms"], (formChild) => {
					const form = formChild.configForms.get(ENTRY_ID);
					child.slots.inject("plugins.bundle.config", () => child.slots.register(
						{
							name: "plugins.bundle.config",
							key: BUNDLE_NAME,
							locale: NS,
							inject: () => ({ form }),
						},
						SettingsCard,
					));
				});
			});
		}

		exports.apply = apply;
		// 供 jsdom 冒烟测试读取纯函数；运行时没有任何消费者。
		exports.__test = {
			DEFAULT_CONFIG,
			DEFAULT_MODELS,
			normalizePricing,
			computeTurnCost,
			computeSessionCost,
			turnForClosingMessage,
			findRate,
			tokenCounts,
			formatMoney,
			formatTokens,
			formatPercent,
			routesText,
			toDraft,
			buildSavePayload,
			validateDraft,
			parsePriceText,
		};
		return module.exports;
	},
});
