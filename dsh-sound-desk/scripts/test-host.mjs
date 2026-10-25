/**
 * Host-half integration test.
 *
 * Loads the built plugin exactly the way DSH does — through `apply(ctx)` with a
 * `webServer` service — then speaks HTTP to the registered route. That covers the
 * parts a unit test would miss: the prefix proxy, token injection, Range streaming,
 * library import, and the authentication hook.
 *
 *   node scripts/test-host.mjs
 */

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tmp = join(root, 'tmp', 'host-test')
const dshHome = join(tmp, 'dsh-home')
const library = join(tmp, 'library')

process.env.DSH_HOME = dshHome

await rm(tmp, { recursive: true, force: true })
await mkdir(library, { recursive: true })
await mkdir(dshHome, { recursive: true })

/** A 0.5 s 48 kHz mono 16-bit sine — a real RIFF file the engine can analyse. */
function makeWav(seconds = 0.5, sampleRate = 48_000, frequency = 440) {
  const samples = Math.round(seconds * sampleRate)
  const dataBytes = samples * 2
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataBytes, 40)
  for (let i = 0; i < samples; i += 1) {
    const value = Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 16_000)
    buffer.writeInt16LE(value, 44 + i * 2)
  }
  return buffer
}

const wavPath = join(library, 'ui_tone_confirm_01.wav')
await writeFile(wavPath, makeWav())

// -- the DSH composition, faked just enough ------------------------------

const routes = []
const effects = []
const server = {
  register(route) {
    assert.equal(route.kind, 'prefix')
    routes.push(route)
    return () => {
      const index = routes.indexOf(route)
      if (index >= 0) routes.splice(index, 1)
    }
  },
}

const connection = {
  requestRejection(request) {
    return request.headers['x-test-auth'] === 'yes' ? undefined : 401
  },
}

const ctx = {
  effect(factory, label) {
    const dispose = factory()
    effects.push({ label, dispose })
    return () => {}
  },
  inject(deps, callback) {
    assert.ok(Array.isArray(deps))
    callback(ctx)
  },
  get(name) {
    return name === 'connection' ? connection : undefined
  },
  webServer: server,
}

const { apply, resolvePackage } = await import(new URL('../lib/index.js', import.meta.url).href)
apply(ctx)
assert.equal(routes.length, 1, 'apply() registers exactly one prefix route')

// -- optional dependency resolution --------------------------------------

console.log('optional dependencies')
{
  const reference = resolve(root, '..', 'sound-desk')
  const searchRoots = [reference, join(reference, 'packages', 'engine')]

  const transformers = resolvePackage('@huggingface/transformers', searchRoots)
  check(
    'transformers resolves to its package root, not dist/',
    transformers !== null && transformers.dir.endsWith(join('@huggingface', 'transformers')),
    transformers?.dir ?? 'not found',
  )
  check(
    'transformers resolves its ESM entry',
    transformers !== null && transformers.url.endsWith('transformers.node.mjs'),
    transformers?.url ?? '',
  )
  if (transformers !== null) {
    const lib = await import(transformers.url)
    check(
      'transformers exposes the CLAP API the engine calls',
      typeof lib.AutoTokenizer?.from_pretrained === 'function' &&
        typeof lib.AutoProcessor?.from_pretrained === 'function' &&
        typeof lib.env === 'object',
    )
  }

  const ffmpegPackage = resolvePackage('ffmpeg-static', searchRoots)
  check(
    'ffmpeg-static resolves to its package root',
    ffmpegPackage !== null && ffmpegPackage.dir.endsWith('ffmpeg-static'),
    ffmpegPackage?.dir ?? 'not found',
  )
  check(
    'ffmpeg binary exists where the plugin looks for it',
    ffmpegPackage !== null && existsSync(join(ffmpegPackage.dir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')),
  )
}

// -- a plain HTTP server that dispatches like DSH's -----------------------

const http = createServer((req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
  const route = routes.find(
    (candidate) => pathname === candidate.path || pathname.startsWith(`${candidate.path}/`),
  )
  if (route === undefined) {
    res.writeHead(404).end('no route')
    return
  }
  void route.handler(req, res)
})

await new Promise((resolveListen) => http.listen(0, '127.0.0.1', resolveListen))
const port = http.address().port
const origin = `http://127.0.0.1:${port}`

async function call(path, init = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    headers: { 'x-test-auth': 'yes', ...(init.headers ?? {}) },
  })
}

async function json(path, init) {
  const response = await call(path, init)
  const text = await response.text()
  assert.ok(response.ok, `${path} → ${response.status}: ${text.slice(0, 400)}`)
  return JSON.parse(text)
}

function check(name, condition, detail = '') {
  assert.ok(condition, `${name}${detail === '' ? '' : ` — ${detail}`}`)
  console.log(`  ✓ ${name}`)
}

