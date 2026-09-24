#!/usr/bin/env node
/**
 * scripts/stage-vsix.mjs -assemble everything the extension needs at runtime into
 * a staging directory, so a packaged VSIX can actually start.
 *
 * WHY THIS EXISTS
 *
 * The extension is bundled with esbuild, but three classes of thing deliberately
 * stay OUTSIDE the bundle and are resolved at runtime:
 *
 *   - `vscode`               : provided by the extension host.
 *   - `@huggingface/transformers` + `onnxruntime-node`
 *                            : native/prebuilt ML runtime. Bundling it breaks its own
 *                              binary lookup, so esbuild marks it external.
 *   - native `.node` binaries: same reason.
 *
 * In the dev checkout those resolve through pnpm's hidden hoist and the engine's
 * own `node_modules`. A `.vsix` is a zip with no symlinks, so a package built
 * without them installs fine and then fails at the first `require`.
 *
 * WHAT IT DOES
 *
 * Copies the built extension, the web UI bundle and the UCS dataset, then resolves
 * the engine's *production dependency closure* and copies that in too -pruning
 * onnxruntime-node's binaries down to the current platform, which is the difference
 * between a ~300 MB and a ~150 MB package.
 *
 * Usage: node scripts/stage-vsix.mjs [--out <dir>] [--all-platforms]
 */

import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(EXT_ROOT, '..', '..');
const DEFAULT_OUT = path.join(EXT_ROOT, '.vsix-stage');

/**
 * Packages the bundle resolves at runtime.
 *
 * Kept as an explicit list rather than "copy node_modules" so that adding a runtime
 * dependency is a deliberate act, and so the package contents are reviewable.
 * Everything an `import` in src/ pulls in is already inside the esbuild bundle.
 *
 * `ffmpeg-static` is here because the engine loads it *dynamically*
 * (`decode.ts` builds the specifier at runtime so a bundler cannot resolve it
 * statically and fail the build for anyone who skipped the optional dependency).
 * That makes it external by construction, so a package without it reports
 * "未装 ffmpeg" and loses non-RIFF decoding, waveforms, fingerprints and playback —
 * which is exactly what shipped before this entry existed.
 */
const RUNTIME_PACKAGES = ['@huggingface/transformers', 'onnxruntime-common', 'onnxruntime-node', 'ffmpeg-static'];

/** Platform folder under onnxruntime-node/bin/napi-v6 that is worth shipping. */
function platformDir() {
  const platform = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return { platform, arch };
}

async function dirSize(dir) {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(full);
    else total += (await stat(full)).size;
  }
  return total;
}

/** Find a package inside the workspace's pnpm store. */
async function findInStore(name) {
  const store = path.join(REPO_ROOT, 'node_modules', '.pnpm');
  const entries = await readdir(store).catch(() => []);
  // pnpm directory names look like `sharp@0.35.4_@types+node@22.20.4`.
  const scoped = name.startsWith('@') ? name.replace('/', '+') : name;
  const candidates = entries.filter((entry) => entry === scoped || entry.startsWith(`${scoped}@`));
  for (const candidate of candidates.sort().reverse()) {
    const pkgDir = path.join(store, candidate, 'node_modules', name);
    if (existsSync(path.join(pkgDir, 'package.json'))) return pkgDir;
  }
  return null;
}

/**
 * Copy `from` to `to`, skipping onnxruntime-node binaries for other platforms.
 *
 * The package ships every platform's prebuilt runtime side by side (~287 MB total),
 * of which this machine can use one (~133 MB). A VSIX is not a redistributable
 * artifact here, so shipping the others would be pure waste.
 */
