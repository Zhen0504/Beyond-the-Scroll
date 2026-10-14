"""Verify every fold's camera frames its own painting region."""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# 复用 cdp_folds.py 里的 CDP 客户端
import importlib.util

spec = importlib.util.spec_from_file_location("cdpf", os.path.join(HERE, "cdp_folds.py"))
mod = importlib.util.module_from_spec(spec)
# 阻止其 __main__ 执行
spec.loader.exec_module(mod)

EDGE = mod.EDGE
PORT = 9345
URL = "http://127.0.0.1:5173/#fuwang"

PROBE = """
(() => {
  const w = window.__world;
  const r = w.restorer;
  const c = document.querySelector('canvas');
  const rect = c.getBoundingClientRect();
  const ids = ['jiuni','beishi','xuangshang','weilie','chenqing'];
  const out = [];
  for (let f = 0; f < 5; f++) {
    w.controller.openChapter(ids[f]);
    r.setFold(f);
    const cam = w.camera;
    const at = (frac) => {
      const hit = r.pickFrom({clientX: rect.left + rect.width * frac,
                              clientY: rect.top + rect.height * 0.5});
      return hit ? +hit.uv.x.toFixed(3) : null;
    };
    const range = r.folds[f];
    out.push({
      fold: f, name: range.name,
      camX: +cam.position.x.toFixed(2), camZ: +cam.position.z.toFixed(2),
      uL: at(0.02), uM: at(0.5), uR: at(0.98),
      u0: range.u0, u1: range.u1,
    });
  }
  return JSON.stringify(out);
})()
"""


def main() -> int:
    import time

    proc = subprocess.Popen(
        [
            EDGE, "--headless=new", "--no-sandbox", "--hide-scrollbars",
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            f"--remote-debugging-port={PORT}",
            f"--user-data-dir={os.path.join(HERE, '_cdp_check')}",
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
        time.sleep(14)
        ws.js("document.querySelector('.night-primary')?.click()")
        time.sleep(4)
        raw = ws.js(PROBE)
        data = json.loads(raw)
    finally:
        proc.terminate()
        time.sleep(1)

    print(f"{'折':<6}{'名称':<8}{'相机x':>7}{'距离':>7}{'u左':>8}{'u中':>8}{'u右':>8}   折区间           判定")
    bad = 0
    for r in data:
        ul, ur = r["uL"], r["uR"]
        lo, hi = r["u0"], min(r["u1"], 0.999)
        # 折位于画幅边缘时，越界一侧的射线本就落空（应为 null），
        # 视作已覆盖到画幅边界。
        left_ok = (ul is None and lo <= 0.001) or (ul is not None and ul <= lo + 0.035)
        right_ok = (ur is None and hi >= 0.998) or (ur is not None and ur >= hi - 0.035)
        ok = left_ok and right_ok
        if not ok:
            bad += 1
        print(
            f"{r['fold']:<6}{r['name']:<8}{r['camX']:>7}{r['camZ']:>7}"
            f"{str(ul):>8}{r['uM']:>8}{str(ur):>8}   [{lo:.3f},{hi:.3f}]   "
            f"{'覆盖' if ok else '不足'}"
        )
    print(f"\n未覆盖的折：{bad} / 5")
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
