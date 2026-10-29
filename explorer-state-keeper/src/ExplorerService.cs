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
            Dictionary<long, List<string>> paths = ReadShellPaths(out error);
            if (paths == null)
            {
                result.Error = error;
                return result;
            }

            for (int i = 0; i < handles.Count; i++)
            {
                long handle = handles[i];
                List<string> tabs;
                if (!paths.TryGetValue(handle, out tabs) || tabs == null || tabs.Count == 0)
                {
                    Log.Warn("跳过无法读取路径的资源管理器窗口 HWND=" + handle);
                    continue;
                }

                ExplorerWindowState state = ReadWindowState(handle, tabs);
                if (state != null)
                {
                    result.Windows.Add(state);
                }
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

            Dictionary<long, List<string>> paths = ReadShellPaths(out error);
            if (paths == null)
            {
                return result;
            }

            for (int i = 0; i < handles.Count; i++)
            {
                List<string> tabs;
                if (!paths.TryGetValue(handles[i], out tabs) || tabs == null || tabs.Count == 0)
                {
                    continue;
                }

                LiveWindow live = new LiveWindow();
                live.Handle = handles[i];
                live.Title = NativeMethods.GetWindowTitle(new IntPtr(handles[i]));
                live.Paths = new List<string>(tabs);
                result.Add(live);
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

                for (int tabIndex = 0; tabIndex < paths.Count; tabIndex++)
                {
                    string path = paths[tabIndex];
                    if (!PathTools.LooksRestorable(path))
                    {
                        result.Failed++;
                        result.Errors.Add("无法恢复：" + path);
                        continue;
                    }

                    long handle = 0;
                    string reason;
                    bool applied;

                    if (TryClaimExisting(live, claimed, path, out handle))
                    {
                        applied = ApplyBounds(handle, baseRectangle, tabIndex,
                            state.ShowCommand, out reason);
                    }
                    else
                    {
                        if (!PathTools.LocalDirectoryExists(path))
                        {
                            result.Failed++;
                            result.Errors.Add("文件夹不存在：" + path);
                            continue;
                        }

                        if (!LaunchAndWait(path, out handle, out reason))
                        {
                            result.Failed++;
                            result.Errors.Add("打开失败：" + path + "（" + reason + "）");
                            continue;
                        }

                        claimed.Add(handle);
                        // Let Explorer finish its initial layout before moving
                        // the window; otherwise some versions snap back.
                        Thread.Sleep(220);
                        applied = ApplyBounds(handle, baseRectangle, tabIndex,
                            state.ShowCommand, out reason);
                    }

                    if (applied)
                    {
                        result.Restored++;
                        Log.Info("已恢复：" + path);
                    }
                    else
                    {
                        result.Failed++;
                        result.Errors.Add("窗口定位失败：" + path + "（" + reason + "）");
                    }
                }
            }

            Log.Info("恢复完成：成功 " + result.Restored + "，失败 " + result.Failed);
            return result;
        }

        private static ExplorerWindowState ReadWindowState(long handle, List<string> tabs)
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

            ExplorerWindowState state = new ExplorerWindowState();
            state.Path = tabs[0];
            state.Title = NativeMethods.GetWindowTitle(hwnd);
            state.Left = rect.Left;
            state.Top = rect.Top;
            state.Width = rect.Width;
            state.Height = rect.Height;
            state.ShowCommand = showCommand;

            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < tabs.Count; i++)
            {
                if (string.IsNullOrEmpty(tabs[i]))
                {
                    continue;
                }
                if (seen.Add(tabs[i].Trim()))
                {
                    state.Tabs.Add(tabs[i].Trim());
                }
            }

            return state;
        }

        private static bool TryClaimExisting(List<LiveWindow> live, HashSet<long> claimed,
            string path, out long handle)
        {
            handle = 0;
            if (live == null)
            {
                return false;
            }

            for (int i = 0; i < live.Count; i++)
            {
                LiveWindow window = live[i];
                if (claimed.Contains(window.Handle))
                {
                    continue;
                }

                if (window.HasPath(path))
                {
                    claimed.Add(window.Handle);
                    handle = window.Handle;
                    return true;
                }
            }

            return false;
        }

        private static bool ApplyBounds(long handle, Rectangle baseRectangle, int tabIndex,
            int showCommand, out string error)
        {
            error = null;
            if (handle == 0)
            {
                error = "无效的窗口句柄";
                return false;
            }

            IntPtr hwnd = new IntPtr(handle);
            Rectangle rectangle = tabIndex == 0
                ? WindowGeometry.Sanitize(baseRectangle)
                : WindowGeometry.OffsetForTab(baseRectangle, tabIndex);

            int show = tabIndex == 0
                ? WindowGeometry.NormalizeShowCommand(showCommand)
                : NativeMethods.SW_SHOWNORMAL;

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
                    rectangle.Left,
                    rectangle.Top,
                    Math.Max(200, rectangle.Width),
                    Math.Max(120, rectangle.Height),
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
                string windowsDirectory = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
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
                startInfo.WorkingDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);

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
                        if (!currentPaths.TryGetValue(candidates[c], out tabs) || tabs == null)
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
                if (candidate != 0 && DateTime.UtcNow - started > TimeSpan.FromMilliseconds(1200))
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
            error = null;
            Dictionary<long, List<string>> result =
                new Dictionary<long, List<string>>();

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

                        string path = GetShellWindowPath(window);
                        if (string.IsNullOrEmpty(path) || !PathTools.LooksRestorable(path))
                        {
                            continue;
                        }

                        path = PathTools.TrimTrailingSeparators(path);
                        List<string> tabs;
                        if (!result.TryGetValue(handle, out tabs))
                        {
                            tabs = new List<string>();
                            result[handle] = tabs;
                        }

                        bool already = false;
                        for (int t = 0; t < tabs.Count; t++)
                        {
                            if (PathTools.PathsEqual(tabs[t], path))
                            {
                                already = true;
                                break;
                            }
                        }
                        if (!already)
                        {
                            tabs.Add(path);
                        }
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
                return null;
            }
            finally
            {
                ReleaseComObject(windowsObject);
                ReleaseComObject(shellObject);
            }

            return result;
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
