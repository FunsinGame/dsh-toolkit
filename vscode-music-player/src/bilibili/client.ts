/**
 * B 站 HTTP 客户端。
 *
 * 三件事必须由这一层统一保证：
 *
 * 1. **请求头**：B 站接口对 `User-Agent`/`Referer`/`Origin` 敏感，缺了会被风控；
 *    cookie 由我们自己管理（扩展宿主里没有浏览器 cookie jar）。
 * 2. **限流**：所有请求串行，且两次之间至少间隔 `minIntervalMs`，避免 412。
 * 3. **错误归一化**：HTTP 层、业务 code、网络异常统一成 `BilibiliError`。
 *
 * 依赖注入（cookie 读取、fetch 实现、限流间隔）让它能脱离 `vscode` 单独跑，
 * 因此可以在命令行 spike 与单测里直接使用。
 */

import { BilibiliError, toBilibiliError } from './errors';
import { getCsrfToken, serializeCookie, type CookieJar } from './cookies';
import { silentLogger, type Logger } from '../util/log';

export const BILIBILI_BASE_URL = 'https://api.bilibili.com';
export const BILIBILI_REFERER = 'https://www.bilibili.com/';
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** B 站接口的统一外壳。 */
export interface ApiEnvelope<T> {
  code: number;
  message?: string;
  msg?: string;
  data: T;
  ttl?: number;
}

export interface GetOptions {
  /** 相对于 `BASE_URL` 的路径，例如 `/x/web-interface/nav`。 */
  endpoint?: string;
  /** 完整 URL；给了它就不用 `endpoint`。 */
  fullUrl?: string;
  /** 查询参数；传字符串时必须已编码（WBI 签名串就属于这种）。 */
  params?: Record<string, string | number | undefined> | string;
  skipCookie?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** 允许的业务码（例如 `nav` 未登录返回 -101 却仍有 wbi_img）。 */
  allowCodes?: number[];
  /** 幂等 GET 的重试次数，默认取构造参数。 */
  retries?: number;
}

export interface PostOptions {
  endpoint: string;
  payload?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
  allowCodes?: number[];
  skipCookie?: boolean;
}

export interface RawRequestOptions {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** passport 接口需要手工管 cookie，默认 false。 */
  skipCookie?: boolean;
  userAgent?: string;
}

export interface BilibiliClientOptions {
  readCookies: () => CookieJar | null;
  logger?: Logger;
  /** 两次请求之间的最小间隔（毫秒），默认 350。 */
  minIntervalMs?: () => number;
  fetchImpl?: typeof fetch;
  userAgent?: string;
  /** 幂等 GET 的默认重试次数。 */
  getRetries?: number;
  defaultTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MIN_INTERVAL_MS = 350;
const DEFAULT_TIMEOUT_MS = 20_000;
const RETRY_BACKOFF_MS = 800;

/** 业务码 → 错误分类。 */
export function mapApiCode(code: number, message: string, detail?: unknown): BilibiliError {
  const text = message === '' ? `B 站接口返回 code=${code}` : message;
  switch (code) {
    case -101:
      return new BilibiliError('not-logged-in', text, { code, detail });
    case -412:
      return new BilibiliError('risk', text, { code, detail });
    case -10403:
      return new BilibiliError('vip-required', text, { code, detail });
    case -404:
    case -403:
    case -10400:
    case -10401:
      return new BilibiliError('unavailable', text, { code, detail });
    default:
      return new BilibiliError('api', text, { code, detail });
  }
}

function defaultSleep(ms: number): Promise<void> {
  // 注意：这里**不能** unref。等待重试/限流时唯一挂起的句柄就是这个计时器，
  // unref 掉会让 Node 认为无事可做而直接退出（表现为进程静默结束、后续代码不执行）。
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 组合调用方 signal 与超时。
 * 不用 `AbortSignal.timeout` 是为了显式 `clearTimeout`，避免 spike 脚本被计时器拖住。
 */
function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; done: () => void; didTimeOut: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`请求超时（${timeoutMs}ms）`));
  }, timeoutMs);

  const onAbort = (): void => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
    didTimeOut: () => timedOut,
  };
}

function buildQuery(params: GetOptions['params']): string {
  if (params === undefined) return '';
  if (typeof params === 'string') return params;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.append(key, String(value));
  }
  return search.toString();
}

