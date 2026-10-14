"""Fetch candidate mural images by Commons file title and report licence + save."""
import json
import os
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

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_mural_candidates")

CANDIDATES = [
    ("lwbs_full", "File:鹿王本生故事畫.jpg", 3000),
    ("ninecolored", "File:Nine-colored deer jataka. Northern Wei. Mogao cave 257.jpg", 2600),
    ("dha_center", "File:Deer King Jataka painting, Mogao Cave 257 west wall center.png", 1300),
]


def api(params: dict) -> dict:
    params = {**params, "format": "json", "formatversion": "2"}
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60, context=CTX) as resp:
        return json.loads(resp.read().decode("utf-8"))


def field(meta: dict, key: str) -> str:
    return re.sub(r"<[^>]+>", "", meta.get(key, {}).get("value", "")).strip()


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    for slug, title, width in CANDIDATES:
        try:
            data = api({"action": "query", "titles": title, "prop": "imageinfo",
                        "iiprop": "url|size|extmetadata", "iiurlwidth": str(width)})
            pages = data.get("query", {}).get("pages", [])
            if not pages or "imageinfo" not in pages[0]:
                print(f"[{slug}] NOT FOUND: {title}")
                continue
            ii = pages[0]["imageinfo"][0]
            meta = ii.get("extmetadata", {}) or {}
            url = ii.get("thumburl") or ii.get("url")
            print(f"\n[{slug}] {title}")
            print(f"   original : {ii.get('width')}x{ii.get('height')}")
            print(f"   licence  : {field(meta,'LicenseShortName')}  ({field(meta,'LicenseUrl')})")
            print(f"   artist   : {field(meta,'Artist')}")
            print(f"   credit   : {field(meta,'Credit')[:120]}")
            print(f"   desc page: {ii.get('descriptionurl')}")
            print(f"   fetching : {width}px")
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=180, context=CTX) as resp:
                blob = resp.read()
            ext = ".png" if url.lower().endswith(".png") else ".jpg"
            dest = os.path.join(OUT, slug + ext)
            with open(dest, "wb") as fh:
                fh.write(blob)
            print(f"   saved    : {len(blob)/1024/1024:.2f} MB -> {dest}")
        except Exception as exc:  # noqa: BLE001
            print(f"[{slug}] FAILED {type(exc).__name__}: {exc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
