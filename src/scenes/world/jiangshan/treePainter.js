import { CanvasTexture, SRGBColorSpace } from 'three';
import { mulberry32 } from '../../../utils/math.js';

/**
 * 树木“画稿”：用 Canvas 按原作笔意程序化绘制，再作为立体纸片放入场景。
 * 每个树种有多个变体（不同种子、姿态），图集 6 × 4 格，每格 384 × 768，树根位于格底中央。
 * 画稿统一在 512 × 1024 的坐标里作画（树根在 (256, 1012)），最后按墨迹范围等比缩放入格。
 */
export const COLS = 6;
export const ROWS = 4;
export const CELL_W = 384;
export const CELL_H = 768;

/** 树种 → 图集格（多个即多个变体） */
export const TREE_TYPES = {
  pineTall: [0, 1],
  pineBent: [2, 3],
  pineUmbrella: [4],
  cypress: [5],
  bare: [6, 7],
  autumnRed: [8, 18],
  autumnGold: [9, 19],
  maple: [10],
  green: [11],
  outlined: [12, 20],
  willow: [13, 21],
  bamboo: [14],
  reed: [15, 22],
  shrub: [16, 23],
  grass: [17],
};

const INK = 'rgba(38,30,22,0.95)';

/** 两端粗细不同的笔触 */
function stroke(g, pts, w0, w1, color) {
  if (pts.length < 2) return;
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[Math.min(i + 1, pts.length - 1)];
    const o = pts[Math.max(i - 1, 0)];
    let dx = q[0] - o[0], dy = q[1] - o[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2;
    left.push([p[0] - dy * w, p[1] + dx * w]);
    right.push([p[0] + dy * w, p[1] - dx * w]);
  }
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(left[0][0], left[0][1]);
  for (const p of left) g.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
  g.closePath();
  g.fill();
}

/** 由起点、角度、长度生成微弯的枝干点列 */
function limb(rand, x, y, angle, len, bend, n = 8, drift = 0) {
  const pts = [[x, y]];
  let a = angle;
  for (let i = 1; i <= n; i++) {
    a += (rand() - 0.5) * bend + drift;
    x += Math.cos(a) * (len / n);
    y += Math.sin(a) * (len / n);
    pts.push([x, y]);
  }
  return pts;
}

/** 树皮皴点 */
function bark(g, rand, pts, count) {
  g.strokeStyle = 'rgba(18,13,9,0.7)';
  g.lineWidth = 2;
  for (let i = 0; i < count; i++) {
    const p = pts[Math.floor(rand() * (pts.length - 1))];
    g.beginPath();
    g.arc(p[0] + (rand() - 0.5) * 10, p[1] + rand() * 30, 3 + rand() * 4, Math.PI * 0.1, Math.PI * 0.9);
    g.stroke();
  }
}

/* ---------------- 松 ---------------- */
function needleCluster(g, rand, cx, cy, w, h, tone = 0) {
  g.fillStyle = tone ? 'rgba(48,80,64,0.9)' : 'rgba(40,70,58,0.9)';
  g.beginPath();
  g.ellipse(cx, cy, w * 0.48, h * 0.42, 0, 0, Math.PI * 2);
  g.fill();
  g.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const a = -Math.PI * (0.05 + rand() * 0.9) + (rand() < 0.25 ? Math.PI : 0);
    const r0 = rand() * w * 0.25;
    const len = h * (0.35 + rand() * 0.45);
    const ox = cx + (rand() - 0.5) * w * 0.7;
    const oy = cy + (rand() - 0.4) * h * 0.3;
    g.strokeStyle = rand() < 0.7 ? 'rgba(24,42,34,0.85)' : 'rgba(88,128,104,0.75)';
    g.lineWidth = 1.6 + rand() * 1.4;
    g.beginPath();
    g.moveTo(ox + Math.cos(a) * r0, oy + Math.sin(a) * r0 * 0.5);
    g.lineTo(ox + Math.cos(a) * (r0 + len), oy + Math.sin(a) * (r0 + len) * 0.5);
    g.stroke();
  }
  g.fillStyle = 'rgba(110,152,124,0.35)';
  g.beginPath();
  g.ellipse(cx - w * 0.08, cy - h * 0.12, w * 0.3, h * 0.18, 0, 0, Math.PI * 2);
  g.fill();
}

