import { useEffect, useRef, useState } from 'react';

const GUIDANCE={
 bridge:{close:'桥上文士邀你论诗，按 F 与他交谈。',walk:'桥上有位文士，近前可与他论诗。',boat:'桥上有位文士，可靠岸登桥，与他论诗。'},
 pavilion:{close:'亭中文士邀你共赏山色，按 F 与他论诗。',walk:'亭中文士正在观景，走入亭中可与他论诗。',boat:'亭中有位文士，可靠岸入亭，与他论诗。'},
 mountain:{close:'山上楼阁主人邀你话山居，按 F 与他论诗。',walk:'山上楼阁旁有位主人，沿栈道上山可与他论诗。',boat:'山上楼阁旁有位主人，靠岸登上栈道，可与他论诗。'},
 fisher:{close:'渔船棚中的渔夫邀你话秋江，按 F 与他论诗。',walk:'江上渔船中有位渔夫，可乘船靠近，与他论诗。',boat:'渔船棚中有位渔夫，划船靠近可与他论诗。'}
};

export default function NavigationHints({world,playing}){
 const [hint,setHint]=useState(null),current=useRef(null);
 useEffect(()=>{
  if(!world||!playing){current.current=null;setHint(null);return;}
  let leftAt=0;
  const tick=()=>{
   const vehicle=world.controller.vehicle,close=world.nearestPoetry?.(),encounter=close??world.nearbyPoetry?.();
   const boat=!vehicle&&world.camera.position.y<4.8?world.boats.nearest(world.camera.position.x,world.camera.position.z,28):null;
   const boatClose=boat&&Math.hypot(boat.x-world.camera.position.x,boat.z-world.camera.position.z)<=7;
   let next=null;
   if(encounter){
    const mode=close?'close':vehicle?'boat':'walk';
    const text=GUIDANCE[encounter.id]?.[mode];
    if(text)next={id:`${encounter.id}-${mode}`,text};
   }else if(boat){
    next={id:`boat-${world.boats.boats.indexOf(boat)}-${boatClose?'close':'near'}`,text:boatClose?'小舟可乘，按 E 登船。':'岸边停着一艘小舟，靠近后按 E 登船。'};
   }
   if(next){leftAt=0;if(next.id!==current.current){current.current=next.id;setHint({...next,key:performance.now()});}}
   else {leftAt ||= performance.now();if(performance.now()-leftAt>1200){current.current=null;setHint(null);}}
  };
  tick();const timer=setInterval(tick,200);return()=>clearInterval(timer);
 },[world,playing]);
 if(!playing||!hint)return null;
 return <p className="world__wayfinding" key={hint.key} aria-live="polite">{hint.text.split(/([EF])/).map((part,i)=>part==='E'||part==='F'?<kbd key={i}>{part}</kbd>:part)}</p>;
}
