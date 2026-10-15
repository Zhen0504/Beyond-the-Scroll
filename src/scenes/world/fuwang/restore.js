import { Raycaster, Vector2, Vector3 } from 'three';
import { MURAL, PIGMENTS } from './layout.js';
import { pigmentIndex } from './mural.js';
import { MASK_SLOT_W, SHAPES, foldShapes } from './shapes.js';

/**
 * 「重彩」设色交互 —— 按色调开关。
 *
 * 玩法：
 *   点一下某种矿物色 → 本折整体叠入这种色调并推进显影；
 *   再点同一种颜色 → 撤回这一层，与残损态对照。
 *
 * 为什么不做轮廓提示：
 *   壁画破损严重、颜色混杂，本就没有可靠依据指定「此处必须是某色」；
 *   提示越精确，越是在编造一个并不存在的原状。按色调整体开关则是明确的
 *   艺术转译 —— 本机制不是壁画绘制工序或文物修复工艺的复原，也与
 *   「非敦煌研究院官方解读」的声明一致。
 *
 * shapes.js 只记录每折可用色与叙事对象，供状态、进度和文字反馈使用；
 * 正常成像不读取蒙版，也不声称识别或复原原作颜料分布。
 */

/** 同时参与渲染的形体上限，与着色器 uShapeBounds 数组长度一致 */
export const MAX_ACTIVE_SHAPES = 8;

export class Restorer {
  constructor({ renderer, camera, muralMesh, paintCanvas, folds, palette, onEvent, onNavigate }) {
    this.renderer = renderer;
    this.camera = camera;
    this.mesh = muralMesh;
    this.paint = paintCanvas;
    this.folds = folds;
    this.onEvent = onEvent ?? (() => {});
    this.onNavigate = onNavigate ?? null;

    this.raycaster = new Raycaster();
    this.ndc = new Vector2();
    this.hit = new Vector3();

    this.palette = palette;
    this.index = 0;
    this.enabled = true;

    /** 已敷上的形体 id */
    this.filled = new Set();
    /** 每折独立开启的综合色层；白色与墨线也在此记录，不依赖旧形体蒙版。 */
    this.active = new Set();

    this.bound = {
      key: (e) => this.onKey(e),
    };
  }

  get fold() {
    return this.folds[this.index];
  }

  /** 本折的全部形体 */
  get shapes() {
    return foldShapes(this.fold.id);
  }

  /** 本折中属于某颜料的形体 */
  shapesOf(pigmentId) {
    return this.shapes.filter((s) => s.p === pigmentId);
  }

  colorKey(foldId, pigmentId) {
    return `${foldId}:${pigmentId}`;
  }

  /** 某颜料在本折是否已全部敷上 */
  isOn(pigmentId) {
    return this.active.has(this.colorKey(this.fold.id, pigmentId));
  }

  /** 某颜料在本折是否有一部分敷上（不该出现，仅作诊断） */
  isPartial(pigmentId) {
    const list = this.shapesOf(pigmentId);
    const n = list.filter((s) => this.filled.has(s.id)).length;
    return n > 0 && n < list.length;
  }

  /** 本折完成度 = 已显色调数 / 本折可用色调数 */
  get progress() {
    return this.folds.map((f) => {
      const active = PIGMENTS.filter((pigment) =>
        this.active.has(this.colorKey(f.id, pigment.id))).length;
      return active / PIGMENTS.length;
    });
  }

  get done() {
    return this.progress.filter((p) => p >= 1).length;
  }

  get allDone() {
    const p = this.progress;
    return p.length > 0 && p.every((v) => v >= 1);
  }

  /** 本折已经敷上的颜色种数 */
  get colorsOn() {
    return PIGMENTS.filter((p) => this.isOn(p.id)).length;
  }

  /** 本折用到的颜色种数 */
  get colorsTotal() {
    return PIGMENTS.length;
  }

  attach(el) {
    window.addEventListener('keydown', this.bound.key);
    this.target = el;
  }

  detach(el) {
    window.removeEventListener('keydown', this.bound.key);
    this.target = null;
  }

  setFold(i) {
    this.index = Math.max(0, Math.min(this.folds.length - 1, i));
    this.sync();
    this.onEvent({ type: 'fold', index: this.index, fold: this.fold });
    return this.index;
  }

  /**
   * 切换一种颜色：未敷则整体敷上，已敷则整体还原。
   * @returns {'on'|'off'|'empty'} 结果
   */
  togglePigment(pigmentId) {
    if (!this.palette.some((p) => p.id === pigmentId)) return 'empty';
    const list = this.shapesOf(pigmentId);
    const on = this.isOn(pigmentId);
    const key = this.colorKey(this.fold.id, pigmentId);
    if (on) this.active.delete(key);
    else this.active.add(key);
    for (const s of list) {
      if (on) this.filled.delete(s.id);
      else this.filled.add(s.id);
    }
    this.repaint();
    this.sync();

    this.onEvent({
      type: on ? 'color-off' : 'color-on',
      pigment: pigmentId,
      names: list.map((s) => s.what),
      fold: this.fold,
      progress: this.progress[this.index],
    });
    if (!on && this.progress[this.index] >= 1) {
      this.onEvent({ type: 'fold-done', fold: this.fold, index: this.index });
    }
    if (!on && this.allDone) this.onEvent({ type: 'all-done' });
    return on ? 'off' : 'on';
  }

  /** 只敷上（不切换），供键盘与外部调用 */
  turnOn(pigmentId) {
    if (this.isOn(pigmentId)) return false;
    return this.togglePigment(pigmentId) === 'on';
  }

