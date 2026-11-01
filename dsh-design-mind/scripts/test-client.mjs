/**
 * Render the shipped browser bundle in jsdom with a fake DSH slot host.
 *
 * Catches module-scope crashes, slot wiring mistakes, and a broken empty state.
 * Pixel interactions are covered by the pure geometry tests and by using the
 * real page in DSH.
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import { createRoot } from 'react-dom/client'

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="dsh"></div></body></html>', {
  url: 'http://127.0.0.1:60453/',
  pretendToBeVisual: true,
})
const { window } = dom
global.window = window
global.document = window.document
global.HTMLElement = window.HTMLElement
global.MutationObserver = window.MutationObserver
global.localStorage = window.localStorage
global.requestAnimationFrame = window.requestAnimationFrame.bind(window)

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
assert.ok(glyph, 'shell.activitybar.items was not registered')
assert.ok(activity, 'shell.activity was not registered')
assert.equal(glyph.options.id, 'design-mind')
assert.equal(activity.options.key, 'design-mind', 'activity key does not match the rail id')
assert.equal(typeof glyph.options.label, 'function')
assert.equal(glyph.options.label(), '设计批注')

const style = window.document.getElementById('dsh-design-mind-style')
assert.ok(style, 'stylesheet was not injected')
assert.ok(style.textContent.includes('.dm-canvas'))
console.log('style bytes:', style.textContent.length)

const tick = () => new Promise((resolve) => setTimeout(resolve, 200))

function mount(store) {
  const container = window.document.createElement('div')
  window.document.body.append(container)
  const root = createRoot(container)
  root.render(React.createElement(exported.App, { store }))
  return { container, root }
}

// Empty state.
const emptyStore = new exported.DesignMindStore()
const empty = mount(emptyStore)
await tick()
assert.ok(empty.container.textContent.includes('打开一张设计图，开始标注'), 'empty state did not render')
assert.ok(empty.container.textContent.includes('粘贴剪贴板'), 'paste entry is missing')
assert.ok(empty.container.textContent.includes('导出设计批注'), 'export button is missing')
assert.ok(empty.container.textContent.includes('打开目录'), 'open-directory button is missing')
assert.ok(empty.container.textContent.includes('清理目录'), 'clean-directory button is missing')
const emptyExport = [...empty.container.querySelectorAll('button')].find((button) =>
  button.textContent?.includes('导出设计批注'),
)
assert.equal(emptyExport?.disabled, true, 'export is disabled without an image')
empty.root.unmount()

// Seeded state.
const store = new exported.DesignMindStore()
store.setImage({
  blob: new window.Blob(['fake'], { type: 'image/png' }),
  url: 'blob:test',
  width: 320,
  height: 200,
  mime: 'image/png',
  name: 'design.png',
})
const regionId = store.addRegion({ x1: 10, y1: 20, x2: 110, y2: 70 })
store.setText(regionId, '把按钮改成主色')
const globalId = store.addGlobal()
store.setText(globalId, '整体留白再大一点')

const seeded = mount(store)
await tick()
const text = seeded.container.textContent ?? ''
assert.ok(text.includes('设计批注'), 'brand is missing')
assert.ok(text.includes('design.png'), 'file name is missing')
assert.ok(text.includes('320×200'), 'dimensions are missing')
assert.ok(text.includes('评论'), 'panel title is missing')
assert.ok(text.includes('把按钮改成主色'), 'region comment is missing')
assert.ok(text.includes('整体留白再大一点'), 'global comment is missing')
assert.ok(text.includes('10,20 · 100×50'), 'coordinate chip is missing')
assert.ok(text.includes('整体意见'), 'global chip is missing')

const cards = seeded.container.querySelectorAll('.dm-card')
assert.equal(cards.length, 2, 'two cards should be rendered')
assert.equal(seeded.container.querySelectorAll('.dm-region').length, 1, 'one region overlay is drawn')
assert.equal(seeded.container.querySelector('.dm-badge-num')?.textContent, '1')

const enabled = [...seeded.container.querySelectorAll('button')].find((button) =>
  button.textContent?.includes('导出设计批注'),
)
assert.equal(enabled?.disabled, false, 'export should be enabled with an image and a comment')

store.exportReady({
  dir: 'C:/Users/test/.dsh/design-mind/exports/20261031-204512-1a2b3c4d',
  imagePath: 'C:/Users/test/.dsh/design-mind/exports/20261031-204512-1a2b3c4d/design.png',
  jsonPath: 'C:/Users/test/.dsh/design-mind/exports/20261031-204512-1a2b3c4d/feedback.json',
  prompt: 'PROMPT',
})
await tick()
assert.ok(seeded.container.textContent.includes('已导出'))
assert.ok(seeded.container.textContent.includes('复制提示词'))
assert.ok(seeded.container.textContent.includes('20261031-204512-1a2b3c4d'))

// Selecting a frame shows six resize handles.
store.select(regionId)
await tick()
assert.equal(seeded.container.querySelectorAll('.dm-handle').length, 6, 'six resize handles render')

// Cutting and moving leaves a hole at the source and draws the content at the frame.
store.cutRegion(regionId)
store.setRegionRect(regionId, { x1: 60, y1: 40, x2: 160, y2: 90 })
await tick()
assert.equal(seeded.container.querySelectorAll('.dm-hole').length, 1, 'the source location is a hole')
assert.equal(seeded.container.querySelectorAll('.dm-moved').length, 1, 'the cut content follows the frame')
assert.ok(seeded.container.textContent.includes('已裁剪'), 'the card shows the cut state')
assert.ok(seeded.container.textContent.includes('60,40 · 100×50'), 'the card follows the moved frame')

store.setText(regionId, '改成主色并右对齐')
await tick()
assert.ok(seeded.container.textContent.includes('内容已修改，请重新导出'), 'editing must mark the export stale')

seeded.root.unmount()
for (const dispose of disposers.reverse()) {
  try {
    dispose()
  } catch {
    // The fake host has no lifecycle guarantees; the real integration is DSH.
  }
}
console.log('client smoke test passed')
