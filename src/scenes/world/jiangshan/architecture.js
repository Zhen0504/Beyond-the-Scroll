import { BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, ConeGeometry, CylinderGeometry, ExtrudeGeometry, IcosahedronGeometry, Mesh, Shape, Vector3, Raycaster } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, box, createPaintedMaterial, cyl, paint, place } from '../../../engine/painted.js';
import { mulberry32 } from '../../../utils/math.js';
import { NORTH_WALL, STRUCTURES } from './layout.js';
import { lerpTable } from './terrain.js';

/**
 * 宋画中的建筑：台基踏步、朱柱、格子门、粉墙木裙、斗拱、灰瓦歇山（凹曲屋面 + 翼角起翘）、
 * 茅舍、桥、栈道、塔。所有构件带顶点色与质感标记，合并为一个网格一次绘制。
 */
const C = {
  plaster: '#ece4cf',
  earth: '#d8c9a6',
  paper: '#e9e0c9',
  column: '#7a3a28',
  wood: '#5a4030',
  woodLight: '#8a6a4c',
  bracket: '#3f5f5a',
  roof: '#4c5558',
  roofDark: '#353c3f',
  stone: '#a49d8c',
  stoneDark: '#827b6c',
  thatch: '#b89a5e',
  thatchDark: '#8f7444',
  plank: '#7a5c40',
  rail: '#4a3426',
};

/**
 * 庑殿 / 攒尖屋面：逐坡面生成，保证垂脊干净。
 * 每个坡面自檐口向脊线做凹曲（檐平脊陡），檐角起翘。
 * w、d 为屋檐外缘尺寸，ridge 为正脊长度（0 即攒尖），h 为屋面高度。
 */
function roofGeometry(w, d, ridge, h, hex, lift = 0.22) {
  const hw = w / 2, hd = d / 2, hr = Math.min(ridge / 2, hw - 0.01);
  const E = [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]];
  const R0 = [-hr, 0], R1 = [hr, 0];
  const faces = [
    [E[0], E[1], R0, R1],
    [E[2], E[3], R1, R0],
    [E[1], E[2], R1, R1],
    [E[3], E[0], R0, R0],
  ];
  const NS = 10, NU = 8;
  const point = (f, s, u) => {
    const [el, er, rl, rr] = f;
    const ex = el[0] + (er[0] - el[0]) * s, ez = el[1] + (er[1] - el[1]) * s;
    const rx = rl[0] + (rr[0] - rl[0]) * s, rz = rl[1] + (rr[1] - rl[1]) * s;
    const edge = Math.max(0, 1 - Math.min(s, 1 - s) * 3.2);
    const y = h * Math.pow(u, 1.6) + lift * h * edge * edge * Math.pow(1 - u, 2);
    return [ex + (rx - ex) * u, y, ez + (rz - ez) * u];
  };
  const geos = faces.map((f) => {
    const pos = [];
    for (let j = 0; j <= NU; j++) for (let i = 0; i <= NS; i++) pos.push(...point(f, i / NS, j / NU));
    const index = [];
    for (let j = 0; j < NU; j++) {
      for (let i = 0; i < NS; i++) {
        const a = j * (NS + 1) + i, b = a + 1, c = a + NS + 2, e = a + NS + 1;
        index.push(a, b, e, b, c, e);
      }
    }
    const g = new BufferGeometry();
    g.setIndex(index);
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.computeVertexNormals();
    return paint(g, hex, MAT.tile);
  });
  // 檐口封檐板：沿起翘的檐线垂下一条，给屋面厚度
  const fpos = [];
  for (const f of faces) {
    for (let i = 0; i < NS; i++) {
      const a = point(f, i / NS, 0), b = point(f, (i + 1) / NS, 0);
      const a2 = [a[0], a[1] - 0.2, a[2]], b2 = [b[0], b[1] - 0.2, b[2]];
      fpos.push(...a, ...a2, ...b, ...b, ...a2, ...b2);
    }
  }
  const fg = new BufferGeometry();
  fg.setAttribute('position', new BufferAttribute(new Float32Array(fpos), 3));
  fg.computeVertexNormals();
  return mergeGeometries([...geos, paint(fg, C.roofDark)]);
}

/** 正脊 + 两端卷起的鸱吻 */
function ridgeGeometry(len, y) {
  const parts = [box(len, 0.26, 0.3, C.roofDark, 0, y)];
  for (const s of [-1, 1]) {
    const g = new BoxGeometry(0.28, 0.62, 0.26);
    g.translate(0, 0.31, 0);
    g.rotateZ(-s * 0.35);
    g.translate((s * len) / 2, y + 0.12, 0);
    parts.push(paint(g, C.roofDark));
    const tip = new BoxGeometry(0.3, 0.16, 0.24);
    tip.translate((s * len) / 2 + s * 0.12, y + 0.72, 0);
    parts.push(paint(tip, C.roofDark));
  }
  return mergeGeometries(parts);
}

/** 台基 + 正面踏步 */
function platform(w, d, base, sunk = 2.2) {
  // 台基向下多延伸一段（sunk），坐在起伏地面上也不悬空；建在木台上时 sunk = 0
  const parts = [box(w, base + sunk, d, C.stone, 0, -sunk, 0, MAT.stone)];
  const n = Math.max(1, Math.round(base / 0.2));
  for (let k = 0; k < n; k++) {
    const sh = base - (k + 1) * (base / (n + 1));
    parts.push(box(Math.min(3.2, w * 0.4), sh + sunk, 0.34, C.stoneDark, 0, -sunk, d / 2 + 0.17 + k * 0.34, MAT.stone));
  }
  return parts;
}

/** 一段栏杆：寻杖、盆唇与望柱（世界坐标），可选加碰撞 */
function railLine(parts, x0, z0, x1, z1, y, walkMap) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ang = -Math.atan2(z1 - z0, x1 - x0);
  for (const [hy, th] of [[0.88, 0.09], [0.36, 0.07]]) {
    const g = new BoxGeometry(len, th, th);
    g.rotateY(ang);
    g.translate((x0 + x1) / 2, y + hy, (z0 + z1) / 2);
    parts.push(paint(g, C.column, MAT.wood));
  }
  const n = Math.max(1, Math.round(len / 1.4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    parts.push(box(0.14, 1.0, 0.14, C.column, x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, MAT.wood));
  }
  walkMap?.addBox((x0 + x1) / 2, (z0 + z1) / 2, len / 2 + 0.05, 0.12, -ang, y - 2, y + 1.1);
}

