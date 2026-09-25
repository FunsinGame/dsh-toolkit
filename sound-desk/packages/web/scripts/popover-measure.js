/**
 * The in-page measurement for check-popover-layout.mjs.
 *
 * Kept as a real file rather than a string inside the driver: as a template literal it
 * had to escape every backtick, and one stray pair silently broke the whole expression —
 * which is exactly the kind of failure that makes a verification script untrustworthy.
 *
 * Returns a promise resolving to a plain object of measurements. No imports, no globals
 * beyond the DOM.
 */
(() => {
  const q = (sel) => document.querySelector(sel);
  const textButton = (label) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(label));
  const out = { steps: [] };

  const effectsBtn = textButton('效果');
  out.steps.push({ step: 'found effects button', ok: Boolean(effectsBtn) });
  if (!effectsBtn) return Promise.resolve(out);
  effectsBtn.click();

  return new Promise((resolve) => {
    setTimeout(() => {
      const popover = q('.effects-popover');
      out.steps.push({ step: 'popover opened', ok: Boolean(popover) });
      if (!popover) return resolve(out);

      const pane = popover.querySelector('.pane.effects');

      // Turn every slot ON through its own control, which is what makes the panel grow
      // tall. Forcing the body visible instead would measure a DOM the app never builds.
      const toggles = [...popover.querySelectorAll('.fx-slot-head input[type="checkbox"]')];
      for (const t of toggles) {
        if (!t.checked) t.click();
      }
      out.slotToggles = toggles.length;

      const slots = [...popover.querySelectorAll('.fx-slot')];

      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
      };
      const describe = (s) => ({ text: s.textContent.trim().slice(0, 14), box: box(s) });

      out.popover = box(popover);
      out.pane = box(pane);
      out.slotBodies = popover.querySelectorAll('.fx-slot-body').length;
      out.viewport = { w: innerWidth, h: innerHeight };
      out.paneScroll = pane ? { scrollHeight: pane.scrollHeight, clientHeight: pane.clientHeight } : null;
      out.contentIsScrollable = pane ? pane.scrollHeight > pane.clientHeight + 1 : null;
      out.paneOverflowY = pane ? getComputedStyle(pane).overflowY : null;
      out.paneFitsPopover = pane ? out.pane.bottom <= out.popover.bottom + 1 : null;
      out.paneOverflowsPopoverBy = pane ? out.pane.bottom - out.popover.bottom : null;
      out.slotsTotal = slots.length;

      const pBottom = out.popover.bottom;
      const pTop = out.popover.top;
      out.paneInner = pane ? { top: Math.round(pane.getBoundingClientRect().top), bottom: Math.round(pane.getBoundingClientRect().bottom) } : null;

      /*
        Measure AFTER the browser has applied the scroll.

        getBoundingClientRect reflects the current scroll offset, so reading it in the same
        task as setting scrollTop returns the pre-scroll geometry — which made this check
        report the bug as still present after it was fixed. Two frames is the conventional
        way to wait for the new layout to be painted.
      */
      const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      /*
        Note on what is NOT a bug: with the container scrolled to the end, the early slots
        have negative `top` because they are scrolled off — that is correct behaviour, not
        overflow. The failure the user hit was the opposite and much worse: the panel was
        TALLER than the popover, so the popover's own overflow clipped everything past the
        fold and no amount of scrolling could reach it. That is what `paneFitsPopover`
        catches, together with reachability of both ends.
      */
      if (pane) pane.scrollTop = pane.scrollHeight;
      nextFrame().then(() => {
        out.lastSlotAtBottom = slots.length ? box(slots[slots.length - 1]) : null;
        out.lastSlotVisibleAtBottom = out.lastSlotAtBottom
          ? out.lastSlotAtBottom.bottom <= pBottom + 1 && out.lastSlotAtBottom.top >= pTop - 1
          : null;

        if (pane) pane.scrollTop = 0;
        nextFrame().then(() => {
          out.firstSlot = slots.length ? box(slots[0]) : null;
          out.firstSlotVisible = out.firstSlot ? out.firstSlot.top >= pTop - 1 && out.firstSlot.top < pBottom : null;
          out.popoverAboveViewport = pTop < 0;
          out.popoverFitsViewport = pTop >= 0 && pBottom <= innerHeight;
          resolve(out);
        });
      });
    }, 900);
  });
})();
