import { CanvasTexture, SRGBColorSpace } from 'three';
import { mulberry32 } from '../../../utils/math.js';

/**
 * 夜宴人物「皮影」画稿：用 Canvas 画成半透明的皮影纸片，再交给 engine/Billboards 做成
 * 始终朝向镜头的立体纸片。与画卷一的树稿同一套图集约定：
 *   图集 6 × 3 格，每格 384 × 768，人物立足点位于格底中央。
 * 画稿统一在 560 × 1120 的画布上作画（立足点 (280, 1090)），量出墨迹范围后等比缩放入格。
 *
 * 皮影做法：先铺色块（矿物色，半透明），再勾墨线；衣上以「镂空」透出绢底，
 * 使纸片在暖烛下像真正的皮影一样透光。
 */
export const COLS = 6;
export const ROWS = 4;
export const CELL_W = 384;
export const CELL_H = 768;

/** 角色 → 图集格 */
export const PUPPET_CELLS = {
  hanzai_listen: 0,
  hanzai_drum: 1,
  hanzai_recline: 2,
  hanzai_send: 3,
  pipa: 4,
  dancer: 5,
  flute: 6,
  paixiao: 7,
  bili: 8,
  drummer: 9,
  guest_clasp: 10,
  guest_clap: 11,
  maid_candle: 12,
  maid_tray: 13,
  maid_basin: 14,
  maid_fan: 15,
  guest_stand: 16,
  boy: 17,
  monk: 18,
};

/* ---------------- 调色：矿物色 + 墨线 ---------------- */
const INK = 'rgba(32,25,20,0.92)';
const SOFT = 'rgba(60,48,38,0.55)';
const SKIN = '#e7cba3';

const ROBES = {
  hanzai: { robe: '#3f3a4e', trim: '#6d2f2a', sash: '#8d5a2b', inner: '#c9b183' },
  guestA: { robe: '#40596b', trim: '#2c3a44', sash: '#9a6a34', inner: '#d8cdb4' },
  guestB: { robe: '#6d4a3a', trim: '#3a2c24', sash: '#8d5a2b', inner: '#d8cdb4' },
  guestC: { robe: '#5c6b4a', trim: '#333d2c', sash: '#9a6a34', inner: '#d8cdb4' },
  musician: { robe: '#b9c3c0', trim: '#3c4a52', sash: '#a8452f', inner: '#e4dcc6' },
  musicianB: { robe: '#8fa6ad', trim: '#33454c', sash: '#a8452f', inner: '#e4dcc6' },
  maid: { robe: '#cdc6b4', trim: '#5a4a3c', sash: '#8d5a2b', inner: '#e8e0cc' },
  boy: { robe: '#a9b0a0', trim: '#41493c', sash: '#7d5a36', inner: '#dfd8c2' },
  monk: { robe: '#c08050', trim: '#7a3a2a', sash: '#6e3b2a', inner: '#e0cba4' },
};

const HAIR = '#241f1d';
const FAN_PAPER = '#e9e0c8';

/* ---------------- 基本笔法 ---------------- */

/** 勾一条两端粗细不同的带墨线笔触（肢体、衣袖、绦带） */
function taper(g, pts, w0, w1, color, inkW = 2.2) {
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
    let dx = q[0] - o[0], dy = q[1] - o[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2;
    left.push([p[0] - dy * w, p[1] + dx * w]);
    right.push([p[0] + dy * w, p[1] - dx * w]);
  }
  const path = () => {
    g.beginPath();
    g.moveTo(left[0][0], left[0][1]);
    for (const p of left) g.lineTo(p[0], p[1]);
    for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
    g.closePath();
  };
  path();
  if (inkW) { g.strokeStyle = INK; g.lineWidth = inkW; g.lineJoin = 'round'; g.stroke(); }
  g.fillStyle = color;
  path();
  g.fill();
}

/** 由起点、角度、长度生成微弯的点列 */
function curve(x, y, angle, len, bend, n = 8) {
  const pts = [[x, y]];
  let a = angle;
  for (let i = 1; i <= n; i++) {
    a += bend;
    x += Math.cos(a) * (len / n);
    y += Math.sin(a) * (len / n);
    pts.push([x, y]);
  }
  return pts;
}

