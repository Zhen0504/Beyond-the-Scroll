# 绘画纸人实施计划

Spec: docs/superpowers/specs/2026-10-12-paper-puppet-design.md
范围：仅独立测试页，参考图风格优先，正式画境人物不替换。

- [x] 内置 image_gen 从用户参考提取透明三视图，保存到 public/characters/song-lady/，记录提示。
- [x] PaintedLady.js 用视角权重与轻微纸面、裙摆形变展示人物，保留交叠双手，处理载入及释放。
- [x] PaperStage.js 管理巡行、镜头、柔和地面及资源；Lab.jsx/CSS 支持三视图、近看、动作与移动端控件。
- [x] paper-puppet.html 和 Vite 多页入口独立于正式场景。
- [x] 单元测试、浏览器三视图/行走/暂停/手机检查、生产构建及原画境回归。
