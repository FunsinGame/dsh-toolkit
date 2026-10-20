#!/usr/bin/env node
/**
 * Capture the MCP page from a running DSH Web instance.
 *
 * Usage:
 *   node scripts/screenshot.mjs --url "http://127.0.0.1:3311/?token=..." [--out docs/screenshot.png]
 *
 * The script drives a headless Chrome over the DevTools protocol: it opens the
 * app, clicks the MCP entry in the activity rail, waits for the page to render,
 * and writes a PNG. Chrome is located from the usual Windows install paths.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const args = process.argv.slice(2)
const valueOf = (flag, fallback) => {
  const index = args.indexOf(flag)
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback
}
const url = valueOf('--url')
const out = valueOf('--out', join(root, 'docs', 'screenshot.png'))
const workspaceTitle = valueOf('--workspace', undefined)
if (url === undefined) {
  console.error('usage: node scripts/screenshot.mjs --url <dsh-web-url> [--out <png>]')
  process.exit(1)
}

const chromeCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
]
const chrome = chromeCandidates.find(candidate => existsSync(candidate))
if (chrome === undefined) throw new Error('no Chrome/Edge executable found')

const sleep = ms => new Promise((resolve) => { setTimeout(resolve, ms) })

const profile = await mkdtemp(join(tmpdir(), 'dsh-mcp-chrome-'))
const browser = spawn(chrome, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--disable-extensions',
  '--hide-scrollbars',
  'about:blank',
], { stdio: 'ignore' })

async function devToolsPort() {
  const marker = join(profile, 'DevToolsActivePort')
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(marker)) {
      const [port] = (await readFile(marker, 'utf8')).split('\n')
      if (port !== undefined && port.trim() !== '') return Number(port.trim())
    }
    await sleep(100)
  }
  throw new Error('Chrome DevTools port did not appear')
}

class Cdp {
  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id === undefined) return
      const entry = this.pending.get(message.id)
      if (entry === undefined) return
      this.pending.delete(message.id)
      if (message.error !== undefined) entry.reject(new Error(message.error.message))
      else entry.resolve(message.result)
    }
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    socket.onopen = () => resolve(new Cdp(socket))
    socket.onerror = () => reject(new Error(`cannot connect to ${wsUrl}`))
  })
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails !== undefined) {
    throw new Error(result.exceptionDetails.exception?.description ?? 'evaluation failed')
  }
  return result.result?.value
}

async function waitFor(cdp, expression, label, timeoutMs = 30_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(cdp, expression)) return
    } catch {
      // The document may still be navigating; retry until the deadline.
    }
    await sleep(250)
  }
  throw new Error(`timed out waiting for ${label}`)
}

let cdp

/** Dismiss the first-use intro, model setup, and account prompts. */
async function dismissOverlays(cdp) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await sleep(400)
    const dismissed = await evaluate(cdp, `(() => {
      const labels = ['继续', '稍后配置', '跳过']
      for (const label of labels) {
        const button = [...document.querySelectorAll('button')]
          .find(item => item.textContent?.trim() === label)
        if (button) {
          button.click()
          return label
        }
      }
      const close = [...document.querySelectorAll('button[aria-label]')]
        .find(item => /关闭|close/i.test(item.getAttribute('aria-label') ?? ''))
      if (close) {
        close.click()
        return 'close'
      }
      return null
    })()`)
    if (dismissed === null) return
  }
}

try {
  const port = await devToolsPort()
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })
  const target = await response.json()
  if (target.webSocketDebuggerUrl === undefined) throw new Error('no page target')
  cdp = await connect(target.webSocketDebuggerUrl)

  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  })
  await cdp.send('Page.navigate', { url })
  await waitFor(cdp, 'document.readyState === "complete"', 'page load')
  // A fresh browser profile walks the first-use notices (intro, model setup,
  // account prompt) before the workbench settles.
  await dismissOverlays(cdp)
  await waitFor(
    cdp,
    `[...document.querySelectorAll('[data-shell-activitybar] button')].some(button => (button.getAttribute('aria-label') ?? '').includes('MCP'))`,
    'MCP activity-bar entry',
  )
  const clicked = await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll('[data-shell-activitybar] button')]
      .find(item => (item.getAttribute('aria-label') ?? '').includes('MCP'))
    if (!button) return false
    button.click()
    return true
  })()`)
  if (!clicked) throw new Error('could not click the MCP entry')
  await waitFor(cdp, 'document.querySelector(".dshmcp-page") !== null', 'MCP page')
  await waitFor(cdp, 'document.querySelectorAll(".dshmcp-card").length > 0', 'MCP cards')
  if (workspaceTitle !== undefined) {
    const selected = await evaluate(cdp, `(() => {
      const item = [...document.querySelectorAll('.dshmcp-scope')]
        .find(node => node.textContent?.includes(${JSON.stringify(workspaceTitle)}))
      if (!item) return false
      item.click()
      return true
    })()`)
    if (!selected) throw new Error(`workspace not found in the page: ${workspaceTitle}`)
    await sleep(400)
  }
  // A delayed account prompt can appear after the workbench settles.
  await dismissOverlays(cdp)
  await sleep(400)

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(out, Buffer.from(shot.data, 'base64'))
  const summary = await evaluate(cdp, `({
    title: document.querySelector('.dshmcp-title')?.textContent ?? null,
    scopes: [...document.querySelectorAll('.dshmcp-scope-name')].map(node => node.textContent),
    cards: [...document.querySelectorAll('.dshmcp-card')].map(card => ({
      name: card.querySelector('.dshmcp-card-name')?.textContent,
      status: card.querySelector('.dshmcp-status')?.textContent,
    })),
  })`)
  console.log(JSON.stringify(summary, null, 2))
  console.log(`wrote ${out}`)
  browser.kill()
} catch (error) {
  if (cdp !== undefined) {
    try {
      const diagnostics = await evaluate(cdp, `({
        href: location.href,
        text: document.body?.innerText?.slice(0, 1200) ?? null,
        rail: document.querySelectorAll('[data-shell-activitybar]').length,
        railLabels: [...document.querySelectorAll('[data-shell-activitybar] button')]
          .map(button => button.getAttribute('aria-label') ?? button.textContent ?? ''),
        rootSnippet: document.getElementById('root')?.innerHTML?.slice(0, 1200) ?? null,
      })`)
      console.error('page diagnostics:', JSON.stringify(diagnostics, null, 2))
    } catch {
      // The page may be gone; the original error still matters most.
    }
  }
  browser.kill()
  throw error
}
