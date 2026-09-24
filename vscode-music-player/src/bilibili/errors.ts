/**
 * B 站接口错误。
 *
 * 把 HTTP 层、业务码层、字节流层的失败统一成一种类型，并给出一句能直接展示给
 * 用户的中文说明；调用方（播放器 / UI）只需要看 `kind` 与 `userMessage`。
 */

export type BilibiliErrorKind =
  /** 请求被主动取消（AbortSignal）。 */
  | 'aborted'
  /** 网络不可达、DNS、超时等。 */
  | 'network'
  /** HTTP 状态码异常（4xx/5xx）。 */
  | 'http'
  /** HTTP 200 但业务 code 非 0。 */
  | 'api'
  /** 响应体不是预期的 JSON / 字段缺失。 */
  | 'parse'
  /** 未登录或登录已过期（code -101）。 */
  | 'not-logged-in'
  /** 触发风控（HTTP 412 / code -412）。 */
  | 'risk'
  /** 需要大会员（code -10403）。 */
  | 'vip-required'
  /** 视频不存在 / 已下架 / 无权限。 */
  | 'unavailable'
  /** 写操作缺少 csrf（bili_jct）。 */
  | 'no-csrf';

export interface BilibiliErrorOptions {
  code?: number;
  httpStatus?: number;
  detail?: unknown;
  cause?: unknown;
}

export class BilibiliError extends Error {
  readonly kind: BilibiliErrorKind;
  /** B 站业务码（`code` 字段）。 */
  readonly code: number | undefined;
  /** HTTP 状态码。 */
  readonly httpStatus: number | undefined;
  /** 原始响应片段，便于排查。 */
  readonly detail: unknown;

  constructor(kind: BilibiliErrorKind, message: string, options: BilibiliErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'BilibiliError';
    this.kind = kind;
    this.code = options.code;
    this.httpStatus = options.httpStatus;
    this.detail = options.detail;
  }

  /** 面向用户的一句话说明。 */
  get userMessage(): string {
    switch (this.kind) {
      case 'aborted':
        return '请求已取消';
      case 'network':
        return '网络连接失败，请检查网络或代理设置';
      case 'http':
        return `B 站返回异常状态（HTTP ${this.httpStatus ?? '未知'}）`;
      case 'parse':
        return 'B 站返回的数据无法解析，接口可能已变更';
      case 'not-logged-in':
        return '未登录或登录已过期，请重新扫码登录';
      case 'risk':
        return 'B 站触发了风控校验，请稍后再试';
      case 'vip-required':
        return '该曲目需要大会员';
      case 'unavailable':
        return '该视频不存在或已被删除';
      case 'no-csrf':
        return '登录凭据不完整，无法执行写操作，请重新登录';
      case 'api':
        return this.message === '' ? `B 站接口返回错误（${this.code ?? '未知'}）` : this.message;
      default:
        return this.message;
    }
  }
}

/** 把任意异常归一化为 `BilibiliError`。 */
export function toBilibiliError(error: unknown, fallbackMessage = '未知错误'): BilibiliError {
  if (error instanceof BilibiliError) return error;
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new BilibiliError('aborted', '请求已取消', { cause: error });
    }
    return new BilibiliError('network', `${fallbackMessage}：${error.message}`, { cause: error });
  }
  return new BilibiliError('network', `${fallbackMessage}：${String(error)}`);
}
