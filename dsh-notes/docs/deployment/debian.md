# Debian 11/12 部署

Debian 的系统 Node 版本通常过旧；请安装 Node.js 24（NodeSource 或官方 tarball）。服务端不需要 PostgreSQL/MySQL、不需要编译工具。

## 1. 安装 Node.js 24

```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
node -e "require('node:sqlite'); console.log('node:sqlite ok')"
```

如果 NodeSource 不可用，可下载官方 `node-v24.x-linux-x64.tar.xz`，解压到 `/opt/node24`，并在 systemd 中使用 `/opt/node24/bin/node`。

> Debian 的 `nodejs` 包可能仍指向旧版本；不要跳过版本检查。`node:sqlite` 需要 Node 22.13+/24 的相应能力，本项目验收 Node 24。

## 2. 目录与账号

```bash
sudo useradd --system --home /var/lib/dsh-notes --shell /usr/sbin/nologin dshnotes
sudo install -d -o dshnotes -g dshnotes -m 0700 /var/lib/dsh-notes
sudo install -d -o root -g root -m 0755 /opt/dsh-notes /etc/dsh-notes
sudo unzip dsh-notes-server-0.1.0.zip -d /opt/dsh-notes
sudo chown -R root:root /opt/dsh-notes
sudo chmod -R a-w /opt/dsh-notes
```

## 3. 创建账号与令牌

```bash
cd /opt/dsh-notes
sudo -u dshnotes node server/bin.js init --data-dir /var/lib/dsh-notes
sudo -u dshnotes node server/bin.js user add alice --data-dir /var/lib/dsh-notes
sudo -u dshnotes node server/bin.js token create --user alice --name dsh-plugin --data-dir /var/lib/dsh-notes
```

密码/令牌只在本机输入/显示；没有 Web 注册、改密、令牌管理入口。

## 4. systemd

```bash
sudo cp deploy/systemd/dsh-notes.service /etc/systemd/system/
sudo cp deploy/systemd/dsh-notes-backup.service /etc/systemd/system/
sudo cp deploy/systemd/dsh-notes-backup.timer /etc/systemd/system/
sudo cp deploy/env.example /etc/dsh-notes/env
sudo chmod 600 /etc/dsh-notes/env
sudo nano /etc/dsh-notes/env    # 设置 PUBLIC_URL、域名等
sudo systemctl daemon-reload
sudo systemctl enable --now dsh-notes.service dsh-notes-backup.timer
sudo systemctl status dsh-notes.service
```

默认监听 `127.0.0.1:8787`；unit 已包含 `NoNewPrivileges`、`ProtectSystem=strict`、`ProtectHome`、`PrivateTmp`、空 capability、`ReadWritePaths=/var/lib/dsh-notes` 等加固。

## 5. Caddy 或 Nginx

### Caddy（推荐，自动 HTTPS）

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy

sudo cp /opt/dsh-notes/deploy/caddy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile   # notes.example.com
sudo systemctl reload caddy
```

### Nginx

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo cp /opt/dsh-notes/deploy/nginx/dsh-notes.conf /etc/nginx/sites-available/dsh-notes
sudo ln -s /etc/nginx/sites-available/dsh-notes /etc/nginx/sites-enabled/
sudo certbot --nginx -d notes.example.com
sudo nginx -t && sudo systemctl reload nginx
```

## 6. 防火墙

```bash
sudo apt-get install -y ufw
sudo ufw default deny incoming
sudo ufw allow 22/tcp      # 按需调整 SSH 端口
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
# 8787 不对外开放
```

只在内网使用时，可只允许 Tailscale/WireGuard 网段。

## 7. 备份与恢复

```bash
sudo -u dshnotes node /opt/dsh-notes/server/bin.js backup \
  --data-dir /var/lib/dsh-notes --out /var/lib/dsh-notes/backups
```

- 每天由 timer 自动运行。
- 备份包含 `notes.db`、`attachments/`、`manifest.json`；含密码/令牌哈希，权限保持 0700。
- 恢复：停服 → 解压备份到数据目录（保留权限）→ 启动 → 登录检查。

## 8. 升级

```bash
sudo systemctl stop dsh-notes
sudo -u dshnotes node /opt/dsh-notes/server/bin.js backup --data-dir /var/lib/dsh-notes --out /var/lib/dsh-notes/backups
sudo unzip -o dsh-notes-server-0.1.0.zip -d /opt/dsh-notes
sudo chown -R root:root /opt/dsh-notes && sudo chmod -R a-w /opt/dsh-notes
sudo systemctl start dsh-notes
sudo journalctl -u dsh-notes -n 100 --no-pager
```

## 9. 常见问题

- `node:sqlite` 报错：Node 版本过低，安装 Node 24。
- Caddy 无法申请证书：确认 80/443 可达、DNS 正确、没有其他服务占用。
- 登录后 Cookie 不生效：反代必须传 `X-Forwarded-Proto: https`，服务启动加 `--behind-proxy`。
- SSE/实时刷新不工作：Caddy `flush_interval -1` 或 Nginx `proxy_buffering off`。
- 上传 413：同时调整服务端 `--max-upload-mb`、Caddy `request_body` / Nginx `client_max_body_size`。
- 公网明文启动被拒绝：这是设计；使用 Caddy/Nginx 或 `--tls-cert/--tls-key`。
