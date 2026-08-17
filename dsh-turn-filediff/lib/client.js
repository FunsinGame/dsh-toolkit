window.__ModuleLoader__.load({
	id: "dsh-turn-filediff",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");

		// ── line-diff utilities ────────────────────────────────────────────────

		/** Split text into lines without a trailing empty line for a final newline. */
		function splitLines(text) {
			const lines = String(text).split("\n");
			if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
			return lines;
		}

		/** Longest-common-subsequence length between two line arrays (1-D rolling DP). */
		function lcsLength(a, b) {
			let rows = a;
			let cols = b;
			if (rows.length < cols.length) {
				const swap = rows;
				rows = cols;
				cols = swap;
			}
			let prev = new Array(cols.length + 1).fill(0);
			for (let i = 1; i <= rows.length; i++) {
				const curr = new Array(cols.length + 1).fill(0);
				for (let j = 1; j <= cols.length; j++) {
					curr[j] =
						rows[i - 1] === cols[j - 1]
							? prev[j - 1] + 1
							: Math.max(prev[j], curr[j - 1]);
				}
				prev = curr;
			}
			return prev[cols.length];
		}

		/** Approximate added/removed via a multiset for pathologically large files. */
		function multisetDiff(oldLines, newLines) {
			const counts = new Map();
			for (const line of oldLines) {
				counts.set(line, (counts.get(line) ?? 0) + 1);
			}
			let common = 0;
			for (const line of newLines) {
				const c = counts.get(line) ?? 0;
				if (c > 0) {
					counts.set(line, c - 1);
					common++;
				}
			}
			return { added: newLines.length - common, removed: oldLines.length - common };
		}

		/** Exact added/removed line counts, with a guard against huge inputs. */
		function lineDiffCount(oldLines, newLines) {
			if (oldLines.length === 0) return { added: newLines.length, removed: 0 };
			if (newLines.length === 0) return { added: 0, removed: oldLines.length };
			if (oldLines.length * newLines.length > 4000000) {
				return multisetDiff(oldLines, newLines);
			}
			const lcs = lcsLength(oldLines, newLines);
			return { added: newLines.length - lcs, removed: oldLines.length - lcs };
		}

		/** 1-based line of the first difference, else 1. */
		function firstChangedLine(oldLines, newLines) {
			const len = Math.min(oldLines.length, newLines.length);
			for (let i = 0; i < len; i++) {
				if (oldLines[i] !== newLines[i]) return i + 1;
			}
			if (oldLines.length !== newLines.length) return len + 1;
			return 1;
		}

		/** Turn one `FileDiff` into `{ added, removed, firstLine }`. */
		function diffStats(diff) {
			const newLines = splitLines(diff.newText);
			if (diff.oldText == null) {
				return { added: newLines.length, removed: 0, firstLine: 1 };
			}
			const oldLines = splitLines(diff.oldText);
			const counts = lineDiffCount(oldLines, newLines);
			return { ...counts, firstLine: firstChangedLine(oldLines, newLines) };
		}

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
		const fileDiffSchema = {
			parse(value) {
				if (typeof value !== "object" || value === null || Array.isArray(value)) {
					throw new Error("expected an object");
				}
				const newText = stringSchema.parse(value.newText);
				const oldText = value.oldText === undefined || value.oldText === null
					? null
					: stringSchema.parse(value.oldText);
				return { oldText, newText };
			},
		};
		const openDiffRequestSchema = {
			parse(value) {
				if (typeof value !== "object" || value === null || Array.isArray(value)) {
					throw new Error("expected an object");
				}
				const path = stringSchema.parse(value.path);
				if (!Array.isArray(value.diffs) || value.diffs.length === 0) {
					throw new Error("expected a non-empty diffs array");
				}
				const diffs = value.diffs.map((diff) => fileDiffSchema.parse(diff));
				return { path, diffs };
			},
		};
		const openedResultSchema = {
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
			package: "dsh-turn-filediff",
			descriptors: [
				{
					id: "dsh-turn-filediff#turnFilediff/openFile",
					service: "turnFilediff",
					namespace: "turnFilediff",
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
						typeSymbol: "OpenedResult",
						schema: openedResultSchema,
					},
					sourceLocation: { file: "lib/client.js", line: 1, column: 1 },
				},
				{
					id: "dsh-turn-filediff#turnFilediff/openDiff",
					service: "turnFilediff",
					namespace: "turnFilediff",
					method: "openDiff",
					invocation: { kind: "direct" },
					parameters: [
						{
							name: "request",
							wire: "request",
							source: "json",
							codec: {
								mode: "strict",
								typeSymbol: "OpenDiffRequest",
								schema: openDiffRequestSchema,
							},
						},
					],
					result: {
						mode: "strict",
						typeSymbol: "OpenedResult",
						schema: openedResultSchema,
					},
					sourceLocation: { file: "lib/client.js", line: 1, column: 1 },
				},
			],
		};

		// ── per-turn file-modification accumulator ─────────────────────────────

		/** Only count the final (append) surface emission of a tool result. */
		function isAppendSurfaceEvent(event) {
			return event.surfaceOp !== undefined && event.surfaceOp === "append";
		}

		const turnFilediffDefinition = {
			kind: "turnFilediff",
			match: (event) => {
				if (event.type === "turn/start") {
					return { id: String(event.data.turn), role: "start" };
				}
				if (event.type === "tool/result" && isAppendSurfaceEvent(event)) {
					return { id: String(event.data.turn), role: "update" };
				}
				return null;
			},
			start: (_context, match) => {
				if (match.event.type !== "turn/start") {
					throw new Error("turnFilediff start requires turn/start");
				}
				return { turn: match.event.data.turn, files: new Map(), order: [] };
			},
			update: (context, match) => {
				if (match.event.type !== "tool/result") return context.state;
				const content = match.event.data.message.content[0];
				if (content.isError === true) return context.state;
				const view = match.view?.for === "result" ? match.view.view : null;
				if (view == null || view.card !== "diff" || !Array.isArray(view.diffs)) {
					return context.state;
				}
				const files = new Map(context.state.files);
				const order = [...context.state.order];
				for (const diff of view.diffs) {
					if (diff == null || typeof diff.path !== "string") continue;
					const stats = diffStats(diff);
					const path = diff.path;
					const hunk = {
						oldText: diff.oldText == null ? null : diff.oldText,
						newText: diff.newText == null ? "" : diff.newText,
					};
					const existing = files.get(path);
					if (existing === undefined) {
						order.push(path);
						files.set(path, {
							path,
							added: stats.added,
							removed: stats.removed,
							firstLine: stats.firstLine,
							diffs: [hunk],
							seq: match.event.seq,
						});
					} else {
						files.set(path, {
							path,
							added: existing.added + stats.added,
							removed: existing.removed + stats.removed,
							firstLine:
								existing.firstLine != null
									? existing.firstLine
									: stats.firstLine,
							diffs: [...existing.diffs, hunk],
							seq: match.event.seq,
						});
					}
				}
				return { ...context.state, files, order };
			},
			buildLocationData: (context, scope) => {
				if (scope !== "turn" || context.state === undefined) return null;
				const files = context.state.order
					.map((path) => context.state.files.get(path))
					.filter(Boolean);
				if (files.length === 0) return null;
				return {
					kind: "turn",
					turn: context.state.turn,
					key: "turnFilediff",
					value: { files },
				};
			},
		};

		/** Claim the turn-tail chain when the closing turn modified files. */
		function selectTurnFilediff(owner) {
			const data = owner.turn.data.get("turnFilediff");
			if (data === undefined) return null;
			const seq = owner.seq ?? Number.POSITIVE_INFINITY;
			const files = data.files
				.filter((file) => file.seq <= seq)
				.map((file) => {
					// Normalize older persisted summaries (single oldText/newText)
					// into the hunk-list shape the diff action now requires.
					if (Array.isArray(file.diffs) && file.diffs.length > 0) return file;
					if (
						typeof file.oldText === "string" ||
						typeof file.newText === "string"
					) {
						return {
							...file,
							diffs: [
								{
									oldText: file.oldText == null ? null : file.oldText,
									newText: file.newText == null ? "" : file.newText,
								},
							],
						};
					}
					return file;
				})
				.filter((file) => Array.isArray(file.diffs) && file.diffs.length > 0);
			if (files.length === 0) return null;
			const count = files.length;
			const totalAdded = files.reduce((sum, file) => sum + file.added, 0);
			const totalRemoved = files.reduce((sum, file) => sum + file.removed, 0);
			return { files, count, totalAdded, totalRemoved };
		}

		// ── UI component ───────────────────────────────────────────────────────

		function basename(path) {
			const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
			return at === -1 ? path : path.slice(at + 1);
		}

		const styles = {
			root: { marginTop: 10, fontSize: 13, lineHeight: "20px" },
			bar: {
				display: "inline-flex",
				alignItems: "center",
				gap: 7,
				cursor: "pointer",
				background: "transparent",
				border: "none",
				padding: "2px 8px 2px 4px",
				borderRadius: 6,
				font: "inherit",
				color: "var(--dsw-alias-label-secondary, #59636e)",
				textAlign: "left",
			},
			chevron: {
				display: "inline-block",
				width: 10,
				color: "var(--dsw-alias-label-tertiary, #818b98)",
			},
			added: { color: "#2ea043", fontWeight: 600 },
			removed: { color: "#d1242f", fontWeight: 600 },
			list: {
				listStyle: "none",
				margin: "2px 0 0 18px",
				padding: 0,
				display: "flex",
				flexDirection: "column",
				gap: 1,
			},
			fileItem: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "2px 8px",
				borderRadius: 6,
				color: "var(--dsw-alias-label-primary, #1f2328)",
			},
			filePath: {
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				maxWidth: 360,
			},
			spacer: { flex: 1 },
			action: {
				appearance: "none",
				background: "transparent",
				border: "none",
				borderRadius: 6,
				padding: "1px 8px",
				font: "inherit",
				cursor: "pointer",
				color: "var(--dsw-alias-label-secondary, #59636e)",
			},
		};

		function TurnFilediffBar({ matched, openFile, openEditor, openDiff, t }) {
			const [expanded, setExpanded] = React.useState(false);
			const { files, count, totalAdded, totalRemoved } = matched;
			return React.createElement(
				"div",
				{ style: styles.root },
				React.createElement(
					"button",
					{
						type: "button",
						style: styles.bar,
						className: "tdf-bar",
						"aria-expanded": expanded,
						onClick: () => setExpanded((value) => !value),
					},
					React.createElement(
						"span",
						{ style: styles.chevron, "aria-hidden": "true" },
						expanded ? "▾" : "▸",
					),
					React.createElement(
						"span",
						null,
						t("bar.modified", { count: String(count) }),
					),
					React.createElement("span", { style: styles.added }, "+" + totalAdded),
					React.createElement("span", { style: styles.removed }, "-" + totalRemoved),
				),
				expanded &&
					React.createElement(
						"ul",
						{ style: styles.list },
						files.map((file) =>
							React.createElement(
								"li",
								{ key: file.path },
								React.createElement(
									"div",
									{ style: styles.fileItem, className: "tdf-file" },
									React.createElement(
										"span",
										{ style: styles.filePath, title: file.path },
										basename(file.path),
									),
									React.createElement("span", { style: styles.added }, "+" + file.added),
									React.createElement("span", { style: styles.removed }, "-" + file.removed),
									React.createElement("span", { style: styles.spacer }),
									React.createElement(
										"button",
										{
											type: "button",
											className: "tdf-action",
											style: styles.action,
											"aria-label": t("file.open", { name: file.path }),
											onClick: async () => {
												const opened =
													typeof openEditor === "function"
														? await openEditor(file.path, file.firstLine)
														: false;
												if (!opened && typeof openFile === "function") {
													openFile(file.path);
												}
											},
										},
										t("file.openBtn"),
									),
									React.createElement(
										"button",
										{
											type: "button",
											className: "tdf-action",
											style: styles.action,
											onClick: async () => {
												if (typeof openDiff === "function") {
													await openDiff(file.path, file.diffs);
												}
											},
										},
										t("file.diff"),
									),
								),
							),
						),
					),
			);
		}

		// ── locale dictionaries ────────────────────────────────────────────────

		const NS = "turnFilediff";
		const zh = {
			"bar.modified": "{count} 个文件已修改",
			"file.open": "在编辑器中打开 {name}",
			"file.openBtn": "打开",
			"file.diff": "差异",
		};
		const en = {
			"bar.modified": "{count} files modified",
			"file.open": "Open {name} in editor",
			"file.openBtn": "Open",
			"file.diff": "Diff",
		};

		const css = `
.tdf-bar:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.04)); }
.tdf-file:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.04)); }
.tdf-action:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.04)); color: var(--dsw-alias-label-primary, #1f2328); }
.tdf-bar:focus-visible, .tdf-file:focus-visible, .tdf-action:focus-visible {
  box-shadow: inset 0 0 0 2px var(--dsw-alias-border-l3, #818b98);
  outline: none;
}
`;

		// ── inline file-mention vocabulary (replaces ui-deliverables' resolver) ──

		/** The single modified path whose basename is exactly `value`, else undefined. */
		function onlyPathWithBasename(paths, value) {
			const matches = paths.filter((path) => basename(path) === value);
			return matches.length === 1 ? matches[0] : void 0;
		}

		/** Resolve an inline-code token to one of the turn's modified files. */
		function producedFileMentions(paths, openFile, label) {
			return {
				resolve(value) {
					const path = paths.includes(value) ? value : onlyPathWithBasename(paths, value);
					if (path === void 0) return void 0;
					return {
						open: () => {
							openFile(path);
						},
						label: label(path),
						title: path,
					};
				},
			};
		}

		// ── plugin body ────────────────────────────────────────────────────────

		const inject = ["slots", "locale", "conversationEvents", "remote"];

		async function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.conversationEvents.register(turnFilediffDefinition);
			ctx.effect(
				() => ctx.locale.register(NS, { zh, en }),
				"turn-filediff: dictionaries",
			);
			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-turn-filediff";
				tag.textContent = css;
				document.head.appendChild(tag);
				return () => tag.remove();
			}, "turn-filediff: styles");

			// Mount the Host Remote before the tail can be clicked. The mount is
			// owned by this plugin's fiber, so stop/update withdraws it too.
			await ctx.remote.$mount(TYPERT_REMOTE);

			ctx.slots.inject("conversation.chat.turnTail", () =>
				ctx.slots.register(
					{
						name: "conversation.chat.turnTail",
						select: selectTurnFilediff,
						locale: NS,
						inject: () => ({
							openEditor: async (path, line) => {
								const namespace = ctx.get("remote.turnFilediff");
								if (namespace === undefined) {
									console.error("[turn-filediff] remote.turnFilediff namespace is not mounted");
									return false;
								}
								try {
									const result = await namespace.openFile({ path, line });
									if (result.ok !== true) {
										console.error("[turn-filediff] openFile failed:", result);
									}
									return result.ok === true && result.value?.opened === true;
								} catch (error) {
									console.error("[turn-filediff] openFile threw:", error);
									return false;
								}
							},
							openDiff: async (path, diffs) => {
								const namespace = ctx.get("remote.turnFilediff");
								if (namespace === undefined) {
									console.error("[turn-filediff] remote.turnFilediff namespace is not mounted");
									return false;
								}
								try {
									const result = await namespace.openDiff({ path, diffs });
									if (result.ok !== true) {
										console.error("[turn-filediff] openDiff failed:", result);
									}
									return result.ok === true && result.value?.opened === true;
								} catch (error) {
									console.error("[turn-filediff] openDiff threw:", error);
									return false;
								}
							},
						}),
					},
					TurnFilediffBar,
				),
			);

			// Replace ui-deliverables' inline file-mention resolver with one over
			// this plugin's modified-file vocabulary.
			ctx.provide("chatFileMentions", {
				forClosing(owner) {
					const data = selectTurnFilediff(owner);
					if (data === null) return void 0;
					return producedFileMentions(
						data.files.map((file) => file.path),
						owner.openFile,
						(path) => t("file.open", { name: path }),
					);
				},
			});
		}

		exports.TurnFilediffBar = TurnFilediffBar;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
