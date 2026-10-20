/**
 * Bilibili API layer for dsh-music-player.
 *
 * Ported from the VS Code extension. The same three invariants matter here:
 *  - every request carries the UA/Referer/Origin Bilibili expects;
 *  - requests are serialized with a configurable minimum interval;
 *  - HTTP, business-code, and network failures become one `BilibiliError`.
 */

import { createHash } from 'node:crypto'
import type { Logger } from './logger'
import { silentLogger } from './logger'

/* ------------------------------------------------------------------ errors */

export type BilibiliErrorKind =
  | 'aborted'
  | 'network'
  | 'http'
  | 'api'
  | 'parse'
  | 'not-logged-in'
  | 'risk'
  | 'vip-required'
  | 'unavailable'
  | 'no-csrf'

export interface BilibiliErrorOptions {
  code?: number
  httpStatus?: number
  detail?: unknown
  cause?: unknown
}

export class BilibiliError extends Error {
  readonly kind: BilibiliErrorKind
  readonly code: number | undefined
  readonly httpStatus: number | undefined
  readonly detail: unknown

  constructor(kind: BilibiliErrorKind, message: string, options: BilibiliErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'BilibiliError'
    this.kind = kind
    this.code = options.code
    this.httpStatus = options.httpStatus
    this.detail = options.detail
  }

  get userMessage(): string {
    switch (this.kind) {
      case 'aborted': return '请求已取消'
      case 'network': return '网络连接失败，请检查网络或代理设置'
      case 'http': return `B 站返回异常状态（HTTP ${this.httpStatus ?? '未知'}）`
      case 'parse': return 'B 站返回的数据无法解析，接口可能已变更'
      case 'not-logged-in': return '未登录或登录已过期，请重新扫码登录'
      case 'risk': return 'B 站触发了风控校验，请稍后再试'
      case 'vip-required': return '该曲目需要大会员'
      case 'unavailable': return '该视频不存在或已被删除'
      case 'no-csrf': return '登录凭据不完整，无法执行写操作，请重新登录'
      case 'api': return this.message === '' ? `B 站接口返回错误（${this.code ?? '未知'}）` : this.message
      default: return this.message
    }
  }
}

export function toBilibiliError(error: unknown, fallbackMessage = '未知错误'): BilibiliError {
  if (error instanceof BilibiliError) return error
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return new BilibiliError('aborted', '请求已取消', { cause: error })
    }
    return new BilibiliError('network', `${fallbackMessage}：${error.message}`, { cause: error })
  }
  return new BilibiliError('network', `${fallbackMessage}：${String(error)}`)
}

/* ----------------------------------------------------------------- cookies */

export type CookieJar = Record<string, string>

const COOKIE_NAME = "[!#$%&'*+\\-.^_`|~0-9A-Za-z]+"
const MERGED_SET_COOKIE_SPLITTER = new RegExp(`,\\s*(?=${COOKIE_NAME}=)`, 'g')

export function splitMergedSetCookie(merged: string): string[] {
  return merged.split(MERGED_SET_COOKIE_SPLITTER).map((part) => part.trim()).filter(Boolean)
}

export function readSetCookieHeaders(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] }
  if (typeof withGetSetCookie.getSetCookie === 'function') {
    const values = withGetSetCookie.getSetCookie()
    if (values.length > 0) return values
  }
  const merged = headers.get('set-cookie')
  return merged === null ? [] : splitMergedSetCookie(merged)
}

export function parseSetCookieLine(line: string): { name: string; value: string } | null {
  const pair = line.split(';', 1)[0]?.trim() ?? ''
  const eq = pair.indexOf('=')
  if (eq <= 0) return null
  const name = pair.slice(0, eq).trim()
  const value = pair.slice(eq + 1).trim()
  return name === '' ? null : { name, value }
}

export function parseSetCookieHeaders(lines: string[]): CookieJar {
  const jar: CookieJar = {}
  for (const line of lines) {
    const pair = parseSetCookieLine(line)
    if (pair) jar[pair.name] = pair.value
  }
  return jar
}

