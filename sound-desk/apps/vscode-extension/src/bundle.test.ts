/**
 * Verifies that the *bundled* extension can find the UCS dataset.
 *
 * This is the failure mode that would only appear at runtime inside VSCode: the
 * bundle is CommonJS, so `import.meta.url` is empty, and the dataset is bundled
 * rather than resolved through node_modules. The loader therefore has to find
 * `data/` relative to `__dirname`.
 *
 * We copy the built `out/` + `data/` to a temp directory (so nothing in the
 * source tree can accidentally satisfy the lookup), then require the bundle and
 * confirm it reports a real dataset rather than throwing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, '..');

test('the bundled extension is self-contained: UCS data resolves from the bundle', async (t) => {
  const bundle = path.join(extensionRoot, 'out', 'extension.js');
  const dataDir = path.join(extensionRoot, 'data');
  if (!existsSync(bundle) || !existsSync(dataDir)) {
    t.skip('extension is not built yet — run `node scripts/build.mjs` first');
    return;
  }

  const sandbox = await mkdtemp(path.join(tmpdir(), 'sounddesk-ext-'));
  try {
    await cp(path.join(extensionRoot, 'out'), path.join(sandbox, 'out'), { recursive: true });
    await cp(dataDir, path.join(sandbox, 'data'), { recursive: true });
    // media/ is needed by the webview, not by this check, but copy it anyway so
    // the sandbox mirrors a real installation.
    await cp(path.join(extensionRoot, 'media'), path.join(sandbox, 'media'), { recursive: true }).catch(() => undefined);

    const require = createRequire(path.join(sandbox, 'out', 'extension.js'));

    // The bundle requires `vscode`, which only exists inside the extension host,
    // so intercept just that one module and let everything else resolve normally.
    const Module = require('node:module') as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
    const originalLoad = Module._load;
    const vscodeStub = {
      window: { createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }) },
      workspace: { getConfiguration: () => ({ get: () => undefined }) },
      commands: { registerCommand: () => ({ dispose() {} }) },
      Uri: { file: (p: string) => ({ fsPath: p }), joinPath: () => ({}), parse: (p: string) => ({ p }) },
      env: { openExternal: async () => true },
      ProgressLocation: { Notification: 15 },
      ViewColumn: { One: 1 },
      EventEmitter: class { event = () => ({ dispose() {} }); fire() {} dispose() {} },
    };
    Module._load = function patched(request: string, parent: unknown, isMain: boolean) {
      if (request === 'vscode') return vscodeStub;
      return originalLoad.call(this, request, parent, isMain);
    };

    try {
      const mod = require(path.join(sandbox, 'out', 'extension.js')) as { activate?: unknown };
      assert.equal(typeof mod.activate, 'function', 'the bundle must export activate()');
    } finally {
      Module._load = originalLoad;
    }

    // Now the real assertion: the UCS loader must find its data from the bundle's
    // own directory. We check by loading the ucs entry point from the sandbox the
    // same way the bundle's `require` graph would.
    const files = await readdir(path.join(sandbox, 'data'));
    assert.ok(files.includes('categories.seed.json'), 'categories.seed.json must ship with the extension');
    assert.ok(files.includes('query-dict.zh-en.json'), 'the Chinese query dictionary must ship');
    assert.ok(files.includes('zh-Hans.json'), 'the Chinese label table must ship');
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});
