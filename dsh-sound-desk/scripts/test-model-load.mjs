/**
 * "Enable the fingerprint model" regression test.
 *
 * The reported failure was module resolution: `preloadTransformers` treated the entry
 * file's parent (`dist/`) as the package root and then failed to read
 * `dist/package.json`. This test boots the real bundle with `loadModel: true` and
 * asserts that the transformers module loads, so the only thing that can fail
 * afterwards is the model download itself.
 *
 * No external network is used: the model host is pointed at a local server that
 * answers 404, which makes `from_pretrained` fail immediately. The engine must still
 * start and report the model error instead of a module-loading error.
 *
 *   node scripts/test-model-load.mjs
 */

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tmp = join(root, 'tmp', 'model-test')
const dshHome = join(tmp, 'dsh-home')

process.env.DSH_HOME = dshHome

// A local endpoint that refuses every model request, so nothing is downloaded.
const deadHost = createServer((_req, res) => {
  res.writeHead(404).end('no models here')
})
await new Promise((done) => deadHost.listen(0, '127.0.0.1', done))
process.env.SOUNDDESK_HF_HOST = `http://127.0.0.1:${deadHost.address().port}`

await rm(tmp, { recursive: true, force: true })
await mkdir(join(dshHome, 'sound-desk'), { recursive: true })
await writeFile(
  join(dshHome, 'sound-desk', 'settings.json'),
  JSON.stringify({ loadModel: true, autoStart: true, logLevel: 'verbose' }, null, 2),
)

const routes = []
const effects = []
const ctx = {
  effect(factory) {
    effects.push(factory())
  },
  inject(_deps, callback) {
    callback(ctx)
  },
  get() {
    return undefined
  },
  webServer: {
    register(route) {
      routes.push(route)
      return () => {}
    },
  },
}

function check(name, condition, detail = '') {
  assert.ok(condition, `${name}${detail === '' ? '' : ` — ${detail}`}`)
  console.log(`  ✓ ${name}`)
}

const plugin = await import(new URL('../lib/index.js', import.meta.url).href)
plugin.apply(ctx)
assert.equal(routes.length, 1)

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
await new Promise((done) => http.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${http.address().port}`

try {
  console.log('model-enabled boot')
  const started = Date.now()
  const status = await (await fetch(`${origin}/dsh-sound-desk/host/status?wait=1`)).json()
  console.log(`  (booted in ${((Date.now() - started) / 1000).toFixed(1)}s)`)

  check('engine still starts', status.state === 'ready', status.error ?? '')
  check('model is not reported as loaded', status.modelLoaded === false)

  const logs = await (await fetch(`${origin}/dsh-sound-desk/host/logs?limit=300`)).json()
  const lines = logs.lines.map((line) => line.text)
  const loaded = lines.find((line) => line.startsWith('transformers loaded from '))
  check('transformers module loaded from a package directory', loaded !== undefined, lines.slice(0, 4).join(' | '))
  check(
    'the loaded path is a package root, not dist/',
    loaded !== undefined && !loaded.replace('transformers loaded from ', '').endsWith('dist'),
    loaded ?? '',
  )
  check(
    'no module-loading failure is reported',
    status.embedderError === null ||
      !/找到了 @huggingface\/transformers，但加载失败|package\.json/.test(status.embedderError),
    status.embedderError ?? '',
  )
  check(
    'model failure names the model attempt, not the module',
    status.embedderError === null || status.embedderError !== '',
    status.embedderError ?? 'no error text',
  )
  console.log(`  embedderError: ${status.embedderError ?? '（无）'}`)

  console.log('\nmodel-enabled boot checks passed')
} finally {
  http.close()
  deadHost.close()
  for (const dispose of effects.reverse()) {
    try {
      await dispose?.()
    } catch {
      /* already disposed */
    }
  }
  await new Promise((done) => setTimeout(done, 150))
  await rm(tmp, { recursive: true, force: true }).catch(() => undefined)
}
