#!/usr/bin/env python3
"""02_Feature-Clips: one short clip per feature, cut on scene boundaries from the film's edl.json.

usage: python3 -I delivery/clips.py package.config.json [--dry]

Config:
  "clips": [{"name": "01_Set-up-once", "scenes": ["s1"]}, {"name": "03_Choose-and-edit", "scenes": ["s3a", "s3b"]}, ...]
  Scene ids come from the film's edl.json; "title" and "end" are the title and end cards.
  Each clip spans the first scene's start to the last scene's end.

Rules (from the real package):
  - frame-accurate re-encode (never stream-copy across non-keyframes): 1920x1080, 30 fps, H.264 high, yuv420p,
    CRF 20, AAC 160k, +faststart;
  - 0.3 s audio fade in and out so no clip starts or ends on a click;
  - for any film with "speech": true, no spoken line may be cut in half: a boundary inside a line is moved
    to the nearest gap within 1.0 s; if none, the script stops and names the line so you can merge scenes.
--dry prints the plan (spans, adjustments) without encoding.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import FFMPEG, die, ensure, load_config, mmss, run, scene_spans, srt_cues, usage  # noqa: E402

FADE = 0.3
MAX_SHIFT = 1.0


def fix_boundary(t, lines, total):
    """Move t out of any spoken line, to the closest line edge within MAX_SHIFT (with 0.15 s air)."""
    for a, z, text in lines:
        if a < t < z:
            options = [x for x in (a - 0.15, z + 0.15) if abs(x - t) <= MAX_SHIFT and 0 <= x <= total]
            if not options:
                return None, text
            return min(options, key=lambda x: abs(x - t)), text
    return t, None


def safe_span(a, z, lines, total, name, strict=True):
    """Move a clip's start and end out of any spoken line (fix_boundary). strict: stop when a line cannot be kept
    whole (speech); otherwise leave that boundary and add a note (captions only)."""
    notes = []
    for which in ("start", "end"):
        t = a if which == "start" else z
        nt, line = fix_boundary(t, lines, total)
        if nt is None:
            if strict:
                die(f"clip {name}: {which} {mmss(t)} cuts the spoken line {line!r} and no gap is within {MAX_SHIFT} s. Merge this clip with its neighbour.")
            notes.append(f"{which} {mmss(t)} is inside {line!r} (no gap within {MAX_SHIFT} s; left as is)")
            continue
        if line:
            notes.append(f"{which} moved {mmss(t)} -> {mmss(nt)} to keep {line!r} whole")
            if which == "start":
                a = nt
            else:
                z = nt
    return round(a, 3), round(z, 3), notes


def cut(src, a, dur, dst, vf="fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", crf=20, extra_inputs=(), filter_complex=None, cwd=None, audio=True):
    """Frame-accurate re-encode of [a, a+dur] with 0.3 s audio fades. filter_complex (with extra_inputs, each a list
    of input arguments) replaces vf when overlays are drawn on the picture; it must label its output [v]. Film time in
    the filters starts at 0 (the input is seeked). cwd: run ffmpeg there (relative paths inside filters)."""
    cmd = [FFMPEG, "-v", "error", "-y", "-ss", str(a), "-i", src]
    for x in extra_inputs:
        cmd += x
    cmd += ["-t", str(dur)]  # an output option: after every input
    if filter_complex:
        cmd += ["-filter_complex", filter_complex, "-map", "[v]", "-map", "0:a?"]
    else:
        cmd += ["-vf", vf]
    if audio:
        cmd += ["-af", f"afade=t=in:st=0:d={FADE},afade=t=out:st={max(0, dur - FADE):.3f}:d={FADE}",
                "-c:a", "aac", "-b:a", "160k", "-ar", "48000"]
    else:  # a silent source (a test render): no audio stream to fade
        cmd += ["-an"]
    cmd += ["-c:v", "libx264", "-profile:v", "high", "-crf", str(crf), "-preset", "slow", "-movflags", "+faststart", dst]
    run(cmd, cwd=cwd)


def plan(cfg, f):
    spans = {sid: (a, z) for sid, a, z in scene_spans(f["edl"])}
    total = max(z for a, z in spans.values())
    lines = srt_cues(f["srt"]) if f.get("speech") else []
    out = []
    for c in cfg["clips"]:
        missing = [s for s in c["scenes"] if s not in spans]
        if missing:
            die(f"clip {c['name']}: scenes {missing} not in {f['edl']} (have {list(spans)})")
        a, z, notes = safe_span(spans[c["scenes"][0]][0], spans[c["scenes"][-1]][1], lines, total, c["name"])
        out.append((c["name"], a, z, notes))
    return out


def main():
    args = sys.argv[1:]
    usage(__doc__, args)
    cfg = load_config(args[0])
    dry = "--dry" in args
    prod = cfg["product"]
    for f in cfg["films"]:
        if not f.get("edl"):
            die(f"film {f['variant']} needs an edl path")
        d = os.path.join(cfg["out"], "02_Feature-Clips", f["variant"].lower())
        if not dry:
            ensure(d)
        for name, a, z, notes in plan(cfg, f):
            dur = round(z - a, 3)
            print(f"{f['variant']:<10} {name:<40} {mmss(a)}-{mmss(z)} ({dur:.1f} s){'  ' + '; '.join(notes) if notes else ''}")
            if dry:
                continue
            dst = os.path.join(d, f"{prod}_{name}_{f['variant']}.mp4")
            cut(f["master"], a, dur, dst)


if __name__ == "__main__":
    main()
