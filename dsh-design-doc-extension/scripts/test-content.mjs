/**
 * Runs the real content script against a real design document in jsdom.
 *
 * The coordinate rule itself is covered by `test-paths.mjs` (against the host
 * parser). This one covers the browser glue that the rule sits inside: the
 * hover badge, the Ctrl+C interception and its two bail-outs (text selected,
 * nothing hovered), pinning, and the `data-dd-path` preference on pages served
 * by the DSH plugin.
 *
 * jsdom is not a dependency of the extension — it is borrowed from the DSH
 * checkout when present, because an extension with no build step should have
 * no node_modules. When it cannot be found the test says so and exits 0.
 *
 * Usage: node scripts/test-content.mjs [Docs/Design path]
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { injectPaths, parseHtml } from '../../dsh-design-doc/lib/host.js'

const here = path.dirname(fileURLToPath(import.meta.url))

let failures = 0
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

/* -------------------------------------------------------------------- jsdom -- */

const jsdomCandidates = [
  process.env.JSDOM_PATH,
  path.join(here, '..', '..', '..', 'dsh-console', 'node_modules', 'jsdom', 'lib', 'api.js'),
  path.join(here, '..', '..', 'node_modules', 'jsdom', 'lib', 'api.js'),
  path.join(here, '..', 'node_modules', 'jsdom', 'lib', 'api.js'),
].filter((entry) => typeof entry === 'string' && entry !== '')

let jsdom = null
for (const candidate of jsdomCandidates) {
  try {
    jsdom = await import(pathToFileURL(candidate).href)
    break
  } catch {
    /* try the next candidate */
  }
}

if (jsdom === null || typeof jsdom.JSDOM !== 'function') {
  console.log('jsdom not found; content-script checks skipped (set JSDOM_PATH to run them)')
  process.exit(0)
}

const { JSDOM } = jsdom
const ddPathSource = await readFile(path.join(here, '..', 'src', 'dd-path.js'), 'utf8')
const contentSource = await readFile(path.join(here, '..', 'src', 'content.js'), 'utf8')

/* ------------------------------------------------------------------ library -- */

const candidates = [
  process.argv[2],
  'C:/g-workspace/Heyang-Projects/Project-Z-Fix/Docs/Design',
].filter((entry) => typeof entry === 'string' && entry !== '')

let documentFile = null
let libraryRoot = null
for (const candidate of candidates) {
  const file = path.join(candidate, 'modules', 'combat', 'documents', '01-attr.html')
  try {
    await readFile(file, 'utf8')
    documentFile = file
    libraryRoot = candidate
    break
  } catch {
    /* try the next candidate */
  }
}

if (documentFile === null) {
  console.log('design document not found; content-script checks skipped (pass a Docs/Design path)')
  process.exit(0)
}

/* ------------------------------------------------------------------ harness -- */

/** A `chrome` stand-in that records messages and answers like the extension. */
function chromeStub() {
  const sent = []
  const messageListeners = []
  return {
    sent,
    messageListeners,
    chrome: {
      storage: {
        local: {
          get: async () => ({ settings: undefined }),
          set: async () => undefined,
        },
        onChanged: { addListener() {} },
      },
      runtime: {
        sendMessage: (message) => {
          sent.push(message)
          return Promise.resolve({ ok: true })
        },
        onMessage: {
          addListener: (handler) => messageListeners.push(handler),
        },
      },
    },
  }
}

function copyEvent(window) {
  const event = new window.Event('copy', { bubbles: true, cancelable: true })
  const data = {}
  event.clipboardData = {
    setData(type, value) {
      data[type] = value
    },
  }
  return { event, data }
}

