#!/usr/bin/env python3
"""Tile extracted frames into one labelled sheet with Pillow (for ffmpeg builds without `drawtext`).

usage: python3 -I film/scripts/review/tile.py <manifest.json>

manifest = {
  "out": "sheets/a.jpg",                 # where the sheet goes (JPEG)
  "cols": 6,                             # tiles per row
  "gap": 4,                              # white gap between tiles, px
  "tiles": [ { "file": "f0001.jpg", "label": "0:12.40", "mark": false }, ... ]
}

Every tile is drawn at the size of the first frame (the frames are extracted at one width). A label is
stamped in the top-left corner the way delivery/contact_sheet.py does it (black box, yellow text); a
tile with "mark": true gets an orange bar along its left edge (the first frame after a cut).
Prints the sheet's path. Exit 1 on a bad manifest or when no frame could be read.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONTS = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"]


def font(size):
    for f in FONTS:
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, size)
            except OSError:
                continue
    return ImageFont.load_default()


def main():
    if len(sys.argv) != 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__.strip())
        sys.exit(0 if len(sys.argv) == 2 else 1)
    m = json.load(open(sys.argv[1], encoding="utf-8"))
    tiles = [t for t in m.get("tiles", []) if os.path.exists(t["file"])]
    if not tiles:
        print("tile.py: no frames to tile", file=sys.stderr)
        sys.exit(1)
    cols = max(1, min(int(m.get("cols", 6)), len(tiles)))
    gap = int(m.get("gap", 4))
    first = Image.open(tiles[0]["file"])
    W, H = first.size
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * W + (cols - 1) * gap, rows * H + (rows - 1) * gap), "white")
    fnt = font(max(14, W // 18))
    for i, t in enumerate(tiles):
        im = Image.open(t["file"]).convert("RGB")
        if im.size != (W, H):
            im = im.resize((W, H))
        d = ImageDraw.Draw(im)
        label = str(t.get("label", ""))
        if label:
            tw = d.textlength(label, font=fnt)
            d.rectangle([0, 0, tw + 10, fnt.size + 8], fill="black")
            d.text((5, 3), label, fill="yellow", font=fnt)
        if t.get("mark"):
            d.rectangle([0, 0, max(4, W // 80), H], fill=(255, 140, 0))
        sheet.paste(im, ((i % cols) * (W + gap), (i // cols) * (H + gap)))
    os.makedirs(os.path.dirname(os.path.abspath(m["out"])), exist_ok=True)
    sheet.save(m["out"], quality=82)
    print(m["out"])


if __name__ == "__main__":
    main()
