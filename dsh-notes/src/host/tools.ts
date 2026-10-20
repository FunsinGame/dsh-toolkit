/**
 * Model-facing notes tools registered by the DSH host plugin.
 *
 * These are raw ToolDefinitions (no DSH package imports) so the plugin stays
 * installable across 0.2.x runtimes. Writes go through the local cache and the
 * sync engine: offline edits are queued instead of failing.
 */

import type { NotesHost } from './host.ts'
import type { NoteDetail } from '../shared/types.ts'

interface RawToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  deferLoading?: true
  output: {
    schema: Record<string, unknown>
    render: (args: unknown, value: unknown) => Array<{ type: 'text'; text: string }>
  }
  execute: (args: unknown, exec: { signal?: AbortSignal }) => Promise<unknown>
  isConcurrencySafe?: () => boolean
}

interface ToolContext {
  tools: { register: (definition: RawToolDefinition) => unknown }
}

type Args = Record<string, unknown>

function textResult(value: unknown): Array<{ type: 'text'; text: string }> {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
}

function tool(definition: Omit<RawToolDefinition, 'output' | 'execute'> & {
  execute: (args: Args) => Promise<unknown> | unknown
}): RawToolDefinition {
  return {
    ...definition,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => textResult(value),
    },
    execute: async (rawArgs) => definition.execute(asObject(rawArgs)),
  }
}

function asObject(value: unknown): Args {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Args
}

function requiredString(args: Args, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`参数错误：${key} 必须是非空字符串`)
  return value
}

function optionalString(args: Args, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' ? value : undefined
}

function optionalNumber(args: Args, key: string): number | undefined {
  const value = Number(args[key])
  return Number.isFinite(value) ? value : undefined
}

function optionalBoolean(args: Args, key: string): boolean | undefined {
  const value = args[key]
  return typeof value === 'boolean' ? value : undefined
}

function stringArray(args: Args, key: string): string[] | undefined {
  const value = args[key]
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string')
}

