import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  FOLDS, MURAL, PIGMENTS, PIGMENT_KEYS, uToX, stopsForFold,
} from '../src/scenes/world/fuwang/layout.js';
import {
  FOLD_REGIONS, MAX_TARGETS, regionsFor, hasRegions, regionArea, foldArea,
} from '../src/scenes/world/fuwang/regions.js';
import {
  Restorer, foldForU, pigmentName, BRUSH_MIN, BRUSH_MAX, DEFAULT_BRUSH,
} from '../src/scenes/world/fuwang/restore.js';
import { CHAPTERS } from '../src/scenes/world/fuwang/story.js';
import { FOLD_QUOTES, PROJECT_NOTICE } from '../src/scenes/world/fuwang/quotes.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ================= 折区段与机位 ================= */

test('五折的 u 区间首尾相接，覆盖整幅横卷且不重叠', () => {
  assert.equal(FOLDS[0].u0, 0);
  for (let i = 1; i < FOLDS.length; i++) {
    assert.equal(FOLDS[i].u0, FOLDS[i - 1].u1, `第 ${i + 1} 折起点应接上前一折终点`);
  }
  assert.equal(FOLDS[FOLDS.length - 1].u1, 1);
  for (const f of FOLDS) assert.ok(f.u1 > f.u0, `${f.name} 区间应为正`);
});

test('每折机位对准本折区段：视线中心与折中心一致', () => {
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
    assert.equal(s.target.length, 3);
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

/* ================= 目标区（2D 矩形） ================= */

test('每个目标区都是有效的壁画矩形（在画幅内、非退化）', () => {
  for (const [foldId, list] of Object.entries(FOLD_REGIONS)) {
    assert.ok(list.length >= 3, `${foldId} 的目标区过少`);
    assert.ok(list.length <= MAX_TARGETS, `${foldId} 的目标区超过着色器上限 ${MAX_TARGETS}`);
    for (const r of list) {
      assert.ok(PIGMENT_KEYS.includes(r.p), `${foldId}/${r.what} 颜料须在颜料盘内`);
      assert.ok(r.u1 > r.u0 && r.v1 > r.v0, `${foldId}/${r.what} 矩形必须非退化`);
      assert.ok(r.u0 >= 0 && r.u1 <= 1, `${foldId}/${r.what} 横向须在画幅内`);
      assert.ok(r.v0 >= 0 && r.v1 <= 1, `${foldId}/${r.what} 纵向须在画幅内`);
      assert.ok(r.what && r.what.length >= 2, `${foldId} 的目标区要说明画面上是什么`);
      // 目标区不应大到「一整块涂一个颜色」
      assert.ok(
        regionArea(r) < 0.16,
        `${foldId}/${r.what} 面积 ${regionArea(r).toFixed(3)} 过大，会像"一整块涂一个色"`,
      );
    }
  }
});

test('目标区落在所属折的范围内', () => {
  for (const f of FOLDS) {
    for (const r of FOLD_REGIONS[f.id] ?? []) {
      assert.ok(r.u0 >= f.u0 - 1e-6 && r.u1 <= f.u1 + 1e-6,
        `${f.name}/${r.what} 超出本折区间 [${f.u0}, ${f.u1}]`);
    }
  }
});

test('四种矿物色都被用到，不会有点了没处涂的颜色', () => {
  const used = new Set();
  for (const list of Object.values(FOLD_REGIONS)) for (const r of list) used.add(r.p);
  for (const key of PIGMENT_KEYS) {
    assert.ok(used.has(key), `${pigmentName(key)} 从未被任何目标区使用 —— 观众点了会困惑`);
  }
});

test('每一折都用到了至少三种颜色，保证"选色—找位置"的层次', () => {
  for (const f of FOLDS) {
    const kinds = new Set((FOLD_REGIONS[f.id] ?? []).map((r) => r.p));
    assert.ok(kinds.size >= 3, `${f.name} 只用到 ${kinds.size} 种颜色，过少`);
  }
});

test('每折的涂抹总量在可接受的范围内（既不太空也不太累）', () => {
  for (const f of FOLDS) {
    const a = foldArea(f.id);
    assert.ok(a > 0.05, `${f.name} 目标区总面积 ${a.toFixed(3)} 过小，没什么可涂`);
    assert.ok(a < 0.75, `${f.name} 目标区总面积 ${a.toFixed(3)} 过大，会涂得很累`);
  }
});

test('regionsFor / hasRegions 正确筛选当前颜料的目标区', () => {
  const fold = FOLDS[2];
  const q = regionsFor(fold.id, 'shiqing');
  assert.ok(q.length >= 1);
  assert.ok(q.every((r) => r.p === 'shiqing'));
  assert.ok(hasRegions(fold.id, 'shiqing'));
  assert.deepEqual(regionsFor('no-such-fold', 'shiqing'), []);
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
      assert.equal(s.target.length, 3);
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
  assert.ok(PROJECT_NOTICE.body.length >= 2);
  const blob = PROJECT_NOTICE.body.join('');
  assert.ok(blob.includes('艺术转译'));
  assert.ok(blob.includes('非敦煌研究院的官方解读或认可'));
});

/* ================= 敷彩机制 ================= */

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
    uTargets: {
      value: Array.from({ length: MAX_TARGETS }, () => ({
        x: 0, y: 0, z: 0, w: 0,
        set(a, b, c, d) { this.x = a; this.y = b; this.z = c; this.w = d; },
      })),
    },
  };
}

