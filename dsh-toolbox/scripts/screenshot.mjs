/**
 * Capture the README screenshots from a live DSH instance that has the plugin.
 *
 *   node scripts/screenshot.mjs "http://127.0.0.1:57999/?token=…"
 *
 * Writes docs/screenshot.png (toolbox + video tool) and
 * docs/screenshot-compare.png (图片对比, highlight view).
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const fixtures = join(root, 'fixtures')
const url = process.argv[2] ?? process.env.DTB_URL
if (url === undefined) throw new Error('usage: node scripts/screenshot.mjs <dsh-web-url-with-token>')

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

async function dismissWelcome() {
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
    await page.waitForTimeout(350)
  }
}

async function openToolbox() {
  const rail = page.locator('button[aria-label="工具箱"]')
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await page.locator('.dtb-root').count() > 0) return
    await dismissWelcome()
    await rail.click({ timeout: 4000 }).catch(() => undefined)
    await page.waitForTimeout(900)
  }
  await page.locator('.dtb-root').waitFor({ state: 'visible', timeout: 20_000 })
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('button[aria-label="工具箱"]').waitFor({ state: 'visible', timeout: 60_000 })
  await openToolbox()

  // Video tool with a real clip and a couple of steps.
  await page.locator('.dtb-tool[data-tool="video"]').click()
  await page.locator('.dtb-pane[data-tool="video"] input[type=file]').first()
    .setInputFiles(join(fixtures, 'demo.mp4'))
  await page.waitForFunction(() => {
    const video = document.querySelector('video.dvp-video')
    return video instanceof HTMLVideoElement && video.readyState >= 2 && video.videoWidth === 1280
  }, null, { timeout: 30_000 })
  await page.locator('.dvp-root').focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(900)
  await page.screenshot({ path: join(root, 'docs', 'screenshot.png') })

  // Image compare: fixtures, highlight view.
  await page.locator('.dtb-tool[data-tool="image"]').click()
  await page.locator('.dti-root input[data-slot="a"]').setInputFiles(join(fixtures, 'compare-a.png'))
  await page.locator('.dti-root input[data-slot="b"]').setInputFiles(join(fixtures, 'compare-b.png'))
  await page.locator('.dti-canvas').waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByRole('tab', { name: '高亮' }).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(root, 'docs', 'screenshot-compare.png') })

  console.log('wrote docs/screenshot.png and docs/screenshot-compare.png')
} finally {
  await browser.close()
}
