"""Analyse the Cave 257 photo and derive the mural texture + attribution info.

Report: brightness profile, suggested crop of the painted band, dominant palette.
"""
import os
import sys

from PIL import Image, ImageStat

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "repo-src", "public", "paintings", "fuwang-bensheng",
                   "panorama.jpg")


def band_stats(img: Image.Image, rows: int = 16) -> list[tuple[int, int, float]]:
    w, h = img.size
    out = []
    for i in range(rows):
        y0 = h * i // rows
        y1 = h * (i + 1) // rows
        strip = img.crop((0, y0, w, y1)).convert("L")
        out.append((y0, y1, ImageStat.Stat(strip).mean[0]))
    return out


def col_stats(img: Image.Image, cols: int = 12) -> list[tuple[int, int, float]]:
    w, h = img.size
    out = []
    for i in range(cols):
        x0 = w * i // cols
        x1 = w * (i + 1) // cols
        strip = img.crop((x0, 0, x1, h)).convert("L")
        out.append((x0, x1, ImageStat.Stat(strip).mean[0]))
    return out


def main() -> int:
    if not os.path.exists(SRC):
        print(f"missing {SRC}")
        return 1
    img = Image.open(SRC)
    print(f"size = {img.size}  mode = {img.mode}")

    print("\n-- 横向分条亮度（找画面有效带）--")
    for y0, y1, mean in band_stats(img):
        bar = "#" * int(mean / 4)
        print(f"  y {y0:>5}-{y1:<5} {mean:6.1f} {bar}")

    print("\n-- 纵向分列亮度 --")
    for x0, x1, mean in col_stats(img):
        bar = "#" * int(mean / 4)
        print(f"  x {x0:>5}-{x1:<5} {mean:6.1f} {bar}")

    small = img.convert("RGB").resize((160, 62))
    quant = small.quantize(colors=10, method=Image.Quantize.MEDIANCUT).convert("RGB")
    colors = quant.getcolors(160 * 62) or []
    print("\n-- 主色（缩样量化）--")
    for count, rgb in sorted(colors, reverse=True):
        print(f"  #{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}  {count*100//(160*62):>3}%  rgb{rgb}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
