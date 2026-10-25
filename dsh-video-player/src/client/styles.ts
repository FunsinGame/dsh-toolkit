/**
 * dsh-video-player stylesheet.
 *
 * Everything is scoped under `.dvp-root`. Colors come from DSH's semantic
 * tokens with neutral fallbacks, so light and dark themes work without a second
 * theme definition. The page follows the shell's radius/spacing language rather
 * than introducing its own design system.
 */

export const STYLE_ID = 'dsh-video-player-style'

export const CSS = `
.dvp-root {
  --dvp-bg: var(--dsw-alias-bg-base, #ffffff);
  --dvp-surface: var(--dsw-alias-bg-layer-1, #ffffff);
  --dvp-surface-2: var(--dsw-alias-bg-layer-2, #f6f7f9);
  --dvp-surface-3: var(--dsw-alias-bg-layer-3, #ffffff);
  --dvp-text: var(--dsw-alias-label-primary, #17181a);
  --dvp-text-2: var(--dsw-alias-label-secondary, #4b4c4f);
  --dvp-text-3: var(--dsw-alias-label-tertiary, #7b7d82);
  --dvp-caption: var(--dsw-alias-label-caption, #9a9ca1);
  --dvp-border: var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  --dvp-border-soft: var(--dsw-alias-border-l1, rgba(0, 0, 0, .05));
  --dvp-hover: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
  --dvp-hover-strong: var(--dsw-alias-interactive-bg-active, rgba(0, 0, 0, .1));
  --dvp-accent: var(--dsw-alias-state-business-primary, #4176e6);
  --dvp-accent-2: #8b5cf6;
  --dvp-pink: #fb7299;
  --dvp-danger: var(--dsw-alias-state-error-primary, #e5484d);
  --dvp-warn: var(--dsw-alias-state-warn-primary, #f59e0b);
  --dvp-success: var(--dsw-alias-state-success-primary, #22c55e);
  --dvp-radius: 16px;
  --dvp-radius-sm: 11px;
  --dvp-shadow: 0 18px 45px rgba(15, 23, 42, .10);
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--dvp-bg);
  color: var(--dvp-text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  outline: none;
}
body[data-ds-dark-theme] .dvp-root {
  --dvp-shadow: 0 18px 45px rgba(0, 0, 0, .48);
}
.dvp-root::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(760px 360px at 6% -18%, color-mix(in srgb, var(--dvp-accent) 10%, transparent), transparent 62%),
    radial-gradient(620px 320px at 100% -8%, color-mix(in srgb, var(--dvp-pink) 8%, transparent), transparent 64%);
}
.dvp-root *, .dvp-root *::before, .dvp-root *::after { box-sizing: border-box; }
.dvp-root button, .dvp-root input, .dvp-root select { font: inherit; color: inherit; }
.dvp-root button { cursor: pointer; }
.dvp-root button:disabled { cursor: default; opacity: .42; }
.dvp-root ::selection { background: color-mix(in srgb, var(--dvp-accent) 26%, transparent); }

/* ── header ──────────────────────────────────────────────────────────── */
.dvp-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 18px;
  flex: 0 0 auto;
  padding: 16px 22px 12px;
}
.dvp-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.dvp-logo {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(135deg, #4f8cff 0%, #7c6cff 54%, #fb7299 125%);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--dvp-accent) 30%, transparent);
}
.dvp-brand-text { min-width: 0; }
.dvp-brand-text h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -.01em;
  white-space: nowrap;
}
.dvp-brand-text p {
  margin: 2px 0 0;
  font-size: 11.5px;
  color: var(--dvp-text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dvp-header-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
  margin-left: 4px;
}
.dvp-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 9px;
  border: 1px solid var(--dvp-border-soft);
  border-radius: 999px;
  background: color-mix(in srgb, var(--dvp-surface) 72%, transparent);
  color: var(--dvp-text-2);
  font-size: 11px;
  white-space: nowrap;
}
.dvp-chip.strong { color: var(--dvp-accent); border-color: color-mix(in srgb, var(--dvp-accent) 26%, transparent); background: color-mix(in srgb, var(--dvp-accent) 8%, transparent); }
.dvp-chip.warn { color: var(--dvp-warn); border-color: color-mix(in srgb, var(--dvp-warn) 30%, transparent); background: color-mix(in srgb, var(--dvp-warn) 9%, transparent); }
.dvp-header-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; flex: 0 0 auto; }

/* ── buttons ─────────────────────────────────────────────────────────── */
.dvp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 34px;
  padding: 0 13px;
  border: 1px solid var(--dvp-border);
  border-radius: 10px;
  background: var(--dvp-surface);
  color: var(--dvp-text);
  font-size: 12.5px;
  font-weight: 550;
  white-space: nowrap;
  transition: background .15s ease, border-color .15s ease, transform .12s ease;
}
.dvp-btn:hover { background: var(--dvp-hover); }
.dvp-btn:active { transform: scale(.98); }
.dvp-btn.primary {
  border-color: transparent;
  color: #fff;
  background: linear-gradient(135deg, #4f8cff, #6f6bff);
  box-shadow: 0 7px 16px color-mix(in srgb, var(--dvp-accent) 26%, transparent);
}
.dvp-btn.primary:hover { filter: brightness(1.05); }
.dvp-btn.ghost { border-color: transparent; background: transparent; color: var(--dvp-text-3); }
.dvp-btn.ghost:hover { background: var(--dvp-hover); color: var(--dvp-text); }
.dvp-btn.small { height: 28px; padding: 0 9px; font-size: 11.5px; border-radius: 9px; }

.dvp-iconbtn {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--dvp-text-2);
  transition: background .15s ease, color .15s ease, transform .12s ease;
}
.dvp-iconbtn:hover { background: var(--dvp-hover); color: var(--dvp-text); }
.dvp-iconbtn:active { transform: scale(.94); }
.dvp-iconbtn.active { color: var(--dvp-accent); background: color-mix(in srgb, var(--dvp-accent) 12%, transparent); }
.dvp-iconbtn.reverse.active { color: var(--dvp-warn); background: color-mix(in srgb, var(--dvp-warn) 13%, transparent); }

/* ── page body ───────────────────────────────────────────────────────── */
.dvp-body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 22px 18px;
}

/* ── stage ───────────────────────────────────────────────────────────── */
.dvp-stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 210px;
  overflow: hidden;
  border: 1px solid var(--dvp-border-soft);
  border-radius: var(--dvp-radius);
  background:
    radial-gradient(70% 90% at 50% 0%, rgba(255, 255, 255, .05), transparent 70%),
    #0a0b0e;
  box-shadow: var(--dvp-shadow);
  isolation: isolate;
}
.dvp-stage::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .03);
}
.dvp-stage.dragging { border-color: var(--dvp-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dvp-accent) 24%, transparent), var(--dvp-shadow); }
.dvp-video-host {
  position: absolute;
  inset: 0;
  z-index: 1;
}
.dvp-video {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: transparent;
  outline: none;
}
.dvp-stage:not([data-ready="true"]) .dvp-video { opacity: 0; pointer-events: none; }

.dvp-stage-tools {
  position: absolute;
  z-index: 3;
  left: 12px;
  top: 12px;
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: calc(100% - 24px);
  pointer-events: none;
}
.dvp-stage-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 25px;
  max-width: 100%;
  padding: 0 9px;
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 999px;
  background: rgba(10, 12, 16, .62);
  color: rgba(255, 255, 255, .88);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  backdrop-filter: blur(10px);
}
.dvp-stage-tag strong { font-weight: 600; color: #fff; }
.dvp-stage-tag.reverse { border-color: color-mix(in srgb, var(--dvp-warn) 50%, transparent); color: #ffd28a; }
.dvp-stage-tag.playing { border-color: color-mix(in srgb, var(--dvp-success) 45%, transparent); color: #b7f7d0; }
.dvp-live-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 18%, transparent);
  animation: dvp-pulse 1.25s ease-in-out infinite;
}
@keyframes dvp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }

.dvp-frame-badge {
  position: absolute;
  z-index: 3;
  left: 12px;
  bottom: 12px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, .13);
  border-radius: 9px;
  background: rgba(10, 12, 16, .68);
  color: rgba(255, 255, 255, .78);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  backdrop-filter: blur(10px);
  pointer-events: none;
}
.dvp-frame-badge strong { color: #fff; font-weight: 650; letter-spacing: .02em; }
.dvp-stage-info {
  position: absolute;
  z-index: 3;
  right: 12px;
  bottom: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 9px;
  background: rgba(10, 12, 16, .58);
  color: rgba(255, 255, 255, .62);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  backdrop-filter: blur(10px);
  pointer-events: none;
}

/* ── empty / loading / error overlays ────────────────────────────────── */
.dvp-overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(60% 70% at 50% 42%, color-mix(in srgb, var(--dvp-accent) 13%, transparent), transparent 72%),
    #0a0b0e;
  color: rgba(255, 255, 255, .9);
}
.dvp-empty {
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 13px;
  text-align: center;
}
.dvp-empty-orb {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 22px;
  color: #fff;
  background: linear-gradient(135deg, rgba(79, 140, 255, .32), rgba(124, 108, 255, .22));
  box-shadow: 0 14px 34px rgba(0, 0, 0, .34), inset 0 1px 0 rgba(255, 255, 255, .11);
}
.dvp-empty h2 { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: -.01em; }
.dvp-empty p { margin: 0; max-width: 420px; color: rgba(255, 255, 255, .55); font-size: 12.5px; line-height: 1.65; }
.dvp-empty .dvp-btn.primary { height: 38px; padding: 0 18px; font-size: 13px; border-radius: 11px; }
.dvp-empty-features { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 2px; }
.dvp-empty-features span {
  padding: 4px 9px;
  border: 1px solid rgba(255, 255, 255, .1);
  border-radius: 999px;
  color: rgba(255, 255, 255, .5);
  background: rgba(255, 255, 255, .035);
  font-size: 10.5px;
}
.dvp-spinner {
  width: 30px;
  height: 30px;
  border: 2.5px solid rgba(255, 255, 255, .15);
  border-top-color: rgba(255, 255, 255, .85);
  border-radius: 50%;
  animation: dvp-spin .8s linear infinite;
}
@keyframes dvp-spin { to { transform: rotate(360deg); } }
.dvp-loading { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
.dvp-loading strong { font-size: 13px; font-weight: 600; }
.dvp-loading span { color: rgba(255, 255, 255, .5); font-size: 11.5px; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dvp-error {
  width: min(460px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 11px;
  text-align: center;
}
.dvp-error-icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  color: #ffb4b4;
  background: rgba(229, 72, 77, .14);
  border: 1px solid rgba(229, 72, 77, .22);
}
.dvp-error strong { font-size: 14px; font-weight: 620; }
.dvp-error p { margin: 0; color: rgba(255, 255, 255, .56); font-size: 12px; line-height: 1.6; }
.dvp-error-actions { display: flex; gap: 8px; margin-top: 2px; }
.dvp-error-actions .dvp-btn { border-color: rgba(255, 255, 255, .16); background: rgba(255, 255, 255, .07); color: #fff; }
.dvp-error-actions .dvp-btn:hover { background: rgba(255, 255, 255, .12); }
.dvp-drop-hint {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  border: 2px dashed color-mix(in srgb, var(--dvp-accent) 60%, transparent);
  border-radius: inherit;
  background: color-mix(in srgb, var(--dvp-accent) 14%, rgba(10, 11, 14, .72));
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  backdrop-filter: blur(2px);
  pointer-events: none;
}
.dvp-toast {
  position: absolute;
  z-index: 6;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  max-width: calc(100% - 32px);
  padding: 8px 13px;
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 10px;
  background: rgba(16, 18, 24, .86);
  color: rgba(255, 255, 255, .88);
  font-size: 11.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 10px 26px rgba(0, 0, 0, .3);
  backdrop-filter: blur(12px);
  animation: dvp-toast-in .18s ease-out;
}
@keyframes dvp-toast-in { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }

/* ── controls ────────────────────────────────────────────────────────── */
.dvp-controls {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 11px;
  border: 1px solid var(--dvp-border-soft);
  border-radius: var(--dvp-radius);
  background: color-mix(in srgb, var(--dvp-surface) 88%, transparent);
  box-shadow: 0 8px 24px rgba(15, 23, 42, .05);
  backdrop-filter: blur(14px);
}
body[data-ds-dark-theme] .dvp-controls { box-shadow: 0 8px 24px rgba(0, 0, 0, .24); }

.dvp-timeline-row { display: flex; align-items: center; gap: 10px; }
.dvp-time {
  flex: 0 0 auto;
  min-width: 62px;
  color: var(--dvp-text-2);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  letter-spacing: .01em;
}
.dvp-time.total { text-align: right; color: var(--dvp-caption); }
.dvp-range-wrap {
  position: relative;
  flex: 1 1 auto;
  height: 26px;
  display: flex;
  align-items: center;
}
.dvp-range-track {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 5px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: var(--dvp-surface-2);
  overflow: hidden;
}
.dvp-range-buffer { position: absolute; inset: 0 auto 0 0; width: var(--dvp-buffer, 0%); background: color-mix(in srgb, var(--dvp-text-3) 22%, transparent); }
.dvp-range-fill { position: absolute; inset: 0 auto 0 0; width: var(--dvp-fill, 0%); background: linear-gradient(90deg, #4f8cff, #7c6cff); }
.dvp-range {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 26px;
  margin: 0;
  padding: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}
.dvp-range:disabled { cursor: default; }
.dvp-range::-webkit-slider-runnable-track { height: 26px; background: transparent; }
.dvp-range::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  margin-top: 6px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--dvp-accent);
  box-shadow: 0 1px 6px rgba(0, 0, 0, .3), 0 0 0 3px color-mix(in srgb, var(--dvp-accent) 15%, transparent);
  transition: transform .12s ease;
}
.dvp-range:hover::-webkit-slider-thumb { transform: scale(1.12); }
.dvp-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px color-mix(in srgb, var(--dvp-accent) 28%, transparent); }

.dvp-transport { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dvp-group { display: flex; align-items: center; gap: 2px; }
.dvp-play {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  margin: 0 3px;
  border: 0;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(135deg, #4f8cff, #6f6bff 70%, #8b5cf6);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--dvp-accent) 32%, transparent);
  transition: transform .12s ease, filter .15s ease;
}
.dvp-play:hover { filter: brightness(1.06); transform: scale(1.03); }
.dvp-play:active { transform: scale(.96); }
.dvp-play:disabled { opacity: .4; box-shadow: none; }
.dvp-reverse {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 11px;
  border: 1px solid var(--dvp-border);
  border-radius: 10px;
  background: transparent;
  color: var(--dvp-text-2);
  font-size: 11.5px;
  font-weight: 550;
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.dvp-reverse:hover { background: var(--dvp-hover); color: var(--dvp-text); }
.dvp-reverse.active {
  color: var(--dvp-warn);
  border-color: color-mix(in srgb, var(--dvp-warn) 34%, transparent);
  background: color-mix(in srgb, var(--dvp-warn) 11%, transparent);
}
.dvp-sep { width: 1px; height: 24px; flex: 0 0 1px; margin: 0 3px; background: var(--dvp-border-soft); }
.dvp-spacer { flex: 1 1 auto; }
.dvp-frame-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--dvp-border-soft);
  border-radius: 9px;
  background: var(--dvp-surface-2);
  color: var(--dvp-text-2);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dvp-frame-pill strong { color: var(--dvp-text); font-weight: 650; }
.dvp-frame-pill .dvp-total { color: var(--dvp-caption); }
.dvp-select {
  height: 30px;
  padding: 0 25px 0 9px;
  border: 1px solid var(--dvp-border-soft);
  border-radius: 9px;
  background-color: var(--dvp-surface-2);
  background-image: linear-gradient(45deg, transparent 50%, var(--dvp-text-3) 50%), linear-gradient(135deg, var(--dvp-text-3) 50%, transparent 50%);
  background-position: calc(100% - 12px) 13px, calc(100% - 8px) 13px;
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
  color: var(--dvp-text-2);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  appearance: none;
  cursor: pointer;
  outline: none;
}
.dvp-select:focus-visible { border-color: color-mix(in srgb, var(--dvp-accent) 45%, transparent); }
.dvp-volume { display: flex; align-items: center; gap: 3px; }
.dvp-volume-range {
  width: 70px;
  height: 22px;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}
.dvp-volume-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--dvp-accent) var(--dvp-volume, 100%), var(--dvp-surface-2) var(--dvp-volume, 100%));
}
.dvp-volume-range::-webkit-slider-thumb {
  appearance: none;
  width: 11px;
  height: 11px;
  margin-top: -3.5px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--dvp-accent);
  box-shadow: 0 1px 4px rgba(0, 0, 0, .25);
}
.dvp-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  color: var(--dvp-caption);
  font-size: 10.5px;
  line-height: 1.4;
  padding-top: 1px;
}
.dvp-hint kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border: 1px solid var(--dvp-border-soft);
  border-bottom-width: 2px;
  border-radius: 5px;
  background: var(--dvp-surface-2);
  color: var(--dvp-text-2);
  font-family: inherit;
  font-size: 10px;
  font-weight: 600;
}
.dvp-hint-dot { width: 3px; height: 3px; border-radius: 50%; background: var(--dvp-border); }
.dvp-hint-spacer { flex: 1 1 auto; }

/* ── responsive ──────────────────────────────────────────────────────── */
@media (max-width: 780px) {
  .dvp-header { padding: 12px 14px 9px; gap: 10px; }
  .dvp-header-meta { display: none; }
  .dvp-brand-text p { display: none; }
  .dvp-body { padding: 0 14px 12px; gap: 9px; }
  .dvp-controls { padding: 10px 11px 9px; gap: 8px; }
  .dvp-hint { display: none; }
  .dvp-time { min-width: 50px; font-size: 10.5px; }
  .dvp-frame-pill { order: 10; }
  .dvp-spacer { display: none; }
  .dvp-volume-range { width: 54px; }
}
@media (max-width: 540px) {
  .dvp-header-actions .dvp-btn span { display: none; }
  .dvp-header-actions .dvp-btn { width: 34px; padding: 0; }
  .dvp-brand-text h1 { font-size: 14px; }
  .dvp-stage { min-height: 170px; }
  .dvp-empty h2 { font-size: 16px; }
  .dvp-empty p { font-size: 11.5px; }
  .dvp-empty-features { display: none; }
  .dvp-stage-info { display: none; }
  .dvp-frame-badge { font-size: 10px; }
  .dvp-sep { display: none; }
  .dvp-transport { gap: 6px; }
}
@media (max-height: 520px) {
  .dvp-header { padding-top: 9px; padding-bottom: 6px; }
  .dvp-brand-text p { display: none; }
  .dvp-controls { padding-top: 8px; padding-bottom: 7px; }
  .dvp-hint { display: none; }
  .dvp-stage { min-height: 140px; }
}
`
