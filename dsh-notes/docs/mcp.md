# MCP 与 AI 工具

DSH Notes 提供两套面向 AI 的接口：

1. **DSH 原生工具**：插件加载后自动注册 `notes_*`，DSH 模型无需 MCP 配置即可调用。
2. **标准 MCP 端点**：服务端 `https://notes.example.com/mcp`（Streamable HTTP），任何 MCP 客户端可接入。

两者共享同一个 NotesService/数据模型；原生工具额外走 DSH 本地缓存与同步队列。

## 1. MCP 端点

- URL：`https://notes.example.com/mcp`（子路径部署则 `.../notes/mcp`）。
- 传输：Streamable HTTP（无状态；每个请求独立）。
- 认证：`Authorization: Bearer dshn_xxx`；**会话 Cookie 不够**，未认证返回 401 + `WWW-Authenticate: Bearer`。
- 令牌 scope：`read` 只读；`read,write` 可写。只读令牌调用写工具返回 `isError`。
- 限流：120 请求/分钟/令牌；请求体上限 4MB。
- 不提供任意文件路径读取、shell、URL 抓取；附件按 id 或 base64。

创建专用令牌：

```bash
dsh-notes-server token create --user alice --name ai-notes
dsh-notes-server token create --user alice --name ai-readonly --read-only
```

## 2. DSH mcp-client 配置

```yaml
- id: mcp-notes
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: notes
    transport: streamable-http
    url: https://notes.example.com/mcp
    headers:
      Authorization: !!js '`Bearer ${process.env.DSH_NOTES_TOKEN}`'
```

或使用 `dsh-scoped-mcp` 把它放进某个 workspace 的 `.dsh/mcp.yml`。模型看到的工具名是 `mcp__notes__notes_search` 等。

## 3. 工具

### 读取

| 工具 | 参数 | 说明 |
|---|---|---|
| `notes_tree` | — | 目录树 + Markdown 大纲 |
| `notes_list` | `folderId?`, `limit?` | 列出元数据；`root` 表示根目录 |
| `notes_get` | `id` | 正文、标签、附件、revision |
| `notes_search` | `q`, `tag?`, `folderId?`, `limit?` | 标题/正文搜索 + 片段 |
| `notes_recent` | `limit?` | 最近更新 |
| `notes_stats` | — | 笔记/目录/附件/待同步/冲突数量 |
| `notes_history` | `id` | 历史版本列表 |
| `notes_export_markdown` | `id` | 带标题/标签/附件链接的 Markdown |

### 写入

| 工具 | 参数 | 说明 |
|---|---|---|
| `notes_create` | `title?`, `content?`, `folderId?`, `tags?`, `pinned?`, `id?` | 创建 |
| `notes_update` | `id`, `baseRevision`, `title?`, `content?`, `tags?`, `pinned?`, `folderId?` | 更新；冲突返回错误 |
| `notes_append` | `id`, `content`, `separator?` | 末尾追加 |
| `notes_replace` | `id`, `oldText`, `newText`, `all?` | 替换文本；找不到 oldText 报错 |
| `notes_move` | `id`, `folderId`, `baseRevision` | 移动 |
| `notes_delete` | `id` | 移入回收站 |
| `notes_restore` | `id` | 从回收站恢复 |
| `notes_restore_version` | `id`, `revision` | 恢复到历史版本 |
| `notes_folders_create` | `name`, `parentId?`, `id?` | 创建目录 |
| `notes_folders_update` | `id`, `name?`, `parentId?`, `baseRevision?` | 重命名/移动目录 |
| `notes_folders_delete` | `id`, `recursive?` | 删除目录 |
| `attachments_list` | `noteId` | 附件列表 |
| `attachments_delete` | `id` | 删除附件 |
| `notes_daily` | `date?`, `folderId?` | 获取/创建今日日记 |

DSH 原生工具额外提供：

| 工具 | 说明 |
|---|---|
| `notes_sync` | 立即把本地修改同步到服务器并拉取远端 |
| `notes_sync_status` | 同步状态、待同步、冲突 |
| `attachments_add` | base64 上传图片/音频（≤20MB），返回 Markdown 链接 |

### 附件写法

```markdown
![截图](api/attachments/<attachment-id>)
[录音](api/attachments/<attachment-id>)
```

Web/DSH 预览会把它解析为鉴权 URL；导出会改成绝对 URL。

## 4. 资源

| URI | 内容 |
|---|---|
| `notes://tree` | 当前账号目录树（Markdown） |
| `notes://note/{id}` | 单条笔记 Markdown |
| `notes://recent` | 最近笔记列表 |

`resources/list` 会列出静态资源；`notes://note/{id}` 是资源模板，需要 `resources/templates/list` + `resources/read`。

## 5. 提示词

| 名称 | 说明 |
|---|---|
| `notes.summarize` | 读取一条笔记并总结要点 |
| `notes.organize` | 根据目录树提出整理建议 |

## 6. 示例（SDK 客户端）

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const transport = new StreamableHTTPClientTransport(
  new URL('https://notes.example.com/mcp'),
  { requestInit: { headers: { Authorization: `Bearer ${process.env.DSH_NOTES_TOKEN}` } } },
)
const client = new Client({ name: 'my-ai', version: '1.0.0' })
await client.connect(transport)

const tools = await client.listTools()
const created = await client.callTool({
  name: 'notes_create',
  arguments: { title: '会议纪要', content: '# 会议纪要\n\n- 事项', tags: ['工作'] },
})
const tree = await client.readResource({ uri: 'notes://tree' })
await client.close()
```

## 7. 工具使用约定

- **先读后写**：写之前用 `notes_get` 拿 `revision`，`notes_update` 带 `baseRevision`。冲突时重新读取，不要盲覆盖。
- **append 适合长文**：AI 逐段写笔记时用 `notes_append`，避免每次都传全文。
- **replace 适合修订**：明确 `oldText`，失败说明上下文已变。
- **目录与标签**：先 `notes_tree`，复用已有目录/标签，避免创建重复结构。
- **附件**：优先 `api/attachments/<id>` 引用；AI 生成图片可用 `attachments_add` base64。
- **离线**：DSH 原生工具写入本地缓存并返回 `synced:false` 时，稍后用 `notes_sync`/`notes_sync_status` 确认；MCP 直连服务器则立即写入。
- **删除**：默认进回收站；永久删除只能通过 HTTP `?permanent=1`（MCP 未暴露，避免误删）。

## 8. 调试

```bash
# 未认证应返回 401
curl -i -X POST https://notes.example.com/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# 带令牌
curl -s -X POST https://notes.example.com/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

DSH 插件侧可用 `notes_sync_status` 查看待同步/冲突；网页/插件 UI 也有同样的状态。
