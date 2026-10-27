/**
 * Shared test harness: isolated data dirs, a real notes server process and
 * small HTTP helpers. Everything here is platform-neutral (Windows/Linux).
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const serverEntry = join(root, 'server', 'bin.js')
export const libEntry = join(root, 'lib', 'index.js')
export const clientBundle = join(root, 'lib', 'client.js')
export const webBundle = join(root, 'web', 'assets', 'app.js')

export function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message ?? 'assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

export async function makeTempDir(name) {
  const dir = join(root, 'tmp', 'tests', `${name}-${randomBytes(4).toString('hex')}`)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  return dir
}

export function runCli(args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [serverEntry, ...args], {
      cwd: root,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { child.kill() } catch { /* ignore */ }
      rejectRun(new Error(`CLI ${args.join(' ')} timed out\n${stderr || stdout}`))
    }, options.timeoutMs ?? 15000)
    timer.unref?.()
    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectRun(error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        rejectRun(new Error(`CLI ${args.join(' ')} exited ${code}\n${stderr || stdout}`))
        return
      }
      resolveRun({ stdout, stderr })
    })
    if (options.input !== undefined) child.stdin.end(options.input)
    else child.stdin.end()
  })
}

export async function createAccount(dataDir, username, password = 'correct-horse-battery-1') {
  await runCli(['user', 'add', username, '--password-stdin', '--data-dir', dataDir], { input: password })
  return password
}

export async function createToken(dataDir, username, { name = 'test', readOnly = false } = {}) {
  const args = ['token', 'create', '--user', username, '--name', name, '--data-dir', dataDir]
  if (readOnly) args.push('--read-only')
  const { stdout } = await runCli(args)
  const match = /dshn_[A-Za-z0-9_-]+/u.exec(stdout)
  if (match === null) throw new Error(`could not parse token from CLI output:\n${stdout}`)
  return match[0]
}

export async function freePort() {
  const server = createServer()
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  await new Promise((resolveClose) => server.close(resolveClose))
  return port
}

export async function waitFor(check, { timeoutMs = 15000, intervalMs = 100, label = 'condition' } = {}) {
  const started = Date.now()
  let lastError
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await check()
      if (result !== false && result !== undefined && result !== null) return result
    } catch (error) {
      lastError = error
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs))
  }
  throw new Error(`timed out waiting for ${label}${lastError === undefined ? '' : `: ${lastError.message}`}`)
}

export async function startServer({ dataDir, port, extraArgs = [], env = {} } = {}) {
  const actualPort = port ?? await freePort()
  const child = spawn(process.execPath, [
    serverEntry, 'serve',
    '--data-dir', dataDir,
    '--host', '127.0.0.1',
    '--port', String(actualPort),
    '--log-level', 'warn',
    ...extraArgs,
  ], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let stderr = ''
  let stdout = ''
  child.stdout.on('data', (chunk) => { stdout += String(chunk) })
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })
  const base = `http://127.0.0.1:${actualPort}`
  await waitFor(async () => {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${stderr || stdout}`)
    const response = await fetch(`${base}/healthz`)
    return response.ok
  }, { label: 'notes server health' })
  return {
    child,
    base,
    port: actualPort,
    output: () => ({ stdout, stderr }),
    stop: async () => {
      if (child.exitCode !== null) return
      child.kill('SIGTERM')
      await new Promise((resolveStop) => {
        const timer = setTimeout(() => {
          try { child.kill() } catch { /* ignore */ }
          resolveStop()
        }, 5000)
        child.once('close', () => {
          clearTimeout(timer)
          resolveStop()
        })
      })
    },
  }
}

export async function request(base, path, { token, cookie, method = 'GET', body, headers = {} } = {}) {
  const init = { method, headers: { accept: 'application/json', ...headers } }
  if (token !== undefined) init.headers.authorization = `Bearer ${token}`
  if (cookie !== undefined) init.headers.cookie = cookie
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  if (method !== 'GET' && method !== 'HEAD') init.headers['x-notes-request'] = '1'
  const response = await fetch(`${base}${path}`, init)
  let payload = null
  try { payload = await response.json() } catch { payload = null }
  return { status: response.status, headers: response.headers, payload, text: payload === null ? '' : JSON.stringify(payload) }
}

export async function login(base, username, password) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-notes-request': '1' },
    body: JSON.stringify({ username, password }),
  })
  const setCookie = response.headers.getSetCookie?.()[0]
  const cookie = setCookie === undefined ? '' : setCookie.split(';')[0]
  const payload = await response.json().catch(() => null)
  return { response, status: response.status, payload, cookie }
}

/**
 * A valid RGBA PNG of the requested size (a small gradient by default).
 *
 * Tests assert `naturalWidth`, so the helper must be able to encode something
 * bigger than the 1×1 fixture a pure base64 constant allows.
 */
export function pngBuffer(width = 1, height = 1) {
  if (width === 1 && height === 1) {
    return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lY9GxAAAAABJRU5ErkJggg==', 'base64')
  }
  const crcTable = new Int32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    crcTable[index] = value
  }
  const crc32 = (buffer) => {
    let crc = -1
    for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    return (crc ^ -1) >>> 0
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length, 0)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body), 0)
    return Buffer.concat([length, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x += 1) {
      const at = row + 1 + x * 4
      raw[at] = Math.round((x / Math.max(1, width - 1)) * 255)
      raw[at + 1] = Math.round((y / Math.max(1, height - 1)) * 255)
      raw[at + 2] = 200
      raw[at + 3] = 255
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export function wavBuffer() {
  const data = 8000
  const buffer = Buffer.alloc(44 + data)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + data, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(8000, 24)
  buffer.writeUInt32LE(8000, 28)
  buffer.writeUInt16LE(1, 32)
  buffer.writeUInt16LE(8, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(data, 40)
  for (let index = 0; index < data; index += 1) buffer[44 + index] = 128 + Math.round(40 * Math.sin(index / 10))
  return buffer
}

export async function uploadAttachment(base, token, noteId, filename, mime, buffer) {
  const response = await fetch(`${base}/api/notes/${encodeURIComponent(noteId)}/attachments`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': mime,
      'x-file-name': encodeURIComponent(filename),
    },
    body: buffer,
  })
  const payload = await response.json().catch(() => null)
  return { status: response.status, payload }
}

export async function readBuilt(file) {
  const text = await readFile(file, 'utf8')
  if (text.trim() === '') throw new Error(`${file} is empty; run npm run build first`)
  return text
}

export async function writeTempFile(dir, name, content) {
  const file = join(dir, name)
  await writeFile(file, content)
  return file
}
