"""End-to-end check of the reworked painting: highlight, drag, brush, undo."""
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

PORT = 9390
URL = "http://127.0.0.1:5173/#fuwang"
OUT = os.path.join(HERE, "..", "shots3")

# 把壁画 (u,v) 投影到屏幕比例
PROJ = """
(() => {
  const us = %s;
  const w = window.__world;
  const cam = w.camera;
  cam.updateMatrixWorld(true);
  const P = cam.position.constructor;
  const out = [];
  for (const p of us) {
    const v = new P((p[0] - 0.5) * 14.16, 1.62 + (p[1] - 0.5) * 2.428, 0);
    v.project(cam);
    out.push({ u: p[0], v: p[1], x: v.x * 0.5 + 0.5, y: -v.y * 0.5 + 0.5 });
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
            "--user-data-dir=" + os.path.join(HERE, "_cdp_e2e"),
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
            return Image.open(io.BytesIO(base64.b64decode(
                (r.get("result") or {}).get("data")))).convert("RGB")

        def save(img, n):
            os.makedirs(OUT, exist_ok=True)
            img.save(os.path.join(OUT, n + ".png"))

        def proj(points):
            raw = ws.js(PROJ % json.dumps(points))
            if not isinstance(raw, str) or not raw.startswith("["):
                raise RuntimeError(str(raw)[:200])
            return json.loads(raw)

        def meter():
            return ws.js("document.querySelector('.fuwang__meter span')?.textContent")

        def prog():
            return ws.js(
                "JSON.stringify(window.__world.restorer.progress.map(p=>+p.toFixed(3)))"
            )

        def drag(p0, p1, steps=40):
            """在壁画坐标 p0→p1 之间按住拖动"""
            pts = proj([p0, p1])
            a, b = pts
            ws.js(
                f"""(() => {{
                  const c = document.querySelector('canvas');
                  const r = c.getBoundingClientRect();
                  const X = f => r.left + r.width * f;
                  const Y = f => r.top + r.height * f;
                  const mk = (t, x, y) => new PointerEvent(t, {{bubbles:true, cancelable:true,
                    clientX:x, clientY:y, pointerId:1, pointerType:'mouse',
                    buttons: t === 'pointerup' ? 0 : 1}});
                  c.dispatchEvent(mk('pointerdown', X({a['x']}), Y({a['y']})));
                  for (let i = 1; i <= {steps}; i++) {{
                    const f = i / {steps};
                    window.dispatchEvent(mk('pointermove',
                      X({a['x']} + ({b['x']} - {a['x']}) * f),
                      Y({a['y']} + ({b['y']} - {a['y']}) * f)));
                  }}
                  window.dispatchEvent(mk('pointerup', X({b['x']}), Y({b['y']})));
                  return 'ok';
                }})()"""
            )
            time.sleep(0.3)

        ws.js("document.querySelector('.night-primary')?.click()")
        time.sleep(6)
        print("phase:", ws.js("window.__world.controller.state.phase"))

        # 选石青（第一折目标：左侧山峦）
        ws.js("document.querySelectorAll('.fuwang__swatch')[0]?.click()")
        time.sleep(1.5)
        tgt = json.loads(ws.js("JSON.stringify(window.__world.restorer.targets.map(t=>[t.u0,t.v0,t.u1,t.v1]))"))
        print("石青目标矩形 (u0,v0,u1,v1):", tgt)

        target = tgt[0]
        u0, v0, u1, v1 = target
        ua, ub = (u0 + u1) / 2 - (u1 - u0) / 2, (u0 + u1) / 2 + (u1 - u0) / 2

        print("\n=== 1. 单击 ===")
        b = meter()
        drag([ua, v0 + (v1 - v0) / 2], [ua, v0 + (v1 - v0) / 2], steps=1)
        time.sleep(1)
        print(f"  {b} → {meter()}   进度 {prog()}")

        print("\n=== 2. 在目标区内扫涂 ===")
        rows = 14
        for i in range(rows):
            y = v0 + (v1 - v0) * (i + 0.5) / rows
            drag([ua, y], [ub, y])
        time.sleep(1)
        p1 = prog()
        print("  进度:", p1, " 进度条:", meter())
        print("  剩余目标:", ws.js("document.querySelector('.fuwang__targetsline')?.textContent"))
        save(grab(), "E1-after-paint")

        print("\n=== 3. 笔刷大小 ===")
        for frac in (0.0, 0.5, 1.0):
            ws.js(
                "(() => { const s=document.querySelector('.fuwang__brush input');"
                f"const mn=+s.min, mx=+s.max; s.value = String(mn + (mx-mn)*{frac});"
                "s.dispatchEvent(new Event('input',{bubbles:true}));"
                "s.dispatchEvent(new Event('change',{bubbles:true})); return 'ok'; })()"
            )
            time.sleep(0.6)
            print(f"  滑杆 {int(frac*100)}% → 笔刷 {ws.js('window.__world.restorer.brush')}")

        print("\n=== 4. 撤销 ===")
        print("  撤销前:", prog())
        for _ in range(2):
            ws.js("document.querySelectorAll('.fuwang__tools button')[0]?.click()")
            time.sleep(0.8)
        print("  撤销2次后:", prog())
        save(grab(), "E2-after-undo")

        print("\n=== 5. 效果开关对比（目标区 vs 非目标）===")
        on = grab()
        save(on, "E3-target-on")
        ws.js("window.__world.restorer.setPigment('tuhong')")   # 换一种，高亮位置变
        time.sleep(1.5)
        save(grab(), "E4-target-tuhong")

        print("\n控制台报错:", len(getattr(ws, "errors", [])))
        return 0
    finally:
        proc.terminate()
        time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
