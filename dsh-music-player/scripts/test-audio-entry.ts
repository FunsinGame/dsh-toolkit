import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { AudioPipeline } from '../src/host/audio/pipeline'
import { BilibiliApi, BilibiliClient, WbiKeyStore } from '../src/host/bili'
import { printWavSummary } from './wav-summary'

const bvid = process.argv[2] ?? 'BV1Za4y1G7Vq'
const cid = Number(process.argv[3] ?? '1119302808')

const logger = {
  debug: (m: string, d?: unknown) => console.log('[debug]', m, d ?? ''),
  info: (m: string, d?: unknown) => console.log('[info]', m, d ?? ''),
  warn: (m: string, d?: unknown) => console.warn('[warn]', m, d ?? ''),
  error: (m: string, d?: unknown) => console.error('[error]', m, d ?? ''),
}

const client = new BilibiliClient({
  readCookies: () => null,
  logger,
  minIntervalMs: () => 100,
})
const wbi = new WbiKeyStore({
  load: async () => {
    const nav = await api.getNav()
    return { imgUrl: nav.wbi_img.img_url, subUrl: nav.wbi_img.sub_url }
  },
  logger,
})
const api = new BilibiliApi(client, wbi, logger)
const pipeline = new AudioPipeline({ api, client, logger, cacheDir: null })

const pages = await api.getPageList(bvid)
console.log('pages', pages.map((page) => ({ cid: page.cid, part: page.part, duration: page.duration })))
const page = pages.find((item) => item.cid === cid) ?? pages[0]
if (!page) throw new Error('no pages')
console.log('materializing', { bvid, cid: page.cid, duration: page.duration })
const started = Date.now()
const audio = await pipeline.materialize({
  bvid,
  cid: page.cid,
  quality: 30280,
  durationHintSeconds: page.duration,
  onStage: (stage, message, percent) => {
    console.log('stage', stage, message, percent)
  },
})
console.log('done', {
  ms: Date.now() - started,
  durationSeconds: audio.durationSeconds,
  sampleRate: audio.sampleRate,
  channels: audio.channels,
  bytes: audio.wav.byteLength,
})
printWavSummary(audio.wav)
await mkdir(join(process.cwd(), 'tmp'), { recursive: true })
await writeFile(join(process.cwd(), 'tmp', 'test-audio.wav'), audio.wav)
console.log('wrote tmp/test-audio.wav')