/** 画一个带墨线的形状 */
function shape(g, build, fill, lw = 2.6, ink = INK) {
  g.beginPath();
  build(g);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) { g.strokeStyle = ink; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); }
}

/** 衣上镂空：团花、回纹、云头 —— 透出后面的绢底，是皮影的透光处 */
function cutPattern(g, rand, cx, cy, w, h, kind = 'rosette') {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = 'rgba(0,0,0,1)';
  if (kind === 'rosette') {
    const n = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * w * 0.34, cy + Math.sin(a) * h * 0.34, w * 0.13, h * 0.1, a, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.arc(cx, cy, Math.min(w, h) * 0.11, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'cloud') {
    for (let i = 0; i < 3; i++) {
      const y = cy + (i - 1) * h * 0.28;
      g.beginPath();
      g.arc(cx, y, w * 0.12, 0, Math.PI * 2);
      g.arc(cx + w * 0.2, y + h * 0.04, w * 0.09, 0, Math.PI * 2);
      g.arc(cx - w * 0.2, y - h * 0.04, w * 0.09, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    // 回纹：沿衣缘的小方孔
    for (let i = -2; i <= 2; i++) {
      g.fillRect(cx + i * w * 0.19, cy - h * 0.03, w * 0.08, h * 0.06);
    }
  }
  g.restore();
}

/* ---------------- 头面 ---------------- */

/** 头：卵形脸 + 墨线，发式为髻（女）或冠（男），可加须 */
function head(g, { x, y, r, hat = 'none', beard = null, a = 0, skin = SKIN, hair = HAIR }) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  // 颈
  taper(g, [[0, r * 1.1], [0, r * 1.5]], r * 0.42, r * 0.5, skin, 1.8);
  // 脸
  shape(g, (c) => {
    c.moveTo(0, -r * 1.02);
    c.bezierCurveTo(r * 0.98, -r * 0.85, r * 0.86, r * 0.72, 0, r * 1.06);
    c.bezierCurveTo(-r * 0.86, r * 0.72, -r * 0.98, -r * 0.85, 0, -r * 1.02);
  }, skin, 2.4);
  // 耳
  for (const s of [-1, 1]) {
    shape(g, (c) => c.ellipse(s * r * 0.88, r * 0.05, r * 0.14, r * 0.24, 0, 0, Math.PI * 2), skin, 1.6, SOFT);
  }
  // 发 / 冠
  if (hat === 'buns') {
    shape(g, (c) => {
      c.moveTo(-r * 0.98, -r * 0.42);
      c.bezierCurveTo(-r * 0.9, -r * 1.5, r * 0.9, -r * 1.5, r * 0.98, -r * 0.42);
      c.bezierCurveTo(r * 0.5, -r * 1.05, -r * 0.5, -r * 1.05, -r * 0.98, -r * 0.42);
    }, hair, 2);
    for (const s of [-1, 1]) {
      shape(g, (c) => c.ellipse(s * r * 0.68, -r * 0.95, r * 0.36, r * 0.32, 0, 0, Math.PI * 2), hair, 2);
    }
  } else if (hat === 'tall') {
    // 韩熙载的纱帽：高而方，后垂
    shape(g, (c) => c.ellipse(0, -r * 0.62, r * 1.02, r * 0.6, 0, 0, Math.PI * 2), hair, 2);
    shape(g, (c) => {
      c.moveTo(-r * 0.78, -r * 1.0);
      c.lineTo(-r * 0.62, -r * 2.15);
      c.lineTo(r * 0.62, -r * 2.15);
      c.lineTo(r * 0.78, -r * 1.0);
      c.closePath();
    }, '#2b2733', 2.4);
    shape(g, (c) => c.ellipse(0, -r * 2.12, r * 0.72, r * 0.2, 0, 0, Math.PI * 2), '#2b2733', 2);
  } else if (hat === 'futou') {
    shape(g, (c) => c.ellipse(0, -r * 0.82, r * 1.0, r * 0.52, 0, 0, Math.PI * 2), '#2a2521', 2.2);
    shape(g, (c) => {
      c.moveTo(-r * 0.9, -r * 0.95);
      c.lineTo(r * 0.9, -r * 0.95);
      c.lineTo(r * 0.82, -r * 1.35);
      c.lineTo(-r * 0.82, -r * 1.35);
      c.closePath();
    }, '#2a2521', 2.2);
    // 展脚
    for (const s of [-1, 1]) {
      shape(g, (c) => c.ellipse(s * r * 1.5, -r * 1.12, r * 0.75, r * 0.12, 0, 0, Math.PI * 2), '#2a2521', 1.6);
    }
  } else if (hat === 'wrap') {
    shape(g, (c) => {
      c.moveTo(-r * 0.98, -r * 0.35);
      c.bezierCurveTo(-r * 1.05, -r * 1.5, r * 1.05, -r * 1.5, r * 0.98, -r * 0.35);
      c.bezierCurveTo(r * 0.4, -r * 0.95, -r * 0.4, -r * 0.95, -r * 0.98, -r * 0.35);
    }, '#3b4038', 2);
  }
  // 眉眼：细长上挑
  g.strokeStyle = '#241d18';
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(s * r * 0.16, -r * 0.24);
    g.quadraticCurveTo(s * r * 0.42, -r * 0.42, s * r * 0.72, -r * 0.22);
    g.stroke();
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(s * r * 0.2, -r * 0.02);
    g.quadraticCurveTo(s * r * 0.45, r * 0.02, s * r * 0.66, -r * 0.06);
    g.stroke();
  }
  // 鼻、口
  g.strokeStyle = SOFT;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(-r * 0.05, -r * 0.02);
  g.lineTo(-r * 0.1, r * 0.36);
  g.stroke();
  g.fillStyle = '#a8452f';
  g.beginPath();
  g.ellipse(0, r * 0.58, r * 0.2, r * 0.1, 0, 0, Math.PI * 2);
  g.fill();
  // 须
  if (beard) {
    g.strokeStyle = 'rgba(28,22,18,0.9)';
    g.lineWidth = 1.6;
    const n = beard === 'long' ? 15 : 9;
    const len = beard === 'long' ? r * 1.5 : r * 0.6;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) - 0.5;
      g.beginPath();
      g.moveTo(t * r * 0.5, r * 0.72);
      g.quadraticCurveTo(t * r * 0.8, r * 0.72 + len * 0.6, t * r * 0.6, r * 0.72 + len);
      g.stroke();
    }
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * r * 0.1, r * 0.4);
      g.quadraticCurveTo(s * r * 0.5, r * 0.5, s * r * 0.62, r * 0.78);
      g.stroke();
    }
  }
  g.restore();
}

