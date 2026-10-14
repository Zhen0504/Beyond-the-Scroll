import { useEffect, useRef, useState } from 'react';
import { POETRY_ENCOUNTERS } from './poetryEncounters.js';
import './BridgePoetry.css';

export default function BridgePoetry({world,playing,onActive}) {
 const [near,setNear]=useState(null),[open,setOpen]=useState(false),[poem,setPoem]=useState(null),[shot,setShot]=useState(null);
 const [encounter,setEncounter]=useState(POETRY_ENCOUNTERS[0]);
 const root=useRef(null),restore=useRef(null),opened=useRef(false);
 function begin(){const e=world?.nearestPoetry?.();if(opened.current||!e)return;setEncounter(e);restore.current=document.activeElement;opened.current=true;world.beginPoetry();onActive(true);setOpen(true);}
 function close(){opened.current=false;setOpen(false);setPoem(null);setShot(null);world.endPoetry();onActive(false);world.controller.lock();restore.current?.focus?.();}
 useEffect(()=>{if(!world)return;const tick=()=>setNear(playing?world.nearestPoetry?.()??null:null);tick();const id=setInterval(tick,200);return()=>clearInterval(id);},[world,playing]);
 useEffect(()=>{const key=e=>{if(e.code==='KeyF'&&!e.repeat&&playing&&near&&!opened.current){e.preventDefault();begin();}else if(opened.current&&e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}else if(opened.current&&e.code==='Tab'){const buttons=[...root.current.querySelectorAll('button,a[href]')];const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[playing,near,world]);
 useEffect(()=>{if(open)root.current?.querySelector('button')?.focus();},[open,poem]);
 useEffect(()=>()=>{if(opened.current)world?.endPoetry();},[world]);
 function choose(p){try{setShot(world.capturePoetry());setPoem(p);}catch(err){console.error(err);close();}}
 if(!open)return playing&&near?<div className="bridge-poetry-hint"><kbd>F</kbd> {near.hint} <span>留此景，寄此情</span></div>:null;
 return <section ref={root} className={`bridge-poetry ${poem?'bridge-poetry--verse':''}`} role="dialog" aria-modal="true" aria-labelledby="bridge-poetry-title">
  {shot&&<img className="bridge-poetry-backdrop" src={shot} alt=""/>}
  <div className="bridge-poetry-wash"/>
  <button className="bridge-poetry-close" onClick={close} aria-label="收笺续游">收笺续游 <span>×</span></button>
  {!poem?<div className="bridge-poetry-question"><p className="bridge-poetry-eyebrow">{encounter.eyebrow}</p><h2 id="bridge-poetry-title">{encounter.title}</h2><p className="bridge-poetry-dialogue">{encounter.question}</p><div className="bridge-poetry-options">{encounter.choices.map((p,i)=><button key={p.id} onClick={()=>choose(p)}><span className="bridge-poetry-number">{['壹','贰','叁'][i]}</span><span><strong>{p.mood}</strong><small>{p.answer}</small></span><span aria-hidden="true">→</span></button>)}</div><p className="bridge-poetry-footnote">山水无定意，只问此刻心中所感。</p></div>:<div className={`bridge-poetry-sheet ${poem.lines.length>6?'bridge-poetry-sheet--long':''}`} key={poem.id}>
   <figure className="bridge-poetry-photo"><img src={shot} alt="选择诗词时眼前的江山秋景"/><figcaption><span>{encounter.caption}</span><span>{poem.mood}</span></figcaption></figure>
   <article className="bridge-poetry-verse"><p className="bridge-poetry-eyebrow">以景入诗 · 以诗寄情</p><h2 id="bridge-poetry-title">{poem.title}</h2><p className="bridge-poetry-author">宋 · {poem.author}</p><div className="bridge-poetry-lines">{poem.lines.map((line,i)=><p key={i} style={{'--delay':`${1.5+i*.42}s`}}>{line}</p>)}</div><p className="bridge-poetry-note" style={{'--delay':`${1.9+poem.lines.length*.42}s`}}>{poem.note}</p><a className="bridge-poetry-source" href={poem.source} target="_blank" rel="noreferrer">原文出处 ↗</a></article>
   <p className="bridge-poetry-reply"><span>{encounter.speaker}</span>{poem.reply}</p>
  </div>}
 </section>;
}
