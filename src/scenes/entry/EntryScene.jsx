import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { paintings } from '../../data/paintings.js';
import InkBackdrop from './components/InkBackdrop/InkBackdrop.jsx';
import DustField from './components/DustField/DustField.jsx';
import HangingScroll from './components/HangingScroll/HangingScroll.jsx';
import PaintingIntro from './components/PaintingIntro/PaintingIntro.jsx';
import { closedScrollWidth } from './layout.js';
import { closeScroll, nudgeLocked, openScroll, playIntro, relayoutOpen } from './timelines.js';
import './EntryScene.css';

/**
 * 卷轴入口场景。
 * phase: intro（入场动画）→ idle（可选择）→ opening → open（显示介绍）→ closing → idle
 */
export default function EntryScene({ onEnterWorld }) {
  const [phase, setPhase] = useState('intro');
  const [active, setActive] = useState(null);
  const [cw, setCw] = useState(closedScrollWidth);

  const sceneRef = useRef(null);
  const stageRef = useRef(null);
  const dimRef = useRef(null);
  const dustRef = useRef(null);
  const introRef = useRef(null);
  const slotRefs = useRef([]);
  const scrollRefs = useRef([]);
  const closingRef = useRef(false);

  const busy = phase !== 'idle';

  // 入场动画
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      playIntro({ scene: sceneRef.current, scrolls: scrollRefs.current }).eventCallback('onComplete', () =>
        setPhase('idle'),
      );
    }, sceneRef);
    return () => ctx.revert();
  }, []);

  // 卷起尺寸随视口变化
  useEffect(() => {
    const onResize = () => setCw(closedScrollWidth());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const timelineArgs = (index) => ({
    target: scrollRefs.current[index],
    targetSlot: slotRefs.current[index],
    others: slotRefs.current.filter((_, i) => i !== index),
    dim: dimRef.current,
    stage: stageRef.current,
    dust: dustRef.current,
  });

  const handleSelect = useCallback(
    (index) => {
      if (phase !== 'idle') return;
      const painting = paintings[index];
      if (!painting.available) {
        nudgeLocked(scrollRefs.current[index]);
        return;
      }
      setActive(index);
      setPhase('opening');
      openScroll(timelineArgs(index)).eventCallback('onComplete', () => setPhase('open'));
    },
    [phase],
  );

  const handleClose = useCallback(async () => {
    if (phase !== 'open' || closingRef.current) return;
    closingRef.current = true;
    await introRef.current?.hide();
    setPhase('closing');
    closeScroll({ ...timelineArgs(active), closedWidth: closedScrollWidth() }).eventCallback('onComplete', () => {
      closingRef.current = false;
      setActive(null);
      setPhase('idle');
    });
  }, [phase, active]);

  // 鼠标：空闲时卷轴整体轻微视差；展开后纸面随鼠标微微倾斜并有柔光
  useEffect(() => {
    if (phase !== 'idle' && phase !== 'open') return;
    const stageX = gsap.quickTo(stageRef.current, 'x', { duration: 1.4, ease: 'power3' });
    const handle = phase === 'open' ? scrollRefs.current[active] : null;
    const tiltY = handle && gsap.quickTo(handle.tilt, 'rotationY', { duration: 1.2, ease: 'power3' });
    const tiltX = handle && gsap.quickTo(handle.tilt, 'rotationX', { duration: 1.2, ease: 'power3' });

    const onMove = (e) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      if (phase === 'idle') stageX(-nx * 18);
      if (handle) {
        tiltY(nx * 6);
        tiltX(-ny * 4);
        handle.setSheen(e.clientX, e.clientY);
      }
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [phase, active]);

  // 展开状态下：Esc 收卷、窗口变化时重新摆放
  useEffect(() => {
    if (phase !== 'open') return;
    const onKey = (e) => e.key === 'Escape' && handleClose();
    const onResize = () => relayoutOpen({ target: scrollRefs.current[active], stage: stageRef.current });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [phase, active, handleClose]);

  return (
    <main className={`entry ${busy ? 'is-busy' : ''}`} ref={sceneRef} style={{ '--cw': `${cw}px` }}>
      <InkBackdrop />

      <header className="entry__title">
        <h1 className="entry__name">画中奇谭</h1>
        <span className="entry__seal">入画</span>
        <p className="entry__en">BEYOND THE SCROLL</p>
      </header>

      <p className="entry__verse" aria-hidden="true">
        <span>卷中天地一时开</span>
        <span>画里江山千载梦</span>
      </p>

      <section className="entry__stage" ref={stageRef} aria-label="绘画与壁画卷轴">
        {paintings.map((p, i) => (
          <div
            key={p.id}
            ref={(el) => (slotRefs.current[i] = el)}
            className={[
              'slot',
              !busy && 'is-hoverable',
              active === i && 'is-active',
              !p.available && 'is-locked',
            ]
              .filter(Boolean)
              .join(' ')}
            role="button"
            tabIndex={busy ? -1 : 0}
            aria-label={p.available ? `${p.title}，点击展卷` : `卷${p.order}，尚未开放`}
            onClick={() => handleSelect(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSelect(i);
              }
            }}
          >
            <div className="slot__beam" />
            <div className="slot__glow" />
            <HangingScroll ref={(el) => (scrollRefs.current[i] = el)} painting={p} index={i} closedWidth={cw} />
          </div>
        ))}
        <div className="entry__dim" ref={dimRef} />
      </section>

      <footer className="entry__hint">
        <i />
        <span>择一卷 · 入画中</span>
        <i />
      </footer>

      <DustField ref={dustRef} />

      {phase === 'open' && active !== null && (
        <PaintingIntro
          ref={introRef}
          painting={paintings[active]}
          onClose={handleClose}
          onEnter={() => onEnterWorld?.(paintings[active].id)}
        />
      )}
    </main>
  );
}
