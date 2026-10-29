# 资源管理器状态守护（ExplorerStateKeeper）

一个常驻 Windows 通知区域的小工具：定时记录当前打开的「文件资源管理器」文件夹窗口（路径、窗口位置、大小、最大化/最小化状态），重启电脑后，右键任务栏小图标点一下「恢复上次状态」即可重新打开并摆好这些窗口。

![应用图标](assets/app-preview.png)

## 快速开始

1. 双击运行 `release\ExplorerStateKeeper.exe`。
2. 程序不会显示主窗口，只在任务栏通知区域（系统托盘）出现一个文件夹 + 时钟的小图标。
3. 第一次运行会自动把程序加入当前用户的开机启动项；可在右键菜单里关闭。
4. 正常使用电脑即可。程序默认每 5 分钟检查一次资源管理器状态，有窗口时写入记录。
5. 重启后，右键小图标，选择「恢复上次状态」。

> Windows 11 默认会把新图标收进通知区域的 `^` 溢出区。可以在 `^` 中把图标拖到任务栏常显位置。

## 右键菜单

| 菜单项 | 作用 |
| --- | --- |
| 关机前 / 上次记录 | 显示恢复目标的时间与窗口数量 |
| **记录当前状态** | 立即采集一次所有资源管理器文件夹窗口 |
| **恢复上次状态** | 重新打开缺失的文件夹，并恢复窗口位置、大小和显示状态；已存在的同路径窗口会直接复用 |
| 自动记录间隔 | 1 / 5 / 10 / 30 分钟，默认 5 分钟 |
| 开机自动启动 | 写入 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`，不需要管理员权限 |
| 打开数据目录 | 打开记录文件所在目录 |
| 关于 | 版本与数据目录信息 |
| **关闭** | 先做一次最终记录，再退出程序 |

## 记录与恢复规则

- 只记录文件夹窗口，不记录浏览器、Office 等其它窗口。
- 恢复内容包括：
  - 文件夹路径；
  - 窗口左上角坐标、宽高；
  - 普通 / 最大化 / 最小化状态。
- 不记录滚动位置、排序方式、选中文件、预览窗格等窗口内部状态。
- 定时器只在检测到至少一个资源管理器窗口时写入，不会用「0 个窗口」覆盖掉有用的记录。
- 退出程序、Windows 注销/关机时也会尝试做一次最终记录。
- **重启保护**：程序启动时如果发现 `state.json` 来自上一次 Windows 启动，会把它复制为独立的 `restore.json`。之后即使新会话的定时记录不断更新 `state.json`，`restore.json` 也不会被覆盖，所以重启后随时点「恢复上次状态」都能找回关机前的状态。
- 恢复时如果原来的显示器布局已经变化，离屏窗口会被移动回可见区域，尺寸过大的窗口会被收缩到当前桌面范围。

### 关于资源管理器标签页

采集使用 Windows 自带的 `Shell.Application` COM 接口。不同 Windows 11 版本对标签页的暴露方式不同：

- 如果系统把多个标签页作为同一个窗口的多个 Shell 项返回，工具会记录全部标签路径；恢复时会把它们分别打开成独立窗口，放在原窗口附近。
- 如果系统只暴露当前活动标签页，则只能恢复活动标签页。

工具不会模拟按键去操作标签栏，因此不会干扰正在使用的资源管理器窗口。

## 数据文件

默认目录：`%APPDATA%\ExplorerStateKeeper\`

| 文件 | 说明 |
| --- | --- |
| `state.json` | 最近一次成功记录 |
| `restore.json` | 上一次 Windows 启动期间最后的记录，作为重启后的恢复目标 |
| `settings.json` | 记录间隔、开机启动等设置 |
| `logs\app.log` | 运行日志，超过 1 MB 自动轮转 |
| `state.json.bak` | 上一次写入的备份（自动生成） |

记录中只包含文件夹路径和窗口几何信息，不会上传到网络。

## 构建

环境要求：

- Windows 10 / 11；
- .NET Framework 4.8（Windows 10 1903+ / Windows 11 自带）；
- 构建时需要 .NET Framework 4.x 的 `csc.exe`（系统自带）。

双击或在命令行运行：

```bat
build.cmd
```

等价的 PowerShell 命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
```

构建流程会用 `csc.exe` 编译到 `release\ExplorerStateKeeper.exe`，并自动运行一次自检；自检报告会打印在控制台。

可选参数：

```powershell
.\build.ps1 -NoTest      # 跳过自检
.\build.ps1 -Run         # 编译后启动程序
```

图标已经生成在 `assets\app.ico`。如需修改图标，安装 Pillow 后运行：

```bat
python tools\make-icon.py
```

## 测试

`build.cmd` 编译完成后会自动运行内置自检：验证路径解析、JSON 读写、跨启动恢复目标等逻辑，结果直接打印在控制台，失败时构建以非零退出码结束。

需要手动运行时，可使用 GUI 子系统的进程 API 等待自检结束：

```powershell
$exe = (Resolve-Path .\release\ExplorerStateKeeper.exe).Path
$dir = (Resolve-Path .\release).Path + '\.self-test'
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $exe
$psi.Arguments = '--self-test --data-dir "' + $dir + '"'
$psi.UseShellExecute = $false
$p = [System.Diagnostics.Process]::Start($psi)
$p.WaitForExit(30000) | Out-Null
Get-Content (Join-Path $dir 'self-test.txt') -Encoding UTF8
```

`--no-autostart --data-dir <目录>` 可用于不影响开机启动项、不污染正式数据的托盘冒烟测试。

## 卸载

1. 右键通知区域图标，取消勾选「开机自动启动」。
2. 选择「关闭」。
3. 删除 `ExplorerStateKeeper.exe`。
4. 如需清理记录，删除 `%APPDATA%\ExplorerStateKeeper\`。

如程序已被手动删除但仍在开机启动，可删除注册表值：

```text
HKCU\Software\Microsoft\Windows\CurrentVersion\Run
    名称：ExplorerStateKeeper
```

## 已知限制

- 以管理员权限运行的资源管理器窗口可能无法被普通权限的托盘程序读取路径（Windows 完整性级别限制）。
- 只支持 Windows 自带的文件资源管理器（`CabinetWClass`），不支持第三方文件管理器。
- 不恢复窗口的 Z 序（前后层叠顺序）和多标签页内的精确标签结构。
- 记录间隔内新开又关闭、且没有遇到定时记录/关机记录的窗口不会被保存。
- 程序为无签名的本地小工具。部分安全软件可能对写入开机启动项或常驻程序给出提示，请按需放行。

## 故障排查

- 先看 `%APPDATA%\ExplorerStateKeeper\logs\app.log`。
- 如果「恢复上次状态」为灰色：说明还没有可用记录，先点一次「记录当前状态」。
- 如果记录失败并提示无法访问 Windows Shell：尝试不要以管理员身份运行本程序；同时确认 Windows 资源管理器正在运行。
- 如果重启后没有自动启动：检查右键菜单里的「开机自动启动」是否勾选，以及任务管理器的「启动应用」中是否被禁用。
