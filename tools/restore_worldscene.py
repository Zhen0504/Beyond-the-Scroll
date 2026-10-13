"""从干净的提交取回 WorldScene.jsx，并正确更新卷三的按键提示。

该文件在 0513d01 里因 PowerShell Set-Content（cp936）被写坏，
多处 UTF-8 字符被截断。877db2f（合并提交）里它是完好的。
"""
import re
import subprocess
import sys

REPO = r"E:\study\比赛\项目\数媒\画中奇谭-项目资料\站点源码"
REV = "877db2f"
PATH = "src/scenes/world/WorldScene.jsx"

blob = subprocess.run(["git", "show", f"{REV}:{PATH}"],
                      capture_output=True, cwd=REPO).stdout
text = blob.decode("utf-8")          # 这里若失败就直接报错，不写坏文件
print("从 %s 取回：%d 字符，UTF-8 正常" % (REV, len(text)))

NEW_KEYS = """const FUWANG_KEYS = [
  ['1—4', '为该色整体敷彩 / 再按还原'],
  ['点击色块', '同上'],
  ['[ ] 或 Q E', '换折'],
  ['R', '还原本折'],
  ['L', '读释文'],
  ['Esc', '暂停'],
];"""

m = re.search(r"const FUWANG_KEYS = \[.*?\];", text, re.S)
if not m:
    print("！未找到 FUWANG_KEYS")
    sys.exit(1)
print("旧内容:")
print(m.group(0))
text = text[:m.start()] + NEW_KEYS + text[m.end():]

checks = {
    "UTF-8": True,
    "FuwangGuide": "FuwangGuide" in text,
    "Fuwang.css": "fuwang/Fuwang.css" in text,
    "buildFuwangWorld": "buildFuwangWorld" in text,
    "GUIDED 保留": "const GUIDED" in text,
    "队友 RegionMusicControl": "RegionMusicControl" in text,
    "新按键提示": "为该色整体敷彩" in text,
}
for k, v in checks.items():
    print(("  ✓ " if v else "  ✗ ") + k)
if not all(checks.values()):
    print("\n！检查未通过，未写入")
    sys.exit(1)

open(sys.argv[1], "w", encoding="utf-8", newline="").write(text)
back = open(sys.argv[1], encoding="utf-8").read()
m2 = re.search(r"const FUWANG_KEYS = \[.*?\];", back, re.S)
print("\n写入完成，回读 %d 字符" % len(back))
print(m2.group(0))
