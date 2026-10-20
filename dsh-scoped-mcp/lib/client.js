/**
 * dsh-scoped-mcp browser half.
 *
 * Contributes the MCP entry of the left activity rail and the configuration
 * page it opens. The page lists the currently open Workspaces on the left
 * (with "全局配置" pinned above them), and the selected scope's MCP servers on
 * the right as a card masonry: each card shows the server name, its live
 * connection state, an enable/stop control, edit, and delete.
 *
 * All data comes from the host half's same-origin JSON API
 * (`GET /dsh-scoped-mcp/state`, `POST /dsh-scoped-mcp/action`); the page polls
 * the state while visible so a connection that drops or that an agent started
 * elsewhere becomes visible without a manual refresh.
 */
window.__ModuleLoader__.load({
  id: 'dsh-scoped-mcp',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement

    const ACTIVITY_ID = 'dsh-scoped-mcp'
    const PANEL_LABEL = 'MCP 配置'
    const POLL_INTERVAL_MS = 2000

    /** Same-origin mount of this plugin's host routes. */
    const MOUNT = (() => {
      try {
        return new URL('dsh-scoped-mcp', document.baseURI).href.replace(/\/$/, '')
      } catch {
        return '/dsh-scoped-mcp'
      }
    })()

    // ── API ───────────────────────────────────────────────────────────────

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }

    async function readJson(response) {
      let payload = null
      try {
        payload = await response.json()
      } catch {
        throw new Error(`宿主返回了非 JSON 响应（HTTP ${response.status}）`)
      }
      return payload
    }

    async function fetchState() {
      const response = await fetch(`${MOUNT}/state`, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      })
      const payload = await readJson(response)
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error ?? `读取 MCP 配置失败（HTTP ${response.status}）`)
      }
      return payload.state
    }

    async function postAction(body) {
      const response = await fetch(`${MOUNT}/action`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await readJson(response)
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error ?? `操作失败（HTTP ${response.status}）`)
      }
      return payload
    }

    /** The wire form of one page scope selection. */
    function scopeRef(scope) {
      if (scope.kind === 'global') return { kind: 'global' }
      return { kind: 'workspace', workspaceId: scope.id }
    }

    // ── Styles ────────────────────────────────────────────────────────────

    const STYLE_ID = 'dshmcp-styles'
    const CSS = `
.dshmcp-page{height:100%;min-height:0;display:flex;overflow:hidden;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.dshmcp-side{flex:0 0 268px;width:268px;box-sizing:border-box;display:flex;flex-direction:column;gap:4px;padding:14px 10px 12px;border-right:1px solid var(--dsw-alias-border-l2);overflow:auto}
.dshmcp-side-title{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);padding:0 9px 8px}
.dshmcp-scope{display:flex;align-items:flex-start;gap:9px;width:100%;box-sizing:border-box;padding:8px 9px;border:1px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dshmcp-scope:hover{background:var(--dsw-alias-bg-layer-3)}
.dshmcp-scope.is-active{background:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-border-l1);box-shadow:inset 2px 0 0 var(--dsw-alias-state-business-primary)}
.dshmcp-scope-icon{display:grid;place-items:center;flex:none;width:18px;height:20px;color:var(--dsw-alias-label-tertiary)}
.dshmcp-scope.is-active .dshmcp-scope-icon{color:var(--dsw-alias-state-business-primary)}
.dshmcp-scope-text{display:flex;flex-direction:column;min-width:0;flex:1}
.dshmcp-scope-name{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshmcp-scope-path{font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr}
.dshmcp-scope-count{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:0 6px;line-height:17px}
.dshmcp-side-divider{display:flex;align-items:center;gap:8px;margin:10px 9px 2px;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dshmcp-side-divider::after{content:'';flex:1;height:1px;background:var(--dsw-alias-border-l2)}
.dshmcp-side-empty{padding:6px 9px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.dshmcp-side-foot{margin-top:auto;padding:10px 9px 0;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dshmcp-main{flex:1;min-width:0;overflow:auto;padding:18px 22px 56px;box-sizing:border-box;position:relative}
.dshmcp-head{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:14px}
.dshmcp-head-text{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
.dshmcp-title{font-size:17px;font-weight:600;line-height:24px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshmcp-sub{font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshmcp-config-path{font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace)}
.dshmcp-head-actions{display:flex;gap:8px;align-items:center;flex:none}
.dshmcp-btn{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;height:30px;padding:0 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.dshmcp-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3)}
.dshmcp-btn:disabled{opacity:.55;cursor:default}
.dshmcp-btn-primary{background:var(--dsw-alias-state-business-primary);border-color:transparent;color:#fff}
.dshmcp-btn-primary:hover:not(:disabled){background:var(--dsw-alias-state-business-primary);filter:brightness(1.06)}
.dshmcp-btn-danger{color:var(--dsw-alias-state-error-primary)}
.dshmcp-btn-confirming{border-color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.dshmcp-btn-ghost{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary)}
.dshmcp-btn-ghost:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3)}
.dshmcp-notice{display:flex;gap:8px;align-items:flex-start;margin:0 0 14px;padding:9px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);font-size:12px;color:var(--dsw-alias-label-secondary)}
.dshmcp-notice b{color:var(--dsw-alias-label-primary);font-weight:600}
.dshmcp-error-banner{display:flex;align-items:center;gap:8px;margin:0 0 14px;padding:9px 12px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-state-error-primary);font-size:12px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}
.dshmcp-grid{column-width:286px;column-gap:12px;margin-top:2px}
.dshmcp-card{break-inside:avoid;-webkit-column-break-inside:avoid;display:flex;flex-direction:column;gap:8px;margin:0 0 12px;padding:12px 13px 11px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-lv2)}
.dshmcp-card-head{display:flex;align-items:center;gap:8px;min-width:0}
.dshmcp-card-name{flex:1;min-width:0;font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshmcp-status{display:inline-flex;align-items:center;gap:5px;flex:none;font-size:11px;font-weight:500}
.dshmcp-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}
.dshmcp-tone-success{color:var(--dsw-alias-state-success-primary)}
.dshmcp-tone-warning{color:var(--dsw-alias-state-warn-primary)}
.dshmcp-tone-error{color:var(--dsw-alias-state-error-primary)}
.dshmcp-tone-idle{color:var(--dsw-alias-state-idle-primary)}
.dshmcp-badges{display:flex;flex-wrap:wrap;gap:5px}
.dshmcp-badge{font-size:10px;line-height:16px;padding:0 6px;border-radius:5px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dshmcp-badge-warn{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 40%,transparent);color:var(--dsw-alias-state-warn-primary)}
.dshmcp-target{font-size:11px;color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr}
.dshmcp-card-error{margin:0;padding:6px 8px;border-radius:6px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 7%,transparent);color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px;word-break:break-word;max-height:78px;overflow:auto}
.dshmcp-card-actions{display:flex;align-items:center;gap:6px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1)}
.dshmcp-card-actions .dshmcp-btn{height:27px;padding:0 9px;font-size:12px}
.dshmcp-spacer{flex:1}
.dshmcp-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:220px;padding:24px;border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-secondary);text-align:center}
.dshmcp-empty-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dshmcp-empty-text{font-size:12px;max-width:420px}
.dshmcp-loading{display:flex;align-items:center;justify-content:center;height:100%;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dshmcp-backdrop{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.42);padding:24px}
.dshmcp-dialog{width:660px;max-width:min(660px,100%);max-height:min(84vh,860px);display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-lv3);overflow:hidden}
.dshmcp-dialog-head{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dshmcp-dialog-title{font-size:14px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshmcp-dialog-scope{font-size:11px;color:var(--dsw-alias-label-tertiary);flex:none}
.dshmcp-dialog-body{padding:14px 18px;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}
.dshmcp-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.dshmcp-field-wide{grid-column:1 / -1}
.dshmcp-label{font-size:11px;color:var(--dsw-alias-label-secondary)}
.dshmcp-hint{font-size:10px;color:var(--dsw-alias-label-tertiary)}
.dshmcp-input,.dshmcp-select,.dshmcp-textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;padding:5px 8px}
.dshmcp-input,.dshmcp-select{height:30px}
.dshmcp-textarea{min-height:56px;resize:vertical;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11px;line-height:17px}
.dshmcp-input:focus,.dshmcp-select:focus,.dshmcp-textarea:focus{outline:2px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,transparent);outline-offset:-1px}
.dshmcp-dialog-error{margin:0 18px 10px;padding:7px 10px;border-radius:6px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent);color:var(--dsw-alias-state-error-primary);font-size:11px;max-height:90px;overflow:auto;white-space:pre-wrap}
.dshmcp-dialog-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--dsw-alias-border-l2)}
.dshmcp-toasts{position:fixed;right:22px;bottom:22px;z-index:1200;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:min(420px,calc(100vw - 44px))}
.dshmcp-toast{pointer-events:auto;display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border-radius:var(--dsw-radius-sm);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-lv3);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);word-break:break-word;animation:dshmcp-toast-in .16s ease-out}
.dshmcp-toast-icon{flex:none;margin-top:1px}
.dshmcp-toast-success .dshmcp-toast-icon{color:var(--dsw-alias-state-success-primary)}
.dshmcp-toast-error .dshmcp-toast-icon{color:var(--dsw-alias-state-error-primary)}
.dshmcp-toast-info .dshmcp-toast-icon{color:var(--dsw-alias-state-business-primary)}
@keyframes dshmcp-toast-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.dshmcp-toast{animation:none}}
@media (max-width:720px){.dshmcp-side{flex-basis:216px;width:216px}.dshmcp-main{padding:14px 14px 48px}}
`

    function injectStyles() {
      if (document.getElementById(STYLE_ID) !== null) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }

    // ── Icons ─────────────────────────────────────────────────────────────

    function svg(size, children, extra) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        ...(extra ?? {}),
      }, ...children)
    }

    const ICONS = {
      plug: size => svg(size, [
        h('path', { key: 'a', d: 'M9 3v5M15 3v5' }),
        h('path', { key: 'b', d: 'M6 8h12v3a6 6 0 0 1-12 0V8z' }),
        h('path', { key: 'c', d: 'M12 17v4' }),
      ]),
      globe: size => svg(size, [
        h('circle', { key: 'a', cx: 12, cy: 12, r: 9 }),
        h('path', { key: 'b', d: 'M3 12h18' }),
        h('path', { key: 'c', d: 'M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z' }),
      ]),
      folder: size => svg(size, [
        h('path', { key: 'a', d: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h9A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V7.5z' }),
      ]),
      plus: size => svg(size, [h('path', { key: 'a', d: 'M12 5v14M5 12h14' })]),
      refresh: size => svg(size, [
        h('path', { key: 'a', d: 'M20 11a8 8 0 1 0-2.3 5.7' }),
        h('path', { key: 'b', d: 'M20 4v7h-7' }),
      ]),
      check: size => svg(size, [
        h('circle', { key: 'a', cx: 12, cy: 12, r: 9 }),
        h('path', { key: 'b', d: 'M8 12.5l2.6 2.6L16 9.8' }),
      ]),
      alert: size => svg(size, [
        h('circle', { key: 'a', cx: 12, cy: 12, r: 9 }),
        h('path', { key: 'b', d: 'M12 7.5v5' }),
        h('path', { key: 'c', d: 'M12 16.2v.3' }),
      ]),
      info: size => svg(size, [
        h('circle', { key: 'a', cx: 12, cy: 12, r: 9 }),
        h('path', { key: 'b', d: 'M12 11v5.5' }),
        h('path', { key: 'c', d: 'M12 7.6v.3' }),
      ]),
    }

    function ActivityGlyph({ size = 20, active = false }) {
      return h('span', {
        style: { display: 'grid', placeItems: 'center', color: active ? 'var(--dsw-alias-state-business-primary)' : 'inherit' },
      }, ICONS.plug(size))
    }

    // ── Display helpers ───────────────────────────────────────────────────

    const STATUS = {
      connected: { label: '已连接', tone: 'success' },
      connecting: { label: '连接中…', tone: 'warning' },
      error: { label: '连接失败', tone: 'error' },
      disconnected: { label: '未连接', tone: 'idle' },
    }

    function statusOf(server) {
      if (server.state === 'connected' || server.state === 'connecting' || server.state === 'error') {
        return STATUS[server.state]
      }
      return server.disabled ? { label: '已停用', tone: 'idle' } : STATUS.disconnected
    }

    function serverTarget(server) {
      if (server.transport === 'stdio') {
        return [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')
      }
      return server.url ?? ''
    }

    function scopeSubtitle(scope) {
      if (scope.kind === 'global') return '对所有工作区生效'
      return scope.path ?? ''
    }

    /** Shorten a home-anchored path for the rail; the tooltip keeps the original. */
    function shortPath(path) {
      if (typeof path !== 'string') return ''
      return path
    }

    // ── Toasts ────────────────────────────────────────────────────────────

    function ToastStack({ toasts }) {
      if (toasts.length === 0) return null
      return h('div', { className: 'dshmcp-toasts', role: 'status', 'aria-live': 'polite' },
        toasts.map((toast) => h('div', {
          key: toast.id,
          className: `dshmcp-toast dshmcp-toast-${toast.tone}`,
        },
          h('span', { className: 'dshmcp-toast-icon' },
            ICONS[toast.tone === 'success' ? 'check' : toast.tone === 'error' ? 'alert' : 'info'](15)),
          h('span', null, toast.text))),
      )
    }

    // ── Server card ───────────────────────────────────────────────────────

    function ServerCard({ server, busy, onToggle, onEdit, onRemove }) {
      const status = statusOf(server)
      const live = server.state === 'connected' || server.state === 'connecting'
      const target = serverTarget(server)
      // Two-step delete inside the card: no native confirm dialog, and a click
      // that lands by accident expires on its own.
      const [confirming, setConfirming] = React.useState(false)
      React.useEffect(() => {
        if (!confirming) return undefined
        const timer = setTimeout(() => setConfirming(false), 3000)
        return () => clearTimeout(timer)
      }, [confirming])
      const requestRemove = () => {
        if (confirming) {
          setConfirming(false)
          onRemove()
          return
        }
        setConfirming(true)
      }
      return h('article', { className: 'dshmcp-card' },
        h('div', { className: 'dshmcp-card-head' },
          h('span', { className: 'dshmcp-card-name', title: server.serverName }, server.serverName),
          h('span', { className: `dshmcp-status dshmcp-tone-${status.tone}` },
            h('i', { className: 'dshmcp-dot' }),
            status.label)),
        h('div', { className: 'dshmcp-badges' },
          h('span', { className: 'dshmcp-badge' }, server.scope === 'workspace' ? '工作区' : '全局'),
          h('span', { className: 'dshmcp-badge' }, server.transport === 'stdio' ? 'STDIO' : 'HTTP'),
          server.state === 'connected'
            ? h('span', { className: 'dshmcp-badge' }, `${server.toolCount ?? 0} 个工具`)
            : null,
          server.overridesGlobal
            ? h('span', { className: 'dshmcp-badge dshmcp-badge-warn', title: '同名全局配置在此工作区不生效' }, '覆盖全局同名')
            : null),
        h('div', { className: 'dshmcp-target', title: target }, target),
        server.state === 'error' && server.error
          ? h('pre', { className: 'dshmcp-card-error' }, server.error)
          : null,
        h('div', { className: 'dshmcp-card-actions' },
          h('button', {
            type: 'button',
            className: `dshmcp-btn${live ? '' : ' dshmcp-btn-primary'}`,
            disabled: Boolean(busy),
            onClick: onToggle,
          }, busy === 'remove'
            ? '删除中…'
            : busy
              ? (live ? '停止中…' : '连接中…')
              : (live ? '停止' : '启用')),
          h('button', { type: 'button', className: 'dshmcp-btn', disabled: Boolean(busy), onClick: onEdit }, '编辑'),
          h('span', { className: 'dshmcp-spacer' }),
          h('button', {
            type: 'button',
            className: `dshmcp-btn dshmcp-btn-danger${confirming ? ' dshmcp-btn-confirming' : ''}`,
            disabled: Boolean(busy),
            title: confirming ? '再点一次确认删除' : `删除 ${server.serverName}`,
            onClick: requestRemove,
          }, busy === 'remove' ? '删除中…' : confirming ? '确认删除' : '删除')),
      )
    }

    // ── Add / edit dialog ─────────────────────────────────────────────────

    function emptyForm() {
      return {
        serverName: '',
        transport: 'stdio',
        command: '',
        argsText: '',
        envText: '',
        cwd: '',
        url: '',
        headersText: '',
        toolCallTimeoutMs: '60000',
      }
    }

    function formFromServer(server) {
      const entries = (record) => Object.entries(record ?? {}).map(([key, value]) => `${key}=${value}`).join('\n')
      return {
        serverName: server.serverName ?? '',
        transport: server.transport === 'streamable-http' ? 'streamable-http' : 'stdio',
        command: server.command ?? '',
        argsText: (server.args ?? []).join('\n'),
        envText: entries(server.env),
        cwd: server.cwd ?? '',
        url: server.url ?? '',
        headersText: entries(server.headers),
        toolCallTimeoutMs: String(server.toolCallTimeoutMs ?? 60000),
      }
    }

    function parsePairs(text) {
      const result = {}
      for (const line of String(text ?? '').split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed === '' || trimmed.startsWith('#')) continue
        const index = trimmed.indexOf('=')
        if (index <= 0) throw new Error(`「${trimmed}」不是 KEY=VALUE 形式`)
        result[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim()
      }
      return result
    }

    function buildServer(form) {
      const serverName = form.serverName.trim()
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(serverName)) {
        throw new Error('名称只能包含字母、数字、下划线和连字符，长度 1–32')
      }
      const timeout = Number.parseInt(form.toolCallTimeoutMs, 10)
      const server = {
        serverName,
        transport: form.transport,
        toolCallTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 60000,
      }
      if (form.transport === 'stdio') {
        if (form.command.trim() === '') throw new Error('STDIO 服务器需要填写命令')
        return {
          ...server,
          command: form.command.trim(),
          args: form.argsText.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
          env: parsePairs(form.envText),
          cwd: form.cwd.trim(),
        }
      }
      if (form.url.trim() === '') throw new Error('HTTP 服务器需要填写地址')
      return { ...server, url: form.url.trim(), headers: parsePairs(form.headersText) }
    }

    function Field({ label, hint, wide, children }) {
      return h('label', { className: `dshmcp-field${wide ? ' dshmcp-field-wide' : ''}` },
        h('span', { className: 'dshmcp-label' }, label),
        children,
        hint ? h('span', { className: 'dshmcp-hint' }, hint) : null)
    }

    function ServerDialog({ scope, server, onClose, onSubmit }) {
      const editing = server !== undefined
      const [form, setForm] = React.useState(() => (editing ? formFromServer(server) : emptyForm()))
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const update = (key) => (event) => {
        const value = event.target.value
        setForm(previous => ({ ...previous, [key]: value }))
      }
      React.useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key === 'Escape' && !busy) onClose()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [busy, onClose])
      const submit = async () => {
        setError(null)
        let input
        try {
          input = buildServer(form)
        } catch (failure) {
          setError(messageOf(failure))
          return
        }
        setBusy(true)
        try {
          await onSubmit(input, editing ? server.serverName : undefined)
        } catch (failure) {
          setError(messageOf(failure))
        } finally {
          setBusy(false)
        }
      }
      return h('div', {
        className: 'dshmcp-backdrop',
        onMouseDown: (event) => { if (event.target === event.currentTarget && !busy) onClose() },
      },
        h('div', { className: 'dshmcp-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': editing ? '编辑 MCP 服务器' : '添加 MCP 服务器' },
          h('div', { className: 'dshmcp-dialog-head' },
            h('span', { className: 'dshmcp-dialog-title' }, editing ? `编辑 MCP 服务器「${server.serverName}」` : '添加 MCP 服务器'),
            h('span', { className: 'dshmcp-dialog-scope' }, scope.kind === 'global' ? '全局配置' : scope.title)),
          h('div', { className: 'dshmcp-dialog-body' },
            h(Field, { label: '名称', hint: editing ? '重命名会移动这条配置' : '字母、数字、下划线或连字符，1–32 个字符', wide: true },
              h('input', { className: 'dshmcp-input', value: form.serverName, onChange: update('serverName'), placeholder: 'github' })),
            h(Field, { label: '传输方式' },
              h('select', { className: 'dshmcp-select', value: form.transport, onChange: update('transport') },
                h('option', { value: 'stdio' }, '标准输入输出（STDIO）'),
                h('option', { value: 'streamable-http' }, 'HTTP（Streamable HTTP）'))),
            h(Field, { label: '单次调用超时（毫秒）' },
              h('input', { className: 'dshmcp-input', value: form.toolCallTimeoutMs, onChange: update('toolCallTimeoutMs'), inputMode: 'numeric' })),
            form.transport === 'stdio'
              ? h(Field, { label: '命令', wide: true, hint: '可执行文件，例如 npx、node 或 uvx' },
                h('input', { className: 'dshmcp-input', value: form.command, onChange: update('command'), placeholder: 'npx' }))
              : h(Field, { label: '地址', wide: true, hint: 'MCP Streamable HTTP 端点' },
                h('input', { className: 'dshmcp-input', value: form.url, onChange: update('url'), placeholder: 'http://localhost:3000/mcp' })),
            form.transport === 'stdio'
              ? h(Field, { label: '参数', wide: true, hint: '每行一个参数' },
                h('textarea', { className: 'dshmcp-textarea', value: form.argsText, onChange: update('argsText'), placeholder: '-y\n@modelcontextprotocol/server-github' }))
              : null,
            form.transport === 'stdio'
              ? h(Field, { label: '环境变量', wide: true, hint: '每行 KEY=VALUE' },
                h('textarea', { className: 'dshmcp-textarea', value: form.envText, onChange: update('envText'), placeholder: 'GITHUB_TOKEN=xxx' }))
              : h(Field, { label: '请求头', wide: true, hint: '每行 KEY=VALUE' },
                h('textarea', { className: 'dshmcp-textarea', value: form.headersText, onChange: update('headersText'), placeholder: 'Authorization=Bearer xxx' })),
            form.transport === 'stdio'
              ? h(Field, { label: '工作目录', wide: true, hint: '留空时继承 DSH 进程的目录' },
                h('input', { className: 'dshmcp-input', value: form.cwd, onChange: update('cwd'), placeholder: 'C:\\\\path\\\\to\\\\project' }))
              : null),
          error !== null ? h('div', { className: 'dshmcp-dialog-error' }, error) : null,
          h('div', { className: 'dshmcp-dialog-foot' },
            h('button', { type: 'button', className: 'dshmcp-btn', onClick: onClose, disabled: busy }, '取消'),
            h('button', { type: 'button', className: 'dshmcp-btn dshmcp-btn-primary', onClick: submit, disabled: busy },
              busy ? '保存中…' : '保存'))),
      )
    }

    // ── Page ──────────────────────────────────────────────────────────────

    function McpPage() {
      const [state, setState] = React.useState(null)
      const [loadError, setLoadError] = React.useState(null)
      const [selected, setSelected] = React.useState('global')
      const [busy, setBusy] = React.useState({})
      const [dialog, setDialog] = React.useState(null)
      const [toasts, setToasts] = React.useState([])
      const alive = React.useRef(true)
      const polling = React.useRef(false)
      const toastSeq = React.useRef(0)
      const timers = React.useRef([])

      const pushToast = React.useCallback((tone, text) => {
        const id = ++toastSeq.current
        setToasts(list => [...list, { id, tone, text }])
        const timer = setTimeout(() => {
          if (!alive.current) return
          setToasts(list => list.filter(toast => toast.id !== id))
        }, tone === 'error' ? 7000 : 4200)
        timers.current.push(timer)
      }, [])

      const load = React.useCallback(async () => {
        if (polling.current) return
        polling.current = true
        try {
          const next = await fetchState()
          if (!alive.current) return
          setState(next)
          setLoadError(null)
        } catch (error) {
          if (alive.current) setLoadError(messageOf(error))
        } finally {
          polling.current = false
        }
      }, [])

      React.useEffect(() => {
        alive.current = true
        void load()
        const timer = setInterval(() => {
          if (!document.hidden) void load()
        }, POLL_INTERVAL_MS)
        return () => {
          alive.current = false
          clearInterval(timer)
          for (const handle of timers.current) clearTimeout(handle)
          timers.current = []
        }
      }, [load])

      const scopes = React.useMemo(
        () => (state === null ? [] : [state.global, ...state.workspaces]),
        [state],
      )
      React.useEffect(() => {
        if (state !== null && !scopes.some(scope => scope.key === selected)) setSelected('global')
      }, [state, scopes, selected])

      const current = scopes.find(scope => scope.key === selected) ?? (state === null ? null : state.global)

      const setBusyKey = (key, value) => {
        setBusy(previous => {
          const next = { ...previous }
          if (value === undefined) delete next[key]
          else next[key] = value
          return next
        })
      }

      const runAction = React.useCallback(async (scope, action, payload, busyKey) => {
        setBusyKey(busyKey, action)
        try {
          const result = await postAction({ action, scope: scopeRef(scope), ...payload })
          if (result.state !== undefined) setState(result.state)
          return result
        } finally {
          setBusyKey(busyKey, undefined)
        }
      }, [])

      const toggle = async (scope, server) => {
        const stopping = server.state === 'connected' || server.state === 'connecting'
        const busyKey = `${scope.key}:${server.serverName}`
        try {
          if (stopping) {
            await runAction(scope, 'stop', { serverName: server.serverName }, busyKey)
            pushToast('success', `已停止「${server.serverName}」`)
            return
          }
          const result = await runAction(scope, 'enable', { serverName: server.serverName }, busyKey)
          if (result.connected === true) {
            const count = result.toolCount ?? 0
            pushToast('success', `已连接「${server.serverName}」${count > 0 ? `，发现 ${count} 个工具` : ''}`)
          } else {
            pushToast('error', `连接「${server.serverName}」失败：${result.error ?? '未知错误'}`)
          }
        } catch (error) {
          pushToast('error', `${stopping ? '停止' : '连接'}「${server.serverName}」失败：${messageOf(error)}`)
        }
      }

      const remove = async (scope, server) => {
        try {
          await runAction(scope, 'remove', { serverName: server.serverName }, `${scope.key}:${server.serverName}`)
          pushToast('success', `已删除「${server.serverName}」`)
        } catch (error) {
          pushToast('error', `删除「${server.serverName}」失败：${messageOf(error)}`)
        }
      }

      const saveServer = async (scope, input, previousServerName) => {
        const key = `${scope.key}:dialog`
        try {
          await runAction(scope, 'save', { server: input, previousServerName }, key)
        } finally {
          setBusyKey(key, undefined)
        }
        pushToast('success', previousServerName === undefined
          ? `已添加「${input.serverName}」`
          : `已更新「${input.serverName}」`)
        setDialog(null)
      }

      const openCreate = (scope) => setDialog({ scope, server: undefined })
      const openEdit = (scope, server) => setDialog({ scope, server })

      const renderServer = (scope, server) => h(ServerCard, {
        key: server.serverName,
        server,
        busy: busy[`${scope.key}:${server.serverName}`],
        onToggle: () => { void toggle(scope, server) },
        onEdit: () => openEdit(scope, server),
        onRemove: () => { void remove(scope, server) },
      })

      if (state === null) {
        return h('div', { className: 'dshmcp-page' },
          h('div', { className: 'dshmcp-loading' }, loadError === null ? '正在读取 MCP 配置…' : `读取失败：${loadError}`),
          h(ToastStack, { toasts }))
      }

      const servers = current?.servers ?? []
      return h('div', { className: 'dshmcp-page' },
        h('aside', { className: 'dshmcp-side', 'aria-label': 'MCP 作用域' },
          h('div', { className: 'dshmcp-side-title' }, PANEL_LABEL),
          h('button', {
            type: 'button',
            className: `dshmcp-scope${state.global.key === selected ? ' is-active' : ''}`,
            onClick: () => setSelected(state.global.key),
          },
          h('span', { className: 'dshmcp-scope-icon' }, ICONS.globe(16)),
          h('span', { className: 'dshmcp-scope-text' },
            h('span', { className: 'dshmcp-scope-name' }, state.global.title),
            h('span', { className: 'dshmcp-scope-path' }, '所有工作区生效')),
          h('span', { className: 'dshmcp-scope-count' }, String(state.global.configuredCount))),
          h('div', { className: 'dshmcp-side-divider' }, `工作区（${state.workspaces.length}）`),
          state.workspaces.length === 0
            ? h('div', { className: 'dshmcp-side-empty' }, '当前没有已打开的工作区。在 Workspace 里添加一个目录后，这里就会出现它。')
            : state.workspaces.map(scope => h('button', {
              key: scope.key,
              type: 'button',
              className: `dshmcp-scope${scope.key === selected ? ' is-active' : ''}`,
              onClick: () => setSelected(scope.key),
              title: shortPath(scope.path),
            },
            h('span', { className: 'dshmcp-scope-icon' }, ICONS.folder(16)),
            h('span', { className: 'dshmcp-scope-text' },
              h('span', { className: 'dshmcp-scope-name' }, scope.title),
              h('span', { className: 'dshmcp-scope-path' }, scope.path)),
            h('span', { className: 'dshmcp-scope-count' }, String(scope.configuredCount)))),
          h('div', { className: 'dshmcp-side-foot' }, 'MCP 服务器按作用域隔离；工作区同名配置优先。')),

        h('main', { className: 'dshmcp-main' },
          loadError !== null
            ? h('div', { className: 'dshmcp-error-banner' },
              ICONS.alert(15),
              h('span', null, `无法刷新 MCP 状态：${loadError}`))
            : null,
          h('div', { className: 'dshmcp-head' },
            h('div', { className: 'dshmcp-head-text' },
              h('h1', { className: 'dshmcp-title' }, current.title),
              h('div', { className: 'dshmcp-sub', title: scopeSubtitle(current) }, scopeSubtitle(current)),
              h('div', { className: 'dshmcp-config-path', title: current.configPath }, current.configPath)),
            h('div', { className: 'dshmcp-head-actions' },
              h('button', { type: 'button', className: 'dshmcp-btn dshmcp-btn-ghost', onClick: () => { void load() } },
                ICONS.refresh(14), '刷新'),
              h('button', { type: 'button', className: 'dshmcp-btn dshmcp-btn-primary', onClick: () => openCreate(current) },
                ICONS.plus(14), '添加 MCP'))),

          current.kind === 'workspace'
            ? h('div', { className: 'dshmcp-notice' },
              ICONS.info(15),
              h('span', null,
                '本页列出这个工作区自己的 ', h('b', null, String(current.configuredCount)), ' 个 MCP；同名服务器优先使用工作区配置。',
                '计入全局配置后，这个工作区最终生效 ', h('b', null, String(current.effectiveCount)),
                ' 个（其余可在「全局配置」中管理）。'))
            : null,

          servers.length === 0
            ? h('div', { className: 'dshmcp-empty' },
              ICONS.plug(28),
              h('div', { className: 'dshmcp-empty-title' }, current.kind === 'global' ? '还没有全局 MCP 服务器' : '这个工作区还没有专属 MCP 服务器'),
              h('div', { className: 'dshmcp-empty-text' },
                current.kind === 'global'
                  ? '全局服务器对所有工作区生效；工作区里的同名配置会覆盖它。'
                  : '工作区专属配置只在这个目录的会话里生效，并会覆盖同名的全局配置。'),
              h('button', { type: 'button', className: 'dshmcp-btn dshmcp-btn-primary', onClick: () => openCreate(current) },
                ICONS.plus(14), '添加 MCP'))
            : h('div', { className: 'dshmcp-grid' }, servers.map(server => renderServer(current, server)))),

        dialog !== null
          ? h(ServerDialog, {
            key: `${dialog.scope.key}:${dialog.server?.serverName ?? 'new'}`,
            scope: dialog.scope,
            server: dialog.server,
            onClose: () => setDialog(null),
            onSubmit: (input, previous) => saveServer(dialog.scope, input, previous),
          })
          : null,
        h(ToastStack, { toasts }))
    }

    // ── Plugin body ───────────────────────────────────────────────────────

    injectStyles()

    function apply(ctx) {
      ctx.inject(['slots'], (child) => {
        const slots = child.slots
        if (!slots) return
        slots.inject('shell.activitybar.items', () => slots.register({
          name: 'shell.activitybar.items',
          id: ACTIVITY_ID,
          order: 120,
          label: () => PANEL_LABEL,
        }, ActivityGlyph))
        slots.inject('shell.activity', () => slots.register({
          name: 'shell.activity',
          key: ACTIVITY_ID,
        }, McpPage))
      })
    }

    exports.apply = apply
    exports.PANEL_ID = ACTIVITY_ID
    return module.exports
  },
})
