/**
 * 面板 HTML 生成。
 *
 * 单独成模块，一是便于测试，二是确保 webview 自身不携带任何业务逻辑。
 *
 * 重要：这里刻意**不写 meta CSP**。实测确认 VS Code 会剥掉 webview HTML 里脚本的 `nonce` 属性
 * （它用自己的 nonce 机制替换），因此一旦我们自己声明 `script-src "nonce-…"`，
 * 策略与实际 nonce 对不上，**页面上所有脚本都不会执行**（表现为按钮无反应、尺寸调整失效、
 * 诊断回传静默失败），而 iframe 里的画布照常显示，很容易误判成"只是显示小"。
 * 交给 VS Code 注入的策略即可。
 */

/** 生成面板 HTML 所需的参数。 */
export type HtmlOptions = {
    /** webview 的 cspSource，用于允许扩展自身资源。 */
    cspSource: string;
    /** iframe 的加载地址（本地画布服务）。 */
    targetUrl: string;
    /** 展示在工具栏的 Agent 地址。 */
    agentUrl: string;
    /** 本地画布服务的 Origin。 */
    origin: string;
    /** 端口顺延等提示。 */
    notice?: string;
    /** 版本或诊断标签。 */
    versionLabel?: string;
};

/** 转义 HTML 文本。 */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * 生成 iframe 的目标地址。
 *
 * `#agentUrl` 与 `#agentToken` 是上游前端自带的引导参数（web/src/lib/agent/agent-url-bootstrap.ts），
 * 前端读取后会自动连接 canvas-agent，因此用户不需要手填地址和 token。
 */
export function buildFrameUrl(origin: string, agentUrl: string, agentToken?: string): string {
    const base = origin.replace(/\/$/, "");
    const params = new URLSearchParams();
    params.set("agentUrl", agentUrl);
    if (agentToken) params.set("agentToken", agentToken);
    return `${base}/#${params.toString()}`;
}

