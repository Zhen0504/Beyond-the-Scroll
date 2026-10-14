"""Why does a full drag over the region not fill it? Print the cell grid."""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib.util

spec = importlib.util.spec_from_file_location("cdpf", os.path.join(HERE, "cdp_folds.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

PORT = 9374
URL = "http://127.0.0.1:5173/#fuwang"

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

GRID = "(f,r) => JSON.stringify(Array.from(window.__world.restorer.coverage[f][r]))"


def main() -> int:
    proc = subprocess.Popen(
        [
            mod.EDGE, "--headless=new", "--no-sandbox", "--hide-scrollbars",
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            "--remote-debugging-port=" + str(PORT),
            "--user-data-dir=" + os.path.join(HERE, "_cdp_cells"),
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
        ws.js("document.querySelector('.night-primary')?.click()")
        time.sleep(6)

        ws.js("document.querySelectorAll('.fuwang__swatch')[0]?.click()")  # 石青
        time.sleep(1.5)
        targets = json.loads(
            ws.js("JSON.stringify(window.__world.restorer.targets.map(t=>[t.u0,t.u1]))")
        )
        tgt = targets[0]
        proj = json.loads(ws.js(PROJECT_TMPL % json.dumps(tgt)))
        print(f"石青色区 u=[{tgt[0]}, {tgt[1]}]  屏幕比例 [{proj[0]['frac']:.3f}, {proj[1]['frac']:.3f}]")

        # 用很小的步长慢慢拖过整段
        a, b = proj[0]["frac"], proj[1]["frac"]
        steps = 120
        ws.js(
            f"""(() => {{
              const c = document.querySelector('canvas');
              const r = c.getBoundingClientRect();
              const y = r.top + r.height * 0.5;
              const a = {a}, b = {b};
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
        time.sleep(1.5)

        grid = json.loads(ws.js("(" + GRID + ")(0,1)"))
        lit = sum(grid)
        print(f"石青所在格: {lit}/{len(grid)} = {lit/len(grid)*100:.0f}%")
        print("格明细:", "".join(str(x) for x in grid))
        print("整折进度:", ws.js("JSON.stringify(window.__world.restorer.progress.map(p=>+p.toFixed(3)))"))
        print("色区进度:",
              ws.js("JSON.stringify(window.__world.restorer.coverage[0].map((_,i)=>+window.__world.restorer.regionProgressAt(0,i).toFixed(3)))"))
        return 0
    finally:
        proc.terminate()
        time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
