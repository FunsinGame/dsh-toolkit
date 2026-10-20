import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
await mkdir(join(root, 'lib'), { recursive: true })
await build({
  entryPoints: [join(root, 'src', 'host', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: join(root, 'lib', 'index.js'),
  minify: false,
  sourcemap: false,
  logLevel: 'info',
  banner: {
    js: "import { createRequire as __dmpCreateRequire } from 'node:module';\nconst require = __dmpCreateRequire(import.meta.url);",
  },
  alias: {
    '@eshaz/web-worker': join(root, 'src', 'host', 'audio', 'web-worker-shim.ts'),
  },
  define: { __MUSIC_PLAYER_VERSION__: '"0.1.0"' },
})
