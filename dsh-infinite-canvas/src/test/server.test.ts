/**
 * 静态托管与反向代理的行为测试。
 *
 * 用真实的 http 服务跑，避免只测到 mock 的行为。
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { readVersionInfo } from "../core/handler";
import { startCanvasServer, type RunningCanvasServer } from "../core/server";

/** 造一个假的上游前端目录。 */
function makeWebRoot(): string {
    const root = mkdtempSync(path.join(os.tmpdir(), "dsh-canvas-web-"));
    writeFileSync(path.join(root, "index.html"), "<!doctype html><div id=root></div>");
    writeFileSync(path.join(root, "config.js"), "window.__RUNTIME_CONFIG__={};");
    mkdirSync(path.join(root, "assets"));
    writeFileSync(path.join(root, "assets", "app-abc12345.js"), "console.log('app')");
    writeFileSync(path.join(root, "dsh-infinite-canvas.json"), JSON.stringify({ commit: "deadbeef", upstreamVersion: "0.1.0" }));
    return root;
}

/** 启动一个假的 canvas-agent，并记录收到的请求。 */
async function startFakeAgent(): Promise<{
    baseUrl: string;
    requests: Array<{ method: string; url: string; origin?: string; token?: string; body: string }>;
    dispose: () => Promise<void>;
}> {
    const requests: Array<{ method: string; url: string; origin?: string; token?: string; body: string }> = [];
    const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
            requests.push({
                method: req.method ?? "",
                url: req.url ?? "",
                origin: req.headers.origin as string | undefined,
                token: req.headers["x-canvas-agent-token"] as string | undefined,
                body: Buffer.concat(chunks).toString("utf8"),
            });

            if ((req.url ?? "").startsWith("/events")) {
                res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
                res.write("event: hello\ndata: {\"ok\":true}\n\n");
                return;
            }
            if ((req.url ?? "").startsWith("/config")) {
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ ok: true, protocolVersion: 6, url: "http://127.0.0.1:17371" }));
                return;
            }
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: true, method: req.method }));
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    return {
        baseUrl: `http://127.0.0.1:${port}`,
        requests,
        dispose: () =>
            new Promise<void>((resolve) => {
                server.closeAllConnections?.();
                server.close(() => resolve());
            }),
    };
}

describe("本地画布服务", () => {
    let webRoot: string;
    let agent: Awaited<ReturnType<typeof startFakeAgent>>;
    let canvas: RunningCanvasServer;

    before(async () => {
        webRoot = makeWebRoot();
        agent = await startFakeAgent();
        canvas = await startCanvasServer(webRoot, agent.baseUrl, "test-token", 0, {
            commit: "deadbeef",
            upstreamVersion: "0.1.0",
            builtAt: "2026-01-01T00:00:00.000Z",
        });
    });

    after(async () => {
        await canvas.dispose();
        await agent.dispose();
    });

    it("托管 index.html", async () => {
        const res = await fetch(`${canvas.origin}/`);
        assert.equal(res.status, 200);
        assert.match(res.headers.get("content-type") ?? "", /text\/html/);
        assert.match(await res.text(), /id=root/);
    });

    it("把未知路径回退到 index.html（前端 history 路由）", async () => {
        const res = await fetch(`${canvas.origin}/canvas/projects/whatever`);
        assert.equal(res.status, 200);
        assert.match(await res.text(), /id=root/);
    });

    it("不会把前端的 /canvas/<page> 路由误转发给 Agent", async () => {
        const before = agent.requests.length;
        const res = await fetch(`${canvas.origin}/canvas/projects/whatever`);
        assert.equal(res.status, 200);
        assert.equal(agent.requests.length, before, "页面路由不应产生对 canvas-agent 的请求");
    });

    it("按扩展名返回 MIME 并给带哈希的资源打长缓存", async () => {
        const res = await fetch(`${canvas.origin}/assets/app-abc12345.js`);
        assert.equal(res.status, 200);
        assert.match(res.headers.get("content-type") ?? "", /javascript/);
        assert.match(res.headers.get("cache-control") ?? "", /immutable/);
        assert.equal(await res.text(), "console.log('app')");
    });

    it("拒绝路径穿越", async () => {
        const res = await fetch(`${canvas.origin}/assets/%2e%2e%2f%2e%2e%2fpackage.json`);
        // 穿越被拦下后回退到 index.html，不应读到扩展目录里的文件。
        assert.equal(res.status, 200);
        assert.doesNotMatch(await res.text(), /dsh-infinite-canvas/);
    });

    it("从 web/ 的 manifest 读出版本信息", async () => {
        const info = await readVersionInfo(webRoot);
        assert.equal(info?.commit, "deadbeef");
        assert.equal(info?.upstreamVersion, "0.1.0");
        assert.equal(await readVersionInfo(path.join(webRoot, "nope")), undefined);
    });

    it("暴露管理接口并带版本信息", async () => {        const health = (await (await fetch(`${canvas.origin}/__canvas/health`)).json()) as { ok: boolean; hasToken: boolean };
        assert.equal(health.ok, true);
        assert.equal(health.hasToken, true);
        const version = (await (await fetch(`${canvas.origin}/__canvas/version`)).json()) as { commit: string };
        assert.equal(version.commit, "deadbeef");
    });

    it("把 /agent/* 转发到 canvas-agent 并注入 token 与 Origin", async () => {
        const res = await fetch(`${canvas.origin}/agent/codex/threads?token=abc`, {
            headers: { origin: "vscode-webview://xyz" },
        });
        assert.equal(res.status, 200);
        const seen = agent.requests.at(-1);
        assert.equal(seen?.url, "/agent/codex/threads?token=abc");
        assert.equal(seen?.token, "test-token");
        // Origin 必须是 canvas-agent 自己的地址，否则会被它的白名单 403。
        assert.equal(seen?.origin, agent.baseUrl);
    });

    it("转发 POST 请求体", async () => {
        const res = await fetch(`${canvas.origin}/canvas/state?token=abc&clientId=c1`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ hasCanvas: true }),
        });
        assert.equal(res.status, 200);
        const seen = agent.requests.at(-1);
        assert.equal(seen?.method, "POST");
        assert.equal(seen?.body, '{"hasCanvas":true}');
    });

    it("流式转发 SSE 且不缓冲", async () => {
        const controller = new AbortController();
        const res = await fetch(`${canvas.origin}/events?token=abc&clientId=c1`, { signal: controller.signal });
        assert.equal(res.status, 200);
        assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
        assert.equal(res.headers.get("x-accel-buffering"), "no");
        const reader = res.body?.getReader();
        const { value } = (await reader?.read()) ?? {};
        assert.match(Buffer.from(value ?? []).toString("utf8"), /event: hello/);
        controller.abort();
    });

    it("canvas-agent 不可达时返回 502 而不是崩溃", async () => {
        const dead = await startCanvasServer(webRoot, "http://127.0.0.1:1", undefined, 0);
        try {
            const res = await fetch(`${dead.origin}/agent/codex/threads`);
            assert.equal(res.status, 502);
            assert.equal(((await res.json()) as { ok: boolean }).ok, false);
        } finally {
            await dead.dispose();
        }
    });
});
