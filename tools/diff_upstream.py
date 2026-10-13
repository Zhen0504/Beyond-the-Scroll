"""Re-download the pristine upstream tarball and diff it against our working copy.

Writes a human-readable change report so the team can see exactly which existing
files were touched and what was added.
"""
import hashlib
import io
import os
import ssl
import sys
import tarfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PRISTINE = os.path.join(HERE, "_upstream_pristine")
REPORT = os.path.join(HERE, "_upstream_diff.txt")
OURS = os.path.join(HERE, "repo-src")

GH = "Zhen0504/Beyond-the-Scroll/archive/refs/heads/main.tar.gz"
MIRRORS = [
    f"https://ghfast.top/https://github.com/{GH}",
    f"https://gh-proxy.com/https://github.com/{GH}",
    f"https://ghproxy.net/https://github.com/{GH}",
]

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

SKIP_DIRS = {"node_modules", "dist", ".npm-cache", ".git"}


def fetch() -> bytes:
    for url in MIRRORS:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=240, context=CTX) as r:
                blob = r.read()
            if blob[:2] == b"\x1f\x8b":
                print(f"downloaded {len(blob)/1024/1024:.2f} MB <- {url}")
                return blob
            print(f"not gzip: {url}")
        except Exception as exc:  # noqa: BLE001
            print(f"fail {type(exc).__name__}: {exc} <- {url}")
    raise SystemExit("all mirrors failed")


def extract(blob: bytes, dest: str) -> None:
    os.makedirs(dest, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tf:
        members = tf.getmembers()
        for m in members:
            parts = m.name.split("/", 1)
            m.name = parts[1] if len(parts) > 1 else ""
        tf.extractall(dest, members=[m for m in members if m.name])


def walk(root: str) -> dict:
    out = {}
    if not os.path.isdir(root):
        return out
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            p = os.path.join(base, f)
            rel = os.path.relpath(p, root).replace("\\", "/")
            try:
                with open(p, "rb") as fh:
                    out[rel] = hashlib.sha256(fh.read()).hexdigest()
            except OSError:
                out[rel] = "<unreadable>"
    return out


def main() -> int:
    blob = fetch()
    if os.path.isdir(PRISTINE):
        import shutil

        shutil.rmtree(PRISTINE)
    extract(blob, PRISTINE)

    up = walk(PRISTINE)
    ours = walk(OURS)

    added = sorted(set(ours) - set(up))
    removed = sorted(set(up) - set(ours))
    modified = sorted(k for k in set(up) & set(ours) if up[k] != ours[k])

    lines = []
    lines.append("上游原始版本 vs 我们的工作副本")
    lines.append("=" * 60)
    lines.append(f"上游文件数: {len(up)}    工作副本文件数: {len(ours)}")
    lines.append("")
    lines.append(f"--- 新增 ({len(added)}) ---")
    for k in added:
        lines.append(f"  + {k}")
    lines.append("")
    lines.append(f"--- 修改 ({len(modified)}) ---")
    for k in modified:
        lines.append(f"  M {k}")
    lines.append("")
    lines.append(f"--- 删除 ({len(removed)}) ---")
    for k in removed:
        lines.append(f"  - {k}")

    text = "\n".join(lines)
    with open(REPORT, "w", encoding="utf-8") as fh:
        fh.write(text)
    print()
    print(text)
    print()
    print(f"report -> {REPORT}")
    print(f"pristine copy -> {PRISTINE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
