"""Map screen x to mural u for every fold camera, and report the mismatch."""
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
PORT = 9344
HERE = os.path.dirname(os.path.abspath(__file__))
URL = "http://127.0.0.1:5173/#fuwang"


def http_json(p, port=None):
    with urllib.request.urlopen(f"http://127.0.0.1:{port or PORT}{p}", timeout=10) as r:
        return json.loads(r.read().decode())


class WS:
    def __init__(self, url):
        m = re.match(r"ws://([^:/]+):(\d+)(/.*)", url)
        host, port, path = m.group(1), int(m.group(2)), m.group(3)
        self.s = socket.create_connection((host, port), timeout=60)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(
            (
                f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n"
                f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
                "Sec-WebSocket-Version: 13\r\n\r\n"
            ).encode()
        )
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.s.recv(4096)
        self.buf = buf.split(b"\r\n\r\n", 1)[1]
        self.i = 0

    def send(self, o):
        d = json.dumps(o).encode()
        h = bytearray([0x81])
        n = len(d)
        mk = os.urandom(4)
        if n < 126:
            h.append(0x80 | n)
        elif n < 65536:
            h.append(0x80 | 126)
            h += struct.pack(">H", n)
        else:
            h.append(0x80 | 127)
            h += struct.pack(">Q", n)
        h += mk
        self.s.sendall(bytes(h) + bytes(b ^ mk[i % 4] for i, b in enumerate(d)))

    def _r(self, n):
        while len(self.buf) < n:
            self.buf += self.s.recv(65536)
        o, self.buf = self.buf[:n], self.buf[n:]
        return o

    def recv(self):
        _, b2 = self._r(2)
        L = b2 & 0x7F
        if L == 126:
            L = struct.unpack(">H", self._r(2))[0]
        elif L == 127:
            L = struct.unpack(">Q", self._r(8))[0]
        return json.loads(self._r(L).decode("utf-8", "replace"))

    def call(self, method, params=None, timeout=40):
        self.i += 1
        self.send({"id": self.i, "method": method, "params": params or {}})
        end = time.time() + timeout
        while time.time() < end:
            m = self.recv()
            if m.get("id") == self.i:
                return m
        return {}

    def js(self, expr):
        r = self.call(
            "Runtime.evaluate",
            {"expression": expr, "awaitPromise": True, "returnByValue": True},
        )
        res = r.get("result", {})
        if "exceptionDetails" in res:
            return "EXC: " + str(res["exceptionDetails"])[:400]
        return (res.get("result") or {}).get("value")


PER_FOLD = """
(() => {
  const w = window.__world;
  const r = w.restorer;
  const c = document.querySelector('canvas');
  const rect = c.getBoundingClientRect();
  const out = [];
  for (let f = 0; f < 5; f++) {
    r.setFold(f);
    w.controller.openChapter(['jiuni','beishi','xuangshang','weilie','chenqing'][f]);
    const cam = w.camera;
    const row = {fold: f, cam: [+cam.position.x.toFixed(2), +cam.position.z.toFixed(2)]};
    const sample = (frac) => {
      const hit = r.pickFrom({clientX: rect.left + rect.width * frac,
                              clientY: rect.top + rect.height * 0.5});
      return hit ? +hit.uv.x.toFixed(3) : null;
    };
    row.uLeft = sample(0.02);
    row.uMid = sample(0.5);
    row.uRight = sample(0.98);
    const range = w.restorer.folds[f];
    row.foldU = [range.u0, range.u1];
    row.coversFold =
      row.uLeft !== null && row.uRight !== null &&
      row.uLeft <= range.u0 + 0.02 && row.uRight >= Math.min(range.u1, range.maxU) - 0.02;
    out.push(row);
  }
  return JSON.stringify(out, null, 1);
})()
"""


def main() -> int:
    proc = subprocess.Popen(
        [
            EDGE, "--headless=new", "--no-sandbox", "--hide-scrollbars",
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            f"--remote-debugging-port={PORT}",
            f"--user-data-dir={os.path.join(HERE, '_cdp_folds')}",
            "--window-size=1440,900", "about:blank",
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        t = None
        for _ in range(60):
            time.sleep(0.5)
            try:
                for x in http_json("/json/list"):
                    if x.get("type") == "page":
                        t = x
                        break
                if t:
                    break
            except Exception:
                pass
        ws = WS(t["webSocketDebuggerUrl"])
        ws.call("Page.enable")
        ws.call("Runtime.enable")
        ws.call("Page.navigate", {"url": URL})
        time.sleep(14)
        ws.js("document.querySelector('.night-primary')?.click()")
        time.sleep(4)
        print(ws.js(PER_FOLD))
        return 0
    finally:
        proc.terminate()
        time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
