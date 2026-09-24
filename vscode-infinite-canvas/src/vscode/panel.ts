/**
 * 无限画布面板：一个 webview，内部用 iframe 加载本地画布服务。
 *
 * 为什么不直接把前端产物塞进 webview：
 * - 上游 index.html 使用根绝对路径（/assets/...、/config.js），webview 的 vscode-webview:// 源下会解析失败；
 * - 前端把画布与配置存在 IndexedDB 里，需要稳定且可预期的 Origin；
 * - 本地 HTTP 源与 canvas-agent 同源，省掉 CORS 与 webview 的 localhost 代理两处不确定行为。
 */

import * as vscode from "vscode";

import { buildFrameUrl, renderHtml } from "./html";
import { ICON_RELATIVE_PATH } from "./config";

/** 面板需要的上下文。 */
export type CanvasPanelContext = {
    extensionUri: vscode.Uri;
    /** 本地画布服务地址，例如 http://127.0.0.1:17372。 */
    origin: string;
    /** canvas-agent 基地址。 */
    agentUrl: string;
    /** canvas-agent token；为空时前端需要用户手动填。 */
    agentToken: string | undefined;
    /** 端口顺延等提示信息。 */
    notice?: string;
    /** 接收 webview 回传的尺寸诊断数据。 */
    onDiagnostics?: (payload: unknown) => void;
};

const VIEW_TYPE = "dshInfiniteCanvas.panel";

/** 管理唯一一个无限画布面板。 */
export class CanvasPanel {
    private static current: CanvasPanel | undefined;

    private readonly disposables: vscode.Disposable[] = [];
    private context: CanvasPanelContext;

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        context: CanvasPanelContext,
    ) {
        this.context = context;
        this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, ...ICON_RELATIVE_PATH);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.registerDiagnosticsChannel();
        this.render();
    }

    /**
     * 接收 webview 回传的尺寸诊断。
     *
     * 诊断是辅助能力：任何异常都不能影响画布本身，所以这里整段兜底。
     */
    private registerDiagnosticsChannel(): void {
        const webview = this.panel.webview as vscode.Webview | undefined;
        if (typeof webview?.onDidReceiveMessage !== "function") return;
        try {
            const subscription = webview.onDidReceiveMessage((message: unknown) => {
                if (!message || typeof message !== "object") return;
                const command = (message as { command?: unknown }).command;
                if (command === "diagnostics" || command === "diagnostics-error") {
                    this.context.onDiagnostics?.(message);
                }
            });
            if (subscription) this.disposables.push(subscription);
        } catch {
            // 宿主不提供该事件时静默跳过。
        }
    }

    /** 打开或聚焦画布面板。 */
    static show(context: CanvasPanelContext): CanvasPanel {
        if (CanvasPanel.current) {
            CanvasPanel.current.panel.reveal(vscode.ViewColumn.Active);
            CanvasPanel.current.update(context);
            return CanvasPanel.current;
        }
        const panel = vscode.window.createWebviewPanel(VIEW_TYPE, "无限画布", vscode.ViewColumn.Active, {
            enableScripts: true,
            // 画布状态都在 iframe 里，webview 自身不持久化；隐藏时保留 iframe 以免 SSE 断开。
            retainContextWhenHidden: true,
            localResourceRoots: [context.extensionUri],
        });
        CanvasPanel.current = new CanvasPanel(panel, context);
        return CanvasPanel.current;
    }

    /** 当前是否已有打开的面板。 */
    static isOpen(): boolean {
        return Boolean(CanvasPanel.current);
    }

    /** 更新面板上下文（例如服务重启后换了端口）。 */
    update(context: CanvasPanelContext): void {
        this.context = context;
        this.render();
    }

    /** 让面板重新加载内部 iframe。 */
    refresh(): void {
        this.render();
    }

    /** 关闭面板。 */
    dispose(): void {
        if (CanvasPanel.current === this) CanvasPanel.current = undefined;
        for (const disposable of this.disposables.splice(0)) disposable.dispose();
        this.panel.dispose();
    }

    private render(): void {
        const webview = this.panel.webview;
        const target = buildFrameUrl(this.context.origin, this.context.agentUrl, this.context.agentToken);
        webview.html = renderHtml({
            cspSource: webview.cspSource,
            targetUrl: target,
            agentUrl: this.context.agentUrl,
            origin: this.context.origin,
            notice: this.context.notice,
            versionLabel: this.context.origin,
        });
    }
}
