import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  Vector4,
} from 'three';
import { mulberry32 } from '../../../utils/math.js';
import { ATMOSPHERE_GLSL, NOISE_GLSL } from '../../../engine/shaders/common.glsl.js';
import { STREAMS, STRUCTURES, WATER_LEVEL } from './layout.js';
import { WATER_RECT, riverFlow } from './terrain.js';

const WATER_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/**
 * 水面：原作的江水是平涂的青灰，以细密的横向水纹表现流动。
 * 水纹按流向图顺流漂移（两相位交替混合的 flow map）：窄处急、湖面缓。
 * 依据水深：近岸浅而透、远处沉静；岸线一道浅色水痕。
 */
const WATER_FRAG = /* glsl */ `
${NOISE_GLSL}
${ATMOSPHERE_GLSL}
uniform sampler2D tDepth;
uniform vec4 uRect;
varying vec3 vWorld;

vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }

// 静态水纹图样：横向断续细线 + 顺流的碎光
float pattern(vec2 p) {
  float wob = snoise(p * 0.03) * 3.0;
  float lines = sin((p.y + wob) * 1.15 + snoise(p * 0.012) * 4.0);
  float dash = smoothstep(-0.1, 0.5, snoise(p * vec2(0.035, 0.25)));
  float l = smoothstep(0.9, 0.99, lines) * dash;
  float glint = smoothstep(0.62, 0.92, snoise(p * vec2(0.08, 0.55))) * 0.32;
  return max(l, glint);
}

void main() {
  vec2 uv = (vWorld.xz - uRect.xy) / uRect.zw;
  bool inside = uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0;
  vec4 W = inside ? texture2D(tDepth, uv) : vec4(1.0, 0.5, 0.5, 0.05);
  float depth = W.r;
  vec2 flow = (W.gb * 2.0 - 1.0) * W.a * 1.5;
  vec2 p = vWorld.xz;

  vec3 shallow = srgb(vec3(0.64, 0.72, 0.66));
  vec3 deep = srgb(vec3(0.42, 0.55, 0.58));
  vec3 col = mix(shallow, deep, smoothstep(0.0, 0.7, depth));
  col = mix(col, col * vec3(0.94, 1.0, 1.03), snoise(p * 0.01) * 0.5 + 0.5);

  // 顺流漂移的水纹
  float jitter = snoise(p * 0.015) * 0.35;
  float ph0 = fract(uTime * 0.1 + jitter);
  float ph1 = fract(uTime * 0.1 + 0.5 + jitter);
  float w0 = 1.0 - abs(ph0 * 2.0 - 1.0);
  float pat = pattern(p - flow * ph0 * 10.0) * w0 + pattern(p - flow * ph1 * 10.0) * (1.0 - w0);
  // 急流处多一层细碎的翻花
  float rapid = smoothstep(0.35, 0.9, W.a) * smoothstep(0.55, 0.85, snoise(vec2(p.x * 0.6, p.y * 1.4) - flow * uTime * 1.2));
  float dist = length(vWorld - cameraPosition);
  float fade = 1.0 - smoothstep(50.0, 240.0, dist);
  col = mix(col, srgb(vec3(0.87, 0.89, 0.84)), (pat * 0.5 + rapid * 0.35) * fade);

  // 掠射时映出绢色天光
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(V.y, 0.0), 5.0);
  col = mix(col, uFogFar * vec3(0.9, 0.96, 1.0), fres * 0.32);

  // 岸线水痕（随水波轻轻起伏）
  float foam = 1.0 - smoothstep(0.0, 0.07 + 0.03 * sin(uTime * 1.3 + p.x * 0.4 + p.y * 0.3), depth);
  col = mix(col, srgb(vec3(0.9, 0.87, 0.76)), foam * 0.5);

  float alpha = mix(0.5, 0.94, smoothstep(0.0, 0.35, depth));
  gl_FragColor = vec4(applyAtmosphere(col, vWorld), alpha);
}
`;

