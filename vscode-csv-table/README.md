# dsh-csv-table — CSV 表格视图

一个 VS Code 扩展：把 `.csv` / `.tsv` 文件以**表格**形式显示，支持常用的表格操作，并且在**编辑器页签栏**提供一个视图 / 文本模式切换按钮 —— 使用方式和 Markdown 的「预览 / 文本」切换完全一致。

扩展的界面文案、命令提示、代码注释与本说明文档统一使用中文。

表格视图是一个 **自定义文本编辑器**（`CustomTextEditorProvider`），背后仍然是同一个 `TextDocument`：所以撤销、重做、保存、脏标记、外部改动同步、以及「文本模式」下的一切编辑都与表格视图共享同一个缓冲区。切到文本模式不会丢失未保存的修改，也不会产生第二份文档。

```
#  │  A ▼     │  B ▼     │  C ▼        ← 固定列号 + 排序下拉三角
───┼─────────┼─────────┼─────────
1  │  姓名    │  年龄    │  城市
2  │  李安安  │  31     │  柏林, 德国
```

顶部的固定条只显示列号（`A`、`B`、`C`…，超过 26 列后是 `AA`、`AB`…）与每列右侧的排序下拉三角 `▼`；文件里的每一行，包括第一行，都作为数据行显示。

## 功能

### 页签栏视图 / 文本切换

- 打开一个 CSV 后，页签栏右侧出现 **$(table) 表格视图** 按钮，点击即在当前标签组把该文件切换为表格视图。
- 处于表格视图时，同一个位置变成 **$(code) 文本模式** 按钮，点击切回文本编辑器。
- 键盘：`Ctrl+K V`（macOS：`Cmd+K V`），即 `dshCsv.toggleView`。
- 命令面板：`CSV: 表格视图`、`CSV: 文本模式`、`CSV: 切换表格视图 / 文本模式`。
- 资源管理器右键：`表格视图`。
- 命令 `CSV: 设置或取消：.csv 默认用表格视图打开` 会写入 `workbench.editorAssociations`，让 `.csv` / `.tsv` 默认以表格打开（再次执行则恢复文本编辑器）。

按钮显示条件由上下文键 `dshCsv.canShowTable` / `dshCsv.tableActive` 控制，与扩展激活、当前页签类型实时同步。

### 表格操作

| 分类 | 操作 |
| --- | --- |
| 单元格 | 双击或 `F2` 就地编辑；`Enter` 提交并下移；`Tab` 提交并右移；`Esc` 取消；`Delete` 清空选区 |
| 选择 | 单击选中，拖动或 `Shift+方向键` 选择矩形区域，行号列单击选中整行，列号单击选中整列，`Shift` 点击可扩展整行 / 整列选区，`Ctrl+A` 全选 |
| 移动 | 按住行号或列号拖动，把选中的行 / 列整块移到新的位置；拖动时显示落点指示线，被拖动的行列会变淡，`Esc` 可取消 |
| 复制 | `Ctrl+C` 复制选区为 TSV；右键可复制为 Markdown 表格 |
| 行 | 上方 / 下方插入、删除（支持多行）、复制此行、上移 / 下移 |
| 列 | 左侧 / 右侧插入、删除、列宽拖拽、列宽自适应（双击列边界或右键菜单） |
| 排序 | 点击列号右侧的下拉三角 `▼`，在菜单里选择升序 / 降序；当前生效的方向会在三角上显示 `▲` / `▼` 并在菜单里打勾。右键列号或单元格也能排序 |
| 筛选 | 顶部过滤框（包含 / 等于 / 开头是 / 正则，可切换大小写），右键「仅显示包含此值的行」按列筛选，筛选条件以标签形式显示 |
| 其它 | 列号固定、行号列固定、虚拟滚动、`Ctrl+F` 聚焦过滤框、`Ctrl+Z` / `Ctrl+Y` 撤销重做 |

### 行为约定

- **排序与移动都会写回文件。** 在列号下拉菜单中选择排序，或拖拽行号 / 列号移动行列，都会重排文档内容（识别为表头时，首行在排序中保持第一行不动），因此文本模式和表格视图看到的是同一个顺序，可用 `Ctrl+Z` 撤销。排序后状态栏会提示「已按该列排序并写入文件」。
- **筛选不写回文件。** 过滤只影响显示，文件内容不变。
- **编辑会规范化引号。** 写回时使用最小引号策略（仅在字段包含分隔符、引号或换行时加引号），因此第一次编辑可能会去掉源文件里多余的引号；分隔符、换行风格（CRLF/LF）、BOM、结尾换行都会被保留。
- **大文件只读。** 超过 `dshCsv.maxRows`（默认 20000）行时只渲染前 N 行并提示，此时表格为只读，避免阻塞编辑器。
- **表头只影响排序。** 顶部固定条始终只显示列号；`dshCsv.header`（默认 `auto`）决定按列排序时是否把第一行固定在顶部。`auto` 会在首行含非空且非数字的单元格时按表头处理，也可用工具栏的「表头」按钮在三态之间切换（自动 / 是 / 否）。
- **分隔符自动识别。** 在 `,` `;` `Tab` `|` 中选择能把样本切成最一致表格的那个；工具栏下拉框可手动指定（写回时也使用该分隔符）。

