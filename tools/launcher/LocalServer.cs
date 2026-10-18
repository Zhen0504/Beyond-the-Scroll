using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace BeyondTheScroll
{
    // A static-file server bound exclusively to this computer. No shell commands,
    // uploads or filesystem writes are exposed through HTTP.
    internal sealed class LocalServer : IDisposable
    {
        private readonly string root;
        private readonly TcpListener listener;
        private readonly HashSet<TcpClient> clients = new HashSet<TcpClient>();
        private volatile bool stopped;
        public string Url { get; private set; }

        public LocalServer(string directory)
        {
            root = Path.GetFullPath(directory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (!File.Exists(Path.Combine(root, "index.html")))
                throw new IOException("未找到作品文件。请先完整解压评审包，并将启动器和 app 文件夹放在一起。");
            listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start(64);
            Url = "http://127.0.0.1:" + ((IPEndPoint)listener.LocalEndpoint).Port + "/";
            var thread = new Thread(Accept) { IsBackground = true, Name = "Local artwork server" };
            thread.Start();
        }

        private void Accept()
        {
            while (!stopped)
            {
                TcpClient client;
                try { client = listener.AcceptTcpClient(); }
                catch (SocketException) { if (stopped) return; continue; }
                catch (ObjectDisposedException) { return; }
                lock (clients)
                {
                    if (stopped) { client.Close(); return; }
                    if (clients.Count >= 64) { client.Close(); continue; }
                    clients.Add(client);
                }
                ThreadPool.QueueUserWorkItem(delegate { Serve(client); });
            }
        }

        private void Serve(TcpClient client)
        {
            try
            {
                client.ReceiveTimeout = 10000;
                client.SendTimeout = 10000;
                using (NetworkStream stream = client.GetStream())
                {
                    var bytes = new List<byte>();
                    while (bytes.Count < 16384)
                    {
                        int value = stream.ReadByte();
                        if (value < 0) return;
                        bytes.Add((byte)value);
                        int n = bytes.Count;
                        if (n >= 4 && bytes[n - 4] == 13 && bytes[n - 3] == 10 && bytes[n - 2] == 13 && bytes[n - 1] == 10) break;
                    }
                    if (bytes.Count >= 16384) { Reply(stream, 431, "Request Header Fields Too Large", 0, null); return; }
                    string[] lines = Encoding.ASCII.GetString(bytes.ToArray()).Split(new[] { "\r\n" }, StringSplitOptions.None);
                    string[] request = lines[0].Split(' ');
                    if (request.Length != 3 || (request[2] != "HTTP/1.0" && request[2] != "HTTP/1.1"))
                    { Reply(stream, 400, "Bad Request", 0, null); return; }
                    var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    for (int i = 1; i < lines.Length && lines[i].Length > 0; i++)
                    {
                        int colon = lines[i].IndexOf(':');
                        if (colon <= 0) { Reply(stream, 400, "Bad Request", 0, null); return; }
                        string key = lines[i].Substring(0, colon).Trim();
                        if (headers.ContainsKey(key)) { Reply(stream, 400, "Bad Request", 0, null); return; }
                        headers.Add(key, lines[i].Substring(colon + 1).Trim());
                    }
                    string host;
                    if (!headers.TryGetValue("Host", out host) || !string.Equals(host, new Uri(Url).Authority, StringComparison.OrdinalIgnoreCase))
                    { Reply(stream, 403, "Forbidden", 0, null); return; }
                    bool head = request[0] == "HEAD";
                    if (request[0] != "GET" && !head)
                    { Reply(stream, 405, "Method Not Allowed", 0, null, "Allow: GET, HEAD\r\n"); return; }
                    string path;
                    try { path = ResolvePath(request[1]); }
                    catch (ArgumentException) { Reply(stream, 403, "Forbidden", 0, null); return; }
                    catch (UriFormatException) { Reply(stream, 400, "Bad Request", 0, null); return; }
                    catch (NotSupportedException) { Reply(stream, 400, "Bad Request", 0, null); return; }
                    if (path == null || !File.Exists(path)) { Reply(stream, 404, "Not Found", 0, null); return; }
                    using (var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
                    {
                        long start = 0, end = file.Length - 1;
                        string range;
                        bool partial = headers.TryGetValue("Range", out range);
                        if (partial && !TryRange(range, file.Length, out start, out end))
                        { Reply(stream, 416, "Range Not Satisfiable", 0, null, "Content-Range: bytes */" + file.Length + "\r\n"); return; }
                        long length = end - start + 1;
                        string extra = "Accept-Ranges: bytes\r\n";
                        if (partial) extra += "Content-Range: bytes " + start + "-" + end + "/" + file.Length + "\r\n";
                        Reply(stream, partial ? 206 : 200, partial ? "Partial Content" : "OK", length, ContentType(path), extra);
                        if (head) return;
                        file.Position = start;
                        var buffer = new byte[65536];
                        while (length > 0 && !stopped)
                        {
                            int count = file.Read(buffer, 0, (int)Math.Min(length, buffer.Length));
                            if (count == 0) break;
                            stream.Write(buffer, 0, count);
                            length -= count;
                        }
                    }
                }
            }
            catch (IOException) { /* A browser can cancel a texture or audio request. */ }
            catch (SocketException) { }
            catch (ObjectDisposedException) { }
            catch (UnauthorizedAccessException) { }
            finally
            {
                client.Close();
                lock (clients) clients.Remove(client);
            }
        }

        private string ResolvePath(string target)
        {
            if (!target.StartsWith("/") || target.StartsWith("//")) throw new ArgumentException();
            string decoded = Uri.UnescapeDataString(target.Split('?')[0]);
            if (decoded.IndexOfAny(new[] { '\\', ':', '\0' }) >= 0) throw new ArgumentException();
            foreach (string segment in decoded.Split('/'))
                if (segment.EndsWith(".") || segment.EndsWith(" ") || segment.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
                    throw new ArgumentException();
            if (decoded == "/") decoded = "/index.html";
            string full = Path.GetFullPath(Path.Combine(root, decoded.TrimStart('/')));
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new ArgumentException();
            // Do not follow links placed inside an extracted bundle.
            for (string p = full; p.Length >= root.Length; p = Path.GetDirectoryName(p))
                if ((File.Exists(p) || Directory.Exists(p)) && (File.GetAttributes(p) & FileAttributes.ReparsePoint) != 0)
                    throw new ArgumentException();
            return full;
        }

        internal static bool TryRange(string range, long size, out long start, out long end)
        {
            start = 0; end = size - 1;
            if (size <= 0 || !range.StartsWith("bytes=", StringComparison.OrdinalIgnoreCase)) return false;
            string[] parts = range.Substring(6).Split('-');
            if (parts.Length != 2) return false;
            long value;
            if (parts[0].Length == 0)
            {
                if (!long.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out value) || value <= 0) return false;
                start = Math.Max(0, size - value);
            }
            else
            {
                if (!long.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out start) || start >= size) return false;
                if (parts[1].Length > 0)
                {
                    if (!long.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out value)) return false;
                    end = Math.Min(end, value);
                }
            }
            return end >= start;
        }

        private static void Reply(Stream stream, int code, string reason, long length, string type, string extra = "")
        {
            string headers = "HTTP/1.1 " + code + " " + reason + "\r\nContent-Length: " + length +
                "\r\nConnection: close\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\n" + extra;
            if (type != null) headers += "Content-Type: " + type + "\r\n";
            byte[] data = Encoding.ASCII.GetBytes(headers + "\r\n");
            stream.Write(data, 0, data.Length);
        }

        private static string ContentType(string path)
        {
            switch (Path.GetExtension(path).ToLowerInvariant())
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js": case ".mjs": return "text/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".svg": return "image/svg+xml";
                case ".png": return "image/png";
                case ".jpg": case ".jpeg": return "image/jpeg";
                case ".webp": return "image/webp";
                case ".ico": return "image/x-icon";
                case ".woff": return "font/woff";
                case ".woff2": return "font/woff2";
                case ".mp3": return "audio/mpeg";
                case ".wav": return "audio/wav";
                default: return "application/octet-stream";
            }
        }

        public void Dispose()
        {
            stopped = true;
            listener.Stop();
            lock (clients)
            {
                foreach (TcpClient client in clients) client.Close();
                clients.Clear();
            }
        }
    }
}
