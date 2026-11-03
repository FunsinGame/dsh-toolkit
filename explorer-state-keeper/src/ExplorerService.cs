using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;

namespace ExplorerStateKeeper
{
    internal sealed class ExplorerService
    {
        private const int LaunchTimeoutMilliseconds = 5500;
        private const int NewTabTimeoutMilliseconds = 5000;
        private const int TabNavigationTimeoutMilliseconds = 5000;

        /// <summary>A Shell.Application window object plus the data needed to
        /// identify the tab it represents.</summary>
        private sealed class ShellTabRef
        {
            public object ComObject { get; set; }
            public long Handle { get; set; }
            public long Identity { get; set; }
            public string Name { get; set; }
            public string Path { get; set; }
        }

        public CaptureResult Capture()
        {
            CaptureResult result = new CaptureResult();
            List<long> handles = EnumerateExplorerHandles();
            if (handles.Count == 0)
            {
                result.Success = true;
                return result;
            }

            string error;
            List<ShellTabRef> tabs = EnumerateShellTabs(out error);
            if (tabs == null)
            {
                result.Error = error;
                return result;
            }

            try
            {
                Dictionary<long, List<ShellTabRef>> byHandle = GroupTabsByHandle(tabs);
                for (int i = 0; i < handles.Count; i++)
                {
                    long handle = handles[i];
                    List<ShellTabRef> windowTabs;
                    if (!byHandle.TryGetValue(handle, out windowTabs) ||
                        windowTabs == null || windowTabs.Count == 0)
                    {
                        Log.Warn("跳过无法读取路径的资源管理器窗口 HWND=" + handle);
                        continue;
                    }

                    ExplorerWindowState state = ReadWindowState(handle, windowTabs);
                    if (state != null)
                    {
                        result.Windows.Add(state);
                    }
                }
            }
            finally
            {
                ReleaseShellTabs(tabs);
            }

            if (result.Windows.Count == 0)
            {
                result.Error = "检测到资源管理器窗口，但无法读取其文件夹路径。";
                return result;
            }

            result.Success = true;
            return result;
        }

        public List<LiveWindow> GetLiveWindows(out string error)
        {
            error = null;
            List<LiveWindow> result = new List<LiveWindow>();
            List<long> handles = EnumerateExplorerHandles();
            if (handles.Count == 0)
            {
                return result;
            }

            List<ShellTabRef> tabs = EnumerateShellTabs(out error);
            if (tabs == null)
            {
                return result;
            }

            try
            {
                Dictionary<long, List<ShellTabRef>> byHandle = GroupTabsByHandle(tabs);
                for (int i = 0; i < handles.Count; i++)
                {
                    List<ShellTabRef> windowTabs;
                    if (!byHandle.TryGetValue(handles[i], out windowTabs) ||
                        windowTabs == null)
                    {
                        continue;
                    }

                    LiveWindow live = new LiveWindow();
                    live.Handle = handles[i];
                    live.Title = NativeMethods.GetWindowTitle(new IntPtr(handles[i]));
                    live.Paths = CollectRestorablePaths(windowTabs);
                    if (live.Paths.Count == 0)
                    {
                        continue;
                    }
                    result.Add(live);
                }
            }
            finally
            {
                ReleaseShellTabs(tabs);
            }

            if (result.Count == 0)
            {
                error = "资源管理器窗口存在，但 Shell 没有返回文件夹路径。";
            }

            return result;
        }

