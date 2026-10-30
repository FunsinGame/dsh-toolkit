# dsh-feishu-bot

用飞书机器人把 DSH 的**任务结果、提问、权限确认**推到手机，并允许直接在飞书里继续对话。

- **任务完成**：回合结束后发一张卡片，含工作区名、会话名、状态与结果摘录；引用这张卡片回复，内容会作为该会话的新消息。
- **Agent 提问**：问题与选项以卡片形式发出，点按钮即可回答；也可以引用卡片用文字回答。
- **权限确认**：工具名、参数摘录与原因发到飞书，点「允许一次 / 拒绝」即可。
- **两边都能答**：飞书与桌面端并行，先答者生效；桌面先答时卡片会被标记为"已在 DSH 中处理"。
- **左侧活动栏入口**：活动栏新增「飞书通知」图标，点一下就能打开插件页面（与 Plugins 页的配置卡片是同一份内容）。
- **无需公网**：走飞书**长连接**（WebSocket），本机只需能访问外网，不需要公网 IP、域名或内网穿透。

## 前置条件

| 项 | 要求 |
|---|---|
| DSH | `>= 0.2.1-rc.2 < 0.3.0`（Web/桌面版，带 Plugins 页） |
| Node | `>= 22`（DSH 自带运行时即可） |
| 飞书 | **企业自建应用**（商店应用不支持长连接），已开启「机器人」能力 |

## 安装

```powershell
cd <repo>\dsh-toolkit\dsh-feishu-bot
npm install
```

> `protobufjs` 的 postinstall 只打印提示，可以安全地用 `npm install --ignore-scripts`。
> 本插件用 `npm` 的扁平 `node_modules`（而不是 pnpm 的 junction 布局），因为宿主半侧在
> DSH 主进程里按普通 Node 解析 `@larksuiteoapi/node-sdk`，junction 在部分 Windows
> 环境下不被 `realpath` 跟随。

然后把它接入你的 profile（以 `desktop` 为例）：

1. 编辑 `$DSH_HOME/profiles/desktop/package.json`：

   ```jsonc
   {
     "dsh": {
       "profile": {
         "bundles": [
           "@deepseek-ai/dsh-base",
           "@deepseek-ai/dsh-web-app",
           "dsh-feishu-bot"
         ]
       }
     },
     "dependencies": {
       "dsh-feishu-bot": "link:C:/g-workspace/deepseek-harness/dsh-toolkit/dsh-feishu-bot"
     }
   }
   ```

2. 在 profile 目录执行 `pnpm install`（把 link 依赖装进 `node_modules`）。
3. **重启 DSH**：宿主半侧在进程启动时装配，改 `lib/*.js` 后都需要重启。

也可以走「Plugins / 插件管理」页安装本包，效果相同。

## 飞书开发者后台配置

1. https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/quick-start/develop-a-card-interactive-bot
2. 创建**企业自建应用**，记录 **App ID / App Secret**（凭证与基础信息）。
2. 添加「机器人」能力。
3. 申请权限（权限管理）：

   | scope | 用途 |
   |---|---|
   | `im:message` | 发送消息 / 卡片 |
   | `im:message:send_as_bot` | 以应用身份发消息（与上一项之一即可） |
   | `im:message:update` | 原地更新卡片（按钮点完后变灰） |
   | `im:message.p2p_msg:readonly` | 读取用户发给机器人的私聊消息 |

4. 事件与回调 → **事件配置** → 订阅方式选「**使用长连接接收事件**」，订阅 `im.message.receive_v1`。
5. 事件与回调 → **回调配置** → 订阅方式选「**使用长连接接收事件**」，订阅 `card.action.trigger`。
6. 应用「可用范围」包含你自己；创建版本并发布。

> 只有本插件的长连接在线时，长连接订阅方式才能保存成功。卡片回调只支持 JSON 2.0
> 卡片（旧版 `card.action.trigger_v1` 只能走 HTTP 回调）。长连接模式下不需要
> `verification_token` / `encrypt_key`。

## 使用

设置页有两个入口，内容完全一样：

- **左侧活动栏**的 ✈ 图标（悬停提示「飞书通知」），点击进入本插件页面；
- **Plugins → dsh-feishu-bot** 的配置卡片。

底部状态栏还有一个常驻的**开关 + 连接指示**：

| 显示 | 含义 |
|---|---|
| ○ 飞书 已关闭 | 通知关闭（点一下开启） |
| ● 飞书 已连接 | 已开启且长连接正常（点一下关闭） |
| ● 飞书 连接中 | 已开启，正在建立长连接 |
| ● 飞书 未连接 | 已开启但长连接没起来（看悬停提示里的原因） |
| ● 飞书 连接失败 | 连接报错（悬停可看最近错误） |

点状态栏这一项就是**一键开关通知**。如果还没配好（缺 App ID/密钥/绑定/连接），
点「开启」不会硬开，而是直接跳到插件设置页——避免状态栏显示"已开启"却发不出消息。

1. 填 **App ID** → 保存；粘贴 **App Secret** → 保存（存进 `$DSH_HOME/.credentials.yaml`，不会回显）。
2. 「生成绑定码」→ 在飞书里给机器人发送这 6 位数字（10 分钟内有效）。
3. 打开**启用飞书通知**（面板里的开关或状态栏一键开关）：会立刻收到一张「飞书通知已开启」卡片，点「确认收到」即可验证回传通路。
4. 之后任何会话的任务完成、提问、审批都会推送到这个私聊。

### 卡片回复格式

