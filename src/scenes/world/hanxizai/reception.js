// A second, optional thread follows the readers and keepers of the painting.
// All voices here belong to today's narrator, not to the historical guests.
export const RECEPTION_STORAGE = "hanxizai-readers-v1";

export const LETTERS = [
  {
    id: "seal",
    chapter: "tingyue",
    title: "一枚印章里的岔路",
    subtitle: "汤垕、徐邦达 · 从收藏印追问来路",
    teaser: "印上的一个字读错了，画卷的身世会跟着改变吗？",
    observation:
      "先看这场夜宴，再想想：我们凭什么认定它的作者与年代？画中的人不会自己作答，卷外的题跋与印记也需要核对。",
    question: "你在席间问：这就是顾闳中亲手留下的那一夜吗？",
    paragraphs: [
      {
        title: "后人也曾这样追问",
        text: "元代汤垕在《画鉴》中记下所见夜宴图。余辉的论文转述：徐邦达后来指出，汤垕把收藏印“绍勋”认成了“绍兴”，并将印主考为史弥远。一个字的辨读，牵出了不同的收藏者。",
        refs: ["sealStudy"],
      },
      {
        title: "发现，也包括重新认识",
        text: "故宫将现存卷标为宋摹本。它是一件流传下来的绘画，并非从墓中发掘出来；画中事件的年代、画卷制作的年代，是两件需要分别追问的事。",
        refs: ["palace"],
      },
    ],
    boundary:
      "印章能帮助梳理来路，不能独自证明作者；上面的辨印故事据余辉转述徐邦达的研究。",
    reply: "留给前人的一句话：我们还认得这场夜宴，也会仔细辨认它走过的岁月。",
    next: "下一折，把目光从印章移到一双手上：地下的图像，也可能来帮助读画。",
    prompts: [
      "一枚印章，怎样牵出画卷的身世？",
      "画中的一夜，与画卷的年龄相同吗？",
      "认出韩熙载，是否就能认定作者？",
      "后人怎样为这场夜宴寻找来路？",
    ],
  },
  {
    id: "gesture",
    chapter: "guanwu",
    title: "一双手，问到了宋墓里",
    subtitle: "余辉 · 让画、古籍与出土图像互相印证",
    teaser: "舞袖之外，那双交握的手，也是一条考古线索。",
    observation:
      "看鼓旁德明的双手，也回想听乐段宾客的手势。余辉将这类动作识作叉手礼；它不只是一个可任意解释的表情。",
    question: "你在席间问：那双手，能告诉后人什么？",
    paragraphs: [
      {
        title: "把相似之处放在一起",
        text: "余辉在1993年的研究中，把画中手势与《事林广记》的叉手方法对读，又举河南白沙二号宋墓壁画中叉手侍立的少仆作比较。传世图像与出土材料，由一个日常动作相遇。",
        refs: ["gestureText", "gestureTomb"],
      },
      {
        title: "相似，是线索而非判决",
        text: "叉手礼跨越不止一个朝代。研究者还要比较服饰、家具、器用和画风；某个动作相像，不能单凭它就把全画定年。",
        refs: ["materialStudy"],
      },
    ],
    boundary:
      "宋墓壁画是比较材料，不是《夜宴图》的出土地。这里介绍研究方法，不把某种断代意见说成所有学者的共识。",
    reply:
      "留给前人的一句话：你们习以为常的一个礼节，后人花了许多功夫才重新认得。",
    next: "下一折暂歇时，看看承载这些动作的绢，怎样被一代代人护住。",
    prompts: [
      "鼓旁的一双手，为什么让学者想到宋墓？",
      "舞袖之外，礼仪也会留下时代痕迹。",
      "鼓旁德明的手势，怎样与古籍对读？",
      "一处相似够不够？看看研究者如何求证。",
    ],
  },
  {
    id: "keeping",
    chapter: "zhanxie",
    title: "画背后，还有一双双手",
    subtitle: "郑振铎、徐伯郊与文物工作者 · 寻回与守护",
    teaser: "我们看见灯前的人，修复者守住承载他们的绢。",
    observation:
      "席间稍歇，把目光停在画面细密的线条上。它们能被今天的我们看见，也依靠画外持续的保管与修护。",
    question: "你在灯前问：这么久过去了，我们为什么还能相见？",
    paragraphs: [
      {
        title: "先让画卷有归处",
        text: "此卷曾为张大千收藏。于坚回忆，郑振铎筹划在香港设立文物收购小组，请徐伯郊牵头。《夜宴图》是小组历年购回、交故宫入藏的名迹之一。寻找、筹款、收购与入藏，都是守护的一部分。",
        refs: ["whitfield", "keepers"],
      },
      {
        title: "一次看见画背的机会",
        text: "韦陀记得，约1975年遇上故宫为此卷重新装裱，他得以看见背面支撑绢折处的细条。观众凝望正面的夜宴，画背却留下了使它继续存在的劳动。",
        refs: ["whitfield"],
      },
    ],
    boundary:
      "韦陀记述的是自己的所见，不是完整的修复档案。此处不采用未经核实的交易金额，也不把寻回讲成某个人独力完成的传奇。",
    reply: "留给守护者的一句话：我们看到的每一笔，背后都有你们不在画中的工作。",
    next: "绢上的人物留了下来。下一折，后人还想再听听他们的音乐。",
    prompts: [
      "夜宴流传至今，谁在画外守护它？",
      "有位学者看到了画背，那里有什么？",
      "保存一幅画，怎样让相隔千年的人相见？",
    ],
  },
  {
    id: "listening",
    chapter: "qingchui",
    title: "无声的画，怎样再被听见",
    subtitle: "故宫学者与汉唐乐府 · 从研究走向当代演绎",
    teaser: "2015年，后人把这场无声的夜宴带进了数字屏幕。",
    observation:
      "看看五位女乐的乐器与姿态。画能留下动作，却没有为我们保存这一刻的录音。",
    question: "你在乐声里问：今天响起的，还是当年的那支曲子吗？",
    paragraphs: [
      {
        title: "一张复制品，打开远方的课堂",
        text: "韦陀回忆，约1962年在普林斯顿求学时，经岛田修二郎推荐买到了与原卷同尺寸的单色复制品。没有绚丽的彩色，细节仍让研究成为可能。一幅中国长卷，由此走进另一位读画人的生活。",
        refs: ["whitfield"],
      },
      {
        title: "学者与表演者一起读画",
        text: "2015年故宫推出《韩熙载夜宴图》App，单国强、余辉领衔学术指导，汉唐乐府以南音演绎画中乐舞。团队把学术释读、真人表演与交互体验放到了一起。",
        refs: ["digital"],
      },
      {
        title: "让更多人靠近，也留住距离",
        text: "高清影像与专家导读，使不易常展的古画有了另一种相见方式。不过，当代演绎不等于找回了宴会原声；本项目轻柔的配乐同样是原创创作。",
        refs: ["digital"],
      },
    ],
    boundary:
      "本项目与故宫App是不同作品，未使用其音乐或表演素材，也不将自己的动作、对白和配乐作为历史复原证据。",
    reply:
      "留给乐人的一句话：听不到你们当夜的原声，我们仍想理解你们如何用音乐相聚。",
    next: "曲子将尽，读画没有终点。末折再看看：一个老问题，怎样被重新打开。",
    prompts: [
      "后人怎样让无声的画重新被听见？",
      "从画中乐器，到今天的演绎，中间隔着什么？",
      "数字影像怎样延长我们与古画相见的时间？",
    ],
  },
  {
    id: "rereading",
    chapter: "sanyan",
    title: "合卷之前，再问一次",
    subtitle: "丁羲元与历代读画人 · 从反复看见到提出新解",
    teaser: "同一个韩熙载换了衣服，也让一位学者重新想了多年。",
    observation:
      "看末段主人手中的鼓槌与黄衣，再回想击鼓时的他。卷上相邻的画面，一定就是故事中紧接着发生的事吗？",
    question: "你在散席时问：我们是不是已经读懂了这一夜？",
    paragraphs: [
      {
        title: "一个疑问，隔了多年又回到眼前",
        text: "丁羲元回忆，1984年曾与伍蠡甫讨论画面是否连贯；到1990年代后期，他重新留意主人的衣色和宾客出入，提出一、五、二、四、三的阅读顺序。",
        refs: ["ding"],
      },
      {
        title: "把理由也交给下一位观众",
        text: "这个次序仍是一家之说。本作沿用通行五折，让你可以对照不同读法。研究的接力不只传递答案，也传递看过什么、凭什么判断、还有哪里不确定。",
        refs: ["ding", "palace"],
      },
    ],
    boundary:
      "不同读法并存，不表示可以随意改写史实。新的解释仍需要回到画面和文献，接受他人的核对。",
    reply:
      "留给后来者的一句话：我会把夜宴中的人，也把寻找他们的人，一起讲给你听。",
    next: "终章将串起两种后续：画中人的余生，以及画卷被保存、研究、继续讲述的旅程。",
    prompts: [
      "宴会散了，为什么后人还在争论观看顺序？",
      "同样的黄衣和鼓槌，让研究者发现了什么？",
      "把这幅画讲给下一个人，你想留下什么？",
    ],
  },
];

