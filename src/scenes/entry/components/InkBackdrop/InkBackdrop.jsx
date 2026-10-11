import { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { MOUNTAIN_LAYERS, VIEW_H, VIEW_W, ridgePath } from './mountains.js';
import './InkBackdrop.css';

/**
 * 入口背景：夜色青黛中的水墨远山、流动的云雾、明月与飞鸟，随鼠标产生层次视差。
 */
export default function InkBackdrop() {
  const rootRef = useRef(null);
  const layers = useMemo(() => MOUNTAIN_LAYERS.map((l) => ({ ...l, d: ridgePath(l) })), []);

  useEffect(() => {
    const els = rootRef.current.querySelectorAll('[data-depth]');
    const setters = Array.from(els, (el) => ({
      depth: Number(el.dataset.depth),
      x: gsap.quickTo(el, 'x', { duration: 1.8, ease: 'power3' }),
      y: gsap.quickTo(el, 'y', { duration: 1.8, ease: 'power3' }),
    }));
    const onMove = (e) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      setters.forEach((s) => {
        s.x(-nx * s.depth * 50);
        s.y(-ny * s.depth * 18);
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  return (
    <div className="backdrop" ref={rootRef} aria-hidden="true">
      <div className="backdrop__sky" />

      <div className="backdrop__moon" data-depth="0.08">
        <i />
      </div>

      <div className="backdrop__mist backdrop__mist--high" />

      <div className="backdrop__birds">
        <svg viewBox="0 0 80 30">
          <path className="bird" d="M0 8 Q4 3 8 8 Q12 3 16 8" />
          <path className="bird bird--2" d="M26 18 Q29 14 32 18 Q35 14 38 18" />
          <path className="bird bird--3" d="M46 4 Q49 0 52 4 Q55 0 58 4" />
        </svg>
      </div>

      <svg className="backdrop__mountains" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMax slice">
        <defs>
          {layers.map((l, i) => (
            <linearGradient key={i} id={`mtn-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={l.color} stopOpacity={l.alpha} />
              <stop offset="0.5" stopColor={l.color} stopOpacity={l.alpha * 0.85} />
              <stop offset="1" stopColor={l.color} stopOpacity={l.alpha * 0.12} />
            </linearGradient>
          ))}
          {layers.map((l, i) =>
            l.blur ? (
              <filter key={i} id={`mtn-blur-${i}`} x="-5%" y="-20%" width="110%" height="140%">
                <feGaussianBlur stdDeviation={l.blur} />
              </filter>
            ) : null,
          )}
          <linearGradient id="mist-band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9aa6a2" stopOpacity="0" />
            <stop offset="0.55" stopColor="#9aa6a2" stopOpacity="0.11" />
            <stop offset="1" stopColor="#9aa6a2" stopOpacity="0" />
          </linearGradient>
        </defs>

        {layers.map((l, i) => (
          <g key={i} data-depth={l.depth}>
            <path d={l.d} fill={`url(#mtn-${i})`} filter={l.blur ? `url(#mtn-blur-${i})` : undefined} />
            {i < layers.length - 1 && (
              <rect x="-140" y={l.base - 60} width={VIEW_W + 280} height="190" fill="url(#mist-band)" />
            )}
          </g>
        ))}
      </svg>

      <div className="backdrop__mist backdrop__mist--a" />
      <div className="backdrop__mist backdrop__mist--b" />
      <div className="backdrop__mist backdrop__mist--c" />

      <div className="backdrop__grain" />
      <div className="backdrop__vignette" />
    </div>
  );
}
