/**
 * Host-route integration test.
 *
 * Mounts the real handler on a real HTTP server, points DSH_HOME at a temporary
 * directory, and walks the exact three-step export the page performs.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = await mkdtemp(join(tmpdir(), 'dsh-design-mind-'))
process.env.DSH_HOME = home

const { createRouteHandler, exportsRoot } = await import('../lib/index.js')
const root = exportsRoot()
assert.equal(root, join(home, 'design-mind', 'exports'), 'exports live under the plugin directory')

const opened = []
const handler = createRouteHandler({
  root,
  version: '0.1.0',
  openDirectory: async (directory) => {
    opened.push(directory)
  },
})
const server = http.createServer((req, res) => {
  handler(req, res).catch((error) => {
    res.statusCode = 500
    res.end(String(error))
  })
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}/dsh-design-mind`
const png = await readFile(join(process.cwd(), 'fixtures', 'design.png'))
const pngHash = createHash('sha256').update(png).digest('hex')

async function call(path, init = {}) {
  const response = await fetch(`${base}${path}`, init)
  const text = await response.text()
  let body = text
  try {
    body = JSON.parse(text)
  } catch {
    // Keep the raw text for the assertion that expects a plain-text fence.
  }
  return { status: response.status, body }
}

async function newExport() {
  const created = await call('/exports', { method: 'POST' })
  assert.equal(created.status, 201)
  assert.match(created.body.exportId, /^\d{8}-\d{6}-[0-9a-f]{8}$/)
  return created.body.exportId
}

try {
  const hello = await call('')
  assert.equal(hello.status, 200)
  assert.equal(hello.body.ok, true)
  assert.equal(hello.body.version, '0.1.0')

  const exportId = await newExport()
  assert.ok((await stat(join(root, exportId))).isDirectory(), 'the export directory exists')

  const revealed = await call('/exports/open', { method: 'POST' })
  assert.equal(revealed.status, 200)
  assert.equal(revealed.body.dir, root)
  assert.deepEqual(opened, [root], 'the host opens the export root, never a request path')

  const uploaded = await call(`/exports/${exportId}/image`, {
    method: 'PUT',
    headers: { 'content-type': 'image/png' },
    body: png,
  })
  assert.equal(uploaded.status, 200)
  assert.equal(uploaded.body.width, 320)
  assert.equal(uploaded.body.height, 200)
  assert.equal(uploaded.body.mimeType, 'image/png')
  assert.equal(uploaded.body.sha256, pngHash)
  assert.equal(uploaded.body.file, 'design.png')

  const objects = [
    {
      kind: 'region',
      source: { x1: 92, y1: 58, x2: 220, y2: 132 },
      rect: { x1: 192, y1: 58, x2: 320, y2: 132 },
      text: '把这块卡片挪到右边',
    },
    { kind: 'region', source: { x1: 92, y1: 146, x2: 300, y2: 188 }, text: '这行文字保持原位' },
    { kind: 'global', text: '整体留白再大一点' },
  ]
  const committed = await call(`/exports/${exportId}/commit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ objects }),
  })
  assert.equal(committed.status, 201)
  assert.equal(committed.body.count, 3)
  assert.equal(committed.body.schemaVersion, 'design-mind-1')
  assert.equal(committed.body.imagePath, join(root, exportId, 'design.png'))
  assert.equal(committed.body.jsonPath, join(root, exportId, 'feedback.json'))
  assert.ok(committed.body.prompt.includes(committed.body.imagePath))
  assert.ok(committed.body.prompt.includes(committed.body.jsonPath))
  assert.ok(committed.body.prompt.includes('带 `movement` 的对象'), 'prompt explains moved regions')

  const feedback = JSON.parse(await readFile(committed.body.jsonPath, 'utf8'))
  assert.equal(feedback.schemaVersion, 'design-mind-1')
  assert.equal(feedback.tool.name, 'dsh-design-mind')
  assert.equal(feedback.annotationSpace, 'image-pixels')
  assert.equal(feedback.image.file, 'design.png')
  assert.equal(feedback.image.width, 320)
  assert.equal(feedback.image.height, 200)
  assert.equal(feedback.image.sha256, pngHash)
  assert.deepEqual(
    feedback.objects.map((object) => object.id),
    ['o1', 'o2', 'o3'],
  )
  assert.deepEqual(feedback.objects[0].source, { x1: 92, y1: 58, x2: 220, y2: 132 })
  assert.deepEqual(feedback.objects[0].movement, {
    rect: { x1: 192, y1: 58, x2: 320, y2: 132 },
    dx: 100,
    dy: 0,
  })
  assert.equal(feedback.objects[0].annotations[0].number, 1)
  assert.equal(feedback.objects[1].movement, undefined, 'a frame that never moved has no movement')
  assert.equal(feedback.objects[1].annotations[0].number, 2)
  assert.equal(feedback.objects[2].kind, 'global')
  assert.equal(feedback.objects[2].annotations[0].number, 3)

  const second = await call(`/exports/${exportId}/commit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ objects }),
  })
  assert.equal(second.status, 409, 'committing twice is refused')

  // Re-uploading replaces this export's own picture.
  const reuploaded = await call(`/exports/${exportId}/image`, {
    method: 'PUT',
    headers: { 'content-type': 'image/png' },
    body: png,
  })
  assert.equal(reuploaded.status, 200)

  const traversed = await call('/exports/..%2F..%2Fescape/image', {
    method: 'PUT',
    headers: { 'content-type': 'image/png' },
    body: png,
  })
  assert.equal(traversed.status, 404, 'path traversal is refused')

  const badType = await call(`/exports/${await newExport()}/image`, {
    method: 'PUT',
    headers: { 'content-type': 'text/plain' },
    body: png,
  })
  assert.equal(badType.status, 415)

  const notAnImage = await call(`/exports/${await newExport()}/image`, {
    method: 'PUT',
    headers: { 'content-type': 'image/png' },
    body: Buffer.from('this is not a png'),
  })
  assert.equal(notAnImage.status, 415)

  const missingImage = await call(`/exports/${await newExport()}/commit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ objects }),
  })
  assert.equal(missingImage.status, 409)

  const empty = await call(`/exports/${await newExport()}/commit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ objects: [] }),
  })
  assert.equal(empty.status, 409, 'a commit without an image never reaches validation')

  const freshId = await newExport()
  await call(`/exports/${freshId}/image`, {
    method: 'PUT',
    headers: { 'content-type': 'image/png' },
    body: png,
  })
  const emptyObjects = await call(`/exports/${freshId}/commit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ objects: [] }),
  })
  assert.equal(emptyObjects.status, 400)

  const longText = await call(`/exports/${freshId}/commit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ objects: [{ kind: 'global', text: 'a'.repeat(5001) }] }),
  })
  assert.equal(longText.status, 400)

  const notJson = await call(`/exports/${freshId}/commit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{nope',
  })
  assert.equal(notJson.status, 400)

  const unknown = await call('/nope')
  assert.equal(unknown.status, 404)

  // Clean removes our export directories and stray partial uploads, but leaves
  // files and folders it did not create.
  await writeFile(join(root, 'keep.txt'), 'keep')
  await mkdir(join(root, 'not-an-export'))
  await writeFile(join(root, 'design.png.999.part'), 'partial')
  const cleaned = await call('/exports/clean', { method: 'POST' })
  assert.equal(cleaned.status, 200)
  assert.ok(cleaned.body.removed >= 1, 'at least one export directory was removed')
  assert.ok(cleaned.body.bytes > 0, 'the freed byte count is reported')
  assert.deepEqual((await readdir(root)).sort(), ['keep.txt', 'not-an-export'])
  const gone = await stat(join(root, exportId)).then(
    () => true,
    () => false,
  )
  assert.equal(gone, false, 'the exported directory is gone')

  console.log('host route tests passed')
} finally {
  await new Promise((resolve) => server.close(resolve))
  await rm(home, { recursive: true, force: true })
}
