/**
 * 《江山秋色图》画境地图。单位：米；x 向东（画卷由左至右），z 向南（-z 为画中远方群山）。
 *
 * 浓缩全卷的三段：
 *   溪桥行旅（西）：石拱桥、松林车马道、北岸崖顶山寺       —— 对应卷首
 *   山湖叠翠（中）：群峰环抱的湖湾、飞瀑、临水亭阁、栈道层台 —— 对应卷中湖湾
 *   江村秋色（东）：巨岩、江村码头、两崖间廊桥、开阔江面与远塔 —— 对应卷尾
 */

export const WATER_LEVEL = 0;

/** 江流中心线 [x, z, 半宽]，由西向东，湖湾处展宽，卷尾汇成开阔江面 */
export const RIVER = [
  [-900, 0, 6], [-420, 10, 7], [-330, 12, 7], [-260, 20, 7], [-205, 10, 7.5], [-160, -6, 8.5],
  [-115, -16, 10], [-75, -28, 16], [-40, -42, 28], [-5, -46, 26], [30, -40, 14], [70, -34, 16],
  [115, -26, 22], [160, -18, 30], [210, -14, 44], [280, -22, 80], [380, -40, 160], [520, -40, 240],
  [900, 0, 480], [1600, 60, 900], [2800, 80, 1400],
];

/** 北侧山崖脚下的 z（随 x 线性插值） */
export const NORTH_WALL = [
  [-400, -42], [-260, -44], [-200, -42], [-150, -44], [-110, -46], [-80, -62], [-50, -76],
  [-10, -80], [20, -74], [28, -67], [36, -63.6], [90, -63.6], [96, -67.4], [122, -67.4], [140, -76], [160, -84], [200, -100], [260, -160], [400, -210],
];

/** 南侧山丘脚下的 z */
export const SOUTH_WALL = [
  [-400, 72], [-250, 74], [-180, 70], [-120, 62], [-60, 58], [0, 56], [60, 62], [100, 80],
  [150, 86], [200, 100], [260, 140], [400, 200],
];

/** 可游览范围（第一人称硬边界，实际多由山崖与江水限制） */
export const BOUNDS = { minX: -272, maxX: 244, minZ: -120, maxZ: 150 };

export const SPAWN = { x: -246, z: 44, yaw: -0.62, pitch: 0.04 };

/** 主路（南岸，自西向东贯穿三段） */
export const MAIN_PATH = [
  [-262, 50], [-240, 44], [-222, 34], [-208, 24], [-188, 28], [-160, 24], [-132, 16], [-108, 10],
  [-86, 8], [-72, 11], [-60, 13], [-48, 9], [-44, 4], [-20, 2], [2, -3], [12, -1], [24, -6], [32, -16], [48, -10], [70, -2],
  [92, 6], [116, 14], [138, 24], [160, 30], [182, 36], [204, 46], [226, 60],
];

/** 北岸支路：过石拱桥后沿北岸至湖湾西侧 */
export const NORTH_PATH = [
  [-205, -2], [-198, -14], [-178, -24], [-152, -28], [-128, -32], [-104, -38], [-88, -44],
];

/** 湖湾北侧支路：过木桥后上栈道 */
export const LAKE_NORTH_PATH = [[32, -60], [35, -61]];

/** 瀑布下的溪涧：自崖脚流入湖、江（宽度为水面宽） */
export const STREAMS = [
  { points: [[-30, -82], [-29.5, -76], [-28.5, -70], [-27.5, -64]], width: 3, pool: 4.2 },
  { points: [[164, -88], [163.5, -78], [161, -64], [157.5, -45]], width: 2.6, pool: 3.6 },
];

export const ZONES = [
  { id: 'xiqiao', name: '溪桥行旅', verse: '松风过石梁', maxX: -112 },
  { id: 'shanhu', name: '山湖叠翠', verse: '飞泉落镜湖', maxX: 74 },
  { id: 'jiangcun', name: '江村秋色', verse: '秋水共长天', maxX: Infinity },
];

