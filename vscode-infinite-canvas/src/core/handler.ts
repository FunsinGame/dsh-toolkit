/**
 * 本地画布服务的请求分发：静态托管上游前端产物 + 反向代理 canvas-agent。
 *
 * 该模块只用 Node 内置模块，便于在测试里直接构造 `http.createServer(createHandler(...))`。
 */

import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";
import https from "node:https";
import path from "node:path";

import { ADMIN_PATH_PREFIX, isAdminPath, isAgentPath, type CanvasServerOptions } from "./types";

/** 需要从客户端请求里剔除、由本地服务重新决定的头部。 */
const STRIPPED_REQUEST_HEADERS = new Set([
    "host",
    "origin",
    "referer",
    "connection",
    "keep-alive",
    "proxy-authorization",
    "proxy-authenticate",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "x-canvas-agent-token",
]);

/** 需要从上游响应里剔除的头部。 */
const STRIPPED_RESPONSE_HEADERS = new Set(["connection", "keep-alive", "transfer-encoding", "content-length", "content-encoding"]);

/** 静态资源的 MIME 类型。 */
const MIME_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
};

/** 请求体大小上限，与 canvas-agent 的 express.json 限制保持一致。 */
const MAX_BODY_BYTES = 32 * 1024 * 1024;

/** 创建分发给 `http.createServer` 的请求处理器。 */
export function createHandler(options: CanvasServerOptions): (req: IncomingMessage, res: ServerResponse) => void {
    const webRoot = path.resolve(options.webRoot);
    const target = new URL(options.agentBaseUrl);
    const versionJson = Buffer.from(JSON.stringify(options.versionInfo ?? {}, null, 2));

    return (req, res) => {
        void route(req, res).catch((error: unknown) => {
            if (!res.headersSent) {
                res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
            }
            res.end(`本地画布服务出错：${error instanceof Error ? error.message : String(error)}`);
        });
    };

    async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const method = (req.method ?? "GET").toUpperCase();
        const url = new URL(req.url ?? "/", options.selfOrigin);

        if (isAdminPath(url.pathname)) {
            return handleAdmin(res, method, url);
        }
        if (isAgentPath(url.pathname)) {
            return proxyToAgent(req, res, method, url, target, options.agentToken);
        }
        if (method !== "GET" && method !== "HEAD") {
            return sendText(res, 405, "method not allowed");
        }
        return serveStatic(req, res, method, url, webRoot);
    }

    function handleAdmin(res: ServerResponse, method: string, url: URL): void {
        if (method !== "GET" && method !== "HEAD") {
            return sendText(res, 405, "method not allowed");
        }
        switch (url.pathname) {
            case `${ADMIN_PATH_PREFIX}health`:
                return sendJson(res, 200, {
                    ok: true,
                    agentBaseUrl: options.agentBaseUrl,
                    hasToken: Boolean(options.agentToken),
                    webRoot,
                });
            case `${ADMIN_PATH_PREFIX}version`:
                return sendBuffer(res, 200, "application/json; charset=utf-8", versionJson);
            default:
                return sendText(res, 404, "not found");
        }
    }
}

/** 把一个请求原样转发到 canvas-agent。 */
function proxyToAgent(
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
    url: URL,
    target: URL,
    agentToken: string | undefined,
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const upstreamPath = `${target.pathname.replace(/\/$/, "")}${url.pathname}${url.search}`;
        const headers: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(req.headers)) {
            if (value === undefined) continue;
            if (STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) continue;
            headers[key] = value;
        }
        headers["origin"] = target.origin;
        headers["host"] = target.host;
        headers["accept-encoding"] = "identity";
        if (agentToken) headers["x-canvas-agent-token"] = agentToken;

        const transport = target.protocol === "https:" ? https : http;
        const upstream = transport.request(
            {
                protocol: target.protocol,
                hostname: target.hostname,
                port: target.port || (target.protocol === "https:" ? 443 : 80),
                method,
                path: upstreamPath,
                headers,
            },
            (upstreamRes) => {
                const status = upstreamRes.statusCode ?? 502;
                const responseHeaders: Record<string, string | string[]> = {};
                for (const [key, value] of Object.entries(upstreamRes.headers)) {
                    if (value === undefined) continue;
                    if (STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) continue;
                    responseHeaders[key] = value;
                }
                // SSE 必须立刻下发并且不能被任何一层缓冲。
                responseHeaders["cache-control"] = "no-store";
                if ((upstreamRes.headers["content-type"] ?? "").includes("text/event-stream")) {
                    responseHeaders["x-accel-buffering"] = "no";
                }
                res.writeHead(status, responseHeaders);
                res.socket?.setNoDelay(true);
                upstreamRes.pipe(res);
                upstreamRes.on("end", () => resolve());
                upstreamRes.on("error", reject);
            },
        );

        upstream.on("error", (error) => {
            if (!res.headersSent) {
                res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ ok: false, error: `canvas-agent 不可达：${error.message}` }));
            } else {
                res.end();
            }
            resolve();
        });

        // 客户端断开（关掉面板）时立刻掐断上游连接，避免 SSE 句柄泄漏。
        res.on("close", () => upstream.destroy());

        if (method === "GET" || method === "HEAD") {
            upstream.end();
            return;
        }
        let received = 0;
        req.on("data", (chunk: Buffer) => {
            received += chunk.length;
            if (received > MAX_BODY_BYTES) {
                upstream.destroy();
                if (!res.headersSent) res.writeHead(413, { "content-type": "text/plain; charset=utf-8" });
                res.end("request body too large");
                resolve();
                return;
            }
            upstream.write(chunk);
        });
        req.on("end", () => upstream.end());
        req.on("error", (error) => {
            upstream.destroy();
            reject(error);
        });
    });
}

