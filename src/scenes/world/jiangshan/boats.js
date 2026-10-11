import { BoxGeometry, CylinderGeometry, Group, Mesh, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, box, paint } from '../../../engine/painted.js';
import { mulberry32 } from '../../../utils/math.js';
import { STRUCTURES } from './layout.js';
import { riverFlow } from './terrain.js';

/**
 * 舟：船身两头翘起，船舷、横梁、竹篷，左右两支桨。
 * 可登船划行：W/S 划桨，A/D 转向，顺水时随流漂移；搁浅、撞石、撞桩会被挡住。
 * 船头朝本地 +x。
 */
const HULL = '#5a4030';
const L = 6.4;

function hullGeometry() {
  // 半圆筒按长度方向收尖、两头上翘
  const g = new CylinderGeometry(1, 1, L, 16, 12, true, Math.PI, Math.PI);
  g.rotateZ(Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const u = (2 * x) / L;
    const w = Math.max(0.08, Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(u), 3.2))));
    pos.setXYZ(i, x, y * 0.55 * (0.4 + 0.6 * w) + u * u * 0.42, z * 0.85 * w);
  }
  g.computeVertexNormals();
  return paint(g, HULL, MAT.wood);
}

function boatGeometry(canopy) {
  const parts = [hullGeometry()];
  // 船舷
  for (const s of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      const x0 = -L / 2 + 0.3 + (i / 10) * (L - 0.6), x1 = x0 + (L - 0.6) / 10;
      const w0 = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs((2 * x0) / L), 3.2))) * 0.85;
      const w1 = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs((2 * x1) / L), 3.2))) * 0.85;
      const y0 = Math.pow((2 * x0) / L, 2) * 0.42, y1 = Math.pow((2 * x1) / L, 2) * 0.42;
      const len = Math.hypot(x1 - x0, w1 - w0, y1 - y0);
      const g = new BoxGeometry(len, 0.08, 0.1);
      g.rotateZ(Math.atan2(y1 - y0, x1 - x0));
      g.rotateY(-s * Math.atan2(w1 - w0, x1 - x0));
      g.translate((x0 + x1) / 2, (y0 + y1) / 2 + 0.02, (s * (w0 + w1)) / 2);
      parts.push(paint(g, '#3e2c20', MAT.wood));
    }
  }
  // 舱板：高出水面，随船身收窄、两头翘起（看不到船里有水）
  for (let i = 0; i < 12; i++) {
    const x0 = -L / 2 + 0.5 + (i / 12) * (L - 1.0), x1 = x0 + (L - 1.0) / 12;
    const xm = (x0 + x1) / 2, u = (2 * xm) / L;
    const w = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(u), 3.2)));
    parts.push(box(x1 - x0 + 0.02, 0.05, Math.max(0.2, 1.55 * w), i % 2 ? '#7a5c40' : '#6e5238', xm, -0.1 + u * u * 0.42, 0, MAT.wood));
  }
  for (const x of [-1.6, -0.4, 0.9, 2.0]) parts.push(box(0.22, 0.08, 1.5, '#6b4e36', x, -0.05, 0, MAT.wood));
  if (canopy) {
    const c = new CylinderGeometry(0.82, 0.82, 2.3, 12, 1, true, 0, Math.PI);
    c.rotateZ(Math.PI / 2);
    c.translate(0.55, -0.02, 0);
    parts.push(paint(c, '#9c8456', MAT.thatch));
    for (const x of [-0.55, 1.65]) {
      const r = new CylinderGeometry(0.85, 0.85, 0.08, 12, 1, true, 0, Math.PI);
      r.rotateZ(Math.PI / 2);
      r.translate(x, -0.02, 0);
      parts.push(paint(r, '#6b5638', MAT.wood));
    }
  }
  return mergeGeometries(parts);
}

function oarGeometry() {
  const shaft = new CylinderGeometry(0.035, 0.035, 2.8, 6);
  shaft.rotateX(Math.PI / 2);
  shaft.translate(0, 0, 1.2);
  const blade = new BoxGeometry(0.04, 0.24, 0.7);
  blade.translate(0, 0, 2.5);
  const grip = new CylinderGeometry(0.03, 0.03, 0.4, 6);
  grip.rotateX(Math.PI / 2);
  grip.translate(0, 0, -0.35);
  return mergeGeometries([paint(shaft, '#7a5c40', MAT.wood), paint(blade, '#6b4e36', MAT.wood), paint(grip, '#5a4030', MAT.wood)]);
}

class Boat {
  constructor({ material, x, z, angle, canopy, heightAt, walkMap, oars = true }) {
    this.x = x;
    this.z = z;
    this.heading = angle;
    this.speed = 0;
    this.turnVel = 0;
    this.oarPhase = 0;
    this.rowing = 0;
    this.phase = Math.random() * 10;
    this.heightAt = heightAt;
    this.walkMap = walkMap;
    this.occupied = false;

    this.group = new Group();
    this.group.rotation.order = 'YXZ';
    this.group.add(new Mesh(boatGeometry(canopy), material));
    this.oars = [];
    if (oars) {
      const og = oarGeometry();
      for (const s of [-1, 1]) {
        const pivot = new Group();
        pivot.position.set(-0.35, 0.18, s * 0.78);
        const oar = new Mesh(og, material);
        oar.scale.z = s;
        pivot.add(oar);
        this.group.add(pivot);
        this.oars.push({ pivot, side: s });
      }
    }
    this._t = 0;
    this._v = new Vector3();
    this.update(0, null);
  }

