/**
 * Render the shipped browser bundle in jsdom with a fake DSH slot host.
 *
 * This catches module-scope crashes, slot wiring mistakes, and a broken empty
 * state without starting the full GUI. Actual video decoding is covered by the
 * Chrome test in `test-e2e.mjs`.
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
global.HTMLVideoElement = window.HTMLVideoElement
global.localStorage = window.localStorage
global.MutationObserver = window.MutationObserver
global.requestAnimationFrame = window.requestAnimationFrame.bind(window)

window.HTMLMediaElement.prototype.load = function load() {}
window.HTMLMediaElement.prototype.play = function play() {
  this.paused = false
  return Promise.resolve()
}
window.HTMLMediaElement.prototype.pause = function pause() {
  this.paused = true
}

const registrations = []
let exported = null
window.__ModuleLoader__ = {
  load({ id, factory }) {
    const module = { exports: {} }
    const require = (specifier) => {
      if (specifier === 'react') return React
      if (specifier === 'react/jsx-runtime') return ReactJsxRuntime
      if (specifier === 'react-dom') return ReactDOM
      throw new Error(`unexpected require ${specifier}`)
    }
    const result = factory(require)
    exported = result ?? module.exports
    console.log('module loaded:', id, Object.keys(exported))
  },
}

const code = await readFile(join(process.cwd(), 'lib', 'client.js'), 'utf8')
window.eval(code)

const fakeSlots = {
  inject(slot, callback) {
    registrations.push({ slot, callback })
    callback()
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
      callback({
        shortcuts: { register: () => () => undefined },
        effect(factory) {
          const dispose = factory()
          if (typeof dispose === 'function') disposers.push(dispose)
        },
      })
    }
  },
  layout: { selectActivity() {} },
}

exported.apply(fakeCtx)
console.log('registrations:', registrations.map((entry) => entry.slot).join(', '))

const glyph = registrations.find((entry) => entry.slot === 'shell.activitybar.items' && entry.component)
const activity = registrations.find((entry) => entry.slot === 'shell.activity' && entry.component)
if (glyph === undefined) throw new Error('shell.activitybar.items was not registered')
if (activity === undefined) throw new Error('shell.activity was not registered')
if (glyph.options.id !== 'video-player') throw new Error('unexpected activity id')
if (activity.options.key !== 'video-player') throw new Error('activity key does not match the rail id')
if (typeof glyph.options.label !== 'function' || glyph.options.label() !== '视频逐帧播放器') {
  throw new Error('activity label is wrong')
}

const container = window.document.getElementById('dsh')
const root = createRoot(container)
root.render(React.createElement(activity.component))
await new Promise((resolve) => setTimeout(resolve, 300))

const text = container.textContent ?? ''
console.log('rendered text:', text.slice(0, 240))
if (!text.includes('视频逐帧播放器')) throw new Error('activity page did not render its brand')
if (!text.includes('打开一个视频，开始逐帧检视')) throw new Error('empty state did not render')
if (!text.includes('选择本地视频')) throw new Error('file picker button did not render')
if (!text.includes('逐帧')) throw new Error('keyboard hint did not render')

const style = window.document.getElementById('dsh-video-player-style')
if (style === null) throw new Error('stylesheet was not injected')
console.log('style bytes:', style.textContent.length)

const video = container.querySelector('video')
if (video === null) throw new Error('video element was not attached')
if (video.className !== 'dvp-video') throw new Error('video element has the wrong class')

const buttons = Array.from(container.querySelectorAll('button'))
for (const label of ['下一帧', '上一帧', '播放', '静音', '倒放']) {
  if (!buttons.some((button) => (button.getAttribute('aria-label') ?? '').includes(label))) {
    throw new Error(`missing ${label} button`)
  }
}

const layoutSwitch = container.querySelector('.dvp-switch input')
if (!(layoutSwitch instanceof window.HTMLInputElement)) throw new Error('layout switch is missing')
layoutSwitch.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await new Promise((resolve) => setTimeout(resolve, 200))
const panes = container.querySelectorAll('.dvp-pane')
if (panes.length !== 2) throw new Error(`dual layout rendered ${panes.length} panes`)
const panePickers = Array.from(panes).filter((pane) => pane.textContent?.includes('选择视频'))
if (panePickers.length !== 2) throw new Error('both empty panes should offer 选择视频')
console.log('dual render: 2 panes with 选择视频 placeholders')

layoutSwitch.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await new Promise((resolve) => setTimeout(resolve, 200))
if (container.querySelectorAll('.dvp-pane').length !== 0) throw new Error('single layout still shows panes')

root.unmount()
for (const dispose of disposers.reverse()) {
  try {
    dispose()
  } catch {
    // The fake host has no lifecycle guarantees; a failed cleanup is reported
    // by the real integration test instead.
  }
}
console.log('client smoke test passed')
