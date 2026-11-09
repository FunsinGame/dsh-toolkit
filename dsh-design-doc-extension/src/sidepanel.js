/**
 * dsh-design-doc extension: side panel.
 *
 * Two jobs: show the coordinate the page is pointing at right now (and let it
 * be copied without reaching for Ctrl+C), and keep the list of coordinates
 * copied so far, which is what gets handed to the agent.
 */

const DEFAULTS = { enabled: true, format: 'coord', highlight: true, interceptCopy: true }

const state = {
  settings: { ...DEFAULTS },
  history: [],
  current: null,
  pinned: false,
  active: false,
  tabId: null,
  docTitle: '',
  docPath: '',
}

const $ = (id) => document.getElementById(id)

const SOURCE_LABEL = { host: '宿主注入', computed: '页面计算', enemy: '敌人表', generated: '页面生成' }

/* ------------------------------------------------------------------- render -- */

function renderDocument() {
  $('doc-title').textContent = state.docTitle === '' ? '—' : state.docTitle
  $('doc-path').textContent = state.docPath === '' ? '—' : state.docPath
  $('doc-path').title = state.docPath
}

function renderCurrent() {
  const current = state.current
  const hasPath = current !== null && typeof current.ddPath === 'string'
  $('coord').textContent = current === null ? '—' : (hasPath ? current.ddPath : '无源码坐标')
  $('coord').title = hasPath ? 'Ctrl+C 也会复制它' : ''

  const tag = $('source')
  if (current === null || SOURCE_LABEL[current.source] === undefined) {
    tag.hidden = true
  } else {
    tag.hidden = false
    tag.textContent = SOURCE_LABEL[current.source]
  }

  $('pin').hidden = state.pinned !== true

  const where = current === null ? '' : [current.chapter, current.section].filter(Boolean).join(' › ')
  const reason = current === null || hasPath ? '' : String(current.reason || '这一块是页面生成的，源码里没有对应的单元格')
  $('where').textContent = hasPath ? where : [where, reason].filter(Boolean).join(' · ')
  $('excerpt').textContent = current === null ? '' : current.text

  const disabled = !hasPath
  $('copy').disabled = disabled
  $('copy-context').disabled = disabled
  $('coord').style.opacity = disabled ? '.5' : '1'
}

function renderHistory() {
  $('count').textContent = String(state.history.length)
  const list = $('list')
  list.replaceChildren()
  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    const entry = state.history[index]
    if (entry === null || typeof entry !== 'object') continue
    const button = document.createElement('button')
    button.className = 'row-item'
    button.type = 'button'
    button.title = '点击复制：' + String(entry.payload || entry.ddPath || '')

    const key = document.createElement('span')
    key.className = 'key'
    key.textContent = String(entry.ddPath || '')

    const meta = document.createElement('span')
    meta.className = 'meta'
    const where = [entry.chapter, entry.section].filter(Boolean).join(' › ')
    const time = /T(\d{2}:\d{2})/.exec(String(entry.at || ''))
    meta.textContent = [where, time === null ? '' : time[1]].filter(Boolean).join(' · ')

    button.append(key, meta)
    button.addEventListener('click', () => {
      copy(String(entry.payload || entry.ddPath || ''), button)
    })
    list.append(button)
  }
  $('copy-all').disabled = state.history.length === 0
  $('clear').hidden = state.history.length === 0
}

function renderSettings() {
  $('format').value = state.settings.format
  $('enabled').checked = state.settings.enabled === true
  $('intercept').checked = state.settings.interceptCopy === true
  $('highlight').checked = state.settings.highlight === true
}

function renderBanner() {
  const banner = $('banner')
  if (state.active) {
    banner.hidden = true
    return
  }
  banner.hidden = false
  $('banner-text').textContent = '这一页没有加载坐标脚本。如果是本地文档，需要在扩展详情里打开「允许访问文件网址」。'
}

function renderAll() {
  renderDocument()
  renderCurrent()
  renderHistory()
  renderSettings()
  renderBanner()
}

/* ------------------------------------------------------------------ actions -- */

async function copy(text, button) {
  if (text === '') return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    document.body.append(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
  if (button !== undefined) {
    const label = button.textContent
    button.textContent = '已复制'
    setTimeout(() => { button.textContent = label }, 900)
  }
}

function payloadFor(description, format) {
  return DDPath.payload(description, format)
}

function entryFor(description, format) {
  return {
    at: new Date().toISOString(),
    ddPath: description.ddPath,
    text: String(description.text || '').slice(0, 400),
    chapter: description.chapter,
    section: description.section,
    docTitle: description.docTitle,
    docPath: description.docPath,
    payload: payloadFor(description, format),
  }
}

function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch }
  chrome.storage.local.set({ settings: state.settings })
  renderSettings()
}

/* ------------------------------------------------------------------- status -- */

