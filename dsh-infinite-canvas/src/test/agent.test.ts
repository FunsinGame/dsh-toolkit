/**
 * canvas-agent 配对逻辑测试：配置解析、stdout 解析、地址规范化。
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
    agentConfigPath,
    findPidOnPort,
    killProcessTree,
    normalizeAgentBaseUrl,
    parseAgentStartupLog,
    probeListeningPort,
    readAgentConfig,
    readAgentToken,
    resolveAgentConnection,
    stopSpawnedAgent,
} from "../core/agent";
import { isAdminPath, isAgentPath } from "../core/types";

describe("canvas-agent 配对", () => {
    it("默认配置路径落在 ~/.infinite-canvas/canvas-agent.json", () => {
        const home = path.join("C:", "Users", "someone");
        assert.equal(agentConfigPath(home), path.join(home, ".infinite-canvas", "canvas-agent.json"));
    });

    it("读取已存在的 token", () => {
        const dir = mkdtempSync(path.join(os.tmpdir(), "dsh-agent-cfg-"));
        const file = path.join(dir, "canvas-agent.json");
        writeFileSync(file, JSON.stringify({ url: "http://127.0.0.1:17371", token: "abc123" }));
        assert.equal(readAgentToken(file), "abc123");
        assert.equal(readAgentConfig(file).url, "http://127.0.0.1:17371");
    });

    it("配置文件缺失或损坏时安全降级", () => {
        const dir = mkdtempSync(path.join(os.tmpdir(), "dsh-agent-bad-"));
        assert.equal(readAgentToken(path.join(dir, "nope.json")), undefined);
        const broken = path.join(dir, "broken.json");
        writeFileSync(broken, "{ not json");
        assert.deepEqual(readAgentConfig(broken), {});
        assert.equal(readAgentToken(broken), undefined);
    });

    it("从启动输出里解析 Local URL 与 Connect token", () => {
        const parsed = parseAgentStartupLog([
            "Infinite Canvas Agent",
            "Local URL: http://127.0.0.1:17371",
            "Connect token: 9f8e7d6c5b4a",
        ].join("\n"));
        assert.equal(parsed.url, "http://127.0.0.1:17371");
        assert.equal(parsed.token, "9f8e7d6c5b4a");
        assert.deepEqual(parseAgentStartupLog("nothing here"), {});
    });

    it("规范化用户填写的地址", () => {
        assert.equal(normalizeAgentBaseUrl("127.0.0.1:19000"), "http://127.0.0.1:19000");
        assert.equal(normalizeAgentBaseUrl("http://localhost:17371/"), "http://localhost:17371");
        assert.equal(normalizeAgentBaseUrl("  "), "http://127.0.0.1:17371");
        assert.equal(normalizeAgentBaseUrl(":::"), "http://127.0.0.1:17371");
    });

    it("只有拿到 token 才算配对成功", () => {
        const dir = mkdtempSync(path.join(os.tmpdir(), "dsh-agent-pair-"));
        const noToken = path.join(dir, "a.json");
        writeFileSync(noToken, JSON.stringify({ url: "http://127.0.0.1:17371" }));
        assert.equal(resolveAgentConnection("", noToken), undefined);

        const withToken = path.join(dir, "b.json");
        writeFileSync(withToken, JSON.stringify({ token: "t0ken" }));
        assert.deepEqual(resolveAgentConnection("http://127.0.0.1:19000", withToken), {
            baseUrl: "http://127.0.0.1:19000",
            token: "t0ken",
        });
    });
});

describe("进程与端口反查", () => {
    it("从 netstat 输出里解析监听端口的 pid", () => {
        const sample = [
            "",
            "活动连接",
            "",
            "  协议  本地地址          外部地址        状态           PID",
            "  TCP    127.0.0.1:17371        0.0.0.0:0              LISTENING       4321",
            "  TCP    127.0.0.1:17372        0.0.0.0:0              LISTENING       8765",
            "  TCP    127.0.0.1:50000        127.0.0.1:17371        ESTABLISHED     9999",
            "  TCP    [::1]:17371            [::]:0                 LISTENING       4321",
            "",
        ].join("\r\n");
        assert.equal(findPidOnPort(17371, sample), 4321);
        assert.equal(findPidOnPort(17372, sample), 8765);
    });

    it("忽略已建立连接与非监听状态，且不把 173710 误判为 17371", () => {
        const sample = [
            "  TCP    127.0.0.1:50000        127.0.0.1:17371        ESTABLISHED     9999",
            "  TCP    127.0.0.1:173710       0.0.0.0:0              LISTENING       1111",
            "  UDP    127.0.0.1:17371        *:*                                    2222",
        ].join("\r\n");
        assert.equal(findPidOnPort(17371, sample), undefined);
    });

    it("端口探测能区分在监听与未监听", async () => {
        const server = http.createServer((_req, res) => res.end());
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const port = (server.address() as AddressInfo).port;
        try {
            assert.equal(await probeListeningPort(port), true);
            // 真实反查应当找到本测试进程的 pid。
            assert.equal(findPidOnPort(port), process.pid);
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
        assert.equal(await probeListeningPort(port), false);
        assert.equal(findPidOnPort(port), undefined);
    });

    it("结束不存在的 pid 视为已结束且不抛异常", () => {
        const result = killProcessTree(999_999_999);
        assert.equal(result.killed, true);
        assert.match(result.detail, /已不存在|taskkill/);
    });

    it("端口上没人监听时停止操作是安全空操作，绝不杀进程", async () => {
        const result = await stopSpawnedAgent("http://127.0.0.1:19999");
        assert.equal(result.stopped, false);
        assert.match(result.detail, /没有服务在监听/);
        // 关键：当前进程必须还活着。用一次真实的文件读来证明（读到 EOF 才算数）。
        const dir = mkdtempSync(path.join(os.tmpdir(), "dsh-agent-alive-"));
        const marker = path.join(dir, "alive.txt");
        writeFileSync(marker, "alive");
        assert.equal(readFileSync(marker, "utf8"), "alive");
    });
});

describe("路径归属判断", () => {
    it("识别 forward 到 canvas-agent 的路径", () => {
        assert.equal(isAgentPath("/events"), true);
        assert.equal(isAgentPath("/agent/codex/threads"), true);
        assert.equal(isAgentPath("/agent/attachments/abc"), true);
        assert.equal(isAgentPath("/canvas/state"), true);
        assert.equal(isAgentPath("/canvas/activate"), true);
        assert.equal(isAgentPath("/canvas/result"), true);
        assert.equal(isAgentPath("/health"), false);
        assert.equal(isAgentPath("/agent"), false);
        assert.equal(isAgentPath("/index.html"), false);
    });

    it("不把前端的 /canvas/<页面> 路由当成 Agent 接口", () => {
        assert.equal(isAgentPath("/canvas/projects/abc"), false);
        assert.equal(isAgentPath("/canvas"), false);
        assert.equal(isAgentPath("/canvas/stateful"), false);
        assert.equal(isAgentPath("/eventsource"), false);
    });

    it("识别扩展自有管理接口", () => {
        assert.equal(isAdminPath("/__canvas/health"), true);
        assert.equal(isAdminPath("/canvas/state"), false);
    });
});