function optionalId(args: Args, key: string): string | null | undefined {
  if (args[key] === null) return null
  const value = args[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

const ID_SCHEMA = { type: 'string', description: '笔记 id' }
const NOTE_ID_SCHEMA = { type: 'string', description: '笔记 id' }

export function registerNotesTools(ctx: ToolContext, host: NotesHost): void {
  const register = (definition: RawToolDefinition): void => {
    ctx.tools.register(definition)
  }

  register(tool({
    name: 'notes_tree',
    description: '返回当前账号的笔记目录树（文件夹与笔记元数据，以及 Markdown 大纲）。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    isConcurrencySafe: () => true,
    execute: async () => {
      const tree = host.tree()
      return { tree, markdown: treeMarkdown(tree.folders, tree.notes) }
    },
  }))

  register(tool({
    name: 'notes_list',
    description: '列出笔记元数据，可按目录过滤。',
    parameters: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: '目录 id；省略表示全部，root 表示根目录' },
        limit: { type: 'number', description: '最多返回条数（默认 200）' },
      },
      additionalProperties: false,
    },
    isConcurrencySafe: () => true,
    execute: async (args) => {
      const tree = host.tree()
      let notes = tree.notes
      const folderId = optionalString(args, 'folderId')
      if (folderId === 'root') notes = notes.filter((note) => note.folderId === null)
      else if (folderId !== undefined) notes = notes.filter((note) => note.folderId === folderId)
      const limit = Math.min(500, Math.max(1, optionalNumber(args, 'limit') ?? 200))
      return { notes: notes.slice(0, limit), folders: tree.folders }
    },
  }))

  register(tool({
    name: 'notes_get',
    description: '按 id 读取一条笔记的 Markdown 正文、标签、附件和 revision。',
    parameters: { type: 'object', properties: { id: ID_SCHEMA }, required: ['id'], additionalProperties: false },
    isConcurrencySafe: () => true,
    execute: async (args) => ({ note: await host.getNote(requiredString(args, 'id')) }),
  }))

  register(tool({
    name: 'notes_search',
    description: '按标题与正文搜索笔记，返回匹配片段。',
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', description: '搜索词；空字符串返回最近笔记' },
        limit: { type: 'number', description: '最多返回条数（默认 50）' },
      },
      required: ['q'],
      additionalProperties: false,
    },
    isConcurrencySafe: () => true,
    execute: async (args) => {
      const query = optionalString(args, 'q') ?? ''
      return { results: host.search(query, Math.min(200, Math.max(1, optionalNumber(args, 'limit') ?? 50))) }
    },
  }))

  register(tool({
    name: 'notes_recent',
    description: '最近打开或更新的笔记。',
    parameters: { type: 'object', properties: { limit: { type: 'number' } }, additionalProperties: false },
    isConcurrencySafe: () => true,
    execute: async (args) => ({ notes: host.recent(Math.min(100, Math.max(1, optionalNumber(args, 'limit') ?? 20))) }),
  }))

  register(tool({
    name: 'notes_stats',
    description: '当前账号的笔记、目录、附件、待同步与冲突数量。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    deferLoading: true,
    isConcurrencySafe: () => true,
    execute: async () => host.stats(),
  }))

  register(tool({
    name: 'notes_create',
    description: '创建一条 Markdown 笔记。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        folderId: { type: ['string', 'null'] },
        tags: { type: 'array', items: { type: 'string' } },
        pinned: { type: 'boolean' },
        id: { type: 'string', description: '可选：客户端生成的 id' },
      },
      additionalProperties: false,
    },
    execute: async (args) => ({
      note: host.createNote({
        id: optionalString(args, 'id'),
        title: optionalString(args, 'title'),
        content: optionalString(args, 'content'),
        folderId: optionalId(args, 'folderId') ?? null,
        tags: stringArray(args, 'tags'),
        pinned: optionalBoolean(args, 'pinned'),
      }),
      synced: false,
    }),
  }))

  register(tool({
    name: 'notes_update',
    description: '更新笔记标题/正文/标签/置顶/目录。更新先写本地缓存，再在后台同步到服务器。',
    parameters: {
      type: 'object',
      properties: {
        id: NOTE_ID_SCHEMA,
        baseRevision: { type: 'number', description: '读取笔记时拿到的 revision，用于冲突检测' },
        title: { type: 'string' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        pinned: { type: 'boolean' },
        folderId: { type: ['string', 'null'] },
      },
      required: ['id'],
      additionalProperties: false,
    },
    execute: async (args) => ({
      note: host.updateNote(requiredString(args, 'id'), {
        baseRevision: optionalNumber(args, 'baseRevision') ?? 0,
        title: optionalString(args, 'title'),
        content: optionalString(args, 'content'),
        tags: stringArray(args, 'tags'),
        pinned: optionalBoolean(args, 'pinned'),
        folderId: optionalId(args, 'folderId'),
      }),
      synced: false,
    }),
  }))

  register(tool({
    name: 'notes_append',
    description: '在笔记末尾追加 Markdown 内容。',
    parameters: {
      type: 'object',
      properties: {
        id: NOTE_ID_SCHEMA,
        content: { type: 'string' },
        separator: { type: 'string', description: '默认两个换行' },
      },
      required: ['id', 'content'],
      additionalProperties: false,
    },
    execute: async (args) => {
      const note = await host.getNote(requiredString(args, 'id'))
      const separator = optionalString(args, 'separator') ?? '\n\n'
      return { note: host.updateNote(note.id, { baseRevision: note.revision, content: `${note.content}${separator}${requiredString(args, 'content')}` }), synced: false }
    },
  }))

  register(tool({
    name: 'notes_replace',
    description: '在笔记正文中替换文本；默认只替换第一处，all=true 替换全部。',
    parameters: {
      type: 'object',
      properties: {
        id: NOTE_ID_SCHEMA,
        oldText: { type: 'string' },
        newText: { type: 'string' },
        all: { type: 'boolean' },
      },
      required: ['id', 'oldText', 'newText'],
      additionalProperties: false,
    },
    execute: async (args) => {
      const note = await host.getNote(requiredString(args, 'id'))
      const oldText = requiredString(args, 'oldText')
      if (!note.content.includes(oldText)) throw new Error('正文中找不到 oldText')
      const content = optionalBoolean(args, 'all') === true
        ? note.content.split(oldText).join(String(args.newText ?? ''))
        : note.content.replace(oldText, String(args.newText ?? ''))
      return { note: host.updateNote(note.id, { baseRevision: note.revision, content }), synced: false }
    },
  }))

  register(tool({
    name: 'notes_move',
    description: '把笔记移动到指定目录。',
    parameters: {
      type: 'object',
      properties: { id: NOTE_ID_SCHEMA, folderId: { type: ['string', 'null'] } },
      required: ['id', 'folderId'],
      additionalProperties: false,
    },
    execute: async (args) => ({
      note: host.moveNote(requiredString(args, 'id'), optionalId(args, 'folderId') ?? null, optionalNumber(args, 'baseRevision') ?? 0),
      synced: false,
    }),
  }))

  register(tool({
    name: 'notes_delete',
    description: '把笔记移入回收站。',
    parameters: { type: 'object', properties: { id: NOTE_ID_SCHEMA }, required: ['id'], additionalProperties: false },
    execute: async (args) => {
      await host.deleteNote(requiredString(args, 'id'))
      return { deleted: true }
    },
  }))

  register(tool({
    name: 'notes_restore',
    description: '从回收站恢复笔记。',
    parameters: { type: 'object', properties: { id: NOTE_ID_SCHEMA }, required: ['id'], additionalProperties: false },
    execute: async (args) => ({ note: await host.restoreNote(requiredString(args, 'id')) }),
  }))

  register(tool({
    name: 'notes_history',
    description: '列出一条笔记的历史版本。',
    parameters: { type: 'object', properties: { id: NOTE_ID_SCHEMA }, required: ['id'], additionalProperties: false },
    deferLoading: true,
    isConcurrencySafe: () => true,
    execute: async (args) => ({ versions: await host.getVersions(requiredString(args, 'id')) }),
  }))

  register(tool({
    name: 'notes_restore_version',
    description: '把笔记恢复到指定历史版本（生成新的 revision）。',
    parameters: {
      type: 'object',
      properties: { id: NOTE_ID_SCHEMA, revision: { type: 'number' } },
      required: ['id', 'revision'],
      additionalProperties: false,
    },
    deferLoading: true,
    execute: async (args) => ({ note: await host.revertNote(requiredString(args, 'id'), Number(args.revision)) }),
  }))

  register(tool({
    name: 'notes_folders_create',
    description: '创建一个笔记目录。',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string' }, parentId: { type: ['string', 'null'] }, id: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    },
    execute: async (args) => ({ folder: host.createFolder({
      id: optionalString(args, 'id'),
      name: requiredString(args, 'name'),
      parentId: optionalId(args, 'parentId') ?? null,
    }) }),
  }))

  register(tool({
    name: 'notes_folders_update',
    description: '重命名或移动目录。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' }, parentId: { type: ['string', 'null'] } },
      required: ['id'],
      additionalProperties: false,
    },
    execute: async (args) => ({ folder: host.updateFolder(requiredString(args, 'id'), {
      baseRevision: optionalNumber(args, 'baseRevision') ?? 0,
      name: optionalString(args, 'name'),
      parentId: optionalId(args, 'parentId'),
    }) }),
  }))

  register(tool({
    name: 'notes_folders_delete',
    description: '删除目录；默认把笔记移到父目录，recursive=true 时笔记一起移入回收站。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' }, recursive: { type: 'boolean' } },
      required: ['id'],
      additionalProperties: false,
    },
    execute: async (args) => {
      host.deleteFolder(requiredString(args, 'id'), optionalBoolean(args, 'recursive') === true)
      return { deleted: true }
    },
  }))

  register(tool({
    name: 'notes_sync',
    description: '立即把本地修改同步到笔记服务器，并拉取远端更新。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: async () => {
      const state = await host.syncNow()
      return { configured: state.configured, sync: state.sync, counts: state.counts }
    },
  }))

  register(tool({
    name: 'notes_sync_status',
    description: '查看同步状态、待同步数量与冲突。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    deferLoading: true,
    isConcurrencySafe: () => true,
    execute: async () => {
      const state = host.state()
      return { configured: state.configured, sync: state.sync, counts: state.counts, conflicts: state.conflicts }
    },
  }))

  register(tool({
    name: 'attachments_list',
    description: '列出某条笔记的附件。',
    parameters: { type: 'object', properties: { noteId: { type: 'string' } }, required: ['noteId'], additionalProperties: false },
    deferLoading: true,
    isConcurrencySafe: () => true,
    execute: async (args) => ({ attachments: host.listAttachments(requiredString(args, 'noteId')) }),
  }))

  register(tool({
    name: 'attachments_add',
    description: '以 base64 上传图片或音频附件到笔记，并返回可插入正文的 Markdown 链接。',
    parameters: {
      type: 'object',
      properties: {
        noteId: { type: 'string' },
        filename: { type: 'string' },
        mimeType: { type: 'string' },
        base64: { type: 'string', description: '文件内容的 base64；上限 20MB' },
      },
      required: ['noteId', 'filename', 'mimeType', 'base64'],
      additionalProperties: false,
    },
    deferLoading: true,
    execute: async (args) => host.uploadBase64(
      requiredString(args, 'noteId'),
      requiredString(args, 'filename'),
      requiredString(args, 'mimeType'),
      requiredString(args, 'base64'),
    ),
  }))

  register(tool({
    name: 'attachments_delete',
    description: '按附件 id 删除附件。',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    deferLoading: true,
    execute: async (args) => {
      await host.deleteAttachment(requiredString(args, 'id'))
      return { deleted: true }
    },
  }))

  register(tool({
    name: 'notes_daily',
    description: '获取或创建今天的日记笔记（标题 YYYY-MM-DD）。',
    parameters: {
      type: 'object',
      properties: { date: { type: 'string', description: '可选 YYYY-MM-DD' }, folderId: { type: ['string', 'null'] } },
      additionalProperties: false,
    },
    execute: async (args) => {
      const requested = optionalString(args, 'date')
      const date = requested !== undefined && /^\d{4}-\d{2}-\d{2}$/u.test(requested)
        ? requested
        : new Date().toISOString().slice(0, 10)
      const matches = host.search(date, 20).filter((result) => result.note.title === date)
      if (matches.length > 0) return { note: await host.getNote(matches[0].note.id), created: false }
      return { note: host.createNote({ title: date, content: `# ${date}\n\n`, folderId: optionalId(args, 'folderId') ?? null }), created: true }
    },
  }))

  register(tool({
    name: 'notes_export_markdown',
    description: '返回包含标题、正文、标签和附件链接的 Markdown 文本。',
    parameters: { type: 'object', properties: { id: NOTE_ID_SCHEMA }, required: ['id'], additionalProperties: false },
    deferLoading: true,
    isConcurrencySafe: () => true,
    execute: async (args) => {
      const note = await host.getNote(requiredString(args, 'id'))
      const attachments = host.listAttachments(note.id)
      return { markdown: exportMarkdown(note, attachments.map((attachment) => `- [${attachment.filename}](api/attachments/${attachment.id})`)) }
    },
  }))
}

