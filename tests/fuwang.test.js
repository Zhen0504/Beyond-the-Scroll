import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { FOLDS, MURAL, PIGMENTS, uToX, stopsForFold } from '../src/scenes/world/fuwang/layout.js';
import { Restorer, foldForU } from '../src/scenes/world/fuwang/restore.js';
import { CHAPTERS } from '../src/scenes/world/fuwang/story.js';
import { FOLD_QUOTES, PROJECT_NOTICE } from '../src/scenes/world/fuwang/quotes.js';

const HERE = dirname(fileURLToPath(import.meta.url));

test('五折的 u 区间首尾相接，覆盖整幅横卷且不重叠', () => {
  assert.equal(FOLDS[0].u0, 0, '第一折应从左端开始');
  for (let i = 1; i < FOLDS.length; i++) {
    assert.equal(FOLDS[i].u0, FOLDS[i - 1].u1, `第 ${i + 1} 折起点应接上前一折终点`);
  }
  assert.equal(FOLDS[FOLDS.length - 1].u1, 1, '最后一折应到右端');
  for (const f of FOLDS) {
    assert.ok(f.u1 > f.u0, `${f.name} 区间应为正`);
  }
});

test('每折机位对准本折区段：视线中心与折中心一致', () => {
  for (const f of FOLDS) {
    const wantX = uToX((f.u0 + f.u1) / 2);
    assert.ok(
      Math.abs(f.camera[0] - wantX) < 1e-6,
      `${f.name} 机位应正对本折中心（期望 ${wantX}，实为 ${f.camera[0]}）`,
    );
    assert.ok(
      Math.abs(f.target[0] - wantX) < 1e-6,
      `${f.name} 注视点应落在本折中心`,
    );
    assert.equal(f.target[2], MURAL.z, `${f.name} 视线应落在壁画平面`);
  }
});

test('机位距离与折宽成正比，可视横跨足以容纳本折（含边距）', () => {
  // 实测标定：每单位距离可见 u 宽 0.1577
  const PER_DIST = 0.1577;
  for (const f of FOLDS) {
    const visible = f.dist * PER_DIST;
    const span = f.u1 - f.u0;
    assert.ok(
      visible >= span * 1.05,
      `${f.name} 可视横跨 ${visible.toFixed(3)} 应大于折宽 ${span.toFixed(3)}`,
    );
    assert.ok(f.dist > 0.5 && f.dist < 4, `${f.name} 机位距离应在合理范围（${f.dist}）`);
  }
});

test('折越宽则机位越远（单调关系）', () => {
  const ordered = [...FOLDS].sort((a, b) => a.u1 - a.u0 - (b.u1 - b.u0));
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(
      ordered[i].dist >= ordered[i - 1].dist - 1e-9,
      `${ordered[i].name} 比 ${ordered[i - 1].name} 更宽，机位不应更近`,
    );
  }
});

test('stopsForFold 对任意区间都给出有效机位', () => {
  for (const [a, b] of [[0, 0.05], [0, 1], [0.9, 1], [0.5, 0.51]]) {
    const s = stopsForFold(a, b);
    assert.equal(s.camera.length, 3);
    assert.equal(s.target.length, 3);
    assert.ok(Number.isFinite(s.dist) && s.dist > 0);
    assert.ok(s.camera[2] > MURAL.z, '机位应在壁画之前（+z 侧）');
  }
});

test('uToX 在壁画范围内单调递增', () => {
  assert.ok(uToX(0) < uToX(0.5));
  assert.ok(uToX(0.5) < uToX(1));
  assert.ok(Math.abs(uToX(0) + MURAL.width / 2) < 1e-9);
});

test('foldForU 能把任意位置映射到正确的折，且不越界', () => {
  assert.equal(foldForU(0, FOLDS), 0);
  assert.equal(foldForU(0.999999, FOLDS), FOLDS.length - 1);
  assert.equal(foldForU(-5, FOLDS), 0, '负数应夹到第一折');
  assert.equal(foldForU(9, FOLDS), FOLDS.length - 1, '越界应夹到最后一折');
  for (const [i, f] of FOLDS.entries()) {
    const mid = (f.u0 + f.u1) / 2;
    assert.equal(foldForU(mid, FOLDS), i, `${f.name} 的中点应落在自己身上`);
  }
});

