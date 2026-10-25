/**
 * End-to-end playback test in a real Chromium/Chrome.
 *
 * Run it against a DSH web server that has this plugin enabled:
 *
 *   node scripts/test-e2e.mjs "http://127.0.0.1:57999/?token=…"
 *
 * The fixtures encode each frame index in seven large binary blocks. The test
 * draws the displayed video frame into a canvas, decodes those blocks, and
 * asserts the exact frame after every operation — a seek that merely lands on a
 * keyframe or repeats a frame cannot pass.
 */

import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const fixture = join(root, 'fixtures', 'frames-25fps.mp4')
const url = process.argv[2] ?? process.env.DVP_URL
if (url === undefined) {
  throw new Error('usage: node scripts/test-e2e.mjs <dsh-web-url-with-token>')
}

const chrome = process.env.DVP_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--mute-audio',
  ],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const pageErrors = []
const consoleErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500))
})

/** Draw the displayed video frame and decode its seven-bit index. */
async function readFrame() {
  return page.evaluate(() => {
    const video = document.querySelector('video.dvp-video')
    if (!(video instanceof HTMLVideoElement) || video.readyState < 2) return null
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (context === null) return null
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const firstX = 39
    const block = 26
    const gap = 10
    const y = 90
    let frame = 0
    for (let bit = 0; bit < 7; bit += 1) {
      const x = firstX + bit * (block + gap) + Math.floor(block / 2)
      const pixel = context.getImageData(x, y, 1, 1).data
      const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3
      if (brightness > 140) frame |= 1 << bit
    }
    return {
      frame,
      currentTime: video.currentTime,
      paused: video.paused,
      muted: video.muted,
      volume: video.volume,
      duration: video.duration,
    }
  })
}

async function waitForFrame(expected, timeout = 5000) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < timeout) {
    last = await readFrame()
    if (last !== null && last.frame === expected) return last
    await page.waitForTimeout(60)
  }
  throw new Error(`expected frame ${expected}, last read ${JSON.stringify(last)}`)
}

async function waitForFrameInRange(minimum, maximum, timeout = 8000) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < timeout) {
    last = await readFrame()
    if (last !== null && last.frame >= minimum && last.frame <= maximum) return last
    await page.waitForTimeout(60)
  }
  throw new Error(`expected frame in ${minimum}..${maximum}, last read ${JSON.stringify(last)}`)
}

async function focusPlayer() {
  await page.locator('.dvp-root').focus()
}

