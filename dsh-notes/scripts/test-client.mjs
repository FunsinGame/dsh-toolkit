/**
 * DSH browser-half test: load the real client bundle in jsdom, register it with
 * a fake slot host, render the activity page against the real host routes, and
 * verify the tree/editor render and interact.
 */

import { createServer } from 'node:http'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'
import React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import { createRoot } from 'react-dom/client'
import {
  assert,
  assertEqual,
  clientBundle,
  createAccount,
  createToken,
  libEntry,
  makeTempDir,
  request,
  startServer,
  waitFor,
} from './lib/harness.mjs'

let remote
let routeServer
let reactRoot
let dom
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
  const serverDir = await makeTempDir('client-server')
  await createAccount(serverDir, 'alice')
  const token = await createToken(serverDir, 'alice', { name: 'client' })
  remote = await startServer({ dataDir: serverDir })
  const created = await request(remote.base, '/api/notes', {
    method: 'POST', token, body: { title: 'Client note', content: '# Client\n\nrendered in jsdom' },
  })
  const noteId = created.payload.note.id

  const dshHome = await makeTempDir('client-home')
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
        webServer: { register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) } },
        connection: { requestRejection: () => undefined },
      }
      callback(child)
    },
    tools: { register(definition) { tools.set(definition.name, definition) } },
  }
  const hostModule = await import(pathToFileURL(libEntry).href)
  hostModule.apply(ctx, {})
  const handler = routes.get('/dsh-notes')
  routeServer = createServer((req, res) => { void handler(req, res) })
  await new Promise((resolveListen) => routeServer.listen(0, '127.0.0.1', resolveListen))
  const hostPort = routeServer.address().port
  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${hostPort}/dsh-notes/state`)
    const payload = await response.json()
    return payload.state.sync.state === 'idle' && payload.state.counts.notes >= 1
  }, { label: 'client host sync' })

  const clientCode = await readFile(clientBundle, 'utf8')
  const pageErrors = []
  dom = new JSDOM('<!doctype html><html><head></head><body><div id="dsh-notes-root"></div></body></html>', {
    url: `http://127.0.0.1:${hostPort}/`,
    pretendToBeVisual: true,
  })
  const { window } = dom
  global.window = window
  global.document = window.document
  global.HTMLElement = window.HTMLElement
  global.Element = window.Element
  global.Node = window.Node
  global.localStorage = window.localStorage
  global.MutationObserver = window.MutationObserver
  global.getComputedStyle = window.getComputedStyle
  window.console = console
  window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0)
  window.cancelAnimationFrame = (id) => clearTimeout(id)
  window.fetch = global.fetch
  window.addEventListener('error', (event) => pageErrors.push(event.error ?? event.message))

  const registrations = []
  let clientExports = null
  window.__ModuleLoader__ = {
    load({ factory }) {
      const module = { exports: {} }
      const require = (spec) => {
        if (spec === 'react') return React
        if (spec === 'react/jsx-runtime') return ReactJsxRuntime
        if (spec === 'react-dom') return ReactDOM
        throw new Error(`unexpected require ${spec}`)
      }
      clientExports = factory(require) ?? module.exports
    },
  }
  window.eval(clientCode)
  assert(clientExports !== null && typeof clientExports.apply === 'function', 'client apply export')
  const clientCtx = {
    effect(factory) { return factory() },
    inject(_deps, callback) {
      const child = {
        ...clientCtx,
        slots: {
          inject(_slot, callbackSlot) { callbackSlot() },
          register(options, component) { registrations.push({ options, component }); return () => {} },
        },
      }
      callback(child)
    },
  }
  clientExports.apply(clientCtx)

  await step('client registers the activity bar item and page', async () => {
    assertEqual(registrations.length, 2)
    assert(registrations.some((item) => item.options.name === 'shell.activitybar.items' && item.options.id === 'notes'), 'activity item')
    assert(registrations.some((item) => item.options.name === 'shell.activity' && item.options.key === 'notes'), 'activity page')
  })

  const pageRegistration = registrations.find((item) => item.options.name === 'shell.activity')
  const container = window.document.getElementById('dsh-notes-root')
  reactRoot = createRoot(container)
  reactRoot.render(React.createElement(pageRegistration.component))
  await waitFor(() => container.querySelectorAll('.dsh-notes-tree-row').length > 0, { label: 'client tree render' })
  await new Promise((resolveWait) => setTimeout(resolveWait, 500))

  await step('page renders tree, editor and preview', async () => {
    assert(container.querySelector('.dsh-notes-sidebar') !== null, 'sidebar')
    assert(container.querySelector('textarea.dsh-notes-textarea') !== null, 'textarea')
    assert(container.textContent.includes('Client note'), 'note title')
    assert(container.textContent.includes('Client'), 'note content')
    assert(container.querySelectorAll('.dsh-notes-tree-row').length >= 1, 'tree rows')
    assert(container.querySelector('.dsh-notes-sync-pill') !== null, 'sync pill')
  })

  await step('clicking a tree note opens it', async () => {
    const rows = container.querySelectorAll('.dsh-notes-tree-row')
    const target = Array.from(rows).find((row) => (row.textContent ?? '').includes('Client note'))
    assert(target !== undefined, 'note row')
    target.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await waitFor(() => (container.querySelector('textarea.dsh-notes-textarea')?.value ?? '').includes('rendered in jsdom'), { label: 'note opens' })
  })

  await step('no uncaught render errors', async () => {
    assertEqual(pageErrors.length, 0, `page errors: ${pageErrors.map(String).join('; ')}`)
  })

  console.log('\nclient tests passed')
} catch (error) {
  console.error(error.stack ?? error)
  process.exitCode = 1
} finally {
  try { reactRoot?.unmount() } catch { /* ignore */ }
  for (const dispose of effects.reverse()) {
    try { await dispose?.() } catch { /* ignore */ }
  }
  if (routeServer !== undefined) await new Promise((resolveClose) => routeServer.close(resolveClose))
  if (remote !== undefined) await remote.stop().catch(() => undefined)
  try { dom?.window?.close() } catch { /* ignore */ }
}
process.exit(process.exitCode ?? 0)
