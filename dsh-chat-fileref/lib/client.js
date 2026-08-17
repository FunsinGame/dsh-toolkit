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

		// ── inline @ source (reference codec) ─────────────────────────────────

		/** Ctxs that already own a registered fileref source (avoid duplicate throws). */
		const registeredFilerefSourceCtxs = new WeakSet();

		/**
		 * Register the no-candidate `@` source that lets the input machine
		 * serialize fileref occurrence chips back to `@path...`. Safe to call
		 * late: the source is registered as soon as `ctx.inputTriggers` exists.
		 * @param ctx - client root context.
		 * @returns true when the source is (or was already) registered.
		 */
		function registerFilerefSource(ctx) {
			const inputTriggers = ctx.get("inputTriggers");
			if (inputTriggers === undefined || typeof inputTriggers.registerSource !== "function") return false;
			if (registeredFilerefSourceCtxs.has(ctx)) return true;
			const source = {
				trigger: "@",
				name: "dsh-chat-fileref",
				candidates: () => Promise.resolve([]),
				onPick: () => undefined,
				codec: {
					clipboardText: (ref) => ref === "" ? "" : "@" + ref,
					serialize: (ref) => Promise.resolve(ref === "" ? "" : "@" + ref),
				},
			};
			try {
				ctx.effect(() => {
					const dispose = inputTriggers.registerSource(source);
					registeredFilerefSourceCtxs.add(ctx);
					return () => {
						dispose();
						registeredFilerefSourceCtxs.delete(ctx);
					};
				}, "chat-fileref: @ source");
				return true;
			} catch (error) {
				console.error("[dsh-chat-fileref] failed to register inline @ source", error);
				return false;
			}
		}

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

		/** Scan a draft/body for file references, in order, including match spans. */
		function scanFileRefMatches(text) {
			if (typeof text !== "string" || text.length === 0) return [];
			const results = [];
			FILE_REF_RE.lastIndex = 0;
			let m;
			while ((m = FILE_REF_RE.exec(text)) !== null) {
				const before = text[m.index - 1];
				if (isWordChar(before)) continue;
				const parsed = parseLineSuffix(m[2]);
				results.push({
					start: m.index,
					end: m.index + m[0].length,
					full: m[0],
					path: m[1],
					suffix: m[2],
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

		// ── composer chip width adaption ──────────────────────────────────────

		/**
		 * Mark a composer reference chip as "wide" when its label is longer than
		 * the fixed chip cell. The label then overflows the cell instead of being
		 * clipped, while the underlying textarea placeholder keeps caret alignment.
		 */
		function updateChipWidth(chip) {
			const label = chip.firstElementChild;
			if (label === null || label === undefined) return;
			const text = label.textContent || "";
			const clipped = label.scrollWidth > label.clientWidth + 1;
			chip.classList.toggle("dsh-fileref-chip-wide", text.length > 10 || clipped);
			// Empty cells are layout spacers for multi-cell file-reference chips:
			// they reserve width so the caret lands after the visible label. Only
			// treat an empty cell as a spacer when a non-empty chip precedes it in
			// the same consecutive run.
			let spacer = false;
			if (text.length === 0) {
				let prev = chip.previousElementSibling;
				while (prev !== null && prev.matches && prev.matches('[data-decoration="chip"]')) {
					const prevLabel = prev.firstElementChild;
					if (prevLabel !== null && (prevLabel.textContent || "").length > 0) {
						spacer = true;
						break;
					}
					prev = prev.previousElementSibling;
				}
			}
			chip.classList.toggle("dsh-fileref-chip-spacer", spacer);
			// For the head of a multi-cell run, stretch the label box across the
			// whole reserved run so its centered text sits inside one continuous
			// pill. The label itself stays transparent; the blue background comes
			// from the chip cells, and first/last corner classes merge them.
			if (text.length > 0) {
				let runLength = 1;
				const spacers = [];
				let next = chip.nextElementSibling;
				while (next !== null && next.matches && next.matches('[data-decoration="chip"]')) {
					const nextLabel = next.firstElementChild;
					if (nextLabel === null || (nextLabel.textContent || "").length > 0) break;
					spacers.push(next);
					runLength += 1;
					next = next.nextElementSibling;
				}
				if (runLength > 1) {
					const cellWidth = chip.getBoundingClientRect().width || 64;
					label.style.width = `${(cellWidth * runLength) / 0.72}px`;
					chip.classList.add("dsh-fileref-chip-first");
					chip.classList.remove("dsh-fileref-chip-last", "dsh-fileref-chip-middle");
					spacers.forEach((spacer, index) => {
						spacer.classList.remove("dsh-fileref-chip-first", "dsh-fileref-chip-last", "dsh-fileref-chip-middle");
						if (index === spacers.length - 1) spacer.classList.add("dsh-fileref-chip-last");
						else spacer.classList.add("dsh-fileref-chip-middle");
					});
				} else {
					label.style.width = "";
					chip.classList.remove("dsh-fileref-chip-first", "dsh-fileref-chip-last", "dsh-fileref-chip-middle");
				}
			}
		}

		/** Apply width adaption to every currently-rendered composer chip. */
		function scanChipWidths(root) {
			const scope = root || document;
			const chips = scope.querySelectorAll('[data-decoration="chip"]');
			for (const chip of chips) updateChipWidth(chip);
		}

		/** Approximate the unscaled pixel width of a chip label at a given font size. */
		function measureTextWidth(text, fontSize = 16) {
			try {
				const canvas = document.createElement("canvas");
				const ctx = canvas.getContext("2d");
				if (ctx === null) return text.length * (fontSize * 0.47);
				ctx.font = `${fontSize}px ${getComputedStyle(document.body).fontFamily || "sans-serif"}`;
				return ctx.measureText(text).width;
			} catch (error) {
				return text.length * (fontSize * 0.47);
			}
		}

		/**
		 * Find a multi-cell file-reference chip run around a caret position.
		 * Returns `{ start, end }` in draft offsets, or null when the caret is not
		 * touching a multi-cell fileref chip.
		 */
		function getFileRefRun(snapshot, caret) {
			if (!snapshot || !Array.isArray(snapshot.occurrences)) return null;
			const occs = snapshot.occurrences.filter(o => o.source === "dsh-chat-fileref");
			if (occs.length < 2) return null;
			const runFromIndex = (index) => {
				let start = index;
				while (start > 0 && occs[start].ref === "" && occs[start - 1].offset + 1 === occs[start].offset) start--;
				if (occs[start].ref === "") return null;
				let end = start;
				while (end + 1 < occs.length && occs[end + 1].ref === "" && occs[end + 1].offset === occs[end].offset + 1) end++;
				return end - start + 1 >= 2
					? { start: occs[start].offset, end: occs[end].offset + 1 }
					: null;
			};
			const headIndex = occs.findIndex(o => o.offset === caret);
			if (headIndex >= 0) {
				const run = runFromIndex(headIndex);
				if (run !== null) return run;
			}
			const insideIndex = occs.findIndex(o => o.offset < caret && caret <= o.offset + 1);
			if (insideIndex >= 0) {
				const run = runFromIndex(insideIndex);
				if (run !== null) return run;
			}
			return null;
		}

		// ── inline composer converter ──────────────────────────────────────────

		/** Map an input phase to the trigger guard tier. */
		function guardTier(phase) {
			if (phase === "plain") return { tier: "plain" };
			if (phase === "claimed") return { tier: "claimed" };
			return { tier: "frozen" };
		}

		/**
		 * Replace the first complete `@path...` in the live draft with an inline
		 * reference chip. Runs from the dock slot after each draft revision so the
		 * chip appears inside the composer at the edited position; the sent
		 * message still serializes back to the authored `@path...` text.
		 */
		function convertFileRef(input, sessionId, ctx) {
			if (!input || typeof input.draft !== "string") return;
			if (input.phase !== "plain" && input.phase !== "claimed") return;
			if (!registerFilerefSource(ctx)) return;
			const inputTriggers = ctx.get("inputTriggers");
			if (inputTriggers === undefined || typeof inputTriggers.sessionOf !== "function") return;
			const matches = scanFileRefMatches(input.draft);
			if (matches.length === 0) return;
			const sessions = ctx.get("sessions");
			if (sessions === undefined || typeof sessions.scope !== "function") return;
			const actx = sessions.scope(sessionId);
			if (actx === undefined || typeof actx.bail !== "function") return;
			const conversation = ctx.get("conversation");
			if (conversation === undefined || conversation.input === undefined) return;
			const shell = conversation.input.for(actx);
			if (shell === undefined || typeof shell.pasteBegin !== "function") return;
			const current = shell.state.getSnapshot();
			if (current.draft !== input.draft || current.draftRev !== input.draftRev) return;
			const match = matches[0];
			const full = match.path + (match.suffix === undefined ? "" : match.suffix);
			const label = "[" + match.label + "]";
			// Each U+FFFC cell reserves 4em. Measure the label at the composer's
			// actual font size and use the minimum number of cells that fits, so the
			// reserved chip is as close to the text width as the cell grid allows.
			const backdropEl = document.querySelector('[data-input-backdrop]');
			const fontSize = backdropEl ? parseFloat(getComputedStyle(backdropEl).fontSize) || 16 : 16;
			const measuredWidth = measureTextWidth(label, fontSize) * 0.72;
			const cellCount = Math.max(1, Math.min(12, Math.ceil(measuredWidth / (fontSize * 4))));
			const text = "x".repeat(cellCount);
			const tail = current.draft.slice(match.end);
			const components = [];
			for (let i = 0; i < cellCount; i++) {
				components.push({
					start: i,
					end: i + 1,
					reference: i === 0
						? { source: "dsh-chat-fileref", ref: full, label, clipboardText: "@" + full }
						: { source: "dsh-chat-fileref", ref: "", label: "", clipboardText: "" },
				});
			}
			try {
				shell.pasteBegin(text, { start: match.start, end: match.end }, components);
				if (typeof shell.invalidatePaste === "function") shell.invalidatePaste();
				const next = shell.state.getSnapshot();
				const caret = match.start + text.length + (tail.length > 0 && tail[0] === " " ? 1 : 0);
				inputTriggers.sessionOf(actx).track(
					next.draft,
					caret,
					guardTier(next.phase),
					next.draftRev,
				);
			} catch (error) {
				console.error("[dsh-chat-fileref] inline reference insert failed", error);
			}
		}

		/**
		 * The composer dock entry renders nothing; it exists to run the inline
		 * converter after the user pauses typing. The short debounce lets a
		 * line suffix such as `:16-23` be typed completely before the `@path`
		 * is replaced with a chip.
		 */
		function FileRefDock(props) {
			const draftRev = props.input && props.input.draftRev;
			const convert = props.convertFileRef;
			React.useEffect(() => {
				if (props.input === undefined || convert === undefined) return;
				const timer = setTimeout(() => convert(props.input), 250);
				return () => clearTimeout(timer);
			}, [draftRev, convert]);
			return null;
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
/* Long composer file-ref chips: let the label overflow the fixed U+FFFC cell
   instead of being clipped. The textarea still reserves one placeholder cell,
   so caret/selection alignment is preserved; only the visual label expands. */
.dsh-fileref-chip-wide {
	overflow: visible !important;
}
.dsh-fileref-chip-wide > span {
	position: absolute !important;
	left: 0 !important;
	top: 50% !important;
	width: max-content;
	max-width: none;
	box-sizing: border-box !important;
	overflow: visible !important;
	white-space: nowrap !important;
	transform: translateY(-50%) scale(0.72) !important;
	transform-origin: left center !important;
	background: transparent !important;
	border-radius: 6px !important;
	justify-content: center !important;
	padding: 0 8px !important;
	z-index: 1 !important;
}
/* Spacer cells of a multi-cell file-reference chip: keep the placeholder width
   and the normal chip background so the whole run reads as one pill; only the
   empty label is hidden. */
.dsh-fileref-chip-spacer > span {
	display: none !important;
}
/* Merge the separate U+FFFC cells of one multi-cell chip into a single
   continuous pill: square internal corners, rounded only at the outer ends. */
.dsh-fileref-chip-first,
.dsh-fileref-chip-middle,
.dsh-fileref-chip-last {
	border-radius: 0 !important;
}
.dsh-fileref-chip-first {
	border-radius: 6px 0 0 6px !important;
}
.dsh-fileref-chip-last {
	border-radius: 0 6px 6px 0 !important;
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

			// Multi-cell file chips are rendered as several U+FFFC cells so the
			// caret lands after the visible label. Make Backspace delete the whole
			// run again, matching the single-cell chip behavior users expect.
			ctx.effect(() => {
				const onKeyDown = (event) => {
					const isBackspace = event.key === "Backspace";
					const isArrowLeft = event.key === "ArrowLeft";
					const isArrowRight = event.key === "ArrowRight";
					if (!isBackspace && !isArrowLeft && !isArrowRight) return;
					if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
					const target = event.target;
					if (target === null || target.tagName !== "TEXTAREA") return;
					if (!target.hasAttribute("data-phase") || target.closest("[data-composer-card]") === null) return;
					const caret = target.selectionStart;
					if (caret === null || target.selectionEnd !== caret) return;
					const sessions = ctx.get("sessions");
					if (sessions === undefined || sessions.list === undefined || typeof sessions.list.getSnapshot !== "function") return;
					const currentId = sessions.list.getSnapshot().current;
					if (currentId === undefined) return;
					const actx = sessions.scope(currentId);
					if (actx === undefined) return;
					const conversation = ctx.get("conversation");
					const shell = conversation && conversation.input && conversation.input.for(actx);
					if (shell === undefined || shell.state === undefined) return;
					const snapshot = shell.state.getSnapshot();
					const run = getFileRefRun(snapshot, caret);
					if (run === null) return;
					if (isBackspace) {
						// Delete the whole multi-cell chip when the caret is inside
						// it or immediately after it.
						if (caret <= run.start || caret > run.end) return;
						event.preventDefault();
						event.stopPropagation();
						const nextDraft = snapshot.draft.slice(0, run.start) + snapshot.draft.slice(run.end);
						shell.setDraft(nextDraft);
						requestAnimationFrame(() => {
							target.setSelectionRange(run.start, run.start);
							const next = shell.state.getSnapshot();
							const inputTriggers = ctx.get("inputTriggers");
							if (inputTriggers !== undefined && typeof inputTriggers.sessionOf === "function") {
								inputTriggers.sessionOf(actx).track(next.draft, run.start, guardTier(next.phase), next.draftRev);
							}
						});
						return;
					}
					if (isArrowLeft) {
						// Skip the whole chip when moving left from inside/right edge.
						if (caret <= run.start || caret > run.end) return;
						event.preventDefault();
						event.stopPropagation();
						if (typeof shell.invalidatePaste === "function") shell.invalidatePaste();
						target.setSelectionRange(run.start, run.start);
						return;
					}
					if (isArrowRight) {
						// Skip the whole chip when moving right from inside/left edge.
						if (caret < run.start || caret >= run.end) return;
						event.preventDefault();
						event.stopPropagation();
						if (typeof shell.invalidatePaste === "function") shell.invalidatePaste();
						target.setSelectionRange(run.end, run.end);
					}
				};
				document.addEventListener("keydown", onKeyDown, true);
				return () => document.removeEventListener("keydown", onKeyDown, true);
			}, "chat-fileref: keydown");

			// Inline composer chips: register the no-candidate `@` source now (or
			// lazily on first conversion) so the input machine can serialize
			// fileref occurrence chips back to the authored `@path...` text.
			registerFilerefSource(ctx);

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
					scanChipWidths();
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
					for (const record of records) {
						if (record.type === "childList") {
							for (const added of record.addedNodes) {
								if (added.nodeType !== 1) continue;
								const chips = added.matches && added.matches('[data-decoration="chip"]')
									? [added]
									: added.querySelectorAll
										? Array.from(added.querySelectorAll('[data-decoration="chip"]'))
										: [];
								for (const chip of chips) {
									updateChipWidth(chip);
									if (chip.previousElementSibling !== null && chip.previousElementSibling.matches && chip.previousElementSibling.matches('[data-decoration="chip"]')) {
										updateChipWidth(chip.previousElementSibling);
									}
								}
							}
						} else if (record.type === "characterData") {
							const parent = record.target.parentElement;
							const chip = parent && parent.closest
								? parent.closest('[data-decoration="chip"]')
								: null;
							if (chip !== null) updateChipWidth(chip);
						}
					}
				});
				observer.observe(document.body, { childList: true, subtree: true, characterData: true });
				return () => observer.disconnect();
			}, "chat-fileref: observer");

			// Inline composer converter: the dock entry renders nothing and exists
			// only to receive fresh `input` snapshots; after each draft revision it
			// replaces the first complete `@path...` with an inline chip at the
			// edited position (the sent message still carries `@path...`).
			ctx.slots.inject("conversation.input.dock", () =>
				ctx.slots.register(
					{
						name: "conversation.input.dock",
						id: "dsh-chat-fileref",
						inject: (sessionId) => ({
							convertFileRef: (input) => convertFileRef(input, sessionId, ctx),
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