function drawPine(g, rand, { bent = false, branches = 7, height = 940 } = {}) {
  const base = [256, 1012];
  const top = base[1] - height;
  const pts = [];
  let x = base[0];
  const n = 14;
  const lean = bent ? (rand() < 0.5 ? -1 : 1) * (6 + rand() * 4) : (rand() - 0.5) * 3;
  for (let i = 0; i <= n; i++) {
    pts.push([x, base[1] - (i / n) * (base[1] - top)]);
    x += (rand() - 0.5) * 16 + lean * (bent && i > n * 0.5 ? 1.6 : 1);
  }
  stroke(g, pts, 24, 8, '#3b2d22');
  bark(g, rand, pts, 46);
  const clusters = [];
  for (let i = 0; i < branches; i++) {
    const t = 0.4 + (i / branches) * 0.56 + rand() * 0.04;
    const p = pts[Math.min(pts.length - 1, Math.round(t * n))];
    const side = (i + (rand() < 0.2 ? 1 : 0)) % 2 ? 1 : -1;
    const len = (1 - t) * 260 + 50 + rand() * 50;
    const ang = side > 0 ? -0.1 - rand() * 0.4 : Math.PI + 0.1 + rand() * 0.4;
    const b = limb(rand, p[0], p[1], ang, len, 0.5, 6);
    stroke(g, b, 9, 3, '#3b2d22');
    const e = b[b.length - 1];
    clusters.push([e[0], e[1], 110 + rand() * 80, 42 + rand() * 22]);
    const m = b[3];
    if (rand() < 0.6) clusters.push([m[0], m[1] + 4, 70 + rand() * 40, 32 + rand() * 12]);
  }
  const tp = pts[pts.length - 1];
  clusters.push([tp[0], tp[1] + 12, 130 + rand() * 30, 56]);
  clusters.sort((a, b) => b[1] - a[1]);
  const tone = rand() < 0.5 ? 1 : 0;
  clusters.forEach(([cx, cy, w, h]) => needleCluster(g, rand, cx, cy, w, h, tone));
}

/** 偃盖松：主干斜出，树冠平展如伞 */
function drawUmbrellaPine(g, rand) {
  const dir = rand() < 0.5 ? -1 : 1;
  const trunk = limb(rand, 256, 1012, -Math.PI / 2 + dir * 0.32, 640, 0.3, 12, -dir * 0.03);
  stroke(g, trunk, 30, 12, '#3b2d22');
  bark(g, rand, trunk, 50);
  const top = trunk[trunk.length - 1];
  const clusters = [];
  for (let i = 0; i < 6; i++) {
    const a = (i % 2 ? 0 : Math.PI) + (rand() - 0.5) * 0.5;
    const b = limb(rand, top[0], top[1] + 20, a, 120 + rand() * 120, 0.4, 5);
    stroke(g, b, 12, 4, '#3b2d22');
    const e = b[b.length - 1];
    clusters.push([e[0], e[1] - 8, 170 + rand() * 60, 46]);
  }
  clusters.push([top[0], top[1] - 10, 240, 60]);
  clusters.forEach(([cx, cy, w, h]) => needleCluster(g, rand, cx, cy, w, h, 1));
}

