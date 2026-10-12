import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ZONES } from './layout.js';
import '../hanxizai/MusicControl.css';

export default function RegionMusicControl({ music, playing = false }) {
  const state = useSyncExternalStore(music.subscribe, music.getSnapshot);
  const [open, setOpen] = useState(false);
  const root = useRef(null), trigger = useRef(null);
  const silent = !state.enabled || state.volume === 0;
  useEffect(() => { if (playing) setOpen(false); }, [playing]);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open]);
  return <div className="night-music jiangshan-music" ref={root} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation(); setOpen(false); trigger.current?.focus();
    }
  }}>
    <button type="button" ref={trigger} className="night-music__trigger" aria-label="配乐设置"
      aria-expanded={open && !playing} aria-controls="jiangshan-music-panel" disabled={playing}
      title={playing ? '按 Esc 暂停后调整配乐' : '调整配乐'} onClick={() => setOpen(!open)}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" />
        {silent ? <path d="m17 9 5 6m0-6-5 6" /> : <><path d="M16 8c2 2 2 6 0 8" /><path d="M19 5c4 4 4 10 0 14" /></>}
      </svg><span>配乐</span>
    </button>
    {open && !playing && <div className="night-music__panel" id="jiangshan-music-panel" role="group" aria-label="江山配乐">
      <div className="night-music__heading">
        <span>{ZONES[state.region].name}</span>
        <button type="button" role="switch" aria-label="背景配乐" aria-checked={state.enabled}
          disabled={state.unavailable} onClick={() => { music.unlock(); music.setEnabled(!state.enabled); }}>{state.enabled ? '开' : '关'}</button>
      </div>
      <p>轻声相伴 · 随境换曲</p>
      <label htmlFor="jiangshan-volume">音量 <output>{Math.round(state.volume * 100)}%</output></label>
      <input id="jiangshan-volume" aria-label="配乐音量" type="range" min="0" max="100" step="1"
        disabled={state.unavailable} value={Math.round(state.volume * 100)} onChange={e => music.setVolume(Number(e.target.value) / 100)} />
      {state.unavailable && <p role="status">当前浏览器无法播放配乐。</p>}
      {state.loading && <p role="status">配乐载入中，可先入画。</p>}
      {state.failed.length > 0 && <p role="status">{state.failed.map(i => ZONES[i].name).join('、')}配乐未能载入。
        <button type="button" className="night-music__start" onClick={music.retry} disabled={state.loading}>重试</button></p>}
      {state.blocked && <button type="button" className="night-music__start" onClick={music.unlock}>轻启乐声 →</button>}
      <small>按 Esc 暂停后调节，点击续游回到画中。</small>
    </div>}
  </div>;
}
