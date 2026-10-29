using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ExplorerStateKeeper
{
    internal sealed class TrayAppContext : ApplicationContext
    {
        private readonly SnapshotStore _store;
        private readonly ExplorerService _service = new ExplorerService();
        private readonly string _bootId;
        private readonly bool _manageAutoStart;
        private readonly Control _dispatcher = new Control();
        private readonly object _recordSync = new object();

        private readonly NotifyIcon _notifyIcon;
        private readonly ContextMenuStrip _menu;
        private readonly ToolStripMenuItem _statusItem;
        private readonly ToolStripMenuItem _recordItem;
        private readonly ToolStripMenuItem _restoreItem;
        private readonly ToolStripMenuItem _autoStartItem;
        private readonly ToolStripMenuItem _exitItem;
        private readonly ToolStripMenuItem[] _intervalItems;

        private readonly System.Windows.Forms.Timer _timer;
        private readonly System.Windows.Forms.Timer _startupTipTimer;

        private AppSettings _settings;
        private Stream _iconStream;
        private Icon _icon;
        private ExplorerSnapshot _lastSnapshot;
        private int _busy;
        private int _restoring;
        private bool _disposed;
        private bool _exiting;
        private bool _startupTipForRestore;
        private bool _firstRun;

        public TrayAppContext(string dataDirectory, bool manageAutoStart)
        {
            _store = new SnapshotStore(dataDirectory);
            _settings = _store.LoadSettings();
            _firstRun = _settings.FirstRun;
            _bootId = BootInfo.GetBootId();
            _manageAutoStart = manageAutoStart;

            try
            {
                _store.PrepareRestoreForBoot(_bootId);
            }
            catch (Exception ex)
            {
                Log.Error("准备恢复目标失败", ex);
            }

            if (_manageAutoStart)
            {
                if (!StartupManager.Apply(_settings.AutoStart))
                {
                    Log.Warn("开机自动启动设置写入失败。");
                }
            }

            if (_settings.FirstRun)
            {
                _settings.FirstRun = false;
                try
                {
                    _store.SaveSettings(_settings);
                }
                catch (Exception ex)
                {
                    Log.Error("保存初始设置失败", ex);
                }
            }

            _dispatcher.CreateControl();

            _menu = new ContextMenuStrip();
            _menu.Opening += OnMenuOpening;

            _statusItem = new ToolStripMenuItem("正在读取上次记录…");
            _statusItem.Enabled = false;

            _recordItem = new ToolStripMenuItem("记录当前状态");
            _recordItem.Click += OnRecordClick;

            _restoreItem = new ToolStripMenuItem("恢复上次状态");
            _restoreItem.Click += OnRestoreClick;

            _intervalItems = new ToolStripMenuItem[4];
            ToolStripMenuItem intervalMenu = new ToolStripMenuItem("自动记录间隔");
            int[] minutes = new int[] { 1, 5, 10, 30 };
            for (int i = 0; i < minutes.Length; i++)
            {
                ToolStripMenuItem item = new ToolStripMenuItem(minutes[i] + " 分钟");
                item.Tag = minutes[i];
                item.Click += OnIntervalClick;
                _intervalItems[i] = item;
                intervalMenu.DropDownItems.Add(item);
            }

            _autoStartItem = new ToolStripMenuItem("开机自动启动");
            _autoStartItem.Click += OnAutoStartClick;

            ToolStripMenuItem dataItem = new ToolStripMenuItem("打开数据目录");
            dataItem.Click += OnOpenDataDirectory;

            ToolStripMenuItem aboutItem = new ToolStripMenuItem("关于");
            aboutItem.Click += OnAboutClick;

            _exitItem = new ToolStripMenuItem("关闭");
            _exitItem.Click += OnExitClick;

            _menu.Items.Add(_statusItem);
            _menu.Items.Add(new ToolStripSeparator());
            _menu.Items.Add(_recordItem);
            _menu.Items.Add(_restoreItem);
            _menu.Items.Add(new ToolStripSeparator());
            _menu.Items.Add(intervalMenu);
            _menu.Items.Add(_autoStartItem);
            _menu.Items.Add(dataItem);
            _menu.Items.Add(aboutItem);
            _menu.Items.Add(new ToolStripSeparator());
            _menu.Items.Add(_exitItem);

            _icon = LoadAppIcon();
            _notifyIcon = new NotifyIcon();
            _notifyIcon.Icon = _icon;
            _notifyIcon.Text = "资源管理器状态守护";
            _notifyIcon.ContextMenuStrip = _menu;
            _notifyIcon.Visible = true;
            _notifyIcon.BalloonTipClicked += OnBalloonTipClicked;
            _notifyIcon.BalloonTipClosed += OnBalloonTipClosed;

            _timer = new System.Windows.Forms.Timer();
            _timer.Interval = GetIntervalMilliseconds();
            _timer.Tick += OnTimerTick;
            _timer.Start();

            _startupTipTimer = new System.Windows.Forms.Timer();
            _startupTipTimer.Interval = 1800;
            _startupTipTimer.Tick += OnStartupTipTick;
            _startupTipTimer.Start();

            SystemEvents.SessionEnding += OnSessionEnding;

            UpdateTrayText();
            Log.Info("程序已启动。BootId=" + _bootId +
                     "，数据目录：" + _store.DataDirectory +
                     "，记录间隔：" + _settings.IntervalMinutes + " 分钟");
        }

        private int GetIntervalMilliseconds()
        {
            return _settings.IntervalMinutes * 60 * 1000;
        }

        private void OnMenuOpening(object sender, System.ComponentModel.CancelEventArgs e)
        {
            RefreshMenu();
        }

        private void RefreshMenu()
        {
            bool fromPreviousBoot = false;
            ExplorerSnapshot target = null;
            try
            {
                target = _store.GetRestoreTarget(_bootId, out fromPreviousBoot);
            }
            catch (Exception ex)
            {
                Log.Error("读取恢复目标失败", ex);
            }

            if (target != null && target.WindowCount > 0)
            {
                _statusItem.Text = (fromPreviousBoot ? "关机前：" : "上次记录：") +
                                   target.Describe();
                _restoreItem.Enabled = Interlocked.CompareExchange(ref _busy, 0, 0) == 0;
            }
            else
            {
                _statusItem.Text = "还没有可恢复的记录";
                _restoreItem.Enabled = false;
            }

            _recordItem.Enabled = Interlocked.CompareExchange(ref _busy, 0, 0) == 0;
            _exitItem.Enabled = Interlocked.CompareExchange(ref _restoring, 0, 0) == 0;

            for (int i = 0; i < _intervalItems.Length; i++)
            {
                int value = Convert.ToInt32(_intervalItems[i].Tag);
                _intervalItems[i].Checked = value == _settings.IntervalMinutes;
            }

            if (_manageAutoStart)
            {
                _autoStartItem.Checked = StartupManager.IsEnabled();
            }
            else
            {
                _autoStartItem.Checked = _settings.AutoStart;
            }
        }

        private void OnTimerTick(object sender, EventArgs e)
        {
            if (_disposed)
            {
                return;
            }
            Record(false, true);
        }

        private void OnRecordClick(object sender, EventArgs e)
        {
            Record(true, true);
        }

        private void Record(bool manual, bool updateUi)
        {
            if (_disposed)
            {
                return;
            }

            if (Interlocked.CompareExchange(ref _busy, 1, 0) != 0)
            {
                if (manual)
                {
                    ShowBalloon("请稍候", "正在记录或恢复，请稍后再试。", ToolTipIcon.Info);
                }
                return;
            }

            try
            {
                lock (_recordSync)
                {
                    CaptureResult capture = _service.Capture();
                    if (!capture.Success)
                    {
                        Log.Warn("记录失败：" + capture.Error);
                        if (manual)
                        {
                            ShowBalloon("记录失败", capture.Error, ToolTipIcon.Warning);
                        }
                        return;
                    }

                    if (capture.Windows.Count == 0)
                    {
                        if (manual)
                        {
                            ShowBalloon("没有可记录的窗口",
                                "当前没有打开的资源管理器文件夹窗口。", ToolTipIcon.Info);
                        }
                        return;
                    }

                    ExplorerSnapshot snapshot = new ExplorerSnapshot();
                    snapshot.RecordedAt = DateTimeOffset.Now.ToString("o");
                    snapshot.BootId = _bootId;
                    snapshot.Trigger = manual ? "manual" : "timer";
                    snapshot.Windows = capture.Windows;

                    _store.SaveState(snapshot);
                    _lastSnapshot = snapshot;
                    Log.Info("已记录 " + snapshot.WindowCount + " 个窗口（" +
                             (manual ? "手动" : "定时") + "）。");

                    if (updateUi && !_disposed)
                    {
                        UpdateTrayText();
                        if (manual)
                        {
                            ShowBalloon("记录成功",
                                "已保存 " + snapshot.WindowCount + " 个资源管理器窗口。",
                                ToolTipIcon.Info);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Log.Error("记录状态失败", ex);
                if (manual)
                {
                    ShowBalloon("记录失败", ex.Message, ToolTipIcon.Error);
                }
            }
            finally
            {
                Interlocked.Exchange(ref _busy, 0);
            }
        }

        private void OnRestoreClick(object sender, EventArgs e)
        {
            bool fromPreviousBoot;
            ExplorerSnapshot target;
            try
            {
                target = _store.GetRestoreTarget(_bootId, out fromPreviousBoot);
            }
            catch (Exception ex)
            {
                Log.Error("读取恢复目标失败", ex);
                ShowBalloon("恢复失败", ex.Message, ToolTipIcon.Error);
                return;
            }

            if (target == null || target.Windows.Count == 0)
            {
                ShowBalloon("没有可恢复的记录",
                    "请先让程序记录一次资源管理器状态。", ToolTipIcon.Info);
                return;
            }

            if (Interlocked.CompareExchange(ref _busy, 1, 0) != 0)
            {
                ShowBalloon("请稍候", "正在记录或恢复，请稍后再试。", ToolTipIcon.Info);
                return;
            }

            Interlocked.Exchange(ref _restoring, 1);
            _timer.Stop();
            RefreshMenu();
            ShowBalloon("正在恢复",
                "正在打开并排列 " + target.WindowCount + " 个资源管理器窗口…",
                ToolTipIcon.Info);

            Thread restoreThread = new Thread(delegate()
            {
                RestoreResult result = null;
                Exception fatal = null;
                try
                {
                    result = _service.Restore(target);
                }
                catch (Exception ex)
                {
                    fatal = ex;
                    Log.Error("恢复过程中发生未处理异常", ex);
                }

                try
                {
                    _dispatcher.BeginInvoke((MethodInvoker)delegate
                    {
                        OnRestoreFinished(result, fatal);
                    });
                }
                catch
                {
                    // The application may be shutting down.
                }
            });
            restoreThread.IsBackground = true;
            restoreThread.Name = "ExplorerStateRestore";
            try
            {
                restoreThread.SetApartmentState(ApartmentState.STA);
            }
            catch
            {
                // Some runtimes do not allow changing apartment state.
            }

            try
            {
                restoreThread.Start();
            }
            catch (Exception ex)
            {
                Interlocked.Exchange(ref _restoring, 0);
                Interlocked.Exchange(ref _busy, 0);
                _timer.Start();
                Log.Error("无法启动恢复线程", ex);
                ShowBalloon("恢复失败", ex.Message, ToolTipIcon.Error);
            }
        }

        private void OnRestoreFinished(RestoreResult result, Exception fatal)
        {
            Interlocked.Exchange(ref _restoring, 0);
            Interlocked.Exchange(ref _busy, 0);

            if (_disposed)
            {
                return;
            }

            _timer.Start();
            UpdateTrayText();

            if (fatal != null)
            {
                ShowBalloon("恢复失败", fatal.Message, ToolTipIcon.Error);
                return;
            }

            if (result == null)
            {
                ShowBalloon("恢复失败", "未知错误。", ToolTipIcon.Error);
                return;
            }

            if (!string.IsNullOrEmpty(result.FatalError))
            {
                ShowBalloon("恢复失败", result.FatalError, ToolTipIcon.Error);
                return;
            }

            if (result.Restored > 0 && result.Failed == 0)
            {
                ShowBalloon("恢复完成",
                    "已恢复 " + result.Restored + " 个资源管理器窗口。",
                    ToolTipIcon.Info);
            }
            else if (result.Restored > 0)
            {
                string detail = result.Errors.Count > 0 ? result.Errors[0] : "部分窗口未能恢复。";
                ShowBalloon("部分恢复完成",
                    "成功 " + result.Restored + "，失败 " + result.Failed +
                    "。\n" + detail,
                    ToolTipIcon.Warning);
            }
            else
            {
                string detail = result.Errors.Count > 0 ? result.Errors[0] : "没有窗口被恢复。";
                ShowBalloon("恢复失败", detail, ToolTipIcon.Error);
            }
        }

        private void OnIntervalClick(object sender, EventArgs e)
        {
            ToolStripMenuItem item = sender as ToolStripMenuItem;
            if (item == null || item.Tag == null)
            {
                return;
            }

            int minutes = Convert.ToInt32(item.Tag);
            _settings.IntervalMinutes = minutes;
            try
            {
                _store.SaveSettings(_settings);
            }
            catch (Exception ex)
            {
                Log.Error("保存记录间隔失败", ex);
            }

            _timer.Stop();
            _timer.Interval = GetIntervalMilliseconds();
            _timer.Start();
            ShowBalloon("自动记录已更新",
                "之后每 " + minutes + " 分钟检查并记录一次资源管理器状态。",
                ToolTipIcon.Info);
            Log.Info("记录间隔改为 " + minutes + " 分钟。");
        }

        private void OnAutoStartClick(object sender, EventArgs e)
        {
            bool enabled = !StartupManager.IsEnabled();
            if (!StartupManager.Apply(enabled))
            {
                ShowBalloon("设置失败", "无法写入当前用户的开机启动项。", ToolTipIcon.Error);
                return;
            }

            _settings.AutoStart = enabled;
            try
            {
                _store.SaveSettings(_settings);
            }
            catch (Exception ex)
            {
                Log.Error("保存开机启动设置失败", ex);
            }

            ShowBalloon(enabled ? "已启用开机启动" : "已关闭开机启动",
                enabled
                    ? "下次登录 Windows 时程序会自动在通知区域运行。"
                    : "下次登录 Windows 时程序不会自动运行。",
                ToolTipIcon.Info);
        }

        private void OnOpenDataDirectory(object sender, EventArgs e)
        {
            try
            {
                ProcessStartInfo info = new ProcessStartInfo();
                info.FileName = "explorer.exe";
                info.Arguments = "\"" + _store.DataDirectory + "\"";
                info.UseShellExecute = true;
                System.Diagnostics.Process.Start(info);
            }
            catch (Exception ex)
            {
                ShowBalloon("无法打开目录", ex.Message, ToolTipIcon.Error);
            }
        }

        private void OnAboutClick(object sender, EventArgs e)
        {
            MessageBox.Show(
                "资源管理器状态守护  " + Application.ProductVersion + "\n\n" +
                "定时记录已打开的资源管理器文件夹窗口，重启电脑后可一键恢复。\n\n" +
                "数据目录：\n" + _store.DataDirectory,
                "关于",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }

        private void OnExitClick(object sender, EventArgs e)
        {
            ExitApplication();
        }

        private void ExitApplication()
        {
            if (_exiting || _disposed)
            {
                return;
            }

            if (Interlocked.CompareExchange(ref _restoring, 0, 0) != 0)
            {
                ShowBalloon("正在恢复", "请等待恢复完成后再关闭程序。", ToolTipIcon.Info);
                return;
            }

            _exiting = true;
            _timer.Stop();
            _startupTipTimer.Stop();

            // Capture the final state while Explorer is still available.
            if (Interlocked.CompareExchange(ref _busy, 0, 0) == 0)
            {
                Record(false, false);
            }

            // Do not dispose the context menu from inside its own Click
            // handler.  Exit the message loop and let Program.Dispose perform
            // cleanup after the menu event has unwound.
            try
            {
                _notifyIcon.Visible = false;
            }
            catch
            {
            }

            Log.Info("程序退出。");
            ExitThread();
        }

        private void OnSessionEnding(object sender, SessionEndingEventArgs e)
        {
            try
            {
                if (Interlocked.CompareExchange(ref _busy, 0, 0) == 0)
                {
                    Record(false, false);
                }
            }
            catch (Exception ex)
            {
                Log.Error("关机前记录失败", ex);
            }
        }

        private void OnStartupTipTick(object sender, EventArgs e)
        {
            _startupTipTimer.Stop();
            if (_disposed)
            {
                return;
            }

            bool fromPreviousBoot = false;
            ExplorerSnapshot target = null;
            try
            {
                target = _store.GetRestoreTarget(_bootId, out fromPreviousBoot);
            }
            catch (Exception ex)
            {
                Log.Error("读取启动恢复目标失败", ex);
            }

            if (target != null && target.Windows.Count > 0 && fromPreviousBoot)
            {
                _startupTipForRestore = true;
                ShowBalloonCore("可以恢复上次状态",
                    "检测到关机前有 " + target.WindowCount +
                    " 个资源管理器窗口。\n右键通知区域图标，选择「恢复上次状态」。",
                    ToolTipIcon.Info, true);
                return;
            }

            if (_firstRun)
            {
                bool autoStartReady = _manageAutoStart
                    ? StartupManager.IsEnabled()
                    : _settings.AutoStart;
                ShowBalloon("资源管理器状态守护已运行",
                    "右键通知区域图标，可以记录或恢复资源管理器状态。" +
                    (autoStartReady ? "程序已设置为开机自动启动。" : ""),
                    ToolTipIcon.Info);
            }
        }

        private void OnBalloonTipClicked(object sender, EventArgs e)
        {
            if (_startupTipForRestore && !_disposed)
            {
                _startupTipForRestore = false;
                OnRestoreClick(sender, EventArgs.Empty);
            }
        }

        private void OnBalloonTipClosed(object sender, EventArgs e)
        {
            _startupTipForRestore = false;
        }

        private void UpdateTrayText()
        {
            if (_disposed)
            {
                return;
            }

            string text = "资源管理器状态守护";
            ExplorerSnapshot target = null;
            bool fromPreviousBoot = false;
            try
            {
                target = _store.GetRestoreTarget(_bootId, out fromPreviousBoot);
            }
            catch
            {
                target = null;
            }
            if (target == null)
            {
                target = _lastSnapshot;
            }

            if (target != null && target.Windows.Count > 0)
            {
                text = "资源管理器状态守护 · " +
                       (fromPreviousBoot ? "关机前 " : "") + target.Describe();
            }

            if (text.Length > 63)
            {
                text = text.Substring(0, 63);
            }

            try
            {
                _notifyIcon.Text = text;
            }
            catch
            {
                _notifyIcon.Text = "资源管理器状态守护";
            }
        }

        private void ShowBalloon(string title, string text, ToolTipIcon icon)
        {
            ShowBalloonCore(title, text, icon, false);
        }

        private void ShowBalloonCore(string title, string text, ToolTipIcon icon,
            bool clickRestores)
        {
            if (!clickRestores)
            {
                _startupTipForRestore = false;
            }

            if (_disposed || _notifyIcon == null)
            {
                return;
            }

            if (title != null && title.Length > 63)
            {
                title = title.Substring(0, 60) + "...";
            }
            if (text != null && text.Length > 250)
            {
                text = text.Substring(0, 247) + "...";
            }

            try
            {
                _notifyIcon.ShowBalloonTip(6000, title, text, icon);
            }
            catch (Exception ex)
            {
                Log.Warn("显示通知失败：" + ex.Message);
            }
        }

        private Icon LoadAppIcon()
        {
            try
            {
                _iconStream = Assembly.GetExecutingAssembly()
                    .GetManifestResourceStream("app.ico");
                if (_iconStream != null)
                {
                    return new Icon(_iconStream);
                }
            }
            catch (Exception ex)
            {
                Log.Warn("加载内置图标失败：" + ex.Message);
            }

            try
            {
                Icon extracted = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (extracted != null)
                {
                    return extracted;
                }
            }
            catch
            {
                // Use the system fallback below.
            }

            return (Icon)SystemIcons.Application.Clone();
        }

        private void Cleanup()
        {
            if (_disposed)
            {
                return;
            }
            _disposed = true;

            try
            {
                SystemEvents.SessionEnding -= OnSessionEnding;
            }
            catch
            {
            }

            try
            {
                _timer.Stop();
                _timer.Dispose();
                _startupTipTimer.Stop();
                _startupTipTimer.Dispose();
            }
            catch
            {
            }

            try
            {
                _notifyIcon.Visible = false;
                _notifyIcon.Dispose();
            }
            catch
            {
            }

            try
            {
                _menu.Dispose();
            }
            catch
            {
            }

            try
            {
                _dispatcher.Dispose();
            }
            catch
            {
            }

            try
            {
                if (_icon != null)
                {
                    _icon.Dispose();
                }
                if (_iconStream != null)
                {
                    _iconStream.Dispose();
                }
            }
            catch
            {
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                Cleanup();
            }
            base.Dispose(disposing);
        }
    }
}
