/**
 * dsh-chat-fileref — Host half.
 *
 * Registers the `fileref` Typert Remote service with one method, `openFile`,
 * that opens a file at an optional 1-based line in an external editor
 * (default VS Code via `code --goto path:line`). When the harness is embedded
 * in VS Code (`DSH_VSCODE=1`), it asks the extension host to open the file in
 * the current window through the `DSH_VSCODE_BRIDGE` endpoint instead. The
 * browser half calls this method through the client Remote assembly when a
 * file-reference chip is clicked.
 *
 * The strict invocation descriptor lives in ./typert.host.js and is discovered
 * automatically by the typert-loader (`@deepseek-ai/dsh-typert-loader`), which
 * registers it with `ctx.typert.local` for the API gateway to claim.
 */
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_EDITOR = "code";

const VSCODE_BRIDGE_ENV = "DSH_VSCODE_BRIDGE";
const VSCODE_BRIDGE_TOKEN_ENV = "DSH_VSCODE_BRIDGE_TOKEN";

/**
 * Call the VS Code extension bridge when the harness is embedded.
 * @param method - bridge endpoint name (`open-file` or `open-diff`).
 * @param body - JSON request body.
 * @returns `true`/`false` when the bridge responded, or `null` when no bridge is configured or it failed.
 */
async function callVscodeBridge(method, body) {
  const base = process.env[VSCODE_BRIDGE_ENV];
  if (!base) return null;
  const token = process.env[VSCODE_BRIDGE_TOKEN_ENV];
  try {
    const response = await fetch(`${base.replace(/\/+$/, "")}/${method}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data && typeof data.opened === "boolean" ? data.opened : null;
  } catch (error) {
    return null;
  }
}

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

  // Well-known VS Code install locations.
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
 * Spawn the resolved editor at one file position.
 * @param editor - concrete executable path (or fallback command).
 * @param target - `path` or `path:line` string.
 * @returns true when the child process spawned without an immediate error.
 */
function spawnEditor(editor, target) {
  return new Promise((resolve) => {
    const options = { detached: true, stdio: "ignore", windowsHide: true };
    let child;
    try {
      if (process.platform === "win32" && /\.exe$/i.test(editor)) {
        // A real executable: spawn directly, no shell quoting hazards.
        child = spawn(editor, ["--goto", target], options);
      } else if (process.platform === "win32") {
        // `code.cmd` (a batch file) must run through the shell.
        child = spawn(`${winQuote(editor)} --goto ${winQuote(target)}`, {
          ...options,
          shell: true,
        });
      } else {
        child = spawn(editor, ["--goto", target], options);
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
 * Remote service exposing the external-editor handoff to the browser.
 */
export class FilerefGateway extends TypertRemoteService {
  /**
   * @param ctx - host Cordis context.
   * @param config - row config; `editor` overrides the default editor command.
   */
  constructor(ctx, config = {}) {
    super(ctx, "fileref");
    this.editor =
      (config && config.editor) ||
      process.env.DSH_CHAT_FILEREF_EDITOR ||
      DEFAULT_EDITOR;
  }

  /**
   * Open one file in the external editor, at an optional line.
   * @param request - `{ path: string, line?: number }`.
   * @returns `{ opened: boolean }`.
   */
  async openFile(request) {
    const path = request && request.path;
    if (typeof path !== "string" || path.length === 0) {
      return { opened: false };
    }
    const line = request && request.line;
    if (process.env.DSH_VSCODE === "1") {
      const opened = await callVscodeBridge("open-file", { path, line });
      if (opened !== null) return { opened };
    }
    const target =
      line != null && Number.isInteger(line) && line > 0
        ? `${path}:${line}`
        : path;
    const resolved = resolveEditor(this.editor);
    if (resolved === null) {
      console.error(
        `[dsh-chat-fileref] editor "${this.editor}" is a path that does not exist`,
      );
      return { opened: false };
    }
    const opened = await spawnEditor(resolved, target);
    if (!opened) {
      console.error(
        `[dsh-chat-fileref] failed to launch editor "${this.editor}" (resolved: ${JSON.stringify(resolved)}) for ${JSON.stringify(target)}`,
      );
    }
    return { opened };
  }
}

export default FilerefGateway;
