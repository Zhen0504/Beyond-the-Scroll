/** Five successive moments, not five archaeologically reconstructed rooms.
 * Furniture follows the scroll; walkable distances are an artistic adaptation. */
export const FLOOR_Y = 0;
export const HALL = { x0: 0, x1: 60, z0: -6, z1: 7 };
export const BOUNDS = { minX: 0.8, maxX: 59.2, minZ: -5, maxZ: 6 };
export const SPAWN = { x: 6.8, z: 5.8, yaw: 0, pitch: -0.055 };
export const ROOMS = [
  {
    id: "tingyue",
    name: "听乐",
    verse: "一声琵琶，满座凝神",
    x0: 0,
    x1: 12,
    maxX: 12,
    paintingU: [0.77, 1],
    view: [6.8, 5.8, 0],
    note: "琵琶在左，宾客环坐；韩熙载与红衣郎粲共坐围榻。",
  },
  {
    id: "guanwu",
    name: "观舞",
    verse: "六幺拍缓，衣袖生风",
    x0: 12,
    x1: 24,
    maxX: 24,
    paintingU: [0.59, 0.77],
    view: [18.5, 5.8, 0],
    note: "王屋山背身起舞，韩熙载亲自击鼓，德明和尚双手交握而立。",
  },
  {
    id: "zhanxie",
    name: "暂歇",
    verse: "灯前小坐，半晌闲情",
    x0: 24,
    x1: 36,
    maxX: 36,
    paintingU: [0.443, 0.59],
    view: [30, 5.8, 0],
    note: "围榻与帐床相连，韩熙载净手，侍女持琵琶、捧盘经过。",
  },
  {
    id: "qingchui",
    name: "清吹",
    verse: "五管清音，吹入夜深",
    x0: 36,
    x1: 48,
    maxX: 48,
    paintingU: [0.188, 0.443],
    view: [42.2, 6, 0],
    note: "五位女乐聚坐合奏，韩熙载敞衣盘坐椅上，执扇听曲。",
  },
  {
    id: "sanyan",
    name: "散宴",
    verse: "曲终人散，余韵在绢",
    x0: 48,
    x1: 60,
    maxX: Infinity,
    paintingU: [0, 0.188],
    view: [54.5, 5.8, 0],
    note: "韩熙载黄袍高帽，持鼓槌送客；宾客与女伎相语。",
  },
];
export const ZONES = ROOMS;
// Single-leaf screens leave a continuous front passage, instead of a zigzag maze.
export const SCREENS = [
  {
    id: "listen-screen",
    x: 1.5,
    z: -2.2,
    length: 3.5,
    height: 2.65,
    angle: -0.24,
    motif: "landscape",
  },
  {
    id: "dance-screen",
    x: 12.4,
    z: -2.5,
    length: 3.25,
    height: 2.65,
    angle: -0.48,
    motif: "landscape",
  },
  {
    id: "rest-screen",
    x: 24.7,
    z: -2.6,
    length: 3.6,
    height: 2.8,
    angle: -0.44,
    motif: "plain",
  },
  {
    id: "winds-screen",
    x: 37.1,
    z: -2.7,
    length: 3.3,
    height: 2.6,
    angle: -0.3,
    motif: "landscape",
  },
  {
    id: "farewell-screen",
    x: 49.2,
    z: -2.6,
    length: 3.1,
    height: 2.7,
    angle: -0.36,
    motif: "landscape",
  },
];
export const BEDS = [
  {
    id: "listening-couch",
    x: 8.4,
    z: -1.9,
    w: 4.1,
    d: 2.15,
    h: 0.56,
    cloth: "#b9ac78",
  },
  {
    id: "rest-couch",
    x: 28.6,
    z: -1.8,
    w: 4.6,
    d: 2,
    h: 0.58,
    cloth: "#aaa17f",
  },
  {
    id: "curtained-bed",
    x: 32.6,
    z: -2.7,
    w: 3.5,
    d: 2.1,
    h: 0.6,
    cloth: "#718c80",
    canopy: true,
  },
];
export const TABLES = [
  { x: 4.7, z: -0.1, w: 1.8, d: 0.67, h: 0.73 },
  { x: 8.5, z: 0.7, w: 2.2, d: 0.75, h: 0.73 },
];
// Occupied chairs use the sitter's painted perspective; see paperSeats.js.
export const SEATS = [];
// The drum and mallet now share a registered painted pose, ensuring contact.
export const DRUMS = [];
export const MUSIC_MATS = [{ x: 41.35, z: -1.22, w: 4.15, d: 1.55 }];
export const CANDLES = [{ x: 30.5, z: 0.5, h: 1.5 }];
