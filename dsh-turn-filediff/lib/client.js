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
		const revertedResultSchema = {
			parse(value) {
				if (typeof value !== "object" || value === null || Array.isArray(value)) {
					throw new Error("expected an object");
				}
				if (typeof value.reverted !== "boolean") {
					throw new Error("expected a boolean `reverted`");
				}
				return { reverted: value.reverted };
			},
		};
		const revertRequestSchema = {
			parse(value) {
				if (typeof value !== "object" || value === null || Array.isArray(value)) {
					throw new Error("expected an object");
				}
				const path = stringSchema.parse(value.path);
				const hunk = fileDiffSchema.parse(value.hunk);
				return { path, hunk };
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
				{
					id: "dsh-turn-filediff#turnFilediff/revert",
					service: "turnFilediff",
					namespace: "turnFilediff",
					method: "revert",
					invocation: { kind: "direct" },
					parameters: [
						{
							name: "request",
							wire: "request",
							source: "json",
							codec: {
								mode: "strict",
								typeSymbol: "RevertRequest",
								schema: revertRequestSchema,
							},
						},
					],
					result: {
						mode: "strict",
						typeSymbol: "RevertedResult",
						schema: revertedResultSchema,
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

		/**
		 * Derive a turn-wide file state from a context's raw matches.
		 *
		 * The conversation window can begin inside a turn (no `turn/start` in the
		 * loaded page), in which case the engine never calls `start` and the
		 * context state stays undefined. This replay lets `buildLocationData`
		 * still publish the files observed in the loaded window.
		 */
		function stateFromMatches(matches) {
			let state = { turn: undefined, files: new Map(), order: [], calls: new Map() };
			for (const match of matches) {
				const event = match.event;
				if (state.turn === undefined && event.data && event.data.turn !== undefined) {
					state.turn = event.data.turn;
				}
				if (event.type === "tool/call") {
					const calls = new Map(state.calls);
					calls.set(String(event.data.callId), null);
					state = { ...state, calls };
				} else if (event.type === "tool/result" && isAppendSurfaceEvent(event)) {
					const meta = event.data.meta;
					const diffs = meta && Array.isArray(meta.diffs) ? meta.diffs : null;
					if (diffs == null || diffs.length === 0) continue;
					const files = new Map(state.files);
					const order = [...state.order];
					for (const diff of diffs) {
						if (diff == null || typeof diff.path !== "string") continue;
						applyDiffToFiles(files, order, diff, event.seq);
					}
					state = { ...state, files, order };
				}
			}
			return state.turn === undefined ? undefined : state;
		}

		const turnFilediffDefinition = {
			kind: "turnFilediff",
			match: (event) => {
				if (event.type === "turn/start") {
					return { id: String(event.data.turn), role: "start" };
				}
				// Track the call-time render intent too: the result view can be
				// absent (e.g. an edit whose applied metadata did not carry a
				// replay-safe diff), but the call view still describes the file.
				if (event.type === "tool/call") {
					return { id: String(event.data.turn), role: "update" };
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
					calls: new Map(),
				};
			},
			update: (context, match) => {
				if (match.event.type === "tool/call") {
					const calls = new Map(context.state.calls ?? []);
					calls.set(String(match.event.data.callId), null);
					return { ...context.state, calls };
				}
				if (match.event.type !== "tool/result") return context.state;
				const meta = match.event.data.meta;
				const diffs = meta && Array.isArray(meta.diffs) ? meta.diffs : null;
				if (diffs == null || diffs.length === 0) {
					return context.state;
				}
				const files = new Map(context.state.files);
				const order = [...context.state.order];
				for (const diff of diffs) {
					if (diff == null || typeof diff.path !== "string") continue;
					applyDiffToFiles(files, order, diff, match.event.seq);
				}
				return { ...context.state, files, order };
			},
			buildLocationData: (context, scope) => {
				if (scope !== "turn") return null;
				const state = context.state ?? stateFromMatches(context.matches);
				if (state === undefined) return null;
				const files = state.order
					.map((path) => state.files.get(path))
					.filter(Boolean);
				// Publish even an empty list so the latest turn can clear a
				// previously published conversation summary (e.g. a temporary
				// file was created and then deleted).
				return {
					kind: "turn",
					turn: state.turn,
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
			if (data == null || !Array.isArray(data.files)) return null;
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

		/** Whether a path is absolute on Windows/POSIX. */
		function isAbsolutePath(path) {
			return /^[A-Za-z]:[\\/]/.test(path) || /^[\\/]/.test(path);
		}

		/** Resolve a relative path against the session workspace cwd. */
		function resolveToAbsolute(cwd, path) {
			if (isAbsolutePath(path)) return path;
			if (cwd === undefined || cwd === "") return path;
			return cwd.replace(/[\\/]+$/, "") + "/" + path.replace(/^[\\/]+/, "");
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
			root: {
				display: "block",
				width: "calc(100% - 2 * var(--dsh-composer-side-clearance, 16px) - 4 * var(--dsh-composer-dock-inset, 8px))",
				maxWidth: "calc(var(--dsh-composer-card-max-width, 780px) - 4 * var(--dsh-composer-dock-inset, 8px))",
				margin: "0 auto",
				boxSizing: "border-box",
				padding: "4px 8px",
				background: "var(--dsw-alias-bg-layer-1, #ffffff)",
				border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))",
				borderRadius: 8,
				fontSize: 13,
				lineHeight: "20px",
				color: "var(--dsw-alias-label-secondary, #59636e)",
			},
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
				color: "inherit",
				textAlign: "left",
			},
			chevron: {
				display: "inline-block",
				width: 10,
				color: "var(--dsw-alias-label-tertiary, #818b98)",
			},
			added: { color: "#2ea043", fontWeight: 600 },
			deleted: { color: "#d1242f", fontWeight: 600 },
			modified: { color: "#9a6700", fontWeight: 600 },
			list: {
				listStyle: "none",
				margin: "4px 0 0",
				padding: "4px 0 0",
				borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))",
				display: "flex",
				flexDirection: "column",
				gap: 2,
				maxHeight: "min(320px, 40vh)",
				overflowY: "auto",
				overscrollBehavior: "contain",
			},
			fileListItem: {
				flexShrink: 0,
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
			fileToggle: {
				appearance: "none",
				background: "transparent",
				border: "none",
				padding: "1px 2px",
				margin: 0,
				cursor: "pointer",
				color: "var(--dsw-alias-label-tertiary, #818b98)",
				font: "inherit",
				width: 14,
				flexShrink: 0,
			},
			reviewList: {
				display: "flex",
				flexDirection: "column",
				gap: 6,
				padding: "2px 0 6px 22px",
			},
			hunk: {
				border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))",
				borderRadius: 6,
				background: "var(--dsw-alias-markdown-code-block, #f6f8fa)",
				overflow: "hidden",
			},
			hunkBody: {
				padding: "6px 10px",
				font: "var(--dsw-font-markdown-code-block, inherit)",
				fontSize: 12,
				lineHeight: "20px",
				overflowX: "auto",
				overflowY: "hidden",
			},
			hunkLine: {
				minHeight: 20,
				whiteSpace: "pre",
			},
			hunkActions: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "3px 8px",
				borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))",
			},
			hunkStats: {
				color: "var(--dsw-alias-label-tertiary, #818b98)",
				fontSize: 12,
			},
			reviewBtn: {
				appearance: "none",
				background: "transparent",
				border: "none",
				borderRadius: 6,
				padding: "1px 8px",
				font: "inherit",
				fontSize: 12,
				cursor: "pointer",
			},
			acceptedBadge: { color: "#2ea043", fontSize: 12, fontWeight: 600 },
			rejectedBadge: { color: "#d1242f", fontSize: 12, fontWeight: 600 },
		};

		/**
		 * One hunk's inline review surface: the removed block (red `-`) and the
		 * added block (green `+`), then an action row with accept/reject. The
		 * line/terminator rules and color tokens mirror the shipped DiffBlock so
		 * the review reads as one family with the tool card.
		 */
		function ReviewHunk({ hunk, state, onAccept, onReject, t }) {
			const oldLines = hunk.oldText === null ? [] : splitLines(hunk.oldText);
			const newLines = splitLines(hunk.newText);
			const rows = [];
			for (const line of oldLines) rows.push({ kind: "del", text: line });
			for (const line of newLines) rows.push({ kind: "add", text: line });
			return React.createElement(
				"div",
				{ className: "tdf-hunk", style: styles.hunk },
				React.createElement(
					"div",
					{ className: "tdf-hunk-body", style: styles.hunkBody },
					rows.map((row, index) =>
						React.createElement(
							"div",
							{
								key: index,
								className: row.kind === "del" ? "tdf-del" : "tdf-add",
								style: styles.hunkLine,
							},
							row.text,
						),
					),
				),
				React.createElement(
					"div",
					{ className: "tdf-hunk-actions", style: styles.hunkActions },
					React.createElement(
						"span",
						{ style: styles.hunkStats },
						"+" + newLines.length + " -" + oldLines.length,
					),
					state === "accepted" &&
						React.createElement("span", { style: styles.acceptedBadge }, t("hunk.accepted")),
					state === "rejected" &&
						React.createElement("span", { style: styles.rejectedBadge }, t("hunk.rejected")),
					React.createElement("span", { style: styles.spacer }),
					state === undefined &&
						React.createElement(
							"button",
							{
								type: "button",
								className: "tdf-review-btn tdf-accept",
								style: styles.reviewBtn,
								onClick: onAccept,
							},
							t("hunk.accept"),
						),
					state === undefined &&
						React.createElement(
							"button",
							{
								type: "button",
								className: "tdf-review-btn tdf-reject",
								style: styles.reviewBtn,
								onClick: onReject,
							},
							t("hunk.reject"),
						),
				),
			);
		}

		/** Collapsible vertical file list mounted above the chat input. */
		function TurnFilediffBar({ useChat, fallbackOpenFile, openEditor, openDiff, revert, t }) {
			if (typeof useChat !== "function") {
				console.error("[turn-filediff] taskbar missing useChat prop");
				return null;
			}
			const [expanded, setExpanded] = React.useState(false);
			const [expandedPath, setExpandedPath] = React.useState(null);
			const [reviews, setReviews] = React.useState({});
			// Select the published turnFilediff value itself, not the timeline
			// object: the timeline reference is stable while the location data
			// store mutates in place, so selecting `timeline` would never
			// re-render when a new file-change summary is published.
			const data = useChat((chat) => latestTurnFilediff(chat && chat.timeline));
			const matched = React.useMemo(
				() => summarizeData(data, Number.POSITIVE_INFINITY),
				[data],
			);
			if (matched === null) return null;
			const { files, count, addedCount, deletedCount, modifiedCount } = matched;
			return React.createElement(
				"div",
				{ style: styles.root, className: "tdf-root" },
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
						t("bar.conversation", { count: String(count) }),
					),
					addedCount > 0 &&
						React.createElement(
							"span",
							{ style: styles.added },
							t("bar.added", { count: String(addedCount) }),
						),
					deletedCount > 0 &&
						React.createElement(
							"span",
							{ style: styles.deleted },
							t("bar.deleted", { count: String(deletedCount) }),
						),
					modifiedCount > 0 &&
						React.createElement(
							"span",
							{ style: styles.modified },
							t("bar.modified", { count: String(modifiedCount) }),
						),
				),
				expanded &&
					React.createElement(
						"ul",
						{ style: styles.list, className: "tdf-list" },
						files.map((file) => {
							const isOpen = expandedPath === file.path;
							const fileReviews = reviews[file.path] ?? {};
							return React.createElement(
								"li",
								{ key: file.path, style: styles.fileListItem },
								React.createElement(
									"div",
									{ style: styles.fileItem, className: "tdf-file" },
									React.createElement(
										"button",
										{
											type: "button",
											className: "tdf-file-toggle",
											style: styles.fileToggle,
											"aria-expanded": isOpen,
											"aria-label": t("file.review"),
											onClick: () => setExpandedPath(isOpen ? null : file.path),
										},
										isOpen ? "▾" : "▸",
									),
									React.createElement(
										"span",
										{
											style: styles[STATUS_STYLE[file.status] || "modified"],
											title: file.path,
										},
										statusLabel(file, t),
									),
									React.createElement(
										"span",
										{ style: styles.filePath, title: file.path },
										basename(file.path),
									),
									React.createElement("span", { style: styles.added }, "+" + file.added),
									React.createElement("span", { style: styles.deleted }, "-" + file.removed),
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
												if (!opened && typeof fallbackOpenFile === "function") {
													await fallbackOpenFile(file.path);
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
								isOpen &&
									React.createElement(
										"div",
										{ style: styles.reviewList, className: "tdf-review" },
										file.diffs.map((hunk, index) =>
											React.createElement(
												ReviewHunk,
												{
													key: index,
													hunk,
													state: fileReviews[index],
													t,
													onAccept: () =>
														setReviews((prev) => ({
															...prev,
															[file.path]: {
																...(prev[file.path] ?? {}),
																[index]: "accepted",
															},
														})),
													onReject: async () => {
														const reverted =
															typeof revert === "function"
																? await revert(file.path, hunk)
																: false;
														if (reverted) {
															setReviews((prev) => ({
																...prev,
																[file.path]: {
																	...(prev[file.path] ?? {}),
																	[index]: "rejected",
																},
															}));
														} else {
															console.error(
																"[turn-filediff] revert did not apply:",
																file.path,
															);
														}
													},
												},
											),
										),
									),
							);
						}),
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
			"file.review": "展开/收起该文件的逐条审阅",
			"hunk.accept": "接受",
			"hunk.reject": "拒绝",
			"hunk.accepted": "已接受",
			"hunk.rejected": "已撤销",
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
			"file.review": "Expand/collapse per-hunk review for this file",
			"hunk.accept": "Accept",
			"hunk.reject": "Reject",
			"hunk.accepted": "Accepted",
			"hunk.rejected": "Reverted",
		};

		const css = `
.tdf-bar:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.04)); }
.tdf-file:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.04)); }
.tdf-action:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.04)); color: var(--dsw-alias-label-primary, #1f2328); }
.tdf-bar:focus-visible, .tdf-file:focus-visible, .tdf-action:focus-visible {
  box-shadow: inset 0 0 0 2px var(--dsw-alias-border-l3, #818b98);
  outline: none;
}
.tdf-del { color: var(--dsw-alias-state-error-primary, #d1242f); }
.tdf-del::before { content: '- '; color: var(--dsw-alias-state-error-primary, #d1242f); }
.tdf-add { color: var(--dsw-alias-state-success-primary, #2ea043); }
.tdf-add::before { content: '+ '; color: var(--dsw-alias-state-success-primary, #2ea043); }
.tdf-accept { color: #2ea043; }
.tdf-reject { color: #d1242f; }
.tdf-review-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.04)); }
.tdf-file-toggle:hover { color: var(--dsw-alias-label-primary, #1f2328); }
.tdf-file-toggle:focus-visible, .tdf-review-btn:focus-visible {
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

		const inject = ["slots", "locale", "uiConversation", "remote"];

		async function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.uiConversation.events.register(turnFilediffDefinition);
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
			// owned by this plugin's fiber, so stop/update withdraws it too. A mount
			// failure must not take the whole UI down: the list can still render,
			// and Open/Diff will report the missing namespace in the console.
			try {
				await ctx.remote.$mount(TYPERT_REMOTE);
			} catch (error) {
				console.error("[turn-filediff] remote mount failed (UI stays active):", error);
			}

			const currentCwd = () => {
				try {
					const sessions = ctx.get("sessions");
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
			const openFileFallback = async (path) => {
				const absolute = resolveToAbsolute(currentCwd(), path);
				try {
					const workspaces = ctx.get("workspaces");
					if (workspaces !== undefined && typeof workspaces.openPath === "function") {
						await workspaces.openPath(absolute);
						return true;
					}
				} catch (error) {
					console.error("[turn-filediff] openPath fallback threw:", error);
				}
				return false;
			};

			ctx.slots.inject("conversation.input.dock", () =>
				ctx.slots.register(
					{
						name: "conversation.input.dock",
						id: "dsh-turn-filediff",
						order: 10,
						locale: NS,
						inject: () => ({
							fallbackOpenFile: openFileFallback,
							openEditor: async (path, line) => {
								const namespace = ctx.get("remote.turnFilediff");
								if (namespace === undefined) {
									console.error("[turn-filediff] remote.turnFilediff namespace is not mounted");
									return false;
								}
								try {
									const absolute = resolveToAbsolute(currentCwd(), path);
									const result = await namespace.openFile({ path: absolute, line });
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
									return openFileFallback(path);
								}
								try {
									const absolute = resolveToAbsolute(currentCwd(), path);
									const result = await namespace.openDiff({ path: absolute, diffs });
									if (result.ok === true && result.value?.opened === true) {
										return true;
									}
									console.error("[turn-filediff] openDiff failed:", result);
								} catch (error) {
									console.error("[turn-filediff] openDiff threw:", error);
								}
								return openFileFallback(path);
							},
							revert: async (path, hunk) => {
								const namespace = ctx.get("remote.turnFilediff");
								if (namespace === undefined) {
									console.error("[turn-filediff] remote.turnFilediff namespace is not mounted");
									return false;
								}
								try {
									const absolute = resolveToAbsolute(currentCwd(), path);
									const result = await namespace.revert({ path: absolute, hunk });
									if (result.ok !== true) {
										console.error("[turn-filediff] revert failed:", result);
									}
									return result.ok === true && result.value?.reverted === true;
								} catch (error) {
									console.error("[turn-filediff] revert threw:", error);
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
