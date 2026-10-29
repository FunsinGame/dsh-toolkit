using System;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ExplorerStateKeeper
{
    internal static class StartupManager
    {
        private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string ValueName = "ExplorerStateKeeper";

        public static bool IsEnabled()
        {
            try
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
            catch (Exception ex)
            {
                Log.Error("读取开机启动设置失败", ex);
                return false;
            }
        }

        public static bool Apply(bool enabled)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(RunKeyPath))
                {
                    if (key == null)
                    {
                        return false;
                    }

                    if (enabled)
                    {
                        string command = "\"" + Application.ExecutablePath + "\"";
                        key.SetValue(ValueName, command, RegistryValueKind.String);
                    }
                    else
                    {
                        key.DeleteValue(ValueName, false);
                    }
                }

                Log.Info("开机自动启动：" + (enabled ? "已启用" : "已关闭"));
                return true;
            }
            catch (Exception ex)
            {
                Log.Error("写入开机启动设置失败", ex);
                return false;
            }
        }
    }
}
