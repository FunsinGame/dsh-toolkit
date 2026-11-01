/**
 * End-to-end check against a live DSH profile, and the README screenshot.
 *
 *   node scripts/screenshot.mjs "http://127.0.0.1:57999/?token=…"
 *
 * Opens the activity page, imports the fixture, draws two regions plus one
 * global note, exports, and verifies both the copied prompt and the files on
 * disk. Any missing piece fails the run instead of producing a pretty picture.
 */

import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const url = process.argv[2] ?? process.env.DM_URL
if (url === undefined) throw new Error('usage: node scripts/screenshot.mjs <dsh-web-url-with-token>')

const browser = await chromium.launch({
  executablePath: process.env.DM_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
})
const page = await context.newPage()
page.on('dialog', (dialog) => void dialog.accept())
page.on('pageerror', (error) => console.log('PAGE EXCEPTION:', error.message))
page.on('console', (message) => {
  if (message.type() === 'error') console.log('PAGE ERROR:', message.text())
})

async function dismissWelcome() {
  const button = page.locator('[role="dialog"] button', { hasText: '继续' })
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    if ((await button.count()) > 0 && (await button.first().isVisible())) {
      await button.first().click()
      await page.waitForTimeout(400)
      return
    }
    await page.waitForTimeout(150)
  }
}

async function dragRegion(image, from, to) {
  const scale = image.width / 320
  const x1 = image.x + from[0] * scale
  const y1 = image.y + from[1] * scale
  const x2 = image.x + to[0] * scale
  const y2 = image.y + to[1] * scale
  await page.mouse.move(x1, y1)
  await page.mouse.down()
  await page.mouse.move(x2, y2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(250)
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const rail = page.locator('button[aria-label="设计批注"]')
  await rail.waitFor({ state: 'visible', timeout: 60_000 })
  await dismissWelcome()
  await rail.click()
  await page.locator('.dm-root').waitFor({ state: 'visible', timeout: 15_000 })
  await dismissWelcome()

  await page.locator('input[type=file]').setInputFiles(join(root, 'fixtures', 'demo.png'))
  await page.locator('.dm-image').waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForTimeout(500)

  const image = await page.locator('.dm-image').boundingBox()
  if (image === null) throw new Error('image box missing')

  const scale = image.width / 320

  // A: create, then resize with the south-east handle.
  await dragRegion(image, [92, 58], [220, 132])
  await page.locator('.dm-textarea').last().fill('这张卡片再大一些，标题和数值之间多留一点空隙')
  const handles = await page.locator('.dm-handle').count()
  if (handles !== 6) throw new Error(`expected 6 resize handles, got ${handles}`)

  await page.mouse.move(image.x + 220 * scale, image.y + 132 * scale)
  await page.mouse.down()
  await page.mouse.move(image.x + 250 * scale, image.y + 145 * scale, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(250)

  // Cut the frame and drag its content away; the source becomes a hole.
  const centerX = image.x + 171 * scale
  const centerY = image.y + 101 * scale
  await page.mouse.click(centerX, centerY, { button: 'right' })
  await page.locator('.dm-menu').waitFor({ state: 'visible', timeout: 5000 })
  await page.locator('.dm-menu button', { hasText: '裁剪移动' }).click()
  await page.waitForTimeout(200)

  await page.mouse.move(centerX, centerY)
  await page.mouse.down()
  await page.mouse.move(centerX + 120, centerY - 40, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  if ((await page.locator('.dm-hole').count()) !== 1) throw new Error('cut region did not leave a hole')
  if ((await page.locator('.dm-moved').count()) !== 1) throw new Error('cut content does not follow the frame')

  // B: a plain region below, plus one global note.
  await dragRegion(image, [238, 158], [300, 180])
  await page.locator('.dm-textarea').last().fill('主按钮改成强调色，文字改成「立刻体验」')

  await page.getByRole('button', { name: '整体意见' }).click()
  await page.locator('.dm-textarea').last().fill('整体留白再大一点，右侧面板和卡片对齐')

  await page.getByRole('button', { name: /导出设计批注/ }).click()
  await page.locator('.dm-export').waitFor({ state: 'visible', timeout: 15_000 })
  const exported = await page.locator('.dm-export-title').textContent()
  if (exported !== '已导出') throw new Error(`unexpected export state: ${exported}`)

  const dir = (await page.locator('.dm-export-path').textContent())?.trim() ?? ''
  if (dir === '') throw new Error('export path missing')

  await page.locator('.dm-export-actions button', { hasText: '复制提示词' }).click()
  await page.waitForTimeout(300)
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  if (!clipboard.includes(dir)) throw new Error('clipboard prompt does not name the export directory')
  if (!clipboard.includes('坐标约定')) throw new Error('clipboard prompt is missing the coordinate contract')
  if (!clipboard.includes('3 处修改')) throw new Error('clipboard prompt has the wrong count')
  if (!clipboard.includes('其中 1 处为整体意见')) throw new Error('clipboard prompt has the wrong global count')
  if (!clipboard.includes('带 `movement` 的对象')) throw new Error('clipboard prompt does not explain movement')

  const feedbackPath = join(dir, 'feedback.json')
  const feedback = JSON.parse(await readFile(feedbackPath, 'utf8'))
  if (feedback.schemaVersion !== 'design-mind-1') throw new Error('unexpected schema version')
  if (feedback.objects.length !== 3) throw new Error(`expected 3 objects, got ${feedback.objects.length}`)
  if (feedback.objects[2].kind !== 'global') throw new Error('the global note was not exported as global')

  const movedObject = feedback.objects[0]
  if (movedObject.movement === undefined) throw new Error('the cut region has no movement')
  if (movedObject.movement.dx <= 50) throw new Error('the recorded movement is too small')
  if (movedObject.movement.rect.x1 <= movedObject.source.x1) throw new Error('movement target is not to the right of the source')
  if (feedback.objects[1].movement !== undefined) throw new Error('a plain region must not record movement')

  const imageSize = await stat(join(dir, 'design.png'))
  if (imageSize.size !== (await stat(join(root, 'fixtures', 'demo.png'))).size) {
    throw new Error('the exported image is not byte-identical to the imported one')
  }
  console.log(`exported ${feedback.objects.length} objects to ${dir}`)

  // Park the selection on the moved frame so the still shows handles, the hole
  // and the floating content together.
  await page.mouse.click(image.x + 211 * scale, image.y + 88 * scale)
  await page.waitForTimeout(350)
  await page.screenshot({ path: join(root, 'docs', 'screenshot.png') })
  console.log('wrote docs/screenshot.png')

  // The clean button removes the export and resets the card; the confirm is
  // accepted by the dialog handler above.
  await page.getByRole('button', { name: '清理目录' }).click()
  await page.waitForTimeout(700)
  const stillThere = await stat(join(dir, 'feedback.json')).then(
    () => true,
    () => false,
  )
  if (stillThere) throw new Error('清理目录 did not remove the export')
  if ((await page.locator('.dm-export').count()) !== 0) throw new Error('the export card is still visible')
  console.log('cleaned the export directory')
} finally {
  await browser.close()
}
