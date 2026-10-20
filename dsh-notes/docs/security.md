# 安全模型与加固清单

DSH Notes 的安全目标是：**即使服务端暴露在公网，攻击者也不能通过笔记端口获得账号、执行代码或写入可执行内容**；所有管理动作只能由拥有服务器本机访问权的人完成。

## 1. 威胁模型

| 威胁 | 防护 |
|---|---|
| 攻击者扫描端口、尝试直接连接数据库/管理接口 | 默认只监听 `127.0.0.1`；只有一个业务端口；无数据库 TCP 监听、无管理/调试端口；生产包不含 source map；建议反代 + 防火墙 + Tailscale |
| 暴力破解账号密码 | scrypt 哈希、统一错误、登录 IP 限速、账号连续失败锁定、scrypt 并发信号量（防内存 DoS） |
| 撞库/账号枚举 | 未知用户名也执行 dummy scrypt；错误信息统一；不返回用户是否存在 |
| 会话劫持/固定 | 随机会话 ID、登录轮换、HttpOnly + SameSite=Strict + TLS 时 Secure、绝对/空闲过期、CLI 可全撤销 |
| 令牌泄露 | 只存 SHA-256；可过期、可撤销、可只读；建议给 AI 单独签发；日志不记录令牌 |
| CSRF | SameSite=Strict + 写请求 `X-Notes-Request: 1` + Origin/Host 校验；Bearer 请求不走 Cookie |
| XSS | 客户端 DOMPurify 清洗；CSP 禁止内联脚本；服务端从不渲染用户 HTML；外链 rel=noopener |
| 上传木马/WebShell | 只允许图片/音频白名单；扩展名 + magic bytes 双检；拒绝 SVG/HTML/JS/可执行文件；附件在 Web 根目录外；鉴权路由 + nosniff + 明确 Content-Type；永不执行 |
| 路径遍历 | 附件只用 UUID 存储；静态文件 `realpath` + 根目录约束；拒绝 `..`、反斜杠、点文件；无目录列表 |
| SQL 注入 | 全部 prepared statement；LIKE 通配符转义 |
| 点击劫持/嗅探 | `X-Frame-Options: DENY`、CSP `frame-ancestors 'none'`、`nosniff`、`Referrer-Policy: no-referrer` |
| 资源耗尽/慢速攻击 | body/header/URL 上限、headers/request/keepAlive 超时、上传空闲超时、速率限制、分页上限 |
| 远程代码执行 | 服务端无 shell/`child_process`/动态插件加载/任意 URL 拉取；唯一 `new Function` 来自 MCP SDK 内 Ajv 对**静态工具 schema** 的编译，客户端不能提交 schema（见下） |
| 备份泄露 | 数据目录 0700、文件 0600（POSIX）；Windows 用专用账号 + NTFS ACL；备份含密码/令牌哈希，需同等保护 |

## 2. 账号与登录

- 密码：Node 内置 `scrypt`，`N=32768, r=8, p=1, keylen=64`，16 字节随机盐；格式 `scrypt$N$r$p$salt$hash`；常数时间比较。
- 密码策略：12–256 字符；拒绝纯数字、纯用户名；改密只能 `dsh-notes-server user passwd`。
- 账号只能通过服务器本机 CLI：
  ```bash
  dsh-notes-server user add alice
  dsh-notes-server user passwd alice
  dsh-notes-server user disable alice
  dsh-notes-server user remove alice --yes --purge
  ```
- **不存在** `/api/register`、`/api/users` 写操作、`/api/password`、`/api/tokens` 等 HTTP 管理端点；测试会断言这些路径返回 404。
- 登录失败按 IP 限速：5 次/分钟、20 次/小时；账号连续 10 次失败锁定 15 分钟；返回 429 + `Retry-After`。
- 未知用户也执行一次 dummy scrypt，避免时序枚举。
- 改密默认撤销该用户全部会话与令牌（`--keep-tokens` 可保留，文档不推荐）。

## 3. 会话与访问令牌

### 会话（浏览器）

