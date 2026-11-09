/**
 * Proves the extension's DOM-side coordinate rule is the same rule the DSH
 * plugin's host half uses.
 *
 * `lib/host.js` derives `data-dd-path` from a byte-offset parse of the `.html`
 * source. The extension only ever sees a rendered document, so it reimplements
 * the rule over the element tree (`src/dd-path.js`). This test parses the real
 * design-doc library with the host's own parser, rebuilds an element-like tree
 * from it, and compares the two coordinate sequences entry by entry — same
 * order, same strings.
 *
 * Usage:
 *   node scripts/test-paths.mjs                     # unit cases + the real library, if found
 *   node scripts/test-paths.mjs <Docs/Design dir>   # explicit library
 */

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

import { collectPaths, parseHtml } from '../../dsh-design-doc/lib/host.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = await readFile(path.join(here, '..', 'src', 'dd-path.js'), 'utf8')

const sandbox = {}
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'dd-path.js' })
const DDPath = sandbox.DDPath

let failures = 0
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

/** Element-like stand-in: the only shape `createIndex` reads. */
function toDom(node, parent) {
  const element = {
    nodeType: 1,
    localName: node.tag,
    tagName: String(node.tag).toUpperCase(),
    id: node.attrs !== undefined && typeof node.attrs.id === 'string' ? node.attrs.id : '',
    children: [],
    parentElement: parent,
  }
  element.children = node.children.map((child) => toDom(child, element))
  return element
}

/** Host coordinates for one HTML string, in document order. */
function hostPaths(html) {
  return collectPaths(parseHtml(html)).map((entry) => entry.ddPath)
}

/** Extension coordinates for one HTML string, in document order. */
function extensionPaths(html) {
  const tree = parseHtml(html)
  const root = toDom(tree.children[0], null)
  return DDPath.createIndex(root).entries().map((entry) => entry.ddPath)
}

function compare(label, html) {
  const expected = hostPaths(html)
  const actual = extensionPaths(html)
  const same = expected.length === actual.length
    && expected.every((value, index) => value === actual[index])
  check(label, same, same ? undefined : `host=${JSON.stringify(expected)} extension=${JSON.stringify(actual)}`)
  return same
}

/* -------------------------------------------------------------- unit cases -- */

console.log('unit cases')

compare('an id does not leak out of its subtree', [
  '<html><body><div id="A"><p id="B">x</p></div><p>y</p></body></html>',
].join(''))

compare('a container with no editable block is selectable', [
  '<html><body><div id="C"><img src="a.svg"></div><div id="D"><p>x</p></div></body></html>',
].join(''))

compare('counters are per scope, not per parent', [
  '<html><body><div id="E"><p>a</p><p>b</p><div><p>c</p></div></div></body></html>',
].join(''))

compare('blocks before the first id get no coordinate', [
  '<html><body><p>x</p><div id="F"><p>y</p></div></body></html>',
].join(''))

compare('a heading becomes the scope of what follows it', [
  '<html><body><section id="job-10"><h2>t</h2><h3 id="job-10-2">s</h3><p>x</p></section></body></html>',
].join(''))

compare('an id on <html> starts the scope', [
  '<html id="H"><body><p>x</p></body></html>',
].join(''))

compare('h1 is not a coordinate target', [
  '<html><body><section id="S"><h1>t</h1><p>x</p></section></body></html>',
].join(''))

compare('a figure with a caption is not selectable, the caption is', [
  '<html><body><section id="S"><figure><img src="a.svg"><figcaption>cap</figcaption></figure></section></body></html>',
].join(''))

/* -------------------------------------------------------- generated nodes -- */

console.log('runtime-built subtrees')
{
  // `enemy-blocks.js` replaces a table with cards assembled in JS. Its cells
  // have no source counterpart, so the index must not count them — otherwise a
  // later paragraph would inherit a shifted number.
  const html = [
    '<html><body><section id="S">',
    '<div class="enemy-block"><table><tbody><tr><td>stat</td></tr></tbody></table></div>',
    '<p>after</p>',
    '</section></body></html>',
  ].join('')
  const tree = parseHtml(html)
  const plain = DDPath.createIndex(toDom(tree.children[0], null))
  const skipped = DDPath.createIndex(toDom(tree.children[0], null), {
    skip: (element) => element.localName === 'div',
  })
  check('a generated cell would otherwise get a coordinate',
    plain.entries().some((entry) => entry.ddPath === 'S|td1'),
    JSON.stringify(plain.entries().map((entry) => entry.ddPath)))
  check('skipping it removes the coordinate',
    !skipped.entries().some((entry) => entry.ddPath === 'S|td1'),
    JSON.stringify(skipped.entries().map((entry) => entry.ddPath)))
  check('the paragraph after it keeps its number',
    skipped.entries().some((entry) => entry.ddPath === 'S|p1'),
    JSON.stringify(skipped.entries().map((entry) => entry.ddPath)))
}

/* --------------------------------------------------------------- payloads -- */

console.log('payload formats')
const description = {
  ddPath: 'job-10-2|p3',
  text: '  位置记号○ 不可用；\n  改为 ✕  ',
  chapter: 'JOB-10 · 十、技能',
  section: '10.2 位置记号',
  docTitle: '职业设计',
  docPath: 'modules/jobs/documents/01-jobs.html',
}
check('coord is the bare key', DDPath.payload(description, 'coord') === 'job-10-2|p3')
check('coord-text keeps the text on a second line', DDPath.payload(description, 'coord-text') === 'job-10-2|p3\n位置记号○ 不可用； 改为 ✕')
check('context names the doc and the section', DDPath.payload(description, 'context')
  === '【设计文档·坐标】job-10-2|p3\n文档：职业设计（modules/jobs/documents/01-jobs.html）\n章节：JOB-10 · 十、技能 › 10.2 位置记号\n原文：位置记号○ 不可用； 改为 ✕')
check('an unknown format still yields the key', DDPath.payload(description, 'nope') === 'job-10-2|p3')

/* ------------------------------------------------------- the real library -- */

const workspaceCandidates = [
  process.argv[2],
  'C:/g-workspace/Heyang-Projects/Project-Z-Fix/Docs/Design',
  path.join(here, '..', '..', 'Docs', 'Design'),
].filter((entry) => typeof entry === 'string' && entry !== '')

let library = null
for (const candidate of workspaceCandidates) {
  try {
    await readFile(path.join(candidate, 'modules.json'), 'utf8')
    library = path.resolve(candidate)
    break
  } catch {
    /* try the next candidate */
  }
}

if (library === null) {
  console.log('\nreal library: skipped (pass a Docs/Design path as the first argument)')
} else {
  console.log(`\nreal library: ${library}`)
  const files = []
  const walkDir = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue
        await walkDir(full)
      } else if (entry.name.endsWith('.html')) {
        files.push(full)
      }
    }
  }
  await walkDir(library)
  files.sort()

  let total = 0
  let failedFiles = 0
  for (const file of files) {
    const html = await readFile(file, 'utf8')
    const expected = hostPaths(html)
    const actual = extensionPaths(html)
    total += expected.length
    const same = expected.length === actual.length
      && expected.every((value, index) => value === actual[index])
    if (same) continue
    failedFiles += 1
    const at = expected.findIndex((value, index) => value !== actual[index])
    console.log(`  FAIL ${path.relative(library, file)} @${at}: host=${JSON.stringify(expected.slice(at, at + 4))} extension=${JSON.stringify(actual.slice(at, at + 4))}`)
  }
  check(`${files.length} documents, ${total} coordinates agree with the host`, failedFiles === 0, `${failedFiles} file(s) differ`)
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
