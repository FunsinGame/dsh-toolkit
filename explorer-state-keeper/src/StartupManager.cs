using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ExplorerStateKeeper
{
    internal static class StartupManager
    {
        private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string ValueName = "ExplorerStateKeeper";
        private const string ShortcutName = "ExplorerStateKeeper.lnk";

        public static bool IsEnabled()
        {
            try
            {
                if (File.Exists(GetShortcutPath()))
                {
                    return true;
                }
                return HasLegacyRunEntry();
            }
            catch (Exception ex)
            {
                Log.Error("读取开机启动设置失败", ex);
                return false;
            }
        }

        public static bool Apply(bool enabled)
        {
            if (!enabled)
            {
                return Disable();
            }

            if (CreateStartupShortcut())
            {
                if (RemoveLegacyRunEntry())
                {
                    Log.Info("开机自动启动：已启用（启动文件夹快捷方式）");
                    return true;
                }

                // Leaving both mechanisms active would launch the app twice at
                // logon.  Drop the shortcut and keep the (updated) Run entry.
                Log.Warn("无法清理旧 Run 启动项，改用单一 Run 启动方式。");
                try
                {
                    File.Delete(GetShortcutPath());
                }
                catch
                {
                }
                return ApplyLegacyRunEntry();
            }

            Log.Warn("启动文件夹快捷方式创建失败，回退到注册表 Run。");
            return ApplyLegacyRunEntry();
        }

        private static string GetShortcutPath()
        {
            string startup = Environment.GetFolderPath(
                Environment.SpecialFolder.Startup);
            return Path.Combine(startup, ShortcutName);
        }

        private static bool CreateStartupShortcut()
        {
            object shellObject = null;
            object shortcutObject = null;
            try
            {
                string path = GetShortcutPath();
                string directory = Path.GetDirectoryName(path);
                if (string.IsNullOrEmpty(directory))
                {
                    return false;
                }
                Directory.CreateDirectory(directory);

                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType == null)
                {
                    return false;
                }

                shellObject = Activator.CreateInstance(shellType);
                dynamic shell = shellObject;
                shortcutObject = shell.CreateShortcut(path);
                dynamic shortcut = shortcutObject;
                shortcut.TargetPath = Application.ExecutablePath;
                shortcut.WorkingDirectory = Path.GetDirectoryName(
                    Application.ExecutablePath);
                shortcut.Description = "资源管理器状态守护";
                shortcut.Arguments = "--startup";
                shortcut.WindowStyle = 1;
                shortcut.Save();

                return File.Exists(path);
            }
            catch (Exception ex)
            {
                Log.Error("创建启动文件夹快捷方式失败", ex);
                return false;
            }
            finally
            {
                ReleaseComObject(shortcutObject);
                ReleaseComObject(shellObject);
            }
        }

        private static bool Disable()
        {
            bool ok = true;
            try
            {
                string shortcut = GetShortcutPath();
                if (File.Exists(shortcut))
                {
                    File.Delete(shortcut);
                }
            }
            catch (Exception ex)
            {
                ok = false;
                Log.Error("删除启动文件夹快捷方式失败", ex);
            }

            if (!RemoveLegacyRunEntry())
            {
                ok = false;
            }

            if (ok)
            {
                Log.Info("开机自动启动：已关闭");
            }
            return ok;
        }

        private static bool HasLegacyRunEntry()
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKeyPath, false))
            {
                if (key == null)
                {
                    return false;
                }

                string value = key.GetValue(ValueName) as string;
                return !string.IsNullOrEmpty(value);
            }
        }

        private static bool ApplyLegacyRunEntry()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(RunKeyPath))
                {
                    if (key == null)
                    {
                        return false;
                    }

                    string command = "\"" + Application.ExecutablePath + "\" --startup";
                    key.SetValue(ValueName, command, RegistryValueKind.String);
                }

                Log.Info("开机自动启动：已启用（注册表 Run 回退）");
                return true;
            }
            catch (Exception ex)
            {
                Log.Error("写入注册表开机启动失败", ex);
                return false;
            }
        }

        private static bool RemoveLegacyRunEntry()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(
                    RunKeyPath, true))
                {
                    if (key == null)
                    {
                        return true;
                    }

                    key.DeleteValue(ValueName, false);
                    return true;
                }
            }
            catch (Exception ex)
            {
                Log.Error("清理旧注册表启动项失败", ex);
                return false;
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
            }
        }
    }
}
