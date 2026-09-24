/**
 * 本机回环媒体代理。
 *
 * 为什么需要它：
 *  - B 站音频 CDN 要求 `Referer: https://www.bilibili.com/`，webview 的 `<audio>`
 *    无法自定义请求头，直连必然 403；
 *  - 解码后的 WAV 需要支持 HTTP Range 才能拖动进度条；
 *  - 封面图同样有防盗链问题。
 *
 * 安全模型（这是一个本机服务，必须有边界）：
 *  - 只绑 `127.0.0.1`，端口由系统分配；
 *  - 每次运行一个随机 token，查询串或 `x-media-token` 头携带，timing-safe 比较；
 *  - Origin 必须是 `vscode-webview://…` 或为空（本机 curl / 单测）；
 *  - **只按登记表里的 id 取数据**，客户端无法传 URL，因此不会被当成开放代理。
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { formatContentRange, evaluateRange } from './range';
import type { GrowingBuffer } from './growingBuffer';
import type { MediaStore } from './mediaStore';
import { silentLogger, type Logger } from '../util/log';

/** 流式音频：起步至少要有的字节数（WAV 头 44 字节）。 */
const HEADER_BYTES = 64;
/** 等第一块 PCM 的上限；超过就回 503 让播放器重试。 */
const GROWING_INITIAL_WAIT_MS = 20_000;
/** 每次最多等多少新数据（太小会让播放器频繁重试，太大就退化成等整段）。 */
const GROWING_CHUNK_BYTES = 256 * 1024;
const GROWING_CHUNK_WAIT_MS = 3_000;

export interface MediaProxyOptions {
  store: MediaStore;
  logger?: Logger;
  fetchImpl?: typeof fetch;
  referer?: string;
  userAgent?: string;
  /** 流式音频：等第一块 PCM 的上限（毫秒），测试里会调小。 */
  growingInitialWaitMs?: number;
  /** 流式音频：每次最多等多少新数据。 */
  growingChunkBytes?: number;
  /** 流式音频：等这一小块的超时。 */
  growingChunkWaitMs?: number;
}

export interface RunningMediaProxy {
  port: number;
  token: string;
  /** `http://127.0.0.1:<port>` */
  origin: string;
  /** 拼一个带 token 的完整 URL。 */
  url(path: string): string;
  close(): Promise<void>;
}

const DEFAULT_REFERER = 'https://www.bilibili.com/';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
/** 登记表清理间隔。 */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(payload)),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

