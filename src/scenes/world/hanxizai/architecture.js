import { CylinderGeometry, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, box, createPaintedMaterial, cyl, paint } from '../../../engine/painted.js';
import { ATMOSPHERE_GLSL } from '../../../engine/shaders/common.glsl.js';
import {
  BEDS,
  COL_XS,
  COL_ZS,
  DRUMS,
  HALL,
  LANTERNS,
  LONG_BENCH,
  SCREENS,
  SEATS,
  TABLES,
} from './layout.js';

/**
 * 夜宴厅土木：粉墙、朱柱、额枋、露明椽、金砖地面、黑漆榻案、六扇屏风。
 * 构件带顶点色与质感标记，合并为一网格；屏风画心另用原卷纹理。
 */

const C = {
  plaster: '#cbb48a',
  plasterDeep: '#b3946c',
  dado: '#6a4a34',
  column: '#5c221c',
  columnDark: '#3e1612',
  base: '#8a7a64',
  wood: '#3e2a1c',
  woodMid: '#5a3c2a',
  woodLight: '#7a5840',
  beam: '#2c1c14',
  floor: '#6a4e38',
  floorDark: '#564030',
  paper: '#e4cc9e',
  lacquer: '#1a1410',
  lacquerRed: '#6e241c',
  silkCream: '#e4d2b0',
  bronze: '#8a6a3c',
  celadon: '#7a8a70',
  dish: '#d4be96',
  drum: '#8b2a22',
  drumDark: '#5c1814',
  curtain: '#6a1c18',
  ink: '#2a2218',
};

function combine(parts) {
  return mergeGeometries(parts.filter(Boolean));
}

function block(walkMap, cx, cz, hx, hz, y0 = 0, y1 = 2.8) {
  walkMap.addBox(cx, cz, hx, hz, 0, y0 - 0.4, y1);
}

