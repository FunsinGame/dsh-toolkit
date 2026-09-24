/**
 * 扫码登录流程。
 *
 * 用 B 站的 passport 二维码接口，四步状态机：
 *
 *   generate → 拿到 `url` + `qrcode_key`，把 url 渲染成二维码给用户扫
 *   waiting  (86101) → 还没扫
 *   scanned  (86090) → 已扫，等手机上确认
 *   success  (0)     → 响应头里带 Set-Cookie，收下来就是登录凭据
 *   expired  (86038) → 二维码过期，需要重新生成
 *
 * 这里刻意不依赖 `vscode`：`fetchRaw` 由外部注入，`sleep` 可替换，因此整条状态机
 * 能在单测里跑完。cookie 的解析复用 `bilibili/cookies.ts`（它处理了 undici 把多条
 * `Set-Cookie` 合并成一个字符串、而 `Expires` 里带逗号这个坑）。
 */

import { toString as qrToString } from 'qrcode';

import type { RawRequestOptions } from '../bilibili/client';
import { BilibiliError } from '../bilibili/errors';
import { parseSetCookieHeaders, readSetCookieHeaders, type CookieJar } from '../bilibili/cookies';
import { silentLogger, type Logger } from '../util/log';

export const PASSPORT_BASE_URL = 'https://passport.bilibili.com';
/** passport 接口用 App 的 UA，用桌面 UA 有时会被要求额外校验。 */
export const PASSPORT_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BiliApp/6.66.0';

/** 二维码接口的状态码。 */
export const QR_STATUS = {
  SUCCESS: 0,
  WAITING: 86101,
  SCANNED: 86090,
  EXPIRED: 86038,
} as const;

export type QrLoginStatus = 'waiting' | 'scanned' | 'success' | 'expired' | 'cancelled' | 'error';

export class QrLoginError extends Error {
  constructor(
    readonly kind: 'expired' | 'cancelled' | 'failed',
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'QrLoginError';
  }
}

export interface QrLoginOptions {
  /** 由扩展宿主注入（带限流与统一请求头的原始请求）。 */
  fetchRaw: (options: RawRequestOptions) => Promise<Response>;
  logger?: Logger;
  /** 轮询间隔，默认 2000ms。 */
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** 二维码最长等待时间（毫秒），默认 180s。 */
  maxWaitMs?: number;
  /** 连续网络失败多少次后放弃，默认 3。 */
  maxConsecutiveFailures?: number;
}

export interface QrLoginCallbacks {
  /** 二维码就绪（`svg` 直接给 webview 显示）。 */
  onQrCode?: (payload: { url: string; svg: string }) => void;
  onStatus?: (status: QrLoginStatus, message: string) => void;
}

interface GenerateResponse {
  code: number;
  message?: string;
  data?: { url?: string; qrcode_key?: string };
}

interface PollResponse {
  code: number;
  message?: string;
  data?: { code?: number; message?: string };
}

/** 把登录 url 渲染成 SVG 字符串。 */
export async function renderQrSvg(url: string, size = 220): Promise<string> {
  return qrToString(url, { type: 'svg', margin: 1, width: size, errorCorrectionLevel: 'M' });
}

/**
 * 把 SVG 包成 data URL。
 *
 * 用 `<img src="data:image/svg+xml;base64,…">` 而不是把 SVG 直接 innerHTML 进去：
 * CSP 里已经放行了 `data:`，同时避免把外部内容当 HTML 注入到 webview。
 */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

