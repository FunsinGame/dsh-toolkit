/**
 * 面板 HTML 与端口顺延的测试。
 */

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { startCanvasServer } from "../core/server";
import { buildFrameUrl, renderHtml, renderSidebarHtml, type SidebarState } from "../vscode/html";

const ORIGIN = "http://127.0.0.1:17372";
const AGENT_URL = "http://127.0.0.1:17371";

function makeWebRoot(): string {
    const root = mkdtempSync(path.join(os.tmpdir(), "dsh-canvas-html-"));
    writeFileSync(path.join(root, "index.html"), "<!doctype html><div id=root></div>");
    return root;
}

describe("iframe 目标地址", () => {
    it("把 agentUrl 与 agentToken 放进 URL 片段（上游的引导参数）", () => {
        const url = buildFrameUrl("http://127.0.0.1:17372/", AGENT_URL, "abc 123");
        assert.equal(url, `http://127.0.0.1:17372/#agentUrl=http%3A%2F%2F127.0.0.1%3A17371&agentToken=abc+123`);
    });

    it("没有 token 时只带 agentUrl", () => {
        assert.equal(buildFrameUrl(ORIGIN, AGENT_URL), `http://127.0.0.1:17372/#agentUrl=http%3A%2F%2F127.0.0.1%3A17371`);
    });
});

