import { BRIDGE_POEMS, BRIDGE_QUESTION } from './bridgePoems.js';
import { Vector3 } from 'three';

const POEMS={
  "loft": {
    "title": "登快阁",
    "author": "黄庭坚",
    "lines": [
      "痴儿了却公家事，" , "快阁东西倚晚晴。",
      "落木千山天远大，" , "澄江一道月分明。",
      "朱弦已为佳人绝，" , "青眼聊因美酒横。",
      "万里归船弄长笛，" , "此心吾与白鸥盟。"
    ],
    "note": "黄庭坚登阁远眺，把秋山澄江与心中身世交织起来。诗中的晚晴、月色属于原作意境；此刻借它寄托登高后的旷远之心。",
    "source": "https://zh.wikisource.org/zh-hans/登快閣"
  },
  "friend": {
    "title": "行香子·述怀",
    "author": "苏轼",
    "lines": [
      "清夜无尘，月色如银。",
      "酒斟时，须满十分。",
      "浮名浮利，休苦劳神。",
      "叹隙中驹，石中火，梦中身。",
      "虽抱文章，开口谁亲。",
      "且陶陶，乐尽天真。",
      "几时归去，作个闲人。",
      "对一张琴、一壶酒、一溪云。"
    ],
    "note": "词从清夜饮酒写到人生短暂、知音难觅，最后归于琴、酒与溪云。借诗中夜景说心事，不改变眼前画境的时辰。",
    "source": "https://zh.wikisource.org/zh-hans/行香子_(述懷)"
  },
  "perspective": {
    "title": "题西林壁",
    "author": "苏轼",
    "lines": [
      "横看成岭侧成峰，",
      "远近高低各不同。",
      "不识庐山真面目，",
      "只缘身在此山中。"
    ],
    "note": "同一座山，换个位置便有不同面貌。诗由游山谈到看待事物的角度：身在其中时，也要记得退一步、换一处再看。",
    "source": "https://www.gushiwen.cn/shiwenv_f2f5469a6044.aspx"
  },
  "autumn": {
    "title": "苏幕遮·怀旧",
    "author": "范仲淹",
    "lines": [
      "碧云天，黄叶地。",
      "秋色连波，波上寒烟翠。",
      "山映斜阳天接水，",
      "芳草无情，更在斜阳外。",
      "黯乡魂，追旅思。",
      "夜夜除非，好梦留人睡。",
      "明月楼高休独倚，",
      "酒入愁肠，化作相思泪。"
    ],
    "note": "碧云、黄叶、秋水与寒烟铺开辽阔秋景，随后转入游子的乡思。斜阳与月夜是词中回想；这张画笺留下的是你眼前的山水。",
    "source": "https://zh.wikisource.org/zh-hans/蘇幕遮_(范仲淹)"
  },
  "fishing": {
    "title": "好事近·短棹钓船轻",
    "author": "朱敦儒",
    "lines": [
      "短棹钓船轻，",
      "江上晚烟笼碧。",
      "塞雁海鸥分路，",
      "占江天秋色。",
      "锦鳞拨剌满篮鱼，",
      "取酒价相敌。",
      "风顺片帆归去，",
      "有何人留得？"
    ],
    "note": "轻舟、秋江、飞鸟与满篮鱼，写出渔人的自在生活。“拨剌”是鱼跃的声响；晚烟是原词意象，此刻借它传达江上闲适之情。",
    "source": "https://longyusheng.org/ci/zhudunru/6.html"
  }
};
const choice=(poem,id,mood,answer,reply)=>({...poem,id,mood,answer,reply});
const river=BRIDGE_POEMS[1],home=BRIDGE_POEMS[2],longing=BRIDGE_POEMS[0];
export const POETRY_ENCOUNTERS=[
 {id:'bridge',npcIds:['bridgeScholar'],eyebrow:'溪桥问意 · 文士',title:'此景，寄何情？',hint:'与文士论诗',caption:'溪桥一遇',speaker:'文士曰',question:BRIDGE_QUESTION,choices:BRIDGE_POEMS},
 {id:'pavilion',npcIds:['poetA'],eyebrow:'亭中听风 · 文士',title:'山色之外，心向何处？',hint:'与亭中文士论诗',caption:'亭中听风',speaker:'亭中文士曰',question:'且坐片刻，听一听风。眼前山色如此清远，客官是胸中豁然，还是想寻一位懂得此景的知音？',choices:[
  choice(POEMS.loft,'pavilion-wide','登高畅怀','望着千山远水，胸中也开阔起来。','正是！案头烦事暂且搁下，登高看远，才知天地宽。山谷这首登阁诗，可与此心相映。'),
  choice(POEMS.friend,'pavilion-friend','盼遇知音','好山好水，若有人懂得我的心事便更好。','山水易赏，知音难逢。客官既肯说这一句，我便愿多听几句。东坡的词，也曾有这般心事。'),
  choice(river,'pavilion-clear','放下得失','比起名利纷争，我更愿记住眼前山水。','我还在想如何写好一首诗，客官却先放下了得失。也好，任世事来去，青山自长。')
 ]},
 {id:'mountain',npcIds:['terraceScholar'],eyebrow:'山居问青 · 主人',title:'若居此山，如何度日？',hint:'与山居主人论诗',caption:'山居问青',speaker:'山居主人曰',question:'山中无甚繁华，推窗便有青山来。若客官在此住上一程，是愿守一方小园，换个眼光看世事，还是仍念着故乡？',choices:[
  choice(home,'mountain-home','安居田园','种花理园，与青山流水相伴就很好。','这便是我住在山中的乐处。亲手栽几畦花木，日日看水绕田来，胜过许多热闹。'),
  choice(POEMS.perspective,'mountain-view','换个眼光','身在山中，也想退一步看看不同的风景。','说得好！我日日对着这座山，也未必看全了它。换个立脚处，山色不同，心中的结也许便松开了。'),
  choice(POEMS.autumn,'mountain-longing','遥念故园','这里虽好，我仍会想起故乡的秋天。','我惯了山居，客官却有自己的归处。留你看一程秋色，也不拦你念乡；这一阕，正好寄那份归心。')
 ]},
 {id:'fisher',npcIds:['angler'],onBoat:true,eyebrow:'江上问闲 · 渔夫',title:'一江秋水，何事在心？',hint:'与船中渔夫论诗',caption:'江上问闲',speaker:'渔夫曰',question:'一竿下水，半日无言。老汉只等鱼儿咬钩，客官看着这满江秋水，心里想的是自在、故乡，还是天水辽阔？',choices:[
  choice(POEMS.fishing,'fisher-free','自在闲适','一舟一竿，这样的日子便很好。','正是这个意思！钓得几尾鱼，换些酒钱，顺风便归。江上清风，已经够老汉受用了。'),
  choice(longing,'fisher-home','思乡念远','流水迢迢，让我想起了故乡。','客官心中有牵挂，难怪看这流水也觉伤怀。老汉却只想着，今日能钓几尾鱼。且借这首诗，替你寄一寄归心。'),
  choice(river,'fisher-wide','心境开阔','江天如此辽阔，心中的烦扰也淡了。','客官看得远，老汉看得近。你看江天，我看浮子；心里都松快，便是同一份好光景。')
 ]}
];

/** Resolve actual world positions, including boat children, and reject hidden/offscreen actors. */
export function nearestPoetryEncounter({npcs,camera,vehicle,isVisible}) {
 let best=null,distance=8;
 const p=new Vector3(),screen=new Vector3();
 for(const encounter of POETRY_ENCOUNTERS){
  if(vehicle&&!encounter.onBoat)continue;
  for(const npc of npcs){
   if(!encounter.npcIds.includes(npc.def.id)||!npc.root.visible)continue;
   npc.root.getWorldPosition(p);p.y+=npc.headY*.7;
   const d=p.distanceTo(camera.position);if(d>=distance)continue;
   screen.copy(p).project(camera);if(screen.z<=-1||screen.z>=1||Math.abs(screen.x)>.9||Math.abs(screen.y)>.95)continue;
   if(!isVisible(npc))continue;
   best=encounter;distance=d;
  }
 }
 return best;
}
