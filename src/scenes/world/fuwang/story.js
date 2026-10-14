import { FOLDS, MIN_MURAL_VIEW_DIST, MURAL } from './layout.js';
import { FOLD_QUOTES } from './quotes.js';

/**
 * 五折叙事。
 *
 * 机位不再硬编码，而是以 layout.js 依折区间反算出的折机位为基准做小幅偏移，
 * 保证"看到的那一段"与"要敷彩的那一段"一致，不会出现取景与判定错位。
 *
 * 对白是本项目据画意创作的场景文字，不是史料原话，也不是壁画榜题。
 * 每折的「依据」取自 quotes.js，为敦煌研究院网站的逐字释文。
 */

/** 以折机位为基准平移一小段，视线仍落在壁画平面上 */
function near(base, { dx = 0, dz = 0, dy = 0 } = {}) {
  const z = Math.max(MURAL.z + MIN_MURAL_VIEW_DIST, base.camera[2] + dz);
  return {
    camera: [base.camera[0] + dx, base.camera[1] + dy, z],
    target: [base.target[0] + dx * 0.7, base.target[1], base.target[2]],
  };
}

const stop = (title, action, lines, note) => ({ title, action, lines, note });

/** 每折三个停点：全览 → 平视细看 → 移向下一段；全程不裁掉壁画上下缘。 */
function posesFor(f) {
  const base = { camera: f.camera, target: f.target };
  const step = (f.u1 - f.u0) * f.dist * 0.5;
  return [
    near(base, { dz: 0.24, dy: 0.06 }),
    near(base, { dz: -0.16 }),
    near(base, { dx: step, dz: 0.12 }),
  ];
}

const narratives = [
  {
    intro:
      '壁画起于水边。鹿从寒流中负起溺水之人。先看这一段，再为他披上矿物色。',
    enter: '循水入画',
    stops: [
      stop(
        '临水',
        '',
        [],
        '壁画左端画九色鹿驮人出水。原画以石绿铺水、蛤白提亮人物，历经一千五百年后多已褪为赭褐。',
      ),
      stop(
        '鹿负溺人',
        '鹿驮溺人出水',
        ['水急，抓紧了。', '出得此水，便无事了。'],
        '画中一人骑在鹿背上，紧抱鹿颈。此处对白只表现当下的动作。',
      ),
      stop(
        '上岸',
        '',
        [],
        '岸线以土红平涂，山峦自水边渐次升起，构成横卷的起首。',
      ),
    ],
  },
  {
    intro: '溺水人跪谢立誓。这一折把颜色敷在山石与水纹上，看清北魏的用色层次。',
    enter: '循岸前行',
    stops: [
      stop('跪谢', '', [],
        '溺水人跪在九色鹿面前许诺保守秘密。发誓之说载于释文，画面只留下跪拜的身姿。'),
      stop('立誓', '跪而许之',
        ['鹿恩不敢忘，此事不出我口。', '若有违言，愿受其报。'],
        '这一句誓言出自释文情节；具体措辞为本项目创作，并非壁画榜题原话。'),
      stop('山起', '', [],
        '画面上行是层层叠起的山峦。石绿与石青在氧化后呈现出不同的青绿调子。'),
    ],
  },
  {
    intro:
      '画面中部转入宫殿。王后向国王索要鹿皮，门外已有人前来告密 —— 这一折的色层最密。',
    enter: '入殿听告',
    stops: [
      stop('宫殿', '', [],
        '王后与国王坐于宫殿之中，是横卷中部最完整的一组人物。殿宇的栏楯与瓦顶以石青、蛤白画出。'),
      stop('王后索皮', '以臂揽肩，扭头相求',
        ['妾梦一鹿，毛色九种。', '若得其皮为衣，胜却众宝。'],
        '释文写王后以右臂揽国王肩膀、扭头朝向国王，一只脚丫翘起外露。'),
      stop('门外告密', '', [],
        '门外，溺水之人正背信弃义向国王告密。这一折把誓言与告密并置于同一幅画面。'),
    ],
  },
  {
    intro: '车马入山。这一折沿横卷推移，把围猎的行列一层层补全。',
    enter: '随车入山',
    stops: [
      stop('发驾', '', [],
        '国王与王后在负心人的带领下同乘一辆马车前往围猎九色鹿。'),
      stop('安车', '双辕双轮，单马驾驭',
        ['车篷合上，莫让风沙进来。', '前头就是鹿的居处了。'],
        '释文称画中的马是敦煌壁画中最早的马车图像，车为安车，全封闭式圆弓形顶盖。'),
      stop('入山', '', [],
        '马行进的姿态十分高雅。围猎队伍之后，是层层相叠的山与树。'),
    ],
  },
  {
    intro:
      '鹿无所畏，陈其负恩。这一折把整幅横卷的色补全，再读一次敦煌研究院的释文。',
    enter: '听鹿陈情',
    stops: [
      stop('陈情', '', [],
        '九色鹿毫无畏惧，向国王诉说溺水人忘恩负义的经过。'),
      stop('诉其负恩', '昂首而言',
        ['此人溺水，我曾负之出水。', '他立誓不泄，如今却为鹿皮而来。'],
        '此处对白据画意创作，不是史料原话；释文所记为鹿向国王陈述经过。'),
      stop('恶报', '', [],
        '在国王及侍从之后，是手指九色鹿居处的溺水人。告密者满身白点，代表恶有恶报。'),
    ],
  },
];

export const CHAPTERS = FOLDS.map((f, i) => {
  const poses = posesFor(f);
  const narrative = narratives[i];
  return {
    ...f,
    intro: narrative.intro,
    enter: narrative.enter,
    stops: narrative.stops.map((s, k) => ({
      ...s,
      camera: poses[k].camera,
      target: poses[k].target,
    })),
    quotes: FOLD_QUOTES[f.id] ?? [],
  };
});
