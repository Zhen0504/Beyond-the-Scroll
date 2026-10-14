import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FUWANG_MUSIC_SCORE } from './musicScore.js';
import '../hanxizai/MusicControl.css';

export default function FuwangMusicControl({ music }) {
  const state = useSyncExternalStore(music.subscribe, music.getSnapshot);
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const score = FUWANG_MUSIC_SCORE[state.chapter] ?? FUWANG_MUSIC_SCORE[0];
  const silent = !state.enabled || state.volume === 0;

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open]);

  return (
    <div
      className="night-music fuwang-music"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="night-music__trigger"
        aria-label="卷三配乐设置"
        aria-expanded={open}
        aria-controls="fuwang-music-panel"
        onClick={() => setOpen(!open)}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <path d="M4 9h4l5-4v14l-5-4H4z" />
          {silent ? <path d="m17 9 5 6m0-6-5 6" /> : <><path d="M16 8c2 2 2 6 0 8" /><path d="M19 5c4 4 4 10 0 14" /></>}
        </svg>
        <span>配乐</span>
      </button>
      {open && (
        <div className="night-music__panel" id="fuwang-music-panel" role="group" aria-label="卷三背景配乐">
          <div className="night-music__heading">
            <span>{score.title}</span>
            <button
              role="switch"
              aria-label="背景配乐"
              aria-checked={state.enabled}
              onClick={() => music.setEnabled(!state.enabled)}
            >
              {state.enabled ? '开' : '关'}
            </button>
          </div>
          <p>{score.color}</p>
          <label htmlFor="fuwang-music-volume">
            音量 <output>{Math.round(state.volume * 100)}%</output>
          </label>
          <input
            id="fuwang-music-volume"
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(state.volume * 100)}
            aria-label="卷三配乐音量"
            onChange={(event) => music.setVolume(Number(event.target.value) / 100)}
          />
          {state.status === 'waiting' && !silent && (
            <button className="night-music__start" onClick={() => music.activate()}>
              轻启乐声 →
            </button>
          )}
          {state.status === 'unavailable' && <p role="status">当前浏览器暂不支持播放。</p>}
          <small>{state.status === 'paused' ? '暂停时，乐声也会停下。' : '轻声相伴 · 随折换曲'}</small>
          <small className="night-music__credit">原创五声音景，非敦煌古乐复原。</small>
        </div>
      )}
    </div>
  );
}
