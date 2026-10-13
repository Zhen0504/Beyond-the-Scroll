import { DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial, TextureLoader, LinearFilter } from 'three';
import { ATMOSPHERE_GLSL } from '../../../engine/shaders/common.glsl.js';
import { FIGURES } from './layout.js';

const BASE = `${import.meta.env?.BASE_URL??'/'}paintings/jiangshan-qiuse/people/`;
const PORTRAITS = [[25,35,355,850],[365,40,679,847],[683,40,1015,847],[20,930,354,1503],[356,925,714,1494],[716,873,1008,1504]];
const WALKERS = [[32,8,435,430],[475,8,880,430],[918,8,1320,430],[1360,8,1765,430],[25,446,435,864],[475,446,880,864],[918,446,1320,864],[1357,446,1765,864]];
const TRAVELERS=Array.from({length:8},(_,i)=>[(i%4)*384,i<4?0:576,(i%4+1)*384,i<4?568:1024]);
const REVISED=[[80,20,375,716],[474,28,764,714],[862,22,1137,716],[20,748,434,1231],[436,726,833,1260],[868,756,1200,1254]];
const VERT = `varying vec2 vUv; varying vec3 vWorld; uniform float uMotion; uniform float uClock;uniform float uAction;
void main(){
 vUv=uv;vec3 p=position;float hem=pow(1.0-uv.y,2.0);
 float sleeves=smoothstep(.23,.34,uv.y)*(1.0-smoothstep(.64,.73,uv.y))*smoothstep(.15,.31,abs(uv.x-.5));
 p.x+=(sin(uClock*1.1+uv.y*4.0)*.015*hem+sin(uClock*1.4+uv.x*5.0)*.026*sleeves)*uMotion;
 p.y+=cos(uClock*1.4+uv.x*5.0)*.014*sleeves*uMotion;
 float hands=smoothstep(.45,.51,uv.y)*(1.0-smoothstep(.65,.70,uv.y))*(1.0-smoothstep(.23,.36,abs(uv.x-.5)));
 p.x+=sin(uClock*2.1)*.013*hands*uAction;p.y+=cos(uClock*2.1)*.012*hands*uAction;
 vec4 wp=modelMatrix*vec4(p,1.0);vWorld=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`;
const FRAG = `varying vec2 vUv; varying vec3 vWorld; uniform sampler2D uAtlas;uniform vec4 uRect;uniform float uFlip;uniform float uOpacity;
${ATMOSPHERE_GLSL}
void main(){vec2 uv=vUv;uv.x=mix(uv.x,1.0-uv.x,uFlip);vec4 c=texture2D(uAtlas,uRect.xy+uv*uRect.zw);if(c.a<0.52)discard;vec3 col=pow(max(c.rgb,vec3(.001)),vec3(1.45))*vec3(.90,.93,.90);gl_FragColor=vec4(applyAtmosphere(col,vWorld),c.a*uOpacity);}
`;

/** Arc-length movement through [x,z,y] points; ascending/descending uses the same slope. */
export function sampleViewPath(points, distance) {
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1],p[2]-points[i][2]));
  const total=lengths.reduce((a,b)=>a+b,0),cycle=((distance%(total*2))+total*2)%(total*2);
  const reverse=cycle>total;let d=reverse?total*2-cycle:cycle,along=d;
  for(let i=0;i<lengths.length;i++){
    if(d<=lengths[i]||i===lengths.length-1){const a=points[i],b=points[i+1],u=Math.min(1,d/lengths[i]);return {x:a[0]+(b[0]-a[0])*u,z:a[1]+(b[1]-a[1])*u,y:a[2]+(b[2]-a[2])*u,reverse,along,total};}d-=lengths[i];
  }
}

