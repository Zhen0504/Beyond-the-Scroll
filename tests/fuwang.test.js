import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CAMERA_FOV, FOLDS, MIN_MURAL_VIEW_DIST, MURAL, PIGMENTS, PIGMENT_KEYS,
  uToX, stopsForFold,
} from '../src/scenes/world/fuwang/layout.js';
import {
  SHAPES, SHAPES_BY_FOLD, MASK_SLOTS, MASK_COLS, MASK_ROWS,
  MASK_SLOT_W, MASK_SLOT_H, MASK_DATA_W, MASK_DATA_H,
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

test('中间折正对本折中心，首末折向画内收以免露出洞窟侧墙', () => {
  for (const [i, f] of FOLDS.entries()) {
    const targetU = f.target[0] / MURAL.width + 0.5;
    assert.ok(targetU >= 0 && targetU <= 1, `${f.name} 注视点不得越出整幅壁画`);
    assert.ok(Math.abs(f.camera[0] - f.target[0]) < 1e-6, `${f.name} 机位应正对注视点`);
    if (i > 0 && i < FOLDS.length - 1) {
      const wantX = uToX((f.u0 + f.u1) / 2);
      assert.ok(Math.abs(f.target[0] - wantX) < 1e-6, `${f.name} 应正对本折中心`);
    }
    assert.equal(f.target[2], MURAL.z);
  }
});

test('机位兼顾折宽与完整画高，可视横跨足以容纳本折', () => {
  const PER_DIST = 0.1577;   // 实测标定
  for (const f of FOLDS) {
    assert.ok(f.dist * PER_DIST >= (f.u1 - f.u0) * 1.05, `${f.name} 可视横跨应大于折宽`);
    assert.ok(f.dist >= MIN_MURAL_VIEW_DIST, `${f.name} 不应因折窄而放大裁掉上下缘`);
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
  assert.ok(MASK_SLOT_W >= 256, `蒙版槽位过小（${MASK_SLOT_W}），轮廓会出锯齿`);
  assert.ok(MASK_SLOT_H >= 128, `蒙版槽位过小（${MASK_SLOT_H}）`);
  assert.ok(MASK_COLS * MASK_ROWS >= SHAPES.length, '图集格子数应容纳全部形体');
});

test('每个形体都有明确说明、颜料、包围盒与生成模式', () => {
  for (const s of SHAPES) {
    assert.ok(s.id && s.fold && s.what, `${JSON.stringify(s)} 缺少标识或说明`);
    assert.ok(PIGMENT_KEYS.includes(s.p), `${s.id} 颜料须在颜料盘内`);
    assert.ok(s.what.length >= 2, `${s.id} 要说明画面上是什么（当前「${s.what}」）`);
    assert.ok(['grow', 'rect'].includes(s.mode), `${s.id} 生成模式须为 grow 或 rect`);
    const [u0, v0, u1, v1] = s.box;
    assert.ok(u1 > u0 && v1 > v0, `${s.id} 包围盒必须非退化`);
    assert.ok(u0 >= 0 && u1 <= 1 && v0 >= 0 && v1 <= 1, `${s.id} 包围盒须在画幅内`);
  }
});

test('平涂色域（rect）会被标记为柔边，免得看出一个梯形', () => {
  const rects = SHAPES.filter((s) => s.mode === 'rect');
  assert.ok(rects.length >= 1, '应存在平涂色域');
  for (const s of rects) {
    assert.ok(
      s.what.includes('地') || s.what.includes('壁') || s.what.includes('水'),
      `${s.id}「${s.what}」看起来不像平涂色域，请确认是否该用 rect`,
    );
  }

  const { r, uniforms } = makeRestorer();
  r.setFold(0);
  r.sync();
  const softShape = shapesFor(FOLDS[0].id, 'tuhong').find((s) => s.mode === 'rect');
  assert.ok(softShape, '第一折应有平涂色域（地色）');
  const idx = Array.from(uniforms.uShapeSlot.value).indexOf(softShape.slot);
  assert.ok(idx >= 0, '该色域的槽位应已上传材质');
  assert.equal(uniforms.uShapeSoft.value[idx], 1, '平涂色域应标记为柔边');

  // 有轮廓的形体不应柔边
  const organic = shapesFor(FOLDS[0].id, 'shilv').find((s) => s.mode === 'grow');
  assert.ok(organic);
  const oi = Array.from(uniforms.uShapeSlot.value).indexOf(organic.slot);
  assert.ok(oi >= 0);
  assert.equal(uniforms.uShapeSoft.value[oi], 0, '有轮廓的形体不应柔边');
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

test('四种历史主色都有形体映射，另有白色与墨线两个综合色层', () => {
  const used = new Set(SHAPES.map((s) => s.p));
  for (const key of PIGMENT_KEYS.slice(0, 4)) {
    assert.ok(used.has(key), `${pigmentName(key)} 从未被任何形体使用 —— 观众点了会困惑`);
  }
  assert.deepEqual(PIGMENT_KEYS.slice(4), ['baise', 'mose']);
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

test('五折所有停点都能在竖直方向容纳完整壁画', () => {
  const halfFov = (CAMERA_FOV * Math.PI) / 360;
  for (const c of CHAPTERS) {
    for (const s of c.stops) {
      const dist = s.camera[2] - MURAL.z;
      const visibleHeight = 2 * dist * Math.tan(halfFov);
      assert.ok(
        visibleHeight >= MURAL.height * 1.05,
        `${c.name}/${s.title} 竖直视野 ${visibleHeight.toFixed(3)} 不足以容纳画高`,
      );
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
/* ================= 按色开关 ================= */

function makeUniforms() {
  return {
    uPigmentR: { value: 0 },
    uPigmentG: { value: 0 },
    uPigmentB: { value: 0 },
    uHover: { value: 1 },
    uOnTarget: { value: 0 },
    uHoverU0: { value: 0 },
    uHoverU1: { value: 1 },
    uFold0: { value: 0 },
    uFold1: { value: 0 },
    uFold2: { value: 0 },
    uFold3: { value: 0 },
    uFold4: { value: 0 },
    ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [
      `uLayer${i}`,
      { value: { x: 0, y: 0, z: 0, w: 0, set(x, y, z, w) { Object.assign(this, { x, y, z, w }); } } },
    ])),
    ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [
      `uNeutral${i}`,
      { value: { x: 0, y: 0, set(x, y) { Object.assign(this, { x, y }); } } },
    ])),
    uShapeBounds: {
      value: Array.from({ length: MAX_ACTIVE_SHAPES }, () => ({
        x: 0, y: 0, z: 0, w: 0,
        set(a, b, c, d) { this.x = a; this.y = b; this.z = c; this.w = d; },
      })),
    },
    uShapeSlot: { value: new Array(MAX_ACTIVE_SHAPES).fill(0) },
    uShapeSoft: { value: new Array(MAX_ACTIVE_SHAPES).fill(0) },
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

/** 把一折的颜色逐个点上（每种颜色一次） */
function paintFold(r, foldIdx) {
  r.setFold(foldIdx);
  for (const p of PIGMENTS) r.togglePigment(p.id);
}

test('点一下颜色：本折该色的地方一次全部敷上', () => {
  const { r, events } = makeRestorer();
  r.setFold(0);
  const want = r.shapesOf('shilv');
  assert.ok(want.length >= 1, '第一折应有石绿的形体');

  assert.equal(r.isOn('shilv'), false);
  assert.equal(r.togglePigment('shilv'), 'on');
  assert.equal(r.isOn('shilv'), true, '该色应已全部敷上');
  for (const s of want) assert.equal(r.filled.has(s.id), true, `${s.what} 应已敷上`);
  assert.ok(events.some((e) => e.type === 'color-on' && e.pigment === 'shilv'));
});

test('再点同一种颜色：整体还原', () => {
  const { r, events } = makeRestorer();
  r.setFold(0);
  r.togglePigment('shilv');
  assert.ok(r.filled.size > 0);
  assert.equal(r.togglePigment('shilv'), 'off');
  assert.equal(r.isOn('shilv'), false, '该色应已还原');
  assert.equal(r.filled.size, 0, '不该留下任何已敷形体');
  assert.ok(events.some((e) => e.type === 'color-off' && e.pigment === 'shilv'));
});

test('六个色层各自独立：点其中一种不影响其余', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const used = PIGMENTS;

  r.togglePigment(used[0].id);
  for (const p of used.slice(1)) assert.equal(r.isOn(p.id), false, `${p.name}不应被牵动`);

  r.togglePigment(used[1].id);
  assert.equal(r.isOn(used[0].id), true, '先点的颜色应保留');
  assert.equal(r.isOn(used[1].id), true);
});

test('六个色层在每折均可切换，未知颜色不生效', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  assert.equal(r.togglePigment('baise'), 'on');
  assert.equal(r.isOn('baise'), true);
  assert.equal(r.togglePigment('mose'), 'on');
  assert.equal(r.isOn('mose'), true);
  assert.equal(r.togglePigment('not-a-pigment'), 'empty');
});

test('进度按「已显色层数 / 六类色层」计', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const used = PIGMENTS;
  assert.equal(r.progress[0], 0);

  r.togglePigment(used[0].id);
  assert.ok(Math.abs(r.progress[0] - 1 / used.length) < 1e-9, '每种色调等权推进');

  for (const p of PIGMENTS) if (!r.isOn(p.id)) r.togglePigment(p.id);
  assert.equal(r.progress[0], 1, '六个色层都点上应为 100%');
  assert.ok(r.done >= 1);
});

test('本折颜色种数与已敷色数可统计，供界面显示', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const total = PIGMENTS.length;
  assert.equal(r.colorsTotal, total);
  assert.equal(r.colorsOn, 0);
  r.togglePigment(PIGMENTS.find((p) => r.shapesOf(p.id).length > 0).id);
  assert.equal(r.colorsOn, 1);
});

test('还原按钮：撤掉本折已敷的全部颜色', () => {
  const { r, events } = makeRestorer();
  r.setFold(0);
  for (const p of PIGMENTS) r.togglePigment(p.id);
  assert.ok(r.filled.size > 0);
  assert.equal(r.resetFold(), true);
  assert.equal(r.filled.size, 0, '应全部还原');
  assert.equal(r.progress[0], 0);
  assert.ok(events.some((e) => e.type === 'fold-reset'));
  assert.equal(r.resetFold(), false, '已无颜色可还原时应返回 false');
});

test('敷彩会重绘累积贴图：每个已敷形体各写一次', () => {
  const { r, fills } = makeRestorer();
  r.setFold(0);
  const list = r.shapesOf('shilv');
  r.togglePigment('shilv');
  for (const s of list) {
    assert.ok(fills.filter((x) => x[0] === s.id).length >= 1, `${s.what} 应写入贴图`);
  }
});

test('还原会重绘：贴图里不再有该色的形体', () => {
  const { r, fills, clearCount } = makeRestorer();
  r.setFold(0);
  r.togglePigment('shilv');
  const before = clearCount();
  const n0 = fills.length;
  r.togglePigment('shilv');
  assert.ok(clearCount() > before, '还原应清空贴图');
  const after = fills.slice(n0).map((x) => x[0]);
  assert.ok(!after.includes(r.shapesOf('shilv')[0].id), '还原后不该再写入该色形体');
});

test('五折全部敷上 → all-done', () => {
  const { r, events } = makeRestorer();
  for (const fi of FOLDS.keys()) paintFold(r, fi);
  assert.ok(r.allDone, '五折全部敷上应完成');
  assert.ok(events.some((e) => e.type === 'all-done'));
});

test('切折后各折的敷彩状态互不干扰，且都保留', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const p0 = PIGMENTS.find((p) => r.shapesOf(p.id).length > 0).id;
  r.togglePigment(p0);

  r.setFold(1);
  const p1 = PIGMENTS.find((p) => r.shapesOf(p.id).length > 0).id;
  assert.equal(r.isOn(p0), r.shapesOf(p0).length > 0 && r.shapesOf(p0).every((s) => r.filled.has(s.id)));

  r.togglePigment(p1);
  r.setFold(0);
  assert.equal(r.isOn(p0), true, '回到第一折，先前敷的颜色应还在');
  assert.ok(r.progress[0] > 0);
});

test('键盘：数字键开关颜色、Q/E 换折、R 还原', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const used = PIGMENTS.find((p) => r.shapesOf(p.id).length > 0);
  const i = PIGMENTS.indexOf(used);

  r.onKey({ key: String(i + 1), preventDefault() {} });
  assert.equal(r.isOn(used.id), true, '数字键应敷上该色');
  r.onKey({ key: String(i + 1), preventDefault() {} });
  assert.equal(r.isOn(used.id), false, '再按一次应还原');

  r.setFold(1);
  r.onKey({ key: 'e', preventDefault() {} });
  assert.equal(r.index, 2, 'E 应前进一折');
  r.onKey({ key: 'q', preventDefault() {} });
  assert.equal(r.index, 1, 'Q 应后退一折');

  r.setFold(0);
  const pid = PIGMENTS.find((p) => r.shapesOf(p.id).length > 0).id;
  r.togglePigment(pid);
  r.onKey({ key: 'r', preventDefault() {} });
  assert.equal(r.filled.size, 0, 'R 应还原本折');

  assert.doesNotThrow(() => r.onKey({ key: 'q', preventDefault() {} }));
  assert.equal(r.index, 0, '第一折不应再后退');
});

test('弹窗或音量输入期间，快捷键不改变敷彩和折数', () => {
  const { r } = makeRestorer();
  paintFold(r, 1);
  const before = r.snapshot();
  const press = (key, extra = {}) => r.onKey({ key, preventDefault() {}, ...extra });
  r.enabled = false;
  for (const key of ['1', 'q', 'e', 'r']) press(key);
  assert.deepEqual(r.snapshot(), before);
  r.enabled = true;
  for (const extra of [
    { target: { tagName: 'INPUT' } },
    { target: { isContentEditable: true } },
    { repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true },
  ]) {
    for (const key of ['1', 'q', 'e', 'r']) press(key, extra);
    assert.deepEqual(r.snapshot(), before);
  }
  press('r');
  assert.equal(r.progress[1], 0);
});

test('引导已关闭：正常成像不再压暗或高亮画面', () => {
  const { r, uniforms } = makeRestorer();
  r.setFold(0);
  r.sync();
  assert.equal(uniforms.uHover.value, 0, '不应再开启引导高亮');
  assert.equal(uniforms.uOnTarget.value, 0);
});

test('状态可序列化，便于核验与留档', () => {
  const { r } = makeRestorer();
  r.setFold(0);
  const pid = PIGMENTS.find((p) => r.shapesOf(p.id).length > 0).id;
  r.togglePigment(pid);
  const snap = r.snapshot();
  assert.equal(typeof snap.index, 'number');
  assert.equal(snap.progress.length, FOLDS.length);
  assert.equal(typeof snap.colorsOn, 'number');
  assert.equal(typeof snap.colorsTotal, 'number');
  assert.ok(Array.isArray(snap.on) && snap.on.includes(pid));
  assert.ok(Array.isArray(snap.filled) && snap.filled.length >= 1);
  assert.ok(JSON.stringify(snap).length > 0);
});

test('全部进度上传材质，切折后已完成区段保持重彩', () => {
  const { r, uniforms } = makeRestorer();
  for (const fi of FOLDS.keys()) paintFold(r, fi);
  assert.ok(uniforms.uFold0.value >= 1);
  assert.ok(uniforms.uFold4.value >= 1);
  r.setFold(0);
  assert.ok(uniforms.uFold0.value >= 1, '切折后第一折仍应保持重彩');
  assert.equal(uniforms.uHoverU0.value, FOLDS[0].u0);
});

test('矿物色调开关直接上传各折材质，不依赖画面颜色识别', () => {
  const { r, uniforms } = makeRestorer();
  r.setFold(0);
  const used = PIGMENTS.find((p) => r.shapesOf(p.id).length > 0);
  const component = ['x', 'y', 'z', 'w'][PIGMENTS.indexOf(used)];
  assert.equal(uniforms.uLayer0.value[component], 0);
  r.togglePigment(used.id);
  assert.equal(uniforms.uLayer0.value[component], 1);
  r.togglePigment(used.id);
  assert.equal(uniforms.uLayer0.value[component], 0);
});

test('白色与墨线层通过独立材质通道上传', () => {
  const { r, uniforms } = makeRestorer();
  r.setFold(0);
  r.togglePigment('baise');
  assert.equal(uniforms.uNeutral0.value.x, 1);
  assert.equal(uniforms.uNeutral0.value.y, 0);
  r.togglePigment('mose');
  assert.equal(uniforms.uNeutral0.value.x, 1);
  assert.equal(uniforms.uNeutral0.value.y, 1);
  r.togglePigment('baise');
  assert.equal(uniforms.uNeutral0.value.x, 0);
  assert.equal(uniforms.uNeutral0.value.y, 1);
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