function move(window, element, x = 40, y = 40) {
  element.dispatchEvent(new window.MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  }))
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Loads one page into jsdom and boots the content script there. */
async function openPage(html, url) {
  const dom = new JSDOM(html, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  const stub = chromeStub()
  dom.window.chrome = stub.chrome
  dom.window.eval(ddPathSource)
  dom.window.eval(contentSource)
  await settle()
  await settle()
  return { dom, window: dom.window, document: dom.window.document, stub }
}

/**
 * A page whose own scripts run first — `enemy-blocks.js` rebuilds the tables,
 * which is exactly the case where DOM numbering drifts from the source.
 */
async function openRenderedPage(file) {
  const source = await readFile(file, 'utf8')
  const dom = new JSDOM(source, {
    url: pathToFileURL(file).href,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: new jsdom.VirtualConsole(),
  })
  await new Promise((resolve) => {
    if (dom.window.document.readyState === 'complete') resolve()
    else dom.window.addEventListener('load', resolve, { once: true })
  })
  await new Promise((resolve) => setTimeout(resolve, 500))
  const stub = chromeStub()
  dom.window.chrome = stub.chrome
  dom.window.eval(ddPathSource)
  dom.window.eval(contentSource)
  await settle()
  await settle()
  return { dom, window: dom.window, document: dom.window.document, stub }
}

const html = await readFile(documentFile, 'utf8')
const fileUrl = pathToFileURL(documentFile).href

/* ------------------------------------------------------------- hover + copy -- */

console.log('content script on a real document')
{
  const page = await openPage(html, fileUrl)
  const { document, window, stub } = page

  const host = document.getElementById('dd-coord-root')
  check('activates on a design document', host !== null)
  const shadow = host === null ? null : host.shadowRoot
  check('badge lives in a shadow root', shadow !== null)

  const lead = document.querySelector('section#attr-01 p.lead')
  check('found the first paragraph of the chapter', lead !== null)
  move(window, lead)
  check('badge shows the chapter coordinate', shadow.querySelector('.badge code').textContent === 'attr-01|p1',
    shadow.querySelector('.badge code').textContent)

  const hoverMessage = stub.sent.find((message) => message.type === 'dd:hover' && message.description !== null)
  check('reports the hover to the panel', hoverMessage !== undefined && hoverMessage.description.ddPath === 'attr-01|p1')
  check('computed coordinates are labelled', hoverMessage !== undefined && hoverMessage.description.source === 'computed')
  check('description carries the chapter title', hoverMessage !== undefined && hoverMessage.description.chapter === '一、本文档范围',
    hoverMessage === undefined ? '' : hoverMessage.description.chapter)

  const firstCell = document.querySelector('section#attr-01 tbody td')
  move(window, firstCell)
  check('a table cell gets its own coordinate', shadow.querySelector('.badge code').textContent === 'attr-01|td1',
    shadow.querySelector('.badge code').textContent)

  move(window, lead)
  const copy = copyEvent(window)
  document.body.dispatchEvent(copy.event)
  check('Ctrl+C with nothing selected copies the coordinate', copy.data['text/plain'] === 'attr-01|p1',
    JSON.stringify(copy.data))
  check('the browser copy is intercepted', copy.event.defaultPrevented === true)
  const recordMessage = stub.sent.find((message) => message.type === 'dd:record')
  check('the copy is recorded for the panel', recordMessage !== undefined && recordMessage.entry.ddPath === 'attr-01|p1')

  const originalSelection = window.getSelection
  window.getSelection = () => ({ toString: () => '选中的文字' })
  const withSelection = copyEvent(window)
  document.body.dispatchEvent(withSelection.event)
  check('a real text selection is left to the browser', withSelection.event.defaultPrevented === false)
  check('nothing is overwritten when text is selected', withSelection.data['text/plain'] === undefined)
  window.getSelection = originalSelection

  move(window, document.querySelector('.topbar .brand'))
  const overChrome = copyEvent(window)
  document.body.dispatchEvent(overChrome.event)
  check('hovering page chrome copies nothing', overChrome.event.defaultPrevented === false)

  /* ---------------------------------------------------------------- pinning -- */

  move(window, lead)
  lead.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  check('clicking pins the block', shadow.querySelector('.badge .hint').textContent.includes('已固定'),
    shadow.querySelector('.badge .hint').textContent)
  check('the pin is announced', shadow.querySelector('.toast').textContent.includes('已固定'))

  document.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  check('Esc clears the pin', shadow.querySelector('.badge .hint').textContent.includes('Ctrl+C'))

  page.dom.window.close()
}

/* ------------------------------------------------------ host-injected page -- */

console.log('content script on a page served by the DSH plugin')
{
  const injected = injectPaths(html, parseHtml(html)).html
  const page = await openPage(injected, 'http://127.0.0.1:54048/dsh-design-doc/site/modules/combat/documents/01-attr.html')
  const { document, window, stub } = page
  const lead = document.querySelector('section#attr-01 p.lead')
  move(window, lead)
  const hover = stub.sent.find((message) => message.type === 'dd:hover' && message.description !== null)
  check('the host attribute wins over the DOM computation', hover !== undefined && hover.description.source === 'host')
  check('and carries the same coordinate', hover !== undefined && hover.description.ddPath === 'attr-01|p1')
  check('the attribute is what the host injected', lead.getAttribute('data-dd-path') === 'attr-01|p1',
    String(lead.getAttribute('data-dd-path')))
  page.dom.window.close()
}

/* ------------------------------------------------------------ a non-doc page -- */

console.log('content script on an unrelated page')
{
  const page = await openPage('<!DOCTYPE html><html><body><div id="x"><p>hello</p></div></body></html>', 'http://127.0.0.1:54048/')
  const { document, window, stub } = page
  check('does not activate outside a design document', document.getElementById('dd-coord-root') === null)
  const copy = copyEvent(window)
  document.body.dispatchEvent(copy.event)
  check('does not touch Ctrl+C there', copy.event.defaultPrevented === false)
  check('sends nothing', stub.sent.length === 0)
  page.dom.window.close()
}

/* ------------------------------------------- runtime-rebuilt enemy cards -- */

const nineHadesFile = path.join(libraryRoot, 'modules', 'nine-hades', 'documents', '01-nine-hades.html')
let nineHades = true
try {
  await readFile(nineHadesFile, 'utf8')
} catch {
  nineHades = false
}

if (nineHades === false) {
  console.log('runtime-rebuilt enemy cards: skipped (no nine-hades document)')
} else {
  console.log('runtime-rebuilt enemy cards')
  const page = await openRenderedPage(nineHadesFile)
  const { document, window } = page
  const blocks = Array.from(document.querySelectorAll('.enemy-block'))
  check('the page rebuilt the enemy tables', blocks.length > 0, String(blocks.length))

  const withStats = blocks.find((block) => block.querySelector('.enemy-stats') !== null)
  const withoutStats = blocks.find((block) => block.querySelector('.enemy-stats') === null)
  const shadow = document.getElementById('dd-coord-root').shadowRoot

  if (withStats !== undefined) {
    move(window, withStats.querySelector('.enemy-stats td'))
    const code = shadow.querySelector('.badge code').textContent
    check('a generated stat cell is addressed as an enemy, not a td', code === 'nine-02|enemy1', code)

    const copy = copyEvent(window)
    document.body.dispatchEvent(copy.event)
    check('copying it yields the enemy address', copy.data['text/plain'] === 'nine-02|enemy1',
      JSON.stringify(copy.data))
  } else {
    check('found a card built from data-stats', false)
  }

  if (withoutStats !== undefined) {
    move(window, withoutStats)
    check('a card with no data-stats row says it has no coordinate',
      shadow.querySelector('.badge code').textContent === '无源码坐标',
      shadow.querySelector('.badge code').textContent)
    const copy = copyEvent(window)
    document.body.dispatchEvent(copy.event)
    check('and copies nothing instead of a wrong coordinate', copy.data['text/plain'] === undefined,
      JSON.stringify(copy.data))
    check('and explains why', shadow.querySelector('.toast').textContent.includes('页面脚本生成'))
  } else {
    check('found a card with no data-stats row', false)
  }

  const index = window.DDPath.createIndex(window.document.documentElement, {
    skip: (element) => element.matches('.enemy-block, .enemy-blocks'),
  })
  const drifted = index.entries().filter((entry) => entry.ddPath.startsWith('nine-02-2|td'))
  check('no td coordinate is invented inside the rebuilt section', drifted.length === 0, String(drifted.length))
  page.dom.window.close()
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
