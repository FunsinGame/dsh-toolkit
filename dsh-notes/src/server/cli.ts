/**
 * dsh-notes-server command line.
 *
 * Account and token management are local-only commands: there is deliberately
 * no HTTP route that creates users, changes passwords or issues tokens. The
 * serve command is the only long-running process; it opens the SQLite database,
 * starts the single HTTP listener and installs graceful shutdown handlers.
 */

import { copyFile, cp, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { backup } from 'node:sqlite'
import { NotesHttpServer } from './http.ts'
import { closeDatabase, metaGet, openDatabase, serverId } from './db.ts'
import { NotesService } from './service.ts'
import { DEFAULT_SERVER_CONFIG, normalizeServerConfig, assertListenerPolicy, type ServerConfig } from './config.ts'
import { createLogger, type LogLevel } from './logger.ts'
import {
  defaultDataDir,
  ensurePrivateDir,
  expandPath,
  hardenFile,
  IS_POSIX,
  IS_WINDOWS,
  platformLabel,
  writeFileAtomic,
} from './platform.ts'
import { hashPassword, passwordPolicyError, validUsername } from './security.ts'

declare const __DSH_NOTES_VERSION__: string
const VERSION = typeof __DSH_NOTES_VERSION__ === 'string' ? __DSH_NOTES_VERSION__ : '0.1.0'

interface Parsed {
  positionals: string[]
  flags: Record<string, string | true>
}

function parseArgv(argv: string[]): Parsed {
  const positionals: string[] = []
  const flags: Record<string, string | true> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === undefined) continue
    if (!arg.startsWith('--')) {
      positionals.push(arg)
      continue
    }
    const body = arg.slice(2)
    const equals = body.indexOf('=')
    if (equals > 0) {
      flags[body.slice(0, equals)] = body.slice(equals + 1)
      continue
    }
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags[body] = next
      index += 1
    } else {
      flags[body] = true
    }
  }
  return { positionals, flags }
}

function flagString(flags: Record<string, string | true>, key: string): string | undefined {
  const value = flags[key]
  return typeof value === 'string' ? value : undefined
}

function flagBoolean(flags: Record<string, string | true>, key: string): boolean {
  const value = flags[key]
  return value === true || value === '1' || value === 'true'
}

