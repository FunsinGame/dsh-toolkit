using System;
using System.Collections.Generic;
using System.Text;
using System.Web.Script.Serialization;

namespace ExplorerStateKeeper
{
    /// <summary>
    /// One File Explorer window.  Windows 11 tabs can be exposed by Shell COM as
    /// several windows sharing an HWND; in that case <see cref="Tabs"/> holds the
    /// folder path of every tab while the bounds are shared by the window.
    /// </summary>
    internal sealed class ExplorerWindowState
    {
        public string Path { get; set; }
        public string Title { get; set; }
        public List<string> Tabs { get; set; }

        public int Left { get; set; }
        public int Top { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }

        /// <summary>SW_SHOWNORMAL (1), SW_SHOWMINIMIZED (2) or SW_SHOWMAXIMIZED (3).</summary>
        public int ShowCommand { get; set; }

        public ExplorerWindowState()
        {
            Tabs = new List<string>();
            ShowCommand = 1;
        }

        public List<string> GetPaths()
        {
            List<string> result = new List<string>();
            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            AddPath(result, seen, Path);
            if (Tabs != null)
            {
                for (int i = 0; i < Tabs.Count; i++)
                {
                    AddPath(result, seen, Tabs[i]);
                }
            }

            return result;
        }

        public string GetPrimaryPath()
        {
            List<string> paths = GetPaths();
            return paths.Count == 0 ? string.Empty : paths[0];
        }

        private static void AddPath(List<string> result, HashSet<string> seen, string path)
        {
            if (string.IsNullOrEmpty(path))
            {
                return;
            }

            string trimmed = path.Trim();
            if (trimmed.Length == 0)
            {
                return;
            }

            if (seen.Add(PathTools.NormalizeForCompare(trimmed)))
            {
                result.Add(trimmed);
            }
        }

        public ExplorerWindowState Clone()
        {
            ExplorerWindowState copy = new ExplorerWindowState();
            copy.Path = Path;
            copy.Title = Title;
            copy.Tabs = Tabs == null ? new List<string>() : new List<string>(Tabs);
            copy.Left = Left;
            copy.Top = Top;
            copy.Width = Width;
            copy.Height = Height;
            copy.ShowCommand = ShowCommand;
            return copy;
        }
    }

    internal sealed class ExplorerSnapshot
    {
        public int Version { get; set; }
        public string RecordedAt { get; set; }
        public string BootId { get; set; }
        public string Trigger { get; set; }
        public List<ExplorerWindowState> Windows { get; set; }

        public ExplorerSnapshot()
        {
            Version = 1;
            Windows = new List<ExplorerWindowState>();
        }

        [ScriptIgnore]
        public int WindowCount
        {
            get { return Windows == null ? 0 : Windows.Count; }
        }

        [ScriptIgnore]
        public int FolderCount
        {
            get
            {
                if (Windows == null)
                {
                    return 0;
                }

                int count = 0;
                for (int i = 0; i < Windows.Count; i++)
                {
                    count += Windows[i].GetPaths().Count;
                }
                return count;
            }
        }

        public string DescribeTime()
        {
            DateTimeOffset parsed;
            if (!string.IsNullOrEmpty(RecordedAt) &&
                DateTimeOffset.TryParse(RecordedAt, out parsed))
            {
                return parsed.LocalDateTime.ToString("MM-dd HH:mm");
            }
            return "未知时间";
        }

        public string Describe()
        {
            return DescribeTime() + " · " + FolderCount + " 个窗口";
        }

        public ExplorerSnapshot Clone()
        {
            ExplorerSnapshot copy = new ExplorerSnapshot();
            copy.Version = Version;
            copy.RecordedAt = RecordedAt;
            copy.BootId = BootId;
            copy.Trigger = Trigger;
            copy.Windows = new List<ExplorerWindowState>();
            if (Windows != null)
            {
                for (int i = 0; i < Windows.Count; i++)
                {
                    copy.Windows.Add(Windows[i].Clone());
                }
            }
            return copy;
        }

        public string ToDebugString()
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("snapshot ").Append(Describe());
            if (Windows != null)
            {
                for (int i = 0; i < Windows.Count; i++)
                {
                    ExplorerWindowState w = Windows[i];
                    sb.AppendLine();
                    sb.Append("  [").Append(i).Append("] ")
                      .Append(w.Left).Append(",").Append(w.Top).Append(" ")
                      .Append(w.Width).Append("x").Append(w.Height)
                      .Append(" show=").Append(w.ShowCommand)
                      .Append(" ").Append(string.Join(" | ", w.GetPaths().ToArray()));
                }
            }
            return sb.ToString();
        }
    }

    internal sealed class AppSettings
    {
        public int IntervalMinutes { get; set; }
        public bool AutoStart { get; set; }
        public bool FirstRun { get; set; }

        public AppSettings()
        {
            IntervalMinutes = 5;
            AutoStart = true;
            FirstRun = true;
        }

        public void Normalize()
        {
            if (IntervalMinutes != 1 && IntervalMinutes != 5 &&
                IntervalMinutes != 10 && IntervalMinutes != 30)
            {
                IntervalMinutes = 5;
            }
        }
    }

    internal sealed class CaptureResult
    {
        public bool Success { get; set; }
        public string Error { get; set; }
        public List<ExplorerWindowState> Windows { get; set; }

        public CaptureResult()
        {
            Windows = new List<ExplorerWindowState>();
        }
    }

    internal sealed class LiveWindow
    {
        public long Handle { get; set; }
        public string Title { get; set; }
        public List<string> Paths { get; set; }

        public LiveWindow()
        {
            Paths = new List<string>();
        }

        public bool HasPath(string path)
        {
            for (int i = 0; i < Paths.Count; i++)
            {
                if (PathTools.PathsEqual(Paths[i], path))
                {
                    return true;
                }
            }
            return false;
        }
    }

    internal sealed class RestoreResult
    {
        public int Restored { get; set; }
        public int Failed { get; set; }
        public List<string> Errors { get; set; }
        public string FatalError { get; set; }

        public RestoreResult()
        {
            Errors = new List<string>();
        }
    }
}
