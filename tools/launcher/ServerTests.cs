using System;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;

namespace BeyondTheScroll
{
    internal static class ServerTests
    {
        private sealed class Response
        {
            public string Headers;
            public string Body;
        }

        private static void Check(bool condition, string message)
        {
            if (!condition) throw new Exception(message);
        }

        private static Response Request(Uri address, string path, string method = "GET", string headers = "", string host = null)
        {
            using (var client = new TcpClient())
            {
                client.ReceiveTimeout = 5000;
                client.SendTimeout = 5000;
                client.Connect(address.Host, address.Port);
                using (var stream = client.GetStream())
                using (var result = new MemoryStream())
                {
                    byte[] request = Encoding.ASCII.GetBytes(method + " " + path + " HTTP/1.1\r\nHost: " + (host ?? address.Authority) + "\r\n" + headers + "\r\n");
                    stream.Write(request, 0, request.Length);
                    stream.CopyTo(result);
                    string text = Encoding.UTF8.GetString(result.ToArray());
                    int split = text.IndexOf("\r\n\r\n");
                    Check(split > 0, "Missing response headers: " + path);
                    return new Response { Headers = text.Substring(0, split), Body = text.Substring(split + 4) };
                }
            }
        }

        private static void Status(Response response, int code)
        {
            Check(response.Headers.StartsWith("HTTP/1.1 " + code + " "), response.Headers);
        }

        private static int Main(string[] args)
        {
            try
            {
                string root = Path.Combine(args[0], "app with spaces 画卷");
                Directory.CreateDirectory(root);
                File.WriteAllText(Path.Combine(root, "index.html"), "<h1>画中奇谭</h1>", new UTF8Encoding(false));
                File.WriteAllText(Path.Combine(root, "曲.mp3"), "0123456789", Encoding.ASCII);
                File.WriteAllText(Path.Combine(root, "entry.js"), "export default 1", Encoding.ASCII);
                File.WriteAllText(Path.Combine(root, "empty.txt"), "", Encoding.ASCII);
                File.WriteAllText(Path.Combine(args[0], "secret.txt"), "outside-root");
                bool missing = false;
                try { using (new LocalServer(Path.Combine(args[0], "absent"))) { } }
                catch (IOException) { missing = true; }
                Check(missing, "Missing content must fail clearly.");

                Uri address;
                using (var server = new LocalServer(root))
                {
                    address = new Uri(server.Url);
                    Check(address.Host == "127.0.0.1", "Only loopback may be used.");
                    var home = Request(address, "/?review=1");
                    Status(home, 200);
                    Check(home.Body == "<h1>画中奇谭</h1>", "UTF-8 document mismatch.");
                    var script = Request(address, "/entry.js");
                    Status(script, 200);
                    Check(script.Headers.Contains("text/javascript"), "ES module MIME type.");
                    var head = Request(address, "/%E6%9B%B2.mp3", "HEAD");
                    Status(head, 200);
                    Check(head.Body == "" && head.Headers.Contains("Content-Length: 10") && head.Headers.Contains("audio/mpeg"), "HEAD metadata.");
                    var range = Request(address, "/%E6%9B%B2.mp3", "GET", "Range: bytes=2-5\r\n");
                    Status(range, 206);
                    Check(range.Body == "2345" && range.Headers.Contains("Content-Range: bytes 2-5/10"), "Audio byte range.");
                    Check(Request(address, "/%E6%9B%B2.mp3", "GET", "Range: bytes=-3\r\n").Body == "789", "Suffix range.");
                    Check(Request(address, "/%E6%9B%B2.mp3", "GET", "Range: bytes=8-99\r\n").Body == "89", "Clamped range.");
                    Check(Request(address, "/%E6%9B%B2.mp3", "GET", "Range: bytes=5-\r\n").Body == "56789", "Open range.");
                    Status(Request(address, "/%E6%9B%B2.mp3", "GET", "Range: bytes=10-\r\n"), 416);
                    Status(Request(address, "/%E6%9B%B2.mp3", "GET", "Range: bytes=0-1,4-5\r\n"), 416);
                    Status(Request(address, "/empty.txt"), 200);
                    Status(Request(address, "/missing.png"), 404);
                    Status(Request(address, "/", "POST"), 405);
                    Status(Request(address, "/", "GET", "", "external.example"), 403);
                    Status(Request(address, "/", "GET", "Host: duplicate\r\n"), 400);
                    foreach (string path in new[] { "/../secret.txt", "/%2e%2e/secret.txt", "/..%20/secret.txt", "//secret.txt", "/%5csecret.txt", "/index.html:secret", "/%00" })
                        Status(Request(address, path), 403);
                    Parallel.For(0, 24, delegate(int i) { Status(Request(address, "/entry.js?request=" + i), 200); });
                    using (var second = new LocalServer(root))
                        Check(second.Url != server.Url, "Two bundles must coexist without port collisions.");
                }
                bool closed = false;
                try { using (var client = new TcpClient()) client.Connect(address.Host, address.Port); }
                catch (SocketException) { closed = true; }
                Check(closed, "Closing the launcher must release the port.");
                Console.WriteLine("PASS: startup, UTF-8 paths, GET/HEAD, MIME, audio ranges, invalid requests, path boundaries, concurrent resources, port allocation and shutdown.");
                return 0;
            }
            catch (Exception error) { Console.Error.WriteLine(error); return 1; }
        }
    }
}
