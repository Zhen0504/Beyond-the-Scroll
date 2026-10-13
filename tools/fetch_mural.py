"""Fetch the Mogao Cave 257 Nine-Coloured Deer mural from Wikimedia Commons.

Two steps:
  1. imageinfo -> resolve the file, its licence, author and a scaled URL
  2. download the scaled bitmap into the project's public assets
The licence/author data is written out as attribution.json, which the app
must display (CC BY 2.0 requires attribution).
"""
import json
import os
import ssl
import sys
import urllib.parse
import urllib.request

API = "https://commons.wikimedia.org/w/api.php"
UA = "BeyondTheScroll-student-project/0.1 (educational use; contact via GitHub)"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

TITLE = ("File:2021.12.24-12.26 800pcs 璀璨敦煌系列：第257窟-鹿王本生局部圖 "
         "Mogao Grottoes Cave 257 Main Chamber West Wall (1) (51776320643).jpg")

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "repo-src", "public", "paintings", "fuwang-bensheng")


def api(params: dict) -> dict:
    params = {**params, "format": "json", "formatversion": "2"}
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60, context=CTX) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    os.makedirs(OUT, exist_ok=True)

    data = api({
        "action": "query",
        "titles": TITLE,
        "prop": "imageinfo",
        "iiprop": "url|size|extmetadata",
        "iiurlwidth": "4096",
    })
    pages = data.get("query", {}).get("pages", [])
    if not pages or "imageinfo" not in pages[0]:
        print("NOT FOUND / no imageinfo")
        print(json.dumps(data, ensure_ascii=False)[:800])
        return 1

    info = pages[0]["imageinfo"][0]
    meta = info.get("extmetadata", {}) or {}

    def field(key: str) -> str:
        raw = meta.get(key, {}).get("value", "")
        # strip html tags crudely
        import re
        return re.sub(r"<[^>]+>", "", raw).strip()

    record = {
        "title": pages[0].get("title"),
        "descriptionUrl": info.get("descriptionurl"),
        "originalWidth": info.get("width"),
        "originalHeight": info.get("height"),
        "licenseShort": field("LicenseShortName"),
        "licenseUrl": field("LicenseUrl"),
        "artist": field("Artist"),
        "credit": field("Credit"),
        "dateOriginal": field("DateTimeOriginal"),
        "thumbUrl": info.get("thumburl"),
        "thumbWidth": info.get("thumbwidth"),
        "thumbHeight": info.get("thumbheight"),
    }
    print(json.dumps(record, ensure_ascii=False, indent=2))

    with open(os.path.join(OUT, "attribution.json"), "w", encoding="utf-8") as fh:
        json.dump(record, fh, ensure_ascii=False, indent=2)

    url = record["thumbUrl"]
    if not url:
        print("no thumb url -> fall back to original")
        url = info.get("url")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180, context=CTX) as resp:
        blob = resp.read()
    if blob[:2] != b"\xff\xd8":
        print(f"WARNING: not a jpeg ({blob[:4]!r})")
    dest = os.path.join(OUT, "panorama.jpg")
    with open(dest, "wb") as fh:
        fh.write(blob)
    print(f"saved {len(blob)/1024/1024:.2f} MB -> {dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
