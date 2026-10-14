import { useEffect, useRef, useState } from "react";
import { EPILOGUE, MYSTERIES, PEOPLE } from "./history.js";
import Citations from "./Citations.jsx";
import { ReaderLetter, ReaderLegacy } from "./ReaderLetters.jsx";

function Portrait({ world, id }) {
  const ref = useRef(null);
  useEffect(() => {
    const index = world.figures.cast.findIndex((p) => p.id === id);
    if (index < 0 || !ref.current) return;
    const canvas = ref.current,
      atlas = world.figures.atlas,
      cell = atlas.cells[index];
    const ctx = canvas.getContext("2d"),
      scale = Math.min(150 / cell.bounds.w, 180 / cell.bounds.h);
    ctx.clearRect(0, 0, 160, 190);
    ctx.drawImage(
      atlas.canvas,
      cell.u0 * atlas.canvas.width,
      (1 - cell.v1) * atlas.canvas.height,
      (cell.u1 - cell.u0) * atlas.canvas.width,
      (cell.v1 - cell.v0) * atlas.canvas.height,
      (160 - cell.bounds.w * scale) / 2,
      190 - cell.bounds.h * scale,
      cell.bounds.w * scale,
      cell.bounds.h * scale,
    );
  }, [world, id]);
  return (
    <canvas
      ref={ref}
      width="160"
      height="190"
      className="night-person__portrait"
      aria-label="本场景中的人物画意形象"
      role="img"
    />
  );
}

