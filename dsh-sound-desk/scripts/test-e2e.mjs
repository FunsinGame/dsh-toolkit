/**
 * End-to-end test: the real host half, the real engine, and the real browser bundle.
 *
 * Nothing here is mocked. The script imports `lib/index.js` through the same
 * `apply(ctx)` DSH calls, registers the route on a plain HTTP server, imports a
 * generated sound library, then loads `lib/client.js` in Chrome through DSH's module
 * loader contract and drives the workbench: browse, select, play, waveform.
 *
 *   node scripts/test-e2e.mjs [--screenshot docs/screenshot.png]
 */

import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tmp = join(root, 'tmp', 'e2e')
const dshHome = join(tmp, 'dsh-home')
const library = join(tmp, 'library')
const shotFlag = process.argv.indexOf('--screenshot')
const screenshotPath = shotFlag >= 0 ? process.argv[shotFlag + 1] : null

process.env.DSH_HOME = dshHome
await rm(tmp, { recursive: true, force: true })
await mkdir(library, { recursive: true })
await mkdir(dshHome, { recursive: true })

const requireFrom = createRequire(join(root, '..', 'dsh-music-player', 'package.json'))
const { chromium } = requireFrom('playwright-core')

// -- a small but real library --------------------------------------------

/** Stereo 16-bit PCM with a decaying two-tone body, sized by `seconds`. */
function makeWav(seconds, baseHz, decay) {
  const sampleRate = 48_000
  const frames = Math.round(seconds * sampleRate)
  const dataBytes = frames * 4
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(2, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 4, 28)
  buffer.writeUInt16LE(4, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataBytes, 40)
  let offset = 44
  for (let i = 0; i < frames; i += 1) {
    const t = i / sampleRate
    const env = Math.min(1, t / 0.005) * Math.exp(-t * decay)
    const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1
    const body = Math.sin(2 * Math.PI * baseHz * t) * 0.6 + Math.sin(2 * Math.PI * baseHz * 2.1 * t) * 0.26
    const sample = Math.max(-1, Math.min(1, (body + noise * 0.2) * env * 0.9))
    buffer.writeInt16LE(Math.round(sample * 32767), offset)
    buffer.writeInt16LE(Math.round(sample * 0.93 * 32767), offset + 2)
    offset += 4
  }
  return buffer
}

const files = [
  ['door_metal_slam_heavy_04.wav', 1.6, 82, 2.6],
  ['door_metal_close_latch_02.wav', 0.9, 120, 4.2],
  ['impact_metal_clang_01.wav', 1.2, 260, 3.4],
  ['ui_confirm_tone_02.wav', 0.5, 880, 5.0],
  ['amb_forest_dawn_loop_01.wav', 3.4, 140, 0.6],
  ['footstep_gravel_run_03.wav', 1.1, 190, 3.8],
  ['whoosh_fast_passby_07.wav', 1.8, 320, 1.9],
  ['glass_break_small_02.wav', 0.7, 1400, 6.0],
]
for (const [name, seconds, hz, decay] of files) {
  await writeFile(join(library, name), makeWav(seconds, hz, decay))
}

// -- host half ------------------------------------------------------------

const routes = []
const effects = []
const fakeWebServer = {
  register(route) {
    routes.push(route)
    return () => {
      const index = routes.indexOf(route)
      if (index >= 0) routes.splice(index, 1)
    }
  },
}
const ctx = {
  effect(factory) {
    effects.push(factory())
  },
  inject(_deps, callback) {
    callback(ctx)
  },
  get(name) {
    return name === 'connection' ? undefined : undefined
  },
  webServer: fakeWebServer,
}

const hostModule = await import(new URL('../lib/index.js', import.meta.url).href)
hostModule.apply(ctx)

const http = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(pageHtml)
    return
  }
  if (url.pathname === '/vendor/react.js' || url.pathname === '/vendor/react-dom.js') {
    const name = url.pathname.endsWith('react.js') ? 'react' : 'react-dom'
    const file = name === 'react'
      ? join(root, 'node_modules', 'react', 'umd', 'react.production.min.js')
      : join(root, 'node_modules', 'react-dom', 'umd', 'react-dom.production.min.js')
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    res.end(readFileSync(file))
    return
  }
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204).end()
    return
  }
  if (url.pathname === '/dsh-sound-desk/client.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    res.end(readFileSync(join(root, 'lib', 'client.js')))
    return
  }
  const route = routes.find(
    (candidate) => url.pathname === candidate.path || url.pathname.startsWith(`${candidate.path}/`),
  )
  if (route === undefined) {
    res.writeHead(404).end('no route')
    return
  }
  void route.handler(req, res)
})

