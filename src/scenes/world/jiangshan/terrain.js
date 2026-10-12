import {
  CanvasTexture,
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector4,
} from 'three';
import { createNoise } from '../../../engine/noise.js';
import { ATMOSPHERE_GLSL, NOISE_GLSL } from '../../../engine/shaders/common.glsl.js';
import { MAIN_PATH, NORTH_PATH, NORTH_WALL, RIVER, SOUTH_WALL, LAKE_NORTH_PATH, STREAMS, STRUCTURES } from './layout.js';

import { applyCliffRelief } from './cliffRelief.js';

const noise = createNoise(7);
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

export function lerpTable(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [x0, v0] = table[i];
    const [x1, v1] = table[i + 1];
    if (x <= x1) return lerp(v0, v1, (x - x0) / (x1 - x0));
  }
  return table[table.length - 1][1];
}

/** 到江岸的有向距离（水中为负） */
export function riverDistance(x, z) {
  return riverInfo(x, z).d;
}

const _info = { d: 0, tx: 1, tz: 0, hw: 10 };
/** 江流信息：岸距 d、最近一段的流向 (tx, tz)、半宽 hw */
export function riverInfo(x, z) {
  let best = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [x0, z0, w0] = RIVER[i];
    const [x1, z1, w1] = RIVER[i + 1];
    const ex = x1 - x0, ez = z1 - z0;
    const len2 = ex * ex + ez * ez;
    let t = ((x - x0) * ex + (z - z0) * ez) / len2;
    t = Math.max(0, Math.min(1, t));
    const hw = lerp(w0, w1, t);
    const d = Math.hypot(x - (x0 + ex * t), z - (z0 + ez * t)) - hw;
    if (d < best) {
      best = d;
      const l = Math.sqrt(len2);
      _info.tx = ex / l;
      _info.tz = ez / l;
      _info.hw = hw;
    }
  }
  // 瀑布下的溪涧：与江流同样处理（刻出河床、两岸、水流方向）
  for (const st of STREAMS) {
    const pts = st.points;
    // 源头水潭
    if (st.pool) {
      const d = Math.hypot(x - pts[0][0], (z - pts[0][1]) * 1.3) - st.pool;
      if (d < best) {
        best = d;
        _info.tx = 0;
        _info.tz = 1;
        _info.hw = 30;
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const ex = x1 - x0, ez = z1 - z0;
      const len2 = ex * ex + ez * ez;
      let t = ((x - x0) * ex + (z - z0) * ez) / len2;
      t = Math.max(0, Math.min(1, t));
      const hw = st.width / 2;
      const d = Math.hypot(x - (x0 + ex * t), z - (z0 + ez * t)) - hw;
      if (d < best) {
        best = d;
        const l = Math.sqrt(len2);
        _info.tx = ex / l;
        _info.tz = ez / l;
        _info.hw = hw * 2.2;
      }
    }
  }
  _info.d = best;
  return _info;
}

/** 到溪涧（含源头水潭）的有向距离 */
function streamDistance(x, z) {
  let best = Infinity;
  for (const st of STREAMS) {
    const pts = st.points;
    if (st.pool) best = Math.min(best, Math.hypot(x - pts[0][0], (z - pts[0][1]) * 1.3) - st.pool);
    best = Math.min(best, segDist(pts, x, z) - st.width / 2);
  }
  return best;
}

/** 水流：方向沿江而下，窄处急、湖面与宽阔江面缓，近岸更慢（米 / 秒） */
export function riverFlow(x, z) {
  const { d, tx, tz, hw } = riverInfo(x, z);
  const speed = Math.min(1.4, 9 / hw) * smoothstep(0.5, 5, -d);
  return { x: tx * speed, z: tz * speed, speed };
}

function segDist(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const ex = x1 - x0, ez = z1 - z0;
    let t = ((x - x0) * ex + (z - z0) * ez) / (ex * ex + ez * ez);
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - x0 - ex * t, z - z0 - ez * t);
    if (d < best) best = d;
  }
  return best;
}

const PLANK = STRUCTURES.plankRoad.map(([x, z]) => [x, z]);
/** 栈道内侧（靠山一侧）板边的 z：栈道宽 2.2，崖脚再退 5 cm */
const PLANK_INNER = (x) => lerpTable(PLANK, x) - 1.15;
const WOOD_BRIDGE = [[STRUCTURES.woodBridge.x, STRUCTURES.woodBridge.z0], [STRUCTURES.woodBridge.x, STRUCTURES.woodBridge.z1]];