        public RestoreResult Restore(ExplorerSnapshot snapshot)
        {
            RestoreResult result = new RestoreResult();
            if (snapshot == null || snapshot.Windows == null || snapshot.Windows.Count == 0)
            {
                result.FatalError = "没有可恢复的记录。";
                return result;
            }

            string liveError;
            List<LiveWindow> live = GetLiveWindows(out liveError);
            if (!string.IsNullOrEmpty(liveError))
            {
                // There are Explorer windows but their paths are unreadable.
                // Opening every snapshotted folder could duplicate them, so
                // stop instead of surprising the user.
                Log.Warn("恢复前读取现有窗口失败：" + liveError);
                result.FatalError = "无法读取当前资源管理器窗口的路径，已停止恢复以避免重复打开窗口。请查看日志。";
                return result;
            }

            HashSet<long> claimed = new HashSet<long>();
            Log.Info("开始恢复：" + snapshot.Describe());

            for (int w = 0; w < snapshot.Windows.Count; w++)
            {
                ExplorerWindowState state = snapshot.Windows[w];
                if (state == null)
                {
                    continue;
                }

                List<string> paths = state.GetPaths();
                if (paths.Count == 0)
                {
                    result.Failed++;
                    result.Errors.Add("记录中有窗口没有文件夹路径。");
                    continue;
                }

                Rectangle baseRectangle = WindowGeometry.Sanitize(new Rectangle(
                    state.Left, state.Top,
                    state.Width > 0 ? state.Width : 1000,
                    state.Height > 0 ? state.Height : 700));

                LiveWindow existing = FindExistingWindow(live, claimed, paths);
                long groupHandle = 0;
                List<string> currentPaths = new List<string>();
                bool baseReady = false;
                string lastError = null;

                if (existing != null)
                {
                    groupHandle = existing.Handle;
                    claimed.Add(groupHandle);
                    currentPaths.AddRange(existing.Paths);
                    baseReady = true;
                }
                else
                {
                    // Launch one of the folders as the first tab.  Normally
                    // paths[0] works; if it disappeared, try the next one.
                    for (int i = 0; i < paths.Count; i++)
                    {
                        if (!PathTools.LooksRestorable(paths[i]))
                        {
                            continue;
                        }
                        if (!PathTools.LocalDirectoryExists(paths[i]))
                        {
                            lastError = "文件夹不存在：" + paths[i];
                            continue;
                        }

                        if (LaunchAndWait(paths[i], out groupHandle, out lastError))
                        {
                            claimed.Add(groupHandle);
                            currentPaths.Add(paths[i]);
                            baseReady = true;
                            Thread.Sleep(250);
                            break;
                        }
                    }
                }

                if (!baseReady)
                {
                    result.Failed += paths.Count;
                    result.Errors.Add("无法打开窗口组：" +
                        (lastError == null ? "未知错误" : lastError));
                    continue;
                }

                result.RestoredGroups++;
                Log.Info("恢复窗口组：HWND=" + groupHandle +
                         "，记录页签 " + paths.Count + " 个。");

                HashSet<string> currentSet = new HashSet<string>(
                    StringComparer.OrdinalIgnoreCase);
                for (int i = 0; i < currentPaths.Count; i++)
                {
                    currentSet.Add(PathTools.NormalizeForCompare(currentPaths[i]));
                }

                if (paths.Count > 1)
                {
                    string prepareError;
                    if (!ApplyBounds(groupHandle, baseRectangle,
                        NativeMethods.SW_SHOWNORMAL, out prepareError))
                    {
                        result.Warnings.Add("窗口准备失败：" + prepareError);
                    }
                }

                for (int tabIndex = 0; tabIndex < paths.Count; tabIndex++)
                {
                    string path = paths[tabIndex];
                    if (!PathTools.LooksRestorable(path))
                    {
                        result.Failed++;
                        result.Errors.Add("无法恢复：" + path);
                        continue;
                    }

                    string normalized = PathTools.NormalizeForCompare(path);
                    if (currentSet.Contains(normalized))
                    {
                        result.Restored++;
                        continue;
                    }

                    if (!PathTools.LocalDirectoryExists(path))
                    {
                        result.Failed++;
                        result.Errors.Add("文件夹不存在：" + path);
                        continue;
                    }

                    string tabError;
                    if (AddTabAndNavigate(groupHandle, path, out tabError))
                    {
                        currentSet.Add(normalized);
                        result.Restored++;
                        Log.Info("已在同一窗口新增页签：" + path);
                        continue;
                    }

                    // Last resort: restore the folder, but as a separate
                    // window.  The warning tells the user why the group is
                    // not exact.
                    long fallbackHandle = 0;
                    string fallbackError;
                    if (!LaunchAndWait(path, out fallbackHandle, out fallbackError))
                    {
                        result.Failed++;
                        result.Errors.Add("页签创建失败，且无法打开独立窗口：" +
                            path + "（" + tabError + "；" + fallbackError + "）");
                        continue;
                    }

                    claimed.Add(fallbackHandle);
                    Thread.Sleep(200);
                    Rectangle fallbackRectangle = WindowGeometry.OffsetForTab(
                        baseRectangle, Math.Min(4, result.Restored % 5 + 1));
                    string applyError;
                    ApplyBounds(fallbackHandle, fallbackRectangle,
                        NativeMethods.SW_SHOWNORMAL, out applyError);
                    currentSet.Add(normalized);
                    result.Restored++;
                    result.Warnings.Add("页签创建失败，已作为独立窗口打开：" +
                        path + "（" + tabError + "）");
                    Log.Warn("页签创建失败，已作为独立窗口打开：" + path +
                             "；原因：" + tabError);
                }

                if (state.ActiveTabIndex >= 0 &&
                    state.ActiveTabIndex < paths.Count &&
                    paths.Count > 1)
                {
                    if (!ActivateTab(groupHandle, state.ActiveTabIndex))
                    {
                        Log.Warn("活动页签恢复失败，索引 " +
                                 state.ActiveTabIndex + "，窗口 " + groupHandle);
                    }
                }

                string finalError;
                if (!ApplyBounds(groupHandle, baseRectangle,
                    state.ShowCommand, out finalError))
                {
                    result.Warnings.Add("窗口定位失败：" +
                        paths[0] + "（" + finalError + "）");
                }
            }

            Log.Info("恢复完成：窗口 " + result.RestoredGroups +
                     " 个，页签 " + result.Restored +
                     " 个，失败 " + result.Failed + "。");
            return result;
        }

