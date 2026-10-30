/**
 * dsh-feishu-bot 浏览器半侧测试。
 *
 * 不启动真实浏览器：用一个极小的 React 桩执行组件函数，检查它渲染出的元素树，
 * 并验证 `apply` 把活动栏入口、页面与 bundle 配置卡片注册到了正确的 slot 上。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

/** 极小的 React 桩：足够执行一次无状态渲染。 */
function createReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat(Number.POSITIVE_INFINITY) }
    },
    useCallback(fn) {
      return fn
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
    useEffect() {},
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot()
    },
  }
}

/** 把元素树里的字符串收集起来，便于断言文案。 */
function textsOf(node, out = []) {
  if (node === null || node === undefined) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) textsOf(child, out)
    return out
  }
  if (typeof node === 'object' && node.children !== undefined) {
    // 函数组件（例如页面里内嵌的面板）在这里展开渲染，模拟 React 的组合行为。
    if (typeof node.type === 'function') {
      textsOf(node.type(node.props), out)
      return out
    }
    for (const child of node.children) textsOf(child, out)
  }
  return out
}

/** 等待 lib/client.js 登记工厂（模块只执行一次，结果缓存）。 */
let cachedEntry
async function loadClient() {
  if (cachedEntry !== undefined) return cachedEntry
  const captured = []
  globalThis.window = {
    __ModuleLoader__: {
      load(registered) {
        captured.push(registered)
      },
    },
  }
  await import('../lib/client.js')
  assert.equal(captured.length, 1, 'lib/client.js should register exactly one module')
  cachedEntry = captured[0]
  return cachedEntry
}

/** 假翻译函数：把命名空间带上，便于断言。 */
function translate(key) {
  return `feishuBot.${key}`
}

/** 构造 apply 需要的最小上下文，并记录注册行为。 */
function createHost(form) {
  const record = {
    services: undefined,
    entryId: undefined,
    ns: undefined,
    locales: undefined,
    slotInjects: [],
    registrations: [],
    layoutRequests: 0,
    opened: undefined,
  }
  const effect = (fn) => {
    const dispose = fn()
    return typeof dispose === 'function' ? dispose : () => {}
  }
  const child = {
    configForms: {
      get(id) {
        record.entryId = id
        return form
      },
    },
    locale: {
      register(ns, locales) {
        record.ns = ns
        record.locales = locales
        return () => {}
      },
      bind(ns) {
        return key => `${ns}.${key}`
      },
    },
    effect,
    slots: {
      inject(name, register) {
        record.slotInjects.push(name)
        register()
      },
      register(options, component) {
        record.registrations.push({ options, component })
        return () => {}
      },
    },
  }
  const ctx = {
    inject(services, callback) {
      record.services = services
      if (services.includes('layout')) {
        record.layoutRequests += 1
        callback({
          layout: {
            selectActivity(id) {
              record.opened = id
            },
          },
          effect,
        })
        return
      }
      callback(child)
    },
  }
  return { ctx, record }
}

function readyForm(value = {}) {
  return {
    status: 'ready',
    subscribe: () => () => {},
    getSnapshot: () => ({ status: 'ready', value, writable: true, revision: 2 }),
    set: async () => true,
    unset: async () => true,
  }
}

/** 按 slot 名找一条注册。 */
function registrationOf(record, name) {
  return record.registrations.find(entry => entry.options.name === name)
}

test('client: 以包名登记工厂并导出 apply', async () => {
  const entry = await loadClient()
  assert.equal(entry.id, 'dsh-feishu-bot')
  assert.equal(typeof entry.factory, 'function')
  const exportsObject = entry.factory(() => createReact())
  assert.equal(typeof exportsObject.apply, 'function')
})

test('client: 注册活动栏入口、页面、bundle 配置卡片与状态栏条目', async () => {
  const entry = await loadClient()
  const exportsObject = entry.factory(() => createReact())
  const form = readyForm({ enabled: true, appId: 'cli_x' })
  const { ctx, record } = createHost(form)
  exportsObject.apply(ctx)

  assert.deepEqual(record.services, ['slots', 'locale', 'configForms'])
  assert.equal(record.layoutRequests, 1)
  assert.equal(record.entryId, 'feishu-bot')
  assert.equal(record.ns, 'feishuBot')
  assert.ok(record.locales.zh !== undefined && record.locales.en !== undefined)
  assert.deepEqual(record.slotInjects, ['shell.activitybar.items', 'shell.activity', 'plugins.bundle.config', 'shell.statusbar.right'])

  const item = registrationOf(record, 'shell.activitybar.items')
  assert.equal(item.options.id, 'feishu-bot')
  assert.equal(item.options.order, 130)
  assert.equal(item.options.label(), 'feishuBot.panel')
  assert.equal(typeof item.component, 'function')

  const view = registrationOf(record, 'shell.activity')
  assert.equal(view.options.key, 'feishu-bot')
  assert.equal(view.options.locale, 'feishuBot')
  assert.deepEqual(view.options.inject(), { form })
  assert.equal(typeof view.component, 'function')

  const card = registrationOf(record, 'plugins.bundle.config')
  assert.equal(card.options.key, 'dsh-feishu-bot')
  assert.equal(card.options.locale, 'feishuBot')
  assert.deepEqual(card.options.inject(), { form })
  assert.equal(typeof card.component, 'function')

  const status = registrationOf(record, 'shell.statusbar.right')
  assert.equal(status.options.id, 'feishu-bot')
  assert.equal(status.options.order, 100)
  assert.equal(status.options.locale, 'feishuBot')
  const injected = status.options.inject()
  assert.equal(injected.form, form)
  assert.equal(typeof injected.openPage, 'function')
  assert.equal(typeof status.component, 'function')
})

