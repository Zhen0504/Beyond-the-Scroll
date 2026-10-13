import { Raycaster, Vector2, Vector3 } from 'three';
import { MURAL, PIGMENTS } from './layout.js';
import { pigmentIndex } from './mural.js';
import { FOLD_REGIONS, MAX_TARGETS, regionsFor } from './regions.js';

/**
 * 「重彩」敷彩交互。
 *
 * 观感目标（依使用反馈多轮修订）：
 *   1. 选一种矿物色 → 画面上只有**具体的那几处**发光（对应可辨认的画面内容，
 *      如「九色鹿身躯」「国王的黑马」），其余压暗；
 *   2. 必须用鼠标在发光处涂抹；笔迹连续跟随指针，单击即落一点，按住拖动即成笔路；
 *   3. 进度按各目标区**面积覆盖率**计算，必须真的涂满；
 *   4. 可撤销；
 *   5. 笔刷大小可由观众自行调整。
 *
 * 本机制为艺术转译，不是壁画绘制流程或文物修复工艺的复原。
 */

/** 进度网格的格边长（壁画 uv）。越小越精细，也越费笔。 */
const CELL = 0.008;
const IDLE_HINT_MS = 9000;
const UNDO_LIMIT = 3;

/** 笔刷大小的可选范围（uv 半径），以及档位 */
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
    this.brushStretch = 1.5;   // 画幅极宽，笔尖略作横向拉伸

    /** 每个目标区一份覆盖网格（按区尺寸动态划分） */
    this.grids = folds.map((f) =>
      (FOLD_REGIONS[f.id] ?? []).map((r) => makeGrid(r)),
    );

    this.index = 0;
    this.hover = 0;
    this.onTarget = 0;
    this.dragging = false;
    this.prevUv = null;
    this.lastHint = performance.now();

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

  /** 每个目标区当前的覆盖进度（0..1） */
  regionProgressAt(foldIdx, regionIdx) {
    const grid = this.grids[foldIdx]?.[regionIdx];
    if (!grid) return 0;
    let lit = 0;
    for (let i = 0; i < grid.cells.length; i++) if (grid.cells[i]) lit += 1;
    return lit / grid.cells.length;
  }

  /** 本折完成度 = 各目标区覆盖率的平均值 */
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

  /** 当前颜料在本折的目标区（矩形） */
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

  /** 调整笔刷大小（uv 半径） */
  setBrush(size) {
    const v = Math.max(BRUSH_MIN, Math.min(BRUSH_MAX, Number(size) || DEFAULT_BRUSH));
    this.brush = v;
    this.sync();
    this.onEvent({ type: 'brush', size: v });
    return v;
  }

  // ---- 撤销 ----

  beginStroke() {
    if (!this.paint?.snapshot) return;
    this.undoStack.push(this.paint.snapshot());
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

  /** 撤销后按比例熄掉一部分格 */
  rollbackProgress() {
    const grids = this.grids[this.index];
    if (!grids) return;
    for (let i = grids.length - 1; i >= 0; i--) {
      const cells = grids[i].cells;
      let lit = 0;
      for (let k = 0; k < cells.length; k++) if (cells[k]) lit += 1;
      if (!lit) continue;
      const toClear = Math.max(1, Math.round(lit * 0.3));
      let cleared = 0;
      for (let k = cells.length - 1; k >= 0 && cleared < toClear; k--) {
        if (cells[k]) {
          cells[k] = 0;
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
    this.beginStroke();
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
      this.onTarget = 0;
      this.sync();
      return;
    }
    this.onTarget = this.regionAt(hit.uv) ? 1 : 0;
    this.sync();
  }

  /** 命中哪个目标区（返回下标，未命中返回 -1） */
  regionAt({ x, y }) {
    const list = FOLD_REGIONS[this.fold.id] ?? [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.p !== this.pigment) continue;
      if (x >= r.u0 && x <= r.u1 && y >= r.v0 && y <= r.v1) return i;
    }
    return -1;
  }

  paintAt(e) {
    const hit = this.pickFrom(e);
    if (!hit) return;
    const p = { x: hit.uv.x, y: hit.uv.y };

    const ri = this.regionAt(p);
    if (ri < 0) {
      this.onEvent({
        type: 'off-target',
        message: this.targets.length
          ? '这一处不需要这种颜色 —— 请涂在发光的地方。'
          : `本折不用${pigmentName(this.pigment)} —— 换一种颜色试试。`,
      });
      this.prevUv = p;
      return;
    }

    // 落色：与上一笔之间连成一段，笔路连续（跟随指针）
    const from = this.prevUv ?? p;
    this.stampSegment(from, p);
    this.prevUv = p;
    this.advanceSegment(ri, from, p);
  }

  /**
   * 沿线段连续落笔，使笔迹跟随指针而不是散点。
   * 单击时 n = 1，落一笔，立刻可见 —— 符合"鼠标左键单击即上色"。
   */
  stampSegment(from, to) {
    const stretch = this.brushStretch;
    const dist = Math.hypot((to.x - from.x) * stretch, to.y - from.y);
    const step = Math.max(this.brush * 0.5, 1e-4);
    const n = Math.max(1, Math.min(64, Math.ceil(dist / step)));
    const index = pigmentIndex(this.pigment);
    let prev = from;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const p = {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      };
      this.paint?.stamp(p, prev, index, 0.5, { radius: this.brush, stretch });
      prev = p;
    }
  }

  /**
   * 把线段覆盖到的格点亮。
   * 每个采样点按**笔尖大小的方形**点亮（不是一条线），
   * 这样单击也会留下一小片颜色，拖动时宽度也符合笔刷大小。
   */
  advanceSegment(rigIdx, from, to) {
    const list = FOLD_REGIONS[this.fold.id] ?? [];
    const r = list[rigIdx];
    const grid = this.grids[this.index][rigIdx];
    if (!r || !grid) return;

    const before = this.regionProgressAt(this.index, rigIdx);
    const half = this.brush * this.brushStretch;
    const halfV = this.brush;

    // 预先把笔尖方形的格范围算出来，再沿线段采样（避免重复换算）
    const w = r.u1 - r.u0;
    const h = r.v1 - r.v0;
    const steps = Math.max(1, Math.min(240, Math.ceil(
      Math.hypot(to.x - from.x, to.y - from.y) / (CELL * 0.5),
    )));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;

      const ax = Math.max(r.u0, x - half);
      const bx = Math.min(r.u1, x + half);
      const ay = Math.max(r.v0, y - halfV);
      const by = Math.min(r.v1, y + halfV);
      if (bx < ax || by < ay) continue;

      const c0 = Math.max(0, Math.floor(((ax - r.u0) / w) * grid.cols));
      const c1 = Math.min(grid.cols - 1, Math.ceil(((bx - r.u0) / w) * grid.cols) - 1);
      const r0 = Math.max(0, Math.floor(((ay - r.v0) / h) * grid.rows));
      const r1 = Math.min(grid.rows - 1, Math.ceil(((by - r.v0) / h) * grid.rows) - 1);

      for (let rr = r0; rr <= r1; rr++) {
        const base = rr * grid.cols;
        for (let cc = c0; cc <= c1; cc++) grid.cells[base + cc] = 1;
      }
    }

    // 单击（没有位移）也要真正落色：直接按笔尖点一次
    if (steps <= 1 && Math.abs(to.x - from.x) < 1e-9 && Math.abs(to.y - from.y) < 1e-9) {
      lightBrush(grid, r, from.x, from.y, half, halfV);
    }

    const after = this.regionProgressAt(this.index, rigIdx);
    this.onTarget = 1;
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

  /**
   * 同步到材质。引导高亮**常驻**，不依赖鼠标是否在画面上。
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

    m.uHover.value = 1;
    m.uOnTarget.value = this.onTarget ?? 0;
    m.uHoverU0.value = this.fold.u0;
    m.uHoverU1.value = Math.min(1, this.fold.u1);
    if (m.uBrushSize) m.uBrushSize.value = this.brush;

    // 目标矩形（最多 16 个，xy 中心 / zw 半宽半高）
    const slots = m.uTargets?.value;
    if (slots) {
      const active = this.targets.slice(0, MAX_TARGETS);
      for (let i = 0; i < slots.length; i++) {
        const r = active[i];
        if (r) {
          slots[i].set(
            (r.u0 + r.u1) / 2,
            (r.v0 + r.v1) / 2,
            Math.max(0, (r.u1 - r.u0) / 2),
            Math.max(0, (r.v1 - r.v0) / 2),
          );
        } else {
          slots[i].set(0, 0, 0, 0);
        }
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
      undoDepth: this.undoStack.length,
      targets: this.targets.map((r) => ({ p: r.p, what: r.what })),
    };
  }
}

/* ------------------------------------------------------------------ *
 *  网格辅助
 * ------------------------------------------------------------------ */

function makeGrid(r) {
  const cols = Math.max(4, Math.round(Math.abs(r.u1 - r.u0) / CELL));
  const rows = Math.max(4, Math.round(Math.abs(r.v1 - r.v0) / CELL));
  return { cols, rows, cells: new Uint8Array(cols * rows) };
}

/** 点亮以 (x,y) 为中心、半径 (halfU, halfV) 的方形所覆盖的格 */
function lightBrush(grid, r, x, y, halfU, halfV) {
  const { cols, rows, cells } = grid;
  const w = r.u1 - r.u0;
  const h = r.v1 - r.v0;
  if (w <= 0 || h <= 0) return;

  const ax = Math.max(r.u0, x - halfU);
  const bx = Math.min(r.u1, x + halfU);
  const ay = Math.max(r.v0, y - halfV);
  const by = Math.min(r.v1, y + halfV);
  if (bx < ax || by < ay) return;

  const c0 = Math.max(0, Math.floor(((ax - r.u0) / w) * cols));
  const c1 = Math.min(cols - 1, Math.ceil(((bx - r.u0) / w) * cols) - 1);
  const r0 = Math.max(0, Math.floor(((ay - r.v0) / h) * rows));
  const r1 = Math.min(rows - 1, Math.ceil(((by - r.v0) / h) * rows) - 1);

  for (let rr = r0; rr <= r1; rr++) {
    const base = rr * cols;
    for (let cc = c0; cc <= c1; cc++) cells[base + cc] = 1;
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

export const RESTORE_TUNING = {
  CELL,
  IDLE_HINT_MS,
  BRUSH_MIN,
  BRUSH_MAX,
  DEFAULT_BRUSH,
};
export { MURAL };