export function parseCookieHeader(header: string): CookieJar {
  const jar: CookieJar = {}
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (name !== '') jar[name] = value
  }
  return jar
}

export function serializeCookie(jar: CookieJar | null | undefined): string {
  if (!jar) return ''
  return Object.entries(jar)
    .filter(([name, value]) => name.trim() !== '' && value !== undefined && value !== null)
    .map(([name, value]) => `${name.trim()}=${String(value).trim().replace(/[\r\n]/g, '')}`)
    .join('; ')
}

export function getCsrfToken(jar: CookieJar | null | undefined): string | null {
  const token = jar?.bili_jct
  return token === undefined || token === '' ? null : token
}

export function getUserId(jar: CookieJar | null | undefined): number | null {
  const raw = jar?.DedeUserID
  if (raw === undefined || raw === '') return null
  const mid = Number(raw)
  return Number.isFinite(mid) ? mid : null
}

export function isLoggedIn(jar: CookieJar | null | undefined): boolean {
  if (!jar) return false
  return getCsrfToken(jar) !== null && getUserId(jar) !== null
}

export function mergeCookies(...jars: Array<CookieJar | null | undefined>): CookieJar {
  const merged: CookieJar = {}
  for (const jar of jars) {
    if (!jar) continue
    for (const [name, value] of Object.entries(jar)) merged[name] = value
  }
  return merged
}

/* --------------------------------------------------------------------- ids */

const XOR_CODE = 23442827791579n
const MASK_CODE = 2251799813685247n
const MAX_AID = 2251799813685248n
const BASE = 58n
const MAGIC_STR = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf'
const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/

export function isBvid(value: string): boolean {
  return BVID_PATTERN.test(value)
}

export function bv2av(bvid: string): number {
  if (!isBvid(bvid)) throw new Error(`不是合法的 BV 号：${bvid}`)
  const chars = Array.from(bvid)
  ;[chars[3], chars[9]] = [chars[9] as string, chars[3] as string]
  ;[chars[4], chars[7]] = [chars[7] as string, chars[4] as string]
  chars.splice(0, 3)
  const tmp = chars.reduce((pre, char) => {
    const index = MAGIC_STR.indexOf(char)
    if (index < 0) throw new Error(`BV 号含非法字符：${char}`)
    return pre * BASE + BigInt(index)
  }, 0n)
  return Number((tmp & MASK_CODE) ^ XOR_CODE)
}

export function av2bv(avid: number | bigint): string {
  const value = BigInt(avid)
  if (value <= 0n || value > MASK_CODE) throw new Error(`不是合法的 AV 号：${String(avid)}`)
  let tempNum = (value | MAX_AID) ^ XOR_CODE
  const result = Array.from('BV1000000000')
  for (let i = 11; i >= 3; i--) {
    result[i] = MAGIC_STR[Number(tempNum % BASE)] as string
    tempNum /= BASE
  }
  ;[result[3], result[9]] = [result[9] as string, result[3] as string]
  ;[result[4], result[7]] = [result[7] as string, result[4] as string]
  return result.join('')
}

/* ------------------------------------------------------------------- types */

export interface NavData {
  isLogin?: boolean
  mid?: number
  uname?: string
  face?: string
  wbi_img: { img_url: string; sub_url: string }
}

export interface BuvidData { b_3: string; b_4: string }

export interface SearchVideoItem {
  bvid?: string
  aid?: number
  title?: string
  pic?: string
  author?: string
  mid?: number
  duration?: string
  senddate?: number
  typeid?: number
  typename?: string
  play?: number
  type?: string
}

export interface SearchResultData {
  result: SearchVideoItem[] | null
  numPages?: number
  numResults?: number
  page?: number
}

export interface PageListItem {
  cid: number
  page: number
  part: string
  duration: number
  first_frame?: string
}

export interface DashAudioTrack {
  id: number
  baseUrl: string
  backupUrl?: string[]
  bandwidth?: number
  codecs?: string
  mimeType?: string
}

