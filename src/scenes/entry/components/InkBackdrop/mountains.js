import { mulberry32 } from '../../../../utils/math.js';

export const VIEW_W = 1600;
export const VIEW_H = 900;

/**
 * 远山层次：由远及近，越远越淡、越虚。depth 用于鼠标视差。
 */
export const MOUNTAIN_LAYERS = [
  { seed: 3, base: 520, amp: 150, peaks: 7, rough: 2, color: '#5b6d6f', alpha: 0.26, blur: 3, depth: 0.12 },
  { seed: 11, base: 610, amp: 170, peaks: 8, rough: 3, color: '#3e4e50', alpha: 0.46, blur: 1.4, depth: 0.28 },
  { seed: 23, base: 705, amp: 150, peaks: 9, rough: 3, color: '#283335', alpha: 0.74, blur: 0.5, depth: 0.5 },
  { seed: 41, base: 810, amp: 115, peaks: 10, rough: 4, color: '#141b1c', alpha: 0.96, blur: 0, depth: 0.8 },
];

/**
 * 生成一条山脊轮廓：几组低频正弦叠出起伏，再叠加若干高斯“峰”形成陡峭的中国山形。
 */
export function ridgePath({ seed, base, amp, peaks, rough }) {
  const rand = mulberry32(seed);
  const phases = [rand() * 6.28, rand() * 6.28, rand() * 6.28];
  const peakList = Array.from({ length: peaks }, () => ({
    x: -100 + rand() * (VIEW_W + 200),
    h: amp * (0.45 + rand() * 0.85),
    w: 50 + rand() * 150,
  }));

  const pts = [];
  for (let x = -140; x <= VIEW_W + 140; x += 6) {
    let y =
      Math.sin(x * 0.0021 + phases[0]) * amp * 0.32 +
      Math.sin(x * 0.0057 + phases[1]) * amp * 0.16 +
      Math.sin(x * 0.013 + phases[2]) * amp * 0.06;
    for (const p of peakList) {
      const dx = (x - p.x) / p.w;
      y += p.h * Math.exp(-dx * dx) * (1 + 0.12 * Math.sin(dx * 9));
    }
    y += (rand() - 0.5) * rough;
    pts.push(`${x},${(base - y).toFixed(1)}`);
  }
  return `M${pts.join('L')}L${VIEW_W + 140},${VIEW_H}L-140,${VIEW_H}Z`;
}
