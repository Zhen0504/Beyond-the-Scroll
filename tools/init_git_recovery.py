"""Initialise a git repo at the delivery folder with two commits.

Commit 1 = pristine upstream, commit 2 = our working copy.  This gives the team
a real rollback target (git diff / git checkout) even though the original clone
had no history.
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DELIVERY = r"E:\study\比赛\项目\数媒\画中奇谭-项目资料\站点源码"
PRISTINE = os.path.join(HERE, "_upstream_pristine")
OURS = os.path.join(HERE, "repo-src")

# 不入库：依赖、构建产物、缓存
EXCLUDE = ["node_modules/", "dist/", ".npm-cache/", "*.log"]


def git(*args, cwd):
    r = subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    if r.returncode != 0 and "nothing to commit" not in (r.stdout + r.stderr):
        print(f"  git {' '.join(args)} -> {r.returncode}: {(r.stderr or r.stdout).strip()[:200]}")
    return r


def copy_tree(src, dst):
    for base, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in {"node_modules", "dist", ".npm-cache", ".git"}]
        rel = os.path.relpath(base, src)
        target_dir = os.path.join(dst, rel) if rel != "." else dst
        os.makedirs(target_dir, exist_ok=True)
        for f in files:
            shutil.copy2(os.path.join(base, f), os.path.join(target_dir, f))


def main() -> int:
    if not os.path.isdir(PRISTINE):
        print("pristine copy missing; run diff_upstream.py first")
        return 1

    print("1) 清空投放目录并写入上游原始版本")
    if os.path.isdir(DELIVERY):
        shutil.rmtree(DELIVERY)
    os.makedirs(DELIVERY)
    copy_tree(PRISTINE, DELIVERY)

    print("2) 初始化 git 并提交原始版本")
    git("init", "-q", cwd=DELIVERY)
    git("config", "user.email", "team@example.com", cwd=DELIVERY)
    git("config", "user.name", "Beyond the Scroll", cwd=DELIVERY)
    with open(os.path.join(DELIVERY, ".gitignore"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(EXCLUDE) + "\n")
    git("add", "-A", cwd=DELIVERY)
    git("commit", "-q", "-m", "upstream: 原始版本（Zhen0504/Beyond-the-Scroll main）", cwd=DELIVERY)

    print("3) 覆盖为我们的工作副本")
    copy_tree(OURS, DELIVERY)

    print("4) 提交卷三改动")
    git("add", "-A", cwd=DELIVERY)
    git(
        "commit",
        "-q",
        "-m",
        "feat: 新增卷三《鹿王本生》——参与式敷彩 + 第257窟洞窟空间",
        cwd=DELIVERY,
    )

    print("\n5) 变更统计")
    st = git("show", "--stat", "--oneline", "HEAD", cwd=DELIVERY)
    print(st.stdout)

    print("\n6) 被修改的既有文件（相对原始版本）")
    d = git("diff", "--name-status", "HEAD~1", "HEAD", "--", "src", "index.html", "README.md",
            "package.json", "tests", cwd=DELIVERY)
    print(d.stdout)

    print("\n完成。可回滚的用法：")
    print(f"  cd \"{DELIVERY}\"")
    print("  git diff HEAD~1 HEAD          # 看全部改动")
    print("  git checkout HEAD~1 -- src/App.jsx   # 还原单个文件到原始版本")
    print("  git revert HEAD               # 整体撤销卷三改动")
    return 0


if __name__ == "__main__":
    sys.exit(main())
