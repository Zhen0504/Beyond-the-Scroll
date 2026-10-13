import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  FOLDS, MURAL, PIGMENTS, PIGMENT_KEYS, uToX, stopsForFold,
} from '../src/scenes/world/fuwang/layout.js';
import {
  SHAPES, SHAPES_BY_FOLD, MASK_SLOTS, MASK_SLOT_W, MASK_SLOT_H,
  foldShapes, shapesFor, shapeAt,
} from '../src/scenes/world/fuwang/shapes.js';
import {
  Restorer, foldForU, pigmentName, MAX_ACTIVE_SHAPES,
} from '../src/scenes/world/fuwang/restore.js';
import { CHAPTERS } from '../src/scenes/world/fuwang/story.js';
import { FOLD_QUOTES, PROJECT_NOTICE } from '../src/scenes/world/fuwang/quotes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/* ================= 折区段与机位 ================= */

test('五折的 u 区间首尾相接，覆盖整幅横卷且不重叠', () => {
  assert.equal(FOLDS[0].u0, 0);
  for (let i = 1; i < FOLDS.length; i++) {
    assert.equal(FOLDS[i].u0, FOLDS[i - 1].u1, `第 ${i + 1} 折起点应接上前一折终点`);
  }
  assert.equal(FOLDS[FOLDS.length - 1].u1, 1);
  for (const f of FOLDS) assert.ok(f.u1 > f.u0, `${f.name} 区间应为正`);
});

test('每折机位对准本折区段', () => {
  for (const f of FOLDS) {
    const wantX = uToX((f.u0 + f.u1) / 2);
    assert.ok(Math.abs(f.camera[0] - wantX) < 1e-6, `${f.name} 机位应正对本折中心`);
    assert.ok(Math.abs(f.target[0] - wantX) < 1e-6, `${f.name} 注视点应落在本折中心`);
    assert.equal(f.target[2], MURAL.z);
  }
});

test('机位距离与折宽成正比，可视横跨足以容纳本折', () => {
  const PER_DIST = 0.1577;   // 实测标定
  for (const f of FOLDS) {
    assert.ok(f.dist * PER_DIST >= (f.u1 - f.u0) * 1.05, `${f.name} 可视横跨应大于折宽`);
    assert.ok(f.dist > 0.5 && f.dist < 4);
  }
});

test('stopsForFold 对任意区间都给出有效机位', () => {
  for (const [a, b] of [[0, 0.05], [0, 1], [0.9, 1], [0.5, 0.51]]) {
    const s = stopsForFold(a, b);
    assert.equal(s.camera.length, 3);
    assert.ok(Number.isFinite(s.dist) && s.dist > 0);
    assert.ok(s.camera[2] > MURAL.z);
  }
});

test('foldForU 能把任意位置映射到正确的折，且不越界', () => {
  assert.equal(foldForU(0, FOLDS), 0);
  assert.equal(foldForU(0.999999, FOLDS), FOLDS.length - 1);
  assert.equal(foldForU(-5, FOLDS), 0);
  assert.equal(foldForU(9, FOLDS), FOLDS.length - 1);
  for (const [i, f] of FOLDS.entries()) {
    assert.equal(foldForU((f.u0 + f.u1) / 2, FOLDS), i);
  }
});

/* ================= 形体（认形敷彩的依据） ================= */

test('蒙版图集与形体表齐备，槽位无冲突', () => {
  const png = join(ROOT, 'public', 'paintings', 'fuwang-bensheng', 'masks.png');
  assert.ok(existsSync(png), '缺少蒙版图集 masks.png —— 需先跑 tools/build_shapes.py');

  const used = new Set();
  for (const s of SHAPES) {
    assert.ok(s.slot >= 0 && s.slot < MASK_SLOTS, `${s.id} 槽位越界：${s.slot}`);
    assert.ok(!used.has(s.slot), `${s.id} 槽位 ${s.slot} 与其它形体冲突`);
    used.add(s.slot);
  }
  assert.ok(SHAPES.length >= 12, `形体数过少（${SHAPES.length}）`);
  assert.equal(MASK_SLOT_W, 128);
  assert.equal(MASK_SLOT_H, 64);
});

