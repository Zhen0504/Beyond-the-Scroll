/**
 * 《韩熙载夜宴图》画境地图。单位：米。
 * x 向东（沿原卷叙事：听乐 → 观舞 → 歇息 → 清吹 → 散宴），z 向南，-z 为北壁。
 *
 * 原卷自右而左五段，以屏风隔开。此处把五段展成可走的多进厅堂：
 *   听乐厅 → 观舞厅 → 歇息室 → 清吹厅 → 散宴廊
 * 屏风并不封死，南北错位留出绕行通道。
 */

export const FLOOR_Y = 0;

/** 厅堂外壳（墙心线） */
export const HALL = {
  x0: 0,
  x1: 50,
  z0: -6.15,
  z1: 6.15,
  h: 4.52,
  wall: 0.36,
};

/** 第一人称硬边界：贴内墙，避开柱与裙板 */
export const BOUNDS = { minX: 1.25, maxX: 48.75, minZ: -5.42, maxZ: 5.42 };

/** 入画点：听乐厅南侧通道，面向厅心与北壁坐榻 */
export const SPAWN = { x: 3.45, z: 3.2, yaw: -0.92, pitch: 0.04 };

export const COL_XS = [2.5, 7.5, 12.5, 17.5, 22.5, 27.5, 32.5, 37.5, 42.5, 47.5];
export const COL_ZS = [-5.08, 5.08];

/**
 * 五进厅堂。maxX 供区域题名；x0/x1 为该进大致范围。
 * paintingU 对应全卷纹理从左（散宴）到右（听乐）的 U 区间，屏风取景用。
 */
export const ROOMS = [
  { id: 'tingyue', name: '听乐', verse: '琵琶声里夜未央', x0: 0, x1: 11.6, maxX: 11.6, paintingU: [0.78, 1.0] },
  { id: 'guanwu', name: '观舞', verse: '六幺一曲起轻尘', x0: 11.6, x1: 22.2, maxX: 22.2, paintingU: [0.58, 0.80] },
  { id: 'zhanxie', name: '歇息', verse: '红烛影中人暂闲', x0: 22.2, x1: 31.4, maxX: 31.4, paintingU: [0.38, 0.60] },
  { id: 'qingchui', name: '清吹', verse: '横笛五声落梁尘', x0: 31.4, x1: 41.2, maxX: 41.2, paintingU: [0.16, 0.40] },
  { id: 'sanyan', name: '散宴', verse: '客去尚余灯火温', x0: 41.2, x1: 50, maxX: Infinity, paintingU: [0.0, 0.18] },
];

export const ZONES = ROOMS.map(({ id, name, verse, maxX }) => ({ id, name, verse, maxX }));

/**
 * 四道分隔屏风。length 沿 z；gap 为绕行一侧。
 * 通道约 3 m，与原作「以屏风隔而不绝」相合。
 */
export const SCREENS = [
  { id: 's1', x: 11.6, z: -1.55, length: 7.7, height: 2.62, panels: 6, gap: 'south', paintingU: [0.72, 0.96] },
  { id: 's2', x: 22.2, z: 1.55, length: 7.7, height: 2.62, panels: 6, gap: 'north', paintingU: [0.50, 0.74] },
  { id: 's3', x: 31.4, z: -1.55, length: 7.7, height: 2.62, panels: 6, gap: 'south', paintingU: [0.28, 0.52] },
  { id: 's4', x: 41.2, z: 1.55, length: 7.7, height: 2.62, panels: 6, gap: 'north', paintingU: [0.04, 0.28] },
];

/** 坐榻 / 床：北壁一侧，与原作黑漆高背榻相应 */
export const BEDS = [
  { id: 'tingyue-bed', x: 5.4, z: -3.55, w: 3.7, d: 1.92, h: 0.5, cloth: '#6a2420', back: true },
  { id: 'zhanxie-bed', x: 26.6, z: -3.4, w: 3.5, d: 1.95, h: 0.5, cloth: '#3a5a52', back: true, canopy: true },
  { id: 'sanyan-bed', x: 45.4, z: -3.45, w: 2.9, d: 1.7, h: 0.48, cloth: '#5a2824', back: true },
];