async function refreshStatus() {
  state.active = false
  state.current = null
  state.pinned = false

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tab = tabs.length === 0 ? null : tabs[0]
  state.tabId = tab === null || tab.id === undefined ? null : tab.id

  if (state.tabId !== null) {
    try {
      const status = await chrome.tabs.sendMessage(state.tabId, { type: 'dd:status' })
      if (status !== null && status !== undefined && status.ok === true) {
        state.active = true
        state.current = status.coordinate === undefined ? null : status.coordinate
        state.pinned = status.pinned === true
        state.docTitle = String(status.docTitle || '')
        state.docPath = String(status.docPath || '')
        state.settings = { ...state.settings, ...(status.settings || {}) }
      }
    } catch {
      /* no content script in that tab */
    }
  }

  renderAll()
}

async function refreshHistory() {
  const stored = await chrome.storage.local.get('history')
  state.history = Array.isArray(stored.history) ? stored.history : []
  renderHistory()
}

/* ----------------------------------------------------------------- messaging -- */

chrome.runtime.onMessage.addListener((message) => {
  if (message === null || message === undefined) return false
  if (message.type === 'dd:hover') {
    state.current = message.description === undefined ? null : message.description
    if (state.current === null) {
      state.pinned = false
    } else {
      // Keep the document header in step with a navigation inside the tab.
      state.docTitle = String(state.current.docTitle || '')
      state.docPath = String(state.current.docPath || '')
      state.active = true
      renderDocument()
      renderBanner()
    }
    renderCurrent()
    return false
  }
  // Reload rather than append: the same copy reaches this panel both through
  // the storage change and through the broadcast, and appending would show it
  // twice.
  if (message.type === 'dd:copied') {
    refreshHistory()
    return false
  }
  return false
})

chrome.tabs.onActivated.addListener(() => { refreshStatus() })
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId === state.tabId && info.status === 'complete') refreshStatus()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (changes.history !== undefined) {
    state.history = Array.isArray(changes.history.newValue) ? changes.history.newValue : []
    renderHistory()
  }
  if (changes.settings !== undefined) {
    state.settings = { ...DEFAULTS, ...(changes.settings.newValue || {}) }
    renderSettings()
  }
})

/* --------------------------------------------------------------------- boot -- */

/** Copies whatever the page is pointing at, from the panel. */
function copyCurrentFromPanel(button, format) {
  if (state.current === null || typeof state.current.ddPath !== 'string') return
  const chosen = format === undefined ? state.settings.format : format
  copy(payloadFor(state.current, chosen), button)
  chrome.runtime.sendMessage({ type: 'dd:record', entry: entryFor(state.current, chosen) }).catch(() => {})
}

$('copy').addEventListener('click', () => {
  copyCurrentFromPanel($('copy'))
})

$('copy-context').addEventListener('click', () => {
  copyCurrentFromPanel($('copy-context'), 'context')
})

/**
 * Focus often sits in this panel right after the toolbar icon was clicked, so
 * Ctrl+C would never reach the page. Copy the hovered coordinate here instead;
 * a real selection is still left to the browser.
 */
document.addEventListener('keydown', (event) => {
  if (event.key !== 'c' && event.key !== 'C') return
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
  const selection = window.getSelection()
  if (selection !== null && String(selection).trim() !== '') return
  if (state.current === null) return
  event.preventDefault()
  copyCurrentFromPanel($('copy'))
})

$('copy-all').addEventListener('click', () => {
  if (state.history.length === 0) return
  const lines = ['【设计文档坐标清单】共 ' + state.history.length + ' 处']
  state.history.forEach((entry, index) => {
    const where = [entry.chapter, entry.section].filter(Boolean).join(' › ')
    lines.push((index + 1) + '. ' + (entry.docPath || '') + ' · ' + (entry.ddPath || ''))
    if (where !== '') lines.push('   ' + where)
    if (entry.text) lines.push('   原文：' + entry.text)
  })
  copy(lines.join('\n'), $('copy-all'))
})

$('clear').addEventListener('click', () => {
  chrome.storage.local.set({ history: [] })
  state.history = []
  renderHistory()
})

$('enable').addEventListener('click', async () => {
  if (state.tabId === null) return
  try {
    await chrome.tabs.sendMessage(state.tabId, { type: 'dd:enable' })
  } catch {
    /* nothing to enable */
  }
  refreshStatus()
})

$('open-tab').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel.html') })
})

$('format').addEventListener('change', (event) => {
  saveSettings({ format: event.target.value })
})
$('enabled').addEventListener('change', (event) => {
  saveSettings({ enabled: event.target.checked })
  refreshStatus()
})
$('intercept').addEventListener('change', (event) => {
  saveSettings({ interceptCopy: event.target.checked })
})
$('highlight').addEventListener('change', (event) => {
  saveSettings({ highlight: event.target.checked })
})

async function boot() {
  const stored = await chrome.storage.local.get(['settings', 'history'])
  state.settings = { ...DEFAULTS, ...(stored.settings || {}) }
  state.history = Array.isArray(stored.history) ? stored.history : []
  renderAll()
  await refreshStatus()
}

boot()
