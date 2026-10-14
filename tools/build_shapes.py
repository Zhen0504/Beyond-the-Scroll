"""从壁画中裁出「形体蒙版」。

思路：每个目标形体给出一个**种子点**（形体内部的壁画 uv）与一个**限定框**。
在限定框内做种子泛洪 —— 只纳入与种子色接近、且与该种子连通的像素，
于是得到的是**这个形体的真实轮廓**（而不是矩形框）。

输出：
  public/paintings/fuwang-bensheng/masks.png   蒙版图集（2048 × SLOT_H）
  src/scenes/world/fuwang/shapes.js            形体定义（含图集槽位与包围盒）

蒙版只是「这一处该上色」的提示范围，属艺术转译，不代表原壁画的绘制工序。
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

# 脚本位于 <项目>/tools/，故项目根为 parents[1]
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "paintings" / "fuwang-bensheng" / "panorama.jpg"
OUT_PNG = ROOT / "public" / "paintings" / "fuwang-bensheng" / "masks.png"
OUT_JS = ROOT / "src" / "scenes" / "world" / "fuwang" / "shapes.js"

SLOTS = 20         # 形体数上限
SLOT_COLS = 5      # 图集列数
SLOT_ROWS = 4      # 图集行数（5×4 = 20）
SLOT_W = 512       # 每个槽位在图集中占的宽度
SLOT_H = 256       # 槽位高
SLOT_DATA_W = 496  # 槽位里真正放蒙版的宽度（两侧各留 8px 黑边）
SLOT_DATA_H = 240  # 真正放蒙版的高度
SLOT_PAD_X = 8
SLOT_PAD_Y = 8
ATLAS_W = SLOT_W * SLOT_COLS
ATLAS_H = SLOT_H * SLOT_ROWS

# 折的 u 区间 —— 须与 src/scenes/world/fuwang/layout.js 的 FOLDS 一致。
# 形体的包围盒会夹到这个范围内：越出本折的部分在本折机位下看不到、也点不着。
FOLD_RANGE = {
    "jiuni": (0.000, 0.210),
    "beishi": (0.210, 0.340),
    "xuangshang": (0.340, 0.660),
    "weilie": (0.660, 0.840),
    "chenqing": (0.840, 1.000),
}

# 形体定义：折 id, 形体 id, 颜料, 说明, 种子/框, 容差, 模式
#
# 模式：
#   "grow" —— 从种子泛洪，取与种子色接近且连通的一块（用于有清晰边界的**形体**：
#             鹿、马、水波、飘带、华盖…）
#   "hue"  —— 在框内取符合该颜料色相的像素（用于**大面积色域**：地色、殿壁。
#             这类地方颜色连成一片，泛洪会漫溢）
#
# 种子由 _grid_<fold>.png（带 u/v 网格的壁画切片）逐个读出。
SHAPES = [
    # ---- 折一 救溺（0.000–0.210）----
    dict(fold="jiuni", id="jiuni-water", p="shilv", what="水波",
         box=(0.108, 0.00, 0.210, 0.42), mode="rect"),
    dict(fold="jiuni", id="jiuni-drowner", p="zhusha", what="溺水人",
         seed=(0.099, 0.37), box=(0.072, 0.20, 0.130, 0.62), tol=64),
    dict(fold="jiuni", id="jiuni-peaks", p="shiqing", what="峰峦",
         seed=(0.096, 0.62), box=(0.078, 0.46, 0.150, 0.86), tol=52),
    dict(fold="jiuni", id="jiuni-white-deer", p="shilv", what="白鹿",
         seed=(0.190, 0.50), box=(0.176, 0.26, 0.210, 0.84), tol=56),
    dict(fold="jiuni", id="jiuni-earth", p="tuhong", what="地色",
         box=(0.108, 0.42, 0.210, 1.00), mode="rect"),

    # ---- 折二 背誓（0.210–0.340）----
    dict(fold="beishi", id="beishi-kneeler", p="zhusha", what="跪者",
         seed=(0.217, 0.44), box=(0.210, 0.18, 0.252, 0.66), tol=78),
    dict(fold="beishi", id="beishi-rock", p="shiqing", what="山岩",
         seed=(0.252, 0.72), box=(0.228, 0.54, 0.286, 0.92), tol=80),
    dict(fold="beishi", id="beishi-peaks", p="shilv", what="山峦",
         seed=(0.314, 0.20), box=(0.290, 0.04, 0.340, 0.44), tol=78),
    dict(fold="beishi", id="beishi-earth", p="tuhong", what="地色",
         box=(0.210, 0.30, 0.340, 1.00), mode="rect"),

    # ---- 折三 悬赏（0.340–0.660）----
    dict(fold="xuangshang", id="xu-spotted-deer", p="shilv", what="斑纹九色鹿",
         seed=(0.356, 0.48), box=(0.340, 0.20, 0.396, 0.84), tol=64),
    dict(fold="xuangshang", id="xu-streamer", p="shiqing", what="石青飘带",
         seed=(0.470, 0.62), box=(0.400, 0.24, 0.540, 1.00), tol=54),
    dict(fold="xuangshang", id="xu-peaks", p="shilv", what="山峦",
         seed=(0.480, 0.28), box=(0.400, 0.00, 0.560, 0.44), tol=64),
    dict(fold="xuangshang", id="xu-earth", p="tuhong", what="地色",
         box=(0.540, 0.34, 0.660, 1.00), mode="rect"),

    # ---- 折四 围猎（0.660–0.840）----
    dict(fold="weilie", id="wei-horse", p="shilv", what="白马",
         seed=(0.668, 0.50), box=(0.660, 0.24, 0.706, 0.84), tol=50),
    dict(fold="weilie", id="wei-peaks", p="shiqing", what="山峦",
         seed=(0.700, 0.10), box=(0.660, 0.00, 0.800, 0.30), tol=54),
    dict(fold="weilie", id="wei-earth", p="tuhong", what="地色",
         box=(0.706, 0.28, 0.840, 0.92), mode="rect"),

    # ---- 折五 陈情（0.840–1.000）----
    dict(fold="chenqing", id="chen-roof", p="shiqing", what="殿堂瓦顶",
         seed=(0.880, 0.86), box=(0.856, 0.66, 0.952, 1.00), tol=56),
    dict(fold="chenqing", id="chen-king", p="shiqing", what="国王",
         seed=(0.874, 0.30), box=(0.850, 0.16, 0.886, 0.58), tol=70),
    dict(fold="chenqing", id="chen-robe", p="shilv", what="王后衣饰",
         seed=(0.893, 0.32), box=(0.876, 0.12, 0.912, 0.58), tol=54),
    dict(fold="chenqing", id="chen-wall", p="tuhong", what="殿壁",
         box=(0.952, 0.14, 1.000, 0.96), mode="rect"),
]


def box_px(a: np.ndarray, box_uv):
    H, W, _ = a.shape
    x0, x1 = int(box_uv[0] * W), int(box_uv[2] * W)
    y0, y1 = int((1 - box_uv[3]) * H), int((1 - box_uv[1]) * H)
    return max(0, x0), max(0, y0), min(W, x1), min(H, y1)


def grow(a: np.ndarray, seed_uv, box_uv, tol: float):
    """在 box 内从种子泛洪，返回布尔蒙版（整图尺寸）"""
    H, W, _ = a.shape
    x0, y0, x1, y1 = box_px(a, box_uv)
    if x1 <= x0 or y1 <= y0:
        return None, None

    sx, sy = int(seed_uv[0] * W), int((1 - seed_uv[1]) * H)
    if not (x0 <= sx < x1 and y0 <= sy < y1):
        return None, None

    sub = a[y0:y1, x0:x1]
    seed_rgb = a[sy, sx]
    close = np.sqrt(((sub - seed_rgb) ** 2).sum(axis=2)) < tol
    lab, _ = ndimage.label(close)
    sid = lab[sy - y0, sx - x0]
    if sid == 0:
        return None, seed_rgb
    full = np.zeros((H, W), dtype=bool)
    full[y0:y1, x0:x1] = lab == sid
    return full, seed_rgb


# 各颜料在壁画上的色相区间（HSV 的 H，0–360）
HUE_RANGE = {
    "shilv": (110, 200),    # 石绿：绿到青绿
    "shiqing": (180, 250),  # 石青：青到蓝
    "zhusha": (5, 25),      # 朱砂：正红偏橙
    "tuhong": (5, 30),      # 土红：红棕
}


def hue_mask(a: np.ndarray, box_uv, pigment: str, sat_min=0.18, val_min=0.16):
    """在框内取符合该颜料色相的像素 —— 用于大面积色域。

    泛洪对大色域会漫溢（地色与殿壁连成一片），故改用色相筛选：
    得到的是该色域的真实形状，而不是一个矩形。
    """
    H, W, _ = a.shape
    x0, y0, x1, y1 = box_px(a, box_uv)
    if x1 <= x0 or y1 <= y0:
        return None
    sub = a[y0:y1, x0:x1] / 255.0
    mx = sub.max(axis=2)
    mn = sub.min(axis=2)
    d = np.maximum(mx - mn, 1e-6)
    r, g, b = sub[:, :, 0], sub[:, :, 1], sub[:, :, 2]

    hue = np.zeros_like(mx)
    m = mx == r
    hue[m] = (60 * ((g - b) / d) % 360)[m]
    m = mx == g
    hue[m] = (60 * ((b - r) / d) + 120)[m]
    m = mx == b
    hue[m] = (60 * ((r - g) / d) + 240)[m]

    sat = d / np.maximum(mx, 1e-6)
    lo, hi = HUE_RANGE[pigment]
    ok = (hue >= lo) & (hue <= hi) & (sat >= sat_min) & (mx >= val_min)

    full = np.zeros((H, W), dtype=bool)
    full[y0:y1, x0:x1] = ok
    return full


def smooth(mask: np.ndarray, it: int = 2) -> np.ndarray:
    """闭运算补小洞 + 开运算去毛刺，再高斯平滑一次边界。

    泛洪取出的边界天然带着壁画上的凹凸与噪点；直接当轮廓用会显得毛糙。
    这里做一次轻度的形态学清理与高斯平滑，轮廓就顺了。
    """
    m = ndimage.binary_closing(mask, structure=np.ones((5, 5)), iterations=it)
    m = ndimage.binary_opening(m, structure=np.ones((3, 3)), iterations=1)
    # 高斯平滑后重新二值化 —— 边界更顺，但不改变整体形状
    soft = ndimage.gaussian_filter(m.astype(np.float32), sigma=2.2)
    return soft > 0.5


def main() -> int:
    im = Image.open(SRC).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    H, W, _ = a.shape
    print(f"壁画 {W}×{H}")

    atlas = np.zeros((ATLAS_H, ATLAS_W), dtype=np.uint8)
    out = []
    preview = im.copy()
    pd = ImageDraw.Draw(preview)

    for i, s in enumerate(SHAPES):
        if i >= SLOTS:
            print(f"！槽位不够，跳过 {s['id']}")
            break
        mode = s.get("mode", "grow")
        if mode == "rect":
            # 平涂色域（地色、殿壁）：直接用限定框，不揉进形体轮廓
            H, W, _ = a.shape
            m = np.zeros((H, W), dtype=bool)
            x0, y0, x1, y1 = box_px(a, s["box"])
            m[y0:y1, x0:x1] = True
            seed_rgb = None
        elif mode == "hue":
            m = hue_mask(a, s["box"], s["p"], sat_min=s.get("sat_min", 0.24))
            seed_rgb = None
        else:
            m, seed_rgb = grow(a, s["seed"], s["box"], s["tol"])
        if m is None:
            print(f"✗ {s['id']:20s} 取形失败（种子落在限定框外或色差过大）")
            continue
        m = smooth(m, it=2 if mode == "grow" else 3)
        ys, xs = np.nonzero(m)
        if len(xs) < 150:
            print(f"✗ {s['id']:20s} 面积过小 {len(xs)}px")
            continue

        v0 = 1 - (ys.max() + 1) / H
        v1 = 1 - ys.min() / H
        u0, u1 = xs.min() / W, (xs.max() + 1) / W

        # 夹到本折区间：越出本折的部分在本折机位下看不到、也点不着。
        # 只夹包围盒（点击判定），蒙版本身保持完整。
        lo, hi = FOLD_RANGE[s["fold"]]
        u0, u1 = max(u0, lo), min(u1, hi)
        if u1 - u0 < 0.004:
            print(f"✗ {s['id']:20s} 夹到本折后过窄（{u1 - u0:.4f}）")
            continue

        # 贴到图集槽位：把该形体的包围盒重采样后放进槽位中央，
        # 四周留黑 —— 相邻槽位之间就不会因为双线性插值而串色
        x0, x1 = int(u0 * W), int(np.ceil(u1 * W))
        y0, y1 = int((1 - v1) * H), int(np.ceil((1 - v0) * H))
        crop = m[y0:y1, x0:x1]
        slot_img = Image.fromarray((crop * 255).astype(np.uint8))
        slot_img = slot_img.resize((SLOT_DATA_W, SLOT_DATA_H), Image.BILINEAR)
        sl = np.asarray(slot_img)
        col = i % SLOT_COLS
        row = i // SLOT_COLS
        ox = col * SLOT_W + SLOT_PAD_X
        oy = row * SLOT_H + SLOT_PAD_Y
        atlas[oy:oy + SLOT_DATA_H, ox:ox + SLOT_DATA_W] = sl

        out.append(dict(
            id=s["id"], fold=s["fold"], p=s["p"], what=s["what"],
            slot=i, u0=round(u0, 5), v0=round(v0, 5), u1=round(u1, 5), v1=round(v1, 5),
            mode=mode, px=int(m.sum()),
        ))
        pd.rectangle([x0, y0, x1, y1], outline=(255, 0, 255), width=3)
        pd.text((x0 + 4, y0 + 4), s["id"], fill=(255, 255, 0))
        print(f"✓ {s['id']:20s} {s['what']:10s} slot{i:2d} {mode:4s} "
              f"u[{u0:.3f},{u1:.3f}] v[{v0:.3f},{v1:.3f}] {m.sum():6d}px")

    Image.fromarray(atlas).save(OUT_PNG)
    print(f"\n图集 -> {OUT_PNG}  {atlas.shape[1]}×{atlas.shape[0]}  {len(out)} 个形体")
    preview.save(ROOT / "tools" / "_shape_preview.png")

    # 每折的颜色数：少于 3 种会让「选色—找位置」失去层次
    by_fold: dict[str, set] = {}
    for s in out:
        by_fold.setdefault(s["fold"], set()).add(s["p"])
    bad = 0
    for fold_id, (lo, hi) in FOLD_RANGE.items():
        kinds = by_fold.get(fold_id, set())
        n = sum(1 for s in out if s["fold"] == fold_id)
        mark = "✓" if len(kinds) >= 3 else "✗"
        if len(kinds) < 3:
            bad += 1
        print(f"  {mark} {fold_id:12s} 形体 {n}  颜色 {len(kinds)}  {'/'.join(sorted(kinds))}")
    if bad:
        print(f"\n！有 {bad} 折的颜色少于 3 种，请调整形体定义")

    write_js(out)
    print(f"定义 -> {OUT_JS}")
    return 0 if not bad else 1


def write_js(shapes: list[dict]) -> None:
    lines = [
        "/**",
        " * 壁画上的「形体」—— 每个形体是一件可辨认的画面内容（鹿、水波、殿顶…）。",
        " *",
        " * 由 tools/build_shapes.py 从壁画自动生成，请勿手改。",
        " * 蒙版（masks.png）里每个形体占一个槽位，槽位里的白色像素即该形体的轮廓；",
        " * 包围盒 uv 用于把槽位映射回壁画坐标。",
        " *",
        " * 这些形体是供「重彩」敷彩提示之用的艺术转译，",
        " * 不是对原壁画绘制工序的复原，也不代表敦煌研究院的划分。",
        " */",
        "",
        f"export const MASK_SLOTS = {SLOTS};",
        f"export const MASK_COLS = {SLOT_COLS};",
        f"export const MASK_ROWS = {SLOT_ROWS};",
        f"export const MASK_SLOT_W = {SLOT_W};",
        f"export const MASK_SLOT_H = {SLOT_H};",
        f"export const MASK_DATA_W = {SLOT_DATA_W};",
        f"export const MASK_DATA_H = {SLOT_DATA_H};",
        "",
        "/** 形体表 */",
        "export const SHAPES = [",
    ]
    for s in shapes:
        lines.append(
            "  { "
            f"id: '{s['id']}', fold: '{s['fold']}', p: '{s['p']}', what: '{s['what']}', "
            f"slot: {s['slot']}, mode: '{s.get('mode', 'grow')}', "
            f"box: [{s['u0']}, {s['v0']}, {s['u1']}, {s['v1']}] "
            "},"
        )
    lines += [
        "];",
        "",
        "/** 按折分组 */",
        "export const SHAPES_BY_FOLD = SHAPES.reduce((m, s) => {",
        "  (m[s.fold] ??= []).push(s);",
        "  return m;",
        "}, {});",
        "",
        "/** 取某折中属于指定颜料的形体 */",
        "export function shapesFor(foldId, pigmentId) {",
        "  return (SHAPES_BY_FOLD[foldId] ?? []).filter((s) => s.p === pigmentId);",
        "}",
        "",
        "/** 取某折的全部形体 */",
        "export function foldShapes(foldId) {",
        "  return SHAPES_BY_FOLD[foldId] ?? [];",
        "}",
        "",
        "/** 点 (u,v) 落在哪个形体内（用包围盒快速判定，精确判定由 GPU 蒙版完成） */",
        "export function shapeAt(foldId, u, v) {",
        "  return foldShapes(foldId).find(",
        "    (s) => u >= s.box[0] && u <= s.box[2] && v >= s.box[1] && v <= s.box[3],",
        "  ) ?? null;",
        "}",
        "",
    ]
    OUT_JS.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
