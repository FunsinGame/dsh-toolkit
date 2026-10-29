using System;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace ExplorerStateKeeper
{
    internal static class Program
    {
        private const string MutexName = @"Local\ExplorerStateKeeper.SingleInstance";

        [STAThread]
        private static int Main(string[] args)
        {
            bool selfTest = false;
            bool manageAutoStart = true;
            string dataDirectory = null;

            for (int i = 0; i < args.Length; i++)
            {
                string argument = args[i];
                if (string.Equals(argument, "--self-test", StringComparison.OrdinalIgnoreCase))
                {
                    selfTest = true;
                }
                else if (string.Equals(argument, "--no-autostart", StringComparison.OrdinalIgnoreCase))
                {
                    manageAutoStart = false;
                }
                else if (string.Equals(argument, "--data-dir", StringComparison.OrdinalIgnoreCase))
                {
                    if (i + 1 < args.Length)
                    {
                        dataDirectory = args[++i];
                    }
                }
                else if (argument.StartsWith("--data-dir=", StringComparison.OrdinalIgnoreCase))
                {
                    dataDirectory = argument.Substring("--data-dir=".Length);
                }
            }

            if (selfTest)
            {
                return SelfTest.Run(dataDirectory);
            }

            string resolvedDataDirectory;
            try
            {
                resolvedDataDirectory = AppPaths.GetDataDirectory(dataDirectory);
                Log.Initialize(resolvedDataDirectory);
            }
            catch (Exception ex)
            {
                MessageBox.Show("无法创建数据目录：\n" + ex.Message,
                    "资源管理器状态守护", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }

            NativeMethods.TryEnablePerMonitorDpiAwareness();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);

            Application.ThreadException += delegate(object sender, ThreadExceptionEventArgs e)
            {
                Log.Error("界面线程未处理异常", e.Exception);
                try
                {
                    MessageBox.Show("程序遇到一个错误，但会继续在通知区域运行。\n\n" + e.Exception.Message,
                        "资源管理器状态守护", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
                catch
                {
                }
            };

            AppDomain.CurrentDomain.UnhandledException += delegate(object sender, UnhandledExceptionEventArgs e)
            {
                Log.Error("未处理异常", e.ExceptionObject as Exception);
            };

            bool createdNew;
            using (Mutex mutex = new Mutex(true, MutexName, out createdNew))
            {
                if (!createdNew)
                {
                    MessageBox.Show("资源管理器状态守护已经在运行。\n请查看任务栏通知区域。",
                        "资源管理器状态守护", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 0;
                }

                TrayAppContext context = null;
                try
                {
                    context = new TrayAppContext(resolvedDataDirectory, manageAutoStart);
                    Application.Run(context);
                    return 0;
                }
                catch (Exception ex)
                {
                    Log.Error("程序启动或运行时发生致命错误", ex);
                    try
                    {
                        MessageBox.Show("资源管理器状态守护无法继续运行：\n\n" + ex.Message +
                                        "\n\n日志：" + Path.Combine(resolvedDataDirectory, "logs", "app.log"),
                            "资源管理器状态守护", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                    catch
                    {
                    }
                    return 1;
                }
                finally
                {
                    if (context != null)
                    {
                        try
                        {
                            context.Dispose();
                        }
                        catch
                        {
                        }
                    }
                }
            }
        }
    }
}
