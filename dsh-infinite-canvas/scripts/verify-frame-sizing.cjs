/**
 * 验证面板 HTML 里的运行时尺寸逻辑：用无头浏览器渲染真实生成的 HTML，
 * 再 dump DOM 检查 iframe 上是否被写上了显式像素尺寸。
 *
 * 用法：node scripts/verify-frame-sizing.cjs [--viewport 1200x800]
 */
const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const extensionRoot = path.resolve(__dirname, "..");
const { renderHtml, buildFrameUrl } = require(path.join(extensionRoot, "out", "vscode", "html.js"));

const args = process.argv.slice(2);
const readFlag = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const [width, height] = readFlag("--viewport", "1200x800").split("x").map(Number);
const outDir = path.resolve(readFlag("--out", path.join(os.tmpdir(), "dsh-frame-sizing")));

const BROWSER_CANDIDATES = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const browser = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate));
if (!browser) {
    console.error("[verify-frame-sizing] 找不到 Chrome/Edge。");
    process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const VARIANTS = {
    无提示条: false,
    有提示条: true,
};

let failed = 0;
for (const [label, withNotice] of Object.entries(VARIANTS)) {
    const origin = "http://127.0.0.1:17373";
    const html = renderHtml({
        cspSource: "https://file+.vscode-resource.vscode-cdn.net",
        targetUrl: buildFrameUrl(origin, "http://127.0.0.1:17371"),
        agentUrl: "http://127.0.0.1:17371",
        origin,
        ...(withNotice ? { notice: "正在启动本地 canvas-agent（http://127.0.0.1:17371），就绪前画布右上角的 Agent 面板可能显示未连接。" } : {}),
    });
    // 真实环境里 iframe 加载的是本地服务；这里换成 about:blank，避免依赖网络与端口。
    const local = html.replace(/src="http:\/\/127\.0\.0\.1:17373\/#[^"]*"/, 'src="about:blank"');
    const file = path.join(outDir, `${label}.html`);
    writeFileSync(file, local);

    const dom = execFileSync(
        browser,
        [
            "--headless=new",
            "--disable-gpu",
            "--no-first-run",
            "--user-data-dir=" + path.join(outDir, `profile-${label}`),
            `--window-size=${width},${height}`,
            "--virtual-time-budget=6000",
            "--dump-dom",
            "file:///" + file.replace(/\\/g, "/"),
        ],
        { encoding: "utf8", timeout: 120000, maxBuffer: 32 * 1024 * 1024 },
    );

    const frameTag = /<iframe id="frame"[^>]*>/.exec(dom)?.[0] ?? "";
    const styleAttr = /style="([^"]*)"/.exec(frameTag)?.[1] ?? "";
    const readNumber = (name) => Number(new RegExp(`${name}:\\s*(\\d+)px`).exec(styleAttr)?.[1] ?? NaN);
    const gotWidth = readNumber("width");
    const gotHeight = readNumber("height");
    const gotTop = readNumber("top");
    const noticeHeight = Number(/--notice-height:\s*(\d+)px/.exec(dom)?.[1] ?? 0);

    const expectTop = withNotice ? noticeHeight : 0;
    const okWidth = Math.abs(gotWidth - width) <= 20;
    const okHeight = gotHeight > 0 && gotHeight <= height && Math.abs(gotHeight - (height - expectTop)) <= 20;
    const okTop = gotTop === expectTop;
    const ok = okWidth && okHeight && okTop;
    if (!ok) failed += 1;

    console.log(`\n[${label}] 视口 ${width}x${height}`);
    console.log(`  iframe 行内样式: ${styleAttr || "(无)"}`);
    console.log(`  ${okWidth ? "✓" : "✗"} width=${gotWidth}（期望 ≈ ${width}）`);
    console.log(`  ${okHeight ? "✓" : "✗"} height=${gotHeight}（期望 ≈ ${height - expectTop}）`);
    console.log(`  ${okTop ? "✓" : "✗"} top=${gotTop}（期望 ${expectTop}，提示条高 ${noticeHeight}）`);
}

console.log(failed === 0 ? "\nFRAME SIZING OK" : `\nFRAME SIZING FAILED（${failed} 项）`);
console.log(`产物目录：${outDir}`);
process.exitCode = failed === 0 ? 0 : 1;
