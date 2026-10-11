import { forwardRef, useId, useImperativeHandle, useRef } from 'react';
import { clamp, easeOutCubic } from '../../../../utils/math.js';

/**
 * 墨迹晕染出画：若干墨团从画心各处依次化开（湍流位移 → 毛边），
 * 墨团之外先泛起淡淡水墨，随后画面在墨团内显现。
 * 坐标以图片像素为单位，start / end 为在 ink 进度中的起止区间。
 */
const BLOBS = [
  { x: 0.5, y: 0.47, r: 1.1, start: 0, end: 1 },
  { x: 0.28, y: 0.28, r: 0.48, start: 0.06, end: 0.66 },
  { x: 0.72, y: 0.72, r: 0.5, start: 0.12, end: 0.72 },
  { x: 0.76, y: 0.24, r: 0.42, start: 0.2, end: 0.8 },
  { x: 0.24, y: 0.8, r: 0.44, start: 0.24, end: 0.86 },
];

const InkPainting = forwardRef(function InkPainting({ src, width, height }, ref) {
  const uid = `ink${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const svgRef = useRef(null);
  const imageRef = useRef(null);
  const washRef = useRef(null);
  const maskCircles = useRef([]);
  const washCircles = useRef([]);
  const last = useRef({ ink: -1, paint: -1, masked: null });

  const size = Math.max(width, height);
  const blobs = BLOBS.map((b) => ({ ...b, cx: b.x * width, cy: b.y * height, rMax: b.r * size }));

  useImperativeHandle(ref, () => ({
    update(ink, paint) {
      const prev = last.current;
      if (ink !== prev.ink) {
        prev.ink = ink;
        blobs.forEach((b, i) => {
          const t = clamp((ink - b.start) / (b.end - b.start));
          const r = b.rMax * easeOutCubic(t);
          maskCircles.current[i]?.setAttribute('r', r.toFixed(1));
          washCircles.current[i]?.setAttribute('r', (t > 0 ? r * 1.14 + size * 0.03 : 0).toFixed(1));
        });
        washRef.current?.setAttribute('opacity', (Math.sin(Math.PI * clamp(ink)) * 0.42).toFixed(3));

        // 晕染完成后撤掉遮罩，画面恢复清晰且不再消耗滤镜性能
        const masked = ink < 1;
        if (masked !== prev.masked) {
          prev.masked = masked;
          if (masked) imageRef.current?.setAttribute('mask', `url(#${uid}-mask)`);
          else imageRef.current?.removeAttribute('mask');
        }
      }
      if (paint !== prev.paint && svgRef.current) {
        prev.paint = paint;
        const p = clamp(paint);
        svgRef.current.style.filter =
          p >= 1 ? 'none' : `blur(${((1 - p) * 2.2).toFixed(2)}px) saturate(${(0.2 + 0.8 * p).toFixed(3)}) brightness(${(1.08 - 0.08 * p).toFixed(3)})`;
      }
    },
  }));

  const pad = size * 0.4;

  return (
    <svg
      ref={svgRef}
      className="ink-painting"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <filter id={`${uid}-bleed`} filterUnits="userSpaceOnUse" x={-pad} y={-pad} width={width + pad * 2} height={height + pad * 2}>
          <feTurbulence type="fractalNoise" baseFrequency="0.011 0.016" numOctaves="4" seed="11" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={size * 0.09} xChannelSelector="R" yChannelSelector="G" result="displaced" />
          <feGaussianBlur in="displaced" stdDeviation={size * 0.006} />
        </filter>
        <filter id={`${uid}-wash`} filterUnits="userSpaceOnUse" x={-pad} y={-pad} width={width + pad * 2} height={height + pad * 2}>
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="3" seed="5" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={size * 0.12} xChannelSelector="R" yChannelSelector="G" result="displaced" />
          <feGaussianBlur in="displaced" stdDeviation={size * 0.018} />
        </filter>
        <mask id={`${uid}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
          <rect width={width} height={height} fill="black" />
          <g filter={`url(#${uid}-bleed)`} fill="white">
            {blobs.map((b, i) => (
              <circle key={i} cx={b.cx} cy={b.cy} r="0" ref={(el) => (maskCircles.current[i] = el)} />
            ))}
          </g>
        </mask>
      </defs>

      <g ref={washRef} filter={`url(#${uid}-wash)`} fill="#2b2720" opacity="0">
        {blobs.map((b, i) => (
          <circle key={i} cx={b.cx} cy={b.cy} r="0" ref={(el) => (washCircles.current[i] = el)} />
        ))}
      </g>

      <image
        ref={imageRef}
        href={src}
        width={width}
        height={height}
        preserveAspectRatio="xMidYMid slice"
        mask={`url(#${uid}-mask)`}
      />
    </svg>
  );
});

export default InkPainting;
