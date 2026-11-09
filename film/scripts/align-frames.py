"""Find how many master frames a cut clip is off at given moments.

usage: python3 scripts/align-frames.py <clip.mp4> <master.mp4> <clipT:masterT> [<clipT:masterT> ...] [--fps 60]

For each pair, grabs the clip frame at clipT and compares it (grey, 360x202, mean absolute difference)
with master frames around masterT, -6..+6 master frames. Prints the best offset. Use it when an
overlay (pointer, spotlight) looks early or late against the footage: 0 everywhere means the cut and
the mapping agree.
"""
import subprocess, sys
import numpy as np

args = sys.argv[1:]
FPS = 60.0
if "--fps" in args:
    i = args.index("--fps"); FPS = float(args[i + 1]); del args[i:i + 2]


def frame(path, t):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.4f}', '-i', path, '-frames:v', '1', '-vf', 'scale=360:202,format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(202, 360).astype(np.int16)


clip, master = args[0], args[1]
for ct, st in [tuple(map(float, a.split(':'))) for a in args[2:]]:
    f = frame(clip, ct)
    best = min(((np.abs(f - frame(master, st + k / FPS)).mean(), k) for k in range(-6, 7)))
    print(f'clip {ct:.3f} vs master {st:.3f}: best offset {best[1]} master frames (diff {best[0]:.2f})')
