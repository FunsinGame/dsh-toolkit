# HTTP API

Base：`https://notes.example.com/api`（也可用 `/notes` 子路径，配置 `--base-path`）。

## 1. 响应格式

成功：

```json
{ "ok": true, "note": { "...": "..." } }
```

失败：

```json
{ "ok": false, "error": { "code": "REVISION_CONFLICT", "message": "笔记已被其他设备修改" } }
```

常见状态码：400 参数错误、401 未认证、403 CSRF/只读/来源拒绝、404 不存在、409 冲突、413 过大、415 类型不允许、429 限流、500 内部错误。

## 2. 认证

### 2.1 网页登录（账号密码）

```bash
curl -i -X POST https://notes.example.com/api/auth/login \
  -H 'content-type: application/json' \
  -H 'x-notes-request: 1' \
  -d '{"username":"alice","password":"..."}'
```

返回 `Set-Cookie: dsh_notes_session=...; HttpOnly; SameSite=Strict; Path=/`。后续浏览器请求自动携带 Cookie。

- 登录失败统一 401。
- 失败过多返回 429 + `Retry-After`。
- **没有注册/找回密码/改密端点**。

### 2.2 访问令牌（插件/MCP/自动化）

```bash
curl https://notes.example.com/api/tree \
  -H "Authorization: Bearer dshn_xxx"
```

令牌由服务器 CLI 创建：`dsh-notes-server token create --user alice --name dsh-plugin`。可加 `--read-only`。

### 2.3 CSRF

Cookie 认证的写请求必须带：

```text
X-Notes-Request: 1
```

且 `Origin`（如有）必须是同源或 `--public-url` 配置的来源。Bearer 请求不需要 CSRF 头。

## 3. 健康检查

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/healthz` | 无鉴权，仅 `{"ok":true}` |
| GET | `/api/health` | 需鉴权；版本、serverId、计数、当前用户 |

## 4. 账号/会话

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | `{username,password}` → 会话 Cookie |
| POST | `/api/auth/logout` | 删除会话 |
| GET | `/api/auth/session` | 当前用户；Bearer 时返回 scopes |

没有 `/api/register`、`/api/users` 写、`/api/password`、`/api/tokens` 等管理端点。

## 5. 目录与笔记

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/tree` | 当前账号的 folders + notes 元数据 |
| GET | `/api/notes/:id` | 笔记正文、标签、附件、revision |
| POST | `/api/notes` | 创建；可带客户端 id / `opId` |
| PATCH | `/api/notes/:id` | 更新；必须带 `baseRevision` |
| DELETE | `/api/notes/:id` | 软删除到回收站 |
| POST | `/api/notes/:id/restore` | 恢复 |
| DELETE | `/api/notes/:id?permanent=1` | 永久删除（含附件） |
| POST | `/api/notes/:id/move` | `{folderId,baseRevision}` |
| GET | `/api/trash` | 回收站 |
| GET | `/api/search?q=&tag=&folderId=&limit=` | 标题/正文搜索 |
| GET | `/api/notes/:id/versions` | 历史版本列表 |
| GET | `/api/notes/:id/versions/:revision` | 版本正文 |
| POST | `/api/notes/:id/revert` | `{revision}` 生成新 revision |
| POST | `/api/folders` | 创建目录 |
| PATCH | `/api/folders/:id` | 重命名/移动 |
| DELETE | `/api/folders/:id?recursive=1` | 删除目录（默认把笔记移到父级） |

### 创建

```bash
curl -X POST https://notes.example.com/api/notes \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"folderId":null,"title":"想法","content":"# 想法\n\n内容","tags":["灵感"],"opId":"create-1"}'
```

### 更新与冲突

```bash
# 先 GET 拿 revision
curl -X PATCH https://notes.example.com/api/notes/<id> \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"baseRevision":3,"content":"# 新内容","opId":"update-1"}'
```

版本不匹配返回 409，且响应含 `current`：

```json
{
  "ok": false,
  "error": { "code": "REVISION_CONFLICT", "message": "笔记已被其他设备修改" },
  "current": { "id": "...", "revision": 4, "content": "..." }
}
```

不要忽略 409；客户端应重新读取、合并或显式覆盖。

### 幂等

创建/更新/删除支持 `opId`。网络超时后用同一个 `opId` 重试，不会重复创建或重复递增 revision。

## 6. 附件

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/notes/:id/attachments` | 原始字节上传 |
| GET | `/api/notes/:id/attachments` | 附件列表 |
| GET | `/api/attachments/:id` | 下载/预览；支持 Range |
| DELETE | `/api/attachments/:id` | 删除 |

上传请求：

```bash
curl -X POST https://notes.example.com/api/notes/<note-id>/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: image/png' \
  -H "x-file-name: $(python -c 'import urllib.parse;print(urllib.parse.quote("pixel.png"))')" \
  --data-binary @pixel.png
```

返回：

```json
{
  "ok": true,
  "attachment": { "id": "...", "noteId": "...", "filename": "pixel.png", "mime": "image/png", "size": 70, "createdAt": 0 },
  "markdown": "![pixel.png](api/attachments/<id>)"
}
```

正文中用 `api/attachments/<id>` 引用；Web/DSH/导出会解析成实际地址。只允许图片/音频白名单；SVG/HTML/JS 会被拒绝（415）。

## 7. 同步

面向 DSH 插件的增量接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/changes?since=<seq>&limit=500` | 增量变更（仅当前账号） |
| GET | `/api/sync/bootstrap` | 全量元数据 + 当前游标 |

变更行：

```json
{
  "seq": 42,
  "entity": "note",
  "id": "...",
  "action": "upsert",
  "revision": 3,
  "data": { "title": "...", "folderId": null, "tags": [], "pinned": false, "updatedAt": 0 },
  "at": 0
}
```

- `entity`：`note` / `folder` / `attachment`。
- `action`：`upsert` / `delete`。
- 游标过期会返回 `SYNC_CURSOR_EXPIRED`（410），客户端应重新 bootstrap。
- 同步推送用 `baseRevision`，冲突不覆盖；由 UI/工具解决。

## 8. SSE

`GET /api/events`（Cookie 认证）返回：

```text
event: hello
data: {"userId":"...","time":0}

event: change
data: {"seq":42,"entity":"note","id":"...","action":"upsert","revision":3,...}
```

仅作失效通知；可靠增量仍用 `/api/changes`。反代需关闭缓冲。

## 9. 导出

```bash
curl https://notes.example.com/api/export/note/<id>.md \
  -H "Authorization: Bearer $TOKEN" -o note.md
```

附件链接会改写为绝对 URL。

## 10. MCP

`POST /mcp`（Bearer）是标准 MCP Streamable HTTP 端点，不是普通 REST。见 [MCP 文档](mcp.md)。

## 11. 命令示例（PowerShell）

```powershell
$token = "dshn_xxx"
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod https://notes.example.com/api/tree -Headers $headers
Invoke-RestMethod https://notes.example.com/api/notes -Method Post -Headers $headers `
  -ContentType 'application/json' -Body (@{ title = '想法'; content = '# 想法' } | ConvertTo-Json)
```