| 场景 | 可以怎么回 |
|---|---|
| 单选问题 | 点按钮；或回复 `2`、`B`（选项编号或文字） |
| 多选问题 | 回复 `1,3` 或 `A、C` |
| 自由问题 | 直接回复文字 |
| 多个问题 | 按行回复 `1. 答案` 换行 `2. 答案`；或一行 `1=A, 2=C` |
| 审批 | 点按钮；或回复 `允许` / `拒绝` |
| 完成/已答卡片 | **引用**该卡片回复任意文本 → 作为该会话的新用户消息 |

未引用任何卡片的普通消息只会得到一句提示（不猜测目标会话）。引用已过期的卡片会被
告知"找不到对应会话"（卡片映射保留 14 天）。

## 权限、安全与隐私

- **App Secret** 只写入 DSH 的凭据服务（`DSH_HOME/.credentials.yaml`，文件优先于环境变量）；
  也可以用环境变量 `DSH_FEISHU_APP_SECRET` 提供。任何 HTTP 接口都不会返回密钥。
- 绑定后的 `open_id` / `chat_id` 存在 `$DSH_HOME/feishu-bot/state.json`（尽力 `chmod 600`），
  设置卡片里只显示脱敏值。
- 机器人只服务**已绑定**的那一个飞书用户；其他人发消息只会收到"仅服务已绑定用户"。
- 本插件的 HTTP 路由（`/dsh-feishu-bot/*`）与 DSH 自己的插件路由使用同一道同源信任闸，
  非本机/非受信来源会得到 401/403。
- 同一个飞书应用只应有一个 DSH 实例建立长连接：飞书的事件是**集群投递**，多个连接会
  随机分走事件。插件在检测到已有实例时会在状态里提示。

## 已知限制

- **桌面端悬挂问题**：飞书先答题时，桌面浏览器里那道问题不会立刻消失（0.2.1-rc.2 没有
  关闭他人待答请求的公开接口），它会随该请求的生命周期结束（回合结束/取消/工具超时）
  而自动消失。这是"两边都能答、先答者生效"的代价。
- 仅支持**一个**绑定用户和**私聊**；不支持群聊、多用户、图片/文件消息、语音。
- 卡片按钮依赖飞书卡片 JSON 2.0（客户端 ≥ 7.20）；卡片原地更新只在 14 天内可行。
- 卡片文案目前是中文；词典里已留好英文，后续可补。
- 极新的会话可能还没有标题，卡片会回退到工作目录名；工作区名回退到目录名。

## 开发

```powershell
npm run check   # 全部文件的语法检查
npm test        # 51 个宿主半侧用例 + 8 个浏览器半侧用例（全部离线）
npm run smoke   # 手动联调飞书（见下）
```

手动联调（在接入 DSH 之前验证飞书侧）：

```powershell
# 拿到自己的 open_id / chat_id
$env:DSH_FEISHU_APP_ID='cli_xxx'; $env:DSH_FEISHU_APP_SECRET='xxx'
node scripts/smoke-feishu.mjs --bind

# 发测试卡片并观察 60 秒事件
$env:DSH_FEISHU_OPEN_ID='ou_xxx'
node scripts/smoke-feishu.mjs
```

### 代码结构

| 文件 | 职责 |
|---|---|
| `lib/index.js` | 插件入口：Config（volatile 字段）、装配服务、挂路由 |
| `lib/service.js` | 服务层：连接生命周期、绑定、快照/动作、飞书入站路由、会话元信息 |
| `lib/bridge.js` | 飞书 SDK 封装：长连接、发送/更新/回复、事件去重 |
| `lib/notify.js` | 触发器：回合跟踪（完成卡片）与提问/审批的竞速接管 |
| `lib/cards.js` | 卡片 JSON 2.0 构建、结算、体积收缩 |
| `lib/text.js` | 消息解析、回答解析、回合原因文案 |
| `lib/store.js` | 状态文件（绑定、一次性码、卡片刻） |
| `lib/routes.js` | `/dsh-feishu-bot/state` 与 `/action` |
| `lib/client.js` | 浏览器半侧：活动栏入口 + 插件页面 + Plugins 配置卡片 + 状态栏开关 |

浏览器半侧注册了四处 UI：`shell.activitybar.items`（活动栏图标）、`shell.activity`
（点击后打开的页面）、`plugins.bundle.config`（Plugins 页 bundle 详情里的卡片）、
`shell.statusbar.right`（底部状态栏的开关/连接指示）。页面与卡片共用
`FeishuBotPanel` 与同一份 `configForms` 表单；状态栏条目每 10 秒轮询一次
`/dsh-feishu-bot/state`（页面重新可见时也会刷新），点一下就把 `enabled` 写回配置行。

## 故障排查

| 现象 | 排查方向 |
|---|---|
| 状态一直是「连接失败」 | App ID/Secret 是否正确；飞书后台是否已发布版本；本机能否访问外网 |
| 保存长连接订阅方式失败 | 先把插件跑起来（长连接在线）再去飞书后台点保存 |
| 收到卡片但按钮无反应 | 回调订阅方式是否为长连接、是否订阅了 `card.action.trigger`；卡片是否为 JSON 2.0 |
| 绑定码收不到 | 机器人是否已加入可用范围；是否在**私聊**里发的；码是否过期 |
| 点按钮后卡片没变 | 是否缺少 `im:message:update` 权限 |
| 收不到完成卡片 | 总开关与「任务完成时通知」是否都开着；是否在子智能体会话里（不会通知） |
| 发消息提示"没有可用会话" | 引用的是 14 天前的卡片，或卡片来自另一个 DSH 实例 |
| `发送卡片失败（HTTP 400 / code 230099）` | 卡片 JSON 2.0 里出现了不支持的组件（例如 `note`）。插件已改用灰色 markdown；如果是旧版本请更新 |

错误信息现在会带上飞书的业务码与原因（例如 `HTTP 400 / code 230099：unsupported tag note`），
而不只是 `Request failed with status code 400`。
