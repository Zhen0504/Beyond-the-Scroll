import { CanvasTexture, DoubleSide, InstancedBufferAttribute, InstancedMesh, Object3D, PlaneGeometry, ShaderMaterial, SRGBColorSpace, Vector3 } from 'three';
import { ATMOSPHERE_GLSL, NOISE_GLSL } from '../../../engine/shaders/common.glsl.js';

/** Small brush-painted silhouettes: four wing poses, feather strokes and warm paper colours. */
function birdAtlas(){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=160;
 const c=canvas.getContext('2d');
 for(let frame=0;frame<4;frame++){
  c.save();c.translate(frame*256,0);c.lineCap='round';c.lineJoin='round';
  const lift=[-48,-12,38,-8][frame];
  function wing(side){
   c.beginPath();c.moveTo(132,83);c.bezierCurveTo(108,82+lift*.3,65,80+lift,26,78+lift);c.lineTo(65,95+lift*.65);c.bezierCurveTo(91,98+lift*.35,115,96,140,88);c.closePath();
   c.fillStyle=side?'rgba(77,74,61,.72)':'rgba(65,60,49,.87)';c.fill();
   c.strokeStyle='rgba(146,135,107,.4)';c.lineWidth=1.1;
   for(let i=0;i<6;i++){c.beginPath();c.moveTo(62+i*9,85+lift*.7-i*lift*.065);c.lineTo(72+i*9,94+lift*.55-i*lift*.04);c.stroke();}
  }
  c.save();c.translate(267,2);c.scale(-1,.86);wing(true);c.restore();wing(false);
  c.fillStyle='#615b4b';c.beginPath();c.ellipse(139,85,27,9,-.1,0,Math.PI*2);c.fill();
  c.fillStyle='#b3a78b';c.beginPath();c.ellipse(144,81,22,5,-.1,0,Math.PI*2);c.fill();
  c.strokeStyle='#6b6352';c.lineWidth=5;c.beginPath();c.moveTo(151,82);c.quadraticCurveTo(166,67,175,75);c.stroke();
  c.fillStyle='#5b5344';c.beginPath();c.ellipse(176,74,7,5,0,0,Math.PI*2);c.fill();
  c.beginPath();c.moveTo(181,73);c.lineTo(197,77);c.lineTo(181,77);c.fill();
  c.beginPath();c.moveTo(120,84);c.lineTo(96,86);c.lineTo(101,96);c.lineTo(126,89);c.fill();
  c.restore();
 }
 const t=new CanvasTexture(canvas);t.colorSpace=SRGBColorSpace;return t;
}
const flock=(count,r)=>Array.from({length:count},(_,i)=>({...r,phase:r.phase+i*.06,offset:i*2.6}));
export const BIRD_ROUTES=[
 ...flock(5,{cx:-70,cz:-75,y:106,rx:110,rz:22,speed:.014,phase:.5,scale:2.2}),
 ...flock(5,{cx:160,cz:85,y:113,rx:82,rz:20,speed:.018,phase:2.4,scale:2.3}),
 ...flock(4,{cx:-190,cz:-8,y:44,rx:39,rz:8,speed:.025,phase:0,scale:1.8}),
 ...flock(4,{cx:0,cz:-46,y:49,rx:44,rz:12,speed:.023,phase:2.1,scale:1.8}),
 ...flock(4,{cx:155,cz:-18,y:54,rx:46,rz:14,speed:.028,phase:4.2,scale:1.8})
];

export function createBirds({atmosphere}){
 const texture=birdAtlas(),geo=new PlaneGeometry(2,1.25);
 geo.setAttribute('aPhase',new InstancedBufferAttribute(new Float32Array(BIRD_ROUTES.map((_,i)=>i*1.71)),1));
 const flip=new InstancedBufferAttribute(new Float32Array(BIRD_ROUTES.length),1);geo.setAttribute('aFlip',flip);
 const material=new ShaderMaterial({side:DoubleSide,transparent:true,depthWrite:false,uniforms:{...atmosphere,tBird:{value:texture},uClock:{value:0}},
  vertexShader:`attribute float aPhase;attribute float aFlip;uniform float uClock;varying vec2 vUv;varying vec3 vWorld;varying float vFrame;varying float vFlip;
  void main(){vUv=uv;vFlip=aFlip;float t=uClock*.9+aPhase;vFrame=mod(t,5.0)<1.4?1.0:floor(mod(t*5.0,4.0));vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0);vWorld=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,
  fragmentShader:`${NOISE_GLSL}
${ATMOSPHERE_GLSL}
varying vec2 vUv;varying vec3 vWorld;varying float vFrame;varying float vFlip;uniform sampler2D tBird;
  void main(){vec2 uv=vUv;uv.x=mix(uv.x,1.0-uv.x,vFlip);vec4 c=texture2D(tBird,vec2((uv.x+vFrame)/4.0,uv.y));if(c.a<.15)discard;gl_FragColor=vec4(applyAtmosphere(c.rgb,vWorld),c.a);}`});
 const mesh=new InstancedMesh(geo,material,BIRD_ROUTES.length);mesh.frustumCulled=false;mesh.name='水墨飞鸟';mesh.userData.isPaintedPerson=true;
 const dummy=new Object3D(),right=new Vector3();let time=0;
 function update(dt,camera){
  time+=dt;material.uniforms.uClock.value=time;right.set(1,0,0).applyQuaternion(camera.quaternion);
  BIRD_ROUTES.forEach((r,i)=>{const a=time*r.speed+r.phase;
   dummy.position.set(r.cx+Math.cos(a)*r.rx,r.y+Math.sin(a*1.7+i)*2+r.offset*.35,r.cz+Math.sin(a)*r.rz+r.offset);
   dummy.quaternion.copy(camera.quaternion);dummy.rotateZ(Math.sin(a+i*.4)*.14);dummy.scale.setScalar(r.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
   flip.setX(i,(-Math.sin(a)*r.rx*right.x+Math.cos(a)*r.rz*right.z)<0?1:0);
  });mesh.instanceMatrix.needsUpdate=true;flip.needsUpdate=true;
 }
 return {mesh,update,dispose(){mesh.dispose();}};
}
