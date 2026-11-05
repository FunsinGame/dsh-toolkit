/**
 * Smoke run against the real design-doc library: mounts the host half on a
 * throwaway port and reads the manifest for a workspace root.
 *
 * Usage: node scripts/smoke-real.mjs [workspaceRoot]
 */

import http from 'node:http'

import { apply as hostApply } from '../lib/host.js'

const workspace = process.argv[2] ?? 'C:/g-workspace/Heyang-Projects/Project-Z-Fix'

const routes = []
hostApply({
  logger: { info: () => {}, warn: console.warn, error: console.error },
  inject: (deps, callback) => callback({
    effect: (factory) => factory(),
    webServer: { register: (route) => { routes.push(route); return () => {} } },
    connection: { requestRejection: () => undefined },
  }),
})

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

const manifest = await (await fetch(`${base}/dsh-design-doc/manifest?root=${root}`)).json()
if (manifest.ok !== true) {
  console.error('manifest failed:', manifest.error)
  process.exit(1)
}

console.log(`docsRoot: ${manifest.docsRoot}`)
for (const module of manifest.modules) {
  for (const document of module.documents) {
    console.log(`  ${module.title} / ${document.title} — ${document.chapters.length} 章`)
  }
}

const anchors = Object.keys(manifest.sections)
console.log(`\ndesign-map anchors: ${anchors.length}`)

const sample = manifest.modules.flatMap((module) => module.documents.flatMap((document) =>
  document.chapters.flatMap((chapter) => [chapter.id, ...chapter.sections.map((section) => section.id)])))
const linked = sample.filter((anchor) => (manifest.sections[anchor] ?? []).length > 0)
console.log(`章节锚点 ${sample.length} 个，其中 ${linked.length} 个有代码关联`)
console.log(`示例：${linked.slice(0, 3).map((anchor) => `${anchor} → ${manifest.sections[anchor].length} 个文件`).join('，')}`)

const docRel = manifest.modules.find((module) => module.documents.length > 0).documents[0].rel
const html = await (await fetch(`${base}/dsh-design-doc/site/${docRel}?root=${root}`)).text()
const injected = (html.match(/ data-dd-path="/g) ?? []).length
console.log(`\n${docRel}: 注入 ${injected} 个坐标，含 overlay=${html.includes('/dsh-design-doc/overlay.js')}`)
console.log(`首个坐标示例：${(/data-dd-path="([^"]+)"/.exec(html) ?? [])[1] ?? '(none)'}`)

server.close()
