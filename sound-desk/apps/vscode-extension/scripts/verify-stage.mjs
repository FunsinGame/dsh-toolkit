/**
 * Verify the staged VSIX payload is self-contained.
 *
 * Run with the staging directory as argv[2]; it defaults to the directory
 * `stage-vsix.mjs` writes, resolved from this script rather than from the current
 * working directory so the two scripts cannot disagree about where it is.
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const stage = path.resolve(process.argv[2] ?? path.join(here, '..', '.vsix-stage'));
/** Where the runtime dependencies live: next to the bundle, on purpose. See stage-vsix.mjs. */
const modules = path.join(stage, 'out', 'node_modules');
const requireFromStage = createRequire(path.join(stage, 'out', 'extension.js'));

let failures = 0;
const check = (label, fn) => {
  try {
    const detail = fn();
    console.log(`  ok    ${label}${detail ? ` (${detail})` : ''}`);
  } catch (err) {
    failures += 1;
    console.log(`  FAIL  ${label} (${err.code ?? err.message})`);
  }
};

console.log(`staged: ${stage}`);

console.log('\n=== payload ===');
check('out/extension.js', () => {
  const p = path.join(stage, 'out', 'extension.js');
  if (!existsSync(p)) throw new Error('missing');
  return `${(statSync(p).size / 1024 / 1024).toFixed(2)} MB`;
});
check('media/assets/index.js (web UI)', () => {
  const p = path.join(stage, 'media', 'assets', 'index.js');
  if (!existsSync(p)) throw new Error('missing');
  return `${(statSync(p).size / 1024).toFixed(0)} KB`;
});
check('data/categories.generated.json (UCS)', () => {
  const p = path.join(modules, '..', 'data', 'categories.generated.json');
  if (!existsSync(p)) throw new Error('missing');
  const parsed = JSON.parse(readFileSync(p, 'utf8'));
  if (parsed.categories?.length !== 753) throw new Error(`expected 753 entries, got ${parsed.categories?.length}`);
  return `${parsed.categories.length} entries, complete=${parsed.complete}`;
});

console.log('\n=== runtime packages, resolved from the stage only ===');
for (const spec of ['@huggingface/transformers', 'onnxruntime-common', 'onnxruntime-node']) {
  check(spec, () => {
    const resolved = requireFromStage.resolve(spec);
    if (!resolved.startsWith(stage)) throw new Error(`resolved outside the stage: ${resolved}`);
    return path.relative(stage, resolved);
  });
}
console.log('\n=== the native runtime actually loads ===');
check('new onnxruntime-node session API', () => {
  const ort = requireFromStage('onnxruntime-node');
  if (typeof ort.InferenceSession?.create !== 'function') throw new Error('InferenceSession.create is not a function');
  return `v${ort.env?.versions?.common ?? '?'}`;
});

console.log('\n=== the CLAP model is present, so no download is needed ===');
check('clap-htsat-unfused onnx files', () => {
  const dir = path.join(modules, '@huggingface', 'transformers', '.cache', 'Xenova', 'clap-htsat-unfused', 'onnx');
  if (!existsSync(dir)) throw new Error(`no model cache at ${path.relative(stage, dir)}`);
  const files = readdirSync(dir).filter((f) => f.endsWith('.onnx'));
  if (files.length === 0) throw new Error('no .onnx files');
  const mb = files.reduce((sum, f) => sum + statSync(path.join(dir, f)).size, 0) / 1024 / 1024;
  return `${files.length} files, ${mb.toFixed(0)} MB`;
});

console.log('');
if (failures > 0) {
  console.log(`RESULT: ${failures} check(s) failed -this VSIX would not work when installed.`);
  process.exit(1);
}
console.log('RESULT: staged payload is self-contained.');
