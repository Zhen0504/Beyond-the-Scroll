# 画中奇谭 · Beyond the Scroll

以中国传统名画为舞台的沉浸式文化体验：**入画 — 探索 — 归卷**。

当前进度：
- **卷轴入口**：三轴陈列 → 点击展卷 → 名画介绍
- **画境一 ·《江山秋色图》**：第一人称 2.5D/3D 可游览场景（介绍页点「入画」进入，或直接访问 `/#jiangshan`）
- **画境二 ·《韩熙载夜宴图》**：五折剧情导览（先展原画再入景、17 处固定视点、完整纸偶姿态轮播、靠近人物浮现情境对白、五折解谜、人物笺与卷后结局；`/#hanxizai` 直达）

## 运行

```bash
npm install
npm run dev      # 本地开发 http://localhost:5173
npm test         # 素材完整性、动作循环、固定路线、切幕与家具间距回归
npm run build    # 打包到 dist/
npm run preview  # 预览打包结果
```

## 技术栈

React 19 · GSAP 3 · Three.js · Vite · 纯 CSS / SVG / Canvas / GLSL（未使用 UI 组件库与外部模型）

## 目录结构

```
├─ public/
│  └─ paintings/                     画作素材（每幅画一个文件夹）
│     └─ jiangshan-qiuse/
│        ├─ hanging.jpg              立轴画心（从原作裁切的竖幅局部）
│        └─ panorama.jpg             原作全卷，供后续画境/归卷使用
├─ src/
│  ├─ main.jsx / App.jsx             入口；App 负责场景切换
│  ├─ styles/                        全局样式与设计令牌（色彩、字体、纸纹）
│  ├─ data/
│  │  └─ paintings.js                三幅画的配置：图片、装裱比例、配色、介绍文字
│  ├─ utils/                         通用工具函数
│  ├─ components/                    跨场景复用的组件（全局 SVG 滤镜等）
│  └─ scenes/                        每个场景一个文件夹
│     └─ entry/                      卷轴入口场景
│        ├─ EntryScene.jsx           场景编排：状态机 intro → idle → opening → open → closing
│        ├─ timelines.js             所有 GSAP 时间线（入场 / 展卷 / 收卷）
│        ├─ layout.js                卷轴在不同视口下的尺寸与位置
│        └─ components/
│           ├─ HangingScroll/        立轴组件
│           │  ├─ HangingScroll.jsx  分层结构：光晕 / 阴影 / 装裱纸张 / 古画 / 木轴 / 垂签
│           │  ├─ scrollRig.js       按展开进度逐帧摆放各层（天杆、地杆、裁切、阴影）
│           │  ├─ InkPainting.jsx    墨迹晕染出画（SVG 湍流遮罩）
│           │  └─ geometry.js        卷轴几何参数（CSS 与 JS 共用）
│           ├─ InkBackdrop/          水墨远山背景（程序化生成 + 视差）
│           ├─ DustField/            Canvas 尘埃粒子
│           └─ PaintingIntro/        名画介绍面板
```

画境（第一人称场景）相关：

```
src/engine/                          通用画境引擎（各幅画共用）
  ├─ PaintRenderer.js                渲染器 + 后期：深度墨线勾勒、绢纹叠加、古画调色
  ├─ painted.js                      工笔设色材质：瓦、格子门窗、粉墙、木纹、石砌、茅草、衣褶
  ├─ FirstPersonController.js        第一人称：指针锁定、行走、疾行、跳跃、乘船、鼠标防抖
  ├─ WalkMap.js                      可行走区域与碰撞：地形坡度、水域、桥面/栈道、山石真实截面、动态障碍
  ├─ Billboards.js                   立体纸片批量渲染（树木、人物）
  ├─ atmosphere.js / shaders/        共享大气透视、噪声、原画重新着色 GLSL
  └─ noise.js                        可设种子的噪声
src/scenes/world/
  ├─ WorldScene.jsx                  画境容器：加载、入画、暂停、区域题名
  ├─ jiangshan/                      《江山秋色图》
     ├─ layout.js                    地图数据：江流、山崖线、三段区域、建筑、人物
     ├─ terrain.js                   高度场地形、土路、水深图
     ├─ rocks.js                     石柱山峰（云头、斧劈皴、石阶、点苔）
     ├─ treePainter.js / vegetation.js  程序化画树（15 种 24 变体）与按段落、疏密场种植
     ├─ figures.js                   仿宋画人物（工笔面容贴图；文士、行旅骑驴、挑担、渔人、村人、僧），可行走
     ├─ dialogue.js / chatter.js     人物闲谈台词与头旁气泡（走近时显示）
     ├─ boats.js                     可登可划的舟（桨、随流漂移、搁浅与碰撞）
     ├─ architecture.js              亭、阁、山寺、栈道层台、拱桥、廊桥、江村、塔；峰顶亭台与悬崖楼阁
     ├─ water.js / clouds.js / sky.js   顺流水纹与落叶、瀑布、留白云带、绢色天空与原画环幕
     └─ index.js                     组装与主循环
  └─ hanxizai/                       《韩熙载夜宴图》
     ├─ layout.js                    五段屏风、围榻/帐床、漆案与座椅
     ├─ architecture.js / surfacePainter.js  细足漆木家具、帷幔、山水屏心与绢色留白
     ├─ cast.js                      人物身份、原卷参照、透明素材范围、站位与关节点
     ├─ puppetPainter.js             完整透明人物与动作帧图集（真实 alpha）
     ├─ puppetRig.js / puppets.js     十类完整姿态循环、刚性纸面与转动阻尼
     ├─ GuidedTour.js / story.js      固定路线、17 处停留点、情境对白和故宫资料出处
     ├─ ScrollGuide.jsx / .css       原画门页、循席导览与人物悬浮对白
     ├─ candles.js                   单盏高烛与原位火苗
     └─ index.js                     分幕呈现、减少动态效果与资源释放
public/paintings/jiangshan-qiuse/textures/
  ├─ backdrop.jpg                    原作全卷（去印章）—— 远景环幕
  ├─ rock-brush.jpg                  原作崖面笔触（无缝）—— 山石、坡岸纹理
  └─ silk.jpg                        原作绢底（无缝）—— 天空与全屏绢纹
```

