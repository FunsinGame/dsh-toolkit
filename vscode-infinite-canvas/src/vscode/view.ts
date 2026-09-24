/**
 * 侧边栏视图：活动栏图标点开后的欢迎页与控制面板。
 *
 * 画布本身是编辑器级宽度，塞进侧边栏会很难用，所以这里只做入口与状态展示，
 * 真正的画布仍在编辑器标签页里打开（点按钮即可）。
 */

import * as vscode from "vscode";

import { renderSidebarHtml, type SidebarState } from "./html";

/** 面板视图的标识。 */
export const SIDEBAR_VIEW_TYPE = "dshInfiniteCanvas.sidebar";

/** 侧边栏需要的上下文。 */
export type SidebarContext = {
    /** 组装当前状态快照。 */
    getState: () => Promise<SidebarState>;
    /** 打开画布（编辑器标签页）。 */
    openCanvas: () => Promise<void>;
    /** 视图被解析出来时回调，调用方借此保存引用以便刷新。 */
    onViewResolved: (view: vscode.WebviewView) => void;
    /** 输出通道，用于记录异常。 */
    log: (message: string) => void;
};

/** 活动栏侧边栏视图。 */
export class CanvasSidebarView implements vscode.WebviewViewProvider {
    static readonly viewType = SIDEBAR_VIEW_TYPE;

    constructor(private readonly context: SidebarContext) {}

    /** 由 VS Code 在视图首次可见时调用。 */
    resolveWebviewView(view: vscode.WebviewView): void {
        view.webview.options = { enableScripts: true };
        this.context.onViewResolved(view);
        view.onDidChangeVisibility(() => {
            if (view.visible) void CanvasSidebarView.refresh(view, this.context);
        });
        view.webview.onDidReceiveMessage((message: unknown) => {
            void this.handleMessage(view, message);
        });
        void CanvasSidebarView.refresh(view, this.context);
    }

    /** 用最新状态重绘某个侧边栏视图。 */
    static async refresh(view: vscode.WebviewView, context: SidebarContext): Promise<void> {
        try {
            const state = await context.getState();
            view.webview.html = renderSidebarHtml(state);
        } catch (error) {
            context.log(`[error] 刷新侧边栏失败：${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async handleMessage(view: vscode.WebviewView, message: unknown): Promise<void> {
        const command = typeof message === "object" && message !== null ? (message as { command?: unknown }).command : undefined;
        switch (command) {
            case "open":
                await this.context.openCanvas();
                break;
            case "refresh":
                await CanvasSidebarView.refresh(view, this.context);
                break;
            case "startAgent":
                await vscode.commands.executeCommand("dshInfiniteCanvas.startAgent");
                await CanvasSidebarView.refresh(view, this.context);
                break;
            case "status":
                await vscode.commands.executeCommand("dshInfiniteCanvas.showStatus");
                break;
            case "external":
                await vscode.commands.executeCommand("dshInfiniteCanvas.openExternal");
                break;
            case "settings":
                await vscode.commands.executeCommand("dshInfiniteCanvas.openSettings");
                break;
            default:
                break;
        }
    }
}
