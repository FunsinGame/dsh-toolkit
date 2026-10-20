/**
 * dsh-notify-sound —— 浏览器半侧。
 *
 * 负责三件事：
 *   1. 用 Web Audio 播放“任务结束 / 需要用户处理”的提示音；
 *   2. 在 Plugins 页本 bundle 的详情页上提供配置卡片（`plugins.bundle.config`）；
 *   3. 把本 bundle 的配置行（`notify-sound`）同步为播放参数。
 *
 * 两类提醒都走宿主/框架的全局信号，因此后台会话（没有在窗口里打开）同样生效：
 *   - 任务结束：转发事件 `api-session/status`（Agent 由运行变为空闲）；
 *   - 待处理交互：`ctx.uiSession.sessionStatus` 里的待处理交互注册表
 *     （提问、计划评审、工具审批）。
 *
 * 本文件是手写的浏览器模块：`window.__ModuleLoader__.load` 只登记工厂，
 * 模块体在首次 require 时才执行。
 */
window.__ModuleLoader__.load({
	id: "dsh-notify-sound",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		// ── 提示音 ─────────────────────────────────────────────────────────

		const React = require("react");
		const { useSyncExternalStore, useState, useCallback } = React;

		/** 宿主配置行的 id：设置的读写都定位到这一行。 */
		const ENTRY_ID = "notify-sound";

		/** 本 bundle 在 Plugins 页注册配置页时使用的键（即包名）。 */
		const BUNDLE_NAME = "dsh-notify-sound";

		/** 本插件拥有的词典命名空间。 */
		const NS = "notify-sound";

		/** 宿主表单返回之前，以及草稿音量非法时使用的音量。 */
		const DEFAULT_VOLUME = 0.4;

		// ── 设置页 ─────────────────────────────────────────────────────────

		const NOTIFY_LOCALES = {
			zh: {
				description: "会话任务结束或需要你处理时播放提示音",
				completeSound: "完成提示音（URL 或 data URI）",
				questionSound: "询问提示音（URL 或 data URI）",
				volume: "音量（0~1）",
				enabled: "启用提示音",
				unsaved: "未保存",
				readOnly: "当前设置只读",
				loading: "正在读取设置…",
				unavailable: "当前版本未提供该插件的设置",
				save: "保存",
				saving: "保存中…",
				discard: "放弃",
				invalidVolume: "请输入 0~1 之间的数字",
				preview: "试听",
				saveFailed: "保存失败，请重试",
			},
			en: {
				description: "Play a chime when a task finishes or something needs your answer",
				completeSound: "Completion sound (URL or data URI)",
				questionSound: "Question sound (URL or data URI)",
				volume: "Volume (0~1)",
				enabled: "Enable notification sound",
				unsaved: "Unsaved",
				readOnly: "Settings are read-only",
				loading: "Reading settings…",
				unavailable: "This version does not serve settings for this plugin",
				save: "Save",
				saving: "Saving…",
				discard: "Discard",
				invalidVolume: "Enter a number between 0 and 1",
				preview: "Preview",
				saveFailed: "Save failed; please try again",
			},
		};

		/** 设置页的内联样式（保持最小化，不引入 CSS 构建）。 */
		const pageStyle = {
			display: "flex",
			flexDirection: "column",
			gap: "12px",
			maxWidth: "560px",
		};
		const hintStyle = { fontSize: "12px", opacity: 0.7, margin: 0 };
		const errorStyle = { fontSize: "12px", color: "#d64541", margin: 0 };
		const fieldStyle = {
			display: "flex",
			flexDirection: "column",
			gap: "4px",
			fontSize: "13px",
		};
		const inputStyle = {
			width: "100%",
			boxSizing: "border-box",
			padding: "6px 8px",
			border: "1px solid rgba(128,128,128,0.4)",
			borderRadius: "6px",
			background: "transparent",
			color: "inherit",
		};
		const footerStyle = {
			display: "flex",
			justifyContent: "flex-end",
			alignItems: "center",
			gap: "8px",
			marginTop: "4px",
		};
		const buttonStyle = {
			padding: "6px 12px",
			border: "1px solid rgba(128,128,128,0.4)",
			borderRadius: "6px",
			background: "transparent",
			color: "inherit",
			cursor: "pointer",
		};
		const previewButtonStyle = {
			...buttonStyle,
			padding: "3px 10px",
			fontSize: "12px",
		};

		/** 草稿里是否包含该字段（显式写入 `undefined` 不算草稿）。 */
		function hasDraft(drafts, field) {
			return Object.prototype.hasOwnProperty.call(drafts, field);
		}

		/**
		 * 本插件的配置页，经 `plugins.bundle.config` 渲染在 Plugins 页的本 bundle
		 * 详情中。
		 *
		 * 修改先在本地暂存，点“保存”时一起写入。可写状态、已接受的值和 revision
		 * 都由宿主表单提供，这里不保存设置文档的副本。
		 *
		 * @param props - 框架注入的本地化 `t`，以及注入的宿主表单。
		 */
		function NotifySoundCard(props) {
			const { form, t } = props;
			// 包一层表单方法：React 会把订阅函数与取值函数当作独立函数调用，
			// 而宿主表单是类实例，方法需要原来的 this。
			const subscribe = useCallback(
				(listener) => form.subscribe(listener),
				[form],
			);
			const getSnapshot = useCallback(() => form.getSnapshot(), [form]);
			const snapshot = useSyncExternalStore(subscribe, getSnapshot);
			const [drafts, setDrafts] = useState({});
			const [saving, setSaving] = useState(false);
			const [failed, setFailed] = useState(false);

			if (snapshot.status === "loading") {
				return React.createElement("p", { style: hintStyle }, t("loading"));
			}
			if (snapshot.status !== "ready") {
				return React.createElement("p", { style: hintStyle }, t("unavailable"));
			}

			const value = snapshot.value || {};
			const writable = snapshot.writable !== false;

			const textValue = (field) => {
				if (hasDraft(drafts, field)) return drafts[field];
				return typeof value[field] === "string" ? value[field] : "";
			};
			const volumeText = hasDraft(drafts, "volume")
				? drafts.volume
				: typeof value.volume === "number"
					? String(value.volume)
					: "";
			const enabledValue = hasDraft(drafts, "enabled")
				? drafts.enabled === true
				: value.enabled !== false;
			const dirty = Object.keys(drafts).length > 0;
			const volumeNumber = Number(volumeText);
			const invalidVolume =
				volumeText.trim() !== "" &&
				(!Number.isFinite(volumeNumber) || volumeNumber < 0 || volumeNumber > 1);
			const blocked = !dirty || invalidVolume || saving || !writable;

			const edit = (field, next) => {
				setDrafts((prev) => ({ ...prev, [field]: next }));
				setFailed(false);
			};
			const discard = () => {
				setDrafts({});
				setFailed(false);
			};
			const save = async () => {
				if (blocked) return;
				setSaving(true);
				setFailed(false);
				let landed = true;
				for (const [field, draft] of Object.entries(drafts)) {
					try {
						if (field === "volume") {
							const text = String(draft).trim();
							landed = text === ""
								? await form.unset("volume")
								: await form.set("volume", Number(text));
						} else if (field === "enabled") {
							landed = await form.set("enabled", draft === true);
						} else {
							const text = String(draft).trim();
							landed = text === ""
								? await form.unset(field)
								: await form.set(field, text);
						}
					} catch (error) {
						landed = false;
					}
					if (!landed) break;
				}
				if (landed) setDrafts({});
				setSaving(false);
				setFailed(!landed);
			};

			/** 用当前草稿（含未保存的值）试听一次提示音。 */
			const preview = (kind) => {
				const parsed = Number(volumeText);
				const volume =
					volumeText.trim() !== "" &&
					Number.isFinite(parsed) &&
					parsed >= 0 &&
					parsed <= 1
						? parsed
						: DEFAULT_VOLUME;
				const soundKey = kind === "complete" ? "completeSound" : "questionSound";
				void playChimeWithConfig(kind, {
					volume,
					[soundKey]: textValue(soundKey),
				});
			};

			const soundField = (kind, field, label) =>
				React.createElement(
					"div",
					{ style: fieldStyle },
					React.createElement(
						"span",
						{
							style: {
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								gap: "8px",
							},
						},
						React.createElement("span", null, label),
						React.createElement(
							"button",
							{
								type: "button",
								style: previewButtonStyle,
								disabled: !writable,
								onClick: () => preview(kind),
							},
							t("preview"),
						),
					),
					React.createElement("input", {
						type: "text",
						style: inputStyle,
						value: textValue(field),
						placeholder: "https://... or data:audio/...",
						disabled: !writable,
						onChange: (event) => edit(field, event.target.value),
					}),
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
						checked: enabledValue,
						disabled: !writable,
						onChange: (event) => edit("enabled", event.target.checked),
					}),
					t("enabled"),
				),
				React.createElement(
					"label",
					{ style: fieldStyle },
					t("volume"),
					React.createElement("input", {
						type: "text",
						inputMode: "decimal",
						style: inputStyle,
						value: volumeText,
						disabled: !writable,
						onChange: (event) => edit("volume", event.target.value),
					}),
					invalidVolume
						? React.createElement("span", { style: errorStyle }, t("invalidVolume"))
						: null,
				),
				soundField("complete", "completeSound", t("completeSound")),
				soundField("question", "questionSound", t("questionSound")),
				failed ? React.createElement("p", { style: errorStyle }, t("saveFailed")) : null,
				React.createElement(
					"div",
					{ style: footerStyle },
					dirty
						? React.createElement(
							"span",
							{ style: { ...hintStyle, marginRight: "auto" } },
							t("unsaved"),
						)
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
							style: buttonStyle,
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

		/** 所有提示音共用一个惰性创建的 Web Audio 上下文。 */
		let audioCtx = null;
		let warnedNoAudio = false;

		/** 很小的间隔，避免同一时刻的多个信号重复响。 */
		let lastChimeAt = 0;
		const MIN_CHIME_GAP_MS = 800;

		/** 从宿主表单同步过来的运行配置；表单回答之前使用默认值。 */
		let pluginConfig = {
			completeSound: "",
			questionSound: "",
			volume: DEFAULT_VOLUME,
			enabled: true,
		};

		/** 首次使用时创建 AudioContext；浏览器不支持时返回 null。 */
		function getAudioContext() {
			if (audioCtx !== null) return audioCtx;
			const Ctor = window.AudioContext || window.webkitAudioContext;
			if (typeof Ctor !== "function") {
				if (!warnedNoAudio) {
					console.warn("[notify-sound] Web Audio API is not available in this browser");
					warnedNoAudio = true;
				}
				return null;
			}
			try {
				audioCtx = new Ctor();
			} catch (error) {
				console.warn("[notify-sound] failed to create AudioContext", error);
				return null;
			}
			return audioCtx;
		}

		/** 尝试恢复被挂起的 AudioContext（用户操作后也会调用）。 */
		function resumeAudio() {
			const ctx = getAudioContext();
			if (ctx !== null && ctx.state === "suspended") {
				ctx.resume().catch(() => {
					// 自动播放策略可能让上下文一直挂起到下一次用户操作。
				});
			}
		}

		/** 在共享上下文上安排一个正弦音。 */
		function scheduleTone(ctx, start, frequency, duration, volume) {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = "sine";
			osc.frequency.setValueAtTime(frequency, start);
			gain.gain.setValueAtTime(0.0001, start);
			gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start(start);
			osc.stop(start + duration + 0.05);
		}

		/** 播放配置的音频文件；开始播放时 resolve true。 */
		function playSoundFile(src, volume) {
			return new Promise((resolve) => {
				let audio;
				try {
					audio = new Audio(src);
				} catch (error) {
					resolve(false);
					return;
				}
				audio.volume = Math.max(
					0,
					Math.min(1, Number.isFinite(volume) ? volume : DEFAULT_VOLUME),
				);
				const onError = () => {
					audio.removeEventListener("error", onError);
					resolve(false);
				};
				audio.addEventListener("error", onError);
				audio
					.play()
					.then(() => {
						audio.removeEventListener("error", onError);
						resolve(true);
					})
					.catch(() => {
						audio.removeEventListener("error", onError);
						resolve(false);
					});
			});
		}

		/**
		 * 用显式配置播放一次提示音。
		 * @param kind - "complete"（上行叮咚）或 "question"（下行咚叮）。
		 * @param config - `{ completeSound?, questionSound?, volume? }`；真实提醒
		 * （来自设置表单）和试听（来自卡片当前草稿）共用这个入口。
		 */
		async function playChimeWithConfig(kind, config) {
			const volume = Number.isFinite(config.volume) ? config.volume : DEFAULT_VOLUME;
			const soundKey = kind === "complete" ? "completeSound" : "questionSound";
			const soundSrc = config[soundKey];

			// 自定义音频：设置页或 profile patch 里配置的 URL / data URI。
			if (typeof soundSrc === "string" && soundSrc.length > 0) {
				const started = await playSoundFile(soundSrc, volume);
				if (started) return;
				// 文件无法播放时回退到内置提示音。
			}

			const ctx = getAudioContext();
			if (ctx === null) return;
			if (ctx.state === "suspended") {
				try {
					await ctx.resume();
				} catch (error) {
					// 浏览器拒绝了自动播放；等下一次用户操作。
					return;
				}
			}
			if (ctx.state !== "running") return;
			const now = ctx.currentTime;
			if (kind === "complete") {
				scheduleTone(ctx, now, 660, 0.28, volume);
				scheduleTone(ctx, now + 0.16, 880, 0.34, volume);
			} else {
				scheduleTone(ctx, now, 880, 0.28, volume);
				scheduleTone(ctx, now + 0.16, 660, 0.34, volume);
			}
		}

		/**
		 * 用当前生效的设置播放真实提醒。
		 * @param kind - "complete" 或 "question"。
		 */
		async function playChime(kind) {
			if (pluginConfig.enabled === false) return;
			const nowWall = Date.now();
			if (nowWall - lastChimeAt < MIN_CHIME_GAP_MS) return;
			lastChimeAt = nowWall;
			await playChimeWithConfig(kind, pluginConfig);
		}

		/** 用宿主表单已接受的值替换播放配置。 */
		function adoptSettings(snapshot) {
			if (snapshot.status !== "ready" || snapshot.value === undefined || snapshot.value === null) {
				return;
			}
			const value = snapshot.value;
			pluginConfig = {
				completeSound: typeof value.completeSound === "string" ? value.completeSound : "",
				questionSound: typeof value.questionSound === "string" ? value.questionSound : "",
				volume:
					typeof value.volume === "number" && Number.isFinite(value.volume)
						? value.volume
						: DEFAULT_VOLUME,
				enabled: value.enabled !== false,
			};
		}

		// ── 全局提醒信号 ───────────────────────────────────────────────────

		/** 会话是否是用户自己的顶层会话（而不是子智能体会话）。 */
		function isUserFacingSession(sessions, sessionId) {
			const row = sessions.list.getSnapshot().byId[sessionId];
			if (row !== undefined) return row.origin !== "subagent";
			// 列表尚未同步到这一行时，用子智能体地址目录兜底判断。
			return sessions.subagentAddress(sessionId) === undefined;
		}

		/**
		 * 处理一次“会话从运行变为空闲”：该会话的任务已经结束，无论它是当前
		 * 打开的会话还是后台会话。
		 *
		 * @param sessionId - 状态发生变化的会话。
		 * @param sessions - 会话服务，用于识别子智能体。
		 */
		function notifySessionIdle(sessionId, sessions) {
			if (!isUserFacingSession(sessions, sessionId)) return;
			void playChime("complete");
		}

		/**
		 * 观察所有会话里“等待用户处理”的交互（提问、计划评审、工具审批）。
		 *
		 * `ctx.uiSession.sessionStatus` 是框架为所有会话维护的待处理交互注册表：
		 * 后台会话的请求同样会登记进来，所以不依赖当前打开的是哪个会话。请求
		 * 的 `key` 在一次请求内唯一，用它去重；插件加载时已经存在的请求只建立
		 * 基线，不补响。
		 *
		 * @param uiSession - 会话 UI 服务。
		 * @returns 取消订阅的函数。
		 */
		function watchPendingInteractions(uiSession) {
			/** 上一次快照里已经提醒过的请求 key；`null` 表示还没建立基线。 */
			let announced = null;
			const sync = () => {
				const keys = new Set();
				for (const status of uiSession.sessionStatus.getSnapshot().values()) {
					if (status.pendingInteraction !== undefined) keys.add(status.pendingInteraction.key);
				}
				if (announced !== null) {
					for (const key of keys) {
						if (announced.has(key)) continue;
						void playChime("question");
					}
				}
				announced = keys;
			};
			const unsubscribe = uiSession.sessionStatus.subscribe(sync);
			sync();
			return unsubscribe;
		}

		// ── 插件主体 ───────────────────────────────────────────────────────

		/**
		 * 挂载提示音和它的配置页。
		 *
		 * 每个可选服务都通过各自的子注入获取，因此本插件不会因为某个包未组合
		 * 而卡住 Web 启动：没有 `remote`/`sessions` 时不提示任务结束，没有
		 * `uiSession` 时不提示待处理交互，没有 `configForms` 时仍用声明的
		 * 默认值播放，没有 `slots`/`locale` 时只是不提供设置页。
		 *
		 * @param ctx - 浏览器插件上下文。
		 */
		function apply(ctx) {
			// 实时播放设置：宿主的配置表单是唯一来源，设置镜像会在每次写入后刷新。
			ctx.inject(["configForms"], (child) => {
				const form = child.configForms.get(ENTRY_ID);
				const sync = () => {
					adoptSettings(form.getSnapshot());
				};
				child.effect(() => form.subscribe(sync), "notify-sound: 设置同步");
				sync();
			});

			// 本 bundle 在 Plugins 页上的配置页。`plugins.bundle.config` 按 npm
			// 包名分发，因此键就是包名。
			ctx.inject(["slots", "locale", "configForms"], (child) => {
				const form = child.configForms.get(ENTRY_ID);
				child.effect(
					() => child.locale.register(NS, NOTIFY_LOCALES),
					"notify-sound: 词典",
				);
				child.slots.inject("plugins.bundle.config", () =>
					child.slots.register(
						{
							name: "plugins.bundle.config",
							key: BUNDLE_NAME,
							locale: NS,
							inject: () => ({ form }),
						},
						NotifySoundCard,
					),
				);
			});

			// 任务结束的全局信号：宿主会把**所有**会话的运行状态变化转发到
			// 浏览器（`api-session/status`），所以后台会话结束时也能立即提醒，
			// 不需要先把那个会话打开。子智能体会话在这里被过滤掉。
			ctx.inject(["remote", "sessions"], (child) => {
				child.effect(
					() => child.remote.$on("api-session/status", (sessionId, running) => {
						if (running) return;
						notifySessionIdle(sessionId, child.sessions);
					}),
					"notify-sound: 会话状态",
				);
			});

			// 提问 / 计划评审 / 工具审批：进入全局待处理交互表就提醒，后台会话
			// 同样生效。子智能体的提问/审批也需要人来处理，因此不过滤。
			ctx.inject(["uiSession"], (child) => {
				child.effect(
					() => watchPendingInteractions(child.uiSession),
					"notify-sound: 待处理交互",
				);
			});

			// 用户操作后解锁 Web Audio（浏览器自动播放策略）。
			ctx.effect(() => {
				const doc = document;
				const onGesture = () => {
					resumeAudio();
				};
				doc.addEventListener("pointerdown", onGesture, { passive: true });
				doc.addEventListener("keydown", onGesture, { passive: true });
				doc.addEventListener("touchstart", onGesture, { passive: true });
				return () => {
					doc.removeEventListener("pointerdown", onGesture);
					doc.removeEventListener("keydown", onGesture);
					doc.removeEventListener("touchstart", onGesture);
				};
			}, "notify-sound: 解锁音频");
		}

		exports.apply = apply;
		return module.exports;
	},
});
