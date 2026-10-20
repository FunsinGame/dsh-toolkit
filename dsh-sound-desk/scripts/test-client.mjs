/**
 * Browser-half smoke test.
 *
 * Loads the built client bundle in jsdom behind a fake DSH module loader and a fake
 * host API, then mounts the activity page and the status-bar item. This catches the
 * failures that only show up in a real document: module-scope crashes, a broken
 * shadow root, React tree errors, and wiring that never reaches the engine.
 *
 *   node scripts/test-client.mjs
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const requireFrom = createRequire(
  'C:/g-workspace/deepseek-harness/dsh-toolkit/dsh-music-player/package.json',
)
const { JSDOM } = requireFrom('jsdom')
const React = requireFrom('react')
const ReactJsxRuntime = requireFrom('react/jsx-runtime')
const ReactDOM = requireFrom('react-dom')
const { createRoot } = requireFrom('react-dom/client')

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="dsh"></div></body></html>', {
  url: 'http://127.0.0.1:52477/',
  pretendToBeVisual: true,
  // `outside-only` gives `window.eval` a real vm context with the jsdom globals.
  // Without it the bundle evaluates in the Node context and reaches Node's fetch,
  // which cannot see the mocked host routes.
  runScripts: 'outside-only',
})
const { window } = dom
global.window = window
global.document = window.document
global.HTMLElement = window.HTMLElement
global.CustomEvent = window.CustomEvent
global.Event = window.Event
global.localStorage = window.localStorage
global.MutationObserver = window.MutationObserver
global.requestAnimationFrame = window.requestAnimationFrame.bind(window)
global.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
// jsdom predates a few platform globals a browser always has.
if (typeof window.structuredClone !== 'function') window.structuredClone = globalThis.structuredClone
class MockObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
/**
 * The results list and the waveform size themselves from a ResizeObserver. A mock
 * that never fires would render an empty virtualized list, so this reports a
 * plausible box once on observe.
 */
class MockResizeObserver extends MockObserver {
  constructor(callback) {
    super()
    this.callback = callback
  }
  observe(target) {
    this.callback(
      [{ target, contentRect: { width: 960, height: 640, top: 0, left: 0, bottom: 640, right: 960, x: 0, y: 0 } }],
      this,
    )
  }
}
Object.defineProperty(window, 'ResizeObserver', { value: MockResizeObserver, configurable: true, writable: true })
for (const name of ['IntersectionObserver', 'MutationObserver']) {
  if (typeof window[name] !== 'function') {
    Object.defineProperty(window, name, { value: MockObserver, configurable: true, writable: true })
  }
}
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })
}
// React's legacy input-event polyfill probes `attachEvent`, which jsdom never had.
// Without it, any click after an input element gains focus throws inside React.
if (typeof window.Element.prototype.attachEvent !== 'function') {
  window.Element.prototype.attachEvent = () => {}
  window.Element.prototype.detachEvent = () => {}
}

// The workbench constructs its <audio> element at module scope; jsdom has no media
// stack, so give it the smallest object that satisfies the player's contract.
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
  play() {
    this.paused = false
    return Promise.resolve()
  }
  pause() {
    this.paused = true
  }
  removeAttribute() {
    this.src = ''
  }
}
Object.defineProperty(window, 'Audio', { value: MockAudio, configurable: true, writable: true })
global.Audio = MockAudio
window.HTMLMediaElement.prototype.canPlayType = () => 'probably'

// -- fake host + engine --------------------------------------------------

const library = {
  id: 1,
  name: '测试素材库',
  root: 'D:/SFX',
  kind: 'local',
  coverPath: null,
  createdAt: Date.now(),
  assetCount: 2,
}