        private static ExplorerWindowState ReadWindowState(long handle,
            List<ShellTabRef> tabs)
        {
            IntPtr hwnd = new IntPtr(handle);
            NativeMethods.WINDOWPLACEMENT placement = new NativeMethods.WINDOWPLACEMENT();
            placement.length = Marshal.SizeOf(typeof(NativeMethods.WINDOWPLACEMENT));
            bool hasPlacement = NativeMethods.GetWindowPlacement(hwnd, ref placement);

            NativeMethods.RECT rect;
            if (!NativeMethods.GetWindowRect(hwnd, out rect))
            {
                rect = new NativeMethods.RECT();
            }

            int showCommand = NativeMethods.SW_SHOWNORMAL;
            if (hasPlacement &&
                (placement.showCmd == NativeMethods.SW_SHOWMINIMIZED ||
                 placement.showCmd == NativeMethods.SW_SHOWMAXIMIZED))
            {
                showCommand = placement.showCmd;
            }
            else if (NativeMethods.IsIconic(hwnd))
            {
                showCommand = NativeMethods.SW_SHOWMINIMIZED;
            }
            else if (NativeMethods.IsZoomed(hwnd))
            {
                showCommand = NativeMethods.SW_SHOWMAXIMIZED;
            }

            if (hasPlacement &&
                placement.rcNormalPosition.Width > 80 &&
                placement.rcNormalPosition.Height > 80)
            {
                rect = placement.rcNormalPosition;
            }
            else if (rect.Width <= 80 || rect.Height <= 80)
            {
                Log.Warn("窗口尺寸异常，跳过 HWND=" + handle);
                return null;
            }

            List<string> paths = new List<string>();
            List<ShellTabRef> validTabs = new List<ShellTabRef>();
            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < tabs.Count; i++)
            {
                ShellTabRef tab = tabs[i];
                if (string.IsNullOrEmpty(tab.Path))
                {
                    continue;
                }

                string path = tab.Path.Trim();
                if (path.Length == 0 || !PathTools.LooksRestorable(path))
                {
                    continue;
                }

                if (seen.Add(PathTools.NormalizeForCompare(path)))
                {
                    paths.Add(path);
                    validTabs.Add(tab);
                }
            }

            if (paths.Count == 0)
            {
                return null;
            }

            ExplorerWindowState state = new ExplorerWindowState();
            state.Path = paths[0];
            state.Title = NativeMethods.GetWindowTitle(hwnd);
            state.Left = rect.Left;
            state.Top = rect.Top;
            state.Width = rect.Width;
            state.Height = rect.Height;
            state.ShowCommand = showCommand;
            state.Tabs = new List<string>(paths);
            state.ActiveTabIndex = DetectActiveTabIndex(state.Title, validTabs);
            return state;
        }