- 32 字节随机会话 ID；数据库只存 SHA-256；Cookie 只放原始 ID。
- Cookie：`HttpOnly`、`SameSite=Strict`、TLS 时 `Secure`、`Path=<basePath>/`。
- 绝对 30 天、空闲 7 天；登录时轮换；登出删除；CLI 可撤销全部/按用户。

### 访问令牌（DSH 插件 / MCP / 自动化）

- 格式 `dshn_<id>_<secret>`；数据库只存 SHA-256，不存明文。
- 绑定用户；`read` 或 `read,write` scope；可设过期；可随时撤销；记录最后使用时间。
- 创建时只打印一次：
  ```bash
  dsh-notes-server token create --user alice --name dsh-plugin
  dsh-notes-server token create --user alice --name ai-notes --read-only
  dsh-notes-server token list --user alice
  dsh-notes-server token revoke <id|prefix>
  ```
- 插件设置只保存令牌，不保存账号密码。MCP 端点只接受 Bearer（会话 Cookie 不够）。
- 建议：
  - 给 DSH 插件签 `dsh-plugin` 令牌；
  - 给 AI 单独签 `ai-notes` 令牌，异常时单独撤销；
  - 只读 AI 使用 `--read-only`。

## 4. CSRF / Origin / 代理

- 所有写请求（登录、退出、笔记、文件夹、附件、设置）在 Cookie 认证下要求 `X-Notes-Request: 1`；Web SPA 自动发送。
- 请求带 `Origin` 时必须是同源或配置的 `--public-url`；跨源写请求 403。
- 反向代理必须传递 `Host`、`X-Forwarded-Proto`、`X-Forwarded-For`。
- 只有 `--trusted-proxy` 列出的地址才会被信任读取 `X-Forwarded-*`；Docker 内部网络可用 `--trusted-proxy '*'`，前提是**不发布 notes 端口**。
- 公网明文监听会被拒绝：非回环 `--host` 必须配合 TLS 或 `--behind-proxy`；`--insecure-http` 仅用于受控内网测试并会打印警告。

## 5. 上传与附件

允许的 MIME（扩展名 + magic bytes）：

- 图片：png、jpeg、gif、webp、avif
- 音频：mpeg/mp3、wav、ogg/oga/opus、flac、mp4/m4a、aac、webm

明确拒绝：

- SVG（可含脚本）、HTML、JavaScript、可执行文件、MIME 不匹配、空文件、超限文件。
- 用户文件名不参与磁盘路径；磁盘名是 UUID；显示名仅清洗后存元数据。
- 附件目录位于 Web 根目录之外；只通过 `/api/attachments/<id>`（需鉴权）读取；响应带 `nosniff`、明确 `Content-Type`、`Content-Disposition`、`Cache-Control: private`。
- 支持 Range（音频拖动）；只允许图片/音频内联，其余强制 attachment。
- 单文件默认 50MB（`--max-upload-mb`）；MCP base64 附件工具上限 20MB。
- 永久删除笔记时删除附件文件；普通删除只进回收站。

## 6. 代码执行面

服务端设计上没有：

- `child_process` / shell / `exec` / `spawn`；
- `vm`、动态插件加载、`eval`；
- 任意 URL 拉取（无 SSRF 面）；
- 从用户上传内容执行任何东西。

**唯一例外**：MCP SDK 的 Ajv 校验器在启动/工具注册时使用 `new Function` 编译**静态**工具参数/输出 schema。schema 由服务端代码固定，MCP 客户端只能提交参数值，不能提交 schema，因此不构成远程代码执行路径。`scripts/check.mjs` 会扫描 bundle 并对该例外给出警告；其余危险 API 出现即失败。

## 7. 网络安全与端口暴露

### 默认策略

- `127.0.0.1:8787`；不监听 `0.0.0.0`。
- 单端口同时提供 Web、API、SSE、MCP；没有数据库/管理/调试端口。
- 生产构建不含 source map。
- `/healthz` 无鉴权只返回 `{"ok":true}`；`/api/health` 必须鉴权。
- 支持 `--socket`（Linux/POSIX）：Caddy/Nginx → Unix Socket，完全不占 TCP 端口。
- Windows 使用回环 TCP；不承诺命名管道。

