"""Verify the target-region highlight is actually visible, and that painting works.

Drags are aimed at the on-screen pixels of the *actual* target regions, obtained
by projecting the region's u range through the live camera.
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

PORT = 9372
URL = "http://127.0.0.1:5173/#fuwang"
OUT = os.path.join(HERE, "..", "shots3")

# 把壁画 u 投影到屏幕横坐标比例
PROJECT_TMPL = """
(() => {
  const us = %s;
  const w = window.__world;
  const cam = w.camera;
  cam.updateMatrixWorld(true);
  const M = w.mural.matrixWorld;
  const out = [];
  for (const u of us) {
    const p = new (cam.position.constructor)((u - 0.5) * 14.16, 1.62, 0);
    p.applyMatrix4(M);
    p.project(cam);
    out.push({ u: u, frac: p.x * 0.5 + 0.5 });
  }
  return JSON.stringify(out);
})()
"""


def project(ws, us):
    raw = ws.js(PROJECT_TMPL % json.dumps(us))
    if not isinstance(raw, str) or not raw.startswith("["):
        raise RuntimeError(f"projection failed: {str(raw)[:200]}")
    return json.loads(raw)


def main() -> int:
    proc = subprocess.Popen(
        [
            mod.EDGE, "--headless=new", "--no-sandbox", "--hide-scrollbars",
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            "--remote-debugging-port=" + str(PORT),
            "--user-data-dir=" + os.path.join(HERE, "_cdp_hl"),
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

        def box_stats(img, box):
            crop = img.crop(box)
            px = list(crop.getdata())
            n = len(px)
            return tuple(round(sum(p[i] for p in px) / n, 1) for i in range(3))

        def drag(fracs, yfracs=(0.35, 0.45, 0.55, 0.65), steps=26):
            for y in yfracs:
                ws.js(
                    f"""(() => {{
                      const c = document.querySelector('canvas');
                      const r = c.getBoundingClientRect();
                      const y = r.top + r.height * {y};
                      const a = {fracs[0]}, b = {fracs[1]};
                      const mk = (t, x) => new PointerEvent(t, {{bubbles:true, cancelable:true,
                        clientX:x, clientY:y, pointerId:1, pointerType:'mouse',
                        buttons: t === 'pointerup' ? 0 : 1}});
                      c.dispatchEvent(mk('pointerdown', r.left + r.width * a));
                      for (let i = 1; i <= {steps}; i++)
                        window.dispatchEvent(mk('pointermove',
                          r.left + r.width * (a + (b - a) * (i / {steps}))));
                      window.dispatchEvent(mk('pointerup', r.left + r.width * b));
                      return 'ok';
                    }})()"""
                )
                time.sleep(0.4)

        ws.js("document.querySelector('.night-primary')?.click()")
        time.sleep(6)
        print("phase:", ws.js("window.__world.controller.state.phase"))

        print("\n=== A. 高亮是否明显 ===")
        ws.js("document.querySelectorAll('.fuwang__swatch')[0]?.click()")   # 石青
        time.sleep(2)
        base = grab()
        save(base, "B0-target-shiqing")
        targets = json.loads(
            ws.js("JSON.stringify(window.__world.restorer.targets.map(t=>[t.u0,t.u1]))")
        )
        print("  石青目标区 u:", targets)

        # 目标区 vs 非目标区 在屏幕上的亮度对比
        pts = project(ws, [0.02, (targets[0][0] + targets[0][1]) / 2, 0.12])
        print("  投影:", [(round(p["u"], 3), round(p["frac"], 3)) for p in pts])

        # 全屏关掉高亮做对照：切到一种本折没有的颜色
        ws.js("document.querySelectorAll('.fuwang__swatch')[2]?.click()")   # 朱砂（本折有）
        time.sleep(1)
        on = grab()
        save(on, "B1-highlight-on")
        ws.js("window.__world.restorer.setPigment('shiqing')")
        time.sleep(1.5)

        # 量：目标区中心 与 非目标区 的亮度差
        cx = pts[1]["frac"]
        w = None
        box_t = (int(1410 * cx - 60), 250, int(1410 * cx + 60), 450)
        nt = pts[0]["frac"]
        box_n = (max(0, int(1410 * nt - 40)), 250, max(1, int(1410 * nt + 40)), 450)
        ct = box_stats(base, box_t)
        cn = box_stats(base, box_n)
        print(f"  目标区均值 {ct}   非目标区均值 {cn}")
        lum_t = 0.299 * ct[0] + 0.587 * ct[1] + 0.114 * ct[2]
        lum_n = 0.299 * cn[0] + 0.587 * cn[1] + 0.114 * cn[2]
        print(f"  亮度差 = {round(lum_t - lum_n, 1)}（目标应明显更亮）")

        print("\n=== B. 单击不推进 ===")
        ws.js("document.querySelectorAll('.fuwang__swatch')[0]?.click()")
        time.sleep(1)
        before = ws.js("document.querySelector('.fuwang__meter span')?.textContent")
        ws.js(
            f"""(() => {{
              const c = document.querySelector('canvas');
              const r = c.getBoundingClientRect();
              const y = r.top + r.height * 0.5;
              const x = r.left + r.width * {pts[1]['frac']};
              const mk = (t) => new PointerEvent(t, {{bubbles:true, cancelable:true,
                clientX:x, clientY:y, pointerId:1, pointerType:'mouse',
                buttons: t === 'pointerup' ? 0 : 1}});
              c.dispatchEvent(mk('pointerdown'));
              window.dispatchEvent(mk('pointerup'));
              return 'ok';
            }})()"""
        )
        time.sleep(1.2)
        after = ws.js("document.querySelector('.fuwang__meter span')?.textContent")
        print(f"  单击前 {before} → 单击后 {after}")

        print("\n=== C. 在目标区内拖拽才推进 ===")
        # 把石青目标区完整拖一遍
        for tgt in targets:
            fa = project(ws, [tgt[0], tgt[1]])
            drag((fa[0]["frac"], fa[1]["frac"]))
        time.sleep(1)
        p = ws.js("JSON.stringify(window.__world.restorer.progress.map(x=>+x.toFixed(3)))")
        print("  拖拽后进度:", p)
        print("  进度条:", ws.js("document.querySelector('.fuwang__meter span')?.textContent"))
        print("  当前颜料剩余目标:",
              ws.js("document.querySelector('.fuwang__targetsline')?.textContent"))
        save(grab(), "B2-after-drag")

        print("\n=== D. 撤销 ===")
        ws.js("document.querySelectorAll('.fuwang__tools button')[0]?.click()")
        time.sleep(1.2)
        p2 = ws.js("JSON.stringify(window.__world.restorer.progress.map(x=>+x.toFixed(3)))")
        print("  撤销后进度:", p2)
        save(grab(), "B3-after-undo")

        print("\n=== 控制台 ===")
        print("  报错:", len(getattr(ws, "errors", [])))
        return 0
    finally:
        proc.terminate()
        time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