/** 漆案 */
export const TABLES = [
  { x: 5.1, z: -0.35, w: 2.15, d: 0.92, h: 0.46 },
  { x: 7.6, z: 0.85, w: 1.15, d: 0.72, h: 0.44 },
  { x: 16.8, z: -3.55, w: 1.05, d: 0.7, h: 0.44 },
  { x: 26.4, z: -0.55, w: 1.45, d: 0.78, h: 0.45 },
  { x: 36.2, z: 0.15, w: 1.2, d: 0.7, h: 0.44 },
  { x: 45.1, z: -0.2, w: 1.35, d: 0.75, h: 0.45 },
];

/** 观舞厅大鼓 */
export const DRUMS = [{ x: 16.6, z: -2.35, r: 0.42, h: 0.92 }];

/** 坐墩 / 椅 */
export const SEATS = [
  { x: 3.7, z: -0.9, kind: 'stool' },
  { x: 6.7, z: -0.95, kind: 'stool' },
  { x: 8.4, z: -2.4, kind: 'chair' },
  { x: 15.4, z: -2.55, kind: 'chair' },
  { x: 18.2, z: -1.1, kind: 'stool' },
  { x: 24.4, z: 1.15, kind: 'stool' },
  { x: 33.2, z: 1.35, kind: 'chair' },
  { x: 43.4, z: 1.05, kind: 'stool' },
];

/** 清吹厅北壁长榻，供乐伎一列坐 */
export const LONG_BENCH = { x: 36.4, z: -3.55, w: 7.2, d: 0.85, h: 0.42 };

/** 烛台（火焰另绘） */
export const CANDLES = [
  { x: 2.15, z: -4.55, h: 1.15 },
  { x: 8.85, z: -4.5, h: 1.2 },
  { x: 4.2, z: 4.55, h: 1.05 },
  { x: 13.4, z: -4.5, h: 1.18 },
  { x: 19.6, z: -4.45, h: 1.1 },
  { x: 16.2, z: 4.5, h: 1.12 },
  { x: 24.2, z: -4.5, h: 1.16 },
  { x: 29.0, z: -4.48, h: 1.08 },
  { x: 27.4, z: 4.52, h: 1.1 },
  { x: 33.4, z: -4.5, h: 1.2 },
  { x: 39.4, z: -4.48, h: 1.14 },
  { x: 36.2, z: 4.5, h: 1.08 },
  { x: 43.2, z: -4.5, h: 1.12 },
  { x: 47.6, z: -4.45, h: 1.18 },
  { x: 45.5, z: 4.52, h: 1.06 },
  { x: 21.4, z: 0.2, h: 0.92 },
  { x: 30.6, z: 0.35, h: 0.9 },
];

/** 梁下宫灯 */
export const LANTERNS = [
  { x: 5.0, z: 0, y: 3.55 },
  { x: 10.0, z: 0, y: 3.55 },
  { x: 16.8, z: 0, y: 3.55 },
  { x: 21.0, z: 0, y: 3.55 },
  { x: 26.8, z: 0, y: 3.55 },
  { x: 36.2, z: 0, y: 3.55 },
  { x: 45.4, z: 0, y: 3.55 },
];

/**
 * 皮影人物。kind 对应 figures.js 图集格。
 * y 为足底（坐榻上的人抬高）；pose 仅作注释，绘制已烘焙进 kind。
 *
 * DeepSeek 若另供实例数据，请按 id 合并，勿整表覆盖。
 */
