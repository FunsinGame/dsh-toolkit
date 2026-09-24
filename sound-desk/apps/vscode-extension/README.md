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
| `SoundDesk: 刷新素材库视图` | 侧边栏刷新（索引或改播放列表之后） |
| `SoundDesk: 加入播放列表` | 资源管理器右键音频文件；没有就新建一个 |
| `SoundDesk: 设为参考音频` | 资源管理器右键；目前只打开工作台并说明原因（见「已知限制」） |
| `SoundDesk: 打开播放列表` | 侧边栏播放列表节点，或从命令面板里选一个 |
| `SoundDesk: 复制文件路径` | 复制当前音频标签页/所选文件的完整路径 |
| `SoundDesk: 在文件管理器中显示` | 在系统文件管理器里定位该文件 |

左栏的 **SoundDesk** 活动栏容器里有「素材库」视图：素材库、播放列表、最近搜索、正在跑的索引任务，以及一行引擎信息。所有数字都来自真实目录（素材库条数、播放列表条数、`42/100` 这样的索引进度），没有内容的分组不会显示。

同时有一个状态栏项（`$(music) SoundDesk · 3383`），点它打开工作台；悬停能看到引擎地址、数据目录、素材/指纹数量、UCS CatID 数量、模型状态、ffmpeg 是否可用。**索引进行中时它显示进度而不是素材数**（`$(sync~spin) SoundDesk · 扫描文件 42/100`，tooltip 里也有一条「正在进行」）——一个静默跑的大库索引看起来和卡死没区别。可用 `soundDesk.showStatusBar` 关掉。

另外：双击（或右键「打开方式」）`.wav` / `.flac` / `.mp3` 等音频文件，会用 **SoundDesk 音频编辑器**打开——波形、元数据、UCS 分类都能看能听。

## 设置

| 设置项 | 默认 | 说明 |
|---|---|---|
| `soundDesk.dataDir` | `~/.sounddesk` | 索引库、模型与波形缓存位置 |
| `soundDesk.loadModel` | `false` | 是否加载 CLAP 声音指纹模型（首次约 100MB 下载）。**关着也能用**关键词 + UCS 检索 |
| `soundDesk.autoStartEngine` | `true` | 激活时自动启动本地引擎 |
| `soundDesk.openInBrowser` | `false` | 同时在系统浏览器打开同一地址 |
| `soundDesk.showStatusBar` | `true` | 在状态栏显示引擎状态（素材数量、语义搜索、ffmpeg） |

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

## 打包成 .vsix

```bash
cd apps/vscode-extension
npm run pack:vsix        # → dist/sound-desk-vscode.vsix（约 145 MB）
code --install-extension dist/sound-desk-vscode.vsix --force
```

**为什么需要专门的打包脚本**：esbuild 会把 `@sounddesk/*` 和 `vscode` 之外的实现全部打进 `out/extension.js`，但**故意留了 externals** —— `@huggingface/transformers`、`onnxruntime-node`、原生 `.node` 二进制。理由是它们靠自身所在目录定位预编译二进制，打进 bundle 就找不到自己了。

开发时这些包是 pnpm 通过隐藏 hoist 解析到的；而 `.vsix` 是个 zip，没有符号链接，**照默认方式打出来的包能装上、但一 `require` 就死**。所以流程是：

| 步骤 | 命令 | 做什么 |
| --- | --- | --- |
| 1 | `npm run stage:vsix` | 收集 `out/`、`media/`、UCS 数据与运行时依赖到 `.vsix-stage/` |
| 2 | `npm run check:vsix` | 断言这些依赖**只**从 stage 内部解析得到，并真的能加载 ONNX 运行时 |
| 3 | `npm run pack:vsix` | 1+2 之后调用 `vsce package --no-dependencies` |
| 4 | `npm run verify:vsix` | 解压产出的 VSIX，在里面 require 一次 bundle |

三个容易踩的坑，都已固化在脚本里：

1. **运行时依赖放在 `out/node_modules/`**，不是顶层。`vsce` 会无条件剔除任何顶层 `node_modules`（`.vscodeignore` 的取反也压不住），而 `out/` 不在剔除范围；这同时也正好是 Node 从 `out/extension.js` 出发查找模块的第一站。
2. **打包时 manifest 的 `type` 改成 `commonjs`**。源码是 `"type": "module"`（给 Node 类型剥离用），但 esbuild 产出的是 CommonJS，声明与产物矛盾会让按路径加载 bundle 的宿主报 `module is not defined in ES module scope`。
3. **UCS 数据放在 `out/data/`**，且 `categories.seed.json` 不能删。加载器靠 `__dirname` 找同级 `data/`，而它是**探测这个目录是否存在的那个文件**——删掉它会在启动时抛 `UCS dataset not found`。

**体积**：约 145 MB。其中 CLAP 模型（`.cache/Xenova/clap-htsat-unfused`）153 MB、`onnxruntime-node` 64 MB（只保留 `win32/x64`，全平台是 287 MB）。也就是说**模型是随包内置的，装完即可离线做语义搜索**，不用再下载。想换平台重打：`npm run stage:vsix -- --all-platforms`。

## 已知限制

- Web UI 只认两个深链接参数 `q`（查询词）与 `play`（素材 id），所以**「设为参考音频」和「打开播放列表」还没有链接可用**：前者会打开工作台并提示把文件拖到「参考音频」区域，后者会打开工作台并提示在左侧查看。这里宁可说实话，也不编一个看着有效、实际什么都不做的参数
- 引擎与 UI 共用 `packages/web` 的构建产物；改 UI 后需要重新 `pnpm --filter @sounddesk/web build` 再 `npm run build`
- 首次 `--add` 或打开未索引的音频文件会触发该目录的索引，大目录会有等待
- 语义搜索需要 `soundDesk.loadModel: true` 且已完成模型下载；否则自动降级
