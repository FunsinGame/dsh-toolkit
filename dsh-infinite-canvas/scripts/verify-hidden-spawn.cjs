/**
 * 对比"隐藏窗口"的几种 spawn 方式，找出既不弹窗、Agent 又能正常监听的那个。
 *
 * 背景：`shell: true` 会经 cmd.exe，产生的控制台窗口 `windowsHide` 压不住；
 * 而 `detached: true` 会强制新建控制台，与隐藏窗口冲突。
 *
 * 用法：node scripts/verify-hidden-spawn.cjs [a|b|c]
 *   a = shell:true + detached:true（当前实现，会弹窗）
 *   b = 直接 npx.cmd + detached:false + windowsHide:true
 *   c = 直接 npx.cmd + detached:true  + windowsHide:true
 */
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const AGENT_PACKAGE = "@basketikun/canvas-agent";
const port = Number(process.env.DSH_HIDDEN_TEST_PORT || 17381);

function probe() {
    return new Promise((resolve) => {
        const socket = net.createConnection({ port, host: "127.0.0.1" });
        const done = (value) => {
            socket.removeAllListeners();
            socket.destroy();
            resolve(value);
        };
        socket.setTimeout(600);
        socket.once("connect", () => done(true));
        socket.once("timeout", () => done(false));
        socket.once("error", () => done(false));
    });
}

/** 列出有主窗口的进程（用窗口标题判断是否真的弹了可见控制台）。 */
function visibleConsoles() {
    const result = spawnSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' } | ForEach-Object { \"$($_.ProcessName):$($_.Id):$($_.MainWindowTitle)\" }"],
        { encoding: "utf8", windowsHide: true },
    );
    return (result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
}

/** 结束监听目标端口的进程树。 */
function killPort() {
    const result = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8", windowsHide: true });
    for (const line of (result.stdout || "").split(/\r?\n/)) {
        const cols = line.trim().split(/\s+/);
        if (cols.length < 5) continue;
        if (cols[0].toUpperCase().startsWith("TCP") && cols[3].toUpperCase() === "LISTENING" && cols[1].endsWith(`:${port}`)) {
            spawnSync("taskkill", ["/PID", cols[4], "/T", "/F"], { stdio: "ignore", windowsHide: true });
        }
    }
}

const METHODS = {
    a: {
        label: "shell:true + detached:true（当前实现，会弹窗）",
        command: "npx",
        args: ["-y", `${AGENT_PACKAGE}@latest`],
        options: { shell: true, detached: true, windowsHide: true, stdio: "ignore" },
    },
    b: {
        label: "cmd.exe /c npx + detached:false + windowsHide:true",
        command: "cmd.exe",
        args: ["/c", `npx -y ${AGENT_PACKAGE}@latest`],
        options: { detached: false, windowsHide: true, stdio: "ignore" },
    },
    c: {
        label: "cmd.exe /c npx + detached:true + windowsHide:true",
        command: "cmd.exe",
        args: ["/c", `npx -y ${AGENT_PACKAGE}@latest`],
        options: { detached: true, windowsHide: true, stdio: "ignore" },
    },
    d: {
        label: "shell:true + detached:false + windowsHide:true",
        command: "npx",
        args: ["-y", `${AGENT_PACKAGE}@latest`],
        options: { shell: true, detached: false, windowsHide: true, stdio: "ignore" },
    },
};

(async () => {
    const key = (process.argv[2] || "b").toLowerCase();
    const method = METHODS[key];
    if (!method) {
        console.error(`未知方式 ${key}`);
        process.exit(2);
    }

    killPort();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const before = visibleConsoles();
    console.log(`[hidden:${key}] ${method.label}`);
    console.log(`[hidden:${key}] 启动前有窗口的进程: ${before.length ? before.join(" | ") : "无"}`);

    const child = spawn(method.command, method.args, {
        ...method.options,
        env: { ...process.env, PORT: String(port), NO_COLOR: "1" },
    });
    child.on("error", (error) => console.log(`[hidden:${key}] spawn 错误: ${error.message}`));

    let listening = false;
    for (let i = 1; i <= 20; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        listening = await probe();
        if (listening) {
            console.log(`[hidden:${key}] 第 ${i * 3} 秒: 监听=true ✓`);
            break;
        }
    }
    if (!listening) console.log(`[hidden:${key}] 60 秒内未监听 ✗`);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    const after = visibleConsoles();
    const added = after.filter((item) => !before.includes(item));
    console.log(`[hidden:${key}] 启动后新增的可视窗口: ${added.length ? added.join(" | ") : "无 ✓"}`);

    console.log("[hidden] 清理 …");
    killPort();
    try {
        child.kill();
    } catch {}
    const ok = listening && added.length === 0;
    console.log(ok ? `HIDDEN ${key.toUpperCase()} OK` : `HIDDEN ${key.toUpperCase()} FAILED`);
    process.exitCode = ok ? 0 : 1;
})();