/** The preview notice is server-driven and appears a beat after boot. */
async function dismissWelcome() {
  const button = page.locator('[role="dialog"] button', { hasText: '继续' })
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    if (await button.count() > 0) {
      const first = button.first()
      if (await first.isVisible()) {
        await first.click()
        await page.waitForTimeout(400)
        return true
      }
    }
    await page.waitForTimeout(150)
  }
  return false
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const rail = page.locator('button[aria-label="视频逐帧播放器"]')
  await rail.waitFor({ state: 'visible', timeout: 60_000 })
  await dismissWelcome()

  await rail.click()
  await page.locator('.dvp-root').waitFor({ state: 'visible', timeout: 15_000 })
  await dismissWelcome()
  await page.getByText('打开一个视频，开始逐帧检视').waitFor({ timeout: 10_000 })
  assert.equal(await rail.getAttribute('aria-current'), 'page', 'activity should be selected')
  console.log('activity entry and empty state: ok')

  await page.locator('.dvp-root input[type=file]').setInputFiles(fixture)
  await page.waitForFunction(() => {
    const video = document.querySelector('video.dvp-video')
    return video instanceof HTMLVideoElement && video.readyState >= 2 && video.videoWidth === 320
  }, { timeout: 30_000 })
  await page.getByText('帧 001').first().waitFor({ timeout: 15_000 })
  const meta = await page.locator('.dvp-header-meta').innerText()
  assert.match(meta, /H\.264/, `codec chip missing: ${meta}`)
  assert.match(meta, /25 fps/, `fps chip missing: ${meta}`)
  assert.match(meta, /320×180/, `size chip missing: ${meta}`)
  console.log('file open and frame table: ok')

  await focusPlayer()
  await waitForFrame(0, 10_000)
  await page.keyboard.press('ArrowRight')
  await waitForFrame(1)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await waitForFrame(4)
  await page.keyboard.press('ArrowLeft')
  await waitForFrame(3)
  console.log('single-frame stepping (forward and backward): ok')

  await page.keyboard.press('Home')
  await waitForFrame(0)
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(1400)
  await page.keyboard.up('ArrowRight')
  await page.waitForTimeout(250)
  const held = await readFrame()
  assert.ok(held !== null && held.frame >= 6, `hold-to-step did not repeat: ${JSON.stringify(held)}`)
  console.log(`hold-to-step: ok (frame ${held.frame} after 1.4s)`)

  await page.keyboard.press('Home')
  await waitForFrame(0)
  await page.keyboard.press('Shift+ArrowRight')
  await waitForFrame(10)
  console.log('shift+arrow 10-frame jump: ok')

  const range = await page.locator('.dvp-range').boundingBox()
  assert.ok(range !== null)
  await page.mouse.click(range.x + range.width * 0.5, range.y + range.height / 2)
  await waitForFrameInRange(58, 62)
  console.log('progress-bar click seek: ok')

  const muteButton = page.locator('.dvp-volume button').first()
  await muteButton.click()
  let state = await readFrame()
  assert.equal(state?.muted, true, 'mute button did not mute')
  await focusPlayer()
  await page.keyboard.press('KeyM')
  state = await readFrame()
  assert.equal(state?.muted, false, 'M did not unmute')
  console.log('mute button and M shortcut: ok')

  await page.keyboard.press('Home')
  await waitForFrame(0)
  await page.mouse.click(range.x + range.width * 0.5, range.y + range.height / 2)
  await waitForFrameInRange(58, 62)
  const beforeReverse = await readFrame()
  assert.ok(beforeReverse !== null)
  await page.getByRole('button', { name: '倒放', exact: true }).click()
  const reversed = await waitForFrameInRange(0, beforeReverse.frame - 3, 10_000)
  assert.equal(reversed.paused, true, 'reverse playback should keep the video element paused')
  await page.getByRole('button', { name: '停止倒放', exact: true }).click()
  await page.waitForTimeout(350)
  const stopped = await readFrame()
  await page.waitForTimeout(500)
  const stoppedAgain = await readFrame()
  assert.equal(stopped?.frame, stoppedAgain?.frame, 'reverse kept running after stop')
  assert.ok(stopped !== null && stopped.frame < beforeReverse.frame, 'reverse did not move backwards')
  console.log(`reverse playback: ok (${beforeReverse.frame} → ${stopped.frame})`)

  await page.keyboard.press('Home')
  await waitForFrame(0)
  await focusPlayer()
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await page.waitForTimeout(700)
  const playing = await readFrame()
  assert.equal(playing?.paused, false, 'forward playback did not start')
  assert.ok(playing !== null && playing.frame > 5, `forward playback did not advance: ${JSON.stringify(playing)}`)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  console.log('forward playback: ok')

  await mkdir(join(root, 'tmp'), { recursive: true })
  await page.screenshot({ path: join(root, 'tmp', 'e2e-player.png') })
  await page.locator('.dvp-root button', { hasText: '关闭' }).first().click()
  await page.getByText('打开一个视频，开始逐帧检视').waitFor({ timeout: 10_000 })
  console.log('close file: ok')

  // A fragmented MP4 has no usable sample table. It must still open, say that
  // the rate is estimated, and let the user correct 30 → 25 fps.
  await page.locator('.dvp-root input[type=file]').setInputFiles(
    join(root, 'fixtures', 'frames-25fps-fragmented.mp4'),
  )
  await page.getByText('帧率估算').waitFor({ timeout: 15_000 })
  await page.locator('.dvp-root select[aria-label="估算帧率"]').selectOption('25')
  await page.getByText('01 / 60').first().waitFor({ timeout: 10_000 })
  await focusPlayer()
  await waitForFrame(0, 10_000)
  await page.keyboard.press('ArrowRight')
  await waitForFrame(1)
  console.log('fragmented MP4 fallback and manual fps: ok')

  await page.locator('.dvp-root button', { hasText: '关闭' }).first().click()
  await page.getByText('打开一个视频，开始逐帧检视').waitFor({ timeout: 10_000 })

  const pluginErrors = pageErrors.concat(consoleErrors).filter((text) => /dsh-video-player|dvp/i.test(text))
  assert.deepEqual(pluginErrors, [], `plugin errors: ${pluginErrors.join('\n')}`)
  console.log('e2e tests passed')
} finally {
  await browser.close()
}
