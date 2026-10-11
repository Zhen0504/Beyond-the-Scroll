import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import './PaintingIntro.css';

/**
 * 展卷完成后的名画介绍。
 * ref.hide() 返回 Promise，在淡出完成后 resolve，供收卷流程衔接。
 */
const PaintingIntro = forwardRef(function PaintingIntro({ painting, onClose, onEnter }, ref) {
  const rootRef = useRef(null);
  const { info } = painting;

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .fromTo('.intro__title', { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'power2.inOut' }, 0.1)
        .from('.intro__eyebrow, .intro__meta, .intro__text, .intro__tags, .intro__actions, .intro__foot', {
          opacity: 0,
          y: 16,
          duration: 0.9,
          stagger: 0.1,
        }, 0.3)
        .fromTo('.intro__rule path', { strokeDashoffset: 420 }, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut' }, 0.5);
    }, rootRef);
    return () => ctx.revert();
  }, []);

  useImperativeHandle(ref, () => ({
    hide: () =>
      new Promise((resolve) => {
        gsap.to(rootRef.current, { opacity: 0, x: 24, duration: 0.5, ease: 'power2.in', onComplete: resolve });
      }),
  }));

  return (
    <aside className="intro" ref={rootRef} aria-labelledby="intro-title">
      <p className="intro__eyebrow">画境 · {painting.order}</p>
      <h2 className="intro__title" id="intro-title">{painting.title}</h2>
      <p className="intro__meta">
        <span>{info.dynasty} · {info.artist}</span>
        <span>{info.medium} · {info.size}</span>
        <span>{info.collection}</span>
      </p>

      <svg className="intro__rule" viewBox="0 0 400 14" preserveAspectRatio="none" aria-hidden="true">
        <path d="M2 9 C 60 4, 120 11, 200 7 S 330 4, 398 8" />
      </svg>

      <p className="intro__text">{info.summary}</p>

      <ul className="intro__tags">
        {info.tags.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      <div className="intro__actions">
        <button type="button" className="seal-btn" onClick={onEnter}>
          入画
        </button>
        <button type="button" className="ink-btn" onClick={onClose}>
          收卷
        </button>
      </div>

      <p className="intro__foot">
        {info.note}
        <br />
        {info.credit}
      </p>
    </aside>
  );
});

export default PaintingIntro;