function makeRestorer() {
  const uniforms = makeUniforms();
  const stamped = [];
  const events = [];
  let snaps = 0;
  const canvas = {
    stamp: (...a) => stamped.push(a),
    snapshot: () => ({ id: ++snaps }),
    restore: (h) => { canvas.lastRestored = h; return true; },
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
  return { r, uniforms, events, stamped, canvas };
}

/** 在某个目标区里来回涂满（直接驱动内部接口，绕过 pointer 事件） */
function fillRegion(r, foldIdx, regionIdx, steps = 40) {
  const list = FOLD_REGIONS[FOLDS[foldIdx].id];
  const region = list[regionIdx];
  r.setFold(foldIdx);
  r.setPigment(region.p);
  const w = region.u1 - region.u0;
  const h = region.v1 - region.v0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = region.v0 + h * t;
    r.advanceSegment(regionIdx, { x: region.u0, y }, { x: region.u1, y });
  }
  return r.regionProgressAt(foldIdx, regionIdx);
}

test('选色后能报出本折该涂的位置，供界面高亮', () => {
  const { r, events } = makeRestorer();
  r.setFold(2);
  r.setPigment('shiqing');
  const ev = events.filter((e) => e.type === 'pigment').pop();
  assert.ok(ev, '换色应发出 pigment 事件');
  assert.ok(ev.count >= 1, '应报出本折石青的目标区数');
  assert.ok(ev.targets.every((t) => t.p === 'shiqing'));
  assert.ok(ev.targets.every((t) => t.what), '每个目标区都要说明画面上是什么');
});

test('引导高亮常驻：选色后 uHover 即为 1，目标矩形写入材质', () => {
  const { r, uniforms } = makeRestorer();
  r.setFold(0);
  r.setPigment('shilv');
  assert.equal(uniforms.uHover.value, 1, '引导应常驻，不能等鼠标移上来才亮');

  const want = regionsFor(FOLDS[0].id, 'shilv');
  assert.ok(want.length >= 1);
  const slot = uniforms.uTargets.value[0];
  assert.ok(Math.abs(slot.x - (want[0].u0 + want[0].u1) / 2) < 1e-9, '应写入矩形中心 x');
  assert.ok(Math.abs(slot.z - (want[0].u1 - want[0].u0) / 2) < 1e-9, '应写入半宽');
  assert.ok(slot.w > 0, '应写入半高');

  // 其余槽位清零
  assert.equal(uniforms.uTargets.value[want.length].z, 0, '多余槽位应清零');
});

