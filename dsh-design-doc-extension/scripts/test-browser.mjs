/**
 * End-to-end check in a real Chromium: load the unpacked extension, serve a
 * real design-doc library over http, hover a paragraph with a real mouse move,
 * press Ctrl+C, and read what the page's shadow badge and toast say.
 *
 * jsdom (test-content.mjs) covers the logic; this covers what only a browser
 * can: the manifest actually loads, the content script is injected, the shadow
 * UI renders, and a synthetic-but-real key event is intercepted.
 *
 * Usage: node scripts/test-browser.mjs [Docs/Design path] [chrome.exe path]
 * Exits 0 with a notice when no Chromium or no document library is available.
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const extensionDir = path.resolve(here, '..')

let failures = 0
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

/* -------------------------------------------------------------------- find -- */

const chromeCandidates = [
  process.argv[3],
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter((entry) => typeof entry === 'string' && entry !== '')

const browser = chromeCandidates.find((candidate) => existsSync(candidate))
if (browser === undefined) {
  console.log('no Chromium found; browser check skipped')
  process.exit(0)
}

const libraryCandidates = [
  process.argv[2],
  'C:/g-workspace/Heyang-Projects/Project-Z-Fix/Docs/Design',
].filter((entry) => typeof entry === 'string' && entry !== '')

let library = null
for (const candidate of libraryCandidates) {
  try {
    await stat(path.join(candidate, 'modules.json'))
    library = path.resolve(candidate)
    break
  } catch {
    /* try the next candidate */
  }
}
if (library === null) {
  console.log('design library not found; browser check skipped')
  process.exit(0)
}

/* ------------------------------------------------------------------ server -- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname)
  const target = path.resolve(library, '.' + pathname)
  if (!target.startsWith(library)) {
    response.statusCode = 403
    response.end('no')
    return
  }
  try {
    const bytes = await readFile(target)
    response.setHeader('Content-Type', MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream')
    response.end(bytes)
  } catch {
    response.statusCode = 404
    response.end('not found')
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const pageUrl = `http://127.0.0.1:${port}/modules/combat/documents/01-attr.html`

/* -------------------------------------------------------------------- cdp -- */

const profile = await mkdtemp(path.join(os.tmpdir(), 'dd-ext-'))
const debugPort = 9333 + Math.floor(Math.random() * 200)
// stdio must not be piped: a sandboxed shell cannot open the pipes, and the
// browser is driven over CDP anyway.
const child = spawn(browser, [
  '--headless=new',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  `--disable-extensions-except=${extensionDir}`,
  `--load-extension=${extensionDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-sync',
  '--disable-gpu',
  '--hide-scrollbars',
  '--window-size=1280,900',
  pageUrl,
], { stdio: 'ignore' })

let exited = false
child.on('exit', () => { exited = true })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForTarget() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (exited) throw new Error('the browser exited before its devtools endpoint came up')
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      const targets = await response.json()
      const page = targets.find((target) => target.type === 'page' && String(target.url).includes(`127.0.0.1:${port}`))
      if (page !== undefined) return page
    } catch {
      /* not up yet */
    }
    await sleep(150)
  }
  throw new Error('devtools endpoint never produced the page target')
}

class Cdp {
  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id === undefined) return
      const entry = this.pending.get(message.id)
      if (entry === undefined) return
      this.pending.delete(message.id)
      if (message.error !== undefined) entry.reject(new Error(message.error.message))
      else entry.resolve(message.result)
    })
  }

  static async open(url) {
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    return new Cdp(socket)
  }

  send(method, params = {}) {
    const id = this.nextId
    this.nextId += 1
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }

  close() { this.socket.close() }
}

let cdp = null
try {
  const target = await waitForTarget()
  cdp = await Cdp.open(target.webSocketDebuggerUrl)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await cdp.evaluate('document.readyState')
    if (ready === 'complete') break
    await sleep(100)
  }
  await sleep(400)

  console.log(`browser: ${path.basename(browser)} -> ${pageUrl}`)

  const hasHost = await cdp.evaluate("document.getElementById('dd-coord-root') !== null")
  check('the content script was injected and activated', hasHost === true)

  const shadow = (expression) => cdp.evaluate(
    `document.getElementById('dd-coord-root')?.shadowRoot?.querySelector(${JSON.stringify(expression)})?.textContent ?? null`,
  )

  const geometry = await cdp.evaluate(`(() => {
    const element = document.querySelector('section#attr-01 p.lead')
    if (element === null) return null
    const box = element.getBoundingClientRect()
    return { x: Math.round(box.left + 12), y: Math.round(box.top + box.height / 2) }
  })()`)
  check('found the chapter paragraph', geometry !== null)

  if (geometry !== null) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: geometry.x, y: geometry.y, buttons: 0 })
    await sleep(250)
    check('hover renders the coordinate badge', (await shadow('.badge code')) === 'attr-01|p1', String(await shadow('.badge code')))

    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      modifiers: 2,
      key: 'c',
      code: 'KeyC',
      windowsVirtualKeyCode: 67,
      nativeVirtualKeyCode: 67,
    })
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      modifiers: 2,
      key: 'c',
      code: 'KeyC',
      windowsVirtualKeyCode: 67,
      nativeVirtualKeyCode: 67,
    })
    await sleep(300)
    const toast = await shadow('.toast')
    check('Ctrl+C is intercepted with the coordinate', toast !== null && toast.includes('attr-01|p1'), String(toast))

    const clipboard = await cdp.evaluate(`navigator.clipboard === undefined ? null : 'api'`)
    if (clipboard !== null) {
      const copiable = await cdp.evaluate(`(async () => {
        try { return await navigator.clipboard.readText() } catch (error) { return 'denied:' + String(error && error.message) }
      })()`)
      check('the clipboard holds the coordinate', copiable === 'attr-01|p1', String(copiable))
    } else {
      console.log('  --   clipboard read unavailable in this browser build')
    }
  }
} catch (error) {
  failures += 1
  console.log(`  FAIL browser session — ${error.message}`)
  if (String(error.message).includes('exited')) {
    console.log('  hint: a restricted sandbox cannot start Chrome (it needs named pipes and crashpad);')
    console.log('        run this from a normal terminal.')
  }
} finally {
  if (cdp !== null) cdp.close()
  child.kill()
  server.close()
  await sleep(200)
  await rm(profile, { recursive: true, force: true }).catch(() => {})
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