        private static List<string> CollectRestorablePaths(List<ShellTabRef> tabs)
        {
            List<string> paths = new List<string>();
            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < tabs.Count; i++)
            {
                string path = tabs[i].Path;
                if (string.IsNullOrEmpty(path))
                {
                    continue;
                }

                path = path.Trim();
                if (path.Length == 0 || !PathTools.LooksRestorable(path))
                {
                    continue;
                }

                if (seen.Add(PathTools.NormalizeForCompare(path)))
                {
                    paths.Add(path);
                }
            }
            return paths;
        }

        private static int DetectActiveTabIndex(string title, List<ShellTabRef> tabs)
        {
            if (tabs == null || tabs.Count == 0)
            {
                return -1;
            }

            List<string> names = new List<string>();
            for (int i = 0; i < tabs.Count; i++)
            {
                string name = tabs[i].Name;
                if (string.IsNullOrEmpty(name))
                {
                    name = PathTools.LeafName(tabs[i].Path);
                }
                names.Add(name);
            }

            return DetectActiveTabIndex(title, (IList<string>)names);
        }

        internal static int DetectActiveTabIndex(string title, IList<string> tabNames)
        {
            if (string.IsNullOrEmpty(title) || tabNames == null || tabNames.Count == 0)
            {
                return -1;
            }

            int best = -1;
            int bestLength = 0;
            bool ambiguous = false;
            for (int i = 0; i < tabNames.Count; i++)
            {
                string name = tabNames[i];
                if (string.IsNullOrEmpty(name) || !TitleStartsWithTabName(title, name))
                {
                    continue;
                }

                if (name.Length > bestLength)
                {
                    best = i;
                    bestLength = name.Length;
                    ambiguous = false;
                }
                else if (name.Length == bestLength)
                {
                    ambiguous = true;
                }
            }

            return ambiguous ? -1 : best;
        }

        private static bool TitleStartsWithTabName(string title, string name)
        {
            if (!title.StartsWith(name, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            if (title.Length == name.Length)
            {
                return true;
            }

            string rest = title.Substring(name.Length);
            return rest.StartsWith(" 和 ", StringComparison.Ordinal) ||
                   rest.StartsWith(" and ", StringComparison.OrdinalIgnoreCase) ||
                   rest.StartsWith(" - ", StringComparison.Ordinal) ||
                   rest.StartsWith(" – ", StringComparison.Ordinal);
        }

        private static LiveWindow FindExistingWindow(List<LiveWindow> live,
            HashSet<long> claimed, List<string> paths)
        {
            if (live == null)
            {
                return null;
            }

            for (int i = 0; i < live.Count; i++)
            {
                LiveWindow window = live[i];
                if (claimed.Contains(window.Handle))
                {
                    continue;
                }

                for (int p = 0; p < paths.Count; p++)
                {
                    if (window.HasPath(paths[p]))
                    {
                        return window;
                    }
                }
            }

            return null;
        }

        private static bool ApplyBounds(long handle, Rectangle rectangle,
            int showCommand, out string error)
        {
            error = null;
            if (handle == 0)
            {
                error = "无效的窗口句柄";
                return false;
            }

            IntPtr hwnd = new IntPtr(handle);
            Rectangle target = WindowGeometry.Sanitize(rectangle);
            int show = WindowGeometry.NormalizeShowCommand(showCommand);

            for (int attempt = 0; attempt < 3; attempt++)
            {
                NativeMethods.ShowWindow(hwnd, NativeMethods.SW_RESTORE);
                if (attempt == 0)
                {
                    Thread.Sleep(40);
                }

                bool ok = NativeMethods.SetWindowPos(
                    hwnd,
                    IntPtr.Zero,
                    target.Left,
                    target.Top,
                    Math.Max(200, target.Width),
                    Math.Max(120, target.Height),
                    NativeMethods.SWP_NOZORDER | NativeMethods.SWP_NOACTIVATE);

                if (ok)
                {
                    if (show == NativeMethods.SW_SHOWMAXIMIZED)
                    {
                        NativeMethods.ShowWindow(hwnd, NativeMethods.SW_MAXIMIZE);
                    }
                    else if (show == NativeMethods.SW_SHOWMINIMIZED)
                    {
                        NativeMethods.ShowWindow(hwnd, NativeMethods.SW_MINIMIZE);
                    }
                    return true;
                }

                Thread.Sleep(120);
            }

            error = "SetWindowPos 失败";
            return false;
        }

        private static bool AddTabAndNavigate(long handle, string path, out string error)
        {
            error = null;
            IntPtr hwnd = new IntPtr(handle);

            for (int attempt = 0; attempt < 2; attempt++)
            {
                if (!ActivateWindow(handle))
                {
                    error = "无法激活资源管理器窗口";
                    return false;
                }

                List<ShellTabRef> before = null;
                List<ShellTabRef> after = null;
                try
                {
                    string enumError;
                    before = EnumerateShellTabs(out enumError);
                    if (before == null)
                    {
                        error = enumError;
                        return false;
                    }

                    HashSet<long> beforeIds = new HashSet<long>();
                    for (int i = 0; i < before.Count; i++)
                    {
                        if (before[i].Handle == handle && before[i].Identity != 0)
                        {
                            beforeIds.Add(before[i].Identity);
                        }
                    }

                    if (beforeIds.Count == 0)
                    {
                        error = "无法识别当前窗口的已有页签";
                        return false;
                    }

                    if (!SendCtrlT(hwnd))
                    {
                        error = "无法发送新建页签快捷键";
                        continue;
                    }

                    ShellTabRef newTab = null;
                    DateTime deadline = DateTime.UtcNow.AddMilliseconds(
                        NewTabTimeoutMilliseconds);

                    while (DateTime.UtcNow < deadline)
                    {
                        Thread.Sleep(120);
                        after = EnumerateShellTabs(out enumError);
                        if (after == null)
                        {
                            continue;
                        }

                        for (int i = 0; i < after.Count; i++)
                        {
                            ShellTabRef tab = after[i];
                            if (tab.Handle == handle && tab.Identity != 0 &&
                                !beforeIds.Contains(tab.Identity))
                            {
                                newTab = tab;
                                break;
                            }
                        }

                        if (newTab != null)
                        {
                            break;
                        }

                        ReleaseShellTabs(after);
                        after = null;
                    }

                    if (newTab == null)
                    {
                        error = "新建页签超时";
                        continue;
                    }

                    string navigationError;
                    bool navigated;
                    try
                    {
                        navigated = NavigateTab(newTab, path, out navigationError);
                    }
                    catch (Exception ex)
                    {
                        navigated = false;
                        navigationError = ex.Message;
                    }

                    if (!navigated)
                    {
                        error = navigationError;
                        if (NativeMethods.GetForegroundWindow() == hwnd)
                        {
                            SendCtrlKey(hwnd, NativeMethods.VK_W);
                        }
                        continue;
                    }

                    return true;
                }
                finally
                {
                    ReleaseShellTabs(before);
                    ReleaseShellTabs(after);
                }
            }

            return false;
        }

        private static bool NavigateTab(ShellTabRef tab, string path, out string error)
        {
            error = null;
            dynamic window = tab.ComObject;
            string targetUrl = ToNavigationUrl(path);
            try
            {
                window.Navigate2(targetUrl, 0);
            }
            catch (Exception ex)
            {
                error = "页签导航失败：" + ex.Message;
                return false;
            }

            bool virtualPath = PathTools.IsVirtualPath(path);
            DateTime started = DateTime.UtcNow;
            DateTime deadline = started.AddMilliseconds(
                TabNavigationTimeoutMilliseconds);
            while (DateTime.UtcNow < deadline)
            {
                Thread.Sleep(150);

                string currentPath;
                try
                {
                    currentPath = GetShellWindowPath(window);
                }
                catch
                {
                    currentPath = string.Empty;
                }

                if (!string.IsNullOrEmpty(currentPath) &&
                    PathTools.PathsEqual(currentPath, path))
                {
                    return true;
                }

                if (virtualPath &&
                    DateTime.UtcNow - started > TimeSpan.FromMilliseconds(1500))
                {
                    // Shell namespace paths (This PC, Recycle Bin etc.) do
                    // not always string-compare with their reported Path.
                    // Give Explorer a moment, then treat the tab as done.
                    return true;
                }
            }

            error = "页签导航超时：" + path;
            return false;
        }

        private static string ToNavigationUrl(string path)
        {
            if (PathTools.IsVirtualPath(path))
            {
                if (path.StartsWith("::", StringComparison.Ordinal))
                {
                    return "shell:" + path;
                }
                return path;
            }

            try
            {
                return new Uri(path, UriKind.Absolute).AbsoluteUri;
            }
            catch
            {
                return path;
            }
        }

        private static bool ActivateTab(long handle, int index)
        {
            if (index < 0 || !ActivateWindow(handle))
            {
                return false;
            }

            IntPtr hwnd = new IntPtr(handle);
            if (!SendCtrlDigit(hwnd, 1))
            {
                return false;
            }
            Thread.Sleep(60);

            for (int i = 0; i < index; i++)
            {
                if (!SendCtrlKey(hwnd, NativeMethods.VK_TAB))
                {
                    return false;
                }
                Thread.Sleep(45);
            }

            return true;
        }

        private static bool ActivateWindow(long handle)
        {
            IntPtr hwnd = new IntPtr(handle);
            if (NativeMethods.GetForegroundWindow() == hwnd)
            {
                return true;
            }

            NativeMethods.ShowWindow(hwnd, NativeMethods.SW_RESTORE);
            Thread.Sleep(60);

            // The synthetic Alt tap releases Windows' foreground lock in the
            // common case where the user just clicked our tray menu.
            NativeMethods.keybd_event(NativeMethods.VK_MENU, 0, 0, UIntPtr.Zero);
            NativeMethods.keybd_event(NativeMethods.VK_MENU, 0,
                NativeMethods.KEYEVENTF_KEYUP, UIntPtr.Zero);
            NativeMethods.SetForegroundWindow(hwnd);
            Thread.Sleep(100);
            if (NativeMethods.GetForegroundWindow() == hwnd)
            {
                return true;
            }

            IntPtr foreground = NativeMethods.GetForegroundWindow();
            uint processId;
            uint foregroundThread = NativeMethods.GetWindowThreadProcessId(
                foreground, out processId);
            uint targetThread = NativeMethods.GetWindowThreadProcessId(
                hwnd, out processId);
            if (foregroundThread != 0 && targetThread != 0 &&
                foregroundThread != targetThread)
            {
                bool attached = NativeMethods.AttachThreadInput(
                    foregroundThread, targetThread, true);
                try
                {
                    NativeMethods.BringWindowToTop(hwnd);
                    NativeMethods.SetForegroundWindow(hwnd);
                }
                finally
                {
                    if (attached)
                    {
                        NativeMethods.AttachThreadInput(
                            foregroundThread, targetThread, false);
                    }
                }
            }

            Thread.Sleep(100);
            return NativeMethods.GetForegroundWindow() == hwnd;
        }

        private static bool SendCtrlT(IntPtr hwnd)
        {
            return SendCtrlKey(hwnd, NativeMethods.VK_T);
        }

        private static bool SendCtrlDigit(IntPtr hwnd, int digit)
        {
            if (digit < 1 || digit > 9)
            {
                return false;
            }
            return SendCtrlKey(hwnd, (byte)(NativeMethods.VK_1 + digit - 1));
        }

        private static bool SendCtrlKey(IntPtr hwnd, byte key)
        {
            if (NativeMethods.GetForegroundWindow() != hwnd)
            {
                return false;
            }

            NativeMethods.keybd_event(NativeMethods.VK_CONTROL, 0, 0, UIntPtr.Zero);
            try
            {
                Thread.Sleep(18);
                NativeMethods.keybd_event(key, 0, 0, UIntPtr.Zero);
                Thread.Sleep(28);
                NativeMethods.keybd_event(key, 0,
                    NativeMethods.KEYEVENTF_KEYUP, UIntPtr.Zero);
            }
            finally
            {
                Thread.Sleep(15);
                NativeMethods.keybd_event(NativeMethods.VK_CONTROL, 0,
                    NativeMethods.KEYEVENTF_KEYUP, UIntPtr.Zero);
            }

            Thread.Sleep(50);
            return true;
        }

        private static bool LaunchAndWait(string path, out long handle, out string error)
        {
            handle = 0;
            error = null;

            HashSet<long> before = GetHandleSet();
            DateTime started = DateTime.UtcNow;
            DateTime deadline = started.AddMilliseconds(LaunchTimeoutMilliseconds);
            long candidate = 0;

            try
            {
                ProcessStartInfo startInfo = new ProcessStartInfo();
                string windowsDirectory = Environment.GetFolderPath(
                    Environment.SpecialFolder.Windows);
                string explorerPath = string.IsNullOrEmpty(windowsDirectory)
                    ? "explorer.exe"
                    : System.IO.Path.Combine(windowsDirectory, "explorer.exe");
                if (!System.IO.File.Exists(explorerPath))
                {
                    explorerPath = "explorer.exe";
                }

                startInfo.FileName = explorerPath;
                startInfo.Arguments = BuildExplorerArguments(path);
                startInfo.UseShellExecute = true;
                startInfo.WorkingDirectory = Environment.GetFolderPath(
                    Environment.SpecialFolder.UserProfile);

                Process process = Process.Start(startInfo);
                if (process != null)
                {
                    process.Dispose();
                }
            }
            catch (Exception ex)
            {
                error = ex.Message;
                Log.Error("启动 explorer.exe 失败：" + path, ex);
                return false;
            }

            while (DateTime.UtcNow < deadline)
            {
                Thread.Sleep(180);

                List<long> handles = EnumerateExplorerHandles();
                List<long> candidates = new List<long>();
                for (int i = 0; i < handles.Count; i++)
                {
                    if (!before.Contains(handles[i]))
                    {
                        candidates.Add(handles[i]);
                    }
                }

                if (candidates.Count == 0)
                {
                    continue;
                }

                if (candidate == 0)
                {
                    candidate = candidates[0];
                }

                string pathError;
                Dictionary<long, List<string>> currentPaths = ReadShellPaths(out pathError);
                if (currentPaths != null)
                {
                    for (int c = 0; c < candidates.Count; c++)
                    {
                        List<string> tabs;
                        if (!currentPaths.TryGetValue(candidates[c], out tabs) ||
                            tabs == null)
                        {
                            continue;
                        }

                        for (int t = 0; t < tabs.Count; t++)
                        {
                            if (PathTools.PathsEqual(tabs[t], path))
                            {
                                handle = candidates[c];
                                return true;
                            }
                        }
                    }
                }

                // Some shell namespace folders (This PC, Recycle Bin) do not
                // report a comparable path; if a brand new Explorer window is
                // present and stable, use it.
                if (candidate != 0 &&
                    DateTime.UtcNow - started > TimeSpan.FromMilliseconds(1200))
                {
                    handle = candidate;
                    return true;
                }
            }

            if (candidate != 0)
            {
                handle = candidate;
                return true;
            }

            error = "等待新窗口超时";
            return false;
        }

        private static string BuildExplorerArguments(string path)
        {
            string target = path;
            if (target.StartsWith("::", StringComparison.Ordinal))
            {
                target = "shell:" + target;
            }

            // Explorer's command line accepts /n,<object>.  Quote the object
            // even for shell: paths so names containing spaces stay intact.
            return "/n," + PathTools.QuoteCommandLineArgument(target);
        }

        private static HashSet<long> GetHandleSet()
        {
            List<long> handles = EnumerateExplorerHandles();
            HashSet<long> set = new HashSet<long>();
            for (int i = 0; i < handles.Count; i++)
            {
                set.Add(handles[i]);
            }
            return set;
        }

        private static List<long> EnumerateExplorerHandles()
        {
            List<long> result = new List<long>();
            NativeMethods.EnumWindowsProc callback = delegate(IntPtr hwnd, IntPtr lParam)
            {
                if (!NativeMethods.IsWindowVisible(hwnd))
                {
                    return true;
                }

                string className = NativeMethods.GetWindowClassName(hwnd);
                if (className == "CabinetWClass" || className == "ExploreWClass")
                {
                    result.Add(hwnd.ToInt64());
                }
                return true;
            };

            NativeMethods.EnumWindows(callback, IntPtr.Zero);
            return result;
        }

        private static Dictionary<long, List<string>> ReadShellPaths(out string error)
        {
            List<ShellTabRef> tabs = EnumerateShellTabs(out error);
            if (tabs == null)
            {
                return null;
            }

            try
            {
                Dictionary<long, List<string>> result =
                    new Dictionary<long, List<string>>();
                Dictionary<long, List<ShellTabRef>> byHandle = GroupTabsByHandle(tabs);
                foreach (KeyValuePair<long, List<ShellTabRef>> pair in byHandle)
                {
                    List<string> paths = CollectRestorablePaths(pair.Value);
                    if (paths.Count > 0)
                    {
                        result[pair.Key] = paths;
                    }
                }
                return result;
            }
            finally
            {
                ReleaseShellTabs(tabs);
            }
        }

        private static Dictionary<long, List<ShellTabRef>> GroupTabsByHandle(
            List<ShellTabRef> tabs)
        {
            Dictionary<long, List<ShellTabRef>> byHandle =
                new Dictionary<long, List<ShellTabRef>>();
            for (int i = 0; i < tabs.Count; i++)
            {
                ShellTabRef tab = tabs[i];
                List<ShellTabRef> list;
                if (!byHandle.TryGetValue(tab.Handle, out list))
                {
                    list = new List<ShellTabRef>();
                    byHandle[tab.Handle] = list;
                }
                list.Add(tab);
            }
            return byHandle;
        }

        private static List<ShellTabRef> EnumerateShellTabs(out string error)
        {
            error = null;
            List<ShellTabRef> result = new List<ShellTabRef>();

            object shellObject = null;
            object windowsObject = null;
            try
            {
                Type shellType = Type.GetTypeFromProgID("Shell.Application");
                if (shellType == null)
                {
                    error = "系统未注册 Shell.Application。";
                    return null;
                }

                shellObject = Activator.CreateInstance(shellType);
                dynamic shell = shellObject;
                windowsObject = shell.Windows();
                dynamic windows = windowsObject;

                int count = windows.Count;
                for (int i = 0; i < count; i++)
                {
                    object windowObject = null;
                    try
                    {
                        windowObject = windows.Item(i);
                        dynamic window = windowObject;

                        object hwndValue = window.HWND;
                        long handle;
                        if (hwndValue is IntPtr)
                        {
                            handle = ((IntPtr)hwndValue).ToInt64();
                        }
                        else
                        {
                            handle = Convert.ToInt64(hwndValue);
                        }

                        if (handle == 0)
                        {
                            continue;
                        }

                        // A shell tab can report a child HWND.  Normalize it to
                        // the top-level Explorer window so tab paths group with
                        // their window.
                        IntPtr root = NativeMethods.GetAncestor(
                            new IntPtr(handle), NativeMethods.GA_ROOT);
                        if (root != IntPtr.Zero)
                        {
                            handle = root.ToInt64();
                        }

                        string name = string.Empty;
                        try
                        {
                            name = Convert.ToString(window.LocationName);
                        }
                        catch
                        {
                        }

                        ShellTabRef tab = new ShellTabRef();
                        tab.ComObject = windowObject;
                        tab.Handle = handle;
                        tab.Identity = GetComIdentity(windowObject);
                        tab.Name = name == null ? string.Empty : name.Trim();
                        tab.Path = GetShellWindowPath(window);
                        result.Add(tab);

                        // Ownership of the COM reference moved to the tab.
                        windowObject = null;
                    }
                    catch (Exception ex)
                    {
                        Log.Warn("读取一个 Shell 窗口失败：" + ex.Message);
                    }
                    finally
                    {
                        ReleaseComObject(windowObject);
                    }
                }
            }
            catch (Exception ex)
            {
                error = "无法访问 Windows Shell：" + ex.Message;
                Log.Error("枚举资源管理器窗口失败", ex);
                ReleaseShellTabs(result);
                return null;
            }
            finally
            {
                ReleaseComObject(windowsObject);
                ReleaseComObject(shellObject);
            }

            return result;
        }

        private static void ReleaseShellTabs(List<ShellTabRef> tabs)
        {
            if (tabs == null)
            {
                return;
            }

            for (int i = 0; i < tabs.Count; i++)
            {
                ReleaseComObject(tabs[i].ComObject);
                tabs[i].ComObject = null;
            }
        }

        private static long GetComIdentity(object value)
        {
            IntPtr unknown = IntPtr.Zero;
            try
            {
                unknown = Marshal.GetIUnknownForObject(value);
                return unknown.ToInt64();
            }
            catch
            {
                return 0;
            }
            finally
            {
                if (unknown != IntPtr.Zero)
                {
                    Marshal.Release(unknown);
                }
            }
        }

        private static string GetShellWindowPath(dynamic window)
        {
            string locationUrl = string.Empty;
            try
            {
                locationUrl = Convert.ToString(window.LocationURL);
            }
            catch
            {
                // Virtual folders can fail this property.
            }

            if (!string.IsNullOrEmpty(locationUrl))
            {
                string fromUrl = PathTools.FromLocationUrl(locationUrl);
                if (!string.IsNullOrEmpty(fromUrl) && PathTools.LooksRestorable(fromUrl))
                {
                    return fromUrl;
                }
            }

            object document = null;
            object folder = null;
            object self = null;
            try
            {
                document = window.Document;
                dynamic documentObject = document;
                folder = documentObject.Folder;
                dynamic folderObject = folder;
                self = folderObject.Self;
                dynamic selfObject = self;
                string folderPath = Convert.ToString(selfObject.Path);
                if (!string.IsNullOrEmpty(folderPath))
                {
                    if (folderPath.StartsWith("file:", StringComparison.OrdinalIgnoreCase))
                    {
                        folderPath = PathTools.FromLocationUrl(folderPath);
                    }
                    return folderPath;
                }
            }
            catch
            {
                // Fall through to the localized virtual folder mapping.
            }
            finally
            {
                ReleaseComObject(self);
                ReleaseComObject(folder);
                ReleaseComObject(document);
            }

            try
            {
                string locationName = Convert.ToString(window.LocationName);
                return PathTools.MapVirtualFolder(locationName);
            }
            catch
            {
                return string.Empty;
            }
        }

        private static void ReleaseComObject(object value)
        {
            if (value == null)
            {
                return;
            }

            try
            {
                if (Marshal.IsComObject(value))
                {
                    Marshal.FinalReleaseComObject(value);
                }
            }
            catch
            {
                // COM cleanup is best effort.
            }
        }
    }
}
