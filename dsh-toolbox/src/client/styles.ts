/**
 * dsh-toolbox shell stylesheet.
 *
 * Scoped under `.dtb-`; each tool ships its own stylesheet (`dvp-` for the video
 * player, `dti-` for image compare) which is injected alongside this one.
 * Colors come from DSH semantic tokens with neutral fallbacks, so light and dark
 * themes work without a second definition.
 */

export const STYLE_ID = 'dsh-toolbox-style'

export const CSS = `
.dtb-root {
  --dtb-bg: var(--dsw-alias-bg-base, #ffffff);
  --dtb-layer: var(--dsw-alias-bg-layer-1, #ffffff);
  --dtb-layer-2: var(--dsw-alias-bg-layer-2, #f6f7f9);
  --dtb-text: var(--dsw-alias-label-primary, #17181a);
  --dtb-text-2: var(--dsw-alias-label-secondary, #4b4c4f);
  --dtb-text-3: var(--dsw-alias-label-tertiary, #7b7d82);
  --dtb-caption: var(--dsw-alias-label-caption, #9a9ca1);
  --dtb-border: var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  --dtb-border-soft: var(--dsw-alias-border-l1, rgba(0, 0, 0, .05));
  --dtb-hover: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
  --dtb-active: var(--dsw-alias-interactive-bg-active, rgba(0, 0, 0, .1));
  --dtb-accent: var(--dsw-alias-state-business-primary, #4176e6);
  --dtb-success: var(--dsw-alias-state-success-primary, #22c55e);
  position: relative;
  display: flex;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--dtb-bg);
  color: var(--dtb-text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
.dtb-root *, .dtb-root *::before, .dtb-root *::after { box-sizing: border-box; }
.dtb-root button { cursor: pointer; font-family: inherit; }
.dtb-root ::selection { background: color-mix(in srgb, var(--dtb-accent) 24%, transparent); }

/* ── sidebar ──────────────────────────────────────────────────────────── */
.dtb-sidebar {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 0 0 254px;
  flex-direction: column;
  min-height: 0;
  padding: 16px 12px 12px;
  border-right: 1px solid var(--dtb-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--dtb-accent) 6%, transparent), transparent 190px),
    var(--dtb-layer);
}
.dtb-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 2px 6px 16px;
}
.dtb-logo {
  display: grid;
  flex: 0 0 36px;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(135deg, #4f8cff 0%, #7c6cff 55%, #2dd4bf 128%);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--dtb-accent) 28%, transparent);
}
.dtb-brand-text { min-width: 0; }
.dtb-brand-text h1 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -.01em;
  white-space: nowrap;
}
.dtb-brand-text p {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--dtb-text-3);
  white-space: nowrap;
}
.dtb-section-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 8px;
  color: var(--dtb-caption);
  font-size: 11px;
  letter-spacing: .04em;
}
.dtb-count {
  display: inline-flex;
  align-items: center;
  height: 17px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--dtb-hover);
  color: var(--dtb-text-3);
  font-size: 10.5px;
}
.dtb-list { display: flex; flex-direction: column; gap: 4px; min-height: 0; overflow-y: auto; }
.dtb-tool {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 9px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  text-align: left;
  transition: background .16s ease, border-color .16s ease;
}
.dtb-tool:hover { background: var(--dtb-hover); }
.dtb-tool:focus-visible { outline: 2px solid color-mix(in srgb, var(--dtb-tool-accent, var(--dtb-accent)) 55%, transparent); outline-offset: 1px; }
.dtb-tool[data-active="true"] {
  border-color: color-mix(in srgb, var(--dtb-tool-accent, var(--dtb-accent)) 24%, transparent);
  background: color-mix(in srgb, var(--dtb-tool-accent, var(--dtb-accent)) 9%, transparent);
}
.dtb-tool[data-active="true"]::before {
  content: "";
  position: absolute;
  top: 50%;
  left: -1px;
  width: 3px;
  height: 22px;
  border-radius: 0 3px 3px 0;
  background: var(--dtb-tool-accent, var(--dtb-accent));
  transform: translateY(-50%);
}
.dtb-tool-glyph {
  display: grid;
  flex: 0 0 34px;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: var(--dtb-tool-accent, var(--dtb-accent));
  background: color-mix(in srgb, var(--dtb-tool-accent, var(--dtb-accent)) 12%, transparent);
  transition: color .16s ease, background .16s ease;
}
.dtb-tool[data-active="true"] .dtb-tool-glyph {
  color: #fff;
  background: linear-gradient(135deg, var(--dtb-tool-accent, var(--dtb-accent)), color-mix(in srgb, var(--dtb-tool-accent, var(--dtb-accent)) 55%, #7c6cff));
  box-shadow: 0 6px 14px color-mix(in srgb, var(--dtb-tool-accent, var(--dtb-accent)) 28%, transparent);
}
.dtb-tool-text { display: flex; flex: 1; flex-direction: column; gap: 1px; min-width: 0; }
.dtb-tool-text strong { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dtb-tool-text span { color: var(--dtb-text-3); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dtb-tool-chevron { flex: 0 0 16px; color: var(--dtb-tool-accent, var(--dtb-accent)); opacity: 0; transform: translateX(-2px); transition: opacity .16s ease, transform .16s ease; }
.dtb-tool[data-active="true"] .dtb-tool-chevron { opacity: .85; transform: none; }
.dtb-foot {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
  padding: 12px 8px 2px;
  border-top: 1px solid var(--dtb-border-soft);
  color: var(--dtb-text-3);
  font-size: 11px;
}
.dtb-foot-row { display: flex; align-items: center; gap: 6px; }
.dtb-foot-row .dtb-foot-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dtb-success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dtb-success) 18%, transparent);
}
.dtb-version { color: var(--dtb-caption); font-variant-numeric: tabular-nums; }

/* ── content ──────────────────────────────────────────────────────────── */
.dtb-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--dtb-bg);
}
.dtb-pane {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.dtb-pane[hidden] { display: none; }

@media (max-width: 880px) {
  .dtb-sidebar { flex-basis: 68px; align-items: center; padding: 14px 8px 10px; }
  .dtb-brand { padding: 0 0 12px; }
  .dtb-brand-text, .dtb-section-label, .dtb-tool-text, .dtb-tool-chevron, .dtb-foot-text { display: none; }
  .dtb-tool { justify-content: center; padding: 7px; }
  .dtb-foot { align-items: center; padding: 10px 0 2px; }
}
`
