import gsap from 'gsap';
import { openScrollLayout } from './layout.js';
import { prefersReducedMotion } from '../../utils/math.js';

const speed = () => (prefersReducedMotion() ? 3 : 1);

/** 根节点在“无平移”时的视口坐标（用于把卷轴移动到视口中的指定点） */
function rootBase(root, stage) {
  const rect = root.getBoundingClientRect();
  return {
    x: rect.left - gsap.getProperty(root, 'x') - (stage ? gsap.getProperty(stage, 'x') : 0),
    y: rect.top - gsap.getProperty(root, 'y'),
  };
}

/* ------------------------------------------------------------------ */
/* 入场：背景浮现、题字落笔、三轴从高处垂落并轻晃                       */
/* ------------------------------------------------------------------ */
export function playIntro({ scene, scrolls }) {
  const q = gsap.utils.selector(scene);
  const H = window.innerHeight;
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  tl.from(q('.backdrop'), { opacity: 0, duration: 1.8, ease: 'power1.out' }, 0)
    .from(q('.backdrop__mountains'), { yPercent: 6, duration: 3, ease: 'power2.out' }, 0)
    .from(q('.backdrop__mountains g'), { opacity: 0, duration: 2.2, stagger: 0.18 }, 0.2)
    .fromTo(
      q('.entry__name'),
      { clipPath: 'inset(0% 0% 100% 0%)' },
      { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.8, ease: 'power2.inOut' },
      0.6,
    )
    .from(q('.entry__seal'), { scale: 1.8, opacity: 0, duration: 0.5, ease: 'back.out(2.4)', clearProps: 'all' }, 2.2)
    .from(q('.entry__en, .entry__verse'), { opacity: 0, duration: 1.4, stagger: 0.2, clearProps: 'opacity' }, 1.6)
    .from(q('.slot__beam, .slot__glow'), { opacity: 0, duration: 1.6, stagger: 0.1, clearProps: 'opacity' }, 1);

  scrolls.forEach((s, i) => {
    const at = 0.9 + i * 0.2;
    tl.from(s.root, { y: -H * 0.95, duration: 1.9, ease: 'power3.out' }, at).from(
      s.swing,
      { rotation: (i - 1) * 3 + 4, duration: 2.8, ease: 'elastic.out(1, 0.3)' },
      at + 0.5,
    );
  });

  tl.from(q('.entry__hint'), { opacity: 0, duration: 1.2, clearProps: 'opacity' }, '-=1.6');
  tl.call(() => scrolls.forEach((s) => s.startSway()));
  return tl.timeScale(speed());
}

/* ------------------------------------------------------------------ */
/* 展卷                                                                 */
/* ------------------------------------------------------------------ */
export function openScroll({ target, targetSlot, others, dim, stage, dust }) {
  const rig = target.rig;
  const s = rig.state;
  const layout = openScrollLayout(rig.phRatio);
  const base = rootBase(target.root, stage);
  const slotLights = targetSlot.querySelectorAll('.slot__beam, .slot__glow');

  rig.detached = true;
  target.stopSway(0.9);

  // 木轴移动时从边缘扬起尘埃
  let prevOpen = s.open;
  const emitDust = () => {
    const delta = Math.abs(s.open - prevOpen);
    prevOpen = s.open;
    if (!dust || delta < 1e-4) return;
    const m = rig.metrics;
    const p = target.root.getBoundingClientRect();
    const n = Math.min(4, delta * 240);
    dust.emitLine(p.left - m.w / 2, p.left + m.w / 2, p.top + m.yr, n * 0.5, -1);
    dust.emitLine(p.left - m.w / 2, p.left + m.w / 2, p.top + m.yb - m.d / 2, n, 1);
  };

  const tl = gsap.timeline({
    onUpdate: () => {
      rig.render();
      emitDust();
    },
  });

  // 1. 聚焦：其余卷轴隐去，所选卷轴移至中央并放大，微微后仰
  tl.addLabel('focus', 0)
    .to(stage, { x: 0, duration: 1.2, ease: 'power2.out' }, 'focus')
    .fromTo(
      others,
      { filter: 'blur(0px)' },
      { opacity: 0, y: 30, scale: 0.94, filter: 'blur(5px)', duration: 1, ease: 'power2.in', stagger: 0.06 },
      'focus',
    )
    .to(slotLights, { opacity: 0, duration: 0.8 }, 'focus')
    .to(stage.parentElement.querySelector('.entry__hint'), { opacity: 0, duration: 0.8 }, 'focus')
    .to(dim, { opacity: 1, duration: 1.6, ease: 'power1.inOut' }, 'focus')
    .to([target.cord, target.hint], { opacity: 0, duration: 0.5 }, 'focus')
    .to(target.root, { x: layout.center.x - base.x, y: layout.center.y - base.y, duration: 1.5, ease: 'power3.inOut' }, 'focus')
    .to(s, { w: layout.center.w, duration: 1.5, ease: 'power3.inOut' }, 'focus')
    .to(target.tilt, { rotationX: 16, transformPerspective: 1600, duration: 1.4, ease: 'power2.inOut' }, 'focus');

  // 2. 解带：系带松开，垂签飘落
  tl.addLabel('untie', 'focus+=1.15')
    .to(target.band, { scaleY: 0, opacity: 0, duration: 0.45, ease: 'power2.in' }, 'untie')
    .to(target.tag, { y: layout.center.w * 0.28, rotation: -7, opacity: 0, duration: 0.85, ease: 'power2.in' }, 'untie+=0.08')
    .call(
      () => {
        if (!dust) return;
        const p = target.root.getBoundingClientRect();
        dust.burst(p.left, p.top, layout.center.w * 0.5, 36);
      },
      null,
      'untie+=0.3',
    );

  // 3. 转轴：木轴缓缓旋转，松开卷体
  tl.addLabel('spin', 'untie+=0.45').to(s, { spin: 1, duration: 1.2, ease: 'sine.inOut' }, 'spin');

  // 4. 展开：宣纸由中心向上下铺开，墨迹晕染、画面显现，地杆坠底回弹
  tl.addLabel('unroll', 'spin+=0.75')
    .to(s, { open: 1, duration: 3, ease: 'power2.inOut' }, 'unroll')
    .to(target.tilt, { rotationX: 0, duration: 2.8, ease: 'power2.inOut' }, 'unroll')
    .to(s, { ink: 1, duration: 3.2, ease: 'none' }, 'unroll+=1.1')
    .to(s, { paint: 1, duration: 3.4, ease: 'power1.out' }, 'unroll+=1.1')
    .to(s, { settle: 1, duration: 0.22, ease: 'power2.out' }, 'unroll+=2.95')
    .to(s, { settle: 0, duration: 1.4, ease: 'elastic.out(1, 0.3)' }, '>');

  // 5. 让位：为介绍文字留出空间（宽屏移向左侧，窄屏缩到上半屏）
  tl.to(target.root, { x: layout.side.x - base.x, y: layout.side.y - base.y, duration: 1.3, ease: 'power3.inOut' }, 'unroll+=3.6')
    .to(s, { w: layout.side.w, duration: 1.3, ease: 'power3.inOut' }, 'unroll+=3.6');

  return tl.timeScale(speed());
}

