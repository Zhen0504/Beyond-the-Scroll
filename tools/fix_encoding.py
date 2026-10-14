"""把 WorldScene.jsx 里被 GBK 写入的 FUWANG_KEYS 段定点换成正确的 UTF-8 文本。

只动这一段的字节，其余部分原样保留。
"""
import sys

PATH = sys.argv[1]
CORRECT = (
    "const FUWANG_KEYS = [\n"
    "  ['1—4', '为该色整体敷彩 / 再按还原'],\n"
    "  ['点击色块', '同上'],\n"
    "  ['[ ] 或 Q E', '换折'],\n"
    "  ['R', '还原本折'],\n"
    "  ['L', '读释文'],\n"
    "  ['Esc', '暂停'],\n"
    "];"
)

raw = open(PATH, "rb").read()
start = raw.find(b"const FUWANG_KEYS")
if start < 0:
    print("未找到 FUWANG_KEYS")
    sys.exit(1)
# 该段的结尾是本段内的第一个 "];"
end = raw.find(b"];", start)
if end < 0:
    print("未找到段尾")
    sys.exit(1)
end += 2

old = raw[start:end]
print("原段字节数:", len(old))
out = raw[:start] + CORRECT.encode("utf-8") + raw[end:]
open(PATH, "wb").write(out)

text = open(PATH, encoding="utf-8").read()
import re
m = re.search(r"const FUWANG_KEYS = \[.*?\];", text, re.S)
print("修复后:")
print(m.group(0))
print("\n文件是合法 UTF-8，共", len(text), "字符")
