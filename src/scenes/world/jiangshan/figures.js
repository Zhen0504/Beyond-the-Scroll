import {
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, box, paint } from '../../../engine/painted.js';
import { ATMOSPHERE_GLSL } from '../../../engine/shaders/common.glsl.js';
import { mulberry32 } from '../../../utils/math.js';
import { FIGURES } from './layout.js';

/**
 * 画中人物：仿宋画人物造型 —— 长袍广袖、交领右衽、墨色缘边、束带垂绅；
 * 文士戴展脚幞头，渔樵戴斗笠披蓑衣，村人裹巾短褐，僧人披袈裟；行旅骑驴，仆从挑担。
 * 部分人物沿路往返行走，靠近时会转身相望。
 */
const SKIN = '#e2c7a0';
const INK = '#2b2622';
const STRAW = '#b89a5e';

const ROBES = {
  scholar: { robe: '#ece6d6', trim: INK, long: true },
  traveler: { robe: '#ddd5c0', trim: '#4a4038', long: true },
  monk: { robe: '#b88d5c', trim: '#6e3b2a', long: true },
  villager: { robe: '#cdc3a8', trim: '#3b4a52', long: false },
  porter: { robe: '#c6bb9c', trim: '#4a4038', long: false },
  fisher: { robe: '#c9bfa2', trim: '#4a4038', long: false },
};

function lathe(points, color, mat = MAT.cloth, segs = 16, squash = 0.72) {
  const g = new LatheGeometry(points.map(([r, y]) => new Vector2(r, y)), segs);
  g.scale(1, 1, squash);
  return paint(g, color, mat);
}

function sphere(r, color, x, y, z, sx = 1, sy = 1, sz = 1, mat = MAT.plain) {
  const g = new SphereGeometry(r, 12, 10);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return paint(g, color, mat);
}

const _m = new Matrix4();
/** 两点之间的圆柱（杖、竿、袖、腿） */
function rod2(a, b, r0, r1, color, mat = MAT.plain, open = false) {
  const A = new Vector3(...a), B = new Vector3(...b);
  const len = A.distanceTo(B);
  const g = new CylinderGeometry(r1, r0, len, 8, 1, open);
  g.translate(0, len / 2, 0);
  const dir = B.clone().sub(A).normalize();
  const axis = new Vector3(0, 1, 0).cross(dir);
  if (axis.lengthSq() > 1e-8) g.applyMatrix4(_m.makeRotationAxis(axis.normalize(), Math.acos(Math.min(1, Math.max(-1, dir.y)))));
  else if (dir.y < 0) g.rotateX(Math.PI);
  g.translate(A.x, A.y, A.z);
  return paint(g, color, mat);
}

const HEAD_R = 0.105;

/**
 * 工笔面容：画在一张等距柱状贴图上（u = 0.25 为正脸），
 * 细眉、凤眼、悬胆鼻、小口，两颊微晕；文士、渔翁留须，僧人光头。
 */
