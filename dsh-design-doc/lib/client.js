/**
 * dsh-design-doc browser half.
 *
 * One activity-bar entry: a tabbed reader for design-doc libraries.
 *
 * A tab is an independent workspace: it carries its own workspace root, its own
 * document, and its own scroll offset. Changing one tab's root never touches
 * another tab. Tabs survive a restart.
 *
 * Inside a tab, navigation stays in that tab — only `+` creates a new one.
 */
window.__ModuleLoader__.load({
  id: 'dsh-design-doc',
  factory: function (require) {
    var React = require('react')

    var PREFIX = '/dsh-design-doc'
    var ACTIVITY_ID = 'design-doc'
    var STYLE_ID = 'dsh-design-doc-style'
    var STATE_KEY = 'dsh-design-doc:state'
    var LAYOUT_KEY = 'dsh-design-doc:layout'

    var CSS = [
      '.dd-root{display:flex;flex-direction:column;flex:1 1 auto;width:100%;min-width:0;min-height:0;height:100%;font-size:13px;color:var(--dsh-fg,inherit)}',
      '.dd-topbar{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--dsh-border,rgba(127,127,127,.25));flex:none;min-width:0}',
      '.dd-title{font-weight:600;white-space:nowrap}',
      '.dd-tabs{display:flex;align-items:center;gap:4px;overflow-x:auto;overflow-y:hidden;flex:1;min-width:0;scrollbar-width:thin}',
      '.dd-tab{display:inline-flex;align-items:center;gap:6px;flex:none;max-width:230px;border:1px solid transparent;border-radius:6px;padding:3px 6px 3px 9px;background:rgba(127,127,127,.1);cursor:pointer;font-size:12px;color:inherit}',
      '.dd-tab:hover{background:rgba(127,127,127,.18)}',
      '.dd-tab.on{background:rgba(79,156,249,.16);border-color:rgba(79,156,249,.5);color:#4f9cf9}',
      '.dd-tab-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dd-tab-close{opacity:.5;border-radius:4px;padding:0 3px;line-height:1.3;font-size:13px}',
      '.dd-tab-close:hover{opacity:1;background:rgba(127,127,127,.3)}',
      '.dd-plus{flex:none;border:1px dashed var(--dsh-border,rgba(127,127,127,.45));background:transparent;color:inherit;border-radius:6px;width:24px;height:24px;line-height:1;cursor:pointer;font-size:15px}',
      '.dd-plus:hover{background:rgba(127,127,127,.14)}',
      '.dd-btn{border:1px solid var(--dsh-border,rgba(127,127,127,.3));background:transparent;color:inherit;border-radius:6px;padding:4px 9px;cursor:pointer;font-size:12px;white-space:nowrap;flex:none}',
      '.dd-btn:hover{background:rgba(127,127,127,.12)}',
      '.dd-btn.primary{border-color:#4f9cf9;color:#4f9cf9}',
      '.dd-rootbar{display:flex;align-items:center;gap:8px;padding:5px 10px;border-bottom:1px solid var(--dsh-border,rgba(127,127,127,.18));flex:none}',
      '.dd-rootbar-label{font-size:11px;opacity:.6;white-space:nowrap}',
      '.dd-rootinput{flex:1;min-width:60px;background:transparent;border:1px solid var(--dsh-border,rgba(127,127,127,.3));border-radius:6px;padding:3px 6px;color:inherit;font-size:12px}',
      '.dd-body{display:flex;flex:1 1 auto;min-height:0;min-width:0;width:100%}',
      '.dd-gutter{flex:none;width:7px;cursor:col-resize;position:relative;background:transparent;touch-action:none}',
      '.dd-gutter::after{content:"";position:absolute;top:0;bottom:0;left:3px;width:1px;background:var(--dsh-border,rgba(127,127,127,.25))}',
      '.dd-gutter:hover::after,.dd-gutter.dragging::after{background:#4f9cf9;width:2px;left:2.5px}',
      '.dd-dragging .dd-frame{pointer-events:none !important}',
      '.dd-dragging .dd-view{cursor:col-resize}',
      '.dd-view{flex:1 1 auto;width:0;min-width:0;background:#fff;position:relative}',
      '.dd-frame{width:100%;height:100%;border:0;display:block;background:#fff}',
      '.dd-placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center;font-size:12px;line-height:1.9;opacity:.75;background:#fff;color:#555}',
      '.dd-placeholder b{font-size:13px;opacity:1}',
      '.dd-list{display:flex;flex-direction:column;gap:2px;width:100%;max-width:520px;max-height:60%;overflow:auto;text-align:left}',
      '.dd-list-group{font-size:10px;opacity:.55;padding:8px 2px 2px}',
      '.dd-list-item{display:block;width:100%;text-align:left;background:none;border:1px solid transparent;border-radius:6px;color:inherit;padding:6px 9px;cursor:pointer;font-size:12px}',
      '.dd-list-item:hover{background:rgba(127,127,127,.14);border-color:var(--dsh-border,rgba(127,127,127,.3))}',
      '.dd-panel{flex:none;overflow:auto;padding:10px}',
      '.dd-empty{opacity:.55;font-size:12px;line-height:1.7}',
      '.dd-card{border:1px solid var(--dsh-border,rgba(127,127,127,.25));border-radius:8px;padding:8px;margin-bottom:10px}',
      '.dd-k{font-size:11px;opacity:.6;margin:6px 0 2px}',
      '.dd-v{font-size:12px;word-break:break-all}',
      '.dd-v code{font-size:11px;background:rgba(127,127,127,.14);padding:1px 4px;border-radius:4px}',
      '.dd-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}',
      '.dd-chip{font-size:10px;border:1px solid var(--dsh-border,rgba(127,127,127,.3));border-radius:999px;padding:1px 7px;opacity:.85}',
      '.dd-modes{display:flex;gap:6px;margin:8px 0 6px}',
      '.dd-mode{font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid transparent;background:rgba(127,127,127,.14);cursor:pointer;color:inherit}',
      '.dd-mode.on{border-color:#4f9cf9;color:#4f9cf9;background:rgba(79,156,249,.12)}',
      '.dd-editor{width:100%;box-sizing:border-box;min-height:150px;resize:vertical;border-radius:6px;border:1px solid var(--dsh-border,rgba(127,127,127,.3));background:transparent;color:inherit;font:12px/1.6 ui-monospace,Consolas,monospace;padding:7px}',
      '.dd-actions{display:flex;gap:8px;margin-top:8px}',
      '.dd-hint{font-size:11px;opacity:.6;line-height:1.6;margin-top:6px}',
      '.dd-svg{margin-top:6px;display:flex;flex-direction:column;gap:4px;max-height:240px;overflow:auto}',
      '.dd-svg-row{display:flex;align-items:center;gap:6px}',
      '.dd-svg-no{font-size:10px;opacity:.5;width:20px;flex:none;text-align:right}',
      '.dd-svg-input{flex:1;min-width:0;background:transparent;border:1px solid var(--dsh-border,rgba(127,127,127,.3));border-radius:5px;color:inherit;font-size:12px;padding:3px 6px}',
      '.dd-diff{margin-top:8px;font:11px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;background:rgba(127,127,127,.1);border-radius:6px;padding:6px;max-height:220px;overflow:auto}',
      '.dd-status{padding:4px 10px;font-size:11px;border-top:1px solid var(--dsh-border,rgba(127,127,127,.25));opacity:.8;flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dd-ctx{position:fixed;z-index:80;min-width:152px;padding:4px;background:var(--dsh-bg-elevated,#fff);color:var(--dsh-fg,#222);border:1px solid var(--dsh-border,rgba(127,127,127,.35));border-radius:8px;box-shadow:0 10px 26px rgba(0,0,0,.18)}',
      '.dd-ctx-item{display:block;width:100%;text-align:left;background:none;border:0;color:inherit;padding:6px 10px;border-radius:5px;cursor:pointer;font-size:12px;white-space:nowrap}',
      '.dd-ctx-item:hover{background:rgba(79,156,249,.16)}',
    ].join('\n')

    var services = { conversation: null, sessions: null }

    /**
     * The shell unmounts the activity page on every switch away from it, so the
     * view — and with it the open tabs, the selected block and the edit draft —
     * has to live outside React's tree.
     */
    var viewInstance = null

    function getView() {
      if (viewInstance === null) viewInstance = new View()
      return viewInstance
    }

    function el(tag, props, children) {
      var node = document.createElement(tag)
      if (props) {
        Object.keys(props).forEach(function (key) {
          var value = props[key]
          if (value === null || value === undefined || value === false) return
          if (key === 'class') node.className = value
          else if (key === 'text') node.textContent = value
          else if (key === 'html') node.innerHTML = value
          else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2).toLowerCase(), value)
          else node.setAttribute(key, value === true ? '' : String(value))
        })
      }
      ;(children || []).forEach(function (child) {
        if (child === null || child === undefined || child === false) return
        node.append(child.nodeType ? child : document.createTextNode(String(child)))
      })
      return node
    }

    function clear(node) {
      while (node.firstChild) node.removeChild(node.firstChild)
    }

    function escapeHtml(text) {
      return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }

    function siteRel(pathname) {
      var marker = PREFIX + '/site/'
      var index = pathname.indexOf(marker)
      return index < 0 ? null : decodeURIComponent(pathname.slice(index + marker.length))
    }

    function activeSession() {
      var sessions = services.sessions
      if (!sessions || !sessions.list || typeof sessions.list.getSnapshot !== 'function') return null
      var snapshot
      try {
        snapshot = sessions.list.getSnapshot()
      } catch (error) {
        return null
      }
      var rows = Object.keys((snapshot && snapshot.byId) || {}).map(function (id) { return snapshot.byId[id] })
      var retained = rows.filter(function (row) {
        return row !== null && row !== undefined && row.retainedBy && Object.keys(row.retainedBy).length > 0
      })
      var main = retained.filter(function (row) { return (row.retainedBy.mainView || 0) > 0 })
      return main[0] || retained[0] || null
    }

    /** Puts text into the current session's composer; reports why it could not. */
    function insertIntoComposer(text) {
      var conversation = services.conversation
      var sessions = services.sessions
      if (!conversation || !sessions) return { ok: false, reason: '会话接口不可用' }
      var target = activeSession()
      if (target === null) return { ok: false, reason: '没有打开的会话' }
      var scope = null
      try {
        scope = sessions.scope(target.id)
      } catch (error) {
        scope = null
      }
      if (scope === null || scope === undefined) return { ok: false, reason: '拿不到会话范围' }
      var input = null
      try {
        input = conversation.input.for(scope)
      } catch (error) {
        return { ok: false, reason: '输入框不可用' }
      }
      if (!input) return { ok: false, reason: '输入框不可用' }
      try {
        if (typeof input.insertTextAtCaret === 'function') {
          return input.insertTextAtCaret(text) ? { ok: true } : { ok: false, reason: '输入框忙' }
        }
        if (typeof input.insertText === 'function') {
          return input.insertText(text) ? { ok: true } : { ok: false, reason: '输入框忙' }
        }
      } catch (error) {
        return { ok: false, reason: String((error && error.message) || error) }
      }
      return { ok: false, reason: '当前版本没有插入接口' }
    }

    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true }, function () { return false })
      }
      var area = el('textarea', { style: 'position:fixed;left:-9999px' })
      area.value = text
      document.body.append(area)
      area.select()
      var ok = false
      try {
        ok = document.execCommand('copy')
      } catch (error) {
        ok = false
      }
      area.remove()
      return Promise.resolve(ok)
    }

    /* ---------------------------------------------------------------- view -- */

    /**
     * A tab is `{ root, rel, label, scrollY }`. `root` is that tab's own
     * workspace, so two tabs may read two different document libraries.
     */
    function newTabState(root, rel, label) {
      return {
        root: typeof root === 'string' && root !== '' ? root : null,
        rel: typeof rel === 'string' && rel !== '' ? rel : null,
        label: typeof label === 'string' && label !== '' ? label : null,
        scrollY: 0,
      }
    }

    function View() {
      this.state = {
        tabs: [],
        active: -1,
        sel: null,
        mode: 'text',
        saved: false,
        drafts: {},
        svg: null,
        panelWidth: 380,
      }
      this.manifests = {}
      this.manifestErrors = {}
      this.dom = {}
      this.restore()
      this.build()
    }

    /* --------------------------------------------------------- persistence -- */

    View.prototype.restore = function () {
      var oldRoot = null
      try {
        var saved = JSON.parse(window.localStorage.getItem(STATE_KEY) || 'null')
        if (saved && typeof saved === 'object') {
          if (typeof saved.root === 'string' && saved.root !== '') oldRoot = saved.root
          if (Array.isArray(saved.tabs)) {
            var self = this
            var restored = []
            saved.tabs.forEach(function (tab) {
              if (!tab) return
              // Older records kept one workspace globally; give it to every tab.
              var root = typeof tab.root === 'string' && tab.root !== '' ? tab.root : oldRoot
              var rel = typeof tab.rel === 'string' && tab.rel !== '' ? tab.rel : null
              if (root === null && rel === null) return
              var entry = newTabState(root, rel, tab.label)
              entry.scrollY = typeof tab.scrollY === 'number' ? tab.scrollY : 0
              restored.push(entry)
            })
            this.state.tabs = restored
          }
          if (typeof saved.active === 'number' && saved.active >= 0 && saved.active < this.state.tabs.length) {
            this.state.active = saved.active
          }
        }
      } catch (error) {
        /* a corrupt record just means a fresh start */
      }
      if (oldRoot !== null && this.state.tabs.length === 0) {
        this.state.tabs = [newTabState(oldRoot, null, null)]
        this.state.active = 0
      }
      if (this.state.tabs.length === 0) {
        this.state.tabs = [newTabState(null, null, null)]
        this.state.active = 0
      }
      if (this.state.active < 0) this.state.active = 0
      try {
        var layout = JSON.parse(window.localStorage.getItem(LAYOUT_KEY) || 'null')
        if (layout && typeof layout.panel === 'number' && layout.panel >= 240) this.state.panelWidth = layout.panel
      } catch (error) {
        /* defaults are fine */
      }
    }

    View.prototype.persist = function () {
      try {
        window.localStorage.setItem(STATE_KEY, JSON.stringify({
          tabs: this.state.tabs.map(function (tab) {
            return {
              root: tab.root,
              rel: tab.rel,
              label: tab.label,
              scrollY: Math.round(tab.scrollY || 0),
            }
          }),
          active: this.state.active,
        }))
      } catch (error) {
        /* private mode: the session still works */
      }
    }

    View.prototype.persistLayout = function () {
      try {
        window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({ panel: Math.round(this.state.panelWidth) }))
      } catch (error) {
        /* ignore */
      }
    }

    /* ------------------------------------------------------------ structure -- */

    View.prototype.build = function () {
      var self = this

      this.dom.status = el('div', { class: 'dd-status', text: '准备中…' })
      this.dom.tabs = el('div', { class: 'dd-tabs' })
      this.dom.plus = el('button', { class: 'dd-plus', title: '新建页签', text: '+', onclick: function () { self.newTab() } })
      this.dom.rootInput = el('input', {
        class: 'dd-rootinput',
        placeholder: '例如 C:\\g-workspace\\Heyang-Projects\\Project-Z-Fix',
        onkeydown: function (event) { if (event.key === 'Enter') self.applyRoot(this.value) },
      })
      this.dom.rootLabel = el('span', { class: 'dd-rootbar-label', text: '工作区' })

      this.dom.frame = el('iframe', { class: 'dd-frame', src: 'about:blank' })
      this.dom.placeholder = el('div', { class: 'dd-placeholder' })
      this.dom.view = el('div', { class: 'dd-view' }, [this.dom.frame, this.dom.placeholder])
      this.dom.panel = el('section', { class: 'dd-panel' })

      this.dom.root = el('div', { class: 'dd-root' }, [
        el('div', { class: 'dd-topbar' }, [
          el('span', { class: 'dd-title', text: '设计文档' }),
          this.dom.tabs,
          this.dom.plus,
          el('button', { class: 'dd-btn', text: '刷新', onclick: function () { self.reload(true) } }),
          el('button', { class: 'dd-btn', text: '生成派生层', onclick: function () { self.sync() } }),
        ]),
        el('div', { class: 'dd-rootbar' }, [
          this.dom.rootLabel,
          this.dom.rootInput,
          el('button', { class: 'dd-btn', text: '打开', onclick: function () { self.applyRoot(self.dom.rootInput.value) } }),
        ]),
        el('div', { class: 'dd-body' }, [
          this.dom.view,
          this.buildGutter(),
          this.dom.panel,
        ]),
        this.dom.status,
      ])

      this.dom.frame.addEventListener('load', function () {
        var tab = self.activeTab()
        if (tab === null) return
        try {
          if (tab.scrollY) self.dom.frame.contentWindow.scrollTo(0, tab.scrollY)
        } catch (error) {
          /* frame not scrollable yet */
        }
        // Re-draw the "you are editing this" outline after every (re)load.
        self.postMark(self.state.sel === null ? null : self.state.sel.ddPath)
        try {
          var frameWindow = self.dom.frame.contentWindow
          frameWindow.addEventListener('scroll', function () {
            var active = self.activeTab()
            if (active === null) return
            active.scrollY = frameWindow.scrollY
            if (self.scrollTimer) clearTimeout(self.scrollTimer)
            self.scrollTimer = setTimeout(function () { self.persist() }, 400)
          }, { passive: true })
        } catch (error) {
          /* no listener access; offsets still save on tab switch */
        }
      })
      this.onMessage = function (event) { self.receive(event) }

      this.dom.root.addEventListener('contextmenu', function (event) {
        var target = event.target
        var tag = target && target.tagName ? String(target.tagName).toLowerCase() : ''
        if (tag === 'input' || tag === 'textarea') return
        event.preventDefault()
        self.openMenu(event.clientX, event.clientY, self.menuItems())
      })

      this.renderTabs()
      this.renderRootBar()
      this.renderPlaceholder()
      this.renderPanel()
      this.applyWidths()
    }

    View.prototype.buildGutter = function () {
      var self = this
      var gutter = el('div', { class: 'dd-gutter', title: '拖动调整宽度，双击复位' })
      gutter.addEventListener('pointerdown', function (event) {
        if (event.button !== 0) return
        event.preventDefault()
        var startX = event.clientX
        var startPanel = self.state.panelWidth
        var panelMax = Math.max(320, Math.round(self.dom.root.clientWidth * 0.7))

        gutter.classList.add('dragging')
        // The document lives in an iframe: without this, dragging leftwards puts
        // the pointer inside the frame, which then eats every pointermove and the
        // drag dies. Switching the frame off keeps the events in this document.
        self.dom.root.classList.add('dd-dragging')
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'

        function move(moveEvent) {
          self.state.panelWidth = Math.min(panelMax, Math.max(240, startPanel - (moveEvent.clientX - startX)))
          self.applyWidths()
        }
        function finish() {
          gutter.classList.remove('dragging')
          self.dom.root.classList.remove('dd-dragging')
          document.body.style.cursor = ''
          document.body.style.userSelect = ''
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', finish)
          window.removeEventListener('pointercancel', finish)
          window.removeEventListener('blur', finish)
          self.persistLayout()
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', finish)
        window.addEventListener('pointercancel', finish)
        window.addEventListener('blur', finish)
      })
      gutter.addEventListener('dblclick', function () {
        self.state.panelWidth = 380
        self.applyWidths()
        self.persistLayout()
      })
      return gutter
    }

    View.prototype.applyWidths = function () {
      this.dom.panel.style.width = this.state.panelWidth + 'px'
    }

    /**
     * Attaches the (persistent) view to a freshly rendered host node.
     *
     * The shell unmounts the activity page whenever you switch away and back,
     * so this runs more than once per session. The View instance is kept in a
     * module-level singleton: re-attaching only moves the DOM back in, it never
     * rebuilds state — the selected block, the edit draft and the open tabs are
     * still there when you come back.
     */
    View.prototype.bind = function (host) {
      if (this.dom.root.parentNode) this.dom.root.parentNode.removeChild(this.dom.root)
      host.append(this.dom.root)
      window.removeEventListener('message', this.onMessage)
      window.addEventListener('message', this.onMessage)
      if (this.started === true) return
      this.started = true
      this.refresh()
    }

    View.prototype.unbind = function () {
      window.removeEventListener('message', this.onMessage)
      this.captureScroll()
      this.closeMenu()
      if (this.dom.root.parentNode) this.dom.root.parentNode.removeChild(this.dom.root)
    }

    View.prototype.dispose = function () {
      this.unbind()
    }

    View.prototype.status = function (text) {
      this.dom.status.textContent = text
    }

    /** Talks to the overlay inside the document frame. */
    View.prototype.postToFrame = function (message) {
      try {
        var target = this.dom.frame.contentWindow
        if (!target) return
        target.postMessage(Object.assign({ source: 'dsh-design-doc' }, message), window.location.origin)
      } catch (error) {
        /* the frame is between documents; the next load re-marks */
      }
    }

    /** Outlines the block the inspector is editing, or clears the outline. */
    View.prototype.postMark = function (ddPath) {
      this.postToFrame({ type: 'mark', ddPath: ddPath === null || ddPath === undefined ? null : ddPath })
    }

    /* -------------------------------------------------------------- tabs -- */

    View.prototype.activeTab = function () {
      return this.state.tabs[this.state.active] || null
    }

    View.prototype.activeRoot = function () {
      var tab = this.activeTab()
      return tab === null ? null : tab.root
    }

    View.prototype.activeRel = function () {
      var tab = this.activeTab()
      return tab === null ? null : tab.rel
    }

    View.prototype.manifestOf = function (root) {
      return root === null || root === undefined ? null : (this.manifests[root] || null)
    }

    View.prototype.activeManifest = function () {
      return this.manifestOf(this.activeRoot())
    }

    View.prototype.documentOf = function (rel) {
      var manifest = this.activeManifest()
      var found = null
      ;((manifest && manifest.modules) || []).forEach(function (module) {
        (module.documents || []).forEach(function (document) {
          if (document.rel === rel) found = document
        })
      })
      return found
    }

    /** Loads (and caches) the manifest for one workspace root. */
    View.prototype.loadManifest = function (root) {
      var self = this
      if (root === null || root === undefined || root === '') return Promise.resolve(null)
      if (this.manifests[root]) return Promise.resolve(this.manifests[root])
      return fetch(PREFIX + '/manifest?root=' + encodeURIComponent(root))
        .then(function (response) { return response.json() })
        .then(function (data) {
          if (!data.ok) {
            self.manifestErrors[root] = (data.error && data.error.message) || '读不到文档库'
            return null
          }
          delete self.manifestErrors[root]
          self.manifests[root] = data
          return data
        })
        .catch(function (error) {
          self.manifestErrors[root] = String((error && error.message) || error)
          return null
        })
    }

    View.prototype.newTab = function () {
      this.captureScroll()
      var current = this.activeTab()
      this.state.tabs.push(newTabState(current === null ? null : current.root, null, null))
      this.state.active = this.state.tabs.length - 1
      this.state.sel = null
      this.state.drafts = {}
      this.state.saved = false
      this.persist()
      this.renderTabs()
      this.refresh()
      this.renderPanel()
      this.dom.rootInput.focus()
    }

    View.prototype.activate = function (index) {
      if (index === this.state.active) return
      this.closeMenu()
      this.captureScroll()
      this.state.active = index
      this.state.sel = null
      this.state.drafts = {}
      this.state.saved = false
      this.persist()
      this.renderTabs()
      this.refresh()
      this.renderPanel()
    }

    View.prototype.closeTab = function (index) {
      var tab = this.state.tabs[index]
      if (tab === undefined) return
      this.captureScroll()
      this.state.tabs.splice(index, 1)
      if (this.state.tabs.length === 0) {
        this.state.tabs.push(newTabState(null, null, null))
        this.state.active = 0
      } else if (index < this.state.active) {
        this.state.active -= 1
      } else if (index === this.state.active) {
        this.state.active = Math.min(this.state.active, this.state.tabs.length - 1)
      }
      this.state.sel = null
      this.state.drafts = {}
      this.persist()
      this.renderTabs()
      this.refresh()
      this.renderPanel()
    }

    /** Duplicates the current page into a new tab sitting right after it. */
    View.prototype.newTabFromCurrent = function () {
      var current = this.activeTab()
      if (current === null) return
      this.captureScroll()
      var copy = newTabState(current.root, current.rel, current.label)
      copy.scrollY = current.scrollY
      this.state.tabs.splice(this.state.active + 1, 0, copy)
      this.state.active += 1
      this.state.sel = null
      this.state.drafts = {}
      this.state.saved = false
      this.persist()
      this.renderTabs()
      this.refresh()
      this.renderPanel()
    }

    /* -------------------------------------------------------------- menu -- */

    View.prototype.menuItems = function () {
      var self = this
      return [
        { label: '新页签显示', run: function () { self.newTabFromCurrent() } },
        { label: '刷新', run: function () { self.reload(true) } },
        { label: '关闭当前页签', run: function () { self.closeTab(self.state.active) } },
      ]
    }

    View.prototype.openMenu = function (x, y, items) {
      var self = this
      this.closeMenu()
      var menu = el('div', { class: 'dd-ctx' })
      items.forEach(function (item) {
        menu.append(el('button', {
          class: 'dd-ctx-item',
          text: item.label,
          onclick: function () {
            self.closeMenu()
            item.run()
          },
        }))
      })
      document.body.append(menu)
      var width = menu.offsetWidth || 160
      var height = menu.offsetHeight || 90
      var left = Math.max(8, Math.min(x, window.innerWidth - width - 8))
      var top = Math.max(8, Math.min(y, window.innerHeight - height - 8))
      menu.style.left = Math.round(left) + 'px'
      menu.style.top = Math.round(top) + 'px'
      this.menu = menu

      this.onMenuOutside = function (event) {
        if (menu.contains(event.target)) return
        self.closeMenu()
      }
      this.onMenuKey = function (event) {
        if (event.key === 'Escape') self.closeMenu()
      }
      setTimeout(function () {
        document.addEventListener('mousedown', self.onMenuOutside, true)
        document.addEventListener('keydown', self.onMenuKey, true)
      }, 0)
    }

    View.prototype.closeMenu = function () {
      if (this.menu !== undefined && this.menu !== null) {
        if (this.menu.parentNode) this.menu.parentNode.removeChild(this.menu)
        this.menu = null
      }
      if (this.onMenuOutside) {
        document.removeEventListener('mousedown', this.onMenuOutside, true)
        this.onMenuOutside = null
      }
      if (this.onMenuKey) {
        document.removeEventListener('keydown', this.onMenuKey, true)
        this.onMenuKey = null
      }
    }

    View.prototype.captureScroll = function () {
      var tab = this.activeTab()
      if (tab === null) return
      try {
        var offset = this.dom.frame.contentWindow.scrollY
        if (typeof offset === 'number') tab.scrollY = offset
      } catch (error) {
        /* frame gone */
      }
    }

    View.prototype.renderTabs = function () {
      var self = this
      clear(this.dom.tabs)
      this.state.tabs.forEach(function (tab, index) {
        var label = tab.label || (tab.rel !== null ? tab.rel.split('/').pop().replace(/\.html$/, '') : '新页签')
        var hint = (tab.root || '未设置工作区') + (tab.rel ? '\n' + tab.rel : '')
        var tabNode = el('div', {
          class: 'dd-tab' + (index === self.state.active ? ' on' : ''),
          title: hint,
          onclick: function (event) {
            if (event.target && event.target.className === 'dd-tab-close') return
            self.activate(index)
          },
        }, [
          el('span', { class: 'dd-tab-label', text: label }),
          el('span', {
            class: 'dd-tab-close',
            text: '×',
            onclick: function (event) {
              event.stopPropagation()
              self.closeTab(index)
            },
          }),
        ])
        self.dom.tabs.append(tabNode)
      })
    }

    View.prototype.renderRootBar = function () {
      var tab = this.activeTab()
      var root = tab === null ? null : tab.root
      if (this.dom.rootInput.value !== (root || '')) this.dom.rootInput.value = root || ''
      this.dom.rootLabel.textContent = '工作区'
    }

    /* --------------------------------------------------------- workspace -- */

    /** Sets the workspace of the active tab only; other tabs keep theirs. */
    View.prototype.applyRoot = function (raw) {
      var value = String(raw || '').trim()
      var tab = this.activeTab()
      if (tab === null) return
      if (value === '') {
        this.status('先填工作区根目录')
        return
      }
      tab.root = value
      tab.rel = null
      tab.label = null
      tab.scrollY = 0
      this.state.sel = null
      this.state.drafts = {}
      this.persist()
      this.renderTabs()
      this.refresh()
      this.renderPanel()
    }

    /** Re-reads the active tab's library and remounts whatever it points at. */
    View.prototype.refresh = function () {
      var self = this
      var tab = this.activeTab()
      this.renderRootBar()
      if (tab === null) return
      if (tab.root === null) {
        this.renderPlaceholder()
        this.status('这个页签还没有设置工作区')
        return
      }
      this.loadManifest(tab.root).then(function (manifest) {
        if (self.activeTab() !== tab) return
        if (manifest === null) {
          self.renderPlaceholder(self.manifestErrors[tab.root] || '读不到文档库')
          self.status('读取失败：' + (self.manifestErrors[tab.root] || '未知错误'))
          return
        }
        if (tab.rel !== null && self.documentOf(tab.rel) === null) {
          tab.rel = null
          tab.label = null
          self.persist()
        }
        if (tab.rel !== null && tab.label === null) {
          var document_ = self.documentOf(tab.rel)
          if (document_ !== null) {
            tab.label = document_.title
            self.persist()
          }
        }
        self.renderTabs()
        self.renderPlaceholder()
        self.mountActive()
        self.renderPanel()
        self.status('工作区：' + tab.root + '（' + manifest.modules.length + ' 个模块）')
      })
    }

    View.prototype.reload = function (force) {
      var tab = this.activeTab()
      if (tab === null) return
      if (force && tab.root !== null) delete this.manifests[tab.root]
      this.status('读取文档列表…')
      this.refresh()
    }

    View.prototype.openInActiveTab = function (rel) {
      if (rel === null || rel === undefined || rel === '') return
      if (!/\.html?$/i.test(rel)) {
        this.status('这个链接不是文档页，已忽略')
        return
      }
      var tab = this.activeTab()
      if (tab === null || tab.root === null) {
        this.status('先给这个页签设置工作区')
        return
      }
      var document_ = this.documentOf(rel)
      tab.rel = rel
      tab.label = document_ === null ? rel.split('/').pop().replace(/\.html$/, '') : document_.title
      tab.scrollY = 0
      this.state.sel = null
      this.state.drafts = {}
      this.state.saved = false
      this.persist()
      this.renderTabs()
      this.mountActive()
      this.renderPlaceholder()
      this.renderPanel()
    }

    View.prototype.mountActive = function () {
      var tab = this.activeTab()
      if (tab === null || tab.rel === null || tab.root === null) {
        this.dom.frame.src = 'about:blank'
        this.dom.frame.style.display = 'none'
        this.renderPlaceholder()
        return
      }
      this.dom.frame.style.display = 'block'
      this.dom.placeholder.style.display = 'none'
      this.dom.frame.src = PREFIX + '/site/' + tab.rel + '?root=' + encodeURIComponent(tab.root) + '&_r=' + Date.now()
      this.renderPlaceholder()
    }

    View.prototype.reloadFrame = function () {
      var tab = this.activeTab()
      if (tab === null || tab.rel === null || tab.root === null) return
      this.dom.frame.src = PREFIX + '/site/' + tab.rel + '?root=' + encodeURIComponent(tab.root) + '&_r=' + Date.now()
    }

    /* ---------------------------------------------------------- placeholder -- */

    View.prototype.renderPlaceholder = function (errorText) {
      var self = this
      var placeholder = this.dom.placeholder
      clear(placeholder)
      var tab = this.activeTab()
      if (tab !== null && tab.rel !== null) {
        placeholder.style.display = 'none'
        return
      }
      placeholder.style.display = 'flex'

      if (tab === null || tab.root === null) {
        placeholder.append(
          el('b', { text: '这个页签还没有工作区' }),
          el('div', { text: '填上面「工作区」那一栏：指向包含 Docs/Design 的工作区根目录，回车或点「打开」。' }),
          el('button', {
            class: 'dd-btn primary',
            text: '去填目录',
            onclick: function () { self.dom.rootInput.focus() },
          }),
        )
        return
      }

      var manifest = this.manifestOf(tab.root)
      if (manifest === null) {
        var problem = errorText || this.manifestErrors[tab.root] || null
        placeholder.append(
          el('b', { text: problem === null ? '读取中…' : problem }),
          el('div', { text: tab.root }),
        )
        if (problem !== null) {
          placeholder.append(el('button', {
            class: 'dd-btn primary',
            text: '重试',
            onclick: function () { self.reload(true) },
          }))
        }
        return
      }

      placeholder.append(
        el('b', { text: '这个页签还是空的' }),
        el('div', { text: '选一篇文档就开在当前页签里；想并排看两篇，按右上角 + 新开一个页签。' }),
      )
      var list = el('div', { class: 'dd-list' })
      ;(manifest.modules || []).forEach(function (module) {
        if (!module.documents || module.documents.length === 0) return
        list.append(el('div', { class: 'dd-list-group', text: module.title }))
        module.documents.forEach(function (document) {
          list.append(el('button', {
            class: 'dd-list-item',
            text: document.title,
            title: document.rel,
            onclick: function () { self.openInActiveTab(document.rel) },
          }))
        })
      })
      placeholder.append(list)
    }

    /* ------------------------------------------------------------- messages -- */

    View.prototype.receive = function (event) {
      if (event.origin !== window.location.origin) return
      var data = event.data
      if (!data || data.source !== 'dsh-design-doc') return
      if (data.type === 'select') {
        this.select(data)
        return
      }
      if (data.type === 'navigate') {
        var rel = siteRel(new URL(data.href).pathname)
        if (rel !== null) this.openInActiveTab(rel)
        return
      }
      if (data.type === 'contextmenu') {
        var rect = this.dom.frame.getBoundingClientRect ? this.dom.frame.getBoundingClientRect() : { left: 0, top: 0 }
        this.openMenu(rect.left + data.x, rect.top + data.y, this.menuItems())
      }
    }

    View.prototype.select = function (payload) {
      var tab = this.activeTab()
      if (tab !== null && typeof payload.scrollY === 'number') tab.scrollY = payload.scrollY
      this.persist()
      this.state.sel = payload
      this.state.drafts = {}
      this.state.svg = null
      this.state.saved = false
      this.state.mode = /<[a-z][^>]*>/i.test(payload.html || '') ? 'html' : 'text'
      this.renderPanel()
      this.postMark(payload.ddPath)
      this.status('已选中 ' + payload.ddPath)
    }

    /* ---------------------------------------------------------------- panel -- */

    View.prototype.locate = function (ddPath) {
      var parts = String(ddPath).split('|')
      var scopeId = parts[0]
      var chapter = null
      var section = null
      var current = this.documentOf(this.activeRel())
      ;((current && current.chapters) || []).forEach(function (entry) {
        if (entry.id === scopeId) chapter = entry
        ;(entry.sections || []).forEach(function (inner) {
          if (inner.id === scopeId) {
            section = inner
            chapter = entry
          }
        })
      })
      return { chapter: chapter, section: section, scopeId: scopeId, relative: parts[1] || '.' }
    }

    View.prototype.renderPanel = function () {
      var self = this
      var panel = this.dom.panel
      clear(panel)
      var sel = this.state.sel
      if (!sel) {
        panel.append(el('div', { class: 'dd-empty', text: '在中间的文档里点任意一段正文：这里会显示它的章节锚点、所在位置和关联代码，并可以直接改写。' }))
        return
      }

      var manifest = this.activeManifest() || {}
      var placed = this.locate(sel.ddPath)
      var links = (manifest.sections && manifest.sections[placed.scopeId]) || []

      var card = el('div', { class: 'dd-card' }, [
        el('div', { class: 'dd-k', text: '文档' }),
        el('div', { class: 'dd-v', text: this.activeRel() || '' }),
        el('div', { class: 'dd-k', text: '章节' }),
        el('div', { class: 'dd-v' }, [
          (placed.chapter ? (placed.chapter.module ? placed.chapter.module + ' · ' : '') + placed.chapter.title : placed.scopeId),
          placed.section ? ' / ' + placed.section.title : '',
          el('code', { text: '#' + placed.scopeId }),
        ]),
        el('div', { class: 'dd-k', text: '坐标' }),
        el('div', { class: 'dd-v' }, [el('code', { text: sel.ddPath })]),
        el('div', { class: 'dd-k', text: '原文' }),
        el('div', { class: 'dd-v', text: (sel.text || '').slice(0, 400) + ((sel.text || '').length > 400 ? '…' : '') }),
      ])

      if (links.length > 0) {
        var chips = el('div', { class: 'dd-chips' })
        links.slice(0, 12).forEach(function (file) {
          chips.append(el('span', { class: 'dd-chip', text: file.split('/').pop() }))
        })
        card.append(el('div', { class: 'dd-k', text: '关联代码（design-map）' }), chips)
      } else {
        card.append(el('div', { class: 'dd-k', text: '关联代码' }), el('div', { class: 'dd-v', text: '这一节还没有代码关联' }))
      }

      // A block whose content is a picture: the only thing editable here is the
      // <img> tag itself, so say so instead of showing an empty text box.
      var imageMatch = /<img\b[^>]*src="([^"]*)"/i.exec(sel.html || '')
      var svgEditor = null
      if (imageMatch !== null) {
        card.append(
          el('div', { class: 'dd-k', text: '图片' }),
          el('div', { class: 'dd-v' }, [el('code', { text: imageMatch[1] })]),
          el('div', { class: 'dd-hint', text: '这一块的内容是图片：能改的是 <img> 标签本身（src / alt / style）。图里的文字存在它指向的 SVG 文件里，下面直接改那段文字。' }),
        )
        if (/\.svg(\?|#|$)/i.test(imageMatch[1])) svgEditor = this.buildSvgEditor(imageMatch[1])
      }

      var editor = el('textarea', { class: 'dd-editor', spellcheck: 'false' })
      var drafts = this.state.drafts || {}
      editor.value = drafts[this.state.mode] !== undefined
        ? drafts[this.state.mode]
        : (this.state.mode === 'html' ? (sel.html || '') : (sel.text || ''))

      var modes = el('div', { class: 'dd-modes' }, [
        el('button', {
          class: 'dd-mode' + (this.state.mode === 'text' ? ' on' : ''),
          text: '文本',
          onclick: function () { self.switchMode('text') },
        }),
        el('button', {
          class: 'dd-mode' + (this.state.mode === 'html' ? ' on' : ''),
          text: 'HTML',
          onclick: function () { self.switchMode('html') },
        }),
      ])

      var hint = this.state.mode === 'text'
        ? '文本模式写回纯文本；原文里的加粗、链接等标记会被丢掉，需要保留就切到 HTML。'
        : 'HTML 模式写回元素的 innerHTML，保留标签。'

      var diffBox = el('pre', { class: 'dd-diff', style: 'display:none' })
      this.dom.diffBox = diffBox

      var parts = [card]
      if (svgEditor !== null) parts.push(svgEditor)
      parts.push(
        modes,
        editor,
        el('div', { class: 'dd-hint', text: hint }),
        el('div', { class: 'dd-actions' }, [
          el('button', { class: 'dd-btn primary', text: '保存到源文件', onclick: function () { self.save(editor) } }),
          el('button', { class: 'dd-btn', text: '发送到会话', onclick: function () { self.send(editor) } }),
        ]),
        diffBox,
      )
      panel.append.apply(panel, parts)
      this.dom.editor = editor
    }

    /** Editor for the `<text>` runs of the SVG the selected picture points at. */
    View.prototype.buildSvgEditor = function (src) {
      var self = this
      var box = el('div', { class: 'dd-svg' })
      var svg = this.state.svg

      if (svg === null || svg.src !== src) {
        this.loadSvgTexts(src)
        box.append(el('div', { class: 'dd-hint', text: '读取图内文字…' }))
        return box
      }
      if (svg.failed === true) {
        box.append(el('div', { class: 'dd-hint', text: '读不到这个 SVG：' + (svg.error || '未知错误') }))
        return box
      }

      box.append(el('div', { class: 'dd-hint', text: '图内文字（' + svg.file + '）' }))
      svg.texts.forEach(function (item, position) {
        box.append(el('div', { class: 'dd-svg-row' }, [
          el('span', { class: 'dd-svg-no', text: String(position + 1) }),
          el('input', {
            class: 'dd-svg-input',
            value: item.text,
            oninput: function () { item.text = this.value },
          }),
        ]))
      })
      box.append(el('div', { class: 'dd-actions' }, [
        el('button', { class: 'dd-btn primary', text: '保存 SVG', onclick: function () { self.saveSvg() } }),
      ]))
      return box
    }

    View.prototype.loadSvgTexts = function (src) {
      var self = this
      var tab = this.activeTab()
      if (tab === null || tab.root === null || tab.rel === null) return
      this.state.svg = { src: src, texts: [], loading: true }
      fetch(PREFIX + '/svg?root=' + encodeURIComponent(tab.root) + '&rel=' + encodeURIComponent(tab.rel) + '&src=' + encodeURIComponent(src))
        .then(function (response) { return response.json() })
        .then(function (data) {
          if (self.state.svg === null || self.state.svg.src !== src) return
          if (!data.ok) {
            self.state.svg = { src: src, texts: [], failed: true, error: (data.error && data.error.message) || '未知错误' }
          } else {
            self.state.svg = {
              src: src,
              file: data.file,
              texts: (data.texts || []).map(function (item) { return { index: item.index, text: item.text, original: item.text } }),
            }
          }
          if (self.state.sel !== null && self.state.sel.ddPath !== null) self.renderPanel()
        })
        .catch(function (error) {
          if (self.state.svg === null || self.state.svg.src !== src) return
          self.state.svg = { src: src, texts: [], failed: true, error: String((error && error.message) || error) }
          self.renderPanel()
        })
    }

    View.prototype.saveSvg = function () {
      var self = this
      var tab = this.activeTab()
      var svg = this.state.svg
      if (tab === null || tab.rel === null || svg === null || svg.texts === undefined) return
      this.status('写回 SVG…')
      fetch(PREFIX + '/svg-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root: tab.root,
          rel: tab.rel,
          src: svg.src,
          texts: svg.texts.map(function (item) {
            return { index: item.index, original: item.original, text: item.text }
          }),
        }),
      })
        .then(function (response) { return response.json() })
        .then(function (data) {
          if (!data.ok) {
            self.status('SVG 保存失败：' + ((data.error && data.error.message) || '未知错误'))
            return
          }
          if (data.changed === 0) {
            self.status('图内文字没有变化')
            return
          }
          svg.texts.forEach(function (item) { item.original = item.text })
          self.reloadFrame()
          self.status('已写回 ' + data.file + '（' + data.changed + ' 处）')
        })
        .catch(function (error) { self.status('SVG 保存失败：' + String((error && error.message) || error)) })
    }

    View.prototype.switchMode = function (mode) {
      if (mode === this.state.mode) return
      if (this.dom.editor) {
        this.state.drafts = this.state.drafts || {}
        this.state.drafts[this.state.mode] = this.dom.editor.value
      }
      this.state.mode = mode
      this.renderPanel()
    }

    View.prototype.payload = function (editor) {
      if (this.state.mode === 'html') return editor.value
      return escapeHtml(editor.value).replace(/\r/g, '').replace(/\n+/g, ' ')
    }

    /* ----------------------------------------------------------- save / send -- */

    View.prototype.save = function (editor) {
      var self = this
      var sel = this.state.sel
      var tab = this.activeTab()
      if (tab === null || tab.root === null || tab.rel === null) {
        this.status('这个页签还没有打开文档')
        return
      }
      this.captureScroll()
      this.status('写回源文件…')
      fetch(PREFIX + '/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root: tab.root,
          rel: tab.rel,
          ddPath: sel.ddPath,
          expectText: sel.text,
          html: this.payload(editor),
        }),
      })
        .then(function (response) { return response.json() })
        .then(function (data) {
          if (!data.ok) {
            self.status('保存失败：' + ((data.error && data.error.message) || '未知错误'))
            return
          }
          if (data.changed === 0) {
            self.status('内容和原来一样，没有写入')
            return
          }
          self.state.saved = true
          self.reloadFrame()
          self.renderDiff(data.diff)
          self.status('已写回 ' + tab.rel + '（改动 ' + data.changed + ' 行）')
        })
        .catch(function (error) { self.status('保存失败：' + String((error && error.message) || error)) })
    }

    View.prototype.renderDiff = function (rows) {
      var box = this.dom.diffBox
      if (!box) return
      box.textContent = (rows || []).map(function (row) {
        return 'L' + row.line + '\n- ' + row.before + '\n+ ' + row.after
      }).join('\n\n')
      box.style.display = rows && rows.length > 0 ? 'block' : 'none'
    }

    View.prototype.buildPrompt = function (editor) {
      var sel = this.state.sel
      var placed = this.locate(sel.ddPath)
      var manifest = this.activeManifest() || {}
      var links = (manifest.sections && manifest.sections[placed.scopeId]) || []
      var before = (sel.text || '').trim()
      var after = (this.state.mode === 'html' ? editor.value.replace(/<[^>]*>/g, '') : editor.value).trim()
      var tab = this.activeTab()
      var lines = []
      lines.push('【设计文档修改】' + (tab === null ? '' : tab.rel || ''))
      lines.push('文档库：' + (tab === null ? '' : tab.root || ''))
      lines.push('章节：' + (placed.chapter ? (placed.chapter.module ? placed.chapter.module + ' · ' : '') + placed.chapter.title : placed.scopeId))
      if (placed.section) lines.push('小节：' + placed.section.title + '（#' + placed.scopeId + '）')
      lines.push('位置：' + sel.ddPath)
      lines.push('原文：' + before)
      lines.push('改成：' + after)
      lines.push(this.state.saved
        ? '状态：已经写回源文件，请按上面的新措辞同步代码'
        : '状态：还没写回源文件 —— 请先把这一处改成上面的措辞，再同步代码')
      if (links.length > 0) lines.push('关联代码（design-map.json 里这一节绑定的文件）：' + links.map(function (file) { return file.split('/').pop() }).join('、'))
      lines.push('')
      lines.push('收尾请你自己执行，不要说「记得去跑」：')
      if (tab !== null && tab.root !== null) {
        var root = tab.root.replace(/[\\/]+$/, '')
        lines.push('1. python "' + root + '/Docs/Design/scripts/build_docs.py"')
        lines.push('2. python "' + root + '/Tools/DesignSync/map.py" status —— 按 dirty 列表逐节处理，处理完 accept')
      }
      lines.push('如果改动落在数值/规则上，一并检查并同步对应的 data/*.json。')
      return lines.join('\n')
    }

    View.prototype.send = function (editor) {
      var self = this
      var text = this.buildPrompt(editor)
      var result = insertIntoComposer(text)
      if (result.ok) {
        this.status('已插入会话输入框，按回车发送')
        return
      }
      copyText(text).then(function (ok) {
        self.status(ok ? '插入失败（' + result.reason + '），已复制到剪贴板' : '插入失败（' + result.reason + '），请手动复制')
      })
    }

    View.prototype.sync = function () {
      var self = this
      var tab = this.activeTab()
      if (tab === null || tab.root === null) {
        this.status('这个页签还没有设置工作区')
        return
      }
      this.status('跑 scripts/build_docs.py…')
      fetch(PREFIX + '/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: tab.root }),
      })
        .then(function (response) { return response.json() })
        .then(function (data) {
          if (!data.ok) {
            self.status('派生层生成失败：' + String(data.stderr || (data.error && data.error.message) || '').slice(0, 160))
            return
          }
          self.status('派生层已重新生成：' + String(data.stdout || '').trim().split('\n').slice(-2).join(' | '))
        })
        .catch(function (error) { self.status('派生层生成失败：' + String((error && error.message) || error)) })
    }

    /* --------------------------------------------------------------- mount -- */

    function ensureStyles() {
      if (document.getElementById(STYLE_ID) !== null) return
      var style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.append(style)
    }

    function Glyph(props) {
      var size = (props && props.size) || 20
      return React.createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      }, [
        React.createElement('path', { key: 'a', d: 'M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z' }),
        React.createElement('path', { key: 'b', d: 'M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z' }),
        React.createElement('path', { key: 'c', d: 'M7 9h1.5M15.5 9H17M7 13h1.5M15.5 13H17' }),
      ])
    }

    function Page() {
      var host = React.useRef(null)
      React.useEffect(function () {
        var mount = el('div', { style: 'flex:1 1 auto;min-width:0;min-height:0;display:flex' })
        host.current.append(mount)
        var view = getView()
        view.bind(mount)
        return function () { view.unbind() }
      }, [])
      return React.createElement('div', {
        ref: host,
        style: { height: '100%', width: '100%', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' },
      })
    }

    function apply(ctx) {
      ensureStyles()

      try {
        ctx.inject(['sessions'], function (child) { services.sessions = child.sessions })
      } catch (error) {
        console.warn('[dsh-design-doc] sessions unavailable', error)
      }
      try {
        ctx.inject(['conversation'], function (child) { services.conversation = child.conversation })
      } catch (error) {
        console.warn('[dsh-design-doc] conversation unavailable', error)
      }

      ctx.inject(['slots'], function (child) {
        child.slots.inject('shell.activitybar.items', function () {
          return child.slots.register({
            name: 'shell.activitybar.items',
            id: ACTIVITY_ID,
            order: 118,
            label: function () { return '设计文档' },
          }, Glyph)
        })
        child.slots.inject('shell.activity', function () {
          return child.slots.register({ name: 'shell.activity', key: ACTIVITY_ID }, Page)
        })
      })
    }

    return { apply: apply, Page: Page, View: View, getView: getView }
  },
})
