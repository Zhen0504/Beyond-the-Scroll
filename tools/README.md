# tools — 卷三的开发与验证脚本

这些脚本是开发卷三《鹿王本生》时使用的工具，保留下来便于日后复用。

> 运行前请先 `npm install`，并确保仓库根目录可写。
> 所有脚本用系统 Python（需 `Pillow`）运行；CDP 相关脚本需本机装有 Edge。

## 一、素材取用

| 脚本 | 用途 |
|---|---|
| `fetch_repo.py` | 通过 `ghfast.top` 镜像下载整个仓库 tarball 并解包（本机直连 GitHub 不通时用） |
| `find_mural.py` | 在 Wikimedia Commons 检索莫高窟第257窟壁画，列出分辨率与许可，并标出疑似商品／拼图照片 |
| `fetch_candidates.py` | 下载若干候选图到 `_mural_candidates/` 供人工比对 |
| `promote_mural.py` | 把选定图（`鹿王本生故事畫.jpg`，6496×1114，公有领域）落到 `public/paintings/fuwang-bensheng/`，并写出 `attribution.json` |
| `analyse_mural.py` | 分析壁画照片的亮度分布与主色，用于确定取色与裁切 |

> ⚠️ `find_mural.py` 的"疑似商品"标记是有意保留的：最早选中一张图实为**拼图产品照片**
> （画面有拼图切割线、产品图注与红色水印），正是靠这个标记才发现并弃用。

## 二、立轴缩略图

| 脚本 | 用途 |
|---|---|
| `make_hanging_vertical.py` | 把 5.8:1 的横卷编排成竖幅立轴（上段整卷通栏 + 中段画心 + 卷末朱砂印），输出 `hanging.jpg` |
| `make_hanging.py` | 早期版本：按 `--u` 指定窗口裁横条 |

## 三、相机标定与批量修正

| 脚本 | 用途 |
|---|---|
| `cdp_measure.py` | **关键**：实测"每单位相机距离可见多少壁画 u 宽"，得出标定常数 |
| `close_cameras.py` | 按比例收紧全部机位距离 |
| `fix_targets.py` | 把注视点恢复到壁画平面（z = 0） |

## 四、验证（DevTools 协议）

这些脚本通过 CDP 驱动真实的无头 Edge，而不是模拟 DOM —— 因为
**PowerShell 管道在本机沙箱内被限制**，无法直接读取另一个进程的 stdout。

| 脚本 | 用途 |
|---|---|
| `cdp_folds.py` | CDP 客户端基础模块（`http_json` / `WS`），被其它脚本复用 |
| `cdp_checkfolds.py` | 检查每一折的取景是否覆盖自己的敷彩区段 |
| `cdp_measure.py` | 见上 |
| `cdp_console.py` | 抓取运行时控制台报错（曾据此定位 4 个真实缺陷） |
| `cdp_walk.py` | 走完整流程并逐阶段截图：门页 → 入画 → 敷彩 → 释文 |
| `cdp_audit2.py` | 完整功能审计（26 项），输出通过／失败清单 |
| `cdp_shot.py` | 稳定截图（等待真实时间，不用 `--virtual-time-budget`） |

## 五、运行方式

```bash
# 先起服务（二选一）
npm run dev                 # 开发模式，暴露 window.__world，便于探针
npm run build && npm run preview

# 再跑脚本
python tools/cdp_measure.py
python tools/cdp_checkfolds.py
python tools/cdp_walk.py
```

脚本内的 URL 默认指向 `http://127.0.0.1:5173/#fuwang`（dev）。
对生产预览运行时，把端口改为 `5199` 或 `4173`。

## 六、踩过的坑（供日后参考）

1. **本机无法直连 GitHub**：`raw.githubusercontent.com` 被解析为 `0.0.0.0`，
   PowerShell 直连 `github.com`／`codeload` 亦被重置。可用通道是 `ghfast.top` 镜像。
2. **`npm install` 报 EPERM**：沙箱不允许写默认缓存目录，把 `cache` 指到项目内即可。
3. **`vite build` 报 `spawn EPERM`**：Vite 用 `exec` 探测路径，受限沙箱下必然失败。
4. **无头截图会抓到动画首帧**：`--virtual-time-budget` 对 GSAP／WebGL 不可靠，
   应改用 CDP：导航 → 真实等待 → `Page.captureScreenshot`。
5. **`--dump-dom` 在异步回调前就返回**：读不到脚本写入的内容，须用 CDP 轮询。
6. **`window.__world` 只在 DEV 暴露**：生产构建下探针不可用。
