/**
 * Render the browser bundle in jsdom with a fake DSH slot host. This catches
 * module-scope crashes, React tree errors, and the status/activity wiring
 * without launching the full GUI.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import { createRoot } from 'react-dom/client'

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="dsh"></div></body></html>', {
  url: 'http://127.0.0.1:52477/',
  pretendToBeVisual: true,
})
const { window } = dom
global.window = window
global.document = window.document
global.HTMLElement = window.HTMLElement
global.HTMLMediaElement = window.HTMLMediaElement
global.localStorage = window.localStorage
global.MutationObserver = window.MutationObserver

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
Object.defineProperty(window, 'Audio', { value: MockAudio, configurable: true, writable: true })
globalThis.Audio = MockAudio
window.HTMLMediaElement.prototype.canPlayType = () => 'probably'

const statusPayload = {
  ok: true,
  data: {
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
  },
}
window.fetch = async (url) => {
  const path = String(url)
  if (path.includes('/api/status')) {
    return new Response(JSON.stringify(statusPayload), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200, headers: { 'content-type': 'application/json' } })
}

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
    const result = factory(require)
    exported = result ?? module.exports
    console.log('module loaded', id, Object.keys(exported))
  },
}

const code = await readFile(join(process.cwd(), 'lib', 'client.js'), 'utf8')
window.eval(code)

const fakeSlots = {
  inject(slot, callback) {
    const value = callback()
    registrations.push({ slot, value })
  },
  register(options, component) {
    registrations.push({ slot: options.name, options, component })
    return () => undefined
  },
}
const disposers = []
const fakeCtx = {
  effect(factory) {
    const dispose = factory()
    if (typeof dispose === 'function') disposers.push(dispose)
  },
  inject(deps, callback) {
    if (deps.includes('slots')) callback({ slots: fakeSlots })
    if (deps.includes('shortcuts')) {
      callback({ shortcuts: { register: () => () => undefined }, effect(factory) { const dispose = factory(); if (typeof dispose === 'function') disposers.push(dispose) } })
    }
  },
  layout: { selectActivity() {} },
}
exported.apply(fakeCtx)
console.log('registrations', registrations.map((entry) => entry.slot))

const activity = registrations.find((entry) => entry.slot === 'shell.activity' && entry.component !== undefined)
if (activity === undefined) throw new Error('shell.activity was not registered')
const statusItem = registrations.find((entry) => entry.slot === 'shell.statusbar.left' && entry.component !== undefined)
const glyph = registrations.find((entry) => entry.slot === 'shell.activitybar.items' && entry.component !== undefined)
if (statusItem === undefined) throw new Error('status bar item was not registered')
if (glyph === undefined) throw new Error('activity glyph was not registered')

const container = window.document.getElementById('dsh')
const root = createRoot(container)
root.render(React.createElement(activity.component))
await new Promise((resolve) => setTimeout(resolve, 300))

const text = container.textContent ?? ''
console.log('rendered text', text.slice(0, 500))
if (!text.includes('音乐播放器')) throw new Error('activity page did not render its brand')
if (!text.includes('把 B 站的声音')) throw new Error('search hero did not render')
const style = window.document.getElementById('dsh-music-player-style')
if (style === null) throw new Error('stylesheet was not injected')
console.log('style bytes', style.textContent.length)

// Render the status bar item separately.
const statusContainer = window.document.createElement('div')
window.document.body.append(statusContainer)
const statusRoot = createRoot(statusContainer)
const injected = statusItem.options.inject()
statusRoot.render(React.createElement(statusItem.component, injected))
await new Promise((resolve) => setTimeout(resolve, 100))
console.log('status text', statusContainer.textContent ?? '')

// Click through each nav tab to catch render-time crashes.
for (const label of ['收藏夹', '队列', '账户', '设置', '搜索']) {
  const button = Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.trim().endsWith(label))
  if (button === undefined) {
    console.log('missing nav button', label)
    continue
  }
  button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 120))
  console.log('tab', label, 'ok', (container.textContent ?? '').length)
}

root.unmount()
statusRoot.unmount()
for (const dispose of disposers.reverse()) {
  try { dispose() } catch { /* ignore */ }
}
console.log('client smoke test passed')
