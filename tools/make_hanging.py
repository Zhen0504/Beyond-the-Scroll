"""Locate the 九色鹿 (white deer) in the mural and derive the hanging-scroll crop.

The deer is painted in near-white, so a luminance/saturation mask finds it.
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(HERE, "repo-src", "public", "paintings", "fuwang-bensheng")
SRC = os.path.join(DIR, "panorama.jpg")

OUT_W, OUT_H = 1200, 600
ASPECT = OUT_W / OUT_H          # 宽 / 高 = 2.0


def main() -> int:
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    print(f"source {w}x{h}  aspect {w/h:.3f}")

    # 通过 --u 指定窗口左端（u 值），默认取救溺一段
    import sys
    u_left = 0.0
    for i, a in enumerate(sys.argv):
        if a == "--u" and i + 1 < len(sys.argv):
            u_left = float(sys.argv[i + 1])

    win_px = int(h * ASPECT)
    left = max(0, min(w - win_px, int(w * u_left)))
    crop = im.crop((left, 0, left + win_px, h))
    out = crop.resize((OUT_W, OUT_H), Image.LANCZOS)
    dest = os.path.join(DIR, "hanging.jpg")
    out.save(dest, "JPEG", quality=88, optimize=True)
    print(f"wrote {dest} {out.size} {os.path.getsize(dest)/1024:.0f} KB  (u {left/w:.3f}–{(left+win_px)/w:.3f})")

    check = crop.copy()
    check.thumbnail((1400, 1400))
    check.save(os.path.join(HERE, "_crop_check.png"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
