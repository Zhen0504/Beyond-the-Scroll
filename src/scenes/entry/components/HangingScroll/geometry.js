/**
 * 卷轴几何参数 —— 全部以“纸宽 w”为单位，CSS 与 JS 共用这一份数据。
 */
export const GEOMETRY = {
  rod: 0.045,          // 天杆厚度
  bundle: 0.19,        // 卷起时卷体直径
  roller: 0.09,        // 完全展开后地杆直径
  knobLength: 0.08,    // 轴头长度
  knobDiameter: 0.18,  // 轴头直径
};

export const DEFAULT_MOUNT = {
  top: 0.3,     // 天头
  bottom: 0.17, // 地头
  side: 0.075,  // 左右边
};

const FALLBACK_ASPECT = 0.66;

/** 计算装裱后整张纸的尺寸比例（高 / 宽）以及画心高度 */
export function paperMetrics(painting) {
  const mount = { ...DEFAULT_MOUNT, ...painting.mount };
  const aspect = painting.image ? painting.image.width / painting.image.height : FALLBACK_ASPECT;
  const heart = (1 - mount.side * 2) / aspect;
  return { mount, heart, ratio: mount.top + heart + mount.bottom };
}

/** 供 CSS 使用的几何变量 */
export function geometryVars() {
  return {
    '--g-rod': GEOMETRY.rod,
    '--g-bundle': GEOMETRY.bundle,
    '--g-knob-l': GEOMETRY.knobLength,
    '--g-knob-d': GEOMETRY.knobDiameter,
  };
}