function Person({ person, world }) {
  return (
    <article className="night-person">
      <header>
        {person.portrait && <Portrait world={world} id={person.portrait} />}
        <div>
          <p className="night-eyebrow">{person.caption}</p>
          <h3>{person.name}</h3>
          <p>{person.years}</p>
        </div>
      </header>
      <dl>
        {[
          ["生平", person.bio],
          ["画中在做什么", person.scene],
          ["与韩熙载的关系", person.relation],
          ["辨识边界", person.boundary],
        ].map(([label, text]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      <Citations ids={person.refs} />
    </article>
  );
}

export default function NightArchive({
  kind,
  chapter,
  answers,
  onAnswer,
  onClose,
  onContinue,
  onChapter,
  world,
  initialPerson,
  continuationLabel,
  letterIndex,
  returnFromLetter,
  reception,
  onLetter,
  onCollect,
  onTakeaway,
}) {
  const [hint, setHint] = useState(false);
  const [personId, setPersonId] = useState(
    initialPerson ?? PEOPLE.find((p) => p.chapters.includes(chapter)).id,
  );
  const mystery = MYSTERIES[chapter],
    result = answers[mystery.id];
  const feedbackRef = useRef(null);
  const frameRef = useRef(null);
  useEffect(() => {
    if (kind === "letter") {
      frameRef.current.scrollTop = 0;
      frameRef.current
        .querySelector(".night-reader__nav [aria-current]")
        ?.focus({ preventScroll: true });
    }
    if (kind === "ending" && returnFromLetter) {
      // The dialog focus trap initializes in the parent effect first.
      const raf = requestAnimationFrame(() =>
        frameRef.current?.querySelector(".night-legacy")?.focus(),
      );
      return () => cancelAnimationFrame(raf);
    }
  }, [kind, letterIndex, returnFromLetter]);
  const people = PEOPLE.filter((p) => p.chapters.includes(chapter));
  const person = people.find((p) => p.id === personId) ?? people[0];
  const count = Object.values(answers).filter((a) => a.correct).length;
  function choose(i) {
    onAnswer(chapter, i);
    // Keep keyboard and screen-reader users at the newly revealed explanation.
    requestAnimationFrame(() =>
      feedbackRef.current?.focus({ preventScroll: false }),
    );
  }
  return (
    <div ref={frameRef} className={`night-archive night-archive--${kind}`}>
      <div className="night-archive__top">
        <span>韩熙载夜宴图 · 画外笺</span>
        <button onClick={onClose} aria-label="关闭画外笺">
          收笺 ×
        </button>
      </div>
      {kind === "letter" && (
        <ReaderLetter
          key={letterIndex}
          index={letterIndex}
          progress={reception}
          onSelect={onLetter}
          onCollect={onCollect}
          onClose={onClose}
        />
      )}
      {kind === "mystery" && (
        <>
          <p className="night-eyebrow">
            第 {chapter + 1} 道线索 · 已辨明 {count} / 5
          </p>
          <h2>{mystery.title}</h2>
          <div className="night-threads">
            <p>
              <b>明线 · 席间</b>
              {mystery.bright}
            </p>
            <p>
              <b>暗线 · 画外</b>
              {mystery.dark}
            </p>
          </div>
          <div className="night-evidence">
            <span>观察笺</span>
            <p>{mystery.clue}</p>
          </div>
          <h3 className="night-question">{mystery.prompt}</h3>
          <p className="night-archive__small">
            请按本题的画面或文献线索判断；人物内心不设唯一答案。
          </p>
          <div className="night-choices" role="group" aria-label="选择你的判断">
            {mystery.options.map((option, i) => (
              <button
                key={option}
                onClick={() => choose(i)}
                aria-pressed={result?.choice === i}
                data-state={
                  result?.choice === i
                    ? result.correct
                      ? "correct"
                      : "wrong"
                    : undefined
                }
              >
                <span>{"甲乙丙"[i]}</span>
                {option}
                {result?.choice === i && (
                  <em>{result.correct ? "✓" : "再想想"}</em>
                )}
              </button>
            ))}
          </div>
          {!result && (
            <button
              className="night-hint"
              onClick={() => setHint(!hint)}
              aria-expanded={hint}
            >
              ﹖ {hint ? "收起提示" : "给我一点提示"}
            </button>
          )}
          {hint && !result && (
            <p className="night-hint__text">{mystery.hint}</p>
          )}
          {result && (
            <section
              ref={feedbackRef}
              tabIndex={-1}
              className="night-reveal"
              aria-label="判断与解读"
              aria-live="polite"
            >
              <p className="night-eyebrow">
                {result.correct
                  ? "判断正确 · 线索入笺"
                  : "这次判断不对 · 看看依据"}
              </p>
              <h3>{mystery.seal}</h3>
              {!result.correct && <p>{mystery.wrong}</p>}
              <p>{mystery.reveal}</p>
              <Citations ids={mystery.refs} />
              <p className="night-reveal__next">{mystery.next}</p>
            </section>
          )}
          <div className="night-archive__actions">
            <button className="night-primary" onClick={onContinue}>
              {continuationLabel ??
                (result
                  ? chapter === 4
                    ? "读终章 · 画外余音"
                    : "展下一折"
                  : "暂存疑问 · 继续观画")}{" "}
              →
            </button>
            <button onClick={onClose}>留在这一折</button>
          </div>
        </>
      )}
      {kind === "people" && (
        <>
          <p className="night-eyebrow">席间与画外 · 人物笺</p>
          <h2>认得面孔，也认得来路</h2>
          <p className="night-archive__small">
            采用有出处的称名。无名人物不补写传记；位置辨识与生平记载分别说明。
          </p>
          <nav className="night-people-nav" aria-label="本折人物">
            {people.map((p) => (
              <button
                key={p.id}
                aria-pressed={p.id === person.id}
                onClick={() => setPersonId(p.id)}
              >
                {p.name}
              </button>
            ))}
          </nav>
          <Person person={person} world={world} />
        </>
      )}
      {kind === "ending" && (
        <>
          <p className="night-eyebrow">终章 · 画外余音</p>
          <h2>{EPILOGUE.title}</h2>
          <p className="night-archive__lead">
            看见宴乐背后的人，也看见让我们与他们相遇的人。
          </p>
          <div className="night-seals" aria-label="五折线索回顾">
            {MYSTERIES.map((m, i) => (
              <button
                key={m.id}
                onClick={() => onChapter(i)}
                data-found={answers[m.id]?.correct || undefined}
              >
                <small>
                  {String(i + 1).padStart(2, "0")} ·{" "}
                  {answers[m.id]?.correct ? "已辨明" : "可回看"}
                </small>
                {m.seal}
              </button>
            ))}
          </div>
          <article className="night-ending-copy">
            <h3>画了什么</h3>
            <p>{EPILOGUE.summary}</p>
            <Citations ids={["palace"]} />
            <h3>热闹里的另一条线</h3>
            <p>{EPILOGUE.reading}</p>
            <p>{EPILOGUE.context}</p>
            <Citations ids={["lu", "xuanhe", "song"]} />
            <details>
              <summary>另一种读画顺序</summary>
              <p>
                丁羲元根据主人衣色与出场人物，提出按一、五、二、四、三的顺序阅读，以净手段收束。这是研究意见，不是已经统一的结论；也提醒我们，长卷的叙事时间不必等于房间的空间次序。
              </p>
              <Citations ids={["ding"]} />
            </details>
            <h3>此夜之后</h3>
            <p className="night-archive__small">
              以下是人物与国家的后续历史，不是宴会次日发生的事。
            </p>
            <ol className="night-timeline">
              {EPILOGUE.after.map((event) => (
                <li key={event.date}>
                  <time>{event.date}</time>
                  <div>
                    <h4>{event.name}</h4>
                    <p>{event.text}</p>
                    <Citations ids={event.refs} />
                  </div>
                </li>
              ))}
            </ol>
            <p className="night-ending-unknown">{EPILOGUE.unknown}</p>
            <ReaderLegacy
              progress={reception}
              onLetter={onLetter}
              onTakeaway={onTakeaway}
            />
            <p className="night-ending-last">
              画里，乐声还未停。画外，新的读画人已经到来。带着依据与好奇，把这一夜继续讲下去。
            </p>
          </article>
          <div className="night-archive__actions">
            <button className="night-primary" onClick={onContinue}>
              合卷 · 返回画廊 →
            </button>
            <button onClick={onClose}>再看一眼席间</button>
          </div>
        </>
      )}
    </div>
  );
}
