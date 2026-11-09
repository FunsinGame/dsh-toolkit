/**
 * dsh-design-doc extension: service worker.
 *
 * Owns the things a content script cannot: the toolbar button, the context
 * menus, the keyboard command, and the copied-coordinate history. The history
 * lives in `chrome.storage.local` so the side panel and the page agree even
 * after a service-worker restart.
 */

const DEFAULTS = { enabled: true, format: 'coord', highlight: true, interceptCopy: true }
const HISTORY_LIMIT = 60

/** Menu ids, one per clipboard format. */
const MENU_ITEMS = [
  { id: 'dd-copy', title: '复制坐标', format: 'coord' },
  { id: 'dd-copy-text', title: '复制坐标 + 原文', format: 'coord-text' },
  { id: 'dd-copy-context', title: '复制完整上下文', format: 'context' },
]

const MENU_URLS = ['file:///*', 'http://localhost/*', 'http://127.0.0.1/*']

async function ensureDefaults() {
  const stored = await chrome.storage.local.get(['settings', 'history'])
  if (stored.settings === undefined) await chrome.storage.local.set({ settings: DEFAULTS })
  if (stored.history === undefined) await chrome.storage.local.set({ history: [] })
}

async function installMenus() {
  await chrome.contextMenus.removeAll()
  for (const item of MENU_ITEMS) {
    chrome.contextMenus.create({
      id: item.id,
      title: item.title,
      contexts: ['page'],
      documentUrlPatterns: MENU_URLS,
    })
  }
}

// So the two install paths cannot interleave a removeAll with a create.
let menuQueue = Promise.resolve()
function rebuildMenus() {
  menuQueue = menuQueue.then(installMenus).catch(() => {})
  return menuQueue
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs.length === 0 ? null : tabs[0]
}

/** Sends one message to the active tab; null when the tab has no content script. */
async function tellActiveTab(message) {
  const tab = await activeTab()
  if (tab === null || tab.id === undefined) return null
  try {
    return await chrome.tabs.sendMessage(tab.id, message)
  } catch {
    return null
  }
}

async function openPanel() {
  const tab = await activeTab()
  if (tab !== null && chrome.sidePanel !== undefined && typeof chrome.sidePanel.open === 'function') {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId })
      return
    } catch {
      /* older browser or a missing user gesture: fall through to a tab */
    }
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel.html') })
}

/** Appends one copied coordinate and tells every open extension page about it. */
async function record(entry) {
  if (entry === null || typeof entry !== 'object' || typeof entry.ddPath !== 'string') return
  const stored = await chrome.storage.local.get('history')
  const history = Array.isArray(stored.history) ? stored.history : []
  history.push(entry)
  await chrome.storage.local.set({ history: history.slice(-HISTORY_LIMIT) })
  try {
    await chrome.runtime.sendMessage({ type: 'dd:copied', entry })
  } catch {
    /* no open side panel */
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults()
  rebuildMenus()
})

chrome.runtime.onStartup.addListener(() => {
  ensureDefaults()
  rebuildMenus()
})

// A service worker can wake without either event; menus are cheap to rebuild.
ensureDefaults()
rebuildMenus()

chrome.action.onClicked.addListener(() => {
  openPanel()
})

chrome.contextMenus.onClicked.addListener(async (info) => {
  const item = MENU_ITEMS.find((candidate) => candidate.id === info.menuItemId)
  if (item === undefined) return
  await tellActiveTab({ type: 'dd:copy', format: item.format })
})

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'copy-coordinate') return
  await tellActiveTab({ type: 'dd:copy' })
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message === null || message === undefined) return false
  if (message.type === 'dd:record') {
    record(message.entry).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }))
    return true
  }
  if (message.type === 'dd:settings') {
    chrome.storage.local.set({ settings: message.settings }).then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false }),
    )
    return true
  }
  if (message.type === 'dd:open-panel') {
    openPanel().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }))
    return true
  }
  return false
})
