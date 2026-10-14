"""Finish the rollback history: commit our working copy as the second commit.

Safe by construction: this script never deletes or copies project files.  It only
stages the files already present in the delivery folder and commits them, so an
upstream commit remains as the rollback target.
"""
import os
import subprocess
import sys

DELIVERY = r"E:\study\比赛\项目\数媒\画中奇谭-项目资料\站点源码"


def git(*args):
    r = subprocess.run(
        ["git", *args],
        cwd=DELIVERY,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def main() -> int:
    if not os.path.isdir(os.path.join(DELIVERY, ".git")):
        print("delivery folder is not a git repo")
        return 1

    # 确认工作区里确实是我们的版本
    app = open(os.path.join(DELIVERY, "src", "App.jsx"), encoding="utf-8").read()
    if "fuwang" not in app:
        print("ABORT: App.jsx has no fuwang route — refusing to commit")
        return 1
    fuwang = os.path.join(DELIVERY, "src", "scenes", "world", "fuwang")
    if not os.path.isdir(fuwang):
        print("ABORT: fuwang scene directory missing — refusing to commit")
        return 1
    print(f"ok: fuwang scene present ({len(os.listdir(fuwang))} files), App.jsx routed")

    code, out = git("add", "-A")
    print(f"git add -A -> {code}")

    code, out = git("status", "--porcelain")
    changed = [l for l in out.splitlines() if l.strip()]
    print(f"staged changes: {len(changed)} entries")

    code, out = git(
        "commit", "-q", "-m",
        "feat: 新增卷三《鹿王本生》——参与式敷彩 + 第257窟洞窟空间",
    )
    print(f"git commit -> {code} {out.strip()[:200]}")

    print("\n--- 提交历史 ---")
    print(git("log", "--oneline")[1])

    print("--- 相对原始版本的变更概览 ---")
    code, out = git("diff", "--shortstat", "HEAD~1", "HEAD")
    print(out.strip())

    print("\n--- 被修改的既有文件 ---")
    code, out = git("diff", "--name-status", "HEAD~1", "HEAD", "--",
                    "src/App.jsx", "src/data/paintings.js", "src/scenes/world/WorldScene.jsx",
                    "src/scenes/world/hanxizai/GuidedTour.js", "src/scenes/world/hanxizai/index.js",
                    "tests/hanxizai.test.js", "index.html", "README.md")
    for line in out.splitlines():
        if line.strip():
            print("   " + line.strip())

    print("\n--- 新增文件数（按目录）---")
    code, out = git("diff", "--name-status", "HEAD~1", "HEAD", "--diff-filter=A")
    added = [l.split("\t", 1)[1] for l in out.splitlines() if "\t" in l]
    groups = {}
    for p in added:
        top = "/".join(p.split("/")[:3])
        groups[top] = groups.get(top, 0) + 1
    for k in sorted(groups):
        print(f"   {groups[k]:>3}  {k}")

    print("\n可回滚用法：")
    print(f'  cd "{DELIVERY}"')
    print("  git diff HEAD~1 HEAD                 # 全部改动")
    print("  git checkout HEAD~1 -- src/App.jsx   # 单文件还原")
    print("  git revert --no-edit HEAD            # 整体撤销卷三")
    return 0


if __name__ == "__main__":
    sys.exit(main())
