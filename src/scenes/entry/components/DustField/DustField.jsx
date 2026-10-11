import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { prefersReducedMotion } from '../../../../utils/math.js';
import './DustField.css';

function makeSprite(inner, mid) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.25, mid);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/**
 * 全屏尘埃粒子层：常驻缓缓上浮的金色微尘；展卷时由木轴边缘扬起纸屑与尘埃。
 * 通过 ref 暴露 emitLine / burst，坐标均为视口像素。
 */
const DustField = forwardRef(function DustField(_props, ref) {
  const canvasRef = useRef(null);
  const particles = useRef([]);

  useImperativeHandle(
    ref,
    () => ({
      /** 沿一条水平线（木轴）发射粒子，dir：-1 向上，1 向下 */
      emitLine(x1, x2, y, count, dir = 1) {
        const n = Math.floor(count) + (Math.random() < count % 1 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          particles.current.push({
            x: x1 + Math.random() * (x2 - x1),
            y: y + (Math.random() - 0.5) * 6,
            vx: (Math.random() - 0.5) * 36,
            vy: dir * (14 + Math.random() * 52),
            life: 0,
            max: 1.1 + Math.random() * 1.7,
            size: 0.6 + Math.random() * 1.9,
            warm: Math.random() < 0.55,
          });
        }
      },
      /** 从一点向四周散开 */
      burst(x, y, spread, count) {
        for (let i = 0; i < count; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 20 + Math.random() * 70;
          particles.current.push({
            x: x + (Math.random() - 0.5) * spread,
            y: y + (Math.random() - 0.5) * spread * 0.2,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s * 0.6 - 10,
            life: 0,
            max: 1.2 + Math.random() * 1.4,
            size: 0.7 + Math.random() * 1.8,
            warm: true,
          });
        }
      },
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const goldSprite = makeSprite('rgba(255,238,196,1)', 'rgba(236,196,120,0.38)');
    const paperSprite = makeSprite('rgba(250,240,214,0.7)', 'rgba(220,200,160,0.22)');
    const reduced = prefersReducedMotion();
    let width = 0;
    let height = 0;
    let motes = [];
    let raf = 0;
    let last = performance.now();

    const seedMotes = () => {
      const count = reduced ? 0 : Math.round(Math.min(110, (width * height) / 15000));
      motes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.5 + Math.random() * 1.5,
        vy: -(3 + Math.random() * 11),
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random(),
        alpha: 0.15 + Math.random() * 0.45,
      }));
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedMotes();
    };

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      for (const m of motes) {
        m.y += m.vy * dt;
        m.x += Math.sin(now * 0.0004 * m.speed + m.phase) * 7 * dt;
        if (m.y < -10) {
          m.y = height + 10;
          m.x = Math.random() * width;
        }
        const twinkle = 0.55 + 0.45 * Math.sin(now * 0.0016 * m.speed + m.phase);
        const s = m.r * 7;
        ctx.globalAlpha = m.alpha * twinkle;
        ctx.drawImage(goldSprite, m.x - s / 2, m.y - s / 2, s, s);
      }

      const list = particles.current;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life += dt;
        if (p.life >= p.max) {
          list.splice(i, 1);
          continue;
        }
        p.vx *= 0.975;
        p.vy = p.vy * 0.975 - 9 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const t = p.life / p.max;
        const fade = Math.min(1, t * 6) * (1 - t);
        const s = p.size * 7;
        ctx.globalAlpha = fade * 0.7;
        ctx.drawImage(p.warm ? goldSprite : paperSprite, p.x - s / 2, p.y - s / 2, s, s);
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="dust-field" aria-hidden="true" />;
});

export default DustField;
