/**
 * canvas-agent 的发现、拉起与配对。
 *
 * 纯函数（配置读写、stdout 解析、健康探测）与进程管理分开，前者可以在测试里直接调用。
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { AGENT_CONFIG_RELATIVE_PATH, DEFAULT_AGENT_PORT } from "./types";

/** canvas-agent 配置文件里的关注字段。 */
export type AgentConfigFile = {
    url?: string;
    token?: string;
    origins?: string[];
};

/** 一个可用的 canvas-agent 连接信息。 */
export type AgentConnection = {
    baseUrl: string;
    token: string;
};

/** 拉起 canvas-agent 的配置。 */
export type SpawnAgentOptions = {
    /** 自定义启动命令；为空时使用 npx。 */
    command?: string;
    /** 传给命令的参数，仅在自定义命令时使用。 */
    args?: string[];
    /** PowerShell 可执行文件路径，Windows 上用于隐藏窗口启动。 */
    powershellPath?: string;
    /** 覆盖配置目录，仅测试用。 */
    configDir?: string;
    /** 真实服务进程启动后的回调（Windows 上是孙进程的 pid 落盘时机）。 */
    onServicePid?: (pid: number) => void;
    /** 日志回调。 */
    log?: (message: string) => void;
};

/** 探测结果。 */
export type AgentProbe = {
    reachable: boolean;
    /** 服务返回的协议版本（/config）。 */
    protocolVersion?: number;
    /** 服务自报的地址。 */
    url?: string;
};

/** 通用 npm 包名（发布在 npm 上的 canvas-agent）。 */
export const AGENT_PACKAGE = "@basketikun/canvas-agent";

/** canvas-agent 的配置目录。 */
export function agentConfigDir(home: string = os.homedir()): string {
    return path.join(home, ...AGENT_CONFIG_RELATIVE_PATH.slice(0, -1));
}

/** canvas-agent 的配置文件路径。 */
export function agentConfigPath(home: string = os.homedir()): string {
    return path.join(home, ...AGENT_CONFIG_RELATIVE_PATH);
}

/** 读取 canvas-agent 配置；不存在或损坏时返回空对象。 */
export function readAgentConfig(configPath: string = agentConfigPath()): AgentConfigFile {
    try {
        const raw = fs.readFileSync(configPath, "utf8");
        const parsed = JSON.parse(raw) as AgentConfigFile;
        return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
        return {};
    }
}

/**
 * 读取 canvas-agent 的 token。
 *
 * 上游在首次启动时生成 token 并落盘，因此"拉起之后读文件"是最稳的配对方式，
 * 比解析 stdout 更可靠（stdout 可能被用户重定向或经过 npm 包装）。
 */
export function readAgentToken(configPath: string = agentConfigPath()): string | undefined {
    const token = readAgentConfig(configPath).token;
    return typeof token === "string" && token ? token : undefined;
}

/** 把探测到的基地址补全成规范形式。 */
export function normalizeAgentBaseUrl(value: string, fallbackPort: number = DEFAULT_AGENT_PORT): string {
    const text = value.trim();
    if (!text) return `http://127.0.0.1:${fallbackPort}`;
    try {
        const url = new URL(text.includes("://") ? text : `http://${text}`);
        return `${url.protocol}//${url.host}`;
    } catch {
        return `http://127.0.0.1:${fallbackPort}`;
    }
}

/** 从 canvas-agent 的启动输出里解析 Local URL 与 Connect token。 */
export function parseAgentStartupLog(text: string): { url?: string; token?: string } {
    const url = /Local URL:\s*(\S+)/i.exec(text)?.[1];
    const token = /Connect token:\s*(\S+)/i.exec(text)?.[1];
    return {
        ...(url ? { url: url.replace(/\/$/, "") } : {}),
        ...(token ? { token } : {}),
    };
}

