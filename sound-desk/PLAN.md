# SoundDesk 实施方案：Web 音频资产管理工具 + VSCode 插件

> 目标：复刻 [soundseeker.cn](https://soundseeker.cn) 的核心能力（AI 语义搜索、以声搜声、UCS 自动分类、多轨叠层试听、拖进 DAW），做成 **一份 Web 前端 + 一个本地引擎服务**，既能直接浏览器打开 URL 使用，也能作为 VSCode 插件在编辑器内打开。
>
> 本文档给出可落地的技术选型、数据模型、接口协议，并**重点说明 AI 智能搜索与 UCS 分类的具体实现方式**。

---

## 0. 先明确对标功能（来自 SoundSeeker 官方文档的实地调研）

| # | SoundSeeker 功能 | 关键细节（其官网手册原文要点） | 我们的实现优先级 |
|---|---|---|---|
| 1 | **AI 语义搜索** | 自然语言描述找声音；中文直接搜、"会自动转成英文去匹配"；结果按相似度排序、不凑条数 | **P0** |
| 2 | **以声搜声** | 拖入 ≤1 分钟参考音频，或对库内素材 Ctrl+点击，找声学相似 | **P0** |
| 3 | **入库自动打标** | 入库时从声音本身识别类别/情绪/材质/空间/时间结构，**自动对齐 UCS**，可手动订正 | **P0** |
| 4 | **UCS 分类浏览** | 左侧按 UCS 主类→子类展开，带计数、过滤框、分类名多语言即时切换 | **P0** |
| 5 | **元数据与回写** | 读 WAV/BWF 内嵌元数据（描述、设计师、录音师、版权、库名）；编辑**写回磁盘原文件**（仅 WAV/BWF） | P1 |
| 6 | **自定义标签 / 收藏 / 播放列表** | 标签存在旁挂数据层，**不动原始文件** | P1 |
| 7 | **试听与波形工作台** | 零延迟首声、多声道波形、点跳转、选区、循环/倒放/变速（磁带式，变调） | P1 |
| 8 | **效果链（仅试听）** | EQ/滤波、失真、混响（空间预设）、距离、ADSR、随机化；可旁通、可复位；导出时把效果"印"进文件（`_fx`） | P2 |
| 9 | **多轨叠层（≤4 轨）** | 音量/声像实时调、自动错开、混成一个文件或分轨导出 | P2 |
| 10 | **拖进 DAW** | 桌面端 Ctrl+拖动波形 → 拖到 Pro Tools/桌面/文件夹 | P2（桌面端） |
| 11 | **关键词高级语法** | `wind (gust*, blow*) -window`：空格=与、逗号=或、`-`=排除、`*`=前缀通配、括号=分组 | P1 |
| 12 | **批量搜索 / 多栏对比 / 个性化排序** | 多行查询并排结果；结果栏可钉住/拖宽/独立排序；学习常用方向做轻度加权 | P2 |
| 13 | **增量入库 + 后台指纹进度** | 先"能用"（元数据+关键词），声音指纹后台逐步补全，可断点续跑 | **P0**（这是体验关键） |
| 14 | **本地私密** | 素材与搜索记录不出本机 | **P0**（默认全离线） |

**差异化判断**：SoundSeeker 是桌面 App（Tauri/Electron 类），我们把"引擎"抽成 **本地 HTTP 服务**，于是 Web 与 VSCode 插件天然共用同一套后端，这是本方案的核心结构优势。

---

## 1. 总体架构

### 1.1 三进程/三层模型

```
┌────────────────────────────── 客户端层（同一份 Web 包） ──────────────────────────────┐
│  A. 浏览器直开  http://127.0.0.1:<port>    B. VSCode Webview（vscode-webview://…）      │
│     同一套 React 资源，通过运行时环境探测切换 adapter：                                    │
│       browser adapter → File System Access API / <input type=file> / fetch 音频流         │
│       vscode  adapter → acquireVsCodeApi() 消息总线 + vscode.Uri 资源                       │
└───────────────────────────────────┬──────────────────────────────────────────────────┘
                                    │  REST + WebSocket（127.0.0.1:<port>，带 token）
┌───────────────────────────────────▼──────────────────────────────────────────────────┐
│                          SoundDesk Engine（本地 Node 服务，单进程多 worker）              │
│  Indexer  │  Metadata  │  Vector   │  Audio I/O  │  Search  │  Edit  │  Jobs/WS          │
│  chokidar │  SQLite    │  sqlite-  │  ffmpeg     │  混合检索 │  写回    │  进度推送         │
│  +hash    │  +FTS5     │  vec/HNSW │  +waveslice │  重排     │  BWF     │                  │
└───────┬───────────────────────────┬────────────────────────────┬─────────────────────┘
        │                           │                            │
┌───────▼─────────┐   ┌─────────────▼──────────────┐   ┌─────────▼──────────────┐
│ 模型推理层        │   │ 索引存储层                  │   │ 可选云端（可整体关闭）    │
│ ONNX Runtime     │   │ SQLite: catalog.db         │   │ 中文→英文 query 改写     │
│ CLAP text/audio  │   │  · assets / tags / ucs      │   │ LLM 二次重排（可选）      │
│ PANN/AST 打标     │   │  · embeddings(512d, f32)    │   │ 只发文本，不发音频         │
│ YAMNet 事件       │   │  · peaks/波形缓存            │   │                          │
└──────────────────┘   └─────────────────────────────┘   └─────────────────────────┘
```

### 1.2 技术选型（含理由）

| 层 | 选型 | 理由 / 备选 |
|---|---|---|
| 前端 | **React 19 + TypeScript + Vite**；TanStack Query（数据）、Zustand（UI 状态）、react-window（10 万行虚拟滚动） | 与 VSCode webview 兼容性最好；要出独立 Web 包用 Vite 最省事 |
| 波形/音频 | **Web Audio API + AudioWorklet**（播放链）+ **Canvas/WebGL 波形**（自研或 `wavesurfer.js` 打底后自绘） | 效果链与多轨叠层需要 AudioWorklet 粒度控制；wavesurfer 难以做"仅试听效果链 + 变速变调"的精确控制 |
| 本地服务 | **Node 20+ / TypeScript / Fastify**（比 Express 快，原生 schema 校验）+ `ws` | 与 VSCode 插件同语言，插件可 **in-process 复用同一 Engine 包**，不必重复实现 |
| 元数据 | `music-metadata@11.15.0`（关键词含 `bwf`/`slt`，BWF/iXML 已覆盖）为主，自研 WAV `bext`/`iXML`/`LIST-INFO` 精确读写为辅 | 读用现成的、写必须自研（`music-metadata` 是只读解析器，不支持回写） |
| 音频解码/波形 | **ffmpeg**（探测系统 ffmpeg，缺失时用 `ffmpeg-static`）+ **自研峰值金字塔生成器**（约 100 行：解码 → 分块 min/max/RMS → 多分辨率 pack） | 峰值金字塔是"零延迟首声 + 秒出波形"的关键；自研避免受第三方库维护状态影响 |
| 数据库 | **SQLite（`better-sqlite3`，同步 API 最适合索引 worker）**：`assets` + **FTS5** 全文索引 | 单文件、零运维、FTS5 自带 BM25 排序；10 万级素材无压力 |
| 向量 | **`sqlite-vec@0.1.9`**（首选，与 SQLite 同库同事务，含 Windows x64 预编译包）或 `hnswlib-node`（>50 万条时） | 512 维 × 20 万条 f32 仅约 400MB；同库避免双写一致性问题。注意其版本号为 0.1.x，**向量层要包一层 `VectorIndex` 接口**，便于将来替换 |
| 推理运行时 | **`@huggingface/transformers@4.3.0`（Transformers.js v3/v4）** 作为首选：自带 ONNX 加载、模型缓存与 **`@huggingface/tokenizers`**（CLAP 文本塔是 RoBERTa BPE，自己实现分词器极易出错） | 一个依赖同时解决"运行时 + 分词 + 模型下载/量化"；底层仍是 `onnxruntime-node@1.30` |
| 推理（备选/性能） | 直接用 `onnxruntime-node` + `optimum` 导出的自包含 ONNX | 需要自定义图（例如单独导出 text/audio 投影头）或需要 CUDA/DirectML/CoreML EP 时使用 |
| 音频特征 | 自研 DSP（RMS/峰值/谱质心/谱通量/衰减时间/立体声相关度） | 计算便宜，用于重排与筛选，不依赖 Python librosa |
| 桌面壳（P2） | **Tauri 2**（首选，体积小）或 Electron | 仅为"拖进 DAW / 原生拖拽 / 系统级文件监听"提供壳；引擎与 Web 包完全复用 |
| VSCode 插件 | **@typescript-eslint 风格 TS + esbuild** 打包，Custom Editor + WebviewPanel | 见 §7 |
| 测试 | **Vitest**（引擎/前端单测）+ `@vscode/test-electron`（插件集成）+ Playwright（Web E2E） | 直接沿用你仓库里 `vscode-csv-table` 的测试骨架 |

---

## 2. 目录结构（monorepo，pnpm workspace）

```
sound-desk/
├─ packages/
│  ├─ core/                 # 纯 TS，无 IO 副作用：类型、UCS 词表、查询解析、检索融合算法
│  ├─ engine/               # 本地服务：索引、DB、向量、推理、ffmpeg、WS、REST
│  │   ├─ src/indexer/      #   chokidar 监听 + 增量扫描 + 内容哈希去重
│  │   ├─ src/db/           #   schema.sql、迁移、FTS5 触发器
│  │   ├─ src/ml/           #   clap.ts、tagger.ts、tokenizer、ucs-classifier
│  │   ├─ src/audio/        #   decode.ts(ffmpeg)、peaks.ts、wav-write.ts、bwf.ts
│  │   ├─ src/search/       #   parse-query.ts、retrieve.ts、fuse.ts、rerank.ts
│  │   └─ src/http/         #   routes/*.ts、auth.ts、ws.ts
│  ├─ web/                  # React 应用（一份代码，两种运行宿主）
│  │   └─ src/platform/     #   adapter.browser.ts / adapter.vscode.ts / adapter.desktop.ts
│  └─ ucs/                  # UCS 数据集构建产物（categories.json、synonyms、zh-Hans 映射）
├─ apps/
│  ├─ desktop/              # Tauri 壳（P2）
│  └─ vscode-extension/     # VSCode 插件（P1）
├─ models/                  # 打包进 release 的 ONNX 模型（见 §3.2）
└─ scripts/build-models.mjs # 从 HuggingFace 拉模型 → 导出/量化 ONNX
```

---

## 3. AI 智能搜索：具体实现方式（重点）

SoundSeeker 的做法可以推断为 **多模态音频-文本对比学习模型（CLAP 类）+ 向量检索**，配合中文→英文的查询改写。下面给出可直接实施的完整方案。

### 3.1 检索链路总览

```
用户输入（中文/英文自然语言）
   │
   ├─(A) 查询规范化 parseQuery()   ← core/search/parse-query.ts
   │     · 判断意图象限：语义描述 / 文件名精确 / 关键词语法 / 以声搜声
   │     · 抽取结构化槽位（对象、材质、动作、空间、情绪、时长）
   │     · 检测文件名片段（含扩展名或下划线/连字符长串）→ 走精确路径
   │
   ├─(B) 查询改写 expandQuery()      ← 关键：CLAP 文本塔是英文语料训练的
   │     1) 本地词典直译（UCS 分类名 + 音效术语表，约 3–5k 条，完全离线）
   │     2) 可选：调用 LLM 产出 2–3 个英文候选写法（"metal door slam, heavy, warehouse reverb"）
   │     3) 合成最终 caption 集：原始 + 英文候选（各生成一个 embedding）
   │
   ├─(C) 多路召回（并行）
   │     ① 向量召回：CLAP text embedding × 全库 audio embedding，余弦相似度 Top-N（N=200）
   │     ② 关键词召回：SQLite FTS5 BM25（文件名 + 描述 + 关键词 + 自定义标签）
   │     ③ UCS 召回：若槽位命中 UCS 分类名/同义词 → 该分类下素材加先验分
   │     ④ 结构化召回：时长/采样率/声道/分类等筛选条件
   │
   ├─(D) 融合 fuse()：加权 RRF（Reciprocal Rank Fusion）
   │     score = Σ w_i / (k + rank_i)     k=60
   │     w_vector=0.30  w_fts=0.50  w_ucs=0.12  w_struct=0.08
   │     再乘个性化系数 δ（0.9–1.1，学习常用方向，默认中性）  ← 对应"个性化排序"
   │
   └─(E) 重排 rerank()   ← 已实现：packages/engine/src/rerank.ts
          · 词面重合 lexical：改写后的英文 caption 有多少词出现在素材自身文本里
            （文件名 / 内嵌描述 / 关键词 / UCS 分类名，按字段加权）
          · 分类一致 category：查询暗示的 UCS 分类与素材分类是否吻合
          · 声学一致 dsp：查询语义与素材声学形态是否矛盾（只扣分，不加分）
          · 融合分 fused：召回分作为基座，重排只“精修”而不用来推翻
          · 权重 fused 0.40 / lexical 0.34 / category 0.16 / dsp 0.10
          · 输出“诚实结果”：不设条数下限，低于阈值 τ 直接不返回
```

**实测修正 w_vector / w_fts**：计划里的 `0.60 / 0.20` 在 3,374 个游戏音效文件上实测后是**反过来的**——库内文件名本身信息量极大，BM25 关键词召回明显强于向量召回，而 CLAP 对游戏内部命名的区分度有限。20 条查询的规则化基准上，`0.30 / 0.50` 的综合 MRR 高于 `0.60 / 0.20`。默认权重因此改为 `vector=0.30, fts=0.50`，依据写在 `packages/core/src/rank.ts` 的注释里。

**重排不是交叉编码器（有意偏离计划）**：计划写的是“把 Top-50 的 (caption, 音频标签文本) 送小模型打分”。那需要在查询时对每个候选再跑一次文本塔，等于第二个模型 + 每查询上千次额外推理，对 CPU 端本地工具不成比例。实际实现改为融合**查询时已经免费拿到**的弱信号。实测收益（同一套规则化 ground truth，20 条查询）：

| 配置 | recall@10 | MRR |
| --- | --- | --- |
| 重排关闭（原始召回顺序） | 0.210 | 0.326 |
| 重排开启（§3.1(E)） | **0.300** | **0.531** |

诚实说明：其中 12 条“文件名锚定”查询上，纯关键词召回本身就强于**未重排**的语义召回；重排的价值在于把两种召回的排序真正合成一个更好的顺序，而不是“语义比关键词强”。另外 5 条改述查询样本量太小，其数字只能作参考。


**为什么必须做 (B) 查询改写**：CLAP 的文本塔在 AudioCaps/Clotho 等**英文**字幕上训练，中文 caption 直接编码会显著掉点。SoundSeeker 官网明确写"中文直接搜，会自动转成英文去匹配"，与我们方案一致。三级降级策略：本地词典（离线可用）→ 术语同义词扩展 → 可选 LLM。

**本地改写词典的具体做法**（这一步决定中文搜索能不能用）：

```jsonc
// packages/ucs/query-dict.zh-en.json  —— 约 3–5k 条，全部离线，装载 <1ms
{
  "金属撞击":   ["metal impact", "metal clang", "metal hit"],
  "沉闷":       ["muffled", "dull", "low-pitched"],
  "带点混响":   ["with reverb", "reverberant", "in a large space"],
  "空仓库":     ["empty warehouse", "large empty room", "abandoned warehouse"],
  "玻璃破碎":   ["glass break", "glass shatter", "breaking glass"],
  "清脆":       ["bright", "crisp", "high-pitched"],
  "小碎块":     ["small debris", "small shards", "tiny pieces"],
  "太鼓":       ["taiko drum", "japanese drum", "taiko"],
  "上升音":     ["riser", "rising tone", "build up"],
  "横扫声":     ["whoosh", "swish", "swoosh"],
  "冲击":       ["impact", "hit", "slam"]
}
```
改写算法（顺序替换 + 组合，而非逐词直译）：
```ts
// engine/src/search/expand-query.ts
function expandQuery(zh: string): { captions: string[]; debug: string } {
  const terms = splitByComma(zh);                       // "金属撞击，沉闷，带点混响"
  const parts = terms.map((t) => pick(pickFromDict(t), fallbackLemma(t)));
  // 用 UCS synynoymsZh 做二次召回，补上词典没覆盖的长尾词
  const caption = parts.map((p) => p[0]).join(', ');    // "metal impact, muffled, with reverb"
  const alt = [caption, joinFirstAlternatives(parts), zh];  // 原始中文也一起编码，取最高分
  return { captions: dedupe(alt), debug: caption };
}
```
**必须把改写结果暴露在 UI 上**（可编辑）。用户看到"金属撞击，沉闷，带点混响"→`metal impact, muffled, with reverb`，就能自己修正改写错误——这比在背后猜要诚实得多，也是 SoundSeeker "诚实结果"逻辑的延伸。

### 3.2 模型选型与落地细节

| 用途 | 模型 | ONNX 输入 / 输出 | 体积（int8 量化） | 备注 |
|---|---|---|---|---|
| **文本-音频对齐（主）** | **LAION-CLAP** `laion/clap-htsat-unfused` | `input_ids`+`attention_mask` → `text_embed(512)`；`input_features`(mel, 64×1001) → `audio_embed(512)` | 文本塔 ~65MB / 音频塔 ~110MB | 首选；中文需改写，见 §3.1(B) |
| 中文原生对齐（增强） | **中文 CLAP 变体**（如中文音频-文本对比模型） | 同上 | ~150MB | 作为第二文本塔，中文 query 直接编码，与主塔分数取 max/加权 |
| 音频事件打标 | **PANNs CNN14** 或 **AST**（AudioSet 527 类） | log-mel → `clipwise_output(527)` | ~80MB | 产出 AudioSet 标签，是 UCS 子类的强特征 |
| 环境/材质事件 | **YAMNet**（521 类） | 波形 16k → `scores(521)` | ~15MB | 轻量，快速补全 |
| 语音/音乐/噪声门控 | 简单 **VAD**（能量+过零率）或 Silero-VAD ONNX | 波形 → 语音概率 | ~2MB | 用于"对白库"场景过滤 |

**推理运行时的落地方式（推荐路径）**

```ts
// engine/src/ml/clap.ts  ── 注意：以下方法名以"已确认包可用、API 名待在实现时对齐版本"为准
import { AutoProcessor, ClapModel, env } from '@huggingface/transformers';

env.cacheDir = path.join(os.homedir(), '.sounddesk', 'models');   // 模型不进安装包
env.allowRemoteModels = true;                                     // 首次运行按需下载

const MODEL_ID = 'Xenova/clap-htsat-unfused';                     // 文本+音频双塔
const model = await ClapModel.from_pretrained(MODEL_ID, { dtype: 'q8' }); // int8 量化
const processor = await AutoProcessor.from_pretrained(MODEL_ID);

// 文本侧：分词 → 文本塔 → 512d
const textFeat = await model.get_text_features(await processor.tokenizer(texts, { padding: true }));

// 音频侧：48kHz 单声道 float32 → mel 特征 → 音频塔 → 512d
const audioFeat = await model.get_audio_features(await processor(audioFloat32_48k));
```
> 落地第 1 天要做的事：跑通这段（或等价调用），把**实际可用的方法与输出形状**记进 `engine/src/ml/README.md`。若该版本的 `ClapModel` 未暴露独立投影方法，就退回"完整 forward + 取对应输出张量"，或用 `scripts/build-models.mjs` 自导出只含投影头的两个 ONNX 图——两种路径都不影响上层设计。

**为什么优先 Transformers.js 而不是裸 ONNX**：CLAP 的文本塔是 **RoBERTa BPE** 分词器，手写 JS 分词几乎必然出现与训练时不一致的 token 序列，导致文本向量"看起来正常但检索质量明显下降"——这是最难排查的一类 bug。`@huggingface/transformers` 直接复用官方分词器与预处理（mel filterbank 参数），把这类风险降到零。

**模型可插拔（重要工程约束）**：`engine/src/ml/embedder.ts` 只暴露接口，具体实现可换：
```ts
export interface Embedder {
  readonly id: string;            // 写入 embeddings.model，换模型时可识别并重建
  readonly dim: number;
  embedText(texts: string[]): Promise<Float32Array[]>;
  embedAudio(pcm48kMono: Float32Array): Promise<{ mean: Float32Array; onset: Float32Array; frames?: Float32Array[] }>;
}
```
**必须在实现第一天就验证"ONNX 权重可得性"**：`Xenova/clap-htsat-unfused` 这类社区转换仓库的可用性会变化。因此 `scripts/build-models.mjs` 必须同时支持**自导出回退路径**（Python + `optimum-cli export onnx --model laion/clap-htsat-unfused`，分别导出 `ClapTextModelWithProjection` 与 `ClapAudioModelWithProjection` 两个自包含 ONNX），并在 CI 里加一个"模型加载冒烟测试"，避免某天发现下载源失效。


1. ffmpeg 解码为 **单声道 48kHz float32**（CLAP 要求 48k；PANN 要求 16k，各自独立解码或重采样）。
2. 取整段；若时长 > 10s，采用 **滑窗拼接**：以 10s 窗、5s 步长切分，**每窗各自 embed 后做 L2 归一化的加权平均**（权重按窗内 RMS 能量）；同时**保留首窗 embedding**。
   - 理由：音效常是"瞬时撞击 + 长尾混响"。均值 embedding 会稀释瞬态尖峰，因此**双向量方案**（`emb_mean` + `emb_onset`）在做"以声搜声"时分别检索再融合，明显提升撞击类命中率。
3. 未归一化前不要跨文件比较；统一 L2 归一化后用**点积 = 余弦**，这样 sqlite-vec 可用最简单高效的算子。
4. 缓存耗时：512 维 CPU 推理 10s 音频约 150–400ms/文件；10 万素材全量约 4–11 小时。**因此必须有 §4 的增量 + 后台队列设计。**

### 3.3 中文支持的第二条腿：UCS 词表做"零样本分类器"

CLAP 的零样本分类能力可以**顺手**用来做检索先验：把 UCS 的 22 个主类 + 800+ 子类的规范名（及其中/英同义词）拼成 prompt 模板：

```
"a sound effect of {UCS_SubCategory}, {synonyms}"
"a recording of {category_name} with {material} texture"
```

预先算好每个 UC 子类的 text embedding 并**缓存进 DB**（`ucs_prompts` 表）。检索时若是"类别词查询"（如"太鼓"），直接与这些缓存向量比较即可定位分类，无需为每次查询重新推理——既快又能纠正同类召回。

### 3.4 以声搜声（Query by Example）

同一套音频塔，无需新模型：

```ts
// engine/src/search/query-by-example.ts
async function searchSimilar(sourceAssetId, { mode = 'mean'|'onset', k = 100, mmr = 0.3 }) {
  const q = db.getEmbedding(sourceAssetId)              // 已缓存，零推理
  const hits = vec.search(q.emb_mean, k * 3)            // ANN 粗召回
  return mmrRerank(hits, { lambda: 1 - mmr })           // 最大边际相关，避免全是同一批录音
}
```
- 用户拖入外部参考音频时（≤60s）：入库到临时命名空间（`kind='probe'`，不写用户库目录），推理一次后检索，可设置"用完即删"。
- 对库内素材 Ctrl+点击：零推理，因为 embedding 已缓存 → 响应 <50ms。
- **切片精搜**（SoundSeeker 标注为"即将上线"）：在 WebAudio 里取选区 → 只把该段 PCM 送推理。我们**可以直接实现**，作为差异化功能；对长素材可用 **滑动窗最大相似度（Late Interaction / max-sim）**：把长文件预切成多个子向量存 `embments` 表，检索时取 max 而非 mean。

### 3.5 检索性能预算（目标值）

| 环节 | 目标 | 手段 |
|---|---|---|
| 库规模 | 20 万文件 | SQLite + sqlite-vec |
| 向量召回 | <30ms | HNSW/sqlite-vec，512d f32，Top-200 |
| FTS 召回 | <15ms | FTS5 + BM25，`unicode61` + 自定义中文分词（见下） |
| 融合+重排 | <10ms | 纯内存 |
| 端到端（不含 query 改写） | **<80ms** | —— |
| 端到端（含本地词典改写） | **<150ms** | 词典是内存 Map 查找 |
| 端到端（含 LLM 改写） | 500–1500ms | 可选、可关；命中缓存时 ~0ms |

**中文分词**：FTS5 默认不分中文词。方案：写入时用 `assets_search` 影子列存"字符级 n-gram（bigram）+ 英文分词"混合串，或用 `simple` 分词器自建。中文用 bigram 已足够（"金属门" → `金属 属门`），配合 BM25 效果可接受且零依赖。

---

## 4. 索引管线：如何做到"几分钟能用、后台越用越聪明"

这是 SoundSeeker 体验的关键，必须原样复刻——**分阶段索引**。

```
Stage 0  发现：chokidar 监听 + 递归扫描（本地盘 / NAS 挂载路径）
Stage 1  FAST（目标：10 万文件 < 3 分钟）
         · 只读文件头（WAV header / ffprobe -show_streams 只取元数据）
         · 提取：时长、采样率、位深、声道、格式、内嵌元数据(bext/iXML/INFO)
         · 计算内容指纹：**部分哈希**（前 1MB + 后 1MB + size）
         · 写入 assets 表 → 此时**已可浏览、可 FTS 关键词搜、可播放**
         · 并发：worker_threads 池 = max(2, cpus-1)，纯 IO 密集
Stage 2  WAVEFORM（与 Stage 3 并行，低优先级）
         · ffmpeg 解码 → 生成峰值金字塔（多分辨率，如 512/4096/32768 samples per peak）
         · 存 pack 文件（每库一个 .peaks pack，二进制）+ DB 偏移索引
         · **NAS 库的峰值缓存落在本地盘**（对应其"波形缓存留在本地，不反复读网络"）
Stage 3  EMBED（后台常驻队列，最慢，可断点续跑）
         · 取解码 PCM → CLAP 音频塔 → 512d 向量 → 写 embeddings 表
         · 优先级：最近观看/搜索命中的目录 > 新文件 > 老文件
         · 进度写 jobs 表，WS 推送 → 右下角进度条
         · 关机重启：扫描 assets 中 embedding IS NULL 的记录，从断点继续
Stage 4  TAG（可与 Stage 3 同一批次完成）
         · PANN/AST + YAMNet 输出 → 多标签；DSP 特征（包络/亮度/空间感）
         · → UCS 分类决策（见 §5）→ 写 ucs_category / tags / confidence
```

**增量语义**：以 `(dev, inode/FileId, size, mtimeNs)` 为变更键；拖入新素材只处理新增/变化项，绝不重推全库（对应其"往后再拖新素材进来，只会处理新增的那些"）。

---

## 5. UCS 分类：具体实现方式（重点）

### 5.1 UCS 是什么（必须先固化数据）

**Universal Category System** —— 音效行业公共领域分类标准（Tim Nielsen 等发起），当前 **8.2.1**（2024-01）。约 **29 个主 Category / 800+ SubCategory**，主类包括 AIR、AMBIENCE、ANIMALS、BELLS、BOATS、CROWD、DESIGNED、DOORS、ELECTRONIC、EMOTIONS、EQUIPMENT、FIRE、FOLEY、GUNS、HORNS、HUMAN、IMPACTS、MACHINES、MAGIC、MEDICAL、MOVEMENT、MUSICAL、NATURE、OFFICE、SCIFI、SPORTS、TOOLS、VEHICLES、WATER、WEAPONS、WHOOSHES 等。
>
> ⚠️ 主类数量与完整清单**必须在实现时从官方数据源解析生成**（`resources.universalcategorysystem.com` 的 Dropbox 资源库），不要手抄本文档的列表——本文档只用于说明结构，不是权威清单。

**CatID 命名规则**：SubCategory 的紧凑形式，如 `DOORWood`、`IMPACTMetal`、`WATERRiver`、`WOODHndl`（注意 8.2.1 修正了此缩写）。文件命名规范：`CatID_Description_Vendor_Creator_Source_...`，即 UCS 同时约束**分类**与**文件名结构**。

**数据落地**（`packages/ucs/`）：
```
categories.json     # 主类 / 子类：{ catId, category, subCategory, synonymsEn[], synonymsZh[], excludes[] }
synonyms.json       # 每个 catId 的同义词、排除词（UCS 8.2.1 大幅扩充了同义词表）
zh-Hans.json        # 官方中文译名 + 我们补充的俗名（"太鼓"→MUSICDrumTaiko）
build.mjs           # 从 UCS Dropbox 资源解析 → 固化版本号
```

具体形状（真实字段名以官方表为准，这里是我们的内部模型）：
```jsonc
// categories.json
{
  "version": "8.2.1",
  "source": "https://resources.universalcategorysystem.com/",
  "fetchedAt": "2026-05-01T00:00:00Z",
  "categories": [
    { "catId": "DOORWood",  "category": "DOORS",     "subCategory": "Wood",
      "synonymsEn": ["wooden door", "creaky door", "door wood open close"],
      "synonymsZh": ["木门", "木门吱呀", "开门", "关门"], "excludes": ["metal", "car"] },
    { "catId": "IMPACTMetal", "category": "IMPACTS", "subCategory": "Metal",
      "synonymsEn": ["metal impact", "clang", "metal hit", "sheet metal"],
      "synonymsZh": ["金属撞击", "金属敲击", "哐当"], "excludes": ["glass", "wood"] }
  ]
}
```
> ⚠️ 一定要**固化版本号并留存原始快照**（如 `ucs-8.2.1.snapshot.json`），否则上游改动会静默改变分类结果。

### 5.2 五级分类决策流水线

对于每个新素材，按顺序执行；**高置信度提前返回，低置信度逐级下探**，最终所有结果都带 `confidence` 与 `evidence`（可解释、可订正）。

```
                  ┌──────────────────────────────────────────────┐
   文件路径/文件名 → │ L0  文件名与路径规则解析（最高优先级，免费）      │
                  │  · 解析 UCS 规范名：^([A-Z][a-zA-Z]+)_(.*)$   │
                  │    → CatID 直接命中 → confidence 0.99        │
                  │  · 目录名匹配（/Guns/Handguns/、/Water/River/）│
                  │  · vendor 前缀（BOOM Library、Sound Ideas…）  │
                  └───────────────────┬──────────────────────────┘
                                      │ miss / 冲突
                  ┌───────────────────▼──────────────────────────┐
                  │ L1  内嵌元数据（BWF bext/iXML、LIST-INFO）      │
                  │  · iXML 的 <CATEGORY>/<SUBCATEGORY> 字段      │
                  │  · Description/Keywords → 走 L2 文本路径      │
                  └───────────────────┬──────────────────────────┘
                                      │ miss / 冲突
                  ┌───────────────────▼──────────────────────────┐
                  │ L2  CLAP 零样本分类（主武器）                   │
                  │  对每个候选 catId（先用 L1/关键词缩小到 Top-40  │
                  │  候选，不要真的对 800 类全算）计算：            │
                  │     s = cos(audio_emb, text_emb(catId))       │
                  │  取 softmax(s / τ)，τ≈0.07 → 概率分布         │
                  │  输出 Top-3 + 概率 + margin                    │
                  └───────────────────┬──────────────────────────┘
                                      │ margin 小 / 概率低
                  ┌───────────────────▼──────────────────────────┐
                  │ L3  声学特征规则校验（硬约束，纠正荒谬结果）      │
                  │  · 时长：<80ms 且无尾 → 排除 AMBIENCE/NATURE   │
                  │  · 衰减时间 RT60 估计 / 谱质心：               │
                  │      亮、起音快、宽频 → IMPACTS/METAL          │
                  │      低频主导 + 持续 → MACHINES/RUMBLE         │
                  │  · 立体声相关度：近 1.0 单声道源 → 多为 FOLEY  │
                  │  · 调性检测（自相关/谐波比）：判定 MUSICAL      │
                  │  · 是否含语音（VAD）→ HUMAN/DIALOGUE           │
                  └───────────────────┬──────────────────────────┘
                                      │ 仍不确定
                  ┌───────────────────▼──────────────────────────┐
                  │ L4  可选 LLM 裁决 + 人机协同                    │
                  │  · 把 (文件名, 内嵌描述, PANN Top-10 标签,      │
                  │    CLAP Top-3 候选) 作为文本送 LLM，要求只能   │
                  │    从给定候选中选并按 UC 层级输出 → 强约束      │
                  │  · confidence < 0.5 的进"待确认"队列，UI 高亮  │
                  └──────────────────────────────────────────────┘
```

### 5.3 L2 的关键工程优化：**分层剪枝，而不是 800 类暴力 softmax**

朴素实现会对 800 个 catId 各算一次文本 embedding 再比较——虽然文本 embedding 可**预计算并缓存**，但 top-k 比较仍是 800×512 点积（可忽略），真正的成本在**首次构建缓存**。做法：

1. **离线预计算**：构建时把全部 800+ catId（含同义词扩展 prompt，每个 catId 生成 3–5 条 prompt 取平均向量）编码一次 → `ucs_prompts` 表。这是**一次性成本**，约 1–2 分钟。
2. **两段式**：先只看 **22 个主类**（coarse，向量更可分）→ 取 Top-3 主类；再只在其中**展开子类**（fine）。准确率与全量接近，候选计算量降 ~90%。
3. **多标签而非单标签**：一个素材可同时是 `IMPACTMetal` + `DESIGNEDRiser`。对主类做 **sigmoid 多标签**（阈值 0.35），对选中的每个主类再取一个最优子类，最多保留 2 个子类（UCS 单值主分类 + 我们的附加标签）。
4. **可训练增强（P5，可选）**：积累 ≥2 万条"人工订正后的分类"后，在 CLAP 音频 embedding 上训练一个 **线性/MLP 探针（probe）**（512→800，多标签 BCE，几分钟训完）。这是成本最低、收益最大的一步：**音频 embedding 冻结，只训一个小头**。线上把 CLAP 零样本分与 probe 分加权融合。

### 5.4 UCS 的可见能力（对齐 SoundSeeker）

| 能力 | 实现 |
|---|---|
| 左侧按 UCS 树浏览 + 计数 | `SELECT ucs_cat_id, COUNT(*) FROM assets WHERE status='ready' GROUP BY 1`，树结构来自 `categories.json`，**计数实时缓存 5s** |
| 分类名多语言即时切换 | 分类显示名**不进 DB**，只存 `catId`；前端从 `zh-Hans.json` / `synonyms.json` 渲染。切换语言 = 换渲染字典，**零点数据迁移**（对应其"切完同步更新、自动记住"） |
| 过滤框即时定位 | 前端对 catId + 多语言名做模糊匹配（几十条，纯前端） |
| 手动订正 | 写 `assets.ucs_cat_id` + `ucs_source='manual'`，**永不被自动管线覆盖**（这是必须的优先级规则）；记录到 `feedback` 表供 §5.3(4) 训练 |
| AI 识别类别做筛选条件 | 分类 + `tags` 表统一进筛选 DSL |

### 5.5 与文件名规范化联动（顺手做一个"命名器"）

因为 UCS 同时定义文件名格式，我们可以提供一个差异化功能：**批量重命名为 UCS 规范名**——
`IMPACTMetal_Door Slam Heavy_MyLibrary_Zhang_20260501_01.wav`
由 L0–L2 的结果 + `Description` 自动拼装，预览后批量执行（**先复制/先出 CSV 映射，再改名，永不静默覆盖**）。

---

## 6. 数据模型与本地 API

### 6.1 SQLite schema（`engine/src/db/schema.sql` 摘要）

```sql
CREATE TABLE assets (
  id INTEGER PRIMARY KEY, path TEXT UNIQUE NOT NULL, lib_id INTEGER REFERENCES libraries(id),
  size INTEGER, mtime_ns INTEGER, dev INTEGER, inode INTEGER, content_hash TEXT, -- 部分哈希
  duration_ms INTEGER, sample_rate INTEGER, bit_depth INTEGER, channels INTEGER, codec TEXT,
  -- 内嵌元数据（只读展示用）
  em_description TEXT, em_keywords TEXT, em_designer TEXT, em_recorder TEXT,
  em_copyright TEXT, em_library TEXT, em_ixml TEXT,
  -- 我们的标签层
  ucs_cat_id TEXT, ucs_confidence REAL, ucs_source TEXT,      -- 'filename'|'ixml'|'clap'|'llm'|'manual'
  tags TEXT,              -- JSON 数组，自定义标签（旁挂，不改原文件）
  embedding_state INTEGER DEFAULT 0,   -- 0 待处理 1 已入库 2 已embed 3 已打标
  status TEXT DEFAULT 'ready', rating INTEGER DEFAULT 0, favorite INTEGER DEFAULT 0,
  created_at INTEGER, updated_at INTEGER
);
CREATE INDEX idx_assets_ucs ON assets(ucs_cat_id);
CREATE INDEX idx_assets_emb_state ON assets(embedding_state);

CREATE VIRTUAL TABLE assets_fts USING fts5(
  path, filename, em_description, em_keywords, tags,
  content='assets', content_rowid='id', tokenize='unicode61'   -- 中文走 bigram 影子列
);

CREATE TABLE embeddings (
  asset_id INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  emb_mean BLOB NOT NULL,       -- 512 × f32 L2 归一化
  emb_onset BLOB,               -- 首窗向量，用于撞击类检索
  frames BLOB,                  -- 可选：长素材的子窗矩阵，用于切片精搜
  model TEXT, dim INTEGER, updated_at INTEGER
);
CREATE VIRTUAL TABLE vec_index USING vec0(asset_id INTEGER PRIMARY KEY, emb_mean float[512]);

CREATE TABLE ucs_categories (cat_id TEXT PRIMARY KEY, category TEXT, sub_category TEXT, parent TEXT);
CREATE TABLE ucs_prompts (cat_id TEXT PRIMARY KEY, prompt TEXT, emb BLOB NOT NULL);  -- 预计算文本塔
CREATE TABLE ucs_aliases (cat_id TEXT, lang TEXT, alias TEXT, weight REAL);          -- 多语言+同义词

CREATE TABLE libraries (id INTEGER PRIMARY KEY, name TEXT, root TEXT, cover_path TEXT, kind TEXT);
CREATE TABLE jobs (id TEXT PRIMARY KEY, kind TEXT, total INTEGER, done INTEGER, state TEXT, eta_ms INTEGER, error TEXT);
CREATE TABLE feedback (id INTEGER PRIMARY KEY, asset_id INTEGER, old_cat TEXT, new_cat TEXT, at INTEGER);
CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT UNIQUE, color TEXT, use_count INTEGER);
CREATE TABLE playlists (id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE playlist_items (...);
```

> 存储估算：20 万素材 → embeddings 约 **410MB**（512×4B×20万 + 索引开销），SQLite 单文件完全可接受。若要省空间用 `float16` 存并检索时转换（精度损失 <1% 召回）。

### 6.2 本地 HTTP API（Web 与 VSCode 插件共用）

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/session` | Web 直开：无鉴权（仅 127.0.0.1）。插件：换取短期 token |
| `GET` | `/api/search?q=&mode=semantic\|keyword\|hybrid&filters=…&k=50` | 统一检索入口，返回 `items[]` + `scores` + `paths`(多路分数，用于"诚实结果"展示) |
| `POST` | `/api/search/similar` | 以声搜声：body 为 `{assetId, mode, offsetMs, durMs}`；也接受 multipart 上传 probe 音频 |
| `POST` | `/api/search/batch` | 批量搜索（多行查询并排） |
| `GET` | `/api/ucs/tree?lang=zh-Hans` | UCS 树 + 实时计数 |
| `GET` | `/api/assets/:id` | 详情（含内嵌元数据、标签、分类、UCS 证据链） |
| `PATCH` | `/api/assets/:id` | 修改我们的标签层（DB，绝不动原文件） |
| `PUT` | `/api/assets/:id/embedded-metadata` | **写回原文件**（仅 WAV/BWF），需 `confirm:true` |
| `POST` | `/api/assets/:id/reclassify` | 重跑 UCS 分类，返回候选与置信度（人机协同） |
| `POST` | `/api/libraries/scan` · `/api/libraries/:id/rebuild` | 扫描/重建索引（增量） |
| `GET` | `/api/media/:id/stream` | **支持 HTTP Range** 的音频流（关键：秒开、任意 seek） |
| `GET` | `/api/media/:id/peaks?lod=…` | 多分辨率峰值（二进制） |
| `GET` | `/api/assets/:id/wave?variant=fx` | 挂效果渲染后的音频（离线渲染后缓存） |
| `WS` | `/ws` | 索引进度、任务状态、搜索建议推送 |
| `POST` | `/api/export/render` | 多轨叠层混音导出（ffmpeg filter_complex 或 node 混音） |

**音频流必须支持 Range 且带 `Accept-Ranges`**——这是"点一下立刻出声、大文件不用整段读完"的实现要点，配合前端 `preload="metadata"` + 预取前 200ms。

### 6.3 本地服务的安全模型（**必须做，否则是本地任意文件读取漏洞**）

> 直接复用你仓库 `dsh-music-player/src/player/local-server.ts` 已跑通的模式（loopback-only + token + `allowedRoots` 白名单 + Range/206），并修掉它的两个已知弱点。

1. **端口用 `listen(0, '127.0.0.1')` 由操作系统分配**（不要硬编码 5178），实际端口写入 `~/.sounddesk/runtime.json`。Web 端靠这个文件或 stdout 中的 URL 发现端口；VSCode 插件里引擎是 in-process 的，直接把 `{port, token}` 注入 webview。
2. 启动时生成 `sessionToken` = **`crypto.randomBytes(32).toString('base64url')`**（⚠ 不要用 `Math.random` 的实现，`dsh-music-player` 的 `randomId(24)` 就是弱点）。
3. 所有 `/api/*` 校验 `X-SoundDesk-Token`；**校验 `Origin` 头**（防 CSRF：只允许 `http://127.0.0.1:<port>` 与 `vscode-webview://*`）。
4. **路径白名单**：`/api/media/:id` 只按 DB 里的 `asset_id` 取文件，**永不接受客户端传入的任意路径**。若保留按路径读取的接口（如 probe 音频），必须 `path.resolve()` 后校验落在已注册 `libraries.root` 之内（防 `../` 穿越），并限制扩展名。
5. VSCode webview 的 origin 与 `127.0.0.1` 不同源 → 需要 CORS 白名单 + token；**不要把 CORS 设成 `*`**。
6. WebSocket 握手同样校验 token（浏览器 `WebSocket` 构造函数**不支持自定义请求头**，因此 WS 用 `?token=` 查询参数——这也正是 `dsh-music-player` 用 `?token=` 的原因；同时务必校验 `Origin`）。

---

## 7. VSCode 插件实现要点

### 7.1 与 Web 的关系（核心设计）

**不做两套 UI**。`packages/web` 构建出一份静态产物，插件通过 `asWebviewUri` 加载同一份文件；差异只在 `packages/web/src/platform/` 这一层适配器：

```ts
// packages/web/src/platform/index.ts
export interface PlatformAdapter {
  id: 'browser' | 'vscode' | 'desktop';
  pickFolder(): Promise<string | vscode.Uri | null>;
  openExternal(url: string): void;
  onHostMessage(cb: (m: HostMessage) => void): void;
  postToHost(m: HostMessage): void;
  showSaveDialog(defaultName: string): Promise<string | null>;
  revealInOS(path: string): void;      // browser: 不支持 → 降级为"下载"
  canDragToDAW: boolean;               // desktop:true, 其他:false → UI 自动隐藏该提示
}
```
探测：`typeof acquireVsCodeApi !== 'undefined'` → vscode；`window.__SOUNDDESK_DESKTOP__` → desktop；否则 browser。

> **已验证的现状（重要）**：你仓库里的 `dsh-music-player` 和 `vscode-csv-table` **都不能在浏览器里直接跑**——
> - `dsh-music-player/src/webview/api.ts:23` 无条件调用 `acquireVsCodeApi()`，且所有状态都从 `window.addEventListener('message')` 来，没有浏览器回退；它**也没有独立 `index.html`、没有 dev server**（`media/webview.js` 是 `scripts/build-webview.mjs` 手工拼接的 IIFE）。
> - `vscode-csv-table/src/editor/webviewHtml.ts` 的 CSP 是 `default-src 'none'` + 仅把 `webview.cspSource` 和 nonce 脚本列入白名单，同样只为 webview 设计。
>
> 所以"一份 UI 两种宿主"这件事**必须从第一天就设计进去**，不能事后补：`platform/` 适配器抽象 + Vite 真实产物 + `http(s)://` 下能独立启动的开发/生产入口。否则你会得到两个越走越远的分支。


### 7.2 插件功能清单

| 贡献点 | 实现 |
|---|---|
| 命令 `soundDesk.open` | `WebviewPanel`（`ViewColumn.Beside`），加载本地引擎 URL 或内嵌资源 |
| 命令 `soundDesk.indexFolder` | `showOpenDialog({canSelectFolders:true})` → 调 `/api/libraries/scan` |
| 命令 `soundDesk.searchSelection` | 把编辑器里选中的文字作为查询打开面板（**VSCode 独有体验**：写代码时看到 `whoosh` 就搜一下） |
| Custom Editor `*.wav/*.aif/*.flac` | 音频文件的**自定义编辑器**：波形 + 元数据 + 分类 + 试听（可参考你仓库 `vscode-csv-table` 的 CustomEditor 模式） |
| Explorer 右键：`以声搜声`、`设为参考音频`、`加入播放列表` | `menus.explorer/context` + `when: resourceExtname =~ /\.(wav\|aiff?\|flac\|mp3\|ogg)$/` |
| 状态栏 / 进度 | `window.withProgress` + 订阅 `/ws` 的索引进度 → 状态栏显示"索引中 1234/50000" |
| 配置项 | `soundDesk.engine.port`、`soundDesk.engine.autoStart`、`soundDesk.models.dir`、`soundDesk.cloud.enabled` |
| **引擎生命周期** | 插件激活时若检测到端口无响应 → **in-process 启动 Engine**（`import { startEngine } from '@sounddesk/engine'`），不 spawn 子进程，避免沙箱/管道问题；退出时 `deactivate()` 关闭 |

> 复用你已有仓库的经验：`dsh-music-player` 的 `src/host`/`src/net`/`src/webview` 分层与本地媒体服务、`vscode-csv-table` 的 CustomEditor + webview 资源加载 + `@vscode/test-electron` 骨架，都可以直接迁移过来，能省掉一大半脚手架工作。

### 7.3 CSP 与资源加载（易踩坑）

```ts
const csp = [
  `default-src 'none'`,
  `img-src ${webview.cspSource} data: blob:`,
  `media-src ${webview.cspSource} http://127.0.0.1:${port} blob:`,   // 音频流必须显式放行
  `connect-src http://127.0.0.1:${port} ws://127.0.0.1:${port}`,
  `style-src ${webview.cspSource} 'unsafe-inline'`,
  `script-src 'nonce-${nonce}'`,
].join('; ');
```
注意：`media-src`/`connect-src` 若不显式放开 `http://127.0.0.1:port`，波形能画但**完全没有声音**，且控制台只报 CSP 警告——这是最常见的坑。（`dsh-music-player/src/host/html.ts` 用了宽松的 `media-src ${webview.cspSource} https: http: data: blob:` 来绕开；我们应改成**精确到 `http://127.0.0.1:<port>`**。）

### 7.4 可直接复用的既有代码（已核对文件与行号）

| 需求 | 直接抄的地方 | 说明 |
|---|---|---|
| Custom Editor 注册骨架 | `vscode-csv-table/src/extension.ts:19-31` | `registerCustomEditorProvider(VIEW_TYPE, provider, { webviewOptions: { retainContextWhenHidden: true } })`。注意它用的是 `CustomTextEditorProvider`（编辑同一个 `TextDocument`）——**音频不适用**，我们要用 `CustomEditorProvider`（`openCustomDocument` 返回自定义文档对象），因为音频是二进制、走引擎而不是 `document.getText()` |
| 双向消息协议形态 | `vscode-csv-table/src/editor/session.ts:57-65` + `:517-532` | 用 `type` 判别联合 + **`opId` 请求/响应关联**（webview 分配、host 回显）+ 单调 `revision` 做新鲜度判断。这套模式直接搬到"搜索请求/结果"上即可，但**要加一层 Promise map**，因为它原设计只做 fire-and-forget |
| 本地 HTTP 媒体服务 | `dsh-music-player/src/player/local-server.ts` | 纯 `node:http`、`listen(0,'127.0.0.1')`、token、`allowedRoots` 白名单、Range→206/416、`Cache-Control: no-store`。**这是我们 `/api/media/:id/stream` 的现成模板** |
| CSP + nonce 生成 | `vscode-csv-table/src/editor/webviewHtml.ts:27-72` / `dsh-music-player/src/host/html.ts` | nonce 生成、`asWebviewUri`、`localResourceRoots` 的写法 |
| 测试与构建骨架 | `vscode-csv-table/package.json:191-199`、`dsh-music-player/scripts/run-tests.mjs` | `tsc` 编译 + 顺序执行测试脚本的方式。**注意 `dsh-music-player` 刻意不用 `node --test`**（在受限沙箱里 per-file `spawn` 会 EPERM），沿用它的 `run-tests.mjs` 顺序执行法更稳 |
| 音频元数据解析参考 | `dsh-music-player/src/player/metadata.ts`（523 行，零依赖） | ID3/FLAC/OGG/MP4 都有，可整体搬来；**但它不处理 WAV/BWF/iXML**，这部分要新写 |
| 启动/调试配置 | 两个仓库的 `.vscode/launch.json` | `extensionHost` 配置 + `preLaunchTask: npm: compile` |

**不要照抄的**：`dsh-music-player` 用"内存对象 + `globalState` + `library.json`"做存储。对 20 万素材、需要 ANN 检索与 BM25 全文排序的场景，JSON 方案会直接崩掉——**必须上 SQLite**。

---

## 8. 音频播放与效果链实现（P1/P2）

| 需求 | 实现 |
|---|---|
| 零延迟首声 | `<audio src="/api/media/:id/stream">` + Range + 预取；或 WebAudio `AudioBufferSourceNode` 流式 `decodeAudioData` 分块 |
| 变速变调（磁带式） | `AudioBufferSourceNode.playbackRate`（音高同步变化，正是"速度和音高一起变"）；`preservesPitch` 保持 false |
| 倒放 | `AudioBuffer.getChannelData().reverse()`（大文件走 worker） |
| 循环 | `source.loop = true` + `loopStart/loopEnd`（配合选区） |
| EQ/滤波 | `BiquadFilterNode` 链（lowshelf/peaking/highshelf）+ `getFrequencyResponse()` 画实时频响曲线 |
| 失真 | `WaveShaperNode` + 多组 curve 预设（温暖饱和 / 复古数字） |
| 混响 | 空间预设 → 程序化生成 `ConvolverNode` 的 IR（噪声 + 指数衰减 + 早期反射），避免打包大 IR 文件；或 ONNX 跑轻量 RIR 生成 |
| 距离 | 高频滚降（`BiquadFilter` lowpass，cutoff 随距离↓）+ 直达/混响比（dry/wet gain） |
| ADSR 包络 | `GainNode.gain` 用 `setValueCurveAtTime` 或 `AudioParam` 分段 |
| 旁通 / 复位 | 整链 dry/wet 总开关 + 参数快照/恢复 |
| 导出"印"效果 | **离线渲染**：`OfflineAudioContext` 跑同一套节点图 → 编码 WAV（自研 `wav-write.ts`，或 ffmpeg）→ 文件名加 `_fx` |
| 多轨叠层（≤4 轨） | 4 条 `AudioBufferSourceNode` → 各自 Gain/Panner → 汇总；自动错开 = 起始时间按顺序偏移；导出可混单文件或逐轨（对应"混成一个文件或分轨拖出"） |

**设计原则**：试听效果链 **只作用于 WebAudio 图，绝不改原文件**；只有"导出/拖出"时通过 `OfflineAudioContext` 渲染，与 SoundSeeker 行为一致。

**实现说明（与计划的偏离）**：上表的技术选型按实测调整过，实际实现见 `packages/audio-effects`。

| 计划 | 实际 | 原因 |
| --- | --- | --- |
| AudioWorklet 图 | 标准节点图（`BiquadFilter` / `WaveShaper` / `Convolver` / `Gain`） | 这些效果全部是内置节点的能力范围。AudioWorklet 要写 DSP 内核、只跑在音频线程、无法在 Node 里离线验证；标准节点图可以直接在 `OfflineAudioContext` 里跑，也能用 `node-web-audio-api` 在测试中渲染真实采样。 |
| 效果链自己接目的地 | 链只是处理块，输出由调用方接线 | 链内部自连会多出一条未处理的直达声路径，实测会把每轨声像完全绕过（硬左时右声道仍有干声电平）。 |
| 多轨混音前逐个试听 | 每轨独立效果链 + 自动错开三种方式 | 叠层的意义在于能分别处理每层（一层给混响、一层保持干声），所以链必须按轨而不是全局。 |

这些偏离都有测试覆盖：`effects.test.ts`（34 条）与 `mix.test.ts`（27 条）断言的是渲染出来的采样，不是节点描述符。

---

## 9. 分阶段实施计划

| 阶段 | 交付物 | 关键验收标准 | 预估 |
|---|---|---|---|
| **P0-1 骨架** | monorepo、`core` 类型与 UCS 数据构建、Fastify 服务、SQLite schema + 迁移 | `pnpm dev` 起服务，`/api/ucs/tree` 返回 22 主类 | 3–4 天 |
| **P0-2 入库与浏览** | chokidar 扫描、Stage1 元数据、峰值、Range 流、UCS 树浏览 UI、虚拟列表、试听 | 拖入 1 万文件 → 3 分钟内可浏览/可播/可 FTS 搜 | 1 周 |
| **P0-3 向量与语义搜索** | ONNX 接入、CLAP 文本/音频塔、`ucs_prompts` 预计算、query 改写词典、RRF 融合、搜索 UI（多路分数可视化） | 中文"金属门重重关上，空仓库"Top-5 主观命中；端到端 <150ms | 1.5 周 |
| **P0-4 UCS 自动分类** | L0–L3 流水线、证据链展示、手动订正与优先级规则、"待确认"队列 | 抽检 200 条，L0+L2 命中率 ≥75%，可解释 | 1 周 |
| **P0-5 以声搜声** | 库内 Ctrl+点击、外部 probe 拖入、MMR 去重、切片精搜（差异化） | 库内相似搜索 <50ms | 4–5 天 |
| **P1-1 VSCode 插件** | WebviewPanel、Custom Editor（音频）、发送选区搜索、右键菜单、索引进度、引擎自启 | `.wav` 双击在 VSCode 内出波形可播；搜索可用 | 1 周 |
| **P1-2 元数据编辑与写回** | WAV/BWF bext/iXML 读写、确认弹窗、iXML 编辑 | 改描述后重新加载仍在；iXML 校验通过 | 4 天 |
| **P1-3 标签/收藏/播放列表/备份** | 旁挂标签层、导出导入备份 | 备份导入后收藏与历史恢复 | 3 天 |
| **P2-1 效果链与多轨** | AudioWorklet 图、预设、离线渲染导出 | 旁通/复位无爆音；`_fx` 导出正确 | 1.5 周 |
| **P2-2 桌面壳与拖进 DAW** | Tauri 壳、原生拖拽导出（Ctrl+drag） | 可拖到桌面/Pro Tools 得到文件 | 1 周 |
| **P2-3 多栏对比 / 批量搜索 / 个性化** | 结果栏、批量检索、学习型加权（可关） | 多栏可钉住/拖宽/独立排序 | 1 周 |
| **P3 增强** | 分类 probe 微调、LLM 重排、中文 CLAP 第二塔、多人协作/云端库（可选） | —— | 持续 |

**总计**：到 P1 结束（Web + 插件 + AI 搜索 + UCS）约 **6–7 周**单人全职；P2 全部约 **+3.5 周**。

---

## 10. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| CLAP 对中文直接编码效果差 | 搜索体验崩 | 本地改写词典（离线兜底）→ 术语扩展 → 可选 LLM；UI 上把改写后的英文 query 显示出来（可编辑，用户能自己修正） |
| 首轮全库 embedding 太慢（10 万 ≈ 数小时） | 用户以为坏了 | **Stage 分级索引**（几分钟可用）+ 明确的进度条 + 断点续跑 + 优先级队列；提供"只索引我搜过的目录"模式 |
| 模型体积/分发（~300MB） | 安装包巨大 | int8 量化；模型**首次运行时按需下载**到 `~/.sounddesk/models`；提供"仅关键词模式"（不下载也能全功能除 AI 搜索） |
| 纯 CPU 推理慢 | 老机器体验差 | 默认 8s 窗 + 16kHz 预筛；支持 DirectML/CoreML/CUDA EP 探测；embedding 队列限流不影响前台 |
| 本地服务安全 | 任意文件读取 | §6.3 的 token + Origin 校验 + 路径白名单 + 只绑 127.0.0.1 |
| UCS 上游变更 | 分类静默漂移 | 固化 8.2.1 快照 + 版本号入库；升级作为显式迁移 |
| NAS 大库 IO 慢 | 波形/试听卡 | 峰值与 probe 缓存落本地盘；DB 与缓存分离目录；扫描限速（nice/ionice 等价：并发上限 + 自适应退避） |
| VSCode webview CSP/Range | 有波形无声音 | §7.3 显式 `media-src`/`connect-src`；集成测试里加"能播出声"的自动断言 |
| WAV 回写损坏原文件 | 数据丢失 | 写回前**自动备份到 `.sounddesk/backup/`** + 先写临时文件再原子 rename + 校验；仅 WAV/BWF |

---

## 11. 与 SoundSeeker 的差异点（可作卖点）

1. **零安装 Web 版**：浏览器直接开 `http://127.0.0.1:5178` 就能用，不必装桌面 App。
2. **VSCode 原生集成**：音频文件自定义编辑器、选中文字即搜、Explorer 右键"以声搜声"——这是 SoundSeeker 没有的场景（程序员/技术音频/游戏音频工程师在代码库里工作）。
3. **切片精搜**：SoundSeeker 标注"即将上线"，我们 P0-5 直接做（长素材子向量 + max-sim）。
4. **UCS 命名器**：自动生成 UCS 规范文件名并批量重命名（带 CSV 预览映射，安全可回滚）。
5. **可解释分类**：每条分类都带证据链（文件名/内嵌/iXML/CLAP 概率/声学规则），而不是黑盒。
6. **完全离线 + 可选云增强**：默认不发任何数据；开启 LLM 改写时**只发文本 query，绝不发音频**，且在 UI 明示。

---

## 12. 立即可执行的第一步（建议）

```bash
# 1) 初始化 monorepo
pnpm init && pnpm add -Dw typescript vitest esbuild
# 2) 固化 UCS 数据（关键前置，别跳过）
node packages/ucs/build.mjs --version 8.2.1   # → categories.json / synonyms.json / zh-Hans.json
# 3) 拉模型并导出 ONNX
node scripts/build-models.mjs --models clap-text,clap-audio,panns --quantize int8
# 4) 起最小引擎，验证"入库 → FTS 搜 → Range 播放"闭环
pnpm --filter @sounddesk/engine dev
```

**先做 P0-2 + P0-3 的垂直切片**：一个小目录（200 个文件）+ 完整"扫描 → 元数据 → embedding → 中文语义搜索 → 试听"链路跑通，再横向放大规模。不要先做 UI 细节。
