import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHAPTERS } from './story.js';
import { CAVE_QUOTES, COURSE_QUOTES, PROJECT_NOTICE, REFERENCES } from './quotes.js';
import { PIGMENTS } from './layout.js';
import { FOLD_REGIONS } from './regions.js';
import { pigmentName } from './restore.js';

/**
 * 卷三导览。
 *
 * 与原卷门页、五折导航、敷彩操作、释文依据面板。
 * 释文逐字引自敦煌研究院网站并逐条标注出处；本项目创作部分单独声明。
 */
const NUMERALS = ['壹', '贰', '叁', '肆', '伍'];

export default function FuwangGuide({ world, onExit, paintEvent }) {
  const tour = world?.tour;
  const restorer = world?.restorer;
  const state = useSync(tour);

  const [pigment, setPigment] = useState(PIGMENTS[0].id);
  const [hint, setHint] = useState(null);
  const [hintKind, setHintKind] = useState('guide');   // guide | nudge | done
  const [sources, setSources] = useState(false);
  const [lecture, setLecture] = useState(false);
  const [tick, setTick] = useState(0);                 // 订阅敷彩进度，驱动完成标记
  const [undoDepth, setUndoDepth] = useState(0);
  const hintTimer = useRef(0);

  const chapter = CHAPTERS[state.chapter] ?? CHAPTERS[0];
  const plate = ['plate', 'entering'].includes(state.phase);

  // 敷彩进度是命令式对象，用订阅把它的变化推给 React
  useEffect(() => {
    if (!restorer) return undefined;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setUndoDepth(restorer.undoStack?.length ?? 0);
    }, 200);
    // 进入时同步一次目标色区，避免初始不发光
    restorer.setPigment(restorer.pigment);
    return () => clearInterval(id);
  }, [restorer]);

  // 敷彩事件 → 提示与解锁
  useEffect(() => {
    if (!paintEvent) return;
    const show = (text, kind, ms) => {
      setHint(text);
      setHintKind(kind);
      clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(null), ms);
    };
    switch (paintEvent.type) {
      case 'off-target':
        show(paintEvent.message ?? '这一处不需要这种颜色 —— 请涂在发光的地方。', 'nudge', 4000);
        break;
      case 'idle-hint':
        show(
          paintEvent.targets?.length
            ? `发光处就是要涂的地方 —— 用${pigmentName(pigment)}涂满它们。`
            : `本折不用${pigmentName(pigment)}，换一种颜色试试。`,
          'guide',
          6500,
        );
        break;
      case 'region-done':
        show(`${paintEvent.region?.what ?? '这一段'}已足色 —— 继续涂其余发光处。`, 'done', 3200);
        break;
      case 'fold-done':
        show('本折已足色 —— 可换下一折。', 'done', 4200);
        break;
      case 'undo':
        break;
      case 'undo-empty':
        show('没有可撤销的笔触了。', 'nudge', 2500);
        break;
      case 'all-done':
        setHint(null);
        setLecture(true);
        break;
      default:
        break;
    }
  }, [paintEvent, pigment]);

  useEffect(() => () => clearTimeout(hintTimer.current), []);

  const doUndo = useCallback(() => {
    restorer?.undo();
    setUndoDepth(restorer?.undoStack?.length ?? 0);
  }, [restorer]);

  const selectPigment = useCallback(
    (id) => {
      setPigment(id);
      restorer?.setPigment(id);
    },
    [restorer],
  );

  const goFold = useCallback(
    (id) => {
      tour?.openChapter(id);
      if (restorer) {
        const i = CHAPTERS.findIndex((c) => c.id === id);
        restorer.setFold(i);
      }
    },
    [tour, restorer],
  );

  const snapshot = restorer?.snapshot?.() ?? { progress: [], done: 0, targets: [] };
  const doneCount = snapshot.progress.filter((p) => p >= 1).length;
  const foldProgress = snapshot.progress[state.chapter] ?? 0;
  const foldDone = foldProgress >= 1;
  const allDone = snapshot.progress.length > 0 && snapshot.progress.every((p) => p >= 1);
  const pct = Math.round(foldProgress * 100);

  const currentPigment = PIGMENTS.find((p) => p.id === pigment) ?? PIGMENTS[0];
  // 本折用当前颜料的目标色区。直接读 restorer，避免与快照时机不一致。
  const regionList = FOLD_REGIONS[chapter.id] ?? [];
  const targets = regionList.filter((r) => r.p === pigment);
  const regionDone = (r) => {
    const i = regionList.indexOf(r);
    return i >= 0 && (restorer?.regionProgressAt?.(state.chapter, i) ?? 0) >= 1;
  };
  // tick 由订阅定时器驱动：敷彩进度是命令式对象，需要它把变化带进渲染
  void tick;

  const sourcesList = useMemo(() => {
    const seen = new Set();
    return REFERENCES.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)));
  }, []);

  useEffect(() => {
    if (!tour) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !sources && !lecture) {
        tour.state.phase === 'paused' ? tour.resume() : tour.pause();
      }
      if (e.key === 'r' || e.key === 'R') tour.showPainting();
      if (e.key === 'l' || e.key === 'L') setLecture((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tour, sources, lecture]);

  return (
    <div className="fuwang">
      <header className="night-tour__header">
        <button className="night-tour__home" onClick={onExit} aria-label="归卷，返回画廊">
          〈 归卷
        </button>
        <nav aria-label="鹿王本生五折">
          {CHAPTERS.map((c, i) => (
            <button
              key={c.id}
              onClick={() => goFold(c.id)}
              aria-current={i === state.chapter ? 'step' : undefined}
              data-done={snapshot.progress[i] >= 1 || undefined}
              aria-label={`${i + 1} · ${c.name}`}
            >
              <i>{NUMERALS[i]}</i>
              <span>{c.name}</span>
            </button>
          ))}
        </nav>
        <div className="night-tour__utilities">
          <button className="night-tour__original" onClick={() => tour?.showPainting()}>
            原壁 <kbd>R</kbd>
          </button>
          <button className="night-tour__original" onClick={() => setSources(true)}>
            释文依据
          </button>
        </div>
      </header>

      {plate && (
        <div className={`night-plate ${state.phase === 'entering' ? 'night-plate--leaving' : ''}`}>
          <div className="night-plate__inner">
            <p className="night-eyebrow">
              鹿王本生 · 第{NUMERALS[state.chapter]}折
            </p>
            <h1>{chapter.name}</h1>
            <p className="night-plate__verse">{chapter.verse}</p>
            <figure className="night-plate__painting">
              <div
                className="night-plate__crop"
                style={{ aspectRatio: ((chapter.u1 - chapter.u0) * 6496) / 1114 }}
              >
                <img
                  src={`${import.meta.env.BASE_URL}paintings/fuwang-bensheng/panorama.jpg`}
                  alt={`莫高窟第257窟《鹿王本生》${chapter.name}段`}
                  style={{
                    width: `${100 / (chapter.u1 - chapter.u0)}%`,
                    left: `${(-100 * chapter.u0) / (chapter.u1 - chapter.u0)}%`,
                  }}
                />
              </div>
              <figcaption>莫高窟第257窟 西壁中段 · 北魏 · 横卷式连环画</figcaption>
            </figure>
            <p className="night-plate__intro">{chapter.intro}</p>
            <p className="night-plate__hint">
              <button className="fuwang__sourceslink" onClick={() => setSources(true)}>
                本折释文与依据 ↗
              </button>
            </p>
            <div className="night-plate__actions">
              <button className="night-primary" onClick={() => tour?.enter()} autoFocus>
                {chapter.enter}
              </button>
              <button onClick={onExit}>归卷</button>
            </div>
          </div>
        </div>
      )}

      {!plate && state.phase !== 'paused' && (
        <>
          <div className="fuwang__palette" role="toolbar" aria-label="矿物颜料">
            <div className="fuwang__swatches">
              {PIGMENTS.map((p, i) => (
                <button
                  key={p.id}
                  className="fuwang__swatch"
                  data-active={p.id === pigment || undefined}
                  style={{ '--swatch': p.hex }}
                  onClick={() => selectPigment(p.id)}
                  aria-pressed={p.id === pigment}
                  aria-label={`${i + 1} ${p.name}`}
                >
                  <b />
                  <span>{p.name}</span>
                  <em>{p.hint}</em>
                </button>
              ))}
            </div>

            <div
              className="fuwang__meter"
              data-done={foldDone || undefined}
              aria-label={
                foldDone
                  ? `本折已足色，全画完成 ${doneCount} / ${CHAPTERS.length}`
                  : `本折进度 ${pct}%，全画完成 ${doneCount} / ${CHAPTERS.length}`
              }
            >
              <span>{foldDone ? '本折 已足色' : `本折 ${pct}%`}</span>
              <i style={{ transform: `scaleX(${foldDone ? 1 : (snapshot.progress[state.chapter] ?? 0)})` }} />
              {/* 完成标记：常驻显示，不随提示消失 */}
              {foldDone && (
                <b className="fuwang__done" aria-hidden="true">
                  已足色
                </b>
              )}
            </div>

            <div className="fuwang__tools">
              <button
                onClick={doUndo}
                disabled={undoDepth === 0}
                aria-label={`撤销上一笔，可撤销 ${undoDepth} 步`}
              >
                撤销 <kbd>Z</kbd>
                {undoDepth > 0 && <i className="fuwang__undoCount">{undoDepth}</i>}
              </button>
              <button onClick={() => setLecture(true)}>
                释文 <kbd>L</kbd>
              </button>
            </div>
          </div>

          {/* 该涂哪里：直接列出本折用当前颜料的目标色区 */}
          {!foldDone && (
            <p className="fuwang__targetsline" role="status">
              {targets.length ? (
                <>
                  <b style={{ '--swatch': currentPigment.hex }} />
                  <span>
                    用<b>{currentPigment.name}</b>涂发光处：
                    {targets.map((r) => r.what).join(' · ')}
                  </span>
                  <em>还剩 {targets.filter((r) => !regionDone(r)).length} 处</em>
                </>
              ) : (
                <span>本折不用{currentPigment.name} —— 换一种颜色</span>
              )}
            </p>
          )}
          {hint && (
            <p className={`fuwang__hint fuwang__hint--${hintKind}`} role="status">
              {hint}
            </p>
          )}

          {/* 五折全部完成：给一个明确、常驻的收束提示 */}
          {allDone && (
            <div className="fuwang__finished" role="status">
              <b>五折已足色</b>
              <span>整幅《鹿王本生》重彩既毕 —— 可读释文</span>
              <button type="button" className="night-primary" onClick={() => setLecture(true)}>
                读全画释文
              </button>
            </div>
          )}
        </>
      )}

      {state.phase === 'paused' && (
        <div className="night-modal" role="dialog" aria-modal="true" aria-label="暂停">
          <div>
            <p className="night-eyebrow">第三卷 · 鹿王本生</p>
            <h2>{chapter.name}</h2>
            <p>{chapter.verse}</p>
            <div className="night-plate__actions">
              <button className="night-primary" onClick={() => tour?.resume()} autoFocus>
                继续敷彩
              </button>
              <button onClick={onExit}>归卷</button>
            </div>
          </div>
        </div>
      )}

      {sources && (
        <SourcePanel onClose={() => setSources(false)} list={sourcesList} chapter={chapter} />
      )}

      {lecture && !sources && (
        <LecturePanel chapter={chapter} onClose={() => setLecture(false)} allDone={doneCount >= CHAPTERS.length} />
      )}
    </div>
  );
}

