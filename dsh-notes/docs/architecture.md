# 架构与同步设计

## 1. 组件

| 组件 | 位置 | 职责 |
|---|---|---|
| NotesService | `src/server/service.ts` | 账号、目录、笔记、版本、回收站、附件、变更日志、幂等 |
| SQLite | `dataDir/notes.db` | 单文件数据库；WAL；`busy_timeout` |
| HTTP / Web | `src/server/http.ts` | API、SSE、静态 SPA、鉴权、CSRF、限流、附件流 |
| MCP | `src/server/mcp/server.ts` | Streamable HTTP、工具/资源/提示词 |
| CLI | `src/server/cli.ts` | 账号/令牌/会话/备份、serve |
| Web SPA | `src/web` | 账号密码登录、目录树、编辑器、预览、附件 |
| DSH host | `src/host` | 本地 SQLite 缓存、同步引擎、同源路由、AI 工具 |
| DSH client | `src/client` | 活动栏入口、笔记页面、同步/冲突/设置 UI |
| Shared UI | `src/shared/ui` | 共享组件、编辑器命令、Markdown 渲染、样式 |

DSH host 不打开监听端口；它把 `/dsh-notes` 路由挂到 DSH 现有 Web 服务，并经过 `ctx.connection.requestRejection`。DSH client 只通过 host 路由访问数据，永远看不到远端令牌。

## 2. 数据模型

```sql
users(id, username UNIQUE, display_name, password_hash, disabled, ...)
sessions(id_hash PK, user_id, created_at, last_used_at, idle_expires_at, expires_at, ...)
access_tokens(id PK, user_id, name, token_hash UNIQUE, prefix, scopes, expires_at, revoked_at, ...)
folders(id PK, owner_id, parent_id, name, sort_order, revision, ...)
notes(id PK, owner_id, folder_id, title, content, tags, pinned, revision,
      created_at, updated_at, created_by, updated_by, deleted_at)
note_tags(note_id, tag)
note_versions(note_id, revision, title, content, tags, created_by, created_at)
attachments(id PK, note_id, owner_id, filename, mime, size, sha256, storage_key, created_at, deleted_at)
changes(seq AUTOINCREMENT, user_id, entity, entity_id, action, revision, data, at)
operations(op_id PK, user_id, entity, entity_id, at)
```

- 每个查询按 `owner_id` 隔离；跨账号返回 404。
- 每次变更在事务内写业务表 + `changes` + 版本/幂等记录。
- `changes.data` 是元数据 JSON（不含正文），用于增量同步。
- `revision` 每次更新单调 +1；`note_versions` 保留最近 N 个（默认 50）。
- 变更/回收站有保留期限；永久删除会清理附件文件与历史。

## 3. 服务端请求流

```text
HTTP request
  → security headers / URL & header limits
  → basePath strip
  → /healthz | /mcp | /api/* | static
  → auth (Bearer or session cookie)
  → CSRF + Origin (cookie writes)
  → rate limit
  → route handler
  → NotesService (prepared SQL, owner-scoped)
  → changes emit → SSE broadcast
  → JSON / stream
```

- 上传附件：原始字节 → 临时文件 + sha256 + 大小限制 → magic bytes 校验 → 移动到 `attachments/ab/<id>` → DB 元数据。
- 附件下载：鉴权 → 文件 stat → Range → `createReadStream`。
- 任何异常：统一 `{ok:false,error}`，不泄露堆栈；日志不含正文/密钥。

## 4. 本地缓存（DSH）

```sql
notes(id, folder_id, title, content, tags, pinned, created_at, updated_at,
      server_updated_at, local_revision, server_revision, deleted, deleted_at,
      dirty, conflict, body_loaded)
folders(id, parent_id, name, sort_order, server_revision, local_revision, dirty, deleted)
attachments(id, note_id, filename, mime, size, created_at)
conflicts(note_id PK, local_*, server_*, base_revision, server_revision, created_at)
recent(note_id PK, opened_at)
meta(key, value)  -- serverId, userId, cursor, lastSyncAt, op:<entity>:<id>
```

