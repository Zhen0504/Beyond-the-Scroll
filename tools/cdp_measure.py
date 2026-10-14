"""Measure the true screen-to-mural mapping, then report fold coverage.

Places the camera at a known position and scans the screen to learn how many
mural units are visible per unit of camera distance.  This replaces guesswork
with a measured constant.
"""
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

PORT = 9350
URL = "http://127.0.0.1:5173/#fuwang"

MEASURE = """
(() => {
  const w = window.__world;
  const r = w.restorer;
  const c = document.querySelector('canvas');
  const rect = c.getBoundingClientRect();
  const out = [];
  for (const d of [2.0, 3.0, 4.0]) {
    // 把相机放到壁画正前方 x=0，距离 d
    w.camera.position.set(0, 1.72, d);
    w.camera.lookAt(0, 1.62, 0);
    w.camera.updateMatrixWorld(true);
    const at = (frac) => {
      const hit = r.pickFrom({clientX: rect.left + rect.width * frac,
                              clientY: rect.top + rect.height * 0.5});
      return hit ? +hit.uv.x.toFixed(4) : null;
    };
    out.push({dist: d, uL: at(0.001), uM: at(0.5), uR: at(0.999),
              aspect: +w.camera.aspect.toFixed(3), fov: w.camera.fov});
  }
  return JSON.stringify(out, null, 1);
})()
"""


def main() -> int:
    proc = subprocess.Popen(
        [
            mod.EDGE, "--headless=new", "--no-sandbox", "--hide-scrollbars",
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            f"--remote-debugging-port={PORT}",
            f"--user-data-dir={os.path.join(HERE, '_cdp_measure')}",
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
        if not t:
            print("no debug target")
            return 1
        ws = mod.WS(t["webSocketDebuggerUrl"])
        ws.call("Page.enable")
        ws.call("Runtime.enable")
        ws.call("Page.navigate", {"url": URL})
        time.sleep(14)
        ws.js("document.querySelector('.night-primary')?.click()")
        time.sleep(4)
        print(ws.js(MEASURE))
    finally:
        proc.terminate()
        time.sleep(1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
