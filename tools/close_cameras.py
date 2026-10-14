"""Pull the fold camera rail closer so each fold fills the frame.

The 62 degree fov needs the camera about 2.4-2.9 units from the mural to make a
single fold readable.  This shifts every [x, y, z] triple in story.js by the
same amount so the authored relative motion between stops is preserved.
"""
import pathlib
import re

P = pathlib.Path(r"repo-src\src\scenes\world\fuwang\story.js")
OLD_LO, OLD_HI = 3.2, 4.1
NEW_LO, NEW_HI = 2.3, 2.9
SCALE = (NEW_HI - NEW_LO) / (OLD_HI - OLD_LO)


def fix(m):
    x, y, z = m.group(1), m.group(2), float(m.group(3))
    nz = NEW_LO + (z - OLD_LO) * SCALE
    return f"[{x}, {y}, {round(nz, 2)}]"


text = P.read_text(encoding="utf-8")
new, n = re.subn(
    r"\[(-?\d+(?:\.\d+)?), (\d+(?:\.\d+)?), (\d+(?:\.\d+)?)\]", fix, text
)
P.write_text(new, encoding="utf-8")
print(f"rewrote {n} coordinate triples ({OLD_LO}-{OLD_HI} -> {NEW_LO}-{NEW_HI})")
for line in new.splitlines():
    s = line.strip()
    if s.startswith("[") and s.endswith("],"):
        print("   ", s)