const pageHtml = `<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8" />
<title>SoundDesk</title>
<style>
  :root {
    color-scheme: dark;
    --dsw-alias-bg-base: rgb(21, 21, 23);
    --dsw-alias-bg-layer-1: rgb(35, 35, 36);
    --dsw-alias-bg-layer-2: rgb(44, 44, 46);
    --dsw-alias-border-l1: rgba(255, 255, 255, 0.06);
    --dsw-alias-border-l2: rgba(255, 255, 255, 0.12);
    --dsw-alias-label-primary: rgb(249, 250, 251);
    --dsw-alias-label-primary-foreground: rgb(10, 10, 11);
    --dsw-alias-label-secondary: rgb(207, 211, 214);
    --dsw-alias-label-tertiary: rgb(173, 178, 184);
    --dsw-alias-link: rgb(122, 170, 255);
    --dsw-alias-button-primary-fill: rgb(249, 250, 251);
    --dsw-alias-state-success-primary: rgb(34, 197, 94);
    --dsw-alias-state-warn-primary: rgb(245, 158, 11);
    --dsw-alias-state-error-primary: rgb(242, 90, 90);
    --dsw-alias-state-business-primary: rgb(122, 170, 255);
    --dsw-alias-interactive-bg-hover: rgba(255, 255, 255, 0.08);
    --dsw-alias-interactive-bg-active: rgba(255, 255, 255, 0.14);
    --dsw-radius-sm: 8px;
    --dsw-font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    --ds-font-family-code: Consolas, monospace;
  }
  html, body, #root { height: 100%; margin: 0; }
  body { background: var(--dsw-alias-bg-base); }
</style>
</head>
<body>
  <div id="root"></div>
  <script src="/vendor/react.js"></script>
  <script src="/vendor/react-dom.js"></script>
  <script>
    // DSH's module-loader contract, with React served as the platform module.
    var modules = {};
    window.__ModuleLoader__ = { load: function (registration) { modules[registration.id] = registration.factory; } };
    // The automatic JSX runtime takes (type, props, key); React.createElement takes
    // (type, props, ...children). Adapt instead of aliasing, or the key becomes the
    // only child.
    function jsxFactory(type, props, key) {
      var merged = props || {};
      if (key !== undefined) merged = Object.assign({}, merged, { key: key });
      return React.createElement(type, merged, merged.children);
    }
    var jsxRuntime = {
      Fragment: React.Fragment,
      jsx: jsxFactory,
      jsxs: jsxFactory,
      jsxDEV: jsxFactory,
    };
    function platformRequire(spec) {
      if (spec === 'react') return React;
      if (spec === 'react/jsx-runtime') return jsxRuntime;
      if (spec === 'react-dom') return ReactDOM;
      if (spec === 'react-dom/client') return ReactDOM;
      throw new Error('unexpected platform module: ' + spec);
    }
  </script>
  <script src="/dsh-sound-desk/client.js"></script>
  <script>
    (function () {
      var exported = modules['dsh-sound-desk'](platformRequire);
      var registrations = [];
      var slots = {
        inject: function (slot, callback) { callback(); },
        register: function (options, component) {
          registrations.push({ options: options, component: component });
          return function () {};
        },
      };
      var noop = function () {};
      var clientCtx = {
        effect: function (factory) { factory(); },
        inject: function (deps, callback) {
          callback({
            slots: slots,
            shortcuts: { register: function () { return noop; } },
            effect: function (factory) { factory(); },
          });
        },
        layout: { selectActivity: noop },
      };
      exported.apply(clientCtx);
      var page = registrations.filter(function (entry) { return entry.options.name === 'shell.activity'; })[0];
      var container = document.getElementById('root');
      if (typeof ReactDOM.createRoot === 'function') {
        ReactDOM.createRoot(container).render(React.createElement(page.component));
      } else {
        ReactDOM.render(React.createElement(page.component), container);
      }
    })();
  </script>
</body>
</html>`

await new Promise((resolveListen) => http.listen(0, '127.0.0.1', resolveListen))
const origin = `http://127.0.0.1:${http.address().port}`

async function json(path, init) {
  const response = await fetch(`${origin}${path}`, init)
  const text = await response.text()
  if (!response.ok) throw new Error(`${path} → ${response.status}: ${text.slice(0, 300)}`)
  return text === '' ? null : JSON.parse(text)
}

