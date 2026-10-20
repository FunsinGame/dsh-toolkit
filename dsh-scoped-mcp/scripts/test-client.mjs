/**
 * Browser-half smoke test for dsh-scoped-mcp.
 *
 * Loads the real `lib/client.js` bundle in JSDOM through a fake
 * `window.__ModuleLoader__`, registers its activity entry and page in a fake
 * slot registry, renders the page against a mocked host API, and drives the
 * enable / stop / navigation controls. React itself comes from a sibling
 * checkout because this plugin bundle keeps React external.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

/** Find a usable React + JSDOM install in the surrounding checkouts. */
function locateDependencies() {
  const candidates = [
    'C:/g-workspace/deepseek-harness/dsh-toolkit/dsh-music-player/package.json',
    'C:/g-workspace/deepseek-harness/dsh-toolkit/dsh-sound-desk/package.json',
    join(root, 'package.json'),
  ]
  const jsdomCandidates = [
    'C:/g-workspace/deepseek-harness/dsh-toolkit/dsh-music-player/package.json',
    'C:/g-workspace/deepseek-harness/dsh-console/package.json',
    'C:/g-workspace/deepseek-harness/deepseek-harness-vscode/package.json',
  ]
  const reactRequire = candidates.map(path => createRequire(path)).find(req => {
    try {
      req.resolve('react')
      req.resolve('react-dom/client')
      return true
    } catch {
      return false
    }
  })
  const jsdomRequire = jsdomCandidates.map(path => createRequire(path)).find(req => {
    try {
      req.resolve('jsdom')
      return true
    } catch {
      return false
    }
  })
  return { reactRequire, jsdomRequire }
}

const { reactRequire, jsdomRequire } = locateDependencies()
const jsdomAvailable = reactRequire !== undefined && jsdomRequire !== undefined