function treeMarkdown(folders: Array<{ id: string; parentId: string | null; name: string }>, notes: Array<{ id: string; folderId: string | null; title: string }>): string {
  const lines: string[] = ['# 笔记目录', '']
  const children = new Map<string | null, typeof folders>()
  for (const folder of folders) {
    const list = children.get(folder.parentId) ?? []
    list.push(folder)
    children.set(folder.parentId, list)
  }
  const notesByFolder = new Map<string | null, typeof notes>()
  for (const note of notes) {
    const list = notesByFolder.get(note.folderId) ?? []
    list.push(note)
    notesByFolder.set(note.folderId, list)
  }
  const walk = (parentId: string | null, depth: number): void => {
    const indent = '  '.repeat(depth)
    for (const folder of children.get(parentId) ?? []) {
      lines.push(`${indent}- 📁 ${folder.name} (${folder.id})`)
      for (const note of notesByFolder.get(folder.id) ?? []) lines.push(`${indent}  - ${note.title || '未命名笔记'} (${note.id})`)
      walk(folder.id, depth + 1)
    }
    if (parentId === null) {
      for (const note of notesByFolder.get(null) ?? []) lines.push(`- ${note.title || '未命名笔记'} (${note.id})`)
    }
  }
  walk(null, 0)
  if (lines.length === 2) lines.push('（还没有笔记）')
  return lines.join('\n')
}

function exportMarkdown(note: NoteDetail, attachmentLines: string[]): string {
  const tags = note.tags.length > 0 ? `\n\n标签: ${note.tags.map((tag) => `#${tag}`).join(' ')}` : ''
  const attachments = attachmentLines.length > 0 ? `\n\n## 附件\n\n${attachmentLines.join('\n')}` : ''
  return `# ${note.title}\n\n${note.content}${tags}${attachments}\n`
}
