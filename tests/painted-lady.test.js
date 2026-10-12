import test from 'node:test';
import assert from 'node:assert/strict';
import { ladyViewWeights } from '../src/labs/paper-puppet/PaintedLady.js';
test('仕女正侧背视图选择正确，左右侧面对称，权重连续且总和为一',()=>{
  assert.deepEqual(ladyViewWeights(0),[1,0,0]);
  assert.deepEqual(ladyViewWeights(Math.PI/2),[0,1,0]);
  assert.deepEqual(ladyViewWeights(Math.PI),[0,0,1]);
  for(let angle=-Math.PI;angle<Math.PI;angle+=.001){
    const a=ladyViewWeights(angle),b=ladyViewWeights(angle+.001);
    assert.ok(Math.abs(a.reduce((s,v)=>s+v,0)-1)<1e-12);
    assert.ok(a.every((v,i)=>v>=0 && v<=1 && Math.abs(v-b[i])<.009));
    assert.deepEqual(a,ladyViewWeights(-angle));
  }
});

import { GAIT, travelAt } from '../src/labs/paper-puppet/gait.js';
test('纸人地面行走轨迹连续，速度由步幅步频决定，朝向沿轨迹切线',()=>{
  for(const t of [0,.5,2,5,10]){
    const e=.0001,a=travelAt(t),b=travelAt(t+e),vx=(b.x-a.x)/e,vz=(b.z-a.z)/e;
    assert.ok(Math.abs(Math.hypot(vx,vz)-GAIT.stride/(GAIT.cycle*GAIT.stance))<1e-6);
    assert.ok(Math.abs(vx/a.velocity-Math.sin(a.heading))<.0001);
    assert.ok(Math.abs(vz/a.velocity-Math.cos(a.heading))<.0001);
  }
});