/** 到道路、桥、栈道（及江村晒场）的距离：这些地方附近保持平整，不起土丘 */
export function pathDistance(x, z) {
  if (x < -300 || x > 260 || z < -110 || z > 110) return 999;
  const yard = Math.hypot((x - 160) / 1.8, z - 42) - 12;
  return Math.min(
    segDist(MAIN_PATH, x, z),
    segDist(NORTH_PATH, x, z),
    segDist(LAKE_NORTH_PATH, x, z),
    segDist(PLANK, x, z) - 2,
    segDist(WOOD_BRIDGE, x, z) - 1,
    yard,
  );
}

/** 陡起后渐缓的山体抬升：H 最终高度，k 陡峭程度 */
const rise = (u, H, k) => H * (1 - Math.exp(-u / k));

/**
 * 原始地形高度（米）。withRough=false 时不含小尺度的土丘起伏 ——
 * 行走的坡度判断只看大地形，土丘再陡也能走上去，不会成为“空气墙”。
 */
function rawHeight(x, z, withRough = true) {
  const d = riverDistance(x, z);
  const n1 = noise.fbm2(x * 0.011, z * 0.011, 4);
  const n2 = noise.noise2(x * 0.045, z * 0.045);

  // 岸：近水低平，向外缓起丘陵
  let land = 0.35 + 1.5 * smoothstep(0, 12, d) + (n1 * 2.6 + 1.2) * smoothstep(3, 30, d) + n2 * 0.25;

  // 崎岖：土丘、岩脊与坡岸层阶（原作坡岸层层叠叠），道路两旁渐平
  const rough = withRough ? smoothstep(2.5, 8, pathDistance(x, z)) * smoothstep(1.5, 9, d) : 0;
  if (rough > 0) {
    // 圆浑的土丘（不出尖），叠一点细碎起伏
    const m = noise.fbm2(x * 0.026 + 5, z * 0.026 - 3, 2);
    const mound = smoothstep(-0.05, 0.75, m) * 2.4 + noise.noise2(x * 0.11, z * 0.11) * 0.35 + noise.noise2(x * 0.3, z * 0.3) * 0.06;
    const base = land;
    land += mound * rough;
    // 坡岸层阶：轻微的分层，只作画意
    const t = (land - base) / 0.6;
    const stepped = base + (Math.floor(t) + smoothstep(0.25, 0.75, t - Math.floor(t))) * 0.6;
    land = lerp(land, stepped, 0.35 * rough * smoothstep(40, 20, d));
  }

  // 北侧山崖：陡起，崖顶为起伏台地
  // 栈道、层台一段的崖脚须贴紧栈道内侧，不加随机起伏
  const steady = smoothstep(20, 32, x) * (1 - smoothstep(124, 136, x));
  // 栈道一段：崖脚紧贴栈道内侧板边，崖壁近乎直立（依山而建）
  const hug = smoothstep(30, 38, x) * (1 - smoothstep(94, 100, x));
  const wallZ = lerp(lerpTable(NORTH_WALL, x), PLANK_INNER(x), hug);
  const nw = wallZ + noise.noise2(x * 0.02, 3.1) * 5 * (1 - steady);
  const un = nw - z;
  if (un > 0) land += rise(un, 50 + n1 * 14, lerp(10, 2.6, hug)) + noise.noise2(x * 0.05, z * 0.05) * Math.min(un, 12) * 0.35 * (1 - hug * 0.7);

  // 南侧山丘：较缓
  const sw = lerpTable(SOUTH_WALL, x) + noise.noise2(x * 0.017, 9.7) * 7;
  const us = z - sw;
  if (us > 0) land += rise(us, 30 + n1 * 10, 24);

  // 西端峡口、东南岬角
  if (x < -268) land += rise(-268 - x, 40, 12);
  if (x > 238) land += rise(x - 238, 22, 16) * smoothstep(0, 24, d);

  // 远方：更大的起伏
  const r = Math.hypot(x, z);
  if (r > 420) land += (noise.fbm2(x * 0.0022, z * 0.0022, 3) * 0.5 + 0.5) * 70 * smoothstep(420, 1000, r);

  // 水下河床
  if (d < 4) {
    const bed = -Math.min(3.4, 0.4 + Math.max(0, -d) * 0.28);
    land = lerp(bed, land, smoothstep(-2.5, 4, d));
  }
  // 溪涧：在崖脚、坡上都刻出一道低于水面的涧槽，水面自然灌满
  const sd = streamDistance(x, z);
  if (sd < 4) land = Math.min(land, lerp(-0.85, land, smoothstep(-0.7, 3.5, sd)));
  return land;
}

