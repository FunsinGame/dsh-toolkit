/**
 * dsh-design-doc host half.
 *
 * Serves the design-doc library (`<workspace>/Docs/Design`) on DSH's own Web
 * server under `/dsh-design-doc`, mounts it at `/dsh-design-doc/site/**` so the
 * documents' relative asset and cross-document links keep working, and writes a
 * single element's inner HTML back to the `.html` source byte-for-byte.
 *
 * The coordinate system is the host's own parse, not the browser's DOM: every
 * editable element gets a `data-dd-path` attribute derived from byte offsets,
 * and a save re-parses the file and splices exactly that element's inner range.
 * That is what keeps a one-paragraph edit from rewriting the whole file.
 */

import { execFile } from 'node:child_process'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const name = 'dsh-design-doc'

const PREFIX = '/dsh-design-doc'
const VERSION = '0.1.0'

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/** Elements whose content the raw-text scanner must not parse as markup. */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title'])

/** Elements offered to the browser as click targets. */
const EDITABLE = new Set([
  'p', 'li', 'td', 'th', 'h2', 'h3', 'h4', 'h5',
  'dd', 'dt', 'blockquote', 'pre', 'figcaption', 'summary', 'caption', 'aside',
])

/**
 * Containers that carry no editable block of their own — an image wrapper, for
 * example — are selectable as a whole, so a picture is not a dead zone.
 */
