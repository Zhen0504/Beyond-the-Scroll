import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { FOLDS, MURAL, PIGMENTS, PIGMENT_KEYS, uToX, stopsForFold } from '../src/scenes/world/fuwang/layout.js';
import { FOLD_REGIONS, regionsFor, hasRegions } from '../src/scenes/world/fuwang/regions.js';
import { Restorer, foldForU, pigmentName } from '../src/scenes/world/fuwang/restore.js';
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
    const visible = f.dist * PER_DIST;
    const span = f.u1 - f.u0;
    assert.ok(visible >= span * 1.05, `${f.name} 可视横跨应大于折宽`);
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

/* ================= 色区（该涂哪里） ================= */

test('每折的色区完整覆盖本折、互不重叠，且都在本折范围内', () => {
  for (const f of FOLDS) {
    const list = FOLD_REGIONS[f.id];
    assert.ok(Array.isArray(list) && list.length >= 2, `${f.name} 至少要有两个色区`);
    assert.ok(
      Math.abs(list[0].u0 - f.u0) < 1e-6,
      `${f.name} 首个色区应从本折起点开始（${list[0].u0} vs ${f.u0}）`,
    );
    assert.ok(
      Math.abs(list[list.length - 1].u1 - f.u1) < 1e-6,
      `${f.name} 末个色区应到本折终点（${list[list.length - 1].u1} vs ${f.u1}）`,
    );
    for (let i = 1; i < list.length; i++) {
      assert.equal(list[i].u0, list[i - 1].u1, `${f.name} 色区之间不应有缝或重叠`);
    }
    for (const r of list) {
      assert.ok(r.u1 > r.u0, `${f.name}/${r.what} 区间应为正`);
      assert.ok(PIGMENT_KEYS.includes(r.p), `${f.name}/${r.what} 颜料须在颜料盘内`);
      assert.ok(r.what && r.what.length >= 2, `${f.name} 的色区要说明涂的是画面何处`);
    }
  }
});

test('四种矿物色都被用到，不会有点了没处涂的颜色', () => {
  const used = new Set();
  for (const list of Object.values(FOLD_REGIONS)) {
    for (const r of list) used.add(r.p);
  }
  for (const key of PIGMENT_KEYS) {
    assert.ok(used.has(key), `${pigmentName(key)} 从未被任何色区使用 —— 观众点了会困惑`);
  }
});

test('每一折都用到了至少三种颜色，保证"选色—找位置"的层次', () => {
  for (const f of FOLDS) {
    const kinds = new Set(FOLD_REGIONS[f.id].map((r) => r.p));
    assert.ok(kinds.size >= 3, `${f.name} 只用到 ${kinds.size} 种颜色，过少`);
  }
});

test('regionsFor / hasRegions 正确筛选当前颜料的目标区', () => {
  const fold = FOLDS[2];
  const shiqing = regionsFor(fold.id, 'shiqing');
  assert.ok(shiqing.length >= 1);
  assert.ok(shiqing.every((r) => r.p === 'shiqing'));
  assert.ok(hasRegions(fold.id, 'shiqing'));
  // 造一个不存在的折 id
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
      const visible = s.camera[2] * PER_DIST;
      const centre = s.camera[0] / MURAL.width + 0.5;
      assert.ok(centre > c.u0 - 0.05 && centre < c.u1 + 0.05, `${c.name}/${s.title} 视线偏离本折`);
      assert.ok(visible > (c.u1 - c.u0) * 0.6, `${c.name}/${s.title} 可视范围过窄`);
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
    uTargets: {
      value: Array.from({ length: 8 }, () => ({
        x: 0, y: 0,
        set(a, b) { this.x = a; this.y = b; },
      })),
    },
  };
}

