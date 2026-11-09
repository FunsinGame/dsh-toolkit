/**
 * dsh-design-doc extension: the in-page half.
 *
 * Hover a block → it is outlined and a badge shows its coordinate. Ctrl+C with
 * nothing selected copies that coordinate instead of an empty selection; with
 * text selected the browser's own copy is left alone. Clicking pins the block
 * (so the pointer can move away), Esc clears it.
 *
 * Nothing here mutates the document: the only things added are one
 * `pointer-events:none` host element with a shadow root, and transient outline
 * styles that are restored. Clicks, links, the doc's own table of contents and
 * its scripts keep working.
 */

(function () {
  'use strict'

  if (window.__ddCoord === true) return
  window.__ddCoord = true

  var HOST_ID = 'dd-coord-root'
  var DEFAULTS = { enabled: true, format: 'coord', highlight: true, interceptCopy: true }

  /** Form and button-ish elements: no coordinate panel over these. */
  var FORM_TAGS = { button: 1, input: 1, select: 1, textarea: 1, label: 1, option: 1, summary: 1 }
  /** Plus links: hovering still reports the containing block, clicking must navigate. */
  var LINK_TAGS = { a: 1 }
  var CONTROL_ROLES = { button: 1, tab: 1, switch: 1, link: 1 }

  var HOVER_STYLE = { outline: '2px dashed #4f9cf9', offset: '2px', shadow: '0 0 0 4px rgba(79,156,249,.12)' }
  var PIN_STYLE = { outline: '2px solid #4f9cf9', offset: '3px', shadow: '0 0 0 5px rgba(79,156,249,.18)' }

  var state = {
    settings: Object.assign({}, DEFAULTS),
    index: null,
    dirty: true,
    active: false,
    enabled: false,
    hovered: null,
    pinned: null,
    lastSentElement: null,
    lastSentKey: null,
    copying: false,
    bound: false,
    host: null,
    shadow: null,
    badge: null,
    badgeCode: null,
    badgeHint: null,
    badgeSize: null,
    toastEl: null,
    toastTimer: 0,
    restore: new WeakMap(),
  }

  function el(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  /**
   * Sends to the service worker / side panel without caring whether anything is
   * listening — and without throwing when the extension was just reloaded and
   * this content script's context is stale.
   */
  function post(message) {
    try {
      var result = chrome.runtime.sendMessage(message)
      if (result !== undefined && result !== null && typeof result.catch === 'function') {
        result.catch(function () {})
      }
    } catch (error) {
      /* extension context invalidated */
    }
  }

  /* -------------------------------------------------------------------- ui -- */

  var UI_CSS = [
    ':host{all:initial}',
    '.badge{position:fixed;left:0;top:0;display:none;align-items:center;gap:8px;',
    'max-width:min(520px,80vw);padding:5px 8px;border-radius:7px;background:#0f172a;color:#e2e8f0;',
    'font:12px/1.45 ui-monospace,Consolas,"Cascadia Mono",monospace;',
    'box-shadow:0 8px 22px rgba(0,0,0,.3);border:1px solid rgba(147,197,253,.35);pointer-events:none;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.badge code{font:inherit;font-weight:600;color:#93c5fd}',
    '.badge .hint{font-size:11px;opacity:.62}',
    '.badge .pin{font-size:10px;color:#fde68a;opacity:.95}',
    '.toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);display:none;',
    'padding:6px 12px;border-radius:999px;background:#0f172a;color:#e2e8f0;',
    'font:12px/1.4 ui-monospace,Consolas,"Cascadia Mono",monospace;',
    'box-shadow:0 8px 22px rgba(0,0,0,.3);border:1px solid rgba(147,197,253,.35);pointer-events:none}',
  ].join('')

  function buildUi() {
    var host = el('div')
    host.id = HOST_ID
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;display:block'
    var shadow = host.attachShadow({ mode: 'open' })
    var style = el('style')
    style.textContent = UI_CSS
    shadow.append(style)

    var badge = el('div', 'badge')
    var code = el('code')
    var hint = el('span', 'hint', 'Ctrl+C 复制')
    badge.append(code, hint)

    var toast = el('div', 'toast')
    shadow.append(badge, toast)

    document.documentElement.append(host)
    state.host = host
    state.shadow = shadow
    state.badge = badge
    state.badgeCode = code
    state.badgeHint = hint
    state.toastEl = toast
  }

  function isOurs(node) {
    if (node === null || node === undefined) return false
    if (node === state.host) return true
    return typeof node.closest === 'function' && node.closest('#' + HOST_ID) !== null
  }

  /**
   * Moves the badge near the pointer without measuring it: the size is taken
   * once per coordinate in `refreshBadge`, so a mousemove costs no layout read.
   */
  function positionBadge(x, y) {
    var badge = state.badge
    if (badge === null) return
    if (badge.style.display !== 'flex') badge.style.display = 'flex'
    var size = state.badgeSize
    var width = size === null ? 220 : size.width
    var height = size === null ? 26 : size.height
    var left = Math.max(6, Math.min(x + 14, window.innerWidth - width - 8))
    var top = y + 18
    if (top + height > window.innerHeight - 8) top = Math.max(6, y - height - 12)
    badge.style.left = Math.round(left) + 'px'
    badge.style.top = Math.round(top) + 'px'
  }

  function hideBadge() {
    if (state.badge !== null) state.badge.style.display = 'none'
  }

  function toast(text) {
    var node = state.toastEl
    if (node === null) return
    node.textContent = text
    node.style.display = 'block'
    if (state.toastTimer !== 0) clearTimeout(state.toastTimer)
    state.toastTimer = setTimeout(function () {
      node.style.display = 'none'
      state.toastTimer = 0
    }, 1400)
  }

  /* ------------------------------------------------------------- highlight -- */

  function paint(element, style) {
    if (element === null || element === undefined) return
    if (!state.restore.has(element)) {
      state.restore.set(element, {
        outline: element.style.getPropertyValue('outline'),
        offset: element.style.getPropertyValue('outline-offset'),
        shadow: element.style.getPropertyValue('box-shadow'),
        priority: element.style.getPropertyPriority('outline'),
      })
    }
    element.style.setProperty('outline', style.outline, 'important')
    element.style.setProperty('outline-offset', style.offset, 'important')
    element.style.setProperty('box-shadow', style.shadow, 'important')
  }

  function unpaint(element) {
    if (element === null || element === undefined) return
    var saved = state.restore.get(element)
    if (saved === undefined) return
    state.restore.delete(element)
    element.style.removeProperty('outline')
    element.style.removeProperty('outline-offset')
    element.style.removeProperty('box-shadow')
    if (saved.outline !== '') element.style.setProperty('outline', saved.outline, saved.priority || '')
    if (saved.offset !== '') element.style.setProperty('outline-offset', saved.offset, 'important')
    if (saved.shadow !== '') element.style.setProperty('box-shadow', saved.shadow, 'important')
    if (element.getAttribute('style') === '') element.removeAttribute('style')
  }

  function clearPin() {
    if (state.pinned === null) return
    var element = state.pinned.element
    state.pinned = null
    if (state.hovered !== null && state.hovered.element === element) {
      paint(element, HOVER_STYLE)
      refreshBadge()
      return
    }
    unpaint(element)
    if (state.hovered !== null) {
      refreshBadge()
      return
    }
    hideBadge()
    if (state.lastSentElement !== null) {
      state.lastSentElement = null
      state.lastSentKey = null
      post({ type: 'dd:hover', description: null })
    }
  }

  function refreshBadge() {
    var loc = state.pinned || state.hovered
    if (loc === null) {
      hideBadge()
      return
    }
    if (state.badgeCode === null) return
    if (loc.ddPath === null) {
      state.badgeCode.textContent = '无源码坐标'
      state.badgeHint.textContent = loc.reason || '页面生成的块'
    } else {
      state.badgeCode.textContent = loc.ddPath
      var hint = loc.source === 'enemy' ? '敌人表 · 按整只怪定位' : 'Ctrl+C 复制'
      if (state.pinned !== null) hint = '已固定 · Esc 取消'
      state.badgeHint.textContent = hint
    }
    if (state.badge.style.display !== 'flex') state.badge.style.display = 'flex'
    var box = state.badge.getBoundingClientRect()
    if (box.width > 0) state.badgeSize = { width: box.width, height: box.height }
  }

  /* -------------------------------------------------------------- locating -- */

  function isControl(target, includeLinks) {
    var node = target
    while (node !== null && node !== undefined && node.nodeType === 1) {
      var tag = String(node.localName || node.tagName || '').toLowerCase()
      if (FORM_TAGS[tag] === 1) return true
      if (includeLinks && LINK_TAGS[tag] === 1) return true
      if (typeof node.getAttribute === 'function') {
        var role = node.getAttribute('role')
        if (CONTROL_ROLES[role] === 1) return true
      }
      node = node.parentElement
    }
    return false
  }

  function isFormField(target) {
    var node = target
    while (node !== null && node !== undefined && node.nodeType === 1) {
      var tag = String(node.localName || node.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
      node = node.parentElement
    }
    return false
  }

  /**
   * Subtrees the page builds at runtime (`scripts/enemy-blocks.js` replaces each
   * enemy table with cards assembled from `data-stats`). They have no source
   * counterpart: counting their cells would number them against a different
   * tree than the `.html` has, which is how a copy turns into a coordinate that
   * points at the wrong cell — or at nothing at all.
   */
  var GENERATED = '.enemy-block, .enemy-blocks'

  function isGenerated(element) {
    return typeof element.matches === 'function' && element.matches(GENERATED)
  }

  function ensureIndex(force) {
    if (!state.active) return
    if (force !== true && state.index !== null && state.dirty !== true) return
    state.index = DDPath.createIndex(document.documentElement, { skip: isGenerated })
    if (state.host !== null) state.index.paths.delete(state.host)
    state.dirty = false
    if (state.pinned !== null && !state.pinned.element.isConnected) {
      state.pinned = null
    }
    if (state.hovered !== null && !state.hovered.element.isConnected) {
      state.hovered = null
    }
  }

  /**
   * Addresses a runtime-built enemy card.
   *
   * The card's cells have no source coordinate, so the block is addressed the
   * way the DSH plugin's enemy panel resolves it: the chapter id plus the
   * enemy's position among the rows that carry `data-stats`. Only cards built
   * from such a row get one — the rest exist only as rendered markup, and saying
   * so is better than handing out a coordinate that resolves nowhere.
   */
  function enemyLocate(block) {
    var section = block.closest('section.module') || block.closest('section')
    if (section === null || section.id === '') return null
    if (block.querySelector('.enemy-stats') === null) {
      return {
        element: block,
        ddPath: null,
        source: 'generated',
        reason: '这一块是页面脚本生成的，源码里没有对应的单元格',
      }
    }
    var blocks = section.querySelectorAll('.enemy-block')
    var index = 0
    for (var position = 0; position < blocks.length; position += 1) {
      if (blocks[position].querySelector('.enemy-stats') === null) continue
      index += 1
      if (blocks[position] === block) break
    }
    if (index <= 0) return null
    return { element: block, ddPath: section.id + '|enemy' + index, source: 'enemy' }
  }

  /**
   * Resolves the block under a node.
   *
   * `data-dd-path` wins when the page was served by the DSH plugin's host half:
   * that attribute comes from the byte-offset parse, so it is the authority.
   * Everywhere else the DOM-side index answers — except inside a runtime-built
   * card, which is checked first so that its generated cells never borrow a
   * number from an unrelated element.
   */
  function locate(target) {
    if (typeof target.closest === 'function') {
      var generated = target.closest('.enemy-block')
      if (generated !== null) return enemyLocate(generated)
    }
    var node = target
    while (node !== null && node !== undefined && node.nodeType === 1) {
      if (typeof node.getAttribute === 'function') {
        var injected = node.getAttribute('data-dd-path')
        if (injected !== null && injected !== '') return { element: node, ddPath: injected, source: 'host' }
      }
      node = node.parentElement
    }
    ensureIndex(false)
    if (state.index === null) return null
    var block = DDPath.blockOf(state.index, target)
    if (block !== null) {
      var ddPath = state.index.pathOf(block)
      if (ddPath !== null) return { element: block, ddPath: ddPath, source: 'computed' }
    }
    return null
  }

  function headingText(element) {
    if (element === null || element === undefined) return ''
    return DDPath.squash(element.textContent).replace(/\s*#\s*$/, '').trim()
  }

  function documentTitle() {
    var raw = String(document.title || '')
    var cut = raw.split('｜')[0].split('|')[0]
    return cut.trim()
  }

  function documentPath() {
    var raw = location.pathname
    try {
      raw = decodeURIComponent(raw)
    } catch (error) {
      /* keep the encoded form */
    }
    var marker = '/Docs/Design/'
    var at = raw.indexOf(marker)
    if (at >= 0) return raw.slice(at + marker.length)
    return raw.replace(/^\/+/, '')
  }

  var HEADING_TAGS = { h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1 }

  function describe(loc) {
    var element = loc.element
    var ddPath = loc.ddPath === null ? null : String(loc.ddPath)
    var scopeId = ddPath === null ? '' : ddPath.split('|')[0]
    var scopeElement = scopeId === '' ? null : document.getElementById(scopeId)
    var chapter = typeof element.closest === 'function' ? element.closest('section[id]') : null
    var text = element.innerText
    if (text === undefined || text === '') text = element.textContent
    var scopeTag = scopeElement === null ? '' : String(scopeElement.localName || scopeElement.tagName || '').toLowerCase()
    return {
      ddPath: ddPath,
      source: loc.source,
      reason: loc.reason === undefined ? '' : loc.reason,
      tag: String(element.localName || element.tagName || '').toLowerCase(),
      text: DDPath.squash(text),
      chapter: chapter === null ? '' : headingText(chapter.querySelector('h1, h2')),
      section: scopeElement !== null && scopeElement !== chapter && HEADING_TAGS[scopeTag] === 1
        ? headingText(scopeElement)
        : '',
      docTitle: documentTitle(),
      docPath: documentPath(),
      href: location.href,
    }
  }

  function payloadOf(loc, override) {
    var format = typeof override === 'string' && override !== '' ? override : state.settings.format
    return DDPath.payload(describe(loc), format)
  }

  /* ----------------------------------------------------------------- copy -- */

  function legacyCopy(text) {
    var area = el('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0'
    document.body.append(area)
    area.select()
    var ok = false
    state.copying = true
    try {
      ok = document.execCommand('copy')
    } catch (error) {
      ok = false
    }
    state.copying = false
    area.remove()
    return ok
  }

  function copyText(text) {
    if (navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).then(function () {
        return true
      }, function () {
        return legacyCopy(text)
      })
    }
    return Promise.resolve(legacyCopy(text))
  }

  function record(loc, text) {
    var description = describe(loc)
    post({
      type: 'dd:record',
      entry: {
        at: new Date().toISOString(),
        ddPath: loc.ddPath,
        text: description.text.slice(0, 400),
        chapter: description.chapter,
        section: description.section,
        docTitle: description.docTitle,
        docPath: description.docPath,
        payload: text,
      },
    })
  }

  /** Copies the payload of the pinned block, else the hovered one. */
  function copyCurrent(override) {
    var loc = state.pinned !== null ? state.pinned : state.hovered
    if (loc === null) {
      toast('先把鼠标放到正文里')
      return Promise.resolve(false)
    }
    if (loc.ddPath === null) {
      toast(loc.reason || '这一块没有源码坐标')
      return Promise.resolve(false)
    }
    var format = typeof override === 'string' && override !== '' ? override : state.settings.format
    var text = payloadOf(loc, format)
    return copyText(text).then(function (ok) {
      if (!ok) {
        toast('复制失败，请手动选中坐标')
        return false
      }
      record(loc, text)
      toast(format === 'coord' ? '已复制 ' + loc.ddPath : '已复制坐标与内容')
      return true
    })
  }

  function onCopy(event) {
    if (state.enabled !== true) return
    if (state.settings.interceptCopy !== true) return
    if (state.copying === true) return
    if (isFormField(event.target)) return
    var selection = typeof window.getSelection === 'function' ? window.getSelection() : null
    if (selection !== null && String(selection).trim() !== '') return
    var loc = state.pinned !== null ? state.pinned : state.hovered
    if (loc === null) return
    if (loc.ddPath === null) {
      // Nothing to put on the clipboard — say why instead of silently letting
      // an empty copy happen.
      event.preventDefault()
      toast(loc.reason || '这一块没有源码坐标')
      return
    }
    var text = payloadOf(loc)
    if (event.clipboardData !== undefined && event.clipboardData !== null) {
      event.clipboardData.setData('text/plain', text)
      event.preventDefault()
    } else {
      event.preventDefault()
      copyText(text)
    }
    record(loc, text)
    toast(state.settings.format === 'coord' ? '已复制 ' + loc.ddPath : '已复制坐标与内容')
  }

  /* ---------------------------------------------------------------- events -- */

  function showHover(loc, x, y) {
    var previous = state.hovered
    if (loc !== null && previous !== null && previous.element === loc.element) {
      positionBadge(x, y)
      if (state.pinned === null) refreshBadge()
      return
    }
    if (previous !== null) {
      // A pinned block keeps its solid outline while the pointer wanders off it.
      if (state.pinned === null || state.pinned.element !== previous.element) unpaint(previous.element)
    }
    state.hovered = loc
    if (loc !== null) {
      if (state.settings.highlight === true && (state.pinned === null || state.pinned.element !== loc.element)) {
        paint(loc.element, HOVER_STYLE)
      }
      refreshBadge()
      positionBadge(x, y)
      var key = loc.ddPath === null ? 'generated' : loc.ddPath
      if (state.lastSentElement !== loc.element || state.lastSentKey !== key) {
        state.lastSentElement = loc.element
        state.lastSentKey = key
        post({ type: 'dd:hover', description: describe(loc) })
      }
      return
    }
    // Nothing under the pointer, but a pinned block keeps the badge and the
    // panel on itself — that is the whole point of pinning.
    if (state.pinned !== null) {
      refreshBadge()
      return
    }
    hideBadge()
    if (state.lastSentElement !== null) {
      state.lastSentElement = null
      state.lastSentKey = null
      post({ type: 'dd:hover', description: null })
    }
  }

  function onPointerMove(event) {
    if (state.enabled !== true || state.active !== true) return
    var target = event.target
    if (target === null || target.nodeType !== 1) return
    if (isOurs(target)) return
    if (isControl(target, false)) {
      showHover(null)
      return
    }
    showHover(locate(target), event.clientX, event.clientY)
  }

  function onClick(event) {
    if (state.enabled !== true || state.active !== true) return
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    var target = event.target
    if (target === null || target.nodeType !== 1 || isOurs(target)) return
    if (isControl(target, true)) return
    var loc = locate(target)
    if (loc === null) {
      clearPin()
      return
    }
    if (state.pinned !== null && state.pinned.element === loc.element) {
      clearPin()
      return
    }
    if (state.pinned !== null) unpaint(state.pinned.element)
    state.pinned = loc
    paint(loc.element, PIN_STYLE)
    refreshBadge()
    positionBadge(event.clientX, event.clientY)
    toast('已固定 ' + loc.ddPath + ' · Esc 取消')
  }

  function onKeyDown(event) {
    if (state.active !== true) return
    if (event.key === 'Escape' && state.pinned !== null) {
      clearPin()
      toast('已取消固定')
    }
  }

  /** Drops the hover and its outline (a pinned block keeps its own). */
  function onMouseLeave() {
    if (state.active !== true) return
    if (state.hovered !== null) {
      var pinnedId = state.pinned === null ? null : state.pinned.element
      if (pinnedId === null || pinnedId !== state.hovered.element) unpaint(state.hovered.element)
    }
    state.hovered = null
    if (state.pinned === null) hideBadge()
    else refreshBadge()
  }

  /**
   * Only a pointer that actually left the document should drop the hover.
   * `mouseleave` bubbles nowhere but still reaches a capturing listener for
   * every element it leaves, so this listens for `mouseout` and checks that
   * nothing was entered.
   */
  function onPointerOut(event) {
    if (state.active !== true) return
    if (event.relatedTarget !== null && event.relatedTarget !== undefined) return
    onMouseLeave()
  }

  /* ------------------------------------------------------------- activation -- */

  /** The design docs are recognisable from their own markup. */
  function looksLikeDesignDoc() {
    if (location.pathname.indexOf('/Docs/Design/') >= 0) return true
    if (document.body !== null && document.body.hasAttribute('data-doc')) return true
    if (document.querySelector('section[id].module, section.module[id]') !== null) return true
    return document.querySelector('link[rel~="stylesheet"][href*="docs.css"]') !== null
  }

  function activate(force) {
    if (state.active) {
      state.dirty = true
      ensureIndex(true)
      return
    }
    if (force !== true && !looksLikeDesignDoc()) return
    state.active = true
    if (state.host === null) buildUi()
    state.dirty = true
    ensureIndex(true)
    if (state.bound === false) {
      state.bound = true
      document.addEventListener('mousemove', onPointerMove, { passive: true, capture: true })
      document.addEventListener('click', onClick, true)
      document.addEventListener('keydown', onKeyDown, true)
      document.addEventListener('mouseout', onPointerOut, true)
      document.addEventListener('copy', onCopy, true)
      var observer = new MutationObserver(function (records) {
        for (var index = 0; index < records.length; index += 1) {
          if (!isOurs(records[index].target)) {
            state.dirty = true
            return
          }
        }
      })
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['id'] })
    }
  }

  function status() {
    var loc = state.pinned !== null ? state.pinned : state.hovered
    return {
      ok: true,
      active: state.active,
      enabled: state.enabled,
      settings: state.settings,
      docTitle: documentTitle(),
      docPath: documentPath(),
      href: location.href,
      coordinate: loc === null ? null : describe(loc),
      pinned: state.pinned !== null,
    }
  }

  /* ----------------------------------------------------------------- boot -- */

  function loadSettings() {
    var defaults = function () {
      state.settings = Object.assign({}, DEFAULTS)
      state.enabled = true
    }
    try {
      return chrome.storage.local.get('settings').then(function (stored) {
        var saved = stored !== undefined && stored !== null ? stored.settings : null
        state.settings = Object.assign({}, DEFAULTS, saved !== null && typeof saved === 'object' ? saved : {})
        state.enabled = state.settings.enabled === true
      }, defaults)
    } catch (error) {
      defaults()
      return Promise.resolve()
    }
  }

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message === null || message === undefined) return false
    if (message.type === 'dd:status') {
      sendResponse(status())
      return false
    }
    if (message.type === 'dd:copy') {
      copyCurrent(message.format).then(function (ok) {
        sendResponse({ ok: ok })
      })
      return true
    }
    if (message.type === 'dd:enable') {
      activate(true)
      sendResponse(status())
      return false
    }
    if (message.type === 'dd:clear') {
      clearPin()
      sendResponse({ ok: true })
      return false
    }
    return false
  })

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local' || changes.settings === undefined) return
    var saved = changes.settings.newValue
    state.settings = Object.assign({}, DEFAULTS, saved !== null && typeof saved === 'object' ? saved : {})
    state.enabled = state.settings.enabled === true
    if (state.enabled === false) {
      if (state.hovered !== null) unpaint(state.hovered.element)
      if (state.pinned !== null) unpaint(state.pinned.element)
      state.hovered = null
      state.pinned = null
      hideBadge()
    } else if (looksLikeDesignDoc()) {
      activate(false)
    }
  })

  function boot() {
    loadSettings().then(function () {
      if (looksLikeDesignDoc()) activate(false)
    }).catch(function () {
      /* a stale extension context must not break the page */
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true })
  } else {
    boot()
  }
})()
