/**
 * Measure the transport popovers' real layout in headless Chrome.
 *
 * WHY: "the expanded switch overflows the popup" is a layout bug, and layout bugs cannot
 * be settled by reading CSS. This drives a real browser, opens the real app, grows each
 * panel to its tallest real content, and reports the actual boxes — so a fix can be
 * confirmed rather than hoped for. All three panels that share the popover slot are
 * checked together, because they share the box that used to be wrong.
 *
 * The in-page half lives in `popover-measure.js` as a real file; keeping it out of this
 * one avoids escaping its backticks inside a template literal, which silently broke the
 * whole expression the first time.
 *
 * Chrome is driven over the DevTools Protocol on a WebSocket. Node 24 has a global
 * WebSocket, so this needs no dependency.
 *
 * Usage:
 *   node packages/web/scripts/check-popover-layout.mjs <appUrl> [query]
 * where appUrl is the engine's /?token=... URL. A query is appended so the result list is
 * populated (the mixer layers the selected result, and an empty catalogue would leave
 * nothing to measure).
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appUrl = process.argv[2];
if (!appUrl) {
  console.error('usage: node check-popover-layout.mjs <appUrl> [query]');
  process.exit(2);
}

/**
 * Seed a query so the result list has rows.
 *
 * Appended to the existing query string rather than replacing it: the URL carries the
 * session token, and dropping it produces a page that never boots.
 */
