/**
 * Build both halves of dsh-sound-desk with Rolldown.
 *
 * Rolldown is chosen over esbuild because it bundles in-process (no helper binary),
 * which keeps `npm run build` working in restricted environments, and it already
 * ships with this repository's SoundDesk checkout.
 *
 * Host: one ESM bundle. The SoundDesk engine and its pure-JS dependencies are
 * bundled from the reference checkout's built packages, so an installed plugin needs
 * no runtime dependency tree of its own. The two heavy optional engines stay runtime
 * lookups: the CLAP model is aliased to a shim that reads what the host preloaded,
 * and ffmpeg is discovered through `SOUNDDESK_FFMPEG`/PATH.
 *
 * Client: one CJS bundle wrapped in `window.__ModuleLoader__.load`. React and its
 * JSX runtime stay external because DSH seeds them as platform modules.
 */

import { cp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const lib = join(root, 'lib')
const soundDesk = join(root, '..', 'sound-desk')
const packages = join(soundDesk, 'packages')

const dist = (name) => join(packages, name, 'dist', 'index.js')

/** Locate Rolldown: the plugin's own install, else the SoundDesk checkout's copy. */
async function loadRolldown() {
  try {
    return await import('rolldown')
  } catch {
    /* fall through */
  }
  const pnpm = join(soundDesk, 'node_modules', '.pnpm')
  if (existsSync(pnpm)) {
    for (const entry of await readdir(pnpm)) {
      if (!entry.startsWith('rolldown@')) continue
      const candidate = join(pnpm, entry, 'node_modules', 'rolldown', 'dist', 'index.mjs')
      if (existsSync(candidate)) {
        console.log(`using rolldown from ${candidate}`)
        return import(pathToFileURL(candidate).href)
      }
    }
  }
  throw new Error(
    'rolldown not found: run `npm install` in dsh-sound-desk, or keep the SoundDesk checkout installed',
  )
}

const { rolldown } = await loadRolldown()

const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
const watch = process.argv.includes('--watch')

const alias = {
  '@sounddesk/core': dist('core'),
  '@sounddesk/ucs': dist('ucs'),
  '@sounddesk/audio-wav': dist('audio-wav'),
  '@sounddesk/audio-effects': dist('audio-effects'),
  '@sounddesk/engine': dist('engine'),
  '@huggingface/transformers': join(root, 'src', 'host', 'shims', 'transformers.ts'),
}

/**
 * `import './x.css'` yields the stylesheet as a string.
 *
 * The browser half injects it into its own shadow root, so it must not be emitted as
 * a side-effecting global stylesheet.
 */
const cssText = {
  name: 'dsh-sound-desk-css-text',
  load(id) {
    if (!id.endsWith('.css')) return null
    return { code: `export default ${JSON.stringify(readFileSync(id, 'utf8'))};`, moduleType: 'js' }
  },
}

/**
 * Resolve the SoundDesk packages to their built entry files.
 *
 * A plain `resolve.alias` is not enough here: the packages declare `types` first in
 * their `exports` map, and the resolver can pick the declaration file. A `resolveId`
 * hook returns the exact module, which is what a build against checked-out sibling
 * packages needs.
 */
const aliasPlugin = {
  name: 'dsh-sound-desk-alias',
  resolveId(source) {
    return alias[source] ?? null
  },
}

async function bundle(input, options) {
  const build = await rolldown({
    input,
    platform: options.platform,
    transform: {
      ...(options.define === undefined ? {} : { define: options.define }),
      ...(options.jsx === undefined ? {} : { jsx: options.jsx }),
    },
    external: options.external,
    plugins: [aliasPlugin, ...(options.plugins ?? [])],
    logLevel: 'warn',
    checks: { pluginTimings: false },
    onLog(level, log) {
      if (level === 'warn' || level === 'error') console.error(`[${level}] ${log.message}`)
    },
  })
  if (options.write !== false) {
    await build.write({ file: options.outfile, format: options.format, codeSplitting: false })
    await build.close?.()
    return null
  }
  const generated = await build.generate({ format: options.format, codeSplitting: false })
  await build.close?.()
  return generated.output[0].code
}

await mkdir(lib, { recursive: true })

console.log('building host…')
await bundle(join(root, 'src', 'host', 'index.ts'), {
  platform: 'node',
  format: 'esm',
  outfile: join(lib, 'index.js'),
  external: ['node:sqlite', 'bufferutil', 'utf-8-validate'],
  define: {
    __SOUND_DESK_VERSION__: JSON.stringify(version),
  },
})

console.log('building client…')
const code = await bundle(join(root, 'src', 'client', 'index.tsx'), {
  platform: 'browser',
  format: 'cjs',
  write: false,
  jsx: 'react-jsx',
  plugins: [cssText],
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
})

const wrapped = `/**
 * dsh-sound-desk browser half (generated by scripts/build.mjs).
 *
 * The DSH module loader materializes this bundle lazily. React stays external and
 * is resolved through the loader's platform-module table.
 */
window.__ModuleLoader__.load({
  id: "dsh-sound-desk",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    return module.exports;
  },
});
`
await writeFile(join(lib, 'client.js'), wrapped, 'utf8')

/**
 * The UCS dataset is read from disk at runtime (`packages/ucs` resolves `../data`
 * from its own module URL). Bundling moves the module, so the data moves with it.
 */
const ucsData = join(packages, 'ucs', 'data')
if (existsSync(ucsData)) {
  const target = join(root, 'data')
  await rm(target, { recursive: true, force: true })
  await cp(ucsData, target, { recursive: true })
  console.log(`copied UCS dataset → data/`)
}

const hostSize = (await readFile(join(lib, 'index.js'))).byteLength
const clientSize = (await readFile(join(lib, 'client.js'))).byteLength
console.log(`host:   ${(hostSize / 1024).toFixed(1)} KiB`)
console.log(`client: ${(clientSize / 1024).toFixed(1)} KiB`)
if (watch) console.log('watch mode is not implemented; re-run the build')