/** 栏杆：沿矩形三面（正面留口） */
function balustrade(w, d, y, openFront = true) {
  const parts = [];
  const segs = [
    [[-w / 2, -d / 2], [w / 2, -d / 2]],
    [[w / 2, -d / 2], [w / 2, d / 2]],
    [[-w / 2, d / 2], [-w / 2, -d / 2]],
  ];
  if (!openFront) segs.push([[w / 2, d / 2], [-w / 2, d / 2]]);
  for (const [[x0, z0], [x1, z1]] of segs) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new BoxGeometry(len, 0.08, 0.08);
    g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    g.translate((x0 + x1) / 2, y + 0.85, (z0 + z1) / 2);
    parts.push(paint(g, C.column, MAT.wood));
    const g2 = new BoxGeometry(len, 0.06, 0.06);
    g2.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    g2.translate((x0 + x1) / 2, y + 0.35, (z0 + z1) / 2);
    parts.push(paint(g2, C.column, MAT.wood));
    const n = Math.max(1, Math.round(len / 1.2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      parts.push(cyl(0.05, 0.92, C.column, x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, 4));
    }
  }
  return parts;
}

/** 殿 / 阁：台基踏步、朱柱、格子门、粉墙木裙、斗拱、歇山顶；可多层 */
function hall({ w, d, h = 3.6, base = 0.7, roofH, ridge, roofColor = C.roof, stories = 1, rail = false, sunk = 2.2 }) {
  const parts = [...platform(w + 1.8, d + 1.8, base, sunk)];
  if (rail) parts.push(...balustrade(w + 1.6, d + 1.6, base));
  let y = base;
  for (let s = 0; s < stories; s++) {
    const sw = w * (1 - s * 0.22), sd = d * (1 - s * 0.22);
    const cols = Math.max(2, Math.round(sw / 2.6));
    const span = sw / cols;
    // 柱网
    for (let i = 0; i <= cols; i++) {
      const cx = -sw / 2 + i * span;
      parts.push(cyl(0.17, h, C.column, cx, y, sd / 2));
      parts.push(cyl(0.17, h, C.column, cx, y, -sd / 2));
      // 斗拱
      parts.push(box(0.46, 0.22, 0.46, C.bracket, cx, y + h, sd / 2, MAT.wood));
      parts.push(box(0.95, 0.12, 0.34, C.bracket, cx, y + h + 0.22, sd / 2, MAT.wood));
      parts.push(box(0.46, 0.22, 0.46, C.bracket, cx, y + h, -sd / 2, MAT.wood));
    }
    // 正面格子门：上格心、下裙板
    for (let i = 0; i < cols; i++) {
      const cx = -sw / 2 + (i + 0.5) * span;
      parts.push(box(span - 0.36, h * 0.62, 0.08, C.paper, cx, y + h * 0.32, sd / 2 - 0.12, MAT.lattice));
      parts.push(box(span - 0.36, h * 0.3, 0.1, C.wood, cx, y + 0.02, sd / 2 - 0.12, MAT.wood));
    }
    // 侧墙与后墙：粉墙 + 木裙，侧墙开窗
    parts.push(box(sw - 0.2, h - 0.1, 0.16, C.plaster, 0, y, -sd / 2 + 0.06, MAT.plaster));
    for (const sx of [-1, 1]) {
      parts.push(box(0.16, h - 0.1, sd - 0.2, C.plaster, (sx * (sw - 0.12)) / 2, y, 0, MAT.plaster));
      parts.push(box(0.05, h * 0.32, sd * 0.42, C.paper, sx * (sw / 2 + 0.05), y + h * 0.42, 0, MAT.lattice));
    }
    parts.push(box(sw - 0.1, 0.55, 0.2, C.wood, 0, y, -sd / 2 + 0.06, MAT.wood));
    // 额枋
    parts.push(box(sw + 0.3, 0.3, 0.3, C.column, 0, y + h - 0.32, sd / 2, MAT.wood));
    parts.push(box(sw + 0.3, 0.3, 0.3, C.column, 0, y + h - 0.32, -sd / 2, MAT.wood));
    y += h + 0.34;
    // 封闭墙顶与屋面之间：墙顶封板 + 檐下望板（低于檐口 8 cm，避免与屋面重叠闪烁）
    parts.push(box(sw - 0.05, 0.22, sd - 0.05, C.plaster, 0, y - 0.45, 0, MAT.plaster));
    parts.push(box(sw + 2.1, 0.06, sd + 1.9, C.wood, 0, y - 0.24, 0, MAT.wood));
    const rh = roofH ?? Math.min(sw, sd) * 0.42;
    const rr = ridge ?? sw * 0.45;
    const roof = roofGeometry(sw + 2.2, sd + 2.0, rr, rh, roofColor);
    roof.translate(0, y - 0.1, 0);
    parts.push(roof);
    if (rr > 0.5) parts.push(ridgeGeometry(rr + 0.6, y + rh - 0.18));
    if (s < stories - 1) {
      // 平座：上层腰檐下的一圈栏杆
      y += rh * 0.45;
      parts.push(box(sw * 0.86, 0.2, sd * 0.86, C.plank, 0, y - 0.2, 0, MAT.wood));
      parts.push(...balustrade(sw * 0.84, sd * 0.84, y, false));
    }
  }
  return mergeGeometries(parts);
}