test('涂满一个目标区才计为该区 100%，不影响其他区', () => {
  const { r } = makeRestorer();
  const p0 = fillRegion(r, 0, 0);
  assert.equal(p0, 1, '在区内来回涂满后应为 100%');
  assert.ok(r.regionProgressAt(0, 1) < 0.2, '未涂的区不应被推进');
  assert.ok(r.progress[0] < 1, '只涂一个区不应让整折完成');
});

test('单击即落色（一小片），但远不会充实', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  r.setPigment(list[0].p);
  const cx = (list[0].u0 + list[0].u1) / 2;
  const cy = (list[0].v0 + list[0].v1) / 2;
  r.advanceSegment(0, { x: cx, y: cy }, { x: cx, y: cy });
  const p = r.regionProgressAt(0, 0);
  assert.ok(p > 0.01, `单击应真的落下一小片颜色（实为 ${(p * 100).toFixed(1)}%）`);
  assert.ok(p < 0.15, `单击推进过多（${(p * 100).toFixed(1)}%），会失去涂抹过程`);
});

test('进度按面积覆盖：只涂一条横线远不到 100%', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  r.setPigment(list[0].p);
  const mid = (list[0].v0 + list[0].v1) / 2;
  r.advanceSegment(0, { x: list[0].u0, y: mid }, { x: list[0].u1, y: mid });
  const p = r.regionProgressAt(0, 0);
  assert.ok(p < 0.4, `只涂一条线就到了 ${(p * 100).toFixed(0)}%，覆盖率算错了`);
});

test('涂满五折全部目标区后整幅完成，并发 all-done', () => {
  const { r, events } = makeRestorer();
  for (const [fi, f] of FOLDS.entries()) {
    for (const [ri] of (FOLD_REGIONS[f.id] ?? []).entries()) fillRegion(r, fi, ri);
  }
  assert.ok(r.allDone, '五折全部涂满后应为完成');
  assert.ok(events.some((e) => e.type === 'fold-done'));
  assert.ok(events.some((e) => e.type === 'all-done'));
});

test('涂抹非目标处：不落色、不推进，并给出明确指引', () => {
  const { r, events, stamped } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];

  // 找一个本折所有目标区都未覆盖的位置（画面上缘的空白处）
  const covered = (u, v) => list.some(
    (x) => u >= x.u0 && u <= x.u1 && v >= x.v0 && v <= x.v1,
  );
  let pt = null;
  for (let u = 0.005; u < FOLDS[0].u1 && !pt; u += 0.005) {
    for (let v = 0.98; v > 0.5; v -= 0.02) {
      if (!covered(u, v)) { pt = { x: u, y: v }; break; }
    }
  }
  assert.ok(pt, '第一折应存在未被目标区覆盖的位置（用于本测试）');

  const pigmentHere = list.find((x) => x.p)?.p;
  r.setPigment(pigmentHere);
  r.pickFrom = () => ({ uv: pt });

  const n0 = stamped.length;
  const progBefore = list.map((_, i) => r.regionProgressAt(0, i));
  r.paintAt({ clientX: 50, clientY: 50 });

  assert.equal(stamped.length, n0, '不应落色到画布');
  assert.deepEqual(
    list.map((_, i) => r.regionProgressAt(0, i)),
    progBefore,
    '进度不应变化',
  );
  const off = events.find((e) => e.type === 'off-target');
  assert.ok(off, '应给出提示');
  assert.ok(
    off.message.includes('发光') || off.message.includes('换一种颜色'),
    '提示应引导去发光处或换色',
  );
});

