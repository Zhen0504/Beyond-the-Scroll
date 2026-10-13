"""Download the full Beyond-the-Scroll source tree (tar.gz) through a mirror.

Saves to repo-src/ and extracts in place so the project is runnable as-is.
"""
import os
import ssl
import sys
import tarfile
import urllib.request
from io import BytesIO

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, "repo-src")
GH = "Zhen0504/Beyond-the-Scroll/archive/refs/heads/main.tar.gz"

MIRRORS = [
    f"https://ghfast.top/https://github.com/{GH}",
    f"https://gh-proxy.com/https://github.com/{GH}",
    f"https://ghproxy.net/https://github.com/{GH}",
    f"https://codeload.github.com/{GH}",
]

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def looks_like_gzip(data: bytes) -> bool:
    return data[:2] == b"\x1f\x8b"


def main() -> int:
    os.makedirs(DEST, exist_ok=True)
    blob = None
    for url in MIRRORS:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=180, context=CTX) as resp:
                data = resp.read()
            if looks_like_gzip(data):
                print(f"[ok] {len(data)/1024/1024:.2f} MB <- {url}")
                blob = data
                break
            print(f"[bad] not gzip ({len(data)} bytes) <- {url}")
        except Exception as exc:  # noqa: BLE001
            print(f"[fail] {type(exc).__name__}: {exc} <- {url}")
    if blob is None:
        return 1

    with tarfile.open(fileobj=BytesIO(blob), mode="r:gz") as tf:
        members = tf.getmembers()
        # strip the leading "Beyond-the-Scroll-main/" component
        for m in members:
            parts = m.name.split("/", 1)
            m.name = parts[1] if len(parts) > 1 else ""
        tf.extractall(DEST, members=[m for m in members if m.name])

    count = sum(len(files) for _, _, files in os.walk(DEST))
    print(f"extracted {count} files to {DEST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
