import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, Raycaster, ShaderMaterial, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createNoise } from '../../../engine/noise.js';
import { ATMOSPHERE_GLSL, NOISE_GLSL } from '../../../engine/shaders/common.glsl.js';
import { mulberry32 } from '../../../utils/math.js';
import { NORTH_WALL, ROCK_CLUSTERS, SOUTH_WALL, STRUCTURES } from './layout.js';
import { lerpTable, riverDistance } from './terrain.js';

/**
 * 山石：原作的山多为陡直的石柱，顶部圆浑如云头，崖面布满竖向皴笔。
 * 每根石柱由“截面轮廓 × 角向噪声”生成，竖向条纹噪声模拟斧劈皴；多根石柱聚成一组山峰。
 */
function columnGeometry({ radius, height, seed, lean = 0, bulb = false, rings = 44, segs = 44, sink = 14, cap, bands: bandsOpt, squashMin = 0.72 }) {
  const n = createNoise(seed);
  const rand = mulberry32(seed * 7 + 3);
  const ph = rand() * 10;
  const squash = squashMin + rand() * (1 - squashMin + 0.02);
  const rot = rand() * Math.PI * 2;
  const capStart = cap ?? (bulb ? 0.42 : 0.78 + rand() * 0.1);
  const bands = bandsOpt ?? 4 + Math.floor(rand() * 4);
  const leanDir = rand() * Math.PI * 2;
  const total = height + sink;

  const taperAt = (t) => (bulb ? 1 + 0.28 * Math.sin(Math.min(t, capStart) * Math.PI * 1.1) : 1 - 0.32 * t);
  const positions = new Float32Array((rings + 1) * (segs + 1) * 3);
  const ts = new Float32Array((rings + 1) * (segs + 1));
  const cav = new Float32Array((rings + 1) * (segs + 1));
  let k = 0;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    let prof;
    if (t < capStart) prof = taperAt(t);
    else {
      const u = (t - capStart) / (1 - capStart);
      prof = taperAt(capStart) * Math.sqrt(Math.max(0, 1 - u * u));
    }
    // 顶下微微外凸（云头）与层层石阶
    prof *= 1 + 0.1 * Math.exp(-(((t - (capStart - 0.05)) / 0.07) ** 2));
    // 层层叠起的石阶：每一层上缘略外挑，形成横向的岩檐
    const band = (t * bands + ph + n.noise2(t * 3, ph) * 0.3) % 1;
    const ledge = bulb ? 1 + 0.04 * Math.sin(t * 17 + ph) : 1 + 0.085 * Math.pow(band, 3) - 0.03;
    const y = -sink + t * total;
    const lx = Math.cos(leanDir) * lean * t * t * height;
    const lz = Math.sin(leanDir) * lean * t * t * height;
    for (let j = 0; j <= segs; j++) {
      const th = (j / segs) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      const lobes = n.noise3(c * 1.5, s * 1.5, t * 1.3 + ph) * 0.24;
      const stri = n.noise3(c * 4.6, s * 4.6, t * 0.55) * 0.14 + n.noise3(c * 8, s * 8, t * 0.9 + 4) * 0.06;
      const det = n.noise3(c * 12, s * 12, t * 6) * 0.03;
      const disp = lobes + stri + det;
      const rr = radius * prof * ledge * (1 + disp);
      const px = c * rr, pz = s * rr * squash;
      positions[k * 3] = px * Math.cos(rot) - pz * Math.sin(rot) + lx;
      positions[k * 3 + 1] = y;
      positions[k * 3 + 2] = px * Math.sin(rot) + pz * Math.cos(rot) + lz;
      ts[k] = Math.max(0, y) / height;
      cav[k] = stri * 2.2 + lobes * 0.6 + det * 2;
      k++;
    }
  }
  const index = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j, b = a + segs + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new BufferGeometry();
  geo.setIndex(index);
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setAttribute('aT', new BufferAttribute(ts, 1));
  geo.setAttribute('aCav', new BufferAttribute(cav, 1));
  geo.computeVertexNormals();

  // 接缝处法线取平均，避免出现竖向亮线
  const nrm = geo.attributes.normal;
  for (let i = 0; i <= rings; i++) {
    const a = i * (segs + 1), b = a + segs;
    const x = nrm.getX(a) + nrm.getX(b), y = nrm.getY(a) + nrm.getY(b), z = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(a, x / l, y / l, z / l);
    nrm.setXYZ(b, x / l, y / l, z / l);
  }
  return geo;
}

