/**
 * Render the workbench in Chrome and write `docs/screenshot.png`.
 *
 * The harness bundles the real browser half with React inlined, serves it from a
 * local file with DSH's dark theme tokens replicated, and mocks the host/engine API.
 * That makes the image reproducible without an engine, a sound library, or a DSH
 * installation.
 *
 *   node scripts/screenshot.mjs [outfile]
 */

import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const out = process.argv[2] ?? join(root, 'docs', 'screenshot.png')
const soundDesk = join(root, '..', 'sound-desk')
const packages = join(soundDesk, 'packages')

async function loadRolldown() {
  try {
    return await import('rolldown')
  } catch {
    /* fall through */
  }
  const pnpm = join(soundDesk, 'node_modules', '.pnpm')
  for (const entry of await readdir(pnpm)) {
    if (!entry.startsWith('rolldown@')) continue
    const candidate = join(pnpm, entry, 'node_modules', 'rolldown', 'dist', 'index.mjs')
    if (existsSync(candidate)) return import(pathToFileURL(candidate).href)
  }
  throw new Error('rolldown not found')
}

const requireFrom = createRequire(join(root, '..', 'dsh-music-player', 'package.json'))
const { chromium } = requireFrom('playwright-core')

const { rolldown } = await loadRolldown()

const alias = {
  '@sounddesk/core': join(packages, 'core', 'dist', 'index.js'),
  '@sounddesk/ucs': join(packages, 'ucs', 'dist', 'index.js'),
  '@sounddesk/audio-wav': join(packages, 'audio-wav', 'dist', 'index.js'),
  '@sounddesk/audio-effects': join(packages, 'audio-effects', 'dist', 'index.js'),
}

const cssText = {
  name: 'harness-css',
  load(id) {
    if (!id.endsWith('.css')) return null
    return { code: `export default ${JSON.stringify(readFileSync(id, 'utf8'))};`, moduleType: 'js' }
  },
}

console.log('bundling harness…')
const build = await rolldown({
  input: join(here, 'harness', 'entry.tsx'),
  platform: 'browser',
  transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': '"production"' } },
  plugins: [
    {
      name: 'harness-alias',
      resolveId(source) {
        return alias[source] ?? null
      },
    },
    cssText,
  ],
  logLevel: 'warn',
})
const generated = await build.generate({ format: 'iife', codeSplitting: false })
await build.close?.()
const code = generated.output[0].code

const html = `<!doctype html>
<html lang="zh-Hans">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SoundDesk</title>
  <style>
    /* DSH dark-theme values, copied from packages/client/ui-theme/src/styles. */
    :root {
      color-scheme: dark;
      --dsw-alias-bg-base: rgb(21, 21, 23);
      --dsw-alias-bg-layer-1: rgb(35, 35, 36);
      --dsw-alias-bg-layer-2: rgb(44, 44, 46);
      --dsw-alias-bg-overlay: rgb(97, 102, 107);
      --dsw-alias-border-l1: rgba(255, 255, 255, 0.06);
      --dsw-alias-border-l2: rgba(255, 255, 255, 0.12);
      --dsw-alias-label-primary: rgb(249, 250, 251);
      --dsw-alias-label-primary-dimmed: rgb(235, 238, 242);
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
      --dsw-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
      --ds-font-family-code: "Cascadia Code", "SF Mono", Consolas, monospace;
      background: var(--dsw-alias-bg-base);
    }
    html, body { height: 100%; margin: 0; }
    body { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: 13px/1.5 var(--dsw-font-family); }

    /* Minimal host chrome so the page is shown at the size it gets in DSH. */
    .harness-frame { display: flex; height: 100vh; }
    .harness-rail {
      flex: 0 0 48px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding-top: 14px;
      border-right: 0.5px solid var(--dsw-alias-border-l1);
      background: var(--dsw-alias-bg-layer-1);
    }
    .harness-rail-item {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      color: var(--dsw-alias-label-tertiary);
      font-size: 14px;
    }
    .harness-rail-active { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
    .harness-page { flex: 1 1 auto; min-width: 0; height: 100vh; }
    #root { height: 100%; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>${code}</script>
</body>
</html>
`

