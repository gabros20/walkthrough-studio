#!/usr/bin/env python3
"""List dead holds: stretches with no pointer move, no camera/overlay tween and no UI change.

  python3 scripts/holds.py [min_seconds=1.0] [storyboard.json] [--takes <dir>]     (run from film/)

Reads edl.json, compositions/<scene>.html (every GSAP fromTo with a duration is activity: pointer,
arc, click discs, camera, spotlights, tags) and the cut clip assets/footage/<scene>.mp4 (a frame is
a UI change when more than MIN_PX pixels of a 768x432 grey copy differ from the previous frame by
more than 10 levels; a blinking caret alone stays under that). Time-lapse ranges count as activity.
Prints each static stretch longer than the threshold in film time, the source span it shows and
any caption that starts within 0.6 s before it or inside it.
"""
import json, os, re, subprocess, sys
import numpy as np

args = sys.argv[1:]
TAKES = None
if "--takes" in args:
    i = args.index("--takes"); TAKES = args[i + 1]; del args[i:i + 2]
MIN = float(args[0]) if args and not args[0].endswith(".json") else 1.0
SB = next((a for a in args if a.endswith(".json")), "storyboard.json")
MIN_PX = 16
W, H = 768, 432
edl = json.load(open("edl.json"))
FPS = edl["fps"]


def srt_starts():
    out = []
    for block in open("captions.srt").read().strip().split("\n\n"):
        lines = block.split("\n")
        a = lines[1].split(" --> ")[0]
        h, m, s = a.split(":")
        out.append((int(h) * 3600 + int(m) * 60 + float(s.replace(",", ".")), " ".join(lines[2:])))
    return out


caps = srt_starts()
sb = json.load(open(SB))
takes = {x["id"]: x["take"] for x in sb["scenes"]}
tdir = TAKES or os.environ.get("WALKTHROUGH_TAKES") or os.path.join(os.path.dirname(os.path.abspath(SB)), sb.get("takesDir", "../takes"))
tween = re.compile(r'tl\.fromTo\("([^"]+)",\s*\{[^}]*\},\s*\{([^}]*)\},\s*([0-9.]+)\)')
for sc in edl["scenes"]:
    sid, start, dur = sc["id"], sc["start"], sc["duration"]
    n = int(round(dur * FPS))
    active = np.zeros(n + 1, bool)
    html = open(f"compositions/{sid}.html").read()
    for sel, body, t in tween.findall(html):
        m = re.search(r"duration:\s*([0-9.]+)", body)
        if not m:
            continue
        a, b = float(t), float(t) + float(m.group(1))
        active[int(a * FPS): int(np.ceil(b * FPS)) + 1] = True
    for r in sc["ranges"]:
        if r.get("timelapse"):
            a = r["filmIn"]
            active[int(a * FPS): int(np.ceil((a + r["filmDur"]) * FPS)) + 1] = True
    # typing and scrolling from the event log (single characters are too small for the pixel test)
    try:
        ev = json.load(open(f"{tdir}/{takes[sid]}/events.json"))["events"]
    except FileNotFoundError:
        print(f"{sid:4} (no events.json for {takes[sid]}: typing/scrolls not counted)")
        ev = []
    for e in ev:
        if e["type"] in ("type", "scroll"):
            for r in sc["ranges"]:
                a, b = max(e["t"], r["srcIn"]), min(e.get("tEnd", e["t"]), r["srcOut"])
                if a <= b:
                    fa = r["filmIn"] + (a - r["srcIn"]) / r["rate"]
                    fb = r["filmIn"] + (b - r["srcIn"]) / r["rate"]
                    active[int(fa * FPS): int(np.ceil(fb * FPS)) + 1] = True
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f"assets/footage/{sid}.mp4", "-vf", f"fps={FPS},scale={W}:{H},format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout
    fr = np.frombuffer(raw, np.uint8).reshape(-1, W * H).astype(np.int16)
    ch = (np.abs(np.diff(fr, axis=0)) > 10).sum(axis=1) > MIN_PX
    for i, c in enumerate(ch[: n]):
        if c:
            active[i + 1] = True
    # static runs
    i = 0
    while i <= n:
        if active[i]:
            i += 1
            continue
        j = i
        while j <= n and not active[j]:
            j += 1
        L = (j - i) / FPS
        if L > MIN:
            fa, fb = start + i / FPS, start + j / FPS

            def src(t):
                for r in sc["ranges"]:
                    if r["filmIn"] - 1e-6 <= t <= r["filmIn"] + r["filmDur"] + 1e-6:
                        return r["srcIn"] + (t - r["filmIn"]) * r["rate"], r
                return None, None

            sa, ra = src(i / FPS)
            sb_, rb = src(min(j, n) / FPS)
            kind = "stretch/hold" if (ra and ra["rate"] < 0.999) or (rb and rb["rate"] < 0.999) else "footage"
            cap = [c for c in caps if fa - 0.6 <= c[0] <= fb]
            print(f"{sid:4} film {fa:7.3f}-{fb:7.3f} ({L:4.2f} s)  src {sa if sa is None else round(sa,3)}-{sb_ if sb_ is None else round(sb_,3)}  [{kind}]" + (f"  caption {cap[0][0]:.2f} '{cap[0][1]}'" if cap else ""))
        i = j
