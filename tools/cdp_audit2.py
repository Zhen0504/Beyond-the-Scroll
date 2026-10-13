"""Final functional audit of scroll three (corrected harness).

The previous harness produced false failures: it dispatched keyboard events with
quoted key names, did not re-enter the scene after pausing, and sampled the whole
viewport for a change that only affects the painted region.  This version fixes
all three and adds direct state probes.
"""
import base64
import io
import json
import os
import re
import socket
import struct
import subprocess
import sys
import time
import urllib.request

from PIL import Image

EDGE = None
for cand in (
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
):
    if os.path.exists(cand):
        EDGE = cand
        break
PORT = 9352
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "shots3")


def http_json(p):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{p}", timeout=10) as r:
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
        self.errors = []

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
            if m.get("method") == "Runtime.consoleAPICalled" and m["params"].get("type") == "error":
                self.errors.append(
                    " ".join(str(a.get("value", "")) for a in m["params"].get("args", []))[:200]
                )
        return {}

    def js(self, expr):
        r = self.call(
            "Runtime.evaluate",
            {"expression": expr, "awaitPromise": True, "returnByValue": True},
        )
        res = r.get("result", {})
        if "exceptionDetails" in res:
            return {"__exc": str(res["exceptionDetails"])[:200]}
        return (res.get("result") or {}).get("value")

    def grab(self):
        r = self.call("Page.captureScreenshot", {"format": "png"})
        d = (r.get("result") or {}).get("data")
        return Image.open(io.BytesIO(base64.b64decode(d))).convert("RGB") if d else None

    def save(self, img, name):
        if img:
            img.save(os.path.join(OUT, name + ".png"))

    def key(self, k):
        """在 canvas 与 window 上都派发，与真实键盘行为一致"""
        self.js(
            "(() => { const e = () => new KeyboardEvent('keydown', "
            f"{{key: {json.dumps(k)}, bubbles: true, cancelable: true}});"
            "document.dispatchEvent(e()); window.dispatchEvent(e()); return 'ok'; })()"
        )

    def enter(self):
        """确保处于敷彩状态"""
        if self.js("!!document.querySelector('.night-plate')"):
            self.js("document.querySelector('.night-primary')?.click()")
            time.sleep(5)
        if self.js("!!document.querySelector('.night-modal')"):
            self.js("document.querySelector('.night-modal .night-primary')?.click()")
            time.sleep(3)

    def drag(self, x0, x1, yfrac=0.5, steps=24):
        self.js(
            f"""(() => {{
              const c = document.querySelector('canvas');
              const r = c.getBoundingClientRect();
              const y = r.top + r.height * {yfrac};
              const mk = (t, x) => new PointerEvent(t, {{bubbles:true, cancelable:true,
                clientX:x, clientY:y, pointerId:1, pointerType:'mouse',
                buttons: t === 'pointerup' ? 0 : 1}});
              c.dispatchEvent(mk('pointerdown', r.left + r.width * {x0}));
              for (let i = 1; i <= {steps}; i++)
                window.dispatchEvent(mk('pointermove', r.left + r.width *
                  ({x0} + ({x1} - {x0}) * (i / {steps}))));
              window.dispatchEvent(mk('pointerup', r.left + r.width * {x1}));
              return 'ok';
            }})()"""
        )


