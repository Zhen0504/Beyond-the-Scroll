import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { MAT, box, cyl, paint } from '../../../engine/painted.js';
import { NOISE_GLSL } from '../../../engine/shaders/common.glsl.js';
import { CAVE, MURAL } from './layout.js';

/**
 * 洞窟空间：莫高窟第257窟。
 *
 * 依敦煌研究院网站对第257窟的记述布置：
 *   · 前部人字披顶，后部平棋顶，有中心塔柱（柱东向面开一大龛）
 *   · 窟壁绘画分三段：上绘天宫伎乐，中绘千佛和佛经故事，下绘药叉
 *   · 顶面人字披椽间绘莲花供养菩萨
 *
 * 千佛、伎乐、药叉与椽间图案均以程序化方式生成 —— 这正是重复性
 * 图案适合的做法，也避免依赖外部素材。人物为剪影化的意象，不作造像复原。
 *
 * 以上为观览需要的排布，不作石窟形制的考古复原。
 */

const C = {
  wall: '#5a4234',
  wallDeep: '#3d2c23',
  floor: '#4a3f33',
  ceiling: '#2f2620',
  rafter: '#6a4a33',
  rafterDeep: '#40291d',
  pillar: '#7a5c42',
  pillarDark: '#553d2c',
  niche: '#241c17',
  frame: '#8a6a4a',
  frameDeep: '#5a4230',
  lamp: '#8a7048',
  // 壁画用色（与画作一致）
  tuhong: '#8f4a35',
  shiqing: '#3f6f92',
  shilv: '#6f9c7a',
  zhusha: '#a8443a',
  haibai: '#e0d9c6',
  ink: '#2b2620',
  gold: '#b9924f',
};

/* ------------------------------------------------------------------ *
 *  几何合并
 * ------------------------------------------------------------------ */

function mergeAll(pieces) {
  const positions = [];
  const normals = [];
  const colors = [];
  const mats = [];
  for (const g of pieces) {
    if (g.index) {
      const idx = g.index.array;
      const pos = g.attributes.position;
      const nor = g.attributes.normal;
      const col = g.attributes.color;
      const am = g.attributes.aMat;
      for (let i = 0; i < idx.length; i++) {
        const k = idx[i];
        positions.push(pos.getX(k), pos.getY(k), pos.getZ(k));
        normals.push(nor.getX(k), nor.getY(k), nor.getZ(k));
        colors.push(col.getX(k), col.getY(k), col.getZ(k));
        mats.push(am ? am.getX(k) : 0);
      }
    } else {
      positions.push(...g.attributes.position.array);
      normals.push(...g.attributes.normal.array);
      colors.push(...g.attributes.color.array);
      const am = g.attributes.aMat;
      const n = g.attributes.position.count;
      if (am) mats.push(...am.array);
      else for (let i = 0; i < n; i++) mats.push(0);
    }
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  out.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  out.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  out.setAttribute('aMat', new BufferAttribute(new Float32Array(mats), 1));
  return out;
}

/* ------------------------------------------------------------------ *
 *  洞窟材质
 * ------------------------------------------------------------------ */

const CAVE_FRAG = /* glsl */ `
${NOISE_GLSL}
varying vec3 vColor;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vMat;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec3 p = vWorld;
  vec3 n = normalize(vNormal);
  vec3 c = vColor;

  // 岩面的粗粝与烟熏
  float grain = fbm(p.xz * 9.0 + p.y * 1.4);
  c *= 0.90 + grain * 0.18;

  // 壁画墙一侧略亮，形成观览中心；远离处沉入暗部
  float toward = smoothstep(7.5, 1.0, abs(p.z));
  c *= 0.80 + toward * 0.30;

  // 高处与角落压暗
  c *= 0.78 + 0.22 * smoothstep(-0.7, 3.4, p.y);

  // 灯火的暖色微光：靠近灯盏处偏暖
  float warm = smoothstep(3.2, 0.0, abs(p.x)) * smoothstep(2.6, 0.0, abs(p.y - 1.2));
  c = mix(c, c * vec3(1.14, 1.02, 0.86), warm * 0.35);

  float fog = smoothstep(10.0, 30.0, distance(cameraPosition, p));
  c = mix(c, vec3(0.17, 0.13, 0.11), fog * 0.86);

  gl_FragColor = vec4(c, 1.0);
}
`;

function caveMaterial() {
  return new ShaderMaterial({
    side: DoubleSide,
    vertexShader: `
      attribute vec3 color; attribute float aMat;
      varying vec3 vColor; varying vec3 vWorld; varying vec3 vNormal; varying float vMat;
      void main(){
        vColor = color; vMat = aMat;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 p = modelMatrix * vec4(position, 1.0);
        vWorld = p.xyz;
        gl_Position = projectionMatrix * viewMatrix * p;
      }
    `,
    fragmentShader: CAVE_FRAG,
  });
}

/* ------------------------------------------------------------------ *
 *  程序化壁画图案
 * ------------------------------------------------------------------ */

/**
 * 千佛：成行的小坐佛剪影，赭红底、青绿头光、白色身光。
 * 用具象几何而非贴图，近看能辨出人形，远看是重复的列。
 */
function thousandBuddha({ x0, x1, y0, y1, cols, rows, z, faceZ = 1 }) {
  const pieces = [];
  const spanX = x1 - x0;
  const spanY = y1 - y0;
  const cw = spanX / cols;
  const ch = spanY / rows;
  const palettes = [
    [C.shiqing, C.tuhong, C.haibai],
    [C.shilv, C.tuhong, C.haibai],
    [C.shiqing, C.zhusha, C.haibai],
  ];
  let seed = 1;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = x0 + cw * (c + 0.5);
      const cy = y0 + ch * (r + 0.5);
      const s = Math.min(cw, ch) * 0.62;
      const pal = palettes[(r * 3 + c) % palettes.length];

      // 头光
      const halo = new SphereGeometry(s * 0.34, 8, 6);
      halo.scale(1, 1, 0.16);
      halo.translate(cx, cy + s * 0.20, z);
      pieces.push(paint(halo, pal[0], MAT.plaster));

      // 身（坐姿剪影）
      const body = new CylinderGeometry(s * 0.10, s * 0.30, s * 0.44, 7);
      body.translate(cx, cy - s * 0.28, z);
      pieces.push(paint(body, pal[1], MAT.cloth));

      // 头
      const head = new SphereGeometry(s * 0.15, 7, 6);
      head.scale(1, 1.1, 0.5);
      head.translate(cx, cy + s * 0.16, z);
      pieces.push(paint(head, pal[2], MAT.plaster));

      // 轻微错落，避免机械感
      if (rnd() > 0.72) {
        const fleck = new BoxGeometry(s * 0.12, s * 0.12, 0.02);
        fleck.translate(cx + (rnd() - 0.5) * cw * 0.5, cy + (rnd() - 0.5) * ch * 0.5, z + 0.01 * faceZ);
        pieces.push(paint(fleck, C.wallDeep, MAT.plaster));
      }
    }
  }
  return pieces;
}

