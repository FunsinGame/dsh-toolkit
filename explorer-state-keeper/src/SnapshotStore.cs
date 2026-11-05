using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace ExplorerStateKeeper
{
    internal sealed class SnapshotStore
    {
        private const int MaxHistoryEntries = 10;

        private readonly object _sync = new object();
        private readonly JavaScriptSerializer _serializer = new JavaScriptSerializer();
        private readonly string _statePath;
        private readonly string _restorePath;
        private readonly string _historyPath;
        private readonly string _settingsPath;

        public string DataDirectory { get; private set; }

        public SnapshotStore(string dataDirectory)
        {
            DataDirectory = dataDirectory;
            _statePath = Path.Combine(dataDirectory, "state.json");
            _restorePath = Path.Combine(dataDirectory, "restore.json");
            _historyPath = Path.Combine(dataDirectory, "history.json");
            _settingsPath = Path.Combine(dataDirectory, "settings.json");
            _serializer.MaxJsonLength = 8 * 1024 * 1024;
            _serializer.RecursionLimit = 64;
        }

        public AppSettings LoadSettings()
        {
            lock (_sync)
            {
                AppSettings settings = Load<AppSettings>(_settingsPath);
                if (settings == null)
                {
                    settings = new AppSettings();
                }
                settings.Normalize();
                return settings;
            }
        }

        public void SaveSettings(AppSettings settings)
        {
            lock (_sync)
            {
                settings.Normalize();
                SaveAtomic(_settingsPath, _serializer.Serialize(settings));
            }
        }

        public ExplorerSnapshot LoadState()
        {
            lock (_sync)
            {
                return NormalizeSnapshot(Load<ExplorerSnapshot>(_statePath));
            }
        }

        public ExplorerSnapshot LoadRestore()
        {
            lock (_sync)
            {
                return NormalizeSnapshot(Load<ExplorerSnapshot>(_restorePath));
            }
        }

        public void SaveState(ExplorerSnapshot snapshot)
        {
            lock (_sync)
            {
                SaveAtomic(_statePath, _serializer.Serialize(snapshot));
            }
        }

        public void SaveRestore(ExplorerSnapshot snapshot)
        {
            lock (_sync)
            {
                SaveAtomic(_restorePath, _serializer.Serialize(snapshot));
            }
        }

        public List<ExplorerSnapshot> LoadHistory()
        {
            lock (_sync)
            {
                return LoadHistoryUnlocked();
            }
        }

        public void AddHistory(ExplorerSnapshot snapshot)
        {
            if (snapshot == null || snapshot.Windows == null || snapshot.Windows.Count == 0)
            {
                return;
            }

            lock (_sync)
            {
                List<ExplorerSnapshot> history = LoadHistoryUnlocked();
                if (history.Count > 0 && history[0].IsSameState(snapshot))
                {
                    // Repeated timer snapshots with the same window state only
                    // refresh the newest entry instead of filling all 10 slots
                    // with duplicates.
                    history[0].RecordedAt = snapshot.RecordedAt;
                    history[0].BootId = snapshot.BootId;
                    history[0].Trigger = snapshot.Trigger;
                }
                else
                {
                    history.Insert(0, snapshot);
                }

                NormalizeHistory(history);
                SaveHistoryUnlocked(history);
            }
        }

        /// <summary>
        /// Upgrade from versions that only had state.json/restore.json.  The
        /// newest legacy snapshots become the first history entries.
        /// </summary>
        public void SeedHistoryFromLegacy()
        {
            lock (_sync)
            {
                if (File.Exists(_historyPath))
                {
                    return;
                }

                List<ExplorerSnapshot> history = new List<ExplorerSnapshot>();
                ExplorerSnapshot state = NormalizeSnapshot(
                    Load<ExplorerSnapshot>(_statePath));
                ExplorerSnapshot restore = NormalizeSnapshot(
                    Load<ExplorerSnapshot>(_restorePath));

                AddUniqueHistory(history, state);
                AddUniqueHistory(history, restore);
                if (history.Count == 0)
                {
                    return;
                }

                NormalizeHistory(history);
                SaveHistoryUnlocked(history);
                Log.Info("已从旧版记录初始化历史状态：" + history.Count + " 条。");
            }
        }

        private List<ExplorerSnapshot> LoadHistoryUnlocked()
        {
            SnapshotHistoryFile file = Load<SnapshotHistoryFile>(_historyPath);
            List<ExplorerSnapshot> history = new List<ExplorerSnapshot>();
            if (file != null && file.Snapshots != null)
            {
                for (int i = 0; i < file.Snapshots.Count; i++)
                {
                    ExplorerSnapshot snapshot = NormalizeSnapshot(file.Snapshots[i]);
                    if (snapshot != null && snapshot.Windows.Count > 0)
                    {
                        history.Add(snapshot);
                    }
                }
            }

            NormalizeHistory(history);
            return history;
        }

        private void SaveHistoryUnlocked(List<ExplorerSnapshot> history)
        {
            SnapshotHistoryFile file = new SnapshotHistoryFile();
            file.Snapshots = history;
            SaveAtomic(_historyPath, _serializer.Serialize(file));
        }

        private static void AddUniqueHistory(List<ExplorerSnapshot> history,
            ExplorerSnapshot snapshot)
        {
            if (snapshot == null || snapshot.Windows == null || snapshot.Windows.Count == 0)
            {
                return;
            }

            for (int i = 0; i < history.Count; i++)
            {
                if (history[i].IsSameState(snapshot))
                {
                    return;
                }
            }
            history.Add(snapshot);
        }

        private static void NormalizeHistory(List<ExplorerSnapshot> history)
        {
            if (history == null)
            {
                return;
            }

            history.Sort(delegate(ExplorerSnapshot left, ExplorerSnapshot right)
            {
                return GetSnapshotTime(right).CompareTo(GetSnapshotTime(left));
            });

            while (history.Count > MaxHistoryEntries)
            {
                history.RemoveAt(history.Count - 1);
            }
        }

        private static DateTime GetSnapshotTime(ExplorerSnapshot snapshot)
        {
            if (snapshot == null || string.IsNullOrEmpty(snapshot.RecordedAt))
            {
                return DateTime.MinValue;
            }

            DateTimeOffset parsed;
            if (DateTimeOffset.TryParse(snapshot.RecordedAt, out parsed))
            {
                return parsed.UtcDateTime;
            }
            return DateTime.MinValue;
        }

        /// <summary>
        /// At process start, preserve the latest snapshot from a previous boot
        /// as the restore target.  Timer snapshots from the new boot then update
        /// state.json without destroying what the user had before rebooting.
        /// </summary>
        public void PrepareRestoreForBoot(string currentBootId)
        {
            lock (_sync)
            {
                ExplorerSnapshot state = NormalizeSnapshot(Load<ExplorerSnapshot>(_statePath));
                if (state == null || state.Windows.Count == 0)
                {
                    return;
                }

                if (!string.Equals(state.BootId, currentBootId, StringComparison.Ordinal))
                {
                    SaveAtomic(_restorePath, _serializer.Serialize(state));
                    Log.Info("已保留上次启动的资源管理器状态：" + state.Describe());
                }
            }
        }

        public ExplorerSnapshot GetRestoreTarget(string currentBootId, out bool fromPreviousBoot)
        {
            lock (_sync)
            {
                ExplorerSnapshot restore = NormalizeSnapshot(Load<ExplorerSnapshot>(_restorePath));
                ExplorerSnapshot state = NormalizeSnapshot(Load<ExplorerSnapshot>(_statePath));

                if (restore != null && restore.Windows.Count > 0 &&
                    !string.Equals(restore.BootId, currentBootId, StringComparison.Ordinal))
                {
                    fromPreviousBoot = true;
                    return restore;
                }

                if (state != null && state.Windows.Count > 0)
                {
                    fromPreviousBoot = !string.Equals(state.BootId, currentBootId, StringComparison.Ordinal);
                    return state;
                }

                if (restore != null && restore.Windows.Count > 0)
                {
                    fromPreviousBoot = false;
                    return restore;
                }

                fromPreviousBoot = false;
                return null;
            }
        }

        private static ExplorerSnapshot NormalizeSnapshot(ExplorerSnapshot snapshot)
        {
            if (snapshot == null)
            {
                return null;
            }

            if (snapshot.Version <= 0)
            {
                snapshot.Version = 1;
            }

            if (snapshot.Windows == null)
            {
                snapshot.Windows = new List<ExplorerWindowState>();
            }

            for (int i = 0; i < snapshot.Windows.Count; i++)
            {
                ExplorerWindowState window = snapshot.Windows[i];
                if (window == null)
                {
                    snapshot.Windows.RemoveAt(i);
                    i--;
                    continue;
                }

                if (window.Tabs == null)
                {
                    window.Tabs = new List<string>();
                }

                if (window.ShowCommand != NativeMethods.SW_SHOWMINIMIZED &&
                    window.ShowCommand != NativeMethods.SW_SHOWMAXIMIZED)
                {
                    window.ShowCommand = NativeMethods.SW_SHOWNORMAL;
                }

                if (window.Width <= 0 || window.Height <= 0)
                {
                    window.Width = 0;
                    window.Height = 0;
                }

                if (window.ActiveTabIndex < -1)
                {
                    window.ActiveTabIndex = -1;
                }
            }

            return snapshot;
        }

        private T Load<T>(string path) where T : class
        {
            string actual = path;
            if (!File.Exists(actual) && File.Exists(actual + ".bak"))
            {
                actual = actual + ".bak";
            }

            if (!File.Exists(actual))
            {
                return null;
            }

            try
            {
                string json = File.ReadAllText(actual, Encoding.UTF8);
                if (string.IsNullOrWhiteSpace(json))
                {
                    return null;
                }
                return _serializer.Deserialize<T>(json);
            }
            catch (Exception ex)
            {
                Log.Error("读取 " + Path.GetFileName(actual) + " 失败", ex);

                string backup = path + ".bak";
                if (File.Exists(backup) && !string.Equals(actual, backup, StringComparison.OrdinalIgnoreCase))
                {
                    try
                    {
                        string json = File.ReadAllText(backup, Encoding.UTF8);
                        return _serializer.Deserialize<T>(json);
                    }
                    catch (Exception backupEx)
                    {
                        Log.Error("读取备份 " + Path.GetFileName(backup) + " 失败", backupEx);
                    }
                }
                return null;
            }
        }

        private static void SaveAtomic(string path, string json)
        {
            string directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            string temp = path + ".tmp";
            File.WriteAllText(temp, json, new UTF8Encoding(false));

            if (File.Exists(path))
            {
                string backup = path + ".bak";
                try
                {
                    if (File.Exists(backup))
                    {
                        File.Delete(backup);
                    }
                    File.Replace(temp, path, backup, true);
                }
                catch
                {
                    // File.Replace is not available on every filesystem (for
                    // example some network profiles); fall back to copy.
                    File.Copy(temp, path, true);
                    File.Delete(temp);
                }
            }
            else
            {
                File.Move(temp, path);
            }
        }
    }
}