function paintFace(kind) {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const cx = W * 0.25, cy = H * 0.5;
  // 肤色与明暗
  g.fillStyle = '#e9d2b0';
  g.fillRect(0, 0, W, H);
  const shade = g.createRadialGradient(cx, cy + 6, 10, cx, cy + 6, 140);
  shade.addColorStop(0, 'rgba(255,240,220,0.35)');
  shade.addColorStop(1, 'rgba(150,110,80,0.18)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  // 两颊微红
  for (const sx of [-1, 1]) {
    const blush = g.createRadialGradient(cx + sx * 30, cy + 16, 2, cx + sx * 30, cy + 16, 18);
    blush.addColorStop(0, 'rgba(214,120,100,0.32)');
    blush.addColorStop(1, 'rgba(214,120,100,0)');
    g.fillStyle = blush;
    g.fillRect(cx + sx * 30 - 20, cy - 4, 40, 40);
  }
  // 头发：头顶与后脑（僧人为青色头皮）
  const monk = kind === 'monk';
  g.fillStyle = monk ? 'rgba(120,120,112,0.35)' : '#211c18';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(W, 0);
  g.lineTo(W, H * 0.62);
  g.bezierCurveTo(W * 0.85, H * 0.66, W * 0.62, H * 0.66, W * 0.5, H * 0.5);
  // 前额发际
  g.bezierCurveTo(W * 0.45, H * 0.3, cx + 50, H * 0.3, cx, H * 0.33);
  g.bezierCurveTo(cx - 50, H * 0.3, W * 0.05, H * 0.3, 0, H * 0.5);
  g.closePath();
  g.fill();
  // 耳
  for (const ex of [W * 0.0, W * 0.5, W * 1.0]) {
    g.fillStyle = '#e0c39e';
    g.strokeStyle = 'rgba(90,60,40,0.7)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(ex, cy + 2, 8, 15, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // 眉：细长上挑
  g.strokeStyle = '#2a221c';
  g.lineWidth = 2.6;
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + sx * 9, cy - 13);
    g.quadraticCurveTo(cx + sx * 22, cy - 19, cx + sx * 38, cy - 14);
    g.stroke();
  }
  // 眼：凤眼，上眼线浓、下眼线淡，点睛
  for (const sx of [-1, 1]) {
    const ex = cx + sx * 23, ey = cy - 3;
    g.fillStyle = '#f6eee0';
    g.beginPath();
    g.moveTo(ex - sx * 11, ey + 1);
    g.quadraticCurveTo(ex, ey - 6, ex + sx * 12, ey - 2);
    g.quadraticCurveTo(ex, ey + 4, ex - sx * 11, ey + 1);
    g.fill();
    g.fillStyle = '#1b1612';
    g.beginPath();
    g.arc(ex + sx * 0.5, ey - 1, 3.3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#1e1813';
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(ex - sx * 11, ey + 1);
    g.quadraticCurveTo(ex, ey - 6.5, ex + sx * 12.5, ey - 2.5);
    g.stroke();
    g.strokeStyle = 'rgba(80,55,40,0.55)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(ex - sx * 9, ey + 2);
    g.quadraticCurveTo(ex, ey + 4.5, ex + sx * 10, ey);
    g.stroke();
  }
  // 鼻：一笔鼻梁，鼻翼两点
  g.strokeStyle = 'rgba(110,70,50,0.75)';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(cx - 3, cy - 6);
  g.quadraticCurveTo(cx - 5, cy + 10, cx - 2, cy + 17);
  g.stroke();
  g.beginPath();
  g.moveTo(cx - 8, cy + 17);
  g.quadraticCurveTo(cx, cy + 22, cx + 8, cy + 17);
  g.stroke();
  // 口：朱唇一点
  g.fillStyle = '#b4523f';
  g.beginPath();
  g.moveTo(cx - 9, cy + 30);
  g.quadraticCurveTo(cx, cy + 26, cx + 9, cy + 30);
  g.quadraticCurveTo(cx, cy + 35, cx - 9, cy + 30);
  g.fill();
  g.strokeStyle = 'rgba(80,30,20,0.8)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(cx - 9, cy + 30);
  g.lineTo(cx + 9, cy + 30);
  g.stroke();
  // 须：文士三绺长须，渔翁、行旅短髯
  const beard = kind === 'scholar' ? 'long' : kind === 'fisher' || kind === 'traveler' ? 'short' : null;
  if (beard) {
    g.strokeStyle = 'rgba(30,25,22,0.85)';
    g.lineWidth = 1.4;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + sx * 3, cy + 25);
      g.quadraticCurveTo(cx + sx * 12, cy + 24, cx + sx * 16, cy + 31);
      g.stroke();
    }
    const strands = beard === 'long' ? 26 : 16;
    const len = beard === 'long' ? 44 : 18;
    for (let i = 0; i < strands; i++) {
      const t = i / (strands - 1) - 0.5;
      const x0 = cx + t * 22;
      g.beginPath();
      g.moveTo(x0, cy + 37);
      g.quadraticCurveTo(x0 + t * 6, cy + 37 + len * 0.6, x0 + t * 3, cy + 37 + len * (0.85 + 0.15 * Math.cos(t * 6)));
      g.stroke();
    }
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const FACE_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FACE_FRAG = /* glsl */ `
${ATMOSPHERE_GLSL}
uniform sampler2D tFace;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec3 col = texture2D(tFace, vUv).rgb;
  vec3 n = normalize(vNormal);
  col *= 0.8 + 0.2 * smoothstep(-0.6, 0.9, dot(n, uSunDir));
  gl_FragColor = vec4(applyAtmosphere(col, vWorld), 1.0);
}
`;

/** 人物工厂：同类人物共用几何、面容贴图与材质；返回带骨架的人物（腿、袖、头可动） */
function createPersonFactory(material, atmosphere) {
  const geoCache = new Map();
  const faceCache = new Map();
  const headGeo = new SphereGeometry(HEAD_R, 32, 20);
  headGeo.scale(0.92, 1.12, 0.95);
  const faceMaterial = (kind) => {
    const key = kind === 'monk' ? 'monk' : kind === 'scholar' ? 'scholar' : kind === 'fisher' || kind === 'traveler' ? 'old' : 'plain';
    if (!faceCache.has(key)) {
      faceCache.set(key, new ShaderMaterial({
        vertexShader: FACE_VERT,
        fragmentShader: FACE_FRAG,
        uniforms: { ...atmosphere, tFace: { value: paintFace(key === 'old' ? 'fisher' : key) } },
      }));
    }
    return faceCache.get(key);
  };
  return (kind, pose = 'stand') => {
    const k = `${kind}:${pose}`;
    if (!geoCache.has(k)) geoCache.set(k, buildPerson(kind, pose));
    const spec = geoCache.get(k);
    const g = new Group();
    // 上身单独一组：走路时可前倾、微扭
    const torso = new Group();
    g.add(torso);
    torso.add(new Mesh(spec.body, material));
    const limb = ({ geometry, pivot }) => {
      const p = new Group();
      p.position.set(...pivot);
      p.add(new Mesh(geometry, material));
      return p;
    };
    const legs = spec.legs.map((l) => {
      const p = limb(l);
      g.add(p);
      return p;
    });
    const arms = spec.arms.map((a) => {
      const p = limb(a);
      torso.add(p);
      return p;
    });
    // 头装在颈部支点上，可左右转、微微点头
    const neck = new Group();
    neck.position.set(0, spec.headY - 0.12, 0);
    const head = new Mesh(headGeo, faceMaterial(kind));
    head.position.set(0, 0.12, 0.004);
    neck.add(head);
    if (spec.hat) neck.add(new Mesh(spec.hat, material));
    torso.add(neck);
    g.userData.rig = { torso, legs, arms, neck };
    g.userData.headY = spec.headY;
    return g;
  };
}

/**
 * 人物几何。pose: stand（站）| sit（盘腿而坐）| ride（骑驴）。面朝 +z。
 * 返回：body 上身与衣袍；legs / arms 为可摆动的肢体（几何以支点为原点）；hat 为随头转动的冠帽。
 */
function buildPerson(kind, pose = 'stand') {
  const st = ROBES[kind] ?? ROBES.scholar;
  const parts = [];
  const hatParts = [];
  const legs = [];
  const arms = [];
  const sit = pose === 'sit';
  const ride = pose === 'ride';
  // 以站姿坐标为准（腰 0.92、领口 1.42），坐、骑整体平移
  const shift = sit ? -0.74 : ride ? 0.41 : 0;
  const yy = (y) => y + shift;
  const TROUSER = '#d9d2c0';

  // —— 袍身 ——
  if (sit) {
    // 盘腿：上身 + 覆在腿上的衣摆，两膝外张、小腿在身前交叉
    parts.push(lathe([[0.26, 0.08], [0.24, 0.18], [0.19, 0.3], [0.17, 0.4], [0.18, 0.52], [0.21, 0.6], [0.17, 0.65], [0.07, 0.68], [0, 0.69]], st.robe));
    parts.push(sphere(0.3, st.robe, 0, 0.11, 0.1, 1.3, 0.32, 1.0, MAT.cloth));
    for (const sx of [-1, 1]) {
      parts.push(sphere(0.105, st.robe, sx * 0.33, 0.11, 0.12, 1, 0.85, 1, MAT.cloth));
      parts.push(rod2([sx * 0.33, 0.09, 0.16], [-sx * 0.12, 0.07, 0.31], 0.075, 0.07, st.robe, MAT.cloth));
      parts.push(paint(new BoxGeometry(0.08, 0.05, 0.15).rotateY(sx * 0.9).translate(-sx * 0.16, 0.05, 0.32), INK));
    }
    parts.push(paint(new TorusGeometry(0.39, 0.02, 6, 24).rotateX(Math.PI / 2).scale(1, 1, 0.8).translate(0, 0.04, 0.1), st.trim));
    if (kind === 'scholar') parts.push(box(1.2, 0.03, 1.0, '#c9b47e', 0, -0.01, 0.08, MAT.thatch)); // 坐席
  } else if (ride) {
    parts.push(lathe([[0.22, 0.88], [0.19, 0.98], [0.18, 1.1], [0.21, 1.27], [0.17, 1.36], [0.07, 1.42], [0, 1.43]].map(([r, y]) => [r, yy(y)]), st.robe));
    // 跨坐：大腿、小腿垂在驴身两侧，袍摆盖住大腿
    for (const sx of [-1, 1]) {
      const hip = [sx * 0.13, yy(0.9), 0.04], knee = [sx * 0.28, yy(0.62), 0.22], ankle = [sx * 0.26, yy(0.3), 0.12];
      parts.push(rod2(hip, knee, 0.1, 0.09, st.robe, MAT.cloth));
      parts.push(rod2(knee, ankle, 0.065, 0.055, TROUSER, MAT.cloth));
      parts.push(paint(new BoxGeometry(0.075, 0.05, 0.15).translate(ankle[0], ankle[1] - 0.04, ankle[2] + 0.04), INK));
      parts.push(paint(new BoxGeometry(0.04, 0.42, 0.42).rotateX(-0.25).translate(sx * 0.27, yy(0.72), 0.02), st.robe, MAT.cloth));
    }
  } else if (st.long) {
    parts.push(lathe([[0.3, 0.06], [0.3, 0.12], [0.26, 0.35], [0.19, 0.75], [0.17, 0.95], [0.18, 1.1], [0.21, 1.27], [0.17, 1.36], [0.07, 1.42], [0, 1.43]], st.robe));
    parts.push(paint(new TorusGeometry(0.3, 0.025, 6, 18).rotateX(Math.PI / 2).scale(1, 1, 0.72).translate(0, 0.08, 0), st.trim));
  } else {
    parts.push(lathe([[0.25, 0.55], [0.22, 0.75], [0.17, 0.95], [0.18, 1.1], [0.21, 1.27], [0.17, 1.36], [0.07, 1.42], [0, 1.43]], st.robe));
    parts.push(paint(new TorusGeometry(0.25, 0.022, 6, 18).rotateX(Math.PI / 2).scale(1, 1, 0.72).translate(0, 0.56, 0), st.trim));
  }

  // —— 腿：站姿时自胯部支点摆动（长袍下只露出鞋） ——
  if (!sit && !ride) {
    for (const sx of [-1, 1]) {
      const g = mergeGeometries([
        rod2([0, 0, 0], [0, -0.84, 0.01], 0.07, 0.055, TROUSER, MAT.cloth),
        paint(new BoxGeometry(0.08, 0.05, 0.16).translate(0, -0.875, 0.05), INK),
      ]);
      legs.push({ geometry: g, pivot: [sx * 0.08, 0.92, 0] });
    }
  }

  // —— 交领、束带、垂绅 ——
  {
    const g = new BoxGeometry(0.05, 0.46, 0.02);
    g.rotateZ(0.55);
    g.translate(0.03, yy(1.18), 0.145);
    parts.push(paint(g, st.trim));
    const g2 = new BoxGeometry(0.035, 0.18, 0.02);
    g2.rotateZ(-0.6);
    g2.translate(-0.05, yy(1.31), 0.13);
    parts.push(paint(g2, st.trim));
  }
  parts.push(paint(new CylinderGeometry(0.18, 0.18, 0.06, 14).scale(1, 1, 0.74).translate(0, yy(0.97), 0), st.trim));
  if (st.long && !sit && !ride) parts.push(paint(new BoxGeometry(0.06, 0.42, 0.015).translate(0.02, yy(0.75), 0.15), st.trim));

  // —— 袖：拱手者双手笼袖于胸前；其余自然下垂，走路时前后摆 ——
  const sleeve = (sh, end, into) => {
    const d = new Vector3(...end).sub(new Vector3(...sh)).normalize();
    const back = [end[0] - d.x * 0.07, end[1] - d.y * 0.07, end[2] - d.z * 0.07];
    into.push(rod2(sh, end, 0.075, 0.14, st.robe, MAT.cloth, true));
    into.push(rod2(back, end, 0.142, 0.145, st.trim, MAT.cloth, true));
  };
  const hand = (p, into) => into.push(sphere(0.036, SKIN, p[0], p[1] - 0.04, p[2] + 0.02));
  const clasp = kind === 'scholar' || kind === 'monk';
  for (const sx of [-1, 1]) {
    const sh = [sx * 0.19, yy(1.3), 0];
    let fixedEnd = null;
    if (clasp) fixedEnd = [sx * 0.085, yy(1.0), 0.2];
    else if (ride) fixedEnd = [sx * 0.1, yy(1.02), 0.27]; // 执缰
    else if (sit && kind === 'fisher') fixedEnd = [sx * 0.05, yy(1.0), 0.3]; // 持竿
    else if (sit) fixedEnd = [sx * 0.27, 0.2, 0.2]; // 手搭膝上
    else if (kind === 'porter' && sx > 0) fixedEnd = [0.2, yy(1.28), 0.28]; // 扶扁担
    else if (kind === 'traveler' && sx > 0) fixedEnd = [0.27, yy(1.02), 0.13]; // 拄杖
    if (fixedEnd) {
      sleeve(sh, fixedEnd, parts);
      if (!clasp) hand(fixedEnd, parts);
    } else {
      // 摆动的手臂：几何以肩为原点
      const loc = [];
      const end = [sx * 0.05, -0.45, 0.05];
      sleeve([0, 0, 0], end, loc);
      hand(end, loc);
      arms.push({ geometry: mergeGeometries(loc), pivot: sh });
    }
  }

  // —— 颈、冠帽 ——
  parts.push(rod2([0, yy(1.38), 0], [0, yy(1.47), 0.005], 0.045, 0.042, SKIN));
  const hy = yy(1.42 + 0.13);
  // 冠帽随头转动：以颈部支点（hy - 0.12）为原点
  const hatY = 0.12;
  const cap = (r, color, tilt, cover, mat = MAT.plain) => {
    const g = new SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI * cover);
    g.scale(0.95, 1.12, 1.0);
    g.rotateX(-tilt);
    g.translate(0, hatY, -0.004);
    return paint(g, color, mat);
  };
  if (kind === 'scholar') {
    hatParts.push(cap(HEAD_R * 1.07, INK, 0.25, 0.42));
    hatParts.push(paint(new BoxGeometry(0.15, 0.12, 0.13).translate(0, hatY + 0.11, -0.03), INK));
    hatParts.push(paint(new BoxGeometry(0.72, 0.016, 0.022).translate(0, hatY + 0.1, -0.075), INK));
  } else if (kind === 'fisher' || kind === 'traveler') {
    hatParts.push(cap(HEAD_R * 1.04, '#2f2a25', 0.3, 0.38));
    hatParts.push(paint(new ConeGeometry(0.36, 0.16, 20).translate(0, hatY + 0.17, 0), STRAW, MAT.thatch));
    hatParts.push(sphere(0.03, STRAW, 0, hatY + 0.26, 0));
    if (kind === 'fisher') parts.push(paint(new ConeGeometry(0.34, 0.55, 14, 1, true).scale(1, 1, 0.8).translate(0, yy(1.12), -0.02), '#9c8455', MAT.thatch));
  } else if (kind === 'monk') {
    const g = new BoxGeometry(0.1, 0.9, 0.02);
    g.rotateZ(-0.5);
    g.translate(0.02, yy(1.0), 0.155);
    parts.push(paint(g, '#8a3b2b', MAT.cloth));
  } else {
    hatParts.push(cap(HEAD_R * 1.07, '#3b4a52', 0.3, 0.4, MAT.cloth));
    hatParts.push(sphere(0.045, '#3b4a52', 0, hatY + 0.12, -0.06));
  }

  // —— 随身之物 ——
  if (kind === 'traveler' && !ride) parts.push(rod2([0.3, 0.02, 0.18], [0.26, 1.45, 0.1], 0.018, 0.015, '#5a4030', MAT.wood));
  if (kind === 'fisher') {
    const grip = sit ? [0, yy(0.98), 0.32] : [0.25, yy(0.86), 0.12];
    parts.push(rod2(grip, [grip[0] + 0.35, grip[1] + 1.6, grip[2] + 2.2], 0.016, 0.006, '#6b5638', MAT.wood));
  }
  if (kind === 'porter') {
    parts.push(rod2([0.17, yy(1.36), -0.85], [0.17, yy(1.36), 0.85], 0.025, 0.025, '#6b5638', MAT.wood));
    for (const sz of [-0.8, 0.8]) {
      parts.push(rod2([0.17, yy(1.36), sz], [0.17, yy(0.62), sz], 0.006, 0.006, '#4a3a2a'));
      parts.push(paint(new CylinderGeometry(0.2, 0.16, 0.3, 12, 1, true).translate(0.17, yy(0.45), sz), STRAW, MAT.thatch));
      parts.push(sphere(0.16, '#8f6a44', 0.17, yy(0.6), sz, 1, 0.35, 1));
    }
  }
  return {
    body: mergeGeometries(parts),
    hat: hatParts.length ? mergeGeometries(hatParts) : null,
    legs,
    arms,
    headY: hy,
  };
}

