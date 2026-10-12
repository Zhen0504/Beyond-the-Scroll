import { useEffect, useRef, useState } from 'react';
import { PaperStage } from './PaperStage.js';
import './Lab.css';

export default function Lab() {
  const [settings,setSettings]=useState(()=>({action:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'stand':'walk',paused:false,speed:1,depth:1,layers:1,travel:false,turntable:false}));
  const [error,setError]=useState(false),[loading,setLoading]=useState(true),[view,setView]=useState('free');
  const canvas=useRef(null),stage=useRef(null);
  useEffect(()=>{
    let instance,active=true;
    try{instance=new PaperStage(canvas.current,settings);stage.current=instance;instance.model.ready.then(()=>{if(active)setLoading(false);}).catch(err=>{console.error(err);if(active){setLoading(false);setError(true);}});if(import.meta.env.DEV)window.__paperLab=instance;}
    catch(err){console.error(err);setError(true);}
    return()=>{active=false;instance?.dispose();stage.current=null;};
  },[]);
  const change=patch=>{setSettings(current=>({...current,...patch}));stage.current?.setSettings(patch);};
  const cameraView=name=>{setView(name);stage.current?.view(name);};
  return <main className="paper-lab">
    <header className="lab-header"><a className="lab-brand" href="./"><span className="lab-seal">奇谭</span>画中奇谭</a><span className="lab-breadcrumb">人物试作 <i>/</i> 壹</span><a className="lab-home" href="./">返回画廊 <span>↗</span></a></header>
    <section className="lab-workspace">
      <div className="lab-stage">
        <div className="lab-title"><p>纸上衣冠 · 立于画外</p><h1>宋式<span>仕女</span></h1><div>细绘眉眼与衣纹，轻薄纸面随步而动。</div></div>
        <canvas ref={canvas} aria-label="宋式仕女绘画纸人，可拖动观察三视图并使用滚轮缩放" />
        {loading&&!error&&<div className="lab-loading" role="status">仕女立绘载入中…</div>}
        {error&&<div className="lab-error" role="alert">人物暂未展开。请开启浏览器硬件加速后刷新。</div>}
        <div className="lab-stage-footer"><span><i />绘画纸人 · 仕女</span><span>拖动旋转 <b>·</b> 滚轮缩放</span></div>
      </div>
      <aside className="lab-panel" aria-label="纸偶观察设置">
        <div className="lab-panel-heading"><span>观其形，察其步</span><small>02 / 仕女</small></div>
        <section className="lab-setting"><div className="lab-label"><h2>身姿</h2><span>双手交叠，裙摆轻动</span></div>
          <div className="lab-segments">{[['stand','静立'],['walk','行走']].map(([name,label])=><button key={name} aria-pressed={settings.action===name} onClick={()=>change({action:name,paused:false})}>{label}</button>)}</div>
          <div className="lab-playline"><button className="lab-play" disabled={error||settings.action==='stand'} onClick={()=>change({paused:!settings.paused})}>{settings.paused?'▶ 继续动作':'Ⅱ 暂停动作'}</button><span>{settings.action==='stand'?'安静立定':settings.paused?'停步细看':'缓步而行'}</span></div>
        </section>
        <section className="lab-setting"><div className="lab-label"><h2>行走方式</h2></div>
          <div className="lab-segments lab-segments--small">{[[false,'原地观察'],[true,'沿地面行走']].map(([value,label])=><button key={label} aria-pressed={settings.travel===value} onClick={()=>change({travel:value,action:'walk',paused:false})}>{label}</button>)}</div>
          <label className="lab-range" htmlFor="paper-speed"><span>步速</span><output>{settings.speed.toFixed(2)} 倍</output></label>
          <input id="paper-speed" type="range" min="0.55" max="1.3" step="0.05" value={settings.speed} onChange={e=>change({speed:Number(e.target.value)})} />
        </section>
        <section className="lab-setting"><div className="lab-label"><h2>纸的层次</h2><span>轻薄，不再强调体积</span></div>
          <label className="lab-range" htmlFor="paper-depth"><span>纸面起伏</span><output>{settings.depth.toFixed(2)} 倍</output></label>
          <input id="paper-depth" type="range" min="0.65" max="1.5" step="0.05" value={settings.depth} onChange={e=>change({depth:Number(e.target.value)})} />
          <label className="lab-range" htmlFor="paper-layers"><span>衣摆轻动</span><output>{settings.layers.toFixed(1)} 倍</output></label>
          <input id="paper-layers" type="range" min="0.5" max="1.7" step="0.1" value={settings.layers} onChange={e=>change({layers:Number(e.target.value)})} />
        </section>
        <section className="lab-setting"><div className="lab-label"><h2>换个角度</h2></div>
          <div className="lab-views">{[['front','正面'],['side','侧面'],['back','背面'],['detail','近看']].map(([name,label])=><button key={name} aria-pressed={view===name} onClick={()=>cameraView(name)}>{label}</button>)}</div>
          <label className="lab-checkbox"><input type="checkbox" checked={settings.turntable} onChange={e=>change({turntable:e.target.checked})} />缓缓环看</label>
        </section>
        <p className="lab-note">正、侧、背立绘随观察方向切换。此页为绘画纸人试作，画境人物尚未替换。</p>
      </aside>
    </section>
    <footer className="lab-footer"><span>BEYOND THE SCROLL</span><span>留住画意，轻步入景。</span></footer>
  </main>;
}

