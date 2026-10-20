/**
 * Standalone host smoke test: mount the built plugin on a plain Node HTTP
 * server and exercise the same routes the browser half uses.
 */

import { createServer } from 'node:http'
import { apply } from '../lib/index.js'

const routes = []
const disposers = []

const fakeCtx = {
  effect(factory) {
    const dispose = factory()
    if (typeof dispose === 'function') disposers.push(dispose)
  },
  inject(deps, callback) {
    if (!deps.includes('webServer')) return
    callback({
      webServer: {
        register(route) {
          routes.push(route)
          return () => undefined
        },
      },
      effect(factory) {
        const dispose = factory()
        if (typeof dispose === 'function') disposers.push(dispose)
      },
    })
  },
}

apply(fakeCtx)
if (routes.length === 0) throw new Error('no route registered')
const route = routes[0]
const server = createServer((req, res) => {
  void route.handler(req, res)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
console.log('origin', origin)

async function get(path) {
  const response = await fetch(`${origin}${path}`)
  const text = await response.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { status: response.status, body }
}

for (let attempt = 0; attempt < 40; attempt++) {
  const health = await get('/dsh-music-player/api/health')
  if (health.status === 200) {
    console.log('health', health.body)
    break
  }
  await new Promise((resolve) => setTimeout(resolve, 250))
}

const status = await get('/dsh-music-player/api/status')
console.log('status', status.status, JSON.stringify(status.body).slice(0, 600))

const search = await get('/dsh-music-player/api/search?keyword=' + encodeURIComponent('BV1Za4y1G7Vq'))
console.log('search', search.status, JSON.stringify(search.body).slice(0, 600))

const searchText = await get('/dsh-music-player/api/search?keyword=' + encodeURIComponent('久石让'))
console.log('search text', searchText.status, searchText.body?.data?.items?.length, searchText.body?.data?.items?.[0]?.title)

const track = search.body?.data?.items?.[0]
if (track) {
  const playResponse = await fetch(`${origin}/dsh-music-player/api/play`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bvid: track.bvid,
      cid: track.cid,
      quality: 30280,
      format: 'raw',
      track,
    }),
  })
  const play = await playResponse.json()
  console.log('play raw', playResponse.status, JSON.stringify(play).slice(0, 700))
  if (play.ok) {
    const media = await fetch(`${origin}${play.data.url}`, { headers: { Range: 'bytes=0-1023' } })
    const bytes = Buffer.from(await media.arrayBuffer())
    console.log('media raw', media.status, media.headers.get('content-type'), media.headers.get('content-range'), bytes.subarray(4, 8).toString())

    const playWavResponse = await fetch(`${origin}/dsh-music-player/api/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bvid: track.bvid,
        cid: track.cid,
        quality: 30280,
        format: 'wav',
        track,
      }),
    })
    const playWav = await playWavResponse.json()
    console.log('play wav', playWavResponse.status, JSON.stringify(playWav).slice(0, 700))
    if (playWav.ok) {
      const media = await fetch(`${origin}${playWav.data.url}`, { headers: { Range: 'bytes=0-63' } })
      const bytes = Buffer.from(await media.arrayBuffer())
      console.log('media wav', media.status, media.headers.get('content-type'), media.headers.get('content-range'), bytes.toString('ascii', 0, 4), bytes.toString('ascii', 8, 12))
    }
  }
}

const settings = await get('/dsh-music-player/api/settings')
console.log('settings', settings.status, JSON.stringify(settings.body).slice(0, 500))
const cache = await get('/dsh-music-player/api/cache')
console.log('cache', cache.status, JSON.stringify(cache.body).slice(0, 300))

const favorites = await get('/dsh-music-player/api/favorites')
console.log('favorites unauth', favorites.status, JSON.stringify(favorites.body).slice(0, 200))

const qr = await get('/dsh-music-player/api/auth/qr')
console.log('qr', qr.status, String(qr.body?.data?.dataUrl ?? '').slice(0, 46), String(qr.body?.data?.url ?? '').slice(0, 46))

const settingResponse = await fetch(`${origin}/dsh-music-player/api/settings`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'volume', value: 0.55 }),
})
const setting = await settingResponse.json()
console.log('setting update', settingResponse.status, setting.data?.settings?.volume)

// Restore the original default so the check leaves the profile as it found it.
await fetch(`${origin}/dsh-music-player/api/settings`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'volume', value: 0.8 }),
})

for (const dispose of disposers.reverse()) {
  try { dispose() } catch { /* ignore */ }
}
server.close()