/** 驴：身、颈、头、耳、尾与四腿（腿单独成件，行走时摆动） */
function buildDonkey(material) {
  const color = '#7d7166';
  const body = [];
  body.push(sphere(0.3, color, 0, 0.98, 0, 1, 0.95, 1.9, MAT.cloth));
  body.push(sphere(0.2, '#a39787', 0, 0.85, 0, 1.1, 0.6, 2.3));
  body.push(rod2([0, 1.08, 0.42], [0, 1.42, 0.68], 0.12, 0.09, color, MAT.cloth));
  body.push(sphere(0.13, color, 0, 1.42, 0.82, 0.9, 0.95, 1.9));
  body.push(sphere(0.07, '#3d3631', 0, 1.36, 1.02));
  for (const sx of [-1, 1]) body.push(paint(new ConeGeometry(0.035, 0.24, 6).translate(sx * 0.06, 1.62, 0.72), color));
  body.push(rod2([0, 1.0, -0.55], [0, 0.6, -0.68], 0.03, 0.015, '#4a413a'));
  body.push(paint(new BoxGeometry(0.5, 0.06, 0.6).translate(0, 1.27, -0.05), '#8a3b2b', MAT.cloth));
  const group = new Group();
  group.add(new Mesh(mergeGeometries(body), material));
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = new Mesh(mergeGeometries([rod2([0, 0, 0], [0, -0.8, 0], 0.055, 0.04, color, MAT.cloth), sphere(0.045, '#3d3631', 0, -0.8, 0.01)]), material);
    leg.position.set(sx * 0.14, 0.82, sz * 0.36);
    group.add(leg);
    legs.push(leg);
  }
  group.userData.legs = legs;
  return group;
}