/* ---------------- 躯干与衣袖 ---------------- */

/** 立姿/坐姿袍身。sit 为盘坐（膝外张），否则为立姿长袍 */
function body(g, rand, { cx, base, shoulder, robe, trim, sit = false, belly = false }) {
  const half = sit ? 118 : 86;
  shape(g, (c) => {
    c.moveTo(cx - half * 1.06, base);
    c.bezierCurveTo(cx - half * 0.92, base - (base - shoulder) * 0.42, cx - half * 0.68, shoulder + 14, cx - half * 0.5, shoulder);
    c.lineTo(cx + half * 0.5, shoulder);
    c.bezierCurveTo(cx + half * 0.68, shoulder + 14, cx + half * 0.92, base - (base - shoulder) * 0.42, cx + half * 1.06, base);
    c.closePath();
  }, robe, 3);
  if (sit) {
    // 盘腿：两膝外张，膝头各一团
    for (const s of [-1, 1]) {
      shape(g, (c) => c.ellipse(cx + s * half * 0.82, base - 26, 44, 30, s * 0.3, 0, Math.PI * 2), robe, 2.6);
    }
    shape(g, (c) => c.ellipse(cx, base - 12, half * 0.5, 24, 0, 0, Math.PI * 2), trim, 2);
  } else {
    // 立姿：袍下露出两足
    for (const s of [-1, 1]) {
      shape(g, (c) => c.ellipse(cx + s * 30, base + 4, 30, 13, 0, 0, Math.PI * 2), '#2e2a26', 2);
    }
  }
  // 交领右衽
  taper(g, [[cx - 30, shoulder + 6], [cx - 4, shoulder + 74], [cx + 24, shoulder + 132]], 20, 12, trim, 2);
  taper(g, [[cx + 30, shoulder + 6], [cx + 6, shoulder + 76], [cx - 18, shoulder + 126]], 17, 10, trim, 2);
  // 束带
  const wy = shoulder + (base - shoulder) * (sit ? 0.34 : 0.42);
  shape(g, (c) => c.rect(cx - half * 0.72, wy, half * 1.44, 26), trim, 2.2);
  // 垂绅
  taper(g, [[cx + 6, wy + 20], [cx + 10, wy + 96], [cx + 4, wy + 150]], 12, 7, trim, 1.8);
  // 袒腹：衣襟敞开，露出腹部（清吹段的韩熙载）
  if (belly) {
    shape(g, (c) => c.ellipse(cx + 6, shoulder + (base - shoulder) * 0.42, 46, 54, 0.05, 0, Math.PI * 2), SKIN, 2.4);
    for (const s of [-1, 1]) {
      taper(g, [[cx + s * 8, shoulder + 22], [cx + s * 46, shoulder + 70], [cx + s * 60, shoulder + 150]], 24, 16, robe, 2.4);
    }
  }
  cutPattern(g, rand, cx - half * 0.45, base - (base - shoulder) * 0.3, 70, 110, 'rosette');
  cutPattern(g, rand, cx + half * 0.45, base - (base - shoulder) * 0.34, 60, 96, 'cloud');
}

