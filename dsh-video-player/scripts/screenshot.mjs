/**
 * Capture the README screenshot from a live DSH web profile.
 *
 *   node scripts/screenshot.mjs "http://127.0.0.1:57999/?token=…"
 *
 * Uses the generated `fixtures/demo.mp4` so the still shows a real video rather
 * than the seven-bit test pattern.
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

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const rail = page.locator('button[aria-label="视频逐帧播放器"]')
  await rail.waitFor({ state: 'visible', timeout: 60_000 })
  await dismissWelcome()
  await rail.click()
  await page.locator('.dvp-root').waitFor({ state: 'visible', timeout: 15_000 })
  await dismissWelcome()

  await page.locator('.dvp-root input[type=file]').setInputFiles(join(root, 'fixtures', 'demo.mp4'))
  await page.waitForFunction(() => {
    const video = document.querySelector('video.dvp-video')
    return video instanceof HTMLVideoElement && video.readyState >= 2 && video.videoWidth === 1280
  }, { timeout: 30_000 })
  await page.waitForTimeout(1200)

  const range = await page.locator('.dvp-range').boundingBox()
  if (range === null) throw new Error('progress range not found')
  await page.mouse.click(range.x + range.width * 0.5, range.y + range.height / 2)
  await page.waitForTimeout(1500)
  await page.locator('.dvp-root').focus()
  await page.waitForTimeout(500)

  await page.screenshot({ path: join(root, 'docs', 'screenshot.png') })
  console.log('wrote docs/screenshot.png')
} finally {
  await browser.close()
}
