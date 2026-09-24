/**
 * 端到端验证 canvas-agent 的启动与停止，直接用编译产物（out/）。
 *
 * 覆盖真实链路：spawnCanvasAgent -> 端口开始监听 -> findPidOnPort 反查 -> stopSpawnedAgent 结束。
 *
 * 用法：node scripts/verify-agent-lifecycle.cjs
 */
const { killProcessTree, findPidOnPort, probeListeningPort, readAgentToken, spawnCanvasAgent, stopSpawnedAgent } = require("../out/core/agent.js");

const baseUrl = "http://127.0.0.1:17371";
const port = 17371;

function netstatLines() {
    try {
        return require("node:child_process")
            .execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8", windowsHide: true })
            .split(/\r?\n/)
            .filter((line) => line.includes(`:${port}`))
            .join("\n");
    } catch {
        return "(netstat 读取失败)";
    }
}

(async () => {
    console.log("[verify] 清理可能存在的残留 …");
    const stale = findPidOnPort(port);
    if (stale) {
        console.log(`[verify] 发现残留 pid ${stale}，先结束`);
        killProcessTree(stale);
        await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    console.log("[verify] 启动 canvas-agent …");
    const started = Date.now();
    const spawned = await spawnCanvasAgent(baseUrl, { log: (line) => console.log(`  ${line}`) });
    console.log(`[verify] ✓ 启动成功，用时 ${((Date.now() - started) / 1000).toFixed(1)}s；命令行 ${spawned.commandLine}`);
    console.log(`[verify]   端口监听=${await probeListeningPort(port)}  输出里读到 token=${spawned.token ? "是" : "否"}`);

    const httpStatus = await fetch(`${baseUrl}/config`, { signal: AbortSignal.timeout(4000) }).then((r) => r.status).catch((error) => `失败(${error.message})`);
    console.log(`[verify]   /config 应答=${httpStatus}`);

    const pid = findPidOnPort(port);
    console.log(`[verify] 反查监听 ${port} 的 pid = ${pid ?? "(没找到)"}`);
    console.log(`[verify] netstat 片段:\n${netstatLines()}`);

    // 配置文件里的 token 是画布自动配对的依据。
    const token = readAgentToken();
    console.log(`[verify] 配置文件里的 token=${token ? `有（${token.slice(0, 4)}****，${token.length} 字符）` : "无"}`);

    console.log("[verify] 停止 canvas-agent …");
    const stopped = await stopSpawnedAgent(baseUrl, { log: (line) => console.log(`  ${line}`) });
    console.log(`[verify] 停止结果: stopped=${stopped.stopped} detail=${stopped.detail}`);
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const stillListening = await probeListeningPort(port);
    console.log(`[verify] 停止后端口仍在监听: ${stillListening}`);
    console.log(`[verify] 停止后 netstat: ${netstatLines() || "(无)"}`);

    const ok = Boolean(pid) && stopped.stopped && !stillListening && String(httpStatus) === "200";
    console.log(ok ? "\nAGENT LIFECYCLE OK" : "\nAGENT LIFECYCLE FAILED");
    if (!ok && stillListening) {
        console.log("[verify] 兜底清理 …");
        killProcessTree(findPidOnPort(port) || 0);
    }
    process.exitCode = ok ? 0 : 1;
})().catch((error) => {
    console.error(`[verify] 异常: ${error.message}`);
    process.exitCode = 1;
});