export interface PlayUrlData {
  dash?: { duration?: number; audio?: DashAudioTrack[] | null } | null
  durl?: Array<{ order: number; url: string; backup_url?: string[]; length?: number; size?: number }> | null
  timelength?: number
  accept_quality?: number[]
  quality?: number
}

export interface UserInfoData { mid: number; name: string; face: string; sign?: string }

export interface FavoriteFolder {
  id: number
  fid?: number
  mid?: number
  title: string
  media_count: number
  fav_state?: number
  attr?: number
  fav_state_count?: number
}

export interface FavoriteContentItem {
  id: number
  bvid: string
  title: string
  cover: string
  duration: number
  pubdate: number
  page: number
  type: number
  attr: number
  upper: { mid: number; name: string; face: string }
  intro?: string
}

export interface FavoriteContentsPage {
  info: {
    id: number
    title: string
    cover: string
    media_count: number
    intro: string
    upper: { mid: number; name: string; face: string }
  } | null
  medias: FavoriteContentItem[] | null
  has_more: boolean
  ttl?: number
}

export interface FavoriteResourceId { id: number; bvid: string; type: number }

export interface DealFavoriteResponse { prompt?: boolean; toast_msg?: string; success_num?: number }

export const AUDIO_QUALITY = {
  LOW: 30216,
  MEDIUM: 30232,
  HIGH: 30280,
} as const

export interface AudioStream {
  url: string
  backupUrls: string[]
  quality: number
  codecs: string | null
  mimeType: string | null
  container: 'dash' | 'durl'
  durationSeconds: number | null
}

/* ---------------------------------------------------------------- helpers */

export function stripHtmlTags(text: string | undefined): string {
  if (text === undefined) return ''
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .trim()
}

export function parseDurationText(text: string | undefined): number | null {
  if (text === undefined || text.trim() === '') return null
  const parts = text.trim().split(':').map((part) => Number(part))
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null
  let seconds = 0
  for (const part of parts) seconds = seconds * 60 + part
  return seconds
}

export function looksSoftBlocked(data: SearchResultData): boolean {
  // A risk-control response sometimes omits `result` entirely; treat that as
  // empty rather than throwing on `.length`.
  const empty = data.result === null || data.result === undefined || data.result.length === 0
  return empty && data.numPages === undefined && data.numResults === undefined
}

export function pickAudioStream(data: PlayUrlData, quality: number): AudioStream {
  const dashDuration = data.dash?.duration
  const durationFromTimelength =
    typeof data.timelength === 'number' && data.timelength > 0 ? data.timelength / 1000 : null
  const dashSeconds =
    typeof dashDuration === 'number' && dashDuration > 0 ? dashDuration : durationFromTimelength

  const tracks = data.dash?.audio
  if (Array.isArray(tracks) && tracks.length > 0) {
    const sorted = [...tracks].sort((left, right) => right.id - left.id)
    const picked = sorted.find((track) => track.id === quality) ?? sorted[0]
    if (picked && typeof picked.baseUrl === 'string' && picked.baseUrl !== '') {
      return {
        url: picked.baseUrl,
        backupUrls: picked.backupUrl ?? [],
        quality: picked.id,
        codecs: picked.codecs ?? null,
        mimeType: picked.mimeType ?? null,
        container: 'dash',
        durationSeconds: dashSeconds,
      }
    }
  }

  const durl = data.durl
  if (Array.isArray(durl) && durl.length > 0 && typeof durl[0]?.url === 'string') {
    return {
      url: durl[0].url,
      backupUrls: durl[0].backup_url ?? [],
      quality: data.quality ?? 0,
      codecs: null,
      mimeType: null,
      container: 'durl',
      durationSeconds: durationFromTimelength,
    }
  }

  throw new BilibiliError('unavailable', '该视频没有返回可用的音频流，可能是付费/会员专享或已下架')
}

/* ------------------------------------------------------------------ client */

export const BILIBILI_BASE_URL = 'https://api.bilibili.com'
export const BILIBILI_REFERER = 'https://www.bilibili.com/'
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export interface ApiEnvelope<T> {
  code: number
  message?: string
  msg?: string
  data: T
  ttl?: number
}

