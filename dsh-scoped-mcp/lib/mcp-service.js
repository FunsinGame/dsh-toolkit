/**
 * dsh-scoped-mcp Typert remote service.
 *
 * Exposes scope-aware MCP config CRUD and connection testing to the Web
 * settings UI. Reads/writes the same global and workspace YAML files used by
 * the CLI and the host plugin.
 */
import { appendFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import {
  findProjectRoot,
  globalConfigPath,
  loadConfigFile,
  loadMergedServers,
  normalizeScope,
  normalizeServerConfig,
  resolveDshHome,
  workspaceConfigPath,
  writeConfigFile,
} from "./config.js";
import { probeServer } from "./mcp-bridge.js";

async function debugLog(message) {
  try {
    await appendFile(join(resolveDshHome(), "scoped-mcp-debug.log"), `${new Date().toISOString()} ${message}\n`, "utf8");
  } catch {
    // Debug logging must never break MCP configuration mutations.
  }
}

export class ScopedMcpManagerGateway extends TypertRemoteService {
  constructor(ctx, onMutated) {
    super(ctx, "scopedMcpManager");
    this.onMutated = onMutated;
  }

  async resolveWorkspace(sessionId) {
    const session = sessionId ? this.ctx.sessions?.get?.(sessionId) : undefined;
    const cwd = session?.header?.cwd || process.cwd();
    if (!cwd) return null;
    return findProjectRoot(cwd);
  }

  async readScope(scopeRaw) {
    const normalized = scopeRaw && typeof scopeRaw === "object" && scopeRaw.kind !== undefined
      ? scopeRaw
      : normalizeScope(scopeRaw);
    const path = normalized.kind === "global"
      ? globalConfigPath()
      : workspaceConfigPath(normalized.path);
    const config = await loadConfigFile(path);
    return { normalized, path, config };
  }

  async writeScope(scopeRaw, config) {
    const { path } = await this.readScope(scopeRaw);
    await writeConfigFile(path, config);
    return { path, config };
  }

  async list(sessionId) {
    const workspacePath = await this.resolveWorkspace(sessionId);
    const global = await this.readScope("global");
    const workspace = workspacePath ? await this.readScope(workspacePath) : null;
    const merged = workspacePath ? await loadMergedServers(workspacePath) : [];
    const session = sessionId ? this.ctx.sessions?.get?.(sessionId) : undefined;
    const currentCwd = session?.header?.cwd || process.cwd();
    return {
      global: {
        kind: "global",
        path: global.path,
        servers: global.config.servers.map((server) => ({ ...server, scope: "global" })),
      },
      workspace: workspace
        ? {
            kind: "workspace",
            path: workspacePath,
            label: basename(workspacePath) || workspacePath,
            servers: workspace.config.servers.map((server) => ({ ...server, scope: "workspace" })),
            merged,
          }
        : null,
      currentCwd: currentCwd || null,
    };
  }

  async save(payload) {
    const scope = normalizeScope(payload.scope);
    const server = normalizeServerConfig(payload.server);
    const previous = payload.previousServerName;
    const { config } = await this.readScope(scope);
    const existing = config.servers.find((item) => item.serverName === server.serverName);
    if (existing && existing.serverName !== previous) {
      throw new Error(`server "${server.serverName}" already exists in ${scope.kind === "global" ? "global" : `workspace ${scope.path}`}`);
    }
    config.servers = config.servers.filter((item) => previous === undefined || item.serverName !== previous);
    config.servers.push(server);
    const { path } = await this.writeScope(scope, config);
    this.onMutated?.();
    return {
      ok: true,
      scope: scope.kind === "global" ? "global" : scope.path,
      path,
      servers: config.servers.map((item) => ({ ...item, scope: scope.kind })),
    };
  }

  async removeServer(payload) {
    const scope = normalizeScope(payload.scope);
    const { config } = await this.readScope(scope);
    const before = config.servers.length;
    config.servers = config.servers.filter((item) => item.serverName !== payload.serverName);
    if (config.servers.length === before) {
      throw new Error(`server "${payload.serverName}" not found in ${scope.kind === "global" ? "global" : `workspace ${scope.path}`}`);
    }
    const { path } = await this.writeScope(scope, config);
    this.onMutated?.();
    return {
      ok: true,
      scope: scope.kind === "global" ? "global" : scope.path,
      path,
      servers: config.servers.map((item) => ({ ...item, scope: scope.kind })),
    };
  }

  async setEnabled(payload) {
    const scope = normalizeScope(payload.scope);
    await debugLog(`setEnabled called server=${payload.serverName} scope=${scope.kind === "global" ? "global" : scope.path} enabled=${payload.enabled}`);
    const { config } = await this.readScope(scope);
    const server = config.servers.find((item) => item.serverName === payload.serverName);
    if (!server) {
      await debugLog(`setEnabled failed: server ${payload.serverName} not found`);
      throw new Error(`server "${payload.serverName}" not found in ${scope.kind === "global" ? "global" : `workspace ${scope.path}`}`);
    }
    server.disabled = !payload.enabled;
    const { path } = await this.writeScope(scope, config);
    await debugLog(`setEnabled wrote ${path} disabled=${server.disabled}`);
    this.onMutated?.();
    return {
      ok: true,
      scope: scope.kind === "global" ? "global" : scope.path,
      path,
      servers: config.servers.map((item) => ({ ...item, scope: scope.kind })),
    };
  }

  async test(payload) {
    if (payload.server) {
      const server = normalizeServerConfig(payload.server);
      return probeServer(server);
    }
    if (!payload.serverName) {
      throw new Error("test requires serverName or server");
    }
    const scope = normalizeScope(payload.scope ?? "global");
    let server;
    if (scope.kind === "global") {
      const { config } = await this.readScope(scope);
      server = config.servers.find((item) => item.serverName === payload.serverName);
    } else {
      const servers = await loadMergedServers(scope.path);
      server = servers.find((item) => item.serverName === payload.serverName);
    }
    if (!server) {
      throw new Error(`server "${payload.serverName}" not found in ${scope.kind === "global" ? "global" : `workspace ${scope.path}`}`);
    }
    return probeServer(server);
  }
}

export default ScopedMcpManagerGateway;
