# dsh-design-doc-extension

在 Chrome / Edge 里打开设计文档，鼠标停在任意一段上，**Ctrl+C 直接复制它的章节坐标**——`job-10-2|p3` 这种，和 DSH 插件注入的 `data-dd-path`、`Tools/DesignSync/design-map.json` 的 key 完全一致。

不连 DSH、不起本地服务、不读写文件、没有构建步骤。

## 安装

Chrome 和 Edge 步骤一样：

1. 打开 `chrome://extensions`（Edge 是 `edge://extensions`），右上角打开**开发者模式**。
2. 点**加载解压缩的扩展**，选这个目录：`dsh-toolkit\dsh-design-doc-extension`。
3. 进扩展详情页，打开**允许访问文件网址**。
   - 文档是双击 `.html` 用 `file://` 打开的：必须开，否则扩展注入不进去。
   - 文档由本地 http 服务提供（`http://127.0.0.1:…` / `localhost`）：不用开。

装完把扩展图标固定到工具栏，点它打开侧边栏。

## 用

| 操作 | 结果 |
|---|---|
| 鼠标移到正文上 | 块被虚线框住，旁边小条显示坐标和章节 |
| **Ctrl+C**（没有选中文字） | 复制坐标，底部提示「已复制 …」 |
| 焦点在侧边栏时按 Ctrl+C | 同样复制当前悬停/固定的坐标——点过工具栏图标之后焦点常常不在页面上 |
| 先选中文字再 Ctrl+C | 还是浏览器自己的复制，不抢 |
| 点一下某个块 | 固定它（蓝色实线），鼠标可以移开再复制；`Esc` 或再点一次取消 |
| **Alt+C** | 不依赖 Ctrl+C 的那条路，直接复制当前悬停/固定的坐标（可在 `chrome://extensions/shortcuts` 改键） |
| 右键 → 复制坐标 / 复制坐标 + 原文 / 复制完整上下文 | 三种格式任选 |
| 点工具栏图标 | 侧边栏：当前坐标、已复制历史、复制清单、格式与开关 |

顶部固定住一个块之后，悬停别处不会把固定丢掉——按 Ctrl+C 复制的始终是固定的那个，方便反复取同一处的坐标。

## 复制格式

| 格式 | 复制出来的内容 |
|---|---|
| `coord`（默认） | `job-10-2|p3` |
| `coord-text` | 坐标 + 换行 + 原文 |
| `context` | 坐标、文档（标题与相对路径）、章节（章 › 小节）、原文 |

侧边栏的**复制清单**把历史整理成一段可以直接丢给 AI 的单子：

```
【设计文档坐标清单】共 3 处
1. modules/jobs/documents/01-jobs.html · job-10-2|p3
   JOB-10 · 十、技能 › 10.2 位置记号
   原文：位置记号○ 不可用；…
```

## 坐标是怎么算出来的

规则和插件宿主半侧（`lib/host.js` 的 `collectPaths`）是同一个：

```
<scope>|<tag><n>       例如 job-10-2|p3
<scope>|.              该 id 元素本身（章节标题）
```

`<scope>` 是最近的一个 `id`、`<n>` 是这一节里同标签可编辑块的第几个。有两处容易写错：一是**前面那个兄弟子树里的 id 不会漏出来**（只有子树根自己的 id 算），二是 `<n>` 是**按 scope + 标签**计数，不是按父节点。

宿主是解析 `.html` 字节算的，扩展只能看渲染后的 DOM，所以 `src/dd-path.js` 把同一条规则重写了一遍。`scripts/test-paths.mjs` 用宿主自己的解析器跑真实文档库，把两边的坐标序列逐条比对（当前是 18 篇文档、七千多个坐标，全部一致）。

页面是 DSH 插件托管的（`/dsh-design-doc/site/...`）时，扩展优先用宿主注入的 `data-dd-path`——那是字节解析的结果，比 DOM 推断更权威；侧边栏的「当前坐标」会标出来源是 `宿主注入` 还是 `页面计算`。

### 页面脚本自己重建的块

有的块是页面脚本现造的：`scripts/enemy-blocks.js` 把每张敌人表拆成「详情表 + 数值表 + 技能表」再塞回去。这时 DOM 里的 `<td>` 比源码多得多（九幽 2.2 这一节：源码 143 个坐标，渲染后 542 个），顺序也变了（技能行还会插一列、调两列）。**按 DOM 数出来的 `td12` 和源码里的 `td12` 不是同一个格子**，所以扩展不再给这些格子编号：

