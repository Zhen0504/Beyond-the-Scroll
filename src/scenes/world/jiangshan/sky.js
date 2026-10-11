import { BackSide, CylinderGeometry, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import { ATMOSPHERE_GLSL } from '../../../engine/shaders/common.glsl.js';

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vDir;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vDir = normalize(wp.xyz - cameraPosition);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_COMMON = /* glsl */ `
uniform sampler2D tSilk;
uniform float uSilkMean;
vec3 skyColor(vec3 dir, vec2 silkUv) {
  vec3 top = uFogFar * vec3(0.9, 0.95, 0.97);
  vec3 col = mix(uFogFar * 1.03, top, smoothstep(0.02, 0.55, dir.y));
  float silk = dot(texture2D(tSilk, silkUv).rgb, vec3(0.333)) / uSilkMean;
  return col * mix(1.0, silk, 0.28);
}
`;

/** 天空：整片绢地（取样原画绢纹），近地平线稍亮，向上微泛青灰 */
const SKY_FRAG = /* glsl */ `
${ATMOSPHERE_GLSL}
${SKY_COMMON}
varying vec2 vUv;
varying vec3 vDir;
varying vec3 vWorld;
void main() {
  vec3 d = normalize(vDir);
  vec2 suv = vec2(atan(d.x, d.z) * 1.6, d.y * 3.0);
  gl_FragColor = vec4(skyColor(d, suv), 1.0);
}
`;

/**
 * 远景画屏：把原作全卷（去印章、调色后）环绕在远方，
 * 只露出群峰与天际，底部化入江雾，顶部融进绢色天空 —— 真正“置身画卷之中”。
 */
const BACKDROP_FRAG = /* glsl */ `
${ATMOSPHERE_GLSL}
${SKY_COMMON}
uniform sampler2D tPainting;
varying vec2 vUv;
varying vec3 vDir;
varying vec3 vWorld;
void main() {
  vec3 d = normalize(vDir);
  vec2 puv = vec2(1.0 - vUv.x, vUv.y);
  vec3 c = gradePainting(texture2D(tPainting, vec2(puv.x * 2.0, puv.y)).rgb);
  c = mix(c, uFogFar, 0.36);
  vec3 sky = skyColor(d, vec2(atan(d.x, d.z) * 1.6, d.y * 3.0));
  c = mix(uFogFar * 1.02, c, smoothstep(0.3, 0.52, vUv.y));
  c = mix(c, sky, smoothstep(0.8, 0.97, vUv.y));
  gl_FragColor = vec4(c, 1.0);
}
`;

export function createSky({ atmosphere, silkTexture, silkMean, paintingTexture }) {
  const common = { ...atmosphere, tSilk: { value: silkTexture }, uSilkMean: { value: silkMean } };
  const sky = new Mesh(
    new SphereGeometry(3200, 32, 16),
    new ShaderMaterial({ vertexShader: VERT, fragmentShader: SKY_FRAG, side: BackSide, depthWrite: false, uniforms: common }),
  );
  sky.renderOrder = -2;

  const R = 1500;
  const H = (Math.PI * R) / (4096 / 730);
  const geo = new CylinderGeometry(R, R, H, 160, 1, true);
  geo.translate(0, H / 2 - 120, 0);
  const backdrop = new Mesh(
    geo,
    new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: BACKDROP_FRAG,
      side: BackSide,
      uniforms: { ...common, tPainting: { value: paintingTexture } },
    }),
  );
  // 让原作中段的群峰正对北方（画中远处）
  backdrop.rotation.y = Math.PI / 2;
  backdrop.renderOrder = -1;
  return { meshes: [sky, backdrop] };
}
