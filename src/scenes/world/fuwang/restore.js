import { Raycaster, Vector2, Vector3 } from 'three';
import { MURAL, PIGMENTS } from './layout.js';
import { pigmentIndex } from './mural.js';
import { FOLD_REGIONS, regionsFor } from './regions.js';

/**
 * 「重彩」敷彩交互。
 *
 * 观感目标（依使用反馈修订）：
 *   1. 选一种矿物色 → 画面里该上这种颜色的地方发光；其他地方不发光；
 *   2. 必须用鼠标在发光处涂抹，落色只发生在笔尖，不再"一点就充实";
 *   3. 进度按「各色区已涂满的比例」计算，不是按笔迹位移 —— 涂满一格算一格；
 *   4. 可撤销，画错一笔能退回。
 *
 * 本机制为艺术转译，不是壁画绘制流程或文物修复工艺的复原。
 */

/** 涂抹推进系数（区间模型下不再使用，保留供调参参考） */
const STROKE_GAIN = 0.55;
/** 笔尖半径（uv）。画幅极宽、色区最窄约 0.023，笔宽须远小于色区 */
const BRUSH_RADIUS = 0.0012;
const BRUSH_STRETCH = 1.5;
/** 每个色区划分为多少格 —— 进度即「涂亮的格数 / 总格数」 */
const CELLS_PER_REGION = 48;
const IDLE_HINT_MS = 9000;
const UNDO_LIMIT = 3;

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

    /** 每一折：各色区的覆盖格。
     *  进度即「涂亮的格数 / 总格数」—— 必须真的把笔走过整段，来回涂抹不会虚增。 */
    this.coverage = folds.map((f) =>
      (FOLD_REGIONS[f.id] ?? []).map(() => new Uint8Array(CELLS_PER_REGION)),
    );
    this.index = 0;
    this.hover = 0;
    this.onTarget = 0;           // 指针是否正落在目标色区上
    this.dragging = false;
    this.lastU = null;           // 上一笔尖位置，用于笔迹插值
    this.lastHint = performance.now();
    this.undone = 0;             // 连续撤销的层数，用于提示
    this.strokeSnapshot = null;

    this.undoStack = [];
    this.redoStack = [];

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

  /** 某个色区当前的覆盖进度（0..1）= 涂亮的格数 / 总格数 */
  regionProgressAt(foldIdx, regionIdx) {
    const grid = this.coverage[foldIdx]?.[regionIdx];
    if (!grid) return 0;
    let lit = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i]) lit += 1;
    return lit / grid.length;
  }

  /** 本折完成度 = 各色区覆盖率的平均值 */
  get progress() {
    return this.folds.map((_, fi) => {
      const n = (FOLD_REGIONS[this.folds[fi].id] ?? []).length;
      if (!n) return 0;
      let sum = 0;
      for (let k = 0; k < n; k++) sum += this.regionProgressAt(fi, k);
      return sum / n;
    });
  }

  get done() {
    return this.progress.filter((p) => p >= 1).length;
  }

  get allDone() {
    const p = this.progress;
    return p.length > 0 && p.every((v) => v >= 1);
  }

  /** 当前颜料在本折的目标色区 */
  get targets() {
    return regionsFor(this.fold.id, this.pigment);
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
    this.prevUv = null;
    this.lastU = null;
    this.undone = 0;
    this.lastHint = performance.now();
    this.sync();
    this.onEvent({ type: 'fold', index: this.index, fold: this.fold });
  }

  /** 敷彩不再自动预铺：一切由观众的笔触决定 */
  setSpeed() {
    /* 保留接口，速成/全手作已并入统一流程 */
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

  cyclePigment(step) {
    const i = this.palette.findIndex((p) => p.id === this.pigment);
    const n = this.palette.length;
    this.setPigment(this.palette[(i + step + n) % n].id);
  }

  // ---- 撤销 ----

  /** 在落笔前留一张快照 */
  beginStroke() {
    if (!this.paint?.snapshot) return;
    const snap = this.paint.snapshot();
    this.undoStack.push(snap);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo() {
    if (!this.undoStack.length) {
      this.onEvent({ type: 'undo-empty' });
      return false;
    }
    const snap = this.undoStack.pop();
    if (this.paint?.snapshot) this.redoStack.push(this.paint.snapshot());
    this.paint?.restore(snap);
    this.rollbackProgress();
    this.sync();
    this.onEvent({ type: 'undo', remaining: this.undoStack.length });
    return true;
  }

  redo() {
    if (!this.redoStack.length) {
      this.onEvent({ type: 'redo-empty' });
      return false;
    }
    const snap = this.redoStack.pop();
    if (this.paint?.snapshot) this.undoStack.push(this.paint.snapshot());
    this.paint?.restore(snap);
    this.sync();
    this.onEvent({ type: 'redo' });
    return true;
  }

  /** 撤销后把本折覆盖格收一收，使进度与画面一致 */
  rollbackProgress() {
    const grids = this.coverage[this.index];
    if (!grids) return;
    for (let i = grids.length - 1; i >= 0; i--) {
      const g = grids[i];
      let lit = 0;
      for (let k = 0; k < g.length; k++) if (g[k]) lit += 1;
      if (!lit) continue;
      // 从右往左熄掉约三成已点亮的格
      const toClear = Math.max(1, Math.round(lit * 0.3));
      let cleared = 0;
      for (let k = g.length - 1; k >= 0 && cleared < toClear; k--) {
        if (g[k]) {
          g[k] = 0;
          cleared += 1;
        }
      }
      break;
    }
  }

  // ---- 指针 ----

  onDown(e) {
    this.dragging = true;
    this.prevUv = null;
    this.beginStroke();     // 一笔只留一次快照
    this.paintAt(e);
  }

  onUp() {
    this.dragging = false;
    this.prevUv = null;
    this.lastU = null;
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
      this.onTarget = 0;
      this.sync();
      return;
    }
    const u = hit.uv.x;
    const inFold = this.foldAt(u) === this.index;
    this.onTarget = inFold && this.isTarget(u) ? 1 : 0;
    this.sync();
  }

  /** 该位置是否属于当前颜料的目标色区 */
  isTarget(u) {
    return this.targets.some((r) => u >= r.u0 && u <= r.u1);
  }

  paintAt(e) {
    const hit = this.pickFrom(e);
    if (!hit) return;

    const u = hit.uv.x;
    const v = hit.uv.y;
    const where = this.foldAt(u);

    // 只有落在「本折 + 当前颜料的目标色区」里，才真正落色。
    // 这是"必须涂对地方"的机制，也避免观众在无关处浪费力气。
    const ok = where === this.index && this.isTarget(u);
    if (!ok) {
      this.onEvent({
        type: 'off-target',
        index: where,
        message: this.targets.length
          ? '这一处不需要这种颜色 —— 请涂在发光的地方。'
          : `本折不用${pigmentName(this.pigment)} —— 换一种颜色试试。`,
      });
      this.prevUv = { x: u, y: v };
      return;
    }

    const index = pigmentIndex(this.pigment);
    this.paint?.stamp(
      { x: u, y: v },
      this.prevUv,
      index,
      0.5,
      { radius: BRUSH_RADIUS, stretch: BRUSH_STRETCH },
    );

    // 进度只随「笔在色区里走过的距离」增长。
    // 单击（没有位移）不推进 —— 这样才有真正的涂抹过程，不会一点就充实。
    const travelled = this.prevUv ? Math.abs(u - this.prevUv.x) : 0;
    this.prevUv = { x: u, y: v };
    this.advance(u, travelled);
  }

  /**
   * 按色区记录覆盖：笔尖覆盖到的格点亮。
   * 单击只点亮笔尖宽度内的少数几格；要涂满必须真的把笔走过整段。
   */
  advance(u) {
    const list = FOLD_REGIONS[this.fold.id] ?? [];
    const grids = this.coverage[this.index];
    let hitIndex = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].p !== this.pigment) continue;
      if (u >= list[i].u0 && u <= list[i].u1) {
        hitIndex = i;
        break;
      }
    }
    if (hitIndex < 0) return;

    const r = list[hitIndex];
    const grid = grids[hitIndex];
    const before = this.regionProgressAt(this.index, hitIndex);

    // 笔尖在色区内覆盖的 u 范围 → 对应到格。
    // 笔迹在相邻两点之间是连续的，必须把整段区间都点亮，
    // 否则快速拖动会在中间留下空洞，涂不满。
    const half = BRUSH_RADIUS * BRUSH_STRETCH;
    const width = Math.max(1e-6, r.u1 - r.u0);
    const prevU = this.lastU ?? u;
    const lo = Math.max(r.u0, Math.min(prevU, u) - half);
    const hi = Math.min(r.u1, Math.max(prevU, u) + half);
    this.lastU = u;

    const i0 = Math.floor(((lo - r.u0) / width) * grid.length);
    const i1 = Math.ceil(((hi - r.u0) / width) * grid.length) - 1;
    for (let k = Math.max(0, i0); k <= Math.min(grid.length - 1, i1); k++) grid[k] = 1;

    const after = this.regionProgressAt(this.index, hitIndex);
    this.hover = 1;
    this.sync();

    if (before < 1 && after >= 1) {
      const allRegionsDone = list.every((_, k) => this.regionProgressAt(this.index, k) >= 1);
      this.onEvent({
        type: allRegionsDone ? 'fold-done' : 'region-done',
        index: this.index,
        region: r,
        fold: this.fold,
      });
      if (allRegionsDone && this.allDone) this.onEvent({ type: 'all-done' });
    } else {
      this.onEvent({ type: 'paint', index: this.index, progress: after });
    }
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
    if (!this.dragging && this.hover > 0) {
      this.hover *= 0.9;
      if (this.hover < 0.02) this.hover = 0;
    }
    this.sync();
  }

  /**
   * 把当前折、目标色区与颜料同步到材质。
   *
   * 关键：引导高亮是**常驻**的，不依赖鼠标是否移动到画面上。
   * 早先把它挂在 hover 上，导致观众不动鼠标时完全看不到「该涂哪里」。
   */
  sync() {
    const m = this.mesh?.material?.uniforms;
    if (!m) return;

    const prog = this.progress;
    m.uFold0.value = prog[0] ?? 0;
    m.uFold1.value = prog[1] ?? 0;
    m.uFold2.value = prog[2] ?? 0;
    m.uFold3.value = prog[3] ?? 0;
    m.uFold4.value = prog[4] ?? 0;

    const rgb = pigmentRgbOf(this.pigment);
    m.uPigmentR.value = rgb[0];
    m.uPigmentG.value = rgb[1];
    m.uPigmentB.value = rgb[2];

    // 常驻显示目标区；指针正落在目标上时再加一点呼吸增强
    m.uHover.value = 1;
    m.uOnTarget.value = this.onTarget ?? 0;
    m.uHoverU0.value = this.fold.u0;
    m.uHoverU1.value = Math.min(1, this.fold.u1);

    // 目标色区（最多 8 段）
    const slots = m.uTargets?.value;
    if (slots) {
      const active = this.targets;
      for (let i = 0; i < slots.length; i++) {
        const r = active[i];
        slots[i].set(r ? r.u0 : 0, r ? r.u1 : 0);
      }
    }
  }

  snapshot() {
    return {
      index: this.index,
      pigment: this.pigment,
      progress: this.progress.map((p) => +p.toFixed(3)),
      done: this.done,
      undoDepth: this.undoStack.length,
      targets: this.targets.map((r) => ({ p: r.p, u0: r.u0, u1: r.u1 })),
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

export const foldForU = foldIndexForU;

export function pigmentName(id) {
  return PIGMENTS.find((p) => p.id === id)?.name ?? id;
}

function pigmentRgbOf(id) {
  const hex = PIGMENTS.find((p) => p.id === id)?.hex ?? '#3f6f92';
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const RESTORE_TUNING = { STROKE_GAIN, BRUSH_RADIUS, BRUSH_STRETCH, IDLE_HINT_MS };
export { MURAL };