/** 探测 canvas-agent 是否已在运行。 */
export async function probeAgent(baseUrl: string, timeoutMs = 1500): Promise<AgentProbe> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/config`, { signal: controller.signal });
        if (!response.ok) return { reachable: false };
        const data = (await response.json()) as { ok?: boolean; protocolVersion?: number; url?: string };
        if (!data?.ok) return { reachable: false };
        return {
            reachable: true,
            ...(typeof data.protocolVersion === "number" ? { protocolVersion: data.protocolVersion } : {}),
            ...(typeof data.url === "string" ? { url: data.url } : {}),
        };
    } catch {
        return { reachable: false };
    } finally {
        clearTimeout(timer);
    }
}

/** 轮询等待 canvas-agent 就绪。 */
export async function waitForAgent(baseUrl: string, timeoutMs = 30000, intervalMs = 400): Promise<AgentProbe> {
    const deadline = Date.now() + timeoutMs;
    let last: AgentProbe = { reachable: false };
    while (Date.now() < deadline) {
        last = await probeAgent(baseUrl);
        if (last.reachable) return last;
        await delay(intervalMs);
    }
    return last;
}

/** 拉起 canvas-agent 的结果。 */
export type SpawnedAgent = {
    /** 子进程（Windows 上是承载 npx 的 cmd.exe）。 */
    child: ChildProcess | null;
    /** 等价的可读命令行，用于日志。 */
    commandLine: string;
    /** 从启动输出里解析到的 Connect token（不一定有，服务也可能稍后才写进配置）。 */
    token?: string;
};

/** 启动后等待"端口开始监听"与"输出里出现 token"的上限。 */
const SPAWN_WAIT_MS = 120_000;

/**
 * 拉起 canvas-agent。
 *
 * Windows 上的两个坑（都实测踩过）：
 * 1. **不能用 PowerShell 的 `Start-Process … -ArgumentList '/c',$inner` 做隐藏启动**：
 *    经 Node 传参时引号会被拼坏，cmd 立刻以 0 退出，Agent 根本没起来。
 * 2. **不能用 `shell: true`**：它会经 cmd.exe，产生一个**可见的控制台窗口**，
 *    `windowsHide` 压不住；而 `detached: true` 会强制新建控制台，与隐藏窗口冲突。
 *
 * 现在的做法：直接 `spawn("cmd.exe", ["/c", "npx …"])` + `windowsHide: true`，且**不 detach**。
 * 实测 3 秒起监听、零新增可见窗口；副作用是扩展宿主退出时 Agent 随之结束——
 * 这正好避免了留下孤儿进程。
 *
 * 停止时不依赖子进程 pid（中间还隔着 npx），而是按监听端口反查，见 `findPidOnPort`。
 */
export async function spawnCanvasAgent(baseUrl: string, options: SpawnAgentOptions = {}): Promise<SpawnedAgent> {
    const port = Number(new URL(baseUrl).port) || DEFAULT_AGENT_PORT;
    const env = { ...process.env, PORT: String(port), NO_COLOR: "1" };
    const custom = options.command?.trim();
    let command: string;
    let args: string[];
    let commandLine: string;
    if (custom) {
        command = custom;
        args = options.args ?? [];
        commandLine = [command, ...args].join(" ");
    } else if (process.platform === "win32") {
        // 经 cmd.exe 是必需的：Node 出于安全考虑不允许直接 spawn npx.cmd；
        // 而 windowsHide 对 cmd.exe 生效，不会像 shell:true 那样弹出窗口。
        command = "cmd.exe";
        args = ["/c", `npx -y ${AGENT_PACKAGE}@latest`];
        commandLine = `cmd /c npx -y ${AGENT_PACKAGE}@latest`;
    } else {
        command = "npx";
        args = ["-y", `${AGENT_PACKAGE}@latest`];
        commandLine = `npx -y ${AGENT_PACKAGE}@latest`;
    }

    // stdout 需要读取：canvas-agent 会把 Connect token 打印出来，这是最直接的配对来源。
    const child = spawn(command, args, {
        env,
        windowsHide: true,
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
    });

    let captured = "";
    const consume = (chunk: Buffer) => {
        captured = `${captured}${chunk.toString("utf8")}`.slice(-16_384);
    };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", consume);

    await waitForAgentStartup(port, child);

    const parsed = parseAgentStartupLog(captured);
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref();

    options.log?.(`[info] canvas-agent 启动：${commandLine}`);
    return { child, commandLine, ...(parsed.token ? { token: parsed.token } : {}) };
}

/**
 * 等待 canvas-agent 真正开始监听，或提前失败。
 *
 * 只等端口，不等 token：token 可能稍后才写进配置文件，由调用方自行读取，
 * 避免把一个慢操作压进启动路径。
 */
async function waitForAgentStartup(port: number, child: ChildProcess): Promise<void> {
    const deadline = Date.now() + SPAWN_WAIT_MS;
    let exitCode: number | null | undefined;
    child.once("exit", (code) => {
        exitCode = code;
    });
    while (Date.now() < deadline) {
        if (await probeListeningPort(port)) return;
        if (exitCode !== null && exitCode !== undefined) {
            throw new Error(`canvas-agent 启动后立即退出（退出码 ${exitCode}），端口 ${port} 未监听`);
        }
        await delay(400);
    }
    throw new Error(`canvas-agent 在 ${Math.round(SPAWN_WAIT_MS / 1000)} 秒内没有监听端口 ${port}`);
}

/** `taskkill` / `kill` 的结果。 */
export type KillResult = { killed: boolean; detail: string };

/** 结束一个进程及其整棵进程树。 */
export function killProcessTree(pid: number): KillResult {
    if (process.platform === "win32") {
        const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { encoding: "utf8", windowsHide: true });
        if (result.status === 0) return { killed: true, detail: `taskkill /PID ${pid} /T /F` };
        const reason = (result.stderr || result.error?.message || "taskkill 失败").trim();
        if (/not found|找不到|没有运行/i.test(reason) || result.status === 128) {
            return { killed: true, detail: `pid ${pid} 已不存在` };
        }
        return { killed: false, detail: reason };
    }
    try {
        // detached 启动时 pid 即进程组组长，负号表示结束整组。
        process.kill(-pid, "SIGTERM");
        return { killed: true, detail: `kill -TERM -${pid}` };
    } catch {
        try {
            process.kill(pid, "SIGTERM");
            return { killed: true, detail: `kill ${pid}` };
        } catch {
            return { killed: false, detail: "进程可能已经退出" };
        }
    }
}

/** 结束本扩展自己拉起的子进程句柄。 */
export function killAgentProcess(child: ChildProcess | undefined): KillResult {
    const pid = child?.pid;
    if (!pid) return { killed: false, detail: "没有记录到子进程 pid" };
    const result = killProcessTree(pid);
    if (!result.killed) {
        try {
            child?.kill();
            return { killed: true, detail: `child.kill()（pid ${pid}）` };
        } catch {
            // 进程可能已经退出。
        }
    }
    return result;
}

/**
 * 确认某个 TCP 端口上真的有服务在监听。
 *
 * 用于在按 pid 杀进程之前做一次校验：pid 可能已经被系统复用，
 * 只有确认端口仍在服务中，才说明那个 pid 还是我们的 canvas-agent。
 */
export function probeListeningPort(port: number, host = "127.0.0.1", timeoutMs = 800): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = net.createConnection({ port, host });
        const done = (value: boolean) => {
            socket.removeAllListeners();
            socket.destroy();
            resolve(value);
        };
        socket.setTimeout(timeoutMs);
        socket.once("connect", () => done(true));
        socket.once("timeout", () => done(false));
        socket.once("error", () => done(false));
    });
}

/**
 * 反查当前监听指定端口的进程。
 *
 * 这是"停止本地 Agent"的关键：启动路径上拿不到真实服务进程的 pid
 * （shell/detached 会多套一层），但监听端口的那个进程就是它。
 *
 * 解析 `netstat -ano`，不依赖 PowerShell（需要时更快，也少一层引号问题）。
 */
export function findPidOnPort(port: number, netstatOutput?: string): number | undefined {
    const text = netstatOutput ?? readNetstat();
    if (text === undefined) return undefined;
    const wanted = `:${port}`;
    for (const line of text.split(/\r?\n/)) {
        const columns = line.trim().split(/\s+/);
        if (columns.length < 5) continue;
        const [protocol, local, , state, pid] = columns;
        if (!protocol.toUpperCase().startsWith("TCP")) continue;
        if (state.toUpperCase() !== "LISTENING") continue;
        // 本地地址可能是 127.0.0.1:17371 / [::1]:17371 / 0.0.0.0:17371
        if (!local.includes(wanted)) continue;
        if (local.slice(local.lastIndexOf(":")) !== wanted) continue;
        const parsed = Number(pid);
        if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
    return undefined;
}

function readNetstat(): string | undefined {
    const result = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.status !== 0 || typeof result.stdout !== "string") return undefined;
    return result.stdout;
}

/**
 * 停止"由扩展拉起"的 canvas-agent。
 *
 * 只认监听目标端口的那个进程；如果端口上没人监听，说明 Agent 已经不在，
 * 此时只做清理，绝不按可能过期的信息去杀进程。
 */
export async function stopSpawnedAgent(
    baseUrl: string,
    options: { log?: (message: string) => void } = {},
): Promise<{ stopped: boolean; detail: string }> {
    const port = Number(new URL(baseUrl).port) || DEFAULT_AGENT_PORT;
    if (!(await probeListeningPort(port))) {
        return { stopped: false, detail: `端口 ${port} 上没有服务在监听` };
    }
    const pid = findPidOnPort(port);
    if (!pid) {
        return { stopped: false, detail: `找到了监听 ${port} 的服务，但没能解析出进程号` };
    }
    const result = killProcessTree(pid);
    options.log?.(`[info] 停止 canvas-agent：${result.detail}`);
    return { stopped: result.killed, detail: result.detail };
}

export function resolveAgentConnection(configuredUrl: string, configPath: string = agentConfigPath()): AgentConnection | undefined {
    const file = readAgentConfig(configPath);
    const baseUrl = normalizeAgentBaseUrl(configuredUrl || file.url || "");
    const token = typeof file.token === "string" && file.token ? file.token : undefined;
    return token ? { baseUrl, token } : undefined;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