export interface GetOptions {
  endpoint?: string
  fullUrl?: string
  params?: Record<string, string | number | undefined> | string
  skipCookie?: boolean
  signal?: AbortSignal
  timeoutMs?: number
  headers?: Record<string, string>
  allowCodes?: number[]
  retries?: number
}

export interface PostOptions {
  endpoint: string
  payload?: Record<string, string>
  signal?: AbortSignal
  timeoutMs?: number
  headers?: Record<string, string>
  allowCodes?: number[]
  skipCookie?: boolean
}

export interface RawRequestOptions {
  url: string
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
  timeoutMs?: number
  skipCookie?: boolean
  userAgent?: string
}

export interface BilibiliClientOptions {
  readCookies: () => CookieJar | null
  logger?: Logger
  minIntervalMs?: () => number
  fetchImpl?: typeof fetch
  userAgent?: string
  getRetries?: number
  defaultTimeoutMs?: number
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_MIN_INTERVAL_MS = 350
const DEFAULT_TIMEOUT_MS = 20_000
const RETRY_BACKOFF_MS = 800

export function mapApiCode(code: number, message: string, detail?: unknown): BilibiliError {
  const text = message === '' ? `B 站接口返回 code=${code}` : message
  switch (code) {
    case -101: return new BilibiliError('not-logged-in', text, { code, detail })
    case -412: return new BilibiliError('risk', text, { code, detail })
    case -10403: return new BilibiliError('vip-required', text, { code, detail })
    case -404:
    case -403:
    case -10400:
    case -10401: return new BilibiliError('unavailable', text, { code, detail })
    default: return new BilibiliError('api', text, { code, detail })
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; done: () => void; didTimeOut: () => boolean } {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error(`请求超时（${timeoutMs}ms）`))
  }, timeoutMs)
  const onAbort = (): void => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
    didTimeOut: () => timedOut,
  }
}

function buildQuery(params: GetOptions['params']): string {
  if (params === undefined) return ''
  if (typeof params === 'string') return params
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.append(key, String(value))
  }
  return search.toString()
}

