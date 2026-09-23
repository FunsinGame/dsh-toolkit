# SoundDesk

本地优先的 AI 音频资产管理工作台 —— 复刻 [soundseeker.cn](https://soundseeker.cn) 的核心能力（AI 语义搜索、以声搜声、UCS 自动分类、波形工作台），做成 **一份 Web 前端 + 一个本地引擎**，既能用浏览器直接打开 URL 操作，也能作为 VSCode 插件在编辑器内打开。

设计文档见 [`PLAN.md`](./PLAN.md)，架构图见 [`diagrams/sounddesk-architecture.html`](./diagrams/sounddesk-architecture.html)。

---

## 当前进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0-1 | monorepo 骨架、`core` 类型与查询语言、UCS 数据集 | ✅ 完成 |
| P0-2 | 扫描入库、WAV/BWF 元数据、DSP 特征、峰值、Range 流、分级索引 | ✅ 完成 |
| P0-3 | 混合检索（FTS5 BM25 + 向量 + UCS 先验 + RRF）、中文查询改写 | ✅ 完成（向量层需模型） |
| P0-3 | **重排（PLAN §3.1(E)：词面 / 分类 / 声学信号融合）** | ✅ 完成（recall@10 0.210→0.300，MRR 0.326→0.531） |
| P0-4 | UCS 分层分类（L0 文件名 → L1 iXML → L2 零样本 → L3 声学规则） | ✅ 完成（L2 需模型） |
| P0-5 | 以声搜声（库内零推理） | ✅ 引擎完成 |
| P1-1 | **Web UI（三栏工作台 + 波形 + 试听）** | ✅ 完成 |
| P1-1 | **VSCode 插件（工作台面板 + 音频自定义编辑器 + 命令）** | ✅ 完成 |
| P1-2 | **元数据写回（WAV/BWF：bext / iXML / LIST-INFO）** | ✅ 完成 |
| P2 | 效果链、多轨叠层、拖进 DAW | ⬜ 未开始 |

**已可运行**：浏览器或 VSCode 里都能完成「扫描入库 → 分类浏览 → 中英文搜索 → 波形试听（循环/倒放/变速）→ 查看与订正分类 → 编辑内嵌元数据并写回文件」全流程。

---

## 快速开始

```bash
pnpm install
pnpm -r build                # 构建 core / ucs / audio-wav / engine
pnpm --filter @sounddesk/web build   # 构建 UI

# 索引一个目录、启动服务、并用浏览器打开
node packages/engine/dist/cli.js --data-dir ~/.sounddesk \
  --add "D:/SoundEffects" mylib --no-model \
  --web-root packages/web/dist --open
```

引擎会把带 token 的地址打印出来，同时写入 `<data-dir>/runtime.json`：

```json
{ "port": 54321, "token": "…", "url": "http://127.0.0.1:54321" }
```

打开 `http://127.0.0.1:<port>/?token=<token>` 即进入工作台。也可以用 `?q=金属门&play=12` 做深链：预填查询并直接试听某条素材。

### 界面

- **左**：素材库列表（含重扫）、UCS 分类树（只显示有素材的类别，带实时计数、过滤框）、索引/指纹/波形缓存统计
- **中**：结果列表（虚拟滚动）。顶部显示**中文改写后的英文 caption**（语义搜索出错时你可以直接看出来）；结果 0 时说明原因而不是用劣质匹配凑数
- **右**：详情 —— 技术信息、声学特征（峰值/RMS/衰减/谱质心/高频占比/调性）、UCS 分类与**证据链 + 备选**（可一键订正，订正后自动分类不再覆盖）、自定义标签、内嵌 BWF/iXML 元数据
- **底**：波形（点跳转、拖动框选）、播放/循环/倒放/磁带式变速/音量

键盘：`Space` 播放暂停，`Esc` 清除选区。

### 开发模式

```bash
# 终端 1：引擎（不需要 --web-root）
node packages/engine/dist/cli.js --data-dir ~/.sounddesk --port 8791
# 终端 2：Vite 带 HMR，/api 与 /ws 自动代理到引擎
pnpm --filter @sounddesk/web dev
```

然后访问 `http://127.0.0.1:5178/?token=<token>`。

### CLI 参数

| 参数 | 说明 |
|---|---|
| `--add <dir> [name]` | 注册目录为素材库并索引 |
| `--data-dir <dir>` | 索引库/模型/峰值缓存位置（默认 `~/.sounddesk`） |
| `--no-model` | 不加载 CLAP 模型，只启用关键词 + UCS 检索 |
| `--port <n>` | 固定端口（默认由系统分配） |
| `--web-root <dir>` | 托管构建好的前端（`packages/web/dist`） |
| `--scan-only` | 只索引后退出 |
| `--open` | 用默认浏览器打开 UI |

---

## 架构

```
浏览器 / VSCode Webview
        │  REST + WebSocket（127.0.0.1 + token）
        ▼
  @sounddesk/engine      索引 · 检索 · 流媒体 · 任务
        │
  ┌─────┴─────┬──────────────┬───────────────┐
  ▼           ▼              ▼               ▼
@sounddesk/  @sounddesk/   sqlite           @huggingface/
audio-wav    ucs          (node:sqlite)    transformers
WAV/BWF/     UCS 数据 +   FTS5 + 向量      CLAP 双塔
iXML + DSP   中文改写      + 元数据
```

### 包

| 包 | 职责 | 运行时依赖 |
|---|---|---|
| `@sounddesk/core` | 领域类型、查询语言解析、FTS5 生成、RRF/MMR 融合 | 无 |
| `@sounddesk/audio-wav` | WAV/BWF/iXML/INFO 解析、PCM 解码、DSP 特征、峰值金字塔 | 无 |
| `@sounddesk/ucs` | UCS 数据集（178 CatID 种子）、中文查询改写词典、UCS 文件名解析 | 无 |
| `@sounddesk/engine` | SQLite、分级索引、混合检索、HTTP/WS 服务、模型接入 | fastify, ws, chokidar, transformers |
| `@sounddesk/web` | 工作台 UI（浏览器 + VSCode webview 双宿主） | react, react-dom |
| `apps/vscode-extension` | VSCode 插件：在扩展宿主内跑引擎，面板 + 音频自定义编辑器 | esbuild（打包时） |

## VSCode 插件

```bash
cd apps/vscode-extension
npm run build        # 打包 + 复制 Web UI 与 UCS 数据集
```

然后在仓库根按 <kbd>F5</kbd> 启动扩展开发宿主。命令、设置与实现说明见 [`apps/vscode-extension/README.md`](apps/vscode-extension/README.md)。

引擎**在扩展宿主进程内**运行（不 spawn 子进程）：没有孤儿进程，也不需要解析 stdout 找端口。UI 仍通过 `http://127.0.0.1:<随机端口>` 访问，因为 webview 需要真实 URL 才能播放音频、加载波形。

---

## 关键实现说明

### 1. 存储用 `node:sqlite`，没有原生编译步骤

Node 24 内置的 SQLite（3.53）编译了 **FTS5 + bm25**，因此不需要 `better-sqlite3`。这意味着 `pnpm install` 在任何平台都不需要编译工具链。向量检索目前是内存中的线性余弦扫描（目标规模数万文件下是个位数毫秒），`VectorIndex` 类就是将来替换成 ANN 索引的接缝。

### 2. 中文检索靠索引期的 bigram 展开

SQLite 内置分词器不切分中文。写入时把中文串展开成字符 bigram 存入 FTS 列（"金属门" → `金属 属门`），查询时同样展开，因此"金属"和"门"都能命中，BM25 排序仍然有效。英文 camelCase 会在索引期拆开（`DOORWood` → `door wood`）。

### 3. 语义搜索依赖中文→英文改写

CLAP 文本塔在英文语料上训练。`@sounddesk/ucs` 提供 494 条中文→英文查询词典 + UCS 同义词表，把"金属门重重关上，空仓库"改写成 `metal door`。改写结果通过 `captionsUsed` 返回给调用方，**UI 应该把它显示出来让用户修正**——这比在背后猜要诚实。

### 4. UCS 分类是分层的，且可解释

- **L0 文件名**：UCS CatID 前缀（`DOORWood_...`）直接采信；否则把文件名 token 和**目录名**一起打分
- **L1 内嵌元数据**：iXML `CATEGORY`/`SUBCATEGORY`，或描述/关键词
- **L2 零样本**：CLAP 对候选 CatID 打分（需模型）
- **L3 声学规则**：时长/衰减/音调/频谱质心对荒谬结果降权

打分的关键在于区分证据强度：CatID(3.0) > 类别码(2.0) > 同义词(1.0) > 子类名(0.5)。子类名之所以权重低，是因为"Metal"这种材质描述同时适用于多个类别——`Impacts/Metal/metal_clang.wav` 必须归到 `IMPACTMetal` 而不是 `DOORMetal`。

每条结果都带 `confidence` 与 `evidence`（如 `directory "Impacts": impacts, metal`），人工修改记为 `source='manual'`，**自动管线永不覆盖**。

### 5. 分级索引，先能用再变聪明

`stage` 是单调阶梯：`1 元数据 → 2 峰值 → 3 向量 → 4 完整`。Stage 1 只读文件头 + 有界的 DSP 窗口，几万文件几分钟完成，之后库立刻可浏览、可搜、可播。峰值和向量在后台补，靠 `stage < N` 查询天然支持断点续跑。

> 注意：分类**不**推进 stage（它发生在元数据阶段）。早期版本让它推进到 4，导致后续 embedding 阶段认为无事可做——这个 bug 有测试覆盖。

### 6. 重排（PLAN §3.1(E)）：把"大致对"变成"顺序对"

多路召回的 RRF 融合只给出一个大致的先后，而真实库上这个顺序经常不对。实测 3,374 个游戏音效文件，"sword swing" 前四名的 caption 相似度是 0.677 / 0.667 / 0.652 / 0.647——**挤在一起，向量分数根本分不开**。重排就是来解决这个的。

**有意不做交叉编码器**：PLAN 里写的是"把 Top-50 的 (caption, 音频标签文本) 送小模型打分"。那需要在查询时对每个候选再跑一次文本塔，等于第二个模型 + 每查询上千次额外推理，对 CPU 端本地工具不成比例。改为融合**查询时已经免费拿到**的四个弱信号：

| 信号 | 含义 | 权重 |
| --- | --- | --- |
| `fused` | 召回融合分，作为基座 | 0.40 |
| `lexical` | 改写后的英文词有多少出现在素材自身文本里（文件名 / 描述 / 关键词 / UCS 名，按字段加权） | 0.34 |
| `category` | 查询暗示的 UCS 分类与素材分类是否吻合 | 0.16 |
| `dsp` | 声学形态是否与查询语义**矛盾**（只扣分，不加分） | 0.10 |

`lexical` 是收益最大的一项，因为它能看见纯 caption 相似度看不见的证据：`ui_town_coins_sprk_med_07.wav` 的文件名里就写着 `coins`。

**实测收益**（20 条查询，同一套规则化 ground truth）：recall@10 **0.210 → 0.300**，MRR **0.326 → 0.531**。

**两个踩过的坑，都有回归测试**：

1. 第一版把 `lexical` 从分母里去掉（"没匹配就不计权"），结果**没有**词面证据的候选被更小的分母归一化，反而拿到**更高**的分——正好把要加的信号倒过来了。实测 recall@10 从 0.130 掉到 0.095。现在 `fused` 和 `lexical` 恒定计入分母，`category`/`dsp` 只在真有信息时才计入（无分类提示、无 DSP 时不惩罚）。
2. 词匹配允许前缀（`coins`↔`coin`、`skel`↔`skeleton`），但**短于 4 个字符的词只能精确匹配**，否则 `med`↔`metal`、`pro`↔`prop` 这类库内噪音会满天飞。试过再加一条长度比例上限，实测基准**完全没变**（两种规则下都是 0.300 / 0.531），却砍掉了 `dark`↔`darkestdungeon`、`room`↔`roomtransition` 这些**有用**的匹配（真实复合词本来就长），所以撤掉了。

重排的每个分量都随结果返回（`score.rerank`），Web UI 在详情面板的「排序依据」里显示，结果行也用 tooltip 解释——**排在前面的理由应该能被用户看到**，否则没法信任。

> 编辑本仓库时注意编码：在 Windows 上用 PowerShell 的 `Set-Content` / `-replace`、或 `node -e` 里传 `\uXXXX` 转义，都会破坏非 ASCII 文本（前者写成 UTF-16，后者被 shell 吃掉转义）。用编辑工具或 Node 脚本文件改写。`pnpm check:encoding` 会扫描所有源文件并报告乱码。

### 7. 元数据写回：唯一会碰用户文件的功能

写回是风险最高的操作，所以规则是硬性的：

- **只改 RIFF 容器**（WAV/BWF）。其他格式直接拒绝——转码会改变音频本身。`GET /embedded` 会告知是否可写及原因
- **音频字节原样复制**，只重建元数据 chunk；`fact`/`cue `/`smpl` 等未知 chunk 也逐个搬运
- **每类 chunk 独立管理**：改 iXML 不会动 `bext`，也不会删掉 LIST/INFO 标签
- **写回前先备份一次**到 `<dataDir>/backups/`（`sha1(绝对路径)` 命名，可读且唯一）；重复编辑不会覆盖那份原始备份
- **先写临时文件 → fsync → rename**，崩溃时原文件完好
- **提交前重新解析**：重建结果必须能 probe 成合法 WAVE 且**帧数一致**，否则中止并保留原文件
- **需要 `confirm: true`**，UI 会先弹出字段级 diff 确认；`?dryRun` 可只预演

iXML 里没有 `bext` 时会给出警告而不是伪造一个 `bext` 块——bext 带时间参考与 UMID 语义，工具不该凭空捏造。

---

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 免鉴权存活探针 |
| GET | `/api/session` | 服务信息 |
| GET | `/api/libraries` | 素材库列表 |
| POST | `/api/libraries` | `{root, name?, kind?}` 注册并后台索引 |
| POST | `/api/libraries/:id/rescan` | 增量重扫 |
| DELETE | `/api/libraries/:id` | 移除库（只删索引，**不动磁盘文件**） |
| GET | `/api/search?q=&mode=&limit=&filters…` | `mode` = semantic / keyword / hybrid / similar |
| POST | `/api/search` | 同上，JSON body |
| GET | `/api/search/similar/:assetId` | 以声搜声（库内，零推理） |
| GET | `/api/assets?libraryId=&limit=&offset=` | 列表 |
| GET | `/api/assets/:id` | 详情（内嵌元数据、DSP、UCS 证据链） |
| PATCH | `/api/assets/:id` | 改标签/收藏/评分/UCS 分类（**不碰原文件**） |
| POST | `/api/assets/:id/reclassify` | 重跑分类并返回候选 |
| GET | `/api/assets/:id/embedded` | 内嵌元数据是否可写、是否有备份 |
| PUT | `/api/assets/:id/embedded` | **写回 WAV/BWF 文件**（需 `confirm: true`） |
| POST | `/api/assets/:id/embedded/restore` | 从备份恢复原文件 |
| GET | `/api/media/:id/stream` | 音频流，**支持 Range/206** |
| GET | `/api/media/:id/peaks` | 峰值金字塔（`SDPK` 容器），缺失时按需生成 |
| GET | `/api/ucs/tree` | UCS 树 + 实时计数 |
| GET | `/api/ucs/lookup?q=` | 别名/CatID 查询 |
| GET | `/api/jobs` | 索引任务与进度 |
| POST | `/api/jobs/:id/cancel` | 取消任务 |
| WS | `/ws?token=` | 任务进度推送 |

---

## 安全模型

这是个能读取本机任意音频文件的本地服务，因此：

1. **只绑 `127.0.0.1`**，端口由系统分配（没有可猜的固定端口）
2. 每次启动生成 32 字节 `crypto.randomBytes` token，所有 `/api/*` 校验
3. 校验 `Origin` 头（浏览器 CSRF 防护，同时是 VSCode webview 能访问的机制）
4. **媒体只按 asset id 寻址**，客户端永远不能传路径；任何路径访问都会 `resolve` 后校验是否落在已注册库根目录内
5. WebSocket 用 `?token=` 传凭据（浏览器不允许在握手时自定义头），同时仍校验 `Origin`
6. **`/api/media/*` 与 `/api/ws` 也接受 `?token=`**：`<audio>` 和波形 `fetch` 无法设置自定义头。这是与 `Origin` 校验配合的，而不是替代它——一个恶意网页即使用正确 token 发出请求，也会被 `Origin` 白名单拦下

> 说明：token 的真实作用是防「本机其他程序顺手指使服务读你的文件」，`Origin` 校验才是防浏览器的关键一环，两者缺一不可。

---

## 开发

```bash
pnpm -r typecheck
pnpm -r test

# 单个包
cd packages/engine
node --import ../../tools/register.mjs --experimental-strip-types src/e2e.test.ts
```

> 测试用 `--experimental-strip-types` 直接跑 TypeScript 源码。因为源码是 NodeNext ESM（import 带 `.js` 后缀），需要 `tools/register.mjs` 这个 20 行的解析器把 `./x.js` 映射到 `./x.ts`。**不要用 `node --test`**：它按文件 spawn 子进程，在受限沙箱里会 EPERM，所以每个测试文件也可单独直接执行。

### 模型（可选）

语义搜索需要 CLAP ONNX 权重：

```bash
node packages/engine/dist/cli.js --data-dir ~/.sounddesk --add "D:/SFX"   # 省略 --no-model
```

首次运行从模型主机下载到 `<data-dir>/models`（约 350MB，q8 量化）。

**模型主机默认用 `https://hf-mirror.com`**，因为 `huggingface.co` 在部分网络不可达（当前环境就是）；镜像仓库布局与官方一致。可用 `SOUNDDESK_HF_HOST` 覆盖。

若模型不可用，引擎会降级为关键词 + UCS 检索并继续正常工作，`embedderError` 说明原因。

**已实测**（用 CLAP 可识别的合成声：雨、引擎、脚步、嗡鸣、金属撞击、掠过声）：rank-1 命中率 4/6，且分值分离良好（金属撞击 0.48 对次名 0.14；嗡鸣 0.285 对 0.141）。说明检索管道正确；`SIMILARITY_THRESHOLD = 0.12` 是在这个实测基础上校准的（CLAP 的正确匹配落在 ~0.2–0.5，而早期草稿用的 0.35 会把绝大多数真实命中过滤掉）。

---

## 已知限制

- **只解码 RIFF（WAV/BWF/RF64）**。FLAC/MP3/AIFF 等能被扫描并入库（靠扩展名与文件名检索），但没有解码就没有波形和声音指纹。接入 ffmpeg 是下一步。
- **UCS 数据集是 178 条种子子集**（`complete: false`），不是官方 8.2.1 全量。`packages/ucs/scripts/build-ucs.mjs` 可从官方导出覆盖，但需要手工拿到该文件。种子中多数 CatID 拼写未对官方核对。
- **中文分类名是社区译法**，非官方翻译。
- **向量检索是线性扫描**；超过约 5 万文件需要考虑 ANN 索引。
- **CLAP 真实模型的检索质量已在合成声上验证**（4/6 rank-1，分值分离良好），但尚未在真实录音素材上做大规模评测。合成演示库的分数会明显偏低且挤在一起——那是演示素材不具代表性，不是检索管道的问题。
- **语义搜索模型下载默认走 `hf-mirror.com`**（`huggingface.co` 在本机不可达）；用 `SOUNDDESK_HF_HOST` 覆盖。
- **浏览器的自动播放限制**：首次发声需要一次用户交互（点击），这是浏览器策略而非缺陷；UI 会提示「点一下播放按钮」。
- **元数据写回只支持 WAV/BWF**。FLAC/MP3 等的标签写入需要各自的容器实现，目前一律拒绝而不是转换。