/** 广袖：自肩至手的喇叭袖 */
function sleeve(g, rand, from, to, color, trim, w = 30) {
  const [x0, y0] = from, [x1, y1] = to;
  const d = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / d, ny = (x1 - x0) / d;
  shape(g, (c) => {
    c.moveTo(x0 + nx * w * 0.5, y0 + ny * w * 0.5);
    c.quadraticCurveTo((x0 + x1) / 2 + nx * w * 1.15, (y0 + y1) / 2 + ny * w * 1.15, x1 + nx * w * 0.75, y1 + ny * w * 0.75);
    c.quadraticCurveTo(x1, y1 + w * 0.3, x1 - nx * w * 0.75, y1 - ny * w * 0.75);
    c.quadraticCurveTo((x0 + x1) / 2 - nx * w * 1.15, (y0 + y1) / 2 - ny * w * 1.15, x0 - nx * w * 0.5, y0 - ny * w * 0.5);
    c.closePath();
  }, color, 2.6);
  shape(g, (c) => c.ellipse(x1, y1, w * 0.42, w * 0.3, 0, 0, Math.PI * 2), trim, 1.8);
  // 手
  shape(g, (c) => c.ellipse(x1 + nx * 4, y1 + 8, 12, 9, 0, 0, Math.PI * 2), SKIN, 1.6);
  cutPattern(g, rand, (x0 + x1) / 2, (y0 + y1) / 2, 46, 70, 'cloud');
}

/** 披帛：自肩绕下的长带（乐伎、侍女） */
function stole(g, cx, shoulder, base, color, dir = 1) {
  taper(g, [
    [cx - dir * 46, shoulder + 4],
    [cx - dir * 96, shoulder + 120],
    [cx - dir * 84, base - 40],
    [cx - dir * 118, base + 6],
  ], 22, 14, color, 1.8);
  taper(g, [
    [cx + dir * 40, shoulder + 10],
    [cx + dir * 88, shoulder + 150],
    [cx + dir * 76, base - 60],
  ], 20, 12, color, 1.8);
}

/* ---------------- 手中之物 ---------------- */

function drawPipa(g, hx, hy, a = -0.5) {
  g.save();
  g.translate(hx, hy);
  g.rotate(a);
  shape(g, (c) => {
    c.ellipse(0, 58, 46, 54, 0, 0, Math.PI * 2);
    c.ellipse(0, -10, 32, 44, 0, 0, Math.PI * 2);
  }, '#8a5a34', 3);
  shape(g, (c) => c.ellipse(0, 44, 26, 30, 0, 0, Math.PI * 2), '#c9a76a', 2);
  taper(g, [[0, -48], [0, -132]], 9, 7, '#6d4426', 2);
  shape(g, (c) => c.ellipse(0, -140, 15, 11, 0, 0, Math.PI * 2), '#4a3320', 2);
  g.strokeStyle = 'rgba(240,232,210,0.85)';
  g.lineWidth = 1.2;
  for (let i = -1; i <= 2; i++) {
    g.beginPath();
    g.moveTo(i * 4 - 2, -120);
    g.lineTo(i * 6 - 3, 90);
    g.stroke();
  }
  g.restore();
}

