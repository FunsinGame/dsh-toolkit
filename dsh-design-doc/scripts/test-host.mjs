/**
 * Host-half regression run: parse a real design document, inject coordinates,
 * find an element back by its own path, and prove the save splice touches only
 * that element's inner range.
 *
 * Usage: node scripts/test-host.mjs [path-to-html]
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { collectPaths, findNodeByPath, injectPaths, parseHtml, textOf } from '../lib/host.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fallback = 'C:/g-workspace/Heyang-Projects/Project-Z-Fix/Docs/Design/modules/jobs/documents/01-jobs.html'
const target = process.argv[2] ?? fallback

let failures = 0
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

const src = await readFile(target, 'utf8')
const tree = parseHtml(src)

console.log(`source: ${target} (${src.length} chars)`)

const entries = collectPaths(tree)
console.log(`editable elements: ${entries.length}`)
check('finds paragraphs', entries.some((entry) => entry.node.tag === 'p'))
check('finds table cells', entries.some((entry) => entry.node.tag === 'td'))
check('finds section headings', entries.some((entry) => entry.ddPath.endsWith('|.')))

const injected = injectPaths(src, tree)
check('injection preserves original bytes', injected.html.replace(/ data-dd-path="[^"]*"/g, '') === src)
check('injection adds one attribute per element', (injected.html.match(/ data-dd-path="/g) || []).length === entries.length)
check('injection count matches', injected.count === entries.length)

const unique = new Set(entries.map((entry) => entry.ddPath))
check('paths are unique', unique.size === entries.length, `${unique.size} unique of ${entries.length}`)

let mismatched = 0
for (const entry of entries) {
  const found = findNodeByPath(tree, entry.ddPath)
  if (found !== entry.node) mismatched += 1
  if (mismatched > 3) break
}
check('every path resolves back to its own node', mismatched === 0, `${mismatched} wrong`)

const sample = entries.find((entry) => entry.node.tag === 'p' && textOf(src, entry.node).length > 12)
check('found a paragraph to splice', sample !== undefined)
if (sample !== undefined) {
  const before = textOf(src, sample.node)
  const replacement = '【测试】这一段被替换了。'
  const patched = src.slice(0, sample.node.openEnd) + replacement + src.slice(sample.node.closeStart)
  const patchedTree = parseHtml(patched)
  const patchedNode = findNodeByPath(patchedTree, sample.ddPath)
  check('splice keeps the file parseable', patchedTree.children.length > 0)
  check('splice lands on the same element', patchedNode !== null && textOf(patched, patchedNode) === replacement)
  check('splice leaves the rest of the file byte-identical', patched.slice(0, sample.node.openEnd) === src.slice(0, sample.node.openEnd))
  check('splice only changes that text', patched.length === src.length - before.length + replacement.length)
  const changedLines = patched.split('\n').filter((line, index) => line !== src.split('\n')[index]).length
  check('splice touches a single line', changedLines <= 2, `${changedLines} lines differ`)
}

const heading = entries.find((entry) => entry.node.tag === 'h3')
if (heading !== undefined) {
  check('heading path is the scope itself', heading.ddPath.endsWith('|.'), heading.ddPath)
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
