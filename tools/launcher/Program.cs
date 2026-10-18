using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace BeyondTheScroll
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            // Packaging checks use the same window and server, without opening a browser.
            string verificationFile = args.Length == 2 && args[0] == "--verify" ? Path.GetFullPath(args[1]) : null;
            try
            {
                string directory = AppDomain.CurrentDomain.BaseDirectory;
                string instance;
                using (var hash = SHA256.Create())
                    instance = "Local\\BeyondTheScroll-" + BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(directory.ToUpperInvariant()))).Replace("-", "");
                bool created;
                using (var mutex = new Mutex(false, instance, out created))
                using (var activation = new EventWaitHandle(false, EventResetMode.AutoReset, instance + "-open"))
                {
                    if (!created) { activation.Set(); return 0; }
                    using (var server = new LocalServer(Path.Combine(directory, "app")))
                    using (var window = new LauncherWindow(server.Url, verificationFile != null))
                    {
                        bool finished = false;
                        var wake = new Thread(delegate()
                        {
                            while (activation.WaitOne())
                            {
                                if (Volatile.Read(ref finished)) return;
                                try { window.BeginInvoke(new Action(window.OpenArtwork)); }
                                catch (InvalidOperationException) { return; }
                            }
                        }) { IsBackground = true };
                        window.Shown += delegate
                        {
                            wake.Start();
                            if (verificationFile != null) File.WriteAllText(verificationFile, server.Url, Encoding.UTF8);
                            else window.OpenArtwork();
                        };
                        try { Application.Run(window); }
                        finally
                        {
                            Volatile.Write(ref finished, true);
                            activation.Set();
                            if (wake.IsAlive) wake.Join(1000);
                        }
                    }
                }
                return 0;
            }
            catch (Exception error)
            {
                string message = "作品暂时未能启动。\n\n" + error.Message;
                if (verificationFile != null) File.WriteAllText(verificationFile, "ERROR: " + message, Encoding.UTF8);
                else MessageBox.Show(message, "画中奇谭", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return 1;
            }
        }
    }

    internal sealed class LauncherWindow : Form
    {
        private readonly string url;
        private readonly bool verification;
        private readonly Label status;

        public LauncherWindow(string address, bool verify)
        {
            url = address;
            verification = verify;
            Text = "画中奇谭 · 作品启动器";
            ClientSize = new Size(520, 310);
            AutoScaleDimensions = new SizeF(96, 96);
            AutoScaleMode = AutoScaleMode.Dpi;
            Font = new Font("Microsoft YaHei UI", 10F);
            BackColor = Color.FromArgb(246, 240, 227);
            ForeColor = Color.FromArgb(77, 59, 43);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            Controls.Add(new Label { Text = "画中奇谭", Location = new Point(30, 24), Size = new Size(450, 44), Font = new Font("Microsoft YaHei UI", 25F) });
            Controls.Add(new Label { Text = "穿越画卷，遇见中华文脉", Location = new Point(32, 82), Size = new Size(450, 25) });
            status = new Label { Text = "作品已就绪，正在为您打开浏览器。", Location = new Point(32, 126), Size = new Size(452, 46) };
            Controls.Add(status);
            var open = new Button { Text = "打开作品", Location = new Point(32, 183), Size = new Size(215, 43), BackColor = Color.FromArgb(109, 59, 45), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
            open.FlatAppearance.BorderSize = 0;
            open.Click += delegate { OpenArtwork(); };
            Controls.Add(open);
            var close = new Button { Text = "结束体验", Location = new Point(268, 183), Size = new Size(215, 43), FlatStyle = FlatStyle.Flat };
            close.Click += delegate { Close(); };
            Controls.Add(close);
            Controls.Add(new Label { Text = "体验期间请保留此窗口；结束后关闭窗口即可。", Location = new Point(32, 243), Size = new Size(455, 24), Font = new Font("Microsoft YaHei UI", 9F) });
            var link = new LinkLabel { Text = url, Location = new Point(32, 272), Size = new Size(450, 22), LinkColor = ForeColor, Font = new Font("Microsoft YaHei UI", 9F) };
            link.LinkClicked += delegate { OpenArtwork(); };
            Controls.Add(link);
        }

        public void OpenArtwork()
        {
            if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
            Activate();
            if (verification) { status.Text = "作品已就绪。"; return; }
            // Prefer WebGL-capable browsers already installed on the computer.
            string[] roots = { Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) };
            string[] browsers = { @"Microsoft\Edge\Application\msedge.exe", @"Google\Chrome\Application\chrome.exe" };
            foreach (string browser in browsers)
                foreach (string root in roots)
                {
                    if (string.IsNullOrEmpty(root)) continue;
                    string path = Path.Combine(root, browser);
                    if (!File.Exists(path)) continue;
                    try
                    {
                        Process.Start(new ProcessStartInfo(path, url) { UseShellExecute = true });
                        status.Text = "作品已在浏览器打开，祝您游赏愉快。";
                        return;
                    }
                    catch (System.ComponentModel.Win32Exception) { }
                }
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                status.Text = "作品已在浏览器打开，祝您游赏愉快。";
            }
            catch (System.ComponentModel.Win32Exception)
            {
                status.Text = "请打开 Edge 或 Chrome，将下方地址输入地址栏。";
            }
        }
    }
}
