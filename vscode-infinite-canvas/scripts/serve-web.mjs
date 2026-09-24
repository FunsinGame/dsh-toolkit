/**
 * 脱机验证脚本：用和扩展完全相同的服务托管 web/ 并代理 canvas-agent。
 *
 * 用途：在装进 VS Code 之前，先确认上游前端产物能在本地 http 源下正常跑起来。
 *
 * 用法：
 *   node scripts/serve-web.mjs                  # http://127.0.0.1:17372
 *   node scripts/serve-web.mjs --port 18000
 *   node scripts/serve-web.mjs --agent http://127.0.0.1:17371
 *
 * 打开输出的地址即可；控制台会打印本轮可直接粘贴的带 token 链接。
 */

import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readAgentToken, normalizeAgentBaseUrl } from "../out/core/agent.js";
import { startCanvasServer } from "../out/core/server.js";
import { DEFAULT_PANEL_PORT } from "../out/core/types.js";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(extensionRoot, "web");

const args = process.argv.slice(2);
const readFlag = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const baseUrl = normalizeAgentBaseUrl(readFlag("--agent", ""));
const preferredPort = Number(readFlag("--port", String(DEFAULT_PANEL_PORT)));
const token = readAgentToken();

const versionInfo = (() => {
    try {
        return JSON.parse(readFileSync(path.join(webRoot, "vscode-infinite-canvas.json"), "utf8"));
    } catch {
        return undefined;
    }
})();

const server = await startCanvasServer(webRoot, baseUrl, token, preferredPort, versionInfo);
const hash = new URLSearchParams({ agentUrl: baseUrl, ...(token ? { agentToken: token } : {}) }).toString();

console.log("无限画布 · 本地验证服务");
console.log(`  画布地址：${server.origin}/`);
console.log(`  Agent  ：${baseUrl}${token ? "（已配对 token）" : "（未找到 token，需在画布内手动填写）"}`);
if (server.portWarning) console.log(`  提示   ：${server.portWarning}`);
console.log(`  带引导参数：${server.origin}/#${hash}`);
console.log(`  上游产物：${versionInfo ? JSON.stringify(versionInfo) : "未找到 manifest（未运行过 fetch:web？）"}`);
console.log(`  用户目录：${os.homedir()}`);
console.log("按 Ctrl+C 退出。");

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        void server.dispose().then(() => process.exit(0));
    });
}
