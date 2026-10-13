import { Raycaster, Vector2, Vector3 } from 'three';
import { MURAL, PIGMENTS } from './layout.js';
import { pigmentIndex } from './mural.js';
import { MASK_SLOT_W, SHAPES, foldShapes } from './shapes.js';
/**
 * 「重彩」敷彩交互 —— 认形敷彩。
 *
 * 玩法（依使用反馈定稿）：
 *   1. 选一种矿物色 → 画面上该上这种颜色的**形体轮廓**发亮
 *      （鹿身就是鹿身的形状，不是矩形框）；
 *   2. **点一下**那个轮廓 → 整个形体自动敷上该色，并显出重彩后的样子；
 *   3. 点错了可以撤销。
 *
 * 形体蒙版由 tools/build_shapes.py 从壁画裁出（见 shapes.js 与 masks.png）。
 * 本机制是艺术转译，不是壁画绘制工序或文物修复工艺的复原。
 */

const IDLE_HINT_MS = 9000;
const UNDO_LIMIT = 12;
/** 同时参与高亮的形体上限，与着色器 uShapeBounds 数组长度一致 */
export const MAX_ACTIVE_SHAPES = 8;

export const BRUSH_MIN = 0.0012;
export const BRUSH_MAX = 0.0080;
export const DEFAULT_BRUSH = 0.0030;

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

    this.palette = palette;
    this.pigment = palette[0]?.id ?? null;
    this.brush = DEFAULT_BRUSH;

    /** 每个形体是否已敷彩 */
    this.filled = new Set();
    this.index = 0;
    this.onTarget = 0;
    this.lastHint = performance.now();

    this.undoStack = [];

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

  /** 本折的全部形体 */
  get shapes() {
    return foldShapes(this.fold.id);
  }

  /** 当前颜料在本折的形体 */
  get targets() {
    return this.shapes.filter((s) => s.p === this.pigment);
  }

  /** 本折完成度 = 已敷彩形体数 / 总形体数 */
  get progress() {
    return this.folds.map((f) => {
      const list = foldShapes(f.id);
      if (!list.length) return 0;
      let n = 0;
      for (const s of list) if (this.filled.has(s.id)) n += 1;
      return n / list.length;
    });
  }

  get done() {
    return this.progress.filter((p) => p >= 1).length;
  }

  get allDone() {
    const p = this.progress;
    return p.length > 0 && p.every((v) => v >= 1);
  }

  /** 该形体是否已敷彩 */
  isFilled(id) {
    return this.filled.has(id);
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

  setFold(i) {
    this.index = Math.max(0, Math.min(this.folds.length - 1, i));
    this.lastHint = performance.now();
    this.sync();
    this.onEvent({ type: 'fold', index: this.index, fold: this.fold });
  }

  setPigment(id) {
    if (!this.palette.some((p) => p.id === id)) return;
    this.pigment = id;
    this.sync();
    this.onEvent({
      type: 'pigment',
      id,
      targets: this.targets,
      count: this.targets.length,
    });
  }

  /** 笔刷仅用于笔迹观感；尺寸仍可调 */
  setBrush(size) {
    const v = Math.max(BRUSH_MIN, Math.min(BRUSH_MAX, Number(size) || DEFAULT_BRUSH));
    this.brush = v;
    this.sync();
    this.onEvent({ type: 'brush', size: v });
    return v;
  }

  // ---- 敷彩 ----

  /**
   * 落笔：命中某个**当前颜料尚未敷彩**的形体 → 该形体整体敷色。
   *
   * 只认当前颜料：这样观众必须按画中该处原本的用色来敷，
   * 四种颜色才各有其用，而不是随便点。
   */
  paintAt(e) {
    const hit = this.pickFrom(e);
    if (!hit) return false;
    const shape = this.shapeAt(hit.uv.x, hit.uv.y);
    if (!shape) return false;

    if (this.filled.has(shape.id)) {
      this.onEvent({ type: 'already', shape, message: `${shape.what}已敷彩。` });
      return false;
    }
    if (shape.p !== this.pigment) {
      this.onEvent({
        type: 'wrong-pigment',
        shape,
        want: shape.p,
        message: `${shape.what}该用${pigmentName(shape.p)} —— 换一种颜色。`,
      });
      return false;
    }
    this.fillShape(shape);
    return true;
  }

  /** 按包围盒找出指针所在的形体 */
  shapeAt(u, v) {
    for (const s of this.shapes) {
      const [u0, v0, u1, v1] = s.box;
      if (u >= u0 && u <= u1 && v >= v0 && v <= v1) return s;
    }
    return null;
  }

  /**
   * 把一个形体整体敷上它对应的矿物色。
   * 蒙版决定的**轮廓**由着色器负责，这里只记「已敷彩」并重绘。
   */
  fillShape(shape) {
    const before = this.progress[this.index];
    this.undoStack.push({ id: shape.id, fold: this.index });
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();

    this.filled.add(shape.id);
    this.repaint();

    this.onTarget = 1;
    this.sync();

    const after = this.progress[this.index];
    const allHere = this.shapes.every((s) => this.filled.has(s.id));
    this.onEvent({
      type: allHere ? 'fold-done' : 'shape-done',
      shape,
      fold: this.fold,
      progress: after,
      before,
    });
    if (allHere && this.allDone) this.onEvent({ type: 'all-done' });
  }

  /**
   * 从「已敷彩形体集合」重建整张累积贴图。
   *
   * 敷彩是整块生效的，所以状态完全可以由集合重算 ——
   * 撤销因此变得可靠（不必维护像素历史）。
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

  undo() {
    const rec = this.undoStack.pop();
    if (!rec) {
      this.onEvent({ type: 'undo-empty' });
      return false;
    }
    this.filled.delete(rec.id);
    this.repaint();
    this.sync();
    this.onEvent({ type: 'undo', remaining: this.undoStack.length });
    return true;
  }

  // ---- 指针 ----

  onDown(e) {
    this.beginStroke();
    const did = this.paintAt(e);
    if (!did) this.undoStack.pop();   // 没敷上就不留撤销记录
  }

  onUp() {}

  onMove(e) {
    const hit = this.pickFrom(e);
    if (!hit) {
      if (this.onTarget !== 0) {
        this.onTarget = 0;
        this.sync();
      }
      return;
    }
    const s = this.shapeAt(hit.uv.x, hit.uv.y);
    const want = s && !this.filled.has(s.id) && s.p === this.pigment ? 1 : 0;
    if (want !== this.onTarget) {
      this.onTarget = want;
      this.sync();
    }
  }

  beginStroke() { /* 撤销记录在 fillShape 里入栈 */ }

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
    const n = this.palette.length;
    if (e.key >= '1' && e.key <= String(Math.min(9, n))) {
      this.setPigment(this.palette[Number(e.key) - 1].id);
      e.preventDefault();
      return;
    }
    switch (e.key) {
      case '[':
        this.setBrush(this.brush - 0.0006);
        e.preventDefault();
        break;
      case ']':
        this.setBrush(this.brush + 0.0006);
        e.preventDefault();
        break;
      case 'q':
        this.setFold(this.index - 1);
        e.preventDefault();
        break;
      case 'e':
        this.setFold(this.index + 1);
        e.preventDefault();
        break;
      case 'z':
      case 'Z':
        this.undo();
        e.preventDefault();
        break;
      default:
        break;
    }
  }

  update() {
    if (this.allDone) return;
    if (performance.now() - this.lastHint > IDLE_HINT_MS) {
      this.lastHint = performance.now();
      if ((this.progress[this.index] ?? 0) < 1) {
        this.onEvent({ type: 'idle-hint', index: this.index, targets: this.targets });
      }
    }
    this.sync();
  }

  /** 把当前折、当前颜料的形体蒙版同步到材质 */
  sync() {
    const m = this.mesh?.material?.uniforms;
    if (!m) return;

    const prog = this.progress;
    m.uFold0.value = prog[0] ?? 0;
    m.uFold1.value = prog[1] ?? 0;
    m.uFold2.value = prog[2] ?? 0;
    m.uFold3.value = prog[3] ?? 0;
    m.uFold4.value = prog[4] ?? 0;

    // 整幅壁画统一用当前颜料着色（每个形体各自记着自己的颜色）
    const rgb = pigmentRgbOf(this.pigment);
    m.uPigmentR.value = rgb[0];
    m.uPigmentG.value = rgb[1];
    m.uPigmentB.value = rgb[2];

    m.uHover.value = 1;
    m.uOnTarget.value = this.onTarget ?? 0;
    m.uHoverU0.value = this.fold.u0;
    m.uHoverU1.value = Math.min(1, this.fold.u1);
    if (m.uBrushSize) m.uBrushSize.value = this.brush;

    // 只高亮**当前颜料**该敷的地方 —— 换一种颜色，点亮的位置就跟着变。
    // 早先把全部未敷彩形体都点亮（只是排了个序），结果四种颜色失去意义：
    // 无论选哪个，画面上所有轮廓都在发光，随便点都能上色。
    const active = this.targets.filter((s) => !this.filled.has(s.id)).slice(0, MAX_ACTIVE_SHAPES);

    const bounds = m.uShapeBounds?.value;
    if (bounds) {
      for (let i = 0; i < bounds.length; i++) {
        const s = active[i];
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
        slots[i] = active[i] ? active[i].slot : 0;
      }
    }
  }

  snapshot() {
    return {
      index: this.index,
      pigment: this.pigment,
      brush: +this.brush.toFixed(4),
      progress: this.progress.map((p) => +p.toFixed(3)),
      done: this.done,
      filled: this.shapes.filter((s) => this.filled.has(s.id)).map((s) => s.what),
      pending: this.shapes.filter((s) => !this.filled.has(s.id)).map((s) => s.what),
      targets: this.targets.map((s) => ({ id: s.id, what: s.what, p: s.p })),
      undoDepth: this.undoStack.length,
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

function pigmentRgbOf(id) {
  const hex = PIGMENTS.find((p) => p.id === id)?.hex ?? '#3f6f92';
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const RESTORE_TUNING = {
  IDLE_HINT_MS,
  BRUSH_MIN,
  BRUSH_MAX,
  DEFAULT_BRUSH,
  MASK_SLOT_W,
  SHAPE_COUNT: SHAPES.length,
};
export { MURAL };
