/**
 * DSH host plugin tests: real remote server, real local cache and sync engine,
 * a fake Cordis context, direct tool execution and same-origin host routes.
 */

import { createServer } from 'node:http'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  assert,
  assertEqual,
  createAccount,
  createToken,
  libEntry,
  makeTempDir,
  pngBuffer,
  request,
  startServer,
  waitFor,
} from './lib/harness.mjs'

let remote
let routeServer
let host
const effects = []

async function step(name, fn) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

try {
  const serverDir = await makeTempDir('host-server')
  await createAccount(serverDir, 'alice')
  const token = await createToken(serverDir, 'alice', { name: 'host' })
  remote = await startServer({ dataDir: serverDir })
  const seeded = await request(remote.base, '/api/notes', {
    method: 'POST', token, body: { title: 'Server seed', content: 'seed content' },
  })
  const seededId = seeded.payload.note.id

  const dshHome = await makeTempDir('host-home')
  await mkdir(join(dshHome, 'notes'), { recursive: true })
  await writeFile(join(dshHome, 'notes', 'settings.json'), JSON.stringify({
    serverUrl: remote.base,
    token,
    autoSyncSeconds: 3600,
    quickSync: false,
  }), 'utf8')
  process.env.DSH_HOME = dshHome

  const routes = new Map()
  const tools = new Map()
  const ctx = {
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    effect(factory) {
      const dispose = factory()
      effects.push(dispose)
      return dispose
    },
    inject(_deps, callback) {
      const child = {
        ...ctx,
        webServer: {
          register(route) {
            routes.set(route.path, route.handler)
            return () => routes.delete(route.path)
          },
        },
        connection: { requestRejection: () => undefined },
      }
      callback(child)
    },
    tools: { register(definition) { tools.set(definition.name, definition) } },
  }

  const module = await import(pathToFileURL(libEntry).href)
  module.apply(ctx, {})

  await step('host registers tools and a same-origin route without listening', async () => {
    assert(routes.has('/dsh-notes'), 'host route')
    assert(tools.size >= 20, `tool count ${tools.size}`)
    for (const name of ['notes_tree', 'notes_get', 'notes_create', 'notes_update', 'notes_sync', 'attachments_add']) {
      assert(tools.has(name), `missing tool ${name}`)
    }
    const definition = tools.get('notes_create')
    assert(typeof definition.output.schema === 'object', 'output schema')
    assert(typeof definition.output.render === 'function', 'output render')
  })

  const handler = routes.get('/dsh-notes')
  routeServer = createServer((req, res) => { void handler(req, res) })
  await new Promise((resolveListen) => routeServer.listen(0, '127.0.0.1', resolveListen))
  const routePort = routeServer.address().port
  const routeBase = `http://127.0.0.1:${routePort}/dsh-notes`
  const routeJson = async (path, init) => {
    const response = await fetch(routeBase + path, init)
    return { status: response.status, payload: await response.json().catch(() => null) }
  }

  await step('initial sync pulls the server note', async () => {
    await waitFor(async () => {
      const state = await routeJson('/state')
      return state.payload?.state?.sync?.state === 'idle' && state.payload.state.counts.notes >= 1
    }, { label: 'initial host sync' })
    const response = await routeJson('/tree')
    assert(response.payload.tree.notes.some((note) => note.id === seededId), 'seeded note')
  })

  await step('host state and settings routes', async () => {
    const state = await routeJson('/state')
    assertEqual(state.payload.state.configured, true)
    assertEqual(state.payload.state.settings.hasToken, true)
    assertEqual(state.payload.state.settings.serverUrl, remote.base)
    const settings = await routeJson('/settings')
    assertEqual(settings.payload.settings.serverUrl, remote.base)
    const test = await routeJson('/settings/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    assertEqual(test.payload.ok, true)
    assert(test.payload.message.includes('alice'), 'test connection message')
  })

  let hostNoteId
  await step('notes_create writes locally and notes_sync pushes', async () => {
    const created = await tools.get('notes_create').execute({ title: 'Host note', content: '# Host' })
    hostNoteId = created.note.id
    const sync = await tools.get('notes_sync').execute({})
    assertEqual(sync.sync.state, 'idle')
    const remoteNote = await request(remote.base, `/api/notes/${hostNoteId}`, { token })
    assertEqual(remoteNote.status, 200)
    assertEqual(remoteNote.payload.note.title, 'Host note')
  })

  await step('attachments_add uploads through the host and updates cache', async () => {
    const result = await tools.get('attachments_add').execute({
      noteId: hostNoteId,
      filename: 'host.png',
      mimeType: 'image/png',
      base64: pngBuffer().toString('base64'),
    })
    assert(result.attachment?.id !== undefined, 'attachment result')
    const remoteNote = await request(remote.base, `/api/notes/${hostNoteId}`, { token })
    assert(remoteNote.payload.note.attachments.some((item) => item.id === result.attachment.id), 'remote attachment')
    const local = await routeJson(`/notes/${hostNoteId}`)
    assert(local.payload.note.attachments.some((item) => item.id === result.attachment.id), 'local attachment')
  })

  await step('offline edit stays local and syncs after reconnect', async () => {
    const previousPort = remote.port
    await remote.stop()
    const updated = await tools.get('notes_update').execute({
      id: hostNoteId,
      content: '# Host\n\noffline edit',
    })
    assertEqual(updated.note.content, '# Host\n\noffline edit')
    const state = await routeJson('/state')
    assert(state.payload.state.sync.pending >= 1, 'pending after offline edit')
    const failed = await tools.get('notes_sync').execute({})
    assert(failed.sync.state === 'offline' || failed.sync.state === 'error' || failed.sync.state === 'pending', `offline state ${failed.sync.state}`)
    remote = await startServer({ dataDir: serverDir, port: previousPort })
    const synced = await tools.get('notes_sync').execute({})
    assertEqual(synced.sync.pending, 0)
    const remoteNote = await request(remote.base, `/api/notes/${hostNoteId}`, { token })
    assert(remoteNote.payload.note.content.includes('offline edit'), 'offline edit pushed')
  })

  await step('server-side change plus local edit produces a conflict', async () => {
    const current = await request(remote.base, `/api/notes/${hostNoteId}`, { token })
    const serverUpdate = await request(remote.base, `/api/notes/${hostNoteId}`, {
      method: 'PATCH', token, body: { baseRevision: current.payload.note.revision, content: 'server changed this' },
    })
    assertEqual(serverUpdate.status, 200)
    await tools.get('notes_update').execute({ id: hostNoteId, content: 'local changed this' })
    const synced = await tools.get('notes_sync').execute({})
    assert(synced.sync.conflicts >= 1, 'conflict detected')
    const conflicts = await routeJson('/conflicts')
    const conflict = conflicts.payload.conflicts.find((item) => item.noteId === hostNoteId)
    assert(conflict !== undefined, 'conflict list entry')
    const detail = await routeJson(`/conflicts/${hostNoteId}`)
    assertEqual(detail.payload.conflict.serverContent, 'server changed this')
    assertEqual(detail.payload.conflict.localContent, 'local changed this')
  })

  await step('resolve conflict by keeping local and push it', async () => {
    const resolved = await routeJson(`/conflicts/${hostNoteId}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ strategy: 'local' }),
    })
    assertEqual(resolved.payload.ok, true)
    await tools.get('notes_sync').execute({})
    const remoteNote = await request(remote.base, `/api/notes/${hostNoteId}`, { token })
    assertEqual(remoteNote.payload.note.content, 'local changed this')
  })

  await step('resolve conflict by keeping server content', async () => {
    const current = await request(remote.base, `/api/notes/${hostNoteId}`, { token })
    await request(remote.base, `/api/notes/${hostNoteId}`, {
      method: 'PATCH', token, body: { baseRevision: current.payload.note.revision, content: 'server wins' },
    })
    await tools.get('notes_update').execute({ id: hostNoteId, content: 'local loses' })
    await tools.get('notes_sync').execute({})
    const conflicts = await routeJson('/conflicts')
    assert(conflicts.payload.conflicts.some((item) => item.noteId === hostNoteId), 'second conflict')
    await routeJson(`/conflicts/${hostNoteId}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ strategy: 'server' }),
    })
    const local = await routeJson(`/notes/${hostNoteId}`)
    assertEqual(local.payload.note.content, 'server wins')
  })

  await step('tools list/search/delete/restore work through the cache', async () => {
    const search = await tools.get('notes_search').execute({ q: 'server wins' })
    assert(search.results.some((item) => item.note.id === hostNoteId), 'search')
    await tools.get('notes_delete').execute({ id: hostNoteId })
    await tools.get('notes_sync').execute({})
    const trash = await waitFor(async () => {
      const response = await routeJson('/trash')
      return response.payload?.notes?.some((note) => note.id === hostNoteId) ? response : false
    }, { timeoutMs: 8000, label: 'deleted note in trash' })
    assert(trash.payload.notes.some((note) => note.id === hostNoteId), 'trash')
    await tools.get('notes_restore').execute({ id: hostNoteId })
    await tools.get('notes_sync').execute({})
    const restored = await waitFor(async () => {
      const response = await routeJson(`/notes/${hostNoteId}`)
      return response.status === 200 ? response : false
    }, { timeoutMs: 8000, label: 'restored note' })
    assertEqual(restored.status, 200)
  })

  await step('periodic sync pushes an edit without a manual sync call', async () => {
    const settings = await routeJson('/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ autoSyncSeconds: 5, quickSync: false }),
    })
    assertEqual(settings.payload.ok, true)
    await tools.get('notes_update').execute({ id: hostNoteId, content: 'auto timer edit' })
    const remoteNote = await waitFor(async () => {
      const response = await request(remote.base, `/api/notes/${hostNoteId}`, { token })
      return response.payload?.note?.content === 'auto timer edit' ? response : false
    }, { timeoutMs: 15000, intervalMs: 500, label: 'periodic sync' })
    assertEqual(remoteNote.payload.note.content, 'auto timer edit')
  })

  console.log('\nhost tests passed')
} catch (error) {
  console.error(error.stack ?? error)
  process.exitCode = 1
} finally {
  for (const dispose of effects.reverse()) {
    try { await dispose?.() } catch { /* ignore */ }
  }
  if (routeServer !== undefined) await new Promise((resolveClose) => routeServer.close(resolveClose))
  if (remote !== undefined) await remote.stop().catch(() => undefined)
  await rm(join(process.cwd(), 'tmp', 'tests'), { recursive: true, force: true }).catch(() => undefined)
}
process.exit(process.exitCode ?? 0)
