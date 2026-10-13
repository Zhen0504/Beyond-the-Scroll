import {
  Color,
  DoubleSide,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
} from 'three';
import { ATMOSPHERE_GLSL, NOISE_GLSL } from '../../../engine/shaders/common.glsl.js';
import { MURAL, PIGMENTS } from './layout.js';

/**
 * 壁画材质与敷彩系统。
 *
 * 两态：残损褪色态 ↔ 重彩复原态。复原由观众的实际笔触累积驱动，不是简单淡入。
 *
 * 画面要素力求贴近第257窟壁画的真实观感：
 *   · 土红（赭石）为地色，其上敷石青、石绿、朱砂、蛤白；
 *   · 一千五百年的病害：龟裂、起甲剥落、烟熏、褪色；
 *   · 矿物色不透明、层层覆盖 —— 这也正是本作容错机制「叠色」的依据。
 *
 * 说明：以上为艺术转译。敷彩过程并非历史绘制流程或文物修复工艺的复原。
 */

/** 自建高质量噪声：低频 fbm + 域扭曲，用于岩面、裂纹与颜料的斑驳 */
const FBM_GLSL = /* glsl */ `
float fuwangHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float fuwangNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = fuwangHash(i);
  float b = fuwangHash(i + vec2(1.0, 0.0));
  float c = fuwangHash(i + vec2(0.0, 1.0));
  float d = fuwangHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fuwangFbm(vec2 p, int octaves) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    v += a * fuwangNoise(p);
    p *= 2.03;
    p += vec2(17.3, 9.1);
    a *= 0.5;
  }
  return v;
}

/** 龟裂纹：噪声脊线取反，形成细密的网状裂痕。
 *  频率以画幅比例校正 —— 横卷极宽，若在 uv 上等频取样会退化成竖向条纹。 */
float fuwangCrack(vec2 uv, float scale, float width) {
  vec2 p = vec2(uv.x * 5.83, uv.y);   // 画幅宽高比
  float n = fuwangFbm(p * scale, 5);
  float ridge = abs(n - 0.5) * 2.0;
  return 1.0 - smoothstep(0.0, width, ridge);
}
`;

/* ------------------------------------------------------------------ *
 *  壁画材质
 * ------------------------------------------------------------------ */

const MURAL_VERT = /* glsl */ `
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

const MURAL_FRAG = /* glsl */ `
${NOISE_GLSL}
${ATMOSPHERE_GLSL}
${FBM_GLSL}

uniform sampler2D uMap;        // 壁画原图
uniform sampler2D uPaint;      // 敷彩累积：R = 覆盖量, G = 颜料序号
uniform float uPigmentR;       // 当前颜料 — 以下三项一致
uniform float uPigmentG;
uniform float uPigmentB;
uniform float uHover;          // 当前折区段的高亮
uniform float uHoverU0;        // 当前折区段的 u 范围
uniform float uHoverU1;
uniform float uReveal;
// 五折各自的复原进度：已敷彩的区段即使切走后也保持重彩
uniform float uFold0;
uniform float uFold1;
uniform float uFold2;
uniform float uFold3;
uniform float uFold4;
// uTime 由 ATMOSPHERE_GLSL 声明，此处不得重复

varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;

/** 蛤白（铅白）的偏暖白，是北魏壁画提亮人物的主要用色 */
const vec3 HAIBAI = vec3(0.902, 0.878, 0.796);