test('每个形体都有明确说明、颜料、包围盒，且包围盒非退化', () => {
  for (const s of SHAPES) {
    assert.ok(s.id && s.fold && s.what, `${JSON.stringify(s)} 缺少标识或说明`);
    assert.ok(PIGMENT_KEYS.includes(s.p), `${s.id} 颜料须在颜料盘内`);
    assert.ok(s.what.length >= 2, `${s.id} 要说明画面上是什么（当前「${s.what}」）`);
    const [u0, v0, u1, v1] = s.box;
    assert.ok(u1 > u0 && v1 > v0, `${s.id} 包围盒必须非退化`);
    assert.ok(u0 >= 0 && u1 <= 1 && v0 >= 0 && v1 <= 1, `${s.id} 包围盒须在画幅内`);
  }
});

test('形体落在所属折的区间内（否则本折机位看不到、点不着）', () => {
  for (const f of FOLDS) {
    for (const s of foldShapes(f.id)) {
      assert.ok(
        s.box[0] >= f.u0 - 1e-6 && s.box[2] <= f.u1 + 1e-6,
        `${f.name}/${s.what} 超出本折区间 [${f.u0}, ${f.u1}]（该形体 u ${s.box[0]}–${s.box[2]}）`,
      );
    }
  }
});

test('每一折都有形体，且都用到至少三种颜色', () => {
  for (const f of FOLDS) {
    const list = foldShapes(f.id);
    assert.ok(list.length >= 3, `${f.name} 只有 ${list.length} 个形体，过少`);
    const kinds = new Set(list.map((s) => s.p));
    assert.ok(kinds.size >= 3, `${f.name} 只用到 ${kinds.size} 种颜色，过少`);
  }
});

test('四种矿物色都被用到，不会有点了没处敷的颜色', () => {
  const used = new Set(SHAPES.map((s) => s.p));
  for (const key of PIGMENT_KEYS) {
    assert.ok(used.has(key), `${pigmentName(key)} 从未被任何形体使用 —— 观众点了会困惑`);
  }
});

test('单折形体数不超过着色器上限', () => {
  for (const f of FOLDS) {
    const list = foldShapes(f.id);
    assert.ok(
      list.length <= 32,
      `${f.name} 有 ${list.length} 个形体，过多会让同时高亮超出预期`,
    );
  }
});

test('shapesFor / shapeAt 正确筛选', () => {
  const f = FOLDS[2];
  const q = shapesFor(f.id, 'shilv');
  assert.ok(q.length >= 1);
  assert.ok(q.every((s) => s.p === 'shilv'));
  assert.deepEqual(shapesFor('no-such-fold', 'shilv'), []);

  const s0 = foldShapes(f.id)[0];
  const cx = (s0.box[0] + s0.box[2]) / 2;
  const cy = (s0.box[1] + s0.box[3]) / 2;
  assert.equal(shapeAt(f.id, cx, cy)?.id, s0.id);
  assert.equal(shapeAt(f.id, -1, -1), null);
});

/* ================= 叙事与释文 ================= */

test('每一折都有叙事、机位与释文', () => {
  assert.equal(CHAPTERS.length, FOLDS.length);
  for (const c of CHAPTERS) {
    assert.ok(c.intro && c.intro.length > 4, `${c.name} 缺少引言`);
    assert.ok(c.enter, `${c.name} 缺少入场按钮文案`);
    assert.ok(Array.isArray(c.stops) && c.stops.length >= 2);
    for (const s of c.stops) {
      assert.equal(s.camera.length, 3);
      assert.ok(s.note, `${c.name}/${s.title} 缺少依据说明`);
      assert.ok(s.camera[2] > MURAL.z);
    }
    assert.ok(Array.isArray(c.quotes) && c.quotes.length >= 1, `${c.name} 缺少释文`);
  }
});

