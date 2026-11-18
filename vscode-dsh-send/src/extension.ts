/**
 * DSH Send: place a file or a code range from VS Code into the composer of an
 * already running DeepSeek Harness instance.
 *
 * The extension owns no server. It reads the instance file the Host writes
 * under `$DSH_HOME/runtime/external-input`, then POSTs one request to
 * `/external-input/v1/insert`; the Host broadcasts the request to every open
 * Client, and the Client that owns the active Session inserts the reference at
 * its caret. Since DSH 0.2.2 the Host admits that route through its web
 * session gate first, so the request carries both the instance's capability
 * token and a locally derived session cookie.
 */

import { basename } from 'node:path'
import * as vscode from 'vscode'
import { DshHttpError, insert, type InsertRequest, type InsertResponse } from './client'
import { candidateHomes, dshHome, readBrowserSessionSecret, readInstancesFrom, type DshInstance } from './discovery'
import { lineRangeOf, samePath } from './format'
import { mintSessionCookie } from './session'

/** Output channel for discovery and protocol diagnostics. */
let output: vscode.OutputChannel | undefined

/**
 * Read the one instance a command should target.
 * @returns the chosen instance, or undefined when none is running.
 */
async function resolveInstance(): Promise<DshInstance | undefined> {
  const config = vscode.workspace.getConfiguration('dshSend')
  const homes = candidateHomes(config.get<string>('home', ''))
  output?.appendLine(`searching ${homes.join(', ')}`)
  const instances = await readInstancesFrom(homes, config.get<string>('instance', ''))
  output?.appendLine(`live instances: ${instances.map(i => `${String(i.pid)}@${String(i.port)}`).join(', ') || '(none)'}`)
  if (instances.length === 0) {
    return undefined
  }
  const cwd = workspaceCwd()
  if (cwd !== undefined) {
    const matching = instances.find(instance => samePath(instance.cwd, cwd))
    if (matching !== undefined) return matching
  }
  if (instances.length === 1) return instances[0]
  const picked = await vscode.window.showQuickPick(
    instances.map(instance => ({
      label: `$(server) DSH · ${basename(instance.cwd)}`,
      description: `127.0.0.1:${String(instance.port)}`,
      instance,
    })),
    { placeHolder: '选择要发送到的 DSH 实例' },
  )
  return picked?.instance
}

/**
 * Derive the web-session cookie one instance's gate expects.
 * @param instance - the instance being addressed.
 * @returns the cookie pair, or undefined when this home stores no secret.
 */
async function sessionCookie(instance: DshInstance): Promise<string | undefined> {
  const secret = await readBrowserSessionSecret(instance.home)
  if (secret === undefined) {
    output?.appendLine(`no browser-session secret under ${instance.home}; sending the capability token alone`)
    return undefined
  }
  return mintSessionCookie(new URL(instance.url).host, secret)
}

/**
 * Send one insertion, tolerating a session secret that was recreated since it
 * was first read: DSH rewrites the credential record when it recreates it, and
 * an editor session can outlive that.
 * @param instance - the instance being addressed.
 * @param request - content to insert.
 * @returns the Host answer.
 */
async function insertWithSession(instance: DshInstance, request: InsertRequest): Promise<InsertResponse> {
  const cwd = workspaceCwd()
  const cookie = await sessionCookie(instance)
  try {
    return await insert(instance, request, cwd, cookie)
  } catch (error) {
    if (!(error instanceof DshHttpError) || error.status !== 401) throw error
    const refreshed = await sessionCookie(instance)
    if (refreshed === undefined || refreshed === cookie) throw error
    output?.appendLine('the Host rejected the session cookie; retrying with the credential record re-read')
    return await insert(instance, request, cwd, refreshed)
  }
}

/**
 * Send one insertion request and surface the Host's answer.
 * @param request - content to insert.
 */