/** 厅壳：地砖、四壁、格子窗、裙板、柱网、额枋斗拱、天花与椽 */
function hallShell(walkMap) {
  const { x0, x1, z0, z1, h, wall } = HALL;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const len = x1 - x0;
  const dep = z1 - z0;
  const parts = [];

  // 金砖地面（略大于内空，压住墙根）
  parts.push(box(len + 0.8, 0.14, dep + 0.8, C.floor, cx, -0.14, cz, MAT.stone));
  // 一圈压边条石
  parts.push(box(len + 0.5, 0.04, 0.28, C.floorDark, cx, 0, z0 + 0.18, MAT.stone));
  parts.push(box(len + 0.5, 0.04, 0.28, C.floorDark, cx, 0, z1 - 0.18, MAT.stone));

  const wallH = h - 0.08;
  // 北、南实墙
  parts.push(box(len + wall, wallH, wall, C.plaster, cx, 0, z0, MAT.plaster));
  parts.push(box(len + wall, wallH, wall, C.plaster, cx, 0, z1, MAT.plaster));
  // 西、东山墙
  parts.push(box(wall, wallH, dep + wall, C.plaster, x0, 0, cz, MAT.plaster));
  parts.push(box(wall, wallH, dep + wall, C.plaster, x1, 0, cz, MAT.plaster));
  block(walkMap, cx, z0, len / 2 + 0.2, wall * 0.55, 0, wallH);
  block(walkMap, cx, z1, len / 2 + 0.2, wall * 0.55, 0, wallH);
  block(walkMap, x0, cz, wall * 0.55, dep / 2 + 0.2, 0, wallH);
  block(walkMap, x1, cz, wall * 0.55, dep / 2 + 0.2, 0, wallH);

  // 木裙板
  for (const z of [z0 + wall * 0.55, z1 - wall * 0.55]) {
    parts.push(box(len - 0.4, 0.72, 0.08, C.dado, cx, 0, z, MAT.wood));
  }
  parts.push(box(0.08, 0.72, dep - 0.4, C.dado, x0 + wall * 0.55, 0, cz, MAT.wood));
  parts.push(box(0.08, 0.72, dep - 0.4, C.dado, x1 - wall * 0.55, 0, cz, MAT.wood));

  // 格子窗：南北壁每开间一扇，糊纸暖黄
  for (const x of COL_XS) {
    if (x < 3 || x > 47) continue;
    for (const z of [z0 + wall * 0.62, z1 - wall * 0.62]) {
      parts.push(box(1.55, 1.35, 0.05, C.paper, x, 1.55, z, MAT.lattice));
      parts.push(box(1.7, 0.08, 0.07, C.wood, x, 1.48, z, MAT.wood));
      parts.push(box(1.7, 0.08, 0.07, C.wood, x, 2.88, z, MAT.wood));
    }
  }
  // 西壁格子门（封闭，只作装饰）
  for (const z of [-3.2, 0, 3.2]) {
    parts.push(box(0.06, 2.55, 1.45, C.paper, x0 + wall * 0.62, 0.72, z, MAT.lattice));
    parts.push(box(0.08, 2.7, 1.6, C.woodMid, x0 + wall * 0.7, 0.64, z, MAT.wood));
  }

  // 柱网：覆盆础 + 朱柱 + 栌斗
  for (const x of COL_XS) {
    for (const z of COL_ZS) {
      parts.push(cyl(0.28, 0.22, C.base, x, 0, z, 10, MAT.stone));
      parts.push(cyl(0.155, h - 0.28, C.column, x, 0.2, z, 10, MAT.wood));
      parts.push(box(0.42, 0.18, 0.42, C.columnDark, x, h - 0.22, z, MAT.wood));
      parts.push(box(0.7, 0.1, 0.28, C.woodMid, x, h - 0.08, z, MAT.wood));
      walkMap.addCircle(x, z, 0.26, -0.2, h);
    }
  }

  // 额枋：沿柱列纵、横向
  for (const z of COL_ZS) {
    parts.push(box(len - 1.6, 0.28, 0.24, C.column, cx, h - 0.48, z, MAT.wood));
    parts.push(box(len - 1.4, 0.1, 0.18, C.woodLight, cx, h - 0.3, z, MAT.wood));
  }
  for (const x of COL_XS) {
    parts.push(box(0.22, 0.26, dep - 1.5, C.column, x, h - 0.48, cz, MAT.wood));
  }

  // 天花望板 + 露明椽
  parts.push(box(len - 0.2, 0.1, dep - 0.2, C.beam, cx, h - 0.02, cz, MAT.wood));
  const nRafter = 22;
  for (let i = 0; i <= nRafter; i++) {
    const x = x0 + 0.8 + ((len - 1.6) * i) / nRafter;
    parts.push(box(0.09, 0.14, dep - 0.7, C.wood, x, h - 0.18, cz, MAT.wood));
  }
  // 脊檩方向的几根大梁
  for (const z of [-2.4, 0, 2.4]) {
    parts.push(box(len - 1.2, 0.2, 0.22, C.beam, cx, h - 0.32, z, MAT.wood));
  }

  return parts;
}

