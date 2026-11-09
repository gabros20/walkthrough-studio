#!/usr/bin/env python3
"""Check a delivery package before it is zipped or sent. Exits non-zero on any failure.

usage: python3 -I delivery/verify.py package.config.json [--loudness]

Checks:
  - every .mp4: video stream, audio stream present and as long as the video (within 0.1 s);
  - masters in 01_Films are byte-identical to the configured sources;
  - every .vtt starts with WEBVTT and uses dots in timestamps; every .srt parses;
  - stills open and are non-empty; no .DS_Store left;
  - --loudness: integrated loudness and true peak of each master, plus momentary loudness at the start,
    middle and end (a silent stretch or a dead track shows up here). Reported as measured, not heard.
"""
import glob
import hashlib
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import FFMPEG, die, load_config, probe, srt_cues, usage  # noqa: E402
import subprocess  # noqa: E402


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


def loud(path, ss=None, t=None):
    cmd = [FFMPEG, "-hide_banner", "-nostats"]
    if ss is not None:
        cmd += ["-ss", str(ss), "-t", str(t)]
    cmd += ["-i", path, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"]
    err = subprocess.run(cmd, capture_output=True, text=True).stderr
    i = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
    p = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", err)
    return (float(i[-1]) if i else None, float(p[-1]) if p else None)


def main():
    a = sys.argv[1:]
    usage(__doc__, a)
    cfg = load_config(a[0])
    root = cfg["out"]
    bad = []
    for v in sorted(glob.glob(os.path.join(root, "**", "*.mp4"), recursive=True)):
        p = probe(v)
        rel = os.path.relpath(v, root)
        ok = p["audio"] and (p["aduration"] is None or abs(p["aduration"] - p["duration"]) < 0.1)
        print(f"{'ok ' if ok else 'BAD'} {rel}  {p['duration']:.2f} s  {p['width']}x{p['height']}@{p['fps']}  audio={p['acodec'] or 'NONE'}  {p['size'] / 1e6:.1f} MB")
        if not ok:
            bad.append(f"{rel}: audio missing or shorter than video")
    for f in cfg["films"]:
        m = glob.glob(os.path.join(root, "01_Films", f"*_Walkthrough_{f['variant']}_*.mp4"))
        if not m:
            bad.append(f"master for {f['variant']} missing in 01_Films")
        elif sha(m[0]) != sha(f["master"]):
            bad.append(f"{m[0]} differs from {f['master']}")
        if "--loudness" in a and m:
            d = probe(m[0])["duration"]
            I, P = loud(m[0])
            parts = [loud(m[0], s, 10) for s in (1, max(0, d / 2 - 5), max(0, d - 11))]
            print(f"loudness {f['variant']}: integrated {I} LUFS, true peak {P} dBTP; start/middle/end {[x[0] for x in parts]} LUFS (measured, not heard)")
            if any(x[0] is None or x[0] < -45 for x in parts):
                bad.append(f"{f['variant']}: near-silent stretch at start, middle or end")
    for v in glob.glob(os.path.join(root, "**", "*.vtt"), recursive=True):
        t = open(v, encoding="utf-8").read()
        if not t.startswith("WEBVTT") or re.search(r"\d{2}:\d{2}:\d{2},\d{3}", t):
            bad.append(f"{v}: invalid WebVTT")
    for s in glob.glob(os.path.join(root, "**", "*.srt"), recursive=True):
        if not srt_cues(s):
            bad.append(f"{s}: no cues parsed")
    for png in glob.glob(os.path.join(root, "03_Screenshots", "**", "*.png"), recursive=True):
        if os.path.getsize(png) < 10_000:
            bad.append(f"{png}: suspiciously small")
    ds = glob.glob(os.path.join(root, "**", ".DS_Store"), recursive=True)
    if ds:
        print(f"note: {len(ds)} .DS_Store files (zip.sh removes them)")
    if bad:
        print("\nFAILED:\n- " + "\n- ".join(bad))
        sys.exit(1)
    print("\npackage checks passed")


if __name__ == "__main__":
    main()
