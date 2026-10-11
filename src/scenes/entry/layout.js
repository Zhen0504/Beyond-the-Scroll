import { GEOMETRY } from './components/HangingScroll/geometry.js';

const NARROW = 960;

/** 卷起状态下卷轴的纸宽（px），随视口变化 */
export function closedScrollWidth() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (W < 720) return Math.round(Math.max(76, Math.min(W * 0.25, H * 0.2)));
  return Math.round(Math.min(Math.max(W * 0.135, 140), H * 0.29, 250));
}

/** 竖向总高（以纸宽为单位）= 纸高 + 天杆半厚 + 轴头半径 */
const extentOf = (phRatio) => phRatio + GEOMETRY.rod / 2 + GEOMETRY.knobDiameter / 2;

/** 地杆比天杆粗，上下不对称；返回让视觉居中所需的上移量 */
const centerOffset = (w) => ((GEOMETRY.knobDiameter - GEOMETRY.rod) / 4) * w;

/**
 * 展开状态下卷轴的尺寸与位置（视口坐标）
 *   center：展开过程中居中的位置
 *   side：  展开完成后为介绍文字让位的位置（宽屏移到左侧；窄屏缩小到上半屏）
 */
export function openScrollLayout(phRatio) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const extent = extentOf(phRatio);
  const wide = W >= NARROW;

  const w = Math.min((H * 0.88) / extent, wide ? W * 0.34 : W * 0.8);
  const center = { x: W / 2, y: H / 2 - centerOffset(w), w };

  if (wide) return { center, side: { x: W * 0.31, y: center.y, w } };

  // 窄屏：介绍面板占下方约 44%，卷轴缩放到上方区域
  const area = H * 0.54;
  const sw = Math.min(w, (area * 0.9) / extent);
  return { center, side: { x: W / 2, y: area / 2 + H * 0.01 - centerOffset(sw), w: sw } };
}