async function copyPackage(from, to, { pruneNative, keepPlatform }) {
  await cp(from, to, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      if (!pruneNative) return true;
      const rel = path.relative(from, src);
      const parts = rel.split(path.sep);
      const binAt = parts.indexOf('napi-v6');
      if (binAt === -1) return true;
      // .../bin/napi-v6/<platform>/<arch>/<files>
      const platformAt = binAt + 1;
      if (parts.length <= platformAt) return true;
      const platform = parts[platformAt];
      const arch = parts[platformAt + 1];
      if (platform !== keepPlatform.platform) return false;
      // Keep only the requested arch; the other is a different ABI entirely.
      if (arch && /^(x64|arm64|ia32)$/.test(arch)) return arch === keepPlatform.arch;
      return true;
    },
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const outIndex = argv.indexOf('--out');
  const out = outIndex >= 0 ? path.resolve(argv[outIndex + 1]) : DEFAULT_OUT;
  const allPlatforms = argv.includes('--all-platforms');
  const keepPlatform = platformDir();

  // A missing bundle is the single most likely reason a package would be broken, so
  // check it before doing any work.
  const bundle = path.join(EXT_ROOT, 'out', 'extension.js');
  if (!existsSync(bundle)) {
    throw new Error(`extension bundle missing at ${bundle} -run \`pnpm --filter sound-desk-vscode build\` first`);
  }
  const webBundle = path.join(REPO_ROOT, 'packages', 'web', 'dist');
  if (!existsSync(webBundle)) {
    throw new Error(`web bundle missing at ${webBundle} -run \`pnpm --filter @sounddesk/web build\` first`);
  }

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  // 1. extension payload
  await cp(path.join(EXT_ROOT, 'out'), path.join(out, 'out'), { recursive: true, dereference: true });
  await cp(path.join(EXT_ROOT, 'media'), path.join(out, 'media'), { recursive: true, dereference: true });
  // The UCS dataset goes inside `out/`, next to the bundle. `@sounddesk/ucs` is
  // bundled (not an external dependency), so when bundled to CommonJS its
  // `import.meta.url` is unavailable and it falls back to `__dirname` -looking for
  // a sibling `data/` directory. Copying it to the extension root instead would make
  // the loader throw "UCS dataset not found" at startup.
  await cp(path.join(EXT_ROOT, 'data'), path.join(out, 'out', 'data'), { recursive: true, dereference: true });
  await cp(path.join(EXT_ROOT, 'README.md'), path.join(out, 'README.md'));
  if (existsSync(path.join(EXT_ROOT, 'LICENSE'))) {
    await cp(path.join(EXT_ROOT, 'LICENSE'), path.join(out, 'LICENSE'));
  }

  /**
   * Rewrite the manifest for the packaged form.
   *
   * The source package.json says `"type": "module"` because the *sources* are ESM for
   * Node's type stripping. esbuild emits a CommonJS bundle, and `main` points at it,
   * so after packaging the declaration contradicts the artifact: anything that loads
   * `out/extension.js` by path (the extension host, or a plain `require`) is told to
   * parse CommonJS as ESM and dies with "module is not defined in ES module scope".
   *
   * Declaring `commonjs` makes the packaged manifest describe what it actually
   * ships. The source manifest keeps `module` for the build/test tooling.
   */
  const manifestPath = path.join(out, 'package.json');
  await cp(path.join(EXT_ROOT, 'package.json'), manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.type = 'commonjs';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  // 2. runtime dependency closure
  //
  // Placed under `out/` rather than at the top level. vsce removes any path
  // containing a `node_modules` segment from the package (its default ignore), and a
  // `.vscodeignore` negation does not override that. `out/` is not ignored, and it is
  // also where Node's resolution *wants* the modules: a `require('onnxruntime-node')`
  // from `out/extension.js` searches `out/node_modules` first. So this layout is both
  // packageable and exactly what the bundle looks for.
  const modules = path.join(out, 'out', 'node_modules');
  await mkdir(modules, { recursive: true });
  const copied = [];
  for (const name of RUNTIME_PACKAGES) {
    const from = await findInStore(name);
    if (!from) {
      copied.push({ name, ok: false, reason: 'not found in the pnpm store' });
      continue;
    }
    const pruneNative = name === 'onnxruntime-node' && !allPlatforms;
    await copyPackage(from, path.join(modules, ...name.split('/')), { pruneNative, keepPlatform });
    copied.push({ name, ok: true, from: path.relative(REPO_ROOT, from) });
  }

  const bytes = await dirSize(out);

  /**
   * Ignore rules for the *staged* layout.
   *
   * Deliberately not a copy of the extension's own .vscodeignore: that one excludes
   * `node_modules/**`, which is right for a `vsce package` that resolves
   * dependencies itself and wrong here, because the whole point of staging is that
   * the runtime dependencies are already in place. Written by this script so the two
   * cannot drift.
   */
  await writeFile(
    path.join(out, '.vscodeignore'),
    [
      '# Generated by scripts/stage-vsix.mjs - the staged layout is already complete.',
      '',
      '# The application code is all inside out/extension.js; out/node_modules carries',
      '# only the native/ML runtime that the bundle deliberately leaves external, plus',
      '# the CLAP model cache. It sits under out/ because vsce strips any top-level',
      '# node_modules regardless of .vscodeignore negations.',
      '',
      'out/**/*.map',
      'STAGE-REPORT.json',
      '',
      '# Dropped from the dataset copy: the runtime never reads these.',
      '#   official-catalog.json - a human-readable reference, generated from the CSV',
      '#   ucs_v8.2.1.csv        - the build input, ~250 KB',
      '#',
      '# NOT dropped even though it is only a fallback: `categories.seed.json` is the',
      '# file `@sounddesk/ucs` probes for while locating its data directory, so removing',
      '# it makes the loader throw "UCS dataset not found" at startup. `zh-Hans.json` is',
      '# the oldest Chinese fallback map and is likewise still read.',
      'out/data/ucs_v8.2.1.csv',
      'out/data/official-catalog.json',
      '',
    ].join('\n'),
    'utf8',
  );

  const report = {
    stagedAt: new Date().toISOString(),
    out,
    platform: keepPlatform,
    allPlatforms,
    sizeMb: Number((bytes / 1024 / 1024).toFixed(1)),
    runtimePackages: copied,
  };
  await writeFile(path.join(out, 'STAGE-REPORT.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`[stage-vsix] staged ${report.sizeMb} MB into ${out}`);
  console.log(`[stage-vsix] platform: ${keepPlatform.platform}/${keepPlatform.arch}${allPlatforms ? ' (all platforms kept)' : ''}`);
  for (const pkg of copied) {
    console.log(`[stage-vsix]   ${pkg.ok ? 'ok  ' : 'FAIL'} ${pkg.name}${pkg.ok ? '' : ` (${pkg.reason})`}`);
  }
  const failed = copied.filter((pkg) => !pkg.ok);
  if (failed.length > 0) {
    console.error(`[stage-vsix] ${failed.length} runtime package(s) missing; the VSIX would not start.`);
    return 1;
  }
  return 0;
}

try {
  process.exit(await main());
} catch (err) {
  console.error(`[stage-vsix] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