const CONTAINER = new Set(['div', 'figure'])

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const OPEN_TAG = /<([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/y
const ATTRS = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g

/* ------------------------------------------------------------------ parse -- */

function parseAttrs(raw) {
  const out = {}
  if (raw === undefined || raw === '') return out
  ATTRS.lastIndex = 0
  let match
  while ((match = ATTRS.exec(raw)) !== null) {
    const key = match[1].toLowerCase()
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    if (key !== '' && !(key in out)) out[key] = value
  }
  return out
}

/**
 * Tolerant HTML parser that records byte offsets for every element.
 *
 * Only the shapes this documentation uses are supported (no CDATA, no implied
 * end tags); that is enough to locate an element's inner range exactly.
 */
export function parseHtml(src) {
  const lower = src.toLowerCase()
  const root = {
    tag: '#root', attrs: {}, start: 0, nameEnd: 0, openEnd: 0,
    closeStart: src.length, end: src.length, parent: null, children: [],
  }
  const stack = [root]
  let i = 0

  while (i < src.length) {
    const lt = src.indexOf('<', i)
    if (lt < 0) break

    if (src.startsWith('<!--', lt)) {
      const close = src.indexOf('-->', lt + 4)
      i = close < 0 ? src.length : close + 3
      continue
    }
    if (src[lt + 1] === '!' || src[lt + 1] === '?') {
      const close = src.indexOf('>', lt)
      i = close < 0 ? src.length : close + 1
      continue
    }
    if (src[lt + 1] === '/') {
      const close = src.indexOf('>', lt)
      if (close < 0) break
      const tag = src.slice(lt + 2, close).trim().toLowerCase()
      for (let k = stack.length - 1; k > 0; k -= 1) {
        if (stack[k].tag === tag) {
          stack[k].closeStart = lt
          stack[k].end = close + 1
          stack.length = k
          break
        }
      }
      i = close + 1
      continue
    }

    OPEN_TAG.lastIndex = lt
    const match = OPEN_TAG.exec(src)
    if (match === null) {
      i = lt + 1
      continue
    }

    const tag = match[1].toLowerCase()
    const node = {
      tag,
      attrs: parseAttrs(match[2]),
      start: lt,
      nameEnd: lt + 1 + match[1].length,
      openEnd: lt + match[0].length,
      closeStart: 0,
      end: 0,
      parent: stack[stack.length - 1],
      children: [],
    }
    node.parent.children.push(node)

    if (match[3] === '/' || VOID.has(tag)) {
      node.closeStart = node.openEnd
      node.end = node.openEnd
      i = node.openEnd
      continue
    }
    if (RAW_TEXT.has(tag)) {
      const close = lower.indexOf('</' + tag, node.openEnd)
      const gt = close < 0 ? -1 : src.indexOf('>', close)
      node.closeStart = close < 0 ? src.length : close
      node.end = gt < 0 ? src.length : gt + 1
      i = node.end
      continue
    }
    stack.push(node)
    i = node.openEnd
  }

  for (const node of stack.slice(1)) {
    node.closeStart = src.length
    node.end = src.length
  }
  return root
}

function walk(node, visit) {
  for (const child of node.children) {
    visit(child)
    walk(child, visit)
  }
}

function indexAmongSiblings(node) {
  const siblings = node.parent ? node.parent.children : []
  let index = 0
  for (const sibling of siblings) {
    if (sibling.tag === node.tag) {
      index += 1
      if (sibling === node) return index
    }
  }
  return index
}

/**
 * Collects `{node, ddPath}` for every editable element.
 *
 * A path is `<scope>|<tag><n>` (`<scope>|.` for the scope element itself), where
 * `<scope>` is the nearest preceding-or-ancestor `id`. A heading carries the id
 * for everything that follows it inside the same chapter, which is what makes a
 * paragraph under `10.2` belong to `job-10-2` rather than to the chapter — that
 * id is also the key `design-map.json` uses for code links.
 */
export function collectPaths(tree) {
  const out = []
  const counters = new Map()

  const hasEditableBlock = (node) => {
    let found = false
    walk(node, (child) => {
      if (found === false && EDITABLE.has(child.tag)) found = true
    })
    return found
  }

  const selectable = (node) => {
    if (EDITABLE.has(node.tag)) return true
    return CONTAINER.has(node.tag) && hasEditableBlock(node) === false
  }

  const walkRegion = (node, scope) => {
    let current = scope
    for (const child of node.children) {
      const id = child.attrs && typeof child.attrs.id === 'string' ? child.attrs.id : ''
      if (id !== '') current = id
      if (selectable(child) && current !== null) {
        if (id !== '' && id === current) {
          out.push({ node: child, ddPath: `${current}|.` })
        } else {
          let byTag = counters.get(current)
          if (byTag === undefined) {
            byTag = new Map()
            counters.set(current, byTag)
          }
          const next = (byTag.get(child.tag) ?? 0) + 1
          byTag.set(child.tag, next)
          out.push({ node: child, ddPath: `${current}|${child.tag}${next}` })
        }
      }
      walkRegion(child, current)
    }
  }

  walkRegion(tree, null)
  return out
}

/** Returns `{html, count}`: the source with `data-dd-path` injected. */
export function injectPaths(src, tree) {
  const entries = collectPaths(tree)
  const edits = []
  for (const entry of entries) {
    const value = entry.ddPath.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    edits.push({ at: entry.node.nameEnd, text: ` data-dd-path="${value}"` })
  }
  edits.sort((a, b) => a.at - b.at)
  let html = ''
  let cursor = 0
  for (const edit of edits) {
    html += src.slice(cursor, edit.at) + edit.text
    cursor = edit.at
  }
  return { html: html + src.slice(cursor), count: entries.length }
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&')
}

/** Rendered text of an element, tags stripped and whitespace collapsed. */
export function textOf(src, node) {
  const inner = src.slice(node.openEnd, node.closeStart)
  const flat = inner.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')
  return decodeEntities(flat).replace(/\s+/g, ' ').trim()
}

function squash(text) {
  return String(text ?? '').replace(/\s+/g, '').replace(/[\u200b]/g, '')
}

function findNodeByPath(tree, ddPath) {
  const wanted = String(ddPath)
  for (const entry of collectPaths(tree)) {
    if (entry.ddPath === wanted) return entry.node
  }
  return null
}

/* ------------------------------------------------------------------ diff --- */

function lineDiff(before, after, limit = 60) {
  const a = before.split('\n')
  const b = after.split('\n')
  const rows = []
  const max = Math.max(a.length, b.length)
  for (let index = 0; index < max && rows.length < limit; index += 1) {
    if (a[index] !== b[index]) {
      rows.push({ line: index + 1, before: a[index] ?? '', after: b[index] ?? '' })
    }
  }
  return rows
}

/* ----------------------------------------------------------------- routes -- */

class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv !== '') return fromEnv
  return path.join(os.homedir(), '.dsh')
}

