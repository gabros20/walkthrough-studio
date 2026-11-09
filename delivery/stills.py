#!/usr/bin/env python3
"""03_Screenshots: PNG stills at named film times, cropped for slides, plus the full 16:9 frames.

usage: python3 -I delivery/stills.py package.config.json

Config:
  "stills": {
    "from": "Voiceover",                     # the variant without caption plates
    "crop": {"band": 180,                     # caption band height at the bottom of the 1920x1080 frame
             "window": [192, 36, 1536, 864],  # the app window in wide framing (x, y, w, h), film px
             "margin": 24},
    "items": [{"name": "00_Title-card", "t": 6.0, "crop": "full"},
              {"name": "02b_Ask_Three-options", "t": 37.8, "crop": "band"},
              {"name": "05a_Formats_Facebook-feed", "t": 85.5, "crop": "window"}]
  }
crop modes: "full" (1920x1080 as is), "band" (drop the bottom caption band, keep full width),
"window" (the app window plus an even margin, for wide shots where it floats on the ground),
or an explicit [x, y, w, h].
Writes 03_Screenshots/<product>_<name>.png (cropped) and 03_Screenshots/full-frame-16x9/<product>_<name>.png.

Pick times on settled frames: no camera move in progress, no half-finished transition, no loader, the pointer
not covering the subject. Look at every still you keep (a frame-describer agent can check a batch cheaply).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import FFMPEG, die, ensure, film, load_config, run, usage  # noqa: E402

from PIL import Image  # noqa: E402


def box(mode, crop):
    if mode == "full":
        return None
    if mode == "band":
        return (0, 0, 1920, 1080 - crop.get("band", 180))
    if mode == "window":
        x, y, w, h = crop["window"]
        m = crop.get("margin", 24)
        return (max(0, x - m), max(0, y - m), min(1920, x + w + m), min(1080, y + h + m))
    if isinstance(mode, list) and len(mode) == 4:
        x, y, w, h = mode
        return (x, y, x + w, y + h)
    die(f"unknown crop {mode!r}")


def main():
    usage(__doc__, sys.argv[1:])
    cfg = load_config(sys.argv[1])
    st = cfg["stills"]
    src = film(cfg, st["from"])["master"]
    out = ensure(os.path.join(cfg["out"], "03_Screenshots"))
    full = ensure(os.path.join(out, "full-frame-16x9"))
    for it in st["items"]:
        name = f"{cfg['product']}_{it['name']}.png"
        fp = os.path.join(full, name)
        run([FFMPEG, "-v", "error", "-y", "-ss", str(it["t"]), "-i", src, "-frames:v", "1", "-vf", "scale=1920:1080:flags=lanczos", fp])
        b = box(it.get("crop", "band"), st.get("crop", {}))
        im = Image.open(fp)
        (im.crop(b) if b else im).save(os.path.join(out, name), optimize=True)
        print(f"{it['t']:>7.2f} s  {name}  {'full' if not b else f'{b[2] - b[0]}x{b[3] - b[1]}'}")


if __name__ == "__main__":
    main()