/** 柏：老干挺直而带扭纹，鳞叶成层层平团，墨色深沉 */
function drawCypress(g, rand) {
  const trunk = limb(rand, 256, 1012, -Math.PI / 2 + (rand() - 0.5) * 0.1, 780, 0.12, 12);
  stroke(g, trunk, 34, 10, '#3a2c22');
  g.strokeStyle = 'rgba(200,180,150,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const p = trunk[1 + Math.floor(rand() * 7)];
    g.beginPath();
    g.moveTo(p[0] - 8, p[1]);
    g.quadraticCurveTo(p[0], p[1] - 30, p[0] + 6, p[1] - 60);
    g.stroke();
  }
  const tiers = 9;
  for (let k = 0; k < tiers; k++) {
    const t = 0.3 + (k / (tiers - 1)) * 0.7;
    const p = trunk[Math.round(t * (trunk.length - 1))];
    const w = 90 + (1 - t) * 150 + rand() * 40;
    const side = (rand() - 0.5) * 50;
    const b = limb(rand, p[0], p[1], side > 0 ? -0.3 : Math.PI + 0.3, w * 0.4, 0.3, 4);
    stroke(g, b, 7, 2, '#3a2c22');
    const cx = p[0] + side, cy = p[1] - 6;
    for (let i = 0; i < 110; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand());
      g.fillStyle = rand() < 0.65 ? 'rgba(26,46,38,0.9)' : 'rgba(64,94,76,0.85)';
      g.beginPath();
      g.arc(cx + Math.cos(a) * r * w * 0.5, cy + Math.sin(a) * r * 22, 2.5 + rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/* ---------------- 杂树 ---------------- */
function branchTree(g, rand, x, y, angle, len, width, depth, tips, claw = true) {
  const pts = limb(rand, x, y, angle, len, 0.45, 6);
  stroke(g, pts, width, width * 0.62, INK);
  const end = pts[pts.length - 1];
  if (depth <= 0) {
    tips.push(end);
    if (!claw) return;
    // 蟹爪：枝梢向下勾
    g.strokeStyle = INK;
    g.lineWidth = Math.max(1, width * 0.5);
    for (let k = 0; k < 3; k++) {
      const a = angle + (rand() - 0.5) * 1.6;
      g.beginPath();
      g.moveTo(end[0], end[1]);
      g.quadraticCurveTo(end[0] + Math.cos(a) * 14, end[1] + Math.sin(a) * 14, end[0] + Math.cos(a + 0.9) * 18, end[1] + Math.sin(a + 0.9) * 18 + 6);
      g.stroke();
    }
    return;
  }
  const kids = 2 + (rand() < 0.4 ? 1 : 0);
  for (let i = 0; i < kids; i++) {
    const spread = 0.35 + rand() * 0.45;
    const a = angle + (i - (kids - 1) / 2) * spread + (rand() - 0.5) * 0.3;
    branchTree(g, rand, end[0], end[1], a, len * (0.66 + rand() * 0.12), width * 0.64, depth - 1, tips, claw);
  }
}

function leafDots(g, rand, tips, colors, radius, density, size = 1) {
  for (const [tx, ty] of tips) {
    for (let i = 0; i < density; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * radius;
      g.fillStyle = colors[Math.floor(rand() * colors.length)];
      g.beginPath();
      g.ellipse(tx + Math.cos(a) * r, ty + Math.sin(a) * r * 0.75, (3 + rand() * 5) * size, (2.5 + rand() * 3.5) * size, rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** 夹叶：墨线勾出叶形，再填淡彩 */
function outlinedLeaves(g, rand, tips, fill, radius, density) {
  g.lineWidth = 1.6;
  g.strokeStyle = 'rgba(30,26,20,0.85)';
  for (const [tx, ty] of tips) {
    for (let i = 0; i < density; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius;
      const x = tx + Math.cos(a) * r, y = ty + Math.sin(a) * r * 0.75;
      g.save();
      g.translate(x, y);
      g.rotate(rand() * Math.PI);
      g.fillStyle = fill[Math.floor(rand() * fill.length)];
      g.beginPath();
      g.moveTo(-9, 0);
      g.quadraticCurveTo(0, -6, 9, 0);
      g.quadraticCurveTo(0, 6, -9, 0);
      g.fill();
      g.stroke();
      g.restore();
    }
  }
}

function deciduousFrame(g, rand, { trunkLen = 260, depth = 5, spreadK = 0.55, lean = 0, claw = true }) {
  const tips = [];
  const trunk = limb(rand, 256, 1012, -Math.PI / 2 + lean + (rand() - 0.5) * 0.2, trunkLen, 0.25, 8);
  stroke(g, trunk, 24, 14, INK);
  const top = trunk[trunk.length - 1];
  const n = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * spreadK + (rand() - 0.5) * 0.25;
    branchTree(g, rand, top[0], top[1], a, 150 + rand() * 70, 15, depth - 1, tips, claw);
  }
  const side = trunk[3 + Math.floor(rand() * 3)];
  branchTree(g, rand, side[0], side[1], rand() < 0.5 ? -0.5 : Math.PI + 0.5, 100 + rand() * 40, 9, 3, tips, claw);
  return tips;
}

/* ---------------- 柳 ---------------- */
function willowStrand(g, rand, x0, y0, endY, drift, back) {
  const len = Math.max(60, endY - y0);
  const cpx = x0 + drift * 0.6, cpy = y0 + len * 0.3;
  const ex = x0 + drift + (rand() - 0.5) * 16, ey = y0 + len;
  g.strokeStyle = back ? 'rgba(70,72,44,0.28)' : 'rgba(96,98,56,0.32)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo(cpx, cpy, ex, ey);
  g.stroke();
  const greens = back
    ? ['rgba(92,108,62,0.6)', 'rgba(112,120,66,0.55)', 'rgba(78,92,58,0.6)']
    : ['rgba(150,156,82,0.75)', 'rgba(126,142,74,0.75)', 'rgba(176,164,90,0.7)', 'rgba(110,128,70,0.75)'];
  g.lineCap = 'round';
  g.lineWidth = 1.6;
  for (let d = 10; d < len; d += 3 + rand() * 4) {
    if (rand() < 0.18) continue;
    const t = d / len, it = 1 - t;
    const lx = it * it * x0 + 2 * it * t * cpx + t * t * ex;
    const ly = it * it * y0 + 2 * it * t * cpy + t * t * ey;
    const side = rand() < 0.5 ? -1 : 1;
    const a = Math.PI / 2 + side * (0.35 + rand() * 0.4);
    const l = 3 + rand() * 3.5;
    g.strokeStyle = greens[Math.floor(rand() * greens.length)];
    g.beginPath();
    g.moveTo(lx, ly);
    g.lineTo(lx + Math.cos(a) * l, ly + Math.sin(a) * l);
    g.stroke();
  }
}

function drawWillow(g, rand) {
  // 老干粗短微斜，枝条自不同高度斜出，先扬后垂
  const lean = (rand() < 0.5 ? -1 : 1) * (0.15 + rand() * 0.2);
  const trunk = limb(rand, 256, 1012, -Math.PI / 2 + lean, 440, 0.3, 10, -lean * 0.04);
  stroke(g, trunk, 44, 22, INK);
  bark(g, rand, trunk, 34);
  const limbs = [];
  for (let i = 0; i < 8; i++) {
    const src = trunk[6 + Math.floor(rand() * (trunk.length - 6))];
    const side = i % 2 ? 1 : -1;
    // 先向上斜伸，再向外下方弯垂
    const a = -Math.PI / 2 + side * (0.3 + rand() * 0.55);
    const pts = limb(rand, src[0], src[1], a, 150 + rand() * 90, 0.12, 9, side * 0.085);
    stroke(g, pts, 12, 2.5, INK);
    limbs.push(pts);
  }
  // 柳帘下缘大致齐平，略有参差
  const hem = 880 + rand() * 50;
  for (const back of [true, false]) {
    for (const pts of limbs) {
      for (let k = 3; k < pts.length; k++) {
        const [px, py] = pts[k];
        const n = back ? 2 : 3;
        for (let s = 0; s < n; s++) {
          const x0 = px + (rand() - 0.5) * 22, y0 = py + (rand() - 0.5) * 10;
          const endY = hem + (rand() - 0.5) * 140 - (back ? 40 : 0);
          willowStrand(g, rand, x0, y0, endY, (rand() - 0.5) * 40 + (px - 256) * 0.08, back);
        }
      }
    }
  }
}

/* ---------------- 竹 / 芦 / 草 ---------------- */
function drawBamboo(g, rand) {
  for (let s = 0; s < 6; s++) {
    const x = 180 + rand() * 150;
    const h = 480 + rand() * 360;
    const pts = limb(rand, x, 1012, -Math.PI / 2 + (rand() - 0.5) * 0.2, h, 0.05, 10);
    stroke(g, pts, 7, 4, 'rgba(58,82,60,0.95)');
    g.fillStyle = INK;
    pts.forEach((p, i) => i % 2 === 0 && g.fillRect(p[0] - 4, p[1], 8, 2));
    for (let i = 4; i < pts.length; i++) {
      if (rand() < 0.45) continue;
      const [px, py] = pts[i];
      for (let k = 0; k < 4; k++) {
        const a = (rand() < 0.5 ? -1 : 1) * (0.4 + rand() * 0.9) + Math.PI / 2;
        const len = 34 + rand() * 30;
        const tip = [px + Math.cos(a) * len * (rand() < 0.5 ? 1 : -1), py + Math.sin(a) * len * 0.6];
        stroke(g, [[px, py], [(px + tip[0]) / 2, (py + tip[1]) / 2 - 3], tip], 7, 1, rand() < 0.6 ? 'rgba(36,62,46,0.9)' : 'rgba(84,120,90,0.85)');
      }
    }
  }
}

function drawReeds(g, rand) {
  for (let s = 0; s < 22; s++) {
    const x = 150 + rand() * 210;
    const h = 380 + rand() * 360;
    const lean = (rand() - 0.5) * 0.5;
    const pts = limb(rand, x, 1012, -Math.PI / 2 + lean, h, 0.08, 8, lean * 0.03);
    stroke(g, pts, 4, 1.5, 'rgba(120,112,72,0.9)');
    const top = pts[pts.length - 1];
    // 芦花
    for (let i = 0; i < 18; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(232,222,196,0.85)' : 'rgba(196,182,150,0.85)';
      g.beginPath();
      g.ellipse(top[0] + (rand() - 0.5) * 12 + lean * 30, top[1] + rand() * 40, 3, 7, lean, 0, Math.PI * 2);
      g.fill();
    }
    // 叶
    const p = pts[2 + Math.floor(rand() * 3)];
    stroke(g, [p, [p[0] + (rand() - 0.5) * 60, p[1] - 60], [p[0] + (rand() - 0.5) * 120, p[1] - 40]], 5, 1, 'rgba(110,120,70,0.85)');
  }
}

function drawShrub(g, rand) {
  const cx = 256, cy = 930;
  for (let i = 0; i < 6; i++) {
    const b = limb(rand, cx + (rand() - 0.5) * 40, 1012, -Math.PI / 2 + (rand() - 0.5) * 1.4, 120 + rand() * 60, 0.5, 4);
    stroke(g, b, 6, 2, INK);
  }
  const tips = Array.from({ length: 9 }, () => [cx + (rand() - 0.5) * 300, cy - 40 + (rand() - 0.5) * 120]);
  leafDots(g, rand, tips, ['rgba(70,100,76,0.9)', 'rgba(120,138,92,0.85)', 'rgba(160,110,60,0.8)', 'rgba(44,64,52,0.9)'], 60, 30);
}

function drawGrass(g, rand) {
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = 160 + rand() * 190;
    const h = 60 + rand() * 120;
    const bend = (rand() - 0.5) * 70;
    g.strokeStyle = rand() < 0.5 ? 'rgba(96,112,70,0.9)' : rand() < 0.5 ? 'rgba(150,140,84,0.85)' : 'rgba(60,78,56,0.9)';
    g.lineWidth = 2 + rand() * 2;
    g.beginPath();
    g.moveTo(x, 1012);
    g.quadraticCurveTo(x + bend * 0.3, 1012 - h * 0.6, x + bend, 1012 - h);
    g.stroke();
  }
}

/** 18 格画稿 */
const PAINTERS = [
  (g, r) => drawPine(g, r, { branches: 7 }),
  (g, r) => drawPine(g, r, { branches: 9, height: 900 }),
  (g, r) => drawPine(g, r, { bent: true, branches: 6 }),
  (g, r) => drawPine(g, r, { bent: true, branches: 5, height: 820 }),
  (g, r) => drawUmbrellaPine(g, r),
  (g, r) => drawCypress(g, r),
  (g, r) => deciduousFrame(g, r, { trunkLen: 300, depth: 6 }),
  (g, r) => deciduousFrame(g, r, { trunkLen: 200, depth: 5, spreadK: 0.8, lean: 0.25 }),
  (g, r) => leafDots(g, r, deciduousFrame(g, r, {}), ['rgba(168,64,46,0.9)', 'rgba(196,104,58,0.88)', 'rgba(132,54,38,0.9)', 'rgba(184,138,62,0.8)'], 46, 34),
  (g, r) => leafDots(g, r, deciduousFrame(g, r, { spreadK: 0.7 }), ['rgba(200,160,62,0.9)', 'rgba(214,182,90,0.88)', 'rgba(170,128,50,0.9)', 'rgba(150,140,70,0.8)'], 44, 32),
  (g, r) => leafDots(g, r, deciduousFrame(g, r, { trunkLen: 220, depth: 6, claw: false }), ['rgba(178,56,40,0.92)', 'rgba(204,84,52,0.9)', 'rgba(150,46,34,0.9)'], 30, 14, 0.8),
  (g, r) => leafDots(g, r, deciduousFrame(g, r, {}), ['rgba(52,84,70,0.9)', 'rgba(78,118,96,0.85)', 'rgba(104,140,112,0.8)', 'rgba(36,58,48,0.9)'], 50, 38),
  (g, r) => outlinedLeaves(g, r, deciduousFrame(g, r, { trunkLen: 240, claw: false }), ['rgba(150,180,150,0.9)', 'rgba(196,206,160,0.9)', 'rgba(120,160,140,0.9)'], 44, 16),
  (g, r) => drawWillow(g, r),
  (g, r) => drawBamboo(g, r),
  (g, r) => drawReeds(g, r),
  (g, r) => drawShrub(g, r),
  (g, r) => drawGrass(g, r),
  // 第四行：变体
  (g, r) => leafDots(g, r, deciduousFrame(g, r, { trunkLen: 220, spreadK: 0.75, lean: -0.2 }), ['rgba(176,70,46,0.9)', 'rgba(150,58,40,0.9)', 'rgba(204,120,64,0.85)'], 40, 30),
  (g, r) => leafDots(g, r, deciduousFrame(g, r, { trunkLen: 300, depth: 6 }), ['rgba(190,150,58,0.9)', 'rgba(220,190,96,0.85)', 'rgba(160,120,48,0.9)'], 36, 26),
  (g, r) => outlinedLeaves(g, r, deciduousFrame(g, r, { trunkLen: 200, spreadK: 0.8, claw: false }), ['rgba(210,170,110,0.9)', 'rgba(200,140,90,0.9)', 'rgba(170,190,150,0.9)'], 40, 14),
  (g, r) => drawWillow(g, r),
  (g, r) => drawReeds(g, r),
  (g, r) => drawShrub(g, r),
];

/**
 * 先在大画布上作画，量出墨迹范围，再等比缩放填入图集格子（树根始终在格底中央）。
 * 返回纹理与每格内容顶部所占比例，供广告牌按实际高宽比取图。
 */
export function createTreeAtlas(seed = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * COLS;
  canvas.height = CELL_H * ROWS;
  const g = canvas.getContext('2d');
  const scratch = document.createElement('canvas');
  scratch.width = 1100;
  scratch.height = 1700;
  const sg = scratch.getContext('2d', { willReadFrequently: true });
  const BASE_X = 550, BASE_Y = 1680;
  const baseOffset = 8;
  const tops = [];
  PAINTERS.forEach((paint, i) => {
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.clearRect(0, 0, scratch.width, scratch.height);
    sg.translate(BASE_X - 256, BASE_Y - 1012);
    paint(sg, mulberry32(seed * 31 + i * 7));
    sg.setTransform(1, 0, 0, 1, 0, 0);

    const { data, width, height } = sg.getImageData(0, 0, scratch.width, scratch.height);
    let minX = width, maxX = 0, minY = height;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (data[(y * width + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
        }
      }
    }
    const halfW = Math.max(BASE_X - minX, maxX - BASE_X, 1);
    const scale = Math.min((CELL_W / 2 - 8) / halfW, (CELL_H - baseOffset - 8) / (BASE_Y - minY));
    const cx = (i % COLS) * CELL_W, cy = Math.floor(i / COLS) * CELL_H;
    const baseInCellY = CELL_H - baseOffset;
    g.save();
    g.beginPath();
    g.rect(cx, cy, CELL_W, CELL_H);
    g.clip();
    g.drawImage(scratch, cx + CELL_W / 2 - BASE_X * scale, cy + baseInCellY - BASE_Y * scale, scratch.width * scale, scratch.height * scale);
    g.restore();
    tops.push(Math.max(0, (baseInCellY - (BASE_Y - minY) * scale - 3) / CELL_H));
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, tops, baseOffset: baseOffset / CELL_H };
}