export async function startMediaProxy(options: MediaProxyOptions): Promise<RunningMediaProxy> {
  const logger = options.logger ?? silentLogger;
  const store = options.store;
  const token = randomBytes(32).toString('base64url');
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const referer = options.referer ?? DEFAULT_REFERER;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const initialWaitMs = options.growingInitialWaitMs ?? GROWING_INITIAL_WAIT_MS;
  const chunkBytes = options.growingChunkBytes ?? GROWING_CHUNK_BYTES;
  const chunkWaitMs = options.growingChunkWaitMs ?? GROWING_CHUNK_WAIT_MS;
  const sockets = new Set<import('node:net').Socket>();

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      logger.error('媒体代理处理请求失败', error);
      sendJson(res, 500, { error: 'internal error' });
    });
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('媒体代理无法绑定端口');
  }
  const port = address.port;
  const origin = `http://127.0.0.1:${port}`;
  logger.info(`媒体代理已启动：${origin}`);

  const sweepTimer = setInterval(() => {
    const removed = store.sweep();
    if (removed > 0) logger.debug(`媒体登记表清理了 ${removed} 个过期条目`);
  }, SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();

  function originAllowed(req: IncomingMessage): boolean {
    const header = req.headers.origin;
    if (header === undefined || header === '') return true;
    return header.startsWith('vscode-webview://') || header === origin;
  }

  function tokenOk(req: IncomingMessage, url: URL): boolean {
    const fromHeader = req.headers['x-media-token'];
    const headerValue = Array.isArray(fromHeader) ? fromHeader[0] : fromHeader;
    const value = headerValue ?? url.searchParams.get('token') ?? '';
    return safeEqual(value, token);
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', origin);
    const pathname = url.pathname;
    const method = req.method ?? 'GET';

    if (!originAllowed(req)) {
      sendJson(res, 403, { error: 'origin not allowed' });
      return;
    }
    if (!tokenOk(req, url)) {
      sendJson(res, 401, { error: 'missing or invalid token' });
      return;
    }
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' });
      res.end();
      return;
    }

    if (pathname === '/health') {
      sendJson(res, 200, { ok: true, ...store.stats() });
      return;
    }

    const match = /^\/(audio|img)\/([0-9a-f]{24})$/.exec(pathname);
    if (!match) {
      sendJson(res, 404, { error: `no route for ${method} ${pathname}` });
      return;
    }
    const [, kind, id] = match as unknown as [string, 'audio' | 'img', string];

    const entry = store.get(id);
    if (!entry || entry.kind !== (kind === 'audio' ? 'audio' : 'image')) {
      sendJson(res, 404, { error: 'media not found or expired' });
      return;
    }

    // 上游条目（图片）先取回内存，之后走同一套 Range 逻辑，顺便得到进程内缓存。
    if (entry.bytes === null && entry.upstreamUrl !== null) {
      try {
        const upstream = await fetchImpl(entry.upstreamUrl, {
          headers: { Referer: referer, 'User-Agent': userAgent },
        });
        if (!upstream.ok) {
          logger.warn(`上游媒体返回 ${upstream.status}：${entry.label}`);
          sendJson(res, 502, { error: `upstream ${upstream.status}` });
          return;
        }
        entry.bytes = Buffer.from(await upstream.arrayBuffer());
        const upstreamType = upstream.headers.get('content-type');
        if (upstreamType !== null && upstreamType !== '') entry.contentType = upstreamType;
      } catch (error) {
        logger.warn(`拉取上游媒体失败：${entry.label}`, error);
        sendJson(res, 502, { error: 'upstream fetch failed' });
        return;
      }
    }

    const bytes = entry.bytes;
    if (bytes !== null) {
      serveBytes(req, res, bytes, entry.contentType);
      return;
    }
    if (entry.growing !== null) {
      await serveGrowing(req, res, entry.growing, entry.contentType);
      return;
    }
    sendJson(res, 404, { error: 'media has no data' });
  }

  /**
   * 边写边播的音频：只回「已经写好」的那一段。
   *
   * 关键点是**不能**等整段写完：Chromium 第一次通常请求 `bytes=0-`（开区间，等于
   * 要整段），如果照字面等下去，流式起播就退化成了「等全部下完」。所以这里只等
   * 「再攒一小块」，然后用 `Content-Range: bytes start-end/total` 回一个合法的短
   * 206，播放器会接着要下一段。
   */
  async function serveGrowing(
    req: IncomingMessage,
    res: ServerResponse,
    growing: GrowingBuffer,
    contentType: string,
  ): Promise<void> {
    const total = growing.capacity;
    // 一个字节都还没有（WAV 头都没写出来）：等一下，否则播放器会因为 503 放弃。
    if (growing.availableBytes === 0 && !growing.isComplete) {
      const ready = await growing.waitForAtLeast(HEADER_BYTES, initialWaitMs);
      if (!ready) {
        res.writeHead(503, { 'retry-after': '1' });
        res.end();
        return;
      }
    }

    const outcome = evaluateRange(req.headers.range ?? null, total);
    const start = outcome.status === 'partial' ? outcome.range.start : 0;
    const requestedEnd = outcome.status === 'partial' ? outcome.range.end : total - 1;

    // 再等一小块，让响应不至于只回几个字节。
    if (!growing.isComplete && growing.availableBytes <= start) {
      await growing.waitForAtLeast(Math.min(requestedEnd + 1, start + chunkBytes), chunkWaitMs);
    }

    const available = growing.availableBytes;
    if (available <= start) {
      res.writeHead(503, { 'retry-after': '1' });
      res.end();
      return;
    }

    const end = Math.min(requestedEnd, available - 1);
    const slice = growing.buffer.subarray(start, end + 1);
    const headers: Record<string, string> = {
      'content-type': contentType,
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=3600',
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range, content-length, accept-ranges',
      'content-length': String(slice.byteLength),
    };
    if (start === 0 && end === total - 1) {
      res.writeHead(200, headers);
    } else {
      res.writeHead(206, { ...headers, 'content-range': formatContentRange({ start, end }, total) });
    }
    if (req.method === 'HEAD') res.end();
    else res.end(slice);
  }

  /** 带 Range 的字节服务。 */
  function serveBytes(
    req: IncomingMessage,
    res: ServerResponse,
    bytes: Buffer,
    contentType: string,
  ): void {
    const total = bytes.byteLength;
    const outcome = evaluateRange(req.headers.range ?? null, total);
    const baseHeaders: Record<string, string> = {
      'content-type': contentType,
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=3600',
      // `<audio>` 不需要 CORS，但允许它以后需要时（例如 Web Audio / fetch）能用。
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range, content-length, accept-ranges',
    };

    if (outcome.status === 'unsatisfiable') {
      res.writeHead(416, { 'content-range': `bytes */${total}` });
      res.end();
      return;
    }

    if (outcome.status === 'none') {
      res.writeHead(200, { ...baseHeaders, 'content-length': String(total) });
      if (req.method === 'HEAD') res.end();
      else res.end(bytes);
      return;
    }

    const { range } = outcome;
    const slice = bytes.subarray(range.start, range.end + 1);
    res.writeHead(206, {
      ...baseHeaders,
      'content-length': String(slice.byteLength),
      'content-range': formatContentRange(range, total),
    });
    if (req.method === 'HEAD') res.end();
    else res.end(slice);
  }

  return {
    port,
    token,
    origin,
    url: (path: string) => `${origin}${path}${path.includes('?') ? '&' : '?'}token=${token}`,
    close: async () => {
      clearInterval(sweepTimer);
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      logger.info('媒体代理已关闭');
    },
  };
}