/** 最小可用 Restorer：不依赖 WebGL，带可观测的敷彩画布 */
function makeRestorer() {
  const uniforms = makeUniforms();
  const stamped = [];
  const events = [];
  let snapshots = 0;
  const canvas = {
    stamp: (...a) => stamped.push(a),
    snapshot: () => ({ id: ++snapshots }),
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

/** 取某折某颜料的第一个色区中点 */
function midOf(foldId, pigmentId) {
  const r = regionsFor(foldId, pigmentId)[0];
  return (r.u0 + r.u1) / 2;
}

test('选色后能报出本折该涂的位置，供界面高亮', () => {
  const { r, events } = makeRestorer();
  r.setFold(2);
  r.setPigment('shiqing');
  const ev = events.filter((e) => e.type === 'pigment').pop();
  assert.ok(ev, '换色应发出 pigment 事件');
  assert.ok(ev.count >= 1, '应报出本折石青的色区数');
  assert.ok(ev.targets.every((t) => t.p === 'shiqing'));
});

test('引导高亮常驻：不依赖鼠标移动，选色后 uHover 即为 1', () => {
  const { r, uniforms } = makeRestorer();
  r.setFold(0);
  r.setPigment('shiqing');
  assert.equal(uniforms.uHover.value, 1, '引导应常驻，不能等鼠标移上来才亮');

  // 目标色区应已写入材质
  const want = regionsFor(FOLDS[0].id, 'shiqing');
  assert.ok(want.length >= 1, '本折石青应有目标色区');
  assert.ok(Math.abs(uniforms.uTargets.value[0].x - want[0].u0) < 1e-9);
  assert.ok(Math.abs(uniforms.uTargets.value[0].y - want[0].u1) < 1e-9);
  // 未使用的槽位应为空
  assert.equal(uniforms.uTargets.value[want.length].y, 0, '多余槽位应清零');
});

test('进度按色区推进：必须涂满每一段的宽度才算完成', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  assert.ok(list.length >= 2);

  // 只涂第一个色区：把笔从该段左端走到右端
  const first = list[0];
  r.setPigment(first.p);
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    r.advance(first.u0 + ((first.u1 - first.u0) * i) / steps);
  }

  assert.equal(r.regionProgressAt(0, 0), 1, '第一个色区走满后应为 100%');
  assert.ok(r.regionProgressAt(0, 1) < 0.2, '未涂的色区不应被推进');
  assert.ok(r.progress[0] < 1, '只涂一段不应让整折完成');
});

test('一次点击只推进极小一段，不会"一点就充实"', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  r.setPigment(list[0].p);
  const u = (list[0].u0 + list[0].u1) / 2;
  r.advance(u);   // 单击：笔尖只覆盖自身宽度
  const p = r.regionProgressAt(0, 0);
  assert.ok(p > 0, '单击应留下一点痕迹');
  assert.ok(p < 0.15, `单击推进过多（${p.toFixed(3)}），会失去涂抹过程`);
});

test('进度按「涂到的区间」计：来回涂抹不会虚增，必须真的走完', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  r.setPigment(list[0].p);
  const width = list[0].u1 - list[0].u0;
  const mid = (list[0].u0 + list[0].u1) / 2;

  // 在色区中间来回涂很多次，区间宽度不变
  for (let i = 0; i < 60; i++) r.advance(mid + (i % 2 ? width * 0.05 : -width * 0.05));
  const wandered = r.regionProgressAt(0, 0);
  assert.ok(wandered < 0.3, `来回涂抹不应虚增进度（实为 ${wandered.toFixed(3)}）`);

  // 真正从左走到右
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    r.advance(list[0].u0 + (width * i) / steps);
  }
  assert.equal(r.regionProgressAt(0, 0), 1, '走满整段后应达 100%');
});

test('涂五折全部色区后，整幅完成并发 all-done', () => {
  const { r, events } = makeRestorer();
  const sweep = (fi, f) => {
    r.setFold(fi);
    const list = FOLD_REGIONS[f.id];
    for (const [ri, region] of list.entries()) {
      r.setPigment(region.p);
      const width = region.u1 - region.u0;
      for (let i = 0; i <= 400 && r.regionProgressAt(fi, ri) < 1; i++) {
        r.advance(region.u0 + (width * i) / 400);
      }
    }
  };
  for (const [fi, f] of FOLDS.entries()) sweep(fi, f);

  assert.ok(r.allDone, '五折全部色区涂满后应为完成');
  assert.ok(events.some((e) => e.type === 'fold-done'));
  assert.ok(events.some((e) => e.type === 'all-done'));
});

test('涂抹非目标处：不落色、不推进，并给出明确指引', () => {
  const { r, events, stamped } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  // 选一种本折第一个色区不用的颜料
  const otherPigment = PIGMENT_KEYS.find((k) => k !== list[0].p);
  r.setPigment(otherPigment);

  const before = [...r.coverage[0]];
  const u = (list[0].u0 + list[0].u1) / 2;
  r.pickFrom = () => ({ uv: { x: u, y: 0.5 } });
  const stampedBefore = stamped.length;
  r.paintAt({ clientX: 50, clientY: 50 });

  assert.equal(stamped.length, stampedBefore, '不应落色到画布');
  assert.deepEqual(r.coverage[0], before, '进度不应变化');
  const off = events.find((e) => e.type === 'off-target');
  assert.ok(off, '应给出提示');
  assert.ok(off.message.includes('发光'), '提示应引导去发光处');
});