/**
 * 屋基：在建筑占地处平整出一块台地，四周缓坡接回原地形。
 * [x, z, 半宽, 半深, 朝向]
 */
const PADS = (() => {
  const S = STRUCTURES;
  const list = [
    [S.lakeHall.x, S.lakeHall.z, S.lakeHall.w / 2 + 1.2, S.lakeHall.d / 2 + 1.2, S.lakeHall.angle],
    [S.pavilion.x, S.pavilion.z, S.pavilion.size / 2 + 1, S.pavilion.size / 2 + 1, S.pavilion.angle],
    [S.temple.x, S.temple.z, 6, 4.5, S.temple.angle],
    [S.temple.x + 11, S.temple.z + 3, 3, 3, 0.3],
    [S.temple.x - 10, S.temple.z - 4, 3.8, 3.2, 0.2],
    [S.pagoda.x, S.pagoda.z, 4.5, 4.5, 0.3],
    ...S.village.map((v) => [v.x, v.z, v.type === 'house' ? 5.4 : v.type === 'shed' ? 2.9 : 3.9, v.type === 'house' ? 4 : v.type === 'shed' ? 2.4 : 3, v.angle]),
  ];
  const pads = list.map(([x, z, hw, hd, a]) => ({ x, z, hw, hd, c: Math.cos(a), s: Math.sin(a), y: rawHeight(x, z), r: Math.hypot(hw, hd) + 7, blend: 6 }));
  // 层台：自山脚垒起的石台，与身后山崖连成一体（只抬高、不挖低）
  const t = S.terrace;
  pads.push({ x: t.cx, z: t.cz, hw: t.hx, hd: t.hz, c: 1, s: 0, y: t.y, r: Math.hypot(t.hx, t.hz) + 6, blend: 3.2, raise: true });
  return pads;
})();

function applyPads(x, z, h) {
  for (const p of PADS) {
    const dx = x - p.x, dz = z - p.z;
    if (Math.abs(dx) > p.r || Math.abs(dz) > p.r) continue;
    const lx = Math.abs(dx * p.c - dz * p.s) - p.hw;
    const lz = Math.abs(dx * p.s + dz * p.c) - p.hd;
    const out = Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
    const k = 1 - smoothstep(0, p.blend, out);
    if (k <= 0) continue;
    h = p.raise ? Math.max(h, lerp(h, p.y, Math.pow(k, 0.6))) : lerp(h, p.y, k);
  }
  return h;
}

/** 全局地形高度（米） */
export function heightAt(x, z) {
  return applyPads(x, z, rawHeight(x, z));
}

/** 判断坡度用的地形高度：不含小土丘 */
export function walkSlopeHeight(x, z) {
  return applyPads(x, z, rawHeight(x, z, false));
}

/* ------------------------------------------------------------------ */
/* 地形网格                                                            */
/* ------------------------------------------------------------------ */
export const INNER = { minX: -340, maxX: 300, minZ: -230, maxZ: 210, step: 1.25 };