/** 天宫伎乐：栏墙之上的一列奏乐天人与圆拱龛 */
function heavenlyMusicians({ x0, x1, y, cols, z }) {
  const pieces = [];
  const spanX = x1 - x0;
  const cw = spanX / cols;

  // 栏墙
  const rail = new BoxGeometry(spanX, 0.16, 0.10);
  rail.translate((x0 + x1) / 2, y - 0.30, z);
  pieces.push(paint(rail, C.frameDeep, MAT.stone));

  for (let i = 0; i < cols; i++) {
    const cx = x0 + cw * (i + 0.5);
    const s = cw * 0.5;

    // 圆拱龛
    const arch = new CylinderGeometry(s * 0.44, s * 0.44, 0.06, 12, 1, false, 0, Math.PI);
    arch.rotateZ(Math.PI / 2);
    arch.rotateY(Math.PI / 2);
    arch.translate(cx, y, z - 0.02);
    pieces.push(paint(arch, i % 2 ? C.shiqing : C.shilv, MAT.plaster));

    // 天人剪影
    const torso = new CylinderGeometry(s * 0.10, s * 0.20, s * 0.40, 6);
    torso.translate(cx, y - 0.06, z + 0.03);
    pieces.push(paint(torso, C.ink, MAT.cloth));

    const head = new SphereGeometry(s * 0.13, 6, 5);
    head.translate(cx, y + 0.14, z + 0.03);
    pieces.push(paint(head, C.haibai, MAT.plaster));

    // 飘带
    const scarf = new BoxGeometry(s * 0.9, 0.035, 0.02);
    scarf.rotateZ(i % 2 ? 0.22 : -0.22);
    scarf.translate(cx, y - 0.22, z + 0.05);
    pieces.push(paint(scarf, i % 2 ? C.shilv : C.shiqing, MAT.cloth));
  }
  return pieces;
}