/** 生成面板 HTML。 */
export function renderHtml(options: HtmlOptions): string {
    const nonce = createNonce();

    const notice = options.notice
        ? `<div class="notice" id="notice" role="status">${escapeHtml(options.notice)}</div>`
        : "";
    const label = escapeHtml(options.versionLabel ?? options.origin);

    return `<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="UTF-8" />
        <title>无限画布</title>
        <style nonce="${nonce}">
            :root { color-scheme: light dark; }
            html, body { height: 100%; margin: 0; padding: 0; }
            body { position: relative; overflow: hidden; background: var(--vscode-editor-background, #1f1f1f); color: var(--vscode-foreground, #ddd); font-family: var(--vscode-font-family, sans-serif); }
            /* iframe 的固有尺寸是 300x150，跨源内容撑不开自己，必须由父页面强制铺满，
               因此这里用绝对定位而不是 flex 拉伸。 */
            #frame { position: absolute; inset: 0; z-index: 0; display: block; width: 100%; height: 100%; border: 0; }
            .notice { position: relative; z-index: 1; margin: 0; padding: 6px 12px; font-size: 12px; background: var(--vscode-inputValidation-warningBackground, #5a4a00); border-bottom: 1px solid var(--vscode-inputValidation-warningBorder, #8a7000); }
            /* 有提示条时把画布下移，避免被盖住。 */
            body.has-notice #frame { top: var(--notice-height, 30px); }
            .empty { position: relative; z-index: 1; padding: 24px; font-size: 13px; line-height: 1.7; }
            .empty code { background: var(--vscode-textCodeBlock-background, #333); padding: 1px 5px; border-radius: 3px; }
            .empty a { color: var(--vscode-textLink-foreground, #3794ff); }
        </style>
    </head>
    <body${options.notice ? ' class="has-notice"' : ""}>
        ${notice}<iframe id="frame" src="${escapeHtml(options.targetUrl)}" allow="clipboard-read; clipboard-write; fullscreen" allowfullscreen title="无限画布"></iframe>
        <script nonce="${nonce}">
            const frame = document.getElementById("frame");
            const notice = document.getElementById("notice");
            const hasNotice = ${options.notice ? "true" : "false"};

            /**
             * 显式给 iframe 赋像素尺寸，不依赖 CSS 是否被宿主完整应用。
             *
             * 背景：画布曾经只占左上角 300x150 —— 那正是 iframe 的固有尺寸，
             * 说明宽高约束在宿主里没生效。这里在运行时直接算尺寸并写进行内样式，
             * 与外面的 CSS 形成双保险。
             */
            const applyFrameBox = () => {
                const offset = hasNotice && notice ? notice.offsetHeight : 0;
                const width = document.body.clientWidth;
                const height = Math.max(120, document.body.clientHeight - offset);
                frame.style.position = "absolute";
                frame.style.top = offset + "px";
                frame.style.left = "0";
                frame.style.width = width + "px";
                frame.style.height = height + "px";
                if (notice) document.body.style.setProperty("--notice-height", offset + "px");
            };

            applyFrameBox();
            window.addEventListener("resize", applyFrameBox);
            window.addEventListener("load", applyFrameBox);
            if (typeof ResizeObserver === "function") {
                const observer = new ResizeObserver(applyFrameBox);
                observer.observe(document.body);
                if (notice) observer.observe(notice);
            }

            /**
             * 诊断：把 iframe 与布局的真实尺寸回传给扩展宿主。
             *
             * 画布曾在某些宿主里只占约 300x150（iframe 的固有尺寸），而同一地址在浏览器里正常，
             * 说明问题出在 webview 这一层。这里把能取到的样式与尺寸都报上去，便于定位。
             */
            const collectMetrics = () => {
                const frameStyle = getComputedStyle(frame);
                const bodyStyle = getComputedStyle(document.body);
                const rect = frame.getBoundingClientRect();
                const inner = (() => {
                    try {
                        const w = frame.contentWindow;
                        const d = frame.contentDocument;
                        const root = d && d.getElementById("root");
                        const first = root && root.firstElementChild;
                        return {
                            innerWidth: w ? w.innerWidth : null,
                            innerHeight: w ? w.innerHeight : null,
                            rootWidth: first ? Math.round(first.getBoundingClientRect().width) : null,
                            rootHeight: first ? Math.round(first.getBoundingClientRect().height) : null,
                            rootClass: first ? String(first.className).slice(0, 60) : null,
                        };
                    } catch (error) {
                        return { crossOrigin: String(error && error.message).slice(0, 80) };
                    }
                })();
                return {
                    webview: { innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio, zoom: (window.visualViewport && window.visualViewport.scale) || 1 },
                    bodyBox: { clientWidth: document.body.clientWidth, clientHeight: document.body.clientHeight, scrollWidth: document.body.scrollWidth, scrollHeight: document.body.scrollHeight },
                    frameRect: { width: Math.round(rect.width), height: Math.round(rect.height), top: Math.round(rect.top), left: Math.round(rect.left) },
                    frameInline: { width: frame.style.width, height: frame.style.height, top: frame.style.top, position: frame.style.position },
                    frameComputed: {
                        position: frameStyle.position,
                        display: frameStyle.display,
                        width: frameStyle.width,
                        height: frameStyle.height,
                        top: frameStyle.top,
                        inset: frameStyle.inset,
                        boxSizing: frameStyle.boxSizing,
                        transform: frameStyle.transform,
                        zoom: frameStyle.zoom,
                    },
                    bodyComputed: { display: bodyStyle.display, position: bodyStyle.position, height: bodyStyle.height, overflow: bodyStyle.overflow },
                    inner,
                };
            };

            const postDiagnostics = (phase) => {
                try {
                    acquireVsCodeApi().postMessage({ command: "diagnostics", phase, metrics: collectMetrics() });
                } catch (error) {
                    // 诊断本身不能影响画布。
                }
            };
            postDiagnostics("immediate");
            // 除了定时采样，也挂到真实生命周期事件上，避免依赖面板停留时长。
            window.addEventListener("load", () => postDiagnostics("load"));
            window.addEventListener("resize", () => postDiagnostics("resize"));
            setTimeout(() => postDiagnostics("after-1.5s"), 1500);
            setTimeout(() => postDiagnostics("after-5s"), 5000);
            window.addEventListener("error", (event) => {
                try {
                    acquireVsCodeApi().postMessage({ command: "diagnostics-error", message: String(event.message).slice(0, 200), source: String(event.filename).slice(0, 120), line: event.lineno });
                } catch {}
            });

            const empty = document.createElement("div");
            empty.className = "empty";
            // 上游前端读取 URL 上的 agentUrl / agentToken 自动连接 canvas-agent；
            // token 为空时用户在画布右上角 Agent 面板里手动填即可。
            empty.innerHTML = [
                "<p><strong>本地画布服务没有响应。</strong>可以：</p>",
                "<ol>",
                "<li>执行命令 <code>无限画布: 重新启动本地服务</code>；</li>",
                "<li>如果前端产物缺失，在扩展目录执行 <code>npm run fetch:web</code>；</li>",
                "<li>确认 canvas-agent 是否在 ${escapeHtml(options.agentUrl)} 上运行。</li>",
                "</ol>",
                "<p>当前地址：<code>${escapeHtml(options.origin)}</code></p>",
            ].join("");

            /**
             * 只在 iframe 自身报错时才显示兜底说明。
             *
             * 刻意**不做任何超时探测**，原因有两条，都是实测踩出来的：
             * 1. 父页面用 fetch 探测本机 http 会被宿主直接拦掉（报 Failed to fetch），
             *    而 iframe 本身加载正常——一探测就会把好端端的画布换成错误页；
             * 2. webview 里定时器会被宿主暂停/节流（监控里只有同步执行的 immediate 采样生效），
             *    于是超时兜底会在面板重新可见时才触发，同样会误杀已经加载好的画布。
             * 加载失败时 iframe 会发 error 事件，这就够了。
             */
            frame.addEventListener("error", () => {
                frame.replaceWith(empty);
            });
            document.title = "无限画布 (${label})";
        </script>
    </body>
</html>`;
}

