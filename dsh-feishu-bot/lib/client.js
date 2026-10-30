/**
 * dsh-feishu-bot —— 浏览器半侧。
 *
 * 在 Plugins 页本 bundle 的详情里渲染配置卡片：
 *   - 应用凭据（App ID 写配置行；App Secret 写凭据服务）；
 *   - 绑定流程（生成一次性码 → 在飞书私聊发给机器人）；
 *   - 总开关与三类通知；
 *   - 诊断（测试消息、重启连接、最近错误）。
 *
 * 本文件是手写的浏览器模块：`window.__ModuleLoader__.load` 只登记工厂，模块体
 * 在首次 require 时才执行。所有副作用（含样式）都在工厂闭包里。
 */
window.__ModuleLoader__.load({
	id: "dsh-feishu-bot",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const { useCallback, useEffect, useState, useSyncExternalStore } = React;
		const h = React.createElement;

		/** 配置行的行 id（与 cordis.patch.yml 里的 id 一致）。 */
		const ENTRY_ID = "feishu-bot";

		/** 本 bundle 在 Plugins 页注册配置页时使用的键（包名）。 */
		const BUNDLE_NAME = "dsh-feishu-bot";

		/** 本插件拥有的词典命名空间。 */
		const NS = "feishuBot";

		/** 本插件的同源接口前缀。 */
		const MOUNT = (() => {
			try {
				return new URL("dsh-feishu-bot", document.baseURI).href.replace(/\/$/, "");
			} catch {
				return "/dsh-feishu-bot";
			}
		})();

		/** 状态轮询间隔。 */
		const POLL_MS = 3000;

		const LOCALES = {
			zh: {
				description: "用飞书机器人接收任务结果、回答提问、确认权限",
				panel: "飞书通知",
				pageTitle: "飞书机器人通知",
				pageIntro: "任务完成、Agent 提问、权限确认都会推送到你的飞书私聊；引用卡片回复即可继续对应会话。",
				statusLabel: "飞书",
				statusOn: "已连接",
				statusOff: "已关闭",
				statusConnecting: "连接中",
				statusFailed: "连接失败",
				statusNotReady: "未连接",
				statusBusy: "处理中",
				statusHintOn: "点击关闭飞书通知",
				statusHintOff: "点击开启飞书通知",
				statusHintConfigure: "还没配置好：点击打开飞书设置页",
				statusDetail: "连接",
				status: "状态",
				bridge: "连接",
				bindingLabel: "绑定",
				ackLabel: "回执",
				bridgeStates: {
					stopped: "未连接",
					connecting: "连接中",
					connected: "已连接",
					error: "连接失败",
				},
				bound: "已绑定",
				unbound: "未绑定",
				confirmed: "已确认",
				unconfirmed: "待确认",
				stateError: "读取状态失败",
				lastError: "最近错误",
				credentials: "应用凭据",
				appId: "App ID",
				appIdPlaceholder: "cli_xxxxxxxxxxxxxxxx",
				appSecret: "App Secret",
				appSecretPlaceholder: "保存后不会再显示",
				saveAppId: "保存 App ID",
				saveSecret: "保存密钥",
				clearSecret: "清除密钥",
				secretConfigured: "密钥已配置",
				secretMissing: "密钥未配置",
				secretSource: "来源",
				credentialsHint: "在飞书开放平台 → 应用详情 → 凭证与基础信息里获取。",
				bindTitle: "绑定飞书账号",
				beginBind: "生成绑定码",
				cancelBind: "取消绑定码",
				unbind: "解除绑定",
				bindCode: "在飞书里给机器人发送这个码：",
				bindCodeExpires: "秒后失效",
				bindUnavailable: "先填好 App ID 与 App Secret，并确保连接已建立。",
				bindingHint: "机器人能力需在飞书后台开启，订阅方式选“长连接”。",
				notifications: "通知",
				enabled: "启用飞书通知",
				reasonAppId: "先填写 App ID",
				reasonSecret: "先保存 App Secret",
				reasonBind: "先完成飞书绑定",
				reasonBridge: "长连接尚未就绪",
				enableHint: "开启后会立刻发一张“已开启”卡片到飞书。",
				notifyComplete: "任务完成时通知",
				notifyQuestion: "提问时通知并允许在飞书选择",
				notifyApproval: "权限确认时通知并允许在飞书审批",
				advanced: "高级",
				completeDebounceMs: "完成防抖（毫秒）",
				maxResultChars: "结果摘录上限（字符）",
				maxCardButtons: "按钮数上限",
				saveNumber: "保存",
				diagnostics: "诊断",
				sendTest: "发送测试消息",
				restartBridge: "重启飞书连接",
				clearError: "清除错误",
				diagnosticsHint: "需要权限 im:message、im:message:send_as_bot、im:message:update、im:message.p2p_msg:readonly。",
				unsaved: "未保存",
				readOnly: "当前设置只读",
				unavailable: "当前版本未提供该插件的设置",
				loading: "正在读取设置…",
				saved: "已保存",
				invalidNumber: "请输入合法数字",
				actionDone: "操作完成",
			},
			en: {
				description: "Feishu bot for task results, questions, and approvals",
				panel: "Feishu bot",
				pageTitle: "Feishu bot notifications",
				pageIntro: "Task results, agent questions, and permission requests are pushed to your Feishu DM; reply to a card to continue that session.",
				statusLabel: "Feishu",
				statusOn: "Connected",
				statusOff: "Off",
				statusConnecting: "Connecting",
				statusFailed: "Failed",
				statusNotReady: "Disconnected",
				statusBusy: "Working",
				statusHintOn: "Click to turn Feishu notifications off",
				statusHintOff: "Click to turn Feishu notifications on",
				statusHintConfigure: "Not configured yet — click to open the Feishu settings page",
				statusDetail: "Connection",
				status: "Status",
				bridge: "Connection",
				bindingLabel: "Binding",
				ackLabel: "Ack",
				bridgeStates: {
					stopped: "stopped",
					connecting: "connecting",
					connected: "connected",
					error: "error",
				},
				bound: "bound",
				unbound: "not bound",
				confirmed: "confirmed",
				unconfirmed: "unconfirmed",
				stateError: "Failed to read state",
				lastError: "Last error",
				credentials: "App credentials",
				appId: "App ID",
				appIdPlaceholder: "cli_xxxxxxxxxxxxxxxx",
				appSecret: "App Secret",
				appSecretPlaceholder: "Not shown again once saved",
				saveAppId: "Save App ID",
				saveSecret: "Save secret",
				clearSecret: "Clear secret",
				secretConfigured: "Secret configured",
				secretMissing: "Secret missing",
				secretSource: "source",
				credentialsHint: "Copy them from the Feishu developer console → Credentials & basic info.",
				bindTitle: "Bind your Feishu account",
				beginBind: "Create bind code",
				cancelBind: "Cancel code",
				unbind: "Unbind",
				bindCode: "Send this code to the bot in Feishu:",
				bindCodeExpires: "seconds left",
				bindUnavailable: "Fill in App ID and App Secret first, and make sure the connection is up.",
				bindingHint: "Enable the bot capability in Feishu and use long-connection subscriptions.",
				notifications: "Notifications",
				enabled: "Enable Feishu notifications",
				reasonAppId: "App ID is missing",
				reasonSecret: "App Secret is missing",
				reasonBind: "Feishu account is not bound",
				reasonBridge: "Long connection is not ready",
				enableHint: "Turning this on sends an “enabled” card to Feishu right away.",
				notifyComplete: "Notify when a task finishes",
				notifyQuestion: "Notify and allow answering questions",
				notifyApproval: "Notify and allow approving permissions",
				advanced: "Advanced",
				completeDebounceMs: "Completion debounce (ms)",
				maxResultChars: "Result excerpt limit (chars)",
				maxCardButtons: "Max buttons",
				saveNumber: "Save",
				diagnostics: "Diagnostics",
				sendTest: "Send test message",
				restartBridge: "Restart connection",
				clearError: "Clear error",
				diagnosticsHint: "Needs scopes im:message, im:message:send_as_bot, im:message:update, im:message.p2p_msg:readonly.",
				unsaved: "Unsaved",
				readOnly: "Settings are read-only",
				unavailable: "This version does not serve settings for this plugin",
				loading: "Reading settings…",
				saved: "Saved",
				invalidNumber: "Enter a valid number",
				actionDone: "Done",
			},
		};

		// ── 样式（内联，不引入 CSS 构建） ───────────────────────────────────

		const styles = {
			screen: {
				height: "100%",
				minHeight: 0,
				overflow: "auto",
				boxSizing: "border-box",
				padding: "26px 30px 64px",
				background: "var(--dsw-alias-bg-layer-1, transparent)",
				color: "var(--dsw-alias-label-primary, inherit)",
			},
			screenInner: { display: "flex", flexDirection: "column", gap: "12px", maxWidth: "720px" },
			screenTitle: { margin: 0, fontSize: "20px", fontWeight: 600, lineHeight: "28px" },
			screenIntro: {
				margin: 0,
				fontSize: "13px",
				lineHeight: "20px",
				color: "var(--dsw-alias-label-secondary, rgba(128,128,128,0.9))",
			},
			page: { display: "flex", flexDirection: "column", gap: "14px", maxWidth: "620px" },
			section: {
				display: "flex",
				flexDirection: "column",
				gap: "8px",
				padding: "12px",
				border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.28))",
				borderRadius: "8px",
			},
			heading: { margin: 0, fontSize: "14px", fontWeight: 600 },
			hint: { fontSize: "12px", opacity: 0.7, margin: 0 },
			error: { fontSize: "12px", color: "var(--dsw-alias-state-error-primary, #d64541)", margin: 0 },
			ok: { fontSize: "12px", color: "var(--dsw-alias-state-success-primary, #2e9e5b)", margin: 0 },
			row: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "13px" },
			field: { display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" },
			input: {
				width: "100%",
				boxSizing: "border-box",
				padding: "6px 8px",
				border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.4))",
				borderRadius: "6px",
				background: "transparent",
				color: "inherit",
			},
			button: {
				padding: "6px 12px",
				border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.4))",
				borderRadius: "6px",
				background: "transparent",
				color: "inherit",
				cursor: "pointer",
			},
			buttonSmall: {
				padding: "3px 10px",
				fontSize: "12px",
				border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.4))",
				borderRadius: "6px",
				background: "transparent",
				color: "inherit",
				cursor: "pointer",
			},
			badge: {
				display: "inline-flex",
				alignItems: "center",
				gap: "6px",
				padding: "2px 10px",
				borderRadius: "999px",
				fontSize: "12px",
				border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))",
			},
			code: {
				fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
				fontSize: "20px",
				letterSpacing: "4px",
				padding: "8px 12px",
				borderRadius: "8px",
				background: "rgba(128,128,128,0.12)",
			},
			check: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" },
			footer: { display: "flex", justifyContent: "flex-end", gap: "8px" },
		};

		// ── 接口 ───────────────────────────────────────────────────────────

		/** 调本插件的同源接口。 */
		async function request(path, init = {}) {
			const response = await fetch(`${MOUNT}${path}`, {
				credentials: "same-origin",
				...init,
				headers: {
					accept: "application/json",
					...(init.body === undefined ? {} : { "content-type": "application/json" }),
					...(init.headers ?? {}),
				},
			});
			const text = await response.text();
			let data = {};
			try {
				data = text === "" ? {} : JSON.parse(text);
			} catch {
				data = {};
			}
			if (!response.ok || data.ok === false) {
				throw new Error(typeof data.error === "string" ? data.error : `HTTP ${response.status}`);
			}
			return data;
		}

		/** 把毫秒时间戳变成“还剩 N 秒”。 */
		function secondsLeft(expiresAt, now) {
			return Math.max(0, Math.round((expiresAt - now) / 1000));
		}

		/** 状态徽标。 */
		function badge(label, tone) {
			const color = tone === "ok" ? "#2e9e5b" : tone === "warn" ? "#c98a1b" : tone === "bad" ? "#d64541" : undefined;
			return h(
				"span",
				{ style: { ...styles.badge, borderColor: color === undefined ? undefined : color, color } },
				label,
			);
		}

		/** 一个小标题 + 内容的分区。 */
		function section(title, children) {
			return h("div", { style: styles.section }, h("h4", { style: styles.heading }, title), ...children);
		}

		// ── 配置面板 ───────────────────────────────────────────────────────

		/**
		 * 插件的主体内容：状态、凭据、绑定、通知、高级、诊断。
		 *
		 * 同一份面板同时挂在两个位置——Plugins 页的 bundle 详情卡片，以及左侧
		 * 活动栏打开的插件页面——因此只写一次。
		 *
		 * @param props - 框架注入的 `form`（由 `inject` 提供）与本地化 `t`。
		 */
		function FeishuBotPanel(props) {
			const { form, t } = props;
			const showIntro = props.hideIntro !== true;
			const subscribe = useCallback((listener) => form.subscribe(listener), [form]);
			const getSnapshot = useCallback(() => form.getSnapshot(), [form]);
			const snapshot = useSyncExternalStore(subscribe, getSnapshot);

			const [state, setState] = useState(null);
			const [stateError, setStateError] = useState("");
			const [message, setMessage] = useState(null);
			const [busy, setBusy] = useState("");
			const [appIdDraft, setAppIdDraft] = useState(null);
			const [secretDraft, setSecretDraft] = useState("");
			const [numberDrafts, setNumberDrafts] = useState({});
			const [now, setNow] = useState(() => Date.now());

			const refresh = useCallback(async () => {
				try {
					const data = await request("/state");
					setState(data.state ?? null);
					setStateError("");
				} catch (error) {
					setStateError(error instanceof Error ? error.message : String(error));
				}
			}, []);

			useEffect(() => {
				void refresh();
				const poll = setInterval(() => { void refresh(); }, POLL_MS);
				return () => clearInterval(poll);
			}, [refresh]);

			useEffect(() => {
				const tick = setInterval(() => setNow(Date.now()), 1000);
				return () => clearInterval(tick);
			}, []);

			if (snapshot.status === "loading") {
				return h("p", { style: styles.hint }, t("loading"));
			}
			if (snapshot.status !== "ready") {
				return h("p", { style: styles.hint }, t("unavailable"));
			}

			const value = snapshot.value || {};
			const writable = snapshot.writable !== false;
			const enabled = value.enabled === true;
			const notifyComplete = value.notifyComplete !== false;
			const notifyQuestion = value.notifyQuestion !== false;
			const notifyApproval = value.notifyApproval !== false;

			const appIdValue = typeof value.appId === "string" ? value.appId : "";
			const appIdText = appIdDraft === null ? appIdValue : appIdDraft;
			const secretConfigured = state?.secret?.configured === true;
			const bound = state?.binding?.bound === true;
			const bridge = state?.bridge ?? "stopped";

			const blockers = [];
			if (appIdText.trim() === "") blockers.push(t("reasonAppId"));
			if (!secretConfigured) blockers.push(t("reasonSecret"));
			if (!bound) blockers.push(t("reasonBind"));
			if (bridge !== "connected") blockers.push(t("reasonBridge"));
			const canEnable = blockers.length === 0;

			const say = (kind, text) => setMessage({ kind, text });

			const act = async (action, payload = {}) => {
				setBusy(action);
				setMessage(null);
				try {
					const data = await request("/action", {
						method: "POST",
						body: JSON.stringify({ action, ...payload }),
					});
					if (data.state !== undefined) setState(data.state);
					say("ok", t("actionDone"));
					return data;
				} catch (error) {
					say("err", error instanceof Error ? error.message : String(error));
					return null;
				} finally {
					setBusy("");
				}
			};

			const setConfig = async (field, next) => {
				setMessage(null);
				try {
					const landed = await form.set(field, next);
					if (landed === false) say("err", t("actionDone"));
				} catch (error) {
					say("err", error instanceof Error ? error.message : String(error));
				}
			};

			const saveAppId = async () => {
				const text = appIdText.trim();
				setMessage(null);
				try {
					const landed = text === "" ? await form.unset("appId") : await form.set("appId", text);
					if (landed === false) say("err", t("actionDone"));
					else {
						setAppIdDraft(null);
						say("ok", t("saved"));
					}
				} catch (error) {
					say("err", error instanceof Error ? error.message : String(error));
				}
			};

			const saveNumber = async (field) => {
				const raw = numberDrafts[field];
				const number = Number(raw);
				if (!Number.isFinite(number)) {
					say("err", t("invalidNumber"));
					return;
				}
				await setConfig(field, number);
				setNumberDrafts((previous) => {
					const next = { ...previous };
					delete next[field];
					return next;
				});
				say("ok", t("saved"));
			};

			const numberField = (field, label, placeholder) => {
				const current = value[field];
				const text = numberDrafts[field] ?? (Number.isFinite(current) ? String(current) : "");
				const dirty = numberDrafts[field] !== undefined;
				return h(
					"label",
					{ style: styles.field, key: field },
					h("span", null, `${label} · ${placeholder}`),
					h("div", { style: { display: "flex", gap: "8px" } },
						h("input", {
							type: "text",
							inputMode: "numeric",
							style: styles.input,
							value: text,
							disabled: !writable,
							onChange: (event) => setNumberDrafts((previous) => ({ ...previous, [field]: event.target.value })),
						}),
						h("button", {
							type: "button",
							style: styles.buttonSmall,
							disabled: !writable || !dirty,
							onClick: () => { void saveNumber(field); },
						}, t("saveNumber")),
					),
				);
			};

			const pendingBind = state?.pendingBind ?? null;
			const bindLeft = pendingBind === null ? 0 : secondsLeft(pendingBind.expiresAt, now);

			// 状态区
			const statusChildren = [
				h("div", { style: styles.row, key: "row" },
					h("span", null, `${t("bridge")}：`),
					badge(t(`bridgeStates.${bridge}`), bridge === "connected" ? "ok" : bridge === "error" ? "bad" : "warn"),
					h("span", null, `${t("bindingLabel")}：`),
					badge(bound ? t("bound") : t("unbound"), bound ? "ok" : "warn"),
					h("span", null, `${t("ackLabel")}：`),
					badge(state?.ack?.confirmed === true ? t("confirmed") : t("unconfirmed"), state?.ack?.confirmed === true ? "ok" : "warn"),
				),
			];
			if (stateError !== "") statusChildren.push(h("p", { style: styles.error, key: "err" }, `${t("stateError")}：${stateError}`));
			if (typeof state?.lastError?.message === "string") {
				statusChildren.push(h("p", { style: styles.error, key: "last" }, `${t("lastError")}：${state.lastError.message}`));
			}
			if (typeof state?.bridgeError === "string" && state.bridgeError !== "") {
				statusChildren.push(h("p", { style: styles.error, key: "bridgeErr" }, `${t("bridge")}：${state.bridgeError}`));
			}
			if (message !== null) {
				statusChildren.push(h("p", { style: message.kind === "ok" ? styles.ok : styles.error, key: "msg" }, message.text));
			}

			// 凭据区
			const credentialChildren = [
				h("p", { style: styles.hint, key: "hint" }, t("credentialsHint")),
				h("label", { style: styles.field, key: "appId" },
					span(t("appId")),
					h("div", { style: { display: "flex", gap: "8px" } },
						h("input", {
							type: "text",
							style: styles.input,
							value: appIdText,
							placeholder: t("appIdPlaceholder"),
							disabled: !writable,
							onChange: (event) => setAppIdDraft(event.target.value),
						}),
						h("button", {
							type: "button",
							style: styles.buttonSmall,
							disabled: !writable || appIdDraft === null,
							onClick: () => { void saveAppId(); },
						}, t("saveAppId")),
					),
				),
				h("label", { style: styles.field, key: "secret" },
					span(`${t("appSecret")} · ${secretConfigured ? `${t("secretConfigured")}${state?.secret?.source ? `（${t("secretSource")}: ${state.secret.source}）` : ""}` : t("secretMissing")}`),
					h("div", { style: { display: "flex", gap: "8px" } },
						h("input", {
							type: "password",
							style: styles.input,
							value: secretDraft,
							placeholder: t("appSecretPlaceholder"),
							disabled: !writable,
							onChange: (event) => setSecretDraft(event.target.value),
						}),
						h("button", {
							type: "button",
							style: styles.buttonSmall,
							disabled: busy === "saveSecret" || secretDraft.trim() === "",
							onClick: async () => {
								const done = await act("saveSecret", { value: secretDraft });
								if (done !== null) setSecretDraft("");
							},
						}, t("saveSecret")),
						secretConfigured
							? h("button", {
								type: "button",
								style: styles.buttonSmall,
								disabled: busy === "clearSecret",
								onClick: () => { void act("clearSecret"); },
							}, t("clearSecret"))
							: null,
					),
				),
			];

			// 绑定区
			const bindingChildren = [];
			if (bound) {
				bindingChildren.push(h("div", { style: styles.row, key: "bound" },
					h("span", null, `${t("bound")}：${state?.binding?.openIdMasked ?? ""}`),
					state?.binding?.name ? h("span", null, `· ${state.binding.name}`) : null,
					h("button", {
						type: "button",
						style: styles.buttonSmall,
						disabled: busy === "unbind",
						onClick: () => { void act("unbind"); },
					}, t("unbind")),
				));
			} else {
				bindingChildren.push(h("div", { style: { display: "flex", gap: "8px", alignItems: "center" }, key: "actions" },
					h("button", {
						type: "button",
						style: styles.button,
						disabled: busy === "beginBind" || !secretConfigured || appIdText.trim() === "",
						onClick: () => { void act("beginBind"); },
					}, t("beginBind")),
					pendingBind !== null
						? h("button", {
							type: "button",
							style: styles.buttonSmall,
							disabled: busy === "cancelBind",
							onClick: () => { void act("cancelBind"); },
						}, t("cancelBind"))
						: null,
				));
				if (pendingBind !== null && bindLeft > 0) {
					bindingChildren.push(h("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }, key: "code" },
						h("span", null, t("bindCode")),
						h("span", { style: styles.code }, pendingBind.code),
						h("span", { style: styles.hint }, `${bindLeft} ${t("bindCodeExpires")}`),
					));
				}
				if (blockers.length > 0) {
					bindingChildren.push(h("p", { style: styles.hint, key: "why" }, `${t("bindUnavailable")}（${blockers.join("，")}）`));
				}
			}
			bindingChildren.push(h("p", { style: styles.hint, key: "hint" }, t("bindingHint")));

			// 通知区
			const checkRow = (field, label, checked) => h("label", { style: styles.check, key: field },
				h("input", {
					type: "checkbox",
					checked,
					disabled: !writable,
					onChange: (event) => { void setConfig(field, event.target.checked); },
				}),
				label,
			);
			const notificationChildren = [
				h("label", { style: styles.check, key: "enabled" },
					h("input", {
						type: "checkbox",
						checked: enabled,
						disabled: !writable || (!enabled && !canEnable),
						onChange: (event) => { void setConfig("enabled", event.target.checked); },
					}),
					t("enabled"),
				),
				h("p", { style: styles.hint, key: "why" },
					!enabled && blockers.length > 0 ? blockers.join("，") : t("enableHint")),
				checkRow("notifyComplete", t("notifyComplete"), notifyComplete),
				checkRow("notifyQuestion", t("notifyQuestion"), notifyQuestion),
				checkRow("notifyApproval", t("notifyApproval"), notifyApproval),
			];

			const advancedChildren = [
				numberField("completeDebounceMs", t("completeDebounceMs"), "0 - 60000"),
				numberField("maxResultChars", t("maxResultChars"), "200 - 20000"),
				numberField("maxCardButtons", t("maxCardButtons"), "1 - 10"),
			];

			const diagnosticsChildren = [
				h("div", { style: { ...styles.footer, justifyContent: "flex-start" }, key: "actions" },
					h("button", {
						type: "button",
						style: styles.buttonSmall,
						disabled: !bound || busy === "sendTest",
						onClick: () => { void act("sendTest"); },
					}, t("sendTest")),
					h("button", {
						type: "button",
						style: styles.buttonSmall,
						disabled: busy === "restartBridge",
						onClick: () => { void act("restartBridge"); },
					}, t("restartBridge")),
					h("button", {
						type: "button",
						style: styles.buttonSmall,
						disabled: busy === "clearError" || state?.lastError == null,
						onClick: () => { void act("clearError"); },
					}, t("clearError")),
					h("button", {
						type: "button",
						style: styles.buttonSmall,
						onClick: () => { void refresh(); },
					}, t("status")),
				),
				h("p", { style: styles.hint, key: "hint" }, t("diagnosticsHint")),
			];

			return h(
				"div",
				{ style: styles.page },
				showIntro ? h("p", { style: styles.hint }, t("description")) : null,
				!writable ? h("p", { style: styles.hint }, t("readOnly")) : null,
				section(t("status"), statusChildren),
				section(t("credentials"), credentialChildren),
				section(t("bindTitle"), bindingChildren),
				section(t("notifications"), notificationChildren),
				section(t("advanced"), advancedChildren),
				section(t("diagnostics"), diagnosticsChildren),
			);
		}

		/** 文本节点小工具。 */
		function span(text) {
			return h("span", null, text);
		}

		/**
		 * Plugins 页本 bundle 详情里的配置卡片。
		 * @param props - `{form, t}`（配置页所有者还会传 `view`，这里不用）。
		 */
		function FeishuBotCard(props) {
			return h(FeishuBotPanel, props);
		}

		/**
		 * 左侧活动栏打开的本插件页面：一页标题 + 同一份面板。
		 * @param props - `{form, t}`。
		 */
		function FeishuBotPage(props) {
			const t = props.t;
			return h(
				"div",
				{ style: styles.screen },
				h(
					"div",
					{ style: styles.screenInner },
					h("h2", { style: styles.screenTitle }, t("pageTitle")),
					h("p", { style: styles.screenIntro }, t("pageIntro")),
					h(FeishuBotPanel, { ...props, hideIntro: true }),
				),
			);
		}

		/**
		 * 活动栏图标（飞书风格的纸飞机/消息气泡）。外壳负责按钮、提示与选中态，
		 * 这里只画字形，颜色用 `currentColor` 跟随主题。
		 * @param props - `{size, active}`。
		 */
		function FeishuGlyph(props) {
			const size = Number.isFinite(props?.size) && props.size > 0 ? props.size : 18;
			return h(
				"svg",
				{
					width: size,
					height: size,
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.6,
					strokeLinecap: "round",
					strokeLinejoin: "round",
					"aria-hidden": "true",
					focusable: "false",
					style: { display: "block" },
				},
				h("path", { d: "M21 3 10.6 13.4" }),
				h("path", { d: "M21 3l-6.6 18-3.8-7.6L3 9.6 21 3z" }),
			);
		}

		// ── 状态栏入口 ─────────────────────────────────────────────────────

		/** 状态点颜色（跟随主题）。 */
		function toneColor(tone) {
			switch (tone) {
				case "ok":
					return "var(--dsw-alias-state-success-primary, #2e9e5b)";
				case "warn":
					return "var(--dsw-alias-state-warn-primary, #c98a1b)";
				case "bad":
					return "var(--dsw-alias-state-error-primary, #d64541)";
				default:
					return "var(--dsw-alias-label-tertiary, #8a8a8a)";
			}
		}

		/**
		 * 由「开关 + 宿主快照」推出状态栏上要显示的文字与颜色。
		 *
		 * 导出只是为了单测能覆盖到这条映射（`state` 来自异步轮询，组件里拿不到）。
		 * @param enabled - 配置行里的总开关。
		 * @param state - `GET /state` 的 `state`；`null`/`undefined` 表示还没读到。
		 * @param t - 本地化函数。
		 * @returns `{key, label, tone}`。
		 */
		function resolveStatus(enabled, state, t) {
			if (enabled !== true) return { key: "off", label: t("statusOff"), tone: "idle" };
			if (state === null || state === undefined) return { key: "connecting", label: t("statusConnecting"), tone: "warn" };
			switch (state.bridge) {
				case "connected":
					return { key: "on", label: t("statusOn"), tone: "ok" };
				case "connecting":
					return { key: "connecting", label: t("statusConnecting"), tone: "warn" };
				case "error":
					return { key: "failed", label: t("statusFailed"), tone: "bad" };
				default:
					return { key: "notReady", label: t("statusNotReady"), tone: "warn" };
			}
		}

		/** 当前是否具备「一键开启」的前提条件。 */
		function canEnableNow(value, state) {
			const appId = typeof value?.appId === "string" ? value.appId.trim() : "";
			return appId !== ""
				&& state?.secret?.configured === true
				&& state?.binding?.bound === true
				&& state.bridge === "connected";
		}

		/**
		 * 底部状态栏条目：显示飞书通知的开关与连接状态，点一下即开关通知。
		 *
		 * 没配置好时点「开启」不会硬开，而是跳到插件设置页——避免状态栏显示"已开启"
		 * 却一条消息都发不出去。
		 * @param props - `{form, t, openPage}`。
		 */
		function FeishuStatusItem(props) {
			const { form, t } = props;
			const openPage = typeof props.openPage === "function" ? props.openPage : () => {};
			const subscribe = useCallback((listener) => form.subscribe(listener), [form]);
			const getSnapshot = useCallback(() => form.getSnapshot(), [form]);
			const snapshot = useSyncExternalStore(subscribe, getSnapshot);

			const [state, setState] = useState(null);
			const [busy, setBusy] = useState(false);
			const [hint, setHint] = useState("");

			const refresh = useCallback(async () => {
				try {
					const data = await request("/state");
					setState(data.state ?? null);
				} catch {
					// 读不到就沿用上一次；状态栏不该因为一次请求失败而闪。
				}
			}, []);

			useEffect(() => {
				void refresh();
				const poll = setInterval(() => { void refresh(); }, 10_000);
				const onVisible = () => {
					if (typeof document !== "undefined" && document.visibilityState === "visible") void refresh();
				};
				if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
				return () => {
					clearInterval(poll);
					if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
				};
			}, [refresh]);

			if (snapshot.status !== "ready") return null;

			const value = snapshot.value || {};
			const enabled = value.enabled === true;
			const status = resolveStatus(enabled, state, t);
			const detail = typeof state?.lastError?.message === "string" && state.lastError.message !== ""
				? state.lastError.message
				: "";
			const bridgeText = state === null || state === undefined ? "" : t(`bridgeStates.${state.bridge}`);
			const lines = [`${status.label} · ${enabled ? t("statusHintOn") : t("statusHintOff")}`];
			if (bridgeText !== "") lines.push(`${t("statusDetail")}：${bridgeText}`);
			if (detail !== "") lines.push(detail);
			const tooltip = hint !== "" ? hint : lines.join("\n");

			const toggle = async () => {
				if (busy) return;
				setBusy(true);
				setHint("");
				try {
					if (enabled) {
						await form.set("enabled", false);
						setTimeout(() => { void refresh(); }, 600);
						return;
					}
					if (state === null) {
						void refresh();
						openPage();
						return;
					}
					if (!canEnableNow(value, state)) {
						openPage();
						setHint(t("statusHintConfigure"));
						setTimeout(() => setHint(""), 4000);
						return;
					}
					const landed = await form.set("enabled", true);
					if (landed === false) {
						openPage();
						setHint(t("statusHintConfigure"));
						setTimeout(() => setHint(""), 4000);
					}
					setTimeout(() => { void refresh(); }, 900);
				} catch {
					setHint(t("statusHintConfigure"));
					setTimeout(() => setHint(""), 4000);
				} finally {
					setBusy(false);
				}
			};

			return h(
				"button",
				{
					type: "button",
					"data-feishu-status": status.key,
					title: tooltip,
					"aria-label": `${t("statusLabel")} ${status.label}`,
					"aria-pressed": enabled,
					disabled: busy,
					onClick: () => { void toggle(); },
					style: {
						display: "inline-flex",
						alignItems: "center",
						gap: "5px",
						border: "none",
						background: "transparent",
						color: "inherit",
						font: "inherit",
						padding: "0",
						margin: "0",
						cursor: busy ? "default" : "pointer",
						opacity: busy ? 0.6 : 1,
					},
				},
				h("span", {
					style: {
						width: "6px",
						height: "6px",
						borderRadius: "50%",
						background: toneColor(status.tone),
						flex: "0 0 auto",
					},
				}),
				h("span", null, t("statusLabel")),
				h("span", { style: { color: toneColor(status.tone) } }, busy ? t("statusBusy") : status.label),
			);
		}

		/**
		 * 挂载三处界面：
		 *   1. 左侧活动栏入口 + 点击后打开的插件页面（`shell.activitybar.items` /
		 *      `shell.activity`）；
		 *   2. Plugins 页本 bundle 详情里的配置卡片（`plugins.bundle.config`）；
		 *   3. 底部状态栏的开关/连接指示（`shell.statusbar.right`）。
		 *
		 * 三处共用同一个面板与同一份配置表单。
		 * @param ctx - 浏览器插件上下文。
		 */
		function apply(ctx) {
			/** 由 `layout` 服务提供，用来从状态栏跳到插件页。 */
			let layout;
			ctx.inject(["layout"], (withLayout) => {
				layout = withLayout.layout;
				withLayout.effect(() => () => { layout = undefined; }, "feishu-bot: layout");
			});
			const openPage = () => {
				try {
					layout?.selectActivity?.(ENTRY_ID);
				} catch {
					// 没有 layout（裁剪过的组合）时，提示文字已经说明该怎么做了。
				}
			};

			ctx.inject(["slots", "locale", "configForms"], (child) => {
				const form = child.configForms.get(ENTRY_ID);
				const t = typeof child.locale.bind === "function" ? child.locale.bind(NS) : (key) => key;
				child.effect(() => child.locale.register(NS, LOCALES), "feishu-bot: 词典");

				// 左侧活动栏：条目只提供图标，按钮/提示/选中态由外壳拥有。
				child.slots.inject("shell.activitybar.items", () => child.slots.register(
					{
						name: "shell.activitybar.items",
						id: ENTRY_ID,
						order: 130,
						label: () => t("panel"),
						locale: NS,
					},
					FeishuGlyph,
				));

				// 点击条目后进入的页面，key 必须与上面的 id 一致。
				child.slots.inject("shell.activity", () => child.slots.register(
					{
						name: "shell.activity",
						key: ENTRY_ID,
						locale: NS,
						inject: () => ({ form }),
					},
					FeishuBotPage,
				));

				// Plugins 页的 bundle 详情卡片（同一份面板）。
				child.slots.inject("plugins.bundle.config", () => child.slots.register(
					{
						name: "plugins.bundle.config",
						key: BUNDLE_NAME,
						locale: NS,
						inject: () => ({ form }),
					},
					FeishuBotCard,
				));

				// 底部状态栏：一键开关 + 连接状态。
				child.slots.inject("shell.statusbar.right", () => child.slots.register(
					{
						name: "shell.statusbar.right",
						id: ENTRY_ID,
						order: 100,
						locale: NS,
						inject: () => ({ form, openPage }),
					},
					FeishuStatusItem,
				));
			});
		}

		exports.apply = apply;
		exports.resolveStatus = resolveStatus;
		return module.exports;
	},
});
