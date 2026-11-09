#!/usr/bin/env python3
"""List every file in the package with its duration or pixel size and its size, as Markdown.

usage: python3 -I delivery/inventory.py PACKAGE_DIR > files.md
Used by the packager to check its own work and by the README writer to quote sizes and counts.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import probe, usage  # noqa: E402


def main():
    usage(__doc__, sys.argv[1:])
    root = sys.argv[1]
    print(f"# Files in {os.path.basename(root.rstrip('/'))}\n\n| File | Detail | Size |\n|---|---|---|")
    total = 0
    for d, _, fs in sorted(os.walk(root)):
        for f in sorted(fs):
            if f == ".DS_Store":
                continue
            p = os.path.join(d, f)
            sz = os.path.getsize(p)
            total += sz
            det = ""
            if f.endswith((".mp4", ".mov")):
                m = probe(p)
                det = f"{m['duration']:.1f} s, {m['width']}x{m['height']}@{m['fps']}, audio {'yes' if m['audio'] else 'NO'}"
            elif f.endswith((".png", ".jpg", ".jpeg")):
                try:
                    from PIL import Image
                    w, h = Image.open(p).size
                    det = f"{w}x{h}"
                except Exception:
                    det = "image"
            print(f"| `{os.path.relpath(p, root)}` | {det} | {sz / 1e6:.2f} MB |")
    print(f"\nTotal: {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
