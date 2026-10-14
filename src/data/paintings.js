const base = import.meta.env.BASE_URL;

/**
 * 三个画境入口的配置。
 * 替换画作：把图片放到 public/paintings/<id>/，修改 image 的 src 与像素尺寸即可，
 * 卷轴会按图片比例自动计算装裱尺寸。
 *
 * mount（可选）：装裱比例，均以“纸宽”为单位 —— top 天头、bottom 地头、side 左右边。
 * theme：包首锦缎、系带、垂签的颜色。
 */
export const paintings = [
  {
    id: 'jiangshan-qiuse',
    order: '壹',
    title: '江山秋色图',
    available: true,
    image: {
      src: `${base}paintings/jiangshan-qiuse/hanging.jpg`,
      width: 900,
      height: 1364,
    },
    panorama: `${base}paintings/jiangshan-qiuse/panorama.jpg`,
    info: {
      dynasty: '南宋',
      artist: '赵伯驹（传）',
      medium: '绢本设色',
      size: '55.6 × 323.2 cm',
      collection: '北京故宫博物院藏',
      tags: ['青绿山水', '全景长卷', '秋景'],
      summary:
        '以石青、石绿层层敷染，铺陈秋日江山：群峰叠起，江流萦回，林木渐染秋色，楼阁、栈道、村舍与行旅隐现其间，气象宏阔而笔致精微。旧传为宋代宗室画家赵伯驹所作，承唐代李思训父子青绿一脉。',
      note: '原作为横向手卷，此处立轴所示为画心局部。',
      credit: '图像：Wikimedia Commons（公有领域）',
    },
    theme: { brocade: '#1d3a44', ribbon: '#8f2e25', tag: '#2c4842' },
  },
  {
    id: 'hanxizai-yeyan',
    order: '贰',
    title: '韩熙载夜宴图',
    available: true,
    image: {
      src: `${base}paintings/hanxizai-yeyan/hanging.jpg`,
      width: 900,
      height: 1317,
    },
    panorama: `${base}paintings/hanxizai-yeyan/panorama.jpg`,
    info: {
      dynasty: '五代南唐',
      artist: '顾闳中（宋摹）',
      medium: '绢本设色',
      size: '28.7 × 335.5 cm',
      collection: '北京故宫博物院藏',
      tags: ['人物故实', '夜宴长卷', '工笔重彩'],
      summary:
        '相传顾闳中奉命观察韩熙载府上宴乐，凭记忆绘成此卷；史籍对作画缘起另有不同记载。全图以屏风和家具衔接听乐、观舞、暂歇、清吹、散宴五段时光，宾客与乐伎的热闹和主人的沉静相映。今传宋人摹本，笔致精微，为传世人物画巨迹。',
      note: '原作为横向手卷，此处立轴所示为画心局部（观舞一段）。',
      credit: '图像：Wikimedia Commons（公有领域）',
    },
    theme: { brocade: '#3a2836', ribbon: '#8f2e25', tag: '#43333c' },
  },
  {
    id: 'fuwang-bensheng',
    order: '叁',
    title: '鹿王本生',
    available: true,
    image: {
      src: `${base}paintings/fuwang-bensheng/hanging.jpg`,
      width: 1200,
      height: 1050,
    },
    panorama: `${base}paintings/fuwang-bensheng/panorama.jpg`,
    info: {
      dynasty: '北魏',
      artist: '佚名（敦煌莫高窟第257窟 西壁中段）',
      medium: '壁画（泥壁设色）',
      size: '横卷式连环画 · 原壁约 3.9 × 0.9 m',
      collection: '敦煌莫高窟第257窟',
      tags: ['石窟壁画', '九色鹿', '横卷连环画'],
      summary:
        '画九色鹿本生故事：鹿自恒河负溺水人出水，溺水人立誓不泄其踪，后见利忘义向国王告密，引王入山围猎；九色鹿无所畏惧，向国王陈其负恩，国王感悟而放鹿并下令护之。画面承汉画像石的横卷式构图，按两头开始、中间结束的顺序布局，是莫高窟开窟以来的全新构图形式。',
      note: '壁画历经一千五百年，矿物色多已氧化褪变。此处敷彩为艺术转译，非原貌复原。',
      credit: '图像：Wikimedia Commons（公有领域）· 释文：敦煌研究院网站',
    },
    theme: { brocade: '#3a2f24', ribbon: '#7d5340', tag: '#5a4a3a' },
  },
];
