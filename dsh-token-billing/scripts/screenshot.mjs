/**
 * 用真实 Chromium 渲染 `scripts/harness.html`，生成 README 截图。
 *
 *   node scripts/screenshot.mjs [outfile]
 */
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = process.argv[2] ?? join(root, "docs", "screenshot.png");

const requireFrom = createRequire(
  join(root, "..", "dsh-music-player", "package.json"),
);
const { chromium } = requireFrom("playwright-core");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = url.pathname === "/" ? "/scripts/harness.html" : url.pathname;
    const file = join(root, path.replace(/^\/+/, ""));
    if (!file.startsWith(root)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, {
      "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const executablePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch {
  browser = await chromium.launch({ headless: true, executablePath });
}
const page = await browser.newPage({
  viewport: { width: 1180, height: 1480 },
  deviceScaleFactor: 2,
});
page.on("console", (message) => console.log(`[page] ${message.type()}: ${message.text()}`));
page.on("pageerror", (error) => console.error(`[page error] ${error.message}`));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await mkdir(dirname(out), { recursive: true });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
server.close();
console.log(`wrote ${out}`);
