"""Verify the new painting model on screen.

Checks the four things the user asked for:
  1. selecting a colour visibly highlights where to paint
  2. clicking once does NOT fill the fold
  3. undo works from the UI
  4. progress only rises by actually dragging over the highlighted area
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

PORT = 9370
URL = "http://127.0.0.1:5173/#fuwang"
OUT = os.path.join(HERE, "..", "shots3")


def region_stats(img, box):
    crop = img.crop(box)
    px = list(crop.getdata())
    n = len(px)
    return {
        "rgb": tuple(round(sum(p[i] for p in px) / n, 1) for i in range(3)),
        "lum": round(sum(0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2] for p in px) / n, 1),
    }


def delta(a, b):
    return tuple(round(x - y, 1) for x, y in zip(a["rgb"], b["rgb"]))


def main() -> int:
    proc = subprocess.Popen(
        [
            mod.EDGE, "--headless=new", "--no-sandbox", "--hide-scrollbars",
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            "--remote-debugging-port=" + str(PORT),
            "--user-data-dir=" + os.path.join(HERE, "_cdp_new"),
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

        def grab():
            r = ws.call("Page.captureScreenshot", {"format": "png"})
            d = (r.get("result") or {}).get("data")
            return Image.open(io.BytesIO(base64.b64decode(d))).convert("RGB")

        def save(img, name):
            os.makedirs(OUT, exist_ok=True)
            img.save(os.path.join(OUT, name + ".png"))

        def meter():
            return ws.js("document.querySelector('.fuwang__meter span')?.textContent")

        def targets_line():
            return ws.js("document.querySelector('.fuwang__targetsline')?.textContent")

        def undo_disabled():
            return ws.js(
                "document.querySelectorAll('.fuwang__tools button')[0]?.disabled"
            )

        def drag(x0, x1, yfrac=0.5, steps=26):
            ws.js(
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
            time.sleep(0.5)

        ws.js("document.querySelector('.night-primary')?.click()")
        time.sleep(6)
        print("phase:", ws.js("window.__world.controller.state.phase"))

        print("\n=== 1. 选色是否高亮「该涂哪里」 ===")
        ws.js("document.querySelectorAll('.fuwang__swatch')[0]?.click()")   # 石青
        time.sleep(1.5)
        base = grab()
        save(base, "A0-shiqing")
        u0 = ws.js("JSON.stringify(window.__world.restorer.targets.map(t=>[t.u0,t.u1]))")
        print("  石青目标区:", u0)
        print("  界面提示:", targets_line())

        ws.js("document.querySelectorAll('.fuwang__swatch')[1]?.click()")   # 石绿
        time.sleep(1.5)
        green = grab()
        save(green, "A1-shilv")
        u1 = ws.js("JSON.stringify(window.__world.restorer.targets.map(t=>[t.u0,t.u1]))")
        print("  石绿目标区:", u1)
        print("  界面提示:", targets_line())

        # 目标区不同 → 画面高亮位置应不同
        box = (200, 150, 1250, 640)
        d = delta(region_stats(green, box), region_stats(base, box))
        print(f"  切色后画面变化 Δ{d}（应非零：高亮位置变了）")

        print("\n=== 2. 单击是否不会充实 ===")
        ws.js("document.querySelectorAll('.fuwang__swatch')[0]?.click()")   # 回到石青
        time.sleep(1)
        # 该折石青目标区的中心在屏幕上的位置
        frac = ws.js(
            "(() => { const r = window.__world.restorer;"
            " const t = r.targets[0]; if (!t) return null;"
            " const cu = (t.u0 + t.u1) / 2;"
            " const w = window.__world;"
            " const v = new (Object.getPrototypeOf(w.camera.position).constructor)(0,0,0);"
            " return cu; })()"
        )
        print("  当前颜料首位目标区中心 u =", frac)
        before = meter()
        # 在画面上点一下（不移动）
        ws.js(
            """(() => {
              const c = document.querySelector('canvas');
              const r = c.getBoundingClientRect();
              const y = r.top + r.height * 0.5;
              const mk = (t) => new PointerEvent(t, {bubbles:true, cancelable:true,
                clientX: r.left + r.width * 0.10, clientY: y, pointerId:1,
                pointerType:'mouse', buttons: t === 'pointerup' ? 0 : 1});
              c.dispatchEvent(mk('pointerdown'));
              window.dispatchEvent(mk('pointerup'));
              return 'clicked';
            })()"""
        )
        time.sleep(1.2)
        after = meter()
        print(f"  单击前 {before}  单击后 {after}")
        prog = ws.js("JSON.stringify(window.__world.restorer.progress.map(p=>+p.toFixed(3)))")
        print("  各折进度:", prog)

        print("\n=== 3. 拖拽涂抹才推进 ===")
        # 在该折区段内横向拖满
        for y in (0.35, 0.45, 0.55, 0.65):
            drag(0.03, 0.32, yfrac=y, steps=30)
        time.sleep(1)
        p1 = ws.js("JSON.stringify(window.__world.restorer.progress.map(p=>+p.toFixed(3)))")
        print("  拖拽后进度:", p1, " 进度条:", meter())
        save(grab(), "A2-after-drag")

        print("\n=== 4. 撤销 ===")
        print("  撤销键禁用?", undo_disabled())
        ws.js("document.querySelectorAll('.fuwang__tools button')[0]?.click()")
        time.sleep(1.2)
        p2 = ws.js("JSON.stringify(window.__world.restorer.progress.map(p=>+p.toFixed(3)))")
        print("  撤销后进度:", p2)
        print("  撤销键禁用?", undo_disabled())
        save(grab(), "A3-after-undo")

        print("\n=== 控制台 ===")
        print("  报错:", len(getattr(ws, "errors", [])))
        return 0
    finally:
        proc.terminate()
        time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
