import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Vector3 } from "three";
import { CHAPTERS, SOURCES } from "./story.js";
import "./ScrollGuide.css";

const NUMERALS = ["壹", "贰", "叁", "肆", "伍"];

export default function ScrollGuide({ world, onExit }) {
  const tour = world.tour;
  const state = useSyncExternalStore(tour.subscribe, tour.getSnapshot);
  const chapter = CHAPTERS[state.chapter],
    stop = chapter.stops[state.stop];
  const plate = state.phase === "plate" || state.phase === "entering";
  const moving = state.phase !== "scene";
  const [sources, setSources] = useState(false);
  const modalRef = useRef(null);
  const modal = sources || state.phase === "paused";
  const bubbleRef = useRef(null),
    enterRef = useRef(null),
    nextRef = useRef(null);
  const [u0, u1] = chapter.paintingU;
  useEffect(() => {
    if (state.phase === "plate")
      enterRef.current?.focus({ preventScroll: true });
    if (state.phase === "scene")
      nextRef.current?.focus({ preventScroll: true });
  }, [state.phase, state.chapter]);
  useEffect(() => {
    const onKey = (e) => {
      if (
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName) ||
        e.target?.isContentEditable
      )
        return;
      if (e.code === "Escape") {
        e.preventDefault();
        if (sources) setSources(false);
        else state.phase === "paused" ? tour.resume() : tour.pause();
      }
      if (sources || state.phase === "paused") return;
      const index = Number(e.code.replace("Digit", "")) - 1;
      if (e.code.startsWith("Digit") && CHAPTERS[index]) {
        e.preventDefault();
        tour.openChapter(CHAPTERS[index].id);
      }
      if (e.code === "KeyR") {
        e.preventDefault();
        tour.showPainting();
      }
      if (["ArrowUp", "KeyW", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
        tour.move(1);
      }
      if (["ArrowDown", "KeyS", "ArrowLeft"].includes(e.code)) {
        e.preventDefault();
        tour.move(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour, state.phase, sources]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const el = modalRef.current;
    const focusable = () => [
      ...el.querySelectorAll("button:not(:disabled),a[href]"),
    ];
    focusable()[0]?.focus();
    const trap = (e) => {
      if (e.key !== "Tab") return;
      const items = focusable(),
        first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener("keydown", trap);
    return () => {
      el.removeEventListener("keydown", trap);
      previous?.isConnected && previous.focus({ preventScroll: true });
    };
  }, [modal, sources]);
  useEffect(() => {
    const person = world.figures.cast.find((p) => p.id === stop.actor);
    if (!person || !bubbleRef.current) return;
    const anchor = new Vector3();
    let raf;
    function position() {
      const el = bubbleRef.current;
      if (!el) return;
      anchor
        .set(
          person.x + (person.id === "han-drum" ? 0.3 : 0),
          person.y + person.h + 0.14,
          person.z,
        )
        .project(world.camera);
      const width = window.innerWidth,
        height = window.innerHeight;
      const x = (anchor.x * 0.5 + 0.5) * width,
        y = (-anchor.y * 0.5 + 0.5) * height;
      const half = el.offsetWidth / 2;
      el.style.left = `${Math.max(half + 12, Math.min(width - half - 12, x))}px`;
      el.style.top = `${Math.max(82, Math.min(height - 255 - el.offsetHeight, y - el.offsetHeight - 10))}px`;
      el.style.visibility =
        anchor.z > -1 && anchor.z < 1 ? "visible" : "hidden";
      raf = requestAnimationFrame(position);
    }
    position();
    return () => cancelAnimationFrame(raf);
  }, [world, stop, state.phase, sources]);
  const last = state.stop === chapter.stops.length - 1;
  const next = () => {
    if (!last) tour.move(1);
    else if (state.chapter < CHAPTERS.length - 1)
      tour.openChapter(CHAPTERS[state.chapter + 1].id);
    else onExit();
  };
  return (
    <section
      className={`night-tour night-tour--${state.phase}`}
      aria-label="夜宴五折导览"
    >
      <header className="night-tour__header" inert={modal}>
        <button
          className="night-tour__home"
          onClick={onExit}
          aria-label="归卷，返回画廊"
        >
          〈 归卷
        </button>
        <nav aria-label="夜宴五折">
          {CHAPTERS.map((c, i) => (
            <button
              key={c.id}
              onClick={() => tour.openChapter(c.id)}
              aria-current={i === state.chapter ? "step" : undefined}
              aria-label={`${i + 1} · ${c.name}`}
            >
              <i>{NUMERALS[i]}</i>
              <span>{c.name}</span>
            </button>
          ))}
        </nav>
        <button
          className="night-tour__original"
          onClick={() => tour.showPainting()}
        >
          原卷 <kbd>R</kbd>
        </button>
      </header>

      {plate && (
        <div
          inert={modal || state.phase === "entering"}
          className={`night-plate ${state.phase === "entering" ? "night-plate--leaving" : ""}`}
        >
          <div className="night-plate__inner">
            <p className="night-eyebrow">
              韩熙载夜宴图 · 第{NUMERALS[state.chapter]}折
            </p>
            <h1>{chapter.name}</h1>
            <p className="night-plate__verse">{chapter.verse}</p>
            <figure className="night-plate__painting">
              <div
                className="night-plate__crop"
                style={{ aspectRatio: ((u1 - u0) * 5200) / 449 }}
              >
                <img
                  src={`${import.meta.env.BASE_URL}paintings/hanxizai-yeyan/panorama-detail.jpg`}
                  alt={`《韩熙载夜宴图》${chapter.name}段原画`}
                  style={{
                    width: `${100 / (u1 - u0)}%`,
                    left: `${(-100 * u0) / (u1 - u0)}%`,
                  }}
                />
              </div>
              <figcaption>
                顾闳中《韩熙载夜宴图》宋摹本 · 故宫博物院藏
              </figcaption>
            </figure>
            <p className="night-plate__intro">{chapter.intro}</p>
            <button
              ref={enterRef}
              className="night-primary"
              disabled={state.phase === "entering"}
              onClick={() => tour.enter()}
            >
              {chapter.enter}
              <span> →</span>
            </button>
            <p className="night-plate__hint">
              沿席前小径，逐处停留 · ↑ ↓ 前行与回看
            </p>
            <p className="night-plate__credit">
              人物动作与对白为情境创作，遮挡处作画意补绘。
              <button onClick={() => setSources(true)}>读画依据</button>
            </p>
          </div>
        </div>
      )}

      {!plate && (
        <>
          <div className="night-tour__title" aria-hidden="true">
            <span>{chapter.name}</span>
            <small>{chapter.verse}</small>
          </div>
          {stop.actor && state.phase === "scene" && !sources && (
            <div
              ref={bubbleRef}
              className="night-dialogue"
              data-actor={stop.actor}
            >
              <div className="night-dialogue__byline">
                <strong>
                  {world.figures.cast.find((p) => p.id === stop.actor)?.name}
                </strong>
                <small>情境对白</small>
              </div>
              <p className="night-dialogue__action">{stop.action}</p>
              <p className="night-dialogue__line" aria-live="polite">
                「{stop.lines[state.line]}」
              </p>
              <button onClick={() => tour.nextLine()} aria-label="再听一句">
                再听一句 <span>›</span>
              </button>
            </div>
          )}
          <footer className="night-route" inert={modal}>
            <div className="night-route__heading">
              <p>
                <small>
                  {NUMERALS[state.chapter]} /{" "}
                  {String(state.stop + 1).padStart(2, "0")}
                </small>
                {stop.title}
              </p>
              <span>{state.phase === "travel" ? "循席缓行…" : "停步观画"}</span>
            </div>
            <p className="night-route__note">{stop.note}</p>
            <div className="night-route__bottom">
              <button
                onClick={() => tour.move(-1)}
                disabled={moving || state.stop === 0}
              >
                ← 回看
              </button>
              <ol aria-label="本折游览进度">
                {chapter.stops.map((s, i) => (
                  <li
                    key={s.title}
                    aria-current={i === state.stop ? "step" : undefined}
                    title={s.title}
                  >
                    <span>{s.title}</span>
                  </li>
                ))}
              </ol>
              <button
                ref={nextRef}
                className="night-primary"
                onClick={next}
                disabled={moving}
              >
                {!last
                  ? `走近 · ${chapter.stops[state.stop + 1].title}`
                  : state.chapter < 4
                    ? `展下一折 · ${CHAPTERS[state.chapter + 1].name}`
                    : "曲终 · 合卷"}{" "}
                →
              </button>
            </div>
            <button
              className="night-route__source"
              onClick={() => setSources(true)}
            >
              读画依据 · 对白为情境创作
            </button>
          </footer>
        </>
      )}

      {state.phase === "paused" && !sources && (
        <div
          ref={modalRef}
          className="night-modal"
          role="dialog"
          aria-modal="true"
          aria-label="暂歇"
        >
          <div>
            <p className="night-eyebrow">席间暂歇</p>
            <h2>灯火尚暖</h2>
            <button
              className="night-primary"
              onClick={() => tour.resume()}
              autoFocus
            >
              继续观画
            </button>
            <button onClick={onExit}>归卷</button>
          </div>
        </div>
      )}
      {sources && (
        <div
          ref={modalRef}
          className="night-modal"
          role="dialog"
          aria-modal="true"
          aria-label="读画依据"
        >
          <div>
            <p className="night-eyebrow">画外笺</p>
            <h2>一夜，五段时光</h2>
            <p>
              章节次序、人物身份和画面解读参照故宫博物院资料。史籍对作画缘起有不同记载，这里不把窥察或劝诫的说法当作唯一事实。
            </p>
            <p>
              悬浮对话由本项目创作，并非史料原话；动作也是据画意设计。人物被遮挡的轮廓作了补绘，家具距离为观览作了调整。
            </p>
            <ul>
              {SOURCES.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title} ↗
                  </a>
                </li>
              ))}
            </ul>
            <button
              className="night-primary"
              onClick={() => setSources(false)}
              autoFocus
            >
              回到席间
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