/** 亭：方台、四柱、坐凳栏杆、攒尖顶、宝顶 */
function pavilion(size, sunk = 2.2) {
  const parts = [box(size + 1.2, 0.5 + sunk, size + 1.2, C.stone, 0, -sunk, 0, MAT.stone)];
  const h = 3.1;
  const s = size / 2;
  for (const [x, z] of [[s, s], [-s, s], [s, -s], [-s, -s]]) {
    parts.push(cyl(0.15, h, C.column, x, 0.5, z));
    parts.push(box(0.4, 0.2, 0.4, C.bracket, x, 0.5 + h, z, MAT.wood));
  }
  for (const [x, z, w, d] of [[0, -s, size, 0.14], [s, 0, 0.14, size], [-s, 0, 0.14, size]]) {
    parts.push(box(w, 0.45, d, C.column, x, 0.5, z, MAT.wood));
    parts.push(box(w + 0.1, 0.06, d + 0.25, C.woodLight, x, 0.95, z, MAT.wood));
  }
  // 挂落：檐下一圈镂空木格
  for (const [x, z, w, d] of [[0, s, size, 0.06], [0, -s, size, 0.06], [s, 0, 0.06, size], [-s, 0, 0.06, size]]) {
    parts.push(box(w, 0.35, d, C.paper, x, 0.5 + h - 0.62, z, MAT.lattice));
  }
  parts.push(box(size + 0.3, 0.28, size + 0.3, C.column, 0, 0.5 + h - 0.28, 0, MAT.wood));
  parts.push(box(size + 1.9, 0.05, size + 1.9, C.wood, 0, 0.5 + h - 0.02, 0, MAT.wood));
  const roof = roofGeometry(size + 2.0, size + 2.0, 0, size * 0.62, C.roof, 0.3);
  roof.translate(0, 0.5 + h + 0.1, 0);
  parts.push(roof);
  const knob = new CylinderGeometry(0.06, 0.32, 0.5, 8);
  knob.translate(0, 0.5 + h + size * 0.62 - 0.05, 0);
  parts.push(paint(knob, C.roofDark));
  parts.push(cyl(0.05, 0.45, C.roofDark, 0, 0.5 + h + size * 0.62 + 0.2, 0, 6, MAT.plain));
  return mergeGeometries(parts);
}

/** 茅舍：石基、木构架、土墙、木门、小窗、厚茅草两坡顶 */
function hut({ w, d, h = 2.6, roofColor = C.thatch, tile = false, viewRoom = false }) {
  const parts = [box(w + 0.6, 2.5, d + 0.6, C.stoneDark, 0, -2.2, 0, MAT.stone)];
  if(!viewRoom)parts.push(box(w, h, d, C.earth, 0, 0.3, 0, MAT.plaster));
  else {
    const opening=2.8, sill=.85, lintel=2.38;
    parts.push(box(w,.12,d,'#5e4936',0,.27,0,MAT.wood));
    parts.push(box(w,h,.16,C.earth,0,.3,-d/2,MAT.plaster));
    for(const sign of [-1,1]){
      parts.push(box(.16,h,d,C.earth,sign*w/2,.3,0,MAT.plaster));
      parts.push(box((w-opening)/2,h,.16,C.earth,sign*(w+opening)/4,.3,d/2,MAT.plaster));
      parts.push(box(.10,lintel-sill,.23,C.wood,sign*opening/2,sill,d/2+.055,MAT.wood));
    }
    parts.push(box(opening,sill-.3,.16,C.earth,0,.3,d/2,MAT.plaster));
    parts.push(box(opening,h+.3-lintel,.16,C.earth,0,lintel,d/2,MAT.plaster));
    for(const yy of [sill-.06,lintel-.045])parts.push(box(opening+.25,.10,.28,C.wood,0,yy,d/2+.055,MAT.wood));
    // Closed interior bench and work table, visible only through the single window.
    parts.push(box(2,.12,.6,C.woodLight,0,.65,-.6,MAT.wood));
    for(const xx of [-.8,.8])parts.push(box(.12,.38,.48,C.wood,xx,.27,-.6,MAT.wood));
  }
  for (const [x, z] of [[w / 2, d / 2], [-w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]]) {
    parts.push(box(0.26, h + 0.1, 0.26, C.wood, x, 0.3, z, MAT.wood));
  }
  // 腰枋与墙裙
  for (const [x, z, sw, sd] of [[0, d / 2, w + 0.1, 0.16], [0, -d / 2, w + 0.1, 0.16], [w / 2, 0, 0.16, d + 0.1], [-w / 2, 0, 0.16, d + 0.1]]) {
    const bx=x+(x===0?0:Math.sign(x)*.055),bz=z+(z===0?0:Math.sign(z)*.055);
    parts.push(box(sw, 0.16, sd, C.wood, bx, 0.3 + h - 0.1, bz, MAT.wood));
    if(!viewRoom || z!==d/2)parts.push(box(sw, 0.12, sd, C.wood, bx, 0.3 + h * 0.48, bz, MAT.wood));
    parts.push(box(sw - 0.06, 0.6, sd - 0.06 + (sd < 1 ? 0.04 : 0), '#b8a98a', bx, 0.3, bz, MAT.plaster));
  }
  // 侧墙小窗
  if(!viewRoom)parts.push(box(0.08, h * 0.26, d * 0.3, C.paper, w / 2 + 0.09, 0.3 + h * 0.56, 0, MAT.lattice));
  // 门、窗外表面比墙裙、腰枋再凸出 4 cm 以上，远看也不会与它们争抢深度而闪烁
  if(!viewRoom)parts.push(box(w * 0.24, h * 0.72, 0.1, C.wood, -w * 0.15, 0.3, d / 2 + 0.08, MAT.wood));
  if(!viewRoom)parts.push(box(w * 0.22, h * 0.3, 0.08, C.paper, w * 0.22, 0.3 + h * 0.4, d / 2 + 0.09, MAT.lattice));
  const rw = w + 1.6, rd = d + 1.8, rh = d * 0.6;
  const th = tile ? 0.22 : 0.42;
  const shape = new Shape();
  shape.moveTo(-rd / 2, 0);
  shape.quadraticCurveTo(-rd / 4, rh * 0.62, 0, rh);
  shape.quadraticCurveTo(rd / 4, rh * 0.62, rd / 2, 0);
  shape.lineTo(rd / 2 - th * 0.7, -th);
  shape.quadraticCurveTo(rd / 4, rh * 0.62 - th, 0, rh - th);
  shape.quadraticCurveTo(-rd / 4, rh * 0.62 - th, -rd / 2 + th * 0.7, -th);
  shape.closePath();
  // 山墙：填满墙顶到屋面内侧之间的三角，屋顶下不再透空
  const inner = [];
  const P0 = [-rd / 2 + th * 0.7, -th], P1 = [-rd / 4, rh * 0.62 - th], P2 = [0, rh - th];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, it = 1 - t;
    inner.push([it * it * P0[0] + 2 * it * t * P1[0] + t * t * P2[0], it * it * P0[1] + 2 * it * t * P1[1] + t * t * P2[1]]);
  }
  const innerAt = (x) => {
    const ax = -Math.abs(x);
    for (let i = 0; i < inner.length - 1; i++) {
      const [x0, y0] = inner[i], [x1, y1] = inner[i + 1];
      if (ax >= x0 && ax <= x1) return y0 + ((ax - x0) / (x1 - x0)) * (y1 - y0);
    }
    return inner[0][1];
  };
  const gable = new Shape();
  gable.moveTo(-d / 2 - 0.1, -0.05);
  for (let i = 0; i <= 20; i++) {
    const x = -d / 2 - 0.1 + (i / 20) * (d + 0.2);
    gable.lineTo(x, innerAt(x) + 0.04);
  }
  gable.lineTo(d / 2 + 0.1, -0.05);
  gable.closePath();
  for (const sx of [-1, 1]) {
    // 山墙比腰枋薄（外表面退后 3 cm），腰枋压在墙面上，不再与墙面共面闪烁
    const g = new ExtrudeGeometry(gable, { depth: 0.1, bevelEnabled: false });
    g.translate(0, 0, -0.05);
    g.rotateY(Math.PI / 2);
    g.translate((sx * w) / 2, 0.3 + h, 0);
    parts.push(paint(g, C.earth, MAT.plaster));
  }
  // 前后檐墙顶：补上墙顶与屋面之间的缝
  const eaveGap = innerAt(d / 2) + 0.06;
  for (const sz of [-1, 1]) parts.push(box(w + 0.2, Math.max(0.05, eaveGap), 0.1, C.wood, 0, 0.3 + h - 0.02, (sz * d) / 2, MAT.wood));
  const roof = new ExtrudeGeometry(shape, { depth: rw, bevelEnabled: false, curveSegments: 8 });
  roof.translate(0, 0, -rw / 2);
  roof.rotateY(Math.PI / 2);
  roof.translate(0, 0.3 + h, 0);
  parts.push(paint(roof, roofColor, tile ? MAT.tile : MAT.thatch));
  parts.push(box(rw + 0.1, 0.32, 0.5, tile ? C.roofDark : C.thatchDark, 0, 0.3 + h + rh - 0.24, 0, tile ? MAT.plain : MAT.thatch));
  return mergeGeometries(parts);
}

