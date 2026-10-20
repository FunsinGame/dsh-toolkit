/**
 * MCP endpoint for dsh-notes.
 *
 * Every request is authenticated by the HTTP layer with a server-issued Bearer
 * token. The transport is stateless: each request constructs a short-lived
 * McpServer, registers the same tools/resources/prompts, executes, and closes.
 * Tool inputs can only address notes by id; there is no file-path, shell or URL
 * fetching surface.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import type { AuthContext, NotesService } from '../service.ts'
import type { NoteDetail, NoteMeta } from '../../shared/types.ts'

export interface McpRequestContext {
  req: IncomingMessage
  res: ServerResponse
  body: Record<string, unknown>
  service: NotesService
  auth: AuthContext
  version: string
}

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function ok(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function failure(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error)
  return { content: [{ type: 'text', text: `错误: ${message}` }], isError: true }
}

function writeAllowed(auth: AuthContext): boolean {
  return auth.kind === 'session' || auth.scopes.includes('write')
}

function readonlyError(): ToolResult {
  return { content: [{ type: 'text', text: '错误: 该访问令牌只有只读权限' }], isError: true }
}

function tagArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string')
}

function noteMarkdown(note: NoteDetail): string {
  const tags = note.tags.length > 0 ? `\n\n标签: ${note.tags.map((tag) => `#${tag}`).join(' ')}` : ''
  return `# ${note.title}\n\n${note.content}${tags}\n`
}

function treeMarkdown(folders: Array<{ id: string; parentId: string | null; name: string }>, notes: NoteMeta[]): string {
  const lines: string[] = ['# 笔记目录', '']
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]))
  const children = new Map<string | null, typeof folders>()
  for (const folder of folders) {
    const list = children.get(folder.parentId) ?? []
    list.push(folder)
    children.set(folder.parentId, list)
  }
  const notesByFolder = new Map<string | null, NoteMeta[]>()
  for (const note of notes) {
    const list = notesByFolder.get(note.folderId) ?? []
    list.push(note)
    notesByFolder.set(note.folderId, list)
  }
  const walk = (parentId: string | null, depth: number): void => {
    const indent = '  '.repeat(depth)
    for (const folder of children.get(parentId) ?? []) {
      lines.push(`${indent}- 📁 ${folder.name} (${folder.id})`)
      for (const note of notesByFolder.get(folder.id) ?? []) {
        lines.push(`${indent}  - ${note.title || '未命名笔记'} (${note.id})`)
      }
      walk(folder.id, depth + 1)
    }
    if (parentId === null) {
      for (const note of notesByFolder.get(null) ?? []) {
        lines.push(`- ${note.title || '未命名笔记'} (${note.id})`)
      }
    }
  }
  walk(null, 0)
  if (lines.length === 2) lines.push('（还没有笔记）')
  void folderMap
  return lines.join('\n')
}

export async function handleMcpRequest(context: McpRequestContext): Promise<void> {
  const { req, res, body, service, auth, version } = context
  const userId = auth.user.id
  const server = new McpServer(
    { name: 'dsh-notes', version },
    {
      instructions: '管理当前账号的 Markdown 笔记。笔记用 id 标识，附件用 api/attachments/<id> 引用。写入前先读取 revision，并用 baseRevision 防止覆盖他人修改。',
    },
  )

  const register = (name: string, config: Parameters<McpServer['registerTool']>[1], handler: Parameters<McpServer['registerTool']>[2]): void => {
    server.registerTool(name, config, handler as never)
  }

  register('notes_tree', {
    title: '笔记目录树',
    description: '返回当前账号的文件夹与笔记元数据树（Markdown 大纲和 JSON）。',
  }, async () => {
    try {
      const tree = service.listTree(userId)
      return ok({ tree, markdown: treeMarkdown(tree.folders, tree.notes) })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_list', {
    title: '列出笔记',
    description: '列出笔记元数据，可按目录过滤。',
    inputSchema: {
      folderId: z.string().optional().describe('目录 id；省略表示全部，root 表示根目录'),
      limit: z.number().int().min(1).max(500).optional(),
    },
  }, async (args: { folderId?: string; limit?: number }) => {
    try {
      const tree = service.listTree(userId)
      let notes = tree.notes
      if (args.folderId === 'root') notes = notes.filter((note) => note.folderId === null)
      else if (typeof args.folderId === 'string') notes = notes.filter((note) => note.folderId === args.folderId)
      return ok({ notes: notes.slice(0, args.limit ?? 200), folders: tree.folders })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_get', {
    title: '读取笔记',
    description: '按 id 读取一条笔记的 Markdown 正文、标签、附件与 revision。',
    inputSchema: { id: z.string().min(1).describe('笔记 id') },
  }, async (args: { id: string }) => {
    try {
      return ok({ note: service.noteDetail(userId, args.id) })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_search', {
    title: '搜索笔记',
    description: '按标题与正文搜索笔记，返回匹配片段。',
    inputSchema: {
      q: z.string().default('').describe('搜索词；空字符串列出最近笔记'),
      tag: z.string().optional(),
      folderId: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
  }, async (args: { q: string; tag?: string; folderId?: string; limit?: number }) => {
    try {
      const results = service.search(userId, args.q, {
        tag: args.tag,
        folderId: args.folderId === undefined ? undefined : args.folderId === 'root' ? null : args.folderId,
        limit: args.limit,
      })
      return ok({ results })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_recent', {
    title: '最近笔记',
    description: '最近更新的笔记。',
    inputSchema: { limit: z.number().int().min(1).max(100).optional() },
  }, async (args: { limit?: number }) => {
    try {
      const tree = service.listTree(userId)
      return ok({ notes: tree.notes.slice(0, args.limit ?? 20) })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_stats', {
    title: '笔记统计',
    description: '当前账号的笔记、目录、附件数量。',
  }, async () => {
    try {
      return ok(service.healthCounts(userId))
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_create', {
    title: '创建笔记',
    description: '创建一条 Markdown 笔记，可指定目录与标签。',
    inputSchema: {
      title: z.string().optional(),
      content: z.string().optional(),
      folderId: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
      id: z.string().optional().describe('可选：客户端生成的 id'),
      opId: z.string().optional().describe('幂等操作 id'),
    },
  }, async (args: { title?: string; content?: string; folderId?: string | null; tags?: string[]; id?: string; opId?: string }) => {
    if (!writeAllowed(auth)) return readonlyError()
    try {
      const note = service.createNote(userId, args)
      return ok({ note, synced: true })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_update', {
    title: '更新笔记',
    description: '按 baseRevision 更新笔记；版本不匹配会返回冲突，不会静默覆盖。',
    inputSchema: {
      id: z.string().min(1),
      baseRevision: z.number().int().min(1),
      title: z.string().optional(),
      content: z.string().optional(),
      tags: z.array(z.string()).optional(),
      pinned: z.boolean().optional(),
      folderId: z.string().nullable().optional(),
      opId: z.string().optional(),
    },
  }, async (args: { id: string; baseRevision: number; title?: string; content?: string; tags?: string[]; pinned?: boolean; folderId?: string | null; opId?: string }) => {
    if (!writeAllowed(auth)) return readonlyError()
    try {
      const note = service.updateNote(userId, args.id, args)
      return ok({ note, synced: true })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_append', {
    title: '追加笔记内容',
    description: '在笔记末尾追加 Markdown 内容，自动使用当前 revision。',
    inputSchema: {
      id: z.string().min(1),
      content: z.string().min(1),
      separator: z.string().optional(),
    },
  }, async (args: { id: string; content: string; separator?: string }) => {
    if (!writeAllowed(auth)) return readonlyError()
    try {
      const current = service.noteDetail(userId, args.id)
      const addition = `${args.separator ?? '\n\n'}${args.content}`
      const note = service.updateNote(userId, args.id, {
        baseRevision: current.revision,
        content: `${current.content}${addition}`,
      })
      return ok({ note })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_replace', {
    title: '替换笔记文本',
    description: '在笔记正文中替换文本；默认只替换第一处，all=true 替换全部。',
    inputSchema: {
      id: z.string().min(1),
      oldText: z.string().min(1),
      newText: z.string(),
      all: z.boolean().optional(),
    },
  }, async (args: { id: string; oldText: string; newText: string; all?: boolean }) => {
    if (!writeAllowed(auth)) return readonlyError()
    try {
      const current = service.noteDetail(userId, args.id)
      if (!current.content.includes(args.oldText)) {
        return { content: [{ type: 'text', text: '错误: 正文中找不到 oldText' }], isError: true }
      }
      const content = args.all === true
        ? current.content.split(args.oldText).join(args.newText)
        : current.content.replace(args.oldText, args.newText)
      const note = service.updateNote(userId, args.id, { baseRevision: current.revision, content })
      return ok({ note })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_move', {
    title: '移动笔记',
    description: '把笔记移动到指定目录。',
    inputSchema: {
      id: z.string().min(1),
      folderId: z.string().nullable(),
      baseRevision: z.number().int().min(1),
    },
  }, async (args: { id: string; folderId: string | null; baseRevision: number }) => {
    if (!writeAllowed(auth)) return readonlyError()
    try {
      const note = service.moveNote(userId, args.id, args.folderId, args.baseRevision)
      return ok({ note })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_delete', {
    title: '删除笔记',
    description: '把笔记移入回收站。',
    inputSchema: { id: z.string().min(1) },
  }, async (args: { id: string }) => {
    if (!writeAllowed(auth)) return readonlyError()
    try {
      service.deleteNote(userId, args.id)
      return ok({ deleted: true })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_restore', {
    title: '恢复笔记',
    description: '从回收站恢复笔记。',
    inputSchema: { id: z.string().min(1) },
  }, async (args: { id: string }) => {
    if (!writeAllowed(auth)) return readonlyError()
    try {
      return ok({ note: service.restoreNote(userId, args.id) })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_history', {
    title: '历史版本',
    description: '列出一条笔记保存过的历史版本。',
    inputSchema: { id: z.string().min(1) },
  }, async (args: { id: string }) => {
    try {
      return ok({ versions: service.listVersions(userId, args.id) })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_restore_version', {
    title: '恢复历史版本',
    description: '把笔记内容恢复到指定历史版本，并生成新的 revision。',
    inputSchema: { id: z.string().min(1), revision: z.number().int().min(1) },
  }, async (args: { id: string; revision: number }) => {
    if (!writeAllowed(auth)) return readonlyError()
    try {
      return ok({ note: service.revertNote(userId, args.id, args.revision) })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_folders_create', {
    title: '创建目录',
    description: '创建一个笔记目录，可指定父目录。',
    inputSchema: {
      name: z.string().min(1),
      parentId: z.string().nullable().optional(),
      id: z.string().optional(),
    },
  }, async (args: { name: string; parentId?: string | null; id?: string }) => {
    if (!writeAllowed(auth)) return readonlyError()
    try {
      return ok({ folder: service.createFolder(userId, args) })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_folders_update', {
    title: '更新目录',
    description: '重命名目录或移动目录。',
    inputSchema: {
      id: z.string().min(1),
      baseRevision: z.number().int().min(1),
      name: z.string().optional(),
      parentId: z.string().nullable().optional(),
    },
  }, async (args: { id: string; baseRevision: number; name?: string; parentId?: string | null }) => {
    if (!writeAllowed(auth)) return readonlyError()
    try {
      return ok({ folder: service.updateFolder(userId, args.id, args) })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_folders_delete', {
    title: '删除目录',
    description: '删除目录；默认把笔记移到父目录，recursive=true 时连笔记一起移入回收站。',
    inputSchema: { id: z.string().min(1), recursive: z.boolean().optional() },
  }, async (args: { id: string; recursive?: boolean }) => {
    if (!writeAllowed(auth)) return readonlyError()
    try {
      service.deleteFolder(userId, args.id, { recursive: args.recursive })
      return ok({ deleted: true })
    } catch (error) {
      return failure(error)
    }
  })

  register('attachments_list', {
    title: '列出附件',
    description: '列出某条笔记的附件。',
    inputSchema: { noteId: z.string().min(1) },
  }, async (args: { noteId: string }) => {
    try {
      return ok({ attachments: service.listAttachments(userId, args.noteId) })
    } catch (error) {
      return failure(error)
    }
  })

  register('attachments_delete', {
    title: '删除附件',
    description: '按附件 id 删除附件。',
    inputSchema: { id: z.string().min(1) },
  }, async (args: { id: string }) => {
    if (!writeAllowed(auth)) return readonlyError()
    try {
      await service.deleteAttachment(userId, args.id)
      return ok({ deleted: true })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_daily', {
    title: '今日笔记',
    description: '获取或创建今天的日记笔记（标题为 YYYY-MM-DD，放在根目录或指定目录）。',
    inputSchema: { folderId: z.string().nullable().optional(), date: z.string().optional() },
  }, async (args: { folderId?: string | null; date?: string }) => {
    if (!writeAllowed(auth)) return readonlyError()
    try {
      const date = args.date && /^\d{4}-\d{2}-\d{2}$/u.test(args.date) ? args.date : new Date().toISOString().slice(0, 10)
      const matches = service.search(userId, date, { limit: 20 }).filter((result) => result.note.title === date)
      if (matches.length > 0) {
        return ok({ note: service.noteDetail(userId, matches[0].note.id), created: false })
      }
      const note = service.createNote(userId, {
        title: date,
        content: `# ${date}\n\n`,
        folderId: args.folderId ?? null,
      })
      return ok({ note, created: true })
    } catch (error) {
      return failure(error)
    }
  })

  register('notes_export_markdown', {
    title: '导出笔记 Markdown',
    description: '返回包含标题、正文、标签与附件链接的 Markdown 文本。',
    inputSchema: { id: z.string().min(1) },
  }, async (args: { id: string }) => {
    try {
      const note = service.noteDetail(userId, args.id)
      const attachments = note.attachments.map((attachment) => `- [${attachment.filename}](api/attachments/${attachment.id}) (${attachment.mime}, ${attachment.size} bytes)`).join('\n')
      return ok({ markdown: `${noteMarkdown(note)}${attachments ? `\n\n## 附件\n\n${attachments}\n` : ''}` })
    } catch (error) {
      return failure(error)
    }
  })

  // -- resources ------------------------------------------------------------

  server.registerResource(
    'notes-tree',
    'notes://tree',
    { title: '笔记目录', description: '当前账号的笔记目录 Markdown 大纲', mimeType: 'text/markdown' },
    async (uri) => {
      const tree = service.listTree(userId)
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: treeMarkdown(tree.folders, tree.notes) }] }
    },
  )

  server.registerResource(
    'notes-note',
    new ResourceTemplate('notes://note/{id}', { list: undefined }),
    { title: '笔记正文', description: '按 id 读取一条 Markdown 笔记', mimeType: 'text/markdown' },
    async (uri: URL, variables: { id?: string }) => {
      const id = String(variables.id ?? '')
      const note = service.noteDetail(userId, id)
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: noteMarkdown(note) }] }
    },
  )

  server.registerResource(
    'notes-recent',
    'notes://recent',
    { title: '最近笔记', description: '最近更新的笔记列表', mimeType: 'text/markdown' },
    async (uri) => {
      const tree = service.listTree(userId)
      const text = ['# 最近笔记', '', ...tree.notes.slice(0, 30).map((note) => `- ${note.title || '未命名笔记'} (${note.id}) — ${new Date(note.updatedAt).toISOString()}`)].join('\n')
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] }
    },
  )

  // -- prompts --------------------------------------------------------------

  server.registerPrompt('notes.summarize', {
    title: '总结笔记',
    description: '读取一条笔记并总结要点',
    argsSchema: { noteId: z.string().min(1) },
  }, async (args: { noteId: string }) => {
    const note = service.noteDetail(userId, args.noteId)
    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `请总结下面这条笔记的要点，并指出可以补充或整理的地方。\n\n${noteMarkdown(note)}`,
        },
      }],
    }
  })

  server.registerPrompt('notes.organize', {
    title: '整理目录',
    description: '根据当前目录树提出整理建议',
  }, async () => {
    const tree = service.listTree(userId)
    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `请根据下面的目录树提出笔记整理建议（不要删除内容，先给出方案）。\n\n${treeMarkdown(tree.folders, tree.notes)}`,
        },
      }],
    }
  })

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    void server.close().catch(() => undefined)
  }
  res.on('close', close)
  res.on('error', close)
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
  } finally {
    close()
  }
}

export type { NoteDetail }
