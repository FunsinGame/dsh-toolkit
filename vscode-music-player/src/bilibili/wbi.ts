/**
 * WBI 签名。
 *
 * B 站的 `/wbi/` 系列接口（搜索、playurl、用户空间等）要求参数按规则打乱后再用
 * `img_key`/`sub_key` 生成的 mixin key 做 MD5。`img_key`/`sub_key` 来自
 * `/x/web-interface/nav`，按自然日轮换，因此缓存到当天结束。
 *
 * 注意：签名是对**编码后**的查询串算的，调用方必须原样发送这个串——用
 * `URLSearchParams` 重新编码会把空格变成 `+`，签名立刻失效。
 */

import { createHash } from 'node:crypto';

import type { Logger } from '../util/log';
import { silentLogger } from '../util/log';

/** 官方给出的字符重排表。 */
export const MIXIN_KEY_ENC_TAB: readonly number[] = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28,
  14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54,
  21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

/** 把 `img_key + sub_key` 重排成 32 位 mixin key。 */
export function getMixinKey(orig: string): string {
  return MIXIN_KEY_ENC_TAB.map((index) => orig[index] ?? '').join('').slice(0, 32);
}

/** 从 wbi 图片地址里取出 key（去掉目录与扩展名）。 */
export function wbiKeyFromUrl(url: string): string {
  const name = url.slice(url.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** 生成带 `wts` 与 `w_rid` 的查询串（已编码，必须原样发送）。 */
export function encWbi(
  params: Record<string, string | number>,
  imgKey: string,
  subKey: string,
  nowMs: number = Date.now(),
): string {
  const mixinKey = getMixinKey(imgKey + subKey);
  const wts = Math.round(nowMs / 1000);
  const all: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) all[key] = String(value);
  all.wts = String(wts);

  const query = Object.keys(all)
    .sort()
    .map((key) => {
      const value = (all[key] ?? '').replace(/[!'()*]/g, '');
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');

  const wRid = createHash('md5').update(query + mixinKey).digest('hex');
  return `${query}&w_rid=${wRid}`;
}

export interface WbiKeys {
  imgKey: string;
  subKey: string;
  /** 取到 keys 的时间戳，用于判断是否还是同一天。 */
  fetchedAt: number;
}

export interface WbiKeyStoreOptions {
  /** 拉 `/x/web-interface/nav` 取两个 URL。 */
  load: () => Promise<{ imgUrl: string; subUrl: string }>;
  /** 读持久化缓存（`globalState`），没有就返回 null。 */
  read?: () => WbiKeys | null;
  /** 写持久化缓存。 */
  write?: (keys: WbiKeys) => void;
  now?: () => number;
  logger?: Logger;
}

function isSameDay(a: number, b: number): boolean {
  const left = new Date(a);
  const right = new Date(b);
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/** 签名器：首次使用或跨日时自动刷新 keys。 */
export class WbiKeyStore {
  private cached: WbiKeys | null = null;
  private inflight: Promise<WbiKeys> | null = null;
  private readonly now: () => number;
  private readonly logger: Logger;

  constructor(private readonly options: WbiKeyStoreOptions) {
    this.now = options.now ?? (() => Date.now());
    this.logger = options.logger ?? silentLogger;
    const persisted = options.read?.() ?? null;
    if (persisted && isSameDay(persisted.fetchedAt, this.now())) {
      this.cached = persisted;
    }
  }

  /** 取当天有效的 keys（必要时请求 `nav`）。 */
  async keys(): Promise<WbiKeys> {
    const cached = this.cached;
    if (cached && isSameDay(cached.fetchedAt, this.now())) return cached;
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      const { imgUrl, subUrl } = await this.options.load();
      const keys: WbiKeys = {
        imgKey: wbiKeyFromUrl(imgUrl),
        subKey: wbiKeyFromUrl(subUrl),
        fetchedAt: this.now(),
      };
      if (keys.imgKey === '' || keys.subKey === '') {
        throw new Error(`wbi keys 解析失败：img=${imgUrl} sub=${subUrl}`);
      }
      this.cached = keys;
      this.options.write?.(keys);
      this.logger.debug('刷新 wbi keys', { imgKey: keys.imgKey, subKey: keys.subKey });
      return keys;
    })();

    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  /** 生成签名后的查询串。 */
  async signQuery(params: Record<string, string | number>): Promise<string> {
    const { imgKey, subKey } = await this.keys();
    return encWbi(params, imgKey, subKey, this.now());
  }

  /** 丢弃缓存（签名被拒时可强制刷新）。 */
  invalidate(): void {
    this.cached = null;
  }
}
