"""Restore the fold camera rail: cameras 2.3-2.9 from the mural, targets on it.

The previous regex pass shifted every [x, y, z] triple, which also moved the
look-at targets off the wall.  Targets must sit on the mural plane (z = 0).
"""
import pathlib
import re

P = pathlib.Path(r"repo-src\src\scenes\world\fuwang\story.js")
text = P.read_text(encoding="utf-8")


def fix(m):
    x, y, z = float(m.group(1)), m.group(2), float(m.group(3))
    # 目标点一律回到壁画平面
    if abs(z - 0.17) < 0.02:
        return f"[{m.group(1)}, {y}, 0]"
    return f"[{m.group(1)}, {y}, {z}]"


new, n = re.subn(
    r"\[(-?\d+(?:\.\d+)?), (\d+(?:\.\d+)?), (\d+(?:\.\d+)?)\]", fix, text
)
P.write_text(new, encoding="utf-8")
print(f"visited {n} triples")

targets = re.findall(r"^\s+\[(-?[\d.]+), ([\d.]+), 0\],$", new, re.M)
cams = re.findall(r"^\s+\[(-?[\d.]+), ([\d.]+), (2\.\d+)\],$", new, re.M)
print(f"targets on wall: {len(targets)}   cameras: {len(cams)}")
print("camera z range:", min(float(c[2]) for c in cams), "-", max(float(c[2]) for c in cams))
