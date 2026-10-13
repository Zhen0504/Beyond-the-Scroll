import { useEffect, useRef, useState } from 'react';
import { buildJiangshanWorld } from './jiangshan/index.js';
import { buildHanxizaiWorld } from './hanxizai/index.js';
import { buildFuwangWorld } from './fuwang/index.js';
import ScrollGuide from './hanxizai/ScrollGuide.jsx';
import FuwangGuide from './fuwang/FuwangGuide.jsx';
import RegionMusicControl from './jiangshan/RegionMusicControl.jsx';
import './hanxizai/ScrollGuide.css';
import './WorldScene.css';
import './fuwang/Fuwang.css';

const JIANGSHAN_KEYS = [
  ['W A S D', '行走'],
  ['Shift', '疾行'],
  ['空格', '跳跃'],
  ['鼠标', '环顾'],
  ['E', '登船 / 上岸'],
  ['Esc', '暂停'],
];

const FUWANG_KEYS = [
  ['1—4', '择矿物色'],
  ['点击', '为发亮的形体敷彩'],
  ['[ ]', '换折'],
  ['Z', '撤销'],
  ['L', '读释文'],
  ['Esc', '暂停'],
];

const BUILDERS = {
  'jiangshan-qiuse': { build: buildJiangshanWorld, title: '江山秋色图', order: '壹', keys: JIANGSHAN_KEYS },
  'hanxizai-yeyan': {
    build: buildHanxizaiWorld,
    title: '韩熙载夜宴图',
    order: '贰',
    keys: [
      ['↑ ↓ / W S', '沿席前行 / 回看'],
      ['点击', '停步观画 / 再听一句'],
      ['1—5 / R', '换折 / 原卷对照'],
      ['Esc', '暂停'],
    ],
  },
  'fuwang-bensheng': {
    build: buildFuwangWorld,
    title: '鹿王本生',
    order: '叁',
    keys: FUWANG_KEYS,
  },
};

/** 采用「原卷门页 + 固定路线」的画作 */
const GUIDED = new Set(['hanxizai-yeyan', 'fuwang-bensheng']);

/**
 * 画境容器：江山采用自由漫游，夜宴采用原卷门页与固定路线。
 * status: loading | ready | playing | paused | error
 */
export default function WorldScene({ paintingId = 'jiangshan-qiuse', onExit }) {
  const def = BUILDERS[paintingId] ?? BUILDERS['jiangshan-qiuse'];
  const guided = GUIDED.has(paintingId);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const promiseRef = useRef(null);
  const worldRef = useRef(null);
  const disposeTimer = useRef(0);
  const startedRef = useRef(false);
  const [status, setStatus] = useState('loading');
  const [load, setLoad] = useState({ p: 0, label: '展绢' });
  const [zone, setZone] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [paintEvent, setPaintEvent] = useState(null);

  useEffect(() => {
    clearTimeout(disposeTimer.current);
    // StrictMode 会模拟一次卸载重挂；同一个画境只构建一次
    if (!promiseRef.current) {
      promiseRef.current = def.build({
        canvas: canvasRef.current,
        overlay: overlayRef.current,
        onProgress: (p, label) => setLoad({ p, label }),
        onLockChange: (locked) => {
          if (locked) {
            startedRef.current = true;
            setStatus('playing');
          } else if (startedRef.current) {
            setStatus('paused');
          }
        },
        onZone: (z) => setZone({ ...z, key: performance.now() }),
        onPrompt: (text) => setPrompt(text),
        onEvent: (e) => setPaintEvent({ ...e, key: performance.now() }),
      });
    }
    let active = true;
    promiseRef.current
      .then((w) => {
        if (!active) return;
        worldRef.current = w;
        if (import.meta.env.DEV) window.__world = w;
        w.start();
        setStatus((s) => (s === 'loading' ? 'ready' : s));
      })
      .catch((err) => {
        console.error(err);
        if (active) setStatus('error');
      });
    return () => {
      active = false;
      worldRef.current?.stop();
      const p = promiseRef.current;
      disposeTimer.current = setTimeout(() => {
        promiseRef.current = null;
        p?.then((w) => w.dispose()).catch(() => {});
      }, 60);
    };
  }, [def]);

  const enter = () => {
    worldRef.current?.music?.unlock();
    worldRef.current?.controller.lock();
  };

  const exit = () => {
    worldRef.current?.controller.unlock();
    onExit?.();
  };

  return (
    <div className={`world world--${status}`}>
      <canvas ref={canvasRef} className="world__canvas" onClick={guided || status === 'playing' ? undefined : enter} />
      <div ref={overlayRef} className="world__bubbles" aria-live="polite" />

      {!guided && status === 'playing' && <span className="world__reticle" aria-hidden="true" />}

      {status === 'playing' && prompt && (
        <p className="world__prompt" aria-live="polite">
          {prompt}
        </p>
      )}

      {!guided && <header className="world__badge">
        <span className="world__badge-seal">画境</span>
        <span className="world__badge-title">{def.title}</span>
      </header>}

      {!guided && zone && (
        <div className="world__zone" key={zone.key} aria-live="polite">
          <span className="world__zone-name">{zone.name}</span>
          <span className="world__zone-verse">{zone.verse}</span>
        </div>
      )}

      {paintingId === 'hanxizai-yeyan' && !['loading', 'error'].includes(status) && (
        <ScrollGuide world={worldRef.current} onExit={exit} />
      )}

      {paintingId === 'fuwang-bensheng' && !['loading', 'error'].includes(status) && (
        <FuwangGuide world={worldRef.current} onExit={exit} paintEvent={paintEvent} />
      )}

      {status === 'loading' && (
        <div className="world__overlay world__overlay--silk">
          <h2 className="world__load-title">{def.title}</h2>
          <div className="world__load-bar">
            <i style={{ transform: `scaleX(${load.p})` }} />
          </div>
          <p className="world__load-label">{load.label}…</p>
        </div>
      )}

      {!guided && (status === 'ready' || status === 'paused') && (
        <div className="world__overlay">
          <div className="world__card">
            <p className="world__card-eyebrow">{status === 'ready' ? `画境 · ${def.order ?? '壹'}` : '暂停'}</p>
            <h2 className="world__card-title">{status === 'ready' ? '人在画中' : def.title}</h2>
            <ul className="world__keys">
              {(def.keys ?? JIANGSHAN_KEYS).map(([k, label]) => (
                <li key={k}><kbd>{k}</kbd>{label}</li>
              ))}
            </ul>
            {worldRef.current?.music && <RegionMusicControl music={worldRef.current.music} />}
            <div className="world__actions">
              <button type="button" className="seal-btn" onClick={enter}>
                {status === 'ready' ? '入画' : '续游'}
              </button>
              <button type="button" className="ink-btn" onClick={exit}>
                归卷
              </button>
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="world__overlay">
          <div className="world__card">
            <h2 className="world__card-title">画境未能展开</h2>
            <p className="world__card-text">当前浏览器可能不支持 WebGL2，请更换浏览器或开启硬件加速后重试。</p>
            <div className="world__actions">
              <button type="button" className="ink-btn" onClick={onExit}>归卷</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
