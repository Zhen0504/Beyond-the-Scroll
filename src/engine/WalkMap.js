/**
 * 可行走区域与碰撞：
 *  - 地面：地形高度场，过陡（坡度 > maxSlope）或在水下的位置不可走；
 *  - 平台：桥面、栈道、台基等“甲板”，可高于地面（桥下是水也能走）；
 *  - 障碍：树干（圆）、房屋（旋转矩形）、山石（按真实截面的径向轮廓），带高度范围；
 *  - 动态障碍：行走中的人物等，每帧更新位置。
 * 每一步只允许在落差 STEP_UP / STEP_DOWN 内的表面之间移动，因此桥、栈道两侧天然形成“栏杆”。
 * 被推出障碍后若仍与其他障碍重叠（如两块石头之间的夹缝），这一步直接作废，避免来回推挤造成画面抖动。
 */
const CELL = 8;
const STEP_UP = 0.6;
const STEP_DOWN = 1.0;
const PLAYER_HEIGHT = 1.7;
const TWO_PI = Math.PI * 2;

export class WalkMap {
  constructor({ heightAt, slopeHeight, waterLevel = 0, maxSlope = 0.9, bounds, playerRadius = 0.42 }) {
    this.heightAt = heightAt;
    // 坡度判断用的高度场（可不含小起伏，避免土丘成为空气墙）
    this.slopeHeight = slopeHeight ?? heightAt;
    this.waterLevel = waterLevel;
    this.maxSlope = maxSlope;
    this.bounds = bounds; // { minX, maxX, minZ, maxZ }
    this.radius = playerRadius;
    this.grid = new Map();
    this.decks = [];
    this.dynamic = [];
    this._seen = new Set();
  }