export class BilibiliClient {
  private readonly logger: Logger;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private readonly sleep: (ms: number) => Promise<void>;
  private lastRequestAt = 0;
  /** 串行队列：保证同一时刻只有一个在途请求。 */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: BilibiliClientOptions) {
    this.logger = options.logger ?? silentLogger;
    this.fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** 当前 cookie jar。 */
  cookies(): CookieJar | null {
    return this.options.readCookies();
  }

  private minIntervalMs(): number {
    return this.options.minIntervalMs?.() ?? DEFAULT_MIN_INTERVAL_MS;
  }

  /** 把任务排进串行队列，并保证最小间隔。 */
  private schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = this.lastRequestAt + this.minIntervalMs() - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.lastRequestAt = Date.now();
      return task();
    };
    const next = this.queue.then(run, run);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /**
   * 发一个原始请求（不限错误码、不解析 JSON）。
   * 供二维码登录等 passport 接口使用——它们需要读 `Set-Cookie` 与自定义 UA。
   */
  async fetchRaw(options: RawRequestOptions): Promise<Response> {
    const headers: Record<string, string> = {
      'User-Agent': options.userAgent ?? this.userAgent,
      Referer: BILIBILI_REFERER,
      Origin: 'https://www.bilibili.com',
      ...options.headers,
    };
    if (options.skipCookie !== true) {
      const cookie = serializeCookie(this.cookies());
      if (cookie !== '') headers.Cookie = cookie;
    }

    const timeoutMs = options.timeoutMs ?? this.options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    return this.schedule(async () => {
      const guard = withTimeout(options.signal, timeoutMs);
      try {
        return await this.fetchImpl(options.url, {
          method: options.method ?? 'GET',
          headers,
          ...(options.body === undefined ? {} : { body: options.body }),
          signal: guard.signal,
          redirect: 'follow',
        });
      } catch (error) {
        if (guard.didTimeOut()) {
          throw new BilibiliError('network', `请求超时（${timeoutMs}ms）：${options.url}`, { cause: error });
        }
        throw toBilibiliError(error, `请求失败：${options.url}`);
      } finally {
        guard.done();
      }
    });
  }

  private async requestEnvelope<T>(options: GetOptions & { method: 'GET' | 'POST'; body?: string }): Promise<T> {
    const query = buildQuery(options.params);
    const base = options.fullUrl ?? `${BILIBILI_BASE_URL}${options.endpoint ?? ''}`;
    const url = query === '' ? base : `${base}${base.includes('?') ? '&' : '?'}${query}`;
    const retries = options.retries ?? this.options.getRetries ?? 1;
    const allowCodes = new Set(options.allowCodes ?? []);

    let attempt = 0;
    for (;;) {
      attempt++;
      this.logger.debug(`→ ${options.method} ${url}`, attempt > 1 ? { attempt } : undefined);
      try {
        const response = await this.fetchRaw({
          url,
          method: options.method,
          headers: {
            ...(options.method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
            ...options.headers,
          },
          ...(options.body === undefined ? {} : { body: options.body }),
          ...(options.signal === undefined ? {} : { signal: options.signal }),
          ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
          ...(options.skipCookie === undefined ? {} : { skipCookie: options.skipCookie }),
        });

        if (!response.ok) {
          const kind = response.status === 412 ? 'risk' : 'http';
          throw new BilibiliError(
            kind,
            `B 站返回 HTTP ${response.status} ${response.statusText}`,
            { httpStatus: response.status },
          );
        }

        let envelope: ApiEnvelope<T>;
        try {
          envelope = (await response.json()) as ApiEnvelope<T>;
        } catch (error) {
          throw new BilibiliError('parse', `响应不是合法 JSON：${url}`, { cause: error });
        }

        if (envelope.code !== 0 && !allowCodes.has(envelope.code)) {
          throw mapApiCode(envelope.code, envelope.message ?? envelope.msg ?? '', envelope.data);
        }
        return envelope.data;
      } catch (error) {
        const normalized = error instanceof BilibiliError ? error : toBilibiliError(error);
        const retryable =
          options.method === 'GET' &&
          attempt <= retries &&
          (normalized.kind === 'risk' ||
            normalized.kind === 'network' ||
            (normalized.kind === 'http' && (normalized.httpStatus ?? 0) >= 500));
        if (!retryable) throw normalized;
        this.logger.warn(`请求失败将重试（${attempt}/${retries + 1}）：${normalized.message}`);
        await this.sleep(RETRY_BACKOFF_MS);
      }
    }
  }

  /** GET 并返回 `data`。 */
  async get<T>(options: GetOptions): Promise<T> {
    return this.requestEnvelope<T>({ ...options, method: 'GET' });
  }

  /** 需要 csrf 的 POST（写操作：加/删收藏夹等）。 */
  async postWithCsrf<T>(options: PostOptions): Promise<T> {
    const csrf = getCsrfToken(this.cookies());
    if (csrf === null) {
      throw new BilibiliError('no-csrf', 'cookie 里没有 bili_jct，无法执行写操作');
    }
    const body = new URLSearchParams({ ...options.payload, csrf }).toString();
    return this.requestEnvelope<T>({ ...options, method: 'POST', body, retries: 0 });
  }
}
