// 宿主加载冒烟：用桩模块顶替 vscode，验证 activate() 注册活动栏视图、渲染侧边栏 HTML，
// 并模拟点击主按钮走完 openCanvas（起本地服务 + 创建画布面板）。
// 用法：node scripts/smoke-activate.cjs <扩展目录>
const Module = require("module");
const fs = require("node:fs");
const os = require("node:os");
const path = require("path");

const extensionRoot = path.resolve(process.argv[2] || ".");
// 冒烟只验证宿主接线，不应该真的去拉外部 Agent 进程。
process.env.DSH_CANVAS_NO_SPAWN = "1";
const captured = { viewProviders: [], commands: [], panels: [] };
const noopDisposable = () => ({ dispose() {} });
const logs = [];
const outputChannel = { appendLine: (line) => logs.push(line), show: () => undefined, dispose: () => undefined };

const vscodeStub = {
    window: {
        createOutputChannel: () => outputChannel,
        createStatusBarItem: () => ({ show: noopDisposable, dispose: noopDisposable, text: "", tooltip: "", command: "" }),
        registerWebviewViewProvider: (viewType, provider) => {
            captured.viewProviders.push({ viewType, provider });
            return { dispose() {} };
        },
        createWebviewPanel: (viewType, title, column, options) => {
            const panelMessages = [];
            const panel = {
                viewType,
                title,
                options,
                iconPath: undefined,
                reveal: () => undefined,
                dispose: () => undefined,
                onDidDispose: () => ({ dispose() {} }),
                capturedMessages: panelMessages,
                webview: {
                    cspSource: "https://file+.vscode-resource.vscode-cdn.net",
                    options,
                    html: "",
                    // 真实的面板 webview 提供这个 API；面板用它接收尺寸诊断数据。
                    onDidReceiveMessage: (handler) => {
                        panelMessages.push(handler);
                        return { dispose() {} };
                    },
                    postMessage: async () => true,
                },
            };
            captured.panels.push(panel);
            return panel;
        },
        showErrorMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        showWarningMessage: async () => undefined,
    },
    commands: {
        registerCommand: (id) => {
            captured.commands.push(id);
            return { dispose() {} };
        },
        executeCommand: async () => undefined,
    },
    workspace: {
        getConfiguration: () => ({ get: (_key, fallback) => fallback }),
        onDidChangeConfiguration: noopDisposable,
    },
    StatusBarAlignment: { Right: 2 },
    ViewColumn: { Active: -1 },
    Uri: {
        joinPath: (base, ...parts) => ({ fsPath: path.join(base.fsPath, ...parts) }),
        parse: (value) => ({ toString: () => value }),
        file: (value) => ({ fsPath: value }),
    },
    env: { openExternal: async () => true },
};

const originalLoad = Module._load;
Module._load = function (request) {
    if (request === "vscode") return vscodeStub;
    return originalLoad.apply(this, arguments);
};

/** 等待条件成立，避免用固定 sleep。 */
async function waitFor(predicate, timeoutMs = 15000, label = "条件") {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`等待${label}超时（${timeoutMs}ms）`);
}

