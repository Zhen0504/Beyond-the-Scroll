"""Verify the per-colour toggle: click a colour -> whole fold painted in it; click again -> undone."""
import base64
import io
import json
import os
import subprocess
import sys
import time

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib.util

spec = importlib.util.spec_from_file_location("cdpf", os.path.join(HERE, "cdp_folds.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

PORT = int(os.environ.get("CDP_PORT", "0")) or (9650 + (os.getpid() % 300))
PROFILE = os.path.join(HERE, f"_cdp_tog_{PORT}")
URL = os.environ.get("FUWANG_SITE_URL", "http://127.0.0.1:5173/#fuwang")
OUT = os.path.join(HERE, "..", "shots3")


def main() -> int:
    proc = subprocess.Popen(
        [
            mod.EDGE, "--headless=new", "--no-sandbox", "--hide-scrollbars",
            "--no-first-run", "--no-default-browser-check",
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            "--remote-debugging-port=" + str(PORT),
            "--user-data-dir=" + PROFILE,
            "--window-size=1440,900", "about:blank",
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        t = None
        for _ in range(120):
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
        if not t:
            print("browser not ready")
            return 1
        ws = mod.WS(t["webSocketDebuggerUrl"])
        ws.call("Page.enable")
        ws.call("Runtime.enable")
        ws.js("localStorage.clear(); sessionStorage.clear();")
        ws.call("Page.navigate", {"url": URL})
        # 等入场门页出现
        for _ in range(40):
            time.sleep(1)
            if ws.js("document.querySelector('.night-primary') ? 'yes' : 'no'") == "yes":
                break
        time.sleep(2)
        # 逐层截图时关闭完成后的自动释文，避免弹窗遮住第六层画面。
        ws.js("localStorage.setItem('fuwang:auto-lecture', 'off')")
        ws.call("Page.reload")
        for _ in range(40):
            time.sleep(1)
            if ws.js("document.querySelector('.night-primary') ? 'yes' : 'no'") == "yes":
                break
        ws.js("document.querySelector('.night-primary')?.click()")
        # 等调色盘挂上
        ok = False
        for _ in range(60):
            time.sleep(1)
            if ws.js("document.querySelector('.fuwang__palette') ? 'yes' : 'no'") == "yes":
                ok = True
                break
        time.sleep(2)
        print("phase:", ws.js("window.__world.controller.state.phase"))
        print("调色盘已挂载:", ok)
        if not ok:
            print("页面结构:", ws.js("JSON.stringify({plate: !!document.querySelector('.night-plate'),"
                                     " primary: !!document.querySelector('.night-primary'),"
                                     " body: document.body.className})"))
            return 1

        def grab():
            r = ws.call("Page.captureScreenshot", {"format": "png"})
            return Image.open(io.BytesIO(base64.b64decode(
                (r.get("result") or {})["data"]))).convert("RGB")

        def save(img, n):
            os.makedirs(OUT, exist_ok=True)
            img.save(os.path.join(OUT, n + ".png"))

        def mean(img):
            a = np.asarray(img).astype(np.float32)
            return tuple(round(float(a[:, :, i].mean()), 1) for i in range(3))

        def state():
            return ws.js(
                "JSON.stringify({progress: window.__world.restorer.progress.map(p=>+p.toFixed(2)),"
                " on: window.__world.restorer.snapshot().on,"
                " filled: [...window.__world.restorer.filled],"
                " labels: [...document.querySelectorAll('.fuwang__swatch em')].map(e=>e.textContent),"
                " meter: document.querySelector('.fuwang__meter span')?.textContent,"
                " line: document.querySelector('.fuwang__targetsline')?.textContent})"
            )

        def delta(a, b):
            aa = np.asarray(a).astype(np.float32)
            bb = np.asarray(b).astype(np.float32)
            return round(float(np.abs(aa - bb).mean()), 3)

        ws.js("document.querySelector('.night-primary')?.click()")
        # 等入场动画走完、调色盘挂上
        for _ in range(40):
            time.sleep(1)
            if ws.js("document.querySelector('.fuwang__palette') ? 'yes' : 'no'") == "yes":
                break
        time.sleep(2)
        print("phase:", ws.js("window.__world.controller.state.phase"))
        print("调色盘已挂载:", ws.js("!!document.querySelector('.fuwang__palette')"))

        base = grab()
        save(base, "T0-before")
        print("\n=== 点之前（应是重彩前的壁画）===")
        print("  ", state())
        print("  画面均值:", mean(base))
        print("  引导是否开启:", ws.js("window.__world.mural.material.uniforms.uHover.value"))

        print("\n=== 逐个点颜色 ===")
        previous = base
        for i, pid in enumerate(["shiqing", "shilv", "zhusha", "tuhong", "baise", "mose"]):
            ws.js(f"document.querySelectorAll('.fuwang__swatch')[{i}]?.click()")
            time.sleep(1.6)
            img = grab()
            save(img, f"T1-on-{pid}")
            st = json.loads(state())
            print(f"  点 {pid:8s} → 已敷 {st['on']}")
            print(f"             调色盘 {st['labels']}  进度条 {st['meter']}")
            print(f"             画面均值 {mean(img)}")
            print(f"             与上一步像素差 {delta(previous, img)}")
            previous = img

        print("\n=== 再点第一种颜色 → 应还原 ===")
        ws.js("document.querySelectorAll('.fuwang__swatch')[0]?.click()")
        time.sleep(1.6)
        img = grab()
        save(img, "T2-off-shiqing")
        st = json.loads(state())
        print(f"  已敷 {st['on']}")
        print(f"  调色盘 {st['labels']}")
        print(f"  画面均值 {mean(img)}")

        print("\n=== 还原按钮 ===")
        ws.js("document.querySelectorAll('.fuwang__tools button')[0]?.click()")
        time.sleep(1.6)
        img = grab()
        save(img, "T3-reset")
        st = json.loads(state())
        print(f"  已敷 {st['on']}  进度 {st['progress']}")
        print(f"  画面均值 {mean(img)}")
        print(f"  与初始是否一致: {mean(img) == mean(base)}")

        print("\n控制台报错:", len(getattr(ws, "errors", [])))
        return 0
    finally:
        proc.terminate()
        time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