/** 依据面板：引文与出处逐条列出，并声明本项目创作部分 */
function SourcePanel({ onClose, list, chapter }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
  }, []);
  return (
    <div ref={ref} className="night-modal" role="dialog" aria-modal="true" aria-label="释文与依据">
      <div>
        <p className="night-eyebrow">画外笺 · 释文与依据</p>
        <h2>释文引自敦煌研究院网站</h2>
        <p className="fuwang__quote-rule">
          以下释文逐字引自敦煌研究院网站，未作修改，出处已逐条标注。
          本项目创作的部分另行声明，不与引文混排。
        </p>
        {chapter.quotes?.length ? (
          <ul className="fuwang__quotes">
            {chapter.quotes.map((q) => (
              <li key={q.quoted.slice(0, 18)}>
                <blockquote>{q.quoted}</blockquote>
                <cite>
                  {q.credit} ·{' '}
                  <a href={q.url} target="_blank" rel="noreferrer">
                    原文 ↗
                  </a>
                </cite>
              </li>
            ))}
          </ul>
        ) : null}
        <h3>依据列表</h3>
        <ul>
          {list.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title} ↗
              </a>
            </li>
          ))}
        </ul>
        <div className="fuwang__notice">
          <strong>{PROJECT_NOTICE.title}</strong>
          {PROJECT_NOTICE.body.map((t) => (
            <p key={t.slice(0, 12)}>{t}</p>
          ))}
        </div>
        <button className="night-primary" onClick={onClose} autoFocus>
          回到壁画
        </button>
      </div>
    </div>
  );
}

