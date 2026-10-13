import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleViewPath} from '../src/scenes/world/jiangshan/paintedFigures.js';
import {createArchitecture} from '../src/scenes/world/jiangshan/architecture.js';
import {WalkMap} from '../src/engine/WalkMap.js';
import {Raycaster,Vector3} from 'three';

test('scenic walker follows height and returns along the same path',()=>{
 const pts=[[0,0,10],[3,0,6]];
 assert.deepEqual(sampleViewPath(pts,0),{x:0,z:0,y:10,reverse:false,along:0,total:5});
 assert.equal(sampleViewPath(pts,2.5).y,8);
 assert.equal(sampleViewPath(pts,7.5).reverse,true);
 assert.equal(sampleViewPath(pts,7.5).y,8);
 assert.equal(sampleViewPath(pts,10).x,0);
});

test('village room window is open, back and side are closed, room remains inaccessible',()=>{
 const map=new WalkMap({heightAt:()=>0});
 const arch=createArchitecture({atmosphere:{},heightAt:()=>0,walkMap:map});
 assert.equal(arch.rooms.length,1);const room=arch.rooms[0],mesh=arch.meshes[0];mesh.updateMatrixWorld(true);
 const c=Math.cos(room.angle),s=Math.sin(room.angle);
 const point=(x,y,z)=>new Vector3(room.x+x*c+z*s,y,room.z-x*s+z*c);
 const ray=new Raycaster();
 function hits(a,b){ray.set(a,b.clone().sub(a).normalize());ray.far=a.distanceTo(b);return ray.intersectObject(mesh).length;}
 assert.equal(hits(point(0,1.5,3),point(0,1.5,1)),0,'window must expose interior');
 assert.ok(hits(point(0,1.5,-3),point(0,1.5,-1))>0,'back must stay closed');
 assert.ok(hits(point(4,1.5,0),point(2,1.5,0))>0,'side must stay closed');
 assert.equal(map.blocked(room.x,room.z,.4,0,1.7),true);
 mesh.geometry.dispose();arch.material.dispose();
});