《江山秋色图》操作：`W A S D` 行走 · `Shift` 疾行 · `空格` 跳跃 · 鼠标环顾 · `E` 登船 / 上岸（船上 `W/S` 划桨、`A/D` 转向）· `Esc` 暂停（可续游或归卷）。夜宴使用下述固定路线导览。

后续计划新增的位置：

- `src/scenes/world/<画作id>/` —— 其余画境
- `src/systems/` —— NPC 对话系统、任务状态机、存档与收藏
- `src/scenes/album/` —— 数字画卷收藏册

## 替换 / 新增画作

1. 把竖幅图片放到 `public/paintings/<id>/`
2. 在 `src/data/paintings.js` 中填写 `image.src` 与图片像素宽高，设 `available: true`
3. 卷轴会按图片比例自动计算装裱尺寸；如需调整天头、地头比例，配置 `mount`

## 素材来源

《江山秋色图》图像来自 [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Zhao_Boju,_Autumn_Colors_Over_Rivers_and_Mountains,_12_century,_Palace_Museum,_Beijing.jpg)（公有领域）。

《韩熙载夜宴图》图像来自 [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Gu_Hongzhong%27s_Night_Revels_1_complete_scene.jpg)（公有领域）。


## 卷二 · 画意与皮影

每折先展示对应原画，点击入席后淡入 Three.js 场景。点「走近 / 回看」或按 `↑ ↓` / `W S`，沿固定的席前路线移动；镜头保持在纸偶画面正侧。`1—5` 换折时重新展原画，`R` 回看当前原卷，`Esc` 暂停。靠近人物后出现动作说明和可续读的悬浮对白。

保留举杯与蓝衣舞者动作，新增拨弦、击鼓、摇扇、净手、拊掌、横笛、送别与应答姿态。角色采用对齐的完整姿态帧，取消引起衣纹与乐器扭曲的网格蒙皮；击鼓人物和鼓共用画面，落槌帧直接接触鼓面。旁观者只作轻微整片倾动，镜头移动带来受限的纸面余颤。支持系统的「减少动态效果」。

画面解读依据[故宫藏品介绍](https://www.dpm.org.cn/collection/paint/228200.html)和[故宫长卷叙事介绍](https://www.dpm.org.cn/classify_detail/180639.html)，悬浮对白明确标为情境创作，并非史料原话。当前为五折固定路线，配有可跳过、可改选的线索判断；进度保存在当前标签页，刷新后仍可续读。

场景以原作的屏风、围榻和帐床组织空间。画中没有完整墙顶或建筑平面，因此留白与行走尺度属于艺术转译，不作南唐宅第复原的声明。详细核对、素材与验证说明见 [卷二改造说明](docs/hanxizai-art-direction.md)。

`panorama-detail.jpg` 为同一 Wikimedia Commons 原文件（13,898 × 1,200）；既有 `panorama.jpg` 保持不变。人物保留以 5,200 × 449 为基准的原卷参照范围。透明人物采用内置 imagegen 参照原画提取与补绘，包含遮挡补全和新动作，是艺术转译而非无损原画抠图。高清全卷仅供原卷对照，不作为超宽 GPU 贴图上传。

夜宴的“暗线”入口提供每折线索、提示和选择反馈；“识席间人”可查看可考人物的生平与关系。末折进入终章，回顾画意、南唐背景及人物结局。史籍叙事、研究推测和创作对白分别标明，出处可在每段下方打开。见 [史料校核](docs/hanxizai-history-notes.md)。

夜宴入席后会响起轻柔的原创筝笛意象配乐：五折各有旋律，随换折淡入淡出，翻阅人物笺和解谜时自动降低音量。右上角「配乐」（手机为扬声器图标）可关闭声音或调整音量，默认 28%，设置会保留。暂停、切到后台及归卷时停止播放；音色由浏览器生成，不依赖外部音频下载，也不作古曲或真实演奏复原的声明。

## 江山秋色图配乐

三个区域分别播放 `public/paintings/jiangshan-qiuse/music/` 下的溪桥行旅、山湖叠翠、江村秋色 MP3。入画时开启，Esc 暂停面板可调音量或静音，偏好自动保存。

音乐边界复用地图 ZONES：溪桥/山湖在 x=-112，山湖/江村在 x=74。每个边界两侧各 12 米使用位置驱动的等功率混音，快速折返不重播。音量变化约 0.8 秒收敛，离开区域后淡出并保存进度。首次从曲首播放，曲尾与曲首采用 2 秒交叠循环。实际解码后按 RMS 仅衰减较响曲目，避免跨区平均电平落差；不修改原音频。

暂停淡出并保存进度，续游渐入；人物对白气泡可见时降音；页面隐藏停止音源，归卷释放音频上下文。下载失败不阻塞游览，可在暂停面板重试。