/** 生成一次性 nonce。 */
function createNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let value = "";
    for (let index = 0; index < 32; index += 1) {
        value += chars[Math.floor(Math.random() * chars.length)];
    }
    return value;
}

/** 侧边栏展示的状态快照。 */
export type SidebarState = {
    /** 画布前端产物是否就绪。 */
    webReady: boolean;
    /** 本地画布服务状态文案。 */
    canvasStatus: string;
    /** 本地画布服务是否在运行。 */
    canvasRunning: boolean;
    /** canvas-agent 状态文案。 */
    agentStatus: string;
    /** canvas-agent 是否可达。 */
    agentReachable: boolean;
    /** token 是否已自动配对。 */
    paired: boolean;
    /** 端口顺延等提示。 */
    notice?: string;
};

/**
 * 生成活动栏侧边栏的 HTML。
 *
 * 侧边栏只做入口与状态展示：画布是编辑器级宽度，放进侧边栏没法用，
 * 所以主按钮会把画布开在编辑器标签页里。
 */export function renderSidebarHtml(state: SidebarState): string {
    const nonce = createNonce();

    const dot = (ok: boolean) => `<span class="dot ${ok ? "ok" : "off"}" aria-hidden="true"></span>`;
    const roles = (ok: boolean) => (ok ? "正常" : "未就绪");

    const notice = state.notice ? `<div class="notice">${escapeHtml(state.notice)}</div>` : "";
    const webWarning = state.webReady
        ? ""
        : `<div class="notice warn">尚未找到前端产物 <code>web/index.html</code>。请在扩展目录执行 <code>npm run fetch:web</code>。</div>`;
    // 产物缺失时打开画布只会报错，因此禁用主按钮，避免误导。
    const openDisabled = state.webReady ? "" : " disabled";

    return `<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="UTF-8" />
        <style nonce="${nonce}">
            body { padding: 10px 12px; font-family: var(--vscode-font-family); font-size: 12px; color: var(--vscode-foreground); }
            .title { margin: 0; font-size: 14px; font-weight: 600; }
            .subtitle { margin: 2px 0 10px; font-size: 11px; color: var(--vscode-descriptionForeground); }
            .primary { display: block; width: 100%; padding: 8px 10px; margin-bottom: 10px; font-size: 13px; font-weight: 600; cursor: pointer; border: 0; border-radius: 4px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
            .primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
            .primary:disabled { opacity: .5; cursor: not-allowed; }
            .status { margin: 0 0 10px; padding: 0; list-style: none; }
            .status li { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
            .status .label { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .status .value { flex: 0 0 auto; color: var(--vscode-descriptionForeground); }
            .dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; background: var(--vscode-testing-iconFailed, #f14c4c); }
            .dot.ok { background: var(--vscode-testing-iconPassed, #3fb950); }
            .links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
            .links a { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: none; }
            .links a:hover { text-decoration: underline; }
            .notice { margin: 8px 0; padding: 6px 8px; font-size: 11px; line-height: 1.5; border-radius: 3px; background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textLink-foreground); }
            .notice.warn { border-left-color: var(--vscode-editorWarning-foreground, #cca700); }
            code { font-family: var(--vscode-editor-font-family, monospace); background: var(--vscode-textCodeBlock-background); padding: 0 3px; border-radius: 3px; }
            .hint { margin-top: 10px; color: var(--vscode-descriptionForeground); line-height: 1.6; }
        </style>
    </head>
    <body>
        <h1 class="title">无限画布</h1>
        <p class="subtitle">infinite-canvas</p>
        <button class="primary" id="open"${openDisabled}>打开无限画布</button>
        ${notice}
        ${webWarning}
        <ul class="status">
            <li>${dot(state.webReady)}<span class="label">前端产物</span><span class="value">${escapeHtml(roles(state.webReady))}</span></li>
            <li>${dot(state.canvasRunning)}<span class="label">本地画布服务</span><span class="value">${escapeHtml(state.canvasStatus)}</span></li>
            <li>${dot(state.agentReachable)}<span class="label">canvas-agent</span><span class="value">${escapeHtml(state.agentStatus)}</span></li>
            <li>${dot(state.paired)}<span class="label">连接 token</span><span class="value">${state.paired ? "已自动配对" : "需手动填写"}</span></li>
        </ul>
        <div class="links">
            <a id="refresh">刷新状态</a>
            <a id="startAgent">启动 Agent</a>
            <a id="external">浏览器打开</a>
            <a id="status">诊断日志</a>
            <a id="settings">设置</a>
        </div>
        <p class="hint">画布会打开在编辑器标签页里，可拖动到其他分组或与代码并排显示。</p>
        <script nonce="${nonce}">
            const api = acquireVsCodeApi();
            const send = (command) => api.postMessage({ command });
            document.getElementById("open").addEventListener("click", () => send("open"));
            for (const id of ["refresh", "startAgent", "external", "status", "settings"]) {
                document.getElementById(id).addEventListener("click", (event) => {
                    event.preventDefault();
                    send(id);
                });
            }
        </script>
    </body>
</html>`;
}