const ROCK_VERT = /* glsl */ `
attribute float aT;
attribute float aVar;
attribute float aCav;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vT;
varying float vVar;
varying float vCav;
void main() {
  vCav = aCav;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vT = aT;
  vVar = aVar;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ROCK_FRAG = /* glsl */ `
${NOISE_GLSL}
${ATMOSPHERE_GLSL}
uniform sampler2D tBrush;
uniform float uBrushMean;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vT;
varying float vVar;
varying float vCav;

vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }

float brush(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  float a = dot(texture2D(tBrush, p.zy / 30.0).rgb, vec3(0.333));
  float b = dot(texture2D(tBrush, p.xz / 30.0).rgb, vec3(0.333));
  float c = dot(texture2D(tBrush, p.xy / 30.0).rgb, vec3(0.333));
  return (a * w.x + b * w.y + c * w.z) / uBrushMean - 1.0;
}

void main() {
  vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
  float up = smoothstep(0.3, 0.88, n.y);
  float nA = snoise(vWorld * 0.03 + vVar * 13.0);
  float nB = snoise(vWorld * vec3(0.08, 0.02, 0.08) + vVar * 5.0);
  float cav = vCav + nA * 0.08;

  vec3 ochre = srgb(vec3(0.72, 0.56, 0.36));
  vec3 ochreLight = srgb(vec3(0.84, 0.72, 0.52));
  vec3 green = srgb(vec3(0.5, 0.69, 0.57));
  vec3 blue = srgb(vec3(0.32, 0.53, 0.63));

  // 石青石绿：罩在山头、朝上的面与凸起的石棱；凹处与山脚露出赭石
  float g = clamp(up * 0.9 + smoothstep(0.12, 0.85, vT) * 0.6 + cav * 1.4 + nA * 0.2 - 0.12, 0.0, 1.0);
  vec3 mineral = mix(green, blue, smoothstep(-0.3, 0.5, nB + vT * 0.5));
  vec3 col = mix(mix(ochre, ochreLight, nA * 0.5 + 0.5), mineral, g);

  // 凹缝积墨（勾皴）
  col *= 1.0 - smoothstep(-0.04, -0.3, cav) * 0.55;

  // 斧劈皴：竖向拉长的墨痕
  float cun = 1.0 - abs(snoise(vec3(vWorld.x * 0.11, vWorld.y * 0.017, vWorld.z * 0.11)));
  col *= 1.0 - pow(cun, 9.0) * (1.0 - up) * 0.5;

  // 层层石阶的横向墨线
  float strata = abs(sin(vWorld.y * 0.21 + snoise(vWorld * 0.025) * 2.2 + vVar * 6.0));
  col *= 1.0 - smoothstep(0.1, 0.0, strata) * 0.32 * (1.0 - up);

  // 原画笔触
  col *= 1.0 + brush(vWorld, n) * 0.6;

  // 点苔
  float dots = smoothstep(0.7, 0.84, snoise(vWorld * 0.65)) * up;
  col = mix(col, srgb(vec3(0.18, 0.25, 0.2)), dots * 0.75);

  col *= mix(0.75, 1.0, smoothstep(0.0, 0.1, vT));

  vec3 V = normalize(cameraPosition - vWorld);
  float rim = 1.0 - max(dot(n, V), 0.0);
  col *= paintLight(n) * (1.0 - 0.38 * pow(rim, 2.2));
  gl_FragColor = vec4(applyAtmosphere(col, vWorld), 1.0);
}
`;

export function createRockMaterial({ atmosphere, brushTexture }) {
  return new ShaderMaterial({
    vertexShader: ROCK_VERT,
    fragmentShader: ROCK_FRAG,
    side: DoubleSide,
    uniforms: { ...atmosphere, tBrush: { value: brushTexture } },
  });
}

/** 某高度区间内石体的径向截面：每个方向角上的最大半径 */
function radialProfile(geo, cx, cz, yMin, yMax, N = 36) {
  const radii = new Float32Array(N);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < yMin || y > yMax) continue;
    const dx = pos.getX(i) - cx, dz = pos.getZ(i) - cz;
    const a = Math.atan2(dz, dx);
    const k = Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * N) % N;
    const r = Math.hypot(dx, dz);
    if (r > radii[k]) radii[k] = r;
  }
  // 相邻取大，留一点余量，避免顶点之间的缝隙
  const out = new Float32Array(N);
  for (let k = 0; k < N; k++) out[k] = Math.max(radii[k], radii[(k + 1) % N], radii[(k + N - 1) % N]) * 1.02 + 0.05;
  return Array.from(out);
}

function withVar(geo, v) {
  geo.setAttribute('aVar', new BufferAttribute(new Float32Array(geo.attributes.position.count).fill(v), 1));
  return geo;
}

/** 石柱底部取周围最低的地面高度，避免悬空 */
function baseHeight(heightAt, x, z, r) {
  let h = heightAt(x, z);
  for (let a = 0; a < 6; a++) {
    const th = (a / 6) * Math.PI * 2;
    h = Math.min(h, heightAt(x + Math.cos(th) * r * 0.8, z + Math.sin(th) * r * 0.8));
  }
  return h;
}

/**
 * 沿山崖、山脚自动补充的石群，以及北面后排群峰 —— 让山谷两侧处处是石壁，层层叠叠。
 * 避开瀑布、山寺与廊桥，不遮挡这些看点。
 */
function generatedClusters() {
  const rand = mulberry32(4242);
  const S = STRUCTURES;
  const keepClear = [...S.waterfalls.map((w) => [w.x, 20]), [S.temple.x, 18], [(S.coveredBridge.x0 + S.coveredBridge.x1) / 2, 28], [78, 50]];
  const blocked = (x) => keepClear.some(([cx, r]) => Math.abs(x - cx) < r);
  const out = [];
  for (let x = -268; x <= 232; x += 24 + rand() * 14) {
    if (blocked(x)) continue;
    const z = lerpTable(NORTH_WALL, x) - 10 - rand() * 12;
    out.push({ x, z, count: 3, h: [28, 62], r: [8, 14], spread: 12, seed: 600 + Math.round(x + 400), lod: true });
  }
  for (let x = -262; x <= 232; x += 34 + rand() * 20) {
    const z = lerpTable(SOUTH_WALL, x) + 14 + rand() * 14;
    out.push({ x, z, count: 3, h: [18, 40], r: [7, 12], spread: 12, seed: 1700 + Math.round(x + 400), lod: true });
  }
  for (let x = -330; x <= 300; x += 52 + rand() * 30) {
    const z = lerpTable(NORTH_WALL, x) - 150 - rand() * 90;
    out.push({ x, z, count: 4, h: [110, 190], r: [20, 34], spread: 34, seed: 2700 + Math.round(x + 400), lod: true });
  }
  return out;
}

/**
 * 生成全部山石。返回合并后的网格、供碰撞的圆柱信息，以及可在山顶取点的方法（种松树用）。
 */
export function createRocks({ material, heightAt, walkMap, avoid }) {
  const geos = [];
  const columns = [];
  const raycaster = new Raycaster();
  const down = new Vector3(0, -1, 0);

  [...ROCK_CLUSTERS, ...generatedClusters()].forEach((cl) => {
    const rand = mulberry32(cl.seed);
    for (let i = 0; i < cl.count; i++) {
      const main = i === 0;
      const ang = rand() * Math.PI * 2;
      const dist = main ? 0 : cl.spread * (0.45 + rand() * 0.55);
      const x = cl.x + Math.cos(ang) * dist;
      const z = cl.z + Math.sin(ang) * dist * 0.75;
      const fall = main ? 1 : 0.55 + rand() * 0.4;
      const height = (cl.h[0] + rand() * (cl.h[1] - cl.h[0])) * fall;
      const radius = cl.r[0] + rand() * (cl.r[1] - cl.r[0]);
      const geo = columnGeometry({
        radius,
        height,
        seed: cl.seed * 100 + i,
        lean: cl.bulb ? 0.02 : 0.04 + rand() * 0.06,
        bulb: cl.bulb,
        rings: cl.lod ? 30 : height > 60 ? 52 : 40,
        segs: cl.lod ? 32 : radius > 16 ? 52 : 40,
      });
      const by = baseHeight(heightAt, x, z, radius);
      geo.translate(x, by, z);
      withVar(geo, rand());
      geos.push(geo);
      columns.push({ x, z, radius, height, baseY: by, geo });
      // 碰撞取人站立高度附近的真实截面，贴着石壁走也不会穿进去
      walkMap?.addRadial(x, z, radialProfile(geo, x, z, by - 1, by + 10), -Infinity, by + height);
    }
  });

  // 坡石与卵石：岸边层层叠叠的扁平坡石（原作坡岸常见），以及散落谷中的圆石
  const smallRand = mulberry32(99);
  const smalls = [];
  const addSmall = (x, z, opts, h) => {
    const geo = columnGeometry(opts);
    geo.translate(x, h, z);
    withVar(geo, smallRand());
    smalls.push(geo);
    walkMap?.addRadial(x, z, radialProfile(geo, x, z, -Infinity, Infinity), -Infinity, h + opts.height);
  };
  let made = 0;
  for (let i = 0; i < 1600 && made < 150; i++) {
    const x = -262 + smallRand() * 505;
    const z = -95 + smallRand() * 200;
    const h = heightAt(x, z);
    const rd = riverDistance(x, z);
    const slab = rd > -2 && rd < 7 ? smallRand() < 0.8 : smallRand() < 0.4;
    const radius = slab ? 2.2 + smallRand() * 4 : 0.8 + smallRand() * 2.2;
    if (h < -0.15 || h > 9 || avoid?.(x, z, radius + 1.5)) continue;
    if (rd > 7 && smallRand() < 0.55) continue;
    if (slab) {
      const height = 0.9 + smallRand() * 2.2;
      addSmall(x, z, { radius, height, seed: 5000 + i, cap: 0.84, bands: 2 + Math.floor(smallRand() * 2), rings: 14, segs: 22, sink: 1.6, squashMin: 0.45 }, h - 0.55);
    } else {
      const height = radius * (0.9 + smallRand() * 1.3);
      addSmall(x, z, { radius, height, seed: 5000 + i, bulb: true, rings: 14, segs: 18, sink: 1.5 }, h - 0.2);
    }
    made++;
  }

  const near = new Mesh(mergeGeometries([...geos, ...smalls]), material);
  const probe = new Mesh(undefined, material);

  /** 石柱顶部中心的高度（射线投到该石柱上），供峰顶建屋 */
  function topAt(c) {
    probe.geometry = c.geo;
    raycaster.set(new Vector3(c.x, c.baseY + c.height + 50, c.z), down);
    const hit = raycaster.intersectObject(probe, false)[0];
    return hit && hit.face.normal.y > 0.8 ? hit.point.y : null;
  }

  /** 在石柱顶部附近随机取点（射线投到该石柱上） */
  function topPoints(count, seed, minHeight = 40) {
    const rand = mulberry32(seed);
    const out = [];
    const tall = columns.filter((c) => c.height >= minHeight);
    for (let n = 0; n < count * 3 && out.length < count; n++) {
      const c = tall[Math.floor(rand() * tall.length)];
      const a = rand() * Math.PI * 2;
      const q = Math.sqrt(rand()) * 0.75;
      const x = c.x + Math.cos(a) * c.radius * q;
      const z = c.z + Math.sin(a) * c.radius * q;
      probe.geometry = c.geo;
      raycaster.set(new Vector3(x, c.baseY + c.height + 50, z), down);
      const hit = raycaster.intersectObject(probe, false)[0];
      if (hit && hit.face.normal.y > 0.55) out.push({ x, y: hit.point.y - 0.4, z, slope: hit.face.normal.y });
    }
    return out;
  }

  return { meshes: [near], columns, topPoints, topAt };
}