test('每折的停点都对准本折区段', () => {
  const PER_DIST = 0.1577;
  for (const c of CHAPTERS) {
    for (const s of c.stops) {
      const centre = s.camera[0] / MURAL.width + 0.5;
      assert.ok(centre > c.u0 - 0.05 && centre < c.u1 + 0.05, `${c.name}/${s.title} 视线偏离本折`);
      assert.ok(s.camera[2] * PER_DIST > (c.u1 - c.u0) * 0.6, `${c.name}/${s.title} 可视范围过窄`);
    }
  }
});

test('释文逐条带出处链接，且指向敦煌研究院站点', () => {
  const all = Object.values(FOLD_QUOTES).flat();
  assert.ok(all.length >= 5);
  for (const q of all) {
    assert.ok(q.quoted && q.quoted.length > 10);
    assert.ok(q.credit.includes('敦煌研究院网站'), `出处须写明「敦煌研究院网站」：${q.credit}`);
    assert.match(q.url, /^https?:\/\/(www\.)?(dha\.ac\.cn|dunhuangcaves\.org)/);
  }
});

test('本项目创作声明齐备，且未使用「官方」类表述', () => {
  assert.ok(PROJECT_NOTICE.title);
  const blob = PROJECT_NOTICE.body.join('');
  assert.ok(blob.includes('艺术转译'));
  assert.ok(blob.includes('非敦煌研究院的官方解读或认可'));
});

/* ================= 认形敷彩 ================= */

function makeUniforms() {
  return {
    uPigmentR: { value: 0 },
    uPigmentG: { value: 0 },
    uPigmentB: { value: 0 },
    uHover: { value: 0 },
    uOnTarget: { value: 0 },
    uHoverU0: { value: 0 },
    uHoverU1: { value: 1 },
    uFold0: { value: 0 },
    uFold1: { value: 0 },
    uFold2: { value: 0 },
    uFold3: { value: 0 },
    uFold4: { value: 0 },
    uBrushSize: { value: 0 },
    uShapeBounds: {
      value: Array.from({ length: MAX_ACTIVE_SHAPES }, () => ({
        x: 0, y: 0, z: 0, w: 0,
        set(a, b, c, d) { this.x = a; this.y = b; this.z = c; this.w = d; },
      })),
    },
    uShapeSlot: { value: new Array(MAX_ACTIVE_SHAPES).fill(0) },
  };
}

function makeRestorer() {
  const uniforms = makeUniforms();
  const events = [];
  const fills = [];
  let clears = 0;
  const canvas = {
    clear: () => { clears += 1; },
    fillShape: (s, idx) => fills.push([s.id, idx]),
    snapshot: () => ({ id: ++clears }),
    restore: () => true,
  };
  const r = new Restorer({
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } },
    camera: {},
    muralMesh: { material: { uniforms } },
    paintCanvas: canvas,
    folds: FOLDS,
    palette: PIGMENTS,
    onEvent: (e) => events.push(e),
  });
  return { r, uniforms, events, fills, canvas, clearCount: () => clears };
}

/** 在屏幕上点中某个形体的中心 */
function clickShape(r, shape) {
  const cx = (shape.box[0] + shape.box[2]) / 2;
  const cy = (shape.box[1] + shape.box[3]) / 2;
  r.pickFrom = () => ({ uv: { x: cx, y: cy } });
  return r.paintAt({ clientX: 50, clientY: 50 });
}

test('点中形体即整体敷彩（一下就好，不需要涂抹）', () => {
  const { r, events } = makeRestorer();
  r.setFold(0);
  const s = foldShapes(FOLDS[0].id)[0];
  assert.equal(r.isFilled(s.id), false);
  assert.equal(clickShape(r, s), true, '点中形体应返回已敷彩');
  assert.equal(r.isFilled(s.id), true, '形体应记为已敷彩');
  assert.ok(
    events.some((e) => e.type === 'shape-done' && e.shape.id === s.id),
    '应发出 shape-done 事件',
  );
});

