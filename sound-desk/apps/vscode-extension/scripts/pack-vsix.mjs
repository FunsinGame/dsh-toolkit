#!/usr/bin/env node
/**
 * scripts/pack-vsix.mjs - turn the staged payload into a `.vsix`.
 *
 * The actual zipping is `@vscode/vsce`, invoked with `--no-dependencies` because the
 * staged layout already contains exactly the runtime packages the extension needs;
 * letting vsce resolve dependencies would re-derive them from a manifest whose
 * `dependencies` are all bundled workspace packages.
 *
 * `--allow-missing-repository` is passed because this is a local, unpublished
 * extension: there is no marketplace entry to link back to.
 *
 * Usage: node scripts/pack-vsix.mjs [--out <file.vsix>]
 */

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = path.resolve(here, '..');
const STAGE = path.join(EXT_ROOT, '.vsix-stage');
const DEFAULT_OUT = path.join(EXT_ROOT, 'dist', 'sound-desk-vscode.vsix');

const argv = process.argv.slice(2);
const outIndex = argv.indexOf('--out');
const out = outIndex >= 0 ? path.resolve(argv[outIndex + 1]) : DEFAULT_OUT;

if (!existsSync(path.join(STAGE, 'package.json'))) {
  console.error(`[pack-vsix] no staged payload at ${STAGE}`);
  console.error('[pack-vsix] run `npm run stage:vsix` first.');
  process.exit(1);
}
if (!existsSync(path.join(STAGE, 'out', 'node_modules', 'onnxruntime-node'))) {
  // Cheap guard for the failure this whole script exists to prevent: a package that
  // installs cleanly and then dies on its first require.
  console.error('[pack-vsix] the staged payload has no onnxruntime-node; the VSIX would not start.');
  process.exit(1);
}

// `vsce` is not a dependency of this repo (it pulls a large tree for a task that runs
// a few times a year), so it is resolved on demand.
await mkdir(path.dirname(out), { recursive: true });
const args = [
  '--yes',
  '@vscode/vsce@latest',
  'package',
  '--no-dependencies',
  '--allow-missing-repository',
  '--out',
  out,
];

console.log(`[pack-vsix] packaging ${path.relative(EXT_ROOT, STAGE)} -> ${out}`);
const result = spawnSync('npx', args, { cwd: STAGE, stdio: 'inherit', shell: true });
if (result.error) {
  console.error(`[pack-vsix] could not run vsce: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`[pack-vsix] vsce exited with ${result.status}`);
  process.exit(result.status ?? 1);
}
if (!existsSync(out)) {
  console.error(`[pack-vsix] vsce reported success but ${out} does not exist`);
  process.exit(1);
}
console.log(`[pack-vsix] wrote ${out}`);
