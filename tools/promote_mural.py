"""Promote the chosen mural to the project asset and write attribution.

Chosen: File:鹿王本生故事畫.jpg on Wikimedia Commons
  - 6496x1114 full horizontal scroll, public domain, scan via Google Arts & Culture
  - replaces the discarded jigsaw-product photo
"""
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

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "repo-src", "public", "paintings", "fuwang-bensheng")

TITLE = "File:鹿王本生故事畫.jpg"
DELIVERY_WIDTH = 4096          # what the GPU texture will be built from
CREDIT_EXTRA = "敦煌研究院网站（释文引用）"


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
    data = api({"action": "query", "titles": TITLE, "prop": "imageinfo",
                "iiprop": "url|size|extmetadata", "iiurlwidth": str(DELIVERY_WIDTH)})
    pages = data["query"]["pages"]
    ii = pages[0]["imageinfo"][0]
    meta = ii.get("extmetadata", {}) or {}

    record = {
        "artwork": "鹿王本生故事畫（九色鹿本生）",
        "cave": "莫高窟第257窟 西壁中段",
        "period": "北魏",
        "imageLicense": field(meta, "LicenseShortName") or "Public domain",
        "imageLicenseUrl": field(meta, "LicenseUrl"),
        "imageArtist": field(meta, "Artist"),
        "imageCredit": field(meta, "Credit"),
        "sourceFilePage": ii.get("descriptionurl"),
        "originalWidth": ii.get("width"),
        "originalHeight": ii.get("height"),
        "deliveryWidth": DELIVERY_WIDTH,
        "textSource": CREDIT_EXTRA,
        "textSourceUrl": "http://www.dunhuangcaves.org/info/1425/3548.htm",
        "notice": (
            "壁画图像为公有领域扫描件；释文逐字引自敦煌研究院网站并已标注出处。"
            "本作品的敷彩交互与画意短句为项目创作，属艺术转译，"
            "非历史绘制流程的复原，亦非敦煌研究院的官方解读或认可。"
        ),
    }
    print(json.dumps(record, ensure_ascii=False, indent=2))

    url = ii.get("thumburl") or ii["url"]
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=240, context=CTX) as resp:
        blob = resp.read()
    if blob[:2] != b"\xff\xd8":
        print(f"WARNING: unexpected magic {blob[:4]!r}")
    dest = os.path.join(OUT, "panorama.jpg")
    with open(dest, "wb") as fh:
        fh.write(blob)
    print(f"\nsaved {len(blob)/1024/1024:.2f} MB -> {dest}")

    with open(os.path.join(OUT, "attribution.json"), "w", encoding="utf-8") as fh:
        json.dump(record, fh, ensure_ascii=False, indent=2)
    print("wrote attribution.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