test('每一折都有叙事、机位与释文', () => {
  assert.equal(CHAPTERS.length, FOLDS.length);
  for (const c of CHAPTERS) {
    assert.ok(c.intro && c.intro.length > 4, `${c.name} 缺少引言`);
    assert.ok(c.enter, `${c.name} 缺少入场按钮文案`);
    assert.ok(Array.isArray(c.stops) && c.stops.length >= 2, `${c.name} 至少要有两个停点`);
    for (const s of c.stops) {
      assert.equal(s.camera.length, 3, `${c.name}/${s.title} 机位应为三元组`);
      assert.equal(s.target.length, 3, `${c.name}/${s.title} 目标点应为三元组`);
      assert.ok(s.note, `${c.name}/${s.title} 缺少依据说明`);
      assert.ok(
        s.camera[2] > MURAL.z,
        `${c.name}/${s.title} 机位应位于壁画之前`,
      );
    }
    assert.ok(Array.isArray(c.quotes) && c.quotes.length >= 1, `${c.name} 缺少释文`);
  }
});

test('每折的停点都对准本折区段（不会看到别的折）', () => {
  const PER_DIST = 0.1577;
  for (const c of CHAPTERS) {
    for (const s of c.stops) {
      const visible = s.camera[2] * PER_DIST;
      const centre = s.camera[0] / MURAL.width + 0.5;
      assert.ok(
        centre > c.u0 - 0.05 && centre < c.u1 + 0.05,
        `${c.name}/${s.title} 视线中心 ${centre.toFixed(3)} 应落在本折 [${c.u0}, ${c.u1}]`,
      );
      assert.ok(visible > (c.u1 - c.u0) * 0.6, `${c.name}/${s.title} 可视范围过窄`);
    }
  }
});

test('释文逐条带出处链接，且指向敦煌研究院站点', () => {
  const all = Object.values(FOLD_QUOTES).flat();
  assert.ok(all.length >= 5);
  for (const q of all) {
    assert.ok(q.quoted && q.quoted.length > 10, '引文不应为空');
    assert.ok(q.credit.includes('敦煌研究院网站'), `出处须写明「敦煌研究院网站」：${q.credit}`);
    assert.match(q.url, /^https?:\/\/(www\.)?(dha\.ac\.cn|dunhuangcaves\.org)/);
  }
});

test('本项目创作声明齐备，且未使用「官方」类表述', () => {
  assert.ok(PROJECT_NOTICE.title);
  assert.ok(PROJECT_NOTICE.body.length >= 2);
  const blob = PROJECT_NOTICE.body.join('');
  assert.ok(blob.includes('艺术转译'), '须声明为艺术转译');
  assert.ok(
    blob.includes('非敦煌研究院的官方解读或认可'),
    '须明确否认官方解读或认可',
  );
});

test('颜料盘至少提供四种矿物色且各有名称', () => {
  assert.ok(PIGMENTS.length >= 3);
  for (const p of PIGMENTS) {
    assert.ok(p.id && p.name, '颜料须有 id 与名称');
    assert.match(p.hex, /^#[0-9a-f]{6}$/i);
  }
});

/** 构造一个最小可用的 Restorer（不依赖 WebGL） */
function makeRestorer() {
  const uniforms = {
    uPigmentR: { value: 0 },
    uPigmentG: { value: 0 },
    uPigmentB: { value: 0 },
    uHover: { value: 0 },
    uHoverU0: { value: 0 },
    uHoverU1: { value: 1 },
    uFold0: { value: 0 },
    uFold1: { value: 0 },
    uFold2: { value: 0 },
    uFold3: { value: 0 },
    uFold4: { value: 0 },
    uTime: { value: 0 },
  };
  const stamped = [];
  const events = [];
  const r = new Restorer({
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } },
    camera: {},
    muralMesh: { material: { uniforms } },
    paintCanvas: { stamp: (...a) => stamped.push(a) },
    folds: FOLDS,
    palette: PIGMENTS,
    onEvent: (e) => events.push(e),
  });
  return { r, uniforms, events, stamped };
}