export class QrLoginFlow {
  private cancelled = false;
  private readonly logger: Logger;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: QrLoginOptions) {
    this.logger = options.logger ?? silentLogger;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** 取消正在进行的流程（用户点了「取消」或关闭了视图）。 */
  cancel(): void {
    this.cancelled = true;
  }

  get isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * 跑完整流程。成功返回 cookie jar；失败/过期/取消抛出 `QrLoginError`。
   */
  async run(callbacks: QrLoginCallbacks = {}): Promise<CookieJar> {
    const status = callbacks.onStatus ?? (() => undefined);
    if (this.cancelled) throw new QrLoginError('cancelled', '已取消登录');
    status('waiting', '正在获取二维码…');

    const { url, key } = await this.generate();
    const svg = await renderQrSvg(url);
    callbacks.onQrCode?.({ url, svg });
    status('waiting', '请用手机 B 站 App 扫描二维码');

    const deadline = Date.now() + (this.options.maxWaitMs ?? 180_000);
    const interval = this.options.pollIntervalMs ?? 2000;
    const maxFailures = this.options.maxConsecutiveFailures ?? 3;
    let failures = 0;

    while (true) {
      if (this.cancelled) {
        status('cancelled', '已取消登录');
        throw new QrLoginError('cancelled', '已取消登录');
      }
      if (Date.now() >= deadline) {
        status('expired', '二维码已过期，请重新获取');
        throw new QrLoginError('expired', '二维码已过期（等待超时）');
      }

      await this.sleep(interval);
      if (this.cancelled) {
        status('cancelled', '已取消登录');
        throw new QrLoginError('cancelled', '已取消登录');
      }

      let result: { qrCode: number; cookies: CookieJar; message: string };
      try {
        result = await this.poll(key);
      } catch (error) {
        if (error instanceof QrLoginError) throw error;
        failures++;
        this.logger.warn(`轮询二维码状态失败（第 ${failures}/${maxFailures} 次）`, error);
        if (failures >= maxFailures) {
          status('error', '网络异常，登录失败');
          throw new QrLoginError('failed', '轮询登录状态连续失败', error);
        }
        continue;
      }
      failures = 0;

      if (result.qrCode === QR_STATUS.SUCCESS) {
        if (Object.keys(result.cookies).length === 0) {
          status('error', '登录成功但没有拿到凭据');
          throw new QrLoginError('failed', '登录响应里没有 Set-Cookie');
        }
        status('success', '登录成功');
        return result.cookies;
      }
      if (result.qrCode === QR_STATUS.EXPIRED) {
        status('expired', '二维码已过期，请重新获取');
        throw new QrLoginError('expired', '二维码已过期');
      }
      if (result.qrCode === QR_STATUS.SCANNED) {
        status('scanned', '已扫描，请在手机上确认');
        continue;
      }
      status('waiting', '等待扫码…');
    }
  }

  /** 申请二维码。 */
  private async generate(): Promise<{ url: string; key: string }> {
    const response = await this.request(
      `${PASSPORT_BASE_URL}/x/passport-login/web/qrcode/generate`,
    );
    const payload = (await response.json()) as GenerateResponse;
    if (payload.code !== 0) {
      throw new QrLoginError('failed', `获取二维码失败：${payload.message ?? payload.code}`);
    }
    const url = payload.data?.url;
    const key = payload.data?.qrcode_key;
    if (typeof url !== 'string' || url === '' || typeof key !== 'string' || key === '') {
      throw new QrLoginError('failed', '二维码响应缺少 url 或 qrcode_key');
    }
    return { url, key };
  }

  /** 轮询一次状态；成功时顺带解析 Set-Cookie。 */
  private async poll(key: string): Promise<{ qrCode: number; cookies: CookieJar; message: string }> {
    const response = await this.request(
      `${PASSPORT_BASE_URL}/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(key)}`,
    );
    const payload = (await response.json()) as PollResponse;
    if (payload.code !== 0) {
      throw new QrLoginError('failed', `轮询登录状态失败：${payload.message ?? payload.code}`);
    }
    const qrCode = payload.data?.code ?? QR_STATUS.WAITING;
    const cookies =
      qrCode === QR_STATUS.SUCCESS
        ? parseSetCookieHeaders(readSetCookieHeaders(response.headers))
        : {};
    return { qrCode, cookies, message: payload.data?.message ?? '' };
  }

  /** 统一的原始请求（passport 接口不需要带我们自己的 cookie）。 */
  private async request(url: string): Promise<Response> {
    let response: Response;
    try {
      response = await this.options.fetchRaw({
        url,
        userAgent: PASSPORT_USER_AGENT,
        skipCookie: true,
        headers: { Referer: 'https://www.bilibili.com/' },
      });
    } catch (error) {
      if (error instanceof BilibiliError && error.kind === 'aborted') {
        throw new QrLoginError('cancelled', '请求已取消', error);
      }
      throw error;
    }
    if (!response.ok) {
      throw new QrLoginError('failed', `passport 接口返回 HTTP ${response.status}`);
    }
    return response;
  }
}
