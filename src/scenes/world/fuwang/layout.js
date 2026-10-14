/**
 * 卷三《鹿王本生》空间布局。
 *
 * 壁画为莫高窟第257窟西壁中段的横卷式连环画（北魏）。
 * 画面按「两头开始、中间结束」布局，因此五折的 u 区间沿横卷呈特殊分布：
 *
 *   u 0.00–0.30  九色鹿救溺人、溺水人跪谢立誓
 *   u 0.30–0.62  王后向国王索要鹿皮（宫殿）
 *   u 0.62–0.98  溺水人告密、国王乘马车围猎、九色鹿陈情
 *
 * 坐标：壁画平面位于 z = 0，面朝 +z；观众立于 z > 0，望向 -z。
 * 所有数值均为艺术转译下的观览安排，不作考古复原。
 */

export const MURAL = {
  /** 壁画像素尺寸（public/paintings/fuwang-bensheng/panorama.jpg） */
  texWidth: 4096,
  texHeight: 702,
  /** 世界尺寸，按画幅比例缩放 */
  width: 14.16,
  height: 2.428,
  /** 画面中心的世界坐标 */
  cx: 0,
  cy: 1.62,
  z: 0,
};

/** 观众活动范围：壁画之前、中心塔柱之前的空处 */
export const BOUNDS = { minX: -6.4, maxX: 6.4, minZ: 1.6, maxZ: 5.8 };

export const SPAWN = { x: 0, z: 4.6 };

/** 洞窟尺寸（前部人字披顶、后部平棋顶、中心塔柱） */
export const CAVE = {
  halfWidth: 8.8,
  depth: 7.4,
  floorY: -0.6,
  ceilingY: 4.2,
};

const VIEW_Z = 3.5;
export const CAMERA_FOV = 62;

/** 由 u 值求世界 x（壁画横向铺开在 [-w/2, w/2]） */
export function uToX(u) {
  return (u - 0.5) * MURAL.width;
}

/**
 * 由折区间反算机位：视锥在壁画平面上的横向覆盖约等于该折宽度。
 *
 * 这样"看到的那一段"就等于"要敷彩的那一段"，取景与判定不会错位。
 *
 * 实测标定（fov 62°、aspect 1.86、壁画世界宽 14.16）：
 *   距离 2 → 可见 u 宽 0.3154；距离 3 → 0.4730；距离 4 → 0.6304
 *   即　可见 u 宽 = 0.1577 × 距离　→　距离 = 6.333 × 折区段宽度
 * 再加 MARGIN 留出边距，使整段折区段都在画面内。
 */
const FOLD_SPAN_PER_DIST = 0.1577;   // 实测：每单位距离可见的 u 宽度
const MARGIN = 1.10;                 // 只留少量呼吸边，避免画外洞窟被误读为内容缺失
const EDGE_GUARD = 0.030;            // 补偿透视与实际视口差异，让首末折贴近屏幕边缘
const EYE_Y = 1.70;                  // 视高：与人物主体齐平
// 第三折的取景能完整容纳壁画高度，其他较窄折不能再因横向范围较小而继续拉近。
// 该下限在 62° 垂直视场角下为壁画上下各留约 10% 呼吸边。
export const MIN_MURAL_VIEW_DIST = 2.24;

export function stopsForFold(u0, u1) {
  const spanU = Math.max(0.08, u1 - u0);
  const dist = Math.max(
    MIN_MURAL_VIEW_DIST,
    Math.min(3.3, (spanU * MARGIN) / FOLD_SPAN_PER_DIST),
  );
  // 首、末折不能按区间中心直接取景，否则对称留边会越过壁画边缘，
  // 把洞窟侧壁拍进画面。将视线中心限制在画幅内部，使可视范围始终落在横卷上。
  const visibleSpanU = FOLD_SPAN_PER_DIST * dist;
  const halfViewU = visibleSpanU / 2;
  const targetU = Math.max(
    halfViewU + EDGE_GUARD,
    Math.min(1 - halfViewU - EDGE_GUARD, (u0 + u1) / 2),
  );
  const targetX = uToX(targetU);
  return {
    camera: [targetX, EYE_Y + 0.14, MURAL.z + dist],
    target: [targetX, EYE_Y - 0.06, MURAL.z],
    dist,
  };
}

/**
 * 五折。顺序为故事顺序；每一折对应壁画横卷上的一段。
 * 机位由 stopsForFold 依折区间反算，保证本折区段充满画面。
 */
function fold(id, name, verse, u0, u1, note) {
  const s = stopsForFold(u0, u1);
  return { id, name, verse, u0, u1, note, camera: s.camera, target: s.target, dist: s.dist };
}

export const FOLDS = [
  fold('jiuni', '救溺', '鹿涉寒流，负溺者以出', 0.0, 0.210,
    '壁画左端：九色鹿自水中驮起溺水人；白马立于水畔。'),
  fold('beishi', '背誓', '跪而许之，誓不妄言', 0.210, 0.340,
    '溺水人跪于鹿前许诺保守秘密；其身后是渐次升起的山峦。'),
  fold('xuangshang', '悬赏', '王后求皮，布告于国', 0.340, 0.660,
    '横卷中部：宫殿、王后与国王，以及前来告密的溺水人。'),
  fold('weilie', '围猎', '车马入山，惊醒沉鹿', 0.660, 0.840,
    '国王乘马、举旗而行，随从入山围猎，白马随行。'),
  fold('chenqing', '陈情', '鹿无所畏，陈其负恩', 0.840, 1.0,
    '九色鹿向国王诉说溺水人忘恩负义；告密者满身白点，恶有恶报。'),
];

export const ZONES = FOLDS;

/** 颜料（矿物色）。用于调色盘显示与目标区高亮。 */
export const PIGMENTS = [
  { id: "shiqing", name: "石青", hex: "#3f6f92", hint: "层" },
  { id: "shilv", name: "石绿", hex: "#6f9c7a", hint: "层" },
  { id: "zhusha", name: "朱砂", hex: "#a8443a", hint: "层" },
  { id: "tuhong", name: "土红", hex: "#8f4a35", hint: "底" },
  { id: "baise", name: "白色", hex: "#e0d9c6", hint: "层" },
  { id: "mose", name: "墨色", hex: "#2b2620", hint: "线" },
];

/** 颜料盘顺序（与色区映射共用） */
export const PIGMENT_KEYS = PIGMENTS.map((p) => p.id);
