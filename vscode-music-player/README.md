# B站音乐播放器（vscode-music-player）

在 VS Code 左侧活动栏里听 B 站：搜索视频、播放音频、扫码登录后浏览和整理收藏夹。
侧边栏形态，不占编辑器页签；切走视图、折叠侧边栏、最小化窗口之后音乐继续播。

## 功能

- **搜索与播放**：关键词搜索 B 站视频并播放其音频；支持分 P 视频（默认播 P1）。
- **打开即响**：先只下音频开头一小段（HTTP Range），解出格式就立刻起播，其余字节在后台
  边下边解码补齐（实测约 1.9 秒可起播；整段下载+解码要 2.3 秒以上，网慢时差距更大）。
  流式路径任何一步失败都会自动退回整段路径。
- **播放器**：播放/暂停、上一首/下一首、进度拖拽、状态栏显示当前曲目。
- **播放栏的音量与倍速**：底栏有静音按钮、音量滑块与倍速选择（0.5×–2×），改动即时生效
  并写回设置（`musicPlayer.volume` / `musicPlayer.playbackRate`），下次打开沿用。
- **播放队列与模式**：在搜索结果或收藏夹里点一首会**把整份列表接管为播放队列**，
  之后「下一首」按队列走；每条都能「+」加入队列、在「队列」页签里上移/下移/移除/清空；
  四种模式（顺序 / 列表循环 / 单曲循环 / 随机）由宿主统一管理——单曲循环只对
  「自动播完」生效，手动点「下一首」仍然换歌。
- **账号**：二维码扫码登录（手机 B 站 App 扫码），凭据存在 VS Code 的加密密钥存储里。
- **收藏夹**：
  - 列出账号内全部收藏夹，进入后分页浏览并播放（已失效的条目会标注且禁止播放）；
  - 在收藏夹内按关键词搜索；
  - 新建收藏夹、删除收藏夹（弹原生确认框）；
  - 多选把视频移出收藏夹；
  - 搜索结果上的 ★ 按钮可把视频加入/移出任意收藏夹（勾选式面板）。

## 安装

```bash
code --install-extension vscode-music-player-0.1.0.vsix --force
```

安装后重载窗口（`Ctrl+Shift+P` → `Developer: Reload Window`），活动栏会出现音符图标。

## 使用

1. 点击活动栏的音符图标打开「音乐播放器」侧边栏。
2. 在搜索框输入关键词（或粘贴 BV 号），回车。
3. **点一下搜索结果**开始播放。第一次必须点一下——浏览器内核要求播放必须由用户手势发起。
   （鼠标划过结果时会后台预取音频，因此点击后通常立刻出声。）
4. 播放中按 `Ctrl+B` 折叠侧边栏、切到其它视图都可以，音乐不会停。
5. 切到「账户」页签 → 「扫码登录」，用手机 B 站 App 扫码即可登录。
6. 切到「收藏夹」页签 → 刷新 → 打开某个收藏夹即可浏览、播放、多选移出；
   搜索结果右侧的 ★ 用来把视频加入/移出收藏夹。删除收藏夹等破坏性操作会弹
   VS Code 原生确认框。

如果播放时**时钟在走却没有声音**，说明 `play()` 落在了点击后 5 秒手势窗口之外，
播放器区会出现「🔇 点这里恢复声音」按钮——点它（或点界面任意位置）即可出声。

快捷键（可在「键盘快捷方式」里改）：

| 命令 | 默认键 |
| --- | --- |
| 播放 / 暂停 | `Ctrl+Alt+Space` |
| 下一首 | `Ctrl+Alt+Right` |
| 上一首 | `Ctrl+Alt+Left` |

## 设置