void main() {
  vec2 uv = vUv;
  vec3 raw = texture2D(uMap, uv).rgb;
  float lum = dot(raw, vec3(0.299, 0.587, 0.114));

  /* ---- 一、残损态 ---- *
   * 褪色而非变脏：矿物色氧化后偏灰白、发粉，土红地色相对稳定。
   * 明度不大幅压低 —— 真实壁画的残损是"淡"，不是"黑"。          */
  vec3 faded = mix(vec3(lum), raw, 0.30);
  faded = mix(faded, faded * vec3(1.10, 1.00, 0.90), 0.55);   // 偏暖
  faded = mix(faded, vec3(0.72, 0.66, 0.56), 0.26);           // 泛出地仗的灰白

  // 烟熏：局部积聚的暖灰暗色，只在下缘与角落
  float smoke = fuwangFbm(vec2(uv.x * 5.83, uv.y) * vec2(4.2, 2.4) + 4.0, 4);
  smoke = smoothstep(0.55, 0.95, smoke) * (1.0 - smoothstep(0.0, 0.34, uv.y));
  faded *= 1.0 - smoke * 0.30;

  // 地仗的粗粝
  float grit = fuwangFbm(vec2(uv.x * 5.83, uv.y) * 120.0, 2);
  faded *= 0.94 + grit * 0.12;

  /* ---- 二、病害 ---- */

  float crackA = fuwangCrack(uv + vec2(0.0, 0.31), 7.0, 0.075);
  float crackB = fuwangCrack(uv + vec2(3.7, 1.2), 19.0, 0.055);
  float crack = clamp(crackA * 0.7 + crackB * 0.5, 0.0, 1.0);
  faded = mix(faded, faded * 0.55, crack * 0.8);

  // 起甲剥落：成片脱落，露出更暗的地仗
  float loss = fuwangFbm(vec2(uv.x * 5.83, uv.y) * vec2(6.5, 4.5) + 91.0, 5);
  float lost = smoothstep(0.64, 0.78, loss);
  vec3 plaster = vec3(0.34, 0.28, 0.22) * (0.85 + grit * 0.3);
  faded = mix(faded, plaster, lost * 0.5);

  /* ---- 三、重彩态 ---- *
   * 矿物色覆盖力强、饱和度高。这是敷彩的"奖励"：必须一眼可辨。
   *
   * 覆盖量取「笔触累积」与「本折进度」的较大者：
   * 前者给出笔触的颗粒感，后者保证已完成的区段在切折后依然保持重彩。 */
  vec2 paint = texture2D(uPaint, uv).rg;
  float paintMask = paint.r;
  float pigIndex = paint.g;

  float foldProgress = uFold0;
  if (uv.x >= 0.135) foldProgress = uFold1;
  if (uv.x >= 0.30) foldProgress = uFold2;
  if (uv.x >= 0.62) foldProgress = uFold3;
  if (uv.x >= 0.82) foldProgress = uFold4;

  float amount = max(paintMask, foldProgress);
  float cover = smoothstep(0.0, 0.85, clamp(amount, 0.0, 1.0));

  vec3 mineral = vec3(uPigmentR, uPigmentG, uPigmentB);
  mineral *= 0.88 + pigIndex * 0.24;

  vec3 rich = raw;
  rich = mix(vec3(lum), rich, 1.45);      // 显著提高饱和度
  rich = mix(rich, rich * vec3(1.06, 1.0, 0.94), 0.4);
  rich *= 1.12;
  // 新的矿物层压在原色之上：既像矿物色，又保留线描与形
  vec3 repainted = mix(rich, mineral, 0.52);
  repainted = mix(repainted, repainted * (0.94 + fuwangFbm(vec2(uv.x * 5.83, uv.y) * 190.0 + 7.0, 3) * 0.14), 0.6);

  // 只剩很少的病害残留：已重彩处几乎不见剥落
  repainted *= 1.0 - lost * 0.12 - crack * 0.10;

  vec3 col = mix(faded, repainted, cover);

  // 笔触湿边：未落色处的极细高光
  float edge = smoothstep(0.04, 0.32, paintMask) * (1.0 - smoothstep(0.30, 0.66, paintMask));
  col += vec3(0.11, 0.095, 0.07) * edge * 0.55;

  /* ---- 四、引导 ---- */

  // 当前折区段的柔和呼吸高亮：只在暗淡处轻提，不破坏画面
  float inFold = step(uHoverU0, uv.x) * step(uv.x, uHoverU1);
  float breath = 0.5 + 0.5 * sin(uTime * 1.1);
  col += vec3(0.055, 0.048, 0.032) * inFold * uHover * breath;

  gl_FragColor = vec4(applyAtmosphere(col, vWorld), 1.0);
}
`;

/* ------------------------------------------------------------------ *
 *  笔触落色：渲染到累积贴图
 * ------------------------------------------------------------------ */

const STAMP_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const STAMP_FRAG = /* glsl */ `
${FBM_GLSL}

uniform sampler2D uPrev;
uniform vec2  uBrush;      // 笔尖位置（uv）
uniform vec2  uPrevBrush;  // 上一位置，用于沿笔迹拉长
uniform float uRadius;
uniform float uAmount;
uniform float uIndex;      // 颜料序号（0..1）
uniform float uSeed;

varying vec2 vUv;

