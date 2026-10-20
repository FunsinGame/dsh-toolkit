/** Artifact, packaging and dangerous-API checks (no test servers). */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const failures = []
const warnings = []

function check(condition, message) {
  if (condition) console.log(`PASS ${message}`)
  else {
    failures.push(message)
    console.error(`FAIL ${message}`)
  }
}

function syntax(file) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' })
  check(result.status === 0, `syntax: ${file}`)
}

function text(file) {
  return readFileSync(join(root, file), 'utf8')
}

for (const file of [
  'server/bin.js',
  'server/lib/server.js',
  'lib/index.js',
  'lib/client.js',
  'web/assets/app.js',
  'web/index.html',
]) {
  check(existsSync(join(root, file)), `artifact exists: ${file}`)
}

syntax('server/bin.js')
syntax('server/lib/server.js')
syntax('lib/index.js')
syntax('lib/client.js')
syntax('web/assets/app.js')

const packageJson = JSON.parse(text('package.json'))
check(packageJson.name === 'dsh-notes', 'package name')
check(packageJson.type === 'module', 'package type module')
check(packageJson.dsh?.bundle?.patch === './cordis.patch.yml', 'dsh bundle patch')
check(packageJson.dsh?.client?.platform === 'web', 'dsh client platform')
check(packageJson.engines?.node === '>=24', 'node engine')
check(typeof packageJson.engines?.dsh === 'string' && packageJson.engines.dsh.includes('0.2.1-rc.2'), 'dsh engine')
check(packageJson.bin?.['dsh-notes-server'] === 'server/bin.js', 'server bin')
check(packageJson.dependencies === undefined || Object.keys(packageJson.dependencies).length === 0, 'no runtime dependencies')
check(Array.isArray(packageJson.files) && packageJson.files.includes('server') && packageJson.files.includes('web'), 'published files')

const client = text('lib/client.js')
check(client.includes('__ModuleLoader__'), 'client module loader wrapper')
check(client.includes('id: "dsh-notes"'), 'client module id')
check(client.includes('require("react")'), 'client react external')
check(!client.includes('react-dom'), 'client does not require react-dom')

const server = text('server/lib/server.js')
const host = text('lib/index.js')
for (const [label, source] of [['server', server], ['host', host]]) {
  check(!source.includes('child_process'), `${label} bundle has no child_process`)
  check(!source.includes('execSync'), `${label} bundle has no execSync`)
  check(!source.includes('spawnSync'), `${label} bundle has no spawnSync`)
  check(!source.includes('node:vm'), `${label} bundle has no node:vm`)
  check(!source.includes('eval('), `${label} bundle has no direct eval`)
}
const dynamicFunctionCount = (server.match(/new Function/g) ?? []).length
if (dynamicFunctionCount > 0) {
  warnings.push(`server bundle contains ${dynamicFunctionCount} "new Function" from the MCP SDK/Ajv static schema compiler; it never compiles client-supplied schemas`)
}

const index = text('web/index.html')
check(index.includes('__BASE_HREF__'), 'web index base placeholder')
check(index.includes('assets/app.js'), 'web index script')
check(!index.includes('http://127.0.0.1'), 'web index has no hard-coded local origin')

check(text('server/bin.js').startsWith('#!/usr/bin/env node'), 'server bin shebang')
check(!text('server/bin.js').startsWith('\uFEFF'), 'server bin has no BOM')
check(!text('lib/client.js').startsWith('\uFEFF'), 'client bundle has no BOM')
check(existsSync(join(root, 'cordis.patch.yml')), 'cordis patch exists')
check(existsSync(join(root, 'docs', 'screenshot.png')), 'desktop screenshot exists')
check(existsSync(join(root, 'docs', 'screenshot-mobile.png')), 'mobile screenshot exists')
check(existsSync(join(root, '.gitattributes')), 'gitattributes exists')
check(existsSync(join(root, 'deploy', 'docker', 'Dockerfile')), 'dockerfile exists')
check(existsSync(join(root, 'deploy', 'systemd', 'dsh-notes.service')), 'systemd unit exists')

const size = statSync(join(root, 'server', 'lib', 'server.js')).size
check(size > 100_000 && size < 5_000_000, `server bundle size (${(size / 1024).toFixed(0)} KiB)`)

for (const warning of warnings) console.warn(`WARN ${warning}`)
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