test('client: 状态栏状态映射', async () => {
  const entry = await loadClient()
  const exportsObject = entry.factory(() => createReact())
  const resolve = exportsObject.resolveStatus
  assert.equal(typeof resolve, 'function')
  const t = translate
  assert.deepEqual(resolve(false, { bridge: 'connected' }, t), { key: 'off', label: 'feishuBot.statusOff', tone: 'idle' })
  assert.deepEqual(resolve(true, { bridge: 'connected' }, t), { key: 'on', label: 'feishuBot.statusOn', tone: 'ok' })
  assert.deepEqual(resolve(true, { bridge: 'connecting' }, t), { key: 'connecting', label: 'feishuBot.statusConnecting', tone: 'warn' })
  assert.deepEqual(resolve(true, { bridge: 'error' }, t), { key: 'failed', label: 'feishuBot.statusFailed', tone: 'bad' })
  assert.deepEqual(resolve(true, { bridge: 'stopped' }, t), { key: 'notReady', label: 'feishuBot.statusNotReady', tone: 'warn' })
  assert.deepEqual(resolve(true, null, t), { key: 'connecting', label: 'feishuBot.statusConnecting', tone: 'warn' })
})

test('client: 状态栏条目渲染开关与连接状态', async () => {
  const entry = await loadClient()
  const exportsObject = entry.factory(() => createReact())

  const offForm = readyForm({ enabled: false, appId: 'cli_x' })
  const offHost = createHost(offForm)
  exportsObject.apply(offHost.ctx)
  const offItem = registrationOf(offHost.record, 'shell.statusbar.right').component
  const offTree = offItem({ form: offForm, t: translate, openPage: () => {} })
  assert.equal(offTree.type, 'button')
  assert.equal(offTree.props['data-feishu-status'], 'off')
  assert.equal(offTree.props['aria-pressed'], false)
  const offTexts = textsOf(offTree).join(' ')
  assert.match(offTexts, /feishuBot\.statusLabel/u)
  assert.match(offTexts, /feishuBot\.statusOff/u)
  assert.match(offTree.props.title, /feishuBot\.statusHintOff/u)

  const onForm = readyForm({ enabled: true, appId: 'cli_x' })
  const onHost = createHost(onForm)
  exportsObject.apply(onHost.ctx)
  const onItem = registrationOf(onHost.record, 'shell.statusbar.right').component
  const onTree = onItem({ form: onForm, t: translate, openPage: () => {} })
  assert.equal(onTree.props['data-feishu-status'], 'connecting')
  assert.match(onTree.props.title, /feishuBot\.statusHintOn/u)
})

test('client: 未就绪时点一键开启会跳到插件页而不是硬开', async () => {
  const entry = await loadClient()
  const exportsObject = entry.factory(() => createReact())
  const form = readyForm({ enabled: false, appId: '' })
  const { ctx, record } = createHost(form)
  exportsObject.apply(ctx)
  const item = registrationOf(record, 'shell.statusbar.right').component
  let opened = 0
  const tree = item({ form, t: translate, openPage: () => { opened += 1 } })
  tree.props.onClick()
  await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(opened, 1)
})

test('client: 已开启时点一下会写回 enabled=false', async () => {
  const entry = await loadClient()
  const exportsObject = entry.factory(() => createReact())
  const writes = []
  const form = {
    ...readyForm({ enabled: true, appId: 'cli_x' }),
    set: async (field, next) => {
      writes.push([field, next])
      return true
    },
  }
  const { ctx, record } = createHost(form)
  exportsObject.apply(ctx)
  const item = registrationOf(record, 'shell.statusbar.right').component
  const tree = item({ form, t: translate, openPage: () => {} })
  tree.props.onClick()
  await new Promise(resolve => setTimeout(resolve, 5))
  assert.deepEqual(writes, [['enabled', false]])
})

