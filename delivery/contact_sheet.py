#!/usr/bin/env python3
"""Labelled contact sheets from a video, drawn with Pillow (many ffmpeg builds lack `drawtext`).

usage:
  python3 -I delivery/contact_sheet.py VIDEO OUT_DIR --every 1.0 [--from 0] [--to END] [--cols 6] [--per 36] [--width 480]
  python3 -I delivery/contact_sheet.py VIDEO OUT_DIR --at 20.0,20.5,21.0 [--cols 2] [--width 960]   # a "strip"

Writes OUT_DIR/sheet_<first-second>.jpg (and the extracted frames under OUT_DIR/frames/), each tile stamped with
its film time. Both modes are frame-exact: --every uses the fps filter, --at seeks after -i (slower, accurate).
Read the sheets yourself or hand them to a frame-describer agent; never judge a film from its storyboard alone.
"""
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import FFMPEG, die, ensure, probe, run, usage  # noqa: E402

from PIL import Image, ImageDraw, ImageFont  # noqa: E402

FONTS = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]


def font(size):
    for f in FONTS:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def opt(args, k, default, cast=float):
    return cast(args[args.index(k) + 1]) if k in args else default


def main():
    a = sys.argv[1:]
    usage(__doc__, a, 2)
    video, out = a[0], ensure(a[1])
    frames = ensure(os.path.join(out, "frames"))
    cols = opt(a, "--cols", 6, int)
    per = opt(a, "--per", 36, int)
    W = opt(a, "--width", 480, int)
    H = W * 9 // 16
    for f in glob.glob(os.path.join(frames, "*.jpg")):
        os.remove(f)
    if "--at" in a:
        times = [float(x) for x in a[a.index("--at") + 1].split(",")]
        for t in times:
            run([FFMPEG, "-v", "error", "-y", "-i", video, "-ss", f"{t}", "-frames:v", "1", "-vf", f"scale={W}:-2", "-q:v", "3", os.path.join(frames, f"t{t:09.3f}.jpg")])
    else:
        step = opt(a, "--every", 1.0)
        t0 = opt(a, "--from", 0.0)
        t1 = opt(a, "--to", probe(video)["duration"])
        run([FFMPEG, "-v", "error", "-y", "-ss", str(t0), "-to", str(t1), "-i", video, "-vf", f"fps=1/{step},scale={W}:-2", "-q:v", "3", os.path.join(frames, "n%05d.jpg")])
        for f in sorted(glob.glob(os.path.join(frames, "n*.jpg"))):
            n = int(os.path.basename(f)[1:6]) - 1
            os.rename(f, os.path.join(frames, f"t{t0 + n * step:09.3f}.jpg"))
    files = sorted(glob.glob(os.path.join(frames, "t*.jpg")))
    fnt = font(max(14, W // 22))
    for i in range(0, len(files), per):
        chunk = files[i:i + per]
        rows = (len(chunk) + cols - 1) // cols
        sheet = Image.new("RGB", (W * cols, H * rows), "white")
        for j, f in enumerate(chunk):
            t = float(os.path.basename(f)[1:-4])
            im = Image.open(f).convert("RGB").resize((W, H))
            d = ImageDraw.Draw(im)
            label = f"{int(t // 60)}:{t % 60:05.2f}"
            tw = d.textlength(label, font=fnt)
            d.rectangle([0, 0, tw + 10, fnt.size + 8], fill="black")
            d.text((5, 3), label, fill="yellow", font=fnt)
            sheet.paste(im, ((j % cols) * W, (j // cols) * H))
        first = float(os.path.basename(chunk[0])[1:-4])
        p = os.path.join(out, f"sheet_{first:07.1f}.jpg")
        sheet.save(p, quality=82)
        print(p)


if __name__ == "__main__":
    main()
