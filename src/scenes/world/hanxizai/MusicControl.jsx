import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { MUSIC_SCORE } from "./musicScore.js";
import "./MusicControl.css";

export default function MusicControl({
  music,
  scores = MUSIC_SCORE,
  label = "夜宴配乐",
  accompaniment = "轻声相伴 · 随折换曲",
  credit = "原创筝笛意象配乐，非古曲复原。",
}) {
  const state = useSyncExternalStore(music.subscribe, music.getSnapshot);
  const [open, setOpen] = useState(false);
  const root = useRef(null),
    trigger = useRef(null);
  const score = scores[state.chapter] ?? scores[0];
  const panelId = useId(), volumeId = useId();
  const silent = !state.enabled || state.volume === 0;
  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);
  return (
    <div
      className="night-music"
      ref={root}
      onKeyDown={(event) => {
        // Settings keystrokes must not reach a scene's navigation / painting shortcuts.
        if (open) event.stopPropagation();
        if (event.key === "Escape" && open) {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="night-music__trigger"
        aria-label="配乐设置"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <path d="M4 9h4l5-4v14l-5-4H4z" />
          {silent ? (
            <path d="m17 9 5 6m0-6-5 6" />
          ) : (
            <>
              <path d="M16 8c2 2 2 6 0 8" />
              <path d="M19 5c4 4 4 10 0 14" />
            </>
          )}
        </svg>
        <span>配乐</span>
      </button>
      {open && (
        <div
          className="night-music__panel"
          id={panelId}
          role="group"
          aria-label={label}
        >
          <div className="night-music__heading">
            <span>{score.title}</span>
            <button
              role="switch"
              aria-label="背景配乐"
              aria-checked={state.enabled}
              onClick={() => music.setEnabled(!state.enabled)}
            >
              {state.enabled ? "开" : "关"}
            </button>
          </div>
          <p>{score.color}</p>
          <label htmlFor={volumeId}>
            音量 <output>{Math.round(state.volume * 100)}%</output>
          </label>
          <input
            id={volumeId}
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(state.volume * 100)}
            aria-label="配乐音量"
            onChange={(event) =>
              music.setVolume(Number(event.target.value) / 100)
            }
          />
          {state.status === "waiting" && !silent && (
            <button
              className="night-music__start"
              onClick={() => music.activate()}
            >
              轻启乐声 →
            </button>
          )}
          {state.status === "unavailable" && (
            <p role="status">当前浏览器暂不支持播放。</p>
          )}
          <small>
            {state.status === "paused"
              ? "暂歇时，乐声也歇。"
              : accompaniment}
          </small>
          <small className="night-music__credit">
            {credit}
          </small>
        </div>
      )}
    </div>
  );
}
