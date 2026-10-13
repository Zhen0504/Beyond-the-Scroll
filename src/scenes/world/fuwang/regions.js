/**
 * 颜料 → 目标区映射。
 *
 * 选一种矿物色，画面上就只高亮「该涂这种颜色」的地方；
 * 用鼠标在这些高亮处涂抹，才算有效落色。
 *
 * 每折给出若干个「色区」，各自指定该用哪种颜料、覆盖哪段 u 范围、对应画面里什么。
 * 目标是让观众一眼看出：这一段该上石绿、那一段该上朱砂。
 *
 * 说明：色区划分是据壁画用色所作的观览安排，属艺术转译，
 * 不是对原壁画绘制工序的复原。
 */

export const PIGMENT_KEYS = ['shiqing', 'shilv', 'zhusha', 'tuhong'];

/** 每折的色区：{p, u0, u1, what} —— p 为颜料 id，what 为画面上对应之处 */
export const FOLD_REGIONS = {
  jiuni: [
    { p: 'shilv', u0: 0.000, u1: 0.045, what: '水波与岸线' },
    { p: 'shiqing', u0: 0.045, u1: 0.088, what: '山峦' },
    { p: 'shilv', u0: 0.088, u1: 0.112, what: '鹿身' },
    { p: 'zhusha', u0: 0.112, u1: 0.135, what: '鹿角与斑纹' },
  ],
  beishi: [
    { p: 'shilv', u0: 0.135, u1: 0.196, what: '坡石' },
    { p: 'tuhong', u0: 0.196, u1: 0.248, what: '地色' },
    { p: 'shiqing', u0: 0.248, u1: 0.300, what: '远山' },
  ],
  xuangshang: [
    { p: 'shiqing', u0: 0.300, u1: 0.373, what: '殿宇瓦顶' },
    { p: 'tuhong', u0: 0.373, u1: 0.453, what: '宫墙' },
    { p: 'zhusha', u0: 0.453, u1: 0.520, what: '衣饰' },
    { p: 'shilv', u0: 0.520, u1: 0.620, what: '栏楯' },
  ],
  weilie: [
    { p: 'tuhong', u0: 0.620, u1: 0.690, what: '车马' },
    { p: 'shilv', u0: 0.690, u1: 0.760, what: '草木' },
    { p: 'shiqing', u0: 0.760, u1: 0.820, what: '山石' },
  ],
  chenqing: [
    { p: 'zhusha', u0: 0.820, u1: 0.878, what: '鹿身斑纹' },
    { p: 'shilv', u0: 0.878, u1: 0.930, what: '地色' },
    { p: 'shiqing', u0: 0.930, u1: 1.000, what: '侍从与山' },
  ],
};

/** 取某折中使用到指定颜料的色区 */
export function regionsFor(foldId, pigmentId) {
  return (FOLD_REGIONS[foldId] ?? []).filter((r) => r.p === pigmentId);
}

/**
 * 某段 u 是否属于「当前颜料应涂之处」。
 * 返回覆盖强度 0..1（色区边缘略作羽化，便于涂抹时判定）。
 */
export function coverageAt({ foldId, pigmentId, u, feather = 0.006 }) {
  const list = regionsFor(foldId, pigmentId);
  let best = 0;
  for (const r of list) {
    const inside = Math.min(u - r.u0, r.u1 - u);
    if (inside >= 0) {
      best = Math.max(best, Math.min(1, inside / feather));
    } else if (inside > -feather) {
      best = Math.max(best, 0);
    }
  }
  return best;
}

/** 当前颜料在本折是否还有未涂满的色区 */
export function hasRegions(foldId, pigmentId) {
  return regionsFor(foldId, pigmentId).length > 0;
}
