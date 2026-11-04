/**
 * Render the shipped browser bundle in jsdom with a fake DSH slot host.
 *
 * This catches module-scope crashes, slot wiring mistakes, and a broken toolbox
 * shell without starting the full GUI. Real video decoding, image decoding and
 * canvas pixel work are covered by the Chrome test in `test-e2e.mjs`.
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
if (glyph.options.id !== 'toolbox') throw new Error('unexpected activity id')
if (activity.options.key !== 'toolbox') throw new Error('activity key does not match the rail id')
if (typeof glyph.options.label !== 'function' || glyph.options.label() !== '工具箱') {
  throw new Error('activity label is wrong')
}

const container = window.document.getElementById('dsh')
const root = createRoot(container)
root.render(React.createElement(activity.component))
await new Promise((resolve) => setTimeout(resolve, 400))

const text = container.textContent ?? ''
console.log('rendered text:', text.slice(0, 260))
if (!text.includes('工具箱')) throw new Error('shell did not render its brand')
for (const label of ['视频逐帧播放器', '图片对比']) {
  if (!text.includes(label)) throw new Error(`tool list is missing ${label}`)
}
const toolButtons = Array.from(container.querySelectorAll('.dtb-tool'))
if (toolButtons.length !== 2) throw new Error(`expected 2 tools, found ${toolButtons.length}`)
if (!text.includes('打开一个视频，开始逐帧检视')) throw new Error('video tool did not render its empty state')

const videoPane = container.querySelector('.dtb-pane[data-tool="video"]')
const imagePane = container.querySelector('.dtb-pane[data-tool="image"]')
if (!(videoPane instanceof window.HTMLElement) || !(imagePane instanceof window.HTMLElement)) {
  throw new Error('tool panes are missing')
}
if (videoPane.hidden) throw new Error('the first tool should be visible by default')
if (!imagePane.hidden) throw new Error('the second tool should start hidden')

const style = window.document.getElementById('dsh-toolbox-style')
if (style === null) throw new Error('stylesheet was not injected')
for (const selector of ['.dtb-root', '.dvp-root', '.dti-root']) {
  if (!style.textContent.includes(selector)) throw new Error(`stylesheet is missing ${selector}`)
}
console.log('style bytes:', style.textContent.length)

// Switch to the image tool.
const imageButton = toolButtons.find((button) => button.getAttribute('data-tool') === 'image')
if (!(imageButton instanceof window.HTMLElement)) throw new Error('image tool button is missing')
imageButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await new Promise((resolve) => setTimeout(resolve, 250))

if (!videoPane.hidden) throw new Error('the video pane stayed visible after switching')
if (imagePane.hidden) throw new Error('the image pane did not become visible')
const imageText = imagePane.textContent ?? ''
for (const label of ['图片 A · 原图', '图片 B · 对比图', 'PNG · JPEG · WebP']) {
  if (!imageText.includes(label)) throw new Error(`image tool is missing "${label}"`)
}
const imageInputs = imagePane.querySelectorAll('input[type=file]')
if (imageInputs.length !== 2) throw new Error(`expected two file inputs, found ${imageInputs.length}`)
console.log('image tool picker: ok')

// The selection is remembered for the next visit.
root.unmount()
for (const dispose of disposers.reverse()) {
  try {
    dispose()
  } catch {
    // The fake host has no lifecycle guarantees; the real integration test
    // reports cleanup problems instead.
  }
}
const secondRoot = createRoot(container)
secondRoot.render(React.createElement(activity.component))
await new Promise((resolve) => setTimeout(resolve, 250))
const secondImagePane = container.querySelector('.dtb-pane[data-tool="image"]')
if (!(secondImagePane instanceof window.HTMLElement) || secondImagePane.hidden) {
  throw new Error('the toolbox did not restore the last active tool')
}
console.log('remembered tool: ok')

secondRoot.unmount()
console.log('client smoke test passed')