async function readConfig() {
  try {
    const raw = await readFile(path.join(resolveDshHome(), 'design-doc', 'config.json'), 'utf8')
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Remembers the last workspace that actually resolved, so the next launch auto-opens it. */
async function rememberWorkspace(workspace) {
  if (typeof workspace !== 'string' || workspace === '') return
  const dir = path.join(resolveDshHome(), 'design-doc')
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'config.json'), JSON.stringify({ workspace }, null, 2), 'utf8')
  } catch {
    /* remembering is a convenience, not a requirement */
  }
}

/** Resolves the `Docs/Design` directory from an explicit workspace root or config. */
async function resolveDocsRoot(explicit) {
  // An explicit root is honoured alone: silently falling back to a remembered
  // workspace would show the wrong library after a typo.
  if (typeof explicit === 'string' && explicit !== '') {
    const resolved = path.resolve(explicit, 'Docs', 'Design')
    try {
      await readFile(path.join(resolved, 'modules.json'), 'utf8')
      return resolved
    } catch {
      return null
    }
  }

  const config = await readConfig()
  const candidates = []
  if (typeof config.workspace === 'string' && config.workspace !== '') candidates.push(path.join(config.workspace, 'Docs', 'Design'))
  if (typeof process.env.DSH_DESIGN_DOC_ROOT === 'string' && process.env.DSH_DESIGN_DOC_ROOT !== '') {
    candidates.push(process.env.DSH_DESIGN_DOC_ROOT)
  }
  candidates.push(path.join(process.cwd(), 'Docs', 'Design'))

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    try {
      await readFile(path.join(resolved, 'modules.json'), 'utf8')
      return resolved
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

function assertInside(root, target) {
  const relative = path.relative(root, target)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new HttpError(403, 'outside_root', '路径不在设计文档目录内')
  }
  return relative
}

async function loadManifest(docsRoot) {
  const modulesJson = JSON.parse(await readFile(path.join(docsRoot, 'modules.json'), 'utf8'))
  const modules = []

  for (const module of Array.isArray(modulesJson.modules) ? modulesJson.modules : []) {
    const dir = path.join(docsRoot, 'modules', module.id, 'documents')
    let names = []
    try {
      names = await readdir(dir)
    } catch {
      names = []
    }
    const documents = []
    for (const name of names.filter((entry) => entry.endsWith('.html')).sort()) {
      const rel = `modules/${module.id}/documents/${name}`
      const src = await readFile(path.join(docsRoot, rel), 'utf8')
      documents.push({ rel, title: documentTitle(src, name), chapters: chaptersOf(src) })
    }
    modules.push({ id: module.id, title: module.title ?? module.id, documents })
  }

  let sections = {}
  try {
    // design-map.json keeps two tables: `sections` is per-anchor metadata
    // (doc/title/hash), `links` is the anchor → code-file list we surface.
    const map = JSON.parse(await readFile(path.join(docsRoot, '..', '..', 'Tools', 'DesignSync', 'design-map.json'), 'utf8'))
    const table = map !== null && typeof map.links === 'object' && map.links !== null ? map.links : null
    if (table !== null) {
      for (const [anchor, files] of Object.entries(table)) {
        if (!Array.isArray(files)) continue
        sections[anchor] = files.map((link) => link && link.file).filter((file) => typeof file === 'string')
      }
    }
  } catch {
    sections = {}
  }

  return { docsRoot, modules, sections }
}

function documentTitle(src, fallback) {
  const match = /<title>([\s\S]*?)<\/title>/i.exec(src)
  if (match === null) return fallback.replace(/^\d+-/, '').replace(/\.html$/, '')
  return decodeEntities(match[1]).replace(/\s*｜.*$/, '').trim()
}

function chaptersOf(src) {
  const tree = parseHtml(src)
  const chapters = []
  walk(tree, (node) => {
    if (node.tag !== 'section') return
    const id = node.attrs.id
    if (!id) return
    const heading = node.children.find((child) => child.tag === 'header') ?? node
    let title = ''
    walk(heading, (child) => {
      if (title === '' && (child.tag === 'h2' || child.tag === 'h1')) title = textOf(src, child)
    })
    const sections = []
    walk(node, (child) => {
      if (child.tag === 'h3' && child.attrs.id) sections.push({ id: child.attrs.id, title: textOf(src, child) })
    })
    chapters.push({ id, module: node.attrs['data-module'] ?? '', title, sections })
  })
  return chapters
}

async function handle(req, res, deps) {
  const url = new URL(req.url ?? '/', 'http://dsh-design-doc.invalid')
  const pathname = decodeURIComponent(url.pathname)
  const method = (req.method ?? 'GET').toUpperCase()

  if (pathname === PREFIX || pathname === `${PREFIX}/`) {
    return sendJson(res, 200, { ok: true, name: 'dsh-design-doc', version: VERSION })
  }
  if (pathname === `${PREFIX}/health`) {
    const docsRoot = await resolveDocsRoot(url.searchParams.get('root'))
    return sendJson(res, 200, { ok: docsRoot !== null, version: VERSION, docsRoot })
  }
  if (pathname === `${PREFIX}/manifest`) {
    const requested = url.searchParams.get('root')
    const docsRoot = await resolveDocsRoot(requested)
    if (docsRoot === null) {
      throw new HttpError(404, 'docs_not_found', '没找到 Docs/Design，请在顶栏填工作区根目录')
    }
    if (requested !== null && requested !== '') await rememberWorkspace(requested)
    return sendJson(res, 200, { ok: true, ...(await loadManifest(docsRoot)) })
  }
  if (pathname === `${PREFIX}/overlay.js`) {
    return sendText(res, 200, MIME['.js'], await readFile(new URL('./overlay.js', import.meta.url), 'utf8'))
  }
  if (pathname.startsWith(`${PREFIX}/site/`)) {
    return serveSite(req, res, url, pathname.slice(`${PREFIX}/site/`.length), deps)
  }
  if (pathname === `${PREFIX}/save` && method === 'POST') {
    return saveDoc(req, res, deps)
  }
  if (pathname === `${PREFIX}/sync` && method === 'POST') {
    return runSync(req, res, deps)
  }
  throw new HttpError(404, 'not_found', '未找到')
}

async function serveSite(req, res, url, rawRel, deps) {
  const docsRoot = await resolveDocsRoot(url.searchParams.get('root'))
  if (docsRoot === null) throw new HttpError(404, 'docs_not_found', '没找到 Docs/Design')
  const rel = rawRel === '' ? 'index.html' : rawRel
  const target = path.resolve(docsRoot, rel)
  assertInside(docsRoot, target)

  let bytes
  try {
    bytes = await readFile(target)
  } catch {
    throw new HttpError(404, 'not_found', `文件不存在：${rel}`)
  }

  const ext = path.extname(target).toLowerCase()
  if (ext === '.html') {
    const src = bytes.toString('utf8')
    const { html } = injectPaths(src, parseHtml(src))
    const trimmed = html.replace(/<\/body>/i, `<script src="${PREFIX}/overlay.js"></script>\n</body>`)
    const body = trimmed === html ? `${html}\n<script src="${PREFIX}/overlay.js"></script>` : trimmed
    return sendText(res, 200, MIME['.html'], body)
  }
  res.statusCode = 200
  res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Content-Length', String(bytes.byteLength))
  res.end(bytes)
}

async function saveDoc(req, res, deps) {
  const body = await readJson(req)
  const docsRoot = await resolveDocsRoot(body.root)
  if (docsRoot === null) throw new HttpError(404, 'docs_not_found', '没找到 Docs/Design')

  const rel = String(body.rel ?? '')
  if (!rel.endsWith('.html')) throw new HttpError(400, 'bad_rel', '只能写回 .html 正文')
  const target = path.resolve(docsRoot, rel)
  assertInside(docsRoot, target)

  const src = await readFile(target, 'utf8')
  const tree = parseHtml(src)
  const node = findNodeByPath(tree, String(body.ddPath ?? ''))
  if (node === null) throw new HttpError(404, 'anchor_moved', '文档结构变了，找不到这一处，请刷新后重试')
  if (node.closeStart === node.openEnd) throw new HttpError(400, 'not_container', '这个元素不能直接改内容')

  const previous = textOf(src, node)
  if (typeof body.expectText === 'string' && body.expectText !== '' && squash(previous) !== squash(body.expectText)) {
    throw new HttpError(409, 'content_changed', '文件已经被改过，请刷新后再改')
  }

  const next = String(body.html ?? '')
  const updated = src.slice(0, node.openEnd) + next + src.slice(node.closeStart)
  if (updated === src) return sendJson(res, 200, { ok: true, changed: 0, diff: [] })

  await writeFile(target, updated, 'utf8')
  deps.logger?.info?.(`design-doc: patched ${rel} ${body.ddPath}`)
  return sendJson(res, 200, {
    ok: true,
    changed: lineDiff(src, updated).length,
    diff: lineDiff(src, updated),
    bytesBefore: Buffer.byteLength(src),
    bytesAfter: Buffer.byteLength(updated),
  })
}

async function runSync(req, res, deps) {
  const body = await readJson(req)
  const docsRoot = await resolveDocsRoot(body.root)
  if (docsRoot === null) throw new HttpError(404, 'docs_not_found', '没找到 Docs/Design')

  const script = path.join(docsRoot, 'scripts', 'build_docs.py')
  const result = await new Promise((resolve) => {
    execFile('python', [script], { cwd: docsRoot, timeout: 120000, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ ok: error === null, code: error === null ? 0 : (error.code ?? 1), stdout, stderr })
    })
  })
  deps.logger?.info?.(`design-doc: build_docs ok=${result.ok}`)
  return sendJson(res, 200, { ok: result.ok, ...result })
}

