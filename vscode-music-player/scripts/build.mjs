/**
 * 用 esbuild 把扩展打成单文件。
 *
 * 为什么需要打包：`mp4box` 与 `@wasm-audio-decoders/aac` 是运行时依赖，而
 * `vsce package --no-dependencies` + `.vscodeignore` 排除了 `node_modules`。
 * 打包后 `out/extension.js` 自带全部依赖，VSIX 里就不需要 node_modules。
 *
 * 注意 `@wasm-audio-decoders/aac` 的 wasm 是**内联成 base64** 的（包内没有
 * 独立 `.wasm` 文件），因此打包后不需要额外拷贝二进制资源。
 *
 * `vscode` 由宿主提供，必须 external；动态 `import()` 会被 esbuild 内联成
 * 普通模块引用，同时保留 ESM 语义。
 */

import { build, context } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: [path.join(root, 'src', 'extension.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: path.join(root, 'out', 'extension.js'),
  // 宿主提供的模块必须 external；它们不能被打进 bundle。
  external: ['vscode'],
  sourcemap: true,
  minify: false,
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log('watching…');
} else {
  await build(buildOptions);
  console.log('扩展已打包到 out/extension.js');
}