/** 草垛 */
function haystack() {
  const g = new ConeGeometry(1.3, 2.4, 10);
  g.translate(0, 1.2, 0);
  const b = new CylinderGeometry(1.25, 1.35, 0.9, 10);
  b.translate(0, 0.45, 0);
  return mergeGeometries([paint(g, C.thatch, MAT.thatch), paint(b, C.thatchDark, MAT.thatch)]);
}

/** 石拱桥：侧面轮廓挤出 */
function archBridge({ length, width, rise }) {
  const L = length / 2;
  const shape = new Shape();
  shape.moveTo(-L, -1.5);
  shape.lineTo(-L, 0.6);
  shape.quadraticCurveTo(0, rise * 2 - 0.6, L, 0.6);
  shape.lineTo(L, -1.5);
  shape.lineTo(L * 0.62, -1.5);
  shape.absellipse(0, -1.5, L * 0.62, rise + 0.4, 0, Math.PI, false);
  shape.lineTo(-L, -1.5);
  const g = new ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -width / 2);
  const parts = [paint(g, C.stone, MAT.stone)];
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push([-L + t * length, archDeck(t, rise)]);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const seg = new BoxGeometry(Math.hypot(x1 - x0, y1 - y0) + 0.05, 0.6, 0.22);
      seg.rotateZ(Math.atan2(y1 - y0, x1 - x0));
      seg.translate((x0 + x1) / 2, (y0 + y1) / 2 + 0.3, side * (width / 2 - 0.11));
      parts.push(paint(seg, C.stoneDark, MAT.stone));
    }
    // 望柱
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      parts.push(box(0.28, 0.85, 0.28, C.stoneDark, -L + t * length, archDeck(t, rise), side * (width / 2 - 0.11)));
    }
  }
  return mergeGeometries(parts);
}

/** 拱桥桥面高度（t: 0 → 1） */
export function archDeck(t, rise) {
  const u = t * 2 - 1;
  return 0.6 + (rise * 2 - 1.2) * 0.5 * (1 - u * u);
}

