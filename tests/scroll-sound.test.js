import test from 'node:test';
import assert from 'node:assert/strict';
import { ScrollSound, scrollMotionLevel } from '../src/scenes/entry/ScrollSound.js';

function fixture({ delayed = false } = {}) {
  const timers=new Map(), listeners=new Map(); let clock=0, serial=0, resolveResume;
  const param=()=>({value:0,setTargetAtTime(v){this.value=v;},setValueAtTime(v){this.value=v;},
    linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},cancelScheduledValues(){}});
  class Context {
    sampleRate=1000; currentTime=0; state='suspended'; destination={}; sources=[];
    createBuffer(ch,n){const data=new Float32Array(n);return {getChannelData:()=>data};}
    createGain(){return {gain:param(),connect(){},disconnect(){}};}
    createBiquadFilter(){return {frequency:param(),connect(){},disconnect(){}};}
    createBufferSource(){const node={connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};this.sources.push(node);return node;}
    createOscillator(){const node=this.createBufferSource();node.frequency=param();return node;}
    resume(){if(delayed)return new Promise(r=>{resolveResume=()=>{this.state='running';r();};});this.state='running';return Promise.resolve();}
    close(){this.state='closed';return Promise.resolve();}
  }
  const env={AudioContext:Context,performance:{now:()=>clock},document:{hidden:false,
    addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n)},
    setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)};
  const sound=new ScrollSound(env);
  return {sound,env,timers,listeners,advance:ms=>clock+=ms,resolve:()=>resolveResume()};
}
test('摩擦声只响应实际运动，提速仍有电平上限',()=>{
  const p={open:0,spin:0};assert.equal(scrollMotionLevel(p,p,1),0);
  assert.ok(scrollMotionLevel(p,{open:0.1,spin:0},0.2)>0);
  assert.equal(scrollMotionLevel(p,{open:1,spin:1},0.001),0.12);
  assert.equal(scrollMotionLevel(p,p,0),0);
});
test('重复展收只有一个摩擦声，动画结束淡出并释放',async()=>{
  const f=fixture();f.sound.unlock();f.sound.begin({open:0,spin:0});await Promise.resolve();
  assert.equal(f.sound.voices.size,1);assert.equal(f.sound.paper.gain.gain.value,0);
  f.advance(100);f.sound.update({open:0.05,spin:0});assert.ok(f.sound.paper.gain.gain.value>0);
  f.advance(100);f.sound.update({open:0.05,spin:0});assert.equal(f.sound.paper.gain.gain.value,0);
  f.sound.tap();assert.equal(f.sound.voices.size,2);
  const old=f.sound.paper.source;f.sound.begin({open:1,spin:1});assert.equal(old.stopped,true);assert.equal(f.sound.voices.size,1);
  f.sound.stop();assert.equal(f.sound.active,false);
  for(const fn of [...f.timers.values()])fn();assert.equal(f.sound.voices.size,0);
  f.sound.dispose();assert.equal(f.sound.context.state,'closed');assert.equal(f.listeners.size,0);
});
test('动画结束或销毁后的晚到解锁不补播，隐藏立即停止',async()=>{
  for(const dispose of [false,true]){
    const f=fixture({delayed:true});f.sound.unlock();f.sound.begin({open:0,spin:0});
    if(dispose)f.sound.dispose();else f.sound.stop(true);
    f.resolve();await Promise.resolve();assert.equal(f.sound.voices.size,0);
    if(!dispose)f.sound.dispose();
  }
  const f=fixture();f.sound.unlock();f.sound.begin({open:0,spin:0});await Promise.resolve();
  f.env.document.hidden=true;f.listeners.get('visibilitychange')();assert.equal(f.sound.voices.size,0);assert.equal(f.sound.active,false);
  f.sound.dispose();
});
test('没有 Web Audio 时保持无声且不影响动画调用',()=>{
  const env={performance:{now:()=>0},setTimeout,clearTimeout};const sound=new ScrollSound(env);
  sound.unlock();sound.begin({open:0,spin:0});sound.update({open:1,spin:1});sound.tap();sound.stop();sound.dispose();
  assert.equal(sound.voices.size,0);
});
