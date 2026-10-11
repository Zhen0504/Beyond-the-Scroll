import { createBillboards } from '../../../engine/Billboards.js';
import { createNoise } from '../../../engine/noise.js';
import { mulberry32 } from '../../../utils/math.js';
import { NORTH_WALL, SOUTH_WALL, STRUCTURES } from './layout.js';
import { heightAt, lerpTable, riverDistance } from './terrain.js';
import { COLS, ROWS, TREE_TYPES, createTreeAtlas } from './treePainter.js';

const PAD = 0.003;
const dens = createNoise(4141);

function slopeAt(x, z) {
  const e = 1;
  return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
}

/** 各树种的色调变化（同一张画稿生出千树千色） */
const TINTS = {
  pine: [[0.95, 1.0, 1.0], [0.86, 0.95, 0.96], [1.05, 1.06, 1.0]],
  warm: [[1.05, 1.0, 0.95], [1.0, 1.05, 0.95], [0.94, 0.9, 0.94]],
  plain: [[1, 1, 1], [0.94, 1.0, 1.02], [1.04, 1.02, 0.94]],
};
const tintFor = (t) => (t.startsWith('pine') || t === 'cypress' ? TINTS.pine : t.startsWith('autumn') || t === 'maple' ? TINTS.warm : TINTS.plain);

/** 原作各段的林木构成：卷首松林苍郁，卷中杂树与竹，卷尾柳与秋树 */
function zoneWeights(x, rd) {
  const nearWater = rd < 9;
  if (x < -112) {
    return nearWater
      ? [['bare', 2], ['autumnRed', 2], ['pineBent', 2], ['outlined', 1]]
      : [['pineTall', 4], ['pineBent', 3], ['pineUmbrella', 1.2], ['cypress', 1], ['autumnRed', 2], ['bare', 1.5], ['autumnGold', 1]];
  }
  if (x < 74) {
    return nearWater
      ? [['willow', 1.2], ['bare', 2], ['maple', 1.5], ['outlined', 1.5], ['pineBent', 1]]
      : [['green', 2], ['outlined', 2], ['autumnRed', 2], ['maple', 2], ['pineTall', 2], ['pineBent', 1.5], ['cypress', 1], ['bare', 1]];
  }
  return nearWater
    ? [['willow', 3.5], ['bare', 2], ['autumnGold', 1]]
    : [['bare', 3], ['autumnGold', 2.5], ['autumnRed', 1.5], ['pineTall', 2], ['green', 1], ['willow', 1], ['pineUmbrella', 0.6]];
}

const HEIGHTS = {
  pineTall: [12, 18], pineBent: [9, 14], pineUmbrella: [10, 14], cypress: [9, 13],
  bare: [7, 12], autumnRed: [7, 11], autumnGold: [8, 12], maple: [6, 9], green: [8, 12], outlined: [7, 10],
  willow: [8, 11], bamboo: [5, 7.5], reed: [1.6, 2.6], shrub: [1.1, 2], grass: [0.45, 1.0],
};

/**
 * 植被：
 *  1. 特色林地（卷首松林、亭边古松、湖南竹丛）；
 *  2. 全谷统一撒点：平滑的疏密场决定林与空地，树种按所在段落与离水远近选取；
 *  3. 地被：草丛、岸边芦苇、灌木；
 *  4. 不可到达的南山、北崖台地、对岸与峰顶点点松。
 */
