/** Platform portability checks: no native modules, no hard-coded paths. */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const failures = []

function check(condition, message) {
  if (condition) console.log(`PASS ${message}`)
  else {
    failures.push(message)
    console.error(`FAIL ${message}`)
  }
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
check(packageJson.engines?.node === '>=24', 'requires Node 24')
check(packageJson.dependencies === undefined || Object.keys(packageJson.dependencies).length === 0, 'no installed runtime dependencies')

const server = readFileSync(join(root, 'server', 'lib', 'server.js'), 'utf8')
const host = readFileSync(join(root, 'lib', 'index.js'), 'utf8')
for (const [label, source] of [['server', server], ['host', host]]) {
  check(!/\.node['"]/u.test(source), `${label} bundle has no native addon require`)
  check(!source.includes('C:\\'), `${label} bundle has no Windows-only path`)
  check(!source.includes('/Users/'), `${label} bundle has no macOS-only path`)
}

const gitattributes = readFileSync(join(root, '.gitattributes'), 'utf8')
check(/\.sh\s+text\s+eol=lf/u.test(gitattributes), 'shell scripts are LF')
check(/\.cmd\s+text\s+eol=crlf/u.test(gitattributes), 'cmd scripts are CRLF')

for (const file of [
  'deploy/windows/start-server.cmd',
  'deploy/linux/start-server.sh',
  'deploy/systemd/dsh-notes.service',
  'deploy/caddy/Caddyfile',
  'deploy/nginx/dsh-notes.conf',
  'deploy/docker/Dockerfile',
  'deploy/docker/compose.yaml',
  'docs/deployment/windows.md',
  'docs/deployment/linux.md',
  'docs/deployment/debian.md',
  'docs/deployment/docker.md',
]) {
  check(existsSync(join(root, file)), `deployment asset exists: ${file}`)
}

const serverSources = readdirSync(join(root, 'src', 'server'))
check(serverSources.includes('platform.ts'), 'platform abstraction exists')
check(serverSources.includes('config.ts'), 'listener policy exists')

for (const file of ['deploy/linux/start-server.sh']) {
  const content = readFileSync(join(root, file), 'utf8')
  check(!content.includes('\r\n'), `${file} has LF endings`)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} platform check(s) failed`)
  process.exit(1)
}
console.log('\nplatform checks passed')
