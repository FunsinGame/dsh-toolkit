/**
 * Media service: resolves Bilibili audio into something an <audio> element can
 * consume, and serves it from the same DSH origin.
 *
 * Two delivery paths exist:
 *  - `raw`: stream the original AAC/fMP4 from the CDN with Range passthrough.
 *    This is the default because Chromium plays it natively.
 *  - `wav`: download, demux and decode AAC to WAV on the host. This is the
 *    fallback for Electron/browser builds without AAC support.
 *
 * Both paths share the same byte-range serving contract so seeking works the
 * same way in the UI.
 */

import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline as pump } from 'node:stream/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AudioPipeline } from './audio/pipeline'
import type { BilibiliApi, BilibiliClient } from './bili'
import { BilibiliError, toBilibiliError } from './bili'
import type { Logger } from './logger'
import type { TrackSummary } from './protocol'
import { CACHE_RAW_DIR, CACHE_WAV_DIR } from './paths'
import {
  evaluateRange,
  formatContentRange,
  parseContentRangeTotal,
  type ByteRange,
} from './range'

export type DeliveryFormat = 'raw' | 'wav'

interface MediaEntryBase {
  id: string
  bvid: string
  cid: number
  quality: number
  title: string
  contentType: string
  durationSeconds: number
  createdAt: number
  cachePath: string | null
}

interface RawEntry extends MediaEntryBase {
  kind: 'raw'
  url: string
  backupUrls: string[]
  size: number | null
  cacheStarted: boolean
}

interface WavEntry extends MediaEntryBase {
  kind: 'wav'
  bytes: Buffer
}

type MediaEntry = RawEntry | WavEntry

export interface PlayOptions {
  bvid: string
  cid?: number
  quality: number
  format: DeliveryFormat
  signal?: AbortSignal
  /** Metadata already known by the client (search/favorites rows). */
  track?: Partial<TrackSummary>
}

export interface PlayResult {
  id: string
  url: string
  track: TrackSummary
  durationSeconds: number
  contentType: string
  format: DeliveryFormat
  fromCache: boolean
  size: number | null
}

export interface MediaServiceOptions {
  api: BilibiliApi
  client: BilibiliClient
  pipeline: AudioPipeline
  logger: Logger
  cacheEnabled: () => boolean
  cacheMaxBytes: () => number
}

const MAX_WAV_SECONDS = 30 * 60
const MAX_RAW_CACHE_BYTES = 200 * 1024 * 1024
const MAX_CONCURRENT_CACHE_DOWNLOADS = 2
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** Hosts whose images may be proxied. Anything else is refused. */
const IMAGE_HOSTS = /(^|\.)(hdslb\.com|biliimg\.com|bilivideo\.com)$/i

