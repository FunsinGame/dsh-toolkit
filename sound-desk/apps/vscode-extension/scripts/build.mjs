/**
 * Bundles the extension with esbuild.
 *
 * The extension host loads exactly one file (`main` in package.json), so the
 * ~30 source modules collapse into one bundle. `vscode` is external because the
 * host provides it. The workspace packages (`@sounddesk/*`) are bundled in,
 * which is why they must be built first — they resolve through their `dist`
 * entry points.
 */

import { build, context } from 'esbuild';
import { cp, mkdir, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repoRoot = path.resolve(root, '..', '..');
const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: [path.join(root, 'src', 'extension.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: path.join(root, 'out', 'extension.js'),
  // `vscode` is provided by the host. The native ML/imaging bindings must stay
  // external too: they locate their own prebuilt binaries relative to their
  // package directory, which only exists inside node_modules — bundling them
  // breaks that resolution at runtime.
  external: ['vscode', 'onnxruntime-node', 'sharp'],
  sourcemap: true,
  minify: false,
  logLevel: 'info',
};

/**
 * Copy the UCS dataset next to the bundle.
 *
 * `@sounddesk/ucs` is bundled (not an external dependency), so its loader cannot
 * find its data through `node_modules`; when bundled to CommonJS `import.meta.url`
 * is also unavailable. The loader walks up from `__dirname` looking for `data/`,
 * so `apps/vscode-extension/data` is exactly where it expects to find it.
 */
async function copyUcsData() {
  const source = path.join(repoRoot, 'packages', 'ucs', 'data');
  const target = path.join(root, 'data');
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
  const entries = await readdir(target);
  if (!entries.includes('categories.seed.json')) {
    throw new Error(`UCS data copy looks wrong: ${entries.join(', ')}`);
  }
}

async function copyWebBundle() {
  const webDist = path.join(repoRoot, 'packages', 'web', 'dist');
  const target = path.join(root, 'media');

  const indexHtml = await readFile(path.join(webDist, 'index.html'), 'utf8').catch(() => null);
  if (indexHtml === null) {
    throw new Error(`web bundle not found at ${webDist} — run: pnpm --filter @sounddesk/web build`);
  }

  await rm(target, { recursive: true, force: true });
  await mkdir(path.join(target, 'assets'), { recursive: true });

  // The webview HTML builder expects stable names, so flatten Vite's hashed
  // asset filenames.
  const assetsDir = path.join(webDist, 'assets');
  const assets = await readdir(assetsDir);
  const js = assets.find((f) => f.endsWith('.js') && !f.endsWith('.map'));
  const css = assets.find((f) => f.endsWith('.css'));
  if (!js) throw new Error(`no JS bundle in ${assetsDir}`);
  await cp(path.join(assetsDir, js), path.join(target, 'assets', 'index.js'));
  if (css) await cp(path.join(assetsDir, css), path.join(target, 'assets', 'index.css'));

  const iconsDir = path.join(repoRoot, 'packages', 'web', 'icons');
  await cp(iconsDir, target, { recursive: true }).catch(() => undefined);

  const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 12h2l2-6 3 12 3-9 2 3h6"/></svg>`;
  await writeFile(path.join(target, 'icon.svg'), iconSvg, 'utf8');
}

async function main() {
  await copyUcsData();
  await copyWebBundle();
  if (watch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log('watching…');
    return;
  }
  await build(buildOptions);
  console.log('extension bundled to out/extension.js');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
