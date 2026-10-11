import { CANDLES, HALL, ROOMS, SCREENS } from './layout.js';

/**
 * 《韩熙载夜宴图》空间分区补充数据。
 *
 * 厅堂主体与陈设以 Grok 的 layout.js 为准（单一事实来源）；本文件只补三样东西：
 *   1. 五段的「画中名」与原卷位置的对照（分区题名、节律说明）；
 *   2. 原作有、而基础陈设尚未列出的锚点（舞筵、盆架、长案、屏风通道）；
 *   3. 暖夜宴光参数与游廊动线（人物行走、灯下明暗节律）。
 *
 * 坐标与 layout.js 一致：x 0→50 沿原卷自右而左（听乐 → 散宴），z 南正北负。
 */

/** 五段与画卷一的段落同构：id 用 layout.js 的 ROOMS.id，name 取画中常用段名 */
export const SECTIONS = [
  {
    id: 'tingyue', room: '听乐', name: '赏乐', motif: '教坊琵琶',
    paintingU: [0.78, 1.0], brightness: 0.95, privacy: 0.2,
    summary: '外厅初宴：主宾同坐北壁围榻，教坊乐伎抱琵琶独奏，宾客列坐案前听曲。',
  },
  {
    id: 'guanwu', room: '观舞', name: '观舞', motif: '六幺舞 · 羯鼓',
    paintingU: [0.58, 0.8], brightness: 1.0, privacy: 0.35,
    summary: '厅心铺舞筵，舞伎旋袖而舞；主人亲执鼓槌击羯鼓，宾客拊掌为节。',
  },
  {
    id: 'zhanxie', room: '歇息', name: '小憩', motif: '内室歇息',
    paintingU: [0.38, 0.6], brightness: 0.8, privacy: 0.85,
    summary: '转入内室：围榻、折屏之后暂歇，侍女执烛捧水，陈设渐简，灯火转暗。',
  },
  {
    id: 'qingchui', room: '清吹', name: '清吹', motif: '管乐清吹',
    paintingU: [0.16, 0.4], brightness: 0.9, privacy: 0.5,
    summary: '五名乐伎列坐长榻，横笛、排箫、筚篥次第相和；主人袒腹盘坐，摇扇而听。',
  },
  {
    id: 'sanyan', room: '散宴', name: '宴散', motif: '执烛相送',
    paintingU: [0.0, 0.18], brightness: 0.75, privacy: 0.3,
    summary: '夜阑席散：宾客携伎而出，主人执鼓槌立于门次，烛火一线相送。',
  },
];

/** 四道分隔屏风两侧的通道（gap: 'south' 走南廊，'north' 走北廊，与 layout.js 一致） */
export const SCREEN_GAPS = SCREENS.map((s) => ({
  id: s.id,
  x: s.x,
  side: s.gap,
  // 通道在 z 上的范围：以南侧为例，屏风占北半，南侧留出约 3 m
  zRange: s.gap === 'south'
    ? [s.z + s.length / 2 + 0.2, HALL.z1 - 0.9]
    : [HALL.z0 + 0.9, s.z - s.length / 2 - 0.2],
  width: 3.0,
}));

/**
 * 补充陈设锚点（原作有、基础陈设未列的）。
 * kind：mat 舞筵 | basin 盆架 | longTable 长案 | rug 席垫
 */
export const PROPS = [
  { id: 'mat-guanwu', kind: 'mat', room: 'guanwu', x: 15.8, z: -0.55, w: 5.0, d: 3.9, h: 0.05, weave: true },
  { id: 'basin-zhanxie', kind: 'basin', room: 'zhanxie', x: 28.4, z: -1.15, w: 0.85, d: 0.85, h: 1.02 },
  { id: 'longTable-qingchui', kind: 'longTable', room: 'qingchui', x: 36.3, z: 1.5, w: 3.2, d: 0.9, h: 0.44 },
  { id: 'rug-tingyue', kind: 'rug', room: 'tingyue', x: 5.4, z: 1.5, w: 4.6, d: 3.4, h: 0.02, weave: true },
  { id: 'rug-sanyan', kind: 'rug', room: 'sanyan', x: 44.8, z: 1.2, w: 4.0, d: 3.0, h: 0.02, weave: true },
];

