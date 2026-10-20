# Linux 部署（systemd）

适用于通用 Linux 发行版（systemd）。服务端只需要 Node.js 24+，不需要数据库服务、不需要编译工具链。

## 1. 安装 Node.js 24

任选一种：

```bash
# NodeSource（Debian/Ubuntu 示例）
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# 或使用官方 Node 24 tarball 解压到 /opt/node
# 或使用 nvm；systemd 的 ExecStart 必须写绝对路径
```

验证：

```bash
node -v
node -e "require('node:sqlite'); console.log('node:sqlite ok')"
```

## 2. 创建系统用户与目录

```bash
sudo useradd --system --home /var/lib/dsh-notes --shell /usr/sbin/nologin dshnotes
sudo install -d -o dshnotes -g dshnotes -m 0700 /var/lib/dsh-notes
sudo install -d -o root -g root -m 0755 /opt/dsh-notes
sudo install -d -o root -g root -m 0755 /etc/dsh-notes
```

- 程序目录 `/opt/dsh-notes`：root 只读，服务账号不可写。
- 数据目录 `/var/lib/dsh-notes`：只有 `dshnotes` 可读写（0700）。
- 不要把数据目录放在 Web 根目录或静态托管目录。

解压 zip/tgz 到 `/opt/dsh-notes`：

```bash
sudo unzip dsh-notes-server-0.1.0.zip -d /opt/dsh-notes
# 或
sudo tar -xzf dsh-notes-0.1.0.tgz -C /tmp
sudo cp -a /tmp/package/. /opt/dsh-notes/
```

## 3. 创建账号与令牌（本机）

```bash
cd /opt/dsh-notes
sudo -u dshnotes node server/bin.js init --data-dir /var/lib/dsh-notes
sudo -u dshnotes node server/bin.js user add alice --data-dir /var/lib/dsh-notes
sudo -u dshnotes node server/bin.js token create --user alice --name dsh-plugin --data-dir /var/lib/dsh-notes
```

- 密码交互输入，至少 12 位。
- 令牌只显示一次。
- 账号管理只能本机 CLI，没有 Web 注册/改密/令牌管理。

## 4. 环境文件

```bash
sudo cp deploy/env.example /etc/dsh-notes/env
sudo chmod 600 /etc/dsh-notes/env
sudo nano /etc/dsh-notes/env
```

至少设置：

```ini
DSH_NOTES_DATA_DIR=/var/lib/dsh-notes
DSH_NOTES_HOST=127.0.0.1
DSH_NOTES_PORT=8787
DSH_NOTES_PUBLIC_URL=https://notes.example.com
DSH_NOTES_BEHIND_PROXY=1
DSH_NOTES_TRUSTED_PROXY=127.0.0.1,::1
```

不要把真实令牌写进这个文件；服务端账号/令牌在 SQLite 里。

## 5. systemd

```bash
sudo cp deploy/systemd/dsh-notes.service /etc/systemd/system/
sudo cp deploy/systemd/dsh-notes-backup.service /etc/systemd/system/
sudo cp deploy/systemd/dsh-notes-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dsh-notes.service
sudo systemctl enable --now dsh-notes-backup.timer
sudo systemctl status dsh-notes.service
```

查看日志：

```bash
sudo journalctl -u dsh-notes -f
```

服务只监听 `127.0.0.1:8787`；unit 已限制 capability、文件系统、临时目录与地址族。若使用 Unix Socket，可将 `ExecStart` 改为 `--socket /run/dsh-notes/notes.sock` 并配置 `RuntimeDirectory=dsh-notes`；Caddy/Nginx 需有该 socket 的访问权限。

## 6. 反向代理与 TLS

### Caddy（推荐）

```bash
sudo cp /opt/dsh-notes/deploy/caddy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile   # 修改 notes.example.com
sudo systemctl reload caddy
```

Caddy 自动申请证书；反代到 `127.0.0.1:8787`，`flush_interval -1` 保证 SSE/MCP 流式不被缓冲。

### Nginx

```bash
sudo cp /opt/dsh-notes/deploy/nginx/dsh-notes.conf /etc/nginx/sites-available/dsh-notes.conf
sudo ln -s /etc/nginx/sites-available/dsh-notes.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d notes.example.com
sudo nginx -t && sudo systemctl reload nginx
```

Nginx 配置已设置 `client_max_body_size 60m`、`proxy_buffering off`、长读超时。

## 7. 防火墙

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# 不要开放 8787
sudo ufw enable
sudo ufw status
```

如果只在内网/Tailscale 使用，可只允许相应网段访问 443，甚至不暴露公网。

## 8. 备份

```bash
sudo -u dshnotes node /opt/dsh-notes/server/bin.js backup \
  --data-dir /var/lib/dsh-notes --out /var/lib/dsh-notes/backups
```

`dsh-notes-backup.timer` 每天 03:30 运行一次。备份包含密码/令牌哈希，仍需 0700/0600 权限；可将备份目录同步到另一台机器（加密）。

## 9. 升级

```bash
sudo systemctl stop dsh-notes
sudo -u dshnotes node /opt/dsh-notes/server/bin.js backup --data-dir /var/lib/dsh-notes --out /var/lib/dsh-notes/backups
sudo unzip -o dsh-notes-server-0.1.0.zip -d /opt/dsh-notes   # 新版本
sudo systemctl start dsh-notes
sudo systemctl status dsh-notes
```

- 启动时自动迁移 schema，迁移前复制 DB `.bak`。
- 数据目录不要覆盖。
- 升级后跑一次 `npm run smoke`（开发机）或访问 `/healthz`。

## 10. 故障排查

- 端口：`ss -ltnp | grep 8787`（应只在 127.0.0.1）。
- 服务：`systemctl status dsh-notes`、`journalctl -u dsh-notes -n 200`。
- 反向代理：`curl -I https://notes.example.com/healthz`。
- 登录：`node server/bin.js user list --data-dir /var/lib/dsh-notes`。
- 权限：`sudo -u dshnotes test -w /var/lib/dsh-notes && echo writable`。
- SSE 不工作：确认反代关闭 buffering（Caddy `flush_interval -1`，Nginx `proxy_buffering off`）。