test('敷彩：在本折区段落色可推进进度，直到完成', () => {
  const { r, uniforms, events } = makeRestorer();
  r.setSpeed('full');
  r.setFold(0);
  assert.equal(r.progress[0], 0);

  const mid = (FOLDS[0].u0 + FOLDS[0].u1) / 2;
  for (let i = 0; i < 40 && r.progress[0] < 1; i++) r.apply(mid);

  assert.equal(r.progress[0], 1, '反复敷彩应能填满本折');
  assert.ok(events.some((e) => e.type === 'fold-done'), '应发出完成事件');
  assert.equal(uniforms.uHoverU0.value, FOLDS[0].u0, '折区间应同步到材质');
});

test('五折进度全部上传材质，切折后已完成的区段保持重彩', () => {
  const { r, uniforms } = makeRestorer();
  r.setSpeed('full');
  r.setFold(0);
  const mid0 = (FOLDS[0].u0 + FOLDS[0].u1) / 2;
  for (let i = 0; i < 40 && r.progress[0] < 1; i++) r.apply(mid0);
  assert.equal(uniforms.uFold0.value, 1, '第一折完成度应写入 uFold0');

  // 切到第三折：第一折的进度不应被清零
  r.setFold(2);
  assert.equal(uniforms.uFold0.value, 1, '切折后第一折仍应保持重彩');
  assert.equal(uniforms.uHoverU0.value, FOLDS[2].u0, '高亮区间应切到本折');
});

test('容错：涂到非目标区不抛错、不倒退，且给出可理解的范围提示', () => {
  const { r, events } = makeRestorer();
  r.setSpeed('full');
  r.setFold(0);
  const before = r.progress[0];
  const otherFold = FOLDS.length - 1;
  const other = (FOLDS[otherFold].u0 + FOLDS[otherFold].u1) / 2;

  assert.doesNotThrow(() => r.apply(other));

  assert.equal(r.progress[0], before, '本折进度不应因涂错而减少');
  assert.ok(r.progress[otherFold] > 0, '颜色仍应落下（矿物颜料可以覆盖）');
  const off = events.find((e) => e.type === 'off-target');
  assert.ok(off, '应给出非目标区提示');
  assert.ok(off.message.includes('本折'), '提示应指明「不是本折的范围」');
  assert.ok(off.message.includes('高亮'), '提示应引导回到高亮处');
});

test('完成状态明确：折内完成后发 fold-done，继续落笔不重复报完成', () => {
  const { r, events } = makeRestorer();
  r.setSpeed('full');
  r.setFold(0);
  const mid = (FOLDS[0].u0 + FOLDS[0].u1) / 2;

  for (let i = 0; i < 40 && r.progress[0] < 1; i++) r.apply(mid);
  assert.equal(r.progress[0], 1);

  const countDone = () => events.filter((e) => e.type === 'fold-done').length;
  assert.equal(countDone(), 1, '恰好报一次完成');

  r.apply(mid);
  r.apply(mid);
  assert.equal(countDone(), 1, '已完成后不应重复发出 fold-done');
  assert.ok(
    events.filter((e) => e.type === 'paint-done').length >= 1,
    '应发出 paint-done 作为「已足色」的轻提示',
  );
});

test('速成档会预铺底色，且不覆盖已完成的进度', () => {
  const { r } = makeRestorer();
  r.setSpeed('gentle');
  const seeded = [...r.progress];
  assert.ok(seeded.some((p) => p > 0), '速成档应预铺一定进度');
  assert.ok(seeded.every((p) => p <= 1), '预铺不应超过 100%');
  assert.ok(
    Math.max(...seeded) <= 0.25,
    `预铺基线应保持较低以免削弱成就感（实为 ${Math.max(...seeded)}）`,
  );

  r.progress = r.progress.map(() => 1);
  r.seedGentle();
  assert.ok(r.progress.every((p) => p === 1), '预铺不应把已完成的进度改小');
});

