using System;
using System.IO;
using System.Text;

namespace ExplorerStateKeeper
{
    internal static class AppPaths
    {
        public static string GetDataDirectory(string overriddenDirectory)
        {
            string dir;
            if (!string.IsNullOrEmpty(overriddenDirectory))
            {
                dir = Path.GetFullPath(overriddenDirectory);
            }
            else
            {
                dir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "ExplorerStateKeeper");
            }

            Directory.CreateDirectory(dir);
            Directory.CreateDirectory(Path.Combine(dir, "logs"));
            return dir;
        }
    }

    internal static class Log
    {
        private static readonly object Sync = new object();
        private static string _path;

        public static void Initialize(string dataDirectory)
        {
            lock (Sync)
            {
                _path = Path.Combine(dataDirectory, "logs", "app.log");
            }
        }

        public static void Info(string message)
        {
            Write("INFO", message);
        }

        public static void Warn(string message)
        {
            Write("WARN", message);
        }

        public static void Error(string message)
        {
            Write("ERROR", message);
        }

        public static void Error(string message, Exception exception)
        {
            if (exception == null)
            {
                Write("ERROR", message);
            }
            else
            {
                Write("ERROR", message + Environment.NewLine + exception);
            }
        }

        private static void Write(string level, string message)
        {
            lock (Sync)
            {
                if (string.IsNullOrEmpty(_path))
                {
                    return;
                }

                try
                {
                    RotateIfNeeded();
                    string line = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") +
                                  " [" + level + "] " + message + Environment.NewLine;
                    File.AppendAllText(_path, line, new UTF8Encoding(false));
                }
                catch
                {
                    // Logging must never take the tray application down.
                }
            }
        }

        private static void RotateIfNeeded()
        {
            FileInfo info = new FileInfo(_path);
            if (!info.Exists || info.Length < 1024 * 1024)
            {
                return;
            }

            string old = _path + ".old";
            try
            {
                if (File.Exists(old))
                {
                    File.Delete(old);
                }
                File.Move(_path, old);
            }
            catch
            {
                // Keep appending to the current file if rotation fails.
            }
        }
    }
}
