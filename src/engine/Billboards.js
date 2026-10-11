import {
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { ATMOSPHERE_GLSL } from './shaders/common.glsl.js';

const VERT = /* glsl */ `
attribute vec3 aOffset;
attribute vec2 aSize;
attribute vec4 aUv;
attribute float aSeed;
attribute vec3 aTint;
uniform float uTime;
uniform float uSway;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vTint;
varying float vH;
void main() {
  // 绕竖轴朝向镜头（立体纸片）
  vec3 toCam = cameraPosition - aOffset;
  toCam.y = 0.0;
  float l = length(toCam);
  toCam = l > 0.001 ? toCam / l : vec3(0.0, 0.0, 1.0);
  vec3 right = vec3(toCam.z, 0.0, -toCam.x);
  float sway = sin(uTime * 1.1 + aSeed * 40.0) * uSway * position.y * position.y * aSize.y;
  vec3 wp = aOffset + right * (position.x * aSize.x + sway) + vec3(0.0, position.y * aSize.y, 0.0);
  float fx = aSeed > 0.5 ? position.x + 0.5 : 0.5 - position.x;
  vUv = vec2(mix(aUv.x, aUv.z, fx), mix(aUv.y, aUv.w, position.y));
  vWorld = wp;
  vTint = aTint;
  vH = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
${ATMOSPHERE_GLSL}
uniform sampler2D tAtlas;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vTint;
varying float vH;
void main() {
  vec4 t = texture2D(tAtlas, vUv);
  if (t.a < 0.32) discard;
  vec3 col = t.rgb * vTint * mix(0.8, 1.04, smoothstep(0.0, 0.6, vH));
  gl_FragColor = vec4(applyAtmosphere(col, vWorld), smoothstep(0.32, 0.6, t.a));
}
`;

/**
 * 立体纸片（广告牌）批量渲染：一次绘制成百上千棵树或人物。
 * instances: [{ x, y, z, w, h, uv: [u0, v0, u1, v1], seed, tint: [r, g, b] }]
 */
export function createBillboards({ atlas, instances, atmosphere, sway = 0.02 }) {
  const quad = new PlaneGeometry(1, 1);
  quad.translate(0, 0.5, 0);
  const geo = new InstancedBufferGeometry();
  geo.index = quad.index;
  geo.attributes.position = quad.attributes.position;

  const n = instances.length;
  const offset = new Float32Array(n * 3);
  const size = new Float32Array(n * 2);
  const uv = new Float32Array(n * 4);
  const seed = new Float32Array(n);
  const tint = new Float32Array(n * 3);
  const c = new Color();
  instances.forEach((it, i) => {
    offset.set([it.x, it.y, it.z], i * 3);
    size.set([it.w, it.h], i * 2);
    uv.set(it.uv, i * 4);
    seed[i] = it.seed;
    c.setRGB(...(it.tint || [1, 1, 1]));
    tint.set([c.r, c.g, c.b], i * 3);
  });
  geo.setAttribute('aOffset', new InstancedBufferAttribute(offset, 3));
  geo.setAttribute('aSize', new InstancedBufferAttribute(size, 2));
  geo.setAttribute('aUv', new InstancedBufferAttribute(uv, 4));
  geo.setAttribute('aSeed', new InstancedBufferAttribute(seed, 1));
  geo.setAttribute('aTint', new InstancedBufferAttribute(tint, 3));
  geo.instanceCount = n;

  const material = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    alphaToCoverage: true,
    uniforms: { ...atmosphere, tAtlas: { value: atlas }, uSway: { value: sway } },
  });
  const mesh = new Mesh(geo, material);
  mesh.frustumCulled = false;
  return mesh;
}
