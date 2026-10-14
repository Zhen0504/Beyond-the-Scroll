import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBasicMaterial } from 'three';
import { Boat } from '../src/scenes/world/jiangshan/boats.js';
const make=(x,z,angle=0)=>new Boat({material:new MeshBasicMaterial(),x,z,angle,canopy:false,oars:false,heightAt:()=>-2,walkMap:{blocked:()=>false}});
test('backing away while steering escapes another hull without speed bouncing',()=>{
 const b=make(180,-24),o=make(180,-21.9);b.others=[b,o];o.others=[b,o];
 const start=b.motionCost(b.x,b.z,b.heading),x=b.x,z=b.z;
 for(let i=0;i<240;i++)b.update(1/60,{forward:-1,turn:1,run:false});
 assert.ok(Math.hypot(b.x-x,b.z-z)>2,'boat must move out of contact');
 assert.ok(b.motionCost(b.x,b.z,b.heading)<=start+1e-5,'overlap must not worsen');
});
test('approaching a stationary boat stops before interpenetration and can reverse away',()=>{
 const b=make(167,-24),o=make(180,-24);b.others=[b,o];
 for(let i=0;i<360;i++)b.update(1/60,{forward:1,turn:0,run:true});
 assert.ok(b.motionCost(b.x,b.z,b.heading)<1e-5,'must not pass through fisher hull');
 const x=b.x;for(let i=0;i<240;i++)b.update(1/60,{forward:-1,turn:0,run:false});
 assert.ok(b.x<x-1,'reverse must release contact');
});