/** 山石群：x, z, 柱数, 高度范围, 半径范围, 散布半径, 种子 */
export const ROCK_CLUSTERS = [
  // —— 北侧主峰（卷中远景群峰） ——
  { x: -238, z: -78, count: 6, h: [80, 135], r: [14, 26], spread: 30, seed: 11 },
  { x: -182, z: -74, count: 5, h: [65, 115], r: [12, 22], spread: 26, seed: 12 },
  { x: -128, z: -84, count: 5, h: [60, 100], r: [12, 22], spread: 26, seed: 13 },
  { x: -86, z: -100, count: 5, h: [85, 130], r: [14, 26], spread: 26, seed: 14 },
  { x: -36, z: -112, count: 6, h: [110, 165], r: [16, 28], spread: 30, seed: 15 },
  { x: 18, z: -102, count: 5, h: [75, 120], r: [12, 24], spread: 24, seed: 16 },
  { x: 108, z: -112, count: 5, h: [85, 130], r: [14, 24], spread: 26, seed: 17 },
  { x: 150, z: -114, count: 2, h: [62, 70], r: [10, 12], spread: 4, seed: 18 },
  { x: 178, z: -110, count: 2, h: [64, 72], r: [10, 12], spread: 4, seed: 19 },
  { x: 228, z: -158, count: 6, h: [90, 140], r: [16, 28], spread: 34, seed: 20 },
  { x: 60, z: -96, count: 3, h: [50, 80], r: [10, 18], spread: 16, seed: 21 },
  // —— 南侧近景山丘 ——
  { x: -236, z: 104, count: 4, h: [30, 55], r: [12, 20], spread: 26, seed: 31 },
  { x: -160, z: 98, count: 4, h: [25, 45], r: [10, 18], spread: 24, seed: 32 },
  { x: -82, z: 88, count: 4, h: [30, 50], r: [12, 20], spread: 24, seed: 33 },
  { x: -4, z: 88, count: 4, h: [25, 45], r: [10, 18], spread: 22, seed: 34 },
  { x: 64, z: 100, count: 4, h: [35, 60], r: [12, 20], spread: 24, seed: 35 },
  { x: 150, z: 120, count: 4, h: [30, 50], r: [12, 20], spread: 24, seed: 36 },
  { x: 236, z: 166, count: 4, h: [40, 60], r: [14, 22], spread: 26, seed: 37 },
  // —— 江村前的巨岩（卷尾中段的圆浑大石） ——
  { x: 96, z: 44, count: 3, h: [24, 38], r: [8, 12], spread: 9, seed: 41, bulb: true },
  // —— 西端峡口 ——
  { x: -292, z: -10, count: 4, h: [50, 90], r: [12, 20], spread: 24, seed: 42 },
  { x: -296, z: 50, count: 3, h: [40, 70], r: [12, 18], spread: 20, seed: 43 },
];