void main() {
  vec2 d = vUv - uBrush;
  d.x *= 3.2;              // 画面横向被拉长，笔尖亦随之呈扁形

  float r = length(d) / uRadius;
  // 柔边笔触
  float stamp = 1.0 - smoothstep(0.35, 1.0, r);

  // 笔毫的丝缕：沿笔迹方向的细密纹路
  vec2 dir = normalize(uBrush - uPrevBrush + vec2(1e-6));
  float along = dot(vUv - uBrush, dir);
  float bristle = fuwangNoise(vec2(along * 900.0, dot(vUv, vec2(-dir.y, dir.x)) * 260.0) + uSeed);
  stamp *= 0.72 + bristle * 0.5;

  // 矿物颗粒：落色不均，形成矿物颜料的斑驳
  float grain = fuwangFbm(vUv * vec2(560.0, 210.0) + uSeed, 3);
  stamp *= 0.78 + grain * 0.36;

  stamp = clamp(stamp * uAmount, 0.0, 1.0);

  vec4 prev = texture2D(uPrev, vUv);
  // 覆盖式累积：后落的色盖住先前的，符合矿物颜料层层敷染的物理
  float amount = clamp(prev.r + stamp * (1.0 - prev.r * 0.55), 0.0, 1.0);
  float index = mix(prev.g, uIndex, step(0.004, stamp));
  gl_FragColor = vec4(amount, index, 0.0, 1.0);
}
`;

/* ------------------------------------------------------------------ *
 *  对外接口
 * ------------------------------------------------------------------ */

export function createMuralMaterial({ map, atmosphere }) {
  const material = new ShaderMaterial({
    vertexShader: MURAL_VERT,
    fragmentShader: MURAL_FRAG,
    side: DoubleSide,
    uniforms: {
      uMap: { value: map },
      uPaint: { value: null },
      uPigmentR: { value: 0.25 },
      uPigmentG: { value: 0.43 },
      uPigmentB: { value: 0.57 },
      uHover: { value: 0 },
      uHoverU0: { value: 0 },
      uHoverU1: { value: 1 },
      uFold0: { value: 0 },
      uFold1: { value: 0 },
      uFold2: { value: 0 },
      uFold3: { value: 0 },
      uFold4: { value: 0 },
      uTime: { value: 0 },
      uReveal: { value: 1 },
      ...atmosphere,
    },
  });
  return material;
}

/**
 * 敷彩画布：以 Ping-Pong RenderTarget 保存笔触累积。
 * 用真实笔触而非均匀淡入，观众能看见"画上去"的过程。
 */
export class PaintCanvas {
  constructor(renderer, { width = 2048, height = 512 } = {}) {
    this.renderer = renderer;
    const opts = {
      format: undefined,           // 交给 three 选择 RGBA8
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.targets = [
      new WebGLRenderTarget(width, height, opts),
      new WebGLRenderTarget(width, height, opts),
    ];
    this.flip = 0;
    this.quadScene = new Scene();
    this.quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new ShaderMaterial({
      vertexShader: STAMP_VERT,
      fragmentShader: STAMP_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrev: { value: null },
        uBrush: { value: [0.5, 0.5] },
        uPrevBrush: { value: [0.5, 0.5] },
        uRadius: { value: 0.03 },
        uAmount: { value: 0.5 },
        uIndex: { value: 0.0 },
        uSeed: { value: 0.0 },
      },
    });
    this.quadScene.add(new Mesh(new PlaneGeometry(2, 2), this.material));
    this.clear();
  }

  get read() {
    return this.targets[this.flip].texture;
  }

  /** 清空为未敷彩 */
  clear() {
    const previous = this.renderer.getRenderTarget();
    const prevColor = new Color();
    this.renderer.getClearColor(prevColor);
    const prevAlpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 0);
    for (const t of this.targets) {
      this.renderer.setRenderTarget(t);
      this.renderer.clear(true, false, false);
    }
    this.renderer.setRenderTarget(previous);
    this.renderer.setClearColor(prevColor, prevAlpha);
    this.flip = 0;
  }

  /**
   * 落一笔。
   * @param {{x:number,y:number}} uv  笔尖（壁画 uv）
   * @param {{x:number,y:number}} prev 上一笔尖
   * @param {number} index 颜料序号 0..1
   * @param {number} amount 落色强度
   */
  stamp(uv, prev, index, amount = 0.42) {
    const src = this.targets[this.flip];
    const dst = this.targets[1 - this.flip];
    const u = this.material.uniforms;
    u.uPrev.value = src.texture;
    u.uBrush.value = [uv.x, uv.y];
    u.uPrevBrush.value = [prev?.x ?? uv.x, prev?.y ?? uv.y];
    u.uIndex.value = index;
    u.uAmount.value = amount;
    u.uSeed.value = Math.random() * 10;

    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(dst);
    this.renderer.render(this.quadScene, this.quadCam);
    this.renderer.setRenderTarget(previous);
    this.flip = 1 - this.flip;
  }

  /**
   * 该位置的敷彩量由 Restorer 依笔触轨迹推算，
   * 这里不从 GPU 回读（避免同步阻塞）。
   */
  dispose() {
    this.targets.forEach((t) => t.dispose());
    this.material.dispose();
    this.quadScene.children.forEach((c) => c.geometry?.dispose());
  }
}

/** 颜料序号 → 0..1，供着色器使用 */
export function pigmentIndex(id) {
  const i = PIGMENTS.findIndex((p) => p.id === id);
  return i < 0 ? 0 : i / Math.max(1, PIGMENTS.length - 1);
}

/** 颜料 id → 归一化 rgb */
export function pigmentRgb(id) {
  const hex = PIGMENTS.find((p) => p.id === id)?.hex ?? '#3f6f92';
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const MURAL_SIZE = MURAL;
