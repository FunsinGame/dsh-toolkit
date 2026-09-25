/**
 * Measure the effect popover's real layout in headless Chrome.
 *
 * WHY: "the expanded switch overflows the popup" is a layout bug, and layout bugs cannot
 * be settled by reading CSS. This drives a real browser, opens the real app, expands every
 * effect slot, and reports the actual boxes — so a fix can be confirmed rather than hoped
 * for.
 *
 * The in-page half lives in `popover-measure.js` as a real file; keeping it out of this
 * one avoids escaping its backticks inside a template literal, which silently broke the
 * whole expression the first time.
 *
 * Chrome is driven over the DevTools Protocol on a WebSocket. Node 24 has a global
 * WebSocket, so this needs no dependency.
 *
 * Usage:
 *   node packages/web/scripts/check-popover-layout.mjs <appUrl>
 * where appUrl is the engine's /?token=... URL.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appUrl = process.argv[2];
if (!appUrl) {
  console.error('usage: node check-popover-layout.mjs <appUrl>');
  process.exit(2);
}

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
  await send('Page.navigate', { url: appUrl });
  await sleep(3500); // engine bootstrap + model load

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

    const failures = [];
    if (!value?.popover) failures.push('the effect popover did not open');
    if (value && value.slotToggles === 0) failures.push('no effect slot toggles were found to expand');
    if (value && value.paneFitsPopover === false) {
      // The reported bug: the panel grows past the popover, so the popover clips it and
      // the clipped part cannot be scrolled to.
      failures.push('the panel is ' + value.paneOverflowsPopoverBy + 'px taller than the popover (it must fit and scroll)');
    }
    if (value?.contentIsScrollable && value.paneOverflowY === 'visible') {
      failures.push('content exceeds the panel but the panel cannot scroll');
    }
    if (value && value.lastSlotVisibleAtBottom === false) {
      failures.push('the last slot cannot be reached by scrolling to the end');
    }
    if (value && value.firstSlotVisible === false) failures.push('the first slot is not visible after scrolling back to the top');
    if (value?.popoverAboveViewport) failures.push('the popover is pushed above the viewport');
    if (value?.popoverFitsViewport === false) failures.push('the popover extends below the viewport');

    console.log('');
    if (failures.length) {
      console.log('RESULT: layout check FAILED');
      for (const f of failures) console.log('  -', f);
      process.exitCode = 1;
    } else {
      console.log('RESULT: the popover contains its content and scrolls to every slot.');
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