  /** 全部还原 */
  resetFold() {
    const list = this.shapes;
    const keys = PIGMENTS.map((p) => this.colorKey(this.fold.id, p.id));
    if (!keys.some((key) => this.active.has(key))) return false;
    for (const key of keys) this.active.delete(key);
    for (const s of list) this.filled.delete(s.id);
    this.repaint();
    this.sync();
    this.onEvent({ type: 'fold-reset', fold: this.fold });
    return true;
  }

  /**
   * 从「已敷上的形体集合」重建整张累积贴图。
   * 敷彩是整块生效的，所以状态完全可以由集合重算 —— 不需要撤销栈。
   */
  repaint() {
    if (!this.paint?.clear) return;
    this.paint.clear();
    for (const f of this.folds) {
      for (const s of foldShapes(f.id)) {
        if (!this.filled.has(s.id)) continue;
        this.paint.fillShape(s, pigmentIndex(s.p));
      }
    }
  }

  /** 命中测试（保留，便于将来做局部交互） */
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

  onKey(e) {
    if (
      !this.enabled || e.repeat || e.ctrlKey || e.metaKey || e.altKey ||
      /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName) || e.target?.isContentEditable
    ) return;
    const n = Math.min(9, this.palette.length);
    if (e.key >= '1' && e.key <= String(n)) {
      this.togglePigment(this.palette[Number(e.key) - 1].id);
      e.preventDefault();
      return;
    }
    switch (e.key) {
      case 'q':
      case '[':
        if (this.onNavigate) this.onNavigate(Math.max(0, this.index - 1));
        else this.setFold(this.index - 1);
        e.preventDefault();
        break;
      case 'e':
      case ']':
        if (this.onNavigate) this.onNavigate(Math.min(this.folds.length - 1, this.index + 1));
        else this.setFold(this.index + 1);
        e.preventDefault();
        break;
      case 'r':
      case 'R':
        this.resetFold();
        e.preventDefault();
        break;
      default:
        break;
    }
  }

  update() {
    this.sync();
  }

  /** 把当前折的形体与进度同步到材质（不再有高亮，只用于调试通道） */
  sync() {
    const m = this.mesh?.material?.uniforms;
    if (!m) return;

    const prog = this.progress;
    m.uFold0.value = prog[0] ?? 0;
    m.uFold1.value = prog[1] ?? 0;
    m.uFold2.value = prog[2] ?? 0;
    m.uFold3.value = prog[3] ?? 0;
    m.uFold4.value = prog[4] ?? 0;

    // vec4 对应石青、石绿、朱砂、土红；vec2 对应白色层、墨线层。
    // 不要求着色器识别原壁画中的具体颜料区域。
    for (let i = 0; i < this.folds.length; i++) {
      const fold = this.folds[i];
      const layer = PIGMENTS.map((pigment) =>
        this.active.has(this.colorKey(fold.id, pigment.id)) ? 1 : 0);
      m[`uLayer${i}`]?.value?.set(...layer.slice(0, 4));
      m[`uNeutral${i}`]?.value?.set(...layer.slice(4, 6));
    }

    m.uHoverU0.value = this.fold.u0;
    m.uHoverU1.value = Math.min(1, this.fold.u1);

    // 当前折的全部形体都送进去 —— 调试通道需要；正常成像不读这些
    const list = this.shapes.slice(0, MAX_ACTIVE_SHAPES);
    const bounds = m.uShapeBounds?.value;
    if (bounds) {
      for (let i = 0; i < bounds.length; i++) {
        const s = list[i];
        if (s) {
          bounds[i].set(s.box[0], s.box[1], s.box[2] - s.box[0], s.box[3] - s.box[1]);
        } else {
          bounds[i].set(0, 0, 0, 0);
        }
      }
    }
    const slots = m.uShapeSlot?.value;
    if (slots) {
      for (let i = 0; i < slots.length; i++) {
        slots[i] = list[i] ? list[i].slot : 0;
      }
    }
    const soft = m.uShapeSoft?.value;
    if (soft) {
      for (let i = 0; i < soft.length; i++) {
        soft[i] = list[i]?.mode === 'rect' ? 1 : 0;
      }
    }
    // 正常成像下引导已关闭
    if (m.uHover) m.uHover.value = 0;
    if (m.uOnTarget) m.uOnTarget.value = 0;
  }

  snapshot() {
    return {
      index: this.index,
      progress: this.progress.map((p) => +p.toFixed(3)),
      done: this.done,
      colorsOn: this.colorsOn,
      colorsTotal: this.colorsTotal,
      on: PIGMENTS.filter((p) => this.isOn(p.id)).map((p) => p.id),
      off: PIGMENTS.filter((p) => !this.isOn(p.id)).map((p) => p.id),
      filled: this.shapes.filter((s) => this.filled.has(s.id)).map((s) => s.what),
    };
  }
}

/* ------------------------------------------------------------------ */

export function foldIndexForU(u, folds) {
  const t = Math.min(0.999999, Math.max(0, u));
  for (let i = 0; i < folds.length; i++) {
    if (t >= folds[i].u0 && t < folds[i].u1) return i;
  }
  return folds.length - 1;
}

export const foldForU = foldIndexForU;

export function pigmentName(id) {
  return PIGMENTS.find((p) => p.id === id)?.name ?? id;
}

export const RESTORE_TUNING = {
  MASK_SLOT_W,
  SHAPE_COUNT: SHAPES.length,
};
export { MURAL };
