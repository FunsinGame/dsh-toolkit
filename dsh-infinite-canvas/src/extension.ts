/**
 * 扩展入口：命令、状态栏与本地服务的生命周期。
 */

import { type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import * as vscode from "vscode";

import {
    killAgentProcess,
    normalizeAgentBaseUrl,
    probeAgent,
    readAgentToken,
    spawnCanvasAgent,
    stopSpawnedAgent,
    waitForAgent,
} from "./core/agent";
import { readVersionInfo } from "./core/handler";
import { startCanvasServer, type RunningCanvasServer } from "./core/server";
import type { VersionInfo } from "./core/types";
import { ICON_RELATIVE_PATH, WEB_ASSET_DIRECTORY, readSettings } from "./vscode/config";
import type { SidebarState } from "./vscode/html";
import { CanvasPanel, type CanvasPanelContext } from "./vscode/panel";
import { CanvasSidebarView, SIDEBAR_VIEW_TYPE, type SidebarContext } from "./vscode/view";

/** 拉起 canvas-agent 后等待就绪的上限。 */
const AGENT_READY_TIMEOUT_MS = 30000;

/** 已解析出来的侧边栏视图，用于在状态变化时刷新。 */
const sidebarViews: vscode.WebviewView[] = [];

/** 扩展运行期状态。 */
type Runtime = {
    server?: RunningCanvasServer;
    serverPort?: number;
    agentProcess?: ChildProcess;
    /** 正在拉起 Agent，避免重复启动。 */
    agentStarting: boolean;
    /** 用户显式点过"停止 Agent"后，不再自动拉起。 */
    agentStopRequested: boolean;
    statusItem: vscode.StatusBarItem;
    output: vscode.OutputChannel;
    /** 侧边栏上下文，用于主动刷新视图。 */
    sidebarContext?: SidebarContext;
};

let runtime: Runtime | undefined;

/** 状态栏在探测结果回来之前先显示的文案。 */
const STATUS_PLACEHOLDER = "$(symbol-color) 无限画布";

/** 扩展激活。 */
export function activate(context: vscode.ExtensionContext): void {
    const output = vscode.window.createOutputChannel("无限画布");
    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    statusItem.command = "dshInfiniteCanvas.open";
    statusItem.text = STATUS_PLACEHOLDER;
    statusItem.tooltip = "打开无限画布";
    statusItem.show();

    runtime = { agentStopRequested: false, agentStarting: false, statusItem, output };

    const sidebarContext: SidebarContext = {
        getState: () => collectSidebarState(context),
        openCanvas: () => openCanvas(context),
        onViewResolved: (view) => {
            if (!sidebarViews.includes(view)) sidebarViews.push(view);
            view.onDidDispose(() => {
                const index = sidebarViews.indexOf(view);
                if (index >= 0) sidebarViews.splice(index, 1);
            });
        },
        log: (message) => output.appendLine(message),
    };
    const viewProvider = new CanvasSidebarView(sidebarContext);
    runtime.sidebarContext = sidebarContext;

    context.subscriptions.push(
        output,
        statusItem,
        vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_TYPE, viewProvider, {
            // 切换侧边栏时保留视图，避免每次展开都重新探测。
            webviewOptions: { retainContextWhenHidden: true },
        }),
        vscode.commands.registerCommand("dshInfiniteCanvas.open", () => void openCanvas(context)),
        vscode.commands.registerCommand("dshInfiniteCanvas.refreshSidebar", () => refreshSidebarViews()),
        vscode.commands.registerCommand("dshInfiniteCanvas.showDiagnostics", () => showDiagnostics(context)),
        vscode.commands.registerCommand("dshInfiniteCanvas.restartServer", async () => {
            await stopServer();
            await openCanvas(context);
        }),
        vscode.commands.registerCommand("dshInfiniteCanvas.startAgent", () => ensureAgent(true)),
        vscode.commands.registerCommand("dshInfiniteCanvas.stopAgent", () => stopAgent()),
        vscode.commands.registerCommand("dshInfiniteCanvas.showStatus", () => showStatus()),
        vscode.commands.registerCommand("dshInfiniteCanvas.openExternal", () => openInBrowser()),
        vscode.commands.registerCommand("dshInfiniteCanvas.openSettings", () =>
            vscode.commands.executeCommand("workbench.action.openSettings", "dshInfiniteCanvas"),
        ),
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("dshInfiniteCanvas")) {
                void refreshStatus();
            }
        }),
    );

    void refreshStatus();
}

