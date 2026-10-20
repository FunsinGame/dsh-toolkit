# Docker / Docker Compose 部署

适用于 Linux/Debian 主机（也适用于 Windows Docker Desktop 的 Linux 容器）。目标：**只发布 Caddy 的 80/443，notes 容器不发布任何端口**，数据在命名卷中。

## 1. 准备

```bash
cd dsh-notes
export NOTES_DOMAIN=notes.example.com   # 替换成你的域名，DNS 已指向该主机
```

- Docker Engine 24+ / Docker Compose v2。
- 域名已解析到主机；80/443 可达（Caddy 自动申请证书）。
- 不要把数据目录放进 Git 或公开镜像。

## 2. compose

```bash
docker compose -f deploy/docker/compose.yaml up -d --build
docker compose -f deploy/docker/compose.yaml ps
docker compose -f deploy/docker/compose.yaml logs -f notes
```

`compose.yaml` 做了：

- notes 服务：非 root、只读根文件系统、`tmpfs /tmp`、`no-new-privileges`、`cap_drop: ALL`、命名卷 `/data`、**不发布端口**。
- Caddy：唯一发布 80/443；反代 `notes:8787`；SSE 不缓冲。
- 只有内部网络，Caddy 与 notes 通信。

## 3. 创建账号与令牌

`docker compose exec` 进入容器执行 CLI（容器内 `node` 可直接运行）：

```bash
docker compose -f deploy/docker/compose.yaml exec notes \
  node server/bin.js init --data-dir /data

docker compose -f deploy/docker/compose.yaml exec -it notes \
  node server/bin.js user add alice --data-dir /data

docker compose -f deploy/docker/compose.yaml exec notes \
  node server/bin.js token create --user alice --name dsh-plugin --data-dir /data
```

- `-it` 用于交互输入密码；自动化可用 `--password-stdin`。
- 令牌只显示一次。
- 没有 Web 注册/改密/令牌管理入口。

## 4. 访问

- `https://${NOTES_DOMAIN}` 账号密码登录。
- DSH 插件设置：URL `https://${NOTES_DOMAIN}`，令牌填上面创建的。
- MCP：`https://${NOTES_DOMAIN}/mcp`。

## 5. 备份

```bash
# 在线一致性备份到容器数据卷的 backups 目录
docker compose -f deploy/docker/compose.yaml exec notes \
  node server/bin.js backup --data-dir /data --out /data/backups

# 再复制到宿主机
docker compose -f deploy/docker/compose.yaml cp notes:/data/backups ./backups
```

也可以直接备份命名卷（推荐先停容器）：

```bash
docker compose -f deploy/docker/compose.yaml stop notes
docker run --rm -v dsh-notes_notes-data:/data -v "$PWD/backups":/backup alpine \
  tar -czf /backup/dsh-notes-$(date +%F).tar.gz -C /data .
docker compose -f deploy/docker/compose.yaml start notes
```

## 6. 升级

```bash
docker compose -f deploy/docker/compose.yaml build --pull
docker compose -f deploy/docker/compose.yaml up -d
```

数据卷保留；启动时自动迁移 schema。升级前先备份。

## 7. 安全注意

- 不要把 `notes` 服务的 8787 映射到宿主机；只让 Caddy 访问。
- `--trusted-proxy '*'` 仅在 notes 无发布端口、只在内网时使用；若直接暴露 notes 端口，必须改成具体代理地址或移除。
- 容器内 `DSH_NOTES_PUBLIC_URL` 用于 Secure Cookie/Origin；确保与实际域名一致。
- Caddy 卷 `caddy-data` 含证书私钥，限制宿主机访问。
- 定期 `docker compose pull` 更新 Caddy/Node 基础镜像；更新后重建。
- 只读根文件系统 + 命名卷意味着日志默认走 `docker logs`；如需文件日志，把 `--log-file /data/logs/server.log` 加进 CMD 并创建目录。

## 8. 资源与排障

```bash
docker compose -f deploy/docker/compose.yaml ps
docker compose -f deploy/docker/compose.yaml logs -f notes caddy
docker stats
```

- 容器起不来：看 `docker compose logs notes`；常见是 `/data` 权限或端口占用。
- 证书失败：确认 DNS/80/443；查看 Caddy 日志。
- 上传 413：检查 Caddy `request_body` 与 notes `--max-upload-mb`。
- SQLite 写失败：确认 `/data` 卷由 `node` 用户可写；不要在只读根上写数据库。
