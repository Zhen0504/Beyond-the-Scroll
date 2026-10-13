import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {createOcclusionGrid} from '../src/scenes/world/jiangshan/occlusionGrid.js';

test('grid matches geometric sightlines across cells, negative coordinates and rotated walls',()=>{
 const material=new MeshBasicMaterial({side:DoubleSide}),meshes=[];
 for(let i=0;i<18;i++){const m=new Mesh(new BoxGeometry(1.5,4,.25),material);m.position.set((i%6-3)*7,2,(Math.floor(i/6)-1)*9);m.rotation.y=i*.29;m.updateMatrixWorld(true);meshes.push(m);}
 const grid=createOcclusionGrid(meshes,4),ray=new Raycaster();
 for(let i=0;i<450;i++){
  const a=new Vector3(Math.sin(i*1.31)*23,1.5+Math.cos(i*.3),Math.cos(i*.77)*17),b=new Vector3(Math.cos(i*.92)*22,1.5,Math.sin(i*.41)*16),dir=b.clone().sub(a),length=dir.length();
  ray.set(a,dir.normalize());ray.near=.15;ray.far=length-.07;
  assert.equal(grid.blocked(a,b),ray.intersectObjects(meshes,false).length>0,`ray ${i}`);
 }
 grid.dispose();meshes.forEach(m=>m.geometry.dispose());material.dispose();
});

test('queries test local geometry and ignore transparent objects',()=>{
 const material=new MeshBasicMaterial({side:DoubleSide}),meshes=[];
 for(let i=0;i<100;i++){const m=new Mesh(new BoxGeometry(1,3,1),material);m.position.set(i*20,1.5,0);meshes.push(m);}
 const glass=new Mesh(new BoxGeometry(1,3,1),new MeshBasicMaterial({transparent:true}));glass.position.set(-5,1.5,0);meshes.push(glass);
 const grid=createOcclusionGrid(meshes,5);
 assert.equal(grid.blocked(new Vector3(-7,1.5,0),new Vector3(-3,1.5,0)),false);
 assert.equal(grid.blocked(new Vector3(-2,1.5,0),new Vector3(2,1.5,0)),true);
 assert.ok(grid.lastTriangleChecks<30);
 grid.dispose();meshes.forEach(m=>m.geometry.dispose());material.dispose();glass.material.dispose();
});
