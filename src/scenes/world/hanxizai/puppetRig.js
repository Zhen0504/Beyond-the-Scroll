/** Pure rig geometry / motion helpers, also exercised by node:test. */
export const JOINTS = {
  waist: [0.5, 0.58],
  neck: [0.5, 0.23],
  head: [0.5, 0.105],
  leftShoulder: [0.35, 0.28],
  leftElbow: [0.23, 0.42],
  leftWrist: [0.37, 0.49],
  rightShoulder: [0.65, 0.28],
  rightElbow: [0.78, 0.42],
  rightWrist: [0.62, 0.49],
  leftHip: [0.38, 0.61],
  leftKnee: [0.34, 0.79],
  leftAnkle: [0.3, 0.96],
  rightHip: [0.62, 0.61],
  rightKnee: [0.66, 0.79],
  rightAnkle: [0.7, 0.96],
};
const mid = (a, b) => a.map((v, i) => (v + b[i]) / 2);
export function rigDefinition(overrides = {}) {
  const j = { ...JOINTS, ...overrides };
  const nodes = [
    { name: "waist", parent: -1, pivot: j.waist, site: j.waist },
    { name: "torso", parent: 0, pivot: j.waist, site: mid(j.neck, j.waist) },
    { name: "head", parent: 1, pivot: j.neck, site: j.head },
  ];
  for (const side of ["left", "right"]) {
    const shoulder = nodes.length;
    nodes.push({
      name: `${side}Shoulder`,
      parent: 1,
      pivot: j[`${side}Shoulder`],
      site: mid(j[`${side}Shoulder`], j[`${side}Elbow`]),
    });
    nodes.push({
      name: `${side}Elbow`,
      parent: shoulder,
      pivot: j[`${side}Elbow`],
      site: mid(j[`${side}Elbow`], j[`${side}Wrist`]),
    });
    nodes.push({
      name: `${side}Wrist`,
      parent: shoulder + 1,
      pivot: j[`${side}Wrist`],
      site: j[`${side}Wrist`],
    });
  }
  for (const side of ["left", "right"]) {
    const hip = nodes.length;
    nodes.push({
      name: `${side}Hip`,
      parent: 0,
      pivot: j[`${side}Hip`],
      site: mid(j[`${side}Hip`], j[`${side}Knee`]),
    });
    nodes.push({
      name: `${side}Knee`,
      parent: hip,
      pivot: j[`${side}Knee`],
      site: mid(j[`${side}Knee`], j[`${side}Ankle`]),
    });
    nodes.push({
      name: `${side}Ankle`,
      parent: hip + 1,
      pivot: j[`${side}Ankle`],
      site: [j[`${side}Ankle`][0], 0.99],
    });
  }
  return nodes;
}

/** Shared-vertex cloth under the rigid head: no disconnected polygons can pull
 * open a face or a sleeve. Four normalized influences keep joints articulated. */
export function skinInfluences(point, nodes, aspect) {
  const [x, y] = point,
    neck = nodes[2].pivot[1];
  if (y <= neck - 0.035)
    return { indices: [2, 0, 0, 0], weights: [1, 0, 0, 0] };
  const ranked = nodes
    .map((n, i) => ({
      i,
      d: ((x - n.site[0]) * aspect) ** 2 + (y - n.site[1]) ** 2,
    }))
    .filter((n) => n.i !== 2)
    .sort((a, b) => a.d - b.d)
    .slice(0, 4);
  const radius = 0.075;
  let weights = ranked.map((n) => Math.exp(-n.d / (radius * radius)) + 1e-12);
  let indices = ranked.map((n) => n.i);
  if (y < neck + 0.035) {
    const blend = (neck + 0.035 - y) / 0.07;
    const sum = weights.slice(0, 3).reduce((a, b) => a + b, 0);
    weights = [
      blend,
      ...weights.slice(0, 3).map((w) => (w / sum) * (1 - blend)),
    ];
    indices = [2, ...indices.slice(0, 3)];
  } else {
    const sum = weights.reduce((a, b) => a + b, 0);
    weights = weights.map((w) => w / sum);
  }
  return { indices, weights };
}