test('涂抹目标处：落色到画布并推进该区', () => {
  const { r, stamped } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  r.setPigment(list[0].p);
  const bx = (list[0].u0 + list[0].u1) / 2;
  const by = (list[0].v0 + list[0].v1) / 2;
  r.pickFrom = () => ({ uv: { x: bx, y: by } });
  r.paintAt({ clientX: 50, clientY: 50 });

  assert.ok(stamped.length >= 1, '应落笔');
  const [uv, , index, amount, opts] = stamped[0];
  assert.ok(uv.x >= list[0].u0 - 1e-9 && uv.x <= list[0].u1 + 1e-9);
  assert.ok(uv.y >= list[0].v0 - 1e-9 && uv.y <= list[0].v1 + 1e-9);
  assert.ok(index >= 0 && index <= 1);
  assert.ok(amount > 0 && amount <= 1);
  assert.equal(opts.radius, r.brush, '笔尖半径应取当前笔刷大小');
  assert.ok(r.regionProgressAt(0, 0) > 0);
});

test('笔迹连续：一次移动会落多笔，不是散点', () => {
  const { r, stamped } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  r.setPigment(list[0].p);
  const y = (list[0].v0 + list[0].v1) / 2;
  r.pickFrom = () => ({ uv: { x: list[0].u0, y } });
  r.paintAt({ clientX: 50, clientY: 50 });      // 起点
  r.pickFrom = () => ({ uv: { x: list[0].u1, y } });
  const n0 = stamped.length;
  r.paintAt({ clientX: 50, clientY: 50 });      // 跨过整区
  assert.ok(stamped.length - n0 >= 5, `跨区移动应补足中间笔迹（实落 ${stamped.length - n0} 笔）`);
});

/* ================= 笔刷大小 ================= */

test('笔刷大小可调，且有上下限', () => {
  const { r, uniforms, events } = makeRestorer();
  assert.equal(r.brush, DEFAULT_BRUSH);
  r.setBrush(BRUSH_MAX * 10);
  assert.equal(r.brush, BRUSH_MAX, '不应超过上限');
  r.setBrush(BRUSH_MIN / 10);
  assert.equal(r.brush, BRUSH_MIN, '不应低于下限');
  assert.equal(uniforms.uBrushSize.value, r.brush, '应同步到材质');
  assert.ok(events.some((e) => e.type === 'brush'));
});

test('笔刷越大，同一笔点亮的格越多', () => {
  const small = makeRestorer();
  small.r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  small.r.setPigment(list[0].p);
  small.r.setBrush(BRUSH_MIN);
  small.r.advanceSegment(0, { x: list[0].u0 + 0.01, y: 0.3 }, { x: list[0].u0 + 0.01, y: 0.3 });
  const a = small.r.regionProgressAt(0, 0);

  const big = makeRestorer();
  big.r.setFold(0);
  big.r.setPigment(list[0].p);
  big.r.setBrush(BRUSH_MAX);
  big.r.advanceSegment(0, { x: list[0].u0 + 0.01, y: 0.3 }, { x: list[0].u0 + 0.01, y: 0.3 });
  const b = big.r.regionProgressAt(0, 0);

  assert.ok(b > a, `大笔刷应涂得更多（小 ${a.toFixed(4)} vs 大 ${b.toFixed(4)}）`);
});

/* ================= 撤销 ================= */

test('撤销：落笔前留快照，撤销后回退且可继续撤销', () => {
  const { r, canvas, events } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  r.setPigment(list[0].p);
  const y = (list[0].v0 + list[0].v1) / 2;
  r.pickFrom = () => ({ uv: { x: (list[0].u0 + list[0].u1) / 2, y } });

  for (let i = 0; i < 3; i++) {
    r.onDown({ clientX: 50, clientY: 50 });
    r.onUp();
  }
  assert.equal(r.undoStack.length, 3, '三次落笔应有三个快照');

  const progressed = r.regionProgressAt(0, 0);
  assert.ok(r.undo(), '应能撤销');
  assert.ok(canvas.lastRestored, '撤销应把画布恢复到快照');
  assert.ok(r.regionProgressAt(0, 0) < progressed, '撤销后进度应回退');
  assert.equal(r.undoStack.length, 2);

  r.undo();
  r.undo();
  assert.equal(r.undoStack.length, 0);
  assert.equal(r.undo(), false);
  assert.ok(events.some((e) => e.type === 'undo-empty'));
});

