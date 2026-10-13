import test from 'node:test';
import assert from 'node:assert/strict';
import { regionWeights } from '../src/scenes/world/jiangshan/RegionMusic.js';
import { ZONES } from '../src/scenes/world/jiangshan/layout.js';
const edges = ZONES.slice(0, -1).map(z => z.maxX);
test('音乐使用实际地图边界，过渡带以外仅播放本区', () => {
  assert.deepEqual(regionWeights(-125, edges), [1, 0, 0]);
  assert.deepEqual(regionWeights(-99, edges), [0, 1, 0]);
  assert.deepEqual(regionWeights(87, edges), [0, 0, 1]);
  for (const [i, edge] of edges.entries()) {
    const weights = regionWeights(edge, edges);
    assert.ok(Math.abs(weights[i] - Math.SQRT1_2) < 1e-12);
    assert.ok(Math.abs(weights[i + 1] - Math.SQRT1_2) < 1e-12);
  }
});
test('连续移动与折返保持等功率，端点没有突变', () => {
  for (let x = -150; x < 110; x += 0.02) {
    const a = regionWeights(x, edges), b = regionWeights(x + 0.02, edges);
    assert.ok(Math.abs(a.reduce((s,v) => s + v*v, 0) - 1) < 1e-12);
    assert.ok(a.every((v,i) => Math.abs(v - b[i]) < 0.002));
    assert.deepEqual(a, regionWeights(x, edges));
  }
});

