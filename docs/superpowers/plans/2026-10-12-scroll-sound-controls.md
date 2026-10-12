# 右上角配乐与卷轴音效 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 画卷一右上角可调配乐，卷轴展收过程播放轻柔合成音效。
**Architecture:** RegionMusicControl 重用夜宴面板样式，WorldScene 传入 playing；ScrollSound 使用运动驱动的滤波噪声和木轴短音，与 GSAP update/call 同步。
**Tech Stack:** React、GSAP、Web Audio；不增加依赖。
**Spec:** docs/superpowers/specs/2026-10-12-scroll-sound-controls-design.md

## Global Constraints
- 仅 Esc 暂停；不增加 M 快捷键。
- 不修改夜宴逻辑，不修改用户已有 package-lock.json。
- 无音频能力时动画正常；卸载与隐藏停止音效。

### Task 1: 右上角配乐
- [x] RegionMusicControl.jsx 改为同款图标和弹层；state 仍来自 RegionMusic；playing=true 禁止操作并提示 Esc，续游关闭弹层。
- [x] WorldScene.jsx 将控件移到右上角容器；卡片说明操作；WorldScene.css 添加容器定位、可点击层级与手机卡片布局。
- [x] 浏览器点击按钮、调滑条、开关、Esc 和外部关闭；390 像素截图检查。

### Task 2: 卷轴音效
- [x] 创建 ScrollSound.js：unlock()、begin(state)、update(state)、tap()、stop()、dispose()；滤波噪声 gain 由 open/spin 速度驱动，tap 为阻尼木质短音。
- [x] EntryScene.jsx 创建/清理实例，在用户手势解锁；timelineArgs 传 sound。timelines.js onUpdate 驱动声强，结束 call 停止，落定位置 call 短音。
- [x] Node 模拟音频与时钟验证重复播放、运动与停止、异步解锁、隐藏和 dispose。

### Task 3: 验证交付
- [x] npm test、npm run build、git diff --check。
- [x] 浏览器展卷收卷、真实音源增益与释放、右上角暂停操作、移动端及夜宴回归。
- [x] README 与设计文档记录结果，仅提交本次代码与文档。

