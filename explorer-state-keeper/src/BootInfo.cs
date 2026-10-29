using System;
using Microsoft.Win32;

namespace ExplorerStateKeeper
{
    internal static class BootInfo
    {
        private const string PrefetchKeyPath =
            @"SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management\PrefetchParameters";

        /// <summary>
        /// Identifier for the current Windows boot session.  The prefetch BootId
        /// is incremented by Windows on every boot (including fast startup), so
        /// it is preferable to deriving a boot time from uptime.  The uptime
        /// calculation remains as a fallback for unusual systems.
        /// </summary>
        public static string GetBootId()
        {
            try
            {
                using (RegistryKey key = Registry.LocalMachine.OpenSubKey(PrefetchKeyPath, false))
                {
                    if (key != null)
                    {
                        object value = key.GetValue("BootId");
                        if (value != null)
                        {
                            return "reg-" + Convert.ToString(value);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Log.Warn("读取 BootId 失败，改用运行时间推算：" + ex.Message);
            }

            try
            {
                ulong milliseconds = NativeMethods.GetTickCount64();
                DateTime bootUtc = DateTime.UtcNow.AddMilliseconds(-(double)milliseconds);
                return "uptime-" + bootUtc.ToString("yyyyMMddHHmm");
            }
            catch
            {
                return "time-" + DateTime.UtcNow.ToString("yyyyMMddHHmm");
            }
        }
    }
}
