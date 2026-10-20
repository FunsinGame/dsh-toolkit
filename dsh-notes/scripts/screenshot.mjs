/**
 * Generate the documentation screenshots against a fresh demo server.
 *
 * The demo content intentionally looks like a real notebook (folders, markdown,
 * image and audio attachments) rather than test timestamps.
 */

import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { chromium } from 'playwright-core'
import {
  createAccount,
  createToken,
  makeTempDir,
  request,
  startServer,
  uploadAttachment,
  wavBuffer,
} from './lib/harness.mjs'

const root = process.cwd()
const docs = join(root, 'docs')
await mkdir(docs, { recursive: true })

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function makePng(width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4
      const t = x / width
      const u = y / height
      raw[offset] = Math.round(32 + 54 * t + 24 * Math.sin(u * Math.PI))
      raw[offset + 1] = Math.round(96 + 80 * u + 20 * Math.sin(t * Math.PI))
      raw[offset + 2] = Math.round(210 - 70 * t + 18 * (1 - u))
      raw[offset + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
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

let server
let browser
try {
  const dataDir = await makeTempDir('screenshot')
  await createAccount(dataDir, 'demo', 'correct-horse-battery-1')
  const token = await createToken(dataDir, 'demo', { name: 'screenshot' })
  server = await startServer({ dataDir })
  const base = server.base
  const auth = { token }
  const work = await request(base, '/api/folders', { method: 'POST', ...auth, body: { name: '工作' } })
  const ideas = await request(base, '/api/folders', { method: 'POST', ...auth, body: { name: '灵感' } })
  const workId = work.payload.folder.id
  const ideasId = ideas.payload.folder.id

  const image = makePng(880, 420)
  const audio = wavBuffer()
  const main = await request(base, '/api/notes', {
    method: 'POST', ...auth, body: {
      folderId: workId,
      title: 'DSH Notes 使用指南',
      tags: ['指南', 'DSH'],
      pinned: true,
      content: [
        '# DSH Notes 使用指南',
        '',
        '一个支持 Markdown、附件、离线缓存与 AI 工具的个人笔记系统。',
        '',
        '## 亮点',
        '',
        '- 左侧目录树，右侧编辑 / 预览',
        '- 账号密码登录；账号只能在服务器上配置',
        '- DSH 插件定时 / 手动同步，离线编辑后再补同步',
        '- MCP + 原生 notes_* 工具，让 AI 管理笔记',
        '',
        '## 代码示例',
        '',
        '```ts',
        "const note = await tools.notes_create({ title: '想法', content: '# 想法' })",
        '```',
        '',
      ].join('\n'),
    },
  })
  const noteId = main.payload.note.id
  await uploadAttachment(base, token, noteId, 'cover.png', 'image/png', image)
  await uploadAttachment(base, token, noteId, 'focus.wav', 'audio/wav', audio)
  const current = await request(base, `/api/notes/${noteId}`, auth)
  const imageAttachment = current.payload.note.attachments.find((item) => item.mime.startsWith('image/'))
  const audioAttachment = current.payload.note.attachments.find((item) => item.mime.startsWith('audio/'))
  await request(base, `/api/notes/${noteId}`, {
    method: 'PATCH', ...auth, body: {
      baseRevision: current.payload.note.revision,
      content: `${current.payload.note.content}![封面](api/attachments/${imageAttachment.id})\n\n[专注音乐](api/attachments/${audioAttachment.id})\n`,
    },
  })

  await request(base, '/api/notes', {
    method: 'POST', ...auth, body: {
      folderId: workId,
      title: '产品周报 · 第 42 周',
      tags: ['周报'],
      content: '# 产品周报 · 第 42 周\n\n## 本周进展\n\n- 完成笔记服务的账号与令牌体系\n- 插件离线缓存与冲突处理\n- MCP 工具接入\n\n## 下周计划\n\n1. 移动端体验优化\n2. 附件管理\n',
    },
  })
  await request(base, '/api/notes', {
    method: 'POST', ...auth, body: {
      folderId: workId,
      title: '会议记录 · 设计评审',
      content: '# 会议记录 · 设计评审\n\n- 目录树采用 280px 固定宽度\n- 预览区保留 24px 内边距\n- 移动端使用抽屉式目录\n',
    },
  })
  await request(base, '/api/notes', {
    method: 'POST', ...auth, body: {
      folderId: ideasId,
      title: '新功能想法',
      tags: ['灵感'],
      content: '# 新功能想法\n\n- 笔记之间的双向链接\n- 附件 OCR 搜索\n- 每日笔记模板\n',
    },
  })

  browser = await chromium.launch({ executablePath: chromePath(), headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.fill('#notes-username', 'demo')
  await page.fill('#notes-password', 'correct-horse-battery-1')
  await page.click('button[type=submit]')
  await page.waitForSelector('.dsh-notes-tree', { timeout: 15000 })
  await page.waitForTimeout(1000)
  // Expand the work folder before selecting the guide note.
  const workFolder = page.locator('.dsh-notes-tree-row.is-folder', { hasText: '工作' }).first()
  if (await workFolder.count() > 0) {
    await workFolder.click()
    await page.waitForTimeout(300)
  }
  // Select the guide note and use split mode.
  const row = page.locator('.dsh-notes-tree-row', { hasText: 'DSH Notes 使用指南' }).first()
  await row.click()
  await page.waitForTimeout(800)
  await page.locator('button[title="分栏"]').click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(docs, 'screenshot.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('button[title="预览"]').click()
  await page.waitForTimeout(600)
  // Close the mobile tree drawer if it opened during selection.
  const rootElement = page.locator('.dsh-notes-root')
  if ((await rootElement.getAttribute('class')).includes('mobile-tree-open')) {
    await page.locator('.dsh-notes-mobile-backdrop').click({ force: true })
  }
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(docs, 'screenshot-mobile.png'), fullPage: false })
  console.log('screenshots written: docs/screenshot.png, docs/screenshot-mobile.png')
} catch (error) {
  console.error(error.stack ?? error)
  process.exitCode = 1
} finally {
  if (browser !== undefined) await browser.close().catch(() => undefined)
  if (server !== undefined) await server.stop().catch(() => undefined)
}
process.exit(process.exitCode ?? 0)
