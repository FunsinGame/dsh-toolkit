/**
 * Capture the README screenshot from a live DSH web profile.
 *
 *   node scripts/screenshot.mjs "http://127.0.0.1:57999/?token=…"
 *
 * Opens the dual layout, loads two generated demo clips, gives the right one a
 * 1.6 s in-point through its own progress bar, and parks the shared timeline at
 * 2.4 s. The left pane is left selected so the still shows the accent state,
 * both per-pane bars and their start markers.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const url = process.argv[2] ?? process.env.DVP_URL
if (url === undefined) throw new Error('usage: node scripts/screenshot.mjs <dsh-web-url-with-token>')

const browser = await chromium.launch({
  executablePath: process.env.DVP_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

async function dismissWelcome() {
  const button = page.locator('[role="dialog"] button', { hasText: '继续' })
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    if (await button.count() > 0 && await button.first().isVisible()) {
      await button.first().click()
      await page.waitForTimeout(400)
      return
    }
    await page.waitForTimeout(150)
  }
}

async function waitForPane(side) {
  await page.waitForFunction((side) => {
    const video = document.querySelector(`[data-pane="${side}"] video`)
    return video instanceof HTMLVideoElement && video.readyState >= 2 && video.videoWidth === 1280
  }, side, { timeout: 30_000 })
}

async function setPaneTime(side, seconds) {
  await page.locator(`[data-pane="${side}"] .dvp-pane-range`).evaluate((element, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (setter === undefined) throw new Error('range value setter missing')
    setter.call(element, String(value))
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }, seconds)
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const rail = page.locator('button[aria-label="视频逐帧播放器"]')
  await rail.waitFor({ state: 'visible', timeout: 60_000 })
  await dismissWelcome()
  await rail.click()
  await page.locator('.dvp-root').waitFor({ state: 'visible', timeout: 15_000 })
  await dismissWelcome()

  await page.locator('.dvp-switch').click()
  await page.locator('[data-pane="left"]').waitFor({ timeout: 5000 })
  await page.locator('[data-pane="right"]').waitFor({ timeout: 5000 })

  await page.locator('[data-pane="left"] input[type=file]').setInputFiles(join(root, 'fixtures', 'demo.mp4'))
  await waitForPane('left')
  await page.locator('[data-pane="right"] input[type=file]').setInputFiles(join(root, 'fixtures', 'demo-b.mp4'))
  await waitForPane('right')
  await page.waitForTimeout(800)

  // Right clip starts 1.6 s in; the left starts at zero.
  await setPaneTime('right', 1.6)
  await page.waitForTimeout(500)
  await page.locator('[data-pane="right"] .dvp-pane-setstart').click()
  await page.waitForTimeout(1200)

  // Shared span is 6.4 s; 2.4 s is 37.5% across.
  const range = await page.locator('.dvp-range').boundingBox()
  if (range === null) throw new Error('progress range not found')
  await page.mouse.click(range.x + range.width * 0.375, range.y + range.height / 2)
  await page.waitForTimeout(1600)

  // Select the left pane so the still shows the accent border and 已选中 chip.
  await page.locator('[data-pane="left"] .dvp-pane-view').click()
  await page.waitForFunction(() => {
    return document.querySelector('[data-pane="left"]')?.classList.contains('selected') === true
  }, null, { timeout: 5000 })
  await page.waitForTimeout(400)

  await page.screenshot({ path: join(root, 'docs', 'screenshot.png') })
  console.log('wrote docs/screenshot.png')
} finally {
  await browser.close()
}
