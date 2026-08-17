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

		// ── conversation-wide file-modification accumulator ────────────────────

		/** Only count the final (append) surface emission of a tool result. */
		function isAppendSurfaceEvent(event) {
			return event.surfaceOp !== undefined && event.surfaceOp === "append";
		}

		/**
		 * Apply one applied FileDiff hunk to the conversation-wide state.
		 *
		 * The state keeps each touched path in first-seen order and collapses a
		 * path to its final conversation status:
		 * - `added`    — did not exist when the conversation started and still exists;
		 * - `deleted`  — existed when the conversation started and is gone/empty now;
		 * - `modified` — existed before and still exists, but its content changed.
		 * A file that was created and later deleted cancels out and is removed.
		 */
		function applyDiffToFiles(files, order, diff, seq) {
			const stats = diffStats(diff);
			const path = diff.path;
			const hunk = {
				oldText: diff.oldText == null ? null : diff.oldText,
				newText: diff.newText == null ? "" : diff.newText,
			};
			const existing = files.get(path);

			if (existing === undefined) {
				const status = diff.oldText === null
					? "added"
					: diff.newText === ""
						? "deleted"
						: "modified";
				order.push(path);
				files.set(path, {
					path,
					status,
					added: stats.added,
					removed: stats.removed,
					firstLine: stats.firstLine,
					diffs: [hunk],
					seq,
				});
				return;
			}

			if (existing.status === "added" && diff.oldText !== null && diff.newText === "") {
				// Temporary file created earlier in this conversation and deleted
				// later: drop it from the final summary entirely.
				files.delete(path);
				const at = order.indexOf(path);
				if (at !== -1) order.splice(at, 1);
				return;
			}

			let status = existing.status;
			if (existing.status === "deleted") {
				status = diff.oldText !== null && diff.newText === "" ? "deleted" : "modified";
			} else if (existing.status === "modified" && diff.oldText !== null && diff.newText === "") {
				status = "deleted";
			} else if (existing.status !== "added") {
				status = "modified";
			}

			files.set(path, {
				...existing,
				status,
				added: existing.added + stats.added,
				removed: existing.removed + stats.removed,
				firstLine: existing.firstLine != null ? existing.firstLine : stats.firstLine,
				diffs: [...existing.diffs, hunk],
				seq,
			});
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
			start: (_context, match, reader) => {
				if (match.event.type !== "turn/start") {
					throw new Error("turnFilediff start requires turn/start");
				}
				// Carry the previous turn's files forward so the state describes
				// the whole conversation, not just the current turn.
				const previous =
					typeof reader?.previous === "function"
						? reader.previous("turnFilediff")
						: undefined;
				const prevState = previous && previous.state ? previous.state : undefined;
				return {
					turn: match.event.data.turn,
					files: new Map(prevState ? prevState.files : []),
					order: [...(prevState ? prevState.order : [])],
				};
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
					applyDiffToFiles(files, order, diff, match.event.seq);
				}
				return { ...context.state, files, order };
			},
			buildLocationData: (context, scope) => {
				if (scope !== "turn" || context.state === undefined) return null;
				const files = context.state.order
					.map((path) => context.state.files.get(path))
					.filter(Boolean);
				// Publish even an empty list so the latest turn can clear a
				// previously published conversation summary (e.g. a temporary
				// file was created and then deleted).
				return {
					kind: "turn",
					turn: context.state.turn,
					key: "turnFilediff",
					value: { files },
				};
			},
		};

		/** Normalize a stored file record into the current hunk-list shape. */
		function normalizeFileRecord(file) {
			if (file == null) return null;
			let status = file.status;
			if (status !== "added" && status !== "deleted" && status !== "modified") {
				status = file.oldText == null ? "added" : file.newText === "" ? "deleted" : "modified";
			}
			if (Array.isArray(file.diffs) && file.diffs.length > 0) {
				return { ...file, status };
			}
			if (typeof file.oldText === "string" || typeof file.newText === "string") {
				return {
					...file,
					status,
					diffs: [
						{
							oldText: file.oldText == null ? null : file.oldText,
							newText: file.newText == null ? "" : file.newText,
						},
					],
				};
			}
			return null;
		}

		/** Summarize one conversation-wide turn-location value into UI/mention shape. */
		function summarizeData(data, seq) {
			if (data === undefined || !Array.isArray(data.files)) return null;
			const files = data.files
				.filter((file) => file.seq <= seq)
				.map(normalizeFileRecord)
				.filter((file) => file !== null && file.diffs.length > 0);
			if (files.length === 0) return null;
			const count = files.length;
			const totalAdded = files.reduce((sum, file) => sum + file.added, 0);
			const totalRemoved = files.reduce((sum, file) => sum + file.removed, 0);
			const addedCount = files.filter((file) => file.status === "added").length;
			const deletedCount = files.filter((file) => file.status === "deleted").length;
			const modifiedCount = files.filter((file) => file.status === "modified").length;
			return { files, count, totalAdded, totalRemoved, addedCount, deletedCount, modifiedCount };
		}

		/** Summarize one turn-location value (used by closing-message mentions). */
		function selectTurnFilediff(owner) {
			return summarizeData(
				owner.turn.data.get("turnFilediff"),
				owner.seq ?? Number.POSITIVE_INFINITY,
			);
		}

		/** Read the latest published conversation-wide summary from a snapshot. */
		function latestTurnFilediff(timeline) {
			if (timeline == null || !Array.isArray(timeline.turnOrder) || timeline.turns == null) {
				return null;
			}
			const order = [...timeline.turnOrder].sort((left, right) => right - left);
			for (const turnNumber of order) {
				const turn = timeline.turns.get(turnNumber);
				const data = turn && turn.data && turn.data.get("turnFilediff");
				if (data !== undefined) return data;
			}
			return null;
		}

		// ── UI component ───────────────────────────────────────────────────────

		function basename(path) {
			const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
			return at === -1 ? path : path.slice(at + 1);
		}

		const STATUS_COLOR = {
			added: "#2ea043",
			deleted: "#d1242f",
			modified: "#9a6700",
		};

		const STATUS_STYLE = {
			added: "added",
			deleted: "deleted",
			modified: "modified",
		};

		function statusLabel(file, t) {
			if (file.status === "added") return t("file.added");
			if (file.status === "deleted") return t("file.deleted");
			return t("file.modified");
		}

		const styles = {
			taskbar: {
				display: "flex",
				alignItems: "center",
				gap: 6,
				width: "100%",
				maxWidth: "var(--dsh-composer-card-max-width, 780px)",
				margin: "0 auto",
				boxSizing: "border-box",
				padding: "4px 8px",
				overflowX: "auto",
				background: "var(--dsw-alias-surface-raised, rgba(0,0,0,0.03))",
				border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))",
				borderRadius: 8,
				fontSize: 12,
				lineHeight: "20px",
				color: "var(--dsw-alias-label-secondary, #59636e)",
			},
			summary: { flex: "0 0 auto", fontWeight: 600, marginRight: 2, whiteSpace: "nowrap" },
			added: { color: "#2ea043", fontWeight: 600 },
			deleted: { color: "#d1242f", fontWeight: 600 },
			modified: { color: "#9a6700", fontWeight: 600 },
			task: {
				display: "inline-flex",
				alignItems: "center",
				flex: "0 0 auto",
				gap: 2,
				padding: 1,
				borderRadius: 6,
				background: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.04))",
				border: "1px solid transparent",
			},
			taskOpen: {
				appearance: "none",
				display: "inline-flex",
				alignItems: "center",
				gap: 5,
				background: "transparent",
				border: "none",
				borderRadius: 5,
				padding: "1px 6px",
				font: "inherit",
				color: "var(--dsw-alias-label-primary, #1f2328)",
				cursor: "pointer",
				whiteSpace: "nowrap",
			},
			taskDiff: {
				appearance: "none",
				background: "transparent",
				border: "none",
				borderRadius: 5,
				padding: "1px 6px",
				font: "inherit",
				fontSize: 11,
				cursor: "pointer",
				color: "var(--dsw-alias-label-tertiary, #818b98)",
				whiteSpace: "nowrap",
			},
			statusDot: {
				width: 8,
				height: 8,
				borderRadius: 4,
				display: "inline-block",
				flex: "0 0 auto",
			},
			taskName: {
				maxWidth: 180,
				overflow: "hidden",
				textOverflow: "ellipsis",
			},
		};

		/** Taskbar-style file list mounted above the chat input. */
		function TurnFilediffBar({ useSession, openFile, openEditor, openDiff, t }) {
			const timeline = useSession(
				(session) => (session && session.chat && session.chat.timeline) || null,
			);
			const matched = React.useMemo(() => {
				const data = latestTurnFilediff(timeline);
				return summarizeData(data, Number.POSITIVE_INFINITY);
			}, [timeline]);
			if (matched === null) return null;
			const { files, count } = matched;
			return React.createElement(
				"div",
				{ style: styles.taskbar, className: "tdf-taskbar" },
				React.createElement(
					"span",
					{ style: styles.summary, className: "tdf-summary" },
					t("bar.conversation", { count: String(count) }),
				),
				files.map((file) =>
					React.createElement(
						"div",
						{ key: file.path, style: styles.task, className: "tdf-task", title: file.path },
						React.createElement(
							"button",
							{
								type: "button",
								style: styles.taskOpen,
								className: "tdf-task-open",
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
							React.createElement("span", {
								style: {
									...styles.statusDot,
									background: STATUS_COLOR[file.status] || STATUS_COLOR.modified,
								},
							}),
							React.createElement(
								"span",
								{ style: styles.taskName },
								basename(file.path),
							),
							React.createElement(
								"span",
								{ style: styles[STATUS_STYLE[file.status] || "modified"] },
								statusLabel(file, t),
							),
						),
						React.createElement(
							"button",
							{
								type: "button",
								style: styles.taskDiff,
								className: "tdf-task-diff",
								title: t("file.diff"),
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
			);
		}

		// ── locale dictionaries ────────────────────────────────────────────────

		const NS = "turnFilediff";
		const zh = {
			"bar.conversation": "会话文件变更 {count} 个",
			"bar.added": "新增 {count}",
			"bar.deleted": "删除 {count}",
			"bar.modified": "修改 {count}",
			"file.added": "新增",
			"file.deleted": "删除",
			"file.modified": "修改",
			"file.open": "在编辑器中打开 {name}",
			"file.openBtn": "打开",
			"file.diff": "差异",
		};
		const en = {
			"bar.conversation": "{count} conversation file changes",
			"bar.added": "{count} added",
			"bar.deleted": "{count} deleted",
			"bar.modified": "{count} modified",
			"file.added": "Added",
			"file.deleted": "Deleted",
			"file.modified": "Modified",
			"file.open": "Open {name} in editor",
			"file.openBtn": "Open",
			"file.diff": "Diff",
		};

		const css = `
.tdf-taskbar {
  scrollbar-width: thin;
}
.tdf-taskbar::-webkit-scrollbar {
  height: 4px;
}
.tdf-task:hover {
  border-color: var(--dsw-alias-border-l3, #818b98);
}
.tdf-task-open:hover, .tdf-task-diff:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.04));
  color: var(--dsw-alias-label-primary, #1f2328);
}
.tdf-task-open:focus-visible, .tdf-task-diff:focus-visible {
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

		/** Resolve an inline-code token to one of the conversation's changed files. */
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

			// Mount the Host Remote before the taskbar can be clicked. The mount is
			// owned by this plugin's fiber, so stop/update withdraws it too.
			await ctx.remote.$mount(TYPERT_REMOTE);

			ctx.slots.inject("conversation.input.dock", () =>
				ctx.slots.register(
					{
						name: "conversation.input.dock",
						id: "dsh-turn-filediff",
						order: 10,
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
			// this plugin's conversation-wide changed-file vocabulary.
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