/** 扩展停用：关掉本地服务与自动拉起的 Agent。 */
export async function deactivate(): Promise<void> {
    await stopServer();
    // 扩展宿主退出后，常驻的 canvas-agent 没有存在意义，连同进程树一起收掉。
    await stopAgent(true);
    // 刻意保留 runtime 对象：webview 的消息可能比停用晚到一小步，
    // 此时应被安全地忽略，而不是抛出"扩展未激活"。
    runtime?.output.appendLine("[info] 扩展已停用");
}

/** 打开（或聚焦）无限画布。 */
async function openCanvas(context: vscode.ExtensionContext): Promise<void> {
    const state = runtime;
    if (!state) return;
    const settings = readSettings();
    try {
        await openCanvasInner(context, state, settings);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        state.output.appendLine(`[error] 打开画布失败：${message}`);
        void vscode.window.showErrorMessage(`无限画布：打开失败 —— ${message}`);
    }
}

/** 打开画布的实际流程。 */
async function openCanvasInner(
    context: vscode.ExtensionContext,
    state: Runtime,
    settings: ReturnType<typeof readSettings>,
): Promise<void> {
    const webRoot = path.join(context.extensionUri.fsPath, WEB_ASSET_DIRECTORY);
    if (!existsSync(path.join(webRoot, "index.html")) || existsSync(path.join(webRoot, "PLACEHOLDER.txt"))) {
        const action = await vscode.window.showErrorMessage(
            "无限画布：缺少前端产物。请先在扩展目录执行 npm run fetch:web 构建上游前端。",
            "查看说明",
        );
        if (action === "查看说明") {
            await vscode.env.openExternal(vscode.Uri.parse("https://github.com/basketikun/infinite-canvas"));
        }
        return;
    }

    const versionInfo: VersionInfo | undefined = existsSync(path.join(webRoot, "PLACEHOLDER.txt")) ? undefined : await readVersionInfo(webRoot);

    // 先保证画布本身立刻可用：token 可能在 Agent 首次启动后才写进配置，
    // 因此这里读一次，读不到就让画布顶部的提示告诉用户可以稍等或手动填。
    const agentBaseUrl = normalizeAgentBaseUrl(settings.agentUrl);
    const agentToken = readAgentToken();
    if (!agentToken) {
        state.output.appendLine(`[warn] 暂未在 canvas-agent 配置里找到 token（Agent 可能还在启动）`);
    }

    const server = await ensureServer(webRoot, agentBaseUrl, agentToken, settings.panelPort, versionInfo);
    const diagnosticsFile = path.join(context.globalStorageUri.fsPath, "webview-diagnostics.jsonl");
    const panelContext: CanvasPanelContext = {
        extensionUri: context.extensionUri,
        origin: server.origin,
        agentUrl: agentBaseUrl,
        agentToken,
        notice: server.portWarning,
        onDiagnostics: (payload) => recordDiagnostics(diagnosticsFile, payload),
    };
    CanvasPanel.show(panelContext);
    state.output.appendLine(`[info] webview 尺寸诊断会写入：${diagnosticsFile}`);

    // 画布已经显示出来，再去后台拉起 Agent（不阻塞首屏）。
    const wasRunning = (await probeAgent(agentBaseUrl)).reachable;
    if (!wasRunning && settings.autoStartAgent && !runtime?.agentStopRequested) {
        CanvasPanel.show({ ...panelContext, notice: combineNotices(server.portWarning, AGENT_STARTING_NOTICE(agentBaseUrl)) });
    }
    ensureAgent(false);
    if (settings.openInBrowser) {
        await vscode.env.openExternal(vscode.Uri.parse(`${server.origin}/`));
    }
    await refreshStatus();
}

/** 确保本地画布服务在运行，并且指向最新的 Agent 地址。 */
async function ensureServer(
    webRoot: string,
    agentBaseUrl: string,
    agentToken: string | undefined,
    preferredPort: number,
    versionInfo: VersionInfo | undefined,
): Promise<RunningCanvasServer> {
    const state = runtime;
    if (!state) throw new Error("扩展未激活");
    if (state.server) return state.server;

    const server = await startCanvasServer(webRoot, agentBaseUrl, agentToken, preferredPort, versionInfo);
    state.server = server;
    state.serverPort = server.port;
    state.output.appendLine(`[info] 本地画布服务：${server.origin} → ${agentBaseUrl}`);
    if (server.portWarning) state.output.appendLine(`[warn] ${server.portWarning}`);
    return server;
}

/** 关闭本地画布服务。 */
async function stopServer(): Promise<void> {
    const state = runtime;
    if (!state?.server) return;
    const server = state.server;
    state.server = undefined;
    state.serverPort = undefined;
    await server.dispose();
    state.output.appendLine("[info] 本地画布服务已停止");
}

