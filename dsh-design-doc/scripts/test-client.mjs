/**
 * Browser-half smoke run without a real DSH client: proves the bundle registers
 * itself with the module loader, that `apply` wires both activity slots, and
 * that a click payload turns into a usable inspector prompt.
 *
 * Usage: node scripts/test-client.mjs
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundle = await readFile(path.join(here, '..', 'lib', 'client.js'), 'utf8')

let failures = 0
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

const registered = []
const listeners = []
const elements = []

function makeElement(tag) {
  const node = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    className: '',
    textContent: '',
    style: {},
    children: [],
    parentNode: null,
    firstChild: null,
    value: '',
    clientWidth: 1200,
    classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {},
    append(...kids) {
      kids.forEach((kid) => { if (kid && typeof kid === 'object') kid.parentNode = this })
      this.children.push(...kids)
      this.firstChild = this.children[0] ?? null
    },
    removeChild(child) {
      this.children = this.children.filter((entry) => entry !== child)
      if (child && typeof child === 'object') child.parentNode = null
      this.firstChild = this.children[0] ?? null
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null },
    focus() {},
    contains() { return false },
  }
  elements.push(node)
  return node
}

const documentStub = {
  head: makeElement('head'),
  body: makeElement('body'),
  getElementById() { return null },
  createElement: makeElement,
  createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
}

const windowStub = {
  location: { origin: 'http://127.0.0.1:52604', pathname: '/dsh-design-doc/site/modules/jobs/documents/01-jobs.html' },
  addEventListener: (name, handler) => listeners.push({ name, handler }),
  removeEventListener: () => {},
  parent: { postMessage: () => {} },
  __ModuleLoader__: { load: (entry) => registered.push(entry) },
}

const React = {
  createElement: (tag, props, kids) => ({ tag, props, kids }),
  useRef: (value) => ({ current: value }),
  useEffect: () => {},
}

const sandbox = {
  window: windowStub,
  document: documentStub,
  navigator: { clipboard: null },
  console,
  fetch: async () => ({ json: async () => ({ ok: false }) }),
  setTimeout,
  require: (name) => {
    if (name === 'react') return React
    throw new Error(`unexpected require: ${name}`)
  },
}
vm.createContext(sandbox)
sandbox.globalThis = sandbox

vm.runInContext(bundle, sandbox, { filename: 'client.js' })

check('bundle registers with the module loader', registered.length === 1 && registered[0].id === 'dsh-design-doc')
const exported = registered[0]?.factory(sandbox.require)
check('factory returns apply', typeof exported?.apply === 'function')

const slots = []
const injected = []
const ctx = {
  inject: (deps, callback) => {
    injected.push(deps)
    const child = {
      slots: {
        inject: (name, factory) => slots.push({ name, component: factory() }),
        register: (options, component) => ({ options, component }),
      },
      sessions: { list: { getSnapshot: () => ({ byId: {} }) }, scope: () => null },
      conversation: { input: { for: () => ({}) } },
    }
    callback(child)
  },
}

exported.apply(ctx)

check('injects sessions and conversation', injected.some((deps) => deps.includes('sessions')) && injected.some((deps) => deps.includes('conversation')), JSON.stringify(injected))
check('registers the activity-bar entry', slots.some((slot) => slot.name === 'shell.activitybar.items'))
check('registers the activity page', slots.some((slot) => slot.name === 'shell.activity'))
check('activity id is design-doc', slots.some((slot) => slot.component?.options?.id === 'design-doc'))
check('page component is a function', slots.some((slot) => typeof slot.component?.component === 'function'))

// The resize gutter must keep receiving pointer events while the pointer is over
// the document frame, otherwise dragging leftwards dies the moment it crosses.
const styleNode = documentStub.head.children.find((node) => typeof node.textContent === 'string' && node.textContent.includes('.dd-root'))
check('overlay styles are injected', styleNode !== undefined)
check('dragging disables pointer events on the document frame', styleNode !== undefined && styleNode.textContent.includes('.dd-dragging .dd-frame{pointer-events:none'))

// Construct the tabbed reader without a real browser: this catches layout and
// tab wiring mistakes that the slot check cannot see.
const View = exported.View
check('view class is exported', typeof View === 'function')
if (typeof View === 'function') {
  let built = null
  let buildError = null
  try {
    built = new View()
  } catch (error) {
    buildError = error
  }
  check('view builds without a DOM', built !== null, buildError && buildError.message)
  if (built !== null) {
    check('tab strip exists', built.dom.tabs.className === 'dd-tabs')
    check('new-tab button exists', built.dom.plus.className === 'dd-plus')
    check('panel width is applied', built.dom.panel.style.width === built.state.panelWidth + 'px', built.dom.panel.style.width)
    check('the doc pane takes the remaining width', built.dom.view.className === 'dd-view')
    check('one resizable gutter exists', built.dom.root.children[2].children.filter((child) => child.className === 'dd-gutter').length === 1)
    check('no left tree any more', built.dom.tree === undefined)
    check('a fresh start opens one empty tab', built.state.tabs.length === 1 && built.state.tabs[0].root === null)

    // Each tab owns its workspace: setting one tab's root must not touch another.
    const docA = 'modules/demo/documents/01-demo.html'
    const otherA = 'modules/demo/documents/02-other.html'
    const docB = 'modules/other/documents/01-other.html'
    built.manifests['C:/libA'] = {
      modules: [{ id: 'demo', title: '演示', documents: [{ rel: docA, title: '演示文档', chapters: [] }, { rel: otherA, title: '另一篇', chapters: [] }] }],
      sections: {},
    }
    built.manifests['C:/libB'] = {
      modules: [{ id: 'other', title: '另一个库', documents: [{ rel: docB, title: 'B 文档', chapters: [] }] }],
      sections: {},
    }

    built.state.tabs = [built.state.tabs[0]]
    built.state.active = 0
    built.applyRoot('C:/libA')
    check('the first tab takes the first workspace', built.state.tabs[0].root === 'C:/libA')
    check('the workspace bar shows the active tab root', built.dom.rootInput.value === 'C:/libA', built.dom.rootInput.value)

    built.newTab()
    check('+ adds one tab', built.state.tabs.length === 2)
    check('the new tab inherits the current workspace', built.state.tabs[1].root === 'C:/libA')
    built.applyRoot('C:/libB')
    check('changing root only affects the active tab', built.state.tabs[1].root === 'C:/libB' && built.state.tabs[0].root === 'C:/libA')

    built.activate(0)
    check('switching back restores the first workspace', built.dom.rootInput.value === 'C:/libA', built.dom.rootInput.value)

    built.openInActiveTab(docA)
    check('a doc opens in its own tab', built.state.tabs[0].rel === docA)
    built.renderTabs()
    check('the tab label is the document title', built.dom.tabs.children[0].children[0].textContent === '演示文档', built.dom.tabs.children[0].children[0].textContent)

    built.activate(1)
    built.openInActiveTab(docB)
    check('the second tab loads from its own library', built.state.tabs[1].rel === docB)
    check('the first tab keeps its document', built.state.tabs[0].rel === docA)
    check('the first tab keeps its workspace', built.state.tabs[0].root === 'C:/libA')

    // Pages outside the manifest (module index, for example) still open, with a
    // filename label, because they live under the same workspace root.
    built.openInActiveTab('modules/demo/index.html')
    check('pages outside the manifest open in-tab', built.state.tabs[1].rel === 'modules/demo/index.html')
    built.renderTabs()
    check('such a tab falls back to the file name', built.dom.tabs.children[1].children[0].textContent === 'index', built.dom.tabs.children[1].children[0].textContent)

    built.openInActiveTab(otherA)
    check('navigation stays in the current tab', built.state.tabs.length === 2 && built.state.tabs[1].rel === otherA)
    check('the workspace of the other tab is untouched', built.state.tabs[0].root === 'C:/libA')

    built.openInActiveTab('modules/demo/data/jobs.json')
    check('non-html links are ignored', built.state.tabs[1].rel === otherA)

    // Right-click →「新页签显示」duplicates the current page right after it.
    built.activate(0)
    const beforeCount = built.state.tabs.length
    const sourceTab = built.state.tabs[0]
    sourceTab.scrollY = 640
    built.newTabFromCurrent()
    check('新页签显示 adds exactly one tab', built.state.tabs.length === beforeCount + 1)
    check('the copy sits right after the source', built.state.active === 1)
    check('the copy keeps the workspace', built.state.tabs[1].root === sourceTab.root)
    check('the copy keeps the page', built.state.tabs[1].rel === sourceTab.rel)
    check('the copy keeps the title', built.state.tabs[1].label === sourceTab.label)
    check('the copy keeps the scroll position', built.state.tabs[1].scrollY === 640)
    check('the source tab is untouched', sourceTab.rel === docA && sourceTab.root === 'C:/libA' && built.state.tabs[2].rel === otherA)

    const menu = built.menuItems()
    check('the context menu offers 新页签显示', menu.some((item) => item.label === '新页签显示'))

    // The selected block must stay outlined in the document, not just on hover.
    const posted = []
    built.dom.frame.contentWindow = { postMessage: (message) => posted.push(message), scrollTo: () => {} }
    built.select({ ddPath: 'job-01|p1', tag: 'p', text: '原文', html: '原文', scrollY: 0 })
    check('selecting marks the block in the document', posted.some((message) => message.type === 'mark' && message.ddPath === 'job-01|p1'))
    built.postMark(null)
    check('clearing the selection removes the outline', posted[posted.length - 1].ddPath === null)

    // Image blocks expose the SVG's text runs for in-place editing.
    built.state.svg = {
      src: 'x.svg',
      file: 'assets/x.svg',
      texts: [{ index: 0, text: '甲', original: '甲' }, { index: 1, text: '乙', original: '乙' }],
    }
    const svgEditor = built.buildSvgEditor('x.svg')
    check('svg editor renders one row per text run', svgEditor.children.length === 4, String(svgEditor.children.length))
    const loadingEditor = built.buildSvgEditor('other.svg')
    check('a different svg switches to a loading state', loadingEditor.children.length === 1, String(loadingEditor.children.length))
  }

  // Leaving the activity page and coming back must not rebuild the state: the
  // shell unmounts Page, so bind/unbind has to preserve the selection.
  const getView = exported.getView
  check('the view is exposed as a singleton', typeof getView === 'function' && getView() === getView())
  if (typeof getView === 'function') {
    const view = new View()
    let refreshes = 0
    const originalRefresh = view.refresh
    view.refresh = function () { refreshes += 1; return originalRefresh.call(this) }

    view.state.tabs = [{ root: 'C:/libA', rel: 'modules/demo/index.html', label: '演示', scrollY: 12 }]
    view.state.active = 0
    view.state.sel = { ddPath: 'job-01|p1', tag: 'p', text: '原文', html: '原文', scrollY: 0 }
    view.state.drafts = { text: '改了一半' }

    const hostA = makeElement('div')
    view.bind(hostA)
    check('bind attaches the view', view.dom.root.parentNode === hostA)
    check('first bind loads the workspace', refreshes === 1)

    view.unbind()
    check('unbind detaches the view', view.dom.root.parentNode === null)

    const hostB = makeElement('div')
    view.bind(hostB)
    check('re-attach puts the view back', view.dom.root.parentNode === hostB)
    check('re-attach keeps the selection', view.state.sel !== null && view.state.sel.ddPath === 'job-01|p1')
    check('re-attach keeps the edit draft', view.state.drafts.text === '改了一半')
    check('re-attach keeps the tabs', view.state.tabs.length === 1 && view.state.tabs[0].scrollY === 12)
    check('re-attach does not reload the workspace', refreshes === 1)
  }
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
