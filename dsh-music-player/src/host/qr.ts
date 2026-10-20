/**
 * Bilibili QR-code login.
 *
 * The browser polls `poll(id)` once every two seconds; the host owns the
 * passport state machine and writes the cookie jar only after a confirmed
 * login. QR images are returned as SVG data URLs so the client never has to
 * render untrusted markup.
 */

import { randomUUID } from 'node:crypto'
import { toString as qrToString } from 'qrcode'
import type { BilibiliClient, CookieJar } from './bili'
import { BilibiliError, parseSetCookieHeaders, readSetCookieHeaders } from './bili'
import type { Logger } from './logger'

export const PASSPORT_BASE_URL = 'https://passport.bilibili.com'
export const PASSPORT_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BiliApp/6.66.0'

export const QR_STATUS = {
  SUCCESS: 0,
  WAITING: 86101,
  SCANNED: 86090,
  EXPIRED: 86038,
} as const

export type QrStatus = 'waiting' | 'scanned' | 'success' | 'expired' | 'cancelled' | 'error'

interface QrSession {
  id: string
  key: string
  url: string
  dataUrl: string
  createdAt: number
  lastStatus: QrStatus
  message: string
  settled: boolean
}

interface GenerateResponse {
  code: number
  message?: string
  data?: { url?: string; qrcode_key?: string }
}

interface PollResponse {
  code: number
  message?: string
  data?: { code?: number; message?: string }
}

const SESSION_TTL_MS = 5 * 60 * 1000
const MAX_WAIT_MS = 180 * 1000

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}

export class QrSessionManager {
  private readonly sessions = new Map<string, QrSession>()

  constructor(
    private readonly client: BilibiliClient,
    private readonly logger: Logger,
    private readonly onSuccess: (cookies: CookieJar) => Promise<void>,
  ) {}

  /** Replace any previous session and request a fresh QR code. */
  async start(): Promise<{ id: string; url: string; dataUrl: string; expiresInMs: number }> {
    this.prune()
    const response = await this.request(`${PASSPORT_BASE_URL}/x/passport-login/web/qrcode/generate`)
    const payload = (await response.json()) as GenerateResponse
    if (payload.code !== 0) {
      throw new BilibiliError('api', `获取二维码失败：${payload.message ?? payload.code}`, {
        code: payload.code,
      })
    }
    const url = payload.data?.url
    const key = payload.data?.qrcode_key
    if (typeof url !== 'string' || url === '' || typeof key !== 'string' || key === '') {
      throw new BilibiliError('parse', '二维码响应缺少 url 或 qrcode_key')
    }
    const svg = await qrToString(url, { type: 'svg', margin: 1, width: 240, errorCorrectionLevel: 'M' })
    const session: QrSession = {
      id: randomUUID(),
      key,
      url,
      dataUrl: svgToDataUrl(svg),
      createdAt: Date.now(),
      lastStatus: 'waiting',
      message: '请用手机 B 站 App 扫描二维码',
      settled: false,
    }
    this.sessions.set(session.id, session)
    this.logger.info('登录二维码已生成')
    return { id: session.id, url, dataUrl: session.dataUrl, expiresInMs: MAX_WAIT_MS }
  }

  /** Poll one session once. The client drives the cadence. */
  async poll(id: string): Promise<{ status: QrStatus; message: string }> {
    const session = this.sessions.get(id)
    if (session === undefined) return { status: 'expired', message: '二维码已过期，请重新获取' }
    if (session.settled) return { status: session.lastStatus, message: session.message }
    if (Date.now() - session.createdAt >= MAX_WAIT_MS) {
      return this.settle(session, 'expired', '二维码已过期，请重新获取')
    }

    let payload: PollResponse
    let cookies: CookieJar = {}
    try {
      const response = await this.request(
        `${PASSPORT_BASE_URL}/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(session.key)}`,
      )
      payload = (await response.json()) as PollResponse
      if (payload.code !== 0) {
        throw new BilibiliError('api', `轮询登录状态失败：${payload.message ?? payload.code}`, {
          code: payload.code,
        })
      }
      const code = payload.data?.code ?? QR_STATUS.WAITING
      if (code === QR_STATUS.SUCCESS) {
        cookies = parseSetCookieHeaders(readSetCookieHeaders(response.headers))
        if (Object.keys(cookies).length === 0) {
          return this.settle(session, 'error', '登录成功但没有拿到凭据，请重试')
        }
        await this.onSuccess(cookies)
        this.logger.info('扫码登录成功')
        return this.settle(session, 'success', '登录成功')
      }
      if (code === QR_STATUS.EXPIRED) {
        return this.settle(session, 'expired', '二维码已过期，请重新获取')
      }
      if (code === QR_STATUS.SCANNED) {
        session.lastStatus = 'scanned'
        session.message = '已扫描，请在手机上确认'
        return { status: 'scanned', message: session.message }
      }
      session.lastStatus = 'waiting'
      session.message = '等待扫码…'
      return { status: 'waiting', message: session.message }
    } catch (error) {
      const normalized = error instanceof BilibiliError ? error : new BilibiliError('network', String(error))
      if (normalized.kind === 'aborted') return { status: 'cancelled', message: '已取消登录' }
      this.logger.warn('轮询二维码状态失败', normalized.message)
      return { status: 'waiting', message: '网络波动，正在重试…' }
    }
  }

  cancel(id: string): void {
    const session = this.sessions.get(id)
    if (session !== undefined) this.settle(session, 'cancelled', '已取消登录')
  }

  private settle(session: QrSession, status: QrStatus, message: string): { status: QrStatus; message: string } {
    session.settled = true
    session.lastStatus = status
    session.message = message
    return { status, message }
  }

  private async request(url: string): Promise<Response> {
    const response = await this.client.fetchRaw({
      url,
      userAgent: PASSPORT_USER_AGENT,
      skipCookie: true,
      headers: { Referer: 'https://www.bilibili.com/' },
    })
    if (!response.ok) {
      throw new BilibiliError('http', `passport 接口返回 HTTP ${response.status}`, {
        httpStatus: response.status,
      })
    }
    return response
  }

  private prune(): void {
    const now = Date.now()
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > SESSION_TTL_MS) this.sessions.delete(id)
    }
  }
}
