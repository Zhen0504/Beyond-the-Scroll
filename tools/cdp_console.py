"""Drive headless Edge over the DevTools Protocol to capture console output.

The browser exposes a remote debugging port. JSON over HTTP discovers the page,
and a WebSocket connection receives its console events using Python's standard
library.
"""
import json
import os
import re
import socket
import ssl
import struct
import subprocess
import sys
import time
import base64
import urllib.request

EDGE = None
for cand in (
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
):
    if os.path.exists(cand):
        EDGE = cand
        break

PORT = 9333
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5199/#fuwang"
WAIT = float(sys.argv[2]) if len(sys.argv) > 2 else 12.0


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=10) as r:
        return json.loads(r.read().decode())


class WS:
    """Minimal WebSocket client (text frames only)."""

    def __init__(self, url):
        m = re.match(r"ws://([^:/]+):(\d+)(/.*)", url)
        host, port, path = m.group(1), int(m.group(2)), m.group(3)
        self.sock = socket.create_connection((host, port), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.sock.recv(4096)
        self.buf = buf.split(b"\r\n\r\n", 1)[1]
        self._id = 0

    def send(self, obj):
        data = json.dumps(obj).encode()
        header = bytearray([0x81])
        n = len(data)
        mask = os.urandom(4)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", n)
        header += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        self.sock.sendall(bytes(header) + masked)

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise EOFError
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv(self):
        b1, b2 = self._read(2)
        length = b2 & 0x7F
        if length == 126:
            length = struct.unpack(">H", self._read(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", self._read(8))[0]
        payload = self._read(length)
        return json.loads(payload.decode("utf-8", "replace"))


def main() -> int:
    if not EDGE:
        print("Edge not found")
        return 1
    profile = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cdp_profile")
    proc = subprocess.Popen(
        [
            EDGE, "--headless=new", "--no-sandbox", "--hide-scrollbars",
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            f"--remote-debugging-port={PORT}", f"--user-data-dir={profile}",
            "--window-size=1440,900", "about:blank",
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        target = None
        for _ in range(60):
            time.sleep(0.5)
            try:
                for t in http_json("/json/list"):
                    if t.get("type") == "page":
                        target = t
                        break
                if target:
                    break
            except Exception:
                continue
        if not target:
            print("no debug target")
            return 1

        ws = WS(target["webSocketDebuggerUrl"])
        ws.send({"id": 1, "method": "Runtime.enable"})
        ws.send({"id": 2, "method": "Log.enable"})
        ws.send({"id": 3, "method": "Page.enable"})
        ws.send({"id": 4, "method": "Page.navigate", "params": {"url": URL}})

        deadline = time.time() + WAIT
        seen = []
        while time.time() < deadline:
            try:
                msg = ws.recv()
            except Exception:
                break
            method = msg.get("method")
            if method == "Runtime.consoleAPICalled":
                kind = msg["params"].get("type")
                parts = []
                for a in msg["params"].get("args", []):
                    parts.append(
                        a.get("value")
                        if "value" in a
                        else a.get("description") or a.get("className") or a.get("type")
                    )
                seen.append(f"[console.{kind}] {' '.join(str(p) for p in parts)}")
            elif method == "Runtime.exceptionThrown":
                d = msg["params"]["exceptionDetails"]
                text = d.get("text", "")
                desc = (d.get("exception") or {}).get("description", "")
                seen.append(f"[exception] {text} {desc}")
            elif method == "Log.entryAdded":
                e = msg["params"]["entry"]
                if e.get("level") in ("error", "warning"):
                    seen.append(f"[log.{e['level']}] {e.get('text')}")

        print(f"captured {len(seen)} entries for {URL}")
        for s in seen:
            print("  " + s[:600])
        if not seen:
            print("  (nothing captured)")
        return 0
    finally:
        proc.terminate()
        time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
