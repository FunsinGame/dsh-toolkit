/**
 * Check a built .vsix the way the extension host will see it.
 *
 * The package is a zip, so this lists its entries and asserts the things that must
 * be true for the extension to start: the declared `main`, the web UI and UCS data
 * the engine reads from disk, and the runtime packages the bundle leaves external.
 * It then extracts to a temp dir and actually requires the bundle from there, which
 * is the only way to catch a dependency that only existed in the dev checkout.
 */
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const vsix = path.resolve(process.argv[2] ?? path.join(tmpdir(), 'sound-desk-vscode.vsix'));
if (!existsSync(vsix)) {
  console.error(`no VSIX at ${vsix}`);
  process.exit(1);
}
console.log(`vsix: ${vsix}`);

// Use tar, which reads zip on Windows 10+ and is present everywhere here.
const entries = execFileSync('tar', ['-tf', vsix], { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
console.log(`entries: ${entries.length}`);

const has = (needle) => entries.some((entry) => entry.replace(/\\/g, '/').includes(needle));
const required = [
  'extension/package.json',
  'extension/out/extension.js',
  'extension/media/assets/index.js',
  'extension/media/assets/index.css',
  // The dataset must sit next to the bundle: `@sounddesk/ucs` is bundled, so it
  // locates its data from `__dirname`, which is `out/`.
  'extension/out/data/categories.generated.json',
  'extension/out/data/curated-zh.json',
  // The loader probes for this exact filename while finding the data directory.
  'extension/out/data/categories.seed.json',
  'extension/out/node_modules/@huggingface/transformers/package.json',
  'extension/out/node_modules/onnxruntime-common/package.json',
  'extension/out/node_modules/onnxruntime-node/package.json',
  // Dynamically loaded by the engine, so it is external to the bundle and present
  // only because stage-vsix copies it. Without it the engine reports "未装 ffmpeg".
  'extension/out/node_modules/ffmpeg-static/package.json',
];
let failures = 0;
console.log('\n=== required entries ===');
for (const needle of required) {
  const ok = has(needle);
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${needle}`);
}

// The CLAP model must be inside the package, or a fresh install has to download
// 150 MB before semantic search works.
const onnx = entries.filter((entry) => entry.includes('clap-htsat-unfused') && entry.endsWith('.onnx'));
console.log(`\n=== bundled CLAP model ===\n  ${onnx.length} .onnx files${onnx.length === 0 ? ' (MISSING)' : ''}`);
if (onnx.length === 0) failures += 1;

// Extract and load the bundle from the extracted tree.
const dir = mkdtempSync(path.join(tmpdir(), 'sd-vsix-check-'));
console.log(`\n=== load test (extracted to ${dir}) ===`);
try {
  execFileSync('tar', ['-xf', vsix, '-C', dir], { stdio: 'inherit' });
  const extDir = path.join(dir, 'extension');
  const manifest = JSON.parse(readFileSync(path.join(extDir, 'package.json'), 'utf8'));
  console.log(`  main: ${manifest.main}`);
  if (!existsSync(path.join(extDir, manifest.main))) throw new Error(`main ${manifest.main} missing from the package`);

  const bundle = path.join(extDir, manifest.main);
  const original = createRequire(bundle);

  // Stub only what the host provides or what audio never uses.
  const Module = original('node:module');
  const disposable = () => ({ dispose() {} });
  const vscodeStub = {
    StatusBarAlignment: { Left: 1, Right: 2 },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ProgressLocation: { Notification: 15 },
    ViewColumn: { One: 1 },
    ThemeIcon: class { constructor(id) { this.id = id; } },
    TreeItem: class { constructor(l, s) { this.label = l; this.collapsibleState = s; } },
    EventEmitter: class { constructor() { this.event = () => disposable(); } fire() {} dispose() {} },
    MarkdownString: class { constructor(v) { this.value = v; } },
    Uri: { file: (p) => ({ fsPath: p, scheme: 'file' }), parse: (u) => ({ toString: () => u }), joinPath: () => ({}) },
    window: {
      createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
      createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
      registerTreeDataProvider: disposable,
      registerCustomEditorProvider: disposable,
      onDidChangeConfiguration: disposable,
      showInformationMessage: () => Promise.resolve(),
      showErrorMessage: () => Promise.resolve(),
      showWarningMessage: () => Promise.resolve(),
      showQuickPick: () => Promise.resolve(),
      showInputBox: () => Promise.resolve(),
      showOpenDialog: () => Promise.resolve(),
      setStatusBarMessage: disposable,
      activeTextEditor: undefined,
      tabGroups: { activeTabGroup: { activeTab: undefined } },
      withProgress: (_o, task) => task({ report() {} }, { onCancellationRequested: disposable }),
    },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }), onDidChangeConfiguration: disposable },
    commands: { registerCommand: disposable, executeCommand: () => Promise.resolve() },
    env: { openExternal: () => Promise.resolve(), clipboard: { writeText: () => Promise.resolve() } },
    TabInputText: class {},
    TabInputCustom: class {},
  };

  const origRequire = Module.prototype.require;
  Module.prototype.require = function (spec) {
    if (spec === 'vscode') return vscodeStub;
    if (spec === 'sharp') return { default: undefined };
    return origRequire.call(this, spec);
  };

  const mod = original(bundle);
  console.log('  BUNDLE LOADED from the extracted package');
  console.log('  exports:', Object.keys(mod).join(', ') || '(none)');

  // The native runtime must load from inside the package too.
  const ort = createRequire(bundle)('onnxruntime-node');
  console.log('  onnxruntime-node loads:', typeof ort.InferenceSession?.create === 'function' ? 'yes' : 'NO');

  // And the dynamically-imported ffmpeg must both resolve and point at a real file.
  const ffmpegMod = createRequire(bundle)('ffmpeg-static');
  const ffmpegBinary = ffmpegMod?.default ?? ffmpegMod;
  const ffmpegOk = typeof ffmpegBinary === 'string' && existsSync(ffmpegBinary);
  console.log('  ffmpeg-static binary:', ffmpegOk ? 'yes' : 'MISSING');
  if (!ffmpegOk) failures += 1;
} catch (err) {
  failures += 1;
  console.log(`  FAIL ${err.code ?? ''} ${String(err.message).split('\n')[0]}`);
} finally {
  // Best-effort: loading the native ORT runtime keeps its DLL mapped, so Windows can
  // refuse to delete the extracted tree. That is not a packaging defect, and leaving
  // a temp directory behind is better than failing a passing verification.
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    console.log(`  (left ${dir} behind: the native runtime still holds it open)`);
  }
}

console.log('');
if (failures > 0) {
  console.log(`RESULT: ${failures} problem(s) - this VSIX is not installable/usable as-is.`);
  process.exit(1);
}
console.log('RESULT: VSIX looks complete and its bundle loads.');
