using System;
using System.IO;

namespace ExplorerStateKeeper
{
    internal static class PathTools
    {
        public static string NormalizeForCompare(string path)
        {
            if (string.IsNullOrEmpty(path))
            {
                return string.Empty;
            }

            string result = path.Trim();
            if (result.StartsWith("file:", StringComparison.OrdinalIgnoreCase))
            {
                result = FromLocationUrl(result);
            }

            if (result.StartsWith("::", StringComparison.Ordinal))
            {
                result = "shell:" + result;
            }

            if (result.StartsWith("shell:", StringComparison.OrdinalIgnoreCase))
            {
                return result.TrimEnd('\\', '/').ToLowerInvariant();
            }

            // A normal drive path: C:\Folder\  ->  C:\Folder
            if (result.Length > 3)
            {
                result = result.TrimEnd('\\', '/');
            }

            return result.ToLowerInvariant();
        }

        public static bool PathsEqual(string left, string right)
        {
            return string.Equals(NormalizeForCompare(left), NormalizeForCompare(right),
                StringComparison.Ordinal);
        }

        public static string FromLocationUrl(string url)
        {
            if (string.IsNullOrEmpty(url))
            {
                return string.Empty;
            }

            if (!url.StartsWith("file:", StringComparison.OrdinalIgnoreCase))
            {
                return url;
            }

            try
            {
                Uri uri = new Uri(url, UriKind.Absolute);
                if (uri.IsFile)
                {
                    string local = uri.LocalPath;
                    if (!string.IsNullOrEmpty(local))
                    {
                        return TrimTrailingSeparators(local);
                    }
                }
            }
            catch
            {
                // Fall through to the manual decoder.
            }

            string raw = Uri.UnescapeDataString(url.Substring(5));
            raw = raw.Replace('/', '\\');
            if (raw.StartsWith("\\\\\\", StringComparison.Ordinal))
            {
                // file:///C:/folder -> C:\folder
                raw = raw.TrimStart('\\');
            }
            return TrimTrailingSeparators(raw);
        }

        public static string TrimTrailingSeparators(string path)
        {
            if (string.IsNullOrEmpty(path))
            {
                return string.Empty;
            }

            string result = path;
            if (result.Length > 3)
            {
                result = result.TrimEnd('\\', '/');
            }
            return result;
        }

        public static bool IsVirtualPath(string path)
        {
            if (string.IsNullOrEmpty(path))
            {
                return false;
            }

            string p = path.Trim();
            return p.StartsWith("shell:", StringComparison.OrdinalIgnoreCase) ||
                   p.StartsWith("::", StringComparison.Ordinal);
        }

        public static bool IsFileSystemPath(string path)
        {
            if (string.IsNullOrEmpty(path))
            {
                return false;
            }

            string p = path.Trim();
            if (IsVirtualPath(p))
            {
                return false;
            }

            return (p.Length >= 3 && char.IsLetter(p[0]) && p[1] == ':' &&
                    (p[2] == '\\' || p[2] == '/')) ||
                   p.StartsWith("\\\\", StringComparison.Ordinal);
        }

        public static bool LooksRestorable(string path)
        {
            if (string.IsNullOrEmpty(path))
            {
                return false;
            }

            string p = path.Trim();
            if (p.Length == 0)
            {
                return false;
            }

            if (p.StartsWith("search-ms:", StringComparison.OrdinalIgnoreCase) ||
                p.StartsWith("search:", StringComparison.OrdinalIgnoreCase) ||
                p.StartsWith("http:", StringComparison.OrdinalIgnoreCase) ||
                p.StartsWith("https:", StringComparison.OrdinalIgnoreCase) ||
                p.StartsWith("javascript:", StringComparison.OrdinalIgnoreCase) ||
                p.StartsWith("about:", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            return true;
        }

        public static string MapVirtualFolder(string locationName)
        {
            if (string.IsNullOrEmpty(locationName))
            {
                return string.Empty;
            }

            string name = locationName.Replace(" ", string.Empty).ToLowerInvariant();
            if (name.Contains("此电脑") || name.Contains("我的电脑") ||
                name.Contains("thispc") || name.Contains("computer"))
            {
                return "shell:MyComputerFolder";
            }
            if (name.Contains("回收站") || name.Contains("recycle"))
            {
                return "shell:RecycleBinFolder";
            }
            if (name.Contains("网络") || name.Contains("network"))
            {
                return "shell:NetworkPlacesFolder";
            }
            if (name.Contains("控制面板") || name.Contains("controlpanel"))
            {
                return "shell:ControlPanelFolder";
            }
            if (name.Contains("主文件夹") || name == "home")
            {
                return "shell:UserProfile";
            }
            if (name.Contains("快速访问") || name.Contains("quickaccess"))
            {
                return "shell:::{679f85cb-0220-4080-b29b-5540cc05aab6}";
            }

            return string.Empty;
        }

        /// <summary>
        /// Quotes one command-line argument using the Windows C runtime rules.
        /// In particular, a trailing backslash (for example the root "C:\")
        /// must be doubled before the closing quote.
        /// </summary>
        public static string QuoteCommandLineArgument(string value)
        {
            if (value == null)
            {
                return "\"\"";
            }

            System.Text.StringBuilder result = new System.Text.StringBuilder();
            result.Append('"');
            int backslashes = 0;
            for (int i = 0; i < value.Length; i++)
            {
                char c = value[i];
                if (c == '\\')
                {
                    backslashes++;
                }
                else if (c == '"')
                {
                    result.Append('\\', backslashes * 2 + 1);
                    result.Append('"');
                    backslashes = 0;
                }
                else
                {
                    if (backslashes > 0)
                    {
                        result.Append('\\', backslashes);
                        backslashes = 0;
                    }
                    result.Append(c);
                }
            }

            if (backslashes > 0)
            {
                result.Append('\\', backslashes * 2);
            }
            result.Append('"');
            return result.ToString();
        }

        public static string LeafName(string path)
        {
            if (string.IsNullOrEmpty(path))
            {
                return string.Empty;
            }

            string p = path.TrimEnd('\\', '/');
            int slash = p.LastIndexOfAny(new char[] { '\\', '/' });
            if (slash >= 0 && slash + 1 < p.Length)
            {
                return p.Substring(slash + 1);
            }
            return p;
        }

        public static bool LocalDirectoryExists(string path)
        {
            if (!IsFileSystemPath(path))
            {
                return true;
            }

            // Do not probe UNC paths here: a dead network share can block for
            // a long time.  Explorer itself will surface the error in that case.
            if (path.StartsWith("\\\\", StringComparison.Ordinal))
            {
                return true;
            }

            try
            {
                return Directory.Exists(path);
            }
            catch
            {
                return false;
            }
        }
    }
}
