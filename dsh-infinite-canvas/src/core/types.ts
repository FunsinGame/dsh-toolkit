/**
 * 本地画布服务与 canvas-agent 之间的共享类型。
 *
 * 这个文件刻意不依赖 `vscode`，以便在普通 Node 进程里直接跑测试。
 */

/** 与上游 canvas-agent 约定的默认监听端口。 */
export const DEFAULT_AGENT_PORT = 17371;

/** 本地画布服务（承载前端产物）的默认端口。 */
export const DEFAULT_PANEL_PORT = 17372;

/** 上游 canvas-agent 在用户目录下的配置文件。 */
export const AGENT_CONFIG_RELATIVE_PATH = [".infinite-canvas", "canvas-agent.json"];

/** 本地服务的运行时配置。 */
export type CanvasServerOptions = {
    /** 存放上游 web 构建产物（dist）的目录。 */
    webRoot: string;
    /** 代理目标：canvas-agent 的基地址，例如 http://127.0.0.1:17371。 */
    agentBaseUrl: string;
    /**
     * 本地服务在浏览器眼中的 Origin。
     *
     * 转发时用它覆盖请求的 Origin 头：canvas-agent 只在 `config.origins` 里存在该 Origin 时才放行，
     * 而 webview 的请求会带上 `vscode-webview://...` 之类的 Origin，直接转发会被 403。
     */
    selfOrigin: string;
    /** 要注入的 canvas-agent 连接 token。为空时只依赖前端自己带在 URL 上的 token。 */
    agentToken?: string;
    /** 覆盖版本信息，仅测试用。 */
    versionInfo?: VersionInfo;
};

/** 面板顶部展示的版本信息，来自构建流水线生成的 manifest。 */
export type VersionInfo = {
    /** 上游仓库地址。 */
    repository?: string;
    /** 构建所用的上游 commit。 */
    commit?: string;
    /** 上游 VERSION 文件内容。 */
    upstreamVersion?: string;
    /** 构建时间（ISO 字符串）。 */
    builtAt?: string;
};

/**
 * 需要转发给 canvas-agent 的路径。
 *
 * 这里刻意用**精确匹配**而不是前缀匹配：前端用 history 路由，`/canvas/projects/<id>`
 * 这类页面路径和 Agent 的 `/canvas/state` 只差一个前缀，前缀匹配会把页面请求误转发给 Agent。
 * 前端的 Agent 客户端只访问下面这四个路径（见上游 web/src/services/api/canvas-agent.ts）。
 */
export const AGENT_PATHS = ["/events", "/canvas/state", "/canvas/activate", "/canvas/result"] as const;

/** 本地服务自有的管理接口前缀。 */
export const ADMIN_PATH_PREFIX = "/__canvas/";

/** 判断某个请求路径是否属于 canvas-agent。 */
export function isAgentPath(pathname: string): boolean {
    if (pathname.startsWith(ADMIN_PATH_PREFIX)) return false;
    if ((AGENT_PATHS as readonly string[]).includes(pathname)) return true;
    // canvas-agent 的业务接口全部挂在 /agent/ 下。
    return pathname.startsWith("/agent/");
}

/** 判断某个请求路径是否属于扩展自有管理接口。 */
export function isAdminPath(pathname: string): boolean {
    return pathname.startsWith(ADMIN_PATH_PREFIX);
}