export class BilibiliClient {
  private readonly logger: Logger
  private readonly fetchImpl: typeof fetch
  private readonly userAgent: string
  private readonly sleep: (ms: number) => Promise<void>
  private lastRequestAt = 0
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly options: BilibiliClientOptions) {
    this.logger = options.logger ?? silentLogger
    this.fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args))
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT
    this.sleep = options.sleep ?? defaultSleep
  }

  cookies(): CookieJar | null {
    return this.options.readCookies()
  }

  private minIntervalMs(): number {
    return this.options.minIntervalMs?.() ?? DEFAULT_MIN_INTERVAL_MS
  }

  private schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = this.lastRequestAt + this.minIntervalMs() - Date.now()
      if (wait > 0) await this.sleep(wait)
      this.lastRequestAt = Date.now()
      return task()
    }
    const next = this.queue.then(run, run)
    this.queue = next.then(() => undefined, () => undefined)
    return next
  }

  async fetchRaw(options: RawRequestOptions): Promise<Response> {
    const headers: Record<string, string> = {
      'User-Agent': options.userAgent ?? this.userAgent,
      Referer: BILIBILI_REFERER,
      Origin: 'https://www.bilibili.com',
      ...options.headers,
    }
    if (options.skipCookie !== true) {
      const cookie = serializeCookie(this.cookies())
      if (cookie !== '') headers.Cookie = cookie
    }
    const timeoutMs = options.timeoutMs ?? this.options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS
    return this.schedule(async () => {
      const guard = withTimeout(options.signal, timeoutMs)
      try {
        return await this.fetchImpl(options.url, {
          method: options.method ?? 'GET',
          headers,
          ...(options.body === undefined ? {} : { body: options.body }),
          signal: guard.signal,
          redirect: 'follow',
        })
      } catch (error) {
        if (guard.didTimeOut()) {
          throw new BilibiliError('network', `请求超时（${timeoutMs}ms）：${options.url}`, { cause: error })
        }
        throw toBilibiliError(error, `请求失败：${options.url}`)
      } finally {
        guard.done()
      }
    })
  }

  private async requestEnvelope<T>(options: GetOptions & { method: 'GET' | 'POST'; body?: string }): Promise<T> {
    const query = buildQuery(options.params)
    const base = options.fullUrl ?? `${BILIBILI_BASE_URL}${options.endpoint ?? ''}`
    const url = query === '' ? base : `${base}${base.includes('?') ? '&' : '?'}${query}`
    const retries = options.retries ?? this.options.getRetries ?? 1
    const allowCodes = new Set(options.allowCodes ?? [])

    let attempt = 0
    for (;;) {
      attempt++
      this.logger.debug(`→ ${options.method} ${url}`, attempt > 1 ? { attempt } : undefined)
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
        })

        if (!response.ok) {
          const kind = response.status === 412 ? 'risk' : 'http'
          throw new BilibiliError(kind, `B 站返回 HTTP ${response.status} ${response.statusText}`, {
            httpStatus: response.status,
          })
        }

        let envelope: ApiEnvelope<T>
        try {
          envelope = (await response.json()) as ApiEnvelope<T>
        } catch (error) {
          throw new BilibiliError('parse', `响应不是合法 JSON：${url}`, { cause: error })
        }

        if (envelope.code !== 0 && !allowCodes.has(envelope.code)) {
          throw mapApiCode(envelope.code, envelope.message ?? envelope.msg ?? '', envelope.data)
        }
        return envelope.data
      } catch (error) {
        const normalized = error instanceof BilibiliError ? error : toBilibiliError(error)
        const retryable =
          options.method === 'GET' &&
          attempt <= retries &&
          (normalized.kind === 'risk' ||
            normalized.kind === 'network' ||
            (normalized.kind === 'http' && (normalized.httpStatus ?? 0) >= 500))
        if (!retryable) throw normalized
        this.logger.warn(`请求失败将重试（${attempt}/${retries + 1}）：${normalized.message}`)
        await this.sleep(RETRY_BACKOFF_MS)
      }
    }
  }

  async get<T>(options: GetOptions): Promise<T> {
    return this.requestEnvelope<T>({ ...options, method: 'GET' })
  }

  async postWithCsrf<T>(options: PostOptions): Promise<T> {
    const csrf = getCsrfToken(this.cookies())
    if (csrf === null) throw new BilibiliError('no-csrf', 'cookie 里没有 bili_jct，无法执行写操作')
    const body = new URLSearchParams({ ...options.payload, csrf }).toString()
    return this.requestEnvelope<T>({ ...options, method: 'POST', body, retries: 0 })
  }
}

/* --------------------------------------------------------------------- WBI */

export const MIXIN_KEY_ENC_TAB: readonly number[] = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28,
  14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54,
  21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

export function getMixinKey(orig: string): string {
  return MIXIN_KEY_ENC_TAB.map((index) => orig[index] ?? '').join('').slice(0, 32)
}

