/**
 * A panel that opens *above the transport* instead of taking layout space.
 *
 * Three of the workbench's panels — 效果 / 多轨 / 对比 — are things you open, use,
 * and close. Docked, each one permanently took width or height away from the
 * results list while being idle, and 对比 additionally displaced the entire centre
 * column (which is why it used to be a mode you "exited" rather than a panel you
 * closed). As popovers they cost nothing until opened, and the results list stays
 * where it is — which is the point, because every panel is *about* the sound the
 * list is pointing at.
 *
 * The wrapper owns the box, the scroll and the single close button, so a panel
 * only renders content. That is what keeps the three consistent:
 *
 *  - `open` renders nothing at all rather than hiding with CSS, so a closed panel
 *    holds no DOM and cannot trap focus or a pointer.
 *  - Scrolling lives here, not in each panel. The fix for the effects list
 *    overflowing its box was `flex: 1 1 auto` on the scrolling child; with the
 *    scroll in one place, the next panel cannot reintroduce that bug.
 *  - `title` and `hint` give every popover the same header, so 「关闭」 is always in
 *    the same spot and always means the same thing.
 */

export function Popover({
  open,
  title,
  hint,
  testId,
  onClose,
  onPointerDown,
  children,
}: {
  open: boolean;
  title: string;
  /** short right-aligned status, e.g. what you are currently hearing */
  hint?: string;
  /** stable hook for the layout check; CSS class names are for styling */
  testId?: string;
  onClose: () => void;
  onPointerDown?: (ev: React.PointerEvent) => void;
  children: React.ReactNode;
}): React.JSX.Element | null {
  if (!open) return null;
  return (
    <div className="transport-popover" data-testid={testId} onPointerDown={onPointerDown}>
      <div className="popover-head">
        <span className="popover-title">{title}</span>
        <span className="popover-head-right">
          {hint ? <span className="count">{hint}</span> : null}
          <button className="popover-close" onClick={onClose} title={`关闭${title}`}>
            关闭
          </button>
        </span>
      </div>
      <div className="popover-body">{children}</div>
    </div>
  );
}