/** 处理静态文件请求，带 SPA 回退。 */
async function serveStatic(req: IncomingMessage, res: ServerResponse, method: string, url: URL, webRoot: string): Promise<void> {
    const decoded = safeDecode(url.pathname);
    const relative = decoded.replace(/^\/+/, "");
    const candidate = resolveInside(webRoot, relative);

    if (candidate) {
        const info = await statOrNull(candidate);
        if (info?.isDirectory()) {
            const indexFile = path.join(candidate, "index.html");
            if (await statOrNull(indexFile)) {
                return sendFile(req, res, method, indexFile, "text/html; charset=utf-8", true);
            }
        } else if (info?.isFile()) {
            return sendFile(req, res, method, candidate, mimeType(candidate), shouldCache(candidate));
        }
    }

    // 前端用 history 路由，未知路径回退到 index.html。
    const indexFile = path.join(webRoot, "index.html");
    if (await statOrNull(indexFile)) {
        return sendFile(req, res, method, indexFile, "text/html; charset=utf-8", false);
    }
    return sendText(res, 404, "上游前端产物缺失：先运行 npm run fetch:web 生成 web/ 目录。");
}

/** 发送文件，支持 Range 之外的常见场景与 HEAD。 */
async function sendFile(
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
    filePath: string,
    contentType: string,
    immutable: boolean,
): Promise<void> {
    const info = await stat(filePath);
    const headers: Record<string, string> = {
        "content-type": contentType,
        "content-length": String(info.size),
        "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    };
    res.writeHead(200, headers);
    if (method === "HEAD") {
        res.end();
        return;
    }
    const stream = createReadStream(filePath);
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    req.on("error", () => stream.destroy());
    stream.pipe(res);
}

/** dist/assets 下的文件带内容哈希，可以长期缓存。 */
function shouldCache(filePath: string): boolean {
    return /[\\/]assets[\\/]/.test(filePath) || /-[A-Za-z0-9_]{8,}\.(?:js|css|woff2?)$/.test(filePath);
}

/** 解析 URL 路径，非法转义时返回空串。 */
function safeDecode(pathname: string): string {
    try {
        return decodeURIComponent(pathname);
    } catch {
        return "";
    }
}

/**
 * 把相对路径解析到 webRoot 之内，防止 `..` 逃逸。
 *
 * 返回 null 表示该路径不安全。
 */
function resolveInside(webRoot: string, relative: string): string | null {
    if (relative.includes("\0")) return null;
    const resolved = path.resolve(webRoot, relative);
    const withSep = webRoot.endsWith(path.sep) ? webRoot : webRoot + path.sep;
    if (resolved !== webRoot && !resolved.startsWith(withSep)) return null;
    return resolved;
}

/** 读取文件元信息，不存在或不可读时返回 null。 */
async function statOrNull(filePath: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
    try {
        return await stat(filePath);
    } catch {
        return null;
    }
}

/** 根据扩展名推断 MIME。 */
export function mimeType(filePath: string): string {
    return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/** 读取上游构建产物里的 manifest 生成信息。 */
export async function readVersionInfo(webRoot: string): Promise<import("./types").VersionInfo | undefined> {
    try {
        const raw = await readFile(path.join(webRoot, "vscode-infinite-canvas.json"), "utf8");
        return JSON.parse(raw) as import("./types").VersionInfo;
    } catch {
        return undefined;
    }
}

function sendText(res: ServerResponse, status: number, text: string): void {
    sendBuffer(res, status, "text/plain; charset=utf-8", Buffer.from(text));
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
    sendBuffer(res, status, "application/json; charset=utf-8", Buffer.from(JSON.stringify(value)));
}

function sendBuffer(res: ServerResponse, status: number, contentType: string, body: Buffer): void {
    res.writeHead(status, { "content-type": contentType, "content-length": String(body.length), "cache-control": "no-store" });
    res.end(body);
}
