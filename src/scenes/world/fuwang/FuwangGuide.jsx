import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHAPTERS } from './story.js';
import { CAVE_QUOTES, COURSE_QUOTES, PROJECT_NOTICE, REFERENCES } from './quotes.js';
import { MURAL, PIGMENTS } from './layout.js';

/**
 * 卷三导览。
 *
 * 与原卷门页、五折导航、敷彩操作、释文依据面板。
 * 释文逐字引自敦煌研究院网站并逐条标注出处；本项目创作部分单独声明。
 */
const NUMERALS = ['壹', '贰', '叁', '肆', '伍'];
const AUTO_LECTURE_KEY = 'fuwang:auto-lecture';
const PLATE_VIEW_SPAN = 0.44;

/** 门页多带一些相邻画面，既保留本折主体，也避免窄折图片被纵向撑得过高。 */
function plateWindow(chapter) {
  const span = Math.max(PLATE_VIEW_SPAN, chapter.u1 - chapter.u0);
  const center = (chapter.u0 + chapter.u1) / 2;
  const u0 = Math.max(0, Math.min(1 - span, center - span / 2));
  return { u0, u1: u0 + span, span };
}

export default function FuwangGuide({ world, onExit, paintEvent }) {
  const tour = world?.tour;
  const restorer = world?.restorer;
  const state = useSync(tour);

  const [sources, setSources] = useState(false);
  const [lecture, setLecture] = useState(false);
  const [autoLecture, setAutoLecture] = useState(() => {
    try {
      return window.localStorage.getItem(AUTO_LECTURE_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const [tick, setTick] = useState(0);   // 订阅敷彩状态，把命令式变化带进渲染
  // 最近点过的颜色，仅用于色块的高亮提示；六个色层各自独立，互不影响
  const [pigment, setPigment] = useState(PIGMENTS[0].id);
  const [feedback, setFeedback] = useState(null);
  const feedbackTimer = useRef(0);

  const chapter = CHAPTERS[state.chapter] ?? CHAPTERS[0];
  const plateCrop = plateWindow(chapter);
  const plate = ['plate', 'entering'].includes(state.phase);

  // 敷彩状态是命令式对象（restorer.filled），用定时器把变化推给 React
  useEffect(() => {
    if (!restorer) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 180);
    return () => clearInterval(id);
  }, [restorer]);

  // 敷彩事件：用极短的反馈说明「这一色改变了什么」，不判断用户对错。
  useEffect(() => {
    if (!paintEvent) return;
    const show = (text, kind = 'reveal', ms = 2800) => {
      setFeedback({ text, kind, key: paintEvent.key ?? performance.now() });
      clearTimeout(feedbackTimer.current);
      feedbackTimer.current = setTimeout(() => setFeedback(null), ms);
    };
    const color = PIGMENTS.find((p) => p.id === paintEvent.pigment);
    switch (paintEvent.type) {
      case 'color-on': {
        show(`${color?.name ?? '综合色'}色层已叠入 · 画面向重彩态推进`);
        break;
      }
      case 'color-off':
        show(`${color?.name ?? '综合色'}色层已收 · 可与残损态对照`, 'compare');
        break;
      case 'no-such-color':
        show(paintEvent.message, 'quiet', 2200);
        break;
      case 'fold-reset':
        show('本折已回到残损态', 'compare');
        break;
      case 'fold-done':
        show('本折六类色层已显 · 释文已解锁', 'done', 4200);
        if (autoLecture) setLecture(true);
        break;
      case 'all-done':
        setFeedback(null);
        if (autoLecture) setLecture(true);
        break;
      default:
        break;
    }
  }, [paintEvent, autoLecture]);

  useEffect(() => () => clearTimeout(feedbackTimer.current), []);

  /**
   * 点颜色 = 开关：未敷则整体敷上，已敷则整体还原。
   * 界面上的「当前色」只用于视觉高亮，不影响其它颜色 —— 六个色层各自独立。
   */
  const togglePigment = useCallback(
    (id) => {
      setPigment(id);
      restorer?.togglePigment(id);
      // Restorer 是命令式对象；立即刷新一次，让“已上色”标记与壁画同步出现。
      setTick((t) => t + 1);
    },
    [restorer],
  );

  const resetFold = useCallback(() => {
    restorer?.resetFold();
  }, [restorer]);

  const changeAutoLecture = useCallback((enabled) => {
    setAutoLecture(enabled);
    try {
      window.localStorage.setItem(AUTO_LECTURE_KEY, enabled ? 'on' : 'off');
    } catch {
      // 隐私模式等场景下无法持久化时，当前页面内仍然生效。
    }
  }, []);

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

  const snapshot = restorer?.snapshot?.() ?? { progress: [], done: 0 };
  const doneCount = snapshot.progress.filter((p) => p >= 1).length;
  const foldProgress = snapshot.progress[state.chapter] ?? 0;
  const foldDone = foldProgress >= 1;
  const allDone = snapshot.progress.length > 0 && snapshot.progress.every((p) => p >= 1);
  const onCount = PIGMENTS.filter((p) => restorer?.isOn?.(p.id)).length;
  const colorTotal = restorer?.colorsTotal ?? PIGMENTS.length;
  const nextChapter = CHAPTERS[state.chapter + 1] ?? null;
  // tick 由订阅定时器驱动：敷彩状态是命令式对象，需要它把变化带进渲染
  void tick;

  const sourcesList = useMemo(() => {
    const seen = new Set();
    return REFERENCES.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)));
  }, []);

  useEffect(() => {
    if (!tour) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (sources) setSources(false);
        else if (lecture) setLecture(false);
        else tour.state.phase === 'paused' ? tour.resume() : tour.pause();
      }
      if (e.key === 'o' || e.key === 'O') tour.showPainting();
      if ((e.key === 'l' || e.key === 'L') && foldDone) setLecture((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tour, sources, lecture, foldDone]);

  return (
    <div className="night-tour fuwang">
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
            原壁 <kbd>O</kbd>
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
                style={{ aspectRatio: (plateCrop.span * MURAL.texWidth) / MURAL.texHeight }}
              >
                <img
                  src={`${import.meta.env.BASE_URL}paintings/fuwang-bensheng/panorama.jpg`}
                  alt={`莫高窟第257窟《鹿王本生》${chapter.name}段`}
                  style={{
                    width: `${100 / plateCrop.span}%`,
                    left: `${(-100 * plateCrop.u0) / plateCrop.span}%`,
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
          <div className="fuwang__palette" role="toolbar" aria-label="壁画综合色层">
            <div className="fuwang__palette-title" aria-hidden="true">
              <span>壁画设色</span>
              <small>六类色层显影</small>
            </div>
            <div className="fuwang__swatches">
              {PIGMENTS.map((p, i) => {
                const on = restorer?.isOn?.(p.id) ?? false;
                return (
                  <button
                    key={p.id}
                    className="fuwang__swatch"
                    data-active={(on && p.id === pigment) || undefined}
                    data-clear={on || undefined}
                    style={{ '--swatch': p.hex }}
                    onClick={() => togglePigment(p.id)}
                    aria-pressed={on}
                    aria-label={`${i + 1} ${p.name}，${on ? '色层已显，再点收起' : '点一下叠入色层'}`}
                  >
                    <b />
                    <span>{p.name}</span>
                    <em>{on ? '已显' : '显色'}</em>
                  </button>
                );
              })}
            </div>

            <div
              className="fuwang__meter"
              data-done={foldDone || undefined}
              aria-label={`本折已敷 ${onCount} / ${colorTotal} 色，全画完成 ${doneCount} / ${CHAPTERS.length}`}
            >
              <span>
                {foldDone ? '本折 色层已显' : `本折 ${onCount}/${colorTotal} 层`}
                <small>全画 {doneCount}/{CHAPTERS.length} 折</small>
              </span>
              <i style={{ transform: `scaleX(${foldDone ? 1 : foldProgress})` }} />
              {foldDone && (
                <b className="fuwang__done" aria-hidden="true">
                  色层已显
                </b>
              )}
            </div>

            <div className="fuwang__tools">
              <button
                onClick={resetFold}
                disabled={onCount === 0}
                aria-label="还原本折，撤掉已敷的颜色"
              >
                还原 <kbd>R</kbd>
              </button>
              <button
                onClick={() => setLecture(true)}
                disabled={!foldDone}
                aria-label={foldDone ? '阅读本折释文' : '本折六类色层显影后解锁释文'}
              >
                {foldDone ? '释文' : '释文待解'} <kbd>L</kbd>
              </button>
            </div>
          </div>

          {feedback ? (
            <p
              key={feedback.key}
              className={`fuwang__feedback fuwang__feedback--${feedback.kind}`}
              role="status"
            >
              {feedback.text}
            </p>
          ) : foldDone && !allDone ? (
            <div className="fuwang__fold-complete" role="status">
              <span>第{NUMERALS[state.chapter]}折六类色层已显</span>
              <button type="button" onClick={() => setLecture(true)}>读释文</button>
              {nextChapter && (
                <button type="button" onClick={() => goFold(nextChapter.id)}>
                  下一折 · {nextChapter.name} →
                </button>
              )}
            </div>
          ) : (
            <p className="fuwang__targetsline" role="status">
              <span>
                点选综合色层，观察残损态逐层转向重彩；再点可撤回 ——
                {onCount === 0
                  ? `本折共 ${colorTotal} 色`
                  : `尚余 ${Math.max(0, colorTotal - onCount)} 色`}
              </span>
            </p>
          )}

          {/* 五折全部完成：给一个明确、常驻的收束提示 */}
          {allDone && (
            <div className="fuwang__finished" role="status">
              <b>五折色层已显</b>
              <span>整幅《鹿王本生》六类色层显影完成 —— 可读释文</span>
              <div className="fuwang__finished-actions">
                <button type="button" className="night-primary" onClick={() => setLecture(true)}>
                  读全画释文
                </button>
                <button type="button" onClick={onExit}>归卷</button>
              </div>
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
        <LecturePanel
          chapter={chapter}
          onClose={() => setLecture(false)}
          allDone={doneCount >= CHAPTERS.length}
          autoLecture={autoLecture}
          onAutoLectureChange={changeAutoLecture}
          onExit={onExit}
        />
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
function LecturePanel({ chapter, onClose, allDone, autoLecture, onAutoLectureChange, onExit }) {
  const ref = useRef(null);
  useEffect(() => {
    const panel = ref.current?.firstElementChild;
    if (panel) panel.scrollTop = 0;
    ref.current?.querySelector('button')?.focus({ preventScroll: true });
  }, []);
  return (
    <div ref={ref} className="night-modal" role="dialog" aria-modal="true" aria-label="释文">
      <div>
        <p className="night-eyebrow">
          {allDone ? '六类色层已显 · 全画释文' : `第${chapter.name}折 · 敦煌研究院网站释文`}
        </p>
        <h2>{allDone ? '九色鹿王本生' : chapter.name}</h2>

        {allDone && (
          <div className="fuwang__return-choice" role="status">
            <span>五折均已完成，可以继续阅读全画释文，也可以归卷返回画廊。</span>
            <button type="button" onClick={onExit}>归卷</button>
          </div>
        )}

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
        <label className="fuwang__auto-lecture">
          <input
            type="checkbox"
            checked={!autoLecture}
            onChange={(event) => onAutoLectureChange(!event.target.checked)}
          />
          <span>
            之后不再自动弹出
            <small>仍可点击“释文”或按 L 随时查看</small>
          </span>
        </label>
        <div className="fuwang__lecture-actions">
          <button className="night-primary" onClick={onClose}>
            回到壁画
          </button>
          {allDone && <button onClick={onExit}>归卷</button>}
        </div>
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
