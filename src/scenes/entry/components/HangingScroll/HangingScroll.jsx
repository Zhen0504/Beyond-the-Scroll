import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import InkPainting from './InkPainting.jsx';
import { createScrollRig } from './scrollRig.js';
import { geometryVars, paperMetrics } from './geometry.js';
import './HangingScroll.css';

/**
 * 竖向立轴。分层结构（自下而上）：
 *   光晕层 aura → 阴影层 shadow → 背景层 paper（绫绢装裱 + 宣纸纹理）
 *   → 内容层 InkPainting（古画）→ 木轴层 rod / roller（天杆、地杆、轴头）→ 系带与垂签
 *
 * 动画全部由外部（EntryScene 的时间线）通过 ref 暴露的 rig.state 驱动。
 */
const HangingScroll = forwardRef(function HangingScroll({ painting, index, closedWidth }, ref) {
  const nodes = useRef({});
  const rigRef = useRef(null);
  const swayRef = useRef(null);
  const bind = (key) => (el) => {
    nodes.current[key] = el;
  };

  const { mount, heart, ratio } = useMemo(() => paperMetrics(painting), [painting]);

  useLayoutEffect(() => {
    rigRef.current = createScrollRig(nodes.current, ratio);
    rigRef.current.state.w = closedWidth;
    rigRef.current.render();
    // closedWidth 由下一个 effect 负责同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratio]);

  useLayoutEffect(() => {
    const rig = rigRef.current;
    if (!rig || rig.detached) return;
    rig.state.w = closedWidth;
    rig.render();
  }, [closedWidth]);

  useEffect(() => () => swayRef.current?.kill(), []);

  useImperativeHandle(
    ref,
    () => ({
      get root() { return nodes.current.root; },
      get tilt() { return nodes.current.tilt; },
      get swing() { return nodes.current.swing; },
      get cord() { return nodes.current.cord; },
      get band() { return nodes.current.band; },
      get tag() { return nodes.current.tag; },
      get hint() { return nodes.current.hint; },
      get rig() { return rigRef.current; },

      /** 悬挂时的轻微晃动（以挂钉为支点的钟摆） */
      startSway() {
        swayRef.current?.kill();
        const amp = 0.9 + (index % 3) * 0.22;
        const dur = 3.6 + index * 0.45;
        const dir = index % 2 ? 1 : -1;
        swayRef.current = gsap
          .timeline()
          .to(nodes.current.swing, { rotation: amp * dir, duration: dur / 2, ease: 'sine.out' })
          .to(nodes.current.swing, { rotation: -amp * dir, duration: dur, ease: 'sine.inOut', repeat: -1, yoyo: true });
      },

      stopSway(duration = 0.6) {
        swayRef.current?.kill();
        swayRef.current = gsap.to(nodes.current.swing, { rotation: 0, duration, ease: 'power2.out' });
      },

      /** 展开后鼠标移动时纸面的柔光位置 */
      setSheen(clientX, clientY) {
        const paper = nodes.current.paper;
        const r = paper.getBoundingClientRect();
        paper.style.setProperty('--sx', `${((clientX - r.left) / r.width) * 100}%`);
        paper.style.setProperty('--sy', `${((clientY - r.top) / r.height) * 100}%`);
      },
    }),
    [index],
  );

  const style = {
    ...geometryVars(),
    '--ph-ratio': ratio,
    '--m-top': mount.top,
    '--m-bottom': mount.bottom,
    '--m-side': mount.side,
    '--m-heart': heart,
    '--brocade': painting.theme.brocade,
    '--ribbon': painting.theme.ribbon,
    '--tag': painting.theme.tag,
    '--sway-delay': `${-index * 1.3}s`,
  };

  return (
    <div className="hs" ref={bind('root')} style={style}>
      <div className="hs__tilt" ref={bind('tilt')}>
        <div className="hs__lift">
          <div className="hs__swing" ref={bind('swing')}>
            <div className="hs__aura" ref={bind('aura')} />

            {/* 挂绳与挂钉 */}
            <svg className="hs__cord" ref={bind('cord')} viewBox="0 0 100 66" preserveAspectRatio="none" aria-hidden="true">
              <path
                d="M20 54.5 L50 4 L80 54.5"
                fill="none"
                stroke="var(--cord)"
                strokeWidth="1.4"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx="50" cy="4" r="2.2" fill="#6e5432" />
              <circle cx="49.4" cy="3.4" r="1" fill="#d8bd86" />
            </svg>

            <div className="hs__shadow" ref={bind('shadow')} />

            {/* 背景层：装裱 + 纸纹；内容层：古画 */}
            <div className="hs__paper" ref={bind('paper')}>
              <div className="hs__mount">
                <div className="hs__tiantou">
                  <i className="hs__jingyan" style={{ left: '33%' }} />
                  <i className="hs__jingyan" style={{ left: '67%' }} />
                  <div className="hs__geshui hs__geshui--top" />
                </div>
                <div className="hs__heart">
                  <div className="hs__frame">
                    {painting.image && <InkPainting ref={bind('painting')} {...painting.image} />}
                  </div>
                </div>
                <div className="hs__ditou">
                  <div className="hs__geshui hs__geshui--bottom" />
                </div>
              </div>
              <div className="hs__grain" />
              <div className="hs__crease" ref={bind('crease')} />
              <div className="hs__sheen" />
            </div>

            <div className="hs__curl hs__curl--top" ref={bind('curlTop')} />
            <div className="hs__curl hs__curl--bottom" ref={bind('curlBottom')} />

            {/* 垂签：题名 + 玉璧 + 流苏 */}
            <div className="hs__tag" ref={bind('tag')}>
              <div className="hs__tag-sway">
                <span className="hs__tag-cord" />
                <div className="hs__tag-strip">
                  <span className="hs__tag-title">{painting.title}</span>
                  <span className="hs__tag-seal">{painting.order}</span>
                </div>
                <span className="hs__tag-cord hs__tag-cord--short" />
                <span className="hs__tag-jade" />
                <span className="hs__tag-tassel" />
              </div>
            </div>

            {/* 木轴层：地杆（卷体）+ 轴头 + 系带 */}
            <div className="hs__roller" ref={bind('roller')}>
              <div className="hs__core" ref={bind('core')}>
                <div className="hs__core-back" />
                <div className="hs__core-brocade" ref={bind('brocade')} />
                <div className="hs__core-shade" />
                <div className="hs__core-shine" />
              </div>
              <span className="hs__knob hs__knob--l" />
              <span className="hs__knob hs__knob--r" />
              <span className="hs__band" ref={bind('band')} />
            </div>

            {/* 木轴层：天杆 */}
            <div className="hs__rod" ref={bind('rod')}>
              <i className="hs__ring hs__ring--l" />
              <i className="hs__ring hs__ring--r" />
            </div>

            <div className="hs__hint" ref={bind('hint')}>
              {painting.available ? '点击展卷' : '此卷尚在装裱'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default HangingScroll;