export async function createPaintedFigures({ atmosphere, walkMap, rooms, viewPaths }) {
  const loader=new TextureLoader();const [portraits,walkers,travelers,revised]=await Promise.all([loader.loadAsync(BASE+'portraits-v1.png'),loader.loadAsync(BASE+'walkers-v1.png'),loader.loadAsync(BASE+'traveler-boy-v1.png'),loader.loadAsync(BASE+'portraits-v2.png')]);
  // Tight sprite regions have no gutter for mip-level averaging with neighbouring frames.
  for(const t of [portraits,walkers,travelers,revised]){t.generateMipmaps=false;t.minFilter=LinearFilter;}
  const group=new Group(),npcs=[],people=[];
  function makePerson(kind,pose='stand',variant=0) {
    let cell=kind==='fisher'?3:kind==='monk'?5:kind==='wifeB'?2:kind==='wifeA'||kind==='villager'?1:pose==='sit'?4:0;
    const fresh=kind==='scholar'||kind==='wifeA'||kind==='wifeB';
    if(fresh)cell=kind==='wifeA'?4:kind==='wifeB'?5:pose==='sit'?3:variant;
    const extra=kind==='traveler'||kind==='boy',animated=kind==='porter'||kind==='rider'||extra;
    const h=animated?(kind==='boy'?1.15:kind==='rider'?2.25:1.85):kind==='fisher'?1.03:pose==='sit'?1.15:kind==='wifeA'?1.45:kind==='wifeB'?1.30:1.78;
    const offset=kind==='rider'||kind==='boy'?4:0;
    const b=fresh?REVISED[cell]:extra?TRAVELERS[offset]:animated?WALKERS[offset]:PORTRAITS[cell];
    const uniforms={...atmosphere,uAtlas:{value:fresh?revised:extra?travelers:animated?walkers:portraits},uRect:{value:[0,0,1,1]},uFlip:{value:0},uOpacity:{value:1},uMotion:{value:animated?0:1},uClock:{value:0},uAction:{value:kind==='wifeA'?1:kind==='wifeB'?.5:0}};
    const material=new ShaderMaterial({uniforms,vertexShader:VERT,fragmentShader:FRAG,transparent:true,depthWrite:true,side:DoubleSide});
    const geometry=new PlaneGeometry(h*(b[2]-b[0])/(b[3]-b[1]),h,12,16);geometry.translate(0,h/2,0);
    const mesh=new Mesh(geometry,material);mesh.userData.isPaintedPerson=true;
    const root=new Group();root.name='绘画人物 '+kind;root.add(mesh);root.userData.headY=h*.91;
    const item={root,mesh,cell,animated,kind,height:h,phase:people.length*.8};people.push(item);root.userData.paint=item;
    let currentFrame=-1;
    function frame(index){if(index===currentFrame)return;currentFrame=index;const r=fresh?REVISED[index]:extra?TRAVELERS[index]:animated?WALKERS[index]:PORTRAITS[index],w=fresh?1225:extra?1536:animated?1774:1024,hh=fresh?1284:extra?1024:animated?887:1536;uniforms.uRect.value=[r[0]/w,1-r[3]/hh,(r[2]-r[0])/w,(r[3]-r[1])/hh];}
    item.setFrame=frame;frame(animated?offset:cell);return root;
  }
  if(!rooms.length||!viewPaths.length)throw new Error("绘画人物缺少房屋或观赏山路锚点");
  const walking=FIGURES.filter(d=>d.route);
  for(const original of FIGURES){
    if(original.id==='angler')continue;
    const def={...original};let root,room=null,path=null;
    if(def.id==='wifeA'||def.id==='wifeB') {
      room=rooms[0];root=makePerson(def.id);
      const side=def.id==='wifeA'?-.56:.56,lz=room.depth/2-.70,c=Math.cos(room.angle),s=Math.sin(room.angle);
      def.x=room.x+side*c+lz*s;def.z=room.z-side*s+lz*c;def.face=room.angle;
    }else if(def.route){
      path=viewPaths[(def.id==='rider'||def.id==='servant')?0:1%viewPaths.length];root=makePerson(def.id==='boy'?'boy':def.kind==='traveler'?'traveler':def.kind==='rider'?'rider':'porter');
    }else root=makePerson(def.kind,def.pose??'stand',def.id==='poetA'||def.id==='terraceScholar'?1:def.id==='terraceCompanion'?2:0);
    if(path&&!path.total)path.total=sampleViewPath(path.points,0).total;
    const distance=path?(path.closed?walking.indexOf(original)*path.total/walking.length:walking.indexOf(original)*4.5):0;
    const start=path?sampleViewPath(path.points,distance):null;
    const x=start?.x??def.x,z=start?.z??def.z,y=start?.y??(room?room.floor:walkMap.groundAt(x,z));
    const npc={def,root,x,z,headY:root.userData.headY,r:.3,path,room,phase:npcs.length*.7,distance,baseY:y};
    root.position.set(x,y,z);root.rotation.y=room?room.angle:def.face??0;group.add(root);npcs.push(npc);
    if(!path&&!room)walkMap.addCircle(x,z,.32,y-.3,y+1.8);
  }
  let time=0;
  function update(dt,cam){
    time+=dt;
    for(const n of npcs){
      const art=n.root.userData.paint;
      if(n.path){
        n.distance+=dt*(n.def.speed??.8);
        const extent=n.path.total,progress=n.distance%(n.path.closed?extent:extent+12);
        const p=sampleViewPath(n.path.points,Math.min(progress,extent));
        const sideMotion=(p.x-n.x)*Math.cos(n.path.facing)-(p.z-n.z)*Math.sin(n.path.facing);
        if(Math.abs(sideMotion)>.0001)art.mesh.material.uniforms.uFlip.value=sideMotion<0?1:0;
        n.x=p.x;n.z=p.z;n.root.position.set(p.x,p.y,p.z);
        n.root.rotation.y=n.path.facing;
        art.mesh.material.uniforms.uOpacity.value=n.path.closed?1:progress<=extent?Math.max(0,Math.min(1,p.along/1.3,(p.total-p.along)/1.3)):0;
        art.mesh.visible=art.mesh.material.uniforms.uOpacity.value>.01;
        art.setFrame((art.kind==='rider'||art.kind==='boy'?4:0)+Math.floor(n.distance/.22)%4);
      }else if(!n.room){n.root.rotation.y=Math.atan2(cam.x-n.x,cam.z-n.z);}
      art.mesh.material.uniforms.uClock.value=time+n.phase;
    }
    // Boat people retain the boat's fixed orientation; only the painted hem moves.
    for(const p of people)p.mesh.material.uniforms.uClock.value=time+p.phase;
  }
  return {group,npcs,makePerson,update,dispose(){portraits.dispose();walkers.dispose();travelers.dispose();revised.dispose();}};
}
