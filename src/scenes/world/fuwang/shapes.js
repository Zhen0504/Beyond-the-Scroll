/**
 * 壁画上的「形体」—— 每个形体是一件可辨认的画面内容（鹿、水波、殿顶…）。
 *
 * 由 tools/build_shapes.py 从壁画自动生成，请勿手改。
 * 蒙版（masks.png）里每个形体占一个槽位，槽位里的白色像素即该形体的轮廓；
 * 包围盒 uv 用于把槽位映射回壁画坐标。
 *
 * 这些形体是供「重彩」敷彩提示之用的艺术转译，
 * 不是对原壁画绘制工序的复原，也不代表敦煌研究院的划分。
 */

export const MASK_SLOTS = 24;
export const MASK_SLOT_W = 128;
export const MASK_SLOT_H = 64;
export const MASK_PAD_X = 4;
export const MASK_PAD_Y = 4;
export const MASK_DATA_W = 120;
export const MASK_DATA_H = 56;

/** 形体表 */
export const SHAPES = [
  { id: 'jiuni-water', fold: 'jiuni', p: 'shilv', what: '水波', slot: 0, box: [0.10781, 0.0091, 0.2099, 0.42033] },
  { id: 'jiuni-drowner', fold: 'jiuni', p: 'zhusha', what: '溺水人', slot: 1, box: [0.07995, 0.28376, 0.11745, 0.62064] },
  { id: 'jiuni-peaks', fold: 'jiuni', p: 'shiqing', what: '峰峦', slot: 2, box: [0.09062, 0.58877, 0.10234, 0.69196] },
  { id: 'jiuni-white-deer', fold: 'jiuni', p: 'shilv', what: '白鹿', slot: 3, box: [0.17578, 0.32625, 0.2099, 0.73293] },
  { id: 'jiuni-earth', fold: 'jiuni', p: 'tuhong', what: '地色', slot: 4, box: [0.10781, 0.42033, 0.2099, 0.9909] },
  { id: 'beishi-kneeler', fold: 'beishi', p: 'zhusha', what: '跪者', slot: 5, box: [0.21, 0.18058, 0.25182, 0.66009] },
  { id: 'beishi-rock', fold: 'beishi', p: 'shiqing', what: '山岩', slot: 6, box: [0.23516, 0.61608, 0.27005, 0.86343] },
  { id: 'beishi-peaks', fold: 'beishi', p: 'shilv', what: '山峦', slot: 7, box: [0.28984, 0.04097, 0.33984, 0.44006] },
  { id: 'beishi-earth', fold: 'beishi', p: 'tuhong', what: '地色', slot: 8, box: [0.21, 0.30046, 0.33984, 0.9909] },
  { id: 'xu-spotted-deer', fold: 'xuangshang', p: 'shilv', what: '斑纹九色鹿', slot: 9, box: [0.34, 0.29894, 0.37708, 0.78149] },
  { id: 'xu-streamer', fold: 'xuangshang', p: 'shiqing', what: '石青飘带', slot: 10, box: [0.46406, 0.6176, 0.49271, 0.83308] },
  { id: 'xu-peaks', fold: 'xuangshang', p: 'shilv', what: '山峦', slot: 11, box: [0.46562, 0.16995, 0.49479, 0.33384] },
  { id: 'xu-earth', fold: 'xuangshang', p: 'tuhong', what: '地色', slot: 12, box: [0.53984, 0.34143, 0.6599, 0.9909] },
  { id: 'wei-horse', fold: 'weilie', p: 'shilv', what: '白马', slot: 13, box: [0.66, 0.27314, 0.70599, 0.68741] },
  { id: 'wei-peaks', fold: 'weilie', p: 'shiqing', what: '山峦', slot: 14, box: [0.67005, 0.00607, 0.72734, 0.24886] },
  { id: 'wei-earth', fold: 'weilie', p: 'tuhong', what: '地色', slot: 15, box: [0.70599, 0.28073, 0.83984, 0.92109] },
  { id: 'chen-roof', fold: 'chenqing', p: 'shiqing', what: '殿堂瓦顶', slot: 16, box: [0.85599, 0.80273, 0.95182, 0.99393] },
  { id: 'chen-king', fold: 'chenqing', p: 'shiqing', what: '国王', slot: 17, box: [0.8599, 0.2868, 0.88594, 0.47496] },
  { id: 'chen-robe', fold: 'chenqing', p: 'shilv', what: '王后衣饰', slot: 18, box: [0.88385, 0.28376, 0.89896, 0.42185] },
  { id: 'chen-wall', fold: 'chenqing', p: 'tuhong', what: '殿壁', slot: 19, box: [0.95182, 0.14112, 0.99844, 0.96055] },
];

/** 按折分组 */
export const SHAPES_BY_FOLD = SHAPES.reduce((m, s) => {
  (m[s.fold] ??= []).push(s);
  return m;
}, {});

/** 取某折中属于指定颜料的形体 */
export function shapesFor(foldId, pigmentId) {
  return (SHAPES_BY_FOLD[foldId] ?? []).filter((s) => s.p === pigmentId);
}

/** 取某折的全部形体 */
export function foldShapes(foldId) {
  return SHAPES_BY_FOLD[foldId] ?? [];
}

/** 点 (u,v) 落在哪个形体内（用包围盒快速判定，精确判定由 GPU 蒙版完成） */
export function shapeAt(foldId, u, v) {
  return foldShapes(foldId).find(
    (s) => u >= s.box[0] && u <= s.box[2] && v >= s.box[1] && v <= s.box[3],
  ) ?? null;
}