def sat(img, box):
    crop = img.crop(box)
    px = list(crop.getdata())
    n = len(px)
    return round(sum(max(p) - min(p) for p in px) / n, 2)


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    proc = subprocess.Popen(
        [
            EDGE, "--headless=new", "--no-sandbox", "--hide-scrollbars",
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            f"--remote-debugging-port={PORT}",
            f"--user-data-dir={os.path.join(HERE, '_cdp_final')}",
            "--window-size=1440,900", "about:blank",
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    rows = []

    def check(name, ok, detail=""):
        rows.append((name, bool(ok), detail))
        print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail else ""))

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
        ws.call("Page.navigate", {"url": "http://127.0.0.1:5199/#fuwang"})
        time.sleep(16)

        print("\n=== A. 入口与门页 ===")
        check("门页为首折「救溺」",
              ws.js("document.querySelector('.night-plate__inner h1')?.textContent") == "救溺")
        check("五折导航齐备",
              ws.js("document.querySelectorAll('.night-tour__header nav button').length") == 5)
        check("门页展示原画与图注",
              ws.js("!!document.querySelector('.night-plate__painting img')"))

        print("\n=== B. 入画 ===")
        ws.js("document.querySelector('.night-primary')?.click()")
        time.sleep(6)
        check("入画后门页收起", ws.js("!document.querySelector('.night-plate')"))
        check("颜料盘出现（四色）",
              ws.js("document.querySelectorAll('.fuwang__swatch').length") == 4)
        check("速成档预铺 20%",
              "20%" in str(ws.js("document.querySelector('.fuwang__meter span')?.textContent")))

        print("\n=== C. 敷彩改变画面（限定取样区）===")
        before = ws.grab()
        ws.save(before, "80-final-before")
        box = (150, 150, 800, 640)          # 壁画左段所在区域
        s0 = sat(before, box)
        for y in (0.28, 0.42, 0.56, 0.70):
            ws.drag(0.04, 0.30, yfrac=y, steps=26)
        time.sleep(4)
        after = ws.grab()
        ws.save(after, "81-final-after")
        s1 = sat(after, box)
        check("敷彩后该区域饱和度上升", s1 > s0 + 1.0, f"{s0} -> {s1}")
        check("敷彩推进到完成",
              "100%" in str(ws.js("document.querySelector('.fuwang__meter span')?.textContent")),
              str(ws.js("document.querySelector('.fuwang__meter span')?.textContent")))

        print("\n=== D. 跨折持久化 ===")
        p_before = ws.js("JSON.stringify(window.__world.restorer.progress.map(p => +p.toFixed(2)))")
        ws.js("[...document.querySelectorAll('.night-tour__header nav button')][4].click()")
        time.sleep(5)
        ws.save(ws.grab(), "82-final-fold5")
        check("已切到第五折",
              ws.js("document.querySelector('.night-tour__header nav button[aria-current] i')?.textContent") == "伍")
        ws.js("[...document.querySelectorAll('.night-tour__header nav button')][0].click()")
        time.sleep(5)
        back = ws.grab()
        ws.save(back, "83-final-back")
        p_after = ws.js("JSON.stringify(window.__world.restorer.progress.map(p => +p.toFixed(2)))")
        s2 = sat(back, box)
        check("进度跨折保留", p_before == p_after, f"{p_before} / {p_after}")
        check("画面跨折保留敷彩", s2 > s0 + 1.0, f"初始 {s0} → 回来 {s2}")

        print("\n=== E. 键盘可完成 ===")
        ws.key("]")
        time.sleep(3)
        check("] 前进一折",
              ws.js("document.querySelector('.night-tour__header nav button[aria-current] i')?.textContent") == "贰")
        ws.key("[")
        time.sleep(3)
        check("[ 后退一折",
              ws.js("document.querySelector('.night-tour__header nav button[aria-current] i')?.textContent") == "壹")
        ws.key("4")
        time.sleep(2)
        check("数字键择色",
              ws.js("window.__world.restorer.pigment") == "tuhong",
              str(ws.js("window.__world.restorer.pigment")))
        ws.key("f")
        time.sleep(2)
        check("F 切换档位",
              ws.js("window.__world.restorer.speed") == "full",
              str(ws.js("window.__world.restorer.speed")))

        print("\n=== F. 暂停 / 原壁 / 释文 ===")
        ws.key("Escape")
        time.sleep(3)
        check("Esc 弹出暂停层",
              ws.js("document.querySelector('.night-modal')?.getAttribute('aria-label')") == "暂停")
        ws.enter()
        check("可继续敷彩", ws.js("!document.querySelector('.night-modal')"))
        ws.js("document.querySelector('.night-tour__original')?.click()")
        time.sleep(4)
        check("原壁可回看",
              ws.js("document.querySelector('.night-plate__inner h1')?.textContent") == "救溺")
        ws.js("document.querySelector('.night-primary')?.click()")
        time.sleep(5)
        ws.key("l")
        time.sleep(3)
        bq = ws.js("document.querySelector('.fuwang__quotes blockquote')?.textContent?.slice(0,20)")
        check("L 打开释文且引文非空", isinstance(bq, str) and len(bq) > 10, str(bq))
        check("引文标注敦煌研究院网站",
              "敦煌研究院网站" in str(ws.js("document.querySelector('.fuwang__quotes cite')?.textContent")))
        ws.save(ws.grab(), "84-final-lecture")
        ws.js("document.querySelector('.night-modal .night-primary')?.click()")
        time.sleep(3)

        print("\n=== G. 无障碍 ===")
        check("颜料盘 role=toolbar",
              ws.js("document.querySelector('.fuwang__palette')?.getAttribute('role')") == "toolbar")
        check("四色带 aria-pressed",
              ws.js("document.querySelectorAll('.fuwang__swatch[aria-pressed]').length") == 4)
        check("进度条带 aria-label",
              bool(ws.js("document.querySelector('.fuwang__meter')?.getAttribute('aria-label')")))
        check("折导航带 aria-current（内层 i）",
              bool(ws.js("document.querySelector('.night-tour__header nav button[aria-current] i')")))
        check("门页折题带 aria-label",
              bool(ws.js("document.querySelector('.night-tour__header nav button')?.getAttribute('aria-label')")))

        print("\n=== H. 控制台 ===")
        check("无控制台报错", len(ws.errors) == 0, f"{len(ws.errors)} 条")
        for e in ws.errors[:4]:
            print("     ", e)

        ok = sum(1 for _, v, _ in rows if v)
        print(f"\n===== {ok}/{len(rows)} 通过 =====")
        for n, v, d in rows:
            if not v:
                print(f"  未通过：{n}  {d}")
        return 0
    finally:
        proc.terminate()
        time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