describe("面板 HTML", () => {
    const html = renderHtml({
        cspSource: "https://file+.vscode-resource.vscode-cdn.net",
        targetUrl: buildFrameUrl(ORIGIN, AGENT_URL, "abc"),
        agentUrl: AGENT_URL,
        origin: ORIGIN,
        notice: "端口 17372 被占用，已改用 17373",
    });

    it("不再自设 meta CSP（由 VS Code 注入策略，自设会连自己的脚本一起拦掉）", () => {
        // 实测结论：VS Code 会剥掉 webview HTML 里脚本的 nonce 属性，
        // 一旦我们自己写 meta CSP，script-src 里的 nonce 就对不上，所有脚本都不执行。
        assert.doesNotMatch(html, /http-equiv="Content-Security-Policy"/);
        assert.doesNotMatch(html, /script-src/);
    });

    it("脚本仍带 nonce 属性（VS Code 会替换成它自己的 nonce）", () => {
        assert.match(html, /<script nonce="[A-Za-z0-9]+">/);
        assert.match(html, /<style nonce="[A-Za-z0-9]+">/);
    });

    it("允许 iframe 使用剪贴板（画布需要复制/粘贴图片）", () => {
        assert.match(html, /allow="clipboard-read; clipboard-write; fullscreen"/);
    });

    it("iframe 指向带引导参数的地址", () => {
        assert.match(html, /id="frame" src="http:\/\/127\.0\.0\.1:17372\/#agentUrl=/);
    });

    it("iframe 被强制铺满容器（不能停在 300x150 的固有尺寸）", () => {
        // 这是实际踩过的坑：只给 width:100% + flex 拉伸时，跨源 iframe 会停在默认尺寸，
        // 画布缩在左上角一个小盒子里。必须由父页面用绝对定位铺满。
        const frameRule = /#frame\s*\{([^}]*)\}/.exec(html)?.[1] ?? "";
        assert.ok(frameRule, "应当有 #frame 规则");
        assert.match(frameRule, /position:\s*absolute/);
        assert.match(frameRule, /inset:\s*0/);
        assert.match(frameRule, /height:\s*100%/);
        // 旧的 flex 拉伸写法不应再出现，否则说明改动被回退了。
        assert.doesNotMatch(frameRule, /flex\s*:/);
    });

    it("有提示条时让出高度，并动态量取提示条真实高度", () => {
        assert.match(html, /<body class="has-notice">/);
        assert.match(html, /body\.has-notice #frame\s*\{[^}]*--notice-height/);
        assert.match(html, /setProperty\("--notice-height"/);
        // 无提示时不应给 body 加这个类，避免画布被无谓地上移。
        // 注意只看 <body> 标签本身：样式表里也有 .has-notice 规则，不能整篇匹配。
        const plain = renderHtml({
            cspSource: "https://cdn.example",
            targetUrl: buildFrameUrl(ORIGIN, AGENT_URL),
            agentUrl: AGENT_URL,
            origin: ORIGIN,
        });
        assert.match(plain, /<body>/);
        assert.doesNotMatch(plain, /<body class="has-notice">/);
    });

    it("运行时用像素显式设置 iframe 尺寸（不依赖宿主是否应用 CSS）", () => {
        // 这是修"画布只占左上角 300x150"的第二道保险：直接在脚本里算尺寸写行内样式。
        assert.match(html, /const applyFrameBox = \(\) => \{/);
        assert.match(html, /frame\.style\.width = width \+ "px"/);
        assert.match(html, /frame\.style\.height = height \+ "px"/);
        assert.match(html, /document\.body\.clientWidth/);
        assert.match(html, /new ResizeObserver\(applyFrameBox\)/);
        assert.match(html, /window\.addEventListener\("resize", applyFrameBox\)/);
        // 有提示条时高度要减掉提示条，无提示时减 0。
        assert.match(html, /const hasNotice = true;/);
        const plain = renderHtml({
            cspSource: "https://cdn.example",
            targetUrl: buildFrameUrl(ORIGIN, AGENT_URL),
            agentUrl: AGENT_URL,
            origin: ORIGIN,
        });
        assert.match(plain, /const hasNotice = false;/);
    });

    it("诊断挂在真实生命周期事件上，不只依赖定时器", () => {
        assert.match(html, /postDiagnostics\("immediate"\)/);
        assert.match(html, /window\.addEventListener\("load", \(\) => postDiagnostics\("load"\)\)/);
        assert.match(html, /window\.addEventListener\("resize", \(\) => postDiagnostics\("resize"\)\)/);
    });

    it("不用任何超时/fetch 探测服务是否可达（会误杀已加载好的画布）", () => {
        // 实测：webview 里跨源 fetch 本机被拦，且定时器会被宿主暂停，
        // 超时兜底会在面板重新可见时误触发，把好画布换成错误页。
        assert.doesNotMatch(html, /fetch\(/);
        assert.doesNotMatch(html, /frameLoaded/);
        assert.doesNotMatch(html, /replaceWith\(empty\)[\s\S]{0,40}setTimeout/);
        // 仅保留 iframe 的 error 事件兜底。
        assert.match(html, /frame\.addEventListener\("error", \(\) => \{\s*frame\.replaceWith\(empty\);/);
    });

    it("原样转义提示信息", () => {
        assert.match(html, /端口 17372 被占用，已改用 17373/);
    });
});

describe("活动栏侧边栏 HTML", () => {
    const ready: SidebarState = {
        webReady: true,
        canvasRunning: true,
        canvasStatus: "127.0.0.1:17372",
        agentReachable: true,
        agentStatus: "v6",
        paired: true,
    };

    it("状态正常时主按钮可用且四项状态都渲染出来", () => {
        const html = renderSidebarHtml(ready);
        assert.match(html, /id="open">打开无限画布<\/button>/);
        assert.doesNotMatch(html, /id="open" disabled/);
        assert.match(html, /127\.0\.0\.1:17372/);
        assert.match(html, /v6/);
        assert.match(html, /已自动配对/);
        // 全部正常 -> 4 个 ok 圆点
        assert.equal((html.match(/class="dot ok"/g) ?? []).length, 4);
    });

    it("产物缺失时禁用主按钮并给出构建提示", () => {
        const html = renderSidebarHtml({ ...ready, webReady: false, canvasRunning: false, canvasStatus: "未启动", agentReachable: false, agentStatus: "未运行", paired: false });
        assert.match(html, /id="open" disabled/);
        assert.match(html, /npm run fetch:web/);
        assert.match(html, /需手动填写/);
        assert.equal((html.match(/class="dot ok"/g) ?? []).length, 0);
    });

    it("脚本使用 acquireVsCodeApi，且不自设会拦掉自己的 meta CSP", () => {
        const html = renderSidebarHtml(ready);
        assert.match(html, /acquireVsCodeApi\(\)/);
        assert.match(html, /<script nonce="[A-Za-z0-9]+">/);
        assert.doesNotMatch(html, /http-equiv="Content-Security-Policy"/);
        assert.doesNotMatch(html, /script-src/);
    });

    it("转义端口提示，避免注入", () => {
        const html = renderSidebarHtml({ ...ready, notice: `<img src=x onerror="alert(1)">` });
        assert.doesNotMatch(html, /onerror="alert\(1\)"/);
        assert.match(html, /&lt;img src=x/);
    });
});

describe("端口占用处理", () => {
    it("首选端口被占用时顺延并给出提示", async () => {
        const blocker = http.createServer((_req, res) => res.end("busy"));
        await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
        const busyPort = (blocker.address() as AddressInfo).port;

        const canvas = await startCanvasServer(makeWebRoot(), AGENT_URL, undefined, busyPort);
        try {
            assert.notEqual(canvas.port, busyPort);
            assert.equal(canvas.port, busyPort + 1);
            assert.match(canvas.portWarning ?? "", /被占用/);
            const res = await fetch(`${canvas.origin}/__canvas/health`);
            assert.equal(res.status, 200);
        } finally {
            await canvas.dispose();
            await new Promise<void>((resolve) => blocker.close(() => resolve()));
        }
    });
});
