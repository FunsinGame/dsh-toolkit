/**
 * The in-page measurement for popover-layout.mjs.
 *
 * Kept as a real file rather than a string inside the driver: as a template literal it
 * had to escape every backtick, and one stray pair silently broke the whole expression —
 * which is exactly the kind of failure that makes a verification script untrustworthy.
 *
 * Measures all three transport popovers (效果 / 多轨 / 对比) against the same rules,
 * because they share one box: whatever goes wrong for one can go wrong for the others, and
 * the point of this check is to catch that before a user does.
 *
 * Returns a promise resolving to a plain object of measurements. No imports, no globals
 * beyond the DOM.
 */
(() => {
  const q = (sel) => document.querySelector(sel);
  const textButton = (label) =>
    [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim().startsWith(label));

  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
  };
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * The element a given item actually scrolls inside.
   *
   * Derived from the item's own ancestors rather than guessed from a selector list: the
   * first scrollable descendant of the panel turned out to be the 对比 query textarea
   * (it has `resize: vertical` and a scrollbar of its own), which the check then measured
   * instead of the column bodies. Walking up from the item cannot make that mistake — the
   * container measured is by construction the one the item is inside.
   *
   * Falls back to the popover body, which is the container that would scroll once the
   * content outgrows the box.
   */
  function scrollerFor(item, body) {
    let el = item ? item.parentElement : null;
    while (el && el !== body) {
      if (el.scrollHeight > el.clientHeight + 1) {
        const overflowY = getComputedStyle(el).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') return el;
      }
      el = el.parentElement;
    }
    return body;
  }

  /**
   * Make one panel as tall as its content can get, then report whether the popover
   * contains it and can reach every item in it.
   *
   * Nothing here forces a body open or reaches into app state: the panel is grown through
   * its own controls, because a container measured against a DOM the app never builds
   * proves nothing.
   */
  async function measure(buttonLabel, testId, grow, itemSelector, itemLabel) {
    const out = { panel: testId, steps: [] };

    const btn = textButton(buttonLabel);
    out.steps.push({ step: 'found ' + buttonLabel + ' button', ok: Boolean(btn) });
    if (!btn) return out;

    // Every panel toggles, so a second click would close it again. Only click when it is
    // not already the open one.
    if (!btn.classList.contains('active')) btn.click();
    await wait(900);

    const popover = q('[data-testid="' + testId + '"]');
    out.steps.push({ step: 'popover opened', ok: Boolean(popover) });
    if (!popover) return out;

    out.openedOnlyOne = document.querySelectorAll('.transport-popover').length === 1;

    const body = popover.querySelector('.popover-body');
    const pane = body && body.firstElementChild;
    out.itemsBeforeGrow = [...popover.querySelectorAll(itemSelector)].length;
    out.grownHow = await grow(popover, out);

    const items = [...popover.querySelectorAll(itemSelector)];
    out.items = items.length;
    out.itemLabel = itemLabel;
    out.popover = box(popover);
    out.body = box(body);
    out.pane = box(pane);
    out.viewport = { w: innerWidth, h: innerHeight };

    /*
      The failure this check exists for: a panel TALLER than the popover, so the popover's
      own overflow clips everything past the fold and no amount of scrolling reaches it.
      Both the body and the panel must stay inside the box that clips them.
    */
    out.bodyFitsPopover = out.body ? out.body.bottom <= out.popover.bottom + 1 : null;
    out.bodyOverflowsPopoverBy = out.body ? out.body.bottom - out.popover.bottom : null;
    out.paneFitsPopover = out.pane ? out.pane.bottom <= out.popover.bottom + 1 : null;
    out.paneOverflowsPopoverBy = out.pane ? out.pane.bottom - out.popover.bottom : null;

    const scroller = scrollerFor(items[0], body);
    out.scrollerClass = scroller ? scroller.className || scroller.tagName : null;
    out.scrollerOverflowY = scroller ? getComputedStyle(scroller).overflowY : null;
    out.scrollHeight = scroller ? scroller.scrollHeight : null;
    out.clientHeight = scroller ? scroller.clientHeight : null;
    out.contentIsScrollable = scroller ? scroller.scrollHeight > scroller.clientHeight + 1 : null;

    /*
      The scrollable region must lie inside the popover. If it does, "reachable by scrolling
      the scroller" and "visible inside the popover" are the same statement, so the
      per-item checks below are not measuring two different things.
    */
    const sBox = box(scroller);
    out.scroller = sBox;
    out.scrollerInsidePopover = sBox
      ? sBox.top >= out.popover.top - 1 && sBox.bottom <= out.popover.bottom + 1
      : null;

    /**
     * Scroll so `el` should be visible, then measure it.
     *
     * Positions come from the live rects rather than `offsetTop`, because an item's
     * `offsetParent` is not necessarily its scroller — the mixer track is positioned
     * against the panel, the effect slot against the body — and a wrong offset would move
     * the scroller by the wrong amount and report a reachable item as unreachable.
     *
     * Computed per element rather than by jumping to the end: the six compare columns sit
     * side by side, so "the last item" and "the first item" are level with each other and
     * only a per-element check can tell whether each is reachable.
     *
     * An item taller than the scroller can never be fully visible; there the honest claim is
     * that scrolling brings it flush to the edge, so its visible edge is checked instead.
     */
    async function reachable(el) {
      if (!el || !scroller) return null;
      const taller = el.offsetHeight > scroller.clientHeight;
      const elTop = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      const target = taller ? elTop : elTop - (scroller.clientHeight - el.offsetHeight) / 2;
      scroller.scrollTop = Math.max(0, target);
      await nextFrame();
      const b = box(el);
      const fullyVisible = b.top >= sBox.top - 1 && b.bottom <= sBox.bottom + 1;
      const topAligned = b.top >= sBox.top - 1 && b.top < sBox.bottom;
      const bottomAligned = b.bottom <= sBox.bottom + 1 && b.bottom > sBox.top;
      return {
        box: b,
        fullyVisible,
        visible: taller ? topAligned || bottomAligned : fullyVisible,
        tallerThanScroller: taller,
      };
    }

    out.firstItem = items.length ? await reachable(items[0]) : null;
    out.lastItem = items.length ? await reachable(items[items.length - 1]) : null;

    // And every item in between, so "the third column is unreachable" cannot hide behind a
    // passing first and last.
    const all = [];
    for (const item of items) all.push(await reachable(item));
    out.itemsReachable = all.filter((r) => r && r.visible).length;
    out.itemsChecked = all.length;

    if (scroller) scroller.scrollTop = 0;
    await nextFrame();

    /*
      The 对比 query box must not have scrolled away. Measured after the scroller has been
      moved through its whole range, because that is when a missing `position: sticky` — or
      a body that scrolls the panel as a whole — would have taken it off screen.
    */
    const controls = popover.querySelector('.pane.compare > .section');
    if (controls) {
      const b = box(controls);
      out.queryBox = b;
      out.queryBoxVisible = b.top >= out.popover.top - 1 && b.top < out.popover.bottom;
    }

    out.popoverAboveViewport = out.popover ? out.popover.top < 0 : null;
    out.popoverFitsViewport = out.popover ? out.popover.top >= 0 && out.popover.bottom <= innerHeight : null;

    // Close it again through its own close button, so the next panel starts clean and a
    // panel that cannot be closed is caught.
    const close = popover.querySelector('.popover-close');
    out.hasCloseButton = Boolean(close);
    if (close) close.click();
    await wait(300);
    out.closedAgain = !q('[data-testid="' + testId + '"]');

    return out;
  }

  /** Expand every effect slot through its checkbox — what makes that panel grow. */
  async function growEffects(popover) {
    const toggles = [...popover.querySelectorAll('.fx-slot-head input[type="checkbox"]')];
    for (const t of toggles) {
      if (!t.checked) t.click();
    }
    await wait(200);
    return toggles.length + ' slots toggled on';
  }

  /**
   * Add as many tracks as the mixer will take.
   *
   * The 加入多轨 button acts on the selected asset, so the first step is to select one from
   * the result list. That mirrors the real workflow (find a sound, layer it) and it means
   * the panel is grown through the app's own controls rather than by injecting state.
   */
  async function growMixer(popover) {
    const firstRow = q('.row');
    if (firstRow) {
      firstRow.click();
      await wait(1200);
    }

    let added = 0;
    for (let i = 0; i < 6; i += 1) {
      const add = [...popover.querySelectorAll('button')].find((b) =>
        (b.textContent || '').trim().startsWith('加入多轨'),
      );
      if (!add || add.disabled) break;
      add.click();
      added += 1;
      await wait(500);
    }
    return added + ' tracks added';
  }

  /** Six columns, six result lists, is far more content than one screen. */
  async function growCompare(popover) {
    const input = popover.querySelector('.cmp-input');
    if (!input) return 'no query box';
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    const queries = ['door close', 'metal impact', 'wind gust', 'footstep gravel', 'water splash', 'glass break'];
    setter.call(input, queries.join('\n'));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(100);
    const run = [...popover.querySelectorAll('button')].find((b) =>
      (b.textContent || '').trim().startsWith('对比'),
    );
    if (!run) return 'no run button';
    run.click();
    await wait(7000); // six sequential searches
    return 'ran ' + queries.length + ' queries';
  }

  return (async () => {
    const out = { panels: [] };
    out.panels.push(await measure('效果', 'popover-effects', growEffects, '.fx-slot', 'effect slot'));
    out.panels.push(await measure('多轨', 'popover-mixer', growMixer, '.mx-track', 'mixer track'));
    out.panels.push(await measure('对比', 'popover-compare', growCompare, '.cmp-column', 'compare column'));
    return out;
  })();
})();
