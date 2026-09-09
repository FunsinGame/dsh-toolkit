/**
 * dsh-turn-filediff — Host half.
 *
 * Registers the `turnFilediff` Typert Remote service with two methods:
 * - `openFile`  — open a file at a 1-based line in an external editor
 *                 (default VS Code via `code --goto path:line`). When the
 *                 harness is embedded in VS Code (`DSH_VSCODE=1`), it asks
 *                 the extension host to open the file in the current window
 *                 through the `DSH_VSCODE_BRIDGE` endpoint instead.
 * - `openDiff`  — show a file's conversation-level change in VS Code's diff
 *                 view by writing the before/after text to temporary files and
 *                 running `code --diff before after`, or by asking the
 *                 extension host to open the diff in the current window when
 *                 embedded.
 *
 * The strict invocation descriptors live in ./typert.host.js and are
 * discovered automatically by the typert-loader.
 */
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, isAbsolute, join, resolve } from "node:path";

const DEFAULT_EDITOR = "code";

const VSCODE_BRIDGE_ENV = "DSH_VSCODE_BRIDGE";
const VSCODE_BRIDGE_TOKEN_ENV = "DSH_VSCODE_BRIDGE_TOKEN";

/**
 * POST a JSON body to the VS Code extension bridge over plain HTTP.
 * @param base - bridge base URL from `DSH_VSCODE_BRIDGE`.
 * @param method - bridge endpoint name (`open-file` or `open-diff`).
 * @param body - JSON-serializable request body.
 * @param token - bearer token from `DSH_VSCODE_BRIDGE_TOKEN`.
 * @returns the parsed JSON response.
 */
function postVscodeBridge(base, method, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base.replace(/\/+$/, "")}/${method}`);
    const payload = JSON.stringify(body);
    const req = httpRequest(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        timeout: 5000,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`bridge returned HTTP ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("bridge request timed out")));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Call the VS Code extension bridge when the harness is embedded.
 * @param method - bridge endpoint name (`open-file` or `open-diff`).
 * @param body - JSON request body.
 * @returns `true`/`false` when the bridge responded, or `null` when no bridge is configured or it failed.
 */
async function callVscodeBridge(method, body) {
  const base = process.env[VSCODE_BRIDGE_ENV];
  const token = process.env[VSCODE_BRIDGE_TOKEN_ENV];
  if (!base) {
    console.log(`[turn-filediff] vscode bridge not configured (${VSCODE_BRIDGE_ENV} missing)`);
    return null;
  }
  const bodySummary = Object.fromEntries(
    Object.entries(body).map(([key, value]) =>
      typeof value === "string" ? [key, `${value.length} chars`] : [key, value],
    ),
  );
  console.log(`[turn-filediff] vscode bridge -> ${method}`, JSON.stringify(bodySummary));
  try {
    const data = await postVscodeBridge(base, method, body, token);
    const opened = data && typeof data.opened === "boolean" ? data.opened : null;
    console.log(`[turn-filediff] vscode bridge <- ${method}`, JSON.stringify({ opened, raw: data }));
    return opened;
  } catch (error) {
    console.error(`[turn-filediff] vscode bridge error (${method}):`, error);
    return null;
  }
}

/** Replaces ui-deliverables' model guidance (same section name/order). */
const FILE_REFERENCE_PROMPT =
  "When you successfully create or modify files, mention the primary outputs in your final response. To make those and any other changed-file references clickable in Web, format them as Markdown inline code using the exact file-tool path, or a basename when unique among the files changed in this conversation.";

/**
 * Quote one Windows shell token when it contains whitespace or a quote.
 * @param value - the argument to quote.
 * @returns the argument, double-quoted only when necessary.
 */
