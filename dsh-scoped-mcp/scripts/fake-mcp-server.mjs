#!/usr/bin/env node
/**
 * Minimal newline-delimited JSON-RPC MCP server used by the plugin's tests.
 *
 * It answers just enough of the protocol for the client bridge to connect,
 * discover one `echo` tool, and call it. `FAKE_MCP_TAG` is appended to every
 * echo response, so a test can prove which configured server answered.
 */
let buffer = ''

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function handle(message) {
  if (message.id === undefined) return
  try {
    switch (message.method) {
      case 'initialize':
        reply(message.id, {
          protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'fake-mcp', version: '1.0.0' },
        })
        return
      case 'ping':
        reply(message.id, {})
        return
      case 'tools/list':
        reply(message.id, {
          tools: [{
            name: 'echo',
            description: 'Echo the requested text back',
            inputSchema: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
            },
          }],
        })
        return
      case 'tools/call': {
        const text = message.params?.arguments?.text ?? ''
        reply(message.id, {
          content: [{ type: 'text', text: `echo:${text}:${process.env.FAKE_MCP_TAG ?? ''}` }],
        })
        return
      }
      default:
        send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } })
    }
  } catch (error) {
    send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: String(error) } })
  }
}

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let index = buffer.indexOf('\n')
  while (index >= 0) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    if (line !== '') {
      try {
        handle(JSON.parse(line))
      } catch {
        // Ignore malformed frames: the test server only needs the happy path.
      }
    }
    index = buffer.indexOf('\n')
  }
})
process.stdin.on('end', () => { process.exit(0) })