function bed(spec, walkMap) {
  const { x, z, w, d, h, cloth, back, canopy } = spec;
  const parts = [];
  parts.push(box(w, h * 0.62, d, C.lacquer, x, 0, z, MAT.wood));
  // 四足
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(box(0.1, h * 0.62, 0.1, C.lacquer, x + sx * (w / 2 - 0.12), 0, z + sz * (d / 2 - 0.12), MAT.wood));
  }
  parts.push(box(w - 0.1, 0.09, d - 0.1, cloth, x, h * 0.62, z, MAT.cloth));
  // 锦褥与隐囊
  parts.push(box(0.55, 0.18, 0.38, C.silkCream, x - w * 0.28, h * 0.62 + 0.09, z - d * 0.12, MAT.cloth));
  parts.push(box(0.5, 0.16, 0.34, cloth, x + w * 0.22, h * 0.62 + 0.09, z + d * 0.08, MAT.cloth));
  if (back) {
    parts.push(box(w + 0.06, 1.35, 0.1, C.lacquer, x, h * 0.5, z - d / 2 - 0.04, MAT.wood));
    parts.push(box(w - 0.25, 1.05, 0.04, C.plasterDeep, x, h * 0.62, z - d / 2 - 0.08, MAT.plaster));
  }
  // 三面矮栏
  for (const [dx, dz, ww, dd] of [
    [0, d / 2, w, 0.06],
    [w / 2, 0, 0.06, d],
    [-w / 2, 0, 0.06, d],
  ]) {
    parts.push(box(ww, 0.28, dd, C.lacquer, x + dx, h * 0.62, z + dz, MAT.wood));
  }
  if (canopy) {
    const cy = 2.35;
    parts.push(box(w + 0.2, 0.08, d + 0.2, C.wood, x, cy, z, MAT.wood));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.push(cyl(0.04, cy, C.lacquer, x + sx * (w / 2 - 0.08), 0, z + sz * (d / 2 - 0.08), 6));
    }
    parts.push(box(w + 0.15, 1.4, 0.04, C.curtain, x, cy - 1.4, z - d / 2 - 0.08, MAT.cloth));
    parts.push(box(0.04, 1.15, d * 0.7, C.curtain, x + w / 2 + 0.08, cy - 1.15, z, MAT.cloth));
  }
  block(walkMap, x, z, w / 2 + 0.05, d / 2 + 0.08, 0, Math.max(1.1, h + 0.5));
  return parts;
}

function table(spec, walkMap) {
  const { x, z, w, d, h } = spec;
  const parts = [
    box(w, 0.07, d, C.lacquer, x, h - 0.07, z, MAT.wood),
    box(w - 0.12, 0.05, d - 0.1, C.woodMid, x, h - 0.13, z, MAT.wood),
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(box(0.07, h - 0.05, 0.07, C.lacquer, x + sx * (w / 2 - 0.1), 0, z + sz * (d / 2 - 0.1), MAT.wood));
  }
  // 盘盏壶
  parts.push(cyl(0.13, 0.04, C.celadon, x - w * 0.22, h, z - d * 0.12, 10, MAT.plain));
  parts.push(cyl(0.09, 0.05, C.dish, x + w * 0.18, h, z + d * 0.1, 10, MAT.plain));
  parts.push(cyl(0.07, 0.16, C.lacquerRed, x + w * 0.28, h, z - d * 0.18, 8, MAT.plain));
  parts.push(cyl(0.05, 0.06, C.bronze, x - w * 0.08, h, z + d * 0.18, 8, MAT.plain));
  parts.push(box(0.16, 0.05, 0.16, C.dish, x, h, z, MAT.plain));
  block(walkMap, x, z, w / 2, d / 2, 0, h + 0.35);
  return parts;
}

function drum(spec, walkMap) {
  const { x, z, r, h } = spec;
  const barrel = new CylinderGeometry(r, r * 0.96, h * 0.72, 16);
  barrel.translate(x, h * 0.5, z);
  const parts = [
    paint(barrel, C.drum, MAT.cloth),
    cyl(r * 0.82, 0.12, C.drumDark, x, 0, z, 12, MAT.wood),
    cyl(r * 1.02, 0.05, C.bronze, x, h * 0.12, z, 16, MAT.plain),
    cyl(r * 1.02, 0.05, C.bronze, x, h * 0.78, z, 16, MAT.plain),
    box(0.04, 0.55, 0.04, C.wood, x + r + 0.12, h * 0.35, z, MAT.wood),
    box(0.04, 0.08, 0.28, C.wood, x + r + 0.12, h * 0.85, z, MAT.wood),
  ];
  block(walkMap, x, z, r + 0.12, r + 0.12, 0, h);
  walkMap.addCircle(x, z, r + 0.18, -0.2, h);
  return parts;
}