export const FIGURES = [
  // —— 听乐 ——
  { id: 'han-tingyue', kind: 'hanSit', x: 5.15, z: -3.15, y: 0.52, w: 0.92, h: 1.48, seed: 0.11 },
  { id: 'pipa', kind: 'pipa', x: 7.55, z: -1.85, y: 0.02, w: 1.05, h: 1.42, seed: 0.22 },
  { id: 'guest-tingyue-a', kind: 'guestSit', x: 3.85, z: -0.55, y: 0.02, w: 0.85, h: 1.38, seed: 0.31 },
  { id: 'guest-tingyue-b', kind: 'guestSit', x: 6.55, z: -0.6, y: 0.02, w: 0.85, h: 1.36, seed: 0.37 },
  { id: 'guest-tingyue-c', kind: 'guestStand', x: 8.55, z: -2.55, y: 0, w: 0.72, h: 1.76, seed: 0.44 },
  { id: 'maid-tingyue', kind: 'maid', x: 2.65, z: -1.7, y: 0, w: 0.68, h: 1.62, seed: 0.52 },
  // —— 观舞 ——
  { id: 'dancer', kind: 'dancer', x: 15.55, z: -1.55, y: 0, w: 1.15, h: 1.55, seed: 0.18 },
  { id: 'han-drum', kind: 'hanStand', x: 17.35, z: -2.15, y: 0, w: 0.78, h: 1.9, seed: 0.27 },
  { id: 'monk', kind: 'monk', x: 14.35, z: -3.15, y: 0, w: 0.72, h: 1.72, seed: 0.63 },
  { id: 'guest-guanwu-a', kind: 'guestStand', x: 18.55, z: -0.85, y: 0, w: 0.7, h: 1.74, seed: 0.41 },
  { id: 'guest-guanwu-b', kind: 'guestSit', x: 19.4, z: -3.35, y: 0.02, w: 0.82, h: 1.34, seed: 0.48 },
  // —— 歇息 ——
  { id: 'han-rest', kind: 'hanSit', x: 26.35, z: -3.05, y: 0.52, w: 0.95, h: 1.5, seed: 0.14, tint: [1.05, 1.02, 0.95] },
  { id: 'lady-rest-a', kind: 'ladyStand', x: 24.85, z: -1.55, y: 0, w: 0.7, h: 1.68, seed: 0.33 },
  { id: 'lady-rest-b', kind: 'maid', x: 27.85, z: -1.25, y: 0, w: 0.66, h: 1.58, seed: 0.57 },
  { id: 'guest-rest', kind: 'guestStand', x: 25.15, z: 1.25, y: 0, w: 0.7, h: 1.74, seed: 0.39 },
  // —— 清吹 ——
  { id: 'flute-a', kind: 'flute', x: 33.55, z: -3.35, y: 0.42, w: 0.82, h: 1.32, seed: 0.21 },
  { id: 'flute-b', kind: 'flute', x: 35.05, z: -3.4, y: 0.42, w: 0.82, h: 1.3, seed: 0.29 },
  { id: 'flute-c', kind: 'ladySit', x: 36.55, z: -3.38, y: 0.42, w: 0.84, h: 1.32, seed: 0.35 },
  { id: 'flute-d', kind: 'flute', x: 38.05, z: -3.36, y: 0.42, w: 0.82, h: 1.31, seed: 0.43 },
  { id: 'flute-e', kind: 'flute', x: 39.45, z: -3.34, y: 0.42, w: 0.82, h: 1.33, seed: 0.51 },
  { id: 'han-qingchui', kind: 'hanSit', x: 33.35, z: 1.45, y: 0.02, w: 0.9, h: 1.46, seed: 0.16 },
  { id: 'guest-qingchui', kind: 'guestStand', x: 34.85, z: 2.15, y: 0, w: 0.7, h: 1.74, seed: 0.46 },
  // —— 散宴 ——
  { id: 'guest-sanyan-a', kind: 'guestStand', x: 43.55, z: -1.15, y: 0, w: 0.74, h: 1.78, seed: 0.34 },
  { id: 'lady-sanyan-a', kind: 'ladyStand', x: 44.15, z: -1.55, y: 0, w: 0.7, h: 1.66, seed: 0.55 },
  { id: 'guest-sanyan-b', kind: 'guestSit', x: 46.35, z: -0.15, y: 0.02, w: 0.84, h: 1.36, seed: 0.42 },
  { id: 'lady-sanyan-b', kind: 'ladyStand', x: 46.95, z: -0.65, y: 0, w: 0.68, h: 1.64, seed: 0.61 },
  { id: 'maid-sanyan', kind: 'maid', x: 43.15, z: 1.85, y: 0, w: 0.66, h: 1.58, seed: 0.58 },
];
