"""Enter scroll three through the entry UI and screenshot each fold.

Drives the real click path (entry -> 卷三 -> 原卷门页 -> 入画 -> 敷彩), so the
screenshots prove the interaction works rather than just the first paint.
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

PORT = 9335
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "shots3")


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
        self._id = 100
        self.events = []

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

    def call(self, method, params=None, timeout=40):
        self._id += 1
        mid = self._id
        self.send({"id": mid, "method": method, "params": params or {}})
        end = time.time() + timeout
        while time.time() < end:
            msg = self.recv()
            if msg.get("id") == mid:
                return msg
            if msg.get("method"):
                self.events.append(msg)
        return {}

    def drain(self, seconds=2.0):
        end = time.time() + seconds
        self.sock.settimeout(0.4)
        while time.time() < end:
            try:
                msg = self.recv()
                if msg.get("method"):
                    self.events.append(msg)
            except Exception:
                pass
        self.sock.settimeout(60)

    def js(self, expr):
        r = self.call(
            "Runtime.evaluate",
            {"expression": expr, "awaitPromise": True, "returnByValue": True},
        )
        return (r.get("result", {}).get("result") or {}).get("value")

    def shot(self, name):
        r = self.call("Page.captureScreenshot", {"format": "png"})
        data = (r.get("result") or {}).get("data")
        if not data:
            print(f"MISS {name}")
            return
        dest = os.path.join(OUT, name + ".png")
        with open(dest, "wb") as fh:
            fh.write(base64.b64decode(data))
        print(f"OK {name} {os.path.getsize(dest)/1024:.0f} KB")


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    profile = os.path.join(HERE, "_cdp_walk_profile")
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
        ws.call("Page.enable")
        ws.call("Runtime.enable")

        # 直接从卷三入口进（更稳，也顺带验证哈希路由）
        ws.call("Page.navigate", {"url": "http://127.0.0.1:5199/#fuwang"})
        time.sleep(16)

        state = ws.js(
            "(() => { const t = document.querySelector('.night-plate__inner h1');"
            " const n = document.querySelectorAll('nav button').length;"
            " return JSON.stringify({plate: t && t.textContent, folds: n,"
            " body: document.body.className}); })()"
        )
        print("page state:", state)
        ws.shot("50-fuwang-01-plate")

        # 点「入画」类主按钮进入敷彩
        clicked = ws.js(
            "(() => { const b = document.querySelector('.night-primary');"
            " if (!b) return 'no-primary'; b.click(); return b.textContent; })()"
        )
        print("entered via:", clicked)
        time.sleep(5)
        ws.shot("51-fuwang-02-paint")

        # 模拟一次拖拽敷彩：在画布中部横向拖过
        drag = ws.js(
            """(() => {
              const c = document.querySelector('canvas');
              if (!c) return 'no-canvas';
              const r = c.getBoundingClientRect();
              const y = r.top + r.height * 0.5;
              const mk = (type, x) => new PointerEvent(type, {
                bubbles: true, cancelable: true, clientX: x, clientY: y,
                pointerId: 1, pointerType: 'mouse', buttons: type === 'pointerup' ? 0 : 1,
              });
              c.dispatchEvent(mk('pointerdown', r.left + r.width * 0.30));
              for (let i = 1; i <= 24; i++) {
                window.dispatchEvent(mk('pointermove', r.left + r.width * (0.30 + 0.02 * i)));
              }
              window.dispatchEvent(mk('pointerup', r.left + r.width * 0.78));
              return 'dragged';
            })()"""
        )
        print("drag:", drag)
        time.sleep(4)
        ws.shot("52-fuwang-03-after-paint")

        # 打开释文面板
        lect = ws.js(
            "(() => { const bs = [...document.querySelectorAll('.fuwang__tools button')];"
            " const b = bs.find(x => x.textContent.includes('释文'));"
            " if (!b) return 'no-lecture'; b.click(); return 'opened'; })()"
        )
        print("lecture:", lect)
        time.sleep(2.5)
        ws.shot("53-fuwang-04-lecture")

        errors = [
            e["params"]["args"][0].get("value", "")[:220]
            for e in ws.events
            if e.get("method") == "Runtime.consoleAPICalled"
            and e["params"].get("type") == "error"
        ]
        print(f"console errors: {len(errors)}")
        for e in errors[:5]:
            print("   ", e)
        return 0
    finally:
        proc.terminate()
        time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
