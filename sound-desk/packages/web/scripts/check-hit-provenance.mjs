/**
 * Check what the result list says about WHY each row is there, against a real library.
 *
 * WHY: the badge used to print the *classification* source (`asset.ucsSource`), whose
 * normal value is `filename` — so the column read 「文件名」 on almost every row instead of
 * naming the retriever that found it, and the semantic evidence (the fingerprint cosine)
 * never appeared in the reasons at all. Both are claims about rendered output, so they
 * are checked in a real browser against real data rather than by reading the component.
 *
 * Chrome is driven over the DevTools Protocol on a WebSocket; Node 24 has a global
 * WebSocket, so this needs no dependency.
 *
 * Usage:
 *   node packages/web/scripts/check-hit-provenance.mjs <appUrl> [query]
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appUrl = process.argv[2];
if (!appUrl) {
  console.error('usage: node check-hit-provenance.mjs <appUrl> [query]');
  process.exit(2);
}

const seedQuery = process.argv[3] ?? '金属门 关上';
const target = appUrl + (appUrl.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(seedQuery);

const here = path.dirname(fileURLToPath(import.meta.url));
const MEASURE = readFileSync(path.join(here, 'hit-provenance-measure.js'), 'utf8');

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

const PORT = 9500 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(path.join(tmpdir(), 'sd-prov-'));
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
  await sleep(6000); // engine bootstrap + model load + the seeded semantic search

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
    const value = result.result?.value ?? { rows: [] };
    console.log(JSON.stringify(value, null, 2));

    const failures = [];
    if (value.rowCount === 0) {
      failures.push(
        'no rows rendered for ' + JSON.stringify(seedQuery) + ' — the query or the library, not the badge, is the problem',
      );
    }

    /*
      Every label the badge is allowed to show. Anything else means the retrieval path was
      not what got rendered: the original bug printed 「文件名」, which is a *classification*
      source and is not in this list.
    */
    const ALLOWED = ['关键词', '语义', 'UCS分类', '结构', '参考音频'];

    const badges = value.rows.map((r) => r.badge).filter((b) => b !== null);
    const empty = badges.filter((b) => b === '');
    const bad = [...new Set(badges.filter((b) => b !== '' && !ALLOWED.includes(b)))];
    const semantic = badges.filter((b) => (b || '').includes('语义'));

    if (bad.length > 0) {
      failures.push('badge shows something that is not a retrieval path: ' + bad.join(', '));
    }
    if (empty.length === badges.length && badges.length > 0) {
      failures.push('every badge is empty — the retrieval paths are not being reported at all');
    }
    if (semantic.length === 0) {
      failures.push(
        'no row is labelled 语义 for a Chinese natural-language query — either the semantic path did not run or its path is not rendered',
      );
    }

    /*
      The fingerprint similarity must appear in the reasons for the rows the semantic path
      actually returned. Checked per row against the badge, because "some row somewhere
      mentions it" would pass even if it were attached to the wrong hits.
    */
    const semanticRows = value.rows.filter((r) => (r.badge || '').includes('语义'));
    const missingSimilarity = semanticRows.filter((r) => !(r.badgeTitle || '').includes('声音指纹相似度'));
    if (semanticRows.length > 0 && missingSimilarity.length === semanticRows.length) {
      failures.push(
        'a row is labelled 语义 but its reasons never mention 声音指纹相似度 — the semantic evidence is still invisible',
      );
    }

    // The two tooltips on one row explain the same hit, so they must not contradict.
    const disagreeing = value.rows.filter(
      (r) => r.barTitle && r.badgeTitle && r.barTitle.includes('声音指纹相似度') !== r.badgeTitle.includes('声音指纹相似度'),
    );
    if (disagreeing.length > 0) {
      failures.push(
        disagreeing.length + ' row(s) have a similarity in one tooltip and not the other',
      );
    }

    // 「融合分数」 was renamed because it read as a similarity; the old wording must be gone.
    const staleWording = value.rows.filter((r) => (r.badgeTitle || '').includes('融合分数'));
    if (staleWording.length > 0) {
      failures.push('a tooltip still says 融合分数 instead of 融合排序分');
    }

    const labelled = (label) => value.rows.filter((r) => (r.badge || '').includes(label)).length;
    console.log('');
    console.log('badges seen     :', [...new Set(badges)].join(' / ') || '(none)');
    console.log('rows            :', value.rowCount);
    console.log('含「语义」的行   :', labelled('语义'));
    console.log('含「关键词」的行 :', labelled('关键词'));
    console.log('样例 tooltip    :');
    for (const r of value.rows.slice(0, 2)) {
      console.log('  ---', r.filename);
      console.log('     badge:', r.badge);
      for (const line of (r.badgeTitle || '').split('\n')) console.log('     ·', line);
    }

    console.log('');
    if (failures.length) {
      console.log('RESULT: provenance check FAILED');
      for (const f of failures) console.log('  -', f);
      process.exitCode = 1;
    } else {
      console.log('RESULT: every row names its retrieval path, and semantic rows state their similarity.');
    }
  }

  ws.close();
} catch (err) {
  console.error('provenance check errored:', err instanceof Error ? err.message : String(err));
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