/** 释文面板：完成敷彩后解锁的整幅讲解 */
function LecturePanel({ chapter, onClose, allDone }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
  }, []);
  return (
    <div ref={ref} className="night-modal" role="dialog" aria-modal="true" aria-label="释文">
      <div>
        <p className="night-eyebrow">
          {allDone ? '壁画已足 · 全画释文' : `第${chapter.name}折 · 释文`}
        </p>
        <h2>{allDone ? '九色鹿王本生' : chapter.name}</h2>

        <ul className="fuwang__quotes">
          {chapter.quotes?.map((q) => (
            <li key={q.quoted.slice(0, 18)}>
              <blockquote>{q.quoted}</blockquote>
              <cite>
                {q.credit} ·{' '}
                <a href={q.url} target="_blank" rel="noreferrer">
                  原文 ↗
                </a>
              </cite>
            </li>
          ))}
        </ul>

        {allDone && (
          <>
            <h3>洞窟</h3>
            <ul className="fuwang__quotes">
              {[CAVE_QUOTES.form, CAVE_QUOTES.layout, CAVE_QUOTES.character, CAVE_QUOTES.composition].map(
                (q) => (
                  <li key={q.quoted.slice(0, 18)}>
                    <blockquote>{q.quoted}</blockquote>
                    <cite>
                      {q.credit} ·{' '}
                      <a href={q.url} target="_blank" rel="noreferrer">
                        原文 ↗
                      </a>
                    </cite>
                  </li>
                ),
              )}
            </ul>

            <h3>这项交互的教育依据</h3>
            <p className="fuwang__aside">
              敦煌研究院的社教课程同样以「填色」引导观众认识敦煌壁画：
            </p>
            <ul className="fuwang__quotes">
              {[COURSE_QUOTES.origin, COURSE_QUOTES.method, COURSE_QUOTES.award].map((q) => (
                <li key={q.quoted.slice(0, 18)}>
                  <blockquote>{q.quoted}</blockquote>
                  <cite>
                    {q.credit} ·{' '}
                    <a href={q.url} target="_blank" rel="noreferrer">
                      原文 ↗
                    </a>
                  </cite>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="fuwang__notice">
          <strong>{PROJECT_NOTICE.title}</strong>
          {PROJECT_NOTICE.body.map((t) => (
            <p key={t.slice(0, 12)}>{t}</p>
          ))}
        </div>
        <button className="night-primary" onClick={onClose} autoFocus>
          回到壁画
        </button>
      </div>
    </div>
  );
}

/** 订阅 GuidedTour 的发布状态 */
function useSync(tour) {
  const [state, setState] = useState(() => tour?.getSnapshot?.() ?? { chapter: 0, phase: 'plate' });
  useEffect(() => {
    if (!tour?.subscribe) return undefined;
    setState(tour.getSnapshot());
    return tour.subscribe(() => setState(tour.getSnapshot()));
  }, [tour]);
  return state;
}
