/**
 * 颜料 → 目标区映射。
 *
 * 每个目标区是壁画上的一个**具体矩形**（壁画 uv 坐标），对应可辨认的画面内容 ——
 * 比如「九色鹿的白色身躯」「底部山峦」「国王的黑马」，而不是一大片笼统的横带。
 * 观众选中一种矿物色，画面上只有这些具体位置发光；用鼠标在其中涂抹才算落色。
 *
 * uv 约定：x 自左端起（0..1），y 自下端起（0..1）。
 * 壁画原图 3840×659；以下矩形按画面内容量取。
 *
 * 说明：色区划分与用色是据壁画内容所作的观览安排，属艺术转译，
 * 不是对原壁画绘制工序的复原。
 */

export const PIGMENT_KEYS = ['shiqing', 'shilv', 'zhusha', 'tuhong'];

/** 目标区总数上限（与着色器 uTargets 数组长度一致） */
export const MAX_TARGETS = 16;

/**
 * 每折的目标区。
 * { p: 颜料 id, u0,v0,u1,v1: 矩形, what: 画面内容 }
 *
 * 约束：每个矩形必须落在所属折的 u 区间内（见 layout.js 的 FOLDS），
 * 否则观众在本折机位下看不到、也涂不到。tests/fuwang.test.js 会校验这一点。
 */
export const FOLD_REGIONS = {
  // 左端：九色鹿驮溺水人出水、跪谢（折区间 0–0.185）
  jiuni: [
    { p: 'shilv', u0: 0.020, v0: 0.00, u1: 0.105, v1: 0.40, what: '下部水波' },
    { p: 'tuhong', u0: 0.000, v0: 0.45, u1: 0.075, v1: 1.00, what: '地色' },
    { p: 'zhusha', u0: 0.072, v0: 0.30, u1: 0.112, v1: 0.72, what: '溺水人衣饰' },
    { p: 'shiqing', u0: 0.112, v0: 0.34, u1: 0.168, v1: 0.74, what: '左侧山峦' },
    { p: 'shilv', u0: 0.150, v0: 0.02, u1: 0.185, v1: 0.58, what: '鹿身' },
  ],

  // 溺水人跪谢立誓（折区间 0.185–0.340）
  beishi: [
    { p: 'shilv', u0: 0.185, v0: 0.10, u1: 0.235, v1: 0.55, what: '山间草木' },
    { p: 'shiqing', u0: 0.235, v0: 0.28, u1: 0.310, v1: 0.70, what: '石青山峦' },
    { p: 'zhusha', u0: 0.196, v0: 0.42, u1: 0.240, v1: 0.82, what: '跪者衣饰' },
    { p: 'tuhong', u0: 0.240, v0: 0.58, u1: 0.340, v1: 1.00, what: '地色' },
  ],

  // 中部：宫殿与人群（折区间 0.340–0.660）
  xuangshang: [
    { p: 'shilv', u0: 0.340, v0: 0.00, u1: 0.450, v1: 0.36, what: '石绿山峦' },
    { p: 'shiqing', u0: 0.500, v0: 0.10, u1: 0.595, v1: 0.74, what: '石青飘带' },
    { p: 'zhusha', u0: 0.470, v0: 0.18, u1: 0.545, v1: 0.66, what: '骑者朱衣' },
    { p: 'tuhong', u0: 0.450, v0: 0.42, u1: 0.580, v1: 0.95, what: '土红地色' },
    { p: 'shilv', u0: 0.560, v0: 0.00, u1: 0.660, v1: 0.32, what: '垄间青绿' },
  ],

  // 车马入山围猎（折区间 0.660–0.840）
  weilie: [
    { p: 'shiqing', u0: 0.680, v0: 0.52, u1: 0.800, v1: 0.95, what: '黑马与乘者' },
    { p: 'zhusha', u0: 0.740, v0: 0.30, u1: 0.832, v1: 0.80, what: '红衣侍从' },
    { p: 'shilv', u0: 0.660, v0: 0.00, u1: 0.780, v1: 0.38, what: '石绿山峦' },
    { p: 'tuhong', u0: 0.660, v0: 0.60, u1: 0.730, v1: 1.00, what: '地色' },
  ],

  // 九色鹿陈情（折区间 0.840–1.000）
  chenqing: [
    { p: 'shiqing', u0: 0.845, v0: 0.10, u1: 0.930, v1: 0.62, what: '石青山峦' },
    { p: 'shilv', u0: 0.930, v0: 0.00, u1: 0.998, v1: 0.36, what: '石绿山峦' },
    { p: 'zhusha', u0: 0.860, v0: 0.55, u1: 0.928, v1: 0.94, what: '跪坐者朱衣' },
    { p: 'tuhong', u0: 0.840, v0: 0.40, u1: 0.860, v1: 0.94, what: '地色' },
  ],
};

/** 取某折中使用到指定颜料的目标区 */
export function regionsFor(foldId, pigmentId) {
  return (FOLD_REGIONS[foldId] ?? []).filter((r) => r.p === pigmentId);
}

/** 某折是否用到指定颜料 */
export function hasRegions(foldId, pigmentId) {
  return regionsFor(foldId, pigmentId).length > 0;
}

/** 单区面积占壁画的比例（用于估计涂抹工作量） */
export function regionArea(r) {
  return Math.max(0, r.u1 - r.u0) * Math.max(0, r.v1 - r.v0);
}

/** 某折全部目标区的总面积 */
export function foldArea(foldId) {
  return (FOLD_REGIONS[foldId] ?? []).reduce((a, r) => a + regionArea(r), 0);
}
