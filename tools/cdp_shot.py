"""Screenshot headless Edge with a reliable wait for WebGL scenes.

--virtual-time-budget can cut a rAF-driven scene off too early, so we navigate,
wait real time, then capture via the DevTools Protocol.
"""
import base64
import json
import os
import re
import socket
import struct
import subprocess
import sys
import time
import urllib.request

EDGE = None
for cand in (
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
):
    if os.path.exists(cand):
        EDGE = cand
        break

PORT = 9334
HERE = os.path.dirname(os.path.abspath(__file__))


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=10) as r:
        return json.loads(r.read().decode())


class WS:
    def __init__(self, url):
        m = re.match(r"ws://([^:/]+):(\d+)(/.*)", url)
        host, port, path = m.group(1), int(m.group(2)), m.group(3)
        self.sock = socket.create_connection((host, port), timeout=60)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall(
            (
                f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\n"
                "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
            ).encode()
        )
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
        self.sock.sendall(bytes(header) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _read(self, n):
        while len(self.buf) < n:
            self.buf += self.sock.recv(65536)
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv(self):
        _, b2 = self._read(2)
        length = b2 & 0x7F
        if length == 126:
            length = struct.unpack(">H", self._read(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", self._read(8))[0]
        return json.loads(self._read(length).decode("utf-8", "replace"))

    def call(self, mid, method, params=None):
        self.send({"id": mid, "method": method, "params": params or {}})
        while True:
            msg = self.recv()
            if msg.get("id") == mid:
                return msg


SHOTS = [
    ("40-entry", "http://127.0.0.1:5199/", 20.0),
    ("41-fuwang-plate", "http://127.0.0.1:5199/#fuwang", 22.0),
]


def main() -> int:
    if not EDGE:
        print("Edge not found")
        return 1
    outdir = os.path.join(HERE, "shots3")
    os.makedirs(outdir, exist_ok=True)
    profile = os.path.join(HERE, "_cdp_shot_profile")
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
            print("no target")
            return 1
        ws = WS(target["webSocketDebuggerUrl"])
        ws.call(1, "Page.enable")
        ws.call(2, "Runtime.enable")

        mid = 10
        for name, url, wait in SHOTS:
            mid += 1
            ws.call(mid, "Page.navigate", {"url": url})
            # 轮询等待页面稳定
            time.sleep(wait)
            mid += 1
            res = ws.call(mid, "Page.captureScreenshot", {"format": "png"})
            data = res.get("result", {}).get("data")
            if not data:
                print(f"MISS {name}: {res}")
                continue
            dest = os.path.join(outdir, name + ".png")
            with open(dest, "wb") as fh:
                fh.write(base64.b64decode(data))
            print(f"OK {name} {os.path.getsize(dest)/1024:.0f} KB")
        return 0
    finally:
        proc.terminate()
        time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
