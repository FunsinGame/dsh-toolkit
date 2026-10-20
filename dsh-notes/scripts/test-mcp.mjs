/** MCP endpoint tests using the official SDK client over Streamable HTTP. */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  assert,
  assertEqual,
  createAccount,
  createToken,
  makeTempDir,
  request,
  startServer,
} from './lib/harness.mjs'

let server
let passed = 0

async function step(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

async function connect(base, token) {
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  })
  const client = new Client({ name: 'dsh-notes-test', version: '1.0.0' })
  await client.connect(transport)
  return client
}

try {
  const dataDir = await makeTempDir('mcp')
  await createAccount(dataDir, 'alice')
  const token = await createToken(dataDir, 'alice', { name: 'mcp' })
  const readonly = await createToken(dataDir, 'alice', { name: 'mcp-readonly', readOnly: true })
  server = await startServer({ dataDir })
  const base = server.base

  const seed = await request(base, '/api/notes', {
    method: 'POST', token, body: { title: 'MCP seed', content: 'hello mcp world' },
  })
  const seedId = seed.payload.note.id

  let client
  await step('initialize and list tools', async () => {
    client = await connect(base, token)
    const tools = await client.listTools()
    const names = tools.tools.map((tool) => tool.name)
    for (const expected of ['notes_tree', 'notes_get', 'notes_search', 'notes_create', 'notes_update', 'notes_delete', 'attachments_list', 'notes_daily']) {
      assert(names.includes(expected), `missing tool ${expected}`)
    }
    assert(tools.tools.find((tool) => tool.name === 'notes_get').inputSchema.required.includes('id'), 'notes_get schema')
  })

  await step('search and read a note', async () => {
    const result = await client.callTool({ name: 'notes_search', arguments: { q: 'mcp world' } })
    const payload = JSON.parse(result.content[0].text)
    assert(payload.results.some((item) => item.note.id === seedId), 'search result')
    const note = await client.callTool({ name: 'notes_get', arguments: { id: seedId } })
    const notePayload = JSON.parse(note.content[0].text)
    assertEqual(notePayload.note.content, 'hello mcp world')
  })

  await step('create, append and update a note', async () => {
    const created = await client.callTool({ name: 'notes_create', arguments: { title: 'MCP created', content: '# MCP' } })
    const createdPayload = JSON.parse(created.content[0].text)
    const id = createdPayload.note.id
    const appended = await client.callTool({ name: 'notes_append', arguments: { id, content: 'appended' } })
    const appendedPayload = JSON.parse(appended.content[0].text)
    assert(appendedPayload.note.content.includes('appended'), 'append')
    const updated = await client.callTool({
      name: 'notes_update',
      arguments: { id, baseRevision: appendedPayload.note.revision, content: '# MCP updated' },
    })
    const updatedPayload = JSON.parse(updated.content[0].text)
    assertEqual(updatedPayload.note.content, '# MCP updated')
  })

  await step('list resources and read the tree resource', async () => {
    const resources = await client.listResources()
    assert(resources.resources.some((resource) => resource.uri === 'notes://tree'), 'tree resource')
    const read = await client.readResource({ uri: 'notes://tree' })
    assert(read.contents[0].text.includes('MCP seed'), 'tree content')
    const prompts = await client.listPrompts()
    assert(prompts.prompts.some((prompt) => prompt.name === 'notes.summarize'), 'summarize prompt')
  })

  await step('unauthenticated MCP request is rejected', async () => {
    const response = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    })
    assertEqual(response.status, 401)
    assert(response.headers.get('www-authenticate')?.includes('Bearer'), 'www-authenticate')
  })

  await step('read-only token rejects write tools', async () => {
    const readonlyClient = await connect(base, readonly)
    try {
      const result = await readonlyClient.callTool({ name: 'notes_create', arguments: { title: 'nope' } })
      assertEqual(result.isError, true)
      assert(result.content[0].text.includes('只读'), 'readonly error text')
    } finally {
      await readonlyClient.close()
    }
  })

  await step('MCP input validation rejects bad arguments', async () => {
    const result = await client.callTool({ name: 'notes_get', arguments: {} })
    assertEqual(result.isError, true)
  })

  await client.close()
  console.log(`\n${passed} MCP tests passed`)
} catch (error) {
  console.error(error.stack ?? error)
  process.exitCode = 1
} finally {
  if (server !== undefined) await server.stop().catch(() => undefined)
}
process.exit(process.exitCode ?? 0)
