/** Registered whole-character pose cycles; durations in seconds. */
export const ACTION_CYCLES = {
  drink: [
    [0, 2.8, "持杯"],
    [1, 0.48, "举杯"],
    [2, 1.15, "小酌"],
    [1, 0.42, "离唇"],
    [3, 0.75, "放杯"],
    [0, 1.6, "听曲"],
  ],
  dance: [
    [0, 0.8, "起势"],
    [1, 0.65, "展袖"],
    [1, 0.35, "悬腕"],
    [3, 0.55, "收袖"],
    [2, 0.75, "回身"],
    [2, 0.35, "顿步"],
    [3, 0.65, "回势"],
    [0, 0.8, "归位"],
  ],
  pipa: [
    [0, 0.28, "起指"],
    [1, 0.2, "拨弦"],
    [2, 0.24, "回腕"],
    [3, 0.38, "续音"],
  ],
  drum: [
    [0, 0.6, "提槌"],
    [1, 0.13, "落鼓"],
    [2, 0.24, "回弹"],
    [3, 0.58, "候拍"],
  ],
  fan: [
    [0, 1.1, "执扇"],
    [1, 0.55, "内摇"],
    [2, 0.6, "回扇"],
    [3, 0.9, "停听"],
  ],
  wash: [
    [0, 1.3, "探水"],
    [1, 0.8, "净手"],
    [2, 0.7, "收袖"],
    [3, 1.1, "稍歇"],
  ],
  clap: [
    [0, 0.65, "分掌"],
    [1, 0.14, "合掌"],
    [2, 0.28, "回掌"],
    [3, 0.48, "随拍"],
  ],
  flute: [
    [0, 0.7, "按孔"],
    [1, 0.35, "换指"],
    [2, 0.5, "抬指"],
    [3, 0.6, "续吹"],
  ],
  send: [
    [0, 2, "持槌"],
    [1, 0.6, "抬手"],
    [2, 1.2, "送别"],
    [3, 1.8, "收袖"],
  ],
  talk: [
    [0, 1.6, "倾听"],
    [1, 0.8, "应答"],
    [2, 0.9, "示意"],
    [3, 1.6, "收手"],
  ],
};
export function actionFrame(motion, time, phase = 0) {
  const cycle = ACTION_CYCLES[motion];
  if (!cycle) return 0;
  const total = cycle.reduce((n, c) => n + c[1], 0);
  let t = (((time + phase) % total) + total) % total;
  for (const [frame, duration] of cycle) {
    if (t < duration) return frame;
    t -= duration;
  }
  return 0;
}
export function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
/** Substepped spring remains stable across stalls and frame rates. */
export function stepPaperSpring(state, impulse, dt) {
  state.velocity += Math.max(-0.12, Math.min(0.12, impulse)) * 1.7;
  const steps = Math.max(1, Math.ceil(dt / 0.008)),
    step = Math.min(dt, 0.05) / steps;
  for (let i = 0; i < steps; i++) {
    state.velocity += (-92 * state.angle - 13 * state.velocity) * step;
    state.angle += state.velocity * step;
  }
  state.angle = Math.max(-0.045, Math.min(0.045, state.angle));
  return state.angle;
}