- 由 `<tr data-stats>` 生成的那种卡片 → `nine-02|enemy1`（章节 id + 第几只），和 DSH 插件敌人面板用的是同一个 key；
- 没有 `data-stats` 的卡片 → 直接显示「无源码坐标」，Ctrl+C 会说明原因，不给一个对不上的坐标。

想知道某篇文档差多少：`npm run compare -- <file.html> [scope-id]`，会把源码侧和渲染侧的坐标并排列出来。

## 边界

- **只读。** 不写回 `.html`，也不改文档里的任何东西（只加一个不吃事件的高亮层和临时 outline）。要改文档还是回 DSH 插件。
- **不给代码关联。** `design-map.json` 在 `Tools/DesignSync` 下，浏览器扩展读不到；侧边栏只给坐标。需要「这一节绑了哪些 `.cs`」时回 DSH 插件看，或把坐标贴给 AI。
- **敌人表是特例。** 敌人表是页面按 `<tr data-stats>` 现场重建的，格子没有源码坐标：有 `data-stats` 的卡片给 `nine-02|enemy1`（和 DSH 插件敌人面板同一个 key），没有的卡片只提示「无源码坐标」。
- **坐标不写在文件里。** `data-dd-path` 是托管时注入的，`.html` 源文件里没有这个属性，`design-map.json` 也只有章级的 key。所以拿坐标去 grep 一定找不到——要么让插件（它按规则解析）去定位，要么带上原文：给 AI 用「坐标 + 原文」或「完整上下文」格式比纯坐标可靠得多。
- **只注入顶层页面**，文档里的 iframe 不处理。
- **只在“像设计文档”的页面启用**：`body[data-doc]`、`section.module[id]`、引用 `styles/docs.css`，或 URL 里带 `/Docs/Design/`。侧边栏的「启用本页」可以强制在任何页面打开（任意网页都能按 id 作用域取坐标）。
- **在 DSH 窗口里不叠加**：DSH 的设计文档是插件自己的 iframe 提供的，扩展只注入顶层页面，所以在 DSH 里看到的是插件自己的高亮和面板——那边功能更全，不需要这个扩展。
- **侧边栏**要 Chrome/Edge 116+（`chrome.sidePanel`）。更老的浏览器点图标会退回标签页里打开同一个面板。

## 开发

```powershell
cd C:\g-workspace\deepseek-harness\dsh-toolkit\dsh-design-doc-extension
npm run check      # node --check 四个源文件
npm test           # 坐标交叉验证 + jsdom 里的真实内容脚本测试
npm run test:e2e   # 真浏览器：加载扩展、悬停、按 Ctrl+C、读剪贴板
npm run compare -- <file.html> [scope-id]   # 源码侧 vs 渲染侧坐标差异
npm run icons      # 重画图标（Pillow）
npm run zip        # 打成 dsh-design-doc-extension.zip
```

`scripts/test-content.mjs` 在 jsdom 里加载真实文档和真实内容脚本，验证悬停出坐标、Ctrl+C 拦截、选中文字时不拦截、点固定、Esc 取消、宿主属性优先、非文档页不启用。jsdom 从 `..\..\dsh-console\node_modules\jsdom` 借；找不到就跳过——扩展本身零依赖。

`scripts/test-browser.mjs` 起一个本地静态服务、用 `--load-extension` 拉起无头 Chromium、走 CDP 派发真实鼠标移动和 Ctrl+C，再读剪贴板。它需要能正常启动浏览器的终端：在 DSH 自己的沙箱里 Chrome 起不来（Crashpad 要开命名管道，被拦），那种环境下它只会报一句启动失败，`npm test` 不包含它。

## 文件

```
manifest.json        MV3：content script、service worker、侧边栏、快捷键
src/dd-path.js       坐标规则（DOM 版）+ 三种复制格式
src/content.js       悬停高亮、Ctrl+C、固定、敌人表、消息
src/background.js    工具栏、右键菜单、快捷键、复制历史
src/sidepanel.*      侧边栏：当前坐标、历史、清单、设置
scripts/             test-paths / test-content / test-browser / compare-rendered / make-icons
media/               icon16/32/48/128 + icon.ico
```
