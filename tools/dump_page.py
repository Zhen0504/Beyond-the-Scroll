"""What is the page actually showing? Dump state, hash and any module errors."""
import base64
import io
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

PORT = 9382
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173/#fuwang"


def main() -> int:
    proc = subprocess.Popen(
        [
            mod.EDGE, "--headless=new", "--no-sandbox", "--hide-scrollbars",
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            "--remote-debugging-port=" + str(PORT),
            "--user-data-dir=" + os.path.join(HERE, "_cdp_dump"),
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
        ws.call("Runtime.evaluate", {"expression": "1"})   # 触发一次以收取事件
        ws.call("Page.navigate", {"url": URL})
        time.sleep(14)
        print("hash         :", ws.js("location.hash"))
        print("body classes :", ws.js("document.body.className"))
        print("有 __world   :", ws.js("typeof window.__world"))
        print("有 .entry    :", ws.js("!!document.querySelector('.entry')"))
        print("有 .night-plate:", ws.js("!!document.querySelector('.night-plate')"))
        print("有 .fuwang__palette:", ws.js("!!document.querySelector('.fuwang__palette')"))
        print("h1           :", ws.js("document.querySelector('h1,.night-plate__inner h1')?.textContent"))
        print("main#root 子节点数:", ws.js("document.getElementById('root')?.childElementCount"))
        # 页面内错误
        print("window.onerror 捕获:", ws.js("window.__lastError || '(none)'"))
        print("canvas 数:", ws.js("document.querySelectorAll('canvas').length"))
        print("控制台错误:", len(getattr(ws, "errors", [])))
        return 0
    finally:
        proc.terminate()
        time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