(async () => {
    const formatChecks = [
        ["含主按钮", (html) => html.includes("打开无限画布")],
        ["含产物状态", (html) => html.includes("前端产物")],
        ["含本地服务状态", (html) => html.includes("本地画布服务")],
        ["含 Agent 状态", (html) => html.includes("canvas-agent")],
        ["含 token 配对状态", (html) => html.includes("连接 token")],
        ["使用 acquireVsCodeApi", (html) => html.includes("acquireVsCodeApi")],
        // 实测结论：VS Code 会剥掉 webview HTML 里脚本的 nonce，自设 meta CSP 会把脚本全拦掉，
        // 所以这里断言"不再自设 CSP"，且脚本/样式仍带 nonce 属性。
        ["不自设 meta CSP", (html) => !html.includes("Content-Security-Policy") && !html.includes("script-src")],
        ["脚本带 nonce 属性", (html) => /<script nonce="[A-Za-z0-9]+">/.test(html)],
    ];

    const extension = require(path.join(extensionRoot, "out", "extension.js"));
    const context = {
        subscriptions: [],
        extensionUri: { fsPath: extensionRoot },
        globalStorageUri: { fsPath: path.join(os.tmpdir(), "dsh-smoke-storage") },
    };
    extension.activate(context);
    console.log(`1) activate() 完成：订阅 ${context.subscriptions.length} 个、命令 ${captured.commands.length} 条`);

    const entry = captured.viewProviders.find((item) => item.viewType === "dshInfiniteCanvas.sidebar");
    if (!entry) throw new Error("没有注册活动栏侧边栏视图 dshInfiniteCanvas.sidebar");
    console.log(`2) 已注册活动栏视图：${entry.viewType}`);

    let html = "";
    let messageHandler = null;
    const view = {
        visible: true,
        webview: {
            cspSource: "https://file+.vscode-resource.vscode-cdn.net",
            options: {},
            get html() {
                return html;
            },
            set html(value) {
                html = value;
            },
            onDidReceiveMessage: (handler) => {
                messageHandler = handler;
                return { dispose() {} };
            },
        },
        onDidChangeVisibility: () => ({ dispose() {} }),
        onDidDispose: () => ({ dispose() {} }),
    };
    entry.provider.resolveWebviewView(view);
    await waitFor(() => html.length > 0, 15000, "侧边栏 HTML");

    console.log("3) 侧边栏 HTML 检查：");
    let failed = 0;
    for (const [label, check] of formatChecks) {
        const ok = check(html);
        if (!ok) failed += 1;
        console.log(`   ${ok ? "✓" : "✗"} ${label}`);
    }

    console.log("4) 模拟点击「打开无限画布」：");
    await messageHandler({ command: "open" });
    await waitFor(() => captured.panels.length > 0, 15000, "画布面板创建");
    const panel = captured.panels.at(-1);
    console.log(`   面板：类型 ${panel.viewType}，标题 ${panel.title}，html 长度=${(panel.webview.html || "").length}`);
    const diagnostics = logs.filter((line) => line.includes("[error]") || line.includes("[warn]"));
    if (diagnostics.length) {
        console.log("   运行日志中的告警/错误：");
        for (const line of diagnostics) console.log(`     ${line}`);
    }
    if (process.env.DSH_SMOKE_DUMP === "1") {
        require("node:fs").writeFileSync(require("node:path").join(os.tmpdir(), "dsh-smoke-panel.html"), panel.webview.html || "(空)");
        console.log(`   已导出面板 HTML 到 ${require("node:path").join(os.tmpdir(), "dsh-smoke-panel.html")}`);
    }
    const frameUrl = /iframe id="frame" src="([^"]+)"/.exec(panel.webview.html)?.[1] ?? "(未找到)";
    console.log(`   iframe 指向：${frameUrl}`);
    console.log(`   面板 CSP：${/frame-src [^;"]+/.exec(panel.webview.html)?.[0] ?? "(未找到)"}`);
    // 首选端口可能被占用而顺延，因此按"实际服务 origin"判断，而不是写死端口。
    const frameOrigin = /^(https?:\/\/[^/]+)/.exec(frameUrl)?.[1] ?? "";
    const canvasOk = /^http:\/\/127\.0\.0\.1:\d+$/.test(frameOrigin) && frameUrl.includes("#agentUrl=");
    if (!canvasOk) failed += 1;
    console.log(`   ${canvasOk ? "✓" : "✗"} iframe 指向本地服务且带 Agent 引导参数（origin=${frameOrigin || "解析失败"}）`);

    // 验证诊断链路：模拟 webview 回传尺寸数据，应当被写进 globalStorage 下的 jsonl。
    const diagFile = path.join(os.tmpdir(), "dsh-smoke-storage", "webview-diagnostics.jsonl");
    fs.rmSync(diagFile, { force: true });
    if (panel.capturedMessages.length === 0) {
        failed += 1;
        console.log("   ✗ 面板没有注册消息处理器，诊断数据无法回传");
    } else {
        panel.capturedMessages[0]({ command: "diagnostics", phase: "smoke", metrics: { webview: { innerWidth: 111, innerHeight: 222 } } });
        await new Promise((resolve) => setTimeout(resolve, 200));
        const written = fs.existsSync(diagFile) ? fs.readFileSync(diagFile, "utf8") : "";
        const ok = written.includes('"innerWidth":111') && written.includes('"phase":"smoke"');
        if (!ok) failed += 1;
        console.log(`   ${ok ? "✓" : "✗"} 诊断数据能回传并落盘（${diagFile}）`);
    }

    // 防御性验证：即使宿主不提供 onDidReceiveMessage（诊断通道不可用），面板也必须照常渲染。
    const stripMessages = process.env.DSH_SMOKE_NO_MSG === "1";
    if (stripMessages) {
        for (const p of captured.panels) delete p.webview.onDidReceiveMessage;
    }

    console.log("5) 停用扩展并确认本地服务释放：");
    await extension.deactivate();
    console.log(`   deactivate() 完成；运行日志 ${logs.length} 条`);
    const leftovers = logs.filter((line) => line.includes("未能") || line.includes("[error]"));
    console.log(`   ${leftovers.length === 0 ? "✓" : "✗"} 停用过程无异常日志`);
    if (leftovers.length) {
        failed += 1;
        for (const line of leftovers) console.log(`     ${line}`);
    }

    console.log("6) 命令清单：" + captured.commands.join(", "));
    console.log(failed === 0 ? "\nSMOKE OK" : `\nSMOKE FAILED（${failed} 项）`);
    process.exitCode = failed === 0 ? 0 : 1;
    // 确保进程退出：冒烟里可能拉起过后台进程。
    setTimeout(() => process.exit(process.exitCode ?? 0), 500).unref();
})().catch((error) => {
    console.error(`SMOKE FAILED: ${error.message}`);
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 500).unref();
});
