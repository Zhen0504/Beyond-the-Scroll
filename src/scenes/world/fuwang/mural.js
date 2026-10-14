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
 * 两态：残损褪色态 ↔ 重彩显影态。观众按矿物色逐层开启，观察各色层
 * 如何共同构成画面；这不是自由填色，也不声称复原壁画原貌。
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
// 每折六类综合色层的开关：石青、石绿、朱砂、土红、白色、墨色。
// 它们表达艺术化的色层显影，不承担对原壁画颜料区域的自动识别。
uniform vec4 uLayer0;
uniform vec4 uLayer1;
uniform vec4 uLayer2;
uniform vec4 uLayer3;
uniform vec4 uLayer4;
uniform vec2 uNeutral0;
uniform vec2 uNeutral1;
uniform vec2 uNeutral2;
uniform vec2 uNeutral3;
uniform vec2 uNeutral4;
// 当前折各形体的蒙版槽位。
// xy = 该形体包围盒的左下角，zw = 包围盒尺寸（壁画 uv）
uniform vec4 uShapeBounds[8];
uniform float uShapeSlot[8];
// 该形体的生成模式：1 = 平涂色域（地色、殿壁等，边缘要柔化），0 = 有清晰边界的形体
uniform float uShapeSoft[8];
// 该形体是否已敷彩（1 = 已上色，不再高亮）
uniform float uShapeDone[8];
// 形体蒙版图集：按 MASK_COLS × MASK_ROWS 排布，每槽四周留黑
uniform sampler2D uMasks;
uniform vec2 uMaskGrid;      // 1 / (列数, 行数)
uniform vec2 uMaskPad;       // 槽内留边（占单槽比例）
uniform vec2 uMaskData;      // 数据区（占单槽比例）
uniform float uMaskCols;     // 列数
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

  // 五折只负责叙事与交互分段，画面上不出现硬切接缝。
  // 每道折界两侧约 1.8% 画幅内渐变衔接，避免一折显影后形成矩形色块。
  const float foldFeather = 0.018;
  float foldProgress = uFold0;
  vec4 activeLayers = uLayer0;
  vec2 activeNeutrals = uNeutral0;
  float foldBlend = smoothstep(0.210 - foldFeather, 0.210 + foldFeather, uv.x);
  foldProgress = mix(foldProgress, uFold1, foldBlend);
  activeLayers = mix(activeLayers, uLayer1, foldBlend);
  activeNeutrals = mix(activeNeutrals, uNeutral1, foldBlend);
  foldBlend = smoothstep(0.340 - foldFeather, 0.340 + foldFeather, uv.x);
  foldProgress = mix(foldProgress, uFold2, foldBlend);
  activeLayers = mix(activeLayers, uLayer2, foldBlend);
  activeNeutrals = mix(activeNeutrals, uNeutral2, foldBlend);
  foldBlend = smoothstep(0.660 - foldFeather, 0.660 + foldFeather, uv.x);
  foldProgress = mix(foldProgress, uFold3, foldBlend);
  activeLayers = mix(activeLayers, uLayer3, foldBlend);
  activeNeutrals = mix(activeNeutrals, uNeutral3, foldBlend);
  foldBlend = smoothstep(0.840 - foldFeather, 0.840 + foldFeather, uv.x);
  foldProgress = mix(foldProgress, uFold4, foldBlend);
  activeLayers = mix(activeLayers, uLayer4, foldBlend);
  activeNeutrals = mix(activeNeutrals, uNeutral4, foldBlend);

  // 不做“这块必须是哪种颜料”的硬识别，而按原图色相计算连续软权重。
  // 因此石青、石绿不会顺带提亮红色地仗，也不会出现框选式的矩形边缘。
  float hi = max(raw.r, max(raw.g, raw.b));
  float lo = min(raw.r, min(raw.g, raw.b));
  float chroma = hi - lo;
  float chromaGate = smoothstep(0.025, 0.19, chroma);

  // 青、绿使用互相重叠的软区间，以适应壁画矿物色风化后的综合色相；
  // 朱砂与土红按亮度区分，仍允许少量自然过渡。
  float blueAffinity = smoothstep(0.01, 0.14, raw.b - raw.r) * chromaGate;
  float greenAffinity = smoothstep(0.005, 0.13, raw.g - raw.r) * chromaGate;
  float warmAffinity = smoothstep(0.015, 0.16, raw.r - max(raw.g, raw.b)) * chromaGate;
  float vermilionAffinity = warmAffinity * smoothstep(0.30, 0.58, lum + chroma * 0.45);
  float earthAffinity = warmAffinity * (1.0 - smoothstep(0.58, 0.82, lum + chroma * 0.20));
  // 白色层提亮低彩度的浅色形体；墨线层只加深低彩度暗线，两者也采用软权重。
  float whiteAffinity = (1.0 - smoothstep(0.07, 0.24, chroma)) * smoothstep(0.48, 0.80, lum);
  float inkAffinity = (1.0 - smoothstep(0.08, 0.30, chroma))
    * smoothstep(0.10, 0.24, lum)
    * (1.0 - smoothstep(0.32, 0.53, lum));

  vec4 localLayers = activeLayers * vec4(
    blueAffinity, greenAffinity, vermilionAffinity, earthAffinity
  );
  vec2 localNeutrals = activeNeutrals * vec2(whiteAffinity, inkAffinity);
  float localLayerCount = dot(localLayers, vec4(1.0)) + dot(localNeutrals, vec2(1.0));
  float hasLayer = step(0.02, localLayerCount);
  vec3 mineralTone = (
      localLayers.x * vec3(0.247, 0.435, 0.573) +
      localLayers.y * vec3(0.435, 0.612, 0.478) +
      localLayers.z * vec3(0.659, 0.267, 0.227) +
      localLayers.w * vec3(0.561, 0.290, 0.208) +
      localNeutrals.x * vec3(0.878, 0.851, 0.776) +
      localNeutrals.y * vec3(0.169, 0.149, 0.125)
    ) / max(localLayerCount, 1.0);

  float selectiveReveal = max(
    max(activeLayers.x * blueAffinity, activeLayers.y * greenAffinity),
    max(
      max(activeLayers.z * vermilionAffinity, activeLayers.w * earthAffinity),
      max(activeNeutrals.x * whiteAffinity, activeNeutrals.y * inkAffinity)
    )
  );
  // 完成状态只用于界面和释文解锁，不再偷偷补显其他颜色。
  // 六个色层完全由各自开关控制，避免最后点击的颜色成为“万能开关”。
  float cover = selectiveReveal;
  cover = smoothstep(0.0, 0.88, clamp(cover, 0.0, 1.0));

  // 完成度本身也带一点颗粒，避免整折"均匀淡入"的塑料感
  float coverGrain = 0.88 + fuwangFbm(vec2(uv.x * 5.83, uv.y) * 46.0 + 3.0, 3) * 0.24;
  cover *= coverGrain;

  vec3 rich = raw;
  rich = mix(vec3(lum), rich, 1.45);      // 显著提高饱和度
  rich = mix(rich, rich * vec3(1.06, 1.0, 0.94), 0.4);
  rich *= 1.12;
  rich *= 1.0 - lost * 0.12 - crack * 0.10;

  // 早期色层更容易读出矿物色调；接近完成时让原画自身颜色重新成为主角。
  float tintStrength = hasLayer * mix(0.20, 0.07, cover);
  vec3 mineralLayer = mix(rich, rich * 0.84 + mineralTone * 0.32, tintStrength);
  float mineralGrain = fuwangFbm(vec2(uv.x * 5.83, uv.y) * 190.0 + 7.0, 3);
  mineralLayer = mix(mineralLayer, mineralLayer * (0.94 + mineralGrain * 0.14), 0.6);

  vec3 col = mix(faded, mineralLayer, cover);

  /* ---- 四、壁画本身不再做任何提示 ----
   *
   * 曾用「形体轮廓发光 + 四周压暗」指出该敷哪里，现已移除。
   * 原因：壁画破损严重、颜色混杂，本就没有可靠依据指定「此处必须是某色」；
   * 轮廓越精确，越是在编造一个并不存在的原状。这也与我们的声明一致 ——
   * 重彩是艺术转译，不是复原。
   * 现在改为「点颜色 → 该色整体敷上 → 再点还原」，成色完全由笔触贴图决定。
   */

  // 调试通道保留：需要时可直接查看某个形体的蒙版（正常使用不开启）
  if (uDebugMask > 0.5) {
    float dbg = 0.0;
    for (int i = 0; i < 8; i++) {
      vec4 b = uShapeBounds[i];
      if (b.z <= 0.0 || b.w <= 0.0) continue;
      vec2 lc = (uv - b.xy) / b.zw;
      if (lc.x < 0.0 || lc.x > 1.0 || lc.y < 0.0 || lc.y > 1.0) continue;
      vec2 cell = vec2(mod(uShapeSlot[i], uMaskCols), floor(uShapeSlot[i] / uMaskCols)) * uMaskGrid;
      vec2 c = uMaskPad + lc * uMaskData;
      dbg = max(dbg, texture2D(uMasks, cell + c * uMaskGrid).r);
    }
    gl_FragColor = vec4(vec3(dbg), 1.0);
    return;
  }

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
uniform vec4 uBox;          // 该形体的包围盒（壁画 uv）
uniform float uSlot;        // 该形体在图集中的槽位号
uniform float uIndex;       // 颜料序号