try {
  console.log('host routes')

  // Authentication is the handler's job on a raw route.
  const anonymous = await fetch(`${origin}/dsh-sound-desk/host/status`)
  check('unauthenticated request is rejected', anonymous.status === 401, `got ${anonymous.status}`)

  const described = await json('/dsh-sound-desk')
  check('plugin descriptor', described.plugin === 'dsh-sound-desk' && typeof described.version === 'string')

  // The point of the lazy host half: applying the plugin must leave the engine
  // untouched. A plain status (no `wait`) answers from the host without starting it.
  const idle = await json('/dsh-sound-desk/host/status')
  check('engine is idle after apply()', idle.state === 'idle', JSON.stringify(idle).slice(0, 300))
  check('no engine is listening yet', idle.engineUrl === null && idle.stats === null)

  const status = await json('/dsh-sound-desk/host/status?wait=1')
  check('engine starts on the first entry', status.state === 'ready', JSON.stringify(status).slice(0, 300))
  check('data dir resolves under DSH_HOME', status.dataDir.startsWith(dshHome), status.dataDir)
  check('settings no longer expose autoStart', !('autoStart' in status.settings), JSON.stringify(status.settings))
  check('ffmpeg status is reported', 'ffmpeg' in status)

  console.log('engine API through the prefix proxy')
  const stats0 = await json('/dsh-sound-desk/api/stats')
  check('stats proxy answers', typeof stats0.assets === 'number')

  const ucs = await json('/dsh-sound-desk/api/ucs/tree')
  check('UCS dataset is available', Array.isArray(ucs.tree) && ucs.tree.length > 20, `${ucs.tree?.length} categories`)

  console.log('library import')
  const imported = await json('/dsh-sound-desk/host/import-library', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root: library, name: 'test-library' }),
  })
  check('library created', imported.library?.name === 'test-library', JSON.stringify(imported.library))
  check('scan pass ran', imported.passes?.[0]?.pass === 'scan')
  check('waveform pass ran', imported.passes?.[1]?.pass === 'waveform')
  check('one asset indexed', imported.passes?.[0]?.job?.done === 1, JSON.stringify(imported.passes?.[0]))

  const stats = await json('/dsh-sound-desk/api/stats')
  check('asset count updated', stats.assets === 1, `assets=${stats.assets}`)
  check('waveform cached', stats.peaks === 1, `peaks=${stats.peaks}`)

  const search = await json('/dsh-sound-desk/api/search?q=tone&mode=keyword')
  check('keyword search finds the file', search.hits?.length === 1, JSON.stringify(search).slice(0, 300))
  const assetId = search.hits[0].asset.id
  check('classification is attached', typeof search.hits[0].asset.ucsCatId === 'string' || search.hits[0].asset.ucsCatId === null)

  const asset = await json(`/dsh-sound-desk/api/assets/${assetId}`)
  check('asset detail', asset.id === assetId && asset.filename === 'ui_tone_confirm_01.wav')

  console.log('media routes')
  const stream = await call(`/dsh-sound-desk/api/media/${assetId}/stream`, {
    headers: { range: 'bytes=0-99' },
  })
  check('range request returns 206', stream.status === 206, `status=${stream.status}`)
  check('content-range is forwarded', (stream.headers.get('content-range') ?? '').startsWith('bytes 0-99/'))
  const chunk = Buffer.from(await stream.arrayBuffer())
  check('partial body length', chunk.length === 100, `${chunk.length} bytes`)
  check('riff header preserved', chunk.subarray(0, 4).toString('ascii') === 'RIFF')

  const peaks = await call(`/dsh-sound-desk/api/media/${assetId}/peaks`)
  check('peaks endpoint', peaks.ok && (peaks.headers.get('content-type') ?? '').includes('octet-stream'))

  const download = await call(`/dsh-sound-desk/api/media/${assetId}/download`)
  const disposition = download.headers.get('content-disposition') ?? ''
  check('download carries the original name', disposition.includes('ui_tone_confirm_01.wav'), disposition)
  await download.arrayBuffer()

  console.log('settings and engine control')
  const settings = await json('/dsh-sound-desk/host/settings')
  check('settings read', settings.settings.loadModel === false && settings.restartRequired === false)

  const updated = await json('/dsh-sound-desk/host/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ logLevel: 'verbose' }),
  })
  check('settings write persists', updated.settings.logLevel === 'verbose')
  check('non-engine change needs no restart', updated.restartRequired === false)

  const logs = await json('/dsh-sound-desk/host/logs')
  check('logs include engine output', logs.lines.length > 0 && logs.lines.some((line) => line.text.includes('engine ready')))

  console.log('rejection of unknown paths')
  const missing = await call('/dsh-sound-desk/api/does-not-exist')
  check('unknown api path is a 404 from the engine', missing.status === 404, `status=${missing.status}`)

  const outside = await call('/dsh-sound-desk/../etc/passwd')
  check('path outside the prefix is not routed', outside.status === 404)

  console.log('\nall host checks passed')
} finally {
  http.close()
  for (const effect of effects.reverse()) {
    try {
      await effect.dispose?.()
    } catch {
      /* already disposed */
    }
  }
  await new Promise((resolveClose) => setTimeout(resolveClose, 150))
  await rm(tmp, { recursive: true, force: true }).catch(() => undefined)
}
