/**
 * End-to-end test in a real Chromium against a throwaway DSH Web profile.
 *
 *   node scripts/test-e2e.mjs [http://127.0.0.1:PORT/?token=…]
 *
 * With no URL the script boots its own `dsh web` (isolated DSH_HOME + --patch),
 * so it never touches the installed desktop profile. It drives the toolbox rail
 * entry, opens the bundled video player, steps a real frame, switches to 图片对比,
 * loads the generated PNG pair and exercises all six views (including the
 * per-pixel canvas), the size-mismatch alignment path and the PNG export.
 */

import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const fixtures = join(root, 'fixtures')
const docs = join(root, 'docs')
await mkdir(docs, { recursive: true })

const DESKTOP = 'C:\\Users\\heyang\\AppData\\Local\\Programs\\DeepSeek Harness\\DeepSeek Harness.exe'
const DESKTOP_CLI = join(
  'C:\\Users\\heyang\\AppData\\Local\\Programs\\DeepSeek Harness',
  'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js',
)

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean)
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  throw new Error('Chrome not found; set CHROME_PATH')
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      server.close(() => resolvePort(port))
    })
  })
}

async function waitFor(check, { timeoutMs = 30_000, intervalMs = 200, label = 'condition' } = {}) {
  const started = Date.now()
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`)
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs))
  }
}

let passed = 0
async function step(name, fn) {
  await fn()
  passed += 1
  console.log(`PASS ${name}`)
}

/**
 * The preview notice appears a beat after boot, so wait for it instead of
 * glancing once: an open dialog steals the keyboard and blocks the rail.
 */
async function dismissWelcome(page) {
  const deadline = Date.now() + 15_000
  let quiet = 0
  while (Date.now() < deadline) {
    if (await page.locator('[role="dialog"]:visible').count() === 0) {
      quiet += 1
      if (quiet >= 3) return
      await page.waitForTimeout(350)
      continue
    }
    quiet = 0
    const more = page.locator('[role="dialog"] button', { hasText: '继续' }).first()
    if (await more.count() > 0 && await more.isVisible().catch(() => false)) {
      await more.click({ timeout: 3000 }).catch(() => undefined)
      await page.waitForTimeout(500)
      continue
    }
    const close = page.locator('[role="dialog"] button[aria-label="关闭"]').first()
    if (await close.count() > 0 && await close.isVisible().catch(() => false)) {
      await close.click({ timeout: 3000 }).catch(() => undefined)
      await page.waitForTimeout(500)
      continue
    }
    await page.waitForTimeout(350)
  }
}

const url = process.argv[2] ?? process.env.DTB_URL
let dsh = null
let dshHome = null
let browser = null
let page = null
let dshOut = ''
let dshErr = ''

try {
  if (url === undefined) {
    if (!existsSync(DESKTOP)) throw new Error(`DSH desktop not found at ${DESKTOP}`)
    dshHome = await mkdtemp(join(tmpdir(), 'dsh-toolbox-home-'))
    const patchFile = join(dshHome, 'toolbox.patch.yml')
    const libEntry = join(root, 'lib', 'index.js').replace(/\\/g, '/')
    await writeFile(patchFile, `- insert:\n    - id: dsh-toolbox\n      name: '${libEntry}'\n`, 'utf8')
    const port = await freePort()
    dsh = spawn(DESKTOP, [
      '--expose-internals', DESKTOP_CLI,
      'web', '--patch', patchFile, '--no-open', '--host', '127.0.0.1', '--port', String(port),
    ], {
      cwd: root,
      env: { ...process.env, DSH_HOME: dshHome, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    dsh.stdout.on('data', (chunk) => { dshOut += String(chunk) })
    dsh.stderr.on('data', (chunk) => { dshErr += String(chunk) })
  } else {
    dshOut = url
  }

  const target = url !== undefined
    ? url
    : await waitFor(() => {
        const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/u.exec(dshOut)
        return match?.[1] ?? false
      }, { timeoutMs: 60_000, label: 'DSH Web URL' })
  console.log(`target: ${target.slice(0, 48)}…`)

  browser = await chromium.launch({ executablePath: chromePath(), headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 400))
  })

  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const rail = page.locator('button[aria-label="工具箱"]')
  await rail.waitFor({ state: 'visible', timeout: 60_000 })
  await dismissWelcome(page)

  await step('activity rail opens the toolbox page', async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (await page.locator('.dtb-root').count() > 0) break
      await dismissWelcome(page)
      if (await page.locator('.dtb-root').count() > 0) break
      await rail.click({ timeout: 4000 }).catch(() => undefined)
      await page.waitForTimeout(900)
    }
    await page.locator('.dtb-root').waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('.dtb-tool[data-tool="video"]').waitFor({ timeout: 10_000 })
    await page.locator('.dtb-tool[data-tool="image"]').waitFor({ timeout: 10_000 })
    if (await page.locator('.dtb-tool').count() !== 2) throw new Error('expected two tool rows')
    await page.getByText('打开一个视频，开始逐帧检视').waitFor({ timeout: 10_000 })
  })

  await step('video tool: open a clip and step one frame', async () => {
    await page.locator('.dtb-pane[data-tool="video"] input[type=file]').first()
      .setInputFiles(join(fixtures, 'demo.mp4'))
    await page.waitForFunction(() => {
      const video = document.querySelector('video.dvp-video')
      return video instanceof HTMLVideoElement && video.readyState >= 2 && video.videoWidth === 1280
    }, null, { timeout: 30_000 })
    await page.locator('.dvp-frame-badge').waitFor({ timeout: 15_000 })
    const before = await page.locator('.dvp-frame-badge').innerText()
    await page.locator('.dvp-root').focus()
    await page.keyboard.press('ArrowRight')
    await waitFor(async () => (await page.locator('.dvp-frame-badge').innerText()) !== before, {
      timeoutMs: 8000,
      label: 'frame counter to change',
    })
    const after = await page.locator('.dvp-frame-badge').innerText()
    console.log(`frames: ${before.trim()} -> ${after.trim()}`)
  })

  await step('switching tools keeps the video state and releases the keyboard', async () => {
    const before = (await page.locator('.dvp-frame-badge').innerText()).trim()
    await page.locator('.dtb-tool[data-tool="image"]').click()
    await page.locator('.dtb-pane[data-tool="image"]').waitFor({ state: 'visible', timeout: 10_000 })
    if (await page.locator('.dtb-pane[data-tool="video"]').isVisible()) throw new Error('video pane is still visible')
    if (!(await page.locator('.dtb-pane[data-tool="image"]').isVisible())) throw new Error('image pane is not visible')

    // Hidden video: arrow keys must not step it.
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(400)

    await page.locator('.dtb-tool[data-tool="video"]').click()
    await page.locator('.dtb-pane[data-tool="video"]').waitFor({ state: 'visible', timeout: 10_000 })
    const after = (await page.locator('.dvp-frame-badge').innerText()).trim()
    if (after !== before) throw new Error(`hidden video moved from ${before} to ${after}`)
    const paused = await page.evaluate(() => {
      const video = document.querySelector('video.dvp-video')
      return video instanceof HTMLVideoElement ? video.paused : null
    })
    if (paused !== true) throw new Error('video kept playing while another tool was in front')
  })

  await step('image tool: load the fixture pair and compute the difference', async () => {
    await page.locator('.dtb-tool[data-tool="image"]').click()
    await page.locator('.dtb-pane[data-tool="image"]').waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('.dti-root input[data-slot="a"]').setInputFiles(join(fixtures, 'compare-a.png'))
    await page.locator('.dti-root input[data-slot="b"]').setInputFiles(join(fixtures, 'compare-b.png'))
    await page.locator('.dti-canvas').waitFor({ state: 'visible', timeout: 15_000 })
    await waitFor(async () => /差异\s*[\d,]+\s*px/u.test(await page.locator('.dti-stats').innerText()), {
      timeoutMs: 15_000,
      label: 'diff statistics',
    })
    const stats = await page.locator('.dti-stats').innerText()
    const changed = Number(/差异\s*([\d,]+)\s*px/u.exec(stats)?.[1]?.replace(/,/g, '') ?? '0')
    if (!(changed > 1000)) throw new Error(`expected a real difference, got ${changed} px`)
    console.log(`diff stats: ${stats.replace(/\s+/g, ' ').slice(0, 160)}`)
  })

  await step('split view renders both images side by side', async () => {
    await page.getByRole('tab', { name: '分割' }).click()
    await page.locator('.dti-split-pane').first().waitFor({ timeout: 5000 })
    if (await page.locator('.dti-split-pane').count() !== 2) throw new Error('split view needs two panes')
    const widths = await page.locator('.dti-split-pane img').evaluateAll(
      (images) => images.map((image) => image instanceof HTMLImageElement ? image.naturalWidth : 0),
    )
    if (widths.length !== 2) throw new Error('split view is missing an image')
  })

  await step('slider view reveals B from a draggable divider', async () => {
    await page.getByRole('tab', { name: '滑块' }).click()
    const handle = page.locator('.dti-divider-handle')
    await handle.waitFor({ timeout: 5000 })
    const before = Number(await handle.getAttribute('aria-valuenow'))
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press('ArrowLeft')
      await page.waitForTimeout(15)
    }
    const after = Number(await handle.getAttribute('aria-valuenow'))
    if (!(after < before - 4)) throw new Error(`divider did not move (${before} -> ${after})`)
    const clip = await page.locator('.dti-scene img').last().evaluate((element) => element.style.clipPath)
    if (!clip.includes('inset')) throw new Error(`B layer is not clipped: ${clip}`)
    console.log(`divider: ${before}% -> ${after}%`)
  })

  await step('fade view blends B over A', async () => {
    await page.getByRole('tab', { name: '淡化' }).click()
    const range = page.locator('input[aria-label="B 不透明度"]')
    await range.waitFor({ timeout: 5000 })
    await range.evaluate((element) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      if (setter === undefined) throw new Error('range setter missing')
      setter.call(element, '25')
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await waitFor(async () => {
      const opacities = await page.locator('.dti-scene img').evaluateAll((images) => images.map((image) => image.style.opacity))
      return opacities.includes('0.25')
    }, { timeoutMs: 5000, label: 'B opacity 25%' })
  })

  await step('blink view alternates A and B in place', async () => {
    await page.getByRole('tab', { name: '闪烁' }).click()
    await page.locator('.dti-tag').waitFor({ timeout: 5000 })
    const seen = new Set()
    const deadline = Date.now() + 4000
    while (Date.now() < deadline && seen.size < 2) {
      const text = await page.locator('.dti-tag').innerText()
      if (text.includes('A')) seen.add('a')
      if (text.includes('B')) seen.add('b')
      await page.waitForTimeout(80)
    }
    if (seen.size < 2) throw new Error(`blink did not alternate: ${[...seen].join(',')}`)
  })

  await step('difference view paints pixel deltas onto the canvas', async () => {
    await page.getByRole('tab', { name: '相减' }).click()
    await page.locator('.dti-scene canvas').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(300)
    const bright = await page.evaluate(() => {
      const canvas = document.querySelector('.dti-scene canvas')
      if (!(canvas instanceof HTMLCanvasElement)) return -1
      const context = canvas.getContext('2d')
      if (context === null) return -1
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      let count = 0
      for (let offset = 0; offset < data.length; offset += 4) {
        if (data[offset] > 8) count += 1
      }
      return count
    })
    if (!(bright > 1000)) throw new Error(`difference canvas is nearly empty (${bright} pixels)`)
    console.log(`difference pixels: ${bright}`)
  })

  await step('highlight view marks changed pixels in red and green', async () => {
    await page.getByRole('tab', { name: '高亮' }).click()
    await page.locator('.dti-scene canvas').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(300)
    const marks = await page.evaluate(() => {
      const canvas = document.querySelector('.dti-scene canvas')
      if (!(canvas instanceof HTMLCanvasElement)) return null
      const context = canvas.getContext('2d')
      if (context === null) return null
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      let red = 0
      let green = 0
      for (let offset = 0; offset < data.length; offset += 4) {
        if (data[offset + 3] === 0) continue
        const r = data[offset]
        const g = data[offset + 1]
        if (r > 180 && g < 130) red += 1
        else if (g > 150 && r < 90) green += 1
      }
      return { red, green }
    })
    if (marks === null) throw new Error('highlight canvas missing')
    if (!(marks.red > 100 && marks.green > 100)) {
      throw new Error(`highlight colours missing: ${JSON.stringify(marks)}`)
    }
    console.log(`highlight: ${marks.red} red / ${marks.green} green pixels`)
  })

  await step('the comparison survives leaving and reopening the toolbox page', async () => {
    await page.locator('button[aria-label="工作区"]').click()
    await page.locator('.dtb-root').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined)
    await page.locator('button[aria-label="工具箱"]').click()
    await page.locator('.dtb-root').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.dtb-pane[data-tool="image"]').waitFor({ state: 'visible', timeout: 10_000 })
    if (await page.getByRole('tab', { name: '高亮' }).getAttribute('aria-selected') !== 'true') {
      throw new Error('the selected mode was not remembered')
    }
    if (await page.locator('.dti-canvas').count() === 0) throw new Error('the image pair was not remembered')
    await waitFor(async () => /差异\s*[\d,]+\s*px/u.test(await page.locator('.dti-stats').innerText()), {
      timeoutMs: 10_000,
      label: 'restored diff statistics',
    })
  })
  await step('the video keeps its file and frame after reopening the toolbox', async () => {
    await page.locator('.dtb-tool[data-tool="video"]').click()
    await page.locator('.dtb-pane[data-tool="video"]').waitFor({ state: 'visible', timeout: 10_000 })
    await waitFor(async () => (await page.locator('.dvp-frame-badge').innerText()).includes('002'), {
      timeoutMs: 10_000,
      label: 'remembered video frame',
    })
    if (await page.locator('.dvp-video-host video').count() !== 1) {
      throw new Error('the video element was not re-attached')
    }
    const paused = await page.evaluate(() => {
      const video = document.querySelector('video.dvp-video')
      return video instanceof HTMLVideoElement ? video.paused : null
    })
    if (paused !== true) throw new Error('the video resumed playing while hidden')
    await page.locator('.dtb-tool[data-tool="image"]').click()
    await page.locator('.dtb-pane[data-tool="image"]').waitFor({ state: 'visible', timeout: 10_000 })
  })
  await step('toolbox screenshot', async () => {
    await page.locator('.dtb-tool[data-tool="video"]').click()
    await page.locator('.dtb-pane[data-tool="video"]').waitFor({ state: 'visible', timeout: 5000 })
    await page.waitForTimeout(600)
    await page.screenshot({ path: join(docs, 'screenshot.png') })
  })

  await step('image compare screenshot', async () => {
    await page.locator('.dtb-tool[data-tool="image"]').click()
    await page.getByRole('tab', { name: '高亮' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(docs, 'screenshot-compare.png') })
    await page.getByRole('tab', { name: '滑块' }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(root, 'tmp', 'compare-slider.png') })
  })
  await step('a differently sized B offers the alignment switch', async () => {
    await page.locator('.dti-root input[data-slot="b"]').setInputFiles(join(fixtures, 'compare-b-small.png'))
    await waitFor(async () => (await page.locator('.dti-stats').innerText()).includes('尺寸不同'), {
      timeoutMs: 10000,
      label: 'size mismatch warning',
    })
    const select = page.locator('select[aria-label="尺寸对齐方式"]')
    await select.waitFor({ timeout: 5000 })
    await select.selectOption('stretch')
    await page.waitForTimeout(400)
    await page.locator('.dti-root input[data-slot="b"]').setInputFiles(join(fixtures, 'compare-b.png'))
    await waitFor(async () => !(await page.locator('.dti-stats').innerText()).includes('尺寸不同'), {
      timeoutMs: 10000,
      label: 'mismatch warning to clear',
    })
  })

  await step('export produces a PNG download', async () => {
    await page.getByRole('tab', { name: '高亮' }).click()
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: '导出 PNG' }).click(),
    ])
    const filename = download.suggestedFilename()
    if (!filename.endsWith('.png')) throw new Error(`unexpected download: ${filename}`)
    const path = join(root, 'tmp', 'export.png')
    await mkdir(dirname(path), { recursive: true })
    await download.saveAs(path)
    console.log(`downloaded: ${filename}`)
  })


  const pluginErrors = pageErrors
    .concat(consoleErrors)
    .filter((text) => /dsh-toolbox|dtb-|dti-|dvp-|Uncaught|Cannot read/u.test(text))
  if (pluginErrors.length > 0) throw new Error(`plugin errors:\n${pluginErrors.join('\n')}`)

  console.log(`\n${passed} end-to-end checks passed`)
} catch (error) {
  console.error(error.stack ?? error)
  if (dshOut !== '') console.error(dshOut.slice(-3000))
  if (dshErr !== '') console.error(dshErr.slice(-3000))
  process.exitCode = 1
} finally {
  if (browser !== null) await browser.close().catch(() => undefined)
  if (dsh !== null) {
    const { spawnSync } = await import('node:child_process')
    try {
      spawnSync('taskkill', ['/pid', String(dsh.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } catch {
      // The child may already have exited.
    }
  }
  if (dshHome !== null) await rm(dshHome, { recursive: true, force: true }).catch(() => undefined)
}
process.exit(process.exitCode ?? 0)