const assets = [
  {
    id: 11,
    filename: 'ui_tone_confirm_01.wav',
    path: 'D:/SFX/ui_tone_confirm_01.wav',
    libraryId: 1,
    durationMs: 500,
    sampleRate: 48000,
    bitDepth: 16,
    channels: 1,
    codec: 'PCM',
    sizeBytes: 48044,
    stage: 4,
    ucsCatId: 'UIConfirm',
    ucsConfidence: 0.8,
    ucsSource: 'filename',
    ucsAlternatives: [],
    favorite: false,
    rating: 0,
    tags: [],
    embedded: null,
    dsp: null,
  },
  {
    id: 12,
    filename: 'amb_wind_loop_03.wav',
    path: 'D:/SFX/amb_wind_loop_03.wav',
    libraryId: 1,
    durationMs: 12_000,
    sampleRate: 48000,
    bitDepth: 24,
    channels: 2,
    codec: 'PCM',
    sizeBytes: 2304044,
    stage: 4,
    ucsCatId: 'AMBWind',
    ucsConfidence: 0.6,
    ucsSource: 'filename',
    ucsAlternatives: [],
    favorite: true,
    rating: 4,
    tags: ['loop'],
    embedded: null,
    dsp: null,
  },
]

const settings = {
  dataDir: '',
  loadModel: false,
  autoStart: true,
  ffmpegPath: '',
  referenceDir: '',
  logLevel: 'normal',
}

const status = {
  plugin: 'dsh-sound-desk',
  version: '0.1.0',
  state: 'ready',
  error: null,
  restartRequired: false,
  dataDir: 'C:/Users/test/.dsh/sound-desk',
  engineUrl: 'http://127.0.0.1:51234',
  modelLoaded: false,
  modelId: null,
  embedderError: null,
  ffmpeg: null,
  stats: { assets: 2, libraries: 1, embedded: 0, peaks: 2, totalBytes: 2352088, byStage: {}, byCategory: [] },
  settings,
}

const calls = []
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, window.location.origin)
  const path = url.pathname.replace(/^\/dsh-sound-desk/, '')
  calls.push(`${init.method ?? 'GET'} ${path}`)
  const json = (body, statusCode = 200) =>
    new Response(JSON.stringify(body), { status: statusCode, headers: { 'content-type': 'application/json' } })

  if (path === '/host/status') return json(status)
  if (path === '/host/settings') return json({ settings, dataDir: status.dataDir, restartRequired: false })
  if (path === '/host/logs') return json({ level: 'normal', lines: [] })
  if (path === '/api/libraries') return json({ libraries: [library] })
  if (path === '/api/stats') {
    return json({
      assets: 2,
      libraries: 1,
      embedded: 0,
      peaks: 2,
      totalBytes: 2352088,
      byStage: { '4': 2 },
      byCategory: [{ category: 'UI', count: 1 }, { category: 'AMB', count: 1 }],
      dbBytes: 65536,
      modelsReady: false,
    })
  }
  if (path === '/api/ucs/tree') {
    return json({
      tree: [
        {
          category: 'UI',
          count: 1,
          children: [{ catId: 'UIConfirm', label: 'Confirm', count: 1 }],
        },
      ],
      uncategorized: 1,
    })
  }
  if (path === '/api/jobs') return json({ jobs: [] })
  if (path === '/api/personalization') {
    return json({ enabled: false, events: 0, assets: 0, maxAdjustment: 0.1 })
  }
  if (path === '/api/session') {
    return json({
      ok: true,
      serverVersion: '0.1.0',
      embeddingDim: 512,
      similarityThreshold: 0.12,
      webRoot: null,
      ffmpeg: { available: false },
    })
  }
  if (path === '/api/assets') return json({ items: assets, total: assets.length, limit: 500, offset: 0 })
  if (path === '/api/playlists') return json({ playlists: [] })
  if (path === '/api/search') return json({ hits: [], total: 0, tookMs: 1, captionsUsed: [], unmatchedTerms: [] })
  return json({ error: `unhandled ${path}` }, 404)
}

// -- load the bundle the way DSH does ------------------------------------

const registrations = []
let exported = null
window.__ModuleLoader__ = {
  load({ id, factory }) {
    const require = (spec) => {
      if (spec === 'react') return React
      if (spec === 'react/jsx-runtime') return ReactJsxRuntime
      if (spec === 'react-dom') return ReactDOM
      if (spec === 'react-dom/client') return { createRoot }
      throw new Error(`unexpected require ${spec}`)
    }
    exported = factory(require) ?? { exports: {} }
    console.log(`module loaded: ${id} (${Object.keys(exported).join(', ')})`)
  },
}

