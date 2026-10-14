"""Is the target highlight actually visible? Compare same pixels with it on/off.

Switching to a pigment that has no target region in this fold turns the
highlighting off, so the difference is purely the highlight.
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

PORT = 9375
URL = "http://127.0.0.1:5173/#fuwang"
OUT = os.path.join(HERE, "..", "shots3")

PROJECT_TMPL = """
(() => {
  const us = %s;
  const w = window.__world;
  const cam = w.camera;
  cam.updateMatrixWorld(true);
  const out = [];
  for (const u of us) {
    const p = new (cam.position.constructor)((u - 0.5) * 14.16, 1.62, 0);
    p.project(cam);
    out.push({ u: u, frac: p.x * 0.5 + 0.5 });
  }
  return JSON.stringify(out);
})()
"""


def main() -> int:
    proc = subprocess.Popen(
        [
            mod.EDGE, "--headless=new", "--no-sandbox", "--hide-scrollbars",
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            "--remote-debugging-port=" + str(PORT),
            "--user-data-dir=" + os.path.join(HERE, "_cdp_hlcheck"),
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

        def mean(img, box):
            crop = img.crop(box)
            px = list(crop.getdata())
            n = len(px)
            return tuple(round(sum(p[i] for p in px) / n, 1) for i in range(3))

        def lum(c):
            return round(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], 1)

        ws.js("document.querySelector('.night-primary')?.click()")
        time.sleep(6)

        # 石青在「救溺」折有目标区；土红没有 → 用它做关灯对照
        ws.js("window.__world.restorer.setPigment('shiqing')")
        time.sleep(2)
        on = grab()
        save(on, "C0-highlight-shiqing")

        ws.js("window.__world.restorer.setPigment('tuhong')")   # 本折土红无用
        time.sleep(2)
        off = grab()
        save(off, "C1-highlight-off-tuhong")

        # 石青的目标区位置
        ws.js("window.__world.restorer.setPigment('shiqing')")
        time.sleep(1)
        targets = json.loads(
            ws.js("JSON.stringify(window.__world.restorer.targets.map(t=>[t.u0,t.u1]))")
        )
        print("石青目标区:", targets)
        proj = json.loads(ws.js(PROJECT_TMPL % json.dumps(
            [(t[0] + t[1]) / 2 for t in targets] + [0.02, 0.13])))
        print("投影:", [(round(p["u"], 3), round(p["frac"], 3)) for p in proj])

        print("\n同一位置的亮度（开关高亮对比）:")
        for i, p in enumerate(proj):
            cx = int(1410 * p["frac"])
            box = (max(0, cx - 45), 260, min(1410, cx + 45), 470)
            a = mean(on, box)
            b = mean(off, box)
            tag = "目标区" if i < len(targets) else "非目标"
            print(
                f"  u={p['u']:.3f} ({tag})  开={lum(a)}  关={lum(b)}  "
                f"差={round(lum(a) - lum(b), 1)}"
            )

        # 整屏高亮面积比例
        print("\n提示文字:", ws.js("document.querySelector('.fuwang__targetsline')?.textContent"))
        return 0
    finally:
        proc.terminate()
        time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
