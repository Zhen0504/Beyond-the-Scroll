# 画卷二《韩熙载夜宴图》阶段进度

> 2026-10-12 后续改造：以下为旧版阶段记录。当前为五折固定路线导览、原画门页、17 处停留点、情境对白和十类完整姿态循环；已取消网格蒙皮变形，并将八组椅具绑定坐姿透视，校准榻边间距。新增五折明暗线解谜、十组人物笺与卷后时间线。以 [改造说明](../docs/hanxizai-art-direction.md) 为准。旧的封闭厅堂、自由漫游与 Billboards 人物已替换。

日期：2026-10-12  
分支：`feat/hanxizai-ye-yan`  
阶段目标：场景建模 + 网页效果接近画卷一示例（可逛的室内夜宴厅）

## 已完成

- 从最新 `main` 拉出 `feat/hanxizai-ye-yan`，未改引擎，未动画卷一场景代码。
- 入口启用卷二 `hanxizai-yeyan`（`src/data/paintings.js`），卷轴可展、介绍可入画。
- `WorldScene` 注册 `buildHanxizaiWorld`；`/#hanxizai`、`/#hanxizai-yeyan` 直达（仿 `#jiangshan`）。
- 场景 `src/scenes/world/hanxizai/`：
  - 五进厅堂：听乐/赏乐 → 观舞 → 歇息/小憩 → 清吹 → 散宴
  - 粉墙、朱柱、额枋、露明椽、金砖地面、格子窗
  - 屏风分隔（南北错位留绕行通道），画心贴原卷局部
  - 黑漆榻、案、鼓、坐墩、宫灯、烛台火苗；补充舞筵、席垫、长案、盆架
  - Billboards 皮影人物（朝向镜头、轻微摇曳；细画稿 + 走动侍女）
- 与并行 DeepSeek 成果合并：`puppetPainter.js` / `puppets.js` / `zones.js` / `props.js` 未覆盖，由 `index.js` 接入；`figures.js` 保留为基础版
- 公有领域画心：`public/paintings/hanxizai-yeyan/{hanging,panorama}.jpg`（Wikimedia Commons）
- `npm run build` 通过
- 浏览器核验：`/#hanxizai` 为 loading → ready，画布有厅堂/屏风/人物；`/#jiangshan` 仍为画境·壹且保留登船键

## 巡检后补丁（屏风绕行 + 椅墩/高烛）

- **屏风通道可发现性**：四道屏风缩短至 6 m、偏靠封闭侧，开口通道约 4.3 m（原 ~2.6 m）；开口端加灯竿式端柱 + 地面色带；通道口立高烛。
- **清吹北廊**：长榻缩短，主廊 AISLES 贴壁绕行，不再被榻挡住。
- **椅墩**：鼓式圆墩（底座/鼓腹/腰束/软褥），更易辨认。
- **高烛**：阔座粗茎承盘 + 更大火焰；壁侧与通道口加高。
- **人物搁置**：未改 guest 纸片造型/数量。
- WalkMap 概念核验：spawn 可达五段厅心与四处 gap；`npm run build` 通过。

## 如何预览

```bash
npm install
npm run dev          # http://localhost:5173
```

- 卷轴入口点第二轴《韩熙载夜宴图》→ 入画
- 或直接打开 http://localhost:5173/#hanxizai
- `W A S D` 行走 · `Shift` 疾行 · 空格跳跃 · 鼠标环顾 · `Esc` 暂停归卷
- 绕行提示：屏风开口一侧有地面色带、端柱与高烛；听乐南廊 → 观舞北廊 → 歇息南廊 → 清吹北廊 → 散宴

## 未完成 / 不做声称

- 无完整叙事、对话、任务、闲谈气泡
- 人物为程序化皮影纸片（已按画中身份分角色），非原作勾摹；后续贴图请按 id 合并 `puppets.js` / `layout.js` 的 FIGURES
- 未做音乐、夜宴仪轨、可互动物件
- 未做庭院外景；本阶段止于室内可逛
- 皮影造型、屏风取景、烛光烘焙仍可再打磨

## 验证记录

- `npm run build`：成功（Vite 8.3.4）
- headless Chrome：`/#hanxizai` 出现「画境 · 贰 / 人在画中 / 听乐」且 WebGL 画布有内容
- headless Chrome：`/#jiangshan` 画境一仍可用
- 入口 DOM：含「韩熙载夜宴图」，卷三仍为「画卷待启」
- WalkMap 脚本：五段 + 四 gap 自 spawn 可达；主廊点位无障碍