/** 药叉：壁面下段的承托者，屈膝托举之姿 */
function yakshas({ x0, x1, y, cols, z }) {
  const pieces = [];
  const spanX = x1 - x0;
  const cw = spanX / cols;
  for (let i = 0; i < cols; i++) {
    const cx = x0 + cw * (i + 0.5);
    const s = cw * 0.5;
    const squat = new CylinderGeometry(s * 0.30, s * 0.42, s * 0.5, 6);
    squat.translate(cx, y + s * 0.24, z);
    pieces.push(paint(squat, i % 3 === 0 ? C.tuhong : C.wallDeep, MAT.cloth));
    const head = new SphereGeometry(s * 0.20, 6, 5);
    head.translate(cx, y + s * 0.60, z);
    pieces.push(paint(head, C.wallDeep, MAT.cloth));
  }
  return pieces;
}

/** 边饰：连续的忍冬／卷草纹带，以重复的弧形几何构成 */
function borderBand({ x0, x1, y, height, z, color, step = 0.34 }) {
  const pieces = [];
  const n = Math.max(2, Math.round((x1 - x0) / step));
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const cx = x0 + w * (i + 0.5);
    const leaf = new SphereGeometry(w * 0.34, 6, 4, 0, Math.PI * 2, 0, Math.PI / 1.6);
    leaf.scale(1, height / (w * 0.68), 0.22);
    leaf.rotateZ(i % 2 ? Math.PI : 0);
    leaf.translate(cx, y, z);
    pieces.push(paint(leaf, i % 2 ? color : C.haibai, MAT.plaster));
  }
  return pieces;
}

/** 平棋顶：方格内的莲花与飞天意象 */
function cofferedCeiling({ x0, x1, z0, z1, y, cols, rows }) {
  const pieces = [];
  const spanX = x1 - x0;
  const spanZ = z1 - z0;
  const cw = spanX / cols;
  const cd = spanZ / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = x0 + cw * (c + 0.5);
      const cz = z0 + cd * (r + 0.5);

      // 椽格
      const cell = new BoxGeometry(cw * 0.92, 0.06, cd * 0.92);
      cell.translate(cx, y - 0.03, cz);
      pieces.push(paint(cell, C.ceiling, MAT.plaster));

      // 莲花
      const lotus = new CylinderGeometry(cw * 0.16, cw * 0.06, 0.07, 8);
      lotus.translate(cx, y - 0.08, cz);
      pieces.push(paint(lotus, (r + c) % 2 ? C.shiqing : C.shilv, MAT.plaster));

      const core = new SphereGeometry(cw * 0.07, 6, 5);
      core.translate(cx, y - 0.12, cz);
      pieces.push(paint(core, C.zhusha, MAT.plaster));
    }
  }
  return pieces;
}

/** 人字披：两坡的椽条，椽间绘莲花供养菩萨 */
function gabledCeiling({ halfWidth, z0, z1, yTop, ySide }) {
  const pieces = [];
  const n = 20;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const z = z0 + (z1 - z0) * t;
    for (const s of [-1, 1]) {
      // 椽条
      const len = Math.hypot(halfWidth, yTop - ySide);
      const rafter = new BoxGeometry(0.14, 0.10, len);
      rafter.rotateX(Math.PI / 2);
      rafter.rotateY(Math.atan2(halfWidth, yTop - ySide));
      rafter.translate(s * halfWidth * 0.5, (yTop + ySide) * 0.5, z);
      pieces.push(paint(rafter, C.rafter, MAT.wood));

      // 椽间的莲花供养菩萨（间隔布置，避免过密）
      if (i % 3 === 1) {
        const cx = s * halfWidth * 0.42;
        const cy = (yTop + ySide) * 0.5 + 0.16;
        const halo = new SphereGeometry(0.16, 6, 5);
        halo.scale(1, 1, 0.3);
        halo.translate(cx, cy, z);
        pieces.push(paint(halo, s > 0 ? C.shilv : C.shiqing, MAT.plaster));

        const body = new CylinderGeometry(0.045, 0.11, 0.2, 6);
        body.translate(cx, cy - 0.16, z);
        pieces.push(paint(body, C.tuhong, MAT.cloth));
      }
    }
  }
  return pieces;
}

/* ------------------------------------------------------------------ *
 *  中心塔柱
 * ------------------------------------------------------------------ */