const code = await readFile(join(process.cwd(), 'lib', 'client.js'), 'utf8')
window.eval(code)
assert.ok(exported !== null, 'bundle registered a module')
assert.equal(typeof exported.apply, 'function', 'module exports apply()')

const fakeSlots = {
  inject(slot, callback) {
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
        shortcuts: {
          register: () => () => undefined,
        },
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
const slots = registrations.map((entry) => entry.slot)
console.log('registrations:', slots.join(', '))
for (const expected of ['shell.activitybar.items', 'shell.activity']) {
  assert.ok(slots.includes(expected), `missing registration for ${expected}`)
}
assert.ok(!slots.includes('shell.statusbar.left'), 'the plugin no longer contributes a status-bar item')

const activity = registrations.find((entry) => entry.slot === 'shell.activity')
const glyph = registrations.find((entry) => entry.slot === 'shell.activitybar.items')

function check(name, condition, detail = '') {
  assert.ok(condition, `${name}${detail === '' ? '' : ` — ${detail}`}`)
  console.log(`  ✓ ${name}`)
}

// -- render ---------------------------------------------------------------

const container = window.document.getElementById('dsh')
const root = createRoot(container)
root.render(React.createElement(activity.component))
await new Promise((resolveTick) => setTimeout(resolveTick, 700))

const shadowHost = container.querySelector('div[style]')
check('activity page mounted', shadowHost !== null)
const shadow = shadowHost.shadowRoot
check('workbench renders in a shadow root', shadow !== null)
// Read the mount node, not the shadow root: the injected <style> is a sibling and
// its CSS text would otherwise satisfy every includes() check by accident.
const mount = shadow.querySelector('.dsh-sdk-mount')
check('shadow mount exists', mount !== null)
const text = mount.textContent ?? ''
console.log('rendered text:', text.replace(/\s+/g, ' ').slice(0, 260))

check('workbench chrome rendered', text.includes('SoundDesk'))
check('library is listed', text.includes('测试素材库'), text.slice(0, 200))
check('results list rendered', text.includes('ui_tone_confirm_01.wav'))
check('settings entry is present', shadow.querySelector('.dsh-sdk-gear') !== null)
check('stylesheet injected into the shadow root', (shadow.querySelector('style[data-plugin="dsh-sound-desk"]')?.textContent?.length ?? 0) > 5000)
check('no boot error screen', !text.includes('本地引擎没能启动'))
check('engine API was reached', calls.some((call) => call.includes('/api/stats')), calls.join(' | '))

// The settings dialog is opened by a window-level event from the top bar.
shadow.querySelector('.dsh-sdk-gear').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await new Promise((resolveTick) => setTimeout(resolveTick, 300))
const dialog = shadow.querySelector('.dsh-sdk-dialog')
check('settings dialog opens', dialog !== null)
check('settings dialog covers the host settings', (dialog.textContent ?? '').includes('加载声音指纹模型'))
const close = Array.from(dialog.querySelectorAll('button')).find((node) => node.textContent?.trim() === '✕')
close.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await new Promise((resolveTick) => setTimeout(resolveTick, 100))
check('settings dialog closes', shadow.querySelector('.dsh-sdk-dialog') === null)

// Add-library dialog, triggered the way the sidebar does it.
window.dispatchEvent(new window.CustomEvent('dsh-sound-desk:add-library'))
await new Promise((resolveTick) => setTimeout(resolveTick, 200))
const addDialog = shadow.querySelector('.dsh-sdk-dialog')
check('add-library dialog opens', addDialog !== null)
check('add-library explains the passes', (addDialog.textContent ?? '').includes('声音指纹'))

root.unmount()
for (const dispose of disposers.reverse()) {
  try {
    dispose()
  } catch {
    /* already disposed */
  }
}
dom.window.close()
console.log('\nall client checks passed')