/**
 * 确保 canvas-agent 可用：已在运行则复用，否则**在后台**按需拉起。
 *
 * 关键：这个函数不能把"已经能连上"当成前置条件返回。
 * canvas-agent 首次拉起要几十秒，画布必须立刻可用（前端会在 Agent 就绪后自动接上），
 * 所以这里只负责把启动动作发出去，不阻塞调用方。
 */
function ensureAgent(force: boolean): void {
    const state = runtime;
    if (!state) return;
    // 冒烟测试时禁止真的拉起外部进程，避免留下游离的 Agent。
    if (process.env.DSH_CANVAS_NO_SPAWN === "1") return;
    if (state.agentStarting) return;
    const settings = readSettings();
    const baseUrl = normalizeAgentBaseUrl(settings.agentUrl);

    state.agentStarting = true;
    void (async () => {
        try {
            const existing = await probeAgent(baseUrl);
            if (existing.reachable) {
                state.output.appendLine(`[info] 复用已运行的 canvas-agent：${baseUrl}（协议版本 ${existing.protocolVersion ?? "?"}）`);
                return;
            }
            if (state.agentStopRequested && !force) return;
            if (!force && !settings.autoStartAgent) return;

            state.agentStopRequested = false;
            const { child, commandLine, token } = await spawnCanvasAgent(baseUrl, {
                command: settings.agentCommand || undefined,
                args: settings.agentArgs,
                log: (line) => state.output.appendLine(line),
            });
            state.agentProcess = child ?? undefined;
            state.output.appendLine(`[info] canvas-agent 命令：${commandLine}`);
            if (token) state.output.appendLine("[info] 已从启动输出读到 Connect token");
            child?.on("exit", (code) => {
                state.output.appendLine(`[info] canvas-agent 退出，code=${code ?? "null"}`);
                state.agentProcess = undefined;
            });
            child?.on("error", (error) => state.output.appendLine(`[error] canvas-agent 进程错误：${error.message}`));

            const probed = await waitForAgent(baseUrl, AGENT_READY_TIMEOUT_MS);
            state.output.appendLine(
                probed.reachable
                    ? `[info] canvas-agent 已就绪：${baseUrl}`
                    : "[warn] canvas-agent 端口已开但 /config 未响应，可在画布右上角 Agent 面板手动重试",
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            state.output.appendLine(`[error] canvas-agent 启动失败：${message}`);
            void vscode.window.showErrorMessage(
                `无限画布：canvas-agent 启动失败 —— ${message}。画布本身可用，Agent 面板需要手动连接。`,
            );
        } finally {
            state.agentStarting = false;
        }
    })();
}

/** 正在启动 Agent 时面板顶部的提示文案。 */
function AGENT_STARTING_NOTICE(baseUrl: string): string {
    return `正在启动本地 canvas-agent（${baseUrl}），就绪前画布右上角的 Agent 面板可能显示未连接。`;
}

/** 把 webview 尺寸诊断文件打开给用户看。 */
async function showDiagnostics(context: vscode.ExtensionContext): Promise<void> {
    const file = path.join(context.globalStorageUri.fsPath, "webview-diagnostics.jsonl");
    const state = runtime;
    if (!existsSync(file)) {
        void vscode.window.showWarningMessage(
            `无限画布：还没有诊断数据。先执行一次「打开画布」，数据会写入 ${file}`,
        );
        return;
    }
    state?.output.appendLine(`[info] 诊断文件：${file}`);
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    await vscode.window.showTextDocument(document, { preview: false });
}

/** 拼接多条提示。 */
function combineNotices(...parts: Array<string | undefined>): string | undefined {
    const list = parts.filter((item): item is string => Boolean(item));
    return list.length ? list.join("　") : undefined;
}

/**
 * 记录 webview 回传的尺寸诊断。
 *
 * 既打进「输出」面板方便用户直接看，也追加到存储目录下的 jsonl，
 * 便于事后分析"画布为什么只占一小块"这类宿主层问题。
 */
function recordDiagnostics(file: string, payload: unknown): void {
    const state = runtime;
    try {
        const line = JSON.stringify({ at: new Date().toISOString(), payload });
        state?.output.appendLine(`[diag] ${line}`);
        mkdirSync(path.dirname(file), { recursive: true });
        appendFileSync(file, `${line}\n`, "utf8");
    } catch (error) {
        // 诊断是辅助能力，写不进去也不能影响画布。
        state?.output.appendLine(`[warn] 诊断写入失败：${error instanceof Error ? error.message : String(error)}`);
    }
}

/** 停止由扩展拉起的 canvas-agent。 */
async function stopAgent(silent = false): Promise<void> {
    const state = runtime;
    if (!state) return;
    state.agentStopRequested = true;
    const child = state.agentProcess;
    state.agentProcess = undefined;
    const settings = readSettings();
    const baseUrl = normalizeAgentBaseUrl(settings.agentUrl);

    // 启动路径拿不到真实服务进程 pid，所以按"监听该端口的进程"反查并结束整棵树。
    const result = await stopSpawnedAgent(baseUrl, { log: (line) => state.output.appendLine(line) });

    if (!result.stopped && child) {
        const fallback = killAgentProcess(child);
        state.output.appendLine(`[info] 回退结束子进程：${fallback.killed ? "成功" : "未确认"}（${fallback.detail}）`);
        if (fallback.killed) return;
    }
    if (silent) return;
    if (result.stopped) {
        void vscode.window.showInformationMessage("无限画布：已停止由扩展拉起的 canvas-agent。");
    } else {
        void vscode.window.showInformationMessage(`无限画布：${result.detail}。若 Agent 是手动启动的，请自行结束它。`);
    }
}

/** 把本地服务地址交给外部浏览器打开。 */
async function openInBrowser(): Promise<void> {
    const state = runtime;
    if (!state) return;
    if (!state.server) {
        await vscode.window.showWarningMessage("无限画布：请先执行「无限画布: 打开画布」启动本地服务。");
        return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(`${state.server.origin}/`));
}

/** 展示当前运行状态。 */
async function showStatus(): Promise<void> {
    const state = runtime;
    if (!state) return;
    const settings = readSettings();
    const probe = await probeAgent(normalizeAgentBaseUrl(settings.agentUrl));
    const lines = [
        `本地画布服务：${state.server ? state.server.origin : "未运行"}`,
        `canvas-agent：${normalizeAgentBaseUrl(settings.agentUrl)}（${probe.reachable ? `运行中，协议版本 ${probe.protocolVersion ?? "?"}` : "不可达"}）`,
        `canvas-agent token：${readAgentToken() ? "已配对" : "未找到（需手动填写）"}`,
        `面板：${CanvasPanel.isOpen() ? "已打开" : "未打开"}`,
    ];
    state.output.appendLine(lines.join("\n"));
    state.output.show(true);
    await vscode.window.showInformationMessage(lines.join("　|　"));
    await refreshStatus();
}

/** 刷新状态栏与活动栏侧边栏。 */
async function refreshStatus(): Promise<void> {
    const state = runtime;
    if (!state) return;
    const settings = readSettings();
    const probe = await probeAgent(normalizeAgentBaseUrl(settings.agentUrl));
    const parts: string[] = [];
    parts.push(state.server ? "画布已就绪" : "画布未启动");
    parts.push(probe.reachable ? "Agent 已连接" : "Agent 未运行");
    state.statusItem.text = `$(symbol-color) 无限画布 · ${parts.join(" / ")}`;
    state.statusItem.tooltip = [
        `本地服务：${state.server ? state.server.origin : "未运行"}`,
        `canvas-agent：${normalizeAgentBaseUrl(settings.agentUrl)}`,
        "点击打开无限画布",
    ].join("\n");
    await refreshSidebarViews();
}

/** 收集活动栏侧边栏要展示的状态。 */
async function collectSidebarState(context: vscode.ExtensionContext): Promise<SidebarState> {
    const settings = readSettings();
    const agentUrl = normalizeAgentBaseUrl(settings.agentUrl);
    const webRoot = path.join(context.extensionUri.fsPath, WEB_ASSET_DIRECTORY);
    // 占位文件还在说明产物尚未构建，此时打开画布只会报错。
    const webReady = existsSync(path.join(webRoot, "index.html")) && !existsSync(path.join(webRoot, "PLACEHOLDER.txt"));
    const probe = await probeAgent(agentUrl);
    const server = runtime?.server;
    return {
        webReady,
        canvasRunning: Boolean(server),
        canvasStatus: server ? server.origin.replace(/^https?:\/\//, "") : "未启动",
        agentReachable: probe.reachable,
        agentStatus: probe.reachable ? `v${probe.protocolVersion ?? "?"}` : "未运行",
        paired: Boolean(readAgentToken()),
        notice: server?.portWarning,
    };
}

/** 让所有已打开的侧边栏视图重新取数。 */
async function refreshSidebarViews(): Promise<void> {
    const context = runtime?.sidebarContext;
    if (!context) return;
    await Promise.all(sidebarViews.map((view) => CanvasSidebarView.refresh(view, context)));
}

/** 供测试与调试读取图标路径。 */
export const iconPath = ICON_RELATIVE_PATH;
