using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace PersonalRelay {
    public sealed class ClientConfig {
        public string ServerUrl = "http://127.0.0.1:18473";
        public string ShowHotkey = "Ctrl+Alt+Space";
        public string PasteHotkey = "Ctrl+Alt+Enter";
        public string UploadHotkey = "Ctrl+Alt+U";
        public static readonly string DirectoryPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PersonalFileRelay", "Client");
        public static readonly string FilePath = Path.Combine(DirectoryPath, "settings.json");
        public static ClientConfig Load() {
            try { var c = new JavaScriptSerializer().Deserialize<ClientConfig>(File.ReadAllText(FilePath)); Validate(c); return c; } catch { return new ClientConfig(); }
        }
        public static void Validate(ClientConfig c) {
            Uri address;
            if (c == null || !Uri.TryCreate(c.ServerUrl, UriKind.Absolute, out address) || !String.IsNullOrEmpty(address.UserInfo) || !String.IsNullOrEmpty(address.Query) || !String.IsNullOrEmpty(address.Fragment) ||
                !(address.Scheme == "https" || (address.Scheme == "http" && address.IsLoopback)) || address.AbsolutePath != "/")
                throw new ArgumentException("服务地址必须是 HTTPS 根网址，或本机回环 HTTP 地址；不能包含账号、路径或参数。");
            var keys = new[] { c.ShowHotkey, c.PasteHotkey, c.UploadHotkey };
            foreach (var key in keys) Hotkey.Parse(key);
            if (keys.Select(Hotkey.Canonical).Distinct(StringComparer.OrdinalIgnoreCase).Count() != 3) throw new ArgumentException("三个热键不能重复。");
        }
        public void Save() {
            Validate(this); Directory.CreateDirectory(DirectoryPath);
            var temporary = FilePath + ".new";
            File.WriteAllText(temporary, new JavaScriptSerializer().Serialize(this));
            if (File.Exists(FilePath)) File.Replace(temporary, FilePath, null); else File.Move(temporary, FilePath);
        }
    }
    public sealed class Hotkey {
        public uint Modifiers;
        public Keys Key;
        public static Hotkey Parse(string value) {
            uint mods = 0; Keys key = Keys.None;
            foreach (var item in (value ?? "").Split('+')) {
                var part = item.Trim();
                if (part.Equals("Ctrl", StringComparison.OrdinalIgnoreCase)) mods |= 2;
                else if (part.Equals("Alt", StringComparison.OrdinalIgnoreCase)) mods |= 1;
                else if (part.Equals("Shift", StringComparison.OrdinalIgnoreCase)) mods |= 4;
                else {
                    Keys parsed;
                    if (key != Keys.None || !Enum.TryParse<Keys>(part, true, out parsed) ||
                        !((parsed >= Keys.A && parsed <= Keys.Z) || (parsed >= Keys.D0 && parsed <= Keys.D9) || (parsed >= Keys.F1 && parsed <= Keys.F24) || parsed == Keys.Space || parsed == Keys.Enter))
                        throw new ArgumentException("热键使用 Ctrl / Alt / Shift，加字母、数字、F1–F24、Space 或 Enter。");
                    key = parsed;
                }
            }
            if ((mods & 3) == 0 || key == Keys.None) throw new ArgumentException("热键至少包含 Ctrl 或 Alt，以及一个主键。");
            if ((mods & 1) != 0 && key == Keys.F4) throw new ArgumentException("Alt+F4 为关闭窗口保留，请选择其他热键。");
            return new Hotkey { Modifiers = mods | 0x4000, Key = key };
        }
        public static string Canonical(string value) {
            var key = Parse(value);
            return ((key.Modifiers & 2) != 0 ? "Ctrl+" : "") + ((key.Modifiers & 1) != 0 ? "Alt+" : "") + ((key.Modifiers & 4) != 0 ? "Shift+" : "") + key.Key;
        }
    }
    public sealed class RelayWindow : Form {
        [DllImport("user32.dll", SetLastError = true)] static extern bool RegisterHotKey(IntPtr hwnd, int id, uint modifiers, uint key);
        [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr hwnd, int id);
        [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
        [DllImport("dwmapi.dll")] static extern int DwmExtendFrameIntoClientArea(IntPtr hwnd, ref Margins margins);
        [DllImport("user32.dll")] static extern bool ReleaseCapture();
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hwnd, int message, IntPtr wparam, IntPtr lparam);
        [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hwnd);
        [StructLayout(LayoutKind.Sequential)] struct Margins { public int Left, Right, Top, Bottom; }
        readonly WebView2 web = new WebView2();
        readonly NotifyIcon tray = new NotifyIcon();
        readonly Label status = new Label();
        Panel caption;
        double dpiFactor = 1;
        ClientConfig config;
        bool exiting, initialized, settingsOpen, hotkeysRegistered, webHeaderActive;
        readonly bool testMode;
        readonly string profileDirectory;
        readonly bool darkTheme;
        public RelayWindow(ClientConfig initial, bool testing, string testProfile) {
            config = initial; testMode = testing;
            AutoScaleMode = AutoScaleMode.None;
            using (var personal = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"))
                darkTheme = personal != null && Convert.ToInt32(personal.GetValue("AppsUseLightTheme", 1)) == 0;
            profileDirectory = testProfile ?? Path.Combine(ClientConfig.DirectoryPath, "WebView2");
            Text = "中转站"; ClientSize = new Size(340, 440); MinimumSize = new Size(320, 440);
            StartPosition = FormStartPosition.CenterScreen; Font = new Font("Microsoft YaHei UI", 9);
            FormBorderStyle = FormBorderStyle.Sizable; BackColor = Color.FromArgb(244, 248, 253);
            // Keep the DWM frame for the backdrop, but draw caption actions only in our header.
            ControlBox = false; MinimizeBox = false; MaximizeBox = false;
            ShowInTaskbar = true;
            var iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "relay.ico");
            if (File.Exists(iconPath)) Icon = new Icon(iconPath);
            var title = new Panel { Dock = DockStyle.Top, Height = 32, BackColor = darkTheme ? Color.FromArgb(32, 43, 59) : Color.FromArgb(242, 247, 254) };
            caption = title;
            var label = new Label { Text = "⇄  中转站", Dock = DockStyle.Left, Width = 126, TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(12, 0, 0, 0), ForeColor = Color.FromArgb(36, 52, 74), UseCompatibleTextRendering = true };
            title.Controls.Add(label);
            if (darkTheme) { label.ForeColor = Color.FromArgb(237, 242, 250); title.ForeColor = label.ForeColor; BackColor = Color.FromArgb(32, 43, 59); }
            label.MouseDown += delegate(object sender, MouseEventArgs e) { if (e.Button == MouseButtons.Left) { ReleaseCapture(); SendMessage(Handle, 0xA1, (IntPtr)2, IntPtr.Zero); } };
            AddTitleButton(title, "×", "关闭到托盘", delegate { Hide(); });
            AddTitleButton(title, "−", "最小化", delegate { WindowState = FormWindowState.Minimized; });
            AddTitleButton(title, "⚙", "热键与连接设置", delegate { ShowSettings(); });
            status.Dock = DockStyle.Bottom; status.Height = 0; status.TextAlign = ContentAlignment.MiddleLeft; status.Padding = new Padding(10, 0, 4, 0); status.ForeColor = Color.FromArgb(116, 63, 39);
            web.Dock = DockStyle.Fill; web.DefaultBackgroundColor = Color.Transparent; web.AllowExternalDrop = true;
            Controls.Add(web); Controls.Add(status); Controls.Add(title);
            tray.Icon = Icon; tray.Text = "中转站"; tray.Visible = !testMode;
            var menu = new ContextMenuStrip();
            menu.Items.Add("打开中转站", null, delegate { ShowWindow(); });
            menu.Items.Add("热键设置", null, delegate { ShowSettings(); });
            menu.Items.Add("文件管理", null, delegate { OpenBrowser("/files/Personal/"); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("退出客户端（文件服务继续运行）", null, delegate { exiting = true; Close(); });
            tray.ContextMenuStrip = menu;
            tray.MouseClick += delegate(object sender, MouseEventArgs e) { if (e.Button == MouseButtons.Left) { if (Visible && WindowState != FormWindowState.Minimized && ContainsFocus) Hide(); else ShowWindow(); } };
            FormClosing += delegate(object sender, FormClosingEventArgs e) {
                if (!exiting && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); return; }
                ReleaseHotkeys(); tray.Visible = false; tray.Dispose(); web.Dispose();
            };
            Shown += async delegate { if (!initialized) await InitializeBrowser(); };
            Load += delegate { ScaleGeometry(); };
            DpiChanged += delegate { BeginInvoke(new Action(ScaleGeometry)); };
            SourceInitialized();
        }
        void ScaleGeometry() {
            dpiFactor = Math.Max(1, GetDpiForWindow(Handle) / 96.0);
            Size = new Size((int)Math.Round(340*dpiFactor), (int)Math.Round(440*dpiFactor));
            MinimumSize = new Size((int)Math.Round(320*dpiFactor), (int)Math.Round(440*dpiFactor));
            caption.Height = webHeaderActive ? 0 : (int)Math.Round(32*dpiFactor);
            foreach(Control child in caption.Controls) {
                child.Width = (int)Math.Round((child is Label ? 126 : 34)*dpiFactor);
                if(child is Label) child.Padding = new Padding((int)Math.Round(12*dpiFactor),0,0,0);
            }
            if(status.Height > 0) status.Height = (int)Math.Round(34*dpiFactor);
        }
        void AddTitleButton(Panel parent, string text, string hint, EventHandler click) {
            var button = new Button { Text = text, Dock = DockStyle.Right, Width = 34, FlatStyle = FlatStyle.Flat, TabStop = false, AccessibleName = hint, UseCompatibleTextRendering = true };
            button.FlatAppearance.BorderSize = 0; button.Click += click;
            var tooltip = new ToolTip(); tooltip.SetToolTip(button, hint); parent.Controls.Add(button);
        }
        void SourceInitialized() {
            HandleCreated += delegate {
                try {
                    var margins = new Margins { Left = -1, Right = -1, Top = -1, Bottom = -1 };
                    var extended = DwmExtendFrameIntoClientArea(Handle, ref margins);
                    int backdrop = 3, corners = 2;
                    int hostBackdrop = 1;
                    var hostResult = DwmSetWindowAttribute(Handle, 17, ref hostBackdrop, 4);
                    int dark = darkTheme ? 1 : 0;
                    DwmSetWindowAttribute(Handle, 20, ref dark, 4);
                    var result = DwmSetWindowAttribute(Handle, 38, ref backdrop, 4);
                    if (result == 0) BackColor = Color.Black;
                    DwmSetWindowAttribute(Handle, 33, ref corners, 4);
                    // Use the backdrop and shadow to define the edge, without a bright system outline.
                    int borderColor = unchecked((int)0xFFFFFFFE);
                    var borderResult = DwmSetWindowAttribute(Handle, 34, ref borderColor, 4);
                    if (testMode) {
                        Directory.CreateDirectory(profileDirectory);
                        File.WriteAllText(Path.Combine(profileDirectory, "backdrop-diagnostics.json"), new JavaScriptSerializer().Serialize(new { frame = extended, backdrop = result, host = hostResult, border = borderResult }));
                    }
                } catch { }
                if (!testMode || Environment.GetEnvironmentVariable("PERSONAL_RELAY_TEST_HOTKEYS") == "1") {
                    try { ApplyHotkeys(config); }
                    catch (Exception e) { SetStatus(e.Message + "，请在热键设置中修改。"); }
                }
            };
        }
        protected override void OnHandleCreated(EventArgs e) {
            base.OnHandleCreated(e);
            // HandleCreated is wired before the first window handle is created.
        }
        public static bool SameOrigin(string candidate, string server) {
            Uri uri, expected;
            return Uri.TryCreate(candidate, UriKind.Absolute, out uri) && Uri.TryCreate(server, UriKind.Absolute, out expected) &&
                uri.Scheme == expected.Scheme && uri.Host.Equals(expected.Host, StringComparison.OrdinalIgnoreCase) && uri.Port == expected.Port && String.IsNullOrEmpty(uri.UserInfo);
        }
        async Task InitializeBrowser() {
            initialized = true;
            try {
                Environment.SetEnvironmentVariable("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "00000000", EnvironmentVariableTarget.Process);
                var options = new CoreWebView2EnvironmentOptions();
                int debugPort;
                if (testMode && int.TryParse(Environment.GetEnvironmentVariable("PERSONAL_RELAY_TEST_DEBUG_PORT"), out debugPort) && debugPort >= 1024 && debugPort <= 65535)
                    options.AdditionalBrowserArguments = "--remote-debugging-port=" + debugPort;
                var environment = await CoreWebView2Environment.CreateAsync(null, profileDirectory, options);
                await web.EnsureCoreWebView2Async(environment);
                web.DefaultBackgroundColor = Color.Transparent;
                web.CoreWebView2.Settings.AreDevToolsEnabled = testMode;
                web.CoreWebView2.Settings.IsStatusBarEnabled = false;
                web.CoreWebView2.Settings.AreHostObjectsAllowed = false;
                web.CoreWebView2.Settings.IsNonClientRegionSupportEnabled = true;
                web.CoreWebView2.SourceChanged += delegate {
                    Uri current;
                    var relay = Uri.TryCreate(web.CoreWebView2.Source, UriKind.Absolute, out current) && SameOrigin(current.AbsoluteUri, config.ServerUrl) && current.AbsolutePath == "/chat";
                    SetWebHeader(relay);
                };
                web.CoreWebView2.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs e) {
                    if (!SameOrigin(e.Uri, config.ServerUrl)) { e.Cancel = true; SetStatus("已阻止跳转到其他网站，请在浏览器中打开。"); }
                };
                web.CoreWebView2.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs e) { e.Handled = true; if (e.IsUserInitiated && SameOrigin(e.Uri, config.ServerUrl)) OpenBrowser(new Uri(e.Uri).PathAndQuery); };
                web.CoreWebView2.WebMessageReceived += delegate(object sender, CoreWebView2WebMessageReceivedEventArgs e) {
                    if (!SameOrigin(e.Source, config.ServerUrl) || new Uri(e.Source).AbsolutePath != "/chat") return;
                    try {
                        var message = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(e.WebMessageAsJson);
                        object action;
                        if (!message.TryGetValue("action", out action)) return;
                        if ((string)action == "open-full") OpenBrowser("/chat");
                        if ((string)action == "settings") BeginInvoke(new Action(ShowSettings));
                        if ((string)action == "minimize") BeginInvoke(new Action(delegate { WindowState = FormWindowState.Minimized; }));
                        if ((string)action == "hide") BeginInvoke(new Action(Hide));
                    } catch { }
                };
                web.CoreWebView2.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs e) {
                    if (e.PermissionKind == CoreWebView2PermissionKind.ClipboardRead && e.IsUserInitiated && SameOrigin(e.Uri, config.ServerUrl) && web.Source != null && web.Source.AbsolutePath == "/chat")
                        e.State = CoreWebView2PermissionState.Allow;
                    else e.State = CoreWebView2PermissionState.Deny;
                };
                web.CoreWebView2.DownloadStarting += delegate(object sender, CoreWebView2DownloadStartingEventArgs e) {
                    if (!SameOrigin(e.DownloadOperation.Uri, config.ServerUrl)) { e.Cancel = true; return; }
                    using (var dialog = new SaveFileDialog { FileName = Path.GetFileName(e.ResultFilePath), Filter = "所有文件|*.*", OverwritePrompt = true }) {
                        if (dialog.ShowDialog(this) == DialogResult.OK) { e.ResultFilePath = dialog.FileName; e.Handled = true; }
                        else e.Cancel = true;
                    }
                };
                web.CoreWebView2.NavigationCompleted += delegate(object sender, CoreWebView2NavigationCompletedEventArgs e) { if (!e.IsSuccess) { SetWebHeader(false); SetStatus("连接失败。请确认主机在线，或在设置中检查服务地址。"); } };
                if (testMode && new Uri(config.ServerUrl).IsLoopback) {
                    var testPassword = Environment.GetEnvironmentVariable("PERSONAL_RELAY_TEST_PASSWORD");
                    if (!String.IsNullOrEmpty(testPassword)) {
                        var request = (HttpWebRequest)WebRequest.Create(config.ServerUrl + "/api/auth/login?username=admin");
                        request.Method = "POST"; request.ContentLength = 0; request.CookieContainer = new CookieContainer();
                        request.Headers["X-Password"] = Uri.EscapeDataString(testPassword);
                        using (var response = (HttpWebResponse)await request.GetResponseAsync()) {
                            foreach (Cookie cookie in request.CookieContainer.GetCookies(new Uri(config.ServerUrl))) {
                                var nativeCookie = web.CoreWebView2.CookieManager.CreateCookie(cookie.Name, cookie.Value, cookie.Domain, cookie.Path);
                                nativeCookie.IsHttpOnly = cookie.HttpOnly; nativeCookie.IsSecure = cookie.Secure;
                                web.CoreWebView2.CookieManager.AddOrUpdateCookie(nativeCookie);
                            }
                        }
                    }
                }
                web.Source = new Uri(config.ServerUrl.TrimEnd('/') + "/chat?compact=1");
            } catch { SetStatus("客户端初始化失败。请检查 Microsoft WebView2 运行时。"); }
        }
        void OpenBrowser(string relative) {
            if (!relative.StartsWith("/") || relative.StartsWith("//")) return;
            var address = config.ServerUrl.TrimEnd('/') + relative;
            if (SameOrigin(address, config.ServerUrl)) System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(address) { UseShellExecute = true });
        }
        void SetWebHeader(bool active) { webHeaderActive = active; caption.Visible = !active; caption.Height = active ? 0 : (int)Math.Round(32*dpiFactor); }
        void SetStatus(string text) { if (IsDisposed) return; status.Text = text; status.Height = (int)Math.Round(34*dpiFactor); }
        void ShowWindow() { Show(); WindowState = FormWindowState.Normal; Activate(); BringToFront(); }
        bool IsChatPage() { return web.CoreWebView2 != null && web.Source != null && SameOrigin(web.Source.AbsoluteUri, config.ServerUrl) && web.Source.AbsolutePath == "/chat"; }
        async void ChooseUploadFiles() {
            if (!IsChatPage()) { SetStatus("请先在客户端登录中转站。"); return; }
            using (var dialog = new OpenFileDialog { Multiselect = true, CheckFileExists = true, Filter = "所有文件|*.*", Title = "选择要上传的文件" }) {
                if (dialog.ShowDialog(this) != DialogResult.OK || !IsChatPage()) return;
                try {
                    var json = new JavaScriptSerializer();
                    var document = json.Deserialize<Dictionary<string, object>>(await web.CoreWebView2.CallDevToolsProtocolMethodAsync("DOM.getDocument", "{}"));
                    var root = (Dictionary<string, object>)document["root"];
                    var selection = json.Deserialize<Dictionary<string, object>>(await web.CoreWebView2.CallDevToolsProtocolMethodAsync("DOM.querySelector", json.Serialize(new { nodeId = Convert.ToInt32(root["nodeId"]), selector = ".relay-compact input[type=file]" })));
                    var inputId = Convert.ToInt32(selection["nodeId"]);
                    if (inputId == 0 || !IsChatPage()) { SetStatus("上传入口尚未就绪，请稍后重试。"); return; }
                    await web.CoreWebView2.CallDevToolsProtocolMethodAsync("DOM.setFileInputFiles", json.Serialize(new { nodeId = inputId, files = dialog.FileNames }));
                    status.Height = 0;
                } catch { SetStatus("无法交给上传队列，请点击窗口内的「上传文件」重试。"); }
            }
        }
        void ReleaseHotkeys() { if (!IsHandleCreated) return; for (int i = 1; i <= 3; i++) UnregisterHotKey(Handle, i); hotkeysRegistered = false; }
        void RegisterConfig(ClientConfig candidate) {
            var keys = new[] { candidate.ShowHotkey, candidate.PasteHotkey, candidate.UploadHotkey };
            for (int i = 0; i < keys.Length; i++) {
                var key = Hotkey.Parse(keys[i]);
                if (!RegisterHotKey(Handle, i + 1, key.Modifiers, (uint)key.Key)) {
                    for (int j = 1; j <= i; j++) UnregisterHotKey(Handle, j);
                    throw new ArgumentException("热键 " + keys[i] + " 已被占用或被系统保留");
                }
            }
            hotkeysRegistered = true;
        }
        void ApplyHotkeys(ClientConfig candidate) {
            ClientConfig.Validate(candidate);
            var old = config;
            bool restoreOld = hotkeysRegistered;
            ReleaseHotkeys();
            try { RegisterConfig(candidate); }
            catch { if (restoreOld) { try { RegisterConfig(old); } catch { } } throw; }
        }
        void ShowSettings() {
            if (settingsOpen) return;
            ShowWindow(); settingsOpen = true;
            try {
                using (var dialog = new SettingsDialog(config)) {
                    dialog.SaveRequested = delegate(ClientConfig candidate) {
                        ApplyHotkeys(candidate);
                        try { if (!testMode) candidate.Save(); } catch { ApplyHotkeys(config); throw; }
                        bool changed = candidate.ServerUrl != config.ServerUrl; config = candidate; status.Height = 0;
                        if (changed && web.CoreWebView2 != null) web.Source = new Uri(config.ServerUrl.TrimEnd('/') + "/chat?compact=1");
                    };
                    dialog.ShowDialog(this);
                }
            } finally { settingsOpen = false; }
        }
        protected override void WndProc(ref Message message) {
            if (message.Msg == 0x0083 && message.WParam != IntPtr.Zero) { message.Result = IntPtr.Zero; return; }
            if (message.Msg == 0x0312 && !settingsOpen) {
                var action = message.WParam.ToInt32();
                if (action == 1) { if (Visible && WindowState != FormWindowState.Minimized && ContainsFocus) Hide(); else ShowWindow(); }
                else if (action == 2 || action == 3) {
                    ShowWindow();
                    if (action == 3) { ChooseUploadFiles(); base.WndProc(ref message); return; }
                    if (!IsChatPage()) { SetStatus("请先在客户端登录中转站。"); }
                    else {
                        try {
                            var payload = new Dictionary<string, object> { { "type", "personal-relay-command" }, { "action", action == 2 ? "paste-send" : "upload" } };
                            if (action == 2) {
                                if (Clipboard.ContainsImage()) {
                                    using (var image = Clipboard.GetImage())
                                    using (var buffer = new MemoryStream()) {
                                        if (image == null) { SetStatus("剪贴板图片不可用。"); base.WndProc(ref message); return; }
                                        image.Save(buffer, System.Drawing.Imaging.ImageFormat.Png);
                                        if (buffer.Length > 32*1024*1024) { SetStatus("剪贴板图片超过 32MB，请用上传或拖入。"); base.WndProc(ref message); return; }
                                        payload["action"] = "paste-image"; payload["base64"] = Convert.ToBase64String(buffer.ToArray());
                                        web.CoreWebView2.PostWebMessageAsJson(new JavaScriptSerializer { MaxJsonLength = 64*1024*1024 }.Serialize(payload));
                                        status.Height = 0;
                                        base.WndProc(ref message); return;
                                    }
                                }
                                var text = Clipboard.ContainsText() ? Clipboard.GetText() : "";
                                if (String.IsNullOrWhiteSpace(text)) { SetStatus("剪贴板中没有文字。"); base.WndProc(ref message); return; }
                                if (text.Length > 32000) { SetStatus("剪贴板文字超过 32,000 字符，请缩短后再发送。"); base.WndProc(ref message); return; }
                                payload["text"] = text;
                            }
                            web.CoreWebView2.PostWebMessageAsJson(new JavaScriptSerializer().Serialize(payload));
                        } catch { SetStatus("暂时无法读取剪贴板，请稍后重试。"); }
                    }
                }
            }
            base.WndProc(ref message);
        }
        protected override void Dispose(bool disposing) { if (disposing) { ReleaseHotkeys(); tray.Dispose(); } base.Dispose(disposing); }
    }
    public sealed class SettingsDialog : Form {
        readonly TextBox server = new TextBox();
        readonly List<TextBox> fields = new List<TextBox>();
        public Action<ClientConfig> SaveRequested;
        public SettingsDialog(ClientConfig current) {
            AutoScaleMode = AutoScaleMode.None;
            Text = "中转站 · 热键设置"; ClientSize = new Size(460, 330); FormBorderStyle = FormBorderStyle.FixedDialog; StartPosition = FormStartPosition.CenterParent; MaximizeBox = false; MinimizeBox = false;
            Font = new Font("Microsoft YaHei UI", 9); BackColor = Color.FromArgb(247, 249, 253);
            AddLabel("服务地址", 20); server.SetBounds(20, 45, 420, 26); server.Text = current.ServerUrl; Controls.Add(server);
            var names = new[] { "显示 / 收起窗口", "粘贴并发送", "选择文件上传" };
            var values = new[] { current.ShowHotkey, current.PasteHotkey, current.UploadHotkey };
            for (int i = 0; i < names.Length; i++) {
                var label = new Label { Text = names[i], Left = 20, Top = 96 + i * 43, Width = 140, Height = 26, TextAlign = ContentAlignment.MiddleLeft };
                var field = new TextBox { Text = values[i], Left = 165, Top = 96 + i * 43, Width = 275, ReadOnly = false, AccessibleName = names[i] };
                field.KeyDown += CaptureHotkey; fields.Add(field); Controls.Add(label); Controls.Add(field);
            }
            var note = new Label { Text = "点击热键框后按组合键，或手动输入。仅客户端运行时生效。", Left = 20, Top = 230, Width = 420, Height = 34, ForeColor = Color.DimGray }; Controls.Add(note);
            var save = new Button { Text = "保存", Left = 335, Top = 280, Width = 105, Height = 32 }; save.Click += Save; Controls.Add(save);
            var cancel = new Button { Text = "取消", Left = 220, Top = 280, Width = 100, Height = 32, DialogResult = DialogResult.Cancel }; Controls.Add(cancel);
            CancelButton = cancel;
            Load += delegate {
                using(var graphics = CreateGraphics()) {
                    var factor = graphics.DpiX/96F;
                    foreach(Control child in Controls) child.SetBounds((int)(child.Left*factor),(int)(child.Top*factor),(int)(child.Width*factor),(int)(child.Height*factor));
                    ClientSize = new Size((int)(460*factor),(int)(330*factor));
                }
            };
        }
        void AddLabel(string text, int top) { Controls.Add(new Label { Text = text, Left = 20, Top = top, Width = 400, Height = 22 }); }
        void CaptureHotkey(object sender, KeyEventArgs e) {
            if ((e.Control || e.Alt) && e.KeyCode != Keys.ControlKey && e.KeyCode != Keys.Menu && e.KeyCode != Keys.ShiftKey) {
                e.SuppressKeyPress = true;
                ((TextBox)sender).Text = (e.Control ? "Ctrl+" : "") + (e.Alt ? "Alt+" : "") + (e.Shift ? "Shift+" : "") + e.KeyCode;
            }
        }
        void Save(object sender, EventArgs e) {
            try {
                var candidate = new ClientConfig { ServerUrl = server.Text.Trim().TrimEnd('/'), ShowHotkey = Hotkey.Canonical(fields[0].Text), PasteHotkey = Hotkey.Canonical(fields[1].Text), UploadHotkey = Hotkey.Canonical(fields[2].Text) };
                ClientConfig.Validate(candidate); SaveRequested(candidate); DialogResult = DialogResult.OK; Close();
            } catch (Exception error) { MessageBox.Show(this, error.Message, "无法保存", MessageBoxButtons.OK, MessageBoxIcon.Information); }
        }
    }
    public static class Program {
        [STAThread] public static void Main(string[] args) {
            if (args.Contains("--self-test")) { SelfTest(); return; }
            bool testMode = args.Contains("--test-mode");
            string testProfile = null;
            ClientConfig config = ClientConfig.Load();
            if (testMode) config = new ClientConfig { ShowHotkey = "Ctrl+Alt+Shift+F11", PasteHotkey = "Ctrl+Alt+Shift+F12", UploadHotkey = "Ctrl+Alt+Shift+F10" };
            for (int i = 0; i < args.Length - 1; i++) {
                if (args[i] == "--test-url" && testMode) config.ServerUrl = args[i + 1];
                if (args[i] == "--test-profile" && testMode) testProfile = Path.GetFullPath(args[i + 1]);
            }
            ClientConfig.Validate(config);
            if (testMode && (testProfile == null || !new Uri(config.ServerUrl).IsLoopback || new Uri(config.ServerUrl).Port != 18475 ||
                (testProfile + Path.DirectorySeparatorChar).StartsWith(ClientConfig.DirectoryPath + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)))
                throw new ArgumentException("Test mode requires an isolated profile and loopback test server on port 18475.");
            using (var mutex = new Mutex(false, testMode ? @"Local\PersonalRelayClient.Test." + System.Diagnostics.Process.GetCurrentProcess().Id : @"Local\PersonalRelayClient")) {
                if (!mutex.WaitOne(0, false)) return;
                try { Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); Application.Run(new RelayWindow(config, testMode, testProfile)); }
                finally { mutex.ReleaseMutex(); }
            }
        }
        static void SelfTest() {
            ClientConfig.Validate(new ClientConfig());
            if (!RelayWindow.SameOrigin("http://127.0.0.1:18473/chat?compact=1", "http://127.0.0.1:18473")) throw new Exception("origin allow");
            if (RelayWindow.SameOrigin("https://example.com/file", "http://127.0.0.1:18473")) throw new Exception("origin deny");
            if (Hotkey.Canonical("alt+ctrl+u") != "Ctrl+Alt+U") throw new Exception("hotkey normalization");
            var invalid = new[] { "A", "Shift+A", "Ctrl+Alt+Delete", "Ctrl+Alt+F4", "Ctrl+Alt+U+I" };
            foreach (var text in invalid) {
                bool rejected = false; try { Hotkey.Parse(text); } catch (ArgumentException) { rejected = true; }
                if (!rejected) throw new Exception("hotkey guard");
            }
            bool duplicateRejected = false; try { ClientConfig.Validate(new ClientConfig { PasteHotkey = "Alt+Ctrl+Space" }); } catch (ArgumentException) { duplicateRejected = true; }
            if (!duplicateRejected) throw new Exception("duplicate guard");
            File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "self-test-result.txt"), "PASS: origin guards, hotkey parsing, duplicate validation");
        }
    }
}
