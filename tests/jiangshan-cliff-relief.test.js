import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaneGeometry } from 'three';
import { applyCliffRelief, cliffReliefAmount } from '../src/scenes/world/jiangshan/cliffRelief.js';
import { heightAt } from '../src/scenes/world/jiangshan/terrain.js';
import { STRUCTURES } from '../src/scenes/world/jiangshan/layout.js';

test('仅栈道上方崖面与屋下立面有轻微凸起，板边与台顶保留',()=>{
  const side=[0,0,1];
  assert.ok(cliffReliefAmount(60,20,-65,...side)>0);
  assert.ok(cliffReliefAmount(108,6,-54,...side)>0);
  for(const [x,y,z] of [[20,20,-65],[150,20,-65],[60,3,-65],[108,12,-54],[60,50,-100],[108,6,-45]])
    assert.equal(cliffReliefAmount(x,y,z,...side),0);
  for(const [x,z,y] of STRUCTURES.plankRoad)
    assert.equal(cliffReliefAmount(x,y,z-1.15,...side),0);
  for(let x=35;x<126;x+=0.5) for(let y=0;y<55;y+=0.5) {
    const a=cliffReliefAmount(x,y,-65,...side);assert.ok(a>=0 && a<=0.78);
    assert.ok(Math.abs(a-cliffReliefAmount(x+0.001,y,-65,...side))<0.003);
  }
});
test('局部细分与位移保留所有顶点高度，其他地区的位置和法线逐值不变',()=>{
  const geo=new PlaneGeometry(120,45,96,36);geo.rotateX(-Math.PI/2);geo.translate(80,0,-67.5);
  const p=geo.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,heightAt(p.getX(i),p.getZ(i)));
  geo.computeVertexNormals();geo.deleteAttribute('uv');
  const original=new Float32Array(p.array),normal=new Float32Array(geo.attributes.normal.array),oldCount=p.count;
  const result=applyCliffRelief(geo);
  assert.ok(result.changed>100);assert.ok(result.maximum<0.78);assert.ok(geo.attributes.position.count>oldCount);
  assert.equal(geo.attributes.normal.count,geo.attributes.position.count);
  let road=0,terrace=0;
  for(let i=0;i<oldCount;i++){
    const x=original[i*3],y=original[i*3+1],z=original[i*3+2];
    assert.equal(geo.attributes.position.getY(i),y);
    if(x<34||x>126||z<-85||z>-50){
      for(let k=0;k<3;k++)assert.equal(geo.attributes.position.array[i*3+k],original[i*3+k]);
      for(let k=0;k<3;k++)assert.equal(geo.attributes.normal.array[i*3+k],normal[i*3+k]);
    }
    if(geo.attributes.position.getZ(i)!==z){if(x<96)road++;else terrace++;}
  }
  assert.ok(road>0 && terrace>0);geo.dispose();
});