/** 木构平桥 / 栈道：沿折线铺板、立柱、栏杆（返回几何与需挡船的立柱位置） */
function plankWay(points, width, { posts = true, postDepth = 4, railBoth = true, postList, postStep = 1, planks = true } = {}) {
  const parts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = new Vector3(points[i][0], points[i][2], points[i][1]);
    const b = new Vector3(points[i + 1][0], points[i + 1][2], points[i + 1][1]);
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.round(len / 0.5));
    const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
    for (let k = 0; planks && k < n; k++) {
      const t = (k + 0.5) / n;
      const p = a.clone().lerp(b, t);
      const pl = new BoxGeometry(0.46, 0.14, width);
      pl.rotateY(yaw);
      // 板面略低于行走面 2 cm，与相接的台面错开，避免闪烁
      pl.translate(p.x, p.y - 0.09, p.z);
      parts.push(paint(pl, k % 3 ? C.plank : C.woodLight, MAT.wood));
    }
    const nrm = new Vector3(-(b.z - a.z), 0, b.x - a.x).normalize().multiplyScalar(width / 2 - 0.08);
    const sides = railBoth ? [1, -1] : [1];
    for (const sgn of sides) {
      const off = nrm.clone().multiplyScalar(sgn);
      const rail = new BoxGeometry(len + 0.1, 0.1, 0.1);
      rail.rotateZ(Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)));
      rail.rotateY(yaw);
      const mid = a.clone().lerp(b, 0.5).add(off);
      rail.translate(mid.x, mid.y + 0.95, mid.z);
      parts.push(paint(rail, C.rail, MAT.wood));
      const pc = Math.max(1, Math.round(len / 2.2));
      for (let k = 0; k <= pc; k++) {
        const p = a.clone().lerp(b, k / pc).add(off);
        parts.push(cyl(0.07, 1, C.rail, p.x, p.y, p.z, 5));
        if (posts && k % postStep === 0) {
          parts.push(cyl(0.12, postDepth, C.wood, p.x, p.y - postDepth, p.z, 5));
          postList?.push([p.x, p.z, p.y, p.y - postDepth]);
        }
      }
    }
  }
  return mergeGeometries(parts);
}

/** 塔：七层密檐 */
function pagoda() {
  const parts = [box(7, 1.8, 7, C.stone, 0, -0.6, 0, MAT.stone)];
  let y = 1.2, s = 5.2;
  for (let i = 0; i < 7; i++) {
    const h = i === 0 ? 4 : 2.4;
    parts.push(box(s, h, s, C.plaster, 0, y, 0, MAT.plaster));
    parts.push(box(s * 0.3, h * 0.55, 0.06, C.paper, 0, y + h * 0.2, s / 2 + 0.02, MAT.lattice));
    y += h;
    parts.push(box(s + 2.1, 0.05, s + 2.1, C.wood, 0, y - 0.08, 0, MAT.wood));
    const roof = roofGeometry(s + 2.2, s + 2.2, 0, 1.2, C.roof, 0.35);
    roof.translate(0, y + 0.05, 0);
    parts.push(roof);
    y += 0.5;
    s *= 0.86;
  }
  parts.push(cyl(0.25, 4, C.roofDark, 0, y, 0, 6, MAT.plain));
  return mergeGeometries(parts);
}

/** 建筑占地范围内的最高地面：台基压在其上，地面不会从台面里冒出来闪烁 */
function footY(heightAt, x, z, hw, hd, angle = 0) {
  const c = Math.cos(angle), s = Math.sin(angle);
  let h = -Infinity;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const lx = (i / 2) * hw, lz = (j / 2) * hd;
      h = Math.max(h, heightAt(x + lx * c + lz * s, z - lx * s + lz * c));
    }
  }
  return h;
}

/** 亭的四柱与三面坐凳栏杆（正面 +z 留口） */
function pavilionColliders(walkMap, x, y, z, size, angle) {
  const s = size / 2, c = Math.cos(angle), sn = Math.sin(angle);
  const w = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  for (const [lx, lz] of [[s, s], [-s, s], [s, -s], [-s, -s]]) {
    const [px, pz] = w(lx, lz);
    walkMap.addCircle(px, pz, 0.22, y - 1, y + 4);
  }
  for (const [lx, lz, hx, hz] of [[0, -s, s, 0.14], [s, 0, 0.14, s], [-s, 0, 0.14, s]]) {
    const [px, pz] = w(lx, lz);
    walkMap.addBox(px, pz, hx, hz, -angle, y - 1, y + 1);
  }
}