function centralPillar({ z, x = 0, w = 2.2, h = 3.5 }) {
  const pieces = [];
  const half = w / 2;

  // 柱身
  const shaft = new BoxGeometry(w, h, w);
  shaft.translate(x, h / 2 + CAVE.floorY, z);
  pieces.push(paint(shaft, C.pillar, MAT.stone));

  // 各面的龛
  const faces = [
    { dx: 0, dz: half, ry: 0 },
    { dx: 0, dz: -half, ry: Math.PI },
    { dx: half, dz: 0, ry: Math.PI / 2 },
    { dx: -half, dz: 0, ry: -Math.PI / 2 },
  ];
  faces.forEach((f, i) => {
    // 阙形龛的框
    const frameW = w * 0.72;
    const niche = new BoxGeometry(frameW, h * 0.52, 0.14);
    niche.rotateY(f.ry);
    niche.translate(x + f.dx * 1.02, h * 0.58 + CAVE.floorY, z + f.dz * 1.02);
    pieces.push(paint(niche, C.niche, MAT.plaster));

    // 龛内的禅定佛像
    const s = w * 0.30;
    const body = new CylinderGeometry(s * 0.30, s * 0.52, s * 0.62, 8);
    body.rotateY(f.ry);
    body.translate(x + f.dx * 1.12, h * 0.46 + CAVE.floorY, z + f.dz * 1.12);
    pieces.push(paint(body, i % 2 ? C.tuhong : C.shilv, MAT.cloth));

    const head = new SphereGeometry(s * 0.24, 8, 6);
    head.rotateY(f.ry);
    head.translate(x + f.dx * 1.12, h * 0.62 + CAVE.floorY, z + f.dz * 1.12);
    pieces.push(paint(head, C.haibai, MAT.plaster));

    // 头光
    const halo = new SphereGeometry(s * 0.56, 8, 6);
    halo.scale(1, 1, 0.18);
    halo.rotateY(f.ry);
    halo.translate(x + f.dx * 1.06, h * 0.63 + CAVE.floorY, z + f.dz * 1.06);
    pieces.push(paint(halo, i % 2 ? C.shiqing : C.gold, MAT.plaster));
  });

  // 柱顶的斗与叠涩
  for (let k = 0; k < 3; k++) {
    const size = w * (1.12 - k * 0.10);
    const ring = new BoxGeometry(size, 0.12, size);
    ring.translate(x, h + CAVE.floorY + 0.10 + k * 0.14, z);
    pieces.push(paint(ring, C.frameDeep, MAT.stone));
  }

  return { pieces, half, h };
}

/* ------------------------------------------------------------------ *
 *  组装
 * ------------------------------------------------------------------ */

