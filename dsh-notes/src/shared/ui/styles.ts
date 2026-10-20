/**
 * Scoped stylesheet shared by the web app and the DSH activity page.
 *
 * Every selector lives under .dsh-notes-root, so injecting this sheet into DSH
 * cannot affect the surrounding shell. Colors prefer DSH's --dsw-* aliases and
 * fall back to a standalone light/dark palette for the web app.
 */

export const STYLE_ID = 'dsh-notes-style'

export const CSS = String.raw`
.dsh-notes-root {
  --notes-bg: var(--dsw-alias-bg-base, #f6f7f9);
  --notes-bg-elevated: var(--dsw-alias-bg-layer-2, #ffffff);
  --notes-bg-inset: var(--dsw-alias-bg-layer-1, #ffffff);
  --notes-bg-hover: var(--dsw-alias-interactive-bg-hover, #eef0f4);
  --notes-bg-active: var(--dsw-alias-interactive-bg-active, #e6e9ef);
  --notes-border: var(--dsw-alias-border-l2, #e2e5ea);
  --notes-border-soft: var(--dsw-alias-border-l1, #eceef2);
  --notes-text: var(--dsw-alias-label-primary, #1f2328);
  --notes-text-dim: var(--dsw-alias-label-secondary, #5c6572);
  --notes-text-faint: var(--dsw-alias-label-tertiary, #8a929e);
  --notes-accent: var(--dsw-alias-state-business-primary, #2f6feb);
  --notes-accent-soft: color-mix(in srgb, var(--notes-accent) 12%, transparent);
  --notes-danger: var(--dsw-alias-state-error-primary, #d1242f);
  --notes-danger-soft: color-mix(in srgb, var(--notes-danger) 10%, transparent);
  --notes-success: var(--dsw-alias-state-success-primary, #1a7f37);
  --notes-warn: var(--dsw-alias-state-warn-primary, #9a6700);
  --notes-radius: var(--dsw-radius-md, 10px);
  --notes-radius-sm: var(--dsw-radius-sm, 7px);
  --notes-shadow: 0 12px 40px rgba(0,0,0,.18);
  --notes-font: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "PingFang SC", sans-serif);
  --notes-mono: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, "Cascadia Code", monospace);
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  background: var(--notes-bg);
  color: var(--notes-text);
  font-family: var(--notes-font);
  font-size: 13px;
  line-height: 20px;
}
.dsh-notes-root.theme-dark {
  --notes-bg: #0f1115;
  --notes-bg-elevated: #171a20;
  --notes-bg-inset: #12151a;
  --notes-bg-hover: #1e232b;
  --notes-bg-active: #262c36;
  --notes-border: #2a3039;
  --notes-border-soft: #222831;
  --notes-text: #e6e9ef;
  --notes-text-dim: #a6afbc;
  --notes-text-faint: #788291;
  --notes-accent: #4c8dff;
  --notes-danger: #ff6b76;
  --notes-success: #4ac26b;
  --notes-warn: #d4a72c;
  --notes-shadow: 0 16px 48px rgba(0,0,0,.5);
}
@media (prefers-color-scheme: dark) {
  .dsh-notes-root.theme-auto {
    --notes-bg: #0f1115;
    --notes-bg-elevated: #171a20;
    --notes-bg-inset: #12151a;
    --notes-bg-hover: #1e232b;
    --notes-bg-active: #262c36;
    --notes-border: #2a3039;
    --notes-border-soft: #222831;
    --notes-text: #e6e9ef;
    --notes-text-dim: #a6afbc;
    --notes-text-faint: #788291;
    --notes-accent: #4c8dff;
    --notes-danger: #ff6b76;
    --notes-success: #4ac26b;
    --notes-warn: #d4a72c;
    --notes-shadow: 0 16px 48px rgba(0,0,0,.5);
  }
}
.dsh-notes-root *, .dsh-notes-root *::before, .dsh-notes-root *::after { box-sizing: border-box; }
.dsh-notes-root button, .dsh-notes-root input, .dsh-notes-root textarea, .dsh-notes-root select { font: inherit; color: inherit; }
.dsh-notes-root button { cursor: pointer; }
.dsh-notes-root button:disabled { cursor: default; opacity: .5; }
.dsh-notes-root a { color: var(--notes-accent); }

.dsh-notes-header {
  display: flex; align-items: center; gap: 10px; flex: none;
  height: 48px; padding: 0 12px; border-bottom: 1px solid var(--notes-border-soft);
  background: var(--notes-bg-elevated);
}
.dsh-notes-brand { display: flex; align-items: center; gap: 8px; font-weight: 650; font-size: 14px; white-space: nowrap; }
.dsh-notes-brand svg { color: var(--notes-accent); }
.dsh-notes-header-spacer { flex: 1; }
.dsh-notes-header-actions { display: flex; align-items: center; gap: 6px; }
.dsh-notes-sync-pill {
  display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 9px;
  border-radius: 999px; border: 1px solid var(--notes-border); background: var(--notes-bg-inset);
  font-size: 11px; color: var(--notes-text-dim); white-space: nowrap;
}
.dsh-notes-sync-pill .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--notes-text-faint); }
.dsh-notes-sync-pill.state-idle .dot { background: var(--notes-success); }
.dsh-notes-sync-pill.state-syncing .dot { background: var(--notes-accent); animation: dsh-notes-pulse 1s infinite; }
.dsh-notes-sync-pill.state-pending .dot { background: var(--notes-warn); }
.dsh-notes-sync-pill.state-offline .dot, .dsh-notes-sync-pill.state-error .dot { background: var(--notes-danger); }
.dsh-notes-sync-pill.state-conflict .dot { background: var(--notes-warn); }
@keyframes dsh-notes-pulse { 0%,100% { opacity: .35 } 50% { opacity: 1 } }

.dsh-notes-body { flex: 1; min-height: 0; display: flex; position: relative; }
.dsh-notes-sidebar {
  width: 282px; flex: none; min-width: 0; display: flex; flex-direction: column;
  border-right: 1px solid var(--notes-border-soft); background: var(--notes-bg-inset);
}
.dsh-notes-sidebar-head { padding: 10px 10px 6px; display: flex; flex-direction: column; gap: 8px; }
.dsh-notes-search { display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 8px; border: 1px solid var(--notes-border); border-radius: var(--notes-radius-sm); background: var(--notes-bg); }
.dsh-notes-search svg { color: var(--notes-text-faint); flex: none; }
.dsh-notes-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 12px; }
.dsh-notes-sidebar-actions { display: flex; gap: 6px; }
.dsh-notes-tree { flex: 1; overflow: auto; padding: 2px 8px 14px; min-height: 0; }
.dsh-notes-tree-empty { padding: 24px 12px; color: var(--notes-text-faint); text-align: center; font-size: 12px; }
.dsh-notes-tree-row {
  display: flex; align-items: center; gap: 6px; width: 100%; min-height: 28px;
  padding: 2px 7px; border: 0; border-radius: var(--notes-radius-sm); background: transparent;
  text-align: left; color: var(--notes-text); font-size: 12.5px; line-height: 18px;
}
.dsh-notes-tree-row:hover { background: var(--notes-bg-hover); }
.dsh-notes-tree-row.is-active { background: var(--notes-bg-active); color: var(--notes-text); }
.dsh-notes-tree-row.is-folder { color: var(--notes-text-dim); font-weight: 600; }
.dsh-notes-tree-row .twisty { width: 14px; height: 14px; display: grid; place-items: center; flex: none; color: var(--notes-text-faint); transition: transform .12s ease; }
.dsh-notes-tree-row .twisty.is-open { transform: rotate(90deg); }
.dsh-notes-tree-row .row-icon { flex: none; color: var(--notes-text-faint); display: grid; place-items: center; }
.dsh-notes-tree-row .row-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-notes-tree-row .row-count { flex: none; font-size: 10px; color: var(--notes-text-faint); background: var(--notes-bg); border: 1px solid var(--notes-border-soft); border-radius: 999px; padding: 0 5px; line-height: 15px; }
.dsh-notes-tree-row .row-actions { display: none; gap: 2px; flex: none; }
.dsh-notes-tree-row:hover .row-actions { display: flex; }
.dsh-notes-sidebar-foot { flex: none; border-top: 1px solid var(--notes-border-soft); padding: 8px 10px; display: flex; align-items: center; gap: 8px; }
.dsh-notes-sidebar-foot .muted { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px; color: var(--notes-text-faint); }

.dsh-notes-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--notes-bg); }
.dsh-notes-editor-head { flex: none; padding: 10px 16px 0; display: flex; flex-direction: column; gap: 6px; }
.dsh-notes-title-row { display: flex; align-items: center; gap: 8px; }
.dsh-notes-title-input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 20px; font-weight: 650; line-height: 28px; padding: 2px 0; }
.dsh-notes-title-input::placeholder { color: var(--notes-text-faint); }
.dsh-notes-note-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11px; color: var(--notes-text-faint); }
.dsh-notes-tags { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.dsh-notes-tag { display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; padding: 1px 6px; border-radius: 999px; background: var(--notes-accent-soft); color: var(--notes-accent); }
.dsh-notes-tag button { border: 0; background: transparent; color: inherit; padding: 0; line-height: 1; }
.dsh-notes-tag-input { width: 90px; border: 0; outline: 0; background: transparent; font-size: 10.5px; color: var(--notes-text-dim); }
.dsh-notes-toolbar { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; padding: 4px 0 8px; border-bottom: 1px solid var(--notes-border-soft); }
.dsh-notes-toolbar-btn { border: 1px solid transparent; background: transparent; color: var(--notes-text-dim); min-width: 26px; height: 26px; padding: 0 6px; border-radius: 6px; font-size: 12px; }
.dsh-notes-toolbar-btn:hover { background: var(--notes-bg-hover); color: var(--notes-text); }
.dsh-notes-toolbar-btn.is-active { background: var(--notes-accent-soft); color: var(--notes-accent); }
.dsh-notes-toolbar-sep { width: 1px; height: 16px; background: var(--notes-border); margin: 0 4px; }
.dsh-notes-findbar { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px solid var(--notes-border-soft); }
.dsh-notes-findbar input { flex: 1; min-width: 0; height: 26px; padding: 0 7px; border: 1px solid var(--notes-border); border-radius: 6px; background: var(--notes-bg); font-size: 11.5px; }
.dsh-notes-mobile-only { display: none; }
.dsh-notes-view-switch { display: flex; gap: 2px; margin-left: auto; background: var(--notes-bg-inset); border: 1px solid var(--notes-border-soft); border-radius: 7px; padding: 2px; }
.dsh-notes-view-switch button { border: 0; background: transparent; color: var(--notes-text-dim); height: 22px; padding: 0 7px; border-radius: 5px; }
.dsh-notes-view-switch button.is-active { background: var(--notes-bg-active); color: var(--notes-text); }

.dsh-notes-split { flex: 1; min-height: 0; display: flex; }
.dsh-notes-split.view-edit .dsh-notes-preview, .dsh-notes-split.view-preview .dsh-notes-textarea { display: none; }
.dsh-notes-textarea {
  flex: 1; min-width: 0; min-height: 0; resize: none; border: 0; outline: 0;
  padding: 18px 20px 60px; background: var(--notes-bg); color: var(--notes-text);
  font-family: var(--notes-mono); font-size: 13px; line-height: 1.7; tab-size: 2;
}
.dsh-notes-split.view-split .dsh-notes-textarea { border-right: 1px solid var(--notes-border-soft); }
.dsh-notes-preview { flex: 1; min-width: 0; overflow: auto; padding: 18px 24px 60px; }
.dsh-notes-preview-empty { color: var(--notes-text-faint); font-size: 12px; padding: 30px 0; text-align: center; }
.dsh-notes-markdown { font-size: 14px; line-height: 1.75; word-wrap: break-word; }
.dsh-notes-markdown h1, .dsh-notes-markdown h2, .dsh-notes-markdown h3, .dsh-notes-markdown h4 { margin: 1.3em 0 .55em; line-height: 1.3; font-weight: 650; }
.dsh-notes-markdown h1 { font-size: 1.8em; border-bottom: 1px solid var(--notes-border-soft); padding-bottom: .25em; }
.dsh-notes-markdown h2 { font-size: 1.4em; }
.dsh-notes-markdown h3 { font-size: 1.16em; }
.dsh-notes-markdown p { margin: .7em 0; }
.dsh-notes-markdown ul, .dsh-notes-markdown ol { padding-left: 1.7em; margin: .6em 0; }
.dsh-notes-markdown li { margin: .2em 0; }
.dsh-notes-markdown li.task-list-item { list-style: none; margin-left: -1.4em; }
.dsh-notes-markdown li.task-list-item input { margin-right: .45em; }
.dsh-notes-markdown a { text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--notes-accent) 35%, transparent); }
.dsh-notes-markdown code { font-family: var(--notes-mono); font-size: .88em; padding: .15em .35em; border-radius: 4px; background: var(--notes-bg-hover); }
.dsh-notes-markdown pre { overflow: auto; padding: 12px 14px; border-radius: 8px; border: 1px solid var(--notes-border-soft); background: var(--notes-bg-inset); margin: .8em 0; }
.dsh-notes-markdown pre code { padding: 0; background: transparent; font-size: 12px; line-height: 1.6; }
.dsh-notes-markdown blockquote { margin: .8em 0; padding: .1em 0 .1em 1em; border-left: 3px solid var(--notes-border); color: var(--notes-text-dim); }
.dsh-notes-markdown table { border-collapse: collapse; margin: .9em 0; max-width: 100%; display: block; overflow: auto; }
.dsh-notes-markdown th, .dsh-notes-markdown td { border: 1px solid var(--notes-border); padding: 5px 9px; }
.dsh-notes-markdown th { background: var(--notes-bg-inset); font-weight: 600; }
.dsh-notes-markdown hr { border: 0; border-top: 1px solid var(--notes-border); margin: 1.4em 0; }
.dsh-notes-markdown img { max-width: 100%; height: auto; border-radius: 6px; }
.dsh-notes-markdown .dsh-notes-attachment-link { display: inline-flex; align-items: center; gap: 4px; }
.dsh-notes-markdown .hljs-comment, .dsh-notes-markdown .hljs-quote { color: #6a737d; }
.dsh-notes-markdown .hljs-keyword, .dsh-notes-markdown .hljs-selector-tag, .dsh-notes-markdown .hljs-literal { color: #cf222e; }
.dsh-notes-markdown .hljs-string, .dsh-notes-markdown .hljs-attr, .dsh-notes-markdown .hljs-addition { color: #0a3069; }
.dsh-notes-markdown .hljs-number, .dsh-notes-markdown .hljs-built_in { color: #953800; }
.dsh-notes-markdown .hljs-title, .dsh-notes-markdown .hljs-section { color: #8250df; }
.dsh-notes-root.theme-dark .dsh-notes-markdown .hljs-keyword, .dsh-notes-root.theme-dark .dsh-notes-markdown .hljs-selector-tag, .dsh-notes-root.theme-dark .dsh-notes-markdown .hljs-literal { color: #ff7b72; }
.dsh-notes-root.theme-dark .dsh-notes-markdown .hljs-string, .dsh-notes-root.theme-dark .dsh-notes-markdown .hljs-attr { color: #a5d6ff; }
.dsh-notes-root.theme-dark .dsh-notes-markdown .hljs-number, .dsh-notes-root.theme-dark .dsh-notes-markdown .hljs-built_in { color: #ffa657; }
.dsh-notes-root.theme-dark .dsh-notes-markdown .hljs-title, .dsh-notes-root.theme-dark .dsh-notes-markdown .hljs-section { color: #d2a8ff; }
.dsh-notes-root.theme-dark .dsh-notes-markdown .hljs-comment, .dsh-notes-root.theme-dark .dsh-notes-markdown .hljs-quote { color: #8b949e; }

.dsh-notes-statusbar { flex: none; height: 28px; display: flex; align-items: center; gap: 10px; padding: 0 14px; border-top: 1px solid var(--notes-border-soft); background: var(--notes-bg-elevated); color: var(--notes-text-faint); font-size: 10.5px; }
.dsh-notes-statusbar .grow { flex: 1; }
.dsh-notes-statusbar .is-error { color: var(--notes-danger); }
.dsh-notes-statusbar .is-saved { color: var(--notes-success); }

.dsh-notes-btn { display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 28px; padding: 0 9px; border: 1px solid var(--notes-border); border-radius: var(--notes-radius-sm); background: var(--notes-bg-inset); color: var(--notes-text); font-size: 12px; white-space: nowrap; }
.dsh-notes-btn:hover:not(:disabled) { background: var(--notes-bg-hover); }
.dsh-notes-btn-primary { background: var(--notes-accent); border-color: transparent; color: #fff; }
.dsh-notes-btn-primary:hover:not(:disabled) { background: var(--notes-accent); filter: brightness(1.07); }
.dsh-notes-btn-danger { color: var(--notes-danger); border-color: color-mix(in srgb, var(--notes-danger) 40%, var(--notes-border)); }
.dsh-notes-btn-ghost { border-color: transparent; background: transparent; color: var(--notes-text-dim); }
.dsh-notes-btn-ghost:hover:not(:disabled) { background: var(--notes-bg-hover); color: var(--notes-text); }
.dsh-notes-btn-icon { width: 28px; padding: 0; }
.dsh-notes-icon-btn { display: inline-grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: var(--notes-text-dim); }
.dsh-notes-icon-btn:hover { background: var(--notes-bg-hover); color: var(--notes-text); }
.dsh-notes-input, .dsh-notes-select { width: 100%; height: 30px; padding: 0 9px; border: 1px solid var(--notes-border); border-radius: var(--notes-radius-sm); background: var(--notes-bg); color: var(--notes-text); font-size: 12px; }
.dsh-notes-textarea-small { width: 100%; min-height: 74px; padding: 7px 9px; border: 1px solid var(--notes-border); border-radius: var(--notes-radius-sm); background: var(--notes-bg); color: var(--notes-text); font-size: 12px; resize: vertical; }

.dsh-notes-banner { display: flex; align-items: flex-start; gap: 8px; margin: 0 16px 8px; padding: 8px 10px; border-radius: var(--notes-radius-sm); border: 1px solid var(--notes-border); background: var(--notes-bg-elevated); font-size: 12px; }
.dsh-notes-banner.is-error { border-color: color-mix(in srgb, var(--notes-danger) 45%, var(--notes-border)); background: var(--notes-danger-soft); color: var(--notes-danger); }
.dsh-notes-banner.is-warn { border-color: color-mix(in srgb, var(--notes-warn) 45%, var(--notes-border)); background: color-mix(in srgb, var(--notes-warn) 8%, transparent); color: var(--notes-warn); }
.dsh-notes-banner .grow { flex: 1; min-width: 0; }
.dsh-notes-banner-actions { display: flex; gap: 6px; flex-wrap: wrap; }

.dsh-notes-empty { flex: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 10px; padding: 28px; color: var(--notes-text-faint); text-align: center; }
.dsh-notes-empty-title { font-size: 16px; font-weight: 600; color: var(--notes-text); }
.dsh-notes-empty-actions { display: flex; gap: 8px; }

.dsh-notes-attachments { flex: none; border-top: 1px solid var(--notes-border-soft); background: var(--notes-bg-elevated); max-height: 190px; overflow: auto; }
.dsh-notes-attachments-head { display: flex; align-items: center; gap: 8px; padding: 7px 14px; font-size: 11px; color: var(--notes-text-dim); position: sticky; top: 0; background: var(--notes-bg-elevated); border-bottom: 1px solid var(--notes-border-soft); z-index: 1; }
.dsh-notes-attachments-head .grow { flex: 1; }
.dsh-notes-attachment { display: flex; align-items: center; gap: 9px; padding: 6px 14px; border-bottom: 1px solid var(--notes-border-soft); }
.dsh-notes-attachment:last-child { border-bottom: 0; }
.dsh-notes-attachment-thumb { width: 34px; height: 34px; border-radius: 6px; object-fit: cover; background: var(--notes-bg); border: 1px solid var(--notes-border-soft); flex: none; }
.dsh-notes-attachment-icon { width: 34px; height: 34px; border-radius: 6px; display: grid; place-items: center; background: var(--notes-bg); border: 1px solid var(--notes-border-soft); color: var(--notes-text-faint); flex: none; }
.dsh-notes-attachment-main { flex: 1; min-width: 0; }
.dsh-notes-attachment-name { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-notes-attachment-sub { font-size: 10.5px; color: var(--notes-text-faint); }
.dsh-notes-attachment audio { height: 28px; max-width: 240px; }
.dsh-notes-upload-progress { height: 3px; background: var(--notes-border-soft); border-radius: 2px; overflow: hidden; margin-top: 3px; }
.dsh-notes-upload-progress > div { height: 100%; background: var(--notes-accent); transition: width .15s; }

.dsh-notes-overlay { position: absolute; inset: 0; z-index: 50; background: rgba(0,0,0,.32); display: grid; place-items: center; padding: 24px; }
.dsh-notes-modal { width: 620px; max-width: 100%; max-height: min(86vh, 860px); display: flex; flex-direction: column; border: 1px solid var(--notes-border); border-radius: var(--notes-radius); background: var(--notes-bg-elevated); box-shadow: var(--notes-shadow); overflow: hidden; }
.dsh-notes-modal.is-wide { width: 860px; }
.dsh-notes-modal-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--notes-border-soft); font-weight: 600; font-size: 13px; }
.dsh-notes-modal-head .grow { flex: 1; }
.dsh-notes-modal-body { padding: 14px 16px; overflow: auto; min-height: 40px; }
.dsh-notes-modal-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--notes-border-soft); }
.dsh-notes-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.dsh-notes-field label { font-size: 11px; color: var(--notes-text-dim); }
.dsh-notes-hint { font-size: 10.5px; color: var(--notes-text-faint); line-height: 16px; }
.dsh-notes-error { color: var(--notes-danger); font-size: 11.5px; }
.dsh-notes-success { color: var(--notes-success); font-size: 11.5px; }
.dsh-notes-list { display: flex; flex-direction: column; gap: 4px; }
.dsh-notes-list-row { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 6px; border: 1px solid transparent; }
.dsh-notes-list-row:hover { background: var(--notes-bg-hover); }
.dsh-notes-list-row.is-selected { border-color: var(--notes-border); background: var(--notes-bg-active); }
.dsh-notes-list-row .grow { flex: 1; min-width: 0; }
.dsh-notes-list-row .title { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-notes-list-row .sub { font-size: 10.5px; color: var(--notes-text-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-notes-diff { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; min-height: 180px; }
.dsh-notes-diff-col { border: 1px solid var(--notes-border-soft); border-radius: 6px; overflow: auto; max-height: 44vh; background: var(--notes-bg); }
.dsh-notes-diff-col h4 { margin: 0; padding: 6px 9px; font-size: 11px; border-bottom: 1px solid var(--notes-border-soft); background: var(--notes-bg-inset); color: var(--notes-text-dim); position: sticky; top: 0; }
.dsh-notes-diff-line { font-family: var(--notes-mono); font-size: 11px; line-height: 16px; padding: 0 9px; white-space: pre-wrap; word-break: break-word; }
.dsh-notes-diff-line.is-remove { background: color-mix(in srgb, var(--notes-danger) 12%, transparent); }
.dsh-notes-diff-line.is-add { background: color-mix(in srgb, var(--notes-success) 12%, transparent); }
.dsh-notes-diff-line.is-same { color: var(--notes-text-faint); }
.dsh-notes-toast-wrap { position: absolute; right: 18px; bottom: 18px; z-index: 60; display: flex; flex-direction: column; gap: 8px; max-width: 360px; }
.dsh-notes-toast { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--notes-border); background: var(--notes-bg-elevated); box-shadow: var(--notes-shadow); font-size: 12px; }
.dsh-notes-toast.is-error { border-color: color-mix(in srgb, var(--notes-danger) 45%, var(--notes-border)); color: var(--notes-danger); }
.dsh-notes-toast.is-success { border-color: color-mix(in srgb, var(--notes-success) 45%, var(--notes-border)); color: var(--notes-success); }

.dsh-notes-login { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--notes-bg); color: var(--notes-text); font-family: var(--notes-font); }
.dsh-notes-login-card { width: 380px; max-width: 100%; border: 1px solid var(--notes-border); border-radius: var(--notes-radius); background: var(--notes-bg-elevated); padding: 26px 26px 22px; box-shadow: var(--notes-shadow); }
.dsh-notes-login-card h1 { margin: 0 0 4px; font-size: 20px; }
.dsh-notes-login-card p.sub { margin: 0 0 18px; color: var(--notes-text-dim); font-size: 12px; }
.dsh-notes-login-card .dsh-notes-field { margin-bottom: 12px; }
.dsh-notes-login-card .hint { margin-top: 14px; font-size: 10.5px; color: var(--notes-text-faint); line-height: 16px; }

@media (max-width: 760px) {
  .dsh-notes-mobile-only { display: inline-grid; }
  .dsh-notes-sidebar { position: absolute; z-index: 20; inset: 0 auto 0 0; width: min(86vw, 320px); box-shadow: var(--notes-shadow); transform: translateX(-102%); transition: transform .18s ease; }
  .dsh-notes-root.mobile-tree-open .dsh-notes-sidebar { transform: translateX(0); }
  .dsh-notes-mobile-backdrop { display: none; position: absolute; inset: 0; z-index: 19; background: rgba(0,0,0,.28); }
  .dsh-notes-root.mobile-tree-open .dsh-notes-mobile-backdrop { display: block; }
  .dsh-notes-title-input { font-size: 17px; }
  .dsh-notes-split { display: block; overflow: auto; }
  .dsh-notes-split .dsh-notes-textarea, .dsh-notes-split .dsh-notes-preview { display: none; height: auto; min-height: 100%; }
  .dsh-notes-split.view-edit .dsh-notes-textarea { display: block; min-height: 62vh; }
  .dsh-notes-split.view-preview .dsh-notes-preview { display: block; }
  .dsh-notes-split.view-split .dsh-notes-preview { display: block; }
  .dsh-notes-split.view-split .dsh-notes-textarea { display: block; min-height: 40vh; border-right: 0; border-bottom: 1px solid var(--notes-border-soft); }
  .dsh-notes-header { padding: 0 8px; gap: 6px; }
  .dsh-notes-brand span { display: none; }
  .dsh-notes-sync-pill .label { display: none; }
  .dsh-notes-attachments { max-height: 150px; }
  .dsh-notes-diff { grid-template-columns: 1fr; }
  .dsh-notes-overlay { padding: 12px; }
}
`

let installed = false

export function ensureNotesStyles(doc: Document = document): void {
  if (installed && doc.getElementById(STYLE_ID) !== null) return
  const existing = doc.getElementById(STYLE_ID)
  if (existing !== null) {
    installed = true
    return
  }
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  doc.head.append(style)
  installed = true
}
