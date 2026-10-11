import { clamp } from '../../../../utils/math.js';
import { GEOMETRY } from './geometry.js';

/**
 * 卷轴“骨架”：持有一份可被 GSAP 补间的状态，并按状态逐帧摆放各层 DOM。
 *
 * state
 *   w      纸宽（px）
 *   open   展开程度 0 → 1
 *   spin   展开前木轴的预旋转量
 *   ink    墨迹晕染进度 0 → 1
 *   paint  画面显色进度 0 → 1
 *   settle 展开到底时地杆的下坠回弹
 *
 * 坐标原点是卷轴根节点（卷起时卷体的中心），纸张固定居中，
 * 天杆向上、地杆向下移动，纸张用 clip-path 只露出两轴之间的部分 —— 即“从中心向两侧展开”。
 */
export function createScrollRig(nodes, phRatio) {
  const state = { w: 200, open: 0, spin: 0, ink: 0, paint: 0, settle: 0 };
  const metrics = { w: 0, PH: 0, yr: 0, yb: 0, d: 0 };

  function render() {
    const n = nodes;
    const { w, spin, settle } = state;
    const o = clamp(state.open);
    const g = GEOMETRY;

    const PH = w * phRatio;
    const rodH = w * g.rod;
    const kD = w * g.knobDiameter;
    const bundleD = w * g.bundle;
    // 纸张不断从卷体上放出，卷体随之变细
    const d = bundleD + (w * g.roller - bundleD) * Math.min(1, o * 1.08);

    // 天杆中心：卷起时搭在卷体上沿，展开后位于纸张顶端
    const yr = -(o * PH) / 2 - (1 - o) * bundleD * 0.42;
    // 地杆中心：卷起时在原点，展开后位于纸张底端（附带回弹）
    const yb = (o * PH) / 2 + settle * w * 0.018;

    n.root.style.setProperty('--w', `${w}px`);

    n.rod.style.transform = `translate3d(-50%, ${yr - rodH / 2}px, 0)`;
    n.roller.style.transform = `translate3d(-50%, ${yb - kD / 2}px, 0)`;
    n.core.style.height = `${d}px`;

    // 木轴滚动：卷体沿纸面滚下，表面纹理随位移移动；外加展开前的预旋转
    const spinPx = spin * w * 0.6 + yb;
    n.core.style.setProperty('--spin', `${spinPx}px`);
    n.roller.style.setProperty('--kspin', `${(spinPx * kD) / d}px`);

    const clipTop = Math.max(0, yr + PH / 2);
    const clipBottom = Math.max(0, PH / 2 - yb);
    n.paper.style.clipPath = `inset(${clipTop}px 0 ${clipBottom}px 0)`;

    // 纸张贴近木轴处的弯曲阴影
    const curlAlpha = Math.min(1, o * 6);
    const curlH = w * 0.07;
    n.curlTop.style.transform = `translate3d(-50%, ${yr + rodH * 0.3}px, 0)`;
    n.curlTop.style.opacity = curlAlpha;
    n.curlBottom.style.transform = `translate3d(-50%, ${yb - d / 2 - curlH + d * 0.12}px, 0)`;
    n.curlBottom.style.opacity = curlAlpha;

    // 投在“墙面”上的阴影，随展开拉长
    n.shadow.style.transform = `translate3d(calc(-50% + ${w * 0.03}px), ${yr + w * 0.04}px, 0)`;
    n.shadow.style.height = `${yb + d / 2 - yr}px`;
    n.shadow.style.opacity = 0.3 + 0.45 * o;

    n.aura.style.opacity = o;
    n.brocade.style.opacity = Math.max(0, 1 - o * 7);
    // 刚展开的纸带着卷压折痕，逐渐舒展
    n.crease.style.opacity = 0.9 - 0.62 * o;

    n.painting?.update(state.ink, state.paint);

    metrics.w = w;
    metrics.PH = PH;
    metrics.yr = yr;
    metrics.yb = yb;
    metrics.d = d;
  }

  return { state, metrics, render, phRatio, detached: false };
}