test('撤销栈有上限', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  r.setPigment(list[0].p);
  const y = (list[0].v0 + list[0].v1) / 2;
  r.pickFrom = () => ({ uv: { x: (list[0].u0 + list[0].u1) / 2, y } });
  for (let i = 0; i < 30; i++) {
    r.onDown({ clientX: 50, clientY: 50 });
    r.onUp();
  }
  assert.equal(r.undoStack.length, 3);
});

/* ================= 键盘 ================= */

test('键盘可独立完成：数字键择色、[ ] 调笔刷、Q/E 换折、Z 撤销', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  r.setPigment(list[0].p);
  const y = (list[0].v0 + list[0].v1) / 2;
  r.pickFrom = () => ({ uv: { x: (list[0].u0 + list[0].u1) / 2, y } });
  r.onDown({ clientX: 50, clientY: 50 });
  r.onUp();
  assert.equal(r.undoStack.length, 1);

  r.onKey({ key: '2', preventDefault() {} });
  assert.equal(r.pigment, PIGMENTS[1].id);

  const b0 = r.brush;
  r.onKey({ key: ']', preventDefault() {} });
  assert.ok(r.brush > b0, '] 应放大笔刷');
  r.onKey({ key: '[', preventDefault() {} });
  assert.ok(Math.abs(r.brush - b0) < 1e-9, '[ 应缩小回原值');

  r.setFold(1);
  r.onKey({ key: 'e', preventDefault() {} });
  assert.equal(r.index, 2, 'E 应前进一折');
  r.onKey({ key: 'q', preventDefault() {} });
  assert.equal(r.index, 1, 'Q 应后退一折');

  r.setFold(0);
  const depth = r.undoStack.length;
  r.onKey({ key: 'z', preventDefault() {} });
  assert.equal(r.undoStack.length, depth - 1, 'Z 应撤销一层');

  assert.doesNotThrow(() => r.onKey({ key: 'q', preventDefault() {} }));
  assert.equal(r.index, 0, '第一折不应再后退');
});

test('完成状态可序列化，便于核验与留档', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  r.setPigment(list[0].p);
  r.advanceSegment(0, { x: list[0].u0 + 0.01, y: 0.3 }, { x: list[0].u0 + 0.02, y: 0.3 });
  const snap = r.snapshot();
  assert.equal(typeof snap.index, 'number');
  assert.equal(snap.progress.length, FOLDS.length);
  assert.equal(typeof snap.brush, 'number');
  assert.equal(typeof snap.undoDepth, 'number');
  assert.ok(Array.isArray(snap.targets));
  assert.ok(JSON.stringify(snap).length > 0);
});

test('全部进度上传材质，切折后已完成区段保持重彩', () => {
  const { r, uniforms } = makeRestorer();
  for (const [fi, f] of FOLDS.entries()) {
    for (const [ri] of (FOLD_REGIONS[f.id] ?? []).entries()) fillRegion(r, fi, ri);
  }
  assert.ok(uniforms.uFold0.value >= 1);
  assert.ok(uniforms.uFold4.value >= 1);
  r.setFold(0);
  assert.ok(uniforms.uFold0.value >= 1, '切折后第一折仍应保持重彩');
  assert.equal(uniforms.uHoverU0.value, FOLDS[0].u0);
});

/* ================= 素材与授权 ================= */

test('素材与授权说明随包发布，含公有领域与释文出处', () => {
  const file = join(HERE, '..', 'public', 'paintings', 'fuwang-bensheng', 'attribution.json');
  const rec = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(rec.imageLicense);
  assert.ok(rec.sourceFilePage);
  assert.ok(rec.textSource.includes('敦煌研究院网站'));
  assert.ok(rec.notice.includes('艺术转译'));
});