export function createArchitecture({ atmosphere, heightAt, walkMap }) {
  const parts = [], rooms=[];
  const S = STRUCTURES;
  const boatPosts = [];
  const add = (geo, x, y, z, ry = 0) => parts.push(place(geo, x, y, z, ry));

  // —— 石拱桥 ——
  {
    const b = S.archBridge;
    const ry = Math.PI / 2 + b.angle;
    add(archBridge(b), b.x, 0, b.z, ry);
    const dir = [Math.cos(ry), -Math.sin(ry)];
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const s = (t - 0.5) * b.length;
      const x = b.x + dir[0] * s, z = b.z + dir[1] * s;
      let y = archDeck(t, b.rise);
      // 桥头与岸坡自然衔接
      if (t < 0.2 || t > 0.8) y = Math.max(y, heightAt(x, z) + 0.02);
      pts.push([x, z, y]);
    }
    walkMap.addDeck({ type: 'path', points: pts, width: b.width - 0.5 });
  }

  // —— 湖口木桥：两端高度贴合岸地 ——
  let bridgeNorthY;
  {
    const b = S.woodBridge;
    const yS = Math.max(heightAt(b.x, b.z0), 0.8) + 0.05;
    const yN = Math.max(heightAt(b.x, b.z1), 0.8) + 0.05;
    bridgeNorthY = yN;
    // 桥身中部拱起，小舟可从桥下穿过（桥墩隔三柱一立）
    const mid = Math.max(2.8, Math.max(yS, yN) + 0.5);
    const zq = (b.z1 - b.z0) / 4;
    const pts = [[b.x, b.z0, yS], [b.x, b.z0 + zq, (yS + mid) / 2 + 0.3], [b.x, (b.z0 + b.z1) / 2, mid], [b.x, b.z1 - zq, (yN + mid) / 2 + 0.3], [b.x, b.z1, yN]];
    parts.push(plankWay(pts, b.width, { postDepth: 6, postList: boatPosts, postStep: 3 }));
    for (const [x, z, top, bot] of boatPosts) walkMap.addCircle(x, z, 0.18, bot, top - 0.3);
    walkMap.addDeck({ type: 'path', points: pts, width: b.width - 0.4 });
  }

  // —— 临水亭 ——
  {
    const p = S.pavilion;
    const y = footY(heightAt, p.x, p.z, p.size / 2 + 0.6, p.size / 2 + 0.6, p.angle);
    add(pavilion(p.size), p.x, y - 0.1, p.z, p.angle);
    walkMap.addDeck({ type: 'rect', cx: p.x, cz: p.z, hx: p.size / 2 + 0.6, hz: p.size / 2 + 0.6, angle: -p.angle, y: y + 0.4 });
    pavilionColliders(walkMap, p.x, y + 0.4, p.z, p.size, p.angle);
  }

  // —— 湖畔水阁 ——
  {
    const h = S.lakeHall;
    const y = footY(heightAt, h.x, h.z, h.w / 2 + 0.9, h.d / 2 + 0.9, h.angle);
    add(hall({ w: h.w, d: h.d, rail: true }), h.x, y - 0.05, h.z, h.angle);
    walkMap.addBox(h.x, h.z, h.w / 2 + 0.9, h.d / 2 + 0.9, -h.angle);
  }

  // —— 崖顶山寺 ——
  {
    const t = S.temple;
    add(hall({ w: 9, d: 6, ridge: 4, rail: true }), t.x, footY(heightAt, t.x, t.z, 5.4, 3.9, t.angle) - 0.05, t.z, t.angle);
    add(pavilion(3.6), t.x + 11, footY(heightAt, t.x + 11, t.z + 3, 2.4, 2.4, 0.3) - 0.05, t.z + 3, 0.3);
    add(hall({ w: 5, d: 4, h: 3, base: 0.5 }), t.x - 10, footY(heightAt, t.x - 10, t.z - 4, 3.4, 2.9, 0.2) - 0.05, t.z - 4, 0.2);
  }

  // —— 栈道与层台楼阁 ——
  {
    const pts = S.plankRoad.map((p) => [...p]);
    // 栈道起点接木桥北端
    pts[0][2] = bridgeNorthY;
    pts[1][2] = Math.max(pts[1][2], bridgeNorthY + 0.5);
    // 依山而建：内侧即崖壁，只在临水一侧设栏杆；栈道下的撑柱落地
    const roadPosts = [];
    parts.push(plankWay(pts, 2.2, { postDepth: 12, railBoth: false, postList: roadPosts }));
    for (const [x, z, top] of roadPosts) {
      const gy = heightAt(x, z);
      walkMap.addCircle(x, z, 0.18, gy - 1, top - 0.3);
    }
    walkMap.addDeck({ type: 'path', points: pts, width: 2.0 });

    // 层台：地形中已垒成背倚山崖的石台；三面设栏杆，西侧留出栈道入口
    const t = S.terrace;
    const x0 = t.cx - t.hx, x1 = t.cx + t.hx, zf = t.cz + t.hz, zb = t.cz - t.hz;
    const entry = pts[pts.length - 1][1];
    railLine(parts, x0, zf, x1, zf, t.y, walkMap);
    railLine(parts, x1, zf, x1, zb, t.y, walkMap);
    railLine(parts, x0, zf, x0, entry + 1.3, t.y, walkMap);
    railLine(parts, x0, entry - 1.3, x0, zb, t.y, walkMap);
    // 台边压一圈条石
    for (const [cx, cz, w, d] of [[t.cx, zf, t.hx * 2, 0.5], [x1, t.cz, 0.5, t.hz * 2], [x0, t.cz, 0.5, t.hz * 2]]) {
      parts.push(box(w, 0.25, d, C.stoneDark, cx, t.y - 0.18, cz, MAT.stone));
    }
    add(hall({ w: 10, d: 5.2, stories: 2, h: 3.2, base: 0.4 }), t.cx + 3, t.y, t.cz - 1.8, 0);
    walkMap.addBox(t.cx + 3, t.cz - 1.8, 6.2, 3.6, 0, t.y - 1, t.y + 20);
    add(pavilion(3.4), t.cx + 10.5, t.y, t.cz + 1.2, 0);
    pavilionColliders(walkMap, t.cx + 10.5, t.y, t.cz + 1.2, 3.4, 0);
  }

  // —— 两崖间廊桥（只可远观） ——
  {
    const b = S.coveredBridge;
    const len = b.x1 - b.x0;
    parts.push(plankWay([[b.x0, b.z, b.y], [b.x1, b.z, b.y]], 3, { posts: false }));
    const roof = roofGeometry(len + 2, 4.6, len - 3, 1.8, C.roof, 0.25);
    roof.translate((b.x0 + b.x1) / 2, b.y + 2.9, b.z);
    parts.push(roof);
    for (let i = 0; i <= 6; i++) {
      const x = b.x0 + (i / 6) * len;
      parts.push(cyl(0.14, 2.9, C.column, x, b.y, b.z + 1.4));
      parts.push(cyl(0.14, 2.9, C.column, x, b.y, b.z - 1.4));
    }
  }

  // —— 远塔 ——
  {
    const p = S.pagoda;
    add(pagoda(), p.x, footY(heightAt, p.x, p.z, 3.5, 3.5, 0.3) - 0.05, p.z, 0.3);
  }

  // —— 江村 ——
  for (const v of S.village) {
    let geo, hw, hd;
    if (v.type === 'house') {
      geo = hall({ w: 8, d: 5, h: 3, base: 0.45, ridge: 4, roofH: 2.2 });
      hw = 5; hd = 3.6;
    } else if (v.type === 'shed') {
      geo = hut({ w: 4, d: 3, h: 2.2 });
      hw = 2.6; hd = 2.1;
    } else {
      geo = hut({ w: 6, d: 4.2, tile: v.x % 3 < 1, viewRoom: v.x===168 });
      hw = 3.6; hd = 2.7;
    }
    const foundation=footY(heightAt,v.x,v.z,hw,hd,v.angle)-.05;
    add(geo,v.x,foundation,v.z,v.angle);
    if(v.x===168)rooms.push({x:v.x,z:v.z,angle:v.angle,floor:foundation+.39,depth:4.2,windowY:foundation+.85});
    walkMap.addBox(v.x, v.z, hw, hd, -v.angle);
  }
  for (const [x, z] of [[132, 48], [186, 66], [143, 66], [204, 52]]) {
    add(haystack(), x, heightAt(x, z) - 0.2, z);
    walkMap.addCircle(x, z, 1.35);
  }
  // 竹篱
  {
    for (let i = 0; i < 26; i++) {
      const x = 132 + i * 1.6, z = 72 + Math.sin(i * 0.5) * 1.5;
      parts.push(cyl(0.06, 1.2, C.wood, x, heightAt(x, z) - 0.1, z, 4));
    }
    for (let i = 0; i < 25; i++) {
      const x0 = 132 + i * 1.6, x1 = x0 + 1.6;
      const z0 = 72 + Math.sin(i * 0.5) * 1.5, z1 = 72 + Math.sin((i + 1) * 0.5) * 1.5;
      const y0 = heightAt(x0, z0) + 0.85, y1 = heightAt(x1, z1) + 0.85;
      const g = new BoxGeometry(Math.hypot(x1 - x0, z1 - z0, y1 - y0), 0.06, 0.06);
      g.rotateZ(Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0)));
      g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      parts.push(paint(g, C.wood, MAT.wood));
      walkMap.addCircle(x0, z0, 0.5, -Infinity, y0 + 0.4);
    }
  }
  // 码头
  {
    const d = S.dock;
    const dx = Math.sin(d.angle), dz = -Math.cos(d.angle);
    const y0 = Math.max(0.9, heightAt(d.x, d.z) + 0.05);
    const p0 = [d.x, d.z, y0], p1 = [d.x + dx * d.length, d.z + dz * d.length, 0.9];
    const dockPosts = [];
    parts.push(plankWay([p0, p1], 2.4, { postDepth: 3, postList: dockPosts }));
    for (const [x, z, top, bot] of dockPosts) {
      boatPosts.push([x, z, top, bot]);
      walkMap.addCircle(x, z, 0.18, bot, top - 0.3);
    }
    walkMap.addDeck({ type: 'path', points: [[d.x - dx * 2, d.z - dz * 2, heightAt(d.x - dx * 2, d.z - dz * 2) + 0.03], p0, p1], width: 2.2 });
  }

  const material = createPaintedMaterial(atmosphere);
  return { meshes: [new Mesh(mergeGeometries(parts), material)], material, boatPosts, rooms };
}