const seedQuery = process.argv[3] ?? 'door';
const target = appUrl + (appUrl.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(seedQuery);

/**
 * `--break <kind>` reverts one of the load-bearing rules in the page before measuring.
 *
 * A check that has only ever passed proves nothing: it may be measuring the wrong element,
 * or asserting something that is true no matter what. Breaking a rule on purpose and
 * requiring the check to fail is what shows the assertions are connected to the layout. Run
 * it against the served bundle, which is the same CSS the app ships.
 */
const breakArg = process.argv.indexOf('--break');
const breakKind = breakArg >= 0 ? process.argv[breakArg + 1] : null;

const BREAK_CSS = {
  // Why the compare panel scrolls inside its columns instead of as a whole: without this,
  // the columns stretch to their content and the headers scroll away.
  compare: '.popover-body:has(.pane.compare){display:block!important}'
    + '.popover-body:has(.pane.compare)>.pane.compare{flex:0 0 auto!important}',
  // The effect-panel bug in its original form: the scroll container refuses to shrink below
  // its content, so the clipped part cannot be scrolled to.
  scroll: '.popover-body{flex:0 0 auto!important}',
};

const here = path.dirname(fileURLToPath(import.meta.url));
const MEASURE = readFileSync(path.join(here, 'popover-measure.js'), 'utf8');

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

const chrome = CHROME_CANDIDATES.find((candidate) => candidate && existsSync(candidate));
if (!chrome) {
  console.error('no Chrome/Edge binary found');
  process.exit(2);
}

const PORT = 9222 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(path.join(tmpdir(), 'sd-cdp-'));
const DEBUG_URL = 'http://127.0.0.1:' + PORT;

const child = spawn(
  chrome,
  [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1400,900',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findPageTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const res = await fetch(DEBUG_URL + '/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome did not expose a page target');
}

let nextId = 1;
function makeClient(ws) {
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
}

try {
  const page = await findPageTarget();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  const send = makeClient(ws);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: target });
  await sleep(5000); // engine bootstrap + model load + the seeded search

  if (breakKind) {
    if (!BREAK_CSS[breakKind]) {
      console.error('unknown --break kind: ' + breakKind);
      process.exit(2);
    }
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const style = document.createElement('style');
          style.textContent = ${JSON.stringify(BREAK_CSS[breakKind])};
          document.head.appendChild(style);
          return style.textContent.length;
        })()
      `,
      returnByValue: true,
    });
    console.log('!! measuring with "' + breakKind + '" broken on purpose — the check MUST fail\n');
  }

  const result = await send('Runtime.evaluate', {
    expression: MEASURE,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    console.error('the page threw while measuring:');
    console.error(JSON.stringify(result.exceptionDetails, null, 2));
    process.exitCode = 2;
  } else {
    const value = result.result?.value;
    console.log(JSON.stringify(value, null, 2));

    /*
      One set of rules for all three panels, because they share one box and one scroll
      container. The first rule is the one the user hit: a panel taller than the popover is
      clipped by it, and the clipped part cannot be scrolled to.
    */
    const failures = [];
    const panels = value?.panels ?? [];
    if (panels.length === 0) failures.push('no popover was measured at all');

    for (const panel of panels) {
      const name = panel.panel ?? '(unnamed panel)';
      if (!panel.popover) {
        failures.push(name + ': the popover did not open');
        continue;
      }
      if (panel.openedOnlyOne === false) {
        failures.push(name + ': more than one popover is open at once');
      }
      if (panel.items === 0) {
        failures.push(name + ': no ' + panel.itemLabel + ' to measure — the panel never grew');
      }
      if (panel.bodyFitsPopover === false) {
        failures.push(
          name +
            ': the popover body is ' +
            panel.bodyOverflowsPopoverBy +
            'px taller than the popover (it must fit and scroll)',
        );
      }
      if (panel.paneFitsPopover === false) {
        // The 效果 bug in its original form: the panel grew past the popover, so the
        // popover's own overflow clipped it and the clipped part could not be scrolled to.
        failures.push(
          name +
            ': the panel is ' +
            panel.paneOverflowsPopoverBy +
            'px taller than the popover (it must fit and scroll)',
        );
      }
      if (panel.scrollerInsidePopover === false) {
        failures.push(name + ': the scrolling region extends outside the popover');
      }
      if (panel.contentIsScrollable && panel.scrollerOverflowY !== 'auto' && panel.scrollerOverflowY !== 'scroll') {
        failures.push(
          name + ': content exceeds the panel but the container cannot scroll (' + panel.scrollerOverflowY + ')',
        );
      }
      if (panel.itemsChecked > 0 && panel.itemsReachable < panel.itemsChecked) {
        failures.push(
          name +
            ': only ' +
            panel.itemsReachable +
            ' of ' +
            panel.itemsChecked +
            ' ' +
            panel.itemLabel +
            ' can be scrolled into view',
        );
      }
      if (panel.queryBox && panel.queryBoxVisible === false) {
        failures.push(name + ': the query box scrolled out of the popover and cannot be reached');
      }
      if (panel.hasCloseButton === false) failures.push(name + ': the popover has no close button');
      if (panel.closedAgain === false) failures.push(name + ': the close button did not close the popover');
      if (panel.popoverAboveViewport) failures.push(name + ': the popover is pushed above the viewport');
      if (panel.popoverFitsViewport === false) failures.push(name + ': the popover extends below the viewport');
    }

    console.log('');
    if (breakKind) {
      /*
        Inverted in break mode, so the command's exit status means "the check is doing its
        job": a failure is the required outcome, and a pass is the alarm — it would mean the
        assertions are not connected to the layout rule that was just removed.
      */
      if (failures.length) {
        console.log('RESULT: OK — with "' + breakKind + '" broken the check fails as it must:');
        for (const f of failures) console.log('  -', f);
      } else {
        console.log('RESULT: THE CHECK IS BLIND — it passed with "' + breakKind + '" broken on purpose.');
        process.exitCode = 1;
      }
    } else if (failures.length) {
      console.log('RESULT: layout check FAILED');
      for (const f of failures) console.log('  -', f);
      process.exitCode = 1;
    } else {
      console.log('RESULT: all three popovers contain their content and scroll to every item.');
    }
  }

  ws.close();
} catch (err) {
  console.error('layout check errored:', err instanceof Error ? err.message : String(err));
  process.exitCode = 2;
} finally {
  child.kill();
  await sleep(300);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* chrome may still hold the profile */
  }
}
