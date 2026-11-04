/**
 * 图片对比 stylesheet. Scoped under `.dti-`, colored from DSH semantic tokens
 * with neutral fallbacks so both themes work.
 */

export const CSS = `
.dti-root {
  --dti-bg: var(--dsw-alias-bg-base, #ffffff);
  --dti-surface: var(--dsw-alias-bg-layer-1, #ffffff);
  --dti-surface-2: var(--dsw-alias-bg-layer-2, #f6f7f9);
  --dti-text: var(--dsw-alias-label-primary, #17181a);
  --dti-text-2: var(--dsw-alias-label-secondary, #4b4c4f);
  --dti-text-3: var(--dsw-alias-label-tertiary, #7b7d82);
  --dti-caption: var(--dsw-alias-label-caption, #9a9ca1);
  --dti-border: var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  --dti-border-soft: var(--dsw-alias-border-l1, rgba(0, 0, 0, .05));
  --dti-hover: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
  --dti-accent: var(--dsw-alias-state-business-primary, #4176e6);
  --dti-green: #16a34a;
  --dti-red: #e5484d;
  --dti-warn: var(--dsw-alias-state-warn-primary, #f59e0b);
  --dti-danger: var(--dsw-alias-state-error-primary, #e5484d);
  --dti-checker: rgba(15, 23, 42, .028);
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--dti-bg);
  color: var(--dti-text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
.dti-root *, .dti-root *::before, .dti-root *::after { box-sizing: border-box; }
.dti-root button { cursor: pointer; font-family: inherit; }
.dti-root button:disabled { cursor: default; opacity: .45; }
.dti-root input, .dti-root select { font: inherit; color: inherit; }
.dti-root ::selection { background: color-mix(in srgb, var(--dti-accent) 24%, transparent); }

/* ── header ──────────────────────────────────────────────────────────── */
.dti-header {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 0 0 auto;
  padding: 14px 18px 10px;
}
.dti-brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
.dti-logo {
  display: grid;
  flex: 0 0 36px;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  color: #fff;
  background: linear-gradient(135deg, #10b981 0%, #22c55e 48%, #38bdf8 125%);
  box-shadow: 0 8px 18px rgba(16, 185, 129, .28);
}
.dti-brand-text { min-width: 0; }
.dti-brand-text h1 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -.01em; white-space: nowrap; }
.dti-brand-text p { margin: 2px 0 0; font-size: 11.5px; color: var(--dti-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dti-header-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; flex: 0 0 auto; }

/* ── buttons ─────────────────────────────────────────────────────────── */
.dti-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--dti-border);
  border-radius: 9px;
  background: var(--dti-surface);
  color: var(--dti-text-2);
  font-size: 12px;
  white-space: nowrap;
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
.dti-btn:hover { background: var(--dti-hover); color: var(--dti-text); }
.dti-btn.primary {
  border-color: transparent;
  background: var(--dti-accent);
  color: #fff;
  font-weight: 550;
}
.dti-btn.primary:hover { background: color-mix(in srgb, var(--dti-accent) 86%, #000); color: #fff; }
.dti-btn.ghost { border-color: transparent; background: transparent; }
.dti-btn.ghost:hover { background: var(--dti-hover); }
.dti-iconbtn {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--dti-text-3);
}
.dti-iconbtn:hover { background: var(--dti-hover); color: var(--dti-text); }

/* ── picker (no images yet) ──────────────────────────────────────────── */
.dti-picker { display: flex; flex: 1; flex-direction: column; gap: 12px; min-height: 0; padding: 4px 18px 16px; }
.dti-picker-grid { display: grid; flex: 1; grid-template-columns: 1fr 1fr; gap: 14px; min-height: 0; }
.dti-drop {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 200px;
  padding: 22px;
  border: 1.5px dashed var(--dti-border);
  border-radius: 16px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--dti-accent) 3%, transparent), transparent 60%),
    var(--dti-surface);
  color: var(--dti-text-2);
  text-align: center;
  transition: border-color .16s ease, background .16s ease;
}
.dti-drop:hover { border-color: color-mix(in srgb, var(--dti-accent) 55%, transparent); background: color-mix(in srgb, var(--dti-accent) 4%, var(--dti-surface)); }
.dti-drop[data-dragging="true"] { border-color: var(--dti-accent); background: color-mix(in srgb, var(--dti-accent) 8%, var(--dti-surface)); }
.dti-drop-orb {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  color: var(--dti-accent);
  background: color-mix(in srgb, var(--dti-accent) 10%, transparent);
}
.dti-drop strong { font-size: 13.5px; font-weight: 600; color: var(--dti-text); }
.dti-drop p { margin: 0; max-width: 300px; font-size: 11.5px; color: var(--dti-text-3); }
.dti-drop-formats { font-size: 10.5px; color: var(--dti-caption); letter-spacing: .01em; }
.dti-drop[data-loaded="true"] { padding: 0; border-style: solid; overflow: hidden; align-items: stretch; justify-content: flex-start; }
.dti-drop-preview {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  background-color: var(--dti-surface-2);
  background-image:
    linear-gradient(45deg, var(--dti-checker) 25%, transparent 25%, transparent 75%, var(--dti-checker) 75%),
    linear-gradient(45deg, var(--dti-checker) 25%, transparent 25%, transparent 75%, var(--dti-checker) 75%);
  background-size: 18px 18px;
  background-position: 0 0, 9px 9px;
}
.dti-drop-preview img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
.dti-drop-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(17, 24, 39, .72);
  color: #fff;
  font-size: 10.5px;
  letter-spacing: .02em;
  backdrop-filter: blur(6px);
}
.dti-drop-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  padding: 8px 10px 8px 12px;
  border-top: 1px solid var(--dti-border-soft);
  background: var(--dti-surface);
  text-align: left;
}
.dti-drop-meta { min-width: 0; flex: 1; }
.dti-drop-meta strong { display: block; overflow: hidden; font-size: 12px; font-weight: 600; color: var(--dti-text); text-overflow: ellipsis; white-space: nowrap; }
.dti-drop-meta span { display: block; overflow: hidden; color: var(--dti-text-3); font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
.dti-picker-tips {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  color: var(--dti-text-3);
  font-size: 11px;
}
.dti-picker-tips .dot { width: 3px; height: 3px; border-radius: 50%; background: var(--dti-caption); }

/* ── source strip (compare mode) ─────────────────────────────────────── */
.dti-sources { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; padding: 0 18px 10px; }
.dti-source {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1 1 0;
  min-width: 0;
  max-width: 420px;
  padding: 5px 7px 5px 5px;
  border: 1px solid var(--dti-border);
  border-radius: 12px;
  background: var(--dti-surface);
}
.dti-source-thumb {
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--dti-surface-2);
}
.dti-source-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.dti-source-text strong {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--dti-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dti-source-tag {
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--dti-accent) 14%, transparent);
  color: var(--dti-accent);
  font-size: 9.5px;
  font-weight: 700;
}
.dti-source-text span { color: var(--dti-text-3); font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dti-source-actions { display: flex; align-items: center; gap: 1px; flex: 0 0 auto; }
.dti-swap {
  display: grid;
  flex: 0 0 30px;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--dti-border);
  border-radius: 50%;
  background: var(--dti-surface);
  color: var(--dti-text-2);
}
.dti-swap:hover { border-color: color-mix(in srgb, var(--dti-accent) 45%, transparent); color: var(--dti-accent); background: color-mix(in srgb, var(--dti-accent) 7%, var(--dti-surface)); }

/* ── mode bar ────────────────────────────────────────────────────────── */
.dti-modebar { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; flex-wrap: wrap; padding: 0 18px 10px; }
.dti-modes {
  display: flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--dti-border-soft);
  border-radius: 11px;
  background: var(--dti-surface-2);
}
.dti-mode {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 9px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dti-text-2);
  font-size: 11.5px;
  white-space: nowrap;
  transition: background .15s ease, color .15s ease;
}
.dti-mode:hover { background: var(--dti-hover); color: var(--dti-text); }
.dti-mode[data-active="true"] {
  background: var(--dti-surface);
  color: var(--dti-accent);
  box-shadow: 0 1px 3px rgba(15, 23, 42, .1);
}
.dti-options { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-left: auto; }
.dti-opt { display: inline-flex; align-items: center; gap: 7px; color: var(--dti-text-3); font-size: 11px; white-space: nowrap; }
.dti-opt strong { color: var(--dti-text-2); font-weight: 600; font-variant-numeric: tabular-nums; }
.dti-opt select {
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--dti-border);
  border-radius: 7px;
  background: var(--dti-surface);
  color: var(--dti-text-2);
  font-size: 11px;
}
.dti-range { width: 108px; accent-color: var(--dti-accent); }
.dti-check { display: inline-flex; align-items: center; gap: 5px; color: var(--dti-text-2); font-size: 11px; }
.dti-check input { accent-color: var(--dti-accent); }

/* ── stage ───────────────────────────────────────────────────────────── */
.dti-canvas {
  position: relative;
  flex: 1;
  min-height: 0;
  margin: 0 18px;
  border: 1px solid var(--dti-border);
  border-radius: 14px;
  overflow: hidden;
  background-color: var(--dti-surface-2);
  background-image:
    linear-gradient(45deg, var(--dti-checker) 25%, transparent 25%, transparent 75%, var(--dti-checker) 75%),
    linear-gradient(45deg, var(--dti-checker) 25%, transparent 25%, transparent 75%, var(--dti-checker) 75%);
  background-size: 24px 24px;
  background-position: 0 0, 12px 12px;
}
.dti-stage { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; }
.dti-stage:active { cursor: grabbing; }
.dti-scene { position: absolute; top: 0; left: 0; transform-origin: 0 0; pointer-events: none; }
.dti-layer { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
.dti-layer.gray { filter: grayscale(1); opacity: .62; }
.dti-layer.dti-white { background: #ffffff; }
.dti-layer.contain { object-fit: contain; }
.dti-layer.fill { object-fit: fill; }

.dti-split { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--dti-border); }
.dti-split-pane { position: relative; overflow: hidden; background-color: var(--dti-surface-2); }
.dti-split-pane .dti-stage { position: absolute; inset: 0; }

.dti-tag {
  position: absolute;
  top: 10px;
  left: 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  border-radius: 7px;
  background: rgba(17, 24, 39, .68);
  color: #fff;
  font-size: 10.5px;
  letter-spacing: .02em;
  backdrop-filter: blur(6px);
  pointer-events: none;
}
.dti-tag.right { left: auto; right: 10px; }
.dti-tag.accent { background: color-mix(in srgb, var(--dti-accent) 88%, transparent); }

.dti-divider { position: absolute; top: 0; bottom: 0; z-index: 4; width: 0; }
.dti-divider-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -1px;
  width: 2px;
  background: #fff;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, .28), 0 0 14px rgba(15, 23, 42, .35);
}
.dti-divider-handle {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(15, 23, 42, .14);
  border-radius: 50%;
  background: #fff;
  color: #17181a;
  box-shadow: 0 5px 16px rgba(15, 23, 42, .32);
  cursor: ew-resize;
  transform: translate(-50%, -50%);
}
.dti-divider-handle:hover { background: #f8fafc; }

.dti-zoom {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 3px;
  border: 1px solid var(--dti-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--dti-surface) 92%, transparent);
  box-shadow: 0 8px 20px rgba(15, 23, 42, .12);
  backdrop-filter: blur(8px);
}
.dti-zoom .dti-iconbtn { width: 26px; height: 26px; }
.dti-zoom-label {
  min-width: 48px;
  padding: 0 2px;
  border: none;
  background: transparent;
  color: var(--dti-text-2);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.dti-zoom-label:hover { color: var(--dti-accent); }
.dti-zoom-sep { width: 1px; height: 16px; margin: 0 2px; background: var(--dti-border-soft); }

.dti-canvas-note {
  position: absolute;
  left: 50%;
  bottom: 16px;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  border: 1px solid var(--dti-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--dti-surface) 92%, transparent);
  box-shadow: 0 8px 20px rgba(15, 23, 42, .12);
  color: var(--dti-text-2);
  font-size: 11px;
  transform: translateX(-50%);
  backdrop-filter: blur(8px);
}
.dti-spinner {
  width: 13px;
  height: 13px;
  border: 2px solid color-mix(in srgb, var(--dti-accent) 30%, transparent);
  border-top-color: var(--dti-accent);
  border-radius: 50%;
  animation: dti-spin .8s linear infinite;
}
@keyframes dti-spin { to { transform: rotate(360deg); } }

.dti-toast {
  position: absolute;
  left: 50%;
  bottom: 58px;
  z-index: 8;
  max-width: min(560px, 80%);
  padding: 8px 13px;
  border: 1px solid color-mix(in srgb, var(--dti-danger) 40%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--dti-danger) 10%, var(--dti-surface));
  color: var(--dti-danger);
  font-size: 11.5px;
  transform: translateX(-50%);
  box-shadow: 0 10px 24px rgba(15, 23, 42, .14);
}

/* ── status bar ──────────────────────────────────────────────────────── */
.dti-stats {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 0 0 auto;
  flex-wrap: wrap;
  padding: 8px 20px 10px;
  color: var(--dti-text-3);
  font-size: 11px;
}
.dti-stat { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
.dti-stat strong { color: var(--dti-text-2); font-weight: 600; }
.dti-stat.accent { color: var(--dti-accent); }
.dti-stat.muted { margin-left: auto; }
.dti-stat-badge {
  display: inline-grid;
  place-items: center;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--dti-hover);
  color: var(--dti-text-3);
  font-size: 9.5px;
  font-weight: 700;
}
.dti-warn { color: var(--dti-warn); }
.dti-sep { width: 1px; height: 12px; background: var(--dti-border); }

body[data-ds-dark-theme] .dti-logo { box-shadow: 0 8px 18px rgba(0, 0, 0, .45); }
body[data-ds-dark-theme] .dti-root { --dti-checker: rgba(255, 255, 255, .05); }
body[data-ds-dark-theme] .dti-drop-badge { background: rgba(0, 0, 0, .66); }
body[data-ds-dark-theme] .dti-zoom,
body[data-ds-dark-theme] .dti-canvas-note { box-shadow: 0 8px 20px rgba(0, 0, 0, .45); }

@media (max-width: 980px) {
  .dti-brand-text p { display: none; }
  .dti-options { margin-left: 0; }
}

/* A success toast reuses the toast shell with the accent border. */
.dti-toast.ok {
  border-color: color-mix(in srgb, var(--dti-green) 42%, transparent);
  background: color-mix(in srgb, var(--dti-green) 10%, var(--dti-surface));
  color: var(--dti-green);
}
`

