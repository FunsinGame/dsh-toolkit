/**
 * Which panel is open above the transport.
 *
 * The state is a single choice rather than three booleans because the three panels
 * (效果 / 多轨 / 对比) are anchored in the same place: two open at once would overlap
 * into an unusable stack. Keeping the transition rules here, as pure functions, is what
 * makes that testable — the store is a module singleton wired to an engine client, so
 * the interesting logic has to live outside it to be checked at all.
 */

/** A panel the user can ask for; the absence of one is `null`. */
export type PanelName = 'effects' | 'mixer' | 'compare';

/** The open panel, or `null` when every panel is closed. */
export type OpenPanel = PanelName | null;

export const PANEL_NAMES: readonly PanelName[] = ['effects', 'mixer', 'compare'];

/**
 * The panel open after the user clicks a panel's own button.
 *
 * Clicking the open panel's button closes it — that is what makes the transport buttons
 * work as toggles — and clicking a different one replaces it rather than adding to it.
 */
export function nextPanel(current: OpenPanel, clicked: PanelName): OpenPanel {
  return current === clicked ? null : clicked;
}

/**
 * Whether a change to `next` is worth writing.
 *
 * Restoring the remembered panel on boot must open it even when it happens to equal the
 * current value, so this is an equality check rather than a toggle: it exists to avoid
 * pointless re-renders and localStorage writes, not to flip anything.
 */
export function panelChanged(current: OpenPanel, next: OpenPanel): boolean {
  return current !== next;
}

/** Read a persisted value back, rejecting anything that is not a known panel. */
export function panelFromPersisted(raw: string | null | undefined): OpenPanel {
  return PANEL_NAMES.find((name) => name === raw) ?? null;
}
