# Windows 部署

适用于 Windows 10/11、Windows Server 2019+（x64/arm64）。服务端是纯 JavaScript，**不需要 Visual Studio、Python 或任何原生编译工具**；只需要 Node.js 24+。

## 1. 安装 Node.js 24

- 从 Node.js 官网安装 64 位 MSI，或使用 zip 版并把 `node.exe` 加入 PATH。
- 验证：
  ```powershell
  node -v
  node -e "require('node:sqlite'); console.log('node:sqlite ok')"
  ```

## 2. 解压服务端

把 `dsh-notes-server-0.1.0.zip` 解压到例如 `C:\dsh-notes`：

```text
C:\dsh-notes\
  server\bin.js
  server\lib\server.js
  web\
  deploy\
  package.json
```

也可以全局安装 tgz：

```powershell
npm install -g .\dsh-notes-0.1.0.tgz
dsh-notes-server version
```

> 全局安装后**不要**再执行 `node .\server\bin.js`：当前目录没有 `server\`。请把后文的
> `node .\server\bin.js` 替换为 `dsh-notes-server`；或在任意 PowerShell 目录使用：
>
> ```powershell
> $cli = Join-Path (npm root -g) 'dsh-notes\server\bin.js'
> node $cli version
> node $cli user add alice --data-dir C:\ProgramData\dsh-notes
> ```
>
> 如果提示找不到 `dsh-notes-server`，用 `Get-Command dsh-notes-server` 检查，
> 或把 `npm prefix -g` 下的 `dsh-notes-server.cmd` 所在目录加入 PATH。

## 3. 创建数据目录与专用账号

以管理员 PowerShell 执行：

```powershell
New-Item -ItemType Directory -Force C:\ProgramData\dsh-notes
New-Item -ItemType Directory -Force C:\ProgramData\dsh-notes\logs

# 可选：创建专用本地账号（推荐）
$pw = Read-Host -AsSecureString "Service account password"
New-LocalUser -Name "dsh-notes" -Password $pw -PasswordNeverExpires -UserMayNotChangePassword
Add-LocalGroupMember -Group "Users" -Member "dsh-notes"   # 如使用 NSSM，可改为授予“作为服务登录”

# 只允许服务账号、Administrators、SYSTEM 访问数据目录
icacls C:\ProgramData\dsh-notes /inheritance:r
icacls C:\ProgramData\dsh-notes /grant:r "dsh-notes:(OI)(CI)F" "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F"
```

> Windows 不依赖 Unix 的 0700/0600 mode bits；安全边界是 NTFS ACL + 专用账号。不要把数据目录放在任何人都可读的共享目录。

## 4. 创建账号与令牌（只能本机执行）

```powershell
cd C:\dsh-notes
node .\server\bin.js init --data-dir C:\ProgramData\dsh-notes
node .\server\bin.js user add alice --data-dir C:\ProgramData\dsh-notes
node .\server\bin.js token create --user alice --name dsh-plugin --data-dir C:\ProgramData\dsh-notes
```

- 密码交互输入（不回显），至少 12 位；自动化可用 `--password-stdin`，不要把密码写进命令历史。
- 令牌只显示一次，立即存进密码管理器。
- 网页/插件没有注册/改密入口。

## 5. 启动

前台测试：

```powershell
node .\server\bin.js serve `
  --data-dir C:\ProgramData\dsh-notes `
  --host 127.0.0.1 --port 8787 `
  --log-level info `
  --log-file C:\ProgramData\dsh-notes\logs\server.log
```

打开 `http://127.0.0.1:8787` 用账号密码登录。默认只监听回环，局域网/公网都无法直接访问 8787。

也可以使用 `deploy\windows\start-server.cmd`（已处理 UTF-8 控制台与日志路径）。

## 6. 作为服务运行

### 方案 A：计划任务（无第三方依赖）

管理员 PowerShell：

```powershell
cd C:\dsh-notes
.\deploy\windows\install-task.ps1 -TaskName dsh-notes -DataDir C:\ProgramData\dsh-notes
Start-ScheduledTask -TaskName dsh-notes
```

脚本默认以 `SYSTEM` 运行；生产环境建议改用专用账号，并确保该账号有“作为服务登录”权限与数据目录 ACL。

### 方案 B：NSSM / WinSW（推荐）

以 NSSM 为例：

