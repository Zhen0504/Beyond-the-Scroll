import { Raycaster, Vector2, Vector3 } from 'three';
import { MURAL, PIGMENTS } from './layout.js';
import { pigmentIndex } from './mural.js';

/**
 * 「重彩」敷彩交互。
 *
 * 设计约束（见《卷三-第一折交互规格书》）：
 *   1. 顺着残迹描 —— 画面本身给出目标，不靠文字教程；
 *   2. 叠色兜底 —— 涂错不撤销、不报错、不扣分，覆盖重画即可；
 *   3. 双难度 —— 速成档自动铺底，全手作档全部手动；
 *   4. 提示按需出现 —— 停顿或反复尝试时才浮出；
 *   5. 不依赖鼠标 —— 键盘可独立完成。
 *
 * 进度按"笔迹在折内覆盖的横向长度 / 该折宽度"累计，与实际落色一致。
 * 本机制为艺术转译，不是壁画绘制流程或文物修复工艺的复原。
 */

const STROKE_GAIN = 1.9;      // 单位覆盖长度的进度增益
const BRUSH_RADIUS = 0.021;   // 笔尖半径（uv）
const IDLE_HINT_MS = 8000;    // 停顿多久后加强提示

export class Restorer {
  constructor({ renderer, camera, muralMesh, paintCanvas, folds, palette, onEvent }) {
    this.renderer = renderer;
    this.camera = camera;
    this.mesh = muralMesh;
    this.paint = paintCanvas;
    this.folds = folds;
    this.onEvent = onEvent ?? (() => {});

    this.raycaster = new Raycaster();
    this.ndc = new Vector2();
    this.hit = new Vector3();
    this.prevUv = null;

    this.palette = palette;
    this.pigment = palette[0]?.id ?? null;

    this.progress = folds.map(() => 0);
    this.index = 0;
    this.speed = 'gentle';
    this.dragging = false;
    this.lastHint = performance.now();
    this.hover = 0;

    this.bound = {
      down: (e) => this.onDown(e),
      move: (e) => this.onMove(e),
      up: () => this.onUp(),
      key: (e) => this.onKey(e),
    };
  }

  get fold() {
    return this.folds[this.index];
  }

  get done() {
    return this.progress.filter((p) => p >= 1).length;
  }

  get allDone() {
    return this.progress.every((p) => p >= 1);
  }

  attach(el) {
    el.addEventListener('pointerdown', this.bound.down);
    window.addEventListener('pointermove', this.bound.move);
    window.addEventListener('pointerup', this.bound.up);
    window.addEventListener('keydown', this.bound.key);
  }

  detach(el) {
    el.removeEventListener('pointerdown', this.bound.down);
    window.removeEventListener('pointermove', this.bound.move);
    window.removeEventListener('pointerup', this.bound.up);
    window.removeEventListener('keydown', this.bound.key);
  }

  /** 速成档：进入某折时预铺底色。
   *  基线压得较低（0.20），以免一进入就完成近半，削弱敷彩的成就感。 */
  seedGentle() {
    if (this.speed !== 'gentle') return;
    const base = 0.2;
    this.progress = this.progress.map((p, i) =>
      i === this.index ? Math.max(p, base) : Math.max(p, base * 0.6),
    );
    this.sync();
  }

  setFold(i) {
    this.index = Math.max(0, Math.min(this.folds.length - 1, i));
    this.prevUv = null;
    this.lastHint = performance.now();
    if (this.speed === 'gentle') this.seedGentle();
    this.sync();
    this.onEvent({ type: 'fold', index: this.index, fold: this.fold });
  }

  setSpeed(speed) {
    this.speed = speed === 'full' ? 'full' : 'gentle';
    if (this.speed === 'gentle') this.seedGentle();
    this.onEvent({ type: 'speed', speed: this.speed });
  }

  setPigment(id) {
    if (!this.palette.some((p) => p.id === id)) return;
    this.pigment = id;
    this.sync();
    this.onEvent({ type: 'pigment', id });
  }

  cyclePigment(step) {
    const i = this.palette.findIndex((p) => p.id === this.pigment);
    const n = this.palette.length;
    this.setPigment(this.palette[(i + step + n) % n].id);
  }

  // ---- 指针 ----

  onDown(e) {
    this.dragging = true;
    this.prevUv = null;
    this.paintAt(e);
  }

  onUp() {
    this.dragging = false;
    this.prevUv = null;
  }

  onMove(e) {
    if (!this.dragging) {
      this.trackHover(e);
      return;
    }
    this.paintAt(e);
  }

  trackHover(e) {
    const hit = this.pickFrom(e);
    if (!hit) {
      this.hover = 0;
      this.sync();
      return;
    }
    const where = this.foldAt(hit.uv.x);
    this.hover = where === this.index ? 1 : 0.3;
    this.sync();
  }

  paintAt(e) {
    const hit = this.pickFrom(e);
    if (!hit) return;
    const u = hit.uv.x;
    const v = hit.uv.y;

    const index = pigmentIndex(this.pigment);
    const where = this.foldAt(u);
    const amount = where === this.index ? 0.46 : 0.16;
    this.paint?.stamp({ x: u, y: v }, this.prevUv, index, amount);

    // 笔迹在折内的横向覆盖量
    const du = this.prevUv ? Math.abs(u - this.prevUv.x) : BRUSH_RADIUS;
    const footprint = Math.min(0.06, du + BRUSH_RADIUS);
    this.prevUv = { x: u, y: v };
    this.apply(u, footprint);
  }

