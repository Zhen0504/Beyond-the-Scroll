# 江山三区配乐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 给三个画境区域接入用户指定 MP3，保证连续过渡与安全生命周期。
**Architecture:** 地图 ZONES 决定等功率分区权重；独立 Web Audio 控制器负责预载、解码、曲尾交叠、续播和销毁；React 卡片提供配乐偏好。
**Tech Stack:** React、Web Audio、Node test、Vite；不增加依赖。
**Spec:** docs/superpowers/specs/2026-10-12-jiangshan-music-design.md

## Global Constraints
- 三首复制重命名，保留原文件。
- 边界 -112、74，两侧各 12 米，主音量默认 35%。
- 暂停 0.4 秒、入画 1 秒、对白音量 65%、循环交叠 2 秒。
- 不改现有夜宴逻辑，不提交已有 package-lock.json 改动。

### Task 1: 音频控制器与素材
Files: src/scenes/world/jiangshan/RegionMusic.js, tests/jiangshan-music.test.js, public/paintings/jiangshan-qiuse/music/*.mp3
Interfaces: regionWeights(x,boundaries), RegionMusic({urls,boundaries,environment}); unlock(), setPlaying(bool), update(x,reading), setVolume(number), setEnabled(bool), retry(), dispose(), subscribe/getSnapshot.
- [x] 添加断言：边界权重各 sqrt(0.5)，区外权重单一，密集采样平方和为 1。
- [x] 运行 node --test tests/jiangshan-music.test.js 确认初始缺模块失败。
- [x] 实现权重和音频控制器；用 decoded buffer 首尾等功率混合生成循环段，首次播放保留曲首前奏；记录音频时钟进度，静音区停止音源。
- [x] 用模拟时钟验证暂停后进度续接、隐藏恢复、异步销毁、单曲失败与重试。
- [x] Copy-Item 复制三曲并用 Get-FileHash 核对。

### Task 2: 场景接入与控件
Files: src/scenes/world/jiangshan/index.js, chatter.js, RegionMusicControl.jsx, src/scenes/world/WorldScene.jsx, WorldScene.css
- [x] 创建控制器、预载；帧内 update(camera.position.x,chatter.isReading)。lock change 调用 setPlaying，stop/dispose 释放音频。
- [x] 入画按钮同步 unlock 后申请指针锁。暂停卡片显示曲名、音量、开关和重试。
- [x] 对白返回可见气泡状态；曲名复用地图 ZONES。aria 标签覆盖控件。
- [x] npm test 与 npm run build；核对修改范围。

### Task 3: 实际浏览器校验与交付
- [x] 可用时在浏览器检查入画、边界两侧和中心、折返、暂停、静音、隐藏与卸载。
- [x] 记录无法完成的实际试听；更新 README 的配乐说明和计划勾选状态。