function drawFlute(g, hx, hy, dir = 1, color = '#7d6a4a') {
  taper(g, [[hx - dir * 120, hy], [hx + dir * 30, hy - 6]], 7, 6, color, 1.8);
  shape(g, (c) => c.ellipse(hx - dir * 122, hy, 9, 8, 0, 0, Math.PI * 2), '#5b4a33', 1.6);
}

function drawPaixiao(g, hx, hy) {
  for (let i = 0; i < 8; i++) {
    const x = hx - 42 + i * 12;
    const h = 54 + Math.abs(i - 3.5) * 8;
    shape(g, (c) => c.rect(x, hy - h, 9, h), '#b39a63', 1.6);
  }
  shape(g, (c) => c.rect(hx - 48, hy - 16, 100, 12), '#6d5a3a', 1.8);
}

function drawBili(g, hx, hy, a = -0.35) {
  g.save();
  g.translate(hx, hy);
  g.rotate(a);
  shape(g, (c) => c.rect(-6, -96, 12, 92), '#5f4a30', 2.4);
  shape(g, (c) => {
    c.moveTo(-9, -4);
    c.lineTo(9, -4);
    c.lineTo(19, 42);
    c.lineTo(-19, 42);
    c.closePath();
  }, '#8a6a3c', 2.4);
  g.restore();
}

function drawFan(g, hx, hy, a = -0.7) {
  g.save();
  g.translate(hx, hy);
  g.rotate(a);
  taper(g, [[0, 0], [0, 54]], 7, 6, '#6d5a3a', 1.6);
  shape(g, (c) => c.ellipse(0, -34, 40, 40, 0, 0, Math.PI * 2), FAN_PAPER, 2.6);
  g.strokeStyle = 'rgba(90,70,50,0.7)';
  g.lineWidth = 1.4;
  for (let i = -1; i <= 1; i++) {
    g.beginPath();
    g.moveTo(i * 16, -70);
    g.lineTo(i * 10, 0);
    g.stroke();
  }
  g.restore();
}

function drawTray(g, cx, cy) {
  shape(g, (c) => c.ellipse(cx, cy, 62, 15, 0, 0, Math.PI * 2), '#a5895c', 2.4);
  shape(g, (c) => c.ellipse(cx, cy - 6, 48, 10, 0, 0, Math.PI * 2), '#c9b183', 1.8);
  for (const s of [-1, 1]) {
    shape(g, (c) => c.ellipse(cx + s * 20, cy - 16, 14, 11, 0, 0, Math.PI * 2), '#e2d8c0', 1.8);
  }
}

function drawBasin(g, cx, cy) {
  shape(g, (c) => c.ellipse(cx, cy, 58, 22, 0, 0, Math.PI * 2), '#9fb0ae', 2.6);
  shape(g, (c) => c.ellipse(cx, cy - 6, 44, 14, 0, 0, Math.PI * 2), '#cfd8d2', 1.8);
  g.strokeStyle = 'rgba(180,200,200,0.7)';
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(cx, cy - 8, 30, 9, 0, 0, Math.PI * 2);
  g.stroke();
}