  _cellsFor(minX, minZ, maxX, maxZ, fn) {
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) fn(`${ix},${iz}`);
  }

  _insert(ob, minX, minZ, maxX, maxZ) {
    this._cellsFor(minX, minZ, maxX, maxZ, (k) => {
      let list = this.grid.get(k);
      if (!list) this.grid.set(k, (list = []));
      list.push(ob);
    });
  }

  addCircle(x, z, r, yMin = -Infinity, yMax = Infinity) {
    this._insert({ kind: 'circle', x, z, r, yMin, yMax }, x - r, z - r, x + r, z + r);
  }

  addBox(cx, cz, hx, hz, angle = 0, yMin = -Infinity, yMax = Infinity) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const ext = Math.abs(hx * c) + Math.abs(hz * s);
    const ezt = Math.abs(hx * s) + Math.abs(hz * c);
    this._insert({ kind: 'box', cx, cz, hx, hz, c, s, yMin, yMax }, cx - ext, cz - ezt, cx + ext, cz + ezt);
  }

  /** 径向轮廓障碍：radii[k] 为方向角 k/N·2π 上的截面半径（山石） */
  addRadial(x, z, radii, yMin = -Infinity, yMax = Infinity) {
    const rMax = Math.max(...radii);
    this._insert({ kind: 'radial', x, z, radii, rMax, yMin, yMax }, x - rMax, z - rMax, x + rMax, z + rMax);
  }

  /** 动态障碍：obj 需有 x、z、r 属性，可随时改变 */
  addDynamic(obj) {
    this.dynamic.push(obj);
  }

  /**
   * deck: { type: 'path', points: [[x, z, y], ...], width }
   *     | { type: 'rect', cx, cz, hx, hz, angle, y }
   */
  addDeck(deck) {
    if (deck.type === 'path') {
      const xs = deck.points.map((p) => p[0]);
      const zs = deck.points.map((p) => p[1]);
      const pad = deck.width;
      deck.aabb = [Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad];
    } else {
      const r = Math.hypot(deck.hx, deck.hz);
      deck.aabb = [deck.cx - r, deck.cz - r, deck.cx + r, deck.cz + r];
      deck.c = Math.cos(deck.angle || 0);
      deck.s = Math.sin(deck.angle || 0);
    }
    this.decks.push(deck);
  }

  deckHeight(deck, x, z) {
    const [a, b, c, d] = deck.aabb;
    if (x < a || z < b || x > c || z > d) return null;
    if (deck.type === 'rect') {
      const dx = x - deck.cx, dz = z - deck.cz;
      const lx = dx * deck.c + dz * deck.s;
      const lz = -dx * deck.s + dz * deck.c;
      return Math.abs(lx) <= deck.hx && Math.abs(lz) <= deck.hz ? deck.y : null;
    }
    const half = deck.width / 2;
    let best = null, bestD = Infinity;
    const pts = deck.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0, y0] = pts[i];
      const [x1, z1, y1] = pts[i + 1];
      const ex = x1 - x0, ez = z1 - z0;
      const len2 = ex * ex + ez * ez;
      let t = ((x - x0) * ex + (z - z0) * ez) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = x0 + ex * t, pz = z0 + ez * t;
      const dist = Math.hypot(x - px, z - pz);
      if (dist <= half && dist < bestD) {
        bestD = dist;
        best = y0 + (y1 - y0) * t;
      }
    }
    return best;
  }

  /** 地面高度；水下或过陡返回 null */
  terrainHeight(x, z) {
    const h = this.heightAt(x, z);
    if (h < this.waterLevel - 0.25) return null;
    const e = 0.5, H = this.slopeHeight;
    const gx = (H(x + e, z) - H(x - e, z)) / (2 * e);
    const gz = (H(x, z + e) - H(x, z - e)) / (2 * e);
    if (Math.hypot(gx, gz) > this.maxSlope) return null;
    return h;
  }

  /** 在 footY 附近可站立的表面；extraUp 为跳跃时额外可登上的高度 */
  surfaceNear(x, z, footY, extraUp = 0) {
    // 可达范围内取最高的表面：走上桥面、栈道后就站在板上，不会“掉”到板下的地面
    let best = null;
    const up = STEP_UP + extraUp;
    const consider = (h) => {
      if (h === null) return;
      const d = h - footY;
      if (d > up || d < -STEP_DOWN) return;
      if (best === null || h > best) best = h;
    };
    consider(this.terrainHeight(x, z));
    for (const deck of this.decks) consider(this.deckHeight(deck, x, z));
    return best;
  }

  /** 头顶是否碰到桥面、栈道（不能从低矮的桥下钻过去） */
  headBlocked(x, z, footY) {
    for (const deck of this.decks) {
      const d = this.deckHeight(deck, x, z);
      if (d === null) continue;
      const gap = d - footY;
      if (gap > STEP_UP && gap < PLAYER_HEIGHT + 0.35) return true;
    }
    return false;
  }

  /** 任意可站立表面（用于出生点等） */
  groundAt(x, z) {
    let best = this.heightAt(x, z);
    for (const deck of this.decks) {
      const h = this.deckHeight(deck, x, z);
      if (h !== null && h > best) best = h;
    }
    return best;
  }

  _nearby(x, z, r, fn) {
    const seen = this._seen;
    seen.clear();
    this._cellsFor(x - r, z - r, x + r, z + r, (k) => {
      const list = this.grid.get(k);
      if (!list) return;
      for (const ob of list) {
        if (seen.has(ob)) continue;
        seen.add(ob);
        fn(ob);
      }
    });
  }

  static radialAt(ob, angle) {
    const n = ob.radii.length;
    const f = (((angle % TWO_PI) + TWO_PI) % TWO_PI) / TWO_PI * n;
    const i = Math.floor(f) % n;
    const t = f - Math.floor(f);
    return ob.radii[i] * (1 - t) + ob.radii[(i + 1) % n] * t;
  }

  /** 单个障碍的穿透：返回 [推出方向 x, z, 深度]，无穿透返回 null */
  _penetration(ob, x, z, r) {
    if (ob.kind === 'circle' || ob.kind === 'dynamic') {
      const dx = x - ob.x, dz = z - ob.z;
      const d = Math.hypot(dx, dz);
      const min = ob.r + r;
      if (d >= min) return null;
      return d > 1e-5 ? [dx / d, dz / d, min - d] : [1, 0, min];
    }
    if (ob.kind === 'radial') {
      const dx = x - ob.x, dz = z - ob.z;
      const d = Math.hypot(dx, dz);
      if (d >= ob.rMax + r) return null;
      const R = WalkMap.radialAt(ob, Math.atan2(dz, dx)) + r;
      if (d >= R) return null;
      return d > 1e-5 ? [dx / d, dz / d, R - d] : [1, 0, R];
    }
    // box
    const dx = x - ob.cx, dz = z - ob.cz;
    const lx = dx * ob.c + dz * ob.s;
    const lz = -dx * ob.s + dz * ob.c;
    const qx = Math.max(-ob.hx, Math.min(ob.hx, lx));
    const qz = Math.max(-ob.hz, Math.min(ob.hz, lz));
    let ox = lx - qx, oz = lz - qz;
    const d = Math.hypot(ox, oz);
    if (d >= r) return null;
    let depth;
    if (d < 1e-5) {
      const px = ob.hx - Math.abs(lx), pz = ob.hz - Math.abs(lz);
      if (px < pz) { ox = Math.sign(lx) || 1; oz = 0; depth = px + r; }
      else { ox = 0; oz = Math.sign(lz) || 1; depth = pz + r; }
    } else {
      ox /= d;
      oz /= d;
      depth = r - d;
    }
    // 局部方向转回世界
    return [ox * ob.c - oz * ob.s, ox * ob.s + oz * ob.c, depth];
  }

  _eachObstacle(x, z, footY, fn) {
    const hit = (ob) => {
      if (footY + PLAYER_HEIGHT < ob.yMin || footY > ob.yMax) return;
      fn(ob);
    };
    this._nearby(x, z, this.radius, hit);
    for (const d of this.dynamic) {
      if (d.active === false) continue;
      if (Math.abs(d.x - x) > d.r + 2 || Math.abs(d.z - z) > d.r + 2) continue;
      fn({ kind: 'dynamic', x: d.x, z: d.z, r: d.r });
    }
  }

  /** 把点推出障碍；返回 { x, z, clear } —— clear 为 false 表示仍卡在障碍之间 */
  collide(x, z, footY) {
    const r = this.radius;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      this._eachObstacle(x, z, footY, (ob) => {
        const p = this._penetration(ob, x, z, r);
        if (!p) return;
        x += p[0] * (p[2] + 1e-3);
        z += p[1] * (p[2] + 1e-3);
        moved = true;
      });
      if (!moved) return { x, z, clear: true };
    }
    let clear = true;
    this._eachObstacle(x, z, footY, (ob) => {
      if (this._penetration(ob, x, z, r - 0.02)) clear = false;
    });
    return { x, z, clear };
  }

  _step(pos, sx, sz, air) {
    const b = this.bounds;
    const nx = Math.max(b.minX, Math.min(b.maxX, pos.x + sx));
    const nz = Math.max(b.minZ, Math.min(b.maxZ, pos.z + sz));
    const h = this.surfaceNear(nx, nz, pos.y, air);
    if (h === null) return false;
    if (this.headBlocked(nx, nz, h + air)) return false;
    const c = this.collide(nx, nz, h + air);
    if (!c.clear) return false;
    // 推挤不得超过本步位移太多，防止被障碍“弹开”
    const push = Math.hypot(c.x - nx, c.z - nz);
    if (push > Math.hypot(sx, sz) + 0.05) return false;
    const h2 = this.surfaceNear(c.x, c.z, pos.y, air);
    if (h2 === null) return false;
    pos.x = c.x;
    pos.z = c.z;
    pos.y = h2;
    return true;
  }

  /**
   * 移动并处理碰撞（分步 + 沿墙滑动），直接修改 pos {x, y, z}，y 为脚下地面高度。
   * air：当前离地高度（跳跃中），可借此登上更高处、越过矮障碍。
   */
  move(pos, dx, dz, air = 0) {
    // 若当前已与障碍重叠（如出生点、人物走近），先把人推出来，不让“推挤过大”的规则把人困住
    const cur = this.collide(pos.x, pos.z, pos.y + air);
    if (cur.clear && Math.hypot(cur.x - pos.x, cur.z - pos.z) > 1e-3) {
      const h = this.surfaceNear(cur.x, cur.z, pos.y, air);
      if (h !== null) {
        pos.x = cur.x;
        pos.z = cur.z;
        pos.y = h;
      }
    }
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / 0.15));
    const sx = dx / steps, sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      if (this._step(pos, sx, sz, air)) continue;
      if (this._step(pos, sx, 0, air) || this._step(pos, 0, sz, air)) continue;
      // 迎面撞上圆形障碍（石、树、人）时，沿切向绕过去
      for (const a of [0.6, -0.6, 1.1, -1.1]) {
        const c = Math.cos(a), s = Math.sin(a);
        if (this._step(pos, (sx * c - sz * s) * c, (sx * s + sz * c) * c, air)) break;
      }
    }
  }

  /** 某点（半径 r）在高度区间 [yMin, yMax] 内是否碰到障碍（船用：桥上的人、水下的石不算） */
  blocked(x, z, r, yMin = -Infinity, yMax = Infinity) {
    let hit = false;
    this._nearby(x, z, r, (ob) => {
      if (hit || ob.yMax < yMin || ob.yMin > yMax) return;
      if (this._penetration(ob, x, z, r)) hit = true;
    });
    return hit;
  }

  /** 在 (x, z) 附近找一处可站立的地面（下船上岸用） */
  findLanding(x, z, maxR = 7, maxH = 2.4) {
    for (let r = 1.5; r <= maxR; r += 0.75) {
      let best = null;
      for (let a = 0; a < 24; a++) {
        const th = (a / 24) * TWO_PI;
        const px = x + Math.cos(th) * r, pz = z + Math.sin(th) * r;
        const b = this.bounds;
        if (px < b.minX || px > b.maxX || pz < b.minZ || pz > b.maxZ) continue;
        // 只上到近水的地面或低矮的码头，不会从桥下“穿”到桥面上
        let h = this.terrainHeight(px, pz);
        for (const deck of this.decks) {
          const dh = this.deckHeight(deck, px, pz);
          if (dh !== null && dh <= maxH && (h === null || dh > h)) h = dh;
        }
        if (h === null || h < -0.1 || h > maxH) continue;
        if (!this.collide(px, pz, h).clear) continue;
        const c = this.collide(px, pz, h);
        if (Math.hypot(c.x - px, c.z - pz) > 0.05) continue;
        if (!best || h < best.y) best = { x: px, z: pz, y: h };
      }
      if (best) return best;
    }
    return null;
  }
}