const FALL_VERT = /* glsl */ `
attribute float aV;
varying vec2 vUv2;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vUv2 = vec2(uv.x, aV);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FALL_FRAG = /* glsl */ `
${NOISE_GLSL}
${ATMOSPHERE_GLSL}
uniform float uLen;
uniform float uSpeed;
uniform float uSeed;
varying vec2 vUv2;
varying vec3 vWorld;
void main() {
  float v = vUv2.y;
  // 竖向水丝：多层噪声以不同速度下落
  float a = snoise(vec2(vUv2.x * 11.0 + uSeed, v * 0.28 - uTime * uSpeed));
  float b = snoise(vec2(vUv2.x * 27.0 - uSeed, v * 0.7 - uTime * uSpeed * 1.5));
  float c = snoise(vec2(vUv2.x * 5.0, v * 0.12 - uTime * uSpeed * 0.6));
  float streak = smoothstep(-0.35, 0.75, a * 0.55 + b * 0.3 + c * 0.25);
  // 参差的水帘边缘
  float rag = snoise(vec2(v * 0.5 - uTime * uSpeed, uSeed)) * 0.12;
  float edge = smoothstep(0.0, 0.18 + rag, vUv2.x) * smoothstep(1.0, 0.82 - rag, vUv2.x);
  // 顶端口沿：水色较实、较亮；下段散开变薄
  float lip = 1.0 - smoothstep(0.0, 2.5, v);
  float spread = smoothstep(uLen * 0.55, uLen, v);
  float ends = smoothstep(0.0, 0.6, v) * smoothstep(uLen + 0.2, uLen - 1.2, v);
  vec3 col = mix(vec3(0.74, 0.81, 0.8), vec3(0.98, 0.98, 0.95), streak);
  col = mix(col, vec3(0.86, 0.9, 0.88), lip * 0.6);
  float alpha = edge * ends * mix(0.42 + 0.55 * streak, 0.85, lip) * (1.0 - spread * 0.35);
  gl_FragColor = vec4(applyAtmosphere(col, vWorld), alpha);
}
`;

/** 潭面白沫：自落水处向外扩散的环纹 */
const FOAM_FRAG = /* glsl */ `
${NOISE_GLSL}
${ATMOSPHERE_GLSL}
varying vec2 vUv2;
varying vec3 vWorld;
void main() {
  vec2 q = vUv2 * 2.0 - 1.0;
  float r = length(q);
  float ring = snoise(vec2(r * 7.0 - uTime * 1.6, atan(q.y, q.x) * 2.0));
  float n = snoise(q * 6.0 + uTime * 0.4);
  float m = smoothstep(-0.1, 0.8, ring * 0.6 + n * 0.4) * (1.0 - smoothstep(0.35, 1.0, r));
  gl_FragColor = vec4(applyAtmosphere(vec3(0.95, 0.96, 0.93), vWorld), m * 0.75);
}
`;

/**
 * 瀑布水帘：自溪涧源头（崖脚水潭）向北沿崖面上溯到瀑顶，
 * 每一行放在“崖面达到该高度处”再向外（+z）让出一段，水帘始终悬在崖前、不嵌进山体；
 * 近顶处让得更多，像水从石口冲出后再落下。
 */
function waterfallRibbon(heightAt, { x, z, top, width }, { offset = 1.1, widthK = 1, bulge = 1.8 } = {}) {
  const hx = (width * 0.75) / 2;
  const cliff = (zz) => {
    let h = -Infinity;
    for (const k of [-1, -0.5, 0, 0.5, 1]) h = Math.max(h, heightAt(x + k * hx, zz));
    return h;
  };
  const rows = [];
  let zz = z;
  for (let y = 0.05; y <= top + 0.01; y += 0.45) {
    while (cliff(zz) < y && zz > z - 90) zz -= 0.12;
    const out = offset + bulge * Math.pow(Math.max(0, (y - (top - 7)) / 7), 2);
    rows.push([zz + out, y]);
  }
  rows.reverse(); // 自上而下
  const pos = [], uv = [], av = [];
  let len = 0;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) len += Math.hypot(rows[i][0] - rows[i - 1][0], rows[i][1] - rows[i - 1][1]);
    const [rz, y] = rows[i];
    const w = width * widthK * (0.7 + 0.55 * (i / rows.length));
    pos.push(x - w / 2, y, rz, x + w / 2, y, rz);
    uv.push(0, 0, 1, 0);
    av.push(len, len);
  }
  const index = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('aV', new BufferAttribute(new Float32Array(av), 1));
  return { geometry: g, length: len, foot: rows[rows.length - 1] };
}

export function createWater({ atmosphere, depthTexture, heightAt }) {
  const plane = new CircleGeometry(2600, 64);
  plane.rotateX(-Math.PI / 2);
  plane.translate(0, WATER_LEVEL, 0);
  const water = new Mesh(
    plane,
    new ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      uniforms: {
        ...atmosphere,
        tDepth: { value: depthTexture },
        uRect: { value: new Vector4(WATER_RECT.minX, WATER_RECT.minZ, WATER_RECT.maxX - WATER_RECT.minX, WATER_RECT.maxZ - WATER_RECT.minZ) },
      },
    }),
  );
  water.renderOrder = 1;

  const falls = [];
  const extras = [];
  STRUCTURES.waterfalls.forEach((wf, i) => {
    // 水帘起点取对应溪涧的源头（崖脚水潭）
    const src = STREAMS[i]?.points[0] ?? [wf.x, wf.z];
    const spec = { x: src[0], z: src[1], top: wf.top, width: wf.width };
    const layers = [
      { offset: 1.1, widthK: 1, bulge: 1.8, speed: 1.5, seed: 0 },
      { offset: 1.45, widthK: 0.5, bulge: 2.3, speed: 2.3, seed: 7.3 },
    ];
    let foot = null;
    layers.forEach((L, k) => {
      const r = waterfallRibbon(heightAt, spec, L);
      foot = foot ?? r.foot;
      const mesh = new Mesh(
        r.geometry,
        new ShaderMaterial({
          vertexShader: FALL_VERT,
          fragmentShader: FALL_FRAG,
          transparent: true,
          depthWrite: false,
          uniforms: { ...atmosphere, uLen: { value: r.length }, uSpeed: { value: L.speed }, uSeed: { value: L.seed + i * 3 } },
        }),
      );
      mesh.renderOrder = 2 + k;
      if (k === 0) {
        mesh.userData.foot = { x: spec.x, z: foot[0] };
        falls.push(mesh);
      } else extras.push(mesh);
    });
    // 潭面白沫
    const disc = new CircleGeometry(wf.width * 1.1, 32);
    disc.rotateX(-Math.PI / 2);
    const fm = new Mesh(
      disc,
      new ShaderMaterial({
        vertexShader: FALL_VERT.replace('vUv2 = vec2(uv.x, aV);', 'vUv2 = uv;').replace('attribute float aV;', ''),
        fragmentShader: FOAM_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: { ...atmosphere },
      }),
    );
    fm.position.set(spec.x, WATER_LEVEL + 0.04, foot[0] + 0.6);
    fm.renderOrder = 4;
    extras.push(fm);
  });

  return { meshes: [water, ...falls, ...extras], falls };
}

/* ------------------------------------------------------------------ */
/* 水面落叶：随水流漂走，让流动一目了然                                  */
/* ------------------------------------------------------------------ */
function leafTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.translate(32, 32);
  g.rotate(-0.5);
  g.fillStyle = '#ffffff';
  g.strokeStyle = 'rgba(40,30,20,0.9)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-24, 0);
  g.quadraticCurveTo(0, -14, 24, 0);
  g.quadraticCurveTo(0, 14, -24, 0);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(-28, 0);
  g.lineTo(20, 0);
  g.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function createDriftLeaves({ heightAt, count = 80 }) {
  const rand = mulberry32(808);
  const geo = new PlaneGeometry(0.42, 0.42);
  geo.rotateX(-Math.PI / 2);
  const mat = new MeshBasicMaterial({ map: leafTexture(), alphaTest: 0.5, side: DoubleSide });
  const mesh = new InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  const palette = ['#b3472f', '#c97c3a', '#b9913f', '#8f3b2a', '#a6a04e'].map((h) => new Color(h));
  const leaves = Array.from({ length: count }, (_, i) => {
    mesh.setColorAt(i, palette[i % palette.length]);
    return { x: 0, z: 0, rot: rand() * 6.28, spin: (rand() - 0.5) * 0.6, alive: false, phase: rand() * 6.28, scale: 0.7 + rand() * 0.6 };
  });
  const dummy = new Object3D();

  function respawn(l, cx, cz) {
    for (let k = 0; k < 12; k++) {
      const a = rand() * Math.PI * 2, r = 8 + rand() * 55;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (heightAt(x, z) < -0.4) {
        l.x = x;
        l.z = z;
        l.alive = true;
        return;
      }
    }
    l.alive = false;
  }

  let t = 0;
  function update(dt, cam) {
    t += dt;
    leaves.forEach((l, i) => {
      if (!l.alive || Math.hypot(l.x - cam.x, l.z - cam.z) > 75) respawn(l, cam.x, cam.z);
      if (l.alive) {
        const f = riverFlow(l.x, l.z);
        l.x += (f.x + Math.sin(t * 0.7 + l.phase) * 0.05) * dt;
        l.z += (f.z + Math.cos(t * 0.6 + l.phase) * 0.05) * dt;
        l.rot += l.spin * dt;
        // 搁浅则重新投放
        if (heightAt(l.x, l.z) > -0.15) l.alive = false;
      }
      dummy.position.set(l.x, l.alive ? 0.03 + Math.sin(t * 1.5 + l.phase) * 0.01 : -50, l.z);
      dummy.rotation.set(0, l.rot, 0);
      dummy.scale.setScalar(l.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update };
}