/** Deliberate holds between gestures, with complete painted key poses.
 * Durations are seconds, ending on the first pose closes the loop. */
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
const ease = (x) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
// Slow lift, quick strike, rest: a strike is not a perpetual uniform sine wave.
function strike(t) {
  const p = ((t % 1.55) + 1.55) % 1.55;
  if (p < 0.65) return ease(p / 0.65);
  if (p < 0.85) return 1 - 1.5 * ease((p - 0.65) / 0.2);
  return -0.5 * (1 - ease((p - 0.85) / 0.7));
}
export function poseAngles(motion, time, phase = 0) {
  const t = time + phase,
    slow = Math.sin(t * 1.05),
    beat = Math.sin(t * 3.4);
  const a = {
    waist: 0,
    torso: slow * 0.008,
    head: Math.sin(t * 0.8) * 0.014,
    leftShoulder: slow * 0.008,
    rightShoulder: -slow * 0.008,
    leftElbow: slow * 0.009,
    rightElbow: -slow * 0.009,
    leftWrist: Math.sin(t * 1.7) * 0.012,
    rightWrist: Math.cos(t * 1.5) * 0.012,
    leftHip: 0,
    rightHip: 0,
    leftKnee: 0,
    rightKnee: 0,
    leftAnkle: 0,
    rightAnkle: 0,
  };
  if (motion === "dance")
    Object.assign(a, {
      torso: slow * 0.023,
      head: -slow * 0.021,
      leftShoulder: beat * 0.021,
      rightShoulder: -beat * 0.025,
      leftElbow: beat * 0.023,
      rightElbow: -beat * 0.02,
      leftWrist: beat * 0.035,
      rightWrist: -beat * 0.03,
      leftHip: slow * 0.009,
      rightHip: -slow * 0.009,
      leftKnee: -slow * 0.012,
      rightKnee: slow * 0.012,
    });
  if (motion === "drum")
    Object.assign(a, {
      leftShoulder: strike(t) * 0.045,
      leftElbow: -strike(t) * 0.14,
      leftWrist: -strike(t) * 0.13,
      rightElbow: -strike(t + 0.76) * 0.045,
      rightWrist: -strike(t + 0.76) * 0.055,
      head: slow * 0.017,
    });
  if (motion === "pipa")
    Object.assign(a, {
      leftElbow: beat * 0.022,
      leftWrist: Math.sin(t * 10) * 0.065,
      rightWrist: Math.sin(t * 2.2) * 0.023,
    });
  if (motion === "flute")
    Object.assign(a, {
      torso: slow * 0.007,
      head: slow * 0.006,
      leftElbow: slow * 0.008,
      rightElbow: slow * 0.008,
      leftWrist: beat * 0.017,
      rightWrist: -beat * 0.014,
    });
  if (motion === "clap")
    Object.assign(a, {
      leftElbow: strike(t) * 0.062,
      rightElbow: -strike(t) * 0.065,
      leftWrist: strike(t) * 0.035,
      rightWrist: -strike(t) * 0.03,
    });
  if (motion === "fan")
    Object.assign(a, {
      leftWrist: Math.sin(t * 2) * 0.08,
      leftElbow: slow * 0.025,
    });
  if (motion === "wash")
    Object.assign(a, {
      rightElbow: slow * 0.045,
      rightWrist: Math.sin(t * 2) * 0.07,
      leftWrist: -slow * 0.022,
    });
  if (motion === "send")
    Object.assign(a, {
      rightWrist: slow * 0.035,
      rightElbow: slow * 0.028,
      head: slow * 0.024,
    });
  // The wine cup's four complete poses already contain the large arm motion.
  if (motion === "drink")
    Object.assign(a, {
      head: slow * 0.009,
      leftElbow: slow * 0.006,
      rightElbow: slow * 0.006,
      leftWrist: 0,
      rightWrist: 0,
    });
  return a;
}