const ANGLE_LERP = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
};

/**
 * 创建全部人物。返回 { group, update(dt, camera) }
 */
export function createFigures({ material, atmosphere, walkMap }) {
  const group = new Group();
  const npcs = [];
  const rand = mulberry32(606);
  const makePerson = createPersonFactory(material, atmosphere);

  for (const def of FIGURES) {
    const root = new Group();
    let legs = null;
    let person;
    if (def.kind === 'rider') {
      const donkey = buildDonkey(material);
      legs = donkey.userData.legs;
      root.add(donkey);
      person = makePerson('traveler', 'ride');
    } else {
      person = makePerson(def.kind, def.pose ?? 'stand');
    }
    root.add(person);
    const start = def.route ? def.route[0] : [def.x, def.z];
    const npc = {
      def,
      root,
      legs,
      x: start[0],
      z: start[1],
      heading: def.face ?? 0,
      baseHeading: def.face ?? 0,
      target: 1,
      dir: 1,
      wait: def.delay ?? rand() * 2,
      phase: rand() * 10,
      r: def.kind === 'rider' ? 0.75 : 0.35,
      headY: person.userData.headY,
      rig: person.userData.rig,
      walkPhase: rand() * 6,
      walkAmp: 0,
      look: 0,
    };
    if (def.route) {
      walkMap.addDynamic(npc);
      const [ax, az] = def.route[0], [bx, bz] = def.route[1];
      npc.heading = Math.atan2(bx - ax, bz - az);
    } else {
      const y = walkMap.groundAt(npc.x, npc.z);
      walkMap.addCircle(npc.x, npc.z, npc.r, y - 0.5, y + 1.8);
    }
    root.position.set(npc.x, walkMap.groundAt(npc.x, npc.z), npc.z);
    root.rotation.y = npc.heading;
    group.add(root);
    npcs.push(npc);
  }

  let t = 0;
  function update(dt, cam) {
    t += dt;
    for (const n of npcs) {
      const near = Math.hypot(cam.x - n.x, cam.z - n.z);
      let moving = false;
      if (n.def.route) {
        const route = n.def.route;
        if (n.wait > 0) n.wait -= dt;
        else if (near > 1.6) {
          // 有人挡在面前就停步等候
          const [tx, tz] = route[n.target];
          const dx = tx - n.x, dz = tz - n.z;
          const d = Math.hypot(dx, dz);
          const sp = (n.def.speed ?? 1) * dt;
          if (d <= sp) {
            n.x = tx;
            n.z = tz;
            if (n.target === route.length - 1 || n.target === 0) {
              n.dir = n.target === 0 ? 1 : -1;
              n.wait = 2 + rand() * 3;
            }
            n.target += n.dir;
          } else {
            n.x += (dx / d) * sp;
            n.z += (dz / d) * sp;
            n.heading = ANGLE_LERP(n.heading, Math.atan2(dx, dz), 1 - Math.exp(-dt * 4));
            moving = true;
          }
        }
      }
      // 近处的人：先转头相望，走得很近时再转身
      const toCam = Math.atan2(cam.x - n.x, cam.z - n.z);
      if (!moving && near < 3.5) {
        n.heading = ANGLE_LERP(n.heading, toCam, 1 - Math.exp(-dt * 1.4));
      } else if (!moving && !n.def.route) {
        n.heading = ANGLE_LERP(n.heading, n.baseHeading, 1 - Math.exp(-dt * 0.8));
      }
      const diff = ((toCam - n.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      const lookTarget = moving ? 0 : near < 9 ? Math.max(-0.85, Math.min(0.85, diff)) : Math.sin(t * 0.23 + n.phase) * 0.35;
      n.look += (lookTarget - n.look) * (1 - Math.exp(-dt * 3));

      // 步态：腿与袖交替前后摆动，身体随步起伏、微扭
      const speed = n.def.speed ?? 1;
      n.walkAmp += ((moving ? 1 : 0) - n.walkAmp) * (1 - Math.exp(-dt * 6));
      if (n.walkAmp > 0.01) n.walkPhase += dt * speed * 4.6;
      const sw = Math.sin(n.walkPhase) * n.walkAmp;
      const bob = (Math.abs(Math.cos(n.walkPhase)) - 0.6) * 0.035 * n.walkAmp;
      const breathe = Math.sin((t + n.phase) * 1.3) * 0.004;
      const gy = walkMap.groundAt(n.x, n.z);
      n.root.position.set(n.x, gy + bob + (n.legs ? 0 : breathe), n.z);
      n.root.rotation.y = n.heading;
      const rig = n.rig;
      if (rig) {
        rig.legs.forEach((leg, i) => (leg.rotation.x = (i ? -sw : sw) * 0.42));
        rig.arms.forEach((arm, i) => {
          const idle = Math.sin((t + n.phase) * 0.9 + i) * 0.03 * (1 - n.walkAmp);
          arm.rotation.x = (i ? sw : -sw) * 0.32 + idle;
          arm.rotation.z = (i ? 1 : -1) * 0.05;
        });
        rig.torso.rotation.y = Math.sin(n.walkPhase) * 0.06 * n.walkAmp;
        rig.torso.rotation.x = 0.03 * n.walkAmp * (n.def.kind === 'porter' ? 2 : 1);
        rig.torso.rotation.z = Math.sin((t + n.phase) * 0.5) * 0.012 * (1 - n.walkAmp);
        rig.neck.rotation.y = n.look;
        rig.neck.rotation.x = Math.sin((t + n.phase) * 0.4) * 0.03;
      }
      if (n.legs) {
        // 驴：对角两腿同步
        n.legs.forEach((leg, i) => {
          leg.rotation.x = Math.sin(n.walkPhase * 1.2 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.4 * n.walkAmp;
        });
      }
    }
  }

  return { group, update, npcs, makePerson };
}
