/**
 * The player's stylesheet, injected once by the client plugin.
 *
 * Everything is scoped under `.dmp-root` (or `.dmp-status` for the status-bar
 * item). Colors come from DSH's design tokens with neutral fallbacks, so the
 * page follows light/dark themes without a second theme definition.
 */

export const STYLE_ID = 'dsh-music-player-style'

export const CSS = `
.dmp-root {
  --dmp-bg: var(--dsw-alias-bg-base, #ffffff);
  --dmp-surface: var(--dsw-alias-bg-layer-1, #ffffff);
  --dmp-surface-2: var(--dsw-alias-bg-layer-2, #f7f7f9);
  --dmp-surface-3: var(--dsw-alias-bg-layer-3, #ffffff);
  --dmp-text: var(--dsw-alias-label-primary, #17181a);
  --dmp-text-2: var(--dsw-alias-label-secondary, #4b4c4f);
  --dmp-text-3: var(--dsw-alias-label-tertiary, #7b7d82);
  --dmp-caption: var(--dsw-alias-label-caption, #9a9ca1);
  --dmp-border: var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  --dmp-border-soft: var(--dsw-alias-border-l1, rgba(0, 0, 0, .05));
  --dmp-hover: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
  --dmp-hover-strong: var(--dsw-alias-interactive-bg-active, rgba(0, 0, 0, .1));
  --dmp-accent: var(--dsw-alias-state-business-primary, #4176e6);
  --dmp-accent-2: #8b5cf6;
  --dmp-pink: #fb7299;
  --dmp-danger: var(--dsw-alias-state-error-primary, #e5484d);
  --dmp-success: var(--dsw-alias-state-success-primary, #22c55e);
  --dmp-warn: var(--dsw-alias-state-warn-primary, #f59e0b);
  --dmp-radius: 18px;
  --dmp-radius-sm: 12px;
  --dmp-shadow: 0 20px 55px rgba(15, 23, 42, .14);
  position: relative;
  display: flex;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--dmp-bg);
  color: var(--dmp-text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
body[data-ds-dark-theme] .dmp-root {
  --dmp-shadow: 0 20px 55px rgba(0, 0, 0, .5);
}
.dmp-root *, .dmp-root *::before, .dmp-root *::after { box-sizing: border-box; }
.dmp-root button, .dmp-root input, .dmp-root select { font: inherit; color: inherit; }
.dmp-root button { cursor: pointer; }
.dmp-root button:disabled { cursor: default; opacity: .45; }
.dmp-root ::selection { background: color-mix(in srgb, var(--dmp-accent) 26%, transparent); }
.dmp-root ::-webkit-scrollbar { width: 10px; height: 10px; }
.dmp-root ::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-scrollbar-bg-l1, rgba(0, 0, 0, .16));
  border: 3px solid transparent;
  border-radius: 999px;
  background-clip: content-box;
}
.dmp-root ::-webkit-scrollbar-thumb:hover { background-color: var(--dsw-alias-scrollbar-hover-l1, rgba(0, 0, 0, .28)); }
.dmp-root ::-webkit-scrollbar-track { background: transparent; }

.dmp-root::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(900px 480px at 8% -10%, color-mix(in srgb, var(--dmp-accent) 10%, transparent), transparent 60%),
    radial-gradient(760px 420px at 100% 0%, color-mix(in srgb, var(--dmp-pink) 8%, transparent), transparent 62%);
  opacity: .9;
}

/* ── left navigation ─────────────────────────────────────────────────── */
.dmp-nav {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: 228px;
  flex: 0 0 228px;
  padding: 20px 12px 14px;
  border-right: 1px solid var(--dmp-border-soft);
  background: color-mix(in srgb, var(--dsw-specific-sidebar-fill, var(--dmp-surface-2)) 72%, transparent);
  backdrop-filter: blur(18px);
}
.dmp-brand { display: flex; align-items: center; gap: 11px; padding: 2px 8px 20px; }
.dmp-brand-mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 13px;
  color: #fff;
  background: linear-gradient(135deg, #4f8cff 0%, #7c6cff 52%, #fb7299 120%);
  box-shadow: 0 10px 22px color-mix(in srgb, var(--dmp-accent) 34%, transparent);
}
.dmp-brand-text { min-width: 0; }
.dmp-brand-text h1 { margin: 0; font-size: 14px; font-weight: 650; letter-spacing: .01em; }
.dmp-brand-text span { display: block; margin-top: 1px; font-size: 10.5px; color: var(--dmp-caption); letter-spacing: .06em; text-transform: uppercase; }
.dmp-nav-list { display: flex; flex-direction: column; gap: 3px; }
.dmp-nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 9px 11px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: var(--dmp-text-2);
  text-align: left;
  transition: background .16s ease, color .16s ease, transform .16s ease;
}
.dmp-nav-item:hover { background: var(--dmp-hover); color: var(--dmp-text); }
.dmp-nav-item:active { transform: scale(.985); }
.dmp-nav-item.active {
  background: var(--dsw-specific-sidebar-nav-item-active, var(--dmp-hover-strong));
  color: var(--dmp-text);
  font-weight: 600;
}
.dmp-nav-item.active::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 50%;
  width: 3px;
  height: 16px;
  border-radius: 3px;
  background: linear-gradient(180deg, var(--dmp-accent), var(--dmp-accent-2));
  transform: translateY(-50%);
}
.dmp-nav-item .dmp-nav-icon { display: grid; place-items: center; width: 19px; color: var(--dmp-text-3); transition: color .16s ease; }
.dmp-nav-item.active .dmp-nav-icon, .dmp-nav-item:hover .dmp-nav-icon { color: var(--dmp-accent); }
.dmp-nav-item .dmp-nav-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-nav-badge {
  min-width: 19px;
  height: 19px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dmp-accent) 14%, transparent);
  color: var(--dmp-accent);
  font-size: 10.5px;
  font-weight: 650;
  display: grid;
  place-items: center;
}
.dmp-nav-foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; padding-top: 14px; }
.dmp-account-mini {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 9px;
  border: 1px solid var(--dmp-border-soft);
  border-radius: 12px;
  background: color-mix(in srgb, var(--dmp-surface) 70%, transparent);
  text-align: left;
  transition: border-color .16s ease, background .16s ease;
}
.dmp-account-mini:hover { border-color: var(--dmp-border); background: var(--dmp-surface); }
.dmp-account-mini .dmp-avatar { width: 28px; height: 28px; flex: 0 0 28px; }
.dmp-account-mini .dmp-mini-name { min-width: 0; }
.dmp-account-mini .dmp-mini-name strong { display: block; font-size: 11.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-account-mini .dmp-mini-name span { display: block; font-size: 10px; color: var(--dmp-caption); }
.dmp-host-line { display: flex; align-items: center; gap: 6px; padding: 0 9px; font-size: 10px; color: var(--dmp-caption); }
.dmp-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dmp-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dmp-success) 18%, transparent); }
.dmp-dot.bad { background: var(--dmp-danger); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dmp-danger) 18%, transparent); }

/* ── main column ─────────────────────────────────────────────────────── */
.dmp-main { position: relative; z-index: 1; display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; min-height: 0; }
.dmp-topbar { display: flex; align-items: flex-start; gap: 18px; padding: 22px 28px 12px; flex: 0 0 auto; }
.dmp-topbar-title h2 { margin: 0; font-size: 19px; font-weight: 650; letter-spacing: -.01em; }
.dmp-topbar-title p { margin: 3px 0 0; font-size: 11.5px; color: var(--dmp-text-3); }
.dmp-topbar-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-wrap: wrap; justify-content: flex-end; }
.dmp-content { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 4px 28px 26px; scroll-behavior: smooth; }

/* ── generic controls ────────────────────────────────────────────────── */
.dmp-iconbtn {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--dmp-text-2);
  transition: background .16s ease, color .16s ease, border-color .16s ease, transform .12s ease;
}
.dmp-iconbtn:hover { background: var(--dmp-hover); color: var(--dmp-text); }
.dmp-iconbtn:active { transform: scale(.94); }
.dmp-iconbtn.bordered { border-color: var(--dmp-border); background: var(--dmp-surface); }
.dmp-iconbtn.danger:hover { background: color-mix(in srgb, var(--dmp-danger) 12%, transparent); color: var(--dmp-danger); }
.dmp-iconbtn.on { color: var(--dmp-accent); background: color-mix(in srgb, var(--dmp-accent) 12%, transparent); }
.dmp-iconbtn.sm { width: 27px; height: 27px; flex-basis: 27px; border-radius: 8px; }
.dmp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 13px;
  border: 1px solid var(--dmp-border);
  border-radius: 10px;
  background: var(--dmp-surface);
  color: var(--dmp-text);
  font-size: 12px;
  font-weight: 550;
  white-space: nowrap;
  transition: background .16s ease, border-color .16s ease, transform .12s ease, box-shadow .16s ease;
}
.dmp-btn:hover { background: var(--dmp-hover); border-color: var(--dmp-border); }
.dmp-btn:active { transform: scale(.98); }
.dmp-btn.primary {
  border-color: transparent;
  color: #fff;
  background: linear-gradient(135deg, var(--dmp-accent), var(--dmp-accent-2));
  box-shadow: 0 8px 18px color-mix(in srgb, var(--dmp-accent) 26%, transparent);
}
.dmp-btn.primary:hover { box-shadow: 0 10px 24px color-mix(in srgb, var(--dmp-accent) 34%, transparent); filter: brightness(1.04); }
.dmp-btn.subtle { border-color: transparent; background: transparent; color: var(--dmp-text-2); }
.dmp-btn.subtle:hover { background: var(--dmp-hover); color: var(--dmp-text); }
.dmp-btn.danger { color: var(--dmp-danger); border-color: color-mix(in srgb, var(--dmp-danger) 34%, transparent); background: color-mix(in srgb, var(--dmp-danger) 7%, transparent); }
.dmp-btn.danger:hover { background: color-mix(in srgb, var(--dmp-danger) 13%, transparent); }
.dmp-btn.sm { height: 27px; padding: 0 10px; font-size: 11px; border-radius: 8px; }
.dmp-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 7px;
  border-radius: 6px;
  background: var(--dmp-hover);
  color: var(--dmp-text-3);
  font-size: 10px;
  font-weight: 550;
  white-space: nowrap;
}
.dmp-tag.accent { background: color-mix(in srgb, var(--dmp-accent) 12%, transparent); color: var(--dmp-accent); }
.dmp-tag.warn { background: color-mix(in srgb, var(--dmp-warn) 14%, transparent); color: var(--dmp-warn); }
.dmp-tag.danger { background: color-mix(in srgb, var(--dmp-danger) 12%, transparent); color: var(--dmp-danger); }
.dmp-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-muted { color: var(--dmp-text-3); }
.dmp-caption { color: var(--dmp-caption); font-size: 10.5px; }
.dmp-divider { height: 1px; background: var(--dmp-border-soft); margin: 16px 0; }

/* ── search ──────────────────────────────────────────────────────────── */
.dmp-search-hero {
  position: relative;
  overflow: hidden;
  padding: 26px 26px 20px;
  border: 1px solid var(--dmp-border-soft);
  border-radius: 22px;
  background:
    radial-gradient(560px 260px at 88% -30%, color-mix(in srgb, var(--dmp-pink) 20%, transparent), transparent 70%),
    linear-gradient(135deg, color-mix(in srgb, var(--dmp-accent) 12%, var(--dmp-surface)) 0%, color-mix(in srgb, var(--dmp-accent-2) 8%, var(--dmp-surface)) 100%);
  box-shadow: 0 10px 30px color-mix(in srgb, var(--dmp-accent) 8%, transparent);
}
.dmp-search-hero::after {
  content: "";
  position: absolute;
  right: -40px;
  bottom: -70px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  border: 26px solid color-mix(in srgb, var(--dmp-pink) 12%, transparent);
  pointer-events: none;
}
.dmp-search-kicker { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 650; letter-spacing: .1em; color: var(--dmp-accent); text-transform: uppercase; }
.dmp-search-hero h3 { margin: 8px 0 4px; font-size: clamp(20px, 2.2vw, 28px); font-weight: 680; letter-spacing: -.02em; }
.dmp-search-hero p { margin: 0 0 18px; color: var(--dmp-text-3); font-size: 12px; }
.dmp-search-box {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 720px;
  padding: 6px 6px 6px 14px;
  border: 1px solid var(--dmp-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--dmp-surface) 92%, transparent);
  box-shadow: 0 10px 26px rgba(15, 23, 42, .08);
  transition: border-color .16s ease, box-shadow .16s ease;
}
.dmp-search-box:focus-within { border-color: color-mix(in srgb, var(--dmp-accent) 55%, var(--dmp-border)); box-shadow: 0 0 0 4px color-mix(in srgb, var(--dmp-accent) 12%, transparent); }
.dmp-search-box svg { color: var(--dmp-text-3); flex: 0 0 auto; }
.dmp-search-input { flex: 1; min-width: 0; height: 34px; border: 0; outline: 0; background: transparent; font-size: 13.5px; }
.dmp-search-input::placeholder { color: var(--dmp-caption); }
.dmp-search-btn { height: 34px; padding: 0 18px; border: 0; border-radius: 10px; color: #fff; font-weight: 600; background: linear-gradient(135deg, var(--dmp-accent), var(--dmp-accent-2)); }
.dmp-chips { position: relative; z-index: 1; display: flex; flex-wrap: wrap; gap: 7px; margin-top: 13px; }
.dmp-chip {
  height: 25px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--dmp-border) 80%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--dmp-surface) 58%, transparent);
  color: var(--dmp-text-2);
  font-size: 11px;
  transition: background .16s ease, border-color .16s ease, color .16s ease;
}
.dmp-chip:hover { background: var(--dmp-surface); border-color: var(--dmp-accent); color: var(--dmp-accent); }

.dmp-section-head { display: flex; align-items: center; gap: 10px; margin: 22px 0 10px; }
.dmp-section-head h4 { margin: 0; font-size: 13px; font-weight: 650; }
.dmp-section-head .dmp-caption { margin-left: auto; }
.dmp-result-list { display: flex; flex-direction: column; gap: 2px; }
.dmp-result {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 13px;
  transition: background .14s ease, border-color .14s ease;
}
.dmp-result:hover { background: var(--dmp-hover); }
.dmp-result.current { background: color-mix(in srgb, var(--dmp-accent) 8%, transparent); border-color: color-mix(in srgb, var(--dmp-accent) 20%, transparent); }
.dmp-result.selected { background: color-mix(in srgb, var(--dmp-accent) 7%, transparent); }
.dmp-result-cover {
  position: relative;
  width: 58px;
  height: 58px;
  flex: 0 0 58px;
  overflow: hidden;
  border-radius: 10px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--dmp-accent) 18%, var(--dmp-surface-2)), color-mix(in srgb, var(--dmp-pink) 16%, var(--dmp-surface-2)));
  display: grid;
  place-items: center;
  color: var(--dmp-text-3);
}
.dmp-result-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dmp-result-cover .dmp-cover-fallback { opacity: .55; }
.dmp-result-cover .dmp-duration-badge {
  position: absolute;
  right: 4px;
  bottom: 4px;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(0, 0, 0, .62);
  color: #fff;
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
}
.dmp-result-main { flex: 1; min-width: 0; }
.dmp-result-title { display: flex; align-items: center; gap: 7px; min-width: 0; }
.dmp-result-title strong { font-size: 12.8px; font-weight: 590; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-result-meta { display: flex; align-items: center; gap: 8px; margin-top: 4px; color: var(--dmp-text-3); font-size: 10.5px; min-width: 0; }
.dmp-result-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-result-meta .sep { color: var(--dmp-caption); }
.dmp-result-actions { display: flex; align-items: center; gap: 1px; flex: 0 0 auto; opacity: .3; transition: opacity .14s ease; }
.dmp-result:hover .dmp-result-actions, .dmp-result:focus-within .dmp-result-actions, .dmp-result.current .dmp-result-actions { opacity: 1; }
.dmp-result-actions .dmp-iconbtn { color: var(--dmp-text-3); }
.dmp-result-actions .dmp-iconbtn:hover { color: var(--dmp-accent); background: color-mix(in srgb, var(--dmp-accent) 11%, transparent); }
.dmp-result-actions .dmp-iconbtn.play:hover { color: #fff; background: var(--dmp-accent); }
.dmp-check {
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  border: 1.5px solid var(--dmp-border);
  border-radius: 5px;
  background: var(--dmp-surface);
  color: #fff;
  transition: background .14s ease, border-color .14s ease;
}
.dmp-check.on { background: var(--dmp-accent); border-color: var(--dmp-accent); }

/* ── empty / loading ─────────────────────────────────────────────────── */
.dmp-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 260px; padding: 36px 22px; text-align: center; color: var(--dmp-text-3); }
.dmp-empty .dmp-empty-icon { display: grid; place-items: center; width: 66px; height: 66px; border-radius: 22px; background: var(--dmp-hover); color: var(--dmp-text-3); }
.dmp-empty h4 { margin: 2px 0 0; font-size: 14px; font-weight: 600; color: var(--dmp-text); }
.dmp-empty p { margin: 0; max-width: 380px; font-size: 11.5px; color: var(--dmp-text-3); }
.dmp-skeleton { display: flex; flex-direction: column; gap: 8px; }
.dmp-skeleton-row { display: flex; align-items: center; gap: 13px; padding: 8px 10px; }
.dmp-skeleton-block { border-radius: 8px; background: linear-gradient(90deg, var(--dmp-hover) 20%, var(--dmp-hover-strong) 40%, var(--dmp-hover) 60%); background-size: 220% 100%; animation: dmp-shimmer 1.25s linear infinite; }
.dmp-skeleton-cover { width: 58px; height: 58px; flex: 0 0 58px; border-radius: 10px; }
.dmp-skeleton-line { height: 11px; }
.dmp-error { display: flex; align-items: center; gap: 10px; margin: 12px 0; padding: 11px 13px; border: 1px solid color-mix(in srgb, var(--dmp-danger) 28%, transparent); border-radius: 11px; background: color-mix(in srgb, var(--dmp-danger) 7%, transparent); color: var(--dmp-danger); font-size: 11.5px; }
.dmp-pager { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 18px 0 4px; color: var(--dmp-text-3); font-size: 11px; }

/* ── favorites ───────────────────────────────────────────────────────── */
.dmp-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.dmp-toolbar .dmp-input {
  height: 32px;
  min-width: 200px;
  flex: 1;
  max-width: 360px;
  padding: 0 11px;
  border: 1px solid var(--dmp-border);
  border-radius: 9px;
  outline: 0;
  background: var(--dmp-surface);
}
.dmp-toolbar .dmp-input:focus { border-color: color-mix(in srgb, var(--dmp-accent) 55%, var(--dmp-border)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dmp-accent) 10%, transparent); }
.dmp-folder-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
.dmp-folder-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 128px;
  padding: 15px;
  border: 1px solid var(--dmp-border-soft);
  border-radius: 16px;
  background: var(--dmp-surface);
  text-align: left;
  cursor: pointer;
  transition: border-color .16s ease, transform .16s ease, box-shadow .16s ease;
}
.dmp-folder-card:focus-visible { outline: 2px solid var(--dmp-accent); outline-offset: 2px; }
.dmp-folder-card:hover { border-color: color-mix(in srgb, var(--dmp-accent) 30%, var(--dmp-border)); transform: translateY(-2px); box-shadow: 0 14px 30px color-mix(in srgb, var(--dmp-accent) 9%, transparent); }
.dmp-folder-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 13px;
  color: #fff;
  background: linear-gradient(135deg, var(--dmp-accent), var(--dmp-accent-2));
  box-shadow: 0 8px 18px color-mix(in srgb, var(--dmp-accent) 22%, transparent);
}
.dmp-folder-card:nth-child(3n+2) .dmp-folder-icon { background: linear-gradient(135deg, #fb7299, #f59e0b); box-shadow: 0 8px 18px rgba(251, 114, 153, .22); }
.dmp-folder-card:nth-child(3n) .dmp-folder-icon { background: linear-gradient(135deg, #22c55e, #06b6d4); box-shadow: 0 8px 18px rgba(34, 197, 94, .2); }
.dmp-folder-title { font-size: 12.8px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-folder-meta { margin-top: auto; display: flex; align-items: center; gap: 8px; color: var(--dmp-text-3); font-size: 10.5px; }
.dmp-folder-card .dmp-folder-delete { position: absolute; right: 8px; top: 8px; opacity: 0; transition: opacity .14s ease; }
.dmp-folder-card:hover .dmp-folder-delete { opacity: 1; }
.dmp-folder-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 13px; }
.dmp-folder-head .dmp-back { width: 32px; height: 32px; }
.dmp-folder-head h3 { margin: 0; font-size: 15px; font-weight: 650; }
.dmp-folder-head .dmp-caption { margin-left: 2px; }
.dmp-folder-head .dmp-spacer { flex: 1; }

/* ── queue ───────────────────────────────────────────────────────────── */
.dmp-queue-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.dmp-mode-group { display: inline-flex; padding: 3px; border: 1px solid var(--dmp-border-soft); border-radius: 11px; background: var(--dmp-surface-2); gap: 2px; }
.dmp-mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dmp-text-3);
  font-size: 10.5px;
  font-weight: 550;
  transition: background .14s ease, color .14s ease;
}
.dmp-mode-btn:hover { color: var(--dmp-text); }
.dmp-mode-btn.active { background: var(--dmp-surface); color: var(--dmp-accent); box-shadow: 0 1px 4px rgba(0, 0, 0, .08); }
.dmp-queue-row { display: flex; align-items: center; gap: 9px; padding: 6px 9px; border-radius: 11px; border: 1px solid transparent; transition: background .14s ease; }
.dmp-queue-row:hover { background: var(--dmp-hover); }
.dmp-queue-row.current { background: color-mix(in srgb, var(--dmp-accent) 8%, transparent); border-color: color-mix(in srgb, var(--dmp-accent) 18%, transparent); }
.dmp-queue-row.dragging { opacity: .4; }
.dmp-queue-row.drag-over { border-color: var(--dmp-accent); }
.dmp-drag { display: grid; place-items: center; width: 16px; flex: 0 0 16px; color: var(--dmp-caption); cursor: grab; opacity: .6; }
.dmp-drag:active { cursor: grabbing; }
.dmp-q-index { width: 18px; flex: 0 0 18px; text-align: center; font-size: 10px; color: var(--dmp-caption); font-variant-numeric: tabular-nums; }
.dmp-queue-row .dmp-result-cover { width: 44px; height: 44px; flex-basis: 44px; border-radius: 8px; }
.dmp-queue-row .dmp-result-title strong { font-size: 12.2px; }
.dmp-eq { display: inline-flex; align-items: flex-end; gap: 2px; height: 13px; width: 15px; }
.dmp-eq i { display: block; width: 2.5px; border-radius: 2px; background: var(--dmp-accent); height: 35%; animation: dmp-eq 0.9s ease-in-out infinite; }
.dmp-eq i:nth-child(2) { animation-delay: .15s; }
.dmp-eq i:nth-child(3) { animation-delay: .3s; }
.dmp-eq.paused i { animation-play-state: paused; opacity: .5; }

/* ── account ─────────────────────────────────────────────────────────── */
.dmp-account-layout { display: flex; justify-content: center; padding: 10px 0 30px; }
.dmp-account-card {
  width: min(560px, 100%);
  padding: 26px;
  border: 1px solid var(--dmp-border-soft);
  border-radius: 22px;
  background: var(--dmp-surface);
  box-shadow: var(--dmp-shadow);
  text-align: center;
}
.dmp-avatar {
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--dmp-accent), var(--dmp-accent-2));
  color: #fff;
  font-weight: 650;
}
.dmp-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dmp-account-card .dmp-avatar { width: 76px; height: 76px; margin: 0 auto 12px; font-size: 24px; box-shadow: 0 12px 28px color-mix(in srgb, var(--dmp-accent) 24%, transparent); }
.dmp-account-name { font-size: 17px; font-weight: 650; }
.dmp-account-mid { margin-top: 3px; color: var(--dmp-caption); font-size: 10.5px; }
.dmp-account-actions { display: flex; justify-content: center; gap: 8px; margin-top: 18px; }
.dmp-qr-box { position: relative; display: inline-grid; place-items: center; margin: 16px auto 10px; padding: 12px; border-radius: 18px; background: #fff; box-shadow: 0 10px 26px rgba(0, 0, 0, .1); }
.dmp-qr-box img { display: block; width: 208px; height: 208px; border-radius: 8px; }
.dmp-qr-box .dmp-qr-veil { position: absolute; inset: 0; border-radius: 18px; display: grid; place-items: center; background: rgba(255, 255, 255, .88); color: #17181a; font-size: 12px; }
.dmp-auth-status { min-height: 20px; margin: 8px 0 0; color: var(--dmp-text-3); font-size: 11.5px; }
.dmp-auth-status.scanned { color: var(--dmp-accent); }
.dmp-auth-status.success { color: var(--dmp-success); }
.dmp-auth-status.error { color: var(--dmp-danger); }
.dmp-steps { display: flex; justify-content: center; gap: 16px; margin-top: 14px; color: var(--dmp-text-3); font-size: 10.5px; }
.dmp-steps span { display: inline-flex; align-items: center; gap: 5px; }

/* ── settings ────────────────────────────────────────────────────────── */
.dmp-settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; align-items: start; }
.dmp-settings-card { padding: 16px 17px; border: 1px solid var(--dmp-border-soft); border-radius: 16px; background: var(--dmp-surface); }
.dmp-settings-card h4 { margin: 0 0 2px; font-size: 12.5px; font-weight: 650; }
.dmp-settings-card > p { margin: 0 0 12px; color: var(--dmp-text-3); font-size: 10.5px; }
.dmp-setting-row { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 7px 0; border-top: 1px solid var(--dmp-border-soft); }
.dmp-setting-row:first-of-type { border-top: 0; }
.dmp-setting-row .dmp-setting-label { flex: 1; min-width: 0; }
.dmp-setting-row .dmp-setting-label strong { display: block; font-size: 11.8px; font-weight: 550; }
.dmp-setting-row .dmp-setting-label span { display: block; margin-top: 1px; color: var(--dmp-caption); font-size: 10px; }
.dmp-setting-row .dmp-setting-value { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
.dmp-select {
  height: 29px;
  padding: 0 28px 0 9px;
  border: 1px solid var(--dmp-border);
  border-radius: 8px;
  outline: 0;
  background: var(--dmp-surface-2);
  color: var(--dmp-text);
  font-size: 11px;
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--dmp-text-3) 50%), linear-gradient(135deg, var(--dmp-text-3) 50%, transparent 50%);
  background-position: calc(100% - 13px) 12px, calc(100% - 9px) 12px;
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
}
.dmp-select:focus { border-color: color-mix(in srgb, var(--dmp-accent) 55%, var(--dmp-border)); }
.dmp-switch {
  position: relative;
  width: 36px;
  height: 21px;
  flex: 0 0 36px;
  border: 0;
  border-radius: 999px;
  background: var(--dmp-hover-strong);
  transition: background .18s ease;
}
.dmp-switch::after { content: ""; position: absolute; left: 3px; top: 3px; width: 15px; height: 15px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .2); transition: transform .18s ease; }
.dmp-switch.on { background: var(--dmp-accent); }
.dmp-switch.on::after { transform: translateX(15px); }
.dmp-range { width: 132px; height: 18px; accent-color: var(--dmp-accent); cursor: pointer; }
.dmp-meter { height: 7px; overflow: hidden; border-radius: 999px; background: var(--dmp-hover); }
.dmp-meter > i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--dmp-accent), var(--dmp-accent-2)); transition: width .3s ease; }
.dmp-meter-row { display: flex; align-items: center; gap: 10px; margin-top: 9px; }
.dmp-meter-row .dmp-meter { flex: 1; }
.dmp-meter-row .dmp-caption { white-space: nowrap; }
.dmp-kv { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; font-size: 10.8px; }
.dmp-kv span { color: var(--dmp-text-3); }
.dmp-kv strong { font-weight: 550; text-align: right; word-break: break-all; }
.dmp-logbox { max-height: 150px; overflow: auto; margin-top: 8px; padding: 9px 10px; border-radius: 9px; background: var(--dmp-surface-2); color: var(--dmp-text-3); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 9.5px; line-height: 1.55; white-space: pre-wrap; word-break: break-all; }

/* ── right now-playing column ────────────────────────────────────────── */
.dmp-side {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: 316px;
  flex: 0 0 316px;
  min-height: 0;
  overflow: auto;
  padding: 22px 20px 18px;
  border-left: 1px solid var(--dmp-border-soft);
  background: color-mix(in srgb, var(--dsw-specific-sidebar-fill, var(--dmp-surface-2)) 60%, transparent);
  backdrop-filter: blur(18px);
}
.dmp-side-title { display: flex; align-items: center; gap: 7px; margin-bottom: 13px; font-size: 10.5px; font-weight: 650; letter-spacing: .08em; color: var(--dmp-text-3); text-transform: uppercase; }
.dmp-np-art {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  margin-bottom: 15px;
  border-radius: 22px;
  isolation: isolate;
  background: linear-gradient(135deg, color-mix(in srgb, var(--dmp-accent) 24%, var(--dmp-surface-2)), color-mix(in srgb, var(--dmp-pink) 20%, var(--dmp-surface-2)));
}
.dmp-np-art::before {
  content: "";
  position: absolute;
  inset: 8%;
  z-index: -1;
  border-radius: 26px;
  background-image: inherit;
  background-size: cover;
  background-position: center;
  filter: blur(22px) saturate(1.25);
  opacity: .55;
  transform: translateY(10px) scale(.96);
}
.dmp-np-art-img {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 22px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, .22);
  background: var(--dmp-surface-2);
}
.dmp-np-art-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dmp-np-art-img .dmp-cover-fallback { position: absolute; inset: 0; display: grid; place-items: center; color: rgba(255, 255, 255, .8); background: linear-gradient(135deg, #4f8cff, #8b5cf6 55%, #fb7299); }
.dmp-np-art-img .dmp-vinyl {
  position: absolute;
  right: 14px;
  bottom: 14px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: #fff;
  background: rgba(15, 15, 15, .55);
  backdrop-filter: blur(8px);
}
.dmp-np-art-img .dmp-vinyl.spinning svg { animation: dmp-spin 4.5s linear infinite; }
.dmp-np-title { font-size: 15px; font-weight: 650; line-height: 1.35; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.dmp-np-author { margin-top: 4px; color: var(--dmp-text-3); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-np-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }
.dmp-np-progress { margin-top: 14px; }
.dmp-progress-track {
  position: relative;
  height: 16px;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.dmp-progress-track::before { content: ""; position: absolute; left: 0; right: 0; height: 4px; border-radius: 999px; background: var(--dmp-hover-strong); }
.dmp-progress-buffer { position: absolute; left: 0; height: 4px; border-radius: 999px; background: color-mix(in srgb, var(--dmp-accent) 24%, transparent); }
.dmp-progress-fill { position: absolute; left: 0; height: 4px; border-radius: 999px; background: linear-gradient(90deg, var(--dmp-accent), var(--dmp-accent-2)); }
.dmp-progress-thumb { position: absolute; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; background: #fff; box-shadow: 0 1px 5px rgba(0, 0, 0, .28); opacity: 0; transition: opacity .14s ease; }
.dmp-progress-track:hover .dmp-progress-thumb { opacity: 1; }
.dmp-progress-input { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: pointer; }
.dmp-time-row { display: flex; justify-content: space-between; margin-top: 3px; color: var(--dmp-caption); font-size: 10px; font-variant-numeric: tabular-nums; }
.dmp-np-controls { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 12px; }
.dmp-np-controls .dmp-iconbtn { width: 38px; height: 38px; flex-basis: 38px; border-radius: 12px; }
.dmp-play-big {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  flex: 0 0 54px;
  margin: 0 4px;
  border: 0;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(135deg, var(--dmp-accent), var(--dmp-accent-2));
  box-shadow: 0 12px 26px color-mix(in srgb, var(--dmp-accent) 34%, transparent);
  transition: transform .14s ease, box-shadow .16s ease;
}
.dmp-play-big:hover { transform: scale(1.04); box-shadow: 0 16px 32px color-mix(in srgb, var(--dmp-accent) 42%, transparent); }
.dmp-play-big:active { transform: scale(.96); }
.dmp-np-extra { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.dmp-np-extra .dmp-range { flex: 1; width: auto; }
.dmp-np-extra .dmp-select { height: 27px; font-size: 10.5px; }
.dmp-upnext { margin-top: 18px; border-top: 1px solid var(--dmp-border-soft); padding-top: 13px; }
.dmp-upnext .dmp-side-title { margin-bottom: 8px; }
.dmp-upnext-row { display: flex; align-items: center; gap: 9px; padding: 6px 5px; border-radius: 9px; cursor: pointer; }
.dmp-upnext-row:hover { background: var(--dmp-hover); }
.dmp-upnext-row .dmp-result-cover { width: 34px; height: 34px; flex-basis: 34px; border-radius: 7px; }
.dmp-upnext-row .dmp-upnext-title { flex: 1; min-width: 0; font-size: 10.8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-upnext-row .dmp-caption { flex: 0 0 auto; }

/* ── bottom player bar ───────────────────────────────────────────────── */
.dmp-playerbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 0 0 auto;
  min-height: 72px;
  padding: 10px 26px;
  border-top: 1px solid var(--dmp-border-soft);
  background: color-mix(in srgb, var(--dmp-surface) 78%, transparent);
  backdrop-filter: blur(18px);
}
.dmp-pb-track { display: flex; align-items: center; gap: 11px; min-width: 0; flex: 1 1 240px; max-width: 330px; }
.dmp-pb-cover { position: relative; width: 44px; height: 44px; flex: 0 0 44px; overflow: hidden; border-radius: 10px; background: var(--dmp-surface-2); display: grid; place-items: center; color: var(--dmp-text-3); }
.dmp-pb-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dmp-pb-meta { min-width: 0; }
.dmp-pb-meta strong { display: block; font-size: 11.8px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-pb-meta span { display: block; margin-top: 2px; color: var(--dmp-caption); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-pb-controls { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
.dmp-pb-controls .dmp-play-small {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  margin: 0 3px;
  border: 0;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(135deg, var(--dmp-accent), var(--dmp-accent-2));
  box-shadow: 0 6px 14px color-mix(in srgb, var(--dmp-accent) 28%, transparent);
}
.dmp-pb-progress { display: flex; align-items: center; gap: 9px; flex: 1 1 220px; min-width: 120px; }
.dmp-pb-progress .dmp-time { color: var(--dmp-caption); font-size: 9.5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dmp-pb-progress .dmp-progress-track { flex: 1; }
.dmp-pb-extra { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
.dmp-pb-extra .dmp-range { width: 82px; }
.dmp-pb-extra .dmp-select { height: 27px; font-size: 10.5px; padding-right: 24px; }
.dmp-pb-volume { display: flex; align-items: center; gap: 3px; }

/* ── toast / modal ───────────────────────────────────────────────────── */
.dmp-toast {
  position: absolute;
  left: 50%;
  bottom: 92px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(560px, calc(100% - 48px));
  padding: 10px 15px;
  border: 1px solid var(--dmp-border);
  border-radius: 12px;
  background: var(--dsw-alias-toast-bg, #2b2c2f);
  color: var(--dsw-alias-toast-label, #fff);
  box-shadow: 0 18px 44px rgba(0, 0, 0, .3);
  font-size: 11.5px;
  transform: translateX(-50%);
  animation: dmp-toast-in .22s ease;
}
.dmp-toast.error { background: color-mix(in srgb, var(--dmp-danger) 90%, #000); }
.dmp-toast.warn { background: color-mix(in srgb, var(--dmp-warn) 88%, #000); color: #fff; }
.dmp-toast.success { background: color-mix(in srgb, var(--dmp-success) 84%, #000); color: #fff; }
.dmp-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, .35));
  backdrop-filter: blur(3px);
  animation: dmp-fade-in .16s ease;
}
.dmp-modal {
  width: min(480px, 100%);
  max-height: min(78vh, 720px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--dmp-border);
  border-radius: 18px;
  background: var(--dmp-surface);
  box-shadow: var(--dmp-shadow);
  animation: dmp-modal-in .2s cubic-bezier(.2, .8, .2, 1);
}
.dmp-modal-head { display: flex; align-items: center; gap: 10px; padding: 17px 19px 10px; }
.dmp-modal-head h3 { margin: 0; font-size: 14.5px; font-weight: 650; }
.dmp-modal-head .dmp-iconbtn { margin-left: auto; }
.dmp-modal-body { padding: 4px 19px 12px; overflow: auto; }
.dmp-modal-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 19px 17px; }
.dmp-modal-foot .dmp-spacer { flex: 1; }
.dmp-modal-list { display: flex; flex-direction: column; gap: 2px; max-height: 320px; overflow: auto; }
.dmp-modal-row { display: flex; align-items: center; gap: 10px; padding: 9px 8px; border-radius: 9px; cursor: pointer; }
.dmp-modal-row:hover { background: var(--dmp-hover); }
.dmp-modal-row .dmp-folder-mini { display: grid; place-items: center; width: 28px; height: 28px; flex: 0 0 28px; border-radius: 8px; background: color-mix(in srgb, var(--dmp-accent) 12%, transparent); color: var(--dmp-accent); }
.dmp-modal-row .dmp-modal-row-title { flex: 1; min-width: 0; font-size: 11.8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dmp-modal-row .dmp-caption { flex: 0 0 auto; }

/* ── status bar item ─────────────────────────────────────────────────── */
.dmp-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  max-width: 380px;
  padding: 0 5px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #4b4c4f);
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
}
.dmp-status:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06)); color: var(--dsw-alias-label-primary, #17181a); }
.dmp-status .dmp-status-cover { width: 14px; height: 14px; flex: 0 0 14px; overflow: hidden; border-radius: 3px; background: var(--dsw-alias-bg-layer-2, #eee); display: grid; place-items: center; }
.dmp-status .dmp-status-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dmp-status .dmp-status-title { max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
.dmp-status .dmp-status-time { color: var(--dsw-alias-label-caption, #999); font-variant-numeric: tabular-nums; }
.dmp-status .dmp-status-btn { display: grid; place-items: center; width: 17px; height: 17px; border: 0; border-radius: 4px; background: transparent; color: inherit; padding: 0; }
.dmp-status .dmp-status-btn:hover { background: var(--dsw-alias-interactive-bg-active, rgba(0, 0, 0, .1)); }

/* ── utility / animation ─────────────────────────────────────────────── */
.dmp-spin { animation: dmp-spin .8s linear infinite; }
.dmp-fade-in { animation: dmp-fade-in .2s ease; }
.dmp-hidden { display: none !important; }
@keyframes dmp-spin { to { transform: rotate(360deg); } }
@keyframes dmp-shimmer { 0% { background-position: 120% 0; } 100% { background-position: -120% 0; } }
@keyframes dmp-eq { 0%, 100% { height: 30%; } 50% { height: 100%; } }
@keyframes dmp-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes dmp-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes dmp-modal-in { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes dmp-pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }

/* ── responsive ──────────────────────────────────────────────────────── */
@media (max-width: 1240px) {
  .dmp-side { width: 276px; flex-basis: 276px; }
}
@media (max-width: 1080px) {
  .dmp-side { display: none; }
  .dmp-nav { width: 208px; flex-basis: 208px; }
}
@media (max-width: 860px) {
  .dmp-nav { width: 64px; flex-basis: 64px; padding-left: 8px; padding-right: 8px; }
  .dmp-brand { justify-content: center; padding-left: 0; padding-right: 0; }
  .dmp-brand-text, .dmp-nav-label, .dmp-nav-badge, .dmp-account-mini .dmp-mini-name, .dmp-host-line span { display: none; }
  .dmp-nav-item { justify-content: center; padding: 10px 0; }
  .dmp-nav-item.active::before { display: none; }
  .dmp-account-mini { justify-content: center; padding: 6px; }
  .dmp-host-line { justify-content: center; }
  .dmp-content { padding-left: 18px; padding-right: 18px; }
  .dmp-topbar { padding-left: 18px; padding-right: 18px; }
  .dmp-playerbar { padding-left: 14px; padding-right: 14px; gap: 8px; }
  .dmp-pb-track { max-width: 200px; }
  .dmp-pb-extra .dmp-range, .dmp-pb-extra .dmp-select { display: none; }
}
@media (max-width: 620px) {
  .dmp-pb-progress, .dmp-pb-track .dmp-pb-meta { display: none; }
  .dmp-search-hero { padding: 18px; }
  .dmp-search-box { flex-wrap: wrap; }
  .dmp-search-btn { width: 100%; }
  .dmp-folder-grid { grid-template-columns: 1fr; }
}
`.trim()
