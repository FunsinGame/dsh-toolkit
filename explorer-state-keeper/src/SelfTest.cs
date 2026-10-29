using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;

namespace ExplorerStateKeeper
{
    internal static class SelfTest
    {
        public static int Run(string dataDirectory)
        {
            if (string.IsNullOrEmpty(dataDirectory))
            {
                dataDirectory = Path.Combine(Path.GetTempPath(),
                    "ExplorerStateKeeperSelfTest-" + Guid.NewGuid().ToString("N"));
            }

            string directory = AppPaths.GetDataDirectory(dataDirectory);
            Log.Initialize(directory);

            List<string> failures = new List<string>();
            StringBuilder details = new StringBuilder();

            try
            {
                TestPaths(failures, details);
                TestBootId(failures, details);
                TestDynamicRuntime(failures, details);
                TestGeometry(failures);
                TestPersistence(directory, failures, details);
                TestRestoreTarget(directory, failures, details);
            }
            catch (Exception ex)
            {
                failures.Add("未处理异常：" + ex);
            }

            details.AppendLine();
            if (failures.Count == 0)
            {
                details.AppendLine("RESULT: PASS");
                Log.Info("自检通过。");
            }
            else
            {
                details.AppendLine("RESULT: FAIL");
                for (int i = 0; i < failures.Count; i++)
                {
                    details.AppendLine("  - " + failures[i]);
                }
                Log.Error("自检失败：" + string.Join(" | ", failures.ToArray()));
            }

            string reportPath = Path.Combine(directory, "self-test.txt");
            try
            {
                File.WriteAllText(reportPath, details.ToString(), new UTF8Encoding(false));
            }
            catch
            {
            }

            return failures.Count == 0 ? 0 : 1;
        }

