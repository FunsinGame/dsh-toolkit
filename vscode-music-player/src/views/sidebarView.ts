/**
 * 侧边栏 webview 视图。
 *
 * 关键点是 `retainContextWhenHidden: true`：侧边栏视图被隐藏时，默认会销毁
 * webview 上下文，正在播放的 `<audio>` 也就没了。加上它以后上下文保留，音乐
 * 才能在被切走之后继续放（这一点由 `selftest.ts` 实测确认）。
 *
 * 提供者本身不持有业务逻辑，只负责：生成 HTML、校验入站消息、转发出站消息。
 */

import * as vscode from 'vscode';

import { buildWebviewHtml, localResourceRoots } from './webviewHtml';
import { isWebviewToHostType, type BootstrapPayload, type HostToWebview, type WebviewToHost } from '../protocol';
import type { Logger } from '../util/log';

export interface SidebarViewDeps {
  extensionUri: vscode.Uri;
  proxyOrigin: string;
  getBootstrap: () => BootstrapPayload;
  /** 收到的（已校验的）webview 消息。 */
  onMessage: (message: WebviewToHost, view: vscode.WebviewView) => void;
  logger: Logger;
}

/** webview → 宿主 的合法消息类型（白名单的唯一来源在 protocol.ts）。 */
export class SidebarViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  /** webview 是否已上报 `ready`（用于判断能否安全投递消息）。 */
  private ready = false;

  constructor(private readonly deps: SidebarViewDeps) {}

  get hasView(): boolean {
    return this.view !== null;
  }

  get isReady(): boolean {
    return this.ready;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.ready = false;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: localResourceRoots(this.deps.extensionUri),
    };

    view.webview.html = buildWebviewHtml({
      webview: view.webview,
      extensionUri: this.deps.extensionUri,
      proxyOrigin: this.deps.proxyOrigin,
      bootstrap: this.deps.getBootstrap(),
    });

    view.webview.onDidReceiveMessage(
      (raw: unknown) => this.handleMessage(raw, view),
      undefined,
      [],
    );

    view.onDidDispose(() => {
      this.deps.logger.info('侧边栏视图已销毁');
      this.view = null;
      this.ready = false;
    });

    this.deps.logger.info('侧边栏视图已解析');
  }

  /** 向 webview 投递消息；没有视图或视图还没 ready 时静默丢弃。 */
  post(message: HostToWebview): boolean {
    if (this.view === null) return false;
    // 隐藏的 webview 不保证能收到消息；投递失败不应影响宿主逻辑。
    void this.view.webview.postMessage(message);
    return true;
  }

  /** 重新加载 HTML（改配置或重启代理后调用）。 */
  refresh(): void {
    const view = this.view;
    if (view === null) return;
    this.ready = false;
    view.webview.html = buildWebviewHtml({
      webview: view.webview,
      extensionUri: this.deps.extensionUri,
      proxyOrigin: this.deps.proxyOrigin,
      bootstrap: this.deps.getBootstrap(),
    });
  }

  private handleMessage(raw: unknown, view: vscode.WebviewView): void {
    if (raw === null || typeof raw !== 'object') return;
    const message = raw as { type?: unknown };
    if (typeof message.type !== 'string' || !isWebviewToHostType(message.type)) {
      this.deps.logger.warn(`收到未知的 webview 消息类型：${String(message.type)}`);
      return;
    }
    if (message.type === 'ready') this.ready = true;
    try {
      this.deps.onMessage(raw as WebviewToHost, view);
    } catch (error) {
      this.deps.logger.error('处理 webview 消息失败', error);
    }
  }
}
