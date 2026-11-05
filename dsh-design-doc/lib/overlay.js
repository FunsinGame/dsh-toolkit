/**
 * dsh-design-doc overlay, injected into every served document.
 *
 * It never edits the document: it highlights the nearest block that carries a
 * `data-dd-path` the host injected, and posts that path to the plugin page in
 * the parent frame. The host owns the source; the browser only reports a click.
 *
 * Clicks on controls (links, buttons, the doc's own table-of-contents toggle,
 * inputs) are left completely alone — no preventDefault, no stopPropagation —
 * so the document keeps working exactly as it does on its own.
 */
(function () {
  if (window.__dshDesignDoc === true) return
  window.__dshDesignDoc = true

  var STYLE_ID = 'dsh-design-doc-overlay-style'
  var HOVER_CLASS = 'dsh-design-doc-hover'
  var CONTROLS = { a: 1, button: 1, summary: 1, input: 1, select: 1, textarea: 1, label: 1, option: 1 }

  function installStyle() {
    if (document.getElementById(STYLE_ID) !== null) return
    var style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent =
      '.' + HOVER_CLASS + '{outline:2px dashed #4f9cf9 !important;outline-offset:2px;' +
      'background:rgba(79,156,249,.08) !important;cursor:pointer !important}'
    document.head.appendChild(style)
  }

  function pathOf(element) {
    if (element === null || element === undefined) return null
    if (typeof element.getAttribute !== 'function') return null
    return element.getAttribute('data-dd-path')
  }

  function isControl(target) {
    var node = target
    while (node !== null && node !== undefined && node !== document.body) {
      var tag = node.tagName ? String(node.tagName).toLowerCase() : ''
      if (CONTROLS[tag] === 1) return true
      if (typeof node.getAttribute === 'function') {
        var role = node.getAttribute('role')
        if (role === 'button' || role === 'tab' || role === 'link') return true
      }
      node = node.parentElement
    }
    return false
  }

  function blockAt(target) {
    var element = target
    while (element !== null && element !== undefined && element !== document.body) {
      if (pathOf(element) !== null) return element
      element = element.parentElement
    }
    return null
  }

  function siteRel(pathname) {
    var marker = '/dsh-design-doc/site/'
    var index = pathname.indexOf(marker)
    return index < 0 ? null : decodeURIComponent(pathname.slice(index + marker.length))
  }

  var hovered = null

  function clearHover() {
    if (hovered !== null) hovered.classList.remove(HOVER_CLASS)
    hovered = null
  }

  function post(payload) {
    try {
      window.parent.postMessage(payload, window.location.origin)
    } catch (error) {
      /* the parent frame is gone; nothing to report to */
    }
  }

  function onMove(event) {
    if (isControl(event.target)) {
      clearHover()
      return
    }
    var block = blockAt(event.target)
    if (block === hovered) return
    clearHover()
    hovered = block
    if (block !== null) block.classList.add(HOVER_CLASS)
  }

  function onClick(event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (isControl(event.target)) return
    var block = blockAt(event.target)
    if (block === null) return
    post({
      source: 'dsh-design-doc',
      type: 'select',
      ddPath: pathOf(block),
      tag: block.tagName.toLowerCase(),
      text: block.innerText,
      html: block.innerHTML,
      href: window.location.pathname,
      scrollY: window.scrollY,
    })
  }

  /** Cross-document links are handed to the plugin so it can open them in a tab. */
  function onClickLink(event) {
    var link = event.target.closest === undefined ? null : event.target.closest('a')
    if (link === null) return
    var href = link.getAttribute('href')
    if (href === null || href === '' || href.charAt(0) === '#') return
    var url
    try {
      url = new URL(link.href)
    } catch (error) {
      return
    }
    if (url.origin !== window.location.origin) return
    var target = siteRel(url.pathname)
    if (target === null) return
    if (target === siteRel(window.location.pathname)) return
    event.preventDefault()
    post({ source: 'dsh-design-doc', type: 'navigate', href: link.href })
  }

  /** Form fields keep the browser's own context menu (paste, spellcheck, …). */
  function isFormField(target) {
    var node = target
    while (node !== null && node !== undefined && node !== document.body) {
      var tag = node.tagName ? String(node.tagName).toLowerCase() : ''
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
      node = node.parentElement
    }
    return false
  }

  function onContextMenu(event) {
    if (isFormField(event.target)) return
    // With text selected the user probably wants the browser's copy menu.
    var selection = typeof window.getSelection === 'function' ? window.getSelection() : null
    if (selection !== null && String(selection).trim() !== '') return
    event.preventDefault()
    post({ source: 'dsh-design-doc', type: 'contextmenu', x: event.clientX, y: event.clientY })
  }

  function onReady() {
    installStyle()
    post({ source: 'dsh-design-doc', type: 'ready', href: window.location.pathname })
  }

  document.addEventListener('mousemove', onMove, true)
  document.addEventListener('click', onClick, true)
  document.addEventListener('click', onClickLink, false)
  document.addEventListener('contextmenu', onContextMenu, true)
  document.addEventListener('mouseleave', clearHover, true)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true })
  } else {
    onReady()
  }
})()
