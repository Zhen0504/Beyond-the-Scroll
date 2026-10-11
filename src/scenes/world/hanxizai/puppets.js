import { Group } from 'three';
import { createBillboards } from '../../../engine/Billboards.js';
import { mulberry32 } from '../../../utils/math.js';
import { FIGURES } from './layout.js';
import { PUPPET_CELLS, createPuppetAtlas } from './puppetPainter.js';
import { LIGHTING, WALK_ROUTES } from './zones.js';

/**
 * 夜宴人物：皮影式立体纸片（比基础版更细的画稿 + 按 id 合并的补充人物）。
 *
 * 与 figures.js 的分工：
 *   - figures.js 的图集与 FIGURES 站位是基础版；
 *   - 本文件用 puppetPainter.js 的细画稿重绘全部人物，并按 id 覆盖 / 追加：
 *       截稿、排箫、筚篥、羯鼓、捧槃、执烛、摇扇、袒腹、僧人 …
 *     站位沿用 layout.js 的 FIGURES（按 id 合并，不移动基础站位），另加少量补充人物与走动者。
 *   - 接口与 createFigures 一致（{ mesh, atlas, instances }），另返回 group / update / walkers，
 *     接入时把 index.js 的 import 换成 createPuppetFigures，并在每帧调用 update(dt) 即可。
 *
 * 皮影的「活气」有两层：Billboards 着色器按 uTime 让纸片随烛火轻摇；update() 再加一层
 * 呼吸般的浮沉，并驱动三名走动者（侍女捧槃、童仆执壶、侍女执烛）沿廊下往返。
 */

/** 基础版图集角色 → 皮影画稿角色 */
export const ROLE_MAP = {
  hanSit: 'hanzai_listen',
  hanStand: 'hanzai_send',
  guestSit: 'guest_clasp',
  guestStand: 'guest_stand',
  guestClap: 'guest_clap',
  ladySit: 'bili',
  ladyStand: 'maid_fan',
  maid: 'maid_tray',
  dancer: 'dancer',
  pipa: 'pipa',
  flute: 'flute',
  monk: 'monk',
};

/** 各角色的纸片高度（米）：立姿约 1.66，盘坐约 1.0，坐榻 / 坐墩 1.06～1.22 */
const H_BY_ROLE = {
  hanzai_listen: 1.16,
  hanzai_drum: 1.2,
  hanzai_recline: 1.22,
  hanzai_send: 1.68,
  pipa: 1.0,
  dancer: 1.72,
  flute: 1.06,
  paixiao: 1.06,
  bili: 1.06,
  drummer: 1.08,
  guest_clasp: 1.0,
  guest_clap: 1.02,
  maid_candle: 1.62,
  maid_tray: 1.6,
  maid_basin: 1.62,
  maid_fan: 1.6,
  guest_stand: 1.68,
  boy: 1.32,
  monk: 1.0,
};

/**
 * 按 id 覆盖基础站位的人物造型（位置不动，只换画稿角色与坐高）。
 * 依据原卷：韩熙载在观舞段亲自击鼓、清吹段袒腹盘坐；清吹五女用笛、排箫、筚篥相和；
 * 德明和尚在观舞段合掌而坐。
 */
export const FIGURE_OVERRIDES = [
  { id: 'han-tingyue', role: 'hanzai_listen' },
  { id: 'han-rest', role: 'hanzai_listen', flip: true, y: 0.52 },
  { id: 'han-drum', role: 'hanzai_drum', y: 0.04 },
  { id: 'han-qingchui', role: 'hanzai_recline', y: 0.5 },
  { id: 'dancer', role: 'dancer', y: 0.05 },
  { id: 'monk', role: 'monk', y: 0.0 },
  { id: 'pipa', role: 'pipa' },
  { id: 'flute-c', role: 'paixiao' },
  { id: 'flute-e', role: 'bili' },
  { id: 'guest-tingyue-a', role: 'guest_clap' },
  { id: 'guest-guanwu-b', role: 'guest_clasp', flip: true },
  { id: 'guest-rest', role: 'guest_stand' },
  { id: 'maid-tingyue', role: 'maid_candle' },
  { id: 'lady-rest-a', role: 'maid_tray' },
  { id: 'lady-rest-b', role: 'maid_basin' },
  { id: 'maid-sanyan', role: 'maid_tray' },
  { id: 'lady-sanyan-a', role: 'maid_fan' },
  { id: 'lady-sanyan-b', role: 'maid_candle', flip: true },
];

/** 补充人物（画中该有的执烛、捧槃、击鼓、拊掌者） */
export const EXTRA_FIGURES = [
  // 原卷末段：韩熙载执鼓槌立于门次送客（基础站位缺此一人）
  { id: 'han-sanyan', role: 'hanzai_send', x: 44.4, z: 1.2, y: 0 },
  { id: 'maid-qingchui-tray', role: 'maid_tray', x: 40.6, z: 2.6, y: 0, flip: true },
  { id: 'maid-zhanxie-basin', role: 'maid_basin', x: 29.3, z: -1.5, y: 0 },
  { id: 'drummer-guanwu', role: 'drummer', x: 18.3, z: -1.1, y: 0.44, flip: true },
  { id: 'guest-guanwu-clap', role: 'guest_clap', x: 20.4, z: -2.9, y: 0.02 },
  { id: 'boy-tingyue', role: 'boy', x: 3.0, z: 1.3, y: 0 },
  { id: 'maid-sanyan-candle', role: 'maid_candle', x: 47.8, z: 1.6, y: 0, flip: true },
];

