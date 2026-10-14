import { Vector3, Raycaster } from 'three';
import { mulberry32 } from '../../../utils/math.js';
import { DIALOGUE } from './dialogue.js';
import { createOcclusionGrid } from './occlusionGrid.js';

const TALK_RANGE = 11;   // 走到这个距离内，人物开始说话
const SHOW_RANGE = 16;   // 超出则气泡隐去
const GAP = 0.9;         // 两句之间的停顿（秒）

const lineTime = (text) => 2.6 + text.length * 0.16;

/**
 * 人物闲谈：玩家走近时，在人物头旁显示文字气泡。
 * 对话组按顺序轮流说；独白随机轮换。气泡是叠在画面上的 DOM，每帧按头顶位置投影定位。
 */
export function createChatter({ npcs, camera, container, scene }) {
  const byId = new Map(npcs.filter((n) => n.def.id).map((n) => [n.def.id, n]));
  const rand = mulberry32(1127);
  const bubbles = new Map();
  const v = new Vector3(), target=new Vector3(), direction=new Vector3();
  const ray=new Raycaster(), blockers=[], dynamic=[], visibility=new Map();let clock=0;
  scene?.traverse(o=>{if(o.isMesh&&!o.userData.isPaintedPerson&&o.material&&!o.material.transparent&&!o.material.alphaTest)(o.parent===scene?blockers:dynamic).push(o);});
  const occlusion=createOcclusionGrid(blockers);
  function unobstructed(npc){
    const previous=visibility.get(npc);if(previous&&clock-previous.time<.14&&camera.position.distanceToSquared(previous.camera)<.0144)return previous.visible;
    npc.root.getWorldPosition(target);target.y+=npc.headY*.78;
    const distance=target.distanceTo(camera.position);direction.copy(target).sub(camera.position).normalize();
    ray.set(camera.position,direction);ray.near=.15;ray.far=Math.max(.15,distance-.07);
    let visible=!occlusion.blocked(camera.position,target);
    if(visible&&dynamic.length){dynamic.forEach(m=>m.updateWorldMatrix(true,false));visible=ray.intersectObjects(dynamic,false).length===0;}
    visibility.set(npc,{time:clock,visible,camera:camera.position.clone()});return visible;
  }

  const bubbleFor = (npc) => {
    let b = bubbles.get(npc);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'npc-bubble';
      const span = document.createElement('span');
      el.appendChild(span);
      container.appendChild(el);
      b = { el, span, text: null, shown: false };
      bubbles.set(npc, b);
    }
    return b;
  };

  // 说话的“声部”：对话组与独白
  const voices = [];
  for (const t of DIALOGUE.talk) {
    const speakers = t.speakers.map((id) => byId.get(id));
    if (speakers.some((s) => !s)) continue;
    voices.push({ speakers, lines: t.lines, idx: 0, timer: rand() * 2, speaking: null });
  }
  for (const [id, lines] of Object.entries(DIALOGUE.self)) {
    const n = byId.get(id);
    if (!n) continue;
    voices.push({ speakers: [n], lines: lines.map((l) => [0, l]), idx: Math.floor(rand() * lines.length), timer: rand() * 2, speaking: null, solo: true });
  }

  const near = (voice) => {
    const p = camera.position;
    return Math.min(...voice.speakers.map((s) => Math.hypot(s.x - p.x, s.z - p.z)));
  };

  let isReading = false;
  function update(dt) {
    isReading = false;
    clock+=dt;
    const want = new Map();
    for (const voice of voices) {
      const d = near(voice);
      if (d > TALK_RANGE) {
        // 走远了：这一句说完便停，下次走近接着往下说
        if (voice.speaking && d > SHOW_RANGE) voice.speaking = null;
        if (!voice.speaking) continue;
      }
      voice.timer -= dt;
      if (voice.timer <= 0) {
        if (voice.speaking) {
          voice.speaking = null;
          voice.timer = voice.solo ? GAP + 2.5 + rand() * 2.5 : GAP;
          voice.idx = voice.solo ? (voice.idx + 1 + Math.floor(rand() * (voice.lines.length - 1))) % voice.lines.length : (voice.idx + 1) % voice.lines.length;
        } else if (d <= TALK_RANGE) {
          const [who, text] = voice.lines[voice.idx];
          voice.speaking = { npc: voice.speakers[who], text };
          voice.timer = lineTime(text);
        }
      }
      if (voice.speaking) want.set(voice.speaking.npc, voice.speaking.text);
    }

    const w = container.clientWidth, h = container.clientHeight;
    for (const npc of npcs) {
      const text = want.get(npc);
      const b = text ? bubbleFor(npc) : bubbles.get(npc);
      if (!b) continue;
      let visible = !!text && npc.root.visible && (npc.root.userData.paint?.mesh.material.uniforms.uOpacity.value??1)>.2;
      if(visible){npc.root.getWorldPosition(v);v.y+=npc.headY+.32;v.project(camera);visible=v.z<1&&Math.abs(v.x)<1.1&&Math.abs(v.y)<1.1;}
      const occluded=visible&&!unobstructed(npc);visible=visible&&!occluded;
      b.el.style.visibility=text&&!visible?'hidden':'';
      if (visible) {
        if (visible) {
          const sx = (v.x * 0.5 + 0.5) * w, sy = (1 - (v.y * 0.5 + 0.5)) * h;
          const dist = Math.hypot(npc.x - camera.position.x, npc.z - camera.position.z);
          const k = Math.max(0.78, Math.min(1.05, 7 / Math.max(dist, 1)));
          b.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-12%, -100%) scale(${k.toFixed(3)})`;
        }
      }
      if (text && text !== b.text) {
        b.text = text;
        b.span.textContent = text;
        b.span.getAnimations?.().forEach(a=>a.cancel());
        b.span.animate?.([{opacity:0},{opacity:1}],{duration:260,easing:'ease-out'});
      }
      if (visible) isReading = true;
      if (visible !== b.shown) {
        b.shown = visible;
        b.el.classList.toggle('is-shown', visible);
      }
    }
  }

  function dispose() {
    for (const b of bubbles.values()) b.el.remove();
    bubbles.clear();
    occlusion.dispose();
  }

  return { update, dispose, occlusion, isVisible:unobstructed, get isReading() { return isReading; } };
}
