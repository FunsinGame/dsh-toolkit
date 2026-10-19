# dsh-notify-sound

一个 DeepSeek Harness（DSH）Web 插件：当会话需要你注意时播放一段短提示音。

- **任务结束** —— 任何一个会话从“运行”变为“空闲”时立即提示。这个信号来自
  宿主全局转发的会话状态事件，所以**后台会话、没在当前窗口打开的会话**结束
  时同样会响，不需要先点开那个会话。
- **询问用户** —— 当前打开的会话里出现提问流程（`[data-question-key]`）、
  计划评审变体（`[data-plan-review-key]`）或工具审批卡（`[data-approval-key]`）。

默认提示音由浏览器用 Web Audio 合成，不需要音频文件，也不依赖宿主侧组件。
完成音是上行的“叮咚”，询问音是下行的“咚叮”。你也可以用自定义音频文件
（URL 或 data URI）替换其中任意一个，见[配置](#配置)。

## 工作原理

本 bundle 的两个半侧共用同一份配置文档：

- **宿主半侧**（`lib/index.js`）用 `.volatile()` 声明本插件的 `Config`。设置服务
  据此投影出这一行的配置表单，保存时把修改写入当前 profile 的
  `cordis.patch.yml`，作为该行的覆盖值。`apply` 只注册
  `settings.configure({ auto: false })`，表示本 bundle 自带设置页，不需要
  schema 自动生成的页面。宿主从不播放声音。
- **浏览器半侧**（`lib/client.js`）通过 `ctx.configForms.get("notify-sound")`
  读取同一行配置，并让播放参数与该表单保持同步。它注册三样东西：
  - Plugins 页上本 bundle 的配置页，走 `plugins.bundle.config` 槽位（按包名
    分发），文案在 `notify-sound` 词典命名空间；
  - 全局的 `api-session/status` 订阅（转发事件）：某个 Agent 从 `running`
    变为空闲时播放完成提示音。这个事件对**所有**会话都会送达，因此后台会话
    结束也能立刻提醒；子智能体会话（`origin === "subagent"`）会被过滤掉，
    不会为每个子任务响一次；
  - 一个对话定义（`ctx.uiConversation.events`，只处理当前打开会话的
    `approval/asked`）和一个 `MutationObserver`，监听提问、计划评审和审批
    卡片。插件加载时已经可见的卡片只记录、不补响。

早于插件加载时刻的历史事件会被忽略，所以刷新页面不会补响旧提示音。

每个可选服务（`remote`/`sessions`、`configForms`、`slots`/`locale`、
`uiConversation`）都通过各自独立的子注入获取：组合里少了某个服务时只是相应
功能降级，不会卡住 Web 启动。

音频上下文按需惰性创建，并在首次指针/键盘/触摸操作时恢复，以兼容浏览器的
自动播放策略。

## 安装

本插件是标准的 DSH profile bundle。可以通过 Web UI 的 **Plugins → 安装**
选择本目录，或在命令行执行：

```sh
dsh plugin --profile web add /path/to/dsh-notify-sound
```

该命令会在 profile 目录里转发给 `pnpm add`，并同步
`dsh.profile.bundles` 层列表。未开启 HMR 时，安装后需要重启 profile。

卸载：

```sh
dsh plugin --profile web remove dsh-notify-sound
```

桌面端请使用应用的 **Plugins** 页：CLI 在管理 `desktop` profile 之前要求
完全退出应用。

## 配置

打开 **Plugins**，选中本 bundle，编辑它的配置区：

- 完成提示音 URL / data URI
- 询问提示音 URL / data URI
- 音量（0~1）
- 启用 / 关闭

每个音频字段都带一个 **试听** 按钮，会按当前音量播放当前输入的内容
（包括尚未保存的修改），方便保存前先确认效果。保存会把该行的覆盖值写入当前
profile 的 `cordis.patch.yml`；浏览器半侧通过设置镜像立即获取新值。

也可以直接手写 profile 自己的 `cordis.patch.yml`（`web` profile 位于
`~/.dsh/profiles/web/cordis.patch.yml`），按行 id 配置：

```yaml
- id: notify-sound
  config:
    # 可选：用音频文件替换合成的完成提示音。
    # 支持 http(s) URL、data URI，或由 DSH Web 服务提供的 URL。
    completeSound: "https://example.com/complete.mp3"
    # 可选：用音频文件替换合成的询问提示音。
    questionSound: "data:audio/wav;base64,..."
    # 可选：音量 0~1，对文件和合成提示音同时生效。
    volume: 0.4
    # 可选：设为 false 可关闭本插件。
    enabled: true
```

像 `C:\sound.mp3` 这样的本地文件路径浏览器无法直接播放，请改用 Web 可访问的
URL、data URI，或把文件放到 DSH Web 服务能提供的位置再引用其 URL。当
`completeSound` / `questionSound` 为空时，使用内置的合成提示音。

## 说明与限制

- 默认音量为 `0.4`，可用 `volume` 设置覆盖。
- 配置的音频文件加载或播放失败时，会回退到内置的 Web Audio 合成音。
- 如果浏览器在用户操作前阻止了自动播放，第一次提示音可能无声；用户点击或
  输入之后就会恢复正常。
- “任务结束”指会话从运行变为空闲。正常完成、报错、被中止、被用户停止都会
  触发；这一点与只匹配“正常完成回合”的旧版不同，因为浏览器侧拿不到每个
  会话结束的原因。
- 子智能体会话不提示；目标模式下每轮结束（Agent 回到空闲）会提示一次，
  与旧版按回合提示的行为一致。
- 去重：同一张提问/审批卡只响一次，两次提示音之间至少间隔 800 毫秒。
- 应用完全退出（进程结束）时浏览器无法播放声音；本插件只在页面仍运行
  （包括窗口最小化或藏在托盘）时提醒。
- `lib/` 是随包发布的手写源码（纯 JavaScript，无构建步骤）。宿主半侧是导出
  `Config` 和 `apply` 的 ESM 入口；浏览器半侧使用
  `window.__ModuleLoader__` 的工厂形式。