- 编辑立即写本地（200–300ms 防抖），`dirty=1`。
- 读取优先本地；正文未缓存时按需拉取，`body_loaded` 标记。
- 缓存目录按服务器 URL 哈希隔离：`$DSH_HOME/notes/instances/<hash>/`，切换服务器不串数据。
- `$DSH_HOME` 在 Windows 为 `%USERPROFILE%\.dsh`，Linux 为 `~/.dsh`。

## 5. 同步算法

采用 **dirty 状态 + 增量游标**，不是简单 outbox。

### Pull

1. 无游标或服务器 ID 变化 → `GET /api/sync/bootstrap`。
2. 否则 `GET /api/changes?since=<cursor>`，循环到 `hasMore=false`。
3. 对每个变更：
   - 本地干净 → 更新元数据/正文缓存（正文按需）。
   - 本地 dirty 且远端 revision 变了 → 拉远端正文，写 `conflicts`，暂停该笔记推送。
   - 远端删除且本地 dirty → 冲突（服务器版本视为已删除）。
   - 本地没有 → 新增缓存。
4. 更新游标与 `serverId`/`userId`/`serverVersion`。

### Push

1. 先推目录（创建/更新/删除）。
2. 再推已删除笔记（DELETE）。
3. 再推 dirty 笔记：
   - `server_revision` 为空 → POST 创建（客户端预生成 ID + `opId`）。
   - 否则 PATCH 更新（`baseRevision=server_revision` + `opId`）。
   - 409 → 取服务端当前笔记，写冲突，继续其他笔记。
   - 404 → 标记未同步，下一轮重新创建。
4. 成功后更新 `server_revision`、清除 dirty。
5. 再 pull 一次，采纳服务器 revisions/其他设备变更。

### 触发

- 启动、页面打开、手动「同步」、每 `autoSyncSeconds`（默认 60s）、编辑后 2.5s 快速 flush（可关）、网络恢复。
- 同一时刻只允许一个 sync；失败指数退避（15s→30s→60s，上限 5 分钟）。
- 状态：`unconfigured | idle | syncing | pending | offline | conflict | error`。

### 冲突三种解决

| 策略 | 行为 |
|---|---|
| 采用服务器 | 丢弃本地 dirty，写入服务器内容/revision |
| 保留本地 | 以服务器当前 revision 作为新 base，保留本地内容并重新推送 |
| 另存副本 | 新建一条本地笔记保存本地内容；原笔记采用服务器版本 |

冲突不会静默覆盖；AI 工具返回结构化冲突，网页显示重新加载/覆盖/副本，DSH 显示 diff。

## 6. 安全边界

- 服务端：无 shell/子进程/动态插件/URL 拉取；上传内容永不执行；唯一 `new Function` 是 MCP SDK/Ajv 对静态 schema 的编译，客户端不能提交 schema。
- 网络：默认回环；非回环必须 TLS/反代；单端口；支持 Unix Socket；无管理端口。
- 账号：CLI-only；无注册/网页改密；scrypt；登录限速/锁定；会话/令牌可撤销。
- 数据：owner_id 隔离；附件在 Web 根之外；路径只用 UUID；SQL 全 prepared。
- DSH：host 路由受 DSH connection 鉴权；插件不新增端口；令牌只在 host 进程。

## 7. 跨平台

- 纯 JS，无原生模块；同一份 `server/lib/server.js` 可在 Windows/Linux/Debian 运行。
- 路径全部 `path.join/resolve`；附件 storage key 使用 UUID 短路径。
- 原子写 + Windows rename 重试；SQLite WAL + busy timeout。
- POSIX 0700/0600 + systemd 加固；Windows NTFS ACL + 专用账号。
- 信号：SIGINT/SIGTERM/SIGBREAK；服务停止时 checkpoint WAL。
- 日志：`--log-file` 轮转；Linux 优先 journald。
- 备份：SQLite `backup()` 热备 + `fs.cp` 附件；跨平台。

## 8. 扩展点

- 新增 MCP/原生工具：在 `src/server/mcp/server.ts` 与 `src/host/tools.ts` 增加同名工具，复用 NotesService/host 方法。
- 新附件类型：扩展 `src/server/mime.ts` 白名单 + magic；同步更新前端 accept 与预览。
- 新平台：`src/server/platform.ts` 路径/权限/重试；不改业务层。
- 多用户共享/协作：当前 schema 已有 `owner_id`，可引入 `note_shares` 与权限层；v1 不实现。