  /**
   * 累积进度并发出事件。与「落色」分开，便于测试与复用。
   * @param {number} u 落色位置（壁画 uv.x）
   * @param {number} footprint 本笔在横向上覆盖的长度（uv）
   */
  apply(u, footprint = BRUSH_RADIUS) {
    const where = this.foldAt(u);
    const fold = this.folds[where];
    const foldWidth = Math.max(1e-6, fold.u1 - fold.u0);
    const gain = (footprint / foldWidth) * STROKE_GAIN;
    const scaled = where === this.index ? gain : gain * 0.2;

    const before = this.progress[where];
    const next = Math.min(1, before + scaled);
    this.progress[where] = next;

    this.lastHint = performance.now();
    this.hover = where === this.index ? 1 : 0.3;
    this.sync();

    if (where !== this.index) {
      this.onEvent({
        type: 'off-target',
        index: where,
        message: '这一段不是本折的范围 —— 回到高亮处继续。',
      });
      return next;
    }
    if (before < 1 && next >= 1) {
      this.onEvent({ type: 'fold-done', index: where, fold });
      if (this.allDone) this.onEvent({ type: 'all-done' });
    } else if (before >= 1) {
      // 已完成的区段继续落笔：不重复报完成，避免提示反复弹出
      this.onEvent({ type: 'paint-done', index: where });
    } else {
      this.onEvent({ type: 'paint', index: where, progress: next });
    }
    return next;
  }

  pickFrom(e) {
    const el = this.renderer?.domElement;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.mesh, false);
    return hits.length ? hits[0] : null;
  }

  foldAt(u) {
    return foldIndexForU(u, this.folds);
  }

  // ---- 键盘 ----

  onKey(e) {
    const n = this.palette.length;
    if (e.key >= '1' && e.key <= String(Math.min(9, n))) {
      this.setPigment(this.palette[Number(e.key) - 1].id);
      e.preventDefault();
      return;
    }
    switch (e.key) {
      case '[':
      case 'q':
        this.setFold(this.index - 1);
        e.preventDefault();
        break;
      case ']':
      case 'e':
        this.setFold(this.index + 1);
        e.preventDefault();
        break;
      case 'f':
        this.setSpeed(this.speed === 'gentle' ? 'full' : 'gentle');
        e.preventDefault();
        break;
      default:
        break;
    }
  }

  /** 停顿提示：长时间没有进展且当前折未完成时浮出一次 */
  update() {
    if (this.allDone) return;
    if (performance.now() - this.lastHint > IDLE_HINT_MS) {
      this.lastHint = performance.now();
      if (this.progress[this.index] < 1) this.onEvent({ type: 'idle-hint', index: this.index });
    }
    if (!this.dragging && this.hover > 0) {
      this.hover *= 0.9;
      if (this.hover < 0.02) this.hover = 0;
    }
    this.sync();
  }

  /** 把五折进度、当前颜料与折区段同步到材质 */
  sync() {
    const m = this.mesh?.material?.uniforms;
    if (!m) return;

    // 五折进度全部上传：已敷彩的区段在切折后仍保持重彩
    m.uFold0.value = this.progress[0] ?? 0;
    m.uFold1.value = this.progress[1] ?? 0;
    m.uFold2.value = this.progress[2] ?? 0;
    m.uFold3.value = this.progress[3] ?? 0;
    m.uFold4.value = this.progress[4] ?? 0;

    const rgb = pigmentRgbOf(this.pigment);
    m.uPigmentR.value = rgb[0];
    m.uPigmentG.value = rgb[1];
    m.uPigmentB.value = rgb[2];
    m.uHover.value = this.hover;
    m.uHoverU0.value = this.fold.u0;
    m.uHoverU1.value = Math.min(1, this.fold.u1);
  }

  /** 编辑模式：所有区段按各自进度显示（供整幅回看） */
  syncAll() {
    const m = this.mesh?.material?.uniforms;
    if (!m) return;
    m.uHoverU0.value = 0;
    m.uHoverU1.value = 0;
    m.uHover.value = 0;
  }

  snapshot() {
    return {
      index: this.index,
      speed: this.speed,
      pigment: this.pigment,
      progress: [...this.progress],
      done: this.done,
    };
  }
}

/** 落在壁画范围之外的 u 会被夹紧，避免边界抖动 */
export function foldIndexForU(u, folds) {
  const t = Math.min(0.999999, Math.max(0, u));
  for (let i = 0; i < folds.length; i++) {
    if (t >= folds[i].u0 && t < folds[i].u1) return i;
  }
  return folds.length - 1;
}

/** 兼容旧名（导览组件与测试共用） */
export const foldForU = foldIndexForU;

function pigmentRgbOf(id) {
  const hex = PIGMENTS.find((p) => p.id === id)?.hex ?? '#3f6f92';
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const RESTORE_TUNING = { STROKE_GAIN, BRUSH_RADIUS, IDLE_HINT_MS };
