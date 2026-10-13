"""Why is the mural dark/washed after painting? Read the shader inputs."""
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

PORT = 9361
URL = "http://127.0.0.1:5173/#fuwang"

PROBE = """
(() => {
  const w = window.__world;
  const u = w.mural.material.uniforms;
  const r = w.restorer;
  const c = document.querySelector('canvas');
  const rect = c.getBoundingClientRect();
  const at = (f) => {
    const h = r.pickFrom({clientX: rect.left + rect.width * f,
                          clientY: rect.top + rect.height * 0.5});
    return h ? +h.uv.x.toFixed(4) : null;
  };
  return JSON.stringify({
    fold: r.index,
    progress: r.progress.map(p => +p.toFixed(3)),
    uniforms: {
      uFold0: +u.uFold0.value.toFixed(3),
      uFold1: +u.uFold1.value.toFixed(3),
      uFold2: +u.uFold2.value.toFixed(3),
      uFold3: +u.uFold3.value.toFixed(3),
      uFold4: +u.uFold4.value.toFixed(3),
      uPigment: [+u.uPigmentR.value.toFixed(3), +u.uPigmentG.value.toFixed(3), +u.uPigmentB.value.toFixed(3)],
      uHover: +u.uHover.value.toFixed(3),
      uHoverU0: +u.uHoverU0.value.toFixed(4),
      uHoverU1: +u.uHoverU1.value.toFixed(4),
    },
    screenU: { left: at(0.02), mid: at(0.5), right: at(0.98) },
  }, null, 1);
})()
"""


def main() -> int:
    proc = subprocess.Popen(
        [
            mod.EDGE, "--headless=new", "--no-sandbox", "--hide-scrollbars",
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            "--remote-debugging-port=" + str(PORT),
            "--user-data-dir=" + os.path.join(HERE, "_cdp_why"),
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
        print("== 入画后（未涂）==")
        print(ws.js(PROBE))

        # 涂满第一折
        ws.js(
            """(() => {
              const r = window.__world.restorer;
              for (let i = 0; i < 80; i++) r.apply(0.06);
              return 'ok';
            })()"""
        )
        time.sleep(1.5)
        print("\n== 第一折涂满后 ==")
        print(ws.js(PROBE))
        return 0
    finally:
        proc.terminate()
        time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