  /** 水深足够、不碰石不碰桩、不撞别的船 */
  clear(x, z) {
    if (this.heightAt(x, z) > -0.35) return false;
    if (this.walkMap.blocked(x, z, 0.75, -0.5, 1.8)) return false;
    for (const o of this.others ?? []) if (o !== this && o.hullDistance(x, z) < 0.8) return false;
    return true;
  }

  /** 点到本船船身（沿船长方向的线段，半宽约 0.85）的距离 */
  hullDistance(x, z) {
    const fx = Math.cos(this.heading), fz = -Math.sin(this.heading);
    const dx = x - this.x, dz = z - this.z;
    const t = Math.max(-L / 2 + 0.5, Math.min(L / 2 - 0.5, dx * fx + dz * fz));
    return Math.hypot(dx - fx * t, dz - fz * t) - 0.85;
  }

  /** 船身五个取样点中有几个搁浅或碰撞 */
  badness(x, z, h) {
    const fx = Math.cos(h), fz = -Math.sin(h);
    let n = 0;
    for (const k of [0, 1.5, -1.5, 2.9, -2.9]) if (!this.clear(x + fx * k, z + fz * k)) n++;
    return n;
  }

  update(dt, input) {
    this._t += dt;
    const t = this._t + this.phase;
    if (input) {
      const thrust = input.forward * (input.run ? 3.4 : 2.3);
      this.speed += thrust * dt;
      this.turnVel += -input.turn * 1.5 * dt;
      this.rowing += ((input.forward || input.turn ? 1 : 0) - this.rowing) * Math.min(1, dt * 4);
      if (input.forward || input.turn) this.oarPhase += dt * (input.run ? 4.2 : 3.2) * (input.forward < 0 ? -1 : 1);
    } else {
      this.rowing *= Math.exp(-dt * 3);
    }
    this.speed = Math.max(-2, Math.min(4.6, this.speed * Math.exp(-dt * 0.55)));
    this.turnVel *= Math.exp(-dt * 2.4);

    if (dt > 0 && (input || this.occupied || Math.abs(this.speed) > 0.01)) {
      const h1 = this.heading + this.turnVel * dt * (0.55 + Math.min(1, Math.abs(this.speed) / 2));
      const fx = Math.cos(h1), fz = -Math.sin(h1);
      const flow = riverFlow(this.x, this.z);
      const nx = this.x + fx * this.speed * dt + flow.x * dt * 0.7;
      const nz = this.z + fz * this.speed * dt + flow.z * dt * 0.7;
      // 只要不比现在更“搁浅”就允许：已靠岸的船也能转身划离
      const cur = this.badness(this.x, this.z, this.heading);
      if (this.badness(nx, nz, h1) <= cur) {
        this.x = nx;
        this.z = nz;
        this.heading = h1;
      } else if (this.badness(this.x, this.z, h1) <= cur) {
        this.heading = h1;
        this.speed *= -0.2;
      } else {
        this.speed *= -0.2;
        this.turnVel *= -0.3;
      }
    }

    const y = 0.22 + Math.sin(t * 1.3) * 0.035;
    this.group.position.set(this.x, y, this.z);
    this.group.rotation.y = this.heading;
    this.group.rotation.x = Math.sin(t * 0.9) * 0.025 - this.turnVel * 0.06;
    this.group.rotation.z = Math.sin(t * 1.1) * 0.015 + this.speed * 0.004;

    // 桨：前后摆动，入水时压低
    for (const { pivot, side } of this.oars) {
      const sweep = Math.sin(this.oarPhase) * 0.55 * this.rowing;
      const dip = (Math.cos(this.oarPhase) * 0.5 + 0.5) * this.rowing;
      pivot.rotation.set(0, 0, 0);
      pivot.rotation.order = 'YXZ';
      // 静止时桨顺船身收起
      pivot.rotation.y = side * (-0.95 + 0.95 * this.rowing + sweep);
      pivot.rotation.x = side * (0.18 + dip * 0.22);
    }
  }

  /** 乘船时的视点（船尾坐处） */
  seat() {
    this.group.updateMatrixWorld();
    return this._v.set(-1.1, 1.18, 0).applyMatrix4(this.group.matrixWorld);
  }
}

export function createBoats({ material, heightAt, walkMap, makePerson }) {
  const rand = mulberry32(512);
  const boats = STRUCTURES.boats.map((b) => {
    const boat = new Boat({ material, ...b, heightAt, walkMap, oars: !b.fisher });
    if (b.fisher && makePerson) {
      const m = makePerson('fisher', 'sit');
      m.position.set(2.0, 0.12, 0);
      m.rotation.y = Math.PI / 2 + (rand() - 0.5) * 0.4;
      boat.group.add(m);
      boat.npc = true;
    }
    return boat;
  });
  for (const b of boats) b.others = boats;
  return {
    boats,
    group: boats.reduce((g, b) => (g.add(b.group), g), new Group()),
    update(dt, active) {
      for (const b of boats) if (b !== active) b.update(dt, null);
    },
    /** 离玩家最近、可登的船 */
    nearest(x, z, maxD = 7) {
      let best = null, bd = maxD;
      for (const b of boats) {
        if (b.npc) continue;
        const d = Math.hypot(b.x - x, b.z - z);
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      return best;
    },
  };
}