test('browser bundle renders the MCP page and drives enable/stop', { skip: !jsdomAvailable && 'react/jsdom test dependencies not installed' }, async () => {
  const React = reactRequire('react')
  const { createRoot } = reactRequire('react-dom/client')
  const { JSDOM } = jsdomRequire('jsdom')
  const act = React.act ?? reactRequire('react-dom/test-utils').act

  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: 'http://127.0.0.1:3080/',
    pretendToBeVisual: true,
  })
  const { window } = dom
  window.confirm = () => true
  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    CustomEvent: window.CustomEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: callback => setTimeout(callback, 0),
    cancelAnimationFrame: handle => clearTimeout(handle),
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  const saved = {}
  for (const [key, value] of Object.entries(globals)) {
    saved[key] = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }

  /** Mutable host state the mocked API serves and mutates. */
  const state = {
    global: {
      key: 'global',
      kind: 'global',
      title: '全局配置',
      configPath: 'C:/Users/me/.dsh/mcp-scope.yml',
      configuredCount: 1,
      effectiveCount: 1,
      servers: [{
        serverName: 'github',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {},
        cwd: '',
        toolCallTimeoutMs: 60000,
        disabled: false,
        scope: 'global',
        state: 'disconnected',
        error: null,
        toolCount: 0,
        overridesGlobal: false,
      }],
    },
    workspaces: [{
      key: 'ws:a',
      id: 'a',
      kind: 'workspace',
      title: 'project-a',
      path: 'C:/work/project-a',
      configPath: 'C:/work/project-a/.dsh/mcp.yml',
      configuredCount: 1,
      effectiveCount: 2,
      servers: [{
        serverName: 'shared',
        transport: 'streamable-http',
        url: 'http://localhost:3000/mcp',
        headers: {},
        toolCallTimeoutMs: 60000,
        disabled: false,
        scope: 'workspace',
        state: 'connected',
        error: null,
        toolCount: 3,
        overridesGlobal: true,
      }],
    }],
  }

  const calls = []
  const response = (payload, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload },
  })
  const mockFetch = async (url, init = {}) => {
    const target = String(url)
    if (target.endsWith('/dsh-scoped-mcp/state')) return response({ ok: true, state })
    if (target.endsWith('/dsh-scoped-mcp/action')) {
      const body = JSON.parse(String(init.body))
      calls.push(body)
      if (body.action === 'enable') {
        const server = state.global.servers.find(item => item.serverName === body.serverName)
        server.state = 'connected'
        server.toolCount = 2
        return response({ ok: true, connected: true, toolCount: 2, error: null, state })
      }
      if (body.action === 'stop') {
        const server = state.workspaces[0].servers.find(item => item.serverName === body.serverName)
        server.state = 'disconnected'
        server.toolCount = 0
        return response({ ok: true, state })
      }
      return response({ ok: false, error: `unexpected action ${body.action}` }, 400)
    }
    return response({ ok: false, error: 'not found' }, 404)
  }
  Object.defineProperty(globalThis, 'fetch', { value: mockFetch, configurable: true, writable: true })

  // ── load the real bundle ────────────────────────────────────────────────
  let registration
  window.__ModuleLoader__ = { load(entry) { registration = entry } }
  const source = await readFile(join(root, 'lib', 'client.js'), 'utf8')
  // eslint-disable-next-line no-new-func
  new Function(source)()
  assert.equal(registration.id, 'dsh-scoped-mcp')
  const bundle = registration.factory(id => reactRequire(id))

  const registrations = []
  const slots = {
    inject(_name, callback) { callback() },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  }
  const ctx = {
    inject(_deps, callback) { callback({ slots }) },
  }
  bundle.apply(ctx)

  const rail = registrations.find(entry => entry.options.name === 'shell.activitybar.items')
  const page = registrations.find(entry => entry.options.name === 'shell.activity')
  assert.equal(rail.options.id, 'dsh-scoped-mcp')
  assert.equal(page.options.key, 'dsh-scoped-mcp')

  // ── render ──────────────────────────────────────────────────────────────
  const container = window.document.getElementById('root')
  const reactRoot = createRoot(container)
  const text = () => container.textContent
  const buttons = () => [...container.querySelectorAll('button')]
  const buttonByText = (label) => buttons().find(button => button.textContent === label)

  try {
    await act(async () => {
      reactRoot.render(React.createElement(page.component))
      await new Promise(resolve => setTimeout(resolve, 20))
    })

    assert.match(text(), /全局配置/)
    assert.match(text(), /project-a/)
    assert.match(text(), /github/)
    assert.match(text(), /未连接/)

    assert.ok(buttonByText('启用'), 'a disconnected server offers 启用')

    await act(async () => {
      buttonByText('启用').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    assert.deepEqual(calls.at(-1), { action: 'enable', scope: { kind: 'global' }, serverName: 'github' })
    assert.match(text(), /已连接「github」，发现 2 个工具/)
    assert.match(text(), /已连接/)
    assert.ok(buttonByText('停止'), 'a connected server offers 停止')

    // Switch to the workspace scope and stop its server.
    const workspaceButton = buttons().find(button => button.textContent.includes('project-a'))
    assert.ok(workspaceButton)
    await act(async () => {
      workspaceButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    assert.match(text(), /覆盖全局同名/)
    assert.match(text(), /3 个工具/)
    assert.match(text(), /本页列出这个工作区自己的 1 个 MCP/)

    await act(async () => {
      buttonByText('停止').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    assert.deepEqual(calls.at(-1), { action: 'stop', scope: { kind: 'workspace', workspaceId: 'a' }, serverName: 'shared' })
    assert.match(text(), /已停止「shared」/)
    assert.ok(buttonByText('启用'), 'a stopped server offers 启用 again')
  } finally {
    await act(async () => {
      reactRoot.unmount()
      await new Promise(resolve => setTimeout(resolve, 10))
    })
    dom.window.close()
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor === undefined) delete globalThis[key]
      else Object.defineProperty(globalThis, key, descriptor)
    }
  }
})
