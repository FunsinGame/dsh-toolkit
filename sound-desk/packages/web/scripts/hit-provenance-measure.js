/**
 * The in-page half of `check-hit-provenance.mjs`.
 *
 * Reads what the result list actually renders for one query: the path badge's text and
 * the tooltip behind it, for every row. Kept as a real file so no backtick needs escaping
 * inside the driver's template literal — the failure mode that once silently broke the
 * popover measurement.
 *
 * Returns a plain object. No imports, no globals beyond the DOM.
 */
(() => {
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  return (async () => {
    const out = { rows: [] };
    const badges = [...document.querySelectorAll('.results .row')];
    out.rowCount = badges.length;
    if (badges.length === 0) return out;

    // The badge is the first `.count` inside the row's trailing control group.
    for (const row of badges.slice(0, 40)) {
      const name = row.querySelector('.name');
      const count = row.querySelector('.count');
      /*
        The 匹配度 bar, found by its own inline geometry rather than by "the first span with
        a title". That naive selector picked the UCS CatID badge, whose title is the
        *classification* source — so this check compared one row's provenance against
        another element's and reported a contradiction that did not exist.
      */
      const bar = row.querySelector('span[style*="width: 3px"]');
      out.rows.push({
        filename: name ? (name.textContent || '').trim() : null,
        badge: count ? (count.textContent || '').trim() : null,
        badgeTitle: count ? count.getAttribute('title') : null,
        // The 匹配度 bar carries the same reasons; checked too so the two entries cannot
        // disagree about the same hit.
        barTitle: bar ? bar.getAttribute('title') : null,
      });
    }
    await wait(50);
    await nextFrame();
    return out;
  })();
})();
