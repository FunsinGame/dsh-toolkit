window.__ModuleLoader__.load({
	id: "dsh-chat-fileref",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");

		// ── Remote codecs (mirror of the Host ./typert.host.js validators) ─────

		const stringSchema = {
			parse(value) {
				if (typeof value !== "string") throw new Error("expected a string");
				return value;
			},
		};
		const optionalNumberSchema = {
			parse(value) {
				if (value === undefined) return undefined;
				if (typeof value !== "number" || !Number.isFinite(value)) {
					throw new Error("expected a finite number");
				}
				return value;
			},
		};
		const openFileRequestSchema = {
			parse(value) {
				if (typeof value !== "object" || value === null || Array.isArray(value)) {
					throw new Error("expected an object");
				}
				const path = stringSchema.parse(value.path);
				const line = optionalNumberSchema.parse(value.line);
				return line === undefined ? { path } : { path, line };
			},
		};
		const openFileResultSchema = {
			parse(value) {
				if (typeof value !== "object" || value === null || Array.isArray(value)) {
					throw new Error("expected an object");
				}
				if (typeof value.opened !== "boolean") {
					throw new Error("expected a boolean `opened`");
				}
				return { opened: value.opened };
			},
		};

		/** Client Remote contribution mounted through `ctx.remote.$mount`. */
		const TYPERT_REMOTE = {
			package: "dsh-chat-fileref",
			descriptors: [
				{
					id: "dsh-chat-fileref#fileref/openFile",
					service: "fileref",
					namespace: "fileref",
					method: "openFile",
					invocation: { kind: "direct" },
					parameters: [
						{
							name: "request",
							wire: "request",
							source: "json",
							codec: {
								mode: "strict",
								typeSymbol: "OpenFileRequest",
								schema: openFileRequestSchema,
							},
						},
					],
					result: {
						mode: "strict",
						typeSymbol: "OpenFileResult",
						schema: openFileResultSchema,
					},
					sourceLocation: { file: "lib/client.js", line: 1, column: 1 },
				},
			],
		};

		// ── file-reference detection ───────────────────────────────────────────

		// A file reference is an `@` trigger followed by a path: optional `X:`
		// drive, optional leading separator (Unix absolute), one-or-more `dir/`
		// segments, then `name.ext`, then an optional `:line` / `:line-line`
		// suffix. The `@` is the trigger only — it is not part of the opened path.
		// Segments accept Unicode letters/numbers and spaces, so paths such as
		// `C:\Users\heyang\Desktop\测试目录\新建 文本文档.txt` are recognized.
		const FILE_REF_RE = /@((?:[A-Za-z]:)?[\\/]?[\p{L}\p{N}\p{M} _\-.@+#~'!%()\[\]]+(?:[\\/][\p{L}\p{N}\p{M} _\-.@+#~'!%()\[\]]+)+\.[A-Za-z0-9]+)(:\d+(?:-\d+)?)?/gu;

		/** Whether a character is a word character (rejects `foo@bar` mentions). */
		const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;

		/** Trailing path segment, the part that identifies the file at a glance. */
		function basename(path) {
			const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
			return at === -1 ? path : path.slice(at + 1);
		}

		/** Parse a leading-colon suffix (`:7`, `:7-12`) into start/end lines. */
		function parseLineSuffix(suffix) {
			if (suffix === undefined) return undefined;
			const m = /^:(\d+)(?:-(\d+))?$/.exec(suffix);
			if (m === null) return undefined;
			const start = Number(m[1]);
			const end = m[2] === undefined ? undefined : Number(m[2]);
			return { start, end };
		}

		/** Visible label: basename plus the authored line suffix. */
		function displayLabel(path, suffix) {
			const base = basename(path);
			return suffix === undefined ? base : base + suffix;
		}

		function isAbsolutePath(path) {
			return /^[A-Za-z]:[\\/]/.test(path) || /^[\\/]/.test(path);
		}

		/** Resolve a relative path against the session workspace cwd. */
		function resolveToAbsolute(cwd, path) {
			if (isAbsolutePath(path)) return path;
			if (cwd === undefined || cwd === "") return path;
			return cwd.replace(/[\\/]+$/, "") + "/" + path.replace(/^[\\/]+/, "");
		}

		function isWordChar(ch) {
			if (ch === undefined) return false;
			return WORD_CHAR_RE.test(ch);
		}

		/** Scan a draft/body for file references, in order. */
		function scanFileRefs(text) {
			if (typeof text !== "string" || text.length === 0) return [];
			const results = [];
			FILE_REF_RE.lastIndex = 0;
			let m;
			while ((m = FILE_REF_RE.exec(text)) !== null) {
				const before = text[m.index - 1];
				if (isWordChar(before)) continue;
				const parsed = parseLineSuffix(m[2]);
				results.push({
					path: m[1],
					line: parsed === undefined ? undefined : parsed.start,
					label: displayLabel(m[1], m[2]),
					title: m[1] + (m[2] === undefined ? "" : m[2]),
				});
			}
			return results;
		}

		// ── DOM linkifier (sent messages) ─────────────────────────────────────

		const SKIP_TAGS = {
			PRE: true,
			A: true,
			BUTTON: true,
			TEXTAREA: true,
			INPUT: true,
			SCRIPT: true,
			STYLE: true,
			NOSCRIPT: true,
			SVG: true,
			MATH: true,
		};

		function shouldSkipElement(el) {
			if (el === null || el === undefined) return true;
			if (SKIP_TAGS[el.tagName] === true) return true;
			if (typeof el.hasAttribute === "function" && el.hasAttribute("data-fileref")) {
				return true;
			}
			if (el.isContentEditable === true) return true;
			if (el.classList && (el.classList.contains("katex") || el.classList.contains("katex-display"))) {
				return true;
			}
			return false;
		}

		/** Whether a node lives inside a user or assistant-step chat message. */
		function inMessageContent(node) {
			let el = node && node.nodeType === 1 ? node : node && node.parentElement;
			while (el) {
				if (typeof el.hasAttribute === "function" && el.hasAttribute("data-chat-flow-kind")) {
					const kind = el.getAttribute("data-chat-flow-kind");
					return kind === "user" || kind === "assistant-step";
				}
				el = el.parentElement;
			}
			return false;
		}

		function createFileRefButton(path, suffix, openFile) {
			const label = displayLabel(path, suffix);
			const full = path + (suffix === undefined ? "" : suffix);
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "dsh-fileref";
			btn.setAttribute("data-fileref", "true");
			btn.setAttribute("title", full);
			btn.setAttribute("aria-label", `Open ${full} in editor`);
			btn.textContent = label;
			btn.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				const parsed = parseLineSuffix(suffix);
				openFile(path, parsed === undefined ? undefined : parsed.start);
			});
			return btn;
		}

		function linkifyTextNode(textNode, openFile) {
			const text = textNode.nodeValue;
			if (text === null || text.length === 0) return;
			const parent = textNode.parentNode;
			if (parent === null) return;

			const matches = [];
			FILE_REF_RE.lastIndex = 0;
			let m;
			while ((m = FILE_REF_RE.exec(text)) !== null) {
				const before = text[m.index - 1];
				if (isWordChar(before)) continue;
				matches.push({ index: m.index, full: m[0], path: m[1], suffix: m[2] });
			}
			if (matches.length === 0) return;

			const fragment = document.createDocumentFragment();
			let last = 0;
			for (const match of matches) {
				if (match.index > last) {
					fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
				}
				fragment.appendChild(createFileRefButton(match.path, match.suffix, openFile));
				last = match.index + match.full.length;
			}
			if (last < text.length) {
				fragment.appendChild(document.createTextNode(text.slice(last)));
			}
			parent.replaceChild(fragment, textNode);
		}

		function linkifyElement(root, openFile) {
			const walker = document.createTreeWalker(
				root,
				NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
				{
					acceptNode(node) {
						if (node.nodeType === 1) {
							if (shouldSkipElement(node)) return NodeFilter.FILTER_REJECT;
							return NodeFilter.FILTER_SKIP;
						}
						return NodeFilter.FILTER_ACCEPT;
					},
				},
			);
			const textNodes = [];
			let node;
			while ((node = walker.nextNode()) !== null) {
				if (node.nodeType === 3) textNodes.push(node);
			}
			for (const textNode of textNodes) {
				linkifyTextNode(textNode, openFile);
			}
		}

		// ── live composer strip ────────────────────────────────────────────────

		function FileRefDock(props) {
			const draft = props.input && typeof props.input.draft === "string" ? props.input.draft : "";
			const refs = React.useMemo(() => scanFileRefs(draft), [draft]);
			if (refs.length === 0) return null;
			return React.createElement(
				"div",
				{ className: "dsh-fileref-dock" },
				refs.map((ref, index) =>
					React.createElement(
						"button",
						{
							key: `${ref.path}:${ref.line === undefined ? "" : ref.line}:${index}`,
							type: "button",
							className: "dsh-fileref-chip",
							title: ref.title,
							onClick: () => props.openFileRef(ref.path, ref.line),
						},
						ref.label,
					),
				),
			);
		}

		// ── plugin body ────────────────────────────────────────────────────────

		const inject = ["remote", "slots"];

		const css = `
.dsh-fileref {
	color: var(--dsw-alias-brand-primary, #4d6bfe);
	background: none;
	border: none;
	padding: 0;
	margin: 0;
	font: inherit;
	cursor: pointer;
	text-decoration: underline;
	text-underline-offset: 2px;
	border-radius: 2px;
}
.dsh-fileref:hover {
	opacity: 0.8;
}
.dsh-fileref:focus-visible {
	outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe);
	outline-offset: 1px;
}
.dsh-fileref-dock {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	width: 100%;
	max-width: var(--dsh-composer-card-max-width, 780px);
	margin: 0 auto;
	padding: 0;
}
.dsh-fileref-chip {
	color: var(--dsw-alias-brand-primary, #4d6bfe);
	background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.04));
	border: none;
	border-radius: 6px;
	padding: 2px 8px;
	font: inherit;
	font-size: 13px;
	line-height: 20px;
	cursor: pointer;
}
.dsh-fileref-chip:hover {
	color: var(--dsw-alias-label-primary, #1f2328);
	text-decoration: underline;
}
.dsh-fileref-chip:focus-visible {
	box-shadow: inset 0 0 0 2px var(--dsw-alias-border-l3, #818b98);
	outline: none;
}
`;

		async function apply(ctx) {
			// Mount the Host Remote before any chip can be clicked. The mount is
			// owned by this plugin's fiber, so stop/update withdraws it too.
			await ctx.remote.$mount(TYPERT_REMOTE);

			const sessions = ctx.get("sessions");

			const currentCwd = () => {
				try {
					if (sessions === undefined || sessions.list === undefined) return undefined;
					if (typeof sessions.list.getSnapshot !== "function") return undefined;
					const snapshot = sessions.list.getSnapshot();
					const id = snapshot && snapshot.current;
					if (id === undefined) return undefined;
					const row = snapshot.byId && snapshot.byId[id];
					return row ? row.cwd : undefined;
				} catch (error) {
					return undefined;
				}
			};

			const openFile = async (path, line) => {
				const absolute = resolveToAbsolute(currentCwd(), path);
				const namespace = ctx.remote.fileref;
				if (namespace !== undefined) {
					try {
						const result = await namespace.openFile({ path: absolute, line });
						const ok = result && result.ok === true && result.value && result.value.opened === true;
						if (ok) return true;
						console.error("[dsh-chat-fileref] editor openFile failed", result);
					} catch (error) {
						console.error("[dsh-chat-fileref] editor openFile threw", error);
					}
				} else {
					console.error("[dsh-chat-fileref] remote namespace `fileref` is unavailable");
				}
				// Fallback: open with the host's default handler (no line jump).
				const workspaces = ctx.get("workspaces");
				if (workspaces !== undefined && typeof workspaces.openPath === "function") {
					try {
						await workspaces.openPath(absolute);
						return true;
					} catch (error) {
						console.error("[dsh-chat-fileref] openPath fallback threw", error);
					}
				}
				return false;
			};

			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-chat-fileref";
				tag.textContent = css;
				document.head.appendChild(tag);
				return () => tag.remove();
			}, "chat-fileref: styles");

			// Sent-message linkifier: scan every current message and every message
			// added later. Scanning is idempotent — already-linkified text lives in
			// `[data-fileref]` buttons that the walker rejects.
			let scheduled = false;
			const scanAll = () => {
				if (scheduled) return;
				scheduled = true;
				queueMicrotask(() => {
					scheduled = false;
					const wrappers = document.querySelectorAll(
						'[data-chat-flow-kind="user"], [data-chat-flow-kind="assistant-step"]',
					);
					for (const wrapper of wrappers) linkifyElement(wrapper, openFile);
				});
			};

			ctx.effect(() => {
				const observer = new MutationObserver((records) => {
					for (const record of records) {
						if (inMessageContent(record.target)) {
							scanAll();
							return;
						}
						for (const added of record.addedNodes) {
							if (inMessageContent(added)) {
								scanAll();
								return;
							}
						}
					}
				});
				observer.observe(document.body, { childList: true, subtree: true });
				return () => observer.disconnect();
			}, "chat-fileref: observer");

			// Live composer strip: clickable chips above the input, derived from the
			// draft on every keystroke/paste (the slot re-renders with fresh
			// `input.draft`). A native textarea cannot host inline clickable links,
			// so this is the interactive affordance while the user types.
			ctx.slots.inject("conversation.input.dock", () =>
				ctx.slots.register(
					{
						name: "conversation.input.dock",
						id: "dsh-chat-fileref",
						inject: () => ({
							openFileRef: (path, line) => openFile(path, line),
						}),
					},
					FileRefDock,
				),
			);

			scanAll();
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
