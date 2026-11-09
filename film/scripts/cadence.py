"""Frame-to-frame change cadence of a crop over a time span.

usage: python3 scripts/cadence.py <video> <t0> <t1> <w:h:x:y>

Prints which output frames differ from their predecessor ('#' changed, '.' same) and the histogram
of gaps between changes. 30 fps footage in a 60 fps film should change on every 2nd frame only
(gaps of 2 or multiples); a 1-3 pattern means the clip and film rates do not divide cleanly.
"""
import subprocess, sys
from collections import Counter
import numpy as np

video, t0, t1, crop = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
w, h = int(crop.split(':')[0]) // 4, int(crop.split(':')[1]) // 4
raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(t0), '-t', str(t1 - t0), '-i', video,
    '-vf', f'crop={crop},scale={w}:{h},format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.int16)
d = [float((np.abs(fr[i] - fr[i - 1]) > 12).sum()) for i in range(1, len(fr))]
print(len(fr), 'frames; change pattern (# = changed):')
print(''.join('#' if x > 3 else '.' for x in d))
ch = [i for i, x in enumerate(d) if x > 3]
print('gaps between changes:', Counter(b - a for a, b in zip(ch, ch[1:])))
