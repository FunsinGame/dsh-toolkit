/**
 * Route-level regression run: mounts the host half on a plain node:http server
 * against a throwaway `Docs/Design` tree, then exercises manifest, the site
 * mount, the save splice, the conflict guard and the traversal guard.
 *
 * Usage: node scripts/test-server.mjs
 */

import http from 'node:http'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// Keep the "remember the last workspace" side effect out of the real DSH home.
process.env.DSH_HOME = path.join(os.tmpdir(), 'dd-test-home')

import { apply as hostApply, collectPaths, parseHtml, textOf } from '../lib/host.js'

let failures = 0
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

const demoHtml = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>演示｜《山河志》设计文档</title>
<link rel="stylesheet" href="../../../styles/docs.css"></head>
<body class="page-doc">
<section class="module" id="demo-01" data-module="DEMO-01">
  <header class="module-head"><h2>一、演示</h2><a class="anchor" href="#demo-01">#</a></header>
  <p>这是第一段原文。</p>
  <h3 id="demo-01-1">1.1 小节</h3>
  <p>小节里的段落。</p>
  <div class="table-wrap"><table><thead><tr><th>项</th><th>值</th></tr></thead>
  <tbody><tr><td>甲</td><td>1</td></tr></tbody></table></div>
</section>
</body></html>
`

const workspace = await mkdtemp(path.join(os.tmpdir(), 'dd-test-'))
const docsRoot = path.join(workspace, 'Docs', 'Design')
await mkdir(path.join(docsRoot, 'modules', 'demo', 'documents'), { recursive: true })
await mkdir(path.join(docsRoot, 'styles'), { recursive: true })
await writeFile(path.join(docsRoot, 'modules.json'), JSON.stringify({ modules: [{ id: 'demo', title: '演示模块' }] }), 'utf8')
await writeFile(path.join(docsRoot, 'modules', 'demo', 'documents', '01-demo.html'), demoHtml, 'utf8')
await writeFile(path.join(docsRoot, 'styles', 'docs.css'), 'body{color:#111}', 'utf8')

const routes = []
const ctx = {
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  inject: (deps, callback) => callback({
    effect: (factory) => factory(),
    webServer: { register: (route) => { routes.push(route); return () => {} } },
    connection: { requestRejection: () => undefined },
  }),
}
hostApply(ctx)
check('host registered a route', routes.length === 1)

const server = http.createServer((req, res) => {
  const route = routes.find((entry) => req.url.startsWith(entry.path))
  if (route === undefined) {
    res.statusCode = 404
    res.end('no route')
    return
  }
  route.handler(req, res)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const root = encodeURIComponent(workspace)

const json = async (response) => {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

const manifest = await json(await fetch(`${base}/dsh-design-doc/manifest?root=${root}`))
check('manifest resolves the docs root', manifest.ok === true && manifest.docsRoot === docsRoot, JSON.stringify(manifest.error ?? null))
const chapter = manifest.modules?.[0]?.documents?.[0]?.chapters?.[0]
check('manifest finds the chapter', chapter?.id === 'demo-01')
check('manifest finds the section', chapter?.sections?.[0]?.id === 'demo-01-1')
check('manifest title drops the suffix', manifest.modules?.[0]?.documents?.[0]?.title === '演示', manifest.modules?.[0]?.documents?.[0]?.title)

const siteHtml = await (await fetch(`${base}/dsh-design-doc/site/modules/demo/documents/01-demo.html?root=${root}`)).text()
check('site html carries coordinates', siteHtml.includes('data-dd-path="demo-01-1|"') || siteHtml.includes('data-dd-path="demo-01-1|.'))
check('site html injects the overlay', siteHtml.includes('/dsh-design-doc/overlay.js'))

const cssResponse = await fetch(`${base}/dsh-design-doc/site/styles/docs.css?root=${root}`)
check('site mount serves assets', cssResponse.status === 200 && cssResponse.headers.get('content-type').startsWith('text/css'))

const overlay = await fetch(`${base}/dsh-design-doc/overlay.js`)
check('overlay is served', overlay.status === 200)

const entries = collectPaths(parseHtml(demoHtml))
const paragraph = entries.find((entry) => entry.node.tag === 'p' && entry.ddPath.startsWith('demo-01-1'))
check('found the target paragraph', paragraph !== undefined)

const saveBody = {
  root: workspace,
  rel: 'modules/demo/documents/01-demo.html',
  ddPath: paragraph.ddPath,
  expectText: textOf(demoHtml, paragraph.node),
  html: '改过的段落。',
}
const saveResponse = await fetch(`${base}/dsh-design-doc/save`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(saveBody),
})
const saved = await json(saveResponse)
check('save succeeds', saved.ok === true, JSON.stringify(saved.error ?? null))
check('save reports a diff', saved.changed >= 1 && Array.isArray(saved.diff) && saved.diff.length >= 1)

const afterSave = await readFile(path.join(docsRoot, 'modules/demo/documents/01-demo.html'), 'utf8')
check('source now holds the new text', afterSave.includes('改过的段落。'))
check('source dropped the old text', afterSave.includes('小节里的段落。') === false)
check('rest of the document untouched', afterSave.replace('改过的段落。', '小节里的段落。') === demoHtml)
const diffLines = afterSave.split('\n').filter((line, index) => line !== demoHtml.split('\n')[index])
check('exactly one line changed', diffLines.length === 1, `${diffLines.length} lines`)

const conflict = await fetch(`${base}/dsh-design-doc/save`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...saveBody, html: '又改一次。' }),
})
check('stale text is rejected', conflict.status === 409, String(conflict.status))

const traversal = await fetch(`${base}/dsh-design-doc/site/..%2F..%2Fpackage.json?root=${root}`)
check('traversal is refused', traversal.status === 403 || traversal.status === 404, String(traversal.status))

const missing = await fetch(`${base}/dsh-design-doc/manifest?root=${encodeURIComponent(path.join(os.tmpdir(), 'nope-xyz'))}`)
check('unknown root reports not found', missing.status === 404, String(missing.status))

await new Promise((resolve) => server.close(resolve))
console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