export function createArchitecture({ walkMap }) {
  const group = new Group();
  const mat = caveMaterial();
  const pieces = [];

  const hw = CAVE.halfWidth;
  const depth = CAVE.depth;
  const y0 = CAVE.floorY;
  const y1 = CAVE.ceilingY;

  // 地面
  const floorGeo = new PlaneGeometry(hw * 2, depth);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, y0, depth / 2 - MURAL.z);
  pieces.push(paint(floorGeo, C.floor, MAT.stone));

  // 两侧壁（含三段式壁画）
  for (const s of [-1, 1]) {
    const wall = new PlaneGeometry(depth, y1 - y0);
    wall.rotateY((s * Math.PI) / 2);
    wall.translate(s * hw, (y0 + y1) / 2, depth / 2 - MURAL.z);
    pieces.push(paint(wall, C.wallDeep, MAT.plaster));

    const face = s * (hw - 0.03);
    const fx = (a, b) => (s > 0 ? [a, b] : [-b, -a]);
    const [za, zb] = fx(-2.2, 3.4);

    // 上：天宫伎乐
    pieces.push(...heavenlyMusicians({ x0: za, x1: zb, y: 3.05, cols: 9, z: face }));
    // 中：千佛
    pieces.push(
      ...thousandBuddha({ x0: za, x1: zb, y0: 1.55, y1: 2.85, cols: 12, rows: 4, z: face }),
    );
    // 中段的佛经故事（以较大的剪影示意）
    pieces.push(...heavenlyMusicians({ x0: za + 1.2, x1: za + 2.9, y: 1.35, cols: 3, z: face }));
    // 下：药叉
    pieces.push(...yakshas({ x0: za, x1: zb, y: y0 + 0.10, cols: 8, z: face }));
    // 边饰
    pieces.push(...borderBand({ x0: za, x1: zb, y: 2.72, height: 0.22, z: face, color: C.shiqing }));
    pieces.push(...borderBand({ x0: za, x1: zb, y: 1.42, height: 0.20, z: face, color: C.shilv }));
  }

  // 后壁（壁画本身的背衬）
  const back = new PlaneGeometry(hw * 2, y1 - y0);
  back.translate(0, (y0 + y1) / 2, MURAL.z - 0.06);
  pieces.push(paint(back, C.wall, MAT.plaster));

  // 后壁上段的千佛与伎乐（壁画之上、顶面之下）
  pieces.push(
    ...thousandBuddha({
      x0: -hw + 0.3,
      x1: hw - 0.3,
      y0: MURAL.cy + MURAL.height / 2 + 0.7,
      y1: y1 - 0.35,
      cols: 26,
      rows: 2,
      z: MURAL.z - 0.02,
    }),
  );
  pieces.push(
    ...borderBand({
      x0: -hw + 0.3,
      x1: hw - 0.3,
      y: MURAL.cy + MURAL.height / 2 + 0.52,
      height: 0.26,
      z: MURAL.z - 0.02,
      color: C.shiqing,
      step: 0.4,
    }),
  );
  // 壁画下缘的药叉列
  pieces.push(
    ...yakshas({
      x0: -hw + 0.4,
      x1: hw - 0.4,
      y: y0 + 0.08,
      cols: 16,
      z: MURAL.z - 0.02,
    }),
  );

  // 壁画的边框与凹龛
  const fw = MURAL.width + 1.0;
  const fh = MURAL.height + 0.9;
  pieces.push(box(fw, 0.20, 0.30, C.frame, 0, MURAL.cy + MURAL.height / 2 + 0.32, MURAL.z - 0.14, MAT.stone));
  pieces.push(box(fw, 0.28, 0.34, C.frameDeep, 0, MURAL.cy - MURAL.height / 2 - 0.44, MURAL.z - 0.16, MAT.stone));
  for (const s of [-1, 1]) {
    pieces.push(box(0.28, fh, 0.30, C.niche, s * (MURAL.width / 2 + 0.48), MURAL.cy, MURAL.z - 0.14, MAT.stone));
  }

  // 导览镜头以壁画为绝对主体。人字披椽条在透视下会变成粗大的竖向矩形，
  // 容易被误读为图像缺失，因此不放入正面观画视线；洞窟语境由侧壁、边框、
  // 平棋顶和中心塔柱承担。
  const pillarZ = -3.6;
  pieces.push(
    ...cofferedCeiling({ x0: -hw, x1: hw, z0: pillarZ + 1.1, z1: -1.2, y: y1, cols: 6, rows: 4 }),
  );

  // 中心塔柱
  const pillar = centralPillar({ z: pillarZ });
  pieces.push(...pillar.pieces);

  // 供台与灯盏
  pieces.push(box(1.8, 0.36, 0.55, C.frameDeep, 0, y0, 1.5, MAT.wood));
  for (const x of [-0.72, 0.72]) {
    pieces.push(cyl(0.11, 0.24, C.lamp, x, y0 + 0.36, 1.5, 10, MAT.plain));
  }
  // 侧壁与前壁的灯盏
  for (const s of [-1, 1]) {
    for (const z of [-3.0, -0.4, 2.6]) {
      pieces.push(cyl(0.10, 0.22, C.lamp, s * (hw - 0.24), y0 + 1.45, z, 10, MAT.plain));
    }
  }

  const mesh = new Mesh(mergeAll(pieces), mat);
  mesh.frustumCulled = false;
  group.add(mesh);
  group.add(contactShade());

  // 碰撞：后壁、侧壁与中心塔柱
  if (walkMap) {
    walkMap.addBox(0, MURAL.z - 0.4, MURAL.width, 0.45, 0, -0.7, 6);
    walkMap.addBox(-hw - 0.25, depth / 2 - MURAL.z, 0.45, depth, 0, -0.7, 7);
    walkMap.addBox(hw + 0.25, depth / 2 - MURAL.z, 0.45, depth, 0, -0.7, 7);
    const pHalf = pillar.half * 1.15;
    walkMap.addBox(0, pillarZ, pHalf, pHalf, 0, -0.7, 7);
  }

  return {
    group,
    stages: [],
    material: mat,
    /** 卷三五折共用同一洞窟，此处仅保留接口。 */
    setSection() {},
  };
}

/** 壁画前的地面接触阴影，避免壁画显得"浮"在墙上 */
function contactShade() {
  const g = new Group();
  const shade = new Mesh(
    new PlaneGeometry(MURAL.width + 3.0, 1.3),
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader:
        'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv;
        void main(){
          float a = smoothstep(0.0, 0.62, 1.0 - abs(vUv.y - 0.5) * 2.0);
          gl_FragColor = vec4(0.05, 0.04, 0.035, a * 0.5);
        }`,
    }),
  );
  shade.rotation.x = -Math.PI / 2;
  shade.position.set(0, CAVE.floorY + 0.014, MURAL.z + 0.62);
  g.add(shade);
  return g;
}
