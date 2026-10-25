/**
 * Build the MP4 fixtures used by the parser and browser tests.
 *
 * They are generated rather than committed because each one embeds its frame
 * index in seven large binary blocks: a browser test can read those blocks back
 * from a canvas and prove that a step landed on the exact expected frame.
 *
 * Requires ffmpeg (or `FFMPEG`) and Python with Pillow (or `PYTHON`).
 */

import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== '' && existsSync(candidate)) return candidate
  }
  return undefined
}

const python = firstExisting([
  process.env.PYTHON,
  'C:/Users/heyang/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe',
  'C:/Python312/python.exe',
]) ?? 'python'

const ffmpeg = firstExisting([
  process.env.FFMPEG,
  'C:/g-workspace/deepseek-harness/dsh-toolkit/sound-desk/node_modules/.pnpm/ffmpeg-static@5.3.0/node_modules/ffmpeg-static/ffmpeg.exe',
]) ?? 'ffmpeg'

console.log(`python: ${python}`)
console.log(`ffmpeg: ${ffmpeg}`)

const result = spawnSync(python, [join(here, 'make_fixtures.py')], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, FFMPEG: ffmpeg },
})

if (result.error !== undefined) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