test('涂抹目标处：落色到画布并推进对应色区', () => {
  const { r, stamped } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  r.setPigment(list[0].p);
  const u = (list[0].u0 + list[0].u1) / 2;
  r.pickFrom = () => ({ uv: { x: u, y: 0.5 } });
  r.paintAt({ clientX: 50, clientY: 50 });

  assert.equal(stamped.length, 1, '应落一笔');
  const [uv, , index, amount, opts] = stamped[0];
  assert.ok(uv.x >= list[0].u0 && uv.x <= list[0].u1);
  assert.ok(index >= 0 && index <= 1);
  assert.ok(amount > 0 && amount <= 1);
  assert.ok(opts?.radius > 0 && opts?.radius < 0.03, '笔尖应较小，便于细致涂抹');
  assert.ok(r.regionProgressAt(0, 0) > 0, '应推进对应色区');
});

/* ================= 撤销 ================= */

test('撤销：落笔前留快照，撤销后回退一层且可继续撤销', () => {
  const { r, canvas, events } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  r.setPigment(list[0].p);
  const u = (list[0].u0 + list[0].u1) / 2;
  r.pickFrom = () => ({ uv: { x: u, y: 0.5 } });

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
  assert.equal(r.undo(), false, '没有快照时应返回 false');
  assert.ok(events.some((e) => e.type === 'undo-empty'), '应提示无可撤销');
});

test('撤销栈有上限，不会无限增长', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  r.setPigment(list[0].p);
  const u = (list[0].u0 + list[0].u1) / 2;
  r.pickFrom = () => ({ uv: { x: u, y: 0.5 } });

  for (let i = 0; i < 30; i++) {
    r.onDown({ clientX: 50, clientY: 50 });
    r.onUp();
  }
  assert.equal(r.undoStack.length, 3, `撤销栈应限制在 ${3} 层（实为 ${r.undoStack.length}）`);
});

test('键盘可独立完成：数字键择色、方括号换折、Z 撤销', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  r.setPigment(list[0].p);
  const u = (list[0].u0 + list[0].u1) / 2;
  r.pickFrom = () => ({ uv: { x: u, y: 0.5 } });

  r.onDown({ clientX: 50, clientY: 50 });
  r.onUp();
  assert.equal(r.undoStack.length, 1, '应留一笔快照');

  r.onKey({ key: '2', preventDefault() {} });
  assert.equal(r.pigment, PIGMENTS[1].id);

  r.setFold(1);
  r.onKey({ key: ']', preventDefault() {} });
  assert.equal(r.index, 2, '] 应前进一折');
  r.onKey({ key: '[', preventDefault() {} });
  assert.equal(r.index, 1, '[ 应后退一折');

  // Z 撤销
  r.setFold(0);
  const before = r.undoStack.length;
  r.onKey({ key: 'z', preventDefault() {} });
  assert.equal(r.undoStack.length, before - 1, 'Z 应撤销一层');

  r.setFold(0);
  assert.doesNotThrow(() => r.onKey({ key: '[', preventDefault() {} }));
  assert.equal(r.index, 0, '第一折不应再后退');
});

test('完成状态可序列化，便于核验与留档', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const list = FOLD_REGIONS[FOLDS[0].id];
  r.setPigment(list[0].p);
  r.advance((list[0].u0 + list[0].u1) / 2, 0.01);
  const snap = r.snapshot();
  assert.equal(typeof snap.index, 'number');
  assert.equal(snap.progress.length, FOLDS.length);
  assert.ok(Array.isArray(snap.targets));
  assert.equal(typeof snap.undoDepth, 'number');
  assert.ok(JSON.stringify(snap).length > 0);
});

test('全部进度上传材质，切折后已完成区段保持重彩', () => {
  const { r, uniforms } = makeRestorer();
  for (const [fi, f] of FOLDS.entries()) {
    r.setFold(fi);
    for (const [ri, region] of FOLD_REGIONS[f.id].entries()) {
      r.setPigment(region.p);
      const width = region.u1 - region.u0;
      for (let i = 0; i <= 400 && r.regionProgressAt(fi, ri) < 1; i++) {
        r.advance(region.u0 + (width * i) / 400);
      }
    }
  }
  assert.ok(uniforms.uFold0.value >= 1, '第一折进度应写入 uFold0');
  assert.ok(uniforms.uFold1.value >= 1);
  assert.ok(uniforms.uFold4.value >= 1);

  r.setFold(0);
  assert.ok(uniforms.uFold0.value >= 1, '切折后第一折仍应保持重彩');
  assert.equal(uniforms.uHoverU0.value, FOLDS[0].u0, '高亮区间应切到本折');
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
