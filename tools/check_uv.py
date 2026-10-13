"""Visualise the mask atlas and the UV mapping used by the shader.

Draws, for each shape, the atlas slot next to the mural region the shader would
sample with the current formula — so a wrong mapping shows up immediately.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PAN = ROOT / "public" / "paintings" / "fuwang-bensheng" / "panorama.jpg"
MASKS = ROOT / "public" / "paintings" / "fuwang-bensheng" / "masks.png"
JS = ROOT / "src" / "scenes" / "world" / "fuwang" / "shapes.js"
OUT = ROOT / "tools" / "_uv_map.png"
SLOT_W, SLOT_H = 128, 64


def parse_shapes():
    text = JS.read_text(encoding="utf-8")
    out = []
    for m in re.finditer(
        r"\{\s*id:\s*'([^']+)',\s*fold:\s*'([^']+)',\s*p:\s*'([^']+)',\s*"
        r"what:\s*'([^']+)',\s*slot:\s*(\d+),\s*box:\s*\[([^\]]+)\]\s*\}",
        text,
    ):
        out.append(dict(id=m.group(1), p=m.group(3), what=m.group(4),
                        slot=int(m.group(5)), box=[float(x) for x in m.group(6).split(",")]))
    return out


def main() -> int:
    shapes = parse_shapes()
    pan = Image.open(PAN).convert("RGB")
    W, H = pan.size
    atlas = Image.open(MASKS).convert("L")
    aw, ah = atlas.size

    rows = []
    for s in shapes[:8]:
        u0, v0, u1, v1 = s["box"]
        pad = 0.01
        a, b = max(0.0, u0 - pad), min(1.0, u1 + pad)
        c, d = max(0.0, v0 - pad), min(1.0, v1 + pad)
        x0, x1 = int(a * W), int(np.ceil(b * W))
        y0, y1 = int((1 - d) * H), int(np.ceil((1 - c) * H))
        crop = pan.crop((x0, y0, x1, y1))

        # 着色器公式：local = (uv - box.xy) / box.zw
        #             muv = ((slot + local.x) * gridX, local.y * gridY)
        # 把整个裁剪区域的 (u,v) 映射到图集，看采到的是什么
        cw, ch = crop.size
        uu = np.linspace(a, b, cw)
        vv = np.linspace(c, d, ch)
        localx = (uu - u0) / (u1 - u0)
        localy = (vv - v0) / (v1 - v0)
        sx = np.clip(((s["slot"] + localx) * SLOT_W), 0, aw - 1).astype(int)
        sy = np.clip((localy * SLOT_H), 0, ah - 1).astype(int)
        sampled = np.asarray(atlas)[np.ix_(sy, sx)]

        # 左边：壁画裁剪；右边：着色器会采到的蒙版
        samp_img = Image.fromarray(sampled)
        h = 100
        sc = h / ch
        pw = max(1, int(cw * sc))
        pair = Image.new("RGB", (pw * 2 + 6, h), (20, 20, 20))
        pair.paste(crop.resize((pw, h)), (0, 0))
        pair.paste(samp_img.convert("RGB").resize((pw, h)), (pw + 6, 0))
        rows.append((f"{s['id']} [{s['p']}] {s['what']}  slot{s['slot']}", pair))

    lh = 15
    sheet = Image.new("RGB", (max(p.width for _, p in rows) + 320,
                              sum(p.height + lh for _, p in rows)), (12, 12, 12))
    dr = ImageDraw.Draw(sheet)
    y = 0
    for label, pair in rows:
        dr.text((4, y + 2), label, fill=(255, 240, 180))
        sheet.paste(pair, (316, y + lh))
        y += pair.height + lh
    sheet.save(OUT)
    print(f"-> {OUT}  {sheet.width}×{sheet.height}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