test('同一形体不会被重复敷彩', () => {
  const { r, events } = makeRestorer();
  r.setFold(0);
  const s = foldShapes(FOLDS[0].id)[0];
  clickShape(r, s);
  const n = events.length;
  assert.equal(clickShape(r, s), false, '已敷彩的形体不应再次生效');
  assert.ok(events.slice(n).some((e) => e.type === 'already'), '应提示已敷过');
});

test('点空处不敷彩', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const list = foldShapes(FOLDS[0].id);
  // 找一个不在任何形体包围盒内的点
  const inside = (u, v) => list.some(
    (s) => u >= s.box[0] && u <= s.box[2] && v >= s.box[1] && v <= s.box[3],
  );
  let pt = null;
  for (let u = 0.005; u < 1 && !pt; u += 0.005) {
    for (let v = 0.99; v > 0; v -= 0.01) {
      if (!inside(u, v)) { pt = { x: u, y: v }; break; }
    }
  }
  assert.ok(pt, '应存在空白处');
  r.pickFrom = () => ({ uv: pt });
  assert.equal(r.paintAt({ clientX: 50, clientY: 50 }), false);
  assert.equal(r.filled.size, 0);
});

test('进度按「已敷彩形体数 / 本折形体数」计', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const list = foldShapes(FOLDS[0].id);
  assert.equal(r.progress[0], 0);
  clickShape(r, list[0]);
  assert.ok(Math.abs(r.progress[0] - 1 / list.length) < 1e-9, '一处即 1/N');
  for (const s of list.slice(1)) clickShape(r, s);
  assert.equal(r.progress[0], 1, '全部敷完应为 100%');
  assert.ok(r.done >= 1);
});

test('一折敷完发 fold-done；五折全完发 all-done', () => {
  const { r, events } = makeRestorer();
  for (const [fi, f] of FOLDS.entries()) {
    r.setFold(fi);
    for (const s of foldShapes(f.id)) clickShape(r, s);
  }
  assert.ok(r.allDone, '五折全部敷完应完成');
  assert.ok(events.some((e) => e.type === 'fold-done'));
  assert.ok(events.some((e) => e.type === 'all-done'));
});

test('敷彩会重绘累积贴图：每个形体各写一次', () => {
  const { r, fills } = makeRestorer();
  r.setFold(0);
  const list = foldShapes(FOLDS[0].id);
  clickShape(r, list[0]);
  clickShape(r, list[1]);
  // 重绘是「清空后按集合重画」，所以第二次应写入两个形体
  assert.ok(fills.filter((x) => x[0] === list[0].id).length >= 1);
  assert.ok(fills.filter((x) => x[0] === list[1].id).length >= 1);
});

test('撤销：退回上一次敷彩，且状态与画面一起回退', () => {
  const { r, events, clearCount } = makeRestorer();
  r.setFold(0);
  const list = foldShapes(FOLDS[0].id);

  clickShape(r, list[0]);
  clickShape(r, list[1]);
  assert.equal(r.filled.size, 2);
  const beforeClear = clearCount();

  assert.equal(r.undo(), true);
  assert.equal(r.filled.size, 1, '撤销后应少一个形体');
  assert.ok(clearCount() > beforeClear, '撤销应重绘累积贴图');
  assert.ok(events.some((e) => e.type === 'undo'));

  r.undo();
  assert.equal(r.filled.size, 0);
  assert.equal(r.undo(), false, '没有可撤销的应返回 false');
  assert.ok(events.some((e) => e.type === 'undo-empty'));
});

