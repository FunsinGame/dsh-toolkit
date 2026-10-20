/** Build distributable server/plugin archives: .tgz (npm pack) + .zip. */

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { zipSync } from 'fflate'

const root = process.cwd()
const dist = join(root, 'dist')
rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

const INCLUDE = [
  'package.json',
  'README.md',
  'LICENSE',
  'cordis.patch.yml',
  'lib',
  'server',
  'web',
  'media',
  'deploy',
  'docs',
]
const SKIP = new Set(['dsh-integration-failure.png'])

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name)
    const info = statSync(file)
    if (info.isDirectory()) walk(file, base, out)
    else out.push(relative(base, file).replaceAll('\\', '/'))
  }
  return out
}

const entries = {}
for (const item of INCLUDE) {
  const absolute = join(root, item)
  const info = statSync(absolute)
  if (info.isDirectory()) {
    for (const file of walk(absolute)) {
      if (SKIP.has(file.split('/').pop())) continue
      entries[`${item}/${file}`] = new Uint8Array(readFileSync(join(absolute, file)))
    }
  } else {
    entries[item] = new Uint8Array(readFileSync(absolute))
  }
}
// Keep the module manifest at the archive root.
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = packageJson.version
const zipName = `dsh-notes-server-${version}.zip`
const zipData = zipSync(entries, { level: 6 })
writeFileSync(join(dist, zipName), Buffer.from(zipData))

// npm pack produces the canonical .tgz used by `dsh plugin add` / npm install.
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const pack = process.platform === 'win32'
  ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm pack --pack-destination dist'], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
    })
  : spawnSync(npm, ['pack', '--pack-destination', dist], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
    })
if (pack.status !== 0) throw new Error('npm pack failed')

const artifacts = readdirSync(dist).filter((file) => file.endsWith('.zip') || file.endsWith('.tgz')).sort()
const lines = []
for (const file of artifacts) {
  const data = readFileSync(join(dist, file))
  lines.push(`${createHash('sha256').update(data).digest('hex')}  ${file}`)
}
writeFileSync(join(dist, 'SHA256SUMS'), `${lines.join('\n')}\n`, 'utf8')
console.log('\nArtifacts:')
for (const line of lines) console.log(`  ${line}`)
console.log('\nServer deployment: extract the zip or run `npm install -g ./dist/dsh-notes-*.tgz`.')
