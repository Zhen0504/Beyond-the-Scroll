import { CanvasTexture, Mesh, PlaneGeometry, SRGBColorSpace, ShaderMaterial } from 'three';
import { ATMOSPHERE_GLSL } from '../../../engine/shaders/common.glsl.js';
import { mulberry32 } from '../../../utils/math.js';

/**
 * 白云：原作的云是“留白”—— 横向舒展的空白绢地，边缘偶有淡淡的勾云线。
 * 在三维中用一张张横向云片（立体纸片）穿插于群峰之间，远近叠出层次。
 */
function paintCloud(g, rand, w, h) {
  g.clearRect(0, 0, w, h);
  const blobs = 26;
  for (let i = 0; i < blobs; i++) {
    const t = i / (blobs - 1);
    const x = w * (0.1 + 0.8 * t) + (rand() - 0.5) * w * 0.08;
    const y = h * (0.55 + (rand() - 0.5) * 0.25 - Math.sin(t * Math.PI) * 0.12);
    const r = h * (0.18 + rand() * 0.22) * (0.6 + Math.sin(t * Math.PI) * 0.6);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.5)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.28)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, r * 1.7, r, 0, 0, Math.PI * 2);
    g.fill();
  }
  // 勾云：上缘几道淡墨弧线
  g.strokeStyle = 'rgba(120,120,110,0.22)';
  g.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const x = w * (0.18 + rand() * 0.64), y = h * (0.36 + rand() * 0.16);
    const r = h * (0.08 + rand() * 0.1);
    g.beginPath();
    g.arc(x, y, r, Math.PI * 1.05, Math.PI * 1.9);
    g.stroke();
  }
}

function createCloudTextures() {
  return [1, 2, 3].map((s) => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 192;
    paintCloud(c.getContext('2d'), mulberry32(s * 17), c.width, c.height);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  });
}

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying float vDist;
uniform float uDrift;
uniform float uTime;
void main() {
  vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  center.x += sin(uTime * 0.03 + uDrift * 6.28) * 6.0;
  vec3 toCam = cameraPosition - center;
  toCam.y = 0.0;
  toCam = normalize(toCam);
  vec3 right = vec3(toCam.z, 0.0, -toCam.x);
  vec2 s = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  vec3 wp = center + right * position.x * s.x + vec3(0.0, position.y * s.y, 0.0);
  vUv = uv;
  vWorld = wp;
  vDist = length(cameraPosition - center);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
${ATMOSPHERE_GLSL}
uniform sampler2D tCloud;
uniform float uOpacity;
uniform vec3 uTint;
varying vec2 vUv;
varying vec3 vWorld;
varying float vDist;
void main() {
  vec4 t = texture2D(tCloud, vUv);
  // 云色取绢色略提亮；走近时淡去，避免“撞进”纸片
  vec3 col = mix(uFogFar, uTint, 0.6) * mix(0.92, 1.0, t.r);
  float a = t.a * uOpacity * smoothstep(25.0, 90.0, vDist);
  // 云本是绢色，不再叠加大气透视，仅随距离微微融入远景
  gl_FragColor = vec4(mix(col, uFogFar, smoothstep(200.0, 1400.0, vDist) * 0.5), a);
}
`;

export function createClouds({ atmosphere, extra = [] }) {
  const textures = createCloudTextures();
  const geo = new PlaneGeometry(1, 1);
  const rand = mulberry32(55);
  const meshes = [];
  const tint = atmosphere.uFogFar.value.clone().multiplyScalar(1.12);

  const add = (x, y, z, w, h, opacity) => {
    const m = new Mesh(
      geo,
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          ...atmosphere,
          tCloud: { value: textures[Math.floor(rand() * textures.length)] },
          uOpacity: { value: opacity },
          uTint: { value: tint },
          uDrift: { value: rand() },
        },
      }),
    );
    m.position.set(x, y, z);
    m.scale.set(w, h, 1);
    m.frustumCulled = false;
    m.renderOrder = 3;
    meshes.push(m);
  };

  // 群峰间的云带（原作卷中最醒目的留白）
  for (let i = 0; i < 26; i++) {
    const x = -280 + (i / 25) * 520 + (rand() - 0.5) * 30;
    add(x, 34 + rand() * 46, -96 - rand() * 60, 120 + rand() * 120, 28 + rand() * 22, 0.75 + rand() * 0.25);
  }
  // 湖湾山腰
  for (let i = 0; i < 5; i++) add(-70 + i * 26, 22 + rand() * 10, -84 - rand() * 8, 70 + rand() * 40, 16 + rand() * 6, 0.7);
  // 南山
  for (let i = 0; i < 10; i++) add(-260 + i * 52 + rand() * 20, 26 + rand() * 18, 120 + rand() * 40, 110 + rand() * 80, 24 + rand() * 12, 0.65);
  // 东面江上低雾
  for (let i = 0; i < 8; i++) add(300 + rand() * 420, 6 + rand() * 12, -160 + rand() * 320, 260 + rand() * 160, 30 + rand() * 18, 0.6);
  // 远山腰际
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2;
    const deg = ((a * 180) / Math.PI + 360) % 360;
    if (deg < 20 || deg > 340) continue;
    const r = 560 + rand() * 420;
    add(Math.cos(a) * r, 70 + rand() * 90, -40 + Math.sin(a) * r * 0.85, 360 + rand() * 240, 60 + rand() * 40, 0.7);
  }
  // 额外（瀑布水雾等）
  extra.forEach((e) => add(e.x, e.y, e.z, e.w, e.h, e.opacity ?? 0.6));

  return { meshes };
}