import { RegionMusic, makeLoop } from '../src/scenes/world/jiangshan/RegionMusic.js';
function audioFixture(initialFailure = false) {
  const timers = new Map(), handlers = new Map();
  let sequence = 0, fetchFailure = initialFailure;
  function buffer(channels = 1, length = 100, sampleRate = 10) {
    const data = Array.from({length: channels}, () => new Float32Array(length).fill(0.5));
    return { length, sampleRate, numberOfChannels: channels, duration: length/sampleRate, getChannelData: ch => data[ch] };
  }
  class Context {
    currentTime = 0; state = 'suspended'; sources = []; gains = [];
    destination = {};
    createGain() {
      const gain = { value: 0, events: [], setValueAtTime(v,t) { this.value=v; this.events.push([v,t]); },
        setTargetAtTime(v,t,tau) { this.value=v; this.events.push([v,t,tau]); }, cancelScheduledValues() {} };
      const node = { gain, connect() {}, disconnect() {} }; this.gains.push(node); return node;
    }
    createBuffer = buffer;
    decodeAudioData = async () => buffer();
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start(...args) { this.startArgs=args; }, stop() { this.stopped=true; } };
      this.sources.push(source); return source;
    }
    async resume() { this.state='running'; }
    async close() { this.state='closed'; }
  }
  const environment = { AudioContext: Context, document: { hidden: false,
    addEventListener: (n,fn) => handlers.set(n,fn), removeEventListener: n => handlers.delete(n) },
    fetch: async url => ({ ok: !(fetchFailure && url === 'b'), arrayBuffer: async () => new ArrayBuffer(1) }),
    setTimeout: fn => { timers.set(++sequence,fn); return sequence; }, clearTimeout: id => timers.delete(id) };
  const music = new RegionMusic({ urls: ['a','b','c'], boundaries: edges, environment });
  return { music, environment, handlers, timers, buffer, fail: v => { fetchFailure = v; } };
}
test('曲尾交叠接回前奏后的样本，多声道且保留首次前奏', () => {
  const f=audioFixture(), original=f.buffer(2,100,10);
  original.getChannelData(0).set(Array.from({length:100},(_,i) => i/100));
  const result=makeLoop(f.music.context,original);
  assert.equal(result.intro,2); assert.equal(result.buffer.duration,8);
  const values=result.buffer.getChannelData(0);
  assert.ok(Math.abs(values[0] - 0.2/Math.SQRT2) < 1e-6);
  assert.ok(Math.abs(values.at(-1) - 0.19/Math.SQRT2) < 1e-6);
  assert.equal(result.buffer.numberOfChannels,2);
  f.music.dispose();
});
test('入画手势启动、暂停续接与快速暂停恢复', async () => {
  const {music,timers}=audioFixture(); await music.loadPromise;
  music.setPlaying(true); assert.equal(music.context.sources.length,0);
  music.unlock(); await Promise.resolve();
  assert.equal(music.tracks[0].nodes.length,2);
  music.context.currentTime=5;
  music.setPlaying(false); assert.equal(timers.size,1);
  for (const fn of [...timers.values()]) fn(); timers.clear();
  assert.equal(music.tracks[0].phase,5); assert.equal(music.tracks[0].nodes.length,0);
  music.context.currentTime=20; music.setPlaying(true);
  assert.equal(music.tracks[0].nodes[0].startArgs[1],3);
  assert.equal(music.master.gain.value,0.35);
  const source=music.tracks[0].nodes[0];
  music.setPlaying(false); music.setPlaying(true);
  assert.equal(timers.size,0); assert.equal(music.tracks[0].nodes[0],source);
  assert.equal(music.master.gain.value,0.35);
  music.dispose();
});
test('折返不重播，远离过渡带后保存进度，页面隐藏与退出停止音源', async () => {
  const {music,environment,handlers}=audioFixture(); await music.loadPromise;
  music.unlock(); await Promise.resolve(); music.setPlaying(true);
  music.update(edges[0]); const initial=music.tracks[0].nodes[0];
  music.update(edges[0]+1); music.update(edges[0]-1);
  assert.equal(music.tracks[0].nodes[0],initial);
  music.context.currentTime=5; music.update(0);
  music.context.currentTime=7; music.update(0);
  assert.equal(music.tracks[0].nodes.length,0);
  assert.equal(music.tracks[2].nodes.length,0);
  environment.document.hidden=true; handlers.get('visibilitychange')();
  assert.ok(music.tracks.every(t=>t.nodes.length===0));
  environment.document.hidden=false; handlers.get('visibilitychange')();
  assert.ok(music.tracks[1].nodes.length>0); assert.equal(music.master.gain.value,0.35);
  music.update(0,true); assert.equal(music.master.gain.value,0.35*0.65);
  music.setEnabled(false); assert.equal(music.master.gain.value,0);
  music.setVolume(0); music.setEnabled(true); assert.equal(music.master.gain.value,0);
  music.dispose(); assert.equal(music.context.state,'closed'); assert.equal(handlers.size,0);
  music.update(200); music.unlock(); assert.ok(music.tracks.every(t=>t.nodes.length===0));
});
test('单曲下载失败可重试，卸载中的下载不继续解码播放', async () => {
  const fixture=audioFixture(true); await fixture.music.loadPromise;
  assert.deepEqual(fixture.music.state.failed,[1]); assert.ok(fixture.music.tracks[0].original);
  fixture.fail(false); fixture.music.retry(); await fixture.music.loadPromise;
  assert.deepEqual(fixture.music.state.failed,[]); fixture.music.dispose();
  const next=audioFixture(); next.music.dispose(); await next.music.loadPromise;
  assert.ok(next.music.tracks.every(t=>!t.original && t.nodes.length===0));
});


import { playbackLevel } from '../src/scenes/world/jiangshan/RegionMusic.js';
test('平均电平校正仅衰减，不放大安静曲目或静音文件', () => {
  const fixture=audioFixture(), loud=fixture.buffer(), quiet=fixture.buffer(), silent=fixture.buffer();
  quiet.getChannelData(0).fill(0.03); silent.getChannelData(0).fill(0);
  assert.ok(Math.abs(playbackLevel(loud)-0.12)<1e-6);
  assert.equal(playbackLevel(quiet),1); assert.equal(playbackLevel(silent),1);
  fixture.music.dispose();
});
