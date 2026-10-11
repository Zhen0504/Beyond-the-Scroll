/**
 * 第一人称漫游：点击锁定鼠标，WASD / 方向键行走，Shift 疾行，空格跳跃，鼠标环顾。
 * 也可“乘坐”载具（船）：此时 W/S、A/D 交给载具，镜头随载具移动与转向。
 *
 * 平滑处理：
 *  - 鼠标：部分浏览器在指针锁定下偶尔上报异常巨大的位移，单次超限的数据直接丢弃；
 *  - 撞墙：速度按实际位移校正，沿墙滑动时不会忽快忽慢；
 *  - 高度：地面高差平滑跟随，跳跃时不做延迟。
 */
const WALK = 3.4;
const RUN = 6.8;
const SENS = 0.0021;
const JUMP_SPEED = 5.4;
const GRAVITY = 16;
const MOUSE_SPIKE = 300;

export class FirstPersonController {
  constructor({ camera, dom, walkMap, spawn, eyeHeight = 1.62, onLockChange, onInteract }) {
    this.camera = camera;
    this.dom = dom;
    this.walkMap = walkMap;
    this.eyeHeight = eyeHeight;
    this.onLockChange = onLockChange;
    this.onInteract = onInteract;

    this.pos = { x: spawn.x, z: spawn.z, y: walkMap.groundAt(spawn.x, spawn.z) };
    this.yaw = spawn.yaw ?? 0;
    this.pitch = spawn.pitch ?? 0;
    this.vx = 0;
    this.vz = 0;
    this.air = 0;
    this.vy = 0;
    this.feetY = this.pos.y;
    this.bob = 0;
    this.keys = new Set();
    this.locked = false;
    this.vehicle = null;
    this.blend = 0; // 上下船时镜头过渡
    this._mouseAvg = 0;

    camera.rotation.order = 'YXZ';

    this._onKeyDown = (e) => {
      if (!this.locked) return;
      this.keys.add(e.code);
      if (e.code === 'Space' && !e.repeat) this._jump();
      if (e.code === 'KeyE' && !e.repeat) this.onInteract?.();
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      const mx = e.movementX, my = e.movementY;
      const mag = Math.hypot(mx, my);
      // 与近期平均幅度相比突然暴增的单帧数据视为异常（浏览器指针锁定的已知问题）
      const limit = Math.max(MOUSE_SPIKE, this._mouseAvg * 8);
      this._mouseAvg = this._mouseAvg * 0.8 + Math.min(mag, limit) * 0.2;
      if (mag > limit) return;
      this.yaw -= mx * SENS;
      this.pitch -= my * SENS;
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
    };
    this._onLock = () => {
      this.locked = document.pointerLockElement === this.dom;
      if (!this.locked) this.keys.clear();
      this.onLockChange?.(this.locked);
    };
    this._onBlur = () => this.keys.clear();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLock);
    this._apply(0);
  }

  lock() {
    const fallback = () => {
      const p = this.dom.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };
    try {
      // 原始鼠标输入：不受系统加速度影响，转身更稳
      const p = this.dom.requestPointerLock?.({ unadjustedMovement: true });
      if (p && typeof p.catch === 'function') p.catch(fallback);
    } catch {
      fallback();
    }
  }

  unlock() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  get grounded() {
    return this.air <= 0 && this.vy <= 0;
  }

  _jump() {
    if (this.vehicle || !this.grounded) return;
    this.vy = JUMP_SPEED;
  }

  /** 登上载具（vehicle 需提供 update(dt, input)、seat(out)、heading） */
  enterVehicle(vehicle) {
    this.vehicle = vehicle;
    this.air = 0;
    this.vy = 0;
    this.vx = this.vz = 0;
    this._lastHeading = vehicle.heading;
    this.blend = 1;
    this._from = this.camera.position.clone();
  }

  /** 离开载具，站到 landing {x, y, z} */
  exitVehicle(landing) {
    this.vehicle = null;
    this._from = this.camera.position.clone();
    this.blend = 1;
    this.pos.x = landing.x;
    this.pos.z = landing.z;
    this.pos.y = landing.y;
    this.feetY = landing.y;
  }

  _input() {
    const k = this.keys;
    let f = 0, s = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
    return { f, s, run: k.has('ShiftLeft') || k.has('ShiftRight') };
  }

  update(dt) {
    const { f, s, run } = this._input();

    if (this.vehicle) {
      this.vehicle.update(dt, { forward: f, turn: s, run });
      // 船转向时视线随之转动
      const dh = this.vehicle.heading - this._lastHeading;
      this._lastHeading = this.vehicle.heading;
      this.yaw += dh;
      this._apply(dt);
      return;
    }

    const len = Math.hypot(f, s) || 1;
    const speed = run ? RUN : WALK;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const moving = f || s ? 1 : 0;
    const tx = ((-sin * f + cos * s) / len) * speed * moving;
    const tz = ((-cos * f - sin * s) / len) * speed * moving;
    // 空中仍可少量调整方向
    const a = 1 - Math.exp(-dt * (this.grounded ? 9 : 2.5));
    this.vx += (tx - this.vx) * a;
    this.vz += (tz - this.vz) * a;

    // 跳跃
    if (!this.grounded || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.air += this.vy * dt;
      if (this.air <= 0) {
        this.air = 0;
        this.vy = 0;
      }
    }

    const ox = this.pos.x, oz = this.pos.z, oy = this.pos.y;
    this.walkMap.move(this.pos, this.vx * dt, this.vz * dt, this.air);
    // 跳上更高的地方：保持绝对高度连续
    if (this.air > 0) {
      this.air = Math.max(0, this.air - (this.pos.y - oy));
      if (this.air === 0 && this.vy < 0) this.vy = 0;
    }

    const mx = this.pos.x - ox, mz = this.pos.z - oz;
    const moved = Math.hypot(mx, mz);
    if (dt > 0) {
      // 撞墙或沿墙滑动：速度改为实际速度，避免“蓄力—弹开”的抖动
      const want = Math.hypot(this.vx, this.vz);
      const actual = moved / dt;
      if (want > 0.01 && actual < want * 0.9) {
        this.vx = mx / dt;
        this.vz = mz / dt;
      }
    }
    if (this.grounded) this.bob += moved * 1.9;
    this._apply(dt);
  }

  _apply(dt) {
    const cam = this.camera;
    let tx, ty, tz;
    if (this.vehicle) {
      const seat = this.vehicle.seat();
      tx = seat.x;
      ty = seat.y;
      tz = seat.z;
    } else {
      // 地面高差平滑跟随；跳跃位移直接叠加
      const target = this.pos.y;
      this.feetY = dt > 0 ? this.feetY + (target - this.feetY) * (1 - Math.exp(-dt * 14)) : target;
      const speed = Math.hypot(this.vx, this.vz);
      const bobAmp = this.grounded ? Math.min(1, speed / WALK) * 0.035 : 0;
      tx = this.pos.x;
      ty = this.feetY + this.air + this.eyeHeight + Math.sin(this.bob) * bobAmp;
      tz = this.pos.z;
    }
    if (this.blend > 0 && this._from) {
      this.blend = Math.max(0, this.blend - dt * 2.2);
      const k = this.blend * this.blend * (3 - 2 * this.blend);
      cam.position.set(tx + (this._from.x - tx) * k, ty + (this._from.y - ty) * k, tz + (this._from.z - tz) * k);
    } else {
      cam.position.set(tx, ty, tz);
    }
    cam.rotation.set(this.pitch, this.yaw, 0);
  }

  dispose() {
    this.unlock();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLock);
  }
}