function winQuote(value) {
  if (!/[\s"]/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

/**
 * Resolve an editor command to a concrete executable path when possible.
 *
 * A bare `code` often means `code.cmd` on Windows, and the DSH server process
 * may not inherit the interactive shell's PATH, so this walks the standard
 * resolution order: a path-like editor is used as-is, then `where`, then the
 * well-known VS Code install locations.
 *
 * @param editor - editor command from the row config / environment.
 * @returns a concrete executable path, or null when it cannot be resolved.
 */
function resolveEditor(editor) {
  // A path-like editor is used directly when the file exists.
  if (/[\\/]/.test(editor)) {
    return existsSync(editor) ? editor : null;
  }
  if (process.platform !== "win32") return editor;

  // Resolve a bare command (e.g. `code`) through `where`.
  for (const name of [editor, `${editor}.cmd`, `${editor}.exe`]) {
    try {
      const result = spawnSync("where", [name], { encoding: "utf8" });
      if (result.status === 0) {
        const first = String(result.stdout || "")
          .split(/\r?\n/)
          .map((s) => s.trim())
          .find(Boolean);
        if (first) return first;
      }
    } catch (error) {
      // fall through to the next candidate
    }
  }

  // Only substitute the well-known VS Code location for the default `code`
  // command; a custom editor name that is not on PATH must not silently become
  // VS Code.
  if (editor !== "code") return null;
  const local = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  const known = [
    local ? join(local, "Programs", "Microsoft VS Code", "bin", "code.cmd") : null,
    local ? join(local, "Programs", "Microsoft VS Code", "Code.exe") : null,
    programFiles ? join(programFiles, "Microsoft VS Code", "Code.exe") : null,
    programFilesX86 ? join(programFilesX86, "Microsoft VS Code", "Code.exe") : null,
  ].filter(Boolean);
  for (const path of known) {
    if (existsSync(path)) return path;
  }
  // Could not resolve the editor on Windows; signal failure so the caller can
  // fall back instead of spawning a shell that would report a false success.
  return null;
}

/**
 * Launch the configured editor with the given argument list.
 * @param editor - editor command (e.g. `code`).
 * @param args - command-line arguments (without the editor name).
 * @returns true when the child process spawned without an immediate error.
 */
function launchEditor(editor, args) {
  return new Promise((resolve) => {
    const options = { detached: true, stdio: "ignore", windowsHide: true };
    const resolved = resolveEditor(editor);
    if (resolved === null) {
      console.error(
        `[turn-filediff] editor "${editor}" could not be resolved on this machine`,
      );
      resolve(false);
      return;
    }
    let child;
    try {
      if (process.platform === "win32" && /\.exe$/i.test(resolved)) {
        // A real executable: spawn directly, no shell quoting hazards.
        child = spawn(resolved, args, options);
      } else if (process.platform === "win32") {
        // `code.cmd` (a batch file) must run through the shell.
        child = spawn(`${winQuote(resolved)} ${args.map(winQuote).join(" ")}`, {
          ...options,
          shell: true,
        });
      } else {
        child = spawn(resolved, args, options);
      }
    } catch (error) {
      resolve(false);
      return;
    }
    child.once("error", () => resolve(false));
    child.once("spawn", () => {
      try {
        child.unref();
      } catch (error) {
        // unref is best-effort; the detached editor already outlives the host.
      }
      resolve(true);
    });
  });
}

/**
 * Split LF-normalized text into lines without a trailing empty element.
 * @param text - the text to split.
 * @returns content lines.
 */
function splitLines(text) {
  const lines = String(text).split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Replace the first occurrence of a line sequence in LF-normalized text.
 * This is the fallback matcher for hunks whose exact string is not found
 * directly (e.g. minor newline normalization differences).
 * @param text - LF-normalized full text.
 * @param needle - LF-normalized hunk `newText`.
 * @param replacement - LF-normalized hunk `oldText`.
 * @returns the replaced text, or null when the sequence does not match.
 */
function replaceFirstLineSequence(text, needle, replacement) {
  const lines = text.split("\n");
  const needleLines = splitLines(needle);
  const replacementLines = splitLines(replacement);
  if (needleLines.length === 0) return text;
  for (let i = 0; i + needleLines.length <= lines.length; i++) {
    let matches = true;
    for (let j = 0; j < needleLines.length; j++) {
      if (lines[i + j] !== needleLines[j]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    return [
      ...lines.slice(0, i),
      ...replacementLines,
      ...lines.slice(i + needleLines.length),
    ].join("\n");
  }
  return null;
}

/**
 * Find the first line-aligned occurrence of `needle` in LF-normalized text.
 * A hunk is a sequence of complete lines, so a match that starts or ends in
 * the middle of a line must not be treated as the hunk location.
 * @param text - LF-normalized full text.
 * @param needle - LF-normalized hunk `newText`.
 * @returns the start index, or -1 when no line-aligned match exists.
 */
function findLineAlignedNeedle(text, needle) {
  if (needle.length === 0) {
    return text.length === 0 ? 0 : -1;
  }
  let from = 0;
  while (true) {
    const index = text.indexOf(needle, from);
    if (index === -1) return -1;
    const beforeOk = index === 0 || text[index - 1] === "\n";
    const after = index + needle.length;
    const afterOk = after === text.length || text[after] === "\n";
    if (beforeOk && afterOk) return index;
    from = index + 1;
  }
}

/**
 * Reverse-apply one applied hunk to the file text that exists after it.
 * `oldText === null` means the hunk created the file, so the prior content is
 * empty. Returns null when the hunk no longer matches the reconstructed text.
 * @param text - LF-normalized full text after this hunk (and all later hunks).
 * @param hunk - `{ oldText: string | null, newText: string }`.
 * @returns the full text before this hunk, or null on mismatch.
 */
function reverseHunk(text, hunk) {
  if (hunk == null || typeof hunk.newText !== "string") return text;
  if (hunk.oldText === null) return "";
  if (typeof hunk.oldText !== "string") return text;
  const needle = hunk.newText.replace(/\r\n/g, "\n");
  const replacement = hunk.oldText.replace(/\r\n/g, "\n");
  const direct = findLineAlignedNeedle(text, needle);
  if (direct !== -1) {
    return text.slice(0, direct) + replacement + text.slice(direct + needle.length);
  }
  return replaceFirstLineSequence(text, needle, replacement);
}

/**
 * Reconstruct the pre-conversation full text of a file by reverse-applying the
 * ordered hunks to the file's current content. The collected hunks are
 * contextual `FileDiff` snippets, not whole files, so this is what lets the VS
 * Code diff show every change in the conversation instead of only the last hunk.
 * @param filePath - absolute path of the changed file.
 * @param diffs - ordered applied hunks for this file.
 * @param currentText - optional LF-normalized current content; when omitted the
 * file is read from disk. Pass `""` for a deleted file that no longer exists.
 * @returns LF-normalized `{ oldText, newText }` full-file snapshots.
 */
async function reconstructBeforeText(filePath, diffs, currentText = null) {
  const current = currentText === null
    ? (await readFile(filePath, "utf8"))
        .replace(/^\uFEFF/, "")
        .replace(/\r\n/g, "\n")
    : currentText;
  let text = current;
  for (let i = diffs.length - 1; i >= 0; i--) {
    const hunk = diffs[i];
    if (hunk == null) continue;
    if (hunk.oldText === null) {
      // `oldText: null` is a whole-file create/fallback hunk. Only the first
      // recorded hunk can be a true create (prior content empty); later null
      // hunks are no-op overwrite fallbacks and must not erase earlier edits.
      if (i === 0) text = "";
      continue;
    }
    const next = reverseHunk(text, hunk);
    if (next === null) {
      throw new Error(
        `cannot reconstruct pre-diff content for ${filePath}: hunk ${i} no longer matches`,
      );
    }
    text = next;
  }
  return { oldText: text, newText: current };
}

/**
 * Best-effort reconstruction for files whose current content no longer matches
 * the accumulated hunks exactly (duplicate hunks, overlapping edits, or
 * unobserved shell modifications). Unmatched hunks are skipped instead of
 * aborting, so a diff can still open; the result is approximate when a skip
 * occurred.
 * @param filePath - absolute path of the changed file.
 * @param diffs - ordered applied hunks for this file.
 * @param currentText - LF-normalized current content ("" for a missing file).
 * @returns LF-normalized `{ oldText, newText, skipped }` snapshots.
 */
function reconstructBeforeTextBestEffort(filePath, diffs, currentText) {
  let text = currentText;
  let skipped = 0;
  for (let i = diffs.length - 1; i >= 0; i--) {
    const hunk = diffs[i];
    if (hunk == null) continue;
    if (hunk.oldText === null) {
      // `oldText: null` is a whole-file create/fallback hunk. Only the first
      // recorded hunk can be a true create (prior content empty); later null
      // hunks are no-op overwrite fallbacks and must not erase earlier edits.
      if (i === 0) text = "";
      continue;
    }
    const next = reverseHunk(text, hunk);
    if (next === null) {
      skipped++;
    } else {
      text = next;
    }
  }
  return { oldText: text, newText: currentText, skipped };
}

/**
 * Write a file's before/after text to a fresh temp directory for VS Code's
 * `--diff`. The temp files are intentionally not deleted (VS Code reads them
 * when it opens the diff; the OS temp cleaner reaps the directory later).
 * @param filePath - the original path (for basename/extension of the temp files).
 * @param oldText - prior content (empty string for a new file).
 * @param newText - content after the change.
 * @returns the two temp file paths.
 */
async function writeDiffTemp(filePath, oldText, newText) {
  const dir = await mkdtemp(join(tmpdir(), "dsh-turn-filediff-"));
  const ext = extname(filePath);
  const base = basename(filePath, ext);
  const oldPath = join(dir, `${base}.old${ext}`);
  const newPath = join(dir, `${base}.new${ext}`);
  await writeFile(oldPath, oldText, "utf8");
  await writeFile(newPath, newText, "utf8");
  return { oldPath, newPath };
}

/**
 * Resolve a path against the current workspace cwd if it is relative.
 * @param targetPath - relative or absolute file path.
 * @returns absolute file path.
 */
function resolveWorkspacePath(targetPath) {
  if (typeof targetPath !== "string" || targetPath.length === 0) return targetPath;
  if (isAbsolute(targetPath)) return targetPath;
  return resolve(process.cwd(), targetPath);
}

/**
 * Remote service exposing the external-editor handoff to the browser.
 */
export class TurnFilediffGateway extends TypertRemoteService {
  /**
   * @param ctx - host Cordis context.
   * @param config - row config; `editor` overrides the default editor command.
   */
  constructor(ctx, config = {}) {
    super(ctx, "turnFilediff");
    this.editor =
      (config && config.editor) ||
      process.env.DSH_TURN_FILEDIFF_EDITOR ||
      DEFAULT_EDITOR;

    // Register the model guidance the browser half's clickable-file references
    // rely on, replacing the same section ui-deliverables previously owned.
    ctx.inject(["systemPrompt"], (scope) => {
      scope.systemPrompt.section({
        name: "ui:deliverable-file-references",
        order: 190,
        text: FILE_REFERENCE_PROMPT,
      });
    });
  }

  /**
   * Open one file in the external editor, at an optional line.
   * @param request - `{ path: string, line?: number }`.
   * @returns `{ opened: boolean }`.
   */
  async openFile(request) {
    const rawPath = request && request.path;
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      console.warn(`[turn-filediff] openFile rejected: missing path`);
      return { opened: false };
    }
    const path = resolveWorkspacePath(rawPath);
    const line = request && request.line;
    console.log(
      `[turn-filediff] openFile request`,
      JSON.stringify({
        path,
        line: line ?? null,
        embedded: process.env.DSH_VSCODE === "1",
        editor: this.editor,
      }),
    );
    if (process.env.DSH_VSCODE === "1") {
      const opened = await callVscodeBridge("open-file", { path, line });
      console.log(`[turn-filediff] openFile bridge result`, JSON.stringify({ opened }));
      if (opened !== null) return { opened };
    }
    const target =
      line != null && Number.isInteger(line) && line > 0
        ? `${path}:${line}`
        : path;
    const opened = await launchEditor(this.editor, ["--goto", target]);
    console.log(`[turn-filediff] openFile external editor result`, JSON.stringify({ opened, target }));
    return { opened };
  }

  /**
   * Show a file change in the editor's diff view.
   *
   * The browser sends the ordered `FileDiff` hunks it accumulated for the file
   * (each a contextual snippet, not a whole file). This method reads the file's
   * current content and reverse-applies the hunks to reconstruct the full
   * pre-conversation text, so VS Code's diff shows every change in the
   * conversation instead of only the last hunk. Deleted files are treated as
   * empty current content. The legacy `{ oldText, newText }` request shape is
   * also accepted for older persisted summaries.
   * @param request - `{ path, diffs }` or `{ path, oldText, newText }`.
   * @returns `{ opened: boolean }`.
   */
  async openDiff(request) {
    const rawPath = request && request.path;
    const diffs = request && request.diffs;
    const legacyOldText = request && request.oldText;
    const legacyNewText = request && request.newText;
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      console.warn(`[turn-filediff] openDiff rejected: missing path`);
      return { opened: false };
    }
    const path = resolveWorkspacePath(rawPath);
    console.log(
      `[turn-filediff] openDiff request`,
      JSON.stringify({
        path,
        diffs: Array.isArray(diffs) ? diffs.length : 0,
        legacy: typeof legacyOldText === "string" && typeof legacyNewText === "string",
        embedded: process.env.DSH_VSCODE === "1",
        editor: this.editor,
      }),
    );
    let oldText;
    let newText;
    try {
      if (Array.isArray(diffs) && diffs.length > 0) {
        if (
          !diffs.every(
            (diff) =>
              diff != null &&
              typeof diff.newText === "string" &&
              (diff.oldText === null || typeof diff.oldText === "string"),
          )
        ) {
          console.warn(`[turn-filediff] openDiff rejected: invalid diffs`);
          return { opened: false };
        }
        let currentText;
        try {
          currentText = (await readFile(path, "utf8"))
            .replace(/^\uFEFF/, "")
            .replace(/\r\n/g, "\n");
        } catch (error) {
          if (error && error.code === "ENOENT") {
            // The file was deleted during the conversation; diff against empty.
            currentText = "";
          } else {
            throw error;
          }
        }
        let reconstructed;
        try {
          reconstructed = await reconstructBeforeText(path, diffs, currentText);
          oldText = reconstructed.oldText;
          newText = reconstructed.newText;
          console.log(
            `[turn-filediff] openDiff reconstructed full snapshots`,
            JSON.stringify({ oldLength: oldText.length, newLength: newText.length }),
          );
        } catch (error) {
          console.warn(
            `[turn-filediff] openDiff strict reconstruction failed; using best-effort:`,
            error,
          );
          reconstructed = reconstructBeforeTextBestEffort(path, diffs, currentText);
          oldText = reconstructed.oldText;
          newText = reconstructed.newText;
          console.log(
            `[turn-filediff] openDiff best-effort reconstructed snapshots`,
            JSON.stringify({ oldLength: oldText.length, newLength: newText.length, skipped: reconstructed.skipped }),
          );
        }
        if (oldText === newText) {
          console.warn(`[turn-filediff] openDiff produced no usable diff; opening file instead`);
          return this.openFile({ path });
        }
      } else if (typeof legacyOldText === "string" && typeof legacyNewText === "string") {
        oldText = legacyOldText;
        newText = legacyNewText;
        console.log(
          `[turn-filediff] openDiff using legacy snapshots`,
          JSON.stringify({ oldLength: oldText.length, newLength: newText.length }),
        );
      } else {
        console.warn(`[turn-filediff] openDiff rejected: no diffs or legacy snapshots`);
        return { opened: false };
      }
      if (process.env.DSH_VSCODE === "1") {
        const opened = await callVscodeBridge("open-diff", {
          path,
          oldText,
          newText,
        });
        console.log(`[turn-filediff] openDiff bridge result`, JSON.stringify({ opened }));
        if (opened !== null) return { opened };
        console.log(`[turn-filediff] openDiff bridge unavailable/failed, falling back to external editor`);
      }
      const { oldPath, newPath } = await writeDiffTemp(
        path,
        oldText,
        newText,
      );
      const opened = await launchEditor(this.editor, [
        "--diff",
        oldPath,
        newPath,
      ]);
      console.log(`[turn-filediff] openDiff external editor result`, JSON.stringify({ opened, oldPath, newPath }));
      return { opened };
    } catch (error) {
      console.error(`[turn-filediff] openDiff prepare failed:`, error);
      return { opened: false };
    }
  }

  /**
   * Revert one applied hunk on disk (the "reject" of a single suggestion).
   *
   * The browser sends one accumulated hunk (`{ oldText, newText }`); this
   * method reverse-applies it to the file's current content, reusing the same
   * matcher `openDiff` uses so every reverse apply shares one code path.
   * - `oldText === null` — the hunk created the file, so rejecting it removes
   *   the file entirely (any later hunks are moot once the creation is undone).
   * - any other hunk — `newText` is replaced in-place with `oldText`; when the
   *   file is reduced to empty the file is removed, matching this plugin's
   *   "reduced to empty = deleted" rule.
   * @param request - `{ path, hunk: { oldText: string | null, newText: string } }`.
   * @returns `{ reverted: boolean }`.
   */
  async revert(request) {
    const rawPath = request && request.path;
    const hunk = request && request.hunk;
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      console.warn(`[turn-filediff] revert rejected: missing path`);
      return { reverted: false };
    }
    const path = resolveWorkspacePath(rawPath);
    if (
      hunk == null ||
      typeof hunk.newText !== "string" ||
      !(hunk.oldText === null || typeof hunk.oldText === "string")
    ) {
      console.warn(`[turn-filediff] revert rejected: invalid hunk`);
      return { reverted: false };
    }
    console.log(
      `[turn-filediff] revert request`,
      JSON.stringify({
        path,
        oldText: hunk.oldText === null ? null : `${hunk.oldText.length} chars`,
        newText: `${hunk.newText.length} chars`,
      }),
    );
    try {
      if (hunk.oldText === null) {
        await rm(path, { force: true });
        console.log(`[turn-filediff] revert removed created file`, JSON.stringify({ path }));
        return { reverted: true };
      }
      let current;
      try {
        current = (await readFile(path, "utf8"))
          .replace(/^\uFEFF/, "")
          .replace(/\r\n/g, "\n");
      } catch (error) {
        if (error && error.code === "ENOENT") {
          // The file may already be gone; treat it as empty so a deleted file's
          // hunk can still be restored.
          current = "";
        } else {
          throw error;
        }
      }
      const next = reverseHunk(current, hunk);
      if (next === null) {
        console.warn(
          `[turn-filediff] revert failed: hunk no longer matches current content`,
          JSON.stringify({ path }),
        );
        return { reverted: false };
      }
      if (next === "") {
        await rm(path, { force: true });
        console.log(`[turn-filediff] revert reduced file to empty and removed it`, JSON.stringify({ path }));
      } else {
        await writeFile(path, next, "utf8");
        console.log(`[turn-filediff] revert wrote reverted content`, JSON.stringify({ path, length: next.length }));
      }
      return { reverted: true };
    } catch (error) {
      console.error(`[turn-filediff] revert failed:`, error);
      return { reverted: false };
    }
  }
}

export default TurnFilediffGateway;
