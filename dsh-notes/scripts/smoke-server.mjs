/** Fast cross-platform smoke test used by CI and release checks. */

import {
  assert,
  assertEqual,
  createAccount,
  createToken,
  makeTempDir,
  pngBuffer,
  request,
  startServer,
  uploadAttachment,
} from './lib/harness.mjs'

let server
try {
  const dataDir = await makeTempDir('smoke')
  await createAccount(dataDir, 'smoke')
  const token = await createToken(dataDir, 'smoke', { name: 'smoke' })
  server = await startServer({ dataDir })
  const health = await fetch(`${server.base}/healthz`)
  assertEqual(health.status, 200)
  const created = await request(server.base, '/api/notes', {
    method: 'POST', token, body: { title: 'Smoke', content: '# Smoke\n\nok' },
  })
  assertEqual(created.status, 201)
  const id = created.payload.note.id
  const upload = await uploadAttachment(server.base, token, id, 'pixel.png', 'image/png', pngBuffer())
  assertEqual(upload.status, 201)
  await server.stop()
  server = await startServer({ dataDir, port: server.port })
  const fetched = await request(server.base, `/api/notes/${id}`, { token })
  assertEqual(fetched.status, 200)
  assertEqual(fetched.payload.note.title, 'Smoke')
  assertEqual(fetched.payload.note.attachments.length, 1)
  console.log('smoke passed')
} catch (error) {
  console.error(error.stack ?? error)
  process.exitCode = 1
} finally {
  if (server !== undefined) await server.stop().catch(() => undefined)
}
process.exit(process.exitCode ?? 0)
