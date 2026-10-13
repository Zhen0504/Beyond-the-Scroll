"""Attach our scroll-three work onto the real upstream history.

Our git history was rebuilt from a tarball, so its root commit is not an ancestor
of upstream/main — a plain push would be rejected.  This script:

  1. adds the GitHub remote and fetches the real history
  2. creates a feature branch based on origin/main
  3. overlays our working copy (files, not .git) onto that branch
  4. commits, and reports exactly what changed

It does NOT push.  A backup branch of our previous state is kept.
"""
import os
import shutil
import subprocess
import sys

DELIVERY = r"E:\study\比赛\项目\数媒\画中奇谭-项目资料\站点源码"
WORKSPACE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "repo-src"
)
REMOTE = "https://github.com/Zhen0504/Beyond-the-Scroll.git"
BRANCH = "feat/juan-3-fuwang"


def git(*args, cwd=DELIVERY, check=False):
    r = subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True,
        encoding="utf-8", errors="replace",
    )
    out = ((r.stdout or "") + (r.stderr or "")).strip()
    if check and r.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed:\n{out}")
    return r.returncode, out


def main() -> int:
    print("== 0. 确认工作区副本完好 ==")
    fuwang = os.path.join(WORKSPACE, "src", "scenes", "world", "fuwang")
    if not os.path.isdir(fuwang):
        print("ABORT: workspace fuwang scene missing")
        return 1
    app = open(os.path.join(WORKSPACE, "src", "App.jsx"), encoding="utf-8").read()
    if "fuwang" not in app:
        print("ABORT: workspace App.jsx has no fuwang route")
        return 1
    print(f"   ok: {len(os.listdir(fuwang))} fuwang modules, App.jsx routed")

    print("\n== 1. 备份当前状态 ==")
    code, out = git("branch", "backup/tarball-history")
    print(f"   {out or 'backup/tarball-history 已存在'}")

    print("\n== 2. 配置远程并抓取真实历史 ==")
    code, out = git("remote", "get-url", "origin")
    if code != 0:
        code, out = git("remote", "add", "origin", REMOTE)
        print(f"   remote added: {out or REMOTE}")
    else:
        print(f"   remote already set: {out}")
    code, out = git("fetch", "--depth", "50", "origin", "main", check=True)
    print(f"   fetched: {out.splitlines()[-1] if out else 'ok'}")

    print("\n== 3. 建集成分支（基于 origin/main）==")
    git("checkout", "-q", "-B", BRANCH, "origin/main", check=True)
    code, out = git("rev-parse", "--short", "HEAD")
    print(f"   分支 {BRANCH} 基于 {out}")

    print("\n== 4. 覆盖为我们的版本（仅文件，不碰 .git）==")
    copied = 0
    for base, dirs, files in os.walk(WORKSPACE):
        dirs[:] = [d for d in dirs if d not in {"node_modules", "dist", ".npm-cache", ".git"}]
        rel = os.path.relpath(base, WORKSPACE)
        target = os.path.join(DELIVERY, rel) if rel != "." else DELIVERY
        os.makedirs(target, exist_ok=True)
        for f in files:
            shutil.copy2(os.path.join(base, f), os.path.join(target, f))
            copied += 1
    print(f"   覆盖 {copied} 个文件")

    print("\n== 4b. 确保依赖与缓存不入库 ==")
    ignore = os.path.join(DELIVERY, ".gitignore")
    wanted = ["node_modules/", "dist/", ".npm-cache/", "*.log"]
    current = open(ignore, encoding="utf-8").read() if os.path.exists(ignore) else ""
    if ".npm-cache/" not in current:
        with open(ignore, "w", encoding="utf-8") as fh:
            fh.write("\n".join(wanted) + "\n")
        print("   .gitignore 已修正（加入 .npm-cache/）")
    # 从索引中移除误入的缓存（保留工作区文件）
    code, out = git("rm", "-r", "--cached", "-q", ".npm-cache")
    if code == 0:
        print("   已从索引移除 .npm-cache/")
    else:
        print("   .npm-cache/ 不在索引中（正常）")

    print("\n== 5. 提交 ==")
    git("add", "-A", check=True)
    code, out = git("status", "--porcelain")
    changed = [l for l in out.splitlines() if l.strip()]
    print(f"   暂存变更: {len(changed)} 项")
    if not changed:
        print("   无变更，可能已经集成过")
    else:
        code, out = git(
            "commit", "-q", "-m",
            "feat: 新增卷三《鹿王本生》——参与式敷彩与第257窟洞窟空间\n\n"
            "- 壁画两态材质（残损褪色 ↔ 重彩复原），笔触以 Ping-Pong RT 累积\n"
            "- 五折导览：救溺 / 背誓 / 悬赏 / 围猎 / 陈情，机位由折区间反算\n"
            "- 第257窟洞窟空间：中心塔柱、人字披、千佛列、天宫伎乐、药叉（程序化）\n"
            "- 「释文与依据」面板：释文逐字引自敦煌研究院网站并逐条标注出处\n"
            "- 新增 21 项单元测试；既有测试同步适配（GuidedTour 章节目录改为构造参数）",
            check=True,
        )
        print("   提交完成")

    print("\n== 6. 变更清单（相对 origin/main）==")
    code, out = git("diff", "--shortstat", "origin/main", "HEAD")
    print("   " + out)
    print("\n   修改的既有文件：")
    code, out = git("diff", "--name-status", "origin/main", "HEAD", "--diff-filter=M")
    for line in out.splitlines():
        if line.strip():
            print("     " + line.strip().replace("\t", "  "))
    print("\n   新增的文件：")
    code, out = git("diff", "--name-status", "origin/main", "HEAD", "--diff-filter=A")
    added = [l.split("\t", 1)[1] for l in out.splitlines() if "\t" in l]
    for p in sorted(added):
        print("     + " + p)

    print("\n== 7. 分支状态 ==")
    code, out = git("log", "--oneline", "-3")
    print(out)

    print("\n下一步（推送，需你们在有凭据的终端执行）：")
    print(f'  cd "{DELIVERY}"')
    print(f"  git push -u origin {BRANCH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
