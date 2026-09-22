/**
 * 本地画布服务的启动与端口选择。
 */

import type { AddressInfo } from "node:net";
import http from "node:http";

import { createHandler } from "./handler";
import { DEFAULT_PANEL_PORT, type CanvasServerOptions, type VersionInfo } from "./types";

/** 一次成功的启动结果。 */
export type RunningCanvasServer = {
    /** 实际监听的端口。 */
    port: number;
    /** 前端应当使用的 Origin，例如 http://127.0.0.1:17372。 */
    origin: string;
    /** 端口被占用时，首选端口与实际端口的差异说明。 */
    portWarning?: string;
    /** 关闭服务。 */
    dispose: () => Promise<void>;
};

/** 连续尝试的端口数量。 */
const PORT_SCAN_RANGE = 20;

/** 启动本地画布服务。 */
export async function startCanvasServer(
    webRoot: string,
    agentBaseUrl: string,
    agentToken: string | undefined,
    preferredPort: number = DEFAULT_PANEL_PORT,
    versionInfo?: VersionInfo,
): Promise<RunningCanvasServer> {
    const { server, port } = await listenOnAvailablePort(preferredPort, (boundPort) => {
        const options: CanvasServerOptions = {
            webRoot,
            agentBaseUrl,
            selfOrigin: `http://127.0.0.1:${boundPort}`,
            agentToken,
            versionInfo,
        };
        return createHandler(options);
    });

    const origin = `http://127.0.0.1:${port}`;
    return {
        port,
        origin,
        portWarning: port === preferredPort ? undefined : `端口 ${preferredPort} 被占用，已改用 ${port}`,
        dispose: () =>
            new Promise<void>((resolve) => {
                server.close(() => resolve());
                server.closeAllConnections?.();
            }),
    };
}

/** 在首选端口上监听，被占用时向后顺延。 */
async function listenOnAvailablePort(
    preferredPort: number,
    buildHandler: (port: number) => http.RequestListener,
): Promise<{ server: http.Server; port: number }> {
    let lastError: unknown;
    for (let offset = 0; offset < PORT_SCAN_RANGE; offset += 1) {
        const port = preferredPort + offset;
        const server = http.createServer();
        try {
            await new Promise<void>((resolve, reject) => {
                server.once("error", reject);
                server.listen(port, "127.0.0.1", () => {
                    server.removeListener("error", reject);
                    resolve();
                });
            });
        } catch (error) {
            lastError = error;
            server.close();
            continue;
        }
        server.removeAllListeners("request");
        server.on("request", buildHandler(port));
        const address = server.address() as AddressInfo | null;
        return { server, port: address?.port ?? port };
    }
    throw new Error(`端口 ${preferredPort} 起的 ${PORT_SCAN_RANGE} 个端口都不可用：${String(lastError)}`);
}
