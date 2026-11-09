"""Check the voiceover twin is the captioned film minus its captions, frame for frame.

usage: python3 -I voiceover/compare-twins.py <captioned.mp4> <captionless.mp4> [--band-top 940] [--max-px 200] [t ...]

build.mjs --no-captions makes the same film with the captions track left out, so the two renders
must differ only inside the caption band (the plates sit at y 953-1017 at 1080p). Grabs frames at
the given film seconds (default: every 7.5 s, which lands inside and outside captions), diffs them
in grey (> 12 levels) and prints the changed pixel count, how many of them are above --band-top
(default 940) and the bounding box. Two encodes of the same picture differ by a few dozen pixels
from compression alone (measured on the example: at most 33 px over 12 levels above the band);
exit 1 when more than --max-px (default 200) change above the band in any frame: then the pictures
are not twins and the voice will not sit on the film it was placed against.
"""
import subprocess, sys
import numpy as np

if any(a in ("-h", "--help") for a in sys.argv[1:]) or len(sys.argv) < 2:
    print(__doc__.strip())
    sys.exit(0 if len(sys.argv) >= 2 else 1)

args = sys.argv[1:]
TOP, MAX_PX = 940, 200
for name in ("--band-top", "--max-px"):
    if name in args:
        i = args.index(name); v = int(args[i + 1]); del args[i:i + 2]
        TOP, MAX_PX = (v, MAX_PX) if name == "--band-top" else (TOP, v)
A, B = args[0], args[1]
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", A], capture_output=True, text=True).stdout)
times = [float(t) for t in args[2:]] or [round(t * 7.5 + 0.5, 3) for t in range(int(dur // 7.5))]
size = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", A], capture_output=True, text=True).stdout.strip()
W, H = map(int, size.split(","))


def grab(f, t):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", f, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(H, W).astype(int)


bad = 0
for t in times:
    d = np.abs(grab(A, t) - grab(B, t)) > 12
    ys, xs = np.nonzero(d)
    box = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())) if len(xs) else None
    above = int(d[:TOP].sum())
    out = above > MAX_PX
    bad += out
    print(f"{t:7.2f}s changed px {int(d.sum()):7d}  above the band {above:6d}  bbox {box}{'  NOT TWINS HERE' if out else ''}")
print("twins: differences only in the caption band" if not bad else f"{bad} frame(s) differ above y {TOP}")
sys.exit(1 if bad else 0)