export function wbiKeyFromUrl(url: string): string {
  const name = url.slice(url.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

export function encWbi(
  params: Record<string, string | number>,
  imgKey: string,
  subKey: string,
  nowMs: number = Date.now(),
): string {
  const mixinKey = getMixinKey(imgKey + subKey)
  const wts = Math.round(nowMs / 1000)
  const all: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) all[key] = String(value)
  all.wts = String(wts)
  const query = Object.keys(all)
    .sort()
    .map((key) => {
      const value = (all[key] ?? '').replace(/[!'()*]/g, '')
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    })
    .join('&')
  const wRid = createHash('md5').update(query + mixinKey).digest('hex')
  return `${query}&w_rid=${wRid}`
}

export interface WbiKeys { imgKey: string; subKey: string; fetchedAt: number }

export interface WbiKeyStoreOptions {
  load: () => Promise<{ imgUrl: string; subUrl: string }>
  read?: () => WbiKeys | null
  write?: (keys: WbiKeys) => void
  now?: () => number
  logger?: Logger
}

function isSameDay(a: number, b: number): boolean {
  const left = new Date(a)
  const right = new Date(b)
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
}

export class WbiKeyStore {
  private cached: WbiKeys | null = null
  private inflight: Promise<WbiKeys> | null = null
  private readonly now: () => number
  private readonly logger: Logger

  constructor(private readonly options: WbiKeyStoreOptions) {
    this.now = options.now ?? (() => Date.now())
    this.logger = options.logger ?? silentLogger
    const persisted = options.read?.() ?? null
    if (persisted && isSameDay(persisted.fetchedAt, this.now())) this.cached = persisted
  }

  async keys(): Promise<WbiKeys> {
    const cached = this.cached
    if (cached && isSameDay(cached.fetchedAt, this.now())) return cached
    if (this.inflight) return this.inflight
    this.inflight = (async () => {
      const { imgUrl, subUrl } = await this.options.load()
      const keys: WbiKeys = {
        imgKey: wbiKeyFromUrl(imgUrl),
        subKey: wbiKeyFromUrl(subUrl),
        fetchedAt: this.now(),
      }
      if (keys.imgKey === '' || keys.subKey === '') {
        throw new Error(`wbi keys 解析失败：img=${imgUrl} sub=${subUrl}`)
      }
      this.cached = keys
      this.options.write?.(keys)
      this.logger.debug('刷新 wbi keys', { imgKey: keys.imgKey, subKey: keys.subKey })
      return keys
    })()
    try {
      return await this.inflight
    } finally {
      this.inflight = null
    }
  }

  async signQuery(params: Record<string, string | number>): Promise<string> {
    const { imgKey, subKey } = await this.keys()
    return encWbi(params, imgKey, subKey, this.now())
  }

  invalidate(): void {
    this.cached = null
  }
}

/* ---------------------------------------------------------------------- API */

export interface SearchVideosResult { items: SearchVideoItem[]; numPages: number }

export interface BilibiliApiOptions {
  sleep?: (ms: number) => Promise<void>
  softBlockRetryDelayMs?: number
}

export class BilibiliApi {
  private readonly logger: Logger
  private readonly sleep: (ms: number) => Promise<void>
  private readonly softBlockRetryDelayMs: number

  constructor(
    private readonly client: BilibiliClient,
    private readonly wbi: WbiKeyStore,
    logger?: Logger,
    options: BilibiliApiOptions = {},
  ) {
    this.logger = logger ?? silentLogger
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.softBlockRetryDelayMs = options.softBlockRetryDelayMs ?? 2500
  }

  async getNav(signal?: AbortSignal): Promise<NavData> {
    return this.client.get<NavData>({
      endpoint: '/x/web-interface/nav',
      allowCodes: [-101],
      ...(signal === undefined ? {} : { signal }),
    })
  }

  async fetchBuvid(signal?: AbortSignal): Promise<BuvidData | null> {
    const data = await this.client.get<BuvidData | null>({
      endpoint: '/x/frontend/finger/spi',
      ...(signal === undefined ? {} : { signal }),
    })
    if (!data || typeof data.b_3 !== 'string' || typeof data.b_4 !== 'string') return null
    return data
  }

  async searchVideos(options: { keyword: string; page?: number; signal?: AbortSignal }): Promise<SearchVideosResult> {
    const page = options.page ?? 1
    const query = await this.wbi.signQuery({
      keyword: options.keyword,
      search_type: 'video',
      page: String(page),
    })
    const request = async (): Promise<SearchResultData> =>
      this.client.get<SearchResultData>({
        endpoint: '/x/web-interface/wbi/search/type',
        params: query,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      })
    let data = await request()
    if (looksSoftBlocked(data)) {
      this.logger.warn(`搜索疑似被风控拦截，${this.softBlockRetryDelayMs}ms 后重试一次`)
      await this.sleep(this.softBlockRetryDelayMs)
      data = await request()
      if (looksSoftBlocked(data)) {
        throw new BilibiliError('risk', '搜索被 B 站风控拦截（返回空结果），请稍后再试，或扫码登录后再搜')
      }
    }
    const items = (data.result ?? []).filter(
      (item): item is SearchVideoItem & { bvid: string } =>
        typeof item.bvid === 'string' && item.bvid !== '',
    )
    this.logger.debug(`搜索「${options.keyword}」第 ${page} 页`, { count: items.length, numPages: data.numPages })
    return { items, numPages: data.numPages ?? 1 }
  }

  async getVideoInfo(bvid: string, signal?: AbortSignal): Promise<{
    bvid: string
    title: string
    cover: string
    author: string
    durationSeconds: number
    pageCount: number
    pages: PageListItem[]
  }> {
    const data = await this.client.get<{
      bvid: string
      title: string
      pic: string
      duration: number
      owner?: { name?: string }
      pages?: PageListItem[]
    }>({
      endpoint: '/x/web-interface/view',
      params: { bvid },
      ...(signal === undefined ? {} : { signal }),
    })
    return {
      bvid: data.bvid,
      title: stripHtmlTags(data.title),
      cover: data.pic ?? '',
      author: data.owner?.name ?? '',
      durationSeconds: Number.isFinite(data.duration) ? data.duration : 0,
      pageCount: Array.isArray(data.pages) && data.pages.length > 0 ? data.pages.length : 1,
      pages: data.pages ?? [],
    }
  }

  async getPageList(bvid: string, signal?: AbortSignal): Promise<PageListItem[]> {
    const pages = await this.client.get<PageListItem[]>({
      endpoint: '/x/player/pagelist',
      params: { bvid },
      ...(signal === undefined ? {} : { signal }),
    })
    if (!Array.isArray(pages) || pages.length === 0) {
      throw new BilibiliError('unavailable', `该视频没有可播放的分 P：${bvid}`)
    }
    return pages
  }

  async getAudioStream(options: {
    bvid: string
    cid: number
    quality?: number
    signal?: AbortSignal
  }): Promise<AudioStream> {
    const quality = options.quality ?? AUDIO_QUALITY.HIGH
    const query = await this.wbi.signQuery({
      bvid: options.bvid,
      cid: String(options.cid),
      fnval: '4048',
      fnver: '0',
      fourk: '1',
      qlt: String(quality),
      voice_balance: '1',
    })
    const data = await this.client.get<PlayUrlData>({
      endpoint: '/x/player/wbi/playurl',
      params: query,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
    const stream = pickAudioStream(data, quality)
    this.logger.debug('取到音频流', {
      bvid: options.bvid,
      cid: options.cid,
      container: stream.container,
      quality: stream.quality,
      codecs: stream.codecs,
    })
    return stream
  }

  async getUserInfo(signal?: AbortSignal): Promise<UserInfoData> {
    return this.client.get<UserInfoData>({
      endpoint: '/x/space/myinfo',
      ...(signal === undefined ? {} : { signal }),
    })
  }

  async getFavoriteFolders(options: {
    mid: number
    bvid?: string
    signal?: AbortSignal
  }): Promise<FavoriteFolder[]> {
    const params: Record<string, string | number | undefined> = { up_mid: options.mid }
    if (options.bvid !== undefined && options.bvid !== '') {
      params.rid = bv2av(options.bvid)
      params.type = '2'
    }
    const data = await this.client.get<{ count?: number; list: FavoriteFolder[] | null } | null>({
      endpoint: '/x/v3/fav/folder/created/list-all',
      params,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
    return data?.list ?? []
  }

  async getFavoriteContents(options: {
    mediaId: number
    page?: number
    keyword?: string
    scope?: 'this' | 'all'
    signal?: AbortSignal
  }): Promise<FavoriteContentsPage> {
    const params: Record<string, string> = {
      media_id: String(options.mediaId),
      pn: String(options.page ?? 1),
      ps: '40',
    }
    if (options.keyword !== undefined && options.keyword !== '') {
      params.keyword = options.keyword
      params.type = options.scope === 'all' ? '1' : '0'
    }
    const data = await this.client.get<FavoriteContentsPage>({
      endpoint: '/x/v3/fav/resource/list',
      params,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
    this.logger.debug('取到收藏夹内容', {
      mediaId: options.mediaId,
      page: options.page ?? 1,
      count: data.medias?.length ?? 0,
      hasMore: data.has_more,
    })
    return { ...data, medias: data.medias ?? [] }
  }

  async getFavoriteResourceIds(mediaId: number, signal?: AbortSignal): Promise<FavoriteResourceId[]> {
    const data = await this.client.get<FavoriteResourceId[]>({
      endpoint: '/x/v3/fav/resource/ids',
      params: { media_id: String(mediaId) },
      ...(signal === undefined ? {} : { signal }),
    })
    return Array.isArray(data) ? data : []
  }

  async createFavoriteFolder(options: {
    title: string
    intro?: string
    privacy?: 0 | 1
  }): Promise<{ id: number; fid: number; mid: number; title: string }> {
    return this.client.postWithCsrf({
      endpoint: '/x/v3/fav/folder/add',
      payload: {
        title: options.title,
        intro: options.intro ?? '',
        privacy: String(options.privacy ?? 0),
      },
    })
  }

  async deleteFavoriteFolders(mediaIds: number[]): Promise<void> {
    if (mediaIds.length === 0) return
    await this.client.postWithCsrf({
      endpoint: '/x/v3/fav/folder/del',
      payload: { media_ids: mediaIds.join(',') },
    })
  }

  async dealFavoriteForOneVideo(options: {
    bvid: string
    addToFavoriteIds: string[]
    delInFavoriteIds: string[]
  }): Promise<DealFavoriteResponse> {
    return this.client.postWithCsrf({
      endpoint: '/x/v3/fav/resource/deal',
      payload: {
        rid: String(bv2av(options.bvid)),
        type: '2',
        add_media_ids: options.addToFavoriteIds.join(','),
        del_media_ids: options.delInFavoriteIds.join(','),
      },
    })
  }

  async removeFavoriteResources(options: { mediaId: number; bvids: string[] }): Promise<void> {
    if (options.bvids.length === 0) return
    const resources = options.bvids.map((bvid) => `${bv2av(bvid)}:2`).join(',')
    await this.client.postWithCsrf({
      endpoint: '/x/v3/fav/resource/batch-del',
      payload: { resources, media_id: String(options.mediaId), platform: 'web' },
    })
  }
}

/* --------------------------------------------------------------- favorites */

export interface FavoriteEntry {
  avid: number
  bvid: string
  title: string
  cover: string
  upperName: string
  durationSeconds: number
  pageCount: number
  invalid: boolean
  invalidReason: string | null
}

export interface FavoriteContentsView {
  title: string
  total: number
  entries: FavoriteEntry[]
  hasMore: boolean
}

const TYPE_VIDEO = 2

export function describeInvalidAttr(attr: number): string | null {
  if (attr === 0) return null
  if (attr === 9) return 'up 主已删除'
  if (attr === 1) return '已被删除或设为私密'
  return '已失效'
}

export function toFavoriteEntry(item: FavoriteContentItem): FavoriteEntry | null {
  if (item.type !== TYPE_VIDEO) return null
  if (typeof item.bvid !== 'string' || item.bvid === '') return null
  const reason = describeInvalidAttr(item.attr)
  return {
    avid: item.id,
    bvid: item.bvid,
    title: item.title ?? '',
    cover: item.cover ?? '',
    upperName: item.upper?.name ?? '',
    durationSeconds: Number.isFinite(item.duration) ? Math.max(0, Math.round(item.duration)) : 0,
    pageCount: Number.isFinite(item.page) ? Math.max(1, Math.round(item.page)) : 1,
    invalid: reason !== null,
    invalidReason: reason,
  }
}

export function toFavoriteContentsView(page: FavoriteContentsPage): FavoriteContentsView {
  const entries: FavoriteEntry[] = []
  for (const item of page.medias ?? []) {
    const entry = toFavoriteEntry(item)
    if (entry !== null) entries.push(entry)
  }
  return {
    title: page.info?.title ?? '',
    total: page.info?.media_count ?? entries.length,
    entries,
    hasMore: page.has_more === true,
  }
}