async function send(request: InsertRequest): Promise<void> {
  const instance = await resolveInstance()
  if (instance === undefined) {
    const choice = await vscode.window.showWarningMessage(
      '没有发现正在运行的 DSH 实例。请确认 DSH 已启动（需要带 external-input 入口的版本）。',
      '复制启动命令',
    )
    if (choice === '复制启动命令') {
      await vscode.env.clipboard.writeText('dsh web --host 127.0.0.1 --port 0')
    }
    return
  }
  try {
    const response: InsertResponse = await insertWithSession(instance, request)
    output?.appendLine(`insert -> ${JSON.stringify(response)}`)
    if (response.ok === true) {
      const target = response.sessionId === undefined ? 'DSH' : `会话 ${response.sessionId.slice(0, 8)}`
      void vscode.window.showInformationMessage(`已发送到 ${target} 的输入框。`)
      return
    }
    if (response.ack === 'timeout') {
      void vscode.window.showWarningMessage('请求已发出，但没有打开的 DSH 会话接收；请先在 DSH 中打开一个会话。')
      return
    }
    switch (response.error) {
      case 'no active session':
        void vscode.window.showWarningMessage('请先在 DSH 中打开一个会话，再发送。')
        return
      case 'composer busy':
        void vscode.window.showWarningMessage('DSH 输入框正忙，请稍后重试。')
        return
      case 'path cannot be represented':
        void vscode.window.showWarningMessage('该路径包含无法写入引用的字符。')
        return
      default:
        void vscode.window.showWarningMessage(`发送失败：${response.error ?? 'unknown'}`)
    }
  } catch (error) {
    output?.appendLine(`insert failed: ${errorMessage(error)}`)
    void vscode.window.showWarningMessage(
      error instanceof DshHttpError && error.status === 401
        ? 'DSH 拒绝了本次请求（401）：会话凭据缺失或已失效。请确认 DSH 与 VS Code 运行在同一用户下，且没有删除 ~/.dsh/.credentials.yaml。'
        : `无法连接 DSH：${errorMessage(error)}`,
    )
  }
}

/**
 * Resolve the file a command should send.
 * @param uri - context-menu resource, when the command received one.
 * @returns the file URI, or undefined for a non-file target.
 */
function fileTarget(uri: vscode.Uri | undefined): vscode.Uri | undefined {
  const target = uri ?? vscode.window.activeTextEditor?.document.uri
  return target !== undefined && target.scheme === 'file' ? target : undefined
}

/**
 * Send one whole file as an absolute-path reference.
 * @param uri - context-menu resource, when present.
 */
async function sendFile(uri: vscode.Uri | undefined): Promise<void> {
  const target = fileTarget(uri)
  if (target === undefined) {
    void vscode.window.showWarningMessage('没有可发送的本地文件。')
    return
  }
  await send({ kind: 'file', path: target.fsPath })
}

/**
 * Send the current line, or every selected line, as a ranged file reference.
 */
async function sendSelection(): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (editor === undefined || editor.document.uri.scheme !== 'file') {
    void vscode.window.showWarningMessage('没有可发送的本地文件。')
    return
  }
  const range = lineRangeOf(editor)
  await send({ kind: 'file', path: editor.document.uri.fsPath, ...range })
}

/**
 * The first workspace folder, used only as a Session tiebreaker.
 * @returns the absolute workspace path, if any.
 */
function workspaceCwd(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
}

/**
 * Render an unknown error as one line.
 * @param error - thrown value.
 * @returns the message.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Activate the extension.
 * @param context - extension lifetime.
 */
export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('DSH Send')
  context.subscriptions.push(output)
  output.appendLine(`activated (home: ${dshHome(vscode.workspace.getConfiguration('dshSend').get<string>('home', ''))})`)
  context.subscriptions.push(
    vscode.commands.registerCommand('dshSend.sendFile', (uri?: vscode.Uri) => sendFile(uri)),
    vscode.commands.registerCommand('dshSend.sendSelection', () => sendSelection()),
  )
}

/** Release the output channel. */
export function deactivate(): void {
  output?.dispose()
  output = undefined
}