function seat(spec, walkMap) {
  const { x, z, kind } = spec;
  const parts = [];
  if (kind === 'chair') {
    parts.push(box(0.58, 0.42, 0.52, C.lacquer, x, 0, z, MAT.wood));
    parts.push(box(0.54, 0.06, 0.48, C.celadon, x, 0.42, z, MAT.cloth));
    parts.push(box(0.58, 0.7, 0.08, C.lacquer, x, 0.42, z - 0.22, MAT.wood));
    parts.push(box(0.4, 0.55, 0.04, C.plasterDeep, x, 0.5, z - 0.26, MAT.cloth));
    block(walkMap, x, z, 0.32, 0.3, 0, 1.0);
  } else {
    parts.push(cyl(0.22, 0.38, C.woodMid, x, 0, z, 10, MAT.wood));
    parts.push(cyl(0.24, 0.05, C.silkCream, x, 0.38, z, 10, MAT.cloth));
    walkMap.addCircle(x, z, 0.28, -0.2, 0.55);
  }
  return parts;
}

function longBench(spec, walkMap) {
  const { x, z, w, d, h } = spec;
  const parts = [
    box(w, h - 0.06, d, C.lacquer, x, 0, z, MAT.wood),
    box(w - 0.08, 0.08, d - 0.06, C.silkCream, x, h - 0.06, z, MAT.cloth),
  ];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const lx = x - w / 2 + 0.3 + (i * (w - 0.6)) / (n - 1);
    parts.push(box(0.08, h - 0.06, 0.08, C.lacquer, lx, 0, z - d / 2 + 0.08, MAT.wood));
    parts.push(box(0.08, h - 0.06, 0.08, C.lacquer, lx, 0, z + d / 2 - 0.08, MAT.wood));
  }
  block(walkMap, x, z, w / 2, d / 2 + 0.04, 0, h + 0.4);
  return parts;
}

function screenFrame(spec, walkMap) {
  const { x, z, length, height, panels } = spec;
  const parts = [];
  const y0 = 0.08;
  const pw = length / panels;
  // 只做边框与格心，中间留空给原卷画心（勿填实心板，否则与画心共面闪烁）
  parts.push(box(0.12, 0.1, length + 0.08, C.woodMid, x, y0, z, MAT.wood));
  parts.push(box(0.12, 0.1, length + 0.08, C.woodMid, x, y0 + height - 0.1, z, MAT.wood));
  for (let i = 0; i <= panels; i++) {
    const pz = z - length / 2 + i * pw;
    parts.push(box(0.11, height, 0.07, C.wood, x, y0, pz, MAT.wood));
  }
  // 抱鼓座
  for (const s of [-1, 1]) {
    parts.push(box(0.36, 0.18, 0.28, C.woodMid, x, 0, z + s * (length / 2 - 0.1), MAT.wood));
  }
  block(walkMap, x, z, 0.22, length / 2 + 0.08, 0, height + 0.2);
  return parts;
}

function lanternBody(spec) {
  const { x, z, y } = spec;
  const parts = [];
  parts.push(cyl(0.04, 0.35, C.bronze, x, y + 0.22, z, 6, MAT.plain));
  parts.push(box(0.42, 0.08, 0.42, C.wood, x, y, z, MAT.wood));
  parts.push(box(0.42, 0.08, 0.42, C.wood, x, y - 0.55, z, MAT.wood));
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    parts.push(box(0.05, 0.55, 0.05, C.wood, x + sx * 0.18, y - 0.55, z + sz * 0.18, MAT.wood));
  }
  // 糊纸灯壁（暖色，由烛光 shader 另补火苗）
  parts.push(box(0.36, 0.46, 0.36, '#e0b56a', x, y - 0.5, z, MAT.plaster));
  parts.push(cyl(0.06, 0.18, C.bronze, x, y - 0.72, z, 6, MAT.plain));
  return parts;
}

