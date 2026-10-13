"""Screenshot each pigment's target highlight, for visual review."""
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

PORT = 9380
URL = "http://127.0.0.1:5173/#fuwang"
OUT = os.path.join(HERE, "..", "shots3")


def main() -> int:
    proc = subprocess.Popen(
        [
            mod.EDGE, "--headless=new", "--no-sandbox", "--hide-scrollbars",
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            "--remote-debugging-port=" + str(PORT),
            "--user-data-dir=" + os.path.join(HERE, "_cdp_shots"),
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

        ws.js("document.querySelector('.night-primary')?.click()")
        time.sleep(6)
        print("phase:", ws.js("window.__world.controller.state.phase"))

        names = ["shiqing", "shilv", "zhusha", "tuhong"]
        for i, nid in enumerate(names):
            # 通过真实点击调色盘切色，界面文案才会同步
            ws.js(f"document.querySelectorAll('.fuwang__swatch')[{i}]?.click()")
            time.sleep(1.8)
            info = ws.js(
                "JSON.stringify({targets: window.__world.restorer.targets.map(t=>t.what),"
                " label: document.querySelector('.fuwang__targetsline')?.textContent})"
            )
            print(f"  {nid}: {info}")
            save(grab(), f"D{i}-{nid}")

        # 第一折再各看一眼
        ws.js("document.querySelectorAll('.fuwang__swatch')[0]?.click()")
        time.sleep(1.2)
        save(grab(), "D4-fold1-shiqing")
        ws.js("document.querySelectorAll('.fuwang__swatch')[2]?.click()")
        time.sleep(1.5)
        save(grab(), "D5-fold1-zhusha")

        # 切到第三折看中部宫殿
        ws.js("[...document.querySelectorAll('.night-tour__header nav button')][2].click()")
        time.sleep(5)
        print("  折三 label:",
              ws.js("document.querySelector('.fuwang__targetsline')?.textContent"))
        save(grab(), "D6-fold3")
        print("控制台报错:", len(getattr(ws, "errors", [])))
        return 0
    finally:
        proc.terminate()
        time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
