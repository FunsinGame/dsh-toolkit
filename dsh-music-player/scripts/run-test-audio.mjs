import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'tmp', 'test-audio-bundle.mjs')
await mkdir(join(root, 'tmp'), { recursive: true })
await build({
  entryPoints: [join(root, 'scripts', 'test-audio-entry.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: out,
  logLevel: 'info',
  alias: {
    '@eshaz/web-worker': join(root, 'src', 'host', 'audio', 'web-worker-shim.ts'),
  },
})
process.argv = [process.argv[0], out, ...process.argv.slice(2)]
await import(pathToFileURL(out).href)
