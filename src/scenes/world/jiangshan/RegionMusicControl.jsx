import { useSyncExternalStore } from 'react';
import { ZONES } from './layout.js';

export default function RegionMusicControl({ music }) {
  const state = useSyncExternalStore(music.subscribe, music.getSnapshot);
  return <div className="jiangshan-music" role="group" aria-label="画境配乐设置">
    <p className="jiangshan-music__title">配乐 · {ZONES[state.region].name}</p>
    {state.unavailable ? <p role="status">当前浏览器无法播放配乐</p> : <>
      <div className="jiangshan-music__controls">
        <button type="button" className="ink-btn" aria-pressed={!state.enabled}
          onClick={() => { music.unlock(); music.setEnabled(!state.enabled); }}>
          {state.enabled ? '静音' : '开启配乐'}
        </button>
        <label htmlFor="jiangshan-volume">音量 <output>{Math.round(state.volume * 100)}%</output></label>
        <input id="jiangshan-volume" aria-label="配乐音量" type="range" min="0" max="100" step="1"
          value={Math.round(state.volume * 100)} onChange={e => music.setVolume(Number(e.target.value) / 100)} />
      </div>
      {state.loading && <p role="status">配乐载入中，可先入画</p>}
      {state.failed.length > 0 && <p role="status">{state.failed.map(i => ZONES[i].name).join('、')}配乐未能载入
        <button type="button" className="ink-btn" onClick={music.retry} disabled={state.loading}>重试</button>
      </p>}
      {state.blocked && <p role="status">请点击开启声音 <button type="button" className="ink-btn" onClick={music.unlock}>开启声音</button></p>}
    </>}
  </div>;
}
