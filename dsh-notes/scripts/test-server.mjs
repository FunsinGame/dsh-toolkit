/** API and persistence integration tests against a real notes server process. */

import {
  assert,
  assertEqual,
  createAccount,
  createToken,
  login,
  makeTempDir,
  pngBuffer,
  request,
  startServer,
  uploadAttachment,
  wavBuffer,
} from './lib/harness.mjs'

const dataDir = await makeTempDir('server')
let server
let passed = 0

async function step(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

try {
  await createAccount(dataDir, 'alice')
  const token = await createToken(dataDir, 'alice', { name: 'server-test' })
  server = await startServer({ dataDir })
  const base = server.base

  await step('unauthenticated API is rejected', async () => {
    const response = await request(base, '/api/tree')
    assertEqual(response.status, 401, 'unauthenticated tree')
  })

  await step('health and session expose the token user', async () => {
    const health = await request(base, '/api/health', { token })
    assertEqual(health.status, 200)
    assert(health.payload.server.version === '0.1.0', 'version')
    const session = await request(base, '/api/auth/session', { token })
    assertEqual(session.payload.user.username, 'alice')
    assertEqual(session.payload.auth.kind, 'token')
    assert(session.payload.auth.scopes.includes('write'), 'write scope')
  })

  await step('cookie login requires CSRF header', async () => {
    const result = await login(base, 'alice', 'correct-horse-battery-1')
    assertEqual(result.status, 200)
    assert(result.cookie.startsWith('dsh_notes_session='), 'session cookie')
    const noCsrf = await fetch(`${base}/api/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: result.cookie },
      body: JSON.stringify({ title: 'no csrf', content: 'x' }),
    })
    assertEqual(noCsrf.status, 403, 'missing CSRF header')
    const tree = await request(base, '/api/tree', { cookie: result.cookie })
    assertEqual(tree.status, 200)
  })

  await step('wrong password is rejected', async () => {
    const result = await login(base, 'alice', 'wrong-password-123')
    assertEqual(result.status, 401)
  })

  await step('account registration endpoint is absent', async () => {
    const response = await request(base, '/api/register', { method: 'POST', token, body: {} })
    assertEqual(response.status, 404)
    const users = await request(base, '/api/users', { method: 'POST', token, body: {} })
    assertEqual(users.status, 404)
  })

  let folder
  await step('create folder', async () => {
    const response = await request(base, '/api/folders', {
      method: 'POST', token, body: { name: 'Projects' },
    })
    assertEqual(response.status, 201)
    folder = response.payload.folder
    assert(folder.id.length > 0, 'folder id')
  })

  let note
  await step('create note', async () => {
    const response = await request(base, '/api/notes', {
      method: 'POST', token, body: {
        folderId: folder.id,
        title: 'First note',
        content: '# Hello\n\nworld',
        tags: ['test', 'notes'],
        opId: 'create-1',
      },
    })
    assertEqual(response.status, 201)
    note = response.payload.note
    assertEqual(note.revision, 1)
    assertEqual(note.folderId, folder.id)
    assertEqual(note.tags.length, 2)
  })

  await step('create is idempotent by opId', async () => {
    const response = await request(base, '/api/notes', {
      method: 'POST', token, body: {
        id: note.id, folderId: folder.id, title: 'First note', content: '# Hello\n\nworld', opId: 'create-1',
      },
    })
    assertEqual(response.status, 201)
    assertEqual(response.payload.note.id, note.id)
    assertEqual(response.payload.note.revision, 1)
  })

  await step('update requires the current revision', async () => {
    const update = await request(base, `/api/notes/${note.id}`, {
      method: 'PATCH', token, body: { baseRevision: 1, content: '# Hello\n\nupdated' },
    })
    assertEqual(update.status, 200)
    assertEqual(update.payload.note.revision, 2)
    note = update.payload.note
    const stale = await request(base, `/api/notes/${note.id}`, {
      method: 'PATCH', token, body: { baseRevision: 1, content: 'stale write' },
    })
    assertEqual(stale.status, 409)
    assertEqual(stale.payload.error.code, 'REVISION_CONFLICT')
    assertEqual(stale.payload.current.revision, 2)
  })

  await step('search finds title and body', async () => {
    const byTitle = await request(base, '/api/search?q=First', { token })
    assertEqual(byTitle.status, 200)
    assert(byTitle.payload.results.some((result) => result.note.id === note.id), 'title search')
    const byBody = await request(base, '/api/search?q=updated', { token })
    assert(byBody.payload.results.some((result) => result.note.id === note.id), 'body search')
  })

  await step('versions and revert', async () => {
    const versions = await request(base, `/api/notes/${note.id}/versions`, { token })
    assertEqual(versions.status, 200)
    assert(versions.payload.versions.length >= 1, 'versions')
    const version = versions.payload.versions.find((item) => item.revision === 1)
    assert(version !== undefined, 'version 1')
    const detail = await request(base, `/api/notes/${note.id}/versions/1`, { token })
    assertEqual(detail.payload.version.content, '# Hello\n\nworld')
    const reverted = await request(base, `/api/notes/${note.id}/revert`, {
      method: 'POST', token, body: { revision: 1 },
    })
    assertEqual(reverted.status, 200)
    assertEqual(reverted.payload.note.content, '# Hello\n\nworld')
    note = reverted.payload.note
  })

  let image
  let audio
  await step('upload image and audio attachments', async () => {
    const imageResult = await uploadAttachment(base, token, note.id, 'pixel.png', 'image/png', pngBuffer())
    assertEqual(imageResult.status, 201)
    image = imageResult.payload.attachment
    assertEqual(image.mime, 'image/png')
    assert(imageResult.payload.markdown.includes(image.id), 'markdown link')
    const audioResult = await uploadAttachment(base, token, note.id, 'tone.wav', 'audio/wav', wavBuffer())
    assertEqual(audioResult.status, 201)
    audio = audioResult.payload.attachment
    assertEqual(audio.mime, 'audio/wav')
    const list = await request(base, `/api/notes/${note.id}/attachments`, { token })
    assertEqual(list.payload.attachments.length, 2)
  })

  await step('attachment download supports range', async () => {
    const full = await fetch(`${base}/api/attachments/${image.id}`, { headers: { authorization: `Bearer ${token}` } })
    assertEqual(full.status, 200)
    assertEqual(full.headers.get('content-type'), 'image/png')
    const bytes = Buffer.from(await full.arrayBuffer())
    assertEqual(bytes.length, image.size)
    const partial = await fetch(`${base}/api/attachments/${image.id}`, {
      headers: { authorization: `Bearer ${token}`, range: 'bytes=0-9' },
    })
    assertEqual(partial.status, 206)
    assertEqual((await partial.arrayBuffer()).byteLength, 10)
  })

  await step('rejects mismatch between declared type and bytes', async () => {
    const result = await uploadAttachment(base, token, note.id, 'bad.png', 'image/png', Buffer.from('<html>not an image</html>'))
    assertEqual(result.status, 415)
  })

  await step('changes and bootstrap are consistent', async () => {
    const changes = await request(base, '/api/changes?since=0', { token })
    assertEqual(changes.status, 200)
    assert(changes.payload.cursor > 0, 'cursor')
    assert(changes.payload.changes.some((change) => change.entity === 'note' && change.id === note.id), 'note change')
    const bootstrap = await request(base, '/api/sync/bootstrap', { token })
    assertEqual(bootstrap.status, 200)
    assert(bootstrap.payload.notes.some((item) => item.id === note.id), 'bootstrap note')
    assert(bootstrap.payload.attachments.length === 2, 'bootstrap attachments')
  })

  await step('export returns markdown', async () => {
    const response = await fetch(`${base}/api/export/note/${note.id}.md`, { headers: { authorization: `Bearer ${token}` } })
    assertEqual(response.status, 200)
    const text = await response.text()
    assert(text.includes('# Hello'), 'export title')
  })

  await step('trash, restore and permanent delete', async () => {
    const deleted = await request(base, `/api/notes/${note.id}`, { method: 'DELETE', token })
    assertEqual(deleted.status, 200)
    const trash = await request(base, '/api/trash', { token })
    assert(trash.payload.notes.some((item) => item.id === note.id), 'trash contains note')
    const missing = await request(base, `/api/notes/${note.id}`, { token })
    assertEqual(missing.status, 404)
    const restored = await request(base, `/api/notes/${note.id}/restore`, { method: 'POST', token })
    assertEqual(restored.status, 200)
    assertEqual(restored.payload.note.id, note.id)
    const deleteAttachment = await request(base, `/api/attachments/${audio.id}`, { method: 'DELETE', token })
    assertEqual(deleteAttachment.status, 200)
    const deleteAgain = await request(base, `/api/notes/${note.id}`, { method: 'DELETE', token })
    assertEqual(deleteAgain.status, 200)
    const permanent = await request(base, `/api/notes/${note.id}?permanent=1`, { method: 'DELETE', token })
    assertEqual(permanent.status, 200)
    const gone = await request(base, `/api/notes/${note.id}`, { token })
    assertEqual(gone.status, 404)
  })

  await step('server restart preserves data', async () => {
    const created = await request(base, '/api/notes', {
      method: 'POST', token, body: { title: 'Persistent', content: 'survives restart' },
    })
    assertEqual(created.status, 201)
    const id = created.payload.note.id
    await server.stop()
    server = await startServer({ dataDir, port: server.port })
    const fetched = await request(server.base, `/api/notes/${id}`, { token })
    assertEqual(fetched.status, 200)
    assertEqual(fetched.payload.note.content, 'survives restart')
  })

  console.log(`\n${passed} server tests passed`)
} catch (error) {
  console.error(error.stack ?? error)
  process.exitCode = 1
} finally {
  if (server !== undefined) await server.stop().catch(() => undefined)
}
process.exit(process.exitCode ?? 0)