test('撤销栈有上限', () => {
  const { r } = makeRestorer();
  let n = 0;
  for (const [fi, f] of FOLDS.entries()) {
    r.setFold(fi);
    for (const s of foldShapes(f.id)) {
      clickShape(r, s);
      n += 1;
    }
  }
  assert.ok(n > 12, '总共应有超过 12 个形体');
  assert.ok(r.undoStack.length <= 12, `撤销栈应受限（实为 ${r.undoStack.length}）`);
});

test('已敷彩的形体不再交给着色器高亮', () => {
  const { r, uniforms } = makeRestorer();
  r.setFold(0);
  const list = foldShapes(FOLDS[0].id);
  const active0 = uniforms.uShapeBounds.value.filter((b) => b.z > 0).length;
  assert.ok(active0 > 0, '初始应有形体参与高亮');
  for (const s of list) clickShape(r, s);
  const active1 = uniforms.uShapeBounds.value.filter((b) => b.z > 0).length;
  assert.equal(active1, 0, '本折敷完后不应再有高亮');
});

test('当前颜料的形体排在高亮队列前面', () => {
  const { r, uniforms } = makeRestorer();
  r.setFold(0);
  const mine = shapesFor(FOLDS[0].id, 'shilv');
  assert.ok(mine.length >= 1);
  r.setPigment('shilv');
  const slot0 = uniforms.uShapeSlot.value[0];
  assert.equal(slot0, mine[0].slot, '首位应是当前颜料的形体');
});

test('键盘：数字择色、Q/E 换折、Z 撤销', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const s = foldShapes(FOLDS[0].id)[0];
  clickShape(r, s);
  assert.equal(r.undoStack.length, 1);

  r.onKey({ key: '2', preventDefault() {} });
  assert.equal(r.pigment, PIGMENTS[1].id);

  r.setFold(1);
  r.onKey({ key: 'e', preventDefault() {} });
  assert.equal(r.index, 2, 'E 应前进一折');
  r.onKey({ key: 'q', preventDefault() {} });
  assert.equal(r.index, 1, 'Q 应后退一折');

  r.setFold(0);
  r.onKey({ key: 'z', preventDefault() {} });
  assert.equal(r.filled.size, 0, 'Z 应撤销');

  assert.doesNotThrow(() => r.onKey({ key: 'q', preventDefault() {} }));
  assert.equal(r.index, 0, '第一折不应再后退');
});

test('完成状态可序列化，便于核验与留档', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  clickShape(r, foldShapes(FOLDS[0].id)[0]);
  const snap = r.snapshot();
  assert.equal(typeof snap.index, 'number');
  assert.equal(snap.progress.length, FOLDS.length);
  assert.equal(typeof snap.undoDepth, 'number');
  assert.ok(Array.isArray(snap.filled) && snap.filled.length === 1);
  assert.ok(Array.isArray(snap.pending) && snap.pending.length >= 1);
  assert.ok(JSON.stringify(snap).length > 0);
});

test('全部进度上传材质，切折后已完成区段保持重彩', () => {
  const { r, uniforms } = makeRestorer();
  for (const [fi, f] of FOLDS.entries()) {
    r.setFold(fi);
    for (const s of foldShapes(f.id)) clickShape(r, s);
  }
  assert.ok(uniforms.uFold0.value >= 1);
  assert.ok(uniforms.uFold4.value >= 1);
  r.setFold(0);
  assert.ok(uniforms.uFold0.value >= 1, '切折后第一折仍应保持重彩');
  assert.equal(uniforms.uHoverU0.value, FOLDS[0].u0);
});

/* ================= 素材与授权 ================= */

test('素材与授权说明随包发布，含公有领域与释文出处', () => {
  const file = join(ROOT, 'public', 'paintings', 'fuwang-bensheng', 'attribution.json');
  const rec = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(rec.imageLicense);
  assert.ok(rec.sourceFilePage);
  assert.ok(rec.textSource.includes('敦煌研究院网站'));
  assert.ok(rec.notice.includes('艺术转译'));
});