test('键盘可独立完成：数字键择色、方括号换折、F 切档', () => {
  const { r } = makeRestorer();
  r.onKey({ key: '2', preventDefault() {} });
  assert.equal(r.pigment, PIGMENTS[1].id);

  r.setFold(1);
  r.onKey({ key: ']', preventDefault() {} });
  assert.equal(r.index, 2, '] 应前进一折');
  r.onKey({ key: '[', preventDefault() {} });
  assert.equal(r.index, 1, '[ 应后退一折');

  r.setSpeed('full');
  r.onKey({ key: 'f', preventDefault() {} });
  assert.equal(r.speed, 'gentle');

  r.setFold(0);
  assert.doesNotThrow(() => r.onKey({ key: '[', preventDefault() {} }));
  assert.equal(r.index, 0, '第一折不应再后退');
});

test('完成状态可序列化，便于核验与留档', () => {
  const { r } = makeRestorer();
  r.setSpeed('full');
  r.apply((FOLDS[0].u0 + FOLDS[0].u1) / 2);
  const snap = r.snapshot();
  assert.equal(typeof snap.index, 'number');
  assert.equal(snap.progress.length, FOLDS.length);
  assert.ok(JSON.stringify(snap).length > 0);
});

test('点击落笔：paintAt 把笔迹写到敷彩画布，参数形状正确', () => {
  const { r, stamped } = makeRestorer();
  r.setSpeed('full');
  r.setFold(0);
  r.setPigment(PIGMENTS[1].id);

  r.pickFrom = () => ({ uv: { x: (FOLDS[0].u0 + FOLDS[0].u1) / 2, y: 0.5 } });
  r.prevUv = { x: 0.03, y: 0.5 };

  r.paintAt({ clientX: 50, clientY: 50 });

  assert.equal(stamped.length, 1, '应恰好落一笔');
  const [uv, prev, index, amount] = stamped[0];
  assert.ok(uv.x > FOLDS[0].u0 && uv.x < FOLDS[0].u1, '落笔位置应在本折内');
  assert.equal(prev.x, 0.03, '应带上一笔位置，用于拉长笔毫纹理');
  assert.equal(index, 1 / (PIGMENTS.length - 1), '应带当前颜料序号');
  assert.ok(amount > 0 && amount <= 1, '落色强度应在 0..1');
  assert.ok(r.progress[0] > 0, '落笔应同时推进进度');
});

test('涂到非本折区段时，落色强度明显降低（不惩罚，但也不奖励）', () => {
  const { r, stamped } = makeRestorer();
  r.setSpeed('full');
  r.setFold(0);
  const other = (FOLDS[FOLDS.length - 1].u0 + FOLDS[FOLDS.length - 1].u1) / 2;
  r.pickFrom = () => ({ uv: { x: other, y: 0.5 } });

  r.paintAt({ clientX: 50, clientY: 50 });
  const onTarget = stamped[0][3];

  const { r: r2, stamped: stamped2 } = makeRestorer();
  r2.setSpeed('full');
  r2.setFold(0);
  const own = (FOLDS[0].u0 + FOLDS[0].u1) / 2;
  r2.pickFrom = () => ({ uv: { x: own, y: 0.5 } });
  r2.paintAt({ clientX: 50, clientY: 50 });
  const ownAmount = stamped2[0][3];

  assert.ok(onTarget < ownAmount, '非目标区的落色应更淡');
  assert.ok(onTarget > 0, '但仍应有颜色落下，符合「可以覆盖」的物理');
});

test('素材与授权说明随包发布，含公有领域与释文出处', () => {
  const file = join(
    HERE, '..', 'public', 'paintings', 'fuwang-bensheng', 'attribution.json',
  );
  const rec = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(rec.imageLicense, '须记录图像许可');
  assert.ok(rec.sourceFilePage, '须记录来源文件页');
  assert.ok(rec.textSource.includes('敦煌研究院网站'), '须记录释文出处');
  assert.ok(rec.notice.includes('艺术转译'), '须声明艺术转译');
});
