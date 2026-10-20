/** Security regression tests: auth, CSRF, upload policy, traversal, exposure. */

import {
  assert,
  assertEqual,
  createAccount,
  createToken,
  freePort,
  login,
  makeTempDir,
  pngBuffer,
  request,
  runCli,
  startServer,
  uploadAttachment,
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

try {
  const dataDir = await makeTempDir('security')
  await createAccount(dataDir, 'alice')
  const token = await createToken(dataDir, 'alice', { name: 'security' })
  const readonlyToken = await createToken(dataDir, 'alice', { name: 'readonly', readOnly: true })
  const revokableToken = await createToken(dataDir, 'alice', { name: 'revokable' })
  server = await startServer({ dataDir })
  const base = server.base
  const session = await login(base, 'alice', 'correct-horse-battery-1')
  if (session.status !== 200) throw new Error(`initial login failed: ${session.status}`)

  await step('security headers are present', async () => {
    const response = await fetch(`${base}/`)
    assert(response.headers.get('content-security-policy')?.includes("default-src 'self'"), 'CSP')
    assertEqual(response.headers.get('x-content-type-options'), 'nosniff')
    assertEqual(response.headers.get('x-frame-options'), 'DENY')
    assertEqual(response.headers.get('referrer-policy'), 'no-referrer')
    assertEqual(response.headers.get('x-powered-by'), null)
  })

  await step('healthz is minimal and unauthenticated', async () => {
    const response = await fetch(`${base}/healthz`)
    assertEqual(response.status, 200)
    assertEqual(await response.text(), '{"ok":true}')
  })

  await step('session cookie is HttpOnly and SameSite=Strict', async () => {
    const cookie = session.response.headers.getSetCookie?.()[0] ?? ''
    assert(cookie.includes('HttpOnly'), 'HttpOnly')
    assert(cookie.includes('SameSite=Strict'), 'SameSite')
    assert(cookie.includes('Path=/'), 'Path')
  })

  await step('missing CSRF header is rejected', async () => {
    const response = await fetch(`${base}/api/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: session.cookie },
      body: JSON.stringify({ title: 'csrf' }),
    })
    assertEqual(response.status, 403)
  })

  await step('cross-origin write is rejected', async () => {
    const response = await fetch(`${base}/api/notes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-notes-request': '1',
        origin: 'https://evil.example',
        cookie: session.cookie,
      },
      body: JSON.stringify({ title: 'origin' }),
    })
    assertEqual(response.status, 403)
    assertEqual((await response.json()).error.code, 'ORIGIN_REJECTED')
  })

  await step('read-only token cannot write', async () => {
    const tree = await request(base, '/api/tree', { token: readonlyToken })
    assertEqual(tree.status, 200)
    const write = await request(base, '/api/notes', { method: 'POST', token: readonlyToken, body: { title: 'nope' } })
    assertEqual(write.status, 403)
    assertEqual(write.payload.error.code, 'READ_ONLY_TOKEN')
  })

  await step('revoked token is rejected', async () => {
    const before = await request(base, '/api/tree', { token: revokableToken })
    assertEqual(before.status, 200)
    await runCli(['token', 'revoke', revokableToken.split('_')[1], '--data-dir', dataDir])
    const after = await request(base, '/api/tree', { token: revokableToken })
    assertEqual(after.status, 401)
  })

  await step('unknown and malformed credentials are generic 401/400', async () => {
    const unknown = await login(base, 'nobody', 'wrong-password-123')
    assertEqual(unknown.status, 401)
    const wrong = await login(base, 'alice', 'wrong-password-123')
    assertEqual(wrong.status, 401)
    const malformed = await request(base, '/api/auth/login', {
      method: 'POST', body: { username: 'alice' },
    })
    assertEqual(malformed.status, 400)
  })

  await step('oversized JSON body is rejected', async () => {
    const big = 'x'.repeat(1.2 * 1024 * 1024)
    const response = await fetch(`${base}/api/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-notes-request': '1', cookie: session.cookie },
      body: JSON.stringify({ title: 'big', content: big }),
    })
    assertEqual(response.status, 413)
  })

  await step('invalid JSON and wrong methods are rejected', async () => {
    const invalid = await fetch(`${base}/api/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-notes-request': '1', cookie: session.cookie },
      body: '{',
    })
    assertEqual(invalid.status, 400)
    const method = await fetch(`${base}/api/notes`, { method: 'PUT', headers: { authorization: `Bearer ${token}` } })
    assertEqual(method.status, 405)
  })

  let noteId
  await step('create note for upload tests', async () => {
    const response = await request(base, '/api/notes', {
      method: 'POST', token, body: { title: 'upload target', content: '# target' },
    })
    noteId = response.payload.note.id
  })

  await step('SVG, HTML, executable and mismatched uploads are rejected', async () => {
    const svg = await uploadAttachment(base, token, noteId, 'evil.svg', 'image/svg+xml', Buffer.from('<svg><script>alert(1)</script></svg>'))
    assertEqual(svg.status, 415)
    const html = await uploadAttachment(base, token, noteId, 'evil.html', 'text/html', Buffer.from('<html>hi</html>'))
    assertEqual(html.status, 415)
    const js = await uploadAttachment(base, token, noteId, 'evil.js', 'application/javascript', Buffer.from('alert(1)'))
    assertEqual(js.status, 415)
    const fakePng = await uploadAttachment(base, token, noteId, 'fake.png', 'image/png', Buffer.from('<html>not png</html>'))
    assertEqual(fakePng.status, 415)
  })

  await step('upload filename is not used as a path', async () => {
    const payload = pngBuffer()
    const response = await uploadAttachment(base, token, noteId, '../../evil.png', 'image/png', payload)
    assertEqual(response.status, 201)
    assertEqual(response.payload.attachment.filename, 'evil.png')
    const listed = await request(base, `/api/notes/${noteId}/attachments`, { token })
    assert(listed.payload.attachments.some((item) => item.filename === 'evil.png'), 'sanitized filename')
  })

  await step('static traversal cannot read server files', async () => {
    for (const path of [
      '/../server/bin.js',
      '/%2e%2e/server/bin.js',
      '/assets/../package.json',
      '/package.json',
      '/server/bin.js',
      '/assets/%2e%2e/%2e%2e/server/bin.js',
    ]) {
      const response = await fetch(`${base}${path}`)
      assert(response.status === 404 || response.status === 400, `${path} -> ${response.status}`)
      const text = await response.text()
      assert(!text.includes('createAccount') && !text.includes('dsh-notes-server'), `leaked source via ${path}`)
    }
  })

  await step('attachment ids are validated and access is owner-scoped', async () => {
    const bad = await fetch(`${base}/api/attachments/not-an-id`, { headers: { authorization: `Bearer ${token}` } })
    assert(bad.status === 404 || bad.status === 400, `bad id ${bad.status}`)
    const response = await fetch(`${base}/api/attachments/00000000-0000-4000-8000-000000000000`, { headers: { authorization: `Bearer ${token}` } })
    assertEqual(response.status, 404)
  })

  await step('token and password never appear in server logs', async () => {
    const output = `${server.output().stdout}\n${server.output().stderr}`
    assert(!output.includes(token), 'token leaked to logs')
    assert(!output.includes('correct-horse-battery-1'), 'password leaked to logs')
  })

  await step('login attempts are rate limited', async () => {
    const loginDataDir = await makeTempDir('security-login')
    await createAccount(loginDataDir, 'ratelimit')
    const second = await startServer({ dataDir: loginDataDir })
    try {
      let saw429 = false
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const result = await login(second.base, 'ratelimit', `wrong-password-${attempt}`)
        if (result.status === 429) { saw429 = true; break }
      }
      assert(saw429, 'login rate limit')
      const locked = await login(second.base, 'ratelimit', 'correct-horse-battery-1')
      assertEqual(locked.status, 429)
    } finally {
      await second.stop()
    }
  })

  await step('oversized upload is rejected before storage', async () => {
    const smallDir = await makeTempDir('security-size')
    await createAccount(smallDir, 'small')
    const smallToken = await createToken(smallDir, 'small', { name: 'small' })
    const small = await startServer({ dataDir: smallDir, extraArgs: ['--max-upload-mb', '0.01'] })
    try {
      const created = await request(small.base, '/api/notes', { method: 'POST', token: smallToken, body: { title: 'x' } })
      const target = created.payload.note.id
      const large = Buffer.concat([pngBuffer(), Buffer.alloc(1_500_000)])
      const response = await uploadAttachment(small.base, smallToken, target, 'pixel.png', 'image/png', large)
      assertEqual(response.status, 413)
    } finally {
      await small.stop()
    }
  })

  await step('public plaintext listener is refused', async () => {
    const refusalDir = await makeTempDir('security-bind')
    await createAccount(refusalDir, 'bind')
    const port = await freePort()
    let failed = false
    let stderr = ''
    try {
      await runCli(['serve', '--data-dir', refusalDir, '--host', '0.0.0.0', '--port', String(port), '--log-level', 'off'])
    } catch (error) {
      failed = true
      stderr = error.message
    }
    assert(failed, 'server should refuse public plaintext bind')
    assert(stderr.includes('refusing to listen') || stderr.includes('TLS'), `refusal message: ${stderr.slice(0, 300)}`)
  })

  console.log(`\n${passed} security tests passed`)
} catch (error) {
  console.error(error.stack ?? error)
  process.exitCode = 1
} finally {
  if (server !== undefined) await server.stop().catch(() => undefined)
}
process.exit(process.exitCode ?? 0)
