import { useRef, useState } from "react";
import Citations from "./Citations.jsx";
import { CHAPTERS } from "./story.js";
import { LETTERS, RECEPTION_TIMELINE, TAKEAWAYS } from "./reception.js";

export function ReaderLetter({
  index,
  progress,
  onSelect,
  onCollect,
  onClose,
}) {
  const letter = LETTERS[index];
  const [opened, setOpened] = useState(progress.read.includes(letter.id));
  const responseRef = useRef(null);
  const [u0, u1] = CHAPTERS[index].paintingU;
  return (
    <>
      <p className="night-eyebrow">后世来信 · 第 {index + 1} 笺 / 五笺</p>
      <h2>{letter.title}</h2>
      <p className="night-reader__subtitle">{letter.subtitle}</p>
      <nav className="night-reader__nav" aria-label="五封后世来信">
        {LETTERS.map((entry, i) => (
          <button
            key={entry.id}
            onClick={() => onSelect(i)}
            aria-current={index === i ? "page" : undefined}
          >
            <span>{CHAPTERS[i].name}</span>
            <small>
              {progress.read.includes(entry.id) ? "已收笺" : "待读"}
            </small>
          </button>
        ))}
      </nav>
      <figure className="night-reader__painting">
        <div
          className="night-plate__crop"
          style={{ aspectRatio: ((u1 - u0) * 5200) / 449 }}
        >
          <img
            src={`${import.meta.env.BASE_URL}paintings/hanxizai-yeyan/panorama-detail.jpg`}
            alt={`故宫藏《韩熙载夜宴图》${CHAPTERS[index].name}段，用于对照观察的原画局部`}
            style={{
              width: `${100 / (u1 - u0)}%`,
              left: `${(-100 * u0) / (u1 - u0)}%`,
            }}
          />
        </div>
        <figcaption>回到原画 · {letter.observation}</figcaption>
      </figure>
      <div className="night-reader__question">
        <span>相隔千年的问答 · 今人拟写</span>
        <p>{letter.question}</p>
      </div>
      {!opened && (
        <button
          className="night-primary night-reader__unfold"
          aria-expanded={false}
          onClick={() => {
            setOpened(true);
            requestAnimationFrame(() => responseRef.current?.focus());
          }}
        >
          展开来信 · 看后人怎样寻找答案 →
        </button>
      )}
      {opened && (
        <section
          ref={responseRef}
          tabIndex={-1}
          className="night-reader__response"
          aria-label="后人的研究与守护"
        >
          {letter.paragraphs.map((part) => (
            <section key={part.title}>
              <h3>{part.title}</h3>
              <p>{part.text}</p>
              <Citations ids={part.refs} />
            </section>
          ))}
          <p className="night-reader__boundary">
            <b>把证据与想象分开</b>
            {letter.boundary}
          </p>
          <p className="night-reader__reply">{letter.reply}</p>
          <p className="night-reader__next">{letter.next}</p>
          <div className="night-archive__actions">
            <button
              className="night-primary"
              onClick={() => onCollect(letter.id)}
            >
              {progress.read.includes(letter.id)
                ? "收好此笺 · 返回"
                : "收入读画笺 · 返回"}{" "}
              →
            </button>
            <button onClick={onClose}>暂且合上</button>
          </div>
        </section>
      )}
    </>
  );
}

export function ReaderLegacy({ progress, onLetter, onTakeaway }) {
  const takeaway = TAKEAWAYS.find((t) => t.id === progress.takeaway);
  return (
    <section
      className="night-legacy"
      tabIndex={-1}
      aria-label="画卷的后世与文化传承"
    >
      <p className="night-eyebrow">夜宴之外 · 读画的接力</p>
      <h3>画中人散了，画的故事还在继续</h3>
      <p>
        有人留下题跋，有人寻回流散的画，有人护住绢上的折痕，有人把细节与出土材料对照。我们与前人的相见，经过了这些人的手。
      </p>
      <ol className="night-reader__timeline">
        {RECEPTION_TIMELINE.map((event) => (
          <li key={event.date}>
            <span>{event.date}</span>
            <div>
              <h4>{event.title}</h4>
              <p>{event.text}</p>
              <button onClick={() => onLetter(event.letter)}>
                重读这封来信 ↗
              </button>
              <Citations ids={event.refs} />
            </div>
          </li>
        ))}
      </ol>
      <p className="night-reader__count">
        已收入 {progress.read.length} / 5 笺 · 未读也可以回看
      </p>
      <div className="night-reader__collection" aria-label="读画笺收藏">
        {LETTERS.map((letter, i) => (
          <button
            key={letter.id}
            onClick={() => onLetter(i)}
            data-collected={progress.read.includes(letter.id) || undefined}
          >
            <small>
              {CHAPTERS[i].name} ·{" "}
              {progress.read.includes(letter.id) ? "已收笺" : "展开"}
            </small>
            {letter.title}
          </button>
        ))}
      </div>
      <div className="night-reader__handover">
        <p className="night-eyebrow">今天 · 接到你手中的一笺</p>
        <h3>如果把这幅画讲给下一个人</h3>
        <p>你最想从哪里说起？这里没有标准答案。</p>
        <div
          className="night-reader__takeaways"
          role="group"
          aria-label="选择你想讲述的故事"
        >
          {TAKEAWAYS.map((item) => (
            <button
              key={item.id}
              aria-pressed={progress.takeaway === item.id}
              onClick={() => onTakeaway(item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>
        <div
          className="night-reader__message"
          aria-live="polite"
          aria-atomic="true"
        >
          {takeaway ? (
            <p>{takeaway.text}</p>
          ) : (
            <p>
              从画中人的一夜，到后来人的千百次凝望，选一条你愿意继续讲述的线索。
            </p>
          )}
        </div>
        <p>
          讲好这段中国故事，可以从认真看一双手、说明一条依据开始。保留人的处境，也保留研究的疑问，让传承既有温度，也经得起追问。
        </p>
      </div>
    </section>
  );
}