/** 合并后的完整人物表：基础站位（按 id 覆盖）+ 补充人物 */
export function buildCast() {
  const overrides = new Map(FIGURE_OVERRIDES.map((o) => [o.id, o]));
  const cast = FIGURES.map((f) => {
    const ov = overrides.get(f.id) ?? {};
    const role = ov.role ?? ROLE_MAP[f.kind] ?? 'guest_clasp';
    return {
      id: f.id,
      role,
      x: f.x,
      z: f.z,
      y: ov.y ?? f.y ?? 0,
      h: ov.h ?? H_BY_ROLE[role] ?? 1.5,
      flip: ov.flip ?? f.seed > 0.5,
    };
  });
  for (const f of EXTRA_FIGURES) {
    cast.push({ ...f, h: f.h ?? H_BY_ROLE[f.role] ?? 1.5 });
  }
  return cast;
}

/** 灯下偏暖、背灯处偏冷（乘以纸片贴图） */
const COOL = [0.6, 0.62, 0.78];
const WARM = [1.12, 0.98, 0.78];

function tintAt(x, z) {
  const t = Math.max(0, Math.min(1, (LIGHTING.brightnessAt(x, z) - 0.5) / 0.55));
  return [0, 1, 2].map((i) => COOL[i] + (WARM[i] - COOL[i]) * t);
}

/**
 * 创建皮影人物（createFigures 的增强替换）。
 * @param {{atmosphere:object, walkMap?:object, sway?:number, cast?:Array}} opts
 * @returns {{group:Group, mesh:Mesh, atlas:object, instances:Array, walkers:Array, update:Function, count:number}}
 */
export function createPuppetFigures({ atmosphere, walkMap, sway = 0.03, cast } = {}) {
  const atlas = createPuppetAtlas(7);
  const rand = mulberry32(1108);
  const people = cast ?? buildCast();
  const instances = [];
  const statics = [];

  const add = (role, x, y, z, h, flip, collision) => {
    const cell = atlas.cells[PUPPET_CELLS[role]];
    if (!cell) return -1;
    instances.push({
      x, y, z,
      w: h * cell.aspect,
      h,
      uv: [cell.u0, cell.v0, cell.u1, cell.v1],
      seed: (flip ? 0.52 : 0.02) + rand() * 0.46,
      tint: tintAt(x, z),
    });
    if (walkMap && collision) walkMap.addCircle(x, z, 0.3, y - 0.2, y + h);
    return instances.length - 1;
  };

  for (const p of people) {
    const idx = add(p.role, p.x, p.y, p.z, p.h, p.flip, true);
    if (idx >= 0) statics.push({ index: idx, y: p.y, phase: rand() * Math.PI * 2 });
  }

  // 走动者：各自一个实例，逐帧改写 aOffset（并随转身调换镜像 seed）
  const walkers = [];
  for (const w of WALK_ROUTES) {
    const [a, b] = w.points;
    const idx = add(w.kind, a[0], 0, a[1], H_BY_ROLE[w.kind] ?? 1.6, false, false);
    if (idx < 0) continue;
    const obj = { x: a[0], z: a[1], r: 0.32, index: idx, t: 0, dir: 1, speed: w.speed, path: w.points };
    walkers.push(obj);
    walkMap?.addDynamic(obj);
  }

  const mesh = createBillboards({ atlas: atlas.texture, instances, atmosphere, sway });
  mesh.renderOrder = 2;
  const group = new Group();
  group.add(mesh);

  const attr = mesh.geometry.attributes.aOffset;
  const seedAttr = mesh.geometry.attributes.aSeed;
  let time = 0;

  /** 每帧：呼吸般的浮沉 + 走动者沿路线往返（走近屏风处转身时调换镜像） */
  function update(dt) {
    time += dt;
    if (!attr) return;
    const arr = attr.array;
    for (const s of statics) {
      arr[s.index * 3 + 1] = s.y + Math.sin(time * 1.05 + s.phase) * 0.012;
    }
    for (const w of walkers) {
      const [a, b] = w.path;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      w.t += (w.speed / len) * dt * w.dir;
      if (w.t > 1) { w.t = 1; w.dir = -1; if (seedAttr) seedAttr.array[w.index] = 0.55; }
      if (w.t < 0) { w.t = 0; w.dir = 1; if (seedAttr) seedAttr.array[w.index] = 0.05; }
      const x = a[0] + (b[0] - a[0]) * w.t;
      const z = a[1] + (b[1] - a[1]) * w.t;
      const y = Math.abs(Math.sin(time * 2.6 + w.index)) * 0.028;
      arr[w.index * 3] = x;
      arr[w.index * 3 + 1] = y;
      arr[w.index * 3 + 2] = z;
      w.x = x;
      w.z = z;
    }
    attr.needsUpdate = true;
    if (seedAttr) seedAttr.needsUpdate = true;
  }

  return { group, mesh, atlas, instances, walkers, update, count: instances.length, cast: people };
}