/** 烛：细杆 + 焰（焰用叠加发光） */
function drawCandle(g, hx, hy, scale = 1) {
  taper(g, [[hx, hy + 46 * scale], [hx, hy - 26 * scale]], 7 * scale, 6 * scale, '#8c6a3c', 1.6);
  shape(g, (c) => c.rect(hx - 8 * scale, hy - 26 * scale, 16 * scale, 40 * scale), '#e8d9b4', 1.6);
  g.save();
  g.globalCompositeOperation = 'lighter';
  const grd = g.createRadialGradient(hx, hy - 34 * scale, 2, hx, hy - 34 * scale, 46 * scale);
  grd.addColorStop(0, 'rgba(255,244,206,0.95)');
  grd.addColorStop(0.35, 'rgba(255,178,96,0.55)');
  grd.addColorStop(1, 'rgba(255,150,70,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(hx, hy - 34 * scale, 46 * scale, 0, Math.PI * 2);
  g.fill();
  g.restore();
  shape(g, (c) => {
    c.moveTo(hx, hy - 52 * scale);
    c.quadraticCurveTo(hx + 9 * scale, hy - 34 * scale, hx, hy - 22 * scale);
    c.quadraticCurveTo(hx - 9 * scale, hy - 34 * scale, hx, hy - 52 * scale);
  }, 'rgba(255,214,140,0.95)', 1.2, 'rgba(255,180,110,0.6)');
}

function drawSticks(g, hx, hy, dir = 1) {
  for (const s of [-1, 1]) {
    taper(g, [[hx + s * 16 * dir, hy], [hx + s * 52 * dir, hy - 66]], 6, 4, '#8a6a3c', 1.4);
    shape(g, (c) => c.ellipse(hx + s * 56 * dir, hy - 72, 9, 8, 0, 0, Math.PI * 2), '#c9b183', 1.6);
  }
}

/* ---------------- 角色画法 ---------------- */

/**
 * 角色规格。pose：stand 立 | sit 坐（盘坐，底在座面）| dance 舞
 */
const SPECS = {
  hanzai_listen: { pose: 'sit', robe: 'hanzai', hat: 'tall', beard: 'long', hands: 'clasp' },
  hanzai_drum: { pose: 'sit', robe: 'hanzai', hat: 'tall', beard: 'long', hands: 'sticks' },
  hanzai_recline: { pose: 'sit', robe: 'hanzai', hat: 'tall', beard: 'long', hands: 'fan', belly: true },
  hanzai_send: { pose: 'stand', robe: 'hanzai', hat: 'tall', beard: 'long', hands: 'sticks' },
  pipa: { pose: 'sit', robe: 'musician', hat: 'buns', stole: true, hands: 'pipa' },
  dancer: { pose: 'dance', robe: 'musician', hat: 'buns', stole: true, hands: 'sleeves' },
  flute: { pose: 'sit', robe: 'musicianB', hat: 'buns', stole: true, hands: 'flute' },
  paixiao: { pose: 'sit', robe: 'musician', hat: 'buns', stole: true, hands: 'paixiao' },
  bili: { pose: 'sit', robe: 'musicianB', hat: 'buns', stole: true, hands: 'bili' },
  drummer: { pose: 'sit', robe: 'musician', hat: 'buns', stole: true, hands: 'drum' },
  guest_clasp: { pose: 'sit', robe: 'guestA', hat: 'futou', hands: 'clasp' },
  guest_clap: { pose: 'sit', robe: 'guestB', hat: 'futou', hands: 'clap' },
  maid_candle: { pose: 'stand', robe: 'maid', hat: 'buns', stole: true, hands: 'candle' },
  maid_tray: { pose: 'stand', robe: 'maid', hat: 'buns', stole: true, hands: 'tray' },
  maid_basin: { pose: 'stand', robe: 'maid', hat: 'buns', stole: true, hands: 'basin' },
  maid_fan: { pose: 'stand', robe: 'maid', hat: 'buns', stole: true, hands: 'fan' },
  guest_stand: { pose: 'stand', robe: 'guestC', hat: 'futou', beard: 'short', hands: 'clasp' },
  boy: { pose: 'stand', robe: 'boy', hat: 'wrap', hands: 'clasp' },
  monk: { pose: 'sit', robe: 'monk', hat: 'none', hands: 'clasp' },
};

/** 画一个皮影人物（画布坐标：立足点在 (280, 1090)） */
export function drawPuppet(g, rand, role) {
  const st = SPECS[role] ?? SPECS.guest_clasp;
  const pal = ROBES[st.robe] ?? ROBES.guestA;
  const cx = 280;
  const base = 1090; // 立足点（坐姿即座面）始终在画布同一水平线上
  const shoulder = base - (st.pose === 'stand' ? 620 : st.pose === 'dance' ? 600 : 300);
  const headR = st.pose === 'stand' ? 46 : st.pose === 'dance' ? 45 : 44;

  g.save();
  // 舞者：绕立足点微微侧身，水袖扬起
  if (st.pose === 'dance') {
    g.translate(cx, base);
    g.rotate(-0.06);
    g.translate(-cx, -base);
  }
  body(g, rand, { cx, base, shoulder, robe: pal.robe, trim: pal.trim, sit: st.pose !== 'stand' && st.pose !== 'dance', belly: st.belly });
  if (st.stole) stole(g, cx, shoulder, base, 'rgba(200,90,70,0.55)', rand() < 0.5 ? 1 : -1);

  const sy = shoulder + 18;
  const hands = st.hands;
  if (hands === 'clasp') {
    sleeve(g, rand, [cx - 62, sy], [cx - 8, shoulder + 190], pal.robe, pal.trim);
    sleeve(g, rand, [cx + 62, sy], [cx + 10, shoulder + 196], pal.robe, pal.trim);
  } else if (hands === 'clap') {
    sleeve(g, rand, [cx - 62, sy], [cx - 34, shoulder + 150], pal.robe, pal.trim);
    sleeve(g, rand, [cx + 62, sy], [cx + 34, shoulder + 150], pal.robe, pal.trim);
  } else if (hands === 'sticks') {
    sleeve(g, rand, [cx - 62, sy], [cx - 96, sy + 30], pal.robe, pal.trim);
    sleeve(g, rand, [cx + 62, sy], [cx + 96, sy + 30], pal.robe, pal.trim);
    drawSticks(g, cx, sy + 62, 1);
  } else if (hands === 'fan') {
    sleeve(g, rand, [cx - 62, sy], [cx - 40, shoulder + 170], pal.robe, pal.trim);
    sleeve(g, rand, [cx + 62, sy], [cx + 86, sy + 24], pal.robe, pal.trim);
    drawFan(g, cx + 96, sy + 34, -0.85);
  } else if (hands === 'pipa') {
    sleeve(g, rand, [cx - 62, sy], [cx - 70, shoulder + 150], pal.robe, pal.trim);
    sleeve(g, rand, [cx + 62, sy], [cx + 62, shoulder + 96], pal.robe, pal.trim);
    drawPipa(g, cx + 8, shoulder + 96, -0.42);
  } else if (hands === 'flute') {
    sleeve(g, rand, [cx - 62, sy], [cx - 30, shoulder + 116], pal.robe, pal.trim);
    sleeve(g, rand, [cx + 62, sy], [cx + 46, shoulder + 122], pal.robe, pal.trim);
    drawFlute(g, cx + 4, shoulder + 118, 1);
  } else if (hands === 'paixiao') {
    sleeve(g, rand, [cx - 62, sy], [cx - 40, shoulder + 108], pal.robe, pal.trim);
    sleeve(g, rand, [cx + 62, sy], [cx + 40, shoulder + 112], pal.robe, pal.trim);
    drawPaixiao(g, cx - 4, shoulder + 112);
  } else if (hands === 'bili') {
    sleeve(g, rand, [cx - 62, sy], [cx - 34, shoulder + 104], pal.robe, pal.trim);
    sleeve(g, rand, [cx + 62, sy], [cx + 30, shoulder + 108], pal.robe, pal.trim);
    drawBili(g, cx - 2, shoulder + 108, -0.28);
  } else if (hands === 'drum') {
    sleeve(g, rand, [cx - 62, sy], [cx - 92, shoulder + 60], pal.robe, pal.trim);
    sleeve(g, rand, [cx + 62, sy], [cx + 92, shoulder + 60], pal.robe, pal.trim);
    for (const s of [-1, 1]) taper(g, [[cx + s * 96, shoulder + 66], [cx + s * 130, shoulder + 150]], 7, 5, '#8a6a3c', 1.4);
  } else if (hands === 'sleeves') {
    // 舞：水袖上扬，袖口翻卷
    sleeve(g, rand, [cx - 62, sy], [cx - 150, sy - 96], pal.robe, pal.trim, 36);
    sleeve(g, rand, [cx + 62, sy], [cx + 150, sy - 74], pal.robe, pal.trim, 36);
    taper(g, [[cx - 150, sy - 96], [cx - 206, sy - 44], [cx - 178, sy + 30]], 26, 12, 'rgba(232,226,206,0.6)', 1.6);
    taper(g, [[cx + 150, sy - 74], [cx + 210, sy - 20], [cx + 186, sy + 52]], 26, 12, 'rgba(232,226,206,0.6)', 1.6);
  } else if (hands === 'tray') {
    sleeve(g, rand, [cx - 62, sy], [cx - 52, shoulder + 150], pal.robe, pal.trim);
    sleeve(g, rand, [cx + 62, sy], [cx + 52, shoulder + 150], pal.robe, pal.trim);
    drawTray(g, cx, shoulder + 150);
  } else if (hands === 'basin') {
    sleeve(g, rand, [cx - 62, sy], [cx - 54, shoulder + 140], pal.robe, pal.trim);
    sleeve(g, rand, [cx + 62, sy], [cx + 54, shoulder + 140], pal.robe, pal.trim);
    drawBasin(g, cx, shoulder + 142);
  } else if (hands === 'candle') {
    sleeve(g, rand, [cx - 62, sy], [cx - 34, shoulder + 150], pal.robe, pal.trim);
    sleeve(g, rand, [cx + 62, sy], [cx + 78, sy + 18], pal.robe, pal.trim);
    drawCandle(g, cx + 88, sy + 22, 1.05);
  }

  head(g, {
    x: cx,
    y: shoulder - headR * 0.42,
    r: headR,
    hat: st.hat,
    beard: st.beard,
    a: st.pose === 'dance' ? 0.1 : (rand() - 0.5) * 0.08,
  });
  g.restore();
}

/* ---------------- 图集 ---------------- */

/**
 * 生成皮影图集。返回 { texture, cells }：
 *   cells[i] = { u0, v0, u1, v1, aspect }，aspect 为墨迹的宽高比（供纸片按真实比例取宽）。
 */
export function createPuppetAtlas(seed = 7) {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * COLS;
  canvas.height = CELL_H * ROWS;
  const g = canvas.getContext('2d');
  const scratch = document.createElement('canvas');
  scratch.width = 560;
  scratch.height = 1120;
  const sg = scratch.getContext('2d', { willReadFrequently: true });
  const BASE_X = 280, BASE_Y = 1090;
  const baseOffset = 6;
  const cells = new Array(COLS * ROWS).fill(null);

  Object.entries(PUPPET_CELLS).forEach(([role, i]) => {
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.clearRect(0, 0, scratch.width, scratch.height);
    drawPuppet(sg, mulberry32(seed * 131 + i * 17), role);
    sg.setTransform(1, 0, 0, 1, 0, 0);

    const { data, width, height } = sg.getImageData(0, 0, scratch.width, scratch.height);
    let minX = width, maxX = 0, minY = height;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (data[(y * width + x) * 4 + 3] > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
        }
      }
    }
    if (minX > maxX || minY > height) return;
    const wInk = maxX - minX;
    const scale = Math.min((CELL_W - 16) / Math.max(wInk, 1), (CELL_H - baseOffset - 16) / Math.max(BASE_Y - minY, 1));
    const cx0 = (i % COLS) * CELL_W, cy0 = Math.floor(i / COLS) * CELL_H;
    const baseInCellY = CELL_H - baseOffset;
    // 墨迹中心对齐格心，立足线对齐格底
    g.save();
    g.beginPath();
    g.rect(cx0, cy0, CELL_W, CELL_H);
    g.clip();
    g.drawImage(
      scratch,
      cx0 + CELL_W / 2 - ((minX + maxX) / 2) * scale,
      cy0 + baseInCellY - BASE_Y * scale,
      scratch.width * scale,
      scratch.height * scale,
    );
    g.restore();

    const wPx = wInk * scale, hPx = (BASE_Y - minY) * scale;
    const pad = 2;
    // 纹理 v 轴自下而上（CanvasTexture 默认 flipY），故作 1 - y/H
    const V = (y) => 1 - y / canvas.height;
    cells[i] = {
      u0: (cx0 + CELL_W / 2 - wPx / 2 - pad) / canvas.width,
      u1: (cx0 + CELL_W / 2 + wPx / 2 + pad) / canvas.width,
      v0: V(cy0 + baseInCellY + pad), // 立足处（纸片下沿）
      v1: V(cy0 + baseInCellY - hPx - pad), // 头顶（纸片上沿）
      aspect: Math.max(0.18, wPx / Math.max(hPx, 1)),
    };
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, cells, baseOffset };
}
