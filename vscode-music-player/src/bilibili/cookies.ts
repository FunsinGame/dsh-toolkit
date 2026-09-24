/**
 * Cookie 处理。
 *
 * 有两个坑必须处理：
 *
 * 1. `Set-Cookie` 可能有多条。Node 的 undici 把它们合并进一个 `get('set-cookie')`
 *    字符串，而 cookie 的 `Expires=Wed, 01 Jan 2025 00:00:00 GMT` 本身带逗号，
 *    直接 split(',') 会把日期切碎。优先用 `headers.getSetCookie()`，并保留一个
 *    「逗号后面必须是 `名字=`」的正则兜底。
 * 2. 空值 / 换行 / 首尾空格要清掉，否则拼出来的 Cookie 头会被服务端拒绝。
 */

export type CookieJar = Record<string, string>;

const COOKIE_NAME = "[!#$%&'*+\\-.^_`|~0-9A-Za-z]+";
/** 逗号后紧跟 `名字=` 才算新 cookie（日期里的逗号后面不是 `名字=`）。 */
const MERGED_SET_COOKIE_SPLITTER = new RegExp(`,\\s*(?=${COOKIE_NAME}=)`, 'g');

/** 从 `Response` 中取出所有 `Set-Cookie` 行。 */
export function readSetCookieHeaders(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === 'function') {
    const values = withGetSetCookie.getSetCookie();
    if (values.length > 0) return values;
  }
  const merged = headers.get('set-cookie');
  return merged === null ? [] : splitMergedSetCookie(merged);
}

/** 兜底：把 undici 合并后的字符串按属性边界切开。 */
export function splitMergedSetCookie(merged: string): string[] {
  return merged
    .split(MERGED_SET_COOKIE_SPLITTER)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** 解析单条 `Set-Cookie`，只取第一个 `name=value`。 */
export function parseSetCookieLine(line: string): { name: string; value: string } | null {
  const pair = line.split(';', 1)[0]?.trim() ?? '';
  const eq = pair.indexOf('=');
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (name === '') return null;
  return { name, value };
}

/** 多条 `Set-Cookie` → cookie jar。 */
export function parseSetCookieHeaders(lines: string[]): CookieJar {
  const jar: CookieJar = {};
  for (const line of lines) {
    const pair = parseSetCookieLine(line);
    if (pair) jar[pair.name] = pair.value;
  }
  return jar;
}

/** 用户手动粘贴的 Cookie 头 → cookie jar。 */
export function parseCookieHeader(header: string): CookieJar {
  const jar: CookieJar = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name !== '') jar[name] = value;
  }
  return jar;
}

/** cookie jar → `Cookie` 请求头。 */
export function serializeCookie(jar: CookieJar | null | undefined): string {
  if (!jar) return '';
  return Object.entries(jar)
    .filter(([name, value]) => name.trim() !== '' && value !== undefined && value !== null)
    .map(([name, value]) => `${name.trim()}=${String(value).trim().replace(/[\r\n]/g, '')}`)
    .join('; ');
}

/** 取写操作所需的 csrf token（cookie 里的 `bili_jct`）。 */
export function getCsrfToken(jar: CookieJar | null | undefined): string | null {
  const token = jar?.bili_jct;
  return token === undefined || token === '' ? null : token;
}

/** 取登录用户 mid（cookie 里的 `DedeUserID`）。 */
export function getUserId(jar: CookieJar | null | undefined): number | null {
  const raw = jar?.DedeUserID;
  if (raw === undefined || raw === '') return null;
  const mid = Number(raw);
  return Number.isFinite(mid) ? mid : null;
}

/** 判断这个 jar 是否足以认为「已登录」。 */
export function isLoggedIn(jar: CookieJar | null | undefined): boolean {
  if (!jar) return false;
  return getCsrfToken(jar) !== null && getUserId(jar) !== null;
}

/** 合并 cookie，后者覆盖前者。 */
export function mergeCookies(...jars: Array<CookieJar | null | undefined>): CookieJar {
  const merged: CookieJar = {};
  for (const jar of jars) {
    if (!jar) continue;
    for (const [name, value] of Object.entries(jar)) merged[name] = value;
  }
  return merged;
}
