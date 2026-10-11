import { BoxGeometry, BufferAttribute, Color, CylinderGeometry, DoubleSide, Matrix4, ShaderMaterial } from 'three';
import { ATMOSPHERE_GLSL, NOISE_GLSL } from './shaders/common.glsl.js';

/**
 * 工笔设色材质：顶点色 + 程序化质感（瓦、格子门窗、粉墙、木纹、石砌、茅草、衣褶）。
 * 建筑、舟船、人物共用，所有构件合并为少量网格。
 */
export const MAT = { plain: 0, tile: 1, lattice: 2, plaster: 3, wood: 4, stone: 5, thatch: 6, cloth: 7 };

const tmp = new Color();

/** 给几何体上色并标注质感类型（转为非索引，便于合并） */
export function paint(geo, hex, mat = MAT.plain) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  tmp.set(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('aMat', new BufferAttribute(new Float32Array(n).fill(mat), 1));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

const m4 = new Matrix4();
export function place(geo, x, y, z, ry = 0) {
  m4.makeRotationY(ry).setPosition(x, y, z);
  return geo.applyMatrix4(m4);
}

/** 底面中心在 (x, y, z) 的长方体 */
export function box(w, h, d, hex, x = 0, y = 0, z = 0, mat = MAT.plain) {
  const g = new BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return paint(g, hex, mat);
}

/** 底面中心在 (x, y, z) 的柱 */
export function cyl(r, h, hex, x, y, z, seg = 8, mat = MAT.wood) {
  const g = new CylinderGeometry(r * 0.92, r, h, seg);
  g.translate(x, y + h / 2, z);
  return paint(g, hex, mat);
}

const VERT = /* glsl */ `
attribute vec3 color;
attribute float aMat;
varying float vMat;
varying vec3 vColor;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  vMat = aMat;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${NOISE_GLSL}
${ATMOSPHERE_GLSL}
varying vec3 vColor;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vMat;

vec2 planar(vec3 n, vec3 p) {
  if (abs(n.y) > 0.75) return p.xz;
  return abs(n.x) > abs(n.z) ? vec2(p.z, p.y) : vec2(p.x, p.y);
}

void main() {
  vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
  vec3 p = vWorld;
  vec3 col = vColor * (1.0 + snoise(p * 0.9) * 0.04);
  float m = vMat;
  vec2 uv = planar(n, p);

  if (m > 0.5 && m < 1.5) {
    // 瓦：顺坡瓦垄 + 横向瓦缝
    vec2 dn = normalize(n.xz + vec2(1e-4));
    float across = dot(p.xz, vec2(-dn.y, dn.x));
    float along = dot(p.xz, dn) + p.y * 0.6;
    float slopeK = smoothstep(0.97, 0.75, n.y);
    float ridge = smoothstep(0.55, 1.0, abs(sin(across * 6.0)));
    float course = smoothstep(0.85, 1.0, abs(sin(along * 9.0 + sin(across * 3.0))));
    col *= 1.0 - (ridge * 0.32 + course * 0.12) * slopeK;
    col *= 1.0 + snoise(p * 0.35) * 0.08;
  } else if (m < 2.5) {
    // 格子门窗：木格 + 糊纸
    vec2 c = abs(fract(uv * vec2(3.6, 3.6)) - 0.5);
    float line = smoothstep(0.38, 0.47, max(c.x, c.y));
    vec2 d = abs(fract(uv * vec2(1.2, 0.8)) - 0.5);
    float frame = smoothstep(0.43, 0.48, max(d.x, d.y));
    col = mix(col, vec3(0.16, 0.08, 0.05), max(line * 0.85, frame));
  } else if (m < 3.5) {
    // 粉墙：斑驳与雨痕
    col *= 1.0 + snoise(p * 1.6) * 0.035 + snoise(p * 0.3) * 0.05;
    col *= 1.0 - smoothstep(0.45, 0.95, snoise(vec3(p.x * 0.6, p.y * 2.4, p.z * 0.6))) * 0.08;
  } else if (m < 4.5) {
    // 木纹
    float g = sin(uv.x * 26.0 + snoise(p * 0.7) * 5.0);
    col *= 1.0 - smoothstep(0.7, 1.0, g) * 0.14;
  } else if (m < 5.5) {
    // 石砌：错缝条石
    float rowF = uv.y * 2.4;
    float row = floor(rowF);
    float u2 = uv.x * 1.25 + row * 0.5;
    float joint = max(smoothstep(0.43, 0.5, abs(fract(rowF) - 0.5)), smoothstep(0.45, 0.5, abs(fract(u2) - 0.5)));
    col *= (1.0 - joint * 0.32) * (1.0 + snoise(p * 0.8) * 0.07);
  } else if (m < 6.5) {
    // 茅草：顺坡的草茎
    vec2 dn = normalize(n.xz + vec2(1e-4));
    float across = dot(p.xz, vec2(-dn.y, dn.x));
    float along = dot(p.xz, dn) - p.y;
    float s = snoise(vec2(across * 9.0, along * 0.45));
    float s2 = snoise(vec2(across * 23.0, along * 1.2));
    col *= 0.8 + 0.22 * smoothstep(-0.6, 0.8, s) + 0.1 * s2;
    col *= 1.0 - smoothstep(0.96, 1.0, abs(sin(along * 2.2 + s * 0.6))) * 0.12;
  } else if (m < 7.5) {
    // 衣褶：竖向柔和的褶线
    float f = sin(uv.x * 16.0 + snoise(p * 2.0) * 2.5);
    col *= 1.0 - smoothstep(0.8, 1.0, f) * 0.16;
  }

  // 檐下与背光面略深，保持平涂感
  col *= 0.68 + 0.32 * smoothstep(-0.6, 0.9, dot(n, uSunDir)) + 0.08 * n.y;
  gl_FragColor = vec4(applyAtmosphere(col, vWorld), 1.0);
}
`;

export function createPaintedMaterial(atmosphere) {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: DoubleSide,
    uniforms: { ...atmosphere },
  });
}
