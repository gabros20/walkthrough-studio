# One contact sheet per scene of a rendered film at N frames per second, labelled with film time.
# Usage: python3 scripts/scene-sheets.py <video> <edl.json> <outdir> [fps=1] [width=480]
import json, os, subprocess, sys
from PIL import Image, ImageDraw
video, edl, out = sys.argv[1], sys.argv[2], sys.argv[3]
fps = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
W = int(sys.argv[5]) if len(sys.argv) > 5 else 480
H = W * 9 // 16
d = json.load(open(edl))
dur = d['durations']['total']
scenes = [('title', 0, d['scenes'][0]['start'])]
scenes += [(s['id'], s['start'], s['start'] + s['duration']) for s in d['scenes']]
scenes += [('end', scenes[-1][2], dur)]
os.makedirs(out, exist_ok=True)
for name, a, b in scenes:
    times = []
    t = a + 0.25
    while t < b - 0.05:
        times.append(t); t += 1 / fps
    cols = 6
    rows = (len(times) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * W, rows * H), 'white')
    dr = ImageDraw.Draw(sheet)
    for i, t in enumerate(times):
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.3f}', '-i', video, '-frames:v', '1', '-vf', f'scale={W}:{H}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
        if len(raw) < W * H * 3: continue
        im = Image.frombytes('RGB', (W, H), raw[:W * H * 3])
        x, y = (i % cols) * W, (i // cols) * H
        sheet.paste(im, (x, y))
        dr.rectangle([x, y, x + 70, y + 16], fill='black'); dr.text((x + 3, y + 2), f'{t:.1f}s', fill='yellow')
    p = os.path.join(out, f'{name}.jpg')
    sheet.save(p, quality=82)
    print(p, len(times))