export function createVegetation({ atmosphere, walkMap, avoid, rocks }) {
  const atlas = createTreeAtlas(3);
  const instances = [];
  const placed = new Map();
  const rand = mulberry32(2024);
  const pick = (list) => {
    const total = list.reduce((s, [, w]) => s + w, 0);
    let r = rand() * total;
    for (const [t, w] of list) if ((r -= w) <= 0) return t;
    return list[0][0];
  };
  const spaced = (x, z, d) => {
    const cx = Math.floor(x / 6), cz = Math.floor(z / 6);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const list = placed.get(`${cx + i},${cz + j}`);
      if (list) for (const [px, pz, pd] of list) if (Math.hypot(px - x, pz - z) < Math.min(d, pd) * 0.5 + Math.max(d, pd) * 0.5) return false;
    }
    return true;
  };
  const remember = (x, z, d) => {
    const k = `${Math.floor(x / 6)},${Math.floor(z / 6)}`;
    if (!placed.has(k)) placed.set(k, []);
    placed.get(k).push([x, z, d]);
  };

  function add(type, x, y, z, h, collide) {
    const cells = TREE_TYPES[type];
    const cell = cells[Math.floor(rand() * cells.length)];
    const top = atlas.tops[cell];
    const bottom = 1 - atlas.baseOffset;
    const col = cell % COLS, row = Math.floor(cell / COLS);
    const uv = [col / COLS + PAD, 1 - (row + bottom) / ROWS, (col + 1) / COLS - PAD, 1 - (row + top) / ROWS];
    // 格宽高比 384:768 = 0.5，可见部分为 (bottom - top) 个格高
    const w = h * (0.5 / (bottom - top));
    const tints = tintFor(type);
    instances.push({ x, y, z, h, w, uv, seed: rand(), tint: tints[Math.floor(rand() * tints.length)] });
    if (collide && walkMap) walkMap.addCircle(x, z, Math.max(0.28, h * 0.024), -Infinity, y + h);
  }

  function place(type, x, z, { collide = true, spacing = 5, scale = 1 } = {}) {
    const [h0, h1] = HEIGHTS[type];
    const h = (h0 + rand() * (h1 - h0)) * scale;
    add(type, x, heightAt(x, z) - 0.3, z, h, collide);
    remember(x, z, spacing);
  }

  function scatter({ count, sample, types, spacing = 5, maxSlope = 1.1, minH = 0.4, maxH = 200, river, collide = true, density, scale = 1, avoidR = 2.2 }) {
    let made = 0;
    for (let tries = 0; tries < count * 14 && made < count; tries++) {
      const [x, z] = sample();
      const h = heightAt(x, z);
      if (h < minH || h > maxH) continue;
      const rd = river || density ? riverDistance(x, z) : 0;
      if (river && (rd < river[0] || rd > river[1])) continue;
      if (density && rand() > density(x, z, rd)) continue;
      if (slopeAt(x, z) > maxSlope) continue;
      if (avoid(x, z, avoidR)) continue;
      if (!spaced(x, z, spacing)) continue;
      const type = typeof types === 'function' ? types(x, z, rd) : pick(types);
      if (!type) continue;
      place(type, x, z, { collide, spacing, scale });
      made++;
    }
  }

  const rect = (x0, x1, z0, z1) => () => [x0 + rand() * (x1 - x0), z0 + rand() * (z1 - z0)];
  const circle = (cx, cz, r) => () => {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r;
    return [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
  };
  const valley = () => {
    const x = -266 + rand() * 508;
    const zn = lerpTable(NORTH_WALL, x) + 2, zs = lerpTable(SOUTH_WALL, x) + 4;
    return [x, zn + rand() * (zs - zn)];
  };
  // 林与空地：低频噪声决定疏密，永远留一点稀疏的树
  const groves = (x, z) => 0.12 + 0.62 * Math.max(0, Math.min(1, (dens.fbm2(x * 0.014, z * 0.014, 3) + 0.25) * 1.6));

  // 1. 特色林地
  scatter({ count: 46, sample: rect(-266, -205, 30, 74), types: [['pineTall', 5], ['pineBent', 3], ['pineUmbrella', 1]], spacing: 6 });
  scatter({ count: 6, sample: circle(STRUCTURES.pavilion.x, STRUCTURES.pavilion.z, 16), types: [['pineBent', 2], ['pineUmbrella', 1]], spacing: 6 });
  scatter({ count: 45, sample: rect(22, 62, 8, 38), river: [2, 40], types: [['bamboo', 1]], spacing: 3.2, minH: 0.2, density: (x, z) => 0.3 + 0.7 * Math.max(0, dens.noise2(x * 0.08, z * 0.08)) });

  // 2. 全谷统一撒点
  scatter({
    count: 700,
    sample: valley,
    density: (x, z, rd) => groves(x, z) * (rd < 2 ? 0.2 : 1),
    types: (x, z, rd) => pick(zoneWeights(x, rd)),
    spacing: 5.2,
    maxSlope: 1.2,
  });

  // 3. 地被
  scatter({ count: 160, sample: valley, river: [-1.2, 3], types: [['reed', 1]], spacing: 2.4, minH: -0.35, collide: false, avoidR: 1 });
  scatter({ count: 240, sample: valley, density: (x, z) => 0.35 + groves(x, z), types: [['shrub', 1]], spacing: 3.2, collide: false, avoidR: 1.2 });
  scatter({ count: 900, sample: valley, types: [['grass', 1]], spacing: 1.6, collide: false, avoidR: 0.8 });

  // 4. 南山与北崖台地、对岸
  scatter({ count: 280, sample: () => { const x = -270 + rand() * 520; return [x, lerpTable(SOUTH_WALL, x) - 4 + rand() * 80]; }, types: [['pineTall', 4], ['pineBent', 2], ['pineUmbrella', 1], ['cypress', 1], ['green', 2], ['autumnRed', 1], ['autumnGold', 1]], spacing: 6.5, maxSlope: 1.8, collide: false, scale: 1.1 });
  scatter({ count: 240, sample: () => { const x = -280 + rand() * 500; return [x, lerpTable(NORTH_WALL, x) - 14 - rand() * 90]; }, types: [['pineTall', 4], ['pineBent', 2], ['pineUmbrella', 1], ['cypress', 1], ['green', 1], ['autumnRed', 1]], spacing: 6.5, maxSlope: 2.2, collide: false });
  scatter({ count: 120, sample: rect(250, 460, -230, -110), types: [['green', 2], ['autumnGold', 2], ['autumnRed', 1], ['pineTall', 2], ['willow', 1]], spacing: 7, maxSlope: 2.5, collide: false });
  scatter({ count: 90, sample: rect(250, 460, 130, 240), types: [['green', 2], ['pineTall', 2], ['autumnRed', 1]], spacing: 7, maxSlope: 2.5, collide: false });

  // 峰顶点点松
  for (const p of rocks.topPoints(190, 77)) {
    add(rand() < 0.5 ? 'pineTall' : rand() < 0.6 ? 'pineBent' : 'pineUmbrella', p.x, p.y, p.z, 5 + rand() * 5, false);
  }

  const trees = createBillboards({ atlas: atlas.texture, instances, atmosphere, sway: 0.018 });
  return { meshes: [trees], count: instances.length };
}