function env(name: string): string | undefined {
  const value = process.env[name]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function dataDirFrom(flags: Record<string, string | true>): string {
  return resolve(expandPath(flagString(flags, 'data-dir') ?? env('DSH_NOTES_DATA_DIR') ?? defaultDataDir()))
}

function configFrom(flags: Record<string, string | true>): ServerConfig {
  const logLevelRaw = flagString(flags, 'log-level') ?? env('DSH_NOTES_LOG_LEVEL') ?? 'info'
  const logLevel = (['off', 'error', 'warn', 'info', 'debug'].includes(logLevelRaw) ? logLevelRaw : 'info') as LogLevel
  const maxUploadMb = Number(flagString(flags, 'max-upload-mb') ?? env('DSH_NOTES_MAX_UPLOAD_MB') ?? 50)
  const port = Number(flagString(flags, 'port') ?? env('DSH_NOTES_PORT') ?? DEFAULT_SERVER_CONFIG.port)
  return normalizeServerConfig({
    dataDir: dataDirFrom(flags),
    host: flagString(flags, 'host') ?? env('DSH_NOTES_HOST') ?? DEFAULT_SERVER_CONFIG.host,
    port: Number.isFinite(port) ? port : DEFAULT_SERVER_CONFIG.port,
    socket: flagString(flags, 'socket') ?? env('DSH_NOTES_SOCKET') ?? '',
    basePath: flagString(flags, 'base-path') ?? env('DSH_NOTES_BASE_PATH') ?? '',
    publicUrl: flagString(flags, 'public-url') ?? env('DSH_NOTES_PUBLIC_URL') ?? '',
    tlsCert: flagString(flags, 'tls-cert') ?? env('DSH_NOTES_TLS_CERT') ?? '',
    tlsKey: flagString(flags, 'tls-key') ?? env('DSH_NOTES_TLS_KEY') ?? '',
    behindProxy: flagBoolean(flags, 'behind-proxy') || env('DSH_NOTES_BEHIND_PROXY') === '1',
    insecureHttp: flagBoolean(flags, 'insecure-http') || env('DSH_NOTES_INSECURE_HTTP') === '1',
    trustProxy: flagBoolean(flags, 'trust-proxy') || env('DSH_NOTES_TRUST_PROXY') === '1',
    trustedProxies: (flagString(flags, 'trusted-proxy') ?? env('DSH_NOTES_TRUSTED_PROXY') ?? '127.0.0.1,::1')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    maxUploadBytes: Math.round(Math.max(1, Number.isFinite(maxUploadMb) ? maxUploadMb : 50) * 1024 * 1024),
    sessionDays: Number(flagString(flags, 'session-days') ?? env('DSH_NOTES_SESSION_DAYS') ?? DEFAULT_SERVER_CONFIG.sessionDays),
    sessionIdleDays: Number(flagString(flags, 'session-idle-days') ?? env('DSH_NOTES_SESSION_IDLE_DAYS') ?? DEFAULT_SERVER_CONFIG.sessionIdleDays),
    trashDays: Number(flagString(flags, 'trash-days') ?? env('DSH_NOTES_TRASH_DAYS') ?? DEFAULT_SERVER_CONFIG.trashDays),
    versionsPerNote: Number(flagString(flags, 'versions-per-note') ?? env('DSH_NOTES_VERSIONS_PER_NOTE') ?? DEFAULT_SERVER_CONFIG.versionsPerNote),
    logLevel,
    logFile: flagString(flags, 'log-file') ?? env('DSH_NOTES_LOG_FILE') ?? '',
  })
}

async function openService(dataDir: string, config: ServerConfig): Promise<{ db: ReturnType<typeof openDatabase>; service: NotesService }> {
  await ensurePrivateDir(dataDir)
  const db = openDatabase(dataDir)
  const service = new NotesService(db, config, VERSION)
  return { db, service }
}

export async function main(argv: string[]): Promise<void> {
  const parsed = parseArgv(argv)
  const command = parsed.positionals[0] ?? 'help'
  try {
    switch (command) {
      case 'serve':
        await commandServe(parsed)
        return
      case 'init':
        await commandInit(parsed)
        return
      case 'user':
        await commandUser(parsed)
        return
      case 'token':
        await commandToken(parsed)
        return
      case 'session':
        await commandSession(parsed)
        return
      case 'backup':
        await commandBackup(parsed)
        return
      case 'version':
      case '--version':
      case '-V':
        process.stdout.write(`${VERSION}\n`)
        return
      case 'help':
      case '--help':
      case '-h':
        printHelp()
        return
      default:
        process.stderr.write(`未知命令：${command}\n\n`)
        printHelp()
        process.exitCode = 2
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`错误：${message}\n`)
    process.exitCode = 1
  }
}

async function commandServe(parsed: Parsed): Promise<void> {
  const config = configFrom(parsed.flags)
  assertListenerPolicy(config)
  const logger = createLogger(config.logLevel, config.logFile)
  await ensurePrivateDir(config.dataDir)
  const { db, service } = await openService(config.dataDir, config)
  await service.init()
  const users = service.listUsers()
  const http = new NotesHttpServer(service, config, logger, VERSION)
  let stopped = false
  const shutdown = async (signal: string): Promise<void> => {
    if (stopped) return
    stopped = true
    logger.info(`收到 ${signal}，正在停止服务…`)
    try {
      await http.stop()
    } catch (error) {
      logger.warn('HTTP 关闭失败', error)
    }
    closeDatabase(db)
    logger.info('服务已停止')
    process.exitCode = 0
  }
  process.once('SIGINT', () => void shutdown('SIGINT'))
  if (IS_WINDOWS) process.on('SIGBREAK' as NodeJS.Signals, () => void shutdown('SIGBREAK'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  const started = await http.start()
  logger.info(`dsh-notes-server ${VERSION} 已启动`)
  logger.info(`平台: ${platformLabel()}  Node: ${process.versions.node}`)
  logger.info(`数据目录: ${config.dataDir}`)
  logger.info(`Web: ${started.url}`)
  logger.info(`MCP: ${started.url.replace(/\/$/, '')}/mcp`)
  if (started.socket !== '') logger.info(`Unix Socket: ${started.socket}`)
  if (config.behindProxy) logger.info('模式: 反向代理后运行（仅信任配置的代理地址）')
  else if (config.tlsCert !== '') logger.info('模式: 内置 HTTPS')
  else logger.info('模式: 回环 HTTP；公网访问请使用 Caddy/Nginx 终止 TLS')
  if (users.length === 0) {
    logger.warn('尚未创建任何账号。请在服务器本机运行：')
    logger.warn(`  node server/bin.js user add <用户名> --data-dir "${config.dataDir}"`)
  }
  if (config.insecureHttp) {
    logger.warn('已启用 --insecure-http：账号密码会以明文 HTTP 传输，仅限受控内网测试。')
  }
  // Keep the process alive while the listener runs.
  await new Promise<void>((resolveWait) => {
    const timer = setInterval(() => {
      if (stopped) {
        clearInterval(timer)
        resolveWait()
      }
    }, 500)
    timer.unref?.()
  })
}

async function commandInit(parsed: Parsed): Promise<void> {
  const dataDir = dataDirFrom(parsed.flags)
  const config = normalizeServerConfig({ dataDir })
  await ensurePrivateDir(dataDir)
  const { db, service } = await openService(dataDir, config)
  const users = service.listUsers()
  const id = serverId(db)
  closeDatabase(db)
  process.stdout.write(`数据目录已初始化：${dataDir}\n`)
  process.stdout.write(`服务端 ID：${id}\n`)
  if (users.length === 0) {
    process.stdout.write('尚未创建账号。\n')
  } else {
    process.stdout.write(`已有 ${users.length} 个账号。\n`)
  }
  process.stdout.write('\n下一步（账号和令牌只能在服务器本机创建）：\n')
  process.stdout.write(`  node server/bin.js user add <用户名> --data-dir "${dataDir}"\n`)
  process.stdout.write(`  node server/bin.js token create --user <用户名> --name dsh-plugin --data-dir "${dataDir}"\n`)
  process.stdout.write(`  node server/bin.js serve --data-dir "${dataDir}"\n`)
}

async function commandUser(parsed: Parsed): Promise<void> {
  const action = parsed.positionals[1] ?? 'list'
  const dataDir = dataDirFrom(parsed.flags)
  const config = normalizeServerConfig({ dataDir })
  const { db, service } = await openService(dataDir, config)
  try {
    if (action === 'add') {
      const username = parsed.positionals[2] ?? flagString(parsed.flags, 'username') ?? ''
      if (username === '') throw new Error('用法：user add <用户名>')
      const password = await readPasswordPair(parsed, '密码（至少 12 位，不回显）：', '再次输入密码：')
      if (!validUsername(username.trim().toLowerCase())) throw new Error('用户名需为 1-64 位字母、数字、点、下划线或连字符')
      const policy = passwordPolicyError(password, username.trim().toLowerCase())
      if (policy !== null) throw new Error(policy)
      const user = await service.createUser({ username, password })
      process.stdout.write(`已创建账号：${user.username} (${user.id})\n`)
      return
    }
    if (action === 'passwd' || action === 'password') {
      const username = parsed.positionals[2] ?? ''
      if (username === '') throw new Error('用法：user passwd <用户名>')
      const user = service.getUserByUsername(username)
      if (user === null) throw new Error('用户不存在')
      const password = await readPasswordPair(parsed, '新密码（至少 12 位，不回显）：', '再次输入新密码：')
      await service.setPassword(user.id, password, { keepTokens: flagBoolean(parsed.flags, 'keep-tokens') })
      process.stdout.write(`已更新密码：${user.username}${flagBoolean(parsed.flags, 'keep-tokens') ? '（保留令牌）' : '（已撤销全部会话与令牌）'}\n`)
      return
    }
    if (action === 'list') {
      const users = service.listUsers()
      if (users.length === 0) {
        process.stdout.write('还没有账号。\n')
        return
      }
      for (const user of users) {
        process.stdout.write(`${user.username}\t${user.disabled === 1 ? 'disabled' : 'active'}\t${user.id}\n`)
      }
      return
    }
    if (action === 'disable' || action === 'enable') {
      const username = parsed.positionals[2] ?? ''
      if (username === '') throw new Error(`用法：user ${action} <用户名>`)
      const user = service.getUserByUsername(username)
      if (user === null) throw new Error('用户不存在')
      service.setUserDisabled(user.id, action === 'disable')
      process.stdout.write(`已${action === 'disable' ? '禁用' : '启用'}账号：${user.username}\n`)
      return
    }
    if (action === 'remove') {
      const username = parsed.positionals[2] ?? ''
      if (username === '') throw new Error('用法：user remove <用户名> [--yes] [--purge]')
      const user = service.getUserByUsername(username)
      if (user === null) throw new Error('用户不存在')
      if (!flagBoolean(parsed.flags, 'yes')) throw new Error('删除账号需要 --yes 确认')
      await service.removeUser(user.id, { purge: flagBoolean(parsed.flags, 'purge') })
      process.stdout.write(`已删除账号：${user.username}\n`)
      return
    }
    throw new Error(`未知 user 子命令：${action}`)
  } finally {
    closeDatabase(db)
  }
}

async function commandToken(parsed: Parsed): Promise<void> {
  const action = parsed.positionals[1] ?? 'list'
  const dataDir = dataDirFrom(parsed.flags)
  const config = normalizeServerConfig({ dataDir })
  const { db, service } = await openService(dataDir, config)
  try {
    if (action === 'create') {
      const username = flagString(parsed.flags, 'user') ?? ''
      if (username === '') throw new Error('用法：token create --user <用户名> --name <标签> [--read-only] [--expires-days N]')
      const user = service.getUserByUsername(username)
      if (user === null) throw new Error('用户不存在')
      const name = flagString(parsed.flags, 'name') ?? 'token'
      const expiresDays = Number(flagString(parsed.flags, 'expires-days') ?? 0)
      const created = service.createToken(user.id, {
        name,
        readOnly: flagBoolean(parsed.flags, 'read-only'),
        expiresDays: Number.isFinite(expiresDays) ? expiresDays : 0,
      })
      process.stdout.write(`已创建访问令牌（只显示这一次，请立即保存）：\n\n${created.token}\n\n`)
      process.stdout.write(`用户：${user.username}\n名称：${created.name}\n权限：${created.scopes}\n`)
      if (created.expiresAt !== null) process.stdout.write(`过期：${new Date(created.expiresAt).toISOString()}\n`)
      return
    }
    if (action === 'list') {
      const username = flagString(parsed.flags, 'user')
      const user = username === undefined ? null : service.getUserByUsername(username)
      if (username !== undefined && user === null) throw new Error('用户不存在')
      const tokens = service.listTokens(user?.id)
      if (tokens.length === 0) {
        process.stdout.write('没有访问令牌。\n')
        return
      }
      for (const token of tokens) {
        process.stdout.write(`${token.prefix}\t${token.name}\t${token.scopes}\t${token.revokedAt === null ? 'active' : 'revoked'}\t${token.userId}\n`)
      }
      return
    }
    if (action === 'revoke') {
      const target = parsed.positionals[2] ?? ''
      if (target === '') throw new Error('用法：token revoke <id|prefix>')
      const ok = service.revokeToken(target)
      process.stdout.write(ok ? '已撤销令牌。\n' : '没有找到匹配的令牌。\n')
      return
    }
    throw new Error(`未知 token 子命令：${action}`)
  } finally {
    closeDatabase(db)
  }
}

async function commandSession(parsed: Parsed): Promise<void> {
  const action = parsed.positionals[1] ?? 'list'
  const dataDir = dataDirFrom(parsed.flags)
  const config = normalizeServerConfig({ dataDir })
  const { db, service } = await openService(dataDir, config)
  try {
    if (action === 'list') {
      const username = flagString(parsed.flags, 'user')
      const user = username === undefined ? null : service.getUserByUsername(username)
      if (username !== undefined && user === null) throw new Error('用户不存在')
      const sessions = service.listSessions(user?.id)
      if (sessions.length === 0) {
        process.stdout.write('没有活动会话。\n')
        return
      }
      for (const session of sessions) process.stdout.write(`${session.id}\t${session.userId}\t${new Date(Number(session.lastUsedAt)).toISOString()}\n`)
      return
    }
    if (action === 'revoke') {
      if (flagBoolean(parsed.flags, 'all')) {
        service.revokeAllSessions()
        process.stdout.write('已撤销全部会话。\n')
        return
      }
      const username = flagString(parsed.flags, 'user')
      if (username === undefined) throw new Error('用法：session revoke --user <用户名> 或 --all')
      const user = service.getUserByUsername(username)
      if (user === null) throw new Error('用户不存在')
      service.deleteUserSessions(user.id)
      process.stdout.write(`已撤销 ${user.username} 的全部会话。\n`)
      return
    }
    throw new Error(`未知 session 子命令：${action}`)
  } finally {
    closeDatabase(db)
  }
}

async function commandBackup(parsed: Parsed): Promise<void> {
  const dataDir = dataDirFrom(parsed.flags)
  const outFlag = flagString(parsed.flags, 'out') ?? ''
  if (outFlag === '') throw new Error('用法：backup --out <目录>')
  const outDir = resolve(expandPath(outFlag))
  await mkdir(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = join(outDir, `dsh-notes-backup-${stamp}`)
  await mkdir(target, { recursive: true, mode: 0o700 })
  const db = openDatabase(dataDir)
  const targetDb = join(target, 'notes.db')
  try {
    await backup(db, targetDb)
  } catch {
    try {
      db.exec('PRAGMA wal_checkpoint(FULL)')
    } catch {
      /* Ignore. */
    }
    await copyFile(join(dataDir, 'notes.db'), targetDb)
  }
  const sourceAttachments = join(dataDir, 'attachments')
  if (existsSync(sourceAttachments)) await cp(sourceAttachments, join(target, 'attachments'), { recursive: true })
  const manifest = {
    createdAt: new Date().toISOString(),
    version: VERSION,
    serverId: serverId(db),
    schemaVersion: metaGet(db, 'schemaVersion'),
    platform: platformLabel(),
  }
  await writeFileAtomic(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 0o600)
  await hardenFile(targetDb, 0o600)
  closeDatabase(db)
  process.stdout.write(`备份完成：${target}\n`)
  if (!IS_POSIX) process.stdout.write('Windows 上请用 NTFS ACL 限制备份目录访问权限。\n')
}

function printHelp(): void {
  process.stdout.write(`dsh-notes-server ${VERSION}

用法：
  dsh-notes-server serve --data-dir <目录> [选项]
  dsh-notes-server init [--data-dir <目录>]
  dsh-notes-server user add|passwd|list|disable|enable|remove ...
  dsh-notes-server token create|list|revoke ...
  dsh-notes-server session list|revoke ...
  dsh-notes-server backup --out <目录>
  dsh-notes-server version|help

服务选项：
  --data-dir <目录>        数据目录（默认 ~/.dsh-notes）
  --host <地址>            监听地址（默认 127.0.0.1；非回环需 TLS 或 --behind-proxy）
  --port <端口>            监听端口（默认 8787）
  --socket <路径>          POSIX Unix Socket（不监听 TCP）
  --base-path <路径>       子路径部署，例如 /notes
  --public-url <URL>       对外地址（用于导出/Origin 校验）
  --tls-cert/--tls-key     内置 HTTPS 证书与私钥
  --behind-proxy           运行在受信任反向代理之后
  --trusted-proxy <列表>   逗号分隔的代理地址（默认 127.0.0.1,::1）
  --insecure-http          允许非回环明文 HTTP（仅受控内网测试）
  --max-upload-mb <MB>     附件大小上限（默认 50）
  --session-days <天>      会话绝对有效期（默认 30）
  --session-idle-days <天> 会话空闲有效期（默认 7）
  --trash-days <天>        回收站保留（默认 30）
  --versions-per-note <N>  每条笔记历史版本数（默认 50）
  --log-level <级别>       off|error|warn|info|debug（默认 info）
  --log-file <路径>        日志文件（自动轮转）
  --trust-proxy            信任 X-Forwarded-For

安全说明：
  账号、密码、令牌都只能在服务器本机通过 CLI 管理；Web/API 没有注册或改密入口。
  公网部署请使用 Caddy/Nginx 终止 TLS，并只开放 80/443；不要把 8787 暴露到公网。
  推荐用 Tailscale/WireGuard 内网访问，或使用 --socket 让反代通过 Unix Socket 连接。
`)
}

function readStdinLine(): Promise<string> {
  return new Promise((resolveRead, rejectRead) => {
    const chunks: Buffer[] = []
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk))
    process.stdin.on('end', () => resolveRead(Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/u, '')))
    process.stdin.on('error', rejectRead)
    process.stdin.resume()
  })
}

async function readPasswordPair(parsed: Parsed, label: string, confirmLabel: string): Promise<string> {
  if (flagBoolean(parsed.flags, 'password-stdin')) {
    const value = await readStdinLine()
    if (value === '') throw new Error('密码不能为空')
    return value
  }
  if (!process.stdin.isTTY) {
    throw new Error('非交互环境请使用 --password-stdin 从标准输入读取密码')
  }
  const password = await promptSecret(label)
  const confirm = await promptSecret(confirmLabel)
  if (password !== confirm) throw new Error('两次输入的密码不一致')
  return password
}

/** Read a password without echoing it, including on Windows terminals. */
function promptSecret(label: string): Promise<string> {
  const stdin = process.stdin
  const stdout = process.stdout
  stdout.write(label)
  if (!stdin.isTTY) {
    return readStdinLine()
  }
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')
  let value = ''
  return new Promise<string>((resolvePrompt, rejectPrompt) => {
    const cleanup = (): void => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off('data', onData)
    }
    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup()
          stdout.write('\n')
          resolvePrompt(value)
          return
        }
        if (char === '\u0003') {
          cleanup()
          stdout.write('\n')
          rejectPrompt(new Error('已取消'))
          return
        }
        if (char === '\u007f' || char === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1)
            stdout.write('\b \b')
          }
          continue
        }
        if (char >= ' ') {
          value += char
          stdout.write('*')
        }
      }
    }
    stdin.on('data', onData)
  })
}


