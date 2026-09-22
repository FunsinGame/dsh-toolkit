/**
 * 扩展配置读取。
 */

import * as vscode from "vscode";

import { DEFAULT_AGENT_PORT, DEFAULT_PANEL_PORT } from "../core/types";

/** 扩展设置。 */
export type ExtensionSettings = {
    /** canvas-agent 基地址。 */
    agentUrl: string;
    /** 本地画布服务首选端口。 */
    panelPort: number;
    /** 打开面板时自动拉起 canvas-agent。 */
    autoStartAgent: boolean;
    /** 自定义启动命令（留空则用 npx）。 */
    agentCommand: string;
    /** 自定义启动命令的参数。 */
    agentArgs: string[];
    /** 打开面板时在外部浏览器同时打开一份。 */
    openInBrowser: boolean;
};

const SECTION = "dshInfiniteCanvas";

/** 读取当前工作区配置。 */
export function readSettings(): ExtensionSettings {
    const config = vscode.workspace.getConfiguration(SECTION);
    const agentPort = config.get<number>("agentPort", DEFAULT_AGENT_PORT);
    return {
        agentUrl: config.get<string>("agentUrl", "").trim() || `http://127.0.0.1:${agentPort}`,
        panelPort: config.get<number>("panelPort", DEFAULT_PANEL_PORT),
        autoStartAgent: config.get<boolean>("autoStartAgent", true),
        agentCommand: config.get<string>("agentCommand", "").trim(),
        agentArgs: config.get<string[]>("agentArgs", []),
        openInBrowser: config.get<boolean>("openInBrowser", false),
    };
}

/** 资源目录相对扩展根目录的路径。 */
export const WEB_ASSET_DIRECTORY = "web";

/** 图标相对扩展根目录的路径。 */
export const ICON_RELATIVE_PATH = ["media", "icon.svg"];
