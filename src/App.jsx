import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import SvgDefs from './components/SvgDefs.jsx';
import SilkVeil from './components/SilkVeil.jsx';
import EntryScene from './scenes/entry/EntryScene.jsx';

// 画境按需加载：入口页不必下载 three.js
const WorldScene = lazy(() => import('./scenes/world/WorldScene.jsx'));

const VEIL_MS = 1000;

/** 地址哈希直达画境（便于演示与调试） */
function worldFromHash() {
  const h = window.location.hash.replace(/^#/, '');
  if (h === 'jiangshan' || h === 'jiangshan-qiuse') return { name: 'world', id: 'jiangshan-qiuse' };
  if (h === 'hanxizai' || h === 'hanxizai-yeyan') return { name: 'world', id: 'hanxizai-yeyan' };
  if (h === 'fuwang' || h === 'fuwang-bensheng' || h === 'jiuse') return { name: 'world', id: 'fuwang-bensheng' };
  return { name: 'entry' };
}

/** 场景切换：卷轴入口 ⇄ 画境，切换时以一层绢色帷幕过渡 */
export default function App() {
  const [scene, setScene] = useState(worldFromHash);
  const [veil, setVeil] = useState(false);
  const timer = useRef(0);

  const go = useCallback((next) => {
    setVeil(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setScene(next);
      requestAnimationFrame(() => setVeil(false));
    }, VEIL_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <>
      <SvgDefs />
      {scene.name === 'entry' && <EntryScene onEnterWorld={(id) => go({ name: 'world', id })} />}
      {scene.name === 'world' && (
        <Suspense fallback={<SilkVeil shown />}>
          <WorldScene paintingId={scene.id} onExit={() => go({ name: 'entry' })} />
        </Suspense>
      )}
      <SilkVeil shown={veil} />
    </>
  );
}
