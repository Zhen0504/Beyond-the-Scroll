"""扫描所有我改过的文件，找出任何非 UTF-8 的字节。"""
import subprocess
import sys

REPO = r"E:\study\比赛\项目\数媒\画中奇谭-项目资料\站点源码"
files = subprocess.run(
    ["git", "ls-files"], capture_output=True, cwd=REPO
).stdout.decode("utf-8", "replace").split("\n")

bad = []
for f in files:
    f = f.strip()
    if not f:
        continue
    try:
        blob = subprocess.run(["git", "show", f"HEAD:{f}"],
                              capture_output=True, cwd=REPO).stdout
    except Exception:
        continue
    # 只看文本类文件
    if not any(f.endswith(e) for e in
               (".js", ".jsx", ".json", ".css", ".md", ".html", ".glsl", ".py", ".txt")):
        continue
    try:
        blob.decode("utf-8")
    except UnicodeDecodeError as exc:
        bad.append((f, exc.start))

print("HEAD 中非 UTF-8 的文本文件：%d 个" % len(bad))
for f, pos in bad:
    print("  %s  @%d" % (f, pos))
if not bad:
    print("  （全部正常）")
