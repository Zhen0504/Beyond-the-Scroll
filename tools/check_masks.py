"""把生成的蒙版叠回壁画，逐个检查是否真的贴合形体。

输出 tools/_mask_check.png：每行一个形体 —— 左为壁画，右为该蒙版（红=选中）。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PAN = ROOT / "public" / "paintings" / "fuwang-bensheng" / "panorama.jpg"
MASK = ROOT / "public" / "paintings" / "fuwang-bensheng" / "masks.png"
JS = ROOT / "src" / "scenes" / "world" / "fuwang" / "shapes.js"
OUT = ROOT / "tools" / "_mask_check.png"

SLOT_W, SLOT_H = 128, 64


def parse_shapes():
    text = JS.read_text(encoding="utf-8")
    out = []
    for m in re.finditer(
        r"\{\s*id:\s*'([^']+)',\s*fold:\s*'([^']+)',\s*p:\s*'([^']+)',\s*"
        r"what:\s*'([^']+)',\s*slot:\s*(\d+),\s*box:\s*\[([^\]]+)\]\s*\}",
        text,
    ):
        box = [float(x) for x in m.group(6).split(",")]
        out.append(dict(id=m.group(1), fold=m.group(2), p=m.group(3),
                        what=m.group(4), slot=int(m.group(5)), box=box))
    return out


def main() -> int:
    shapes = parse_shapes()
    pan = Image.open(PAN).convert("RGB")
    atlas = np.asarray(Image.open(MASK).convert("L")).astype(np.float32) / 255.0
    W, H = pan.size
    print(f"{len(shapes)} 个形体")

    rows = []
    for s in shapes:
        u0, v0, u1, v1 = s["box"]
        # 放大一点边界便于看清
        pad = 0.012
        a = max(0.0, u0 - pad); b = min(1.0, u1 + pad)
        c = max(0.0, v0 - pad); d = min(1.0, v1 + pad)
        x0, x1 = int(a * W), int(np.ceil(b * W))
        y0, y1 = int((1 - d) * H), int(np.ceil((1 - c) * H))
        crop = pan.crop((x0, y0, x1, y1))

        # 蒙版槽位 -> 该包围盒范围
        slot = atlas[:, s["slot"] * SLOT_W:(s["slot"] + 1) * SLOT_W]
        m = Image.fromarray((slot * 255).astype(np.uint8))
        # 映射到裁剪区域：形体自身包围盒在裁剪中的位置
        mx0 = int((u0 - a) / (b - a) * crop.width)
        mx1 = int((u1 - a) / (b - a) * crop.width)
        my0 = int((d - v1) / (d - c) * crop.height)
        my1 = int((d - v0) / (d - c) * crop.height)
        full = Image.new("L", crop.size, 0)
        if mx1 > mx0 and my1 > my0:
            full.paste(m.resize((mx1 - mx0, my1 - my0), Image.BILINEAR), (mx0, my0))
        ma = np.asarray(full).astype(np.float32) / 255.0

        # 叠加：选中处染红
        arr = np.asarray(crop).astype(np.float32)
        red = np.zeros_like(arr)
        red[:, :, 0] = 255
        arr = arr * (1 - ma[:, :, None] * 0.65) + red * (ma[:, :, None] * 0.65)
        overlay = Image.fromarray(arr.astype(np.uint8))

        # 并排
        h = 110
        scale = h / crop.height
        cw = int(crop.width * scale)
        pair = Image.new("RGB", (cw * 2 + 8, h), (20, 20, 20))
        pair.paste(crop.resize((cw, h)), (0, 0))
        pair.paste(overlay.resize((cw, h)), (cw + 8, 0))
        rows.append((f"{s['id']}  [{s['p']}] {s['what']}", pair))

    # 纵向拼接，每行加标签
    lh = 16
    total_h = sum(p.height + lh for _, p in rows)
    max_w = max(p.width for _, p in rows)
    sheet = Image.new("RGB", (max_w + 300, total_h), (12, 12, 12))
    dr = ImageDraw.Draw(sheet)
    y = 0
    for label, pair in rows:
        dr.text((4, y + 3), label, fill=(255, 240, 180))
        sheet.paste(pair, (296, y + lh))
        y += pair.height + lh
    sheet.save(OUT)
    print(f"-> {OUT}  {sheet.width}×{sheet.height}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