export const RECEPTION_TIMELINE = [
  {
    date: "历代",
    title: "留下来路",
    text: "收藏、题跋与著录留存线索，辨印也可能改写旧有认识。",
    letter: 0,
    refs: ["sealStudy"],
  },
  {
    date: "1950年代",
    title: "寻回画卷",
    text: "《夜宴图》经文物收购工作重回公共收藏。",
    letter: 2,
    refs: ["keepers", "returnStudy"],
  },
  {
    date: "约1975",
    title: "护住绢上的一夜",
    text: "韦陀在重装裱期间看到画背支撑折处的细条。",
    letter: 2,
    refs: ["whitfield"],
  },
  {
    date: "1993",
    title: "向地下的图像求证",
    text: "余辉以器物、礼仪等材料展开断代讨论，考古为传世书画提供旁证。",
    letter: 1,
    refs: ["gestureTomb", "materialStudy"],
  },
  {
    date: "2015",
    title: "在屏幕前相见",
    text: "故宫以数字影像、学术导读和乐舞演绎，让更多人接近长卷。",
    letter: 3,
    refs: ["digital"],
  },
];

export const TAKEAWAYS = [
  {
    id: "people",
    title: "讲画中人的处境",
    text: "我想讲给你听：这是一场热闹的夜宴，也是一位大臣在时代压力下的进退。画中的沉静与史书的记载可以对读，却不能替他断言每一刻的心思。",
  },
  {
    id: "evidence",
    title: "讲后人怎样读画",
    text: "我想讲给你听：一枚印、一双手，都值得反复核对。把传世书画、古籍和出土图像放在一起，我们才更接近前人的生活；还没有定论的地方，也值得如实留下。",
  },
  {
    id: "care",
    title: "讲相见何以可能",
    text: "我想讲给你听：古画能与今天相见，靠的不只是画家的笔。寻回、保管、修复、研究与传播，让中国人的生活记忆继续被看见，也能被远方的观众理解。",
  },
];

export function restoreReception(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { read: [], takeaway: null };
  return {
    read: LETTERS.filter(
      (l) => Array.isArray(value.read) && value.read.includes(l.id),
    ).map((l) => l.id),
    takeaway: TAKEAWAYS.some((t) => t.id === value.takeaway)
      ? value.takeaway
      : null,
  };
}

export function collectLetter(progress, id) {
  if (!LETTERS.some((l) => l.id === id) || progress.read.includes(id))
    return progress;
  return { ...progress, read: [...progress.read, id] };
}
