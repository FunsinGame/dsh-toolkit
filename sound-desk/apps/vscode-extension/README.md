# SoundDesk for VSCode

在编辑器里操作你的本地音效库：AI 语义搜索、UCS 分类、波形试听——不开浏览器、素材不出本机。

## 功能

| 命令（`Ctrl/Cmd+Shift+P`） | 说明 |
|---|---|
| `SoundDesk: 打开工作台` | 在编辑器标签页打开完整工作台 |
| `SoundDesk: 用选中的文字搜索声音` | 选中 `whoosh`、`金属门` 之类文字直接搜 |
| `SoundDesk: 添加素材库目录…` | 选一个文件夹索引，带进度与取消 |
| `SoundDesk: 试听` | 资源管理器右键任意音频文件 |
| `SoundDesk: 以声搜声（找相似）` | 资源管理器右键 |
| `SoundDesk: 重启本地引擎` | 改了设置或索引卡住时用 |
| `SoundDesk: 显示引擎信息` | 端口、数据目录、素材数、模型状态 |

另外：双击（或右键「打开方式」）`.wav` / `.flac` / `.mp3` 等音频文件，会用 **SoundDesk 音频编辑器**打开——波形、元数据、UCS 分类都能看能听。

## 设置

| 设置项 | 默认 | 说明 |
|---|---|---|
| `soundDesk.dataDir` | `~/.sounddesk` | 索引库、模型与波形缓存位置 |
| `soundDesk.loadModel` | `false` | 是否加载 CLAP 声音指纹模型（首次约 100MB 下载）。**关着也能用**关键词 + UCS 检索 |
| `soundDesk.autoStartEngine` | `true` | 激活时自动启动本地引擎 |
| `soundDesk.openInBrowser` | `false` | 同时在系统浏览器打开同一地址 |

## 工作原理

引擎**在扩展宿主进程内**运行（不 spawn 子进程）：因此不会有孤儿进程、不需要解析 stdout 找端口。UI 仍然通过 `http://127.0.0.1:<随机端口>` 通信，因为 webview 需要真实 URL 才能播放音频和加载波形。

- 只监听 `127.0.0.1`，端口由系统分配，每次运行生成新的随机 token
- webview 用 `vscode-webview://` origin 访问引擎，由引擎的 Origin 白名单允许
- CSP 显式放行引擎 origin 的 `media-src` / `connect-src`（否则会出现「有界面但没声音」）

## 开发

```bash
# 仓库根目录
pnpm install
pnpm -r build                                   # core / ucs / audio-wav / engine
pnpm --filter @sounddesk/web build              # UI 产物
cd apps/vscode-extension
npm run build                                   # esbuild 打包 + 复制 UI 与 UCS 数据
```

然后在仓库根用 VSCode 打开本目录，按 <kbd>F5</kbd>（`.vscode/launch.json` 已配好，会自动先跑 `npm: build`）。

`scripts/build.mjs` 做三件事，缺一不可：打包 `src/**` 为 `out/extension.js`；把 Web UI 复制到 `media/`；**把 `packages/ucs/data` 复制到 `data/`**（UCS 数据是随包内置的，CommonJS 打包后 `import.meta.url` 为空，加载器只能靠 `__dirname` 找到它）。

## 已知限制

- 引擎与 UI 共用 `packages/web` 的构建产物；改 UI 后需要重新 `pnpm --filter @sounddesk/web build` 再 `npm run build`
- 首次 `--add` 或打开未索引的音频文件会触发该目录的索引，大目录会有等待
- 语义搜索需要 `soundDesk.loadModel: true` 且已完成模型下载；否则自动降级
