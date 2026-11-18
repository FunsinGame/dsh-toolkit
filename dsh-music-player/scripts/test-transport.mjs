/**
 * Verify which base the browser half uses to reach its Host.
 *
 * The Desktop renderer is a `dsh-app://app/` page: a direct HTTP request to
 * `http://127.0.0.1:<port>` is cross-origin and blocked (`Failed to fetch`), so
 * the client must stay document-relative there and fall back to the absolute
 * transport origin only when the relative request never reaches a Host.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import ReactDOM from 'react-dom'

const statusPayload = {
  version: '0.1.0',
  loggedIn: false,
  user: null,
  settings: {
    audioQuality: 30280,
    defaultPlayMode: 'sequential',
    volume: 0.8,
    playbackRate: 1,
    cacheEnabled: true,
    cacheMaxMB: 500,
    requestIntervalMs: 350,
    logLevel: 'info',
    showStatusBar: true,
  },
  cache: { files: 0, bytes: 0, maxBytes: 524288000, dir: 'C:/tmp/music', enabled: true },
  logLevel: 'info',
}

const code = await readFile(join(process.cwd(), 'lib', 'client.js'), 'utf8')

class MockAudio {
  constructor() {
    this.paused = true
    this.currentTime = 0
    this.duration = 0
    this.volume = 1
    this.muted = false
    this.playbackRate = 1
    this.src = ''
    this.error = null
    this.buffered = { length: 0, end: () => 0 }
  }
  addEventListener() {}
  removeEventListener() {}
  load() {}
  play() { this.paused = false; return Promise.resolve() }
  pause() { this.paused = true }
  removeAttribute() { this.src = '' }
}

/**
 * Load the bundle in one page composition and return the URLs it requested.
 * @param pageUrl - Document URL, which fixes `location.protocol`.
 * @param transport - Value for `__DSH_TRANSPORT__`, omitted for a served page.
 * @param options.blockRelative - Reject document-relative requests the way a
 * page that cannot reach its Host does.
 */
async function run(pageUrl, transport, { blockRelative = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="dsh"></div></body></html>', {
    url: pageUrl,
    pretendToBeVisual: true,
  })
  const { window } = dom
  global.window = window
  global.document = window.document
  // jsdom treats a custom scheme as an opaque origin, where its built-in
  // localStorage throws; Electron gives `dsh-app://app` a real origin instead.
  const stored = new Map()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => (stored.has(key) ? stored.get(key) : null),
      setItem: (key, value) => { stored.set(key, String(value)) },
      removeItem: (key) => { stored.delete(key) },
      clear: () => { stored.clear() },
      key: (index) => [...stored.keys()][index] ?? null,
      get length() { return stored.size },
    },
  })
  Object.defineProperty(window, 'Audio', { value: MockAudio, configurable: true, writable: true })
  global.localStorage = window.localStorage
  global.MutationObserver = window.MutationObserver
  global.Audio = MockAudio
  if (transport === undefined) delete window.__DSH_TRANSPORT__
  else window.__DSH_TRANSPORT__ = transport

  const calls = []
  window.fetch = async (url) => {
    const href = String(url)
    calls.push(href)
    if (blockRelative && href.startsWith('/')) throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify({ ok: true, data: statusPayload }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  // jsdom's realm resolves bare globals such as `fetch` and `location` to this
  // process's global rather than to `window`, so each composition value has to
  // stand in for both.
  globalThis.fetch = window.fetch
  globalThis.location = window.location
  if (transport === undefined) delete globalThis.__DSH_TRANSPORT__
  else globalThis.__DSH_TRANSPORT__ = transport

  const registrations = []
  let exported = null
  window.__ModuleLoader__ = {
    load({ id, factory }) {
      const module = { exports: {} }
      const require = (spec) => {
        if (spec === 'react') return React
        if (spec === 'react/jsx-runtime') return ReactJsxRuntime
        if (spec === 'react-dom') return ReactDOM
        throw new Error(`unexpected require ${spec}`)
      }
      exported = factory(require) ?? module.exports
      console.log('module loaded', id)
    },
  }
  window.eval(code)

  const fakeSlots = {
    inject(slot, callback) { registrations.push({ slot, value: callback() }) },
    register(options) { registrations.push({ slot: options.name }); return () => undefined },
  }
  exported.apply({
    effect(factory) { factory() },
    inject(deps, callback) {
      if (deps.includes('slots')) callback({ slots: fakeSlots })
      if (deps.includes('shortcuts')) {
        callback({ shortcuts: { register: () => () => undefined }, effect(factory) { factory() } })
      }
    },
    layout: { selectActivity() {} },
  })
  const controller = window.__DSH_MUSIC_PLAYER__.controller
  await controller.refreshStatus()
  const player = controller.player.getSnapshot()
  if (player.ready !== true) throw new Error('controller did not start')
  return calls
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

// 1. Desktop page: relative, even though the transport reports a Host origin.
let calls = await run('dsh-app://app/index.html', { streamBaseUrl: 'http://127.0.0.1:52477' })
console.log('desktop page requests', calls)
expect(calls.length > 0, 'desktop page made no request')
expect(calls[0] === '/dsh-music-player/api/status', `desktop page used ${calls[0]} instead of a document-relative request`)

// 2. Served Web app on a Host origin: the absolute transport origin stays valid.
calls = await run('http://127.0.0.1:52477/', { streamBaseUrl: 'http://127.0.0.1:52477' })
console.log('served page requests', calls)
expect(calls[0] === 'http://127.0.0.1:52477/dsh-music-player/api/status', `served page used ${calls[0]}`)

// 3. A page whose relative requests cannot reach a Host promotes the absolute base.
const absoluteStatus = 'http://127.0.0.1:52477/dsh-music-player/api/status'
calls = await run('dsh-app://app/index.html', { streamBaseUrl: 'http://127.0.0.1:52477' }, { blockRelative: true })
console.log('fallback requests', calls)
expect(calls.includes(absoluteStatus), 'no request ever retried on the absolute base')
expect(calls[calls.length - 1] === absoluteStatus, `fallback settled on ${calls[calls.length - 1]}`)

console.log('transport test passed')
