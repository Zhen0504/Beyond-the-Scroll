import { AdditiveBlending, CylinderGeometry, Mesh, ShaderMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, box, cyl } from '../../../engine/painted.js';
import { CANDLES } from './layout.js';

/**
 * 烛台（工笔材质）与火苗（加色混合，随时间摇曳）。
 * 不改引擎光照模型，只在画面上点出暖烛光。
 */

const BRONZE = '#8a6a3c';
const DARK = '#3a2a18';

const FLAME_VERT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vFlick;
void main() {
  vUv = uv;
  vec3 p = position;
  float t = uTime * 6.5 + position.x * 9.0 + position.z * 7.0;
  float flick = 0.85 + 0.15 * sin(t) + 0.08 * sin(t * 1.7);
  vFlick = flick;
  p.x += sin(t * 1.3) * 0.04 * position.y;
  p.z += cos(t * 1.1) * 0.03 * position.y;
  p.y *= flick;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FLAME_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vFlick;
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float d = length(vec2(q.x * 1.15, q.y * 0.72));
  float a = smoothstep(0.68, 0.08, d) * (0.7 + 0.4 * vFlick);
  vec3 col = mix(vec3(0.75, 0.18, 0.04), vec3(1.0, 0.9, 0.45), smoothstep(0.55, 0.0, d));
  gl_FragColor = vec4(col * (1.25 + 0.4 * vFlick), a);
}
`;

function candleStick(c) {
  // 高烛：阔座、粗茎、承盘、粗蜡芯，远看也能认出烛火
  const parts = [
    cyl(0.15, 0.08, BRONZE, c.x, 0, c.z, 10, MAT.plain),
    cyl(0.11, 0.05, BRONZE, c.x, 0.08, c.z, 10, MAT.plain),
    cyl(0.055, Math.max(0.35, c.h - 0.28), BRONZE, c.x, 0.13, c.z, 8, MAT.plain),
    cyl(0.12, 0.06, BRONZE, c.x, c.h - 0.2, c.z, 10, MAT.plain),
    cyl(0.08, 0.04, DARK, c.x, c.h - 0.15, c.z, 8, MAT.plain),
    box(0.07, 0.2, 0.07, '#f0e4c4', c.x, c.h - 0.14, c.z, MAT.plain),
  ];
  return parts;
}

export function createCandles({ atmosphere, walkMap, paintedMaterial }) {
  const parts = CANDLES.flatMap((c) => {
    walkMap.addCircle(c.x, c.z, 0.18, -0.2, c.h);
    return candleStick(c);
  });
  const sticks = new Mesh(mergeGeometries(parts), paintedMaterial);
  sticks.frustumCulled = false;

  const flameMat = new ShaderMaterial({
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    uniforms: { uTime: atmosphere.uTime },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const flameGeos = CANDLES.map((c) => {
    const g = new CylinderGeometry(0.025, 0.06, 0.3, 8);
    g.translate(c.x, c.h + 0.12, c.z);
    return g;
  });
  const flames = new Mesh(mergeGeometries(flameGeos), flameMat);
  flames.frustumCulled = false;
  flames.renderOrder = 3;

  return {
    sticks,
    flames,
    material: flameMat,
  };
}
