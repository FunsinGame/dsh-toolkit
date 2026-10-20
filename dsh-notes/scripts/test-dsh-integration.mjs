/**
 * Isolated DSH Web integration test.
 *
 * Boots a throwaway DSH home with the plugin loaded through a --patch overlay,
 * then drives the real activity bar and notes page in Chrome. This verifies the
 * client bundle, host routes and DSH slot registration together, without
 * touching the user's installed profile.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { chromium } from 'playwright-core'
import {
  assert,
  assertEqual,
  createAccount,
  createToken,
  freePort,
  libEntry,
  makeTempDir,
  pngBuffer,
  request,
  startServer,
  waitFor,
} from './lib/harness.mjs'

const root = process.cwd()
const docs = join(root, 'docs')
await mkdir(docs, { recursive: true })

function dshCli() {
  const candidates = [
    process.env.DSH_CLI,
    'C:\\Users\\heyang\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\runtime\\cli\\bin\\dsh.cmd',
    'dsh',
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (candidate === 'dsh' || existsSync(candidate)) return candidate
  }
  throw new Error('DSH CLI not found; set DSH_CLI to the 0.2.1-rc.2 dsh executable')
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  throw new Error('Chrome not found; set CHROME_PATH')
}

let remote
let dsh
let browser
let passed = 0
let dshOut = ''
let dshErr = ''

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
  const serverDir = await makeTempDir('dsh-server')
  await createAccount(serverDir, 'dsh-user')
  const token = await createToken(serverDir, 'dsh-user', { name: 'dsh-integration' })
  remote = await startServer({ dataDir: serverDir })
  const seedTitle = 'DSH Notes 使用指南'
  const seed = await request(remote.base, '/api/notes', {
    method: 'POST', token, body: {
      title: seedTitle,
      tags: ['DSH', '指南'],
      pinned: true,
      content: `# ${seedTitle}\n\n一个支持 Markdown、附件、离线缓存与 AI 工具的个人笔记系统。\n\n## 亮点\n\n- 左侧目录树，右侧编辑 / 预览\n- 账号密码登录；账号只能在服务器上配置\n- DSH 插件定时 / 手动同步\n- MCP + 原生 notes_* 工具\n`,
    },
  })
  const seedId = seed.payload.note.id

  const dshHome = await makeTempDir('dsh-home')
  await mkdir(join(dshHome, 'notes'), { recursive: true })
  await writeFile(join(dshHome, 'notes', 'settings.json'), JSON.stringify({
    serverUrl: remote.base,
    token,
    autoSyncSeconds: 3600,
    quickSync: true,
  }), 'utf8')
  const patchFile = join(dshHome, 'notes-plugin.patch.yml')
  await writeFile(patchFile, `- insert:\n    - id: dsh-notes\n      name: '${libEntry.replace(/\\/g, '/')}'\n`, 'utf8')

  const port = await freePort()
  const cli = dshCli()
  const args = ['web', '--patch', patchFile, '--no-open', '--host', '127.0.0.1', '--port', String(port)]
  if (process.platform === 'win32' && cli.endsWith('.cmd')) {
    const cliDir = dirname(cli)
    const appRoot = resolve(cliDir, '..', '..', '..', '..')
    const exe = join(appRoot, 'DeepSeek Harness.exe')
    const desktopCli = join(appRoot, 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js')
    if (!existsSync(exe)) throw new Error(`cannot locate DSH desktop executable next to ${cli}`)
    dsh = spawn(exe, ['--expose-internals', desktopCli, ...args], {
      cwd: root,
      env: { ...process.env, DSH_HOME: dshHome, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
  } else {
    dsh = spawn(cli, args, {
      cwd: root,
      env: { ...process.env, DSH_HOME: dshHome },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
  }
  dsh.stdout.on('data', (chunk) => { dshOut += String(chunk) })
  dsh.stderr.on('data', (chunk) => { dshErr += String(chunk) })
  const url = await waitFor(() => {
    const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/u.exec(dshOut)
    return match?.[1] ?? false
  }, { timeoutMs: 30000, label: 'DSH Web URL' })

  browser = await chromium.launch({ executablePath: chromePath(), headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (error) => console.log('pageerror', error.message))
  page.on('console', (message) => { if (message.type() === 'error') console.log('console error', message.text()) })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)

  for (let attempt = 0; attempt < 5; attempt += 1) {
    let dismissed = false
    for (const selector of ['button[aria-label="关闭"]']) {
      const button = page.locator(selector).first()
      if (await button.count() > 0 && await button.isVisible().catch(() => false)) {
        await button.click().catch(() => undefined)
        dismissed = true
      }
    }
    const continueButton = page.getByText('继续', { exact: true }).first()
    if (await continueButton.count() > 0 && await continueButton.isVisible().catch(() => false)) {
      await continueButton.click().catch(() => undefined)
      dismissed = true
    }
    if (!dismissed) break
    await page.waitForTimeout(400)
  }

  await step('activity rail shows the notes entry', async () => {
    await page.locator('[aria-label="笔记"]').first().waitFor({ state: 'visible', timeout: 15000 })
  })

  await step('opening the activity shows the notes page', async () => {
    await page.locator('[aria-label="笔记"]').first().click({ force: true })
    await page.waitForTimeout(2500)
    if (await page.locator('.dsh-notes-tree').count() === 0) {
      await page.screenshot({ path: join(docs, 'dsh-integration-failure.png'), fullPage: true })
    }
    await page.waitForSelector('.dsh-notes-tree', { timeout: 15000 })
    await waitFor(async () => (await page.locator('.dsh-notes-tree').innerText()).includes(seedTitle), { label: 'seed note in tree' })
    assert(await page.locator('.dsh-notes-title-input').count() > 0, 'editor title')
    assert(await page.locator('.dsh-notes-sync-pill').count() > 0, 'sync pill')
  })

  await step('settings dialog is scoped to the notes page and keeps typed input', async () => {
    await page.locator('button[title="设置"]').click()
    await page.waitForSelector('.dsh-notes-overlay', { timeout: 5000 })
    const metrics = await page.evaluate(() => {
      const overlay = document.querySelector('.dsh-notes-overlay')
      const root = overlay?.closest('.dsh-notes-root')
      if (overlay === null || root === null) return null
      const overlayBox = overlay.getBoundingClientRect()
      const rootBox = root.getBoundingClientRect()
      return {
        position: getComputedStyle(overlay).position,
        overlay: { top: overlayBox.top, bottom: overlayBox.bottom, left: overlayBox.left, right: overlayBox.right },
        root: { top: rootBox.top, bottom: rootBox.bottom, left: rootBox.left, right: rootBox.right },
      }
    })
    assert(metrics !== null, 'settings overlay metrics')
    assertEqual(metrics.position, 'absolute', 'settings overlay must not be viewport-fixed')
    assert(metrics.overlay.top >= metrics.root.top - 2, 'overlay top inside notes page')
    assert(metrics.overlay.bottom <= metrics.root.bottom + 2, 'overlay bottom inside notes page')
    assert(metrics.overlay.left >= metrics.root.left - 2, 'overlay left inside notes page')
    assert(metrics.overlay.right <= metrics.root.right + 2, 'overlay right inside notes page')

    const input = page.locator('.dsh-notes-overlay input.dsh-notes-input').first()
    await input.fill('http://example.test:8787')
    await page.waitForTimeout(4200)
    assertEqual(await input.inputValue(), 'http://example.test:8787', 'typed server URL must survive polling')
    await page.locator('.dsh-notes-overlay button[title="关闭"]').click()
    await page.locator('.dsh-notes-overlay').waitFor({ state: 'detached', timeout: 5000 })
  })

  await step('page screenshot', async () => {
    await page.screenshot({ path: join(docs, 'screenshot-dsh.png'), fullPage: true })
  })

  const updatedTitle = `${seedTitle} edited`
  await step('editing in DSH synchronizes to the server', async () => {
    const row = page.locator('.dsh-notes-tree-row', { hasText: seedTitle }).first()
    await row.click()
    await page.waitForTimeout(500)
    await page.locator('.dsh-notes-title-input').fill(updatedTitle)
    await page.locator('textarea.dsh-notes-textarea').fill(`# ${updatedTitle}\n\nedited inside DSH`)
    await waitFor(async () => {
      const note = await request(remote.base, `/api/notes/${seedId}`, { token })
      return note.payload.note.title === updatedTitle && note.payload.note.content.includes('edited inside DSH')
    }, { timeoutMs: 20000, intervalMs: 500, label: 'DSH edit synced to server' })
    assertEqual((await request(remote.base, `/api/notes/${seedId}`, { token })).status, 200)
  })

  await step('attachment upload proxies through the host', async () => {
    const imagePath = join(dshHome, 'pixel.png')
    await writeFile(imagePath, pngBuffer())
    await page.locator('input[type=file]').setInputFiles(imagePath)
    await waitFor(async () => (await page.locator('.dsh-notes-attachments').innerText()).includes('pixel.png'), { timeoutMs: 15000, label: 'DSH attachment row' })
    await waitFor(async () => {
      const note = await request(remote.base, `/api/notes/${seedId}`, { token })
      return note.payload.note.attachments.some((item) => item.filename === 'pixel.png')
    }, { timeoutMs: 15000, intervalMs: 500, label: 'attachment on server' })
  })

  console.log(`\n${passed} DSH integration tests passed`)
} catch (error) {
  console.error(error.stack ?? error)
  if (dshOut !== '') console.error(dshOut.slice(-2000))
  if (dshErr !== '') console.error(dshErr.slice(-2000))
  process.exitCode = 1
} finally {
  if (browser !== undefined) await browser.close().catch(() => undefined)
  if (dsh !== undefined) {
    if (process.platform === 'win32') {
      try {
        const { spawnSync } = await import('node:child_process')
        spawnSync('taskkill', ['/pid', String(dsh.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      } catch { /* ignore */ }
    } else {
      try { dsh.kill() } catch { /* ignore */ }
      await new Promise((resolveWait) => setTimeout(resolveWait, 500))
      try { dsh.kill('SIGKILL') } catch { /* ignore */ }
    }
  }
  if (remote !== undefined) await remote.stop().catch(() => undefined)
}
process.exit(process.exitCode ?? 0)