function gridMesh(minX, maxX, minZ, maxZ, step, heightFn) {
  const w = maxX - minX, d = maxZ - minZ;
  const geo = new PlaneGeometry(w, d, Math.round(w / step), Math.round(d / step));
  geo.rotateX(-Math.PI / 2);
  geo.translate(minX + w / 2, 0, minZ + d / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightFn(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  geo.deleteAttribute('uv');
  return geo;
}

/** 路径遮罩：画在 canvas 上，地形着色时显出浅色土路 */
function createPathTexture() {
  const S = 2; // 像素 / 米
  const W = (INNER.maxX - INNER.minX) * S, H = (INNER.maxZ - INNER.minZ) * S;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  const draw = (pts, width, alpha) => {
    g.strokeStyle = `rgba(255,255,255,${alpha})`;
    g.lineWidth = width * S;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.filter = `blur(${S * 0.9}px)`;
    g.beginPath();
    pts.forEach(([x, z], i) => {
      const px = (x - INNER.minX) * S, pz = (z - INNER.minZ) * S;
      if (i === 0) g.moveTo(px, pz);
      else g.lineTo(px, pz);
    });
    g.stroke();
  };
  draw(MAIN_PATH, 3.4, 0.9);
  draw(NORTH_PATH, 2.4, 0.8);
  draw(LAKE_NORTH_PATH, 2.4, 0.8);
  // 江村晒场
  g.filter = `blur(${S * 3}px)`;
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath();
  g.ellipse((160 - INNER.minX) * S, (42 - INNER.minZ) * S, 26 * S, 14 * S, 0.2, 0, Math.PI * 2);
  g.fill();
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  return tex;
}

/**
 * 水面数据图（RGBA）：R 水深，G/B 流向，A 流速 —— 供水面着色与流动。
 */
export const WATER_RECT = { minX: -460, maxX: 700, minZ: -420, maxZ: 420 };
function createDepthTexture() {
  const step = 2;
  const W = (WATER_RECT.maxX - WATER_RECT.minX) / step;
  const H = (WATER_RECT.maxZ - WATER_RECT.minZ) / step;
  const data = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) {
    const z = WATER_RECT.minZ + j * step;
    for (let i = 0; i < W; i++) {
      const x = WATER_RECT.minX + i * step;
      // 先用江岸距离粗筛，远离江水的格子不必计算完整高度
      const rd = riverDistance(x, z);
      const h = rd > 6 ? 5 : heightAt(x, z);
      const f = riverFlow(x, z);
      const k = (j * W + i) * 4;
      data[k] = Math.round(Math.min(1, Math.max(0, -h / 3.4)) * 255);
      const sp = f.speed || 1e-6;
      data[k + 1] = Math.round((f.x / sp) * 127.5 + 127.5);
      data[k + 2] = Math.round((f.z / sp) * 127.5 + 127.5);
      data[k + 3] = Math.round(Math.min(1, f.speed / 1.5) * 255);
    }
  }
  const tex = new DataTexture(data, W, H, RGBAFormat, UnsignedByteType);
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

const TERRAIN_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const TERRAIN_FRAG = /* glsl */ `
${NOISE_GLSL}
${ATMOSPHERE_GLSL}
uniform sampler2D tBrush;
uniform sampler2D tPath;
uniform vec4 uPathRect;
uniform float uBrushMean;
varying vec3 vWorld;
varying vec3 vNormal;

vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }

// 原画笔触（三向投影），归一成围绕 0 的明暗起伏
float brush(vec3 p, vec3 n, float scale) {
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  float a = dot(texture2D(tBrush, p.zy / scale).rgb, vec3(0.333));
  float b = dot(texture2D(tBrush, p.xz / scale).rgb, vec3(0.333));
  float c = dot(texture2D(tBrush, p.xy / scale).rgb, vec3(0.333));
  return (a * w.x + b * w.y + c * w.z) / uBrushMean - 1.0;
}

void main() {
  vec3 n = normalize(vNormal);
  float slope = 1.0 - n.y;
  vec2 xz = vWorld.xz;
  float nA = snoise(xz * 0.016);
  float nB = snoise(xz * 0.07 + 7.0);
  float nD = snoise(xz * 0.004 + 3.0);

  vec3 ochre = srgb(vec3(0.82, 0.71, 0.52));
  vec3 ochreDeep = srgb(vec3(0.68, 0.55, 0.37));
  vec3 green = srgb(vec3(0.63, 0.72, 0.58));
  vec3 teal = srgb(vec3(0.48, 0.65, 0.61));
  vec3 sand = srgb(vec3(0.88, 0.83, 0.69));

  // 平地：赭黄绢地上一片片青绿晕染
  float wash = smoothstep(-0.35, 0.55, nA + nD * 0.5);
  vec3 col = mix(ochre, green, wash * 0.78);
  col = mix(col, teal, smoothstep(0.45, 1.0, nA + nD * 0.3) * 0.45);
  col = mix(col, ochreDeep, smoothstep(0.25, 0.95, nB) * 0.3);
  col *= 1.0 + brush(vWorld, n, 12.0) * 0.42;

  // 坡岸的流动轮廓线（披麻皴意）
  float iv = (nA * 0.7 + nB * 0.3) * 5.0 + vWorld.y * 0.35;
  float iso = abs(fract(iv) - 0.5);
  float fw = fwidth(iv) * 1.2;
  float broken = smoothstep(0.0, 0.5, snoise(xz * 0.08 + 11.0));
  float contour = (1.0 - smoothstep(0.0, max(fw, 0.015), iso)) * broken * smoothstep(0.06, 0.25, slope)
    * (1.0 - smoothstep(30.0, 120.0, length(vWorld - cameraPosition)));
  col *= 1.0 - contour * 0.2;

  // 陡坡：作崖石处理
  float cliff = smoothstep(0.1, 0.42, slope);
  float nC2 = snoise(vWorld * 0.06);
  vec3 mineral = mix(srgb(vec3(0.54, 0.69, 0.59)), srgb(vec3(0.38, 0.57, 0.64)), nC2 * 0.5 + 0.5);
  vec3 cliffCol = mix(srgb(vec3(0.72, 0.57, 0.38)), mineral, clamp(vWorld.y / 38.0 + nA * 0.35 - 0.05, 0.0, 1.0));
  float cun = pow(1.0 - abs(snoise(vec3(vWorld.x * 0.11, vWorld.y * 0.03, vWorld.z * 0.11))), 8.0);
  float ledge = smoothstep(0.1, 0.0, abs(sin(vWorld.y * 0.32 + snoise(vWorld * 0.03) * 2.0)));
  float moss = smoothstep(0.62, 0.8, snoise(vWorld * 0.5)) * smoothstep(0.55, 0.25, slope);
  cliffCol *= (1.0 - cun * 0.5) * (1.0 - ledge * 0.25) * (1.0 + brush(vWorld, n, 22.0) * 0.8);
  cliffCol = mix(cliffCol, srgb(vec3(0.2, 0.27, 0.22)), moss * 0.6);
  // 近看时补一层细笔触
  float near = 1.0 - smoothstep(8.0, 45.0, length(vWorld - cameraPosition));
  cliffCol *= 1.0 + brush(vWorld + 13.0, n, 6.0) * 0.4 * near;
  col = mix(col, cliffCol, cliff);

  // 土路
  float path = texture2D(tPath, (xz - uPathRect.xy) / uPathRect.zw).r;
  col = mix(col, srgb(vec3(0.86, 0.79, 0.63)) * (1.0 + brush(vWorld, n, 7.0) * 0.15), path * 0.75 * (1.0 - cliff));

  // 近水沙岸、水下变深
  float shore = 1.0 - smoothstep(0.05, 0.8, vWorld.y);
  col = mix(col, sand, shore * 0.5 * (1.0 - cliff));
  col *= mix(1.0, 0.6, smoothstep(0.0, -1.6, vWorld.y));

  // 草点：细碎的横向短笔
  float dash = snoise(vec2(xz.x * 1.1, xz.y * 3.2));
  float marks = smoothstep(0.8, 0.92, dash) * smoothstep(-0.2, 0.4, nB) * (1.0 - cliff) * (1.0 - path) * step(0.35, vWorld.y);
  col = mix(col, srgb(vec3(0.32, 0.41, 0.33)), marks * 0.55);

  col *= paintLight(n);
  gl_FragColor = vec4(applyAtmosphere(col, vWorld), 1.0);
}
`;

export function createTerrain({ atmosphere, brushTexture }) {
  const pathTexture = createPathTexture();
  const depthTexture = createDepthTexture();

  const material = new ShaderMaterial({
    vertexShader: TERRAIN_VERT,
    fragmentShader: TERRAIN_FRAG,
    uniforms: {
      ...atmosphere,
      tBrush: { value: brushTexture },
      tPath: { value: pathTexture },
      uPathRect: { value: new Vector4(INNER.minX, INNER.minZ, INNER.maxX - INNER.minX, INNER.maxZ - INNER.minZ) },
    },
  });

  const innerGeometry = gridMesh(INNER.minX, INNER.maxX, INNER.minZ, INNER.maxZ, INNER.step, heightAt);
  applyCliffRelief(innerGeometry);
  const inner = new Mesh(innerGeometry, material);

  // 外圈低精度地形（顶点间距 26 m）：内圈深处整片沉到地下，
  // 否则它的大三角面会在陡崖附近插值到地面以上，盖住溪涧、湖岸，形成直边的“尖锥”。
  // 只在内圈边缘一带略低于真实地形，衔接远景。
  const outerGeo = gridMesh(-2600, 2600, -2600, 2600, 26, (x, z) => {
    const edge = Math.min(x - INNER.minX, INNER.maxX - x, z - INNER.minZ, INNER.maxZ - z);
    if (edge > 40) return -120;
    return heightAt(x, z) - (edge > 4 ? 3 : 0);
  });
  const outer = new Mesh(outerGeo, material);

  return { meshes: [inner, outer], material, depthTexture, pathTexture };
}