function contentLength(response: Response): number | null {
  const raw = response.headers.get('content-length')
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function cacheFileName(bvid: string, cid: number, quality: number): string {
  return `${bvid}-${cid}-${quality}.m4s`
}

export class MediaService {
  private readonly entries = new Map<string, MediaEntry>()
  private activeDownloads = 0

  constructor(private readonly options: MediaServiceOptions) {}

  /** Resolve a video to a playable media URL. */
  async play(options: PlayOptions): Promise<PlayResult> {
    const track = await this.resolveTrack(options.bvid, options.cid, options.signal, options.track)
    const cid = track.cid
    if (cid === undefined) throw new BilibiliError('unavailable', '缺少 cid，无法播放')

    const durationHint = track.durationSeconds > 0 ? track.durationSeconds : 0
    if (options.format === 'wav') {
      if (durationHint > MAX_WAV_SECONDS) {
        throw new BilibiliError(
          'unavailable',
          `这个浏览器无法直接播放 AAC，而该视频约 ${Math.round(durationHint / 60)} 分钟，转码会占用过多内存`,
        )
      }
      const materialized = await this.options.pipeline.materialize({
        bvid: options.bvid,
        cid,
        quality: options.quality,
        ...(durationHint > 0 ? { durationHintSeconds: durationHint } : {}),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      })
      const id = randomUUID()
      const entry: WavEntry = {
        kind: 'wav',
        id,
        bvid: options.bvid,
        cid,
        quality: options.quality,
        title: track.title,
        contentType: 'audio/wav',
        durationSeconds: materialized.durationSeconds || durationHint,
        createdAt: Date.now(),
        cachePath: null,
        bytes: materialized.wav,
      }
      this.entries.set(id, entry)
      this.trimEntries()
      return {
        id,
        url: `/dsh-music-player/media/${id}`,
        track: { ...track, durationSeconds: entry.durationSeconds },
        durationSeconds: entry.durationSeconds,
        contentType: entry.contentType,
        format: 'wav',
        fromCache: materialized.fromCache,
        size: entry.bytes.byteLength,
      }
    }

    const stream = await this.options.api.getAudioStream({
      bvid: options.bvid,
      cid,
      quality: options.quality,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
    const codecs = (stream.codecs ?? '').toLowerCase()
    if (stream.container === 'dash' && codecs !== '' && !codecs.startsWith('mp4a')) {
      throw new BilibiliError('unavailable', `这个视频的音轨是 ${stream.codecs}，目前只支持 AAC`)
    }

    const cacheEnabled = this.options.cacheEnabled()
    const cachePath = cacheEnabled ? join(CACHE_RAW_DIR, cacheFileName(options.bvid, cid, options.quality)) : null
    let size: number | null = null
    try {
      size = await this.probeSize(stream.url, options.signal)
    } catch (error) {
      this.options.logger.debug('无法探测音频长度（不影响播放）', toBilibiliError(error).message)
    }

    const id = randomUUID()
    const entry: RawEntry = {
      kind: 'raw',
      id,
      bvid: options.bvid,
      cid,
      quality: options.quality,
      title: track.title,
      contentType: stream.container === 'durl' ? 'video/mp4' : 'audio/mp4',
      durationSeconds: stream.durationSeconds ?? durationHint,
      createdAt: Date.now(),
      cachePath,
      url: stream.url,
      backupUrls: stream.backupUrls,
      size,
      cacheStarted: false,
    }
    this.entries.set(id, entry)
    this.trimEntries()

    let fromCache = false
    if (cachePath !== null) {
      try {
        const info = await stat(cachePath)
        if (info.isFile() && info.size > 0) {
          entry.size = info.size
          fromCache = true
        }
      } catch {
        // Not cached yet.
      }
    }

    return {
      id,
      url: `/dsh-music-player/media/${id}`,
      track: { ...track, durationSeconds: entry.durationSeconds },
      durationSeconds: entry.durationSeconds,
      contentType: entry.contentType,
      format: 'raw',
      fromCache,
      size: entry.size,
    }
  }

  /** Resolve the first page's cid when the caller did not provide one. */
  private async resolveTrack(
    bvid: string,
    cid: number | undefined,
    signal?: AbortSignal,
    known: Partial<TrackSummary> = {},
  ): Promise<TrackSummary> {
    if (cid !== undefined) {
      return {
        bvid,
        cid,
        title: known.title ?? '',
        author: known.author ?? '',
        cover: known.cover ?? '',
        durationSeconds: known.durationSeconds ?? 0,
        pageCount: known.pageCount ?? 1,
      }
    }
    const pages = await this.options.api.getPageList(bvid, signal)
    const first = pages[0]
    if (!first) throw new BilibiliError('unavailable', `视频没有分 P：${bvid}`)
    return {
      bvid,
      cid: first.cid,
      title: known.title ?? first.part ?? '',
      author: known.author ?? '',
      cover: known.cover ?? first.first_frame ?? '',
      durationSeconds:
        known.durationSeconds !== undefined && known.durationSeconds > 0
          ? known.durationSeconds
          : first.duration ?? 0,
      pageCount: known.pageCount !== undefined && known.pageCount > 0 ? known.pageCount : pages.length,
    }
  }

  private async probeSize(url: string, signal?: AbortSignal): Promise<number | null> {
    const response = await this.options.client.fetchRaw({
      url,
      headers: { Range: 'bytes=0-0' },
      ...(signal === undefined ? {} : { signal }),
      timeoutMs: 12_000,
    })
    if (!response.ok && response.status !== 206) return null
    const fromRange = parseContentRangeTotal(response.headers.get('content-range'))
    if (fromRange !== null) {
      await response.body?.cancel()
      return fromRange
    }
    const length = contentLength(response)
    await response.body?.cancel()
    return length
  }

  /** Serve `/media/:id`, honoring Range for both delivery paths. */
  async handleMedia(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (entry === undefined) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('media not found')
      return
    }
    if (entry.kind === 'wav') {
      this.serveBuffer(req, res, entry.bytes, entry.contentType)
      return
    }
    if (entry.cachePath !== null) {
      try {
        const info = await stat(entry.cachePath)
        if (info.isFile() && info.size > 0) {
          if (entry.size === null) entry.size = info.size
          await this.serveFile(req, res, entry.cachePath, entry.contentType)
          return
        }
      } catch {
        // Fall through to the CDN.
      }
    }
    await this.proxyRaw(req, res, entry, true)
  }

  private serveBuffer(req: IncomingMessage, res: ServerResponse, bytes: Buffer, contentType: string): void {
    const total = bytes.byteLength
    const outcome = evaluateRange(req.headers.range, total)
    if (outcome.status === 'unsatisfiable') {
      res.writeHead(416, { 'Content-Range': `bytes */${total}` })
      res.end()
      return
    }
    const range = outcome.status === 'partial' ? outcome.range : null
    const headers: Record<string, string | number> = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    }
    if (range === null) {
      headers['Content-Length'] = total
    } else {
      headers['Content-Length'] = range.end - range.start + 1
      headers['Content-Range'] = formatContentRange(range, total)
    }
    res.writeHead(range === null ? 200 : 206, headers)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    res.end(range === null ? bytes : bytes.subarray(range.start, range.end + 1))
  }

  private async serveFile(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    contentType: string,
  ): Promise<void> {
    const info = await stat(path)
    const total = info.size
    const outcome = evaluateRange(req.headers.range, total)
    if (outcome.status === 'unsatisfiable') {
      res.writeHead(416, { 'Content-Range': `bytes */${total}` })
      res.end()
      return
    }
    const range = outcome.status === 'partial' ? outcome.range : null
    const headers: Record<string, string | number> = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    }
    if (range === null) {
      headers['Content-Length'] = total
    } else {
      headers['Content-Length'] = range.end - range.start + 1
      headers['Content-Range'] = formatContentRange(range, total)
    }
    res.writeHead(range === null ? 200 : 206, headers)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    const stream = createReadStream(path, range === null ? {} : { start: range.start, end: range.end })
    stream.on('error', () => res.destroy())
    stream.pipe(res)
  }

  private async proxyRaw(
    req: IncomingMessage,
    res: ServerResponse,
    entry: RawEntry,
    allowRefresh: boolean,
  ): Promise<void> {
    const attempt = async (url: string): Promise<Response> => {
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Referer: 'https://www.bilibili.com/',
        Origin: 'https://www.bilibili.com',
      }
      if (typeof req.headers.range === 'string') headers.Range = req.headers.range
      return fetch(url, { headers, redirect: 'follow' })
    }

    let upstream: Response | null = null
    let lastError: unknown = null
    for (const candidate of [entry.url, ...entry.backupUrls]) {
      try {
        const response = await attempt(candidate)
        if (response.ok || response.status === 206) {
          upstream = response
          break
        }
        if ((response.status === 403 || response.status === 404) && allowRefresh) {
          this.options.logger.info('音频地址已过期，重新解析')
          try {
            const stream = await this.options.api.getAudioStream({
              bvid: entry.bvid,
              cid: entry.cid,
              quality: entry.quality,
            })
            entry.url = stream.url
            entry.backupUrls = stream.backupUrls
            const retried = await attempt(stream.url)
            if (retried.ok || retried.status === 206) {
              upstream = retried
              break
            }
          } catch (error) {
            lastError = error
          }
          allowRefresh = false
        }
        lastError = new BilibiliError('http', `音频 CDN 返回 HTTP ${response.status}`, {
          httpStatus: response.status,
        })
      } catch (error) {
        lastError = error
        this.options.logger.warn(`音频地址失败，尝试下一个：${candidate.slice(0, 80)}…`)
      }
    }

    if (upstream === null) {
      const normalized = toBilibiliError(lastError, '无法获取音频')
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: normalized.userMessage }))
      return
    }

    const headers: Record<string, string | number> = {
      'Content-Type': entry.contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    }
    const length = contentLength(upstream)
    if (length !== null) headers['Content-Length'] = length
    const contentRange = upstream.headers.get('content-range')
    if (contentRange !== null) headers['Content-Range'] = contentRange
    if (entry.size === null) {
      const total = parseContentRangeTotal(contentRange)
      if (total !== null) entry.size = total
      else if (upstream.status === 200 && length !== null) entry.size = length
    }

    res.writeHead(upstream.status, headers)
    if (req.method === 'HEAD' || upstream.body === null) {
      res.end()
      return
    }

    // The browser's initial byte request is the natural moment to fill the
    // disk cache; it is intentionally fire-and-forget.
    if (this.options.cacheEnabled() && entry.cachePath !== null) {
      const isInitial = req.headers.range === undefined || /^bytes=0-/.test(String(req.headers.range))
      if (isInitial) void this.startRawCache(entry)
    }

    try {
      await pump(Readable.fromWeb(upstream.body as never), res)
    } catch {
      res.destroy()
    }
  }

  private async startRawCache(entry: RawEntry): Promise<void> {
    if (entry.cacheStarted || entry.cachePath === null) return
    if (this.activeDownloads >= MAX_CONCURRENT_CACHE_DOWNLOADS) return
    if (entry.size !== null && entry.size > MAX_RAW_CACHE_BYTES) return
    entry.cacheStarted = true
    this.activeDownloads++
    const temporary = `${entry.cachePath}.${process.pid}.part`
    try {
      const response = await fetch(entry.url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Referer: 'https://www.bilibili.com/',
          Origin: 'https://www.bilibili.com',
        },
        redirect: 'follow',
      })
      if (!response.ok || response.body === null) return
      const total = contentLength(response) ?? entry.size
      if (total !== null && total > MAX_RAW_CACHE_BYTES) {
        await response.body.cancel()
        return
      }
      await mkdir(dirname(entry.cachePath), { recursive: true })
      await pump(Readable.fromWeb(response.body as never), createWriteStream(temporary))
      await rename(temporary, entry.cachePath)
      const info = await stat(entry.cachePath)
      if (entry.size === null) entry.size = info.size
      this.options.logger.debug(`已缓存原始音频：${entry.cachePath}`)
      await this.enforceCacheLimit()
    } catch (error) {
      this.options.logger.debug('缓存原始音频失败（不影响播放）', toBilibiliError(error).message)
      await rm(temporary, { force: true }).catch(() => undefined)
    } finally {
      this.activeDownloads = Math.max(0, this.activeDownloads - 1)
    }
  }

  /** Cache usage across the raw and WAV stores. */
  async cacheStats(): Promise<{ files: number; bytes: number; maxBytes: number; dir: string; enabled: boolean }> {
    let files = 0
    let bytes = 0
    for (const dir of [CACHE_RAW_DIR, CACHE_WAV_DIR]) {
      try {
        const names = await readdir(dir)
        for (const name of names) {
          const info = await stat(join(dir, name)).catch(() => null)
          if (info?.isFile()) {
            files++
            bytes += info.size
          }
        }
      } catch {
        // Directory absent.
      }
    }
    return {
      files,
      bytes,
      maxBytes: this.options.cacheMaxBytes(),
      dir: CACHE_WAV_DIR,
      enabled: this.options.cacheEnabled(),
    }
  }

  async clearCache(): Promise<void> {
    await this.options.pipeline.clearCache()
    await rm(CACHE_RAW_DIR, { recursive: true, force: true })
    await mkdir(CACHE_RAW_DIR, { recursive: true })
  }

  /** Evict the oldest files across both stores until the combined size fits. */
  async enforceCacheLimit(): Promise<void> {
    const maxBytes = this.options.cacheMaxBytes()
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) return
    const files: Array<{ path: string; bytes: number; modifiedAt: number }> = []
    for (const dir of [CACHE_RAW_DIR, CACHE_WAV_DIR]) {
      try {
        const names = await readdir(dir)
        for (const name of names) {
          const path = join(dir, name)
          const info = await stat(path).catch(() => null)
          if (info?.isFile()) files.push({ path, bytes: info.size, modifiedAt: info.mtimeMs })
        }
      } catch {
        // Directory absent.
      }
    }
    let total = files.reduce((sum, file) => sum + file.bytes, 0)
    if (total <= maxBytes) return
    files.sort((left, right) => left.modifiedAt - right.modifiedAt)
    for (const file of files) {
      if (total <= maxBytes) break
      await rm(file.path, { force: true }).catch(() => undefined)
      total -= file.bytes
    }
  }

  /** Proxy a Bilibili image through the same origin. */
  async proxyImage(url: string, res: ServerResponse, signal?: AbortSignal): Promise<void> {
    let parsed: URL
    try {
      parsed = new URL(url.startsWith('//') ? `https:${url}` : url)
    } catch {
      res.writeHead(400).end()
      return
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      res.writeHead(400).end()
      return
    }
    if (!IMAGE_HOSTS.test(parsed.hostname)) {
      res.writeHead(403).end()
      return
    }
    try {
      const response = await fetch(parsed, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Referer: 'https://www.bilibili.com/',
        },
        redirect: 'follow',
        ...(signal === undefined ? {} : { signal }),
      })
      if (!response.ok || response.body === null) {
        res.writeHead(response.status === 404 ? 404 : 502).end()
        return
      }
      const length = contentLength(response)
      if (length !== null && length > MAX_IMAGE_BYTES) {
        await response.body.cancel()
        res.writeHead(413).end()
        return
      }
      const type = response.headers.get('content-type') ?? 'image/jpeg'
      res.writeHead(200, {
        'Content-Type': type.startsWith('image/') ? type : 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        ...(length === null ? {} : { 'Content-Length': length }),
      })
      await pump(Readable.fromWeb(response.body as never), res)
    } catch {
      if (!res.headersSent) res.writeHead(502)
      res.end()
    }
  }

  /** Drop stale entries so a long session does not retain every decoded track. */
  private trimEntries(): void {
    const now = Date.now()
    const maxAge = 6 * 60 * 60 * 1000
    for (const [id, entry] of this.entries) {
      if (now - entry.createdAt > maxAge) this.entries.delete(id)
    }
    while (this.entries.size > 8) {
      const oldest = this.entries.keys().next()
      if (oldest.done === true) break
      this.entries.delete(oldest.value)
    }
  }

  /** Test hook: expose the resolved track's content type. */
  entryInfo(id: string): { kind: string; contentType: string; durationSeconds: number } | null {
    const entry = this.entries.get(id)
    return entry === undefined
      ? null
      : { kind: entry.kind, contentType: entry.contentType, durationSeconds: entry.durationSeconds }
  }
}
