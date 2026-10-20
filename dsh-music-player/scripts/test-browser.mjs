/**
 * End-to-end browser check with a real Chromium (system Chrome):
 *  - mount the built host on a plain HTTP server;
 *  - load the built client bundle in a tiny fake-DSH page;
 *  - play a search result (native AAC), unmount the page, and confirm playback
 *    continues;
 *  - force the WAV path and confirm it also plays.
 */

import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import { apply } from '../lib/index.js'

const root = process.cwd()
const chrome = process.env.DMP_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

// The test page uses the real React JSX runtime (not a hand-written shim), so
// bundle it once against the page's React UMD instance.
await mkdir(join(root, 'tmp'), { recursive: true })
await build({
  entryPoints: [join(root, 'scripts', 'jsx-runtime-entry.js')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'ReactJSXRuntime',
  external: ['react'],
  outfile: join(root, 'tmp', 'react-jsx-runtime.js'),
  banner: {
    js: "const require = (id) => { if (id === 'react') return window.React; throw new Error('missing ' + id); };",
  },
  logLevel: 'silent',
})

/* ── fake DSH host ─────────────────────────────────────────────────────── */
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
const route = routes[0]

/* ── page shell ────────────────────────────────────────────────────────── */
const pageHtml = `<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>dsh-music-player test</title>
<style>html,body,#app{height:100%;margin:0}body{background:#fff}#app{display:flex;flex-direction:column}</style>
</head>
<body>
<div id="app"></div>
<script src="/assets/react.js"></script>
<script src="/assets/react-dom.js"></script>
<script src="/assets/react-jsx-runtime.js"></script>
<script>
window.__DSH_TRANSPORT__ = { streamBaseUrl: "__HOST_ORIGIN__" };
window.__ModuleLoader__ = {
  load({ id, factory }) {
    const module = { exports: {} };
    const require = (spec) => {
      if (spec === 'react') return window.React;
      if (spec === 'react/jsx-runtime') return window.ReactJSXRuntime;
      if (spec === 'react-dom') return window.ReactDOM;
      throw new Error('unexpected require ' + spec);
    };
    window.__MUSIC_MODULE__ = factory(require) ?? module.exports;
  },
};
</script>
<script src="/assets/client.js"></script>
<script>
(() => {
  const registrations = [];
  const slots = {
    inject(slot, callback) { callback(); },
    register(options, component) { registrations.push({ options, component }); return () => {}; },
  };
  const ctx = {
    effect(factory) { factory(); },
    inject(deps, callback) {
      if (deps.includes('slots')) callback({ slots });
      if (deps.includes('shortcuts')) callback({ shortcuts: { register: () => () => {} }, effect(factory) { factory(); } });
    },
    layout: { selectActivity() {} },
  };
  window.__MUSIC_MODULE__.apply(ctx);
  const activity = registrations.find((entry) => entry.options.name === 'shell.activity');
  window.__TEST_ACTIVITY__ = activity;
  window.__TEST_MOUNT__ = () => {
    const root = ReactDOM.createRoot(document.getElementById('app'));
    root.render(React.createElement(activity.component));
    window.__TEST_ROOT__ = root;
    return true;
  };
  window.__TEST_MOUNT__();
})();
</script>
</body>
</html>`

// The host runs on its own origin, exactly like the desktop app's HTTP host.
const hostServer = createServer((req, res) => {
  void route.handler(req, res)
})
await new Promise((resolve) => hostServer.listen(0, '127.0.0.1', resolve))
const hostOrigin = `http://127.0.0.1:${hostServer.address().port}`
const hostHtml = pageHtml.replace('__HOST_ORIGIN__', hostOrigin)

// The page is served from a different origin (like `dsh-app://app`), so every
// API/media request exercises the real cross-origin path.
const staticServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(hostHtml)
      return
    }
    if (url.pathname === '/assets/client.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' })
      res.end(await readFile(join(root, 'lib', 'client.js')))
      return
    }
    if (url.pathname === '/assets/react.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' })
      res.end(await readFile(join(root, 'node_modules', 'react', 'umd', 'react.development.js')))
      return
    }
    if (url.pathname === '/assets/react-dom.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' })
      res.end(await readFile(join(root, 'node_modules', 'react-dom', 'umd', 'react-dom.development.js')))
      return
    }
    if (url.pathname === '/assets/react-jsx-runtime.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' })
      res.end(await readFile(join(root, 'tmp', 'react-jsx-runtime.js')))
      return
    }
    res.writeHead(404).end()
  } catch (error) {
    console.error('server error', error)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  }
})
await new Promise((resolve) => staticServer.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${staticServer.address().port}`
console.log('test origin', origin, 'host origin', hostOrigin)
const probe = await fetch(origin)
console.log('probe', probe.status, (await probe.text()).slice(0, 80))
const healthProbe = await fetch(`${hostOrigin}/dsh-music-player/api/health`)
console.log('host health', healthProbe.status, await healthProbe.text())

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--no-sandbox'],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (error) => { pageErrors.push(String(error)); console.log('pageerror:', String(error)) })
page.on('requestfailed', (request) => { console.log('requestfailed:', request.url(), request.failure()?.errorText) })
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
    console.log('console error:', message.text())
  }
})

try {
  await page.goto(origin, { waitUntil: 'commit', timeout: 30000 })
} catch (error) {
  console.log('goto error', String(error))
  console.log('page url', page.url())
  console.log('page content', (await page.content()).slice(0, 1200))
  throw error
}
await page.waitForTimeout(1200)
console.log('page errors after load', pageErrors)
console.log('page content head', (await page.content()).slice(0, 800))
await page.waitForFunction(() => window.__DSH_MUSIC_PLAYER__ !== undefined, null, { timeout: 20000 })
  .catch((error) => {
    throw new Error(`player controller did not initialize: ${error}\npage errors: ${pageErrors.join('\n')}`)
  })
const brand = await page.locator('.dmp-brand h1').textContent()
console.log('brand', brand)
if (brand !== '音乐播放器') throw new Error('player page did not render')
const layout = await page.evaluate(() => ({
  playerBar: document.querySelectorAll('.dmp-playerbar').length,
  topbarButtons: document.querySelectorAll('.dmp-topbar-actions button').length,
  sidePanels: document.querySelectorAll('.dmp-side').length,
  mainDivs: document.querySelectorAll('main.dmp-main > div').length,
}))
console.log('layout', layout)
if (layout.playerBar !== 0) throw new Error('bottom player bar is still rendered')
if (layout.topbarButtons !== 0) throw new Error('topbar account button is still rendered')
if (layout.sidePanels !== 1) throw new Error('right playback panel is missing')
if (layout.mainDivs !== 1) throw new Error('main should only contain the content area')

await page.getByRole('button', { name: '久石让', exact: true }).click()
await page.waitForFunction(() => {
  const search = window.__DSH_MUSIC_PLAYER__.controller.library.getSnapshot().search
  return search !== null && search.loading === false
}, null, { timeout: 60000 })
const searchInfo = await page.evaluate(() => {
  const search = window.__DSH_MUSIC_PLAYER__.controller.library.getSnapshot().search
  return {
    count: search.items.length,
    first: search.items[0]?.title,
    hasMarkup: search.items.some((item) => /<[^>]+>/.test(item.title)),
    page: search.page,
    numPages: search.numPages,
  }
})
console.log('search', searchInfo)
if (searchInfo.count === 0) throw new Error('search returned no results')
if (searchInfo.hasMarkup) throw new Error('search titles still contain HTML')

await page.locator('.dmp-result-list .dmp-result-actions button[title="播放"]').first().click()
await page.waitForFunction(() => {
  const state = window.__DSH_MUSIC_PLAYER__.controller.player.getSnapshot()
  return state.format !== null && !state.loading
}, null, { timeout: 60000 })
await page.waitForFunction(() => {
  const audio = window.__DSH_MUSIC_PLAYER__.audio
  return audio !== undefined && !audio.paused && audio.currentTime > 0.4
}, null, { timeout: 90000 })
const nativeInfo = await page.evaluate(async () => {
  const controller = window.__DSH_MUSIC_PLAYER__.controller
  const audio = window.__DSH_MUSIC_PLAYER__.audio
  const state = controller.player.getSnapshot()
  const response = await fetch(audio.src, { headers: { Range: 'bytes=0-0' } })
  return {
    format: state.format,
    playing: state.playing,
    paused: audio.paused,
    currentTime: Number(audio.currentTime.toFixed(2)),
    duration: Number(audio.duration.toFixed(2)),
    errorCode: audio.error?.code ?? null,
    mediaStatus: response.status,
    mediaType: response.headers.get('content-type'),
    src: audio.src,
  }
})
console.log('native', nativeInfo)
if (nativeInfo.errorCode !== null) throw new Error(`native playback error ${nativeInfo.errorCode}`)
if (!nativeInfo.playing || nativeInfo.paused) throw new Error('native playback did not start')

// Unmount the page: the controller and its audio element must keep running.
await page.evaluate(() => { window.__TEST_ROOT__.unmount() })
await page.waitForTimeout(1300)
const afterUnmount = await page.evaluate(() => {
  const audio = window.__DSH_MUSIC_PLAYER__.audio
  return { paused: audio.paused, currentTime: Number(audio.currentTime.toFixed(2)) }
})
console.log('after unmount', afterUnmount)
if (afterUnmount.paused) throw new Error('playback stopped when the activity page unmounted')

// Remount, force the WAV path, and play a short direct-BV track.
await page.evaluate(() => {
  const controller = window.__DSH_MUSIC_PLAYER__.controller
  controller.player.set((state) => ({ ...state, nativeAac: false }))
  window.__TEST_MOUNT__()
})
await page.locator('.dmp-search-input').fill('BV1Za4y1G7Vq')
await page.locator('.dmp-search-input').press('Enter')
await page.waitForFunction(() => {
  const search = window.__DSH_MUSIC_PLAYER__.controller.library.getSnapshot().search
  return search !== null && !search.loading && search.keyword === 'BV1Za4y1G7Vq' && search.items.length > 0
}, null, { timeout: 60000 })
// The same BV is already the current native track, so its row button reads
// "暂停". Drive the controller directly to force the WAV delivery path.
await page.evaluate(() => {
  const controller = window.__DSH_MUSIC_PLAYER__.controller
  const track = controller.library.getSnapshot().search.items[0]
  return controller.playTrack(track, { keepQueue: true, forceWav: true })
})
await page.waitForFunction(() => {
  const state = window.__DSH_MUSIC_PLAYER__.controller.player.getSnapshot()
  return state.format === 'wav' && !state.loading
}, null, { timeout: 180000 })
await page.waitForFunction(() => {
  const audio = window.__DSH_MUSIC_PLAYER__.audio
  return audio !== undefined && !audio.paused && audio.currentTime > 0.4
}, null, { timeout: 180000 })
const wavInfo = await page.evaluate(async () => {
  const controller = window.__DSH_MUSIC_PLAYER__.controller
  const audio = window.__DSH_MUSIC_PLAYER__.audio
  const state = controller.player.getSnapshot()
  const response = await fetch(audio.src, { headers: { Range: 'bytes=0-0' } })
  return {
    format: state.format,
    playing: state.playing,
    paused: audio.paused,
    currentTime: Number(audio.currentTime.toFixed(2)),
    duration: Number(audio.duration.toFixed(2)),
    errorCode: audio.error?.code ?? null,
    mediaStatus: response.status,
    mediaType: response.headers.get('content-type'),
  }
})
console.log('wav', wavInfo)
if (wavInfo.errorCode !== null) throw new Error(`wav playback error ${wavInfo.errorCode}`)
if (wavInfo.mediaType !== 'audio/wav') throw new Error(`unexpected wav content type ${wavInfo.mediaType}`)

await page.screenshot({ path: join(root, 'tmp', 'player-page.png'), fullPage: false })
console.log('screenshot tmp/player-page.png')
if (pageErrors.length > 0) throw new Error(`page errors: ${pageErrors.join('\n')}`)

await browser.close()
for (const dispose of disposers.reverse()) {
  try { dispose() } catch { /* ignore */ }
}
staticServer.close()
hostServer.close()
console.log('browser test passed')