function hangingScrolls() {
  // 东西壁小挂轴：水墨条幅的色块暗示
  const parts = [];
  const { x0, x1 } = HALL;
  const items = [
    { x: x1 - 0.28, z: -2.4, w: 0.7, h: 1.6, color: '#6a5a40' },
    { x: x1 - 0.28, z: 2.4, w: 0.7, h: 1.6, color: '#5a4a38' },
    { x: 8.9, z: HALL.z0 + 0.28, w: 0.85, h: 1.35, color: '#4a5a48' },
    { x: 27.2, z: HALL.z0 + 0.28, w: 0.85, h: 1.35, color: '#5a4840' },
    { x: 38.4, z: HALL.z0 + 0.28, w: 0.85, h: 1.35, color: '#4a4840' },
  ];
  for (const it of items) {
    const alongZ = Math.abs(it.x - x0) < 1 || Math.abs(it.x - x1) < 1;
    if (alongZ) {
      parts.push(box(0.04, it.h, it.w, it.color, it.x, 1.45, it.z, MAT.plaster));
      parts.push(box(0.05, 0.06, it.w + 0.08, C.wood, it.x, 1.45 + it.h, it.z, MAT.wood));
      parts.push(box(0.05, 0.06, it.w + 0.08, C.wood, it.x, 1.39, it.z, MAT.wood));
    } else {
      parts.push(box(it.w, it.h, 0.04, it.color, it.x, 1.45, it.z, MAT.plaster));
      parts.push(box(it.w + 0.08, 0.06, 0.05, C.wood, it.x, 1.45 + it.h, it.z, MAT.wood));
      parts.push(box(it.w + 0.08, 0.06, 0.05, C.wood, it.x, 1.39, it.z, MAT.wood));
    }
  }
  return parts;
}

const PANEL_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PANEL_FRAG = /* glsl */ `
${ATMOSPHERE_GLSL}
uniform sampler2D tMap;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec3 col = texture2D(tMap, vUv).rgb;
  // 夜宴厅里屏风略压暗，绢色偏暖
  col *= vec3(0.92, 0.86, 0.72);
  col *= 0.88 + 0.1 * vUv.y;
  gl_FragColor = vec4(applyAtmosphere(col, vWorld), 1.0);
}
`;

function makePanelMaterial(atmosphere, texture) {
  return new ShaderMaterial({
    vertexShader: PANEL_VERT,
    fragmentShader: PANEL_FRAG,
    side: DoubleSide,
    uniforms: { ...atmosphere, tMap: { value: texture } },
  });
}

function screenPanel(spec, material) {
  const { x, z, length, height, paintingU } = spec;
  const g = new PlaneGeometry(length - 0.18, height - 0.28);
  const uv = g.attributes.uv;
  const [u0, u1] = paintingU;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), uv.getY(i));
  }
  g.rotateY(Math.PI / 2);
  g.translate(x, 0.08 + (height - 0.28) / 2 + 0.1, z);
  const mesh = new Mesh(g, material);
  mesh.frustumCulled = false;
  return mesh;
}

export function createArchitecture({ atmosphere, walkMap, paintingTexture }) {
  const parts = [
    ...hallShell(walkMap),
    ...BEDS.flatMap((b) => bed(b, walkMap)),
    ...TABLES.flatMap((t) => table(t, walkMap)),
    ...DRUMS.flatMap((d) => drum(d, walkMap)),
    ...SEATS.flatMap((s) => seat(s, walkMap)),
    ...longBench(LONG_BENCH, walkMap),
    ...SCREENS.flatMap((s) => screenFrame(s, walkMap)),
    ...LANTERNS.flatMap((l) => lanternBody(l)),
    ...hangingScrolls(),
  ];

  const material = createPaintedMaterial(atmosphere);
  const mesh = new Mesh(combine(parts), material);
  mesh.frustumCulled = false;

  const panelMat = makePanelMaterial(atmosphere, paintingTexture);
  const screens = SCREENS.map((s) => screenPanel(s, panelMat));

  return { mesh, screens, material, panelMaterial: panelMat };
}
