import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, PerspectiveCamera } from 'three';
import { nearestPoetryEncounter } from '../src/scenes/world/jiangshan/poetryEncounters.js';
function npc(id,parent=new Group()){const root=new Group();parent.add(root);parent.updateMatrixWorld(true);return {def:{id},root,headY:1.5};}
function camera(){const c=new PerspectiveCamera(62,1,.2,4000);c.position.set(0,1.05,4);c.lookAt(0,1.05,0);c.updateMatrixWorld(true);return c;}
test('visible close actors trigger; walls, distant actors and looking away prevent it',()=>{
 const n=npc('poetA'),c=camera(),query=()=>nearestPoetryEncounter({npcs:[n],camera:c,isVisible:()=>true});
 assert.equal(query().id,'pavilion');
 assert.equal(nearestPoetryEncounter({npcs:[n],camera:c,isVisible:()=>false}),null);
 c.lookAt(0,1,10);c.updateMatrixWorld(true);assert.equal(query(),null);
 c.position.set(0,1.05,20);c.lookAt(0,1.05,0);c.updateMatrixWorld(true);assert.equal(query(),null);
});
test('fisher uses moving boat world position and remains available while player is on a boat',()=>{
 const boat=new Group();boat.position.set(120,0,-24);const n=npc('angler',boat),c=camera();c.position.set(120,1.05,-20);c.lookAt(120,1.05,-24);c.updateMatrixWorld(true);
 const query=()=>nearestPoetryEncounter({npcs:[n],camera:c,vehicle:{},isVisible:()=>true});assert.equal(query().id,'fisher');
 boat.position.x+=20;boat.updateMatrixWorld(true);assert.equal(query(),null);
 assert.equal(nearestPoetryEncounter({npcs:[npc('bridgeScholar')],camera:camera(),vehicle:{},isVisible:()=>true}),null);
});

test('boat guidance detects shore characters from afar without enabling distant interaction',()=>{
 const n=npc('bridgeScholar'),c=camera();c.position.set(0,1.05,32);c.lookAt(0,1.05,40);c.updateMatrixWorld(true);
 const input={npcs:[n],camera:c,vehicle:{},isVisible:()=>true};
 assert.equal(nearestPoetryEncounter(input),null);
 assert.equal(nearestPoetryEncounter({...input,range:45,allowLandFromBoat:true,requireInView:false}).id,'bridge');
 assert.equal(nearestPoetryEncounter({...input,range:28,allowLandFromBoat:true,requireInView:false}),null);
 assert.equal(nearestPoetryEncounter({...input,range:45,allowLandFromBoat:true,requireInView:false,isVisible:()=>false}),null);
});
