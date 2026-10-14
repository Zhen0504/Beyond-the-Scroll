"""Reproduce the three reported problems with pixel evidence.

For each claim we take a screenshot and measure a fixed region, so the verdict
does not depend on reading the shader by eye.
"""
import base64
import io
import json
import os
import subprocess
import sys
import time

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib.util

spec = importlib.util.spec_from_file_location("cdpf", os.path.join(HERE, "cdp_folds.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

PORT = 9360
URL = "http://127.0.0.1:5173/#fuwang"

# 壁画在屏幕上的大致范围（用于测量）
MURAL_BOX = (200, 120, 1280, 620)
# 画面左段（第一折）与右段（第五折）的取样窗口
LEFT_BOX = (220, 160, 620, 580)
RIGHT_BOX = (900, 160, 1270, 580)


def stats(img, box):
    crop = img.crop(box)
    px = list(crop.getdata())
    n = len(px)
    r = sum(p[0] for p in px) / n
    g = sum(p[1] for p in px) / n
    b = sum(p[2] for p in px) / n
    sat = sum(max(p) - min(p) for p in px) / n
    lum = sum(0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2] for p in px) / n
    return {
        "rgb": (round(r, 1), round(g, 1), round(b, 1)),
        "sat": round(sat, 2),
        "lum": round(lum, 1),
    }


def diff(a, b):
    return tuple(round(x - y, 1) for x, y in zip(a["rgb"], b["rgb"]))


class App:
    def __init__(self, ws):
        self.ws = ws

    def grab(self):
        r = self.ws.call("Page.captureScreenshot", {"format": "png"})
        d = (r.get("result") or {}).get("data")
        return Image.open(io.BytesIO(base64.b64decode(d))).convert("RGB")

    def save(self, img, name):
        out = os.path.join(HERE, "..", "shots3")
        os.makedirs(out, exist_ok=True)
        img.save(os.path.join(out, name + ".png"))

    def js(self, expr):
        return self.ws.js(expr)

    def select_pigment(self, index):
        """通过真实点击选色"""
        self.js(
            f"document.querySelectorAll('.fuwang__swatch')[{index}]?.click()"
        )
        time.sleep(1.2)

    def hint_text(self):
        return self.js(
            "document.querySelector('.fuwang__hint')?.textContent ?? null"
        )

    def meter(self):
        return self.js(
            "document.querySelector('.fuwang__meter span')?.textContent ?? null"
        )

    def paint_band(self, x0, x1, yfracs=(0.35, 0.5, 0.65), steps=22):
        for y in yfracs:
            self.js(
                f"""(() => {{
                  const c = document.querySelector('canvas');
                  const r = c.getBoundingClientRect();
                  const yy = r.top + r.height * {y};
                  const mk = (t, x) => new PointerEvent(t, {{bubbles:true, cancelable:true,
                    clientX:x, clientY:yy, pointerId:1, pointerType:'mouse',
                    buttons: t === 'pointerup' ? 0 : 1}});
                  c.dispatchEvent(mk('pointerdown', r.left + r.width * {x0}));
                  for (let i = 1; i <= {steps}; i++)
                    window.dispatchEvent(mk('pointermove', r.left + r.width *
                      ({x0} + ({x1} - {x0}) * (i / {steps}))));
                  window.dispatchEvent(mk('pointerup', r.left + r.width * {x1}));
                  return 'ok';
                }})()"""
            )
            time.sleep(0.35)


def main() -> int:
    proc = subprocess.Popen(
        [
            mod.EDGE, "--headless=new", "--no-sandbox", "--hide-scrollbars",
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            "--remote-debugging-port=" + str(PORT),
            "--user-data-dir=" + os.path.join(HERE, "_cdp_repro"),
            "--window-size=1440,900", "about:blank",
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        t = None
        for _ in range(60):
            time.sleep(0.5)
            try:
                for x in mod.http_json("/json/list", PORT):
                    if x.get("type") == "page":
                        t = x
                        break
                if t:
                    break
            except Exception:
                pass
        ws = mod.WS(t["webSocketDebuggerUrl"])
        ws.call("Page.enable")
        ws.call("Runtime.enable")
        ws.call("Page.navigate", {"url": URL})
        time.sleep(16)
        app = App(ws)

        # 进入敷彩
        ws.js("document.querySelector('.night-primary')?.click()")
        time.sleep(6)
        print("phase:", ws.js("window.__world.controller.state.phase"))

        print("\n########## 问题 1：选色是否造成全屏颜色暗示 ##########")
        base = app.grab()
        app.save(base, "90-repro-base")
        b_all = stats(base, MURAL_BOX)
        b_left = stats(base, LEFT_BOX)
        b_right = stats(base, RIGHT_BOX)
        print(f"  基准    全屏 {b_all['rgb']}  左 {b_left['rgb']}  右 {b_right['rgb']}")

        for idx, name in [(0, "石青"), (1, "石绿"), (2, "朱砂"), (3, "土红")]:
            app.select_pigment(idx)
            img = app.grab()
            app.save(img, f"91-repro-pigment{idx}")
            a_all = stats(img, MURAL_BOX)
            a_left = stats(img, LEFT_BOX)
            a_right = stats(img, RIGHT_BOX)
            print(
                f"  选{name}  全屏Δ{diff(a_all, b_all)}  左Δ{diff(a_left, b_left)}"
                f"  右Δ{diff(a_right, b_right)}"
            )

        print("\n########## 问题 2：涂完后提示是否残留 ##########")
        # 选一个明显不同的颜色，然后在本折区间内涂满
        app.select_pigment(0)
        app.paint_band(0.03, 0.34, yfracs=(0.30, 0.44, 0.58, 0.72), steps=26)
        time.sleep(1)
        print(f"  刚涂完: 进度={app.meter()}  提示={app.hint_text()!r}")
        time.sleep(4)
        print(f"  4 秒后: 进度={app.meter()}  提示={app.hint_text()!r}")
        time.sleep(4)
        print(f"  8 秒后: 进度={app.meter()}  提示={app.hint_text()!r}")
        app.save(app.grab(), "92-repro-after-paint")

        print("\n########## 问题 3：完成状态是否可辨识 ##########")
        print("  restorer 内部状态:")
        print("   ", ws.js(
            "JSON.stringify({progress: window.__world.restorer.progress.map(p=>+p.toFixed(2)),"
            " index: window.__world.restorer.index})"
        ))
        print("  DOM 上的完成标记:")
        print("    进度条文本:", app.meter())
        print("    导航是否标完成:", ws.js(
            "document.querySelectorAll('.night-tour__header nav button[data-done]').length"
        ), "个")
        print("    是否有完成盖层/勾选:", ws.js(
            "!!document.querySelector('.fuwang__done, [data-fold-done], .fuwang__complete')"
        ))
        # 继续在已完成区段上涂，看有无反馈
        print("\n  在已完成区段继续涂 3 笔:")
        for i in range(3):
            app.paint_band(0.05, 0.30, yfracs=(0.5,), steps=14)
            time.sleep(0.6)
            print(f"    第{i+1}笔后: 提示={app.hint_text()!r}")

        print("\n########## 附：提示文本出现时机 ##########")
        # 涂到非本折区段（切到第一折，去涂右侧）
        ws.js("[...document.querySelectorAll('.night-tour__header nav button')][0].click()")
        time.sleep(4)
        app.paint_band(0.85, 0.97, yfracs=(0.5,), steps=12)
        time.sleep(1)
        print(f"  涂到别折后: 提示={app.hint_text()!r}")
        time.sleep(7)
        print(f"  7 秒后:     提示={app.hint_text()!r}")
        return 0
    finally:
        proc.terminate()
        time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
