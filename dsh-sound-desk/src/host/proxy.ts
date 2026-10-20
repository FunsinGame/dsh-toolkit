/**
 * Loopback proxy for the engine's HTTP surface.
 *
 * Why a proxy at all: the engine is a standalone server with its own random port
 * and a per-run session token, while the workbench is a React page living in the
 * DSH document. Mounting the engine's routes under DSH's own origin removes the
 * whole class of problems a second origin creates — CORS, the token handshake,
 * audio elements that cannot send headers, and a desktop renderer that would
 * otherwise need a second authenticated origin.
 *
 * The proxy owns three details:
 *   - the real session token, injected on every request (the page never sees it);
 *   - `Origin`/`Referer` removed, because the engine's CSRF fence answers only to
 *     its own origin and the request is already authenticated by DSH;
 *   - streaming both ways, so Range seeking and large uploads keep working.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { request as httpRequest } from 'node:http'

import { errorMessage } from './engine'
import type { Logger } from './log'

export interface ProxyTarget {
  host: string
  port: number
  token: string
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/** Headers the browser sends for its own origin and the engine must not see. */
const STRIPPED_REQUEST = new Set(['host', 'origin', 'referer', 'cookie', 'x-sounddesk-token', 'accept-encoding'])

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

export function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  target: ProxyTarget,
  upstreamPath: string,
  log: Logger,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const headers: Record<string, string | string[]> = {}
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined) continue
      const key = name.toLowerCase()
      if (STRIPPED_REQUEST.has(key) || HOP_BY_HOP.has(key)) continue
      headers[key] = value
    }
    headers['x-sounddesk-token'] = target.token
    // The engine never gzips; asking for it only makes the browser wait longer for
    // the first byte of a media range.
    headers['accept-encoding'] = 'identity'

    const upstream = httpRequest(
      {
        host: target.host,
        port: target.port,
        method: req.method,
        path: upstreamPath,
        headers,
      },
      (upstreamRes) => {
        const status = upstreamRes.statusCode ?? 502
        const outgoing: Record<string, string | string[]> = {}
        for (const [name, value] of Object.entries(upstreamRes.headers)) {
          if (value === undefined) continue
          const key = name.toLowerCase()
          // CORS is meaningless same-origin, and echoing the engine's origin would
          // only confuse the browser's cache.
          if (HOP_BY_HOP.has(key) || key.startsWith('access-control-')) continue
          outgoing[key] = value
        }
        res.writeHead(status, outgoing)
        upstreamRes.pipe(res)
        upstreamRes.on('end', () => resolve())
        upstreamRes.on('error', () => {
          res.destroy()
          resolve()
        })
      },
    )

    upstream.on('error', (error) => {
      log.warn(`proxy ${req.method} ${upstreamPath} failed: ${errorMessage(error)}`)
      if (!res.headersSent) {
        sendJson(res, 502, { error: `无法连接本地引擎：${errorMessage(error)}` })
      } else {
        res.destroy()
      }
      resolve()
    })

    // A browser that navigates away mid-upload must not leave the engine reading.
    res.on('close', () => {
      if (!res.writableEnded) upstream.destroy()
    })

    req.pipe(upstream)
  })
}

export function sendProxyError(res: ServerResponse, error: unknown): void {
  sendJson(res, 503, { error: `本地引擎不可用：${errorMessage(error)}` })
}