const tmp = join(root, 'tmp', 'harness')
await mkdir(tmp, { recursive: true })
await writeFile(join(tmp, 'index.html'), html, 'utf8')

// Serve over HTTP rather than file://: the client resolves its mount against
// `document.baseURI`, and a file path would put the mount behind a directory path
// that happens to share the plugin's name.
//
// The waveform's peaks come from the in-page mock, but the player's `<audio>` element
// fetches its source through the network stack (not `fetch`), so the clip has to be
// served here too.
function clipWav() {
  const sampleRate = 48_000
  const seconds = 1.4
  const frames = Math.round(sampleRate * seconds)
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
    const attack = Math.min(1, t / 0.004)
    const env = attack * Math.exp(-t * 3.1)
    const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1
    const body = Math.sin(2 * Math.PI * 82 * t) * 0.62 + Math.sin(2 * Math.PI * 173 * t) * 0.28
    const sample = Math.max(-1, Math.min(1, (body + noise * 0.22) * env * 0.86))
    buffer.writeInt16LE(Math.round(sample * 32767), offset)
    buffer.writeInt16LE(Math.round(sample * 0.94 * 32767), offset + 2)
    offset += 4
  }
  return buffer
}
const wav = clipWav()

function serveWav(req, res) {
  const range = req.headers.range
  const match = typeof range === 'string' ? /bytes=(\d+)-(\d*)/.exec(range) : null
  if (match !== null) {
    const start = Number(match[1])
    const end = match[2] === '' ? wav.length - 1 : Math.min(Number(match[2]), wav.length - 1)
    res.writeHead(206, {
      'content-type': 'audio/wav',
      'accept-ranges': 'bytes',
      'content-range': `bytes ${start}-${end}/${wav.length}`,
      'content-length': String(end - start + 1),
    })
    res.end(wav.subarray(start, end + 1))
    return
  }
  res.writeHead(200, {
    'content-type': 'audio/wav',
    'accept-ranges': 'bytes',
    'content-length': String(wav.length),
  })
  res.end(req.method === 'HEAD' ? undefined : wav)
}

const http = createServer(async (req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html)
    return
  }
  if (/^\/dsh-sound-desk\/api\/media\/\d+\/(stream|download)$/.test(pathname)) {
    serveWav(req, res)
    return
  }
  if (pathname === '/favicon.ico') {
    res.writeHead(204).end()
    return
  }
  res.writeHead(404).end()
})
await new Promise((resolveListen) => http.listen(0, '127.0.0.1', resolveListen))
const pageUrl = `http://127.0.0.1:${http.address().port}/`

const chrome = process.env.DSH_SCREENSHOT_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
if (!existsSync(chrome)) throw new Error(`Chrome not found at ${chrome}; set DSH_SCREENSHOT_CHROME`)

console.log('rendering…')
const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
})
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error' || process.env.DSH_SCREENSHOT_DEBUG === '1') {
      console.error(`page ${message.type()}:`, message.text())
    }
  })
  page.on('requestfailed', (request) => console.error('request failed:', request.url()))
  page.on('response', (response) => {
    if (response.status() >= 400) console.error(`HTTP ${response.status()}: ${response.url()}`)
  })
  await page.goto(pageUrl, { waitUntil: 'load' })
  await page.waitForFunction(() => {
    const host = document.querySelector('#root div')
    const shadow = host?.shadowRoot
    return shadow?.querySelector('.topbar') !== null && shadow?.querySelector('.results') !== null
  }, { timeout: 20_000 })
  // Let the mocked search, selection, decode and the waveform settle.
  await page.waitForTimeout(3400)
  await mkdir(dirname(out), { recursive: true })
  await page.screenshot({ path: out })
  console.log(`wrote ${out}`)
} finally {
  await browser.close()
  http.close()
}
