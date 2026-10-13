"""Look for a clean (non-puzzle, non-merchandise) photograph of the Cave 257
Nine-Coloured Deer mural on Wikimedia Commons, and enumerate Dunhuang files by size.
"""
import json
import re
import ssl
import sys
import urllib.parse
import urllib.request

API = "https://commons.wikimedia.org/w/api.php"
UA = "BeyondTheScroll-student-project/0.1"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

# Heuristics for merchandise / puzzle product photos we must avoid
BAD_WORDS = ["pcs", "拼图", "puzzle", "璀璨敦煌系列", "金線畫", "Gold thread",
             "Exhibition", "exhibition", "HK ", "文创", "商品", "展"]

TERMS = [
    "鹿王本生",
    "九色鹿 壁画",
    "Mogao Cave 257",
    "Dunhuang 257",
    "Dunhuang jataka deer",
    "Mogao caves cave 257 west wall",
]


def api(params: dict) -> dict:
    params = {**params, "format": "json", "formatversion": "2"}
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60, context=CTX) as resp:
        return json.loads(resp.read().decode("utf-8"))


def field(meta: dict, key: str) -> str:
    raw = meta.get(key, {}).get("value", "")
    return re.sub(r"<[^>]+>", "", raw).strip()


def main() -> int:
    seen = {}
    for term in TERMS:
        try:
            data = api({"action": "query", "list": "search", "srsearch": term,
                        "srnamespace": "6", "srlimit": "25"})
        except Exception as exc:  # noqa: BLE001
            print(f"### {term}: FAILED {exc}")
            continue
        hits = [h["title"] for h in data.get("query", {}).get("search", [])]
        if not hits:
            print(f"### {term}: 0 hits")
            continue
        pages = api({"action": "query", "titles": "|".join(hits[:25]),
                     "prop": "imageinfo",
                     "iiprop": "url|size|extmetadata"}).get("query", {}).get("pages", [])
        print(f"\n### {term}")
        for p in pages:
            ii = (p.get("imageinfo") or [{}])[0]
            meta = ii.get("extmetadata", {}) or {}
            title = p.get("title", "?")
            w, h = ii.get("width", 0), ii.get("height", 0)
            lic = field(meta, "LicenseShortName")
            art = field(meta, "Artist")[:40]
            flag = "  <-- 疑似商品/拼图" if any(b in title for b in BAD_WORDS) else ""
            seen[title] = (w * h, w, h, lic, art, flag)
            print(f"  {w:>5}x{h:<5} {lic:<16} {art:<42} {title}{flag}")

    print("\n\n======== 按面积排序（干净候选优先）========")
    for title, (area, w, h, lic, art, flag) in sorted(seen.items(), key=lambda kv: -kv[1][0]):
        if flag:
            continue
        if w < 1500:
            continue
        print(f"  {w:>5}x{h:<5} {lic:<16} {art:<42} {title}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