function check(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail === '' ? '' : ` — ${detail}`}`)
  console.log(`  ✓ ${name}`)
}

const chromePath = process.env.DSH_SCREENSHOT_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
if (!existsSync(chromePath)) throw new Error(`Chrome not found at ${chromePath}`)

let browser
try {
  console.log('host')
  const status = await json('/dsh-sound-desk/host/status?wait=1')
  check('engine ready', status.state === 'ready', status.error ?? '')
  const imported = await json('/dsh-sound-desk/host/import-library', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root: library, name: '音效测试库' }),
  })
  check('library imported', imported.passes?.[0]?.job?.done === files.length, JSON.stringify(imported.passes?.[0]))
  const stats = await json('/dsh-sound-desk/api/stats')
  check('waveforms built', stats.peaks === files.length, `peaks=${stats.peaks}`)

  console.log('browser')
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => { errors.push(String(error)); console.error('pageerror:', String(error)) })
  page.on('console', (message) => { if (message.type() === 'error') console.error('console:', message.text()) })
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`)
  })

  await page.goto(`${origin}/`, { waitUntil: 'load' })
  try {
    await page.waitForFunction(() => {
      const shadow = document.querySelector('#root div')?.shadowRoot
      return shadow?.querySelector('.topbar') !== null
    }, { timeout: 20_000 })
  } catch (failure) {
    const dump = await page.evaluate(() => ({
      html: document.getElementById('root')?.innerHTML?.slice(0, 400),
      shadow: document.querySelector('#root div')?.shadowRoot?.innerHTML?.slice(0, 800),
      modules: Object.keys(window.__ModuleLoader__ ?? {}),
    })).catch(() => null)
    console.error('page dump:', JSON.stringify(dump))
    throw failure
  }
  // The store fetches libraries/stats/ucs/jobs then browses the catalogue.
  try {
    await page.waitForFunction(() => {
      const shadow = document.querySelector('#root div')?.shadowRoot
      return (shadow?.querySelector('.results')?.textContent ?? '').includes('door_metal_slam')
    }, { timeout: 20_000 })
  } catch (failure) {
    console.error('modes:', await page.evaluate(() => document.querySelector('#root div')?.shadowRoot?.querySelector('.modes')?.outerHTML))
    console.error('row:', await page.evaluate(() => document.querySelector('#root div')?.shadowRoot?.querySelector('.row')?.outerHTML))
    console.error('library:', await page.evaluate(() => document.querySelector('#root div')?.shadowRoot?.querySelector('.pane .section')?.outerHTML))
    await page.screenshot({ path: join(root, 'tmp', 'e2e-fail.png') })
    throw failure
  }

  const rendered = await page.evaluate(() => {
    const shadow = document.querySelector('#root div')?.shadowRoot
    return {
      text: shadow?.querySelector('.dsh-sdk-mount')?.textContent ?? '',
      rows: shadow?.querySelectorAll('.row').length ?? 0,
      hasStyle: (shadow?.querySelector('style[data-plugin="dsh-sound-desk"]')?.textContent?.length ?? 0) > 5000,
    }
  })
  check('workbench rendered', rendered.text.includes('SoundDesk'))
  check('library listed', rendered.text.includes('音效测试库'))
  check('result rows rendered', rendered.rows >= files.length, `${rendered.rows} rows`)
  check('stylesheet scoped in the shadow root', rendered.hasStyle)

  // Select + play the first row, the way a user would.
  const box = await page.evaluate(() => {
    const shadow = document.querySelector('#root div')?.shadowRoot
    const row = shadow?.querySelector('.row')
    const rect = row?.getBoundingClientRect()
    return rect === undefined ? null : { x: rect.x + 40, y: rect.y + rect.height / 2 }
  })
  check('result row is clickable', box !== null)
  await page.mouse.click(box.x, box.y)
  await page.waitForTimeout(400)
  await page.mouse.dblclick(box.x, box.y)
  await page.waitForTimeout(2200)

  const after = await page.evaluate(() => {
    const shadow = document.querySelector('#root div')?.shadowRoot
    return {
      text: shadow?.querySelector('.dsh-sdk-mount')?.textContent ?? '',
      canvases: shadow?.querySelectorAll('canvas').length ?? 0,
      dialog: shadow?.querySelector('.dsh-sdk-dialog') !== null,
    }
  })
  check('details pane loaded the asset', after.text.includes('door_metal_slam_heavy_04.wav'))
  check('waveform canvas exists', after.canvases > 0)
  check('transport shows the playing asset', /1\.6s|1\.60s/.test(after.text), after.text.slice(0, 200))
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

  // The dialogs are part of the product too: open settings, then close it.
  await page.evaluate(() => {
    const shadow = document.querySelector('#root div')?.shadowRoot
    shadow?.querySelector('.dsh-sdk-gear')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(500)
  const dialogOpen = await page.evaluate(() => {
    const shadow = document.querySelector('#root div')?.shadowRoot
    return shadow?.querySelector('.dsh-sdk-dialog')?.textContent?.includes('加载声音指纹模型') ?? false
  })
  check('settings dialog opens with host settings', dialogOpen)
  await page.evaluate(() => {
    const shadow = document.querySelector('#root div')?.shadowRoot
    const close = Array.from(shadow?.querySelectorAll('.dsh-sdk-dialog button') ?? []).find(
      (node) => node.textContent?.trim() === '✕',
    )
    close?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(300)

  if (screenshotPath !== null) {
    await mkdir(dirname(screenshotPath), { recursive: true })
    await page.screenshot({ path: screenshotPath })
    console.log(`  ✓ wrote ${screenshotPath}`)
  }

  console.log('\nall end-to-end checks passed')
} finally {
  await browser?.close()
  http.close()
  for (const effect of effects.reverse()) {
    try {
      await effect?.()
    } catch {
      /* already disposed */
    }
  }
  await new Promise((done) => setTimeout(done, 150))
  await rm(tmp, { recursive: true, force: true }).catch(() => undefined)
}
