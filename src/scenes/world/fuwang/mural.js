import {
  Color,
  DoubleSide,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector4,
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
uniform float uHover;          // 引导强度（常驻为 1）
uniform float uOnTarget;       // 指针是否正落在目标色区上
uniform float uHoverU0;        // 当前折区段的 u 范围
uniform float uHoverU1;
uniform float uReveal;
// 五折各自的复原进度：已敷彩的区段即使切走后也保持重彩
uniform float uFold0;
uniform float uFold1;
uniform float uFold2;
uniform float uFold3;
uniform float uFold4;
// 当前折各形体的蒙版槽位。
// xy = 该形体包围盒的左下角，zw = 包围盒尺寸（壁画 uv）
uniform vec4 uShapeBounds[8];
uniform float uShapeSlot[8];
// 该形体是否已敷彩（1 = 已上色，不再高亮）
uniform float uShapeDone[8];
// 形体蒙版图集（宽 = 槽位数 × 128，高 = 64）
uniform sampler2D uMasks;
uniform vec2 uMaskGrid;      // 单个槽位在整张图集 uv 上所占比例
uniform vec2 uMaskPad;       // 槽内留边（占槽位比例）
uniform vec2 uMaskData;      // 数据区（占槽位比例）
// 当前笔刷大小（uv），供界面显示与着色器圈出笔尖
uniform float uBrushSize;
// 调试：>0.5 时只输出高亮蒙版（用于核对轮廓）
uniform float uDebugMask;
// uTime 由 ATMOSPHERE_GLSL 声明，此处不得重复

varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;

/** 蛤白（铅白）的偏暖白，是北魏壁画提亮人物的主要用色 */const vec3 HAIBAI = vec3(0.902, 0.878, 0.796);

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

  // 完成度本身也带一点颗粒，避免整折"均匀淡入"的塑料感
  float coverGrain = 0.88 + fuwangFbm(vec2(uv.x * 5.83, uv.y) * 46.0 + 3.0, 3) * 0.24;
  cover *= coverGrain;

  vec3 mineral = vec3(uPigmentR, uPigmentG, uPigmentB);
  mineral *= 0.88 + pigIndex * 0.24;

  vec3 rich = raw;
  rich = mix(vec3(lum), rich, 1.45);      // 显著提高饱和度
  rich = mix(rich, rich * vec3(1.06, 1.0, 0.94), 0.4);
  rich *= 1.12;
  rich *= 1.0 - lost * 0.12 - crack * 0.10;

  // 两路复原，按「是否真的落过笔」分离 —— 这是修掉"全屏颜色暗示"的关键：
  //   · 落笔处：矿物色覆盖（看得出用了哪种色，也有笔触颗粒）
  //   · 未落笔处：只把原画色彩提回来，绝不掺入当前颜料的颜色
  // 早先两者都经过同一路混色，导致只要某折有进度，整折就被当前颜料染一遍。
  vec3 mineralLayer = mix(rich, mineral, 0.52);
  float mineralGrain = fuwangFbm(vec2(uv.x * 5.83, uv.y) * 190.0 + 7.0, 3);
  mineralLayer = mix(mineralLayer, mineralLayer * (0.94 + mineralGrain * 0.14), 0.6);

  float brush = clamp(paintMask * 1.6, 0.0, 1.0);   // 仅落笔处
  vec3 restored = mix(rich, mineralLayer, brush);

  vec3 col = mix(faded, restored, cover);

  // 笔触湿边：同样只出现在落笔处
  float edge = smoothstep(0.04, 0.32, paintMask) * (1.0 - smoothstep(0.30, 0.66, paintMask));
  col += vec3(0.11, 0.095, 0.07) * edge * 0.55 * brush;

  /* ---- 四、引导：把「这一处该上这种颜色」的形体轮廓点亮 ---- */

  float inFold = step(uHoverU0, uv.x) * step(uv.x, uHoverU1);
  float breath = 0.5 + 0.5 * sin(uTime * 1.1);

  // 逐个形体取蒙版：得到的是该形体的**真实轮廓**，不是矩形
  float target = 0.0;
  float rim = 0.0;
  for (int i = 0; i < 8; i++) {
    if (uShapeDone[i] > 0.5) continue;              // 已敷彩的不再高亮
    vec4 b = uShapeBounds[i];
    if (b.z <= 0.0 || b.w <= 0.0) continue;
    // 落到该形体包围盒内才取蒙版（省采样，也避免串槽）
    vec2 local = (uv - b.xy) / b.zw;
    if (local.x < 0.0 || local.x > 1.0 || local.y < 0.0 || local.y > 1.0) continue;
    // 槽位两侧留了黑边，取样要落在数据区内 —— 否则相邻槽位会串色
    vec2 c = uMaskPad + local * uMaskData;
    vec2 muv = vec2((uShapeSlot[i] + c.x) * uMaskGrid.x, c.y * uMaskGrid.y);
    float m = texture2D(uMasks, muv).r;
    target = max(target, m);
    // 轮廓描边：蒙版边缘一圈，帮助看清「该敷的是这一块」
    rim = max(rim, smoothstep(0.10, 0.45, m) * (1.0 - smoothstep(0.55, 0.92, m)));
  }
  target = smoothstep(0.25, 0.75, target);
  rim = smoothstep(0.15, 0.85, rim) * (1.0 - target * 0.55);

  // 非目标处压暗，让目标轮廓自然凸显（只在当前折内）。
  // 靠「压暗周围」比「提亮目标」更有效 —— 壁画里的白鹿本身已接近饱和，
  // 再加光看不出变化；把周围压下去、目标处罩上该颜料的色，对比就出来了。
  float dimZone = inFold * (1.0 - target) * uHover;
  col *= 1.0 - 0.70 * dimZone;

  // 目标处：蒙上一层该颜料的颜色，明确「这一块要用这个色」
  vec3 hintColor = normalize(mineral + vec3(0.16));
  float wash = (0.42 + 0.10 * breath) * uHover * (1.0 + uOnTarget * 0.28);
  col = mix(col, mix(col, hintColor, 0.55) * 1.06, target * wash);
  // 沿轮廓加一道更亮的边，形体形状因此一目了然
  col += hintColor * rim * (0.50 + 0.20 * breath) * uHover;

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
uniform float uStretch;    // 笔尖横向拉伸（画幅很宽）
uniform float uAmount;
uniform float uIndex;      // 颜料序号（0..1）
uniform float uSeed;

varying vec2 vUv;

void main() {
  vec2 d = vUv - uBrush;
  d.x *= uStretch;

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

const FILL_FRAG = /* glsl */ `
${FBM_GLSL}

uniform sampler2D uMasks;   // 形体蒙版图集
uniform sampler2D uPrev;    // 已有的累积贴图
uniform vec2 uMaskGrid;     // 单个蒙版槽位在图集 uv 上所占比例
uniform vec2 uMaskPad;      // 槽内留边（占槽位比例）
uniform vec2 uMaskData;     // 数据区（占槽位比例）
uniform float uAxisX;       // 1 = 本趟沿 u 轴，0 = 沿 v 轴
uniform vec4 uBox;          // 该形体的包围盒（壁画 uv）
uniform float uSlot;        // 该形体在图集中的槽位号
uniform float uIndex;       // 颜料序号

varying vec2 vUv;

void main() {
  // vUv 扫过整张贴图；沿哪个轴画由 uAxisX 决定
  vec2 uv;
  if (uAxisX > 0.5) {
    uv = vec2(mix(uBox.x, uBox.z, vUv.x), mix(uBox.y, uBox.w, vUv.y));
  } else {
    uv = vec2(mix(uBox.x, uBox.z, vUv.y), mix(uBox.y, uBox.w, vUv.x));
  }

  vec4 prev = texture2D(uPrev, vUv);

  vec2 local = (uv - uBox.xy) / max(uBox.zw, vec2(1e-6));
  if (local.x < 0.0 || local.x > 1.0 || local.y < 0.0 || local.y > 1.0) {
    gl_FragColor = prev;
    return;
  }
  vec2 c = uMaskPad + local * uMaskData;
  vec2 muv = vec2((uSlot + c.x) * uMaskGrid.x, c.y * uMaskGrid.y);
  float m = smoothstep(0.30, 0.70, texture2D(uMasks, muv).r);
  if (m <= 0.001) {
    gl_FragColor = prev;
    return;
  }

  // 矿物颗粒，让整块色不至于死平
  float grain = fuwangFbm(uv * vec2(560.0, 210.0) + uSlot * 7.0, 3);
  float cover = clamp(m * (0.86 + grain * 0.26), 0.0, 1.0);

  // 两趟取 max：交界处不出现接缝，也不覆盖更早敷上的形体
  gl_FragColor = vec4(max(prev.r, cover), max(prev.g, uIndex), 0.0, 1.0);
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
      uOnTarget: { value: 0 },
      uHoverU0: { value: 0 },
      uHoverU1: { value: 1 },
      uShapeBounds: {
        value: Array.from({ length: 8 }, () => new Vector4(0, 0, 0, 0)),
      },
      uShapeSlot: { value: new Float32Array(8) },
      uShapeDone: { value: new Float32Array(8) },
      uMasks: { value: null },
      uMaskGrid: { value: new Vector2(1 / 24, 1) },
      uMaskPad: { value: new Vector2(4 / 128, 4 / 64) },
      uMaskData: { value: new Vector2(120 / 128, 56 / 64) },
      uBrushSize: { value: 0.003 },
      uDebugMask: { value: 0 },
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
        uRadius: { value: 0.01 },
        uStretch: { value: 2.2 },
        uAmount: { value: 0.5 },
        uIndex: { value: 0.0 },
        uSeed: { value: 0.0 },
      },
    });
    this.quadScene.add(new Mesh(new PlaneGeometry(2, 2), this.material));

    // 复制用的最小着色器（撤销快照）
    this.copyMaterial = new ShaderMaterial({
      vertexShader: STAMP_VERT,
      fragmentShader: `
        uniform sampler2D uSrc;
        varying vec2 vUv;
        void main() { gl_FragColor = texture2D(uSrc, vUv); }
      `,
      depthTest: false,
      depthWrite: false,
      uniforms: { uSrc: { value: null } },
    });
    this.copyScene = new Scene();
    this.copyScene.add(new Mesh(new PlaneGeometry(2, 2), this.copyMaterial));

    // 认形敷彩用的着色器（把形体蒙版整块写进累积贴图）
    this.fillMaterial = new ShaderMaterial({
      vertexShader: STAMP_VERT,
      fragmentShader: FILL_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uMasks: { value: null },
        uMaskGrid: { value: new Vector2(1 / 24, 1) },
        uMaskPad: { value: new Vector2(4 / 128, 4 / 64) },
        uMaskData: { value: new Vector2(120 / 128, 56 / 64) },
        uAxisX: { value: 1 },
        uBox: { value: new Vector4(0, 0, 1, 1) },
        uSlot: { value: 0 },
        uIndex: { value: 0 },
      },
    });
    this.fillScene = new Scene();
    this.fillScene.add(new Mesh(new PlaneGeometry(2, 2), this.fillMaterial));

    this.clear();
  }

  /** 蒙版图集：认形敷彩的依据 */
  setMaskAtlas(texture, slots) {
    this.maskTexture = texture;
    this.maskSlots = slots ?? 24;
    return this;
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
   * @param {{radius?:number, stretch?:number}} opts 笔尖形状
   */
  stamp(uv, prev, index, amount = 0.42, opts = {}) {
    const src = this.targets[this.flip];
    const dst = this.targets[1 - this.flip];
    const u = this.material.uniforms;
    u.uPrev.value = src.texture;
    u.uBrush.value = [uv.x, uv.y];
    u.uPrevBrush.value = [prev?.x ?? uv.x, prev?.y ?? uv.y];
    u.uIndex.value = index;
    u.uAmount.value = amount;
    u.uRadius.value = opts.radius ?? 0.01;
    u.uStretch.value = opts.stretch ?? 2.2;
    u.uSeed.value = Math.random() * 10;

    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(dst);
    this.renderer.render(this.quadScene, this.quadCam);
    this.renderer.setRenderTarget(previous);
    this.flip = 1 - this.flip;
  }

  /**
   * 认形敷彩：把某个形体整体写进累积贴图。
   *
   * 画布远宽于高，沿 u 轴一趟会有严重的各向异性损耗，所以分两趟 ——
   * 第一趟沿 u 轴（画布宽向 = 壁画 u 向，采样充足），覆盖整个 v 范围；
   * 第二趟沿 v 轴补足 u 方向。两趟在着色器里取 max，交界处不出接缝，
   * 也不会覆盖先前已敷上的形体。
   */
  fillShape(shape, index, opts = {}) {
    if (!this.maskTexture) return false;
    const slots = opts.slots ?? this.maskSlots ?? 24;
    const [u0, v0, u1, v1] = shape.box;

    const u = this.fillMaterial.uniforms;
    u.uMasks.value = this.maskTexture;
    u.uMaskGrid.value.set(1 / slots, 1);
    u.uBox.value.set(u0, v0, u1 - u0, v1 - v0);
    u.uSlot.value = shape.slot;
    u.uIndex.value = index;

    const prevTarget = this.renderer.getRenderTarget();
    for (const axis of [1, 0]) {
      const src = this.targets[this.flip];
      const dst = this.targets[1 - this.flip];
      u.uPrev.value = src.texture;
      u.uAxisX.value = axis;
      this.renderer.setRenderTarget(dst);
      this.renderer.render(this.fillScene, this.quadCam);
      this.flip = 1 - this.flip;
    }
    this.renderer.setRenderTarget(prevTarget);
    return true;
  }

  /**
   * 取一份当前笔触状态的快照（用于撤销）：把当前 target 复制到另一张。
   * 返回一个句柄，交给 restore() 即可回到快照时的状态。
   */
  snapshot() {
    const src = this.targets[this.flip];
    const dst = this.targets[1 - this.flip];
    this.copyTexture(src.texture, dst);
    return { flip: this.flip };
  }

  /** 恢复到某次快照（撤销）。可连续撤销多层。 */
  restore(handle) {
    if (!handle) return false;
    // 快照保存在 1 - handle.flip，当前显示的是 flip
    this.flip = 1 - handle.flip;
    return true;
  }

  /** 把一张贴图原样拷到目标渲染目标 */
  copyTexture(texture, target) {
    const u = this.copyMaterial.uniforms;
    u.uSrc.value = texture;
    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.copyScene, this.quadCam);
    this.renderer.setRenderTarget(previous);
  }

  /** 当前已涂的覆盖率由 Restorer 依色区判定，此处不做 GPU 回读 */
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
