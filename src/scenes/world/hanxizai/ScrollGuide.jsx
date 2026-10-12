import { useEffect, useState } from "react";
import { ROOMS } from "./layout.js";
import "./ScrollGuide.css";

const NUMERALS = ["一", "二", "三", "四", "五"];

export default function ScrollGuide({ world, zone, active }) {
  const [reference, setReference] = useState(false);
  const room = ROOMS.find((r) => r.id === zone?.id) ?? ROOMS[0];
  useEffect(() => {
    const onKey = (e) => {
      if (
        e.code === "KeyR" &&
        !e.repeat &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)
      ) {
        setReference((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [u0, u1] = room.paintingU;
  return (
    <aside className="night-guide" aria-label="夜宴五段导览">
      {reference && (
        <figure className="night-reference" id="night-reference">
          <figcaption>
            <span>原卷 · {room.name}</span>
            <small>顾闳中《韩熙载夜宴图》宋摹本</small>
          </figcaption>
          <div
            className="night-reference__crop"
            style={{ aspectRatio: ((u1 - u0) * 5200) / 449 }}
          >
            <img
              src={`${import.meta.env.BASE_URL}paintings/hanxizai-yeyan/panorama-detail.jpg`}
              alt={`《韩熙载夜宴图》${room.name}段原画`}
              style={{
                width: `${100 / (u1 - u0)}%`,
                left: `${(-100 * u0) / (u1 - u0)}%`,
              }}
            />
          </div>
          <p>{room.note}</p>
          <small className="night-reference__note">
            屏榻依画意布置，人物遮挡处作补绘；留白与动作是游览转译。
          </small>
        </figure>
      )}
      <div className="night-guide__bar">
        <span className="night-guide__label">夜宴五折</span>
        <nav aria-label="选择夜宴段落">
          {ROOMS.map((r, i) => (
            <button
              key={r.id}
              type="button"
              aria-current={room.id === r.id ? "step" : undefined}
              aria-label={`${i + 1} · ${r.name}`}
              title={`按 ${i + 1} 前往${r.name}`}
              onClick={() => world?.visit(r.id)}
            >
              <i>{NUMERALS[i]}</i>
              <span>{r.name}</span>
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="night-guide__compare"
          aria-expanded={reference}
          aria-controls="night-reference"
          onClick={() => setReference((v) => !v)}
        >
          {reference ? "收起原卷" : "原卷对照"}
          <kbd>R</kbd>
        </button>
      </div>
      <p className="night-guide__hint">
        {active
          ? "W A S D 漫游　·　鼠标环顾　·　1—5 换折　·　Esc 暂停"
          : "可选段落入席　·　1—5 换折　·　R 对照原卷"}
      </p>
    </aside>
  );
}