### 公网部署

- 推荐 Caddy 自动 HTTPS，或 Nginx + Let's Encrypt；**只开放 80/443**。
- 8787 只允许本机/内网；Docker Compose 中 notes 服务不发布端口。
- 更推荐 Tailscale/WireGuard 内网访问，不直接公网暴露。
- Windows 防火墙应阻止 8787 入站。
- 反代配置示例：
  - Caddy：`deploy/caddy/Caddyfile`
  - Nginx：`deploy/nginx/dsh-notes.conf`
  - Docker：`deploy/docker/compose.yaml`
- systemd 加固：`NoNewPrivileges`、`ProtectSystem=strict`、`ProtectHome`、`PrivateTmp`、`PrivateDevices`、`RestrictAddressFamilies`、空 capability、`ReadWritePaths` 仅数据目录。
- Docker 加固：非 root、只读根文件系统、tmpfs `/tmp`、`no-new-privileges`、`cap_drop: ALL`、无发布端口。
- Windows：专用本地账号、NTFS ACL、计划任务/NSSM/WinSW；不要用管理员日常账号运行。

### 端口检查清单

- [ ] 公网只开放 443（80 仅跳转）。
- [ ] 8787 只绑定 127.0.0.1 或仅容器内部网络。
- [ ] 没有数据库/管理/调试端口。
- [ ] 反向代理传递 `Host` / `X-Forwarded-Proto` / `X-Forwarded-For`。
- [ ] TLS 1.2+，HSTS 已启用。
- [ ] 防火墙/安全组只允许必要来源。
- [ ] 生产包无 source map。
- [ ] 日志中没有密码/令牌/Cookie/正文。
- [ ] 备份目录权限 0600/0700 或 NTFS ACL。
- [ ] 已撤销不再使用的令牌/会话。

## 8. 安全响应头

服务端统一设置：

- `Content-Security-Policy`（禁止内联脚本；`frame-ancestors 'none'`；`object-src 'none'`）
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy`（禁用地理位置/摄像头/麦克风/支付）
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- HTTPS 时 `Strict-Transport-Security`
- 不返回 `X-Powered-By`；错误响应不包含堆栈/路径/SQL。

## 9. 安全测试

`npm test` / `npm run test:e2e` 覆盖：

- 注册/用户/令牌管理端点 404；账号只能 CLI 创建。
- 未知用户/错误密码统一 401；登录限速 429。
- 会话 Cookie 标志、CSRF 缺失 403、跨源 403。
- 只读令牌写 403、撤销令牌 401。
- 上传：SVG/HTML/JS/伪造 PNG 拒绝；文件名路径字符清洗；超限 413；Range 206。
- 静态路径遍历/源码泄露/目录列表拒绝。
- 安全响应头、令牌/密码不入日志。
- 非回环明文监听拒绝。
- MCP：未认证 401、只读 403、输入校验错误、资源/提示词。
- DSH 插件：不新增端口、host 路由受 DSH connection 保护、离线/冲突/同步。

## 10. 事件响应

账号或令牌可能泄露时：

```bash
# 1. 撤销该用户全部会话和令牌（或改密，默认同时撤销）
dsh-notes-server user passwd alice
# 或只撤销令牌/会话
dsh-notes-server token revoke <id|prefix>
dsh-notes-server session revoke --user alice

# 2. 暂时禁用账号
dsh-notes-server user disable alice

# 3. 检查日志中的登录失败、 IP、令牌使用、删除事件
# 4. 检查数据目录/备份是否被异常访问
# 5. 如主机可能失陷：停服、隔离主机、从可信备份恢复、轮换所有账号/令牌
```

- 怀疑附件被篡改：附件不可变（按 ID），从备份恢复或删除该附件。
- 怀疑数据库被改：停服，用最近的 `backup` 恢复；重新签发令牌。
- 不要通过公网端口做任何账号管理；CLI 需要服务器本机/SSH 权限。
