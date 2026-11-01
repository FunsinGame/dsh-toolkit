/**
 * dsh-design-mind stylesheet.
 *
 * Everything is scoped under `.dm-root`. Colours come from DSH's semantic
 * tokens with neutral fallbacks, so light and dark themes work without a second
 * theme definition. The page follows the shell's radius and spacing language.
 */

export const STYLE_ID = 'dsh-design-mind-style'

export const CSS = `
.dm-root {
  --dm-bg: var(--dsw-alias-bg-base, #ffffff);
  --dm-surface: var(--dsw-alias-bg-layer-1, #ffffff);
  --dm-surface-2: var(--dsw-alias-bg-layer-2, #f6f7f9);
  --dm-surface-3: var(--dsw-alias-bg-layer-3, #ffffff);
  --dm-text: var(--dsw-alias-label-primary, #17181a);
  --dm-text-2: var(--dsw-alias-label-secondary, #4b4c4f);
  --dm-text-3: var(--dsw-alias-label-tertiary, #7b7d82);
  --dm-caption: var(--dsw-alias-label-caption, #9a9ca1);
  --dm-border: var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  --dm-border-soft: var(--dsw-alias-border-l1, rgba(0, 0, 0, .05));
  --dm-hover: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
  --dm-accent: var(--dsw-alias-state-business-primary, #4176e6);
  --dm-danger: var(--dsw-alias-state-error-primary, #e5484d);
  --dm-warn: var(--dsw-alias-state-warn-primary, #f59e0b);
  --dm-success: var(--dsw-alias-state-success-primary, #22c55e);
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--dm-bg);
  color: var(--dm-text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  outline: none;
}
.dm-root *, .dm-root *::before, .dm-root *::after { box-sizing: border-box; }
.dm-root button { cursor: pointer; font-family: inherit; }
.dm-root button:disabled { cursor: default; opacity: .42; }
.dm-root ::selection { background: color-mix(in srgb, var(--dm-accent) 26%, transparent); }

/* ── header ─────────────────────────────────────────────────────────── */
.dm-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 0 14px;
  border-bottom: 1px solid var(--dm-border);
  background: var(--dm-surface);
}
.dm-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  letter-spacing: .01em;
  color: var(--dm-text);
}
.dm-brand svg { color: var(--dm-accent); }
.dm-meta { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dm-filename {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dm-text-2);
}
.dm-dim {
  flex: none;
  padding: 1px 7px;
  border: 1px solid var(--dm-border-soft);
  border-radius: 6px;
  font-size: 11px;
  color: var(--dm-caption);
  font-variant-numeric: tabular-nums;
}
.dm-hint { margin-left: auto; font-size: 11px; color: var(--dm-caption); white-space: nowrap; }

/* ── body ───────────────────────────────────────────────────────────── */
.dm-body { display: flex; flex: 1; min-height: 0; }

.dm-canvas {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  touch-action: none;
  cursor: crosshair;
  background-color: color-mix(in srgb, var(--dm-surface-2) 72%, var(--dm-bg));
  background-image: radial-gradient(color-mix(in srgb, var(--dm-text-3) 20%, transparent) 1px, transparent 1px);
  background-size: 18px 18px;
}
.dm-canvas.is-panning { cursor: grabbing; }
.dm-stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  will-change: transform;
}
.dm-image {
  display: block;
  max-width: none;
  user-select: none;
  pointer-events: none;
  box-shadow: 0 18px 50px rgba(15, 23, 42, .18);
  border-radius: 2px;
  background: #fff;
}
.dm-overlay { position: absolute; inset: 0; pointer-events: none; }

.dm-region {
  position: absolute;
  border: 1.5px solid var(--dm-accent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--dm-accent) 11%, transparent);
  transition: background .12s ease;
}
.dm-region.is-selected {
  border-width: 2.5px;
  background: color-mix(in srgb, var(--dm-accent) 17%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dm-accent) 16%, transparent);
}
.dm-region.is-preview {
  border-style: dashed;
  border-width: 1.5px;
  background: color-mix(in srgb, var(--dm-accent) 7%, transparent);
}
/* Cut frames render the real content, so keep the selection fill out of it. */
.dm-region.is-cut,
.dm-region.is-cut.is-selected {
  background: transparent;
}
/* A cut region leaves the original pixels covered by a checkerboard hole. */
.dm-hole {
  position: absolute;
  border-radius: 2px;
  background-color: color-mix(in srgb, var(--dm-surface) 70%, var(--dm-bg));
  background-image:
    linear-gradient(45deg, color-mix(in srgb, var(--dm-text-3) 22%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--dm-text-3) 22%, transparent) 75%),
    linear-gradient(45deg, color-mix(in srgb, var(--dm-text-3) 22%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--dm-text-3) 22%, transparent) 75%);
  background-size: 12px 12px;
  background-position: 0 0, 6px 6px;
}
/* The cut content, clipped to the frame it is being dragged to. */
.dm-moved {
  position: absolute;
  border-radius: 2px;
  background-repeat: no-repeat;
  filter: drop-shadow(0 8px 18px rgba(15, 23, 42, .18));
}
.dm-handle {
  position: absolute;
  width: 8px;
  height: 8px;
  border: 1.5px solid var(--dm-accent);
  border-radius: 2px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(15, 23, 42, .28);
}
.dm-menu {
  position: absolute;
  z-index: 12;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 168px;
  padding: 4px;
  border: 1px solid var(--dm-border);
  border-radius: 10px;
  background: var(--dm-surface);
  box-shadow: 0 14px 36px rgba(15, 23, 42, .22);
}
.dm-menu button {
  display: flex;
  align-items: center;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--dm-text);
  font-size: 12px;
  text-align: left;
}
.dm-menu button:hover:not(:disabled) { background: var(--dm-hover); }
.dm-menu button.is-danger { color: var(--dm-danger); }
.dm-menu-sep { height: 1px; margin: 2px 6px; background: var(--dm-border-soft); }
.dm-chip {
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dm-accent) 12%, transparent);
  color: var(--dm-accent);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.5;
}
.dm-badge-num {
  position: absolute;
  left: -10px;
  top: -10px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 10px;
  background: var(--dm-accent);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  box-shadow: 0 2px 8px rgba(15, 23, 42, .28);
}

/* ── empty state ────────────────────────────────────────────────────── */
.dm-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; }
.dm-empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: 440px;
  padding: 30px 28px;
  border: 1px dashed var(--dm-border);
  border-radius: 18px;
  background: color-mix(in srgb, var(--dm-surface) 86%, transparent);
  text-align: center;
  box-shadow: 0 18px 45px rgba(15, 23, 42, .06);
}
.dm-empty-card h2 { margin: 0; font-size: 15px; font-weight: 600; }
.dm-empty-card p { margin: 0; font-size: 12px; color: var(--dm-text-3); line-height: 1.7; }
.dm-empty-actions { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; justify-content: center; }
.dm-empty-card.is-dropping { border-color: var(--dm-accent); background: color-mix(in srgb, var(--dm-accent) 8%, var(--dm-surface)); }

/* ── comment panel ──────────────────────────────────────────────────── */
.dm-panel {
  display: flex;
  flex-direction: column;
  flex: none;
  width: 340px;
  min-height: 0;
  border-left: 1px solid var(--dm-border);
  background: var(--dm-surface);
}
.dm-panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--dm-border-soft);
}
.dm-panel-title { font-weight: 600; }
.dm-count {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--dm-surface-2);
  font-size: 11px;
  color: var(--dm-text-3);
  font-variant-numeric: tabular-nums;
}
.dm-panel-head .dm-ghost { margin-left: auto; height: 28px; font-size: 12px; }
.dm-panel-empty { margin: 22px 6px; font-size: 12px; line-height: 1.8; color: var(--dm-caption); }
.dm-cards {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
}

.dm-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--dm-border);
  border-radius: 12px;
  background: var(--dm-surface-3);
  transition: border-color .14s ease, box-shadow .14s ease;
}
.dm-card.is-selected {
  border-color: color-mix(in srgb, var(--dm-accent) 55%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dm-accent) 30%, transparent);
}
.dm-card-head { display: flex; align-items: center; gap: 8px; }
.dm-card-num {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background: var(--dm-accent);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}
.dm-card-coords {
  min-width: 0;
  font-size: 11px;
  color: var(--dm-text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dm-card-head .dm-icon-button { margin-left: auto; width: 26px; height: 26px; }
.dm-textarea {
  width: 100%;
  min-height: 54px;
  max-height: 220px;
  padding: 8px;
  border: 1px solid var(--dm-border-soft);
  border-radius: 8px;
  background: var(--dm-surface-2);
  color: var(--dm-text);
  font: inherit;
  line-height: 1.5;
  resize: vertical;
  outline: none;
}
.dm-textarea:focus {
  border-color: color-mix(in srgb, var(--dm-accent) 55%, transparent);
  background: var(--dm-surface);
}
.dm-textarea::placeholder { color: var(--dm-caption); }

/* ── export result ──────────────────────────────────────────────────── */
.dm-export {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 10px 12px 0;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--dm-success) 42%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--dm-success) 8%, transparent);
}
.dm-export.is-stale {
  border-color: color-mix(in srgb, var(--dm-warn) 45%, transparent);
  background: color-mix(in srgb, var(--dm-warn) 9%, transparent);
}
.dm-export.is-error {
  border-color: color-mix(in srgb, var(--dm-danger) 45%, transparent);
  background: color-mix(in srgb, var(--dm-danger) 8%, transparent);
  color: var(--dm-danger);
}
.dm-export-title { font-size: 12px; font-weight: 600; }
.dm-export-path {
  display: block;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 11px;
  color: var(--dm-text-2);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.dm-export-actions { display: flex; gap: 6px; align-items: center; }
.dm-export-actions .dm-primary { height: 28px; padding: 0 10px; font-size: 12px; }

/* ── toolbar ────────────────────────────────────────────────────────── */
.dm-toolbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 14px;
  border-top: 1px solid var(--dm-border);
  background: color-mix(in srgb, var(--dm-surface) 94%, transparent);
}
.dm-tools { display: flex; align-items: center; gap: 4px; }
.dm-tool-sep { width: 1px; height: 18px; margin: 0 6px; background: var(--dm-border); }
.dm-tool {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--dm-text-2);
}
.dm-tool:hover:not(:disabled) { background: var(--dm-hover); color: var(--dm-text); }
.dm-tool svg { color: var(--dm-text-3); }
.dm-tool:hover:not(:disabled) svg { color: var(--dm-text-2); }
.dm-zoom { display: flex; align-items: center; gap: 2px; margin-left: auto; }
.dm-zoom-value {
  min-width: 48px;
  text-align: center;
  font-size: 12px;
  color: var(--dm-text-2);
  font-variant-numeric: tabular-nums;
}
.dm-actions { display: flex; align-items: center; gap: 8px; }
.dm-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  padding: 0 16px;
  border: none;
  border-radius: 9px;
  background: var(--dm-accent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}
.dm-primary:hover:not(:disabled) { filter: brightness(1.06); }
.dm-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--dm-border);
  border-radius: 8px;
  background: var(--dm-surface);
  color: var(--dm-text-2);
  font-size: 13px;
}
.dm-ghost:hover:not(:disabled) { background: var(--dm-hover); color: var(--dm-text); }
.dm-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dm-text-3);
}
.dm-icon-button:hover:not(:disabled) { background: var(--dm-hover); color: var(--dm-text); }
.dm-small { height: 28px !important; font-size: 12px !important; }

/* ── overlays ───────────────────────────────────────────────────────── */
.dm-toast {
  position: absolute;
  left: 50%;
  bottom: 66px;
  z-index: 20;
  max-width: min(560px, calc(100% - 32px));
  padding: 8px 14px;
  border-radius: 10px;
  background: var(--dm-text);
  color: var(--dm-bg);
  font-size: 12px;
  line-height: 1.55;
  text-align: center;
  transform: translateX(-50%);
  box-shadow: 0 12px 32px rgba(15, 23, 42, .22);
  pointer-events: none;
}
.dm-modal {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, .44);
}
.dm-modal-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(720px, 100%);
  max-height: 82%;
  padding: 16px;
  border-radius: 14px;
  background: var(--dm-surface);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .28);
}
.dm-modal-card h3 { margin: 0; font-size: 14px; font-weight: 600; }
.dm-modal-card p { margin: 0; font-size: 12px; color: var(--dm-text-3); }
.dm-modal-card textarea {
  width: 100%;
  height: 280px;
  padding: 10px;
  border: 1px solid var(--dm-border);
  border-radius: 8px;
  background: var(--dm-surface-2);
  color: var(--dm-text);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.6;
  resize: none;
}
.dm-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }

@media (max-width: 960px) {
  .dm-panel { width: 300px; }
  .dm-filename { max-width: 160px; }
  .dm-hint { display: none; }
}
@media (max-width: 760px) {
  .dm-panel { width: 260px; }
  .dm-tool span { display: none; }
  .dm-tool { padding: 0 8px; }
}
`