/**
 * 山中楼阁：原作群峰之间处处有寺观亭台。
 *  - 峰顶：在部分石柱顶上立亭或小殿；
 *  - 崖顶台地：寻找平缓处布置寺院组群；
 *  - 对岸：江边小村。
 */
export function createHillBuildings({ material, heightAt, rocks, walkMap, terrainMeshes=[] }) {
  const parts = [], viewPaths=[];
  const rand = mulberry32(31337);
  const add = (geo, x, y, z, ry = 0) => parts.push(place(geo, x, y, z, ry));

  // 峰顶亭台：每 55 m 一段，取靠近山谷、从谷中望得见的石柱
  const chosen = [];
  for (let x0 = -262; x0 < 240; x0 += 55) {
    const cands = rocks.columns.filter((c) => {
      const wall = lerpTable(NORTH_WALL, c.x);
      return c.x >= x0 && c.x < x0 + 55 && c.height > 30 && c.height < 110 && c.z < wall + 4 && c.z > wall - 45;
    });
    if (!cands.length || rand() < 0.2) continue;
    const c = cands[Math.floor(rand() * cands.length)];
    const y = rocks.topAt(c);
    if (y === null) continue;
    chosen.push(c);
    const big = c.radius > 12 && rand() < 0.5;
    add(big ? hall({ w: 6, d: 4.2, h: 3, base: 0.5, rail: true }) : pavilion(3.4), c.x, y - 0.25, c.z, rand() * 0.6 - 0.3);
  }

  // 悬崖楼阁：自崖壁挑出的平台，立柱撑地，台上建殿（原作卷中多有此景）
  const S = STRUCTURES;
  const keep = [...S.waterfalls.map((w) => w.x), S.temple.x, S.terrace.cx, (S.coveredBridge.x0 + S.coveredBridge.x1) / 2, 32, 60];
  const cliffs = [];
  for (let x = -250; x <= 225; x += 34 + rand() * 18) {
    if (keep.some((k) => Math.abs(k - x) < 22)) continue;
    const H = 14 + rand() * 16;
    let z = lerpTable(NORTH_WALL, x) + 2;
    let guard = 0;
    while (heightAt(x, z) < H && guard++ < 80) z -= 0.5;
    if (guard >= 80) continue;
    const pz = z + 3.2;
    if (rocks.columns.some((c) => Math.hypot(c.x - x, c.z - pz) < c.radius + 5)) continue;
    cliffs.push({ x, z: pz, y: H });
  }
  for (const c of cliffs.slice(0, 8)) {
    const w = 9 + rand() * 4, d = 6;
    parts.push(box(w, 0.45, d, C.plank, c.x, c.y - 0.45, c.z, MAT.wood));
    // 立柱一直撑到下方地面
    for (let i = 0; i <= 3; i++) {
      for (const dz of [d / 2 - 0.3, -d / 2 + 0.6]) {
        const px = c.x - w / 2 + 0.3 + (i / 3) * (w - 0.6), pz = c.z + dz;
        const gy = heightAt(px, pz);
        if (c.y - gy > 0.6) {
          parts.push(cyl(0.18, c.y - gy + 0.4, C.wood, px, gy - 0.4, pz, 6));
          walkMap?.addCircle(px, pz, 0.24, gy - 1, c.y);
        }
      }
    }
    // 斜撑：自台下伸入崖壁
    for (let i = 0; i <= 2; i++) {
      const px = c.x - w / 2 + 0.6 + (i / 2) * (w - 1.2);
      const g = new BoxGeometry(0.22, 0.22, 4.6);
      g.rotateX(-0.75);
      g.translate(px, c.y - 1.9, c.z - d / 2 + 0.4);
      parts.push(paint(g, C.wood, MAT.wood));
    }
    // 栏杆：前、左、右三面，背面即山崖
    const xa = c.x - w / 2 + 0.1, xb = c.x + w / 2 - 0.1, zf = c.z + d / 2 - 0.1, zb = c.z - d / 2 + 0.3;
    railLine(parts, xa, zf, xb, zf, c.y);
    railLine(parts, xa, zf, xa, zb, c.y);
    railLine(parts, xb, zf, xb, zb, c.y);
    const two = rand() < 0.4;
    add(hall({ w: w - 3, d: 3.8, h: 3, base: 0.3, stories: two ? 2 : 1, sunk: 0 }), c.x, c.y, c.z - 0.6, 0);
  }

  // A visible hillside homestead east of the pagoda, beyond the walkable boundary.
  const home={x:290,z:122,w:5,d:3.6,angle:Math.PI};
  const foundation=footY(heightAt,home.x,home.z,2.9,2.25,home.angle)-.05;
  add(hut({w:home.w,d:home.d,h:2.6,tile:true}),home.x,foundation,home.z,home.angle);
  walkMap.addBox(home.x,home.z,2.9,2.25,home.angle);
  const bends=[[290,125],[296,122],[295,115],[289,108],[287,103],[296,104],[308,110],[322,120],[336,132],[335,142],[320,145],[305,140],[292,134]];
  const loop=new CatmullRomCurve3(bends.map(([x,z])=>new Vector3(x,0,z)),true,'centripetal');
  const route=loop.getSpacedPoints(180).map(p=>[p.x,p.z]);
  // Restrict one-time downward sampling to local rock faces: the soil road must
  // follow visible outcrops as well as the underlying height field.
  const localFaces=[],v=new Vector3();
  for(const mesh of [...rocks.meshes,...terrainMeshes]){
    mesh.updateMatrixWorld(true);
    const pos=mesh.geometry.attributes.position,ix=mesh.geometry.index;
    const count=ix?ix.count:pos.count;
    for(let i=0;i<count;i+=3){
      const tri=[];
      for(let j=0;j<3;j++){v.fromBufferAttribute(pos,ix?ix.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld);tri.push(v.x,v.y,v.z);}
      if(Math.max(tri[0],tri[3],tri[6])<279||Math.min(tri[0],tri[3],tri[6])>340||Math.max(tri[2],tri[5],tri[8])<100||Math.min(tri[2],tri[5],tri[8])>148)continue;
      localFaces.push(...tri);
    }
  }
  const localGeo=new BufferGeometry();localGeo.setAttribute('position',new BufferAttribute(new Float32Array(localFaces),3));
  const localRock=new Mesh(localGeo,rocks.meshes[0].material),probe=new Raycaster(),down=new Vector3(0,-1,0),origin=new Vector3();
  const surfaceAt=(x,z)=>{
    origin.set(x,400,z);probe.set(origin,down);
    const hits=probe.intersectObject(localRock,false);
    return hits.length?hits[0].point.y:heightAt(x,z);
  };
  const points=route.map(([x,z])=>[x,z,surfaceAt(x,z)+.10]);
  // Dirt ribbon follows the actual hillside; no floating posts, remote spiral or extra boulder.
  const verts=[],indices=[];
  for(let i=0;i<route.length;i++){
    const prev=route[i===0?route.length-2:i-1],next=route[i===route.length-1?1:i+1];
    const dx=next[0]-prev[0],dz=next[1]-prev[1],len=Math.hypot(dx,dz),nx=-dz/len*.8,nz=dx/len*.8;
    for(const side of [-1,1]){
      const x=route[i][0]+nx*side,z=route[i][1]+nz*side;verts.push(x,surfaceAt(x,z)+.075,z);
    }
    if(i<route.length-1){
      const first=i*2;indices.push(first,first+2,first+1,first+1,first+2,first+3);
      const a=route[i],b=route[i+1],sx=b[0]-a[0],sz=b[1]-a[1];
      walkMap.addBox((a[0]+b[0])/2,(a[1]+b[1])/2,Math.hypot(sx,sz)/2+.2,1,Math.atan2(sz,sx));
    }
  }
  const road=new BufferGeometry();road.setAttribute('position',new BufferAttribute(new Float32Array(verts),3));road.setIndex(indices);road.computeVertexNormals();parts.push(paint(road,'#b29a72',MAT.plaster));localGeo.dispose();
  viewPaths.push({points,closed:true,facing:Math.PI,home:{...home,y:foundation},remote:true});

  // 崖顶台地寺院（取靠近崖边、从谷中能望见的平缓处）
  const spots = [];
  for (let x = -250; x <= 225; x += 7) {
    const z = lerpTable(NORTH_WALL, x) - 22 - rand() * 18;
    const h0 = heightAt(x, z);
    let flat = true;
    for (let a = 0; a < 6 && flat; a++) {
      const th = (a / 6) * Math.PI * 2;
      if (Math.abs(heightAt(x + Math.cos(th) * 7, z + Math.sin(th) * 7) - h0) > 2.4) flat = false;
    }
    if (!flat) continue;
    if (rocks.columns.some((c) => Math.hypot(c.x - x, c.z - z) < c.radius + 7)) continue;
    if (spots.some((p) => Math.abs(p.x - x) < 55)) continue;
    spots.push({ x, z, y: h0 });
  }
  for (const sp of spots.slice(0, 6)) {
    add(hall({ w: 8, d: 5.5, base: 1.2, rail: true }), sp.x, sp.y - 0.4, sp.z, 0);
    add(pavilion(3), sp.x + 8.5, heightAt(sp.x + 8.5, sp.z + 5) - 0.3, sp.z + 5, 0.4);
  }

  // 对岸小村
  let huts = 0;
  for (let i = 0; i < 40 && huts < 7; i++) {
    const x = 262 + rand() * 90, z = -150 + rand() * 40;
    const h = heightAt(x, z);
    if (h < 0.8 || Math.abs(heightAt(x + 4, z) - h) > 1.2 || Math.abs(heightAt(x, z + 4) - h) > 1.2) continue;
    add(hut({ w: 5.5, d: 4, tile: rand() < 0.3 }), x, h - 0.1, z, rand() * 0.6 - 0.3);
    huts++;
  }

  return { meshes: parts.length ? [new Mesh(mergeGeometries(parts), material)] : [], viewPaths, peaks: chosen.length, cliffs: Math.min(8, cliffs.length), spots: Math.min(6, spots.length) };
}
