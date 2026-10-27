/**
 * Browser end-to-end test for the standalone web app.
 *
 * Covers account/password login, note creation and autosave, persistence after
 * reload, image/audio attachments, preview, folder move, SSE cross-tab refresh,
 * search and the mobile layout. Writes the documentation screenshots.
 */

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import {
  assert,
  assertEqual,
  createAccount,
  makeTempDir,
  pngBuffer,
  startServer,
  waitFor,
  wavBuffer,
} from './lib/harness.mjs'

const root = process.cwd()
const docs = join(root, 'docs')
await mkdir(docs, { recursive: true })

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  throw new Error('Chrome not found; set CHROME_PATH to run the browser end-to-end test')
}

let server
let browser
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

async function login(page, base, username, password) {
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.fill('#notes-username', username)
  await page.fill('#notes-password', password)
  await page.click('button[type=submit]')
  await page.waitForSelector('.dsh-notes-tree', { timeout: 15000 })
}

try {
  const dataDir = await makeTempDir('e2e')
  await createAccount(dataDir, 'e2e-user', 'correct-horse-battery-1')
  server = await startServer({ dataDir })
  browser = await chromium.launch({ executablePath: chromePath(), headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('401')) errors.push(message.text()) })

  await step('login page has no registration link', async () => {
    await page.goto(server.base, { waitUntil: 'networkidle' })
    const text = await page.locator('body').innerText()
    assert(text.includes('登录'), 'login form')
    assertEqual(await page.getByRole('button', { name: '注册', exact: true }).count(), 0, 'no registration button')
    assertEqual(await page.getByText('注册', { exact: true }).count(), 0, 'no registration text')
    await page.screenshot({ path: join(docs, 'screenshot-login.png'), fullPage: true })
  })

  await step('account/password login opens the notes app', async () => {
    await login(page, server.base, 'e2e-user', 'correct-horse-battery-1')
    assert(await page.locator('.dsh-notes-sidebar').count() > 0, 'sidebar')
    assert(await page.locator('.dsh-notes-sidebar-actions button').count() > 0, 'sidebar actions')
  })

  const title = `E2E Note ${Date.now()}`
  const content = `# ${title}\n\n- first item\n- second item\n\n\`\`\`js\nconsole.log("hello")\n\`\`\`\n`
  await step('create note, edit and autosave', async () => {
    await page.locator('.dsh-notes-sidebar-actions button').first().click()
    await page.waitForTimeout(300)
    await page.locator('.dsh-notes-title-input').fill(title)
    await page.locator('textarea.dsh-notes-textarea').fill(content)
    await waitFor(async () => (await page.locator('.dsh-notes-statusbar').innerText()).includes('已保存'), { label: 'autosave' })
    const saved = await page.locator('.dsh-notes-statusbar').innerText()
    assert(saved.includes('已保存'), saved)
  })

  await step('reload keeps the note', async () => {
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('.dsh-notes-tree', { timeout: 15000 })
    await page.waitForTimeout(800)
    const body = await page.locator('body').innerText()
    assert(body.includes(title), 'title after reload')
    assert(body.includes('first item'), 'content after reload')
  })

  await step('upload image and audio attachments', async () => {
    const fileInput = page.locator('input[type=file]')
    const imagePath = join(dataDir, 'pixel.png')
    const audioPath = join(dataDir, 'tone.wav')
    const { writeFile } = await import('node:fs/promises')
    await writeFile(imagePath, pngBuffer(320, 200))
    await writeFile(audioPath, wavBuffer())
    await fileInput.setInputFiles(imagePath)
    await waitFor(async () => (await page.locator('.dsh-notes-attachments').innerText()).includes('pixel.png'), { label: 'image upload' })
    await fileInput.setInputFiles(audioPath)
    await waitFor(async () => (await page.locator('.dsh-notes-attachments').innerText()).includes('tone.wav'), { label: 'audio upload' })
    assert(await page.locator('.dsh-notes-attachments audio').count() > 0, 'audio player')
  })

  await step('pasting a screenshot uploads it once and inserts markdown at the caret', async () => {
    const payload = pngBuffer(320, 200).toString('base64')
    const textarea = page.locator('textarea.dsh-notes-textarea')
    await textarea.click()
    await textarea.press('End')
    const before = await page.locator('.dsh-notes-attachments .dsh-notes-attachment').count()
    await page.evaluate(({ base64 }) => {
      const binary = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
      const file = new File([binary], 'image.png', { type: 'image/png' })
      const data = new DataTransfer()
      data.items.add(file)
      // Windows Chromium reports the same clipboard image as two independent File
      // objects (item vs files entry, lastModified one millisecond apart).
      const twin = new File([binary], 'image.png', { type: 'image/png', lastModified: file.lastModified + 1 })
      Object.defineProperty(data, 'files', { value: [twin], configurable: true })
      const area = document.querySelector('textarea.dsh-notes-textarea')
      if (area === null) throw new Error('textarea missing')
      area.focus()
      area.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    }, { base64: payload })
    await waitFor(async () => (await page.locator('.dsh-notes-attachments').innerText()).includes('粘贴图片-'), { label: 'pasted image attachment row' })
    assertEqual(await page.locator('.dsh-notes-attachments .dsh-notes-attachment').count(), before + 1, 'pasted attachment row added once')
    const content = await textarea.inputValue()
    assert(/!\[粘贴图片-[^\]]*\]\(api\/attachments\/[A-Za-z0-9-]+\)/u.test(content), content.slice(-160))
    assertEqual((content.match(/!\[粘贴图片-/gu) ?? []).length, 1, 'one pasted image inserted')
    await page.screenshot({ path: join(root, 'tmp', 'e2e-paste.png') })
    await waitFor(async () => (await page.locator('.dsh-notes-statusbar').innerText()).includes('已保存'), { label: 'pasted image saved' })
  })

  await step('preview renders markdown, code, image and link', async () => {
    await page.locator('button[title="预览"]').click()
    await page.waitForTimeout(600)
    assert(await page.locator('.dsh-notes-markdown h1').count() > 0, 'heading')
    assert(await page.locator('.dsh-notes-markdown pre code.hljs').count() > 0, 'highlighted code')
    assert(await page.locator('.dsh-notes-markdown img').count() > 0, 'image')
    assert(await page.locator('.dsh-notes-markdown a.dsh-notes-attachment-link').count() > 0, 'attachment link')
    await page.screenshot({ path: join(root, 'tmp', 'e2e-desktop.png'), fullPage: true })
  })

  await step('preview image decodes from the authenticated attachment read', async () => {
    const image = page.locator('.dsh-notes-markdown img').first()
    await waitFor(async () => (await image.evaluate((element) => element.naturalWidth)) > 0, { label: 'preview image decoded' })
    assertEqual(await image.evaluate((element) => element.naturalWidth), 320, 'preview image width')
    const src = await image.getAttribute('src')
    assert(src !== null && src.startsWith('blob:'), `preview image renders an object URL (${src})`)
  })

  await step('clicking an attachment thumbnail opens the image lightbox', async () => {
    await page.locator('.dsh-notes-attachment-thumb-btn').first().click()
    await page.waitForSelector('.dsh-notes-lightbox', { timeout: 5000 })
    const stageImage = page.locator('.dsh-notes-lightbox-stage img')
    await waitFor(async () => (await stageImage.evaluate((element) => element.naturalWidth)) > 0, { label: 'lightbox image decoded' })
    assertEqual(await stageImage.evaluate((element) => element.naturalWidth), 320, 'lightbox image width')
    assert((await page.locator('.dsh-notes-lightbox-title').innerText()).includes('pixel.png'), 'lightbox title')
    await page.screenshot({ path: join(root, 'tmp', 'e2e-lightbox.png') })
    await page.keyboard.press('Escape')
    await page.locator('.dsh-notes-lightbox').waitFor({ state: 'detached', timeout: 5000 })
  })

  await step('double-clicking a preview image opens the lightbox at actual size', async () => {
    await page.locator('.dsh-notes-markdown img').first().dblclick()
    await page.waitForSelector('.dsh-notes-lightbox', { timeout: 5000 })
    await page.locator('.dsh-notes-lightbox-stage img').click()
    assert((await page.locator('.dsh-notes-lightbox-stage').getAttribute('class')).includes('is-actual'), 'actual-size toggle')
    await page.locator('.dsh-notes-lightbox-btn[title="关闭 (Esc)"]').click()
    await page.locator('.dsh-notes-lightbox').waitFor({ state: 'detached', timeout: 5000 })
  })

  await step('an image attachment link opens the viewer instead of navigating', async () => {
    const attachmentId = await page.locator('.dsh-notes-markdown img').first().getAttribute('data-attachment-id')
    assert(attachmentId !== null, 'attachment id on the preview image')
    await page.locator('button[title="编辑"]').click()
    const textarea = page.locator('textarea.dsh-notes-textarea')
    await textarea.fill(`${await textarea.inputValue()}\n\n[查看图片](api/attachments/${attachmentId})\n`)
    await page.locator('button[title="预览"]').click()
    await page.locator('.dsh-notes-markdown a.dsh-notes-attachment-link').last().click()
    await page.waitForSelector('.dsh-notes-lightbox', { timeout: 5000 })
    assert((await page.locator('.dsh-notes-lightbox-title').innerText()).includes('pixel.png'), 'linked image title')
    await page.keyboard.press('Escape')
    await page.locator('.dsh-notes-lightbox').waitFor({ state: 'detached', timeout: 5000 })
  })

  await step('create folder and move the note', async () => {
    await page.locator('.dsh-notes-sidebar-actions button').nth(1).click()
    await page.waitForTimeout(200)
    const modal = page.locator('.dsh-notes-modal')
    await modal.locator('input.dsh-notes-input').fill('E2E Folder')
    await modal.getByRole('button', { name: '确定' }).click()
    await waitFor(async () => (await page.locator('.dsh-notes-tree').innerText()).includes('E2E Folder'), { label: 'folder created' })
    await page.locator('button[title="移动笔记"]').click()
    await page.waitForTimeout(200)
    const moveModal = page.locator('.dsh-notes-modal')
    await moveModal.getByRole('button', { name: 'E2E Folder' }).click()
    await moveModal.getByRole('button', { name: '移动' }).click()
    await waitFor(async () => (await page.locator('.dsh-notes-tree').innerText()).includes('E2E Folder'), { label: 'move complete' })
    // Expand the folder and verify the note is inside it.
    await page.locator('.dsh-notes-tree-row.is-folder').first().click()
    await page.waitForTimeout(300)
    assert((await page.locator('.dsh-notes-tree').innerText()).includes(title), 'moved note visible')
  })

  await step('search finds the note', async () => {
    await page.locator('.dsh-notes-search input').fill('first item')
    await page.waitForTimeout(800)
    const treeText = await page.locator('.dsh-notes-tree').innerText()
    assert(treeText.includes(title), 'search result')
    await page.locator('.dsh-notes-search button[title="清除搜索"]').click()
  })

  const updatedTitle = `${title} live`
  await step('second tab receives a live update via SSE', async () => {
    const second = await context.newPage()
    await second.goto(server.base, { waitUntil: 'networkidle' })
    const loginField = second.locator('#notes-username')
    if (await loginField.count() > 0) {
      await second.fill('#notes-username', 'e2e-user')
      await second.fill('#notes-password', 'correct-horse-battery-1')
      await second.click('button[type=submit]')
    }
    await waitFor(async () => (await second.locator('.dsh-notes-tree').innerText()).includes(title), { label: 'second tab tree' })
    const secondText = await second.locator('.dsh-notes-tree').innerText()
    assert(secondText.includes('E2E Folder'), 'folder in second tab')
    await page.locator('.dsh-notes-title-input').fill(updatedTitle)
    await waitFor(async () => (await second.locator('.dsh-notes-tree').innerText()).includes(updatedTitle), { label: 'SSE live title update' })
    await second.close()
  })

  await step('theme toggle and mobile layout', async () => {
    const before = await page.locator('.dsh-notes-root').getAttribute('class')
    await page.locator('button[title="切换主题"]').click()
    const after = await page.locator('.dsh-notes-root').getAttribute('class')
    assert(before !== after, 'theme class changes')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(400)
    await page.locator('.dsh-notes-mobile-only').click()
    await page.waitForTimeout(300)
    assert((await page.locator('.dsh-notes-root').getAttribute('class')).includes('mobile-tree-open'), 'mobile tree drawer')
    await page.screenshot({ path: join(root, 'tmp', 'e2e-mobile.png'), fullPage: true })
  })

  await step('no page errors', async () => {
    assertEqual(errors.length, 0, errors.join('; '))
  })

  console.log(`\n${passed} browser tests passed`)
} catch (error) {
  console.error(error.stack ?? error)
  process.exitCode = 1
} finally {
  if (browser !== undefined) await browser.close().catch(() => undefined)
  if (server !== undefined) await server.stop().catch(() => undefined)
}
process.exit(process.exitCode ?? 0)