/* ------------------------------------------------------------------ */
/* 收卷：展卷的逆过程，最后回到原位继续悬挂                              */
/* ------------------------------------------------------------------ */
export function closeScroll({ target, targetSlot, others, dim, stage, dust, closedWidth }) {
  const rig = target.rig;
  const s = rig.state;
  const layout = openScrollLayout(rig.phRatio);
  const base = rootBase(target.root, stage);
  const slotLights = targetSlot.querySelectorAll('.slot__beam, .slot__glow');
  const sceneHint = stage.parentElement.querySelector('.entry__hint');

  let prevOpen = s.open;
  const emitDust = () => {
    const delta = Math.abs(s.open - prevOpen);
    prevOpen = s.open;
    if (!dust || delta < 1e-4) return;
    const m = rig.metrics;
    const p = target.root.getBoundingClientRect();
    dust.emitLine(p.left - m.w / 2, p.left + m.w / 2, p.top + m.yb - m.d / 2, Math.min(3, delta * 200), -1);
  };

  const tl = gsap.timeline({
    onUpdate: () => {
      rig.render();
      emitDust();
    },
    onComplete: () => {
      rig.detached = false;
      target.startSway();
    },
  });

  tl.to(target.root, { x: layout.center.x - base.x, y: layout.center.y - base.y, duration: 1, ease: 'power3.inOut' }, 0)
    .to(s, { w: layout.center.w, duration: 1, ease: 'power3.inOut' }, 0)
    .to(target.tilt, { rotationX: 0, rotationY: 0, duration: 0.8, ease: 'power2.out' }, 0)
    .to(s, { paint: 0, ink: 0, duration: 1.1, ease: 'power2.in' }, 0.5)
    .to(s, { open: 0, spin: 0, duration: 2.2, ease: 'power2.inOut' }, 1)
    .to(target.band, { scaleY: 1, opacity: 1, duration: 0.45, ease: 'power2.out' }, 3.1)
    .to(target.tag, { y: 0, rotation: 0, opacity: 1, duration: 0.9, ease: 'power3.out' }, 3.2)
    .to(target.root, { x: 0, y: 0, duration: 1.4, ease: 'power3.inOut' }, 3.3)
    .to(s, { w: closedWidth, duration: 1.4, ease: 'power3.inOut' }, 3.3)
    .to(dim, { opacity: 0, duration: 1.4, ease: 'power1.inOut' }, 3.4)
    .to(others, { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 1.1, ease: 'power2.out', stagger: 0.06 }, 3.7)
    .to(slotLights, { opacity: 1, duration: 1 }, 4)
    .to(sceneHint, { opacity: 1, duration: 1 }, 4)
    .to(target.cord, { opacity: 1, duration: 0.8 }, 4.2)
    .set(others, { clearProps: 'filter,opacity,transform' })
    .set([target.hint, sceneHint, ...slotLights], { clearProps: 'opacity' });

  return tl.timeScale(speed());
}

/* ------------------------------------------------------------------ */
/* 窗口尺寸变化时，重新摆放已展开的卷轴                                   */
/* ------------------------------------------------------------------ */
export function relayoutOpen({ target, stage }) {
  const rig = target.rig;
  const { side } = openScrollLayout(rig.phRatio);
  const base = rootBase(target.root, stage);
  gsap.set(target.root, { x: side.x - base.x, y: side.y - base.y });
  rig.state.w = side.w;
  rig.render();
}

/* ------------------------------------------------------------------ */
/* 未开放的卷轴：轻轻一颤，并提示                                        */
/* ------------------------------------------------------------------ */
export function nudgeLocked(target) {
  gsap
    .timeline()
    .to(target.tilt, { rotation: 2.4, duration: 0.1, ease: 'power2.out' })
    .to(target.tilt, { rotation: -2, duration: 0.16, ease: 'power2.inOut' })
    .to(target.tilt, { rotation: 0, duration: 1, ease: 'elastic.out(1, 0.35)' });
  gsap
    .timeline()
    .to(target.hint, { opacity: 1, duration: 0.3 })
    .to(target.hint, { opacity: 0, duration: 0.8, delay: 1.6 })
    .set(target.hint, { clearProps: 'opacity' });
}