## 安装

### 从 VSIX

```sh
cd dsh-toolkit/dsh-csv-table
npm install
npm run compile
npm run package
code --install-extension dsh-csv-table-0.1.0.vsix
```

### 开发模式

用 VS Code 打开本目录，按 `F5`（`运行 CSV 表格视图扩展`），会以 `samples/` 作为工作区启动一个扩展开发宿主。`samples/` 中有普通 CSV、分号分隔、带引号与换行的样例。

## 配置

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| `dshCsv.delimiter` | `auto` | 字段分隔符：`auto` / `,` / `;` / `Tab` / `\|`。即写回文件时使用的分隔符。 |
| `dshCsv.header` | `auto` | 首行是否为表头：`auto` / `yes` / `no`。只影响排序时首行是否固定；顶部固定条始终只显示列号。 |
| `dshCsv.maxRows` | `20000` | 表格视图最多渲染的行数，超出则以只读方式显示。 |
| `dshCsv.columnWidth.max` | `480` | 自动列宽上限（像素）。 |

每个文档的视图状态（筛选条件、表头模式、分隔符、列宽、排序标记）保存在扩展的 `workspaceState` 中，重新打开或从文本模式切回时恢复。

## 结构

```
src/
  extension.ts              activate：注册 custom editor、上下文键、命令
  commands.ts               showTable / showText / toggleView / toggleDefaultEditor
  csv/csv.ts                RFC 4180 解析、分隔符检测、最小引号序列化
  csv/table.ts              纯函数表格操作（单元格/行列增删、排序、筛选）
  editor/csvTableEditor.ts  CustomTextEditorProvider
  editor/session.ts         一个表格视图的宿主侧：解析、应用编辑、消息协议
  editor/webviewHtml.ts     webview 外壳（CSP + nonce）
media/
  main.js                   表格视图渲染、虚拟滚动、编辑、右键菜单、快捷键
  main.css                  全部使用 VS Code 主题变量
```

**职责划分**：宿主负责解析 / 序列化 / 排序 / 筛选，是文件内容的唯一真相来源；webview 只负责渲染与交互，不自行解析 CSV，因此两端不需要就 `"a,b"` 还是 `a,b` 达成一致。

**消息协议**（`src/editor/session.ts` 中的 `WebviewMessage`）：

- webview → 宿主：`ready`、`op`（一次编辑）、`view`（需要持久化的视图状态）、`undo` / `redo`、`clipboard`、`error`
- 宿主 → webview：`update`（整张表）、`view`（仅重新投影可见行）、`toast`

编辑通过 `WorkspaceEdit` 整篇替换文档完成，并按到达顺序串行应用，避免后一个编辑读到前一个尚未落盘的内容。

## 开发

```sh
npm install
npm run compile           # tsc → out/
npm test                  # 单元测试：解析、表格操作 + jsdom 加载真实 webview 脚本的 DOM 测试
npm run test:integration  # 在真实 VS Code 中验证激活、custom editor 注册、视图/文本切换
npm run package           # 生成 VSIX
```

`npm test` 里的 webview 测试会从 `src/editor/webviewHtml.ts` 中取出真实的外壳 HTML，把 `media/main.js` 载入 jsdom，然后断言渲染结果与回传的消息（虚拟滚动、顶部列号条、单元格编辑、`Delete` 清空、过滤、视图状态恢复、空文件、只读）。

`npm run test:integration` 会通过 `@vscode/test-electron` 下载 VS Code（缓存在 `.vscode-test/`）并运行 `src/test/integration/`，其中包括「即使 `*.csv` 已关联到表格视图，`dshCsv.showText` 仍然能回到文本编辑器」这一回归用例。该运行会临时写入并复位 `samples/.vscode/settings.json`（已在 `.gitignore` 与 `.vscodeignore` 中忽略）。

从 VS Code 扩展宿主内的终端运行集成测试时，`ELECTRON_RUN_AS_NODE` 会让被启动的 Electron 退化成普通 Node，`src/test/runIntegration.ts` 会先清除该变量。

## 已知限制

- 表格视图不解析数字/日期格式，排序时数字按数值比较、其余按本地化字符串（`numeric: true`）比较，空单元格始终排在最后。
- 不提供公式、合并单元格、单元格样式；它是 CSV 的表格编辑器，不是电子表格。
- 筛选不写回文件，所以无法用筛选结果直接删除一批行；可先选中后删除。
- 超过 `dshCsv.maxRows` 的文件只能查看前 N 行（只读）。