/**
 * 暖夜宴光。index.js 的 createAtmosphere 取值与此一致（此处单列，供后续调参与屏风取景）。
 * 节律：外厅亮（赏乐 / 观舞）→ 内室转暗（小憩）→ 清吹回暖 → 散宴余光。
 */
export const LIGHTING = {
  // 大气：近处暖褐、远处沉入暖墨（夜色而非青灰）
  fogNear: '#6a4a32',
  fogFar: '#1c120e',
  // 主光方向：高烛自上方略偏南照下
  sunDir: [0.18, 0.92, 0.22],
  // 烛火
  candle: {
    color: '#ffb469',
    core: '#fff0cc',
    flicker: 0.15,
    flickerHz: 2.3,
    radius: 6.5,
  },
  // 每段的环境亮度系数（0～1，供灯台布局与人物色调参考）
  brightnessByRoom: Object.fromEntries(SECTIONS.map((s) => [s.id, s.brightness])),
  // 入场淡出与绢色：由绢白渐显改为由暖墨中显影
  fadeColor: '#2a1a12',
  background: '#140e0b',
  /** 某点的环境亮度（段内亮度 + 近烛处提亮） */
  brightnessAt(x, z) {
    const room = zoneAt(x);
    const base = LIGHTING.brightnessByRoom[room.id] ?? 0.85;
    let k = 0;
    for (const c of CANDLES) {
      const d = Math.hypot(x - c.x, z - c.z);
      k = Math.max(k, Math.max(0, 1 - d / 7.5));
    }
    return Math.min(1.15, base * (0.72 + 0.42 * k));
  },
};

/**
 * 游廊动线：南廊贯通五段，屏风处按 gap 折向另一侧；再自南廊折入各段厅心。
 * 供人物行走（puppets.js 的侍女 / 童仆）与后续陈设避让使用。
 */
export const AISLES = [
  { id: 'main', points: [[1.8, 3.9], [11.0, 3.9], [13.0, -3.4], [21.4, -3.4], [24.0, 3.6], [30.6, 3.6], [33.0, -3.5], [40.4, -3.5], [43.0, 3.5], [48.4, 3.5]], width: 2.6 },
  { id: 'tingyue', points: [[5.6, 3.9], [5.4, 1.6]], width: 2.0 },
  { id: 'guanwu', points: [[21.0, -3.4], [17.4, -3.0]], width: 1.8 },
  { id: 'zhanxie', points: [[27.0, 3.6], [27.6, 1.4], [28.4, 0.2]], width: 1.8 },
  { id: 'qingchui', points: [[36.6, -3.5], [36.6, -0.6]], width: 2.0 },
  { id: 'sanyan', points: [[45.4, 3.5], [45.2, 1.4]], width: 2.0 },
];

/** 人物行走的短路线（侍女捧槃送酒、童仆执壶、侍女执烛引路） */
export const WALK_ROUTES = [
  { id: 'maid-tingyue', kind: 'maid_tray', points: [[5.6, 4.2], [10.6, 4.1]], speed: 0.5 },
  { id: 'boy-guanwu', kind: 'boy', points: [[13.2, 3.1], [20.6, 3.3]], speed: 0.56 },
  { id: 'maid-sanyan', kind: 'maid_candle', points: [[42.4, 3.6], [48.3, 3.5]], speed: 0.44 },
];

/** 取某点所在的段落（对应 layout.js 的 ROOMS） */
export function zoneAt(x) {
  return ROOMS.find((r) => x <= r.maxX) ?? ROOMS[ROOMS.length - 1];
}

/** 段落题名：画中名 + 原卷题句（WorldScene 段落题名直接用 layout.js 的 ZONES 亦可） */
export function sectionAt(x) {
  const room = zoneAt(x);
  return SECTIONS.find((s) => s.id === room.id) ?? SECTIONS[0];
}
