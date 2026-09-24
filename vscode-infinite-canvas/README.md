# 无限画布 · VS Code 扩展

在 VS Code 里打开 [无限画布（infinite-canvas）](https://github.com/basketikun/infinite-canvas)：一个标签页里使用完整画布，并自动接上本机的 `canvas-agent`，让画布右侧的 Codex Agent 面板开箱可用。

## 它是怎么工作的

```
VS Code webview（扩展自有的极薄外壳，无业务逻辑）
   └── iframe → http://127.0.0.1:17372   ← 扩展内置的本地服务
                    ├── /            静态托管上游 web 构建产物（web/）
                    ├── /agent/*  ┐
                    ├── /canvas/* ├─ 反向代理 → http://127.0.0.1:17371  canvas-agent
                    └── /events   ┘  （自动注入 x-canvas-agent-token）
```

三个关键设计决定：

1. **不在 webview 里直接跑前端产物，而是用扩展内置的 http 服务托管。**
   上游 `index.html` 使用根绝对路径（`/assets/...`、`/config.js`），在 `vscode-webview://` 源下会解析失败；而且前端把画布与配置存在 IndexedDB 里，需要一个稳定、可预期的 Origin。
2. **前端与 canvas-agent 同源（都经由 127.0.0.1:17372）。**
   上游前端所有请求都是 `${endpoint}/...?token=` 的相对形式，因此代理**完全不需要改写路径**；同源还顺带绕开了 CORS 与 `canvas-agent` 的 Origin 白名单，以及 webview 对 localhost 请求的代理与速率限制这些不确定行为。
3. **token 自动配对。**
   上游前端支持用 URL 片段 `#agentUrl=...&agentToken=...` 引导连接，扩展从 `~/.infinite-canvas/canvas-agent.json` 读取 token 后自动注入，用户不需要手动复制粘贴。

`/events` 是 SSE 长连接，代理层显式关闭缓冲（`x-accel-buffering: no` + `setNoDelay`），并在客户端断开时立刻掐断上游连接。

## 安装与构建

扩展 ID 为 `dsh-toolkit.vscode-infinite-canvas`，显示名「无限画布」。

```bash
cd vscode-infinite-canvas
npm install

# 一条命令：拉取上游前端并构建产物到 web/、编译、跑测试、打包
npm run pack

code --install-extension vscode-infinite-canvas-0.1.7.vsix --force
```

分步执行也可以：

```bash
npm run fetch:web     # 拉取上游前端并构建到 web/（需要 git 与 bun）
npm run compile
npm test              # 42 项测试（服务层 + 面板 HTML + 进程管理）
npm run package
```

### `fetch:web` 常用参数

```bash
npm run fetch:web -- --ref v0.1.0                  # 锁定到某个 tag / 分支
npm run fetch:web -- --repo <你的 fork>            # 用 fork 构建
npm run fetch:web -- --source <本地克隆目录>       # 直接用已克隆的仓库，不联网
npm run fetch:web -- --skip-build                  # 只同步产物不重新构建
```

产物目录里会写入 `web/vscode-infinite-canvas.json`，记录上游地址、commit、上游 VERSION 与构建时间，便于排查"到底是哪个版本的前端"。

## 使用入口

**唯一入口是左侧活动栏的图标**（刻意不注册状态栏入口，避免底部状态栏被占用）。

| 入口 | 位置 | 说明 |
| --- | --- | --- |
| **活动栏图标** | 最左侧活动栏的调色板图标 | 点开侧边栏状态面板，再点其中的 **打开无限画布** 即可在编辑器标签页打开画布 |
| 命令面板 | `Ctrl+Shift+P` 搜 `无限画布` | 9 条命令（备选入口） |

侧边栏面板会显示四项状态（前端产物 / 本地画布服务 / canvas-agent / token 配对）以及刷新、启动 Agent、浏览器打开、诊断日志、设置等快捷操作；产物没构建时主按钮会置灰并提示执行 `npm run fetch:web`。

> 画布刻意开在**编辑器标签页**而不是侧边栏：上游界面是宽画布，侧边栏宽度下不可用。

## 命令

| 命令 | 说明 |
| --- | --- |
| `无限画布: 打开画布` | 启动本地服务（必要时拉起 canvas-agent）并打开面板 |
| `无限画布: 刷新侧边栏状态` | 重新取侧边栏状态（开发时改完代码可直接点它，无需重装） |
| `无限画布: 重新启动本地服务` | 端口或产物变化后重启服务 |
| `无限画布: 启动本地 Agent` | 强制拉起 canvas-agent |
| `无限画布: 停止本地 Agent` | 停止由扩展拉起的 canvas-agent（按监听端口反查进程后结束整棵树） |
| `无限画布: 显示运行状态` | 把服务地址、Agent 与 token 配对情况打进输出面板 |
| `无限画布: 显示 webview 诊断数据` | 打开 webview 回传的尺寸诊断（jsonl），用于排查"画布只占一小块"这类宿主层问题 |
| `无限画布: 在外部浏览器打开` | 用系统浏览器打开同一个地址 |
| `无限画布: 打开设置` | 打开本扩展的设置页 |

## 设置

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| `dshInfiniteCanvas.agentUrl` | 空 | canvas-agent 地址，留空用 `http://127.0.0.1:17371` |
| `dshInfiniteCanvas.agentPort` | `17371` | 仅在 `agentUrl` 留空时生效 |
| `dshInfiniteCanvas.panelPort` | `17372` | 承载画布前端的本地服务端口，**改变端口等于换一份画布数据** |
| `dshInfiniteCanvas.autoStartAgent` | `true` | 打开画布时自动拉起 canvas-agent |
| `dshInfiniteCanvas.agentCommand` | 空 | 自定义启动命令，留空用 `npx -y @basketikun/canvas-agent@latest` |
| `dshInfiniteCanvas.agentArgs` | `[]` | 自定义启动命令的参数 |
| `dshInfiniteCanvas.openInBrowser` | `false` | 打开画布时同时用外部浏览器打开 |

## 验证步骤

装好之后按顺序确认：

1. 活动栏出现调色板图标 → 点开侧边栏 → 四项状态都应是绿点。
2. 点侧边栏里的 **打开无限画布** → 编辑器标签页出现画布界面（能看到项目列表 / 空白画布）。
3. 面板右上角 `Agent` → 应显示**已连接**；若显示未连接，点该面板里的连接设置，地址填 `http://127.0.0.1:17371`、token 从 `无限画布: 显示运行状态` 的输出里取。
4. 随便拖一个文本节点，关掉 VS Code 重开，节点还在（说明 IndexedDB 落在稳定 Origin 上）。
5. 画布里配置你自己的 OpenAI 兼容 `Base URL` / `API Key` 后试一次文生图。

不想装进 VS Code 也可以先用同一条链路脱机验证：

```bash
npm run compile
npm run serve:web          # 打印可直接打开的地址（含带 token 的引导链接）
```

这个脚本用的是**和扩展完全相同的服务实现**，因此它跑通就说明宿主链路没问题，剩下的只是 VS Code 外壳。

还有一条不依赖 VS Code 的宿主冒烟，用来验证清单接线（活动栏视图注册、侧边栏 HTML、点按钮后创建面板的 iframe 地址与 CSP）：

```bash
node scripts/smoke-activate.cjs .
```

面板的 iframe 尺寸曾经出过问题（画布缩在左上角一小块，正好是 iframe 300×150 的固有尺寸），
现在用**两层保险**：CSS 上绝对定位 + 显式宽高，脚本里再用 `ResizeObserver` 按父容器算像素直接写进行内样式。

面板会把 iframe / body 的真实尺寸与**计算后样式**回传给扩展，写进
`<globalStorage>/webview-diagnostics.jsonl`（「输出」面板里也会同步打印，`[diag]` 前缀）。
命令 `无限画布: 显示 webview 诊断数据` 可以直接打开这个文件。诊断自身异常不会影响画布渲染。

回归验证：

```bash
npm run verify:frame      # 无头浏览器渲染真实生成的面板 HTML，检查 iframe 是否被写上正确像素尺寸
npm run smoke:activate    # 宿主接线冒烟（活动栏视图、侧边栏 HTML、面板创建、诊断回传落盘）
```

Agent 生命周期（启动 → 端口监听 → 反查 pid → 停止）也有独立验证：

```bash
npm run verify:agent
```

它覆盖的正是踩过的坑：早期用 `Start-Process -FilePath cmd.exe -ArgumentList '/c',$inner` 隐藏窗口启动，
经 Node 传参时引号被拼坏，cmd 立刻以 0 退出，Agent 从未起来（日志里表现为 `canvas-agent 退出，code=0` 反复出现）。
现在改为 `spawn("npx", …, { shell: true, windowsHide: true, detached: true })`，
停止则按监听端口反查进程再结束整棵树，不依赖启动时落盘的 pid。

## 已知限制与风险

- **画布数据存在 `http://127.0.0.1:17372` 这个源的浏览器存储里。** 换端口、清空 webview 数据都会表现为"画布没了"。需要迁移时用画布自带的导出功能，或优先使用设置里的 WebDAV 同步（上游已内置）。浏览器里已有的画布数据不会自动迁移过来。
- **上游 README 明确声明处于开发阶段、不保证历史数据兼容。** 升级 `fetch:web` 之前先导出备份；建议在 `fetch:web -- --ref <tag>` 里锁定一个可用版本。
- **前端与 canvas-agent 有协议版本闸门**（前端会校验 `protocolVersion`，当前为 6）。`fetch:web` 用的是最新前端、`npx` 拉的是最新 Agent，两者通常匹配；若出现"版本不匹配请重启"，把 `dshInfiniteCanvas.agentCommand` 固定到与前端匹配的 Agent 版本即可。
- **侧边栏 Codex 依赖本机的 `@openai/codex`**（canvas-agent 内部会调 `codex app-server`）。没有可用的 codex 时，画布本身与画布节点操作不受影响，只是 Agent 面板用不了。
  canvas-agent 自带一份 codex（日志里的 `Bundled Codex version`），因此**不装全局 codex 也能用**；
  日志里的 `Local Codex was not found` 只是提示，想用最新版可执行 `npm install -g @openai/codex@latest`。
  另外，若日志出现 `http://127.0.0.1:8080/mcp` 连接失败，那是**本机其它 MCP 服务**（codex 配置里注册的）不可达，
  与本扩展无关。
- **"停止本地 Agent"只认扩展自己拉起的实例。** 启动路径拿不到真实服务进程 pid（中间隔着 `npx`），
  因此停止时按"监听该端口的进程"反查再结束整棵树，且只有在端口确实有人监听时才动手，
  避免 pid 被系统复用后误杀无关进程。手动 `npx` 启动的 Agent 不在管理范围内。
- **Agent 的启动方式在 Windows 上很讲究**（三个坑都实测过）：不能用 PowerShell 的
  `Start-Process -ArgumentList '/c',$inner`（引号被拼坏，Agent 根本起不来）；不能用 `shell: true`
  （会弹出一个**可见的 cmd 窗口**，`windowsHide` 压不住）；也不能 `detached: true`（强制新建控制台，同样无法隐藏）。
  现在是 `spawn("cmd.exe", ["/c", "npx …"], { windowsHide: true })` 且不 detach，
  实测 2.5 秒起监听、零新增可见窗口；副作用是**扩展宿主退出时 Agent 会一起结束**，正好不留孤儿进程。
- **未启用上游的远程节点插件动态加载**。webview 里加载任意远程脚本存在策略冲突，当前没有放开。
- **面板 HTML 刻意不写 meta CSP。** 实测确认：VS Code 会把 webview HTML 里脚本的 `nonce` 属性剥掉、换成它自己的 nonce，
  因此一旦我们自己声明 `script-src "nonce-…"`，策略与实际 nonce 对不上，**页面上所有脚本都不会执行**。
  症状非常隐蔽——按钮点了没反应、尺寸调整失效、诊断静默不回传，**但 iframe 里的画布照常显示**，
  极易误判成"只是显示得小"。正确做法是交给 VS Code 注入的策略，脚本标签保留 `nonce` 属性即可。
- 本扩展仅做宿主与连接集成，画布能力、界面与数据格式全部来自上游；上游为 MIT 协议，本项目同样以 MIT 发布，并保留上游标识与链接。
