/**
 * Explains a "this coordinate does not resolve" report.
 *
 * A coordinate is `<scope>|<tag><n>`. The DSH plugin counts `<tag>` in the
 * `.html` source; the browser extension counts it in the rendered DOM. For most
 * documents those agree — but a page that *rebuilds* markup at runtime moves the
 * numbering, and then a coordinate copied from the browser points at a
 * different cell than the one in the source (or at a cell that has no source at
 * all).
 *
 * This prints both sides for one scope, plus every rendered coordinate the
 * source does not have.
 *
 * Usage:
 *   node scripts/compare-rendered.mjs <file.html> [scope-id]
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { collectPaths, elementText, parseHtml } from '../../dsh-design-doc/lib/host.js'

const here = path.dirname(fileURLToPath(import.meta.url))

const jsdomCandidates = [
  process.env.JSDOM_PATH,
  path.join(here, '..', '..', '..', 'dsh-console', 'node_modules', 'jsdom', 'lib', 'api.js'),
  path.join(here, '..', '..', 'node_modules', 'jsdom', 'lib', 'api.js'),
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
if (jsdom === null) {
  console.log('jsdom not found; set JSDOM_PATH to run this')
  process.exit(0)
}

const file = process.argv[2]
const scope = process.argv[3]
if (file === undefined) {
  console.log('usage: node scripts/compare-rendered.mjs <file.html> [scope-id]')
  process.exit(1)
}

const ddPathSource = await readFile(path.join(here, '..', 'src', 'dd-path.js'), 'utf8')
const sandbox = {}
vm.createContext(sandbox)
vm.runInContext(ddPathSource, sandbox, { filename: 'dd-path.js' })
const DDPath = sandbox.DDPath

const html = await readFile(file, 'utf8')
const squash = (text) => String(text || '').replace(/\s+/g, ' ').trim()

/* ---------------------------------------------------------------- source -- */

const tree = parseHtml(html)
const sourceRows = collectPaths(tree).map((entry) => ({
  path: entry.ddPath,
  tag: entry.node.tag,
  text: squash(elementText(html, entry.node)),
}))

/* --------------------------------------------------------------- rendered -- */

const dom = new jsdom.JSDOM(html, {
  url: pathToFileURL(path.resolve(file)).href,
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
})
await new Promise((resolve) => {
  if (dom.window.document.readyState === 'complete') resolve()
  else dom.window.addEventListener('load', resolve, { once: true })
})
await new Promise((resolve) => setTimeout(resolve, 600))

const index = DDPath.createIndex(dom.window.document.documentElement, {
  // Same exclusion the content script applies: a card the page built from
  // `data-stats` has no source elements to count.
  skip: (element) => element.matches('.enemy-block, .enemy-blocks'),
})
const skipped = dom.window.document.querySelectorAll('.enemy-block, .enemy-blocks').length
const renderedRows = index.entries().map((entry) => ({
  path: entry.ddPath,
  tag: String(entry.element.localName || ''),
  text: squash(entry.element.innerText || entry.element.textContent),
}))

/* ----------------------------------------------------------------- report -- */

const scoped = (rows) => (scope === undefined ? rows : rows.filter((row) => row.path.startsWith(scope + '|')))

const sourceScoped = scoped(sourceRows)
const renderedScoped = scoped(renderedRows)
const sourceSet = new Set(sourceRows.map((row) => row.path))
const missing = renderedScoped.filter((row) => !sourceSet.has(row.path))

console.log(`file     ${path.resolve(file)}`)
console.log(`scope    ${scope === undefined ? '(whole document)' : scope}`)
console.log(`source   ${sourceScoped.length} coordinates, ${sourceRows.length} in the document`)
console.log(`rendered ${renderedScoped.length} coordinates, ${renderedRows.length} in the document`)
console.log(`skipped  ${skipped} runtime-built element(s) (.enemy-block / .enemy-blocks)`)
console.log(`rendered-only ${missing.length}${missing.length === 0 ? '' : '  <- these cannot be found in the .html'}`)

function show(label, rows, limit) {
  console.log(`\n${label}`)
  rows.slice(0, limit).forEach((row) => {
    console.log(`  ${row.path.padEnd(24)} ${row.text.slice(0, 56)}`)
  })
}

if (scope !== undefined) {
  show('source (what the DSH plugin counts)', sourceScoped, 12)
  show('rendered (what the browser extension counts)', renderedScoped, 12)
  if (missing.length > 0) show('rendered only — no source counterpart', missing, 12)
} else {
  const byScope = new Map()
  for (const row of renderedRows) {
    const id = row.path.split('|')[0]
    byScope.set(id, (byScope.get(id) || 0) + 1)
  }
  const sourceByScope = new Map()
  for (const row of sourceRows) {
    const id = row.path.split('|')[0]
    sourceByScope.set(id, (sourceByScope.get(id) || 0) + 1)
  }
  const drifted = []
  for (const [id, count] of byScope) {
    if ((sourceByScope.get(id) || 0) !== count) drifted.push({ id, source: sourceByScope.get(id) || 0, rendered: count })
  }
  console.log(`\nscopes whose coordinate count differs: ${drifted.length}`)
  drifted.slice(0, 12).forEach((row) => {
    console.log(`  ${row.id.padEnd(20)} source ${String(row.source).padStart(4)}  rendered ${String(row.rendered).padStart(4)}`)
  })
  if (missing.length > 0) show('rendered only — no source counterpart', missing, 10)
}

dom.window.close()