test('client: 词典覆盖组件用到的键', async () => {
  const entry = await loadClient()
  const exportsObject = entry.factory(() => createReact())
  const form = readyForm({})
  const { ctx, record } = createHost(form)
  exportsObject.apply(ctx)
  const keys = [
    'description', 'panel', 'pageTitle', 'pageIntro', 'status', 'bridge', 'bindingLabel',
    'statusLabel', 'statusOn', 'statusOff', 'statusConnecting', 'statusFailed',
    'statusNotReady', 'statusBusy', 'statusHintOn', 'statusHintOff', 'statusHintConfigure',
    'ackLabel', 'bound', 'unbound', 'confirmed', 'unconfirmed', 'credentials', 'appId',
    'appSecret', 'saveAppId', 'saveSecret', 'clearSecret', 'bindTitle', 'beginBind',
    'cancelBind', 'unbind', 'bindCode', 'bindCodeExpires', 'bindUnavailable',
    'bindingHint', 'notifications', 'enabled', 'enableHint', 'notifyComplete',
    'notifyQuestion', 'notifyApproval', 'advanced', 'completeDebounceMs',
    'maxResultChars', 'maxCardButtons', 'saveNumber', 'diagnostics', 'sendTest',
    'restartBridge', 'clearError', 'diagnosticsHint', 'readOnly', 'loading',
    'unavailable', 'saved', 'invalidNumber', 'actionDone', 'secretConfigured',
    'secretMissing', 'secretSource', 'stateError', 'lastError',
  ]
  for (const key of keys) {
    assert.equal(typeof record.locales.zh[key], 'string', `zh missing ${key}`)
    assert.equal(typeof record.locales.en[key], 'string', `en missing ${key}`)
  }
  for (const state of ['stopped', 'connecting', 'connected', 'error']) {
    assert.equal(typeof record.locales.zh.bridgeStates[state], 'string')
  }
})

test('client: 活动栏图标接收 size 并画出字形', async () => {
  const entry = await loadClient()
  const exportsObject = entry.factory(() => createReact())
  const { ctx, record } = createHost(readyForm({}))
  exportsObject.apply(ctx)
  const glyph = registrationOf(record, 'shell.activitybar.items').component
  const small = glyph({ size: 12, active: false })
  const large = glyph({ size: 22, active: true })
  assert.equal(small.type, 'svg')
  assert.equal(small.props.width, 12)
  assert.equal(large.props.width, 22)
  assert.equal(small.props.stroke, 'currentColor')
  assert.equal(small.children.length, 2)
})

test('client: 活动栏页面渲染标题与完整面板', async () => {
  const entry = await loadClient()
  const exportsObject = entry.factory(() => createReact())
  const form = readyForm({ enabled: false, appId: '', completeDebounceMs: 1500, maxResultChars: 3000, maxCardButtons: 6 })
  const { ctx, record } = createHost(form)
  exportsObject.apply(ctx)
  const page = registrationOf(record, 'shell.activity').component
  const tree = page({ form, t: translate })
  const texts = textsOf(tree).join('\n')
  assert.match(texts, /feishuBot\.pageTitle/u)
  assert.match(texts, /feishuBot\.pageIntro/u)
  for (const key of ['status', 'credentials', 'bindTitle', 'notifications', 'advanced', 'diagnostics']) {
    assert.match(texts, new RegExp(`feishuBot\\.${key}`, 'u'))
  }
})

test('client: 组件在未就绪时给出原因与说明', async () => {
  const entry = await loadClient()
  const exportsObject = entry.factory(() => createReact())
  const form = readyForm({ enabled: false, appId: '', completeDebounceMs: 1500, maxResultChars: 3000, maxCardButtons: 6 })
  const { ctx, record } = createHost(form)
  exportsObject.apply(ctx)

  const tree = registrationOf(record, 'plugins.bundle.config').component({ form, t: translate })
  const texts = textsOf(tree).join('\n')
  assert.match(texts, /feishuBot\.description/u)
  assert.match(texts, /feishuBot\.status/u)
  assert.match(texts, /feishuBot\.bridgeStates\.stopped/u)
  assert.match(texts, /feishuBot\.bindTitle/u)
  assert.match(texts, /feishuBot\.beginBind/u)
  assert.match(texts, /feishuBot\.notifications/u)
  assert.match(texts, /feishuBot\.reasonAppId/u)
  assert.match(texts, /feishuBot\.reasonSecret/u)
  assert.match(texts, /feishuBot\.reasonBind/u)
  assert.match(texts, /feishuBot\.diagnostics/u)
})

test('client: 只读表单禁用写入控件', async () => {
  const entry = await loadClient()
  const exportsObject = entry.factory(() => createReact())
  const form = {
    ...readyForm({}),
    getSnapshot: () => ({ status: 'ready', value: {}, writable: false, revision: 1 }),
  }
  const { ctx, record } = createHost(form)
  exportsObject.apply(ctx)
  const tree = registrationOf(record, 'plugins.bundle.config').component({ form, t: translate })
  assert.match(textsOf(tree).join('\n'), /feishuBot\.readOnly/u)
})

test('client: 表单未就绪时显示占位而非崩溃', async () => {
  const entry = await loadClient()
  const exportsObject = entry.factory(() => createReact())
  const form = { ...readyForm({}), getSnapshot: () => ({ status: 'unavailable' }) }
  const { ctx, record } = createHost(form)
  exportsObject.apply(ctx)
  const tree = registrationOf(record, 'plugins.bundle.config').component({ form, t: translate })
  assert.match(textsOf(tree).join('\n'), /feishuBot\.unavailable/u)
})