varying vec2 vUv;

void main() {
  // 每个输出像素就是壁画上的同一 uv；只有落在形体包围盒内的像素
  // 才进一步采样该形体的蒙版。此前把整张画布反向映射进包围盒，
  // 会把色层写到错误位置，界面显示完成而画面几乎不变化。
  vec2 uv = vUv;
  vec4 prev = texture2D(uPrev, vUv);

  vec2 local = (uv - uBox.xy) / max(uBox.zw, vec2(1e-6));
  if (local.x < 0.0 || local.x > 1.0 || local.y < 0.0 || local.y > 1.0) {
    gl_FragColor = prev;
    return;
  }
  vec2 cell = vec2(mod(uSlot, uMaskCols), floor(uSlot / uMaskCols)) * uMaskGrid;
  vec2 c = uMaskPad + local * uMaskData;
  vec2 muv = cell + c * uMaskGrid;
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
      uShapeSoft: { value: new Float32Array(8) },
      uShapeDone: { value: new Float32Array(8) },
      uMasks: { value: null },
      uMaskGrid: { value: new Vector2(1 / 5, 1 / 4) },
      uMaskPad: { value: new Vector2(8 / 512, 8 / 256) },
      uMaskData: { value: new Vector2(496 / 512, 240 / 256) },
      uMaskCols: { value: 5 },
      uBrushSize: { value: 0.003 },
      uDebugMask: { value: 0 },
      uFold0: { value: 0 },
      uFold1: { value: 0 },
      uFold2: { value: 0 },
      uFold3: { value: 0 },
      uFold4: { value: 0 },
      uLayer0: { value: new Vector4(0, 0, 0, 0) },
      uLayer1: { value: new Vector4(0, 0, 0, 0) },
      uLayer2: { value: new Vector4(0, 0, 0, 0) },
      uLayer3: { value: new Vector4(0, 0, 0, 0) },
      uLayer4: { value: new Vector4(0, 0, 0, 0) },
      uNeutral0: { value: new Vector2(0, 0) },
      uNeutral1: { value: new Vector2(0, 0) },
      uNeutral2: { value: new Vector2(0, 0) },
      uNeutral3: { value: new Vector2(0, 0) },
      uNeutral4: { value: new Vector2(0, 0) },
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
    this.quadCam = new OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
    this.quadCam.position.z = 1;
    this.quadCam.updateMatrixWorld();
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
        uMaskGrid: { value: new Vector2(1 / 5, 1 / 4) },
        uMaskPad: { value: new Vector2(8 / 512, 8 / 256) },
        uMaskData: { value: new Vector2(496 / 512, 240 / 256) },
        uMaskCols: { value: 5 },
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
  setMaskAtlas(texture, grid) {
    this.maskTexture = texture;
    this.maskGrid = grid ?? { cols: 5, rows: 4 };
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
   * 以整张累积贴图的 uv 为坐标，只在形体包围盒内采样蒙版；
   * 其余像素原样复制上一帧，因此各矿物色层可以可靠叠加。
   */
  fillShape(shape, index, opts = {}) {
    if (!this.maskTexture) return false;
    const grid = opts.grid ?? this.maskGrid ?? { cols: 5, rows: 4 };
    const [u0, v0, u1, v1] = shape.box;

    const u = this.fillMaterial.uniforms;
    u.uMasks.value = this.maskTexture;
    u.uMaskGrid.value.set(1 / grid.cols, 1 / grid.rows);
    u.uMaskCols.value = grid.cols;
    u.uBox.value.set(u0, v0, u1 - u0, v1 - v0);
    u.uSlot.value = shape.slot;
    u.uIndex.value = index;

    const prevTarget = this.renderer.getRenderTarget();
    const src = this.targets[this.flip];
    const dst = this.targets[1 - this.flip];
    u.uPrev.value = src.texture;
    this.renderer.setRenderTarget(dst);
    this.renderer.render(this.fillScene, this.quadCam);
    this.flip = 1 - this.flip;
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