/** 建筑与构筑物 */
export const STRUCTURES = {
  archBridge: { x: -205, z: 10, angle: 0.25, length: 30, width: 4.6, rise: 3.2 },
  woodBridge: { x: 32, z0: -16, z1: -60, width: 3.2, y: 1.5 },
  pavilion: { x: -60, z: 6, size: 5.2, angle: 0.2 },
  lakeHall: { x: 12, z: -10, w: 11, d: 6.5, angle: -0.15 },
  temple: { x: -152, z: -76, angle: 0.1 },
  plankRoad: [[34, -61, 1.5], [48, -61.5, 2.6], [62, -61.5, 4.8], [76, -61, 7.8], [86, -60.5, 10.4], [95, -60, 12]],
  // 层台：自山脚垒起、背倚山崖的石台
  terrace: { cx: 108, cz: -61.2, hx: 14, hz: 5.4, y: 12 },
  coveredBridge: { x0: 155, x1: 173, z: -112, y: 46 },
  // 白塔：立在江村东南的小山上，俯临江面
  pagoda: { x: 272, z: 112 },
  village: [
    { x: 138, z: 36, angle: 0.3, type: 'hut' },
    { x: 152, z: 44, angle: 0.15, type: 'house' },
    { x: 168, z: 40, angle: -0.1, type: 'hut' },
    { x: 178, z: 54, angle: 0.4, type: 'house' },
    { x: 146, z: 58, angle: 0.05, type: 'hut' },
    { x: 196, z: 62, angle: -0.25, type: 'hut' },
    { x: 124, z: 28, angle: 0.5, type: 'shed' },
  ],
  dock: { x: 158, z: 18, angle: -0.2, length: 14 },
  // 可登的船（fisher 为渔人之舟，不可登）
  boats: [
    { x: -232, z: 17, angle: 0.1, canopy: false },
    { x: -30, z: -20, angle: 0.4, canopy: true },
    { x: 151, z: 5, angle: 1.2, canopy: true },
    { x: 166, z: 4, angle: 1.6, canopy: false },
    { x: 240, z: -20, angle: 0.4, canopy: true, fisher: true },
    { x: 290, z: 40, angle: 2.2, canopy: true, fisher: true },
    { x: 180, z: -24, angle: Math.PI/2, canopy: true, fisher: true, npcId: 'angler' },
  ],
  waterfalls: [
    { x: -30, z: -82, top: 30, width: 4.6 },
    { x: 164, z: -88, top: 26, width: 3.8 },
  ],
};

/**
 * 画中人物。有 route 的沿路往返行走；face 为静立时的朝向（弧度，0 朝南 +z）。
 * kind：scholar 文士 / traveler 行旅 / rider 骑驴 / porter 挑担 / villager 村人 / fisher 渔人 / monk 僧
 */
export const FIGURES = [
  // 卷首：骑驴行旅与挑担随从，沿车马道往返
  { id: 'rider', kind: 'rider', route: [[-250, 48], [-236, 42], [-222, 34], [-206, 25], [-188, 28], [-162, 23]], speed: 0.85 },
  { id: 'servant', kind: 'porter', route: [[-254, 50], [-240, 44], [-226, 36], [-210, 27], [-192, 29], [-166, 24]], speed: 0.85, delay: 2 },
  { id: 'bridgeScholar', kind: 'scholar', x: -204, z: 14, face: Math.PI * 0.6 },
  { id: 'pilgrim', kind: 'traveler', route: [[-198, -14], [-178, -24], [-152, -28], [-128, -32], [-104, -38]], speed: 0.75 },
  // 湖湾：亭中二友、水阁前的村人、层台远眺
  { id: 'poetA', kind: 'scholar', x: -61.5, z: 7, face: Math.PI },
  { id: 'poetB', kind: 'scholar', pose: 'sit', x: -58.6, z: 4.6, face: Math.PI * 0.85 },
  { id: 'farmer', kind: 'villager', route: [[-44, 4], [-20, 2], [2, -3], [12, -1], [24, -6], [30, -15]], speed: 0.9 },
  { id: 'terraceScholar', kind: 'scholar', x: 98.5, z: -57.4, face: Math.PI * 0.95 },
  { id: 'terraceCompanion', kind: 'scholar', x: 101.1, z: -57.7, face: Math.PI },
  { id: 'monk', kind: 'monk', x: -150, z: -71, face: 0 },
  // 江村：挑担、垂钓、两位村妇闲话
  { id: 'peddler', kind: 'porter', route: [[96, 6], [116, 14], [138, 24], [160, 30], [182, 36], [204, 46]], speed: 0.9, delay: 4 },
  { id: 'angler', kind: 'fisher', pose: 'sit', x: 156, z: 6.4, face: Math.PI * 0.94 },
  { id: 'wifeA', kind: 'villager', x: 166, z: 50, face: 0.9 },
  { id: 'wifeB', kind: 'villager', x: 168.4, z: 51.6, face: -2.2 },
  { id: 'boy', kind: 'villager', route: [[146, 56], [152, 46], [174, 44], [182, 52]], speed: 0.7, delay: 1 },
];
