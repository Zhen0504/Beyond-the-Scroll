# 画中奇谭 · Beyond the Scroll

以中国传统名画为舞台的沉浸式文化体验：**入画 — 探索 — 归卷**。

当前进度：
- **卷轴入口**：三轴陈列 → 点击展卷 → 名画介绍
- **画境一 ·《江山秋色图》**：第一人称 2.5D/3D 可游览场景（介绍页点「入画」进入，或直接访问 `/#jiangshan`）
- **画境二 ·《韩熙载夜宴图》**：室内夜宴厅基础画境（多进厅堂、屏风、榻案、烛光与皮影人物；`/#hanxizai` 直达）

## 运行

```bash
npm install
npm run dev      # 本地开发 http://localhost:5173
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
     ├─ layout.js                    五进厅堂、屏风、榻案、烛灯、人物位置
     ├─ architecture.js              粉墙朱柱、梁枋地砖、屏风、榻、案、鼓
     ├─ figures.js                   皮影纸片人物（Billboards）
     ├─ candles.js                   烛台与火苗
     └─ index.js                     组装与主循环
public/paintings/jiangshan-qiuse/textures/
  ├─ backdrop.jpg                    原作全卷（去印章）—— 远景环幕
  ├─ rock-brush.jpg                  原作崖面笔触（无缝）—— 山石、坡岸纹理
  └─ silk.jpg                        原作绢底（无缝）—— 天空与全屏绢纹
```

画境操作：`W A S D` 行走 · `Shift` 疾行 · `空格` 跳跃 · 鼠标环顾 · `E` 登船 / 上岸（船上 `W/S` 划桨、`A/D` 转向）· `Esc` 暂停（可续游或归卷）。

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