| 配置项 | 默认 | 说明 |
| --- | --- | --- |
| `musicPlayer.audioQuality` | `30280`（192K） | 音质档位：`30216`(64K) / `30232`(132K) / `30280`(192K) |
| `musicPlayer.requestIntervalMs` | `350` | 两次 B 站请求的最小间隔；调小更快但更容易触发风控 |
| `musicPlayer.cache.enabled` | `true` | 解码后的音频缓存到扩展存储目录 |
| `musicPlayer.cache.maxMB` | `500` | 缓存上限；超出后按最久未使用淘汰（WAV 约 40 MB/首） |
| `musicPlayer.defaultPlayMode` | `sequential` | 启动时的播放模式：顺序 / 列表循环 / 单曲循环 / 随机 |
| `musicPlayer.volume` | `0.8` | 默认音量（播放栏滑块也会写回这一项） |
| `musicPlayer.playbackRate` | `1` | 播放速度倍率：0.5 / 0.75 / 1 / 1.25 / 1.5 / 1.75 / 2 |
| `musicPlayer.showStatusBar` | `true` | 状态栏显示当前曲目与播放按钮 |
| `musicPlayer.logLevel` | `info` | 日志级别：`off` / `info` / `debug` |

缓存目录在 VS Code 的扩展存储里（`globalStorage/dsh-toolkit.vscode-music-player/music-cache`），
卸载扩展时随之清理；也可以用命令「音乐播放器: 清理音频缓存」立刻清空。

## 为什么需要本机回环代理

B 站的音频 CDN 要求请求携带 `Referer: https://www.bilibili.com/`，而 webview 里的
`<audio>` 无法自定义请求头；并且 VS Code 的 Electron 不带 AAC 解码（VS Code 自带的
媒体预览文档写明「`.mp4` 不支持 aac 音轨」）。因此音频由扩展宿主下载、解码成 WAV，
再经 `127.0.0.1` 上的随机端口用 HTTP Range 喂给播放器：

- 只绑定回环地址，端口由系统分配；
- 每次运行一个随机 token，客户端只能按登记表里的 id 取数据（不能传 URL，避免被当成开放代理）；
- 请求需满足 webview 的 Origin。

> 运行时探测发现 webview 的 `canPlayType('audio/mp4; codecs="mp4a.40.2"')` 返回
> `probably`，与上述文档相矛盾。宿主因此会在运行时探测客户端能力再决定策略，
> 当前默认走「宿主转码」这条在任何构建上都成立的路。

## 已知限制

- **不能免点击起播**：Chromium 的自动播放策略要求用户手势，命令面板触发的播放
  或自动下一首可能被拦，此时界面会提示点击播放。
- **不支持媒体键**：VS Code 无法注册全局媒体键，只能用上面的快捷键（窗口失焦时不生效）。
- **不支持浏览器版 / 远程**：`extensionKind` 为 `ui`；`vscode.dev` 之类拿不到扩展宿主的回环地址。
- **杜比与 Hi-Res 暂不支持**：需要额外的 wasm 解码器（EC-3 没有许可友好的实现）。
- **只有 AAC（`mp4a`）音轨**：接口返回其它编码时会明确报错，而不是静默失败。

## 故障排查

- 命令「音乐播放器: 显示日志」打开输出面板；先在设置里把 `musicPlayer.logLevel` 调成 `debug`。
- 搜索返回「触发风控」：B 站对未登录的高频搜索会软拦截，稍等片刻或登录后重试。
- 命令「音乐播放器: 运行自检」会自动测量「隐藏侧边栏 / 切换视图」期间 webview
  是否仍然存活，并把报告写到扩展存储目录的 `selftest.log`。

## 开发

```bash
npm install
npm run compile      # tsc 类型检查 + 编译（测试与命令行工具用）
npm test             # node --test 跑单元测试
npm run build        # esbuild 打成 out/extension.js（含 mp4box 与 wasm 解码器）
npm run package      # 生成 .vsix
```

解码链路的验证脚本（需要一个 B 站视频做样本）：

```bash
node out/spike/decode.js --keyword=久石让 --progressive
node out/spike/inspect.js <本地 m4s 文件>
```

## 许可

MIT。音频解码使用 [`mp4box`](https://github.com/gpac/mp4box.js)（BSD-3-Clause）与
[`@wasm-audio-decoders/aac`](https://github.com/eshaz/wasm-audio-decoders)（MIT，libfaad2 的 wasm 构建）。