```powershell
nssm install dsh-notes "C:\Program Files\nodejs\node.exe"
nssm set dsh-notes AppParameters "C:\dsh-notes\server\bin.js serve --data-dir C:\ProgramData\dsh-notes --host 127.0.0.1 --port 8787 --log-level info --log-file C:\ProgramData\dsh-notes\logs\server.log"
nssm set dsh-notes AppDirectory "C:\dsh-notes"
nssm set dsh-notes AppStdout "C:\ProgramData\dsh-notes\logs\service.out.log"
nssm set dsh-notes AppStderr "C:\ProgramData\dsh-notes\logs\service.err.log"
nssm set dsh-notes Start SERVICE_AUTO_START
nssm start dsh-notes
```

WinSW 同理：把 `node.exe` 与参数写进 XML，设置自动启动、失败重启、日志路径。

## 7. HTTPS 与端口暴露

不要直接开放 8787。推荐：

1. 安装 Caddy for Windows（或 Nginx for Windows）。
2. 让 Caddy 监听 443，反代到 `127.0.0.1:8787`。
3. 用 NSSM/WinSW 把 Caddy 也注册为服务。
4. 防火墙阻止 8787 入站，只允许 80/443。

Caddyfile 示例（与 `deploy/caddy/Caddyfile` 相同）：

```caddy
notes.example.com {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "no-referrer"
	}
	reverse_proxy 127.0.0.1:8787 {
		flush_interval -1
	}
}
```

防火墙（管理员 PowerShell）：

```powershell
New-NetFirewallRule -DisplayName "DSH Notes HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
New-NetFirewallRule -DisplayName "DSH Notes Block 8787" -Direction Inbound -Protocol TCP -LocalPort 8787 -Action Block
```

如果使用 Caddy，把 `--behind-proxy --trusted-proxy 127.0.0.1` 加进服务参数，并设置 `DSH_NOTES_PUBLIC_URL=https://notes.example.com`。Caddy 与 notes 在同机时 trusted proxy 是 127.0.0.1。

## 8. 反向代理后的安全参数

推荐启动参数：

```text
serve --data-dir C:\ProgramData\dsh-notes --host 127.0.0.1 --port 8787
      --behind-proxy --trusted-proxy 127.0.0.1
      --public-url https://notes.example.com
      --log-level info --log-file C:\ProgramData\dsh-notes\logs\server.log
```

- `--behind-proxy` 让 Secure Cookie 依据 `X-Forwarded-Proto`。
- `--trusted-proxy` 只信任 Caddy/Nginx 的地址，防止伪造 `X-Forwarded-For`。
- 如果 Caddy 在另一台机器/Docker 网络，显式填写其地址；Docker 内部可用 `*`（前提是 notes 端口不发布）。

## 9. 备份

```powershell
node .\server\bin.js backup --data-dir C:\ProgramData\dsh-notes --out D:\backups\dsh-notes
```

- 先把 SQLite WAL checkpoint 并做一致性备份，再复制 `attachments/`。
- 备份包含密码哈希与令牌哈希，仍需 ACL 保护；不要上传到公开网盘。
- 计划任务可每天运行一次，保留 7–30 天。

## 10. 升级

1. 停止服务（`Stop-Service dsh-notes` / `Stop-ScheduledTask` / NSSM stop）。
2. 备份数据目录。
3. 用新 zip/tgz 覆盖 `C:\dsh-notes` 的程序文件；不要覆盖 `C:\ProgramData\dsh-notes`。
4. 启动服务；启动时会自动做 schema migration（迁移前复制 DB `.bak`）。
5. 打开网页确认；在 DSH 插件里点「立即同步」。

## 11. 故障排查

- 端口占用：`Get-NetTCPConnection -LocalPort 8787`。
- 服务日志：`C:\ProgramData\dsh-notes\logs\server.log`。
- 登录失败：确认账号已创建、未禁用；用 CLI `user list`。
- 插件连不上：确认 URL 是 HTTPS 公网地址、令牌未撤销、Caddy 正常；插件「设置」里点“测试连接”。
- 中文/空格路径：使用引号；`start-server.cmd` 已 `chcp 65001`。
- Windows 杀毒软件可能短暂锁住 SQLite/WAL 文件；本项目对 rename 做了重试，但不建议把数据目录放在实时扫描的共享盘。