/* --------------------------------------------------------------- plumbing -- */

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 4 * 1024 * 1024) throw new HttpError(413, 'body_too_large', '请求体过大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    throw new HttpError(400, 'invalid_json', 'JSON 格式错误')
  }
}

function sendJson(res, status, body) {
  sendText(res, status, 'application/json; charset=utf-8', JSON.stringify(body))
}

function sendText(res, status, contentType, text) {
  res.statusCode = status
  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Length', String(Buffer.byteLength(text)))
  res.end(text)
}

/* ------------------------------------------------------------------- init -- */

export function apply(ctx) {
  const logger = ctx.logger !== undefined && typeof ctx.logger.info === 'function'
    ? ctx.logger
    : { info: (...a) => console.info('[dsh-design-doc]', ...a), warn: (...a) => console.warn('[dsh-design-doc]', ...a), error: (...a) => console.error('[dsh-design-doc]', ...a) }

  ctx.inject(['webServer', 'connection'], (child) => {
    child.effect(
      () => child.webServer.register({
        kind: 'prefix',
        path: PREFIX,
        handler: async (req, res) => {
          try {
            const rejection = child.connection?.requestRejection?.({ headers: req.headers })
            if (rejection !== undefined) {
              res.statusCode = rejection
              res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
              return
            }
            await handle(req, res, { logger })
          } catch (error) {
            const status = error instanceof HttpError ? error.status : 500
            const code = error instanceof HttpError ? error.code : 'internal_error'
            if (status >= 500) logger.error('design-doc route failed', error)
            if (res.headersSent) {
              res.destroy()
              return
            }
            sendJson(res, status, { ok: false, error: { code, message: error.message ?? String(error) } })
          }
        },
      }),
      'dsh-design-doc: routes',
    )
  })

  logger.info('design-doc host ready')
}

export { PREFIX, VERSION, textOf as elementText, findNodeByPath }
