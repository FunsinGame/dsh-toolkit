import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

assert.equal(packageJson.private, true)
assert.equal(packageJson.exports?.['./client']?.default, './lib/client.js')
assert.match(client, /window\.__ModuleLoader__\.load\(/)
assert.match(client, /@deepseek-ai\/dsh-turn-navigator/)
assert.match(client, /require\(["']react["']\)/)
assert.doesNotMatch(client, /require\(["']@deepseek-ai\//)
await import(new URL('../lib/index.js', import.meta.url))
await import(new URL('../lib/invariant.js', import.meta.url))

console.log('package smoke: @deepseek-ai/dsh-turn-navigator passed')
