"""Vertical 立轴 for scroll three, composed as a proper hanging scroll.

The mural is a 5.8:1 horizontal scroll; the entry page hangs each work as a
vertical 立轴.  Rather than distorting the mural, this lays it out the way a
立轴 is actually mounted: a full-width opening band, a focused 画心 in the
middle, and a slim index strip of the whole scroll below it.
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(HERE, "repo-src", "public", "paintings", "fuwang-bensheng")
SRC = os.path.join(DIR, "panorama.jpg")

OUT_W, OUT_H = 1200, 1050
MARGIN = 0.085          # 左右留白
SAFE_L, SAFE_R = 0.035, 0.985   # 避开左端烟熏黑边与右端残损


def mean_color(im: Image.Image) -> tuple[int, int, int]:
    small = im.resize((24, 24))
    data = small.tobytes()
    n = 24 * 24
    return tuple(sum(data[i::3]) // n for i in range(3))


def framed(canvas, box_img, x, y, edge, w=3):
    d = ImageDraw.Draw(canvas)
    d.rectangle(
        [x - 5, y - 5, x + box_img.width + 5, y + box_img.height + 5],
        outline=edge,
        width=w,
    )
    canvas.paste(box_img, (x, y))


def main() -> int:
    mural = Image.open(SRC).convert("RGB")
    w, h = mural.size
    ground = mean_color(mural)
    silk = tuple(min(255, int(c * 0.70)) for c in ground)
    edge = tuple(min(255, int(c * 1.55)) for c in ground)

    canvas = Image.new("RGB", (OUT_W, OUT_H), silk)
    inner_w = int(OUT_W * (1 - MARGIN * 2))
    x0 = (OUT_W - inner_w) // 2

    # ── 上段：整幅横卷通栏（完整叙事，让观众一眼看到全卷）
    strip_src = mural.crop((int(w * SAFE_L), 0, int(w * SAFE_R), h))
    strip_h = int(inner_w / (strip_src.width / strip_src.height))
    strip = strip_src.resize((inner_w, strip_h), Image.LANCZOS)
    y_top = int(OUT_H * 0.085)
    framed(canvas, strip, x0, y_top, edge, 3)

    # ── 中段：立轴式画心，聚焦九色鹿救溺一段（避开左端黑边）
    heart_src = mural.crop((int(w * 0.045), 0, int(w * 0.30), h))
    heart_w = int(inner_w * 0.82)
    heart_h = int(heart_w / (heart_src.width / heart_src.height))
    heart = heart_src.resize((heart_w, heart_h), Image.LANCZOS)
    hx = (OUT_W - heart_w) // 2
    hy = y_top + strip_h + int(OUT_H * 0.055)
    framed(canvas, heart, hx, hy, edge, 4)

    # ── 下段：卷末留白处的卷名，模拟题签
    d = ImageDraw.Draw(canvas)
    seal_y = hy + heart_h + int(OUT_H * 0.045)
    seal_w, seal_h = 74, 74
    sx = (OUT_W - seal_w) // 2
    d.rectangle([sx, seal_y, sx + seal_w, seal_y + seal_h],
                fill=(150, 44, 34), outline=edge, width=2)

    canvas.save(os.path.join(HERE, "_hanging_vertical_preview.png"), "PNG")
    print(f"vertical preview {canvas.size}")
    print(f"  band top   y={y_top} h={strip_h}")
    print(f"  heart      y={hy} h={heart_h} w={heart_w}")
    print(f"  seal       y={seal_y}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
