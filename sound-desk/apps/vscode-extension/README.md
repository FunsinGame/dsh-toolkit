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

左栏的 **SoundDesk** 活动栏容器里有「素材库」视图，它同时也是插件的控制面板：

| 节点 | 说明 |
| --- | --- |
| **引擎状态** | 素材数、指纹覆盖、ffmpeg 是否可用；悬停给出引擎地址、数据目录、模型状态与错误 |
| （索引进度） | 有任务在跑时直接显示在「引擎状态」下方，例如 `扫描文件 42/100`，不用展开任何东西 |
| **打开工具页面** | 在编辑器里打开完整工作台 |
| **添加本地素材库** | 选一个目录并**完整索引到结束**（扫描 → 波形 → 声音指纹） |
| **刷新** | 重新读取素材库、播放列表与任务状态 |
| 素材库 / 播放列表 / 最近搜索 / 索引任务 | 真实计数；没有内容的分组整组不显示 |

**底部状态栏默认关闭**（`soundDesk.showStatusBar`，默认 `false`）：引擎状态、素材数量和索引进度都显示在侧边栏的「引擎状态」里，不必再占用底部那一条。想要那一行摘要的话把这个设置打开即可，它是可选保留项而不是删掉的功能。

## 导入素材库：全屏进度 + 导入期间锁定

在工具页面（工作台）左侧「素材库」区域点 **＋ 添加本地素材库**：

1. 弹出**原生目录选择框**——由扩展宿主提供，因为 webview 拿不到真实文件系统路径（`<input webkitdirectory>` 只给 `File` 对象，没有 path），而引擎需要一条能交给扫描器的路径。
2. 选定后工具**全屏显示进度条**，在此期间工作台不可操作：素材库还没索引完，此时的分类、计数和搜索结果都是不完整的，与其让你对着随时会变的数字点，不如先挡住。
3. 进度条不是另算一套：它直接由引擎的 job 事件驱动（`packages/web/src/state/importProgress.ts`），所以不会和索引进度说法不一致。三趟按顺序跑（扫描 → 波形 → 指纹），阶段名与 `done/total` 都来自真实任务；扫到之前总数未知时显示**不确定态**的滑动条，而不是一个看起来卡住的 0%。
4. 结束后显示一行摘要（索引了多少条、几个失败），点「开始使用」回到工作台。**没有取消按钮**：中途取消会留下一个"部分索引"的库，而没法告诉你哪部分是可信的。

没加载指纹模型时导入会跳过第三趟，摘要里会明确写"未生成指纹，语义搜索暂不可用"——而不是假装导入完整。

### 素材库缺指纹时：用「补齐指纹」，不要只点「重扫」

素材库条目上有两个按钮，区别很重要：

| 按钮 | 做什么 | 什么时候用 |
| --- | --- | --- |
| **重扫** | 只重跑**元数据**一趟（`runFastPass`）：新增/改动的文件进索引，已有指纹不动 | 目录里加了文件 |
| **补齐指纹** | 跑完**整条流水线**：扫描 → 波形 → 声音指纹 | 语义搜索说"没有可比对的向量" |

**为什么需要后者**：早先的重扫只调 `runFastPass`，永远不生成指纹。于是一个用 `--no-model` 索引过、或后续趟被中断的库，**无论重扫多少次都不会有指纹** —— 而界面恰恰在提示用户"重新索引一次"。指纹趟在真实库上是几十分钟的推理，所以它放在后台跑，进度照常走任务事件；没加载模型时接口会明确回报原因，而不是静默什么都不做。

浏览器模式没有这个按钮（拿不到目录路径），仍然显示 CLI 用法；按钮点了不会静默失败。

另外：双击（或右键「打开方式」）`.wav` / `.flac` / `.mp3` 等音频文件，会用 **SoundDesk 音频编辑器**打开——波形、元数据、UCS 分类都能看能听。

## 设置

| 设置项 | 默认 | 说明 |
|---|---|---|
| `soundDesk.dataDir` | `~/.sounddesk` | 索引库、模型与波形缓存位置 |
| `soundDesk.loadModel` | `false` | 是否加载 CLAP 声音指纹模型（首次约 100MB 下载）。**关着也能用**关键词 + UCS 检索 |
| `soundDesk.autoStartEngine` | `true` | 激活时自动启动本地引擎 |
| `soundDesk.openInBrowser` | `false` | 同时在系统浏览器打开同一地址 |
| `soundDesk.showStatusBar` | `false` | 在 VSCode 底部状态栏显示引擎状态。默认关闭——这些信息已经显示在侧边栏的「引擎状态」里 |

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
