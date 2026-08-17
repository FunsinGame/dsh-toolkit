window.__ModuleLoader__.load({
	id: "dsh-notify-sound",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		// ── notification chimes ─────────────────────────────────────────────

		const React = require("react");
		const { useSyncExternalStore, useState } = React;

		/** Services this browser half consumes. */
		const inject = ["conversationEvents", "slots", "locale", "settingsScope"];

		/**
		 * Cards the agent can put in front of the user. `data-question-key` is
		 * the generic ask_user_question flow, `data-plan-review-key` is the plan
		 * review variant, and `data-approval-key` is a tool approval request.
		 */
		const NOTIFY_SELECTOR =
			"[data-question-key], [data-plan-review-key], [data-approval-key]";

		/** Epoch ms when this plugin instance started; used to skip historical replay. */
		const loadedAt = Date.now();

		/** Event seqs already handled (completion and approval/asked chimes). */
		const playedEventSeqs = new Set();

		/** Card keys already seen, so one question/approval chimes once. */
		const playedCardKeys = new Set();

		// ── settings-surface card ──────────────────────────────────────────

		/** Settings namespace owned by the Host half. */
		const NOTIFY_SOUND_NS = "notify-sound";
		const NOTIFY_LOCALE_NS = "notify-sound";
		const NOTIFY_LOCALES = {
			zh: {
				title: "提示音",
				description: "会话任务完成或询问用户时播放提示音",
				completeSound: "完成提示音（URL 或 data URI）",
				questionSound: "询问提示音（URL 或 data URI）",
				volume: "音量（0~1）",
				enabled: "启用提示音",
				unsaved: "未保存",
				readOnly: "当前设置只读",
				save: "保存",
				saving: "保存中…",
				discard: "放弃",
				invalidVolume: "请输入 0~1 之间的数字",
				preview: "试听",
				saveFailed: "保存失败，请重试",
			},
			en: {
				title: "Notification sound",
				description: "Play a chime when a task completes or the agent asks you something",
				completeSound: "Completion sound (URL or data URI)",
				questionSound: "Question sound (URL or data URI)",
				volume: "Volume (0~1)",
				enabled: "Enable notification sound",
				unsaved: "Unsaved",
				readOnly: "Settings are read-only",
				save: "Save",
				saving: "Saving…",
				discard: "Discard",
				invalidVolume: "Enter a number between 0 and 1",
				preview: "Preview",
				saveFailed: "Save failed; please try again",
			},
		};

		/** Inline styles for the settings card (kept minimal, no CSS build). */
		const cardStyle = {
			listStyle: "none",
			border: "1px solid rgba(128,128,128,0.25)",
			borderRadius: "8px",
			marginBottom: "8px",
			background: "var(--dsw-alias-surface-2, #ffffff)",
		};
		const headerStyle = {
			width: "100%",
			display: "flex",
			flexDirection: "column",
			alignItems: "flex-start",
			gap: "2px",
			padding: "12px 14px",
			border: "none",
			background: "none",
			cursor: "pointer",
			font: "inherit",
			textAlign: "left",
			color: "inherit",
		};
		const bodyStyle = {
			padding: "0 14px 14px",
			display: "flex",
			flexDirection: "column",
			gap: "10px",
		};
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

		/**
		 * The settings card rendered inside the Plugins settings tab.
		 * Uses the host-registered `notify-sound` settings namespace.
		 */
		function NotifySoundCard(props) {
			const snapshot = useSyncExternalStore(props.subscribe, props.getSnapshot);
			const [open, setOpen] = useState(false);
			const [drafts, setDrafts] = useState({});
			const [saving, setSaving] = useState(false);
			const [failed, setFailed] = useState(false);

			if (snapshot.status !== "ready") return null;
			const value = snapshot.value || {};
			const writable = snapshot.writable;

			const textValue = (field) => {
				if (Object.prototype.hasOwnProperty.call(drafts, field)) return drafts[field];
				return typeof value[field] === "string" ? value[field] : "";
			};
			const volumeValue = () => {
				if (Object.prototype.hasOwnProperty.call(drafts, "volume")) return drafts.volume;
				return typeof value.volume === "number" ? String(value.volume) : "";
			};
			const enabledValue = () => {
				if (Object.prototype.hasOwnProperty.call(drafts, "enabled")) return drafts.enabled;
				return value.enabled !== false;
			};
			const dirty = Object.keys(drafts).length > 0;
			const volumeText = volumeValue();
			const volumeNumber = Number(volumeText);
			const invalidVolume = volumeText.trim() !== "" && (
				!Number.isFinite(volumeNumber) || volumeNumber < 0 || volumeNumber > 1
			);
			const blocked = !dirty || invalidVolume || saving;

			const edit = (field, text) => {
				setDrafts((prev) => ({ ...prev, [field]: text }));
				setFailed(false);
			};
			const toggleEnabled = (checked) => {
				setDrafts((prev) => ({ ...prev, enabled: checked }));
				setFailed(false);
			};
			const discard = () => {
				setDrafts({});
				setFailed(false);
			};
			const save = async () => {
				if (invalidVolume || saving) return;
				setSaving(true);
				setFailed(false);
				const writes = Object.entries(drafts).map(([field, draft]) => {
					if (field === "volume") {
						const text = String(draft).trim();
						return text === ""
							? () => props.unset("volume")
							: () => props.set("volume", Number(text));
					}
					if (field === "enabled") {
						return () => props.set("enabled", draft === true);
					}
					const text = String(draft).trim();
					return text === ""
						? () => props.unset(field)
						: () => props.set(field, text);
				});
				let landed = true;
				for (const write of writes) {
					await write();
					const snap = props.getSnapshot();
					const user = snap.status === "ready" ? (snap.user || {}) : undefined;
					landed = user !== undefined && landed;
				}
				if (landed) setDrafts({});
				setSaving(false);
				setFailed(!landed);
			};

			/** Preview one chime using the current draft (unsaved values included). */
			const preview = (kind) => {
				const volumeText = volumeValue();
				const parsedVolume = Number(volumeText);
				const volume = volumeText.trim() !== "" && Number.isFinite(parsedVolume) && parsedVolume >= 0 && parsedVolume <= 1
					? parsedVolume
					: DEFAULT_VOLUME;
				const soundKey = kind === "complete" ? "completeSound" : "questionSound";
				void playChimeWithConfig(kind, {
					volume,
					[soundKey]: textValue(soundKey),
				});
			};

			return React.createElement(
				"li",
				{ style: cardStyle },
				React.createElement(
					"button",
					{
						type: "button",
						style: headerStyle,
						"aria-expanded": open,
						onClick: () => setOpen(!open),
					},
					React.createElement("span", { style: { fontWeight: 600 } }, props.t("title")),
					React.createElement("span", { style: { fontSize: "12px", opacity: 0.7 } }, props.t("description")),
					dirty ? React.createElement("span", { style: { fontSize: "12px", opacity: 0.8 } }, props.t("unsaved")) : null,
				),
				open
					? React.createElement(
						"div",
						{ style: bodyStyle },
						!writable ? React.createElement("p", null, props.t("readOnly")) : null,
						React.createElement(
							"div",
							{ style: fieldStyle },
							React.createElement(
								"span",
								{ style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" } },
								React.createElement("span", null, props.t("completeSound")),
								React.createElement(
									"button",
									{
										type: "button",
										style: previewButtonStyle,
										onClick: () => preview("complete"),
									},
									props.t("preview"),
								),
							),
							React.createElement("input", {
								type: "text",
								style: inputStyle,
								value: textValue("completeSound"),
								placeholder: "https://... or data:audio/...",
								disabled: !writable,
								onChange: (event) => edit("completeSound", event.target.value),
							}),
						),
						React.createElement(
							"div",
							{ style: fieldStyle },
							React.createElement(
								"span",
								{ style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" } },
								React.createElement("span", null, props.t("questionSound")),
								React.createElement(
									"button",
									{
										type: "button",
										style: previewButtonStyle,
										onClick: () => preview("question"),
									},
									props.t("preview"),
								),
							),
							React.createElement("input", {
								type: "text",
								style: inputStyle,
								value: textValue("questionSound"),
								placeholder: "https://... or data:audio/...",
								disabled: !writable,
								onChange: (event) => edit("questionSound", event.target.value),
							}),
						),
						React.createElement(
							"label",
							{ style: fieldStyle },
							props.t("volume"),
							React.createElement("input", {
								type: "text",
								inputMode: "decimal",
								style: inputStyle,
								value: volumeValue(),
								disabled: !writable,
								onChange: (event) => edit("volume", event.target.value),
							}),
							invalidVolume
								? React.createElement("span", { style: { color: "#d64541" } }, props.t("invalidVolume"))
								: null,
						),
						React.createElement(
							"label",
							{ style: { ...fieldStyle, flexDirection: "row", alignItems: "center", gap: "6px" } },
							React.createElement("input", {
								type: "checkbox",
								checked: enabledValue(),
								disabled: !writable,
								onChange: (event) => toggleEnabled(event.target.checked),
							}),
							props.t("enabled"),
						),
						failed
							? React.createElement("p", { style: { color: "#d64541", margin: 0 } }, props.t("saveFailed"))
							: null,
						React.createElement(
							"div",
							{ style: footerStyle },
							React.createElement(
								"button",
								{ type: "button", style: buttonStyle, disabled: !dirty || saving, onClick: discard },
								props.t("discard"),
							),
							React.createElement(
								"button",
								{ type: "button", style: buttonStyle, disabled: blocked, onClick: () => { void save() } },
								saving ? props.t("saving") : props.t("save"),
							),
						),
					)
					: null,
			);
		}

		/** Lazy Web Audio context shared by all chimes. */
		let audioCtx = null;
		let warnedNoAudio = false;
		const DEFAULT_VOLUME = 0.4;

		/** Small gap so an event and its DOM card cannot double-chime. */
		let lastChimeAt = 0;
		const MIN_CHIME_GAP_MS = 800;

		/** Runtime config supplied from the plugin row (cordis.patch.yml). */
		let pluginConfig = { volume: DEFAULT_VOLUME };

		/** Create the AudioContext on first use, or return null when unsupported. */
		function getAudioContext() {
			if (audioCtx !== null) return audioCtx;
			const Ctor =
				window.AudioContext ||
				window.webkitAudioContext;
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

		/** Try to resume a suspended AudioContext (called after user gestures too). */
		function resumeAudio() {
			const ctx = getAudioContext();
			if (ctx !== null && ctx.state === "suspended") {
				ctx.resume().catch(() => {
					// Autoplay policy may keep the context suspended until a gesture.
				});
			}
		}

		/** Schedule one sine tone on the shared context. */
		function scheduleTone(ctx, start, frequency, duration, volume) {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = "sine";
			osc.frequency.setValueAtTime(frequency, start);
			gain.gain.setValueAtTime(0.0001, start);
			gain.gain.exponentialRampToValueAtTime(
				Math.max(0.0002, volume),
				start + 0.02,
			);
			gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start(start);
			osc.stop(start + duration + 0.05);
		}

		/** Play a configured audio file; resolves true when playback started. */
		function playSoundFile(src, volume) {
			return new Promise((resolve) => {
				let audio;
				try {
					audio = new Audio(src);
				} catch (error) {
					resolve(false);
					return;
				}
				audio.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : DEFAULT_VOLUME));
				const onError = () => {
					audio.removeEventListener("error", onError);
					resolve(false);
				};
				audio.addEventListener("error", onError);
				audio.play().then(() => {
					audio.removeEventListener("error", onError);
					resolve(true);
				}).catch(() => {
					audio.removeEventListener("error", onError);
					resolve(false);
				});
			});
		}

		/**
		 * Play one chime from an explicit config object.
		 * @param kind - "complete" (ascending ding-dong) or "question" (descending).
		 * @param config - `{ completeSound?, questionSound?, volume? }`; used by
		 * real notifications (from the settings namespace) and by previews (from
		 * the card's current draft).
		 */
		async function playChimeWithConfig(kind, config) {
			const volume =
				Number.isFinite(config.volume)
					? config.volume
					: DEFAULT_VOLUME;
			const soundKey = kind === "complete" ? "completeSound" : "questionSound";
			const soundSrc = config[soundKey];

			// Custom audio file: a URL or data URI configured in the settings UI
			// or cordis.patch.yml.
			if (typeof soundSrc === "string" && soundSrc.length > 0) {
				const started = await playSoundFile(soundSrc, volume);
				if (started) return;
				// Fall back to the built-in chime if the file cannot play.
			}

			const ctx = getAudioContext();
			if (ctx === null) return;
			if (ctx.state === "suspended") {
				try {
					await ctx.resume();
				} catch (error) {
					// The browser denied autoplay; wait for the next user gesture.
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
		 * Play the real notification chime from the live settings namespace.
		 * @param kind - "complete" or "question".
		 */
		async function playChime(kind) {
			if (pluginConfig.enabled === false) return;
			const nowWall = Date.now();
			if (nowWall - lastChimeAt < MIN_CHIME_GAP_MS) return;
			lastChimeAt = nowWall;

			await playChimeWithConfig(kind, pluginConfig);
		}

		/** Return true only for events appended around/after this plugin loaded. */
		function isFreshEvent(event) {
			return (
				event != null &&
				typeof event.time === "number" &&
				event.time >= loadedAt - 2000
			);
		}

		/** Handle one completion event (turn/end completed or goal/change complete). */
		function notifyComplete(event) {
			if (playedEventSeqs.has(event.seq)) return;
			playedEventSeqs.add(event.seq);
			if (!isFreshEvent(event)) return;
			void playChime("complete");
		}

		/** Handle one event that directly asks the user (currently approval/asked). */
		function notifyQuestionEvent(event) {
			if (playedEventSeqs.has(event.seq)) return;
			playedEventSeqs.add(event.seq);
			if (!isFreshEvent(event)) return;
			void playChime("question");
		}

		/** Record a question/approval card key and chime when it is new. */
		function noteCard(node) {
			if (node == null || node.nodeType !== 1) return;
			const key =
				node.getAttribute("data-question-key") ||
				node.getAttribute("data-plan-review-key") ||
				node.getAttribute("data-approval-key");
			if (key === null || key === "") return;
			if (playedCardKeys.has(key)) return;
			playedCardKeys.add(key);
			void playChime("question");
		}

		// ── conversation event definition ──────────────────────────────────
		//
		// Uses one start-only Context per completion event. The `start` callback
		// fires both for live appends and for historical replay; `isFreshEvent`
		// suppresses the replay chimes.

		const notifySoundDefinition = {
			kind: "notify-sound-event",
			match(event) {
				if (
					event.type === "turn/end" &&
					event.data != null &&
					event.data.reason != null &&
					event.data.reason.kind === "completed"
				) {
					return { id: String(event.seq), role: "start" };
				}
				if (
					event.type === "goal/change" &&
					event.data != null &&
					event.data.operation === "complete"
				) {
					return { id: String(event.seq), role: "start" };
				}
				if (event.type === "approval/asked") {
					return { id: String(event.seq), role: "start" };
				}
				return null;
			},
			start(_context, match) {
				if (match.event.type === "approval/asked") {
					notifyQuestionEvent(match.event);
				} else {
					notifyComplete(match.event);
				}
				return {};
			},
			update(context) {
				return context.state;
			},
		};

		// ── plugin body ────────────────────────────────────────────────────

		async function apply(ctx, config = {}) {
			pluginConfig = {
				volume: Number.isFinite(config.volume) ? config.volume : DEFAULT_VOLUME,
				completeSound:
					typeof config.completeSound === "string" ? config.completeSound : "",
				questionSound:
					typeof config.questionSound === "string" ? config.questionSound : "",
				enabled: config.enabled !== false,
			};

			const t = ctx.locale.bind(NOTIFY_LOCALE_NS);
			ctx.effect(
				() => ctx.locale.register(NOTIFY_LOCALE_NS, NOTIFY_LOCALES),
				"notify-sound: settings dictionaries",
			);

			// Bind the Host-registered `notify-sound` settings namespace and keep
			// the playback config in sync with what the settings UI saves.
			const scope = ctx.settingsScope.bind({ namespace: NOTIFY_SOUND_NS });
			const applyScopeToPluginConfig = () => {
				const snap = scope.getSnapshot();
				if (snap.status !== "ready" || snap.value === undefined) return;
				const v = snap.value;
				pluginConfig = {
					volume: typeof v.volume === "number" ? v.volume : DEFAULT_VOLUME,
					completeSound:
						typeof v.completeSound === "string" ? v.completeSound : "",
					questionSound:
						typeof v.questionSound === "string" ? v.questionSound : "",
					enabled: v.enabled !== false,
				};
			};
			ctx.effect(
				() => scope.subscribe(applyScopeToPluginConfig),
				"notify-sound: settings sync",
			);
			applyScopeToPluginConfig();

			// Add a configuration card to Settings → Plugins → Plugin configuration.
			ctx.slots.inject("settings.plugin.item", function* () {
				yield ctx.slots.register({
					name: "settings.plugin.item",
					id: "notify-sound",
					order: 30,
					locale: NOTIFY_LOCALE_NS,
					inject: () => ({
						getSnapshot: () => scope.getSnapshot(),
						subscribe: (listener) => scope.subscribe(listener),
						set: (field, value) => scope.set(field, value),
						unset: (field) => scope.unset(field),
						t: (key) => t(key),
					}),
				}, NotifySoundCard);
			});

			// Register the event matcher. The registry ties its lifetime to this
			// plugin's fiber, so a hot reload cleans it up automatically.
			ctx.conversationEvents.register(notifySoundDefinition);

			ctx.effect(() => {
				// Seed with cards already on screen so a reload/hot-reload does not
				// replay a chime for a question that was already visible.
				const existing = document.querySelectorAll(NOTIFY_SELECTOR);
				for (const node of existing) {
					const key =
						node.getAttribute("data-question-key") ||
						node.getAttribute("data-plan-review-key") ||
						node.getAttribute("data-approval-key");
					if (key !== null && key !== "") playedCardKeys.add(key);
				}

				const observer = new MutationObserver((records) => {
					for (const record of records) {
						for (const node of record.addedNodes) {
							if (node.nodeType !== 1) continue;
							if (typeof node.matches === "function" && node.matches(NOTIFY_SELECTOR)) {
								noteCard(node);
								continue;
							}
							if (typeof node.querySelectorAll === "function") {
								const cards = node.querySelectorAll(NOTIFY_SELECTOR);
								for (const card of cards) noteCard(card);
							}
						}
					}
				});
				observer.observe(document.body, {
					childList: true,
					subtree: true,
				});

				const onPointerDown = () => resumeAudio();
				document.addEventListener("pointerdown", onPointerDown, { passive: true });
				document.addEventListener("keydown", onPointerDown, { passive: true });
				document.addEventListener("touchstart", onPointerDown, { passive: true });

				return () => {
					observer.disconnect();
					document.removeEventListener("pointerdown", onPointerDown);
					document.removeEventListener("keydown", onPointerDown);
					document.removeEventListener("touchstart", onPointerDown);
				};
			}, "notify-sound: DOM observer");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