        private static void TestPaths(List<string> failures, StringBuilder details)
        {
            string decoded = PathTools.FromLocationUrl("file:///C:/Temp/A%20B/");
            Expect(failures, details, "file URL 解码",
                string.Equals(decoded, @"C:\Temp\A B", StringComparison.OrdinalIgnoreCase),
                decoded);

            string unc = PathTools.FromLocationUrl("file://server/share/folder");
            Expect(failures, details, "UNC URL 解码",
                string.Equals(unc, @"\\server\share\folder", StringComparison.OrdinalIgnoreCase),
                unc);

            bool equal = PathTools.PathsEqual(@"C:\Temp\Folder\", @"c:\temp\folder");
            Expect(failures, details, "路径比较忽略大小写和末尾斜杠", equal, equal.ToString());

            string virtualFolder = PathTools.MapVirtualFolder("此电脑");
            Expect(failures, details, "此电脑虚拟路径",
                virtualFolder == "shell:MyComputerFolder", virtualFolder);

            bool fileSystem = PathTools.IsFileSystemPath(@"C:\Temp");
            bool notFileSystem = !PathTools.IsFileSystemPath("shell:MyComputerFolder");
            Expect(failures, details, "文件系统路径识别", fileSystem && notFileSystem,
                fileSystem + "/" + notFileSystem);

            bool restorable = PathTools.LooksRestorable(@"C:\Temp");
            bool notSearch = !PathTools.LooksRestorable("search-ms:query=test");
            Expect(failures, details, "可恢复路径过滤", restorable && notSearch,
                restorable + "/" + notSearch);

            string quotedRoot = PathTools.QuoteCommandLineArgument(@"C:\");
            Expect(failures, details, "根路径命令行引号",
                quotedRoot == "\"C:\\\\\"", quotedRoot);

            string quotedSpace = PathTools.QuoteCommandLineArgument(@"C:\A B");
            Expect(failures, details, "空格路径命令行引号",
                quotedSpace == "\"C:\\A B\"", quotedSpace);
        }

        private static void TestBootId(List<string> failures, StringBuilder details)
        {
            string first = BootInfo.GetBootId();
            string second = BootInfo.GetBootId();
            Expect(failures, details, "启动标识稳定且非空",
                !string.IsNullOrEmpty(first) &&
                string.Equals(first, second, StringComparison.Ordinal),
                first + " / " + second);
        }

        private static void TestDynamicRuntime(List<string> failures, StringBuilder details)
        {
            try
            {
                dynamic value = 40;
                int result = value + 2;
                Expect(failures, details, "C# 动态运行时可用", result == 42, result.ToString());
            }
            catch (Exception ex)
            {
                failures.Add("C# 动态运行时不可用：" + ex.Message);
            }
        }

        private static void TestGeometry(List<string> failures)
        {
            try
            {
                Rectangle bad = WindowGeometry.Sanitize(new Rectangle(-9000, -9000, 1000, 700));
                Expect(failures, null, "离屏窗口回到可见区域",
                    bad.Width >= 200 && bad.Height >= 120 &&
                    bad.Left > -9000 && bad.Top > -9000,
                    bad.ToString());

                Rectangle tiny = WindowGeometry.Sanitize(new Rectangle(10, 10, 20, 20));
                Expect(failures, null, "异常尺寸使用默认值",
                    tiny.Width >= 200 && tiny.Height >= 120,
                    tiny.ToString());

                Exception backgroundError = null;
                ManualResetEvent finished = new ManualResetEvent(false);
                Thread worker = new Thread(delegate()
                {
                    try
                    {
                        WindowGeometry.Sanitize(new Rectangle(-4000, -3000, 900, 600));
                    }
                    catch (Exception ex)
                    {
                        backgroundError = ex;
                    }
                    finally
                    {
                        finished.Set();
                    }
                });
                worker.IsBackground = true;
                worker.Start();
                bool completed = finished.WaitOne(3000);
                if (completed)
                {
                    finished.Close();
                }
                Expect(failures, null, "非 UI 线程计算窗口位置",
                    completed && backgroundError == null,
                    backgroundError == null ? "timeout" : backgroundError.Message);
            }
            catch (Exception ex)
            {
                failures.Add("窗口几何测试异常：" + ex.Message);
            }
        }

        private static void TestPersistence(string directory, List<string> failures,
            StringBuilder details)
        {
            SnapshotStore store = new SnapshotStore(directory);
            ExplorerSnapshot snapshot = new ExplorerSnapshot();
            snapshot.RecordedAt = "2026-10-29T21:03:04+08:00";
            snapshot.BootId = "boot-old";
            snapshot.Trigger = "manual";

            ExplorerWindowState window = new ExplorerWindowState();
            window.Path = @"C:\资料\项目";
            window.Title = "项目";
            window.Left = -1200;
            window.Top = 80;
            window.Width = 1100;
            window.Height = 720;
            window.ShowCommand = NativeMethods.SW_SHOWMAXIMIZED;
            window.Tabs.Add(@"C:\资料\项目");
            window.Tabs.Add(@"D:\备份");
            snapshot.Windows.Add(window);

            store.SaveState(snapshot);
            ExplorerSnapshot loaded = store.LoadState();
            Expect(failures, details, "状态 JSON 往返",
                loaded != null && loaded.Windows.Count == 1 &&
                loaded.Windows[0].Path == @"C:\资料\项目" &&
                loaded.Windows[0].GetPaths().Count == 2 &&
                loaded.Windows[0].Left == -1200 &&
                loaded.Windows[0].ShowCommand == NativeMethods.SW_SHOWMAXIMIZED,
                loaded == null ? "null" : loaded.ToDebugString());

            AppSettings settings = new AppSettings();
            settings.IntervalMinutes = 10;
            settings.AutoStart = false;
            settings.FirstRun = false;
            store.SaveSettings(settings);
            AppSettings loadedSettings = store.LoadSettings();
            Expect(failures, details, "设置 JSON 往返",
                loadedSettings.IntervalMinutes == 10 && !loadedSettings.AutoStart,
                loadedSettings.IntervalMinutes + "/" + loadedSettings.AutoStart);
        }

        private static void TestRestoreTarget(string directory, List<string> failures,
            StringBuilder details)
        {
            SnapshotStore store = new SnapshotStore(directory);
            store.PrepareRestoreForBoot("boot-new");

            bool fromPrevious;
            ExplorerSnapshot target = store.GetRestoreTarget("boot-new", out fromPrevious);
            Expect(failures, details, "跨启动保留恢复目标",
                target != null && target.Windows.Count == 1 && fromPrevious,
                target == null ? "null" : target.Describe());

            ExplorerSnapshot current = new ExplorerSnapshot();
            current.RecordedAt = DateTimeOffset.Now.ToString("o");
            current.BootId = "boot-new";
            ExplorerWindowState window = new ExplorerWindowState();
            window.Path = @"C:\当前";
            window.Width = 900;
            window.Height = 600;
            current.Windows.Add(window);
            store.SaveState(current);

            target = store.GetRestoreTarget("boot-new", out fromPrevious);
            Expect(failures, details, "新启动的记录不会覆盖关机前目标",
                target != null && target.Windows.Count == 1 &&
                target.Windows[0].Path == @"C:\资料\项目" && fromPrevious,
                target == null ? "null" : target.Windows[0].Path);
        }

        private static void Expect(List<string> failures, StringBuilder details,
            string name, bool condition, string actual)
        {
            if (details != null)
            {
                details.Append(condition ? "PASS  " : "FAIL  ").Append(name);
                if (!condition && !string.IsNullOrEmpty(actual))
                {
                    details.Append("  => ").Append(actual);
                }
                details.AppendLine();
            }

            if (!condition)
            {
                failures.Add(name + (string.IsNullOrEmpty(actual) ? "" : " => " + actual));
            }
        }
    }
}
